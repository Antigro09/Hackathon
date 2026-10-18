"""Metadata regressions, without downloaded recordings, embeddings or models."""
from copy import deepcopy
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from ml.outdoor_corpus import audit_corpus, main


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def record(source, split="train", label="verified-source-positive", **changes):
    positive = label in {"verified-source-positive", "facility-adjacent-uncertain"}
    value = {
        "sourceId": source, "sourceUrl": f"https://example.org/original/{source}",
        "facilityId": f"facility-{source}" if positive else None,
        "collectionGroup": f"collection-{source}", "sessionGroup": f"session-{source}",
        "split": split, "domain": "outdoor", "claimedLabel": label,
        "controlType": None if positive else "non-datacenter-cooling", "history": "new",
        "lineage": {"originalSourceId": source, "originalSha256": digest(source + "original"),
                    "derivedSha256": digest(source + "derived"), "pcmSha256": digest(source + "pcm"), "parentSourceIds": []},
        "observation": {"durationSeconds": 15, "unpaddedDurationSeconds": 15, "sampleRateHz": 48000, "channels": 2},
        "processing": {"status": "unprocessed", "details": "Original interval reviewed.",
                       "loopStatus": "none", "voiceoverStatus": "none", "musicStatus": "none"},
        "evidence": {"facilityVerified": positive, "outdoorVerified": True, "naturalAudioVerified": True,
                     "sourceContribution": "verified" if positive else "not-applicable",
                     "method": "documented-operational-change" if positive else "context-only",
                     "references": [f"https://example.org/evidence/{source}"],
                     "rationale": "Synthetic metadata for software verification, never field evidence."},
    }
    value.update(changes)
    return value


def ledger():
    rows = []
    for split in ("train", "calibration", "test"):
        rows.extend([record(f"{split}-positive", split), record(f"{split}-cooling", split, "hard-negative")])
    rows.extend([record("traffic", "test", "hard-negative", controlType="road-traffic"),
                 record("wind", "calibration", "hard-negative", controlType="wind")])
    return {"schemaVersion": 1, "records": rows,
            "historicalExclusions": {"sourceIds": ["already-inspected-416-source"], "pcmSha256": [digest("old-test-pcm")]}}


def codes(report, kind="blockers"):
    return {issue["code"] for issue in report[kind]}


