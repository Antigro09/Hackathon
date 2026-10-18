"""Synthetic-only regressions; no public-audio predictions or final tuning."""

from copy import deepcopy
from dataclasses import replace
from fractions import Fraction
import hashlib
import itertools
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from ml.experiment_v3 import (
    DEFAULT_CRITERIA, INPUT_SCALE, KNOWN_CLASSES, MAX_SAFE_INTEGER, UNKNOWN,
    _group_weights, _optimize_class_rules, _round_away, audit_frozen_v3,
    evaluate_readiness, fit_research_v3, integer_head, predict_fixed_v3,
    quantize_embeddings,
)


def fixture():
    rng = np.random.default_rng(18043)
    X, labels, roles, groups, datasets = [], [], [], [], []
    for phase, group_count, repeats in (("train", 5, 3), ("calibration", 4, 3), ("audit", 5, 5)):
        for k, label in enumerate([*KNOWN_CLASSES, UNKNOWN]):
            unknown = label == UNKNOWN
            count, copies = (10, 10) if unknown and phase != "train" else (group_count, repeats)
            for group in range(count):
                for _ in range(copies):
                    vector = np.zeros(512)
                    vector[k] = 1
                    vector[:8] += rng.normal(0, 0.002, 8)
                    X.append((vector / np.linalg.norm(vector)).astype(np.float32))
                    labels.append("rain-background" if unknown else label)
                    roles.append(("unknown_" if unknown else "") + phase)
                    groups.append(f"{phase}-{label}-{group}")
                    datasets.append("synthetic-background" if unknown else "synthetic-known")
    n = len(X)
    return {
        "X": np.asarray(X), "labels": np.asarray(labels), "roles": np.asarray(roles),
        "groups": np.asarray(groups), "datasets": np.asarray(datasets),
        "clip_ids": np.asarray([f"synthetic-{i}" for i in range(n)]),
        "pcm_sha256": np.asarray([hashlib.sha256(f"pcm-{i}".encode()).hexdigest() for i in range(n)]),
        "embedding_contract": {"canonicalBackend": "browser-wasm", "dimension": 512, "normalization": "l2-float32", "modelSha256": "a" * 64, "runtimeFingerprintSha256": "b" * 64, "preprocessingContractSha256": "c" * 64},
    }


def fit(inputs):
    with tempfile.TemporaryDirectory() as directory:
        report = fit_research_v3(**inputs, output_dir=directory)
        root = Path(directory)
        artifact = json.loads((root / "research_head_v3.json").read_text())
        manifest = json.loads((root / "development_manifest_v3.json").read_text())
        assert report == json.loads((root / "development_v3.json").read_text())
        return report, artifact, manifest


def simple_head():
    W = np.zeros((6, 512))
    W[:, :6] = np.eye(6)
    head = integer_head(W, np.zeros(6), [*KNOWN_CLASSES, UNKNOWN])
    head["rejectionRules"] = {c: {"abstainAll": False, "minGuardedMargin": 0} for c in KNOWN_CLASSES}
    return head


