"""Synthetic blind-assembly regressions; no final files, models or scores."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from ml.data_v3 import HistoricalSource, KNOWN, assemble_historical_v3


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def record(index, label="buzz", owner=None, **extra):
    clip = str(index)
    return {"clip_id": clip, "label": label, "split": "ood_test" if label == "unknown" else "test",
            "dataset": "FSD50K", "uploader": owner or f"creator-{index}",
            "uploader_group": (owner or f"creator-{index}").casefold(),
            "source_url": f"https://freesound.org/s/{clip}/",
            "license": "http://creativecommons.org/licenses/by/3.0/",
            "original_sha256": sha(f"original-{index}"), "sha256": sha(f"prepared-{index}"),
            "pcm_sha256": sha(f"pcm-{index}"), "local_path": f"/content/audio/{clip}.wav",
            "sample_rate": 48000, "samples": 240000, "channel": 0,
            "crop_start_seconds": 0, "crop_duration_seconds": 5, "gain_applied": False,
            "original_sample_rate": 44100, "original_channels": 1,
            "original_labels": [label], **extra}


def fixture():
    rows = []
    index = 1
    for label in (*KNOWN, "unknown"):
        for _ in range(20):
            rows.append(record(index, label))
            index += 1
    return rows


class HistoricalV3Tests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.sequence = 0

    def write_inputs(self, rows=None, other=None, reservations=None):
        rows = deepcopy(fixture() if rows is None else rows)
        if other is None:
            other = deepcopy(rows[:10])
            # The real v1/v2 overlaps differ only by this added dataset field.
            for r in rows:
                r.pop("dataset", None)
        self.sequence += 1
        folder = self.root / str(self.sequence)
        folder.mkdir()
        sources = []
        for name, records in [("v1", rows), ("v2", other)]:
            path = folder / f"{name}.json"
            raw = json.dumps({"records": records}, indent=3).encode() + b"\n"
            path.write_bytes(raw)
            sources.append(HistoricalSource(name, path, sha(raw)))
        document = {"formatVersion": 1, "purpose": "v3-final-reservations", "seed": 18043,
                    "groups": ["reserved-new-uploader"], "clip_ids": [],
                    "original_sha256": [], "prepared_sha256": [], "pcm_sha256": [],
                    "collection_groups": ["ToBee:NU-Hive", "ToBee:OSBH-citizen-science"],
                    "source_manifests": []}
        document.update(reservations or {})
        reservation = folder / "reservations.json"
        reservation.write_text(json.dumps(document), encoding="utf-8")
        return sources, reservation, sha(reservation.read_bytes())

    def assemble(self, inputs, **kwargs):
        sources, reservation, pin = inputs
        self.sequence += 1
        output = self.root / f"assembly-{self.sequence}"
        path = assemble_historical_v3(output, reservation, pin, sources=sources, **kwargs)
        return path, json.loads(path.read_bytes())

    def test_all_old_splits_become_explicit_blind_development_roles_and_bytes_are_preserved(self):
        inputs = self.write_inputs()
        path, manifest = self.assemble(inputs)
        self.assertEqual(len(manifest["records"]), 120)
        self.assertEqual(manifest["summary"]["duplicatesCollapsed"], 10)
        self.assertEqual({r["split"] for r in manifest["records"]}, {"train", "calibration", "audit", "unknown_train", "unknown_calibration", "unknown_audit"})
        self.assertTrue(all(r["historical_development_only"] and r["historical_split"] in {"test", "ood_test"} for r in manifest["records"]))
        self.assertFalse(manifest["freshFinalRecordsIncluded"])
        self.assertFalse(manifest["audioFilesRead"])
        self.assertFalse(manifest["modelPredictionsRead"])
        self.assertFalse(manifest["promotionAllowed"])
        originals = json.loads((path.parent / "historical-records.json").read_bytes())
        self.assertEqual(originals["records"][0]["record"], json.loads(inputs[0][0].path.read_bytes())["records"][0])
        for source in inputs[0]:
            self.assertEqual((path.parent / f"historical-manifests/{source.name}.json").read_bytes(), source.path.read_bytes())
        self.assertEqual((path.parent / "final-reservations.json").read_bytes(), inputs[1].read_bytes())
        index = json.loads((path.parent / "artifact-index.json").read_bytes())
        for name, identity in index.items():
            self.assertEqual(sha((path.parent / name).read_bytes()), identity["sha256"])

    def test_deterministic_across_output_locations_and_source_argument_order(self):
        inputs = self.write_inputs()
        first, one = self.assemble(inputs)
        second, two = self.assemble((tuple(reversed(inputs[0])), inputs[1], inputs[2]))
        self.assertEqual(one, two)
        self.assertEqual(first.read_bytes(), second.read_bytes())
        owners = {}
        for row in one["records"]:
            self.assertEqual(owners.setdefault(row["uploader_group"], row["v3_phase"]), row["v3_phase"])
        self.assertEqual({r["label"] for r in one["records"]}, {*KNOWN, "unknown"})

    def test_excluded_sources_keep_all_historical_exclusions_and_original_records(self):
        rows = fixture()
        mimii = record(900, "mechanical_fan", dataset="MIMII", uploader="laboratory authors", uploader_group="mimii:fan:id_00", source_url="https://zenodo.org/records/3384388", archive_member="fan/id_00/normal/1.wav", license="https://creativecommons.org/licenses/by-sa/4.0/")
        restricted = record(901, "wind", license="https://creativecommons.org/licenses/by-nc/4.0/")
        path, manifest = self.assemble(self.write_inputs([*rows, mimii, restricted], other=[deepcopy(rows[0])]))
        self.assertNotIn("900", {r["clip_id"] for r in manifest["records"]})
        self.assertNotIn("901", {r["clip_id"] for r in manifest["records"]})
        self.assertEqual(manifest["summary"]["exclusionCounts"], {"excluded_mimii": 1, "disallowed_audio_license": 1})
        exclusions = json.loads((path.parent / "historical-exclusions.json").read_bytes())
        self.assertIn("mimii:fan:id_00", exclusions["groups"])
        for item in [mimii, restricted]:
            self.assertIn(item["clip_id"], exclusions["clip_ids"])
            for key in ["sha256", "original_sha256", "pcm_sha256"]:
                self.assertIn(item[key], exclusions["all_hashes"])

    def test_reservations_exclude_whole_connected_owner_session_lineage(self):
        rows = fixture()
        rows[0]["session_group"] = "shared-field-session"
        rows[30]["session_group"] = "shared-field-session"
        rows[31]["uploader"] = rows[30]["uploader"]
        rows[31]["uploader_group"] = rows[30]["uploader_group"]
        _, manifest = self.assemble(self.write_inputs(rows, other=[deepcopy(rows[50])], reservations={"groups": [rows[0]["uploader_group"].upper()]}))
        ids = {r["clip_id"] for r in manifest["records"]}
        self.assertTrue({rows[i]["clip_id"] for i in [0, 30, 31]}.isdisjoint(ids))
        self.assertEqual(manifest["summary"]["exclusionCounts"]["reserved_final_lineage"], 3)
        _, by_session = self.assemble(self.write_inputs(rows, other=[deepcopy(rows[50])], reservations={"groups": ["shared-field-session"]}))
        self.assertEqual(manifest["assignments"], by_session["assignments"])

    def test_reserved_clip_and_cross_kind_hash_exclude_even_failed_final_sources(self):
        rows = fixture()
        for reservation in [{"clip_ids": [rows[0]["clip_id"]]}, {"original_sha256": [rows[0]["pcm_sha256"]]}, {"prepared_sha256": [rows[0]["original_sha256"]]}, {"pcm_sha256": [rows[0]["sha256"]]}]:
            with self.subTest(reservation=reservation):
                _, manifest = self.assemble(self.write_inputs(rows, other=[deepcopy(rows[50])], reservations=reservation))
                self.assertNotIn(rows[0]["clip_id"], {r["clip_id"] for r in manifest["records"]})

    def test_tobee_collections_are_always_final_only_and_ivbee_is_one_shared_collection_phase(self):
        rows = fixture()
        for i in range(3):
            rows.append(record(800 + i, "buzz", dataset="IVBEE", uploader=f"specimen-author-{i}", uploader_group=f"ivbee:specimen:{i}", source_url="https://zenodo.org/records/20077113", archive_member=f"bee/{i}.wav", collection_group="IVBEE:single-laboratory-collection"))
        rows.append(record(850, "buzz", dataset="ToBee", uploader_group="tobee:hive1", source_url="https://zenodo.org/records/abc", source_filename="Hive1.wav", collection_group="ToBee:NU-Hive"))
        _, manifest = self.assemble(self.write_inputs(rows, other=[deepcopy(rows[0])]))
        self.assertNotIn("850", {r["clip_id"] for r in manifest["records"]})
        bees = [r for r in manifest["records"] if r["dataset"] == "IVBEE"]
        self.assertEqual(len(bees), 3)  # A shared collection URL is not one recording.
        self.assertEqual(len({r["v3_group"] for r in bees}), 1)
        self.assertEqual(len({r["v3_phase"] for r in bees}), 1)

    def test_conflicting_duplicate_labels_source_hashes_and_lineage_fail_without_output(self):
        base = record(1)
        for mutate in [lambda r: r.__setitem__("label", "wind"), lambda r: r.__setitem__("uploader_group", "other-owner"), lambda r: r.__setitem__("pcm_sha256", sha("changed-pcm")), lambda r: r.__setitem__("original_sha256", sha("changed-original")), lambda r: r.__setitem__("license", "https://creativecommons.org/licenses/by/4.0/")]:
            duplicate = deepcopy(base)
            mutate(duplicate)
            inputs = self.write_inputs([base], [duplicate])
            output = self.root / f"conflict-{self.sequence}"
            with self.assertRaisesRegex(ValueError, "Conflicting duplicate"):
                assemble_historical_v3(output, inputs[1], inputs[2], sources=inputs[0])
            self.assertFalse(output.exists())

    def test_identical_pcm_different_ids_collapses_only_with_consistent_lineage(self):
        base, duplicate = record(1), record(2)
        for key in ["uploader", "uploader_group", "original_sha256", "pcm_sha256", "original_labels"]:
            duplicate[key] = deepcopy(base[key])
        _, manifest = self.assemble(self.write_inputs([base], [duplicate]))
        self.assertEqual(len(manifest["records"]), 1)
        self.assertEqual(manifest["records"][0]["clip_id"], "1")
        self.assertEqual(len(manifest["records"][0]["history"]), 2)
        duplicate["uploader"] = duplicate["uploader_group"] = "new-owner"
        with self.assertRaisesRegex(ValueError, "Conflicting duplicate"):
            self.assemble(self.write_inputs([base], [duplicate]))

    def test_input_pins_invalid_reservations_and_overwrite_fail_closed(self):
        inputs = self.write_inputs()
        path, manifest = self.assemble(inputs)
        before = path.read_bytes()
        with self.assertRaisesRegex(ValueError, "immutable"):
            assemble_historical_v3(path.parent, inputs[1], inputs[2], sources=inputs[0])
        self.assertEqual(path.read_bytes(), before)
        inputs[0][0].path.write_bytes(inputs[0][0].path.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
            self.assemble(inputs)
        fresh = self.write_inputs()
        fresh[1].write_bytes(fresh[1].read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
            self.assemble(fresh)
        for reservations in [{"groups": []}, {"purpose": "final-predictions"}, {"seed": 18044}, {"pcm_sha256": ["not-a-sha"]}]:
            with self.assertRaises(ValueError):
                self.assemble(self.write_inputs(reservations=reservations))

    def test_relative_paths_resolve_to_original_manifest_and_explicit_colab_remap_is_boundary_checked(self):
        rows = [record(1, local_path="audio/one.wav"), record(2, local_path="/content/audio-two/2.wav")]
        inputs = self.write_inputs(rows, [deepcopy(rows[0])])
        _, manifest = self.assemble(inputs, path_prefix_map={"/content/audio": "/new/cache"})
        by_id = {r["clip_id"]: r for r in manifest["records"]}
        self.assertEqual(by_id["1"]["local_path"], str((inputs[0][0].path.parent / "audio/one.wav").resolve()))
        self.assertEqual(by_id["2"]["local_path"], "/content/audio-two/2.wav")
        _, mapped = self.assemble(self.write_inputs([record(3)], [record(4)]), path_prefix_map={"/content/audio": "/new/cache"})
        self.assertEqual({r["local_path"] for r in mapped["records"]}, {"/new/cache/3.wav", "/new/cache/4.wav"})
        for path in ["../outside.wav", "https://example.org/audio.wav", "C:relative.wav"]:
            with self.assertRaises(ValueError):
                self.assemble(self.write_inputs([record(5, local_path=path)], [record(6)]))

    def test_sparse_strata_are_reported_instead_of_dropping_a_class_or_changing_seed(self):
        _, manifest = self.assemble(self.write_inputs([record(1), record(2, "unknown")], [record(3, "wind")]))
        self.assertFalse(manifest["summary"]["allKnownClassesPresent"])
        self.assertEqual(manifest["seed"], 18043)
        self.assertEqual({r["clip_id"] for r in manifest["records"]}, {"1", "2", "3"})
        self.assertTrue(manifest["summary"]["sparseDevelopmentStrata"])
        self.assertIn("mechanical_fan", manifest["summary"]["countsByPhase"]["audit"])
        self.assertEqual(manifest["summary"]["countsByPhase"]["audit"]["mechanical_fan"], 0)

    def test_prepared_source_manifest_stages_in_canonical_runner_without_relabeling(self):
        # A generated test WAV, not public data or a final-audit recording.
        import array
        import struct
        from ml.browser.prepareCanonical import prepare
        values = array.array("f", [0.1] * 240000)
        pcm = values.tobytes()
        fmt = struct.pack("<HHIIHH", 3, 1, 48000, 48000 * 4, 4, 32)
        chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(pcm)) + pcm
        raw = b"RIFF" + struct.pack("<I", len(chunks) + 4) + b"WAVE" + chunks
        audio = self.root / "synthetic.wav"
        audio.write_bytes(raw)
        r = record(200, local_path=str(audio), sha256=sha(raw), original_sha256=sha(raw), pcm_sha256=sha(pcm))
        source, manifest = self.assemble(self.write_inputs([r], [deepcopy(r)]))
        staged = json.loads(prepare(source, self.root / "staged").read_bytes())
        row = staged["records"][0]
        self.assertEqual(row["split"], manifest["assignments"]["roleByClipId"]["200"])
        self.assertEqual(row["label"], "buzz")
        self.assertEqual(row["pcm_sha256"], r["pcm_sha256"])
        self.assertEqual(row["source_record"]["v3_group"], manifest["assignments"]["groupByClipId"]["200"])
        self.assertEqual((self.root / "staged" / row["pcm_path"]).read_bytes(), pcm)


if __name__ == "__main__":
    unittest.main()
