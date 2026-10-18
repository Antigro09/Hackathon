"""Independent sklearn references for the isolated experimental JS scorer.

Regenerate only synthetic fixtures: python -m ml.test_export_v2 --write-fixture
No public-data model, new cohort embedding, or held-out result is read here.
"""

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.utils.multiclass import _ovr_decision_function

from ml.experiment_v2 import _normalize, predict_research_artifact
from ml.export_v2 import export_research_head, write_head, main as export_main


FIXTURE = Path(__file__).resolve().parent / "browser/fixtures/reference.json"


def synthetic_cases():
    rng = np.random.default_rng(18042)
    classes = np.asarray(["buzz", "mechanical_fan", "speech", "traffic", "wind"])
    centers = np.linalg.qr(rng.normal(size=(8, 5)))[0].T
    X, y, groups = [], [], []
    for index, label in enumerate(classes):
        for unit in range(4):
            offset = rng.normal(0, 0.06, 8)
            for recording in range(3):
                X.append(centers[index] + offset + rng.normal(0, 0.14, 8))
                y.append(label)
                groups.append(f"synthetic-train-{label}-unit{unit}")
    X = np.asarray(X)
    X = _normalize((X / np.linalg.norm(X, axis=1)[:, None]).astype(np.float32))
    y = np.asarray(y)
    query = np.concatenate([centers + rng.normal(0, 0.05, centers.shape), rng.normal(size=(25, 8))])
    query = (query / np.linalg.norm(query, axis=1)[:, None]).astype(np.float32).astype(np.float64)
    results = []
    for kind in ("linear-five", "rbf-five", "linear-binary", "rbf-binary"):
        mask = np.isin(y, classes[:2]) if "binary" in kind else np.ones(len(y), dtype=bool)
        train_X, train_y = X[mask], y[mask]
        if kind.startswith("linear"):
            model = LogisticRegression(C=1, class_weight="balanced", solver="lbfgs", max_iter=3000, random_state=18042).fit(train_X, train_y)
        else:
            model = SVC(C=10, gamma=1.3, kernel="rbf", class_weight="balanced", probability=False,
                        decision_function_shape="ovr", break_ties=True, random_state=18042).fit(train_X, train_y)
        ordered = model.classes_.tolist()
        rules = {label: {"abstainAll": index == len(ordered) - 1, "minDecisionMargin": 0.1 if index % 2 == 0 else None,
                         "minTop3CosineAffinity": 0.3 if index % 2 == 0 else 0.5}
                 for index, label in enumerate(ordered)}
        artifact = {"formatVersion": 2, "promotionAllowed": False, "classifier": model,
                    "classOrder": ordered, "trainingEmbeddings": train_X, "trainingLabels": train_y,
                    "rejectionRules": rules, "manifestSha256": {"all": hashlib.sha256(kind.encode()).hexdigest()}}
        # These expected values come directly from fitted sklearn/libsvm and
        # the existing Python research inference, never the exported JS logic.
        reference = predict_research_artifact(artifact, query)
        expected = {"labels": reference["labels"].tolist(), "accepted": reference["accepted"].tolist(),
                    "decisionScores": reference["decisionScores"].tolist(), "decisionMargin": reference["decisionMargin"].tolist(),
                    "top3CosineAffinity": reference["top3CosineAffinity"].tolist(),
                    "pairwiseDecisions": model._decision_function(_normalize(query)).reshape(len(query), -1).tolist() if isinstance(model, SVC) else None}
        head = export_research_head(artifact, provenance={"fixture": "synthetic-only", "seed": 18042})
        results.append({"name": kind, "head": head, "queries": query.tolist(), "expected": expected,
                        "trainGroups": sorted(set(np.asarray(groups)[mask])),
                        "queryGroups": [f"synthetic-unseen-query-{i}" for i in range(len(query))]})
    pairwise = []
    # A regular five-class tournament has two votes each and exactly zero net
    # signed confidence. The first index must win this true OVR score tie.
    cyclic = [1.0 if (j - i) % 5 in (1, 2) else -1.0 for i in range(5) for j in range(i + 1, 5)]
    variants = [cyclic, [0.0] * 10, [value * 1e-12 for value in cyclic]]
    perturbed = cyclic.copy()
    perturbed[0] = 2.0
    variants.append(perturbed)
    variants.extend(rng.normal(size=(8, 10)).tolist())
    for index, values in enumerate(variants):
        raw = np.asarray(values)[None, :]
        scores = _ovr_decision_function(raw < 0, -raw, 5)[0]
        pairwise.append({"name": ["exact-five-way-tie", "all-zero-pairs", "tiny-pair-margins", "votes-tied-confidence-break"][index] if index < 4 else f"random-{index}",
                         "pairwise": values, "scores": scores.tolist(), "argmax": int(np.argmax(scores))})
    return {"source": "Synthetic grouped fixtures; sklearn1.7.2 direct estimator/libsvm and _ovr_decision_function references",
            "seed": 18042, "numericTolerance": 1e-9, "cases": results, "pairwiseCases": pairwise}