class V3FixedPointTests(unittest.TestCase):
    def test_symmetric_rounding_including_negative_ties(self):
        np.testing.assert_array_equal(_round_away(np.asarray([-2.5, -1.5, -0.5, 0, 0.5, 1.5, 2.5])), [-3, -2, -1, 0, 1, 2, 3])

    def test_quantization_preserves_canonical_float32_without_renormalizing(self):
        X = np.zeros((1, 512), np.float32)
        X[0, 0] = np.float32(1 / (2 * INPUT_SCALE))
        X[0, 1] = -X[0, 0]
        X[0, 2] = 1
        q = quantize_embeddings(X)
        self.assertEqual(q[0, 0], 1)
        self.assertEqual(q[0, 1], -1)
        self.assertEqual(q[0, 2], INPUT_SCALE)
        for bad in [X.astype(np.float64), X * 2, np.full_like(X, np.nan)]:
            with self.assertRaises(ValueError):
                quantize_embeddings(bad)

    def test_scores_equal_independent_python_integer_dot_reference(self):
        head = simple_head()
        q = np.zeros((3, 512), np.int64)
        q[0, :6] = [120, -300, 400, 0, 8, 10]
        q[1, :6] = [-300, 800, -700, 0, 20, 1]
        q[2, :6] = [1, 2, 3, 4, 5, INPUT_SCALE]
        actual = predict_fixed_v3(head, q, integer_input=True)
        expected = [[sum(int(a) * int(b) for a, b in zip(row, weight)) + intercept for weight, intercept in zip(head["weights"], head["bias"])] for row in q]
        self.assertEqual(actual["integerScores"].tolist(), expected)
        self.assertEqual(actual["labels"].tolist(), ["speech", "mechanical_fan", UNKNOWN])
        self.assertFalse(actual["accepted"][-1])
        self.assertLess(4 * head["maxAbsoluteScoreBound"] + 2 * np.max(head["pairGuard"]) + 2, MAX_SAFE_INTEGER)

    def test_exact_gate_equality_accepts_and_one_integer_more_rejects(self):
        head = simple_head()
        X = np.zeros((1, 512), np.float32)
        X[0, 0] = 1
        margin = int(predict_fixed_v3(head, X)["guardedMargin"][0])
        head["rejectionRules"]["buzz"]["minGuardedMargin"] = margin
        self.assertTrue(predict_fixed_v3(head, X)["accepted"][0])
        head["rejectionRules"]["buzz"]["minGuardedMargin"] = margin + 1
        self.assertFalse(predict_fixed_v3(head, X)["accepted"][0])

    def test_tied_class_scores_choose_first_but_guard_rejects(self):
        head = integer_head(np.zeros((6, 512)), np.zeros(6), [*KNOWN_CLASSES, UNKNOWN])
        head["rejectionRules"]["buzz"] = {"abstainAll": False, "minGuardedMargin": 0}
        X = np.zeros((1, 512), np.float32)
        X[0, 0] = 1
        result = predict_fixed_v3(head, X)
        self.assertEqual(result["labels"][0], "buzz")
        self.assertEqual(result["guardedMargin"][0], -1)
        self.assertFalse(result["accepted"][0])

    def test_malformed_or_unsafe_artifacts_fail_closed(self):
        original = simple_head()
        q = np.zeros((1, 512), np.int64)
        for mutate in [lambda h: h["pairGuard"][0].__setitem__(1, 0), lambda h: h.__setitem__("promotionAllowed", True), lambda h: h["classOrder"].reverse(), lambda h: h["weights"][0].__setitem__(0, True), lambda h: h["bias"].__setitem__(0, MAX_SAFE_INTEGER), lambda h: h["rejectionRules"]["buzz"].__setitem__("minGuardedMargin", 0.5)]:
            head = deepcopy(original)
            mutate(head)
            with self.assertRaises(ValueError):
                predict_fixed_v3(head, q, integer_input=True)
        with self.assertRaises(ValueError):
            integer_head(np.full((6, 512), 10_000), np.zeros(6), [*KNOWN_CLASSES, UNKNOWN])
        with self.assertRaises(ValueError):
            predict_fixed_v3(original, np.full((1, 512), INPUT_SCALE + 2), integer_input=True)

    def test_group_balancing_prevents_repeated_clips_from_domination(self):
        y = np.asarray(["buzz"] * 101 + [UNKNOWN])
        groups = np.asarray(["one-session"] * 100 + ["second-session", "unknown-session"])
        weights = _group_weights(y, groups, 2)
        self.assertAlmostEqual(weights[:100].sum(), weights[100])
        self.assertAlmostEqual(weights[101], 2 * weights[:101].sum())
        self.assertAlmostEqual(weights.mean(), 1)

    def test_global_budget_search_maximizes_minimum_class_coverage_first(self):
        def option(n, cost):
            return {"correct": n, "knownAccepted": n, "unknownAccepted": cost, "coverage": Fraction(n, 10), "threshold": n}
        choices = {label: [option(10, 0)] for label in KNOWN_CLASSES}
        choices["buzz"] = [option(6, 1), option(10, 2)]
        choices["traffic"] = [option(5, 0), option(9, 1)]
        level, cost, selected = _optimize_class_rules(choices, 2)
        self.assertEqual(level, Fraction(6, 10))
        self.assertEqual(cost, 2)
        self.assertEqual(selected[0]["correct"], 6)
        self.assertEqual(selected[3]["correct"], 9)
        self.assertIsNone(_optimize_class_rules(choices, 0))

    def test_budget_optimizer_matches_independent_exhaustive_search(self):
        rng = np.random.default_rng(18044)
        def key(options):
            return (min(v["coverage"] for v in options), sum(v["correct"] for v in options), sum(v["coverage"] for v in options), -sum(v["knownAccepted"] - v["correct"] for v in options), -sum(v["unknownAccepted"] for v in options), tuple(v["threshold"] for v in options))
        for _ in range(20):
            choices = {}
            for label in KNOWN_CLASSES:
                options = []
                for index in range(3):
                    correct = int(rng.integers(1, 11))
                    options.append({"correct": correct, "knownAccepted": correct + int(rng.integers(0, 3)), "unknownAccepted": int(rng.integers(0, 4)), "coverage": Fraction(correct, 10), "threshold": index})
                choices[label] = options
            eligible = [p for p in itertools.product(*choices.values()) if sum(v["unknownAccepted"] for v in p) <= 5]
            actual = _optimize_class_rules(choices, 5)
            if eligible:
                self.assertEqual(key(actual[2]), key(max(eligible, key=key)))
            else:
                self.assertIsNone(actual)

    def test_guard_bounds_winner_margin_under_adversarial_one_quantum_perturbation(self):
        head = simple_head()
        q = np.zeros((1, 512), np.int64)
        q[0, 0] = INPUT_SCALE
        original = predict_fixed_v3(head, q, integer_input=True)
        W = np.asarray(head["weights"], np.int64)
        for rival in range(1, 6):
            perturbed = q - np.sign(W[0] - W[rival])
            actual = predict_fixed_v3(head, perturbed, integer_input=True)
            gap = int(actual["integerScores"][0, 0]) - int(actual["integerScores"][0, rival])
            self.assertGreaterEqual(gap, int(original["guardedMargin"][0]) + 1)
            self.assertEqual(actual["labels"][0], "buzz")


