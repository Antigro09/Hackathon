"""Leakage, frozen-threshold, and portable-export checks; no audio download."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from ml.experiment import run_experiment


def fixture():
    rng = np.random.default_rng(804)
    rows, labels, splits, groups = [], [], [], []
    for split, group_count in (("train", 5), ("val", 3), ("test", 3)):
        for label, sign in (("fan", -1), ("traffic", 1)):
            for group in range(group_count):
                for repeat in range(2):
                    row = np.array([sign, 0.0, 0.0, 0.0]) + rng.normal(0, 0.025, 4)
                    rows.append(row / np.linalg.norm(row))
                    labels.append(label)
                    splits.append(split)
                    groups.append(f"{split}-{label}-uploader-{group}")
    for split in ("ood_val", "ood_test"):
        for i in range(20):
            row = np.array([0.0, 1.0, 0.0, 0.0]) + rng.normal(0, 0.02, 4)
            rows.append(row / np.linalg.norm(row))
            labels.append("unknown")
            splits.append(split)
            groups.append(f"{split}-uploader-{i}")
    count = len(rows)
    return {
        "X": np.asarray(rows),
        "labels": np.asarray(labels),
        "split": np.asarray(splits),
        "groups": np.asarray(groups),
        "clip_ids": np.asarray([f"clip-{i}" for i in range(count)]),
        "sha256": np.asarray([hashlib.sha256(f"audio-{i}".encode()).hexdigest() for i in range(count)]),
    }


class ExperimentTests(unittest.TestCase):
    def run_fixture(self, inputs=None, **kwargs):
        with tempfile.TemporaryDirectory() as directory:
            summary = run_experiment(**(inputs or fixture()), output_dir=directory, **kwargs)
            model = json.loads((Path(directory) / "linear_probe.json").read_text(encoding="utf-8"))
            saved = json.loads((Path(directory) / "evaluation.json").read_text(encoding="utf-8"))
            self.assertEqual(summary, saved)
            return summary, model

    def test_portable_export_and_rejection_metrics(self):
        inputs = fixture()
        summary, model = self.run_fixture(inputs)
        self.assertFalse(summary["promotionAllowed"])
        self.assertFalse(model["promotionAllowed"])
        self.assertTrue(summary["probe"]["ruleSelection"]["eligible"])
        self.assertEqual(summary["leakageChecks"]["contentHashesAcrossAllSplits"], "passed")
        self.assertEqual(summary["probe"]["splits"]["test"]["ungated"]["accuracy"], 1)
        self.assertLessEqual(summary["probe"]["splits"]["ood_val"]["falseAcceptance"]["rate"], 0.1)
        self.assertGreaterEqual(summary["probe"]["splits"]["val"]["coverage"]["rate"], 0.2)
        self.assertEqual(model["classOrder"], ["fan", "traffic"])
        score = inputs["X"] @ np.asarray(model["weights"]).T + model["bias"]
        prediction = np.asarray(model["classOrder"])[np.argmax(score, axis=1)]
        known_test = inputs["split"] == "test"
        np.testing.assert_array_equal(prediction[known_test], inputs["labels"][known_test])
        interval = summary["probe"]["splits"]["ood_test"]["falseAcceptance"]["wilson95"]
        self.assertGreater(interval[1], 0, "zero observed errors must still show finite-sample uncertainty")

    def test_test_data_cannot_change_training_or_rejection_thresholds(self):
        first = fixture()
        summary1, model1 = self.run_fixture(first)
        second = fixture()
        mask = np.isin(second["split"], ["test", "ood_test"])
        second["X"][mask] = np.roll(second["X"][mask], 1, axis=1)
        known_test = second["split"] == "test"
        second["labels"][known_test] = np.where(second["labels"][known_test] == "fan", "traffic", "fan")
        summary2, model2 = self.run_fixture(second)
        self.assertEqual(model1["weights"], model2["weights"])
        self.assertEqual(model1["bias"], model2["bias"])
        self.assertEqual(model1["rejectionRule"], model2["rejectionRule"])
        self.assertEqual(summary1["training"], summary2["training"])
        self.assertEqual(summary1["manifestSha256"]["train"], summary2["manifestSha256"]["train"])
        self.assertNotEqual(summary1["manifestSha256"]["test"], summary2["manifestSha256"]["test"])

    def test_indistinguishable_validation_unknowns_force_abstain_all(self):
        inputs = fixture()
        mask = np.isin(inputs["split"], ["val", "ood_val"])
        inputs["X"][mask] = np.array([1, 0, 0, 0])
        summary, model = self.run_fixture(inputs)
        self.assertFalse(summary["probe"]["ruleSelection"]["eligible"])
        self.assertTrue(model["rejectionRule"]["abstainAll"])
        self.assertEqual(summary["probe"]["splits"]["test"]["coverage"]["rate"], 0)
        self.assertIsNone(summary["probe"]["splits"]["test"]["selectiveAccuracy"]["rate"])

    def test_same_uploader_across_splits_is_rejected(self):
        inputs = fixture()
        val = np.flatnonzero(inputs["split"] == "val")[0]
        inputs["groups"][val] = inputs["groups"][0]
        with self.assertRaisesRegex(ValueError, "uploader leakage"):
            self.run_fixture(inputs)

    def test_duplicate_clip_and_duplicate_content_are_rejected(self):
        for field, error in (("clip_ids", "clip_id leakage"), ("sha256", "content SHA-256 leakage")):
            inputs = fixture()
            index = np.flatnonzero(inputs["split"] == "ood_test")[0]
            inputs[field][index] = inputs[field][0]
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, error):
                self.run_fixture(inputs)

    def test_insufficient_independent_training_uploaders_fails_clearly(self):
        inputs = fixture()
        inputs["groups"][(inputs["split"] == "train") & (inputs["labels"] == "fan")] = "single-fan-uploader"
        with self.assertRaisesRegex(ValueError, "at least two distinct training uploaders per class"):
            self.run_fixture(inputs)

    def test_non_normalized_embeddings_are_rejected(self):
        inputs = fixture()
        inputs["X"][0] *= 2
        with self.assertRaisesRegex(ValueError, "L2-normalized"):
            self.run_fixture(inputs)

    def test_ood_cannot_be_a_training_class(self):
        inputs = fixture()
        inputs["labels"][inputs["split"] == "ood_test"] = "fan"
        with self.assertRaisesRegex(ValueError, "OOD splits must not use"):
            self.run_fixture(inputs)

    def test_matched_baseline_is_evaluated_and_frozen_without_test_tuning(self):
        inputs = fixture()
        scores = inputs["X"][:, :2].copy()
        summary1, _ = self.run_fixture(inputs, baseline_scores=scores)
        altered = scores.copy()
        altered[np.isin(inputs["split"], ["test", "ood_test"])] *= -10
        summary2, _ = self.run_fixture(inputs, baseline_scores=altered)
        self.assertEqual(summary1["zeroShotMatchedLabels"]["rejectionRule"], summary2["zeroShotMatchedLabels"]["rejectionRule"])
        self.assertIsNotNone(summary1["zeroShotMatchedLabels"])
        self.assertIn("testDifferenceProbeMinusMatchedZeroShot", summary1)
        with self.assertRaisesRegex(ValueError, "N by K matched-label"):
            self.run_fixture(inputs, baseline_scores=np.zeros((len(scores), 8)))

    def test_every_split_is_required(self):
        inputs = fixture()
        inputs["split"][inputs["split"] == "ood_test"] = "ood_val"
        with self.assertRaisesRegex(ValueError, "Require nonempty splits"):
            self.run_fixture(inputs)


if __name__ == "__main__":
    unittest.main()
