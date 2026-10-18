"""Synthetic ToBee interval, lineage, first-channel and provenance checks."""

import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import soundfile as sf

from ml import tobee


def wave(seconds=6, rate=32000, channels=2, peak=0.05):
    pcm = (peak * np.sin(2 * np.pi * 125 * np.arange(round(seconds * rate)) / rate)).astype(np.float32)
    if seconds > 5: pcm[5 * rate:] = 1
    if channels == 2: pcm = np.column_stack([pcm, np.ones(len(pcm))])
    result = io.BytesIO(); sf.write(result, pcm, rate, format="WAV", subtype="PCM_16")
    return result.getvalue()


def catalog(name="Hive1_session_one.wav", raw=None):
    return {"name": name, "bytes": len(raw) if raw else 100, "md5": hashlib.md5(raw).hexdigest() if raw else "test", "url": "https://example.invalid/audio.wav"}


class ToBeeTests(unittest.TestCase):
    def test_whole_first_interval_bee_only_no_nobee_or_later_crop(self):
        items = [catalog("Hive1_a.wav"), catalog("CF003 - b.wav"), catalog("GH001 - c.mp3"), catalog("CJ001 - d.wav")]
        annotations = b"Hive1_a\n0\t6\tbee\n.\nCF003 - b\n0\t6\tnobee\n6\t20\tbee\n.\nGH001 - c\n0\t4.99\tbee\n.\nCJ001 - d\n1\t20\tbee\n.\n"
        plan = tobee.build_selection(items, annotations, [])
        self.assertEqual([r["source_filename"] for r in plan["records"]], ["Hive1_a.wav"])
        self.assertEqual(len(plan["reserved_uploaders"]), 4)
        self.assertEqual(plan["records"][0]["collection_group"], "ToBee:NU-Hive")
        self.assertEqual(plan["records"][0]["annotation_interval_seconds"], [0, 6])

    def test_repeated_sessions_and_codecs_stay_one_hive_group_with_deterministic_cap(self):
        items = [catalog(f"Hive1_session_{i}.wav") for i in range(5)]
        annotations = "".join(f"Hive1_session_{i}\n0\t6\tbee\n.\n" for i in range(5)).encode()
        plan = tobee.build_selection(items, annotations, [], per_hive=2)
        self.assertEqual(len(plan["records"]), 2)
        self.assertEqual(plan["reserved_uploaders"], ["tobee:hive1"])
        self.assertEqual(plan, tobee.build_selection(list(reversed(items)), annotations, [], per_hive=2))
        self.assertEqual({r["uploader_group"] for r in plan["records"]}, {"tobee:hive1"})

    def test_previously_exposed_hive_rejects_entire_collection_even_if_file_not_selected(self):
        with self.assertRaisesRegex(ValueError, "already exposed"):
            tobee.build_selection([catalog()], b"Hive1_session_one\n0\t6\tbee\n.\n", [{"clip_id": "unrelated", "uploader_group": "TOBEE:HIVE1"}])
        with self.assertRaisesRegex(ValueError, "already exposed"):
            tobee.build_selection([catalog()], b"Hive1_session_one\n0\t6\tbee\n.\n", [{"clip_id": "unrelated", "uploader_group": "tobee:other-hive"}])

    def test_malformed_unknown_labels_nonfinite_and_unterminated_annotations_fail(self):
        for raw in [b"a\n0\t6\tunknown\n.\n", b"a\n0\tnan\tbee\n.\n", b"a\n0\t6\tbee\n", b"a\n0\t6\tbee\n.\na\n0\t6\tbee\n.\n"]:
            with self.subTest(raw=raw), self.assertRaises(ValueError): tobee.parse_annotations(raw)

    def test_invalid_later_interval_excludes_whole_recording_and_preserves_raw_issue(self):
        annotations = b"Hive1_session_one\n0\t6\tbee\n173.02\t173.0\tbee\n.\n"
        plan = tobee.build_selection([catalog()], annotations, [])
        self.assertEqual(plan["records"], [])
        self.assertEqual(plan["reserved_uploaders"], ["tobee:hive1"])
        self.assertEqual(plan["annotation_issues"][0]["raw_interval"], "173.02\t173.0\tbee")

    def test_stereo_first_channel_crop_gain_and_resampling_are_exact_policy(self):
        with tempfile.TemporaryDirectory() as folder:
            raw = wave()
            record, reason = tobee.prepare_wav(raw, {"clip_id": "synthetic"}, Path(folder))
            self.assertIsNone(reason)
            pcm, rate = sf.read(record["local_path"])
            self.assertEqual((rate, pcm.shape), (48000, (240000,)))
            self.assertAlmostEqual(np.sqrt(np.mean(pcm**2)), .05 / np.sqrt(2), delta=.0001)
            self.assertFalse(record["gain_applied"])
            self.assertEqual((record["original_sample_rate"], record["original_channels"], record["channel"]), (32000, 2, 0))
            self.assertEqual(record["original_sha256"], tobee._sha256(raw))

    def test_short_clipped_silent_and_resampler_clipping_are_not_repaired(self):
        for raw, expected in [(wave(4), "shorter_than_five_seconds"), (wave(5, peak=2), "source_clipped"), (wave(5, peak=0), "source_quiet")]:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as folder:
                result, reason = tobee.prepare_wav(raw, {"clip_id": "bad"}, Path(folder)); self.assertIsNone(result); self.assertEqual(reason, expected)
        with tempfile.TemporaryDirectory() as folder, patch.object(tobee, "resample_poly", return_value=np.ones(240000)):
            result, reason = tobee.prepare_wav(wave(), {"clip_id": "bad"}, Path(folder)); self.assertIsNone(result); self.assertEqual(reason, "prepared_clipped")

    def _fixture(self, folder):
        raw = wave(); item = catalog(raw=raw)
        annotations = b"Hive1_session_one\n0\t6\tbee\n.\n"
        return raw, item, annotations

    def test_whole_file_md5_resume_provenance_and_final_only_roles(self):
        with tempfile.TemporaryDirectory() as folder:
            raw, item, annotations = self._fixture(folder)
            with patch.object(tobee, "load_source", return_value=([item], annotations)), patch.object(tobee, "_bounded_download", return_value=raw) as download:
                manifest = tobee.prepare_tobee(folder, [])
                again = tobee.prepare_tobee(folder, [])
                self.assertEqual(download.call_count, 1)
                self.assertEqual(manifest, again)
                self.assertEqual(manifest["records"][0]["split"], "test")
                self.assertEqual(manifest["records"][0]["label"], "buzz")
                self.assertTrue(manifest["records"][0]["full_original_md5_verified"])
                self.assertEqual(manifest["count"], 1)

    def test_corrupt_cached_whole_source_cannot_silently_resume(self):
        with tempfile.TemporaryDirectory() as folder:
            raw, item, annotations = self._fixture(folder)
            with patch.object(tobee, "load_source", return_value=([item], annotations)), patch.object(tobee, "_bounded_download", return_value=raw):
                tobee.prepare_tobee(folder, [])
                next((Path(folder) / "original").iterdir()).write_bytes(b"tampered")
                with self.assertRaisesRegex(ValueError, "size/MD5"):
                    tobee.prepare_tobee(folder, [])

    def test_standalone_preparation_checks_supplied_source_md5_before_decoding(self):
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ValueError, "size/MD5"):
            tobee.prepare_wav(wave(), {"clip_id": "bad", "published_original_bytes": 1, "published_original_md5": "0" * 32}, Path(folder))

    def test_old_audio_hash_overlap_is_excluded_but_hive_stays_reserved(self):
        with tempfile.TemporaryDirectory() as folder:
            raw, item, annotations = self._fixture(folder)
            old = {"clip_id": "old", "uploader_group": "prior", "sha256": tobee._sha256(raw), "pcm_sha256": "b", "original_sha256": "c"}
            with patch.object(tobee, "load_source", return_value=([item], annotations)), patch.object(tobee, "_bounded_download", return_value=raw):
                manifest = tobee.prepare_tobee(folder, [old])
                self.assertEqual(manifest["count"], 0)
                self.assertEqual(manifest["exclusion_counts"], {"previous_audio_hash_overlap": 1})
                self.assertEqual(manifest["reserved_uploaders"], ["tobee:hive1"])


if __name__ == "__main__": unittest.main()