class V3DevelopmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = fixture()
        cls.report, cls.head, cls.manifest = fit(cls.inputs)

    def test_separable_fixture_fits_all_classes_and_is_still_unpromoted(self):
        self.assertFalse(self.report["promotionAllowed"])
        self.assertFalse(self.report["freshTestEvaluated"])
        self.assertTrue(self.report["calibration"]["allClassesEligible"])
        self.assertTrue(self.report["developmentAudit"]["developmentAuditPassed"])
        self.assertEqual(len(self.report["training"]["candidateGrid"]), 8)
        self.assertEqual(self.report["training"]["selected"], {"C": 0.01, "unknownWeight": 1.0})
        self.assertNotIn("referenceVectors", self.head)
        self.assertNotIn("trainingEmbeddings", self.head)
        self.assertEqual(len(self.head["weights"]), 6)
        self.assertEqual(self.head["classOrder"], [*KNOWN_CLASSES, UNKNOWN])

    def test_development_audit_mutation_cannot_change_fit_or_thresholds(self):
        changed = deepcopy(self.inputs)
        audit = np.char.endswith(changed["roles"], "audit")
        changed["X"][audit] = np.roll(changed["X"][audit], 1, axis=1)
        report, head, _ = fit(changed)
        for key in ["weights", "bias", "pairGuard", "rejectionRules"]:
            self.assertEqual(head[key], self.head[key])
        self.assertEqual(report["training"], self.report["training"])
        self.assertEqual(report["calibration"], self.report["calibration"])
        self.assertFalse(report["developmentAudit"]["developmentAuditPassed"])

    def test_calibration_mutation_cannot_change_model_weights(self):
        changed = deepcopy(self.inputs)
        calibration = np.char.endswith(changed["roles"], "calibration")
        changed["X"][calibration] = np.roll(changed["X"][calibration], 1, axis=1)
        report, head, _ = fit(changed)
        for key in ["weights", "bias", "pairGuard"]:
            self.assertEqual(head[key], self.head[key])
        self.assertEqual(report["training"], self.report["training"])
        self.assertFalse(report["calibration"]["allClassesEligible"])
        self.assertTrue(all(rule["abstainAll"] for rule in head["rejectionRules"].values()))

    def test_test_rows_cpu_contract_leakage_duplicates_and_mimii_are_rejected(self):
        for mutate in [lambda x: x["roles"].__setitem__(0, "test"), lambda x: x["embedding_contract"].__setitem__("canonicalBackend", "native-cpu"), lambda x: x["groups"].__setitem__(-1, x["groups"][0]), lambda x: x["clip_ids"].__setitem__(1, x["clip_ids"][0]), lambda x: x["pcm_sha256"].__setitem__(1, x["pcm_sha256"][0]), lambda x: x["datasets"].__setitem__(0, "MIMII")]:
            inputs = deepcopy(self.inputs)
            mutate(inputs)
            with tempfile.TemporaryDirectory() as root, self.assertRaises(ValueError):
                fit_research_v3(**inputs, output_dir=root)

    def test_one_starved_class_blocks_readiness_despite_perfect_precision(self):
        audit = np.char.endswith(self.inputs["roles"], "audit")
        p = predict_fixed_v3(self.head, self.inputs["X"][audit])
        p["accepted"][self.inputs["labels"][audit] == "traffic"] = False
        result = evaluate_readiness(p, self.inputs["labels"][audit], np.char.startswith(self.inputs["roles"][audit], "unknown_"), self.inputs["groups"][audit], self.inputs["datasets"][audit])
        self.assertEqual(result["knownSelectivePrecision"]["rate"], 1)
        self.assertFalse(result["developmentAuditPassed"])
        traffic = next(r for r in result["perClass"] if r["label"] == "traffic")
        self.assertEqual(traffic["correctAcceptedCoverage"]["successes"], 0)
        self.assertFalse(traffic["passed"])

    def test_wilson_unknown_gate_cannot_be_replaced_by_empirical_rate(self):
        audit = np.char.endswith(self.inputs["roles"], "audit")
        p = predict_fixed_v3(self.head, self.inputs["X"][audit])
        unknown = np.char.startswith(self.inputs["roles"][audit], "unknown_")
        indices = np.flatnonzero(unknown)[:2]
        p["labels"][indices] = "buzz"
        p["accepted"][indices] = True
        result = evaluate_readiness(p, self.inputs["labels"][audit], unknown, self.inputs["groups"][audit], self.inputs["datasets"][audit])
        self.assertEqual(result["unknownFalseAcceptance"]["rate"], 0.02)
        self.assertGreater(result["unknownFalseAcceptance"]["wilson95"][1], 0.05)
        self.assertFalse(result["developmentAuditPassed"])
        self.assertEqual(result["unknownAcceptedByLabel"]["buzz"], 2)
        self.assertLess(result["acceptedMixturePrecision"]["rate"], 1)

    def future_inputs(self):
        audit = np.char.endswith(self.inputs["roles"], "audit")
        n = int(audit.sum())
        return {"X": self.inputs["X"][audit], "labels": self.inputs["labels"][audit], "groups": ["fresh-" + g for g in self.inputs["groups"][audit]], "clip_ids": [f"future-{i}" for i in range(n)], "pcm_sha256": [hashlib.sha256(f"future-{i}".encode()).hexdigest() for i in range(n)], "datasets": self.inputs["datasets"][audit], "unknown": np.char.startswith(self.inputs["roles"][audit], "unknown_"), "embedding_contract": self.inputs["embedding_contract"], "development_manifest": self.manifest, "previously_inspected_groups": self.inputs["groups"], "previously_inspected_clip_ids": self.inputs["clip_ids"], "previously_inspected_pcm_sha256": self.inputs["pcm_sha256"]}

    def test_separate_future_api_binds_frozen_model_criteria_and_source(self):
        inputs = self.future_inputs()
        result = audit_frozen_v3(self.head, **inputs)
        self.assertTrue(result["freshFinalAuditPassed"])
        self.assertFalse(result["promotionAllowed"])
        for mutate in [lambda h: h["weights"][0].__setitem__(0, h["weights"][0][0] + 1), lambda h: h["provenance"].__setitem__("sourceSha256", "0" * 64)]:
            head = deepcopy(self.head)
            mutate(head)
            with self.assertRaises(ValueError):
                audit_frozen_v3(head, **inputs)
        with self.assertRaises(ValueError):
            audit_frozen_v3(self.head, **inputs, criteria=replace(DEFAULT_CRITERIA, min_known_per_class=1))

    def test_future_api_rejects_historical_groups_contract_or_manifest_changes(self):
        for mutate in [lambda i: i["groups"].__setitem__(0, self.inputs["groups"][0]), lambda i: i["clip_ids"].__setitem__(0, self.inputs["clip_ids"][0]), lambda i: i["pcm_sha256"].__setitem__(0, self.inputs["pcm_sha256"][0]), lambda i: i["embedding_contract"].__setitem__("runtimeFingerprintSha256", "0" * 64), lambda i: i["development_manifest"][0].__setitem__("label", "wrong"), lambda i: i.__setitem__("previously_inspected_groups", []), lambda i: i.__setitem__("previously_inspected_clip_ids", []), lambda i: i.__setitem__("previously_inspected_pcm_sha256", [])]:
            inputs = deepcopy(self.future_inputs())
            mutate(inputs)
            with self.assertRaises(ValueError):
                audit_frozen_v3(self.head, **inputs)

    def test_existing_fit_is_preserved_and_historical_hash_outside_development_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            existing = Path(root) / "research_head_v3.json"
            existing.write_text("preserve")
            with self.assertRaises(ValueError):
                fit_research_v3(**self.inputs, output_dir=root)
            self.assertEqual(existing.read_text(), "preserve")
        inputs = self.future_inputs()
        inputs["previously_inspected_pcm_sha256"] = [*inputs["previously_inspected_pcm_sha256"], inputs["pcm_sha256"][0]]
        with self.assertRaises(ValueError):
            audit_frozen_v3(self.head, **inputs)


if __name__ == "__main__":
    unittest.main()