class OutdoorCorpusTests(unittest.TestCase):
    def test_complete_metadata_is_only_pilot_ready_and_does_not_mutate_input(self):
        data = ledger()
        snapshot = deepcopy(data)
        report = audit_corpus(data)
        self.assertEqual(data, snapshot)
        self.assertTrue(report["readyForPilot"])
        self.assertFalse(report["promotionAllowed"])
        self.assertFalse(report["audioFilesRead"])
        self.assertFalse(report["modelQueries"])
        self.assertEqual(report["summary"]["eligiblePositiveFacilities"], 3)
        self.assertEqual(report["summary"]["dependencyComponents"], 8)
        self.assertIn("single-positive-group", codes(report, "warnings"))

    def test_eleven_loop_variants_cannot_become_eleven_independent_positives(self):
        data = ledger()
        variants = []
        for index in range(11):
            row = record(f"loop-{index}", "unassigned")
            row["lineage"]["originalSourceId"] = "one-original-recording"
            row["processing"]["loopStatus"] = "looped"
            row["observation"]["durationSeconds"] = 60
            row["observation"]["unpaddedDurationSeconds"] = 2
            variants.append(row)
        data["records"] = variants
        report = audit_corpus(data)
        self.assertFalse(report["readyForPilot"])
        self.assertEqual(report["summary"]["dependencyComponents"], 1)
        self.assertEqual(report["summary"]["effectiveLabels"], {"excluded": 11})
        self.assertEqual(report["summary"]["eligiblePositiveFacilities"], 0)

    def test_transitive_facility_session_parent_components_cannot_cross_roles(self):
        for kind in ("facility", "session", "collection", "original", "parent", "cross-role-hash", "url"):
            with self.subTest(kind=kind):
                data = ledger()
                a, b, c = data["records"][0], data["records"][2], data["records"][4]
                b["lineage"]["parentSourceIds"] = [a["sourceId"]]
                if kind == "facility":
                    c["facilityId"] = b["facilityId"]
                elif kind == "session":
                    c["sessionGroup"] = b["sessionGroup"]
                elif kind == "collection":
                    c["collectionGroup"] = b["collectionGroup"]
                elif kind == "original":
                    c["lineage"]["originalSourceId"] = b["sourceId"]
                elif kind == "parent":
                    c["lineage"]["parentSourceIds"] = [b["sourceId"]]
                elif kind == "cross-role-hash":
                    c["lineage"]["originalSha256"] = b["lineage"]["derivedSha256"]
                else:
                    c["sourceUrl"] = b["sourceUrl"] + "#other-crop"
                report = audit_corpus(data)
                self.assertIn("connected-split-leakage", codes(report))
                containing_a = next(group for group in report["components"] if a["sourceId"] in group["sourceIds"])
                self.assertEqual(set(containing_a["sourceIds"]), {a["sourceId"], b["sourceId"], c["sourceId"]})

    def test_facility_adjacent_title_does_not_establish_positive_ground_truth(self):
        data = ledger()
        row = data["records"][0]
        row["evidence"]["sourceContribution"] = "uncertain"
        row["evidence"]["method"] = "context-only"
        report = audit_corpus(data)
        self.assertIn("positive-source-evidence-missing", codes(report))
        self.assertEqual(report["records"][0]["effectiveLabel"], "facility-adjacent-uncertain")
        self.assertIn("uncertain-not-ground-truth", codes(report, "warnings"))

    def test_opaque_expert_case_can_contribute_but_does_not_prove_independence(self):
        data = ledger()
        for row in (data["records"][0], data["records"][2]):
            row["facilityId"] = "opaque-expert-case"
            row["evidence"]["facilityIdentityPublic"] = False
            row["processing"]["status"] = "processed"
            row["processing"]["details"] = "Original MP3 preserved; documented codec transcode and global gain. Natural interval reviewed."
        report = audit_corpus(data)
        self.assertEqual(report["records"][0]["effectiveLabel"], "verified-source-positive")
        self.assertIn("opaque-facility-identity", codes(report, "warnings"))
        self.assertIn("processed-recording", codes(report, "warnings"))
        self.assertIn("connected-split-leakage", codes(report))

    def test_unreviewed_processing_unknown_audio_and_indoor_sources_are_ineligible(self):
        mutations = [lambda row: row["processing"].update(status="unknown"),
                     lambda row: row["evidence"].update(naturalAudioVerified=False),
                     lambda row: row.update(domain="indoor"),
                     lambda row: row["processing"].update(voiceoverStatus="present"),
                     lambda row: row["processing"].update(musicStatus="unknown"),
                     lambda row: row["observation"].update(unpaddedDurationSeconds=4.99),
                     lambda row: row["lineage"].update(pcmSha256=None)]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                data = ledger()
                mutate(data["records"][0])
                report = audit_corpus(data)
                self.assertEqual(report["records"][0]["effectiveLabel"], "excluded")
                self.assertIn("ineligible-active-record", codes(report))

    def test_uncertain_facility_audio_cannot_be_labeled_a_hard_negative(self):
        data = ledger()
        data["records"][1]["evidence"]["sourceContribution"] = "uncertain"
        report = audit_corpus(data)
        self.assertEqual(report["records"][1]["effectiveLabel"], "excluded")
        self.assertIn("missing-lookalike-control", codes(report))

    def test_missing_lookalike_and_environment_controls_block_pilot(self):
        data = ledger()
        for row in data["records"]:
            if row["claimedLabel"] == "hard-negative":
                row["controlType"] = "speech"
        report = audit_corpus(data)
        self.assertIn("missing-lookalike-control", codes(report))
        self.assertIn("missing-environment-control", codes(report))

    def test_any_inspected_content_role_or_parent_blocks_fresh_evaluation(self):
        for mutation in ("history", "pcm", "cross-role-hash", "parent"):
            with self.subTest(mutation=mutation):
                data = ledger()
                row = data["records"][4]
                if mutation == "history":
                    row["history"] = "inspected-evaluation"
                elif mutation == "pcm":
                    row["lineage"]["pcmSha256"] = digest("old-test-pcm")
                elif mutation == "cross-role-hash":
                    row["lineage"]["originalSha256"] = digest("old-test-pcm")
                else:
                    row["lineage"]["parentSourceIds"] = ["already-inspected-416-source"]
                report = audit_corpus(data)
                self.assertIn("historical-audio-in-fresh-split", codes(report))
                self.assertEqual(report["records"][4]["effectiveLabel"], "excluded")

    def test_missing_or_empty_historical_exclusions_cannot_assert_freshness(self):
        for exclusions in (None, {}):
            data = ledger()
            data["historicalExclusions"] = exclusions
            self.assertFalse(audit_corpus(data)["readyForPilot"])

    def test_excluded_historical_parent_contaminates_its_otherwise_fresh_descendant(self):
        data = ledger()
        parent = record("old-parent", "excluded", "excluded")
        parent["lineage"]["originalSha256"] = digest("old-test-pcm")
        descendant = data["records"][4]
        descendant["lineage"]["parentSourceIds"] = [parent["sourceId"]]
        data["records"].append(parent)
        report = audit_corpus(data)
        self.assertIn("historical-component-in-fresh-split", codes(report))
        self.assertEqual(report["records"][4]["effectiveLabel"], "excluded")
        self.assertIn("missing-split-class", codes(report))

    def test_malformed_metadata_unknown_enums_boolean_numbers_and_nonfinite_values_fail_closed(self):
        mutations = [lambda row: row.update(controlType=[]), lambda row: row.update(claimedLabel="probably-fan"),
                     lambda row: row["observation"].update(sampleRateHz=True),
                     lambda row: row["observation"].update(durationSeconds=float("nan")),
                     lambda row: row["observation"].update(unpaddedDurationSeconds=16),
                     lambda row: row["evidence"].update(facilityVerified="yes"),
                     lambda row: row["processing"].update(loopStatus=None),
                     lambda row: row.update(sourceUrl="https://user:secret@example.org/audio"),
                     lambda row: row["lineage"].update(originalSha256="not-a-sha")]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                data = ledger()
                mutate(data["records"][0])
                report = audit_corpus(data)
                self.assertIn("malformed-record", codes(report))
                self.assertFalse(report["readyForPilot"])

    def test_duplicate_source_ids_and_unassigned_eligible_records_block(self):
        data = ledger()
        row = deepcopy(data["records"][0])
        row["sourceId"] = " TRAIN-POSITIVE "
        row["split"] = "unassigned"
        data["records"].append(row)
        report = audit_corpus(data)
        self.assertIn("duplicate-source-id", codes(report))
        self.assertIn("split-unassigned", codes(report))

    def test_cli_binds_exact_input_bytes_and_rejects_duplicate_json_keys_without_model_io(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            source, destination = folder / "sources.json", folder / "report.json"
            raw = (json.dumps(ledger(), indent=2) + "\n").encode()
            source.write_bytes(raw)
            with redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--ledger", str(source), "--output", str(destination)]), 0)
            report = json.loads(destination.read_text(encoding="utf-8"))
            self.assertEqual(report["ledgerSha256"], hashlib.sha256(raw).hexdigest())
            source.write_text('{"schemaVersion":1,"records":[],"records":[]}', encoding="utf-8")
            with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                main(["--ledger", str(source), "--output", str(destination)])


if __name__ == "__main__":
    unittest.main()
