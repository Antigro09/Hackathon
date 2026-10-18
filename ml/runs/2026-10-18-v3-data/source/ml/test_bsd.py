"""Synthetic-only BSD provenance, frozen selection and no-repair quality checks."""

import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zlib

import numpy as np
import soundfile as sf

from ml import bsd


def row(identity="799513", title="Fan running", category="fx-o", uploader="FreshAuthor", **changes):
    return {"sound_id": identity, "title": title, "class": category, "uploader": uploader,
            "tags": "", "description": "A fan running, recorded in a room.",
            "license": "https://creativecommons.org/licenses/by/4.0/", **changes}


def wav(seconds=6, frequency=125, peak=0.05, subtype="PCM_16", rate=44100):
    pcm = (peak * np.sin(2 * np.pi * frequency * np.arange(round(seconds * rate)) / rate)).astype(np.float32)
    if seconds > 5:
        pcm[5 * rate:] = 1  # Must not enter the first-five-second audit.
    target = io.BytesIO()
    sf.write(target, pcm, rate, format="WAV", subtype=subtype)
    return target.getvalue()


def member(identity, raw=None):
    return {"name": f"audio/{identity}.wav", "size": len(raw) if raw else 529244,
            "crc32": zlib.crc32(raw) if raw else 0, "compressed_size": len(raw) if raw else 1,
            "offset": 0, "method": 0, "flags": 0}


