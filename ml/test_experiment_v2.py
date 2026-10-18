"""Synthetic checks for training-only selection and per-class unknown rejection."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import joblib
import numpy as np

from ml.experiment_v2 import _choose_class_rules, predict_research_artifact, run_experiment_v2


def fixture():
    rng = np.random.default_rng(804)
    X, labels, splits, groups = [], [], [], []
    centers = {"buzz": [1, 0, 0, 0], "speech": [0, 1, 0, 0], "wind": [-1, 0, 0, 0]}
    for split, count in (("train", 5), ("val", 3), ("test", 3)):
        for label, center in centers.items():
            for group in range(count):
                for repeat in range(2):
                    row = np.asarray(center) + rng.normal(0, 0.015, 4)
                    X.append(row / np.linalg.norm(row))
                    labels.append(label)
                    splits.append(split)
                    groups.append(f"{split}-{label}-{group}")
    for split in ("ood_val", "ood_test"):
        for i in range(100):
            row = np.array([0, 0, 1, 0]) + rng.normal(0, 0.015, 4)
            X.append(row / np.linalg.norm(row))
            labels.append("unknown")
            splits.append(split)
            groups.append(f"{split}-{i}")
    return {
        "X": np.asarray(X), "labels": np.asarray(labels), "split": np.asarray(splits), "groups": np.asarray(groups),
        "clip_ids": np.asarray([f"clip-{i}" for i in range(len(X))]),
        "sha256": np.asarray([hashlib.sha256(str(i).encode()).hexdigest() for i in range(len(X))]),
    }


class ExperimentV2Tests(unittest.TestCase):
    def run_fixture(self, inputs=None, **kwargs):
        with tempfile.TemporaryDirectory() as directory:
            result = run_experiment_v2(**(inputs or fixture()), output_dir=directory, **kwargs)
            saved = json.loads((Path(directory) / "evaluation_v2.json").read_text(encoding="utf-8"))
            artifact = joblib.load(Path(directory) / "classifier_v2.joblib")
            self.assertEqual(result, saved)
            return result, artifact

    def test_separable_classes_all_get_usable_gates_including_speech(self):
        inputs = fixture()
        result, artifact = self.run_fixture(inputs)
        self.assertFalse(result["promotionAllowed"])
        self.assertFalse(result["browserPortable"])
        self.assertTrue(result["allClassGatesPassed"])
        self.assertEqual(len(result["training"]["crossValidation"]), 13)
        self.assertEqual(result["training"]["selectedModel"], {"kind": "linear", "C": 0.01})
        for label in result["classOrder"]:
            gate = result["ruleSelection"]["classes"][label]
            self.assertTrue(gate["eligible"])
            self.assertGreaterEqual(gate["correctTrueClassCoverage"]["rate"], 0.2)
            self.assertGreaterEqual(gate["precisionAmongAcceptedKnownPredictions"]["rate"], 0.8)
        speech = next(row for row in result["splits"]["test"]["perClass"] if row["label"] == "speech")
        self.assertGreater(speech["correctTrueClassCoverage"]["rate"], 0)
        reproduced = predict_research_artifact(artifact, inputs["X"])
        mask = inputs["split"] == "test"
        self.assertEqual(int(np.sum(reproduced["accepted"][mask])), result["splits"]["test"]["coverage"]["successes"])
        np.testing.assert_array_equal(reproduced["labels"][mask], inputs["labels"][mask])

    def test_test_mutation_cannot_change_model_or_class_thresholds(self):
        first = fixture()
        first_result, first_artifact = self.run_fixture(first)
        changed = fixture()
        mask = np.isin(changed["split"], ["test", "ood_test"])
        changed["X"][mask] = np.roll(changed["X"][mask], 1, axis=1)
        known_test = changed["split"] == "test"
        changed["labels"][known_test] = np.roll(changed["labels"][known_test], 1)
        changed_result, changed_artifact = self.run_fixture(changed)
        self.assertEqual(first_result["training"], changed_result["training"])
        self.assertEqual(first_result["rejectionRules"], changed_result["rejectionRules"])
        self.assertEqual(first_result["ruleSelection"], changed_result["ruleSelection"])
        np.testing.assert_array_equal(first_artifact["classifier"].coef_, changed_artifact["classifier"].coef_)
        self.assertEqual(first_result["manifestSha256"]["train"], changed_result["manifestSha256"]["train"])
        self.assertNotEqual(first_result["manifestSha256"]["test"], changed_result["manifestSha256"]["test"])

    def test_rbf_selection_and_top_three_affinity_handle_opposite_speech_modes(self):
        inputs = fixture()
        keep = inputs["labels"] != "wind"
        inputs = {key: value[keep] for key, value in inputs.items()}
        rng = np.random.default_rng(805)
        for split in ("train", "val", "test"):
            for label, center in (("buzz", [1, 1, 0, 0]), ("speech", [1, -1, 0, 0])):
                indices = np.flatnonzero((inputs["split"] == split) & (inputs["labels"] == label))
                for index, row in enumerate(indices):
                    # Every uploader supplies both opposite modes. A single
                    # centroid collapses; a nearest-positive affinity does not.
                    vector = np.asarray(center) * (1 if index % 2 else -1) + rng.normal(0, 0.004, 4)
                    inputs["X"][row] = vector / np.linalg.norm(vector)
        result, artifact = self.run_fixture(inputs)
        self.assertEqual(result["training"]["selectedModel"]["kind"], "rbf-svc")
        self.assertGreater(result["model"]["effectiveGamma"], 0)
        self.assertNotIn("weights", result["model"])
        self.assertTrue(result["allClassGatesPassed"])
        test = inputs["split"] == "test"
        reproduced = predict_research_artifact(artifact, inputs["X"][test])
        np.testing.assert_array_equal(reproduced["labels"], inputs["labels"][test])
        self.assertTrue(reproduced["accepted"].all(), (reproduced["accepted"].tolist(), result["rejectionRules"]))
        single = predict_research_artifact(artifact, inputs["X"][test][:1])
        self.assertEqual(single["labels"].shape, (1,))

    def test_per_class_ood_budgets_use_total_unknown_denominator_and_add_up(self):
        classes = np.asarray(["buzz", "speech", "wind"])
        # Every class has ten correctly predicted known samples, one inseparable
        # OOD prediction, and many low-affinity unknowns. Each may accept <=2/100.
        predicted, margin, affinity, labels, splits = [], [], [], [], []
        for i, label in enumerate(classes):
            predicted.extend([i] * 11)
            margin.extend([2.0] * 11)
            affinity.extend([0.9] * 11)
            labels.extend([label] * 10 + ["unknown"])
            splits.extend(["val"] * 10 + ["ood_val"])
        for i in range(97):
            predicted.append(i % 3)
            margin.append(0.01)
            affinity.append(0.01)
            labels.append("unknown")
            splits.append("ood_val")
        rules, selection = _choose_class_rules(np.asarray(predicted), np.asarray(margin), np.asarray(affinity), np.asarray(labels), np.asarray(splits), classes)
        self.assertTrue(selection["allClassGatesPassed"])
        self.assertEqual(selection["constraints"]["maxOodValidationCountPerClass"], 2)
        accepted_unknown = sum(row["acceptedOodValidationCount"] for row in selection["classes"].values())
        self.assertLessEqual(accepted_unknown, 10)
        self.assertEqual(accepted_unknown, 3)
        self.assertTrue(all(not rule["abstainAll"] for rule in rules.values()))

    def test_ineligible_class_abstains_without_starving_other_classes(self):
        classes = np.asarray(["buzz", "speech"])
        predicted = np.asarray([0] * 10 + [1] * 10 + [1] * 100)
        y = np.asarray(["buzz"] * 10 + ["speech"] * 10 + ["unknown"] * 100)
        split = np.asarray(["val"] * 20 + ["ood_val"] * 100)
        margin = np.full(len(y), 2.0)
        affinity = np.full(len(y), 0.9)
        rules, selection = _choose_class_rules(predicted, margin, affinity, y, split, classes)
        self.assertFalse(selection["allClassGatesPassed"])
        self.assertFalse(rules["buzz"]["abstainAll"])
        self.assertTrue(rules["speech"]["abstainAll"])
        self.assertFalse(selection["classes"]["speech"]["eligible"])
        self.assertEqual(selection["classes"]["speech"]["acceptedOodValidationCount"], 0)

    def test_known_prediction_precision_is_a_separate_required_gate(self):
        classes = np.asarray(["buzz", "speech"])
        y = np.asarray(["buzz"] * 2 + ["speech"] * 8 + ["unknown"] * 100)
        split = np.asarray(["val"] * 10 + ["ood_val"] * 100)
        predicted = np.zeros(len(y), dtype=int)
        margin = np.r_[np.ones(10), np.zeros(100)]
        affinity = np.r_[np.ones(10), np.zeros(100)]
        rules, selection = _choose_class_rules(predicted, margin, affinity, y, split, classes)
        self.assertTrue(rules["buzz"]["abstainAll"])
        self.assertFalse(selection["classes"]["buzz"]["eligible"])

    def test_old_evaluated_uploaders_cannot_reenter_the_fresh_holdout(self):
        inputs = fixture()
        old_test_group = inputs["groups"][np.flatnonzero(inputs["split"] == "test")[0]]
        with self.assertRaisesRegex(ValueError, "previously evaluated uploader"):
            self.run_fixture(inputs, previously_evaluated_groups=[old_test_group])
        result, _ = self.run_fixture(inputs, previously_evaluated_groups=["earlier-test-uploader"])
        self.assertEqual(result["leakageChecks"]["previouslyEvaluatedUploadersExcludedFromHoldout"], "passed")

    def test_leakage_and_invalid_inputs_fail_before_fitting(self):
        for field, value, error in (
            ("X", None, "L2-normalized"),
            ("groups", "copy", "uploader leakage"),
            ("clip_ids", "copy", "clip_id leakage"),
            ("sha256", "copy", "content SHA-256 leakage"),
        ):
            inputs = fixture()
            index = np.flatnonzero(inputs["split"] == "test")[0]
            if field == "X":
                inputs[field][0] *= 2
            else:
                inputs[field][index] = inputs[field][0]
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, error):
                self.run_fixture(inputs)


if __name__ == "__main__":
    unittest.main()
