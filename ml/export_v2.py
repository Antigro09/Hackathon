"""Export a trusted v2 research classifier; never promote or evaluate real data.

JSON preserves binary64 parameters, dense RBF support-vector class blocks,
libsvm pair coefficients/intercepts, sklearn1.7.2 OvO→OvR voting, and the exact
top-three reference/gate contract. JavaScript Math.exp/BLAS roundoff can differ
at boundaries: synthetic parity does not establish browser/field validation.
Source derivations: pinned sklearn1.7.2 svm/_base.py, svm/src/libsvm/svm.cpp,
utils/multiclass.py. This reimplements the scoring formulas, not libsvm fitting.
Only load this project's own trusted joblib files: loading a pickle executes
Python object reconstruction. No raw data, model upload, or app integration.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import io
import json
from pathlib import Path
import platform

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC

from ml.experiment import _linear_parameters


REQUIRED_SKLEARN = "1.7.2"
SOURCES = [f"https://github.com/scikit-learn/scikit-learn/blob/{REQUIRED_SKLEARN}/sklearn/{path}"
           for path in ("svm/_base.py", "svm/src/libsvm/svm.cpp", "utils/multiclass.py")]


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _matrix(values, shape=None):
    result = np.asarray(values, dtype=np.float64)
    if result.ndim != 2 or not np.isfinite(result).all() or (shape is not None and result.shape != shape):
        raise ValueError("Invalid fitted model matrix")
    return result


def export_research_head(artifact: dict, *, provenance: dict | None = None,
                         model_file_sha256: str | None = None) -> dict:
    """Serialize a fitted linear/RBF head without making predictions or fitting.

    The JSON is suitable for independent research scoring comparisons. Its
    promotion, browser-validation and downstream-license flags remain false.
    """
    if importlib.metadata.version("scikit-learn") != REQUIRED_SKLEARN:
        raise ValueError("Export requires the pinned sklearn1.7.2 backend")
    if artifact.get("promotionAllowed") is not False or artifact.get("formatVersion") != 2:
        raise ValueError("Expected an unpromoted formatVersion2 research artifact")
    model = artifact["classifier"]
    classes = artifact["classOrder"]
    if len(classes) < 2 or len(set(classes)) != len(classes) or any(not isinstance(c, str) or not c for c in classes):
        raise ValueError("Invalid class order")
    if model.classes_.tolist() != classes:
        raise ValueError("Fitted classifier class order differs from the gate/reference contract")
    dimension = int(model.n_features_in_)
    references = _matrix(artifact["trainingEmbeddings"])
    labels = np.asarray(artifact["trainingLabels"])
    if references.shape[1] != dimension or labels.shape != (len(references),):
        raise ValueError("Reference vector/label dimensions differ")
    if not np.allclose(np.linalg.norm(references, axis=1), 1, atol=2e-4, rtol=0):
        raise ValueError("Reference vectors must already be L2-normalized")
    if set(labels) != set(classes) or any(np.sum(labels == c) < 3 for c in classes):
        raise ValueError("Each class needs at least three reference vectors")
    rules = artifact["rejectionRules"]
    if set(rules) != set(classes):
        raise ValueError("Class rejection rules are incomplete")
    for rule in rules.values():
        if set(rule) != {"abstainAll", "minDecisionMargin", "minTop3CosineAffinity"} or not isinstance(rule["abstainAll"], bool):
            raise ValueError("Unsupported rejection rule")
        for key in ("minDecisionMargin", "minTop3CosineAffinity"):
            if rule[key] is not None and (isinstance(rule[key], bool) or not np.isfinite(rule[key])):
                raise ValueError("Nonfinite rejection threshold")
    if model.get_params().get("class_weight") != "balanced":
        raise ValueError("Expected the balanced research classifier")
    if isinstance(model, LogisticRegression):
        weights, intercept = _linear_parameters(model)
        classifier = {"kind": "logistic-regression", "weights": _matrix(weights, (len(classes), dimension)).tolist(),
                      "intercept": np.asarray(intercept, dtype=float).tolist(),
                      "binaryScores": "[-decision,+decision]" if len(classes) == 2 else None}
    elif isinstance(model, SVC):
        if model.kernel != "rbf" or model.decision_function_shape != "ovr" or not model.break_ties or model.probability or model._sparse:
            raise ValueError("Only dense RBF-SVC with OVR/break_ties=True/probability=False is supported")
        vectors = _matrix(model.support_vectors_)
        classifier = {"kind": "rbf-svc", "supportVectors": vectors.tolist(),
                      "dualCoefficients": _matrix(model.dual_coef_, (len(classes) - 1, len(vectors))).tolist(),
                      "intercept": np.asarray(model.intercept_, dtype=float).tolist(),
                      "nSupport": model.n_support_.astype(int).tolist(), "gamma": float(model._gamma),
                      "binaryPublicCoefficientSign": "positive decision means classOrder[1]",
                      "multiclassPairOrder": "i=0..K-1,j=i+1..K-1; positive pair decision favors i; zero pair votes for i"}
    else:
        raise ValueError("Unsupported classifier; only LogisticRegression or RBF-SVC is exported")
    if not np.isfinite(classifier["intercept"]).all():
        raise ValueError("Nonfinite fitted intercept")
    parameters_sha = _sha(json.dumps(classifier, sort_keys=True, separators=(",", ":"), allow_nan=False).encode())
    result = {"formatVersion": 1, "experimental": True, "promotionAllowed": False,
              "browserParityReviewed": False, "fieldValidationEstablished": False,
              "downstreamModelLicenseReviewed": False, "classOrder": classes, "dimension": dimension,
              "normalization": {"inputL2Tolerance": 2e-4, "method": "validate L2 then renormalize in binary64"},
              "classifier": classifier, "referenceVectors": references.tolist(),
              "referenceClassIndices": [classes.index(str(label)) for label in labels],
              "topK": 3, "rejectionRules": rules,
              "scoring": {"argmaxTie": "first classOrder index", "thresholdComparison": ">=",
                          "svcOvr": "votes + signedPairSum/(3*(abs(signedPairSum)+1))",
                          "affinity": "mean top3 clipped cosine dot products to predicted-class training references",
                          "numericBoundaryTolerance": 1e-9, "probabilities": False},
              "backend": {"sklearn": REQUIRED_SKLEARN, "numpy": np.__version__, "exportPython": platform.python_version(),
                          "javascript": "IEEE754binary64; Math.exp/reduction roundoff may differ near pair/rank/gate boundaries"},
              "provenance": {**(provenance or {}), "sourceModelFileSha256": model_file_sha256,
                             "classifierParametersSha256": parameters_sha,
                             "exporterSourceSha256": _sha(Path(__file__).read_bytes()),
                             "researchScoringSourceSha256": _sha((Path(__file__).parent / "experiment_v2.py").read_bytes()),
                             "javascriptScorerSourceSha256": _sha((Path(__file__).parent / "browser/experimentalHead.ts").read_bytes()),
                             "manifestSha256": artifact.get("manifestSha256"), "algorithmSources": SOURCES},
              "limitations": ["Research scoring export only; no live app import, promotion or source-confidence claim.",
                              "Synthetic JS/Python scoring agreement does not establish full audio/model/browser parity.",
                              "Near numerical boundaries, tiny backend errors can change votes, ranks or gate bits; numericBoundary flags such cases.",
                              "Training reference vectors are part of the gate and derived-data licensing remains unreviewed."]}
    # Final serialization rejects any accidental NumPy object or nonfinite value.
    json.dumps(result, allow_nan=False)
    return result


def write_head(path: str | Path, head: dict):
    raw = (json.dumps(head, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(raw)
    destination.with_suffix(destination.suffix + ".sha256").write_text(_sha(raw) + "\n", encoding="ascii")


def export_bound_run(model_path: Path, environment_path: Path, output_path: Path) -> dict:
    """Verify the run completion chain before reconstructing any model object.

    Read model/environment/contract once, bind those exact bytes, and unpickle
    only the verified in-memory model bytes. The sibling contract location is
    the runner's output layout, including when the result bundle is extracted.
    """
    environment_raw = environment_path.read_bytes()
    environment = json.loads(environment_raw.decode("utf-8"))
    model_raw = model_path.read_bytes()
    artifacts = environment.get("fit_artifacts_sha256", {})
    expected_model_sha = artifacts.get("results/classifier_v2.joblib") if isinstance(artifacts, dict) else None
    model_sha = _sha(model_raw)
    if expected_model_sha != model_sha:
        raise ValueError("Model SHA256 does not match the supplied run completion environment")
    contract_path = environment_path.parent / "fit_input_contract.json"
    if not contract_path.is_file():
        raise ValueError("Missing sibling fit_input_contract.json; cannot bind the completed run")
    contract_raw = contract_path.read_bytes()
    contract_sha = _sha(contract_raw)
    if environment.get("fit_input_contract_sha256") != contract_sha:
        raise ValueError("Frozen fit input contract SHA256 differs from the run completion environment")
    contract = json.loads(contract_raw.decode("utf-8"))
    for key in ("fit_runtime", "manifest_sha256", "encoder_contract"):
        if key not in contract or environment.get(key) != contract[key]:
            raise ValueError(f"Completion environment differs from the frozen {key} contract")
    backend = contract["fit_runtime"].get("packages", {})
    if backend.get("scikit-learn") != REQUIRED_SKLEARN or importlib.metadata.version("scikit-learn") != REQUIRED_SKLEARN:
        raise ValueError("Training and export must confirm the pinned sklearn1.7.2 backend")
    local_scoring_sha = _sha((Path(__file__).parent / "experiment_v2.py").read_bytes())
    if contract.get("sources_sha256", {}).get("ml/experiment_v2.py") != local_scoring_sha:
        raise ValueError("Frozen research scoring source differs from this exporter checkout")
    provenance = {key: environment.get(key) for key in ("source_commit", "data_preparation_source_commit", "manifest_sha256", "encoder_contract", "fit_runtime")}
    provenance.update({"sourceEnvironmentSha256": _sha(environment_raw), "sourceFitInputContractSha256": contract_sha,
                       "completionModelBindingVerified": True, "frozenScoringSourceBindingVerified": True})
    head = export_research_head(joblib.load(io.BytesIO(model_raw)), provenance=provenance, model_file_sha256=model_sha)
    write_head(output_path, head)
    return head


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, type=Path, help="This project's own trusted classifier_v2.joblib")
    parser.add_argument("--environment", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    head = export_bound_run(args.model, args.environment, args.output)
    print(f"Experimental head exported ({head['classifier']['kind']}); promotionAllowed=false: {args.output}")


if __name__ == "__main__":
    main()