class BsdTests(unittest.TestCase):
    def test_primary_creator_labels_exclude_contact_synth_and_musical_wind(self):
        self.assertEqual(bsd.metadata_label(row())[0], "mechanical_fan")
        for item in [row("900001", "Fan contact microphone"), row("900002", "Wind", "is-w"),
                     row("900003", "Synthetic traffic", "ss-u"),
                     row("900004", "Traffic and wind", "ss-u", description="traffic and wind")]:
            self.assertIsNone(bsd.metadata_label(item)[0])
        self.assertEqual(bsd.metadata_label(row("900005", "Wind in trees", "ss-n", description="Natural wind"))[0], "wind")
        self.assertEqual(bsd.metadata_label(row("900006", "Road traffic", "ss-u", description="Real traffic"))[0], "traffic")
        self.assertEqual(bsd.metadata_label(row("900007", "Two people talking", "sp-c", description="I recorded a conversation"))[0], "speech")

    def test_creator_text_audit_excludes_obvious_generated_restricted_or_wrong_sources(self):
        cases = [row("900010", "Awesome Winter Wind", "ss-n", description="This sound was generated using an AI model (elevenlabs). No real-world recording was used."),
                 row("900011", "Wind chimes", "fx-n", description="Chimes in the breeze"),
                 row("900012", "Traffic before exiting announcement", "ss-u", description="A streetcar announcement"),
                 row("900013", "IA VOICE", "sp-s", description="for personal use only."),
                 row("900014", "Demon voice", "sp-s", description="My voice recorded with distortion plugins"),
                 row("900015", "Criswell speech", "sp-s", description="Recorded monologue from a movie"),
                 row("900016", "Wind and voices", "ss-n", description="Real wind and people speaking"),
                 row("900017", "Wind in trees and passing cars", "ss-n", description="Real wind with road vehicles"),
                 row("900018", "AI-generated wind", "ss-n", description="Generated wind")]
        for item in cases:
            with self.subTest(title=item["title"]): self.assertIsNone(bsd.metadata_label(item)[0])

    def test_explicit_creator_optout_overrides_reviewed_identity(self):
        self.assertEqual(bsd.metadata_label(row(description="Do not use this for AI or machine learning")), (None, "creator_ml_optout"))

    def test_unknown_events_do_not_silently_absorb_targets(self):
        label, reason = bsd.metadata_label(row("900008", "River water", "ss-n", description="Running water"))
        self.assertEqual((label, reason), ("unknown", "creator_primary_non_target:water"))
        self.assertIsNone(bsd.metadata_label(row("900009", "River water", "ss-n", description="Wind and road traffic nearby"))[0])

    def test_past_uploader_casefold_ids_and_nc_licenses_never_enter_plan(self):
        rows = [row(), row("900001", "Road traffic", "ss-u", "OldAuthor"),
                row("900002", "Road traffic", "ss-u", "New", license="https://creativecommons.org/licenses/by-nc/4.0/"),
                row("900003", "Road traffic", "ss-u", "New2")]
        old = [{"clip_id": "900003", "uploader_group": "oldauthor"}]
        plan = bsd.build_selection(rows, {f"audio/{r['sound_id']}.wav": member(r["sound_id"]) for r in rows}, old)
        self.assertEqual([r["clip_id"] for r in plan["records"]], ["799513"])
        self.assertEqual(plan["reserved_uploaders"], ["freshauthor"])
        self.assertIn("not independently verified", plan["records"][0]["label_quality"])
        self.assertFalse(plan["records"][0]["full_archive_md5_verified"])

    def test_deterministic_diversity_before_caps_and_definite_short_screen(self):
        rows = [row(str(900000 + i), "Road traffic", "ss-u", "A" if i < 4 else "B", description="Road traffic") for i in range(6)]
        members = {f"audio/{r['sound_id']}.wav": member(r["sound_id"]) for r in rows}
        members["audio/900005.wav"]["size"] = 100
        caps = {label: 0 for label in bsd.LABELS}; caps["traffic"] = 2
        plan = bsd.build_selection(rows, members, [], caps=caps)
        again = bsd.build_selection(list(reversed(rows)), members, [], caps=caps)
        self.assertEqual(plan, again)
        self.assertEqual({r["uploader_group"] for r in plan["records"]}, {"a", "b"})
        self.assertEqual(plan["excluded_metadata"]["member_too_small_for_five_seconds"], 1)

    def test_selection_changes_fail_without_overwriting_frozen_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "selection-plan.json"
            bsd._freeze(path, {"seed": 1}); before = path.read_bytes()
            bsd._freeze(path, {"seed": 1})
            with self.assertRaisesRegex(ValueError, "Frozen BSD selection differs"):
                bsd._freeze(path, {"seed": 2})
            self.assertEqual(path.read_bytes(), before)

    def test_first_five_seconds_resample_without_gain_and_preserve_source_hash_scope(self):
        with tempfile.TemporaryDirectory() as folder:
            raw = wav()
            record, reason = bsd.prepare_wav(raw, {"clip_id": "synthetic"}, Path(folder))
            self.assertIsNone(reason)
            pcm, rate = sf.read(record["local_path"])
            self.assertEqual((rate, pcm.shape), (48000, (240000,)))
            self.assertAlmostEqual(np.sqrt(np.mean(pcm**2)), 0.05 / np.sqrt(2), delta=0.0001)
            self.assertFalse(record["gain_applied"])
            self.assertEqual(record["crop_start_seconds"], 0)
            self.assertEqual(record["original_sha256"], bsd._sha256(raw))
            self.assertIn("not original Freesound", record["original_hash_scope"])
            self.assertEqual(record["pcm_sha256"], bsd._sha256(pcm.astype("<f4").tobytes()))

    def test_short_silent_and_clipped_sources_are_never_repaired(self):
        cases = [(wav(4), "shorter_than_five_seconds"), (wav(5, peak=0), "source_quiet"),
                 (wav(5, peak=2), "source_clipped")]
        for raw, expected in cases:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as folder:
                result, reason = bsd.prepare_wav(raw, {"clip_id": "bad"}, Path(folder))
                self.assertIsNone(result)
                self.assertEqual(reason, expected)
                self.assertFalse((Path(folder) / "audio").exists())

    def test_resampling_clipping_is_rejected_without_attenuation(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(bsd, "resample_poly", return_value=np.ones(240000, np.float32)):
            result, reason = bsd.prepare_wav(wav(), {"clip_id": "bad"}, Path(folder))
            self.assertIsNone(result)
            self.assertEqual(reason, "prepared_clipped")

    def test_unexpected_formats_and_existing_prepared_tampering_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "publisher format differs"):
                bsd.prepare_wav(wav(subtype="PCM_24"), {"clip_id": "bad"}, Path(folder))
            prepared, _ = bsd.prepare_wav(wav(), {"clip_id": "good"}, Path(folder))
            Path(prepared["local_path"]).write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "does not match"):
                bsd.prepare_wav(wav(), {"clip_id": "good"}, Path(folder))

    def test_standalone_preparation_checks_supplied_source_crc_before_decoding(self):
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ValueError, "CRC/size"):
            bsd.prepare_wav(wav(), {"clip_id": "bad", "archive_member_size": 1, "archive_member_crc32": "00000000"}, Path(folder))

    def _fixture(self):
        rows = [row(), row("900001", "River water", "ss-n", "Other", description="Running water")]
        payloads = {"799513": wav(), "900001": wav(frequency=400)}
        class Archive:
            def __init__(self, root): self.members = {f"audio/{key}.wav": member(key, raw) for key, raw in payloads.items()}
            def read_member(self, item): return payloads[Path(item["name"]).stem]
        return rows, Archive, payloads

    def test_resume_retains_final_only_provenance_and_reserved_failed_groups(self):
        rows, archive, payloads = self._fixture()
        payloads["799513"] = wav(5, peak=2)
        with tempfile.TemporaryDirectory() as folder, patch.object(bsd, "_download_metadata", return_value=rows), patch.object(bsd, "BsdArchive", archive):
            manifest = bsd.prepare_bsd(folder, [])
            self.assertEqual(manifest["counts"], {"unknown": 1})
            self.assertEqual(set(manifest["reserved_uploaders"]), {"freshauthor", "other"})
            self.assertEqual(manifest["exclusion_counts"], {"source_clipped": 1})
            self.assertEqual(manifest["records"][0]["split"], "ood_test")
            self.assertEqual(bsd.prepare_bsd(folder, []), manifest)

    def test_stricter_metadata_amendment_keeps_all_earlier_reserved_groups(self):
        rows, archive, _ = self._fixture()
        with tempfile.TemporaryDirectory() as folder, patch.object(bsd, "_download_metadata", return_value=rows), patch.object(bsd, "BsdArchive", archive):
            old_plan = {"metadata_csv_sha256": bsd.CSV_SHA256,
                        "previous_records_sha256": bsd._sha256(bsd._json_bytes([])),
                        "reserved_uploaders": ["earlier-failed-author"]}
            manifest = bsd.prepare_bsd(folder, [], superseded_plan=old_plan)
            self.assertIn("earlier-failed-author", manifest["reserved_uploaders"])
            plan = json.loads((Path(folder) / "selection-plan.json").read_text(encoding="utf-8"))
            self.assertEqual(plan["superseded_metadata_plan_sha256"], bsd._sha256(bsd._json_bytes(old_plan)))

    def test_each_of_three_old_fingerprints_excludes_audio_not_just_matching_field(self):
        rows, archive, payloads = self._fixture()
        with tempfile.TemporaryDirectory() as folder:
            prepared, _ = bsd.prepare_wav(payloads["799513"], {"clip_id": "fixture"}, Path(folder))
        for field in bsd.HASH_FIELDS:
            old = {"clip_id": "old", "uploader_group": "prior", "sha256": "a", "original_sha256": "b", "pcm_sha256": "c"}
            old["sha256"] = prepared[field]  # Cross-field collisions are forbidden too.
            with self.subTest(field=field), tempfile.TemporaryDirectory() as folder, patch.object(bsd, "_download_metadata", return_value=rows), patch.object(bsd, "BsdArchive", archive):
                manifest = bsd.prepare_bsd(folder, [old])
                self.assertNotIn("799513", {r["clip_id"] for r in manifest["records"]})
                self.assertEqual(manifest["exclusion_counts"]["previous_audio_hash_overlap"], 1)

    def test_bad_metadata_and_inventory_caches_fail_before_network(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(bsd, "urlopen", side_effect=AssertionError("network")):
            root = Path(folder); (root / "cache").mkdir()
            (root / "cache/metadata.zip").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "metadata ZIP"):
                bsd._download_metadata(root)
            (root / "cache/audio.inventory.json").write_text("[]", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "member inventory"):
                bsd.BsdArchive(root)


if __name__ == "__main__":
    unittest.main()