def write_fixture():
    value = synthetic_cases()
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print(FIXTURE)


class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = synthetic_cases()

    def test_balanced_five_class_and_binary_heads_keep_class_and_reference_contract(self):
        for case in self.fixtures["cases"]:
            head = case["head"]
            self.assertFalse(head["promotionAllowed"])
            self.assertFalse(head["browserParityReviewed"])
            self.assertFalse(head["downstreamModelLicenseReviewed"])
            self.assertEqual(head["topK"], 3)
            self.assertEqual(len(head["referenceVectors"]), len(head["referenceClassIndices"]))
            self.assertTrue(set(case["expected"]["accepted"]) == {False, True})
            self.assertFalse(set(case["trainGroups"]) & set(case["queryGroups"]))
            self.assertEqual(head, json.loads(json.dumps(head, allow_nan=False)))

    def test_rbf_exports_pair_blocks_not_independent_class_weights(self):
        head = next(case["head"] for case in self.fixtures["cases"] if case["name"] == "rbf-five")
        model = head["classifier"]
        self.assertEqual(len(model["dualCoefficients"]), 4)
        self.assertEqual(len(model["intercept"]), 10)
        self.assertEqual(sum(model["nSupport"]), len(model["supportVectors"]))
        self.assertNotIn("weights", model)

    def test_true_five_way_ovr_tie_uses_first_class(self):
        case = self.fixtures["pairwiseCases"][0]
        self.assertEqual(case["scores"], [2.0] * 5)
        self.assertEqual(case["argmax"], 0)

    def test_deterministic_json_and_digest_sidecar(self):
        head = self.fixtures["cases"][0]["head"]
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder) / "a.json", Path(folder) / "b.json"
            write_head(a, head)
            write_head(b, head)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            self.assertEqual(a.with_suffix(".json.sha256").read_text().strip(), hashlib.sha256(a.read_bytes()).hexdigest())

    def artifact(self):
        head = self.fixtures["cases"][0]["head"]
        X = np.asarray(head["referenceVectors"])
        y = np.asarray([head["classOrder"][index] for index in head["referenceClassIndices"]])
        model = LogisticRegression(class_weight="balanced", max_iter=3000).fit(X, y)
        return {"formatVersion": 2, "promotionAllowed": False, "classifier": model, "classOrder": model.classes_.tolist(),
                "trainingEmbeddings": X, "trainingLabels": y, "rejectionRules": head["rejectionRules"]}

    def test_rejects_class_order_reference_and_gate_contract_changes(self):
        artifact = self.artifact()
        with self.assertRaisesRegex(ValueError, "class order"):
            export_research_head({**artifact, "classOrder": list(reversed(artifact["classOrder"]))})
        with self.assertRaisesRegex(ValueError, "normalized"):
            export_research_head({**artifact, "trainingEmbeddings": artifact["trainingEmbeddings"] * 2})
        with self.assertRaisesRegex(ValueError, "incomplete"):
            export_research_head({**artifact, "rejectionRules": {}})

    def test_rejects_unpinned_backend_and_unsupported_classifier_settings(self):
        artifact = self.artifact()
        with patch("ml.export_v2.importlib.metadata.version", return_value="1.8.0"), self.assertRaisesRegex(ValueError, "pinned"):
            export_research_head(artifact)
        artifact["classifier"].class_weight = None
        with self.assertRaisesRegex(ValueError, "balanced"):
            export_research_head(artifact)
        model = SVC(kernel="linear", class_weight="balanced", decision_function_shape="ovr", break_ties=True).fit(artifact["trainingEmbeddings"], artifact["trainingLabels"])
        with self.assertRaisesRegex(ValueError, "dense RBF"):
            export_research_head({**artifact, "classifier": model})

    def bound_cli_fixture(self, root):
        model = root / "classifier_v2.joblib"
        joblib.dump(self.artifact(), model)
        scoring = Path(__file__).parent / "experiment_v2.py"
        contract = {"fit_runtime": {"packages": {"scikit-learn": "1.7.2"}},
                    "manifest_sha256": hashlib.sha256(b"synthetic-manifest").hexdigest(),
                    "encoder_contract": {"syntheticOnly": True},
                    "sources_sha256": {"ml/experiment_v2.py": hashlib.sha256(scoring.read_bytes()).hexdigest()}}
        frozen = root / "fit_input_contract.json"
        frozen.write_text(json.dumps(contract), encoding="utf-8")
        environment = {**contract, "source_commit": "synthetic-fixture-only",
                       "fit_input_contract_sha256": hashlib.sha256(frozen.read_bytes()).hexdigest(),
                       "fit_artifacts_sha256": {"results/classifier_v2.joblib": hashlib.sha256(model.read_bytes()).hexdigest()}}
        environment_path = root / "run_environment.json"
        environment_path.write_text(json.dumps(environment), encoding="utf-8")
        output = root / "head.json"
        argv = ["ml.export_v2", "--model", str(model), "--environment", str(environment_path), "--output", str(output)]
        return model, environment_path, frozen, output, argv

    def test_cli_verifies_run_binding_and_exports_the_bound_model(self):
        with tempfile.TemporaryDirectory() as folder:
            model, environment, contract, output, argv = self.bound_cli_fixture(Path(folder))
            with patch.object(sys, "argv", argv):
                export_main()
            head = json.loads(output.read_text(encoding="utf-8"))
            self.assertTrue(head["provenance"]["completionModelBindingVerified"])
            self.assertTrue(head["provenance"]["frozenScoringSourceBindingVerified"])
            self.assertEqual(head["provenance"]["sourceModelFileSha256"], hashlib.sha256(model.read_bytes()).hexdigest())
            self.assertEqual(head["provenance"]["sourceEnvironmentSha256"], hashlib.sha256(environment.read_bytes()).hexdigest())
            self.assertEqual(head["provenance"]["sourceFitInputContractSha256"], hashlib.sha256(contract.read_bytes()).hexdigest())

    def test_cli_refuses_swapped_model_environment_or_contract_before_pickle_load(self):
        for change in ("model", "environment", "contract", "missing-contract", "scoring-source", "fit-runtime", "encoder-contract", "manifest-contract"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as folder:
                model, environment, contract, output, argv = self.bound_cli_fixture(Path(folder))
                if change == "model":
                    swapped = self.artifact()
                    swapped["classifier"].set_params(C=2).fit(swapped["trainingEmbeddings"], swapped["trainingLabels"])
                    joblib.dump(swapped, model)
                elif change == "environment":
                    data = json.loads(environment.read_text(encoding="utf-8"))
                    data["fit_artifacts_sha256"]["results/classifier_v2.joblib"] = "0" * 64
                    environment.write_text(json.dumps(data), encoding="utf-8")
                elif change in {"encoder-contract", "manifest-contract"}:
                    data = json.loads(environment.read_text(encoding="utf-8"))
                    key = "encoder_contract" if change == "encoder-contract" else "manifest_sha256"
                    data[key] = {"otherEncoder": True} if key == "encoder_contract" else "0" * 64
                    environment.write_text(json.dumps(data), encoding="utf-8")
                elif change == "contract":
                    contract.write_bytes(contract.read_bytes() + b" ")
                elif change == "missing-contract":
                    contract.unlink()
                else:
                    data = json.loads(contract.read_text(encoding="utf-8"))
                    if change == "scoring-source":
                        data["sources_sha256"]["ml/experiment_v2.py"] = "0" * 64
                    else:
                        data["fit_runtime"]["packages"]["scikit-learn"] = "1.8.0"
                    contract.write_text(json.dumps(data), encoding="utf-8")
                    completed = json.loads(environment.read_text(encoding="utf-8"))
                    completed["fit_input_contract_sha256"] = hashlib.sha256(contract.read_bytes()).hexdigest()
                    if change == "fit-runtime":
                        completed["fit_runtime"] = data["fit_runtime"]
                    environment.write_text(json.dumps(completed), encoding="utf-8")
                with patch.object(sys, "argv", argv), patch("ml.export_v2.joblib.load") as load:
                    with self.assertRaises(ValueError):
                        export_main()
                    load.assert_not_called()
                self.assertFalse(output.exists())


if __name__ == "__main__":
    if sys.argv[1:] == ["--write-fixture"]:
        write_fixture()
    else:
        unittest.main()
