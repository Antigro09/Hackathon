"""Experimental frozen-embedding model selection and class-specific rejection.

Every learned choice uses training or validation only. The held-out test set is
evaluated after those choices are frozen. This exports a Python research model,
not a browser-ready model, calibrated source confidence, or a field guarantee.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Sequence

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.svm import SVC

from ml.experiment import (
    SPLITS,
    _check_disjoint,
    _classification,
    _linear_parameters,
    _manifest_hash,
    _strings,
    _wilson,
)


LINEAR_C = (0.01, 0.1, 1.0, 10.0)
RBF_C = (1.0, 10.0, 100.0)
RBF_GAMMA = ("scale", 1.0, 2.0)
MAX_CLASS_OOD_RATE = 0.02
MAX_TOTAL_OOD_RATE = 0.10
MIN_CORRECT_CLASS_COVERAGE = 0.20
MIN_KNOWN_PRECISION = 0.80
TOP_K = 3


def _normalize(X: np.ndarray) -> np.ndarray:
    X = np.asarray(X, dtype=np.float64)
    if X.ndim != 2 or X.shape[0] < 1 or X.shape[1] < 2 or not np.isfinite(X).all():
        raise ValueError("X must be finite N by D embeddings with N >= 1 and D >= 2")
    norms = np.linalg.norm(X, axis=1)
    if not np.allclose(norms, 1, atol=2e-4, rtol=0):
        raise ValueError("Every embedding must already be L2-normalized")
    return X / norms[:, None]


def _configurations() -> list[dict[str, Any]]:
    # This order is also the deterministic complexity preference for exact ties.
    return [
        *[{"kind": "linear", "C": c} for c in LINEAR_C],
        *[{"kind": "rbf-svc", "C": c, "gamma": gamma} for c in RBF_C for gamma in RBF_GAMMA],
    ]


def _classifier(configuration: dict[str, Any], seed: int):
    if configuration["kind"] == "linear":
        return LogisticRegression(C=configuration["C"], max_iter=3000, solver="lbfgs", class_weight="balanced", random_state=seed)
    return SVC(
        C=configuration["C"], kernel="rbf", gamma=configuration["gamma"],
        class_weight="balanced", decision_function_shape="ovr", break_ties=True,
        probability=False, cache_size=256, random_state=seed,
    )


def decision_scores(model, X: np.ndarray) -> np.ndarray:
    """Exact research scoring contract; binary ties use classOrder[0].

    For SVC, these are sklearn's OVR decision scores derived from OVO margins,
    not class probabilities or calibrated confidence. Do not recreate them by
    treating the stored dual coefficients as independent multiclass weights.
    """
    scores = np.asarray(model.decision_function(X), dtype=np.float64)
    if scores.ndim == 1:
        scores = np.column_stack((-scores, scores))
    if scores.shape != (len(X), len(model.classes_)) or not np.isfinite(scores).all():
        raise ValueError("The classifier returned invalid decision scores")
    return scores


def _affinity(X: np.ndarray, predicted: np.ndarray, train_X: np.ndarray, train_y: np.ndarray, classes: np.ndarray) -> np.ndarray:
    affinity = np.empty(len(X), dtype=np.float64)
    for index, label in enumerate(classes):
        mask = predicted == index
        if not mask.any():
            continue
        positives = train_X[train_y == label]
        if len(positives) < TOP_K:
            raise ValueError("Top-three affinity needs at least three training clips in every class")
        cosine = np.clip(X[mask] @ positives.T, -1.0, 1.0)
        nearest = np.partition(cosine, cosine.shape[1] - TOP_K, axis=1)[:, -TOP_K:]
        affinity[mask] = np.mean(nearest, axis=1)
    return affinity


def _candidates(values: np.ndarray, unknown_values: np.ndarray, ood_count_budget: int) -> list[float | None]:
    unique = np.unique(values)
    if len(unique) > 12:
        unique = np.unique(np.quantile(unique, np.linspace(0, 1, 12), method="nearest"))
    if not len(unique):
        return [None]
    if len(unknown_values):
        ordered_unknown = np.sort(unknown_values)
        # Include the unknown boundary and its immediate successor. Otherwise a
        # wide empty gap can force a threshold onto the weakest known example,
        # needlessly excluding new known recordings with tiny rounding/noise.
        budget_boundary = ordered_unknown[max(0, len(ordered_unknown) - ood_count_budget - 1)]
        unique = np.unique(np.r_[unique, ordered_unknown[-1], budget_boundary])
    numeric = np.unique(np.r_[unique, np.nextafter(unique, np.inf)])
    # <=12 quantile values + two OOD boundaries, each with successor: <=29.
    return [None, *map(float, numeric)]


def _rule_accept(margin: np.ndarray, affinity: np.ndarray, rule: dict[str, Any]) -> np.ndarray:
    accepted = np.zeros(len(margin), dtype=bool) if rule["abstainAll"] else np.ones(len(margin), dtype=bool)
    if rule["minDecisionMargin"] is not None:
        accepted &= margin >= rule["minDecisionMargin"]
    if rule["minTop3CosineAffinity"] is not None:
        accepted &= affinity >= rule["minTop3CosineAffinity"]
    return accepted


def _choose_class_rules(
    predicted: np.ndarray, margin: np.ndarray, affinity: np.ndarray,
    y: np.ndarray, splits: np.ndarray, classes: np.ndarray,
) -> tuple[dict[str, Any], dict[str, Any]]:
    ood_total = int(np.sum(splits == "ood_val"))
    rate_budget = min(MAX_CLASS_OOD_RATE, MAX_TOTAL_OOD_RATE / len(classes))
    count_budget = math.floor(rate_budget * ood_total + 1e-12)
    rules: dict[str, Any] = {}
    selections: dict[str, Any] = {}
    for index, label in enumerate(classes):
        known = (splits == "val") & (predicted == index)
        unknown = (splits == "ood_val") & (predicted == index)
        calibration = known | unknown
        true_class_total = int(np.sum((splits == "val") & (y == label)))
        selected = {"abstainAll": True, "minDecisionMargin": None, "minTop3CosineAffinity": None}
        best = None
        eligible = 0
        tried = 0
        if true_class_total and np.any(known):
            for min_margin in _candidates(margin[calibration], margin[unknown], count_budget):
                for min_affinity in _candidates(affinity[calibration], affinity[unknown], count_budget):
                    tried += 1
                    rule = {"abstainAll": False, "minDecisionMargin": min_margin, "minTop3CosineAffinity": min_affinity}
                    accepted_known = _rule_accept(margin[known], affinity[known], rule)
                    accepted_unknown = _rule_accept(margin[unknown], affinity[unknown], rule)
                    known_count = int(np.sum(accepted_known))
                    correct_count = int(np.sum((y[known] == label) & accepted_known))
                    unknown_count = int(np.sum(accepted_unknown))
                    correct_coverage = correct_count / true_class_total
                    precision = correct_count / known_count if known_count else 0.0
                    if unknown_count > count_budget or correct_coverage + 1e-12 < MIN_CORRECT_CLASS_COVERAGE or precision + 1e-12 < MIN_KNOWN_PRECISION:
                        continue
                    eligible += 1
                    key = (correct_count, known_count, precision, -unknown_count)
                    if best is None or key > best:
                        best, selected = key, rule
        rules[str(label)] = selected
        if not true_class_total:
            reason = "no_true_class_validation_samples"
        elif not np.any(known):
            reason = "no_known_validation_predictions_for_class"
        elif best is None:
            reason = "no_rule_meets_class_validation_constraints"
        else:
            reason = "class_validation_sample_constraints_met"
        accepted_known = _rule_accept(margin[known], affinity[known], selected)
        accepted_unknown = _rule_accept(margin[unknown], affinity[unknown], selected)
        accepted_correct = int(np.sum((y[known] == label) & accepted_known))
        selections[str(label)] = {
            "eligible": best is not None, "reason": reason,
            "candidateCount": tried, "eligibleCandidateCount": eligible,
            "trueClassValidationCount": true_class_total,
            "correctTrueClassCoverage": _wilson(accepted_correct, true_class_total),
            "precisionAmongAcceptedKnownPredictions": _wilson(accepted_correct, int(np.sum(accepted_known))),
            "acceptedOodValidationCount": int(np.sum(accepted_unknown)),
            "maxAcceptedOodValidationCount": count_budget,
        }
    passed = all(value["eligible"] for value in selections.values())
    return rules, {
        "allClassGatesPassed": passed,
        "selectionSplits": ["val", "ood_val"],
        "classes": selections,
        "constraints": {
            "maxClassFractionOfTotalOodValidation": rate_budget,
            "maxTotalOodValidationFalseAcceptance": MAX_TOTAL_OOD_RATE,
            "oodValidationCount": ood_total,
            "maxOodValidationCountPerClass": count_budget,
            "minCorrectTrueClassValidationCoverage": MIN_CORRECT_CLASS_COVERAGE,
            "minPrecisionAmongAcceptedKnownPredictions": MIN_KNOWN_PRECISION,
        },
        "limitation": "Empirical validation-sample constraints; threshold-selection uncertainty and field-domain shift remain unmeasured.",
    }


def _apply_rules(predicted: np.ndarray, margin: np.ndarray, affinity: np.ndarray, classes: np.ndarray, rules: dict[str, Any]) -> np.ndarray:
    accepted = np.zeros(len(predicted), dtype=bool)
    for index, label in enumerate(classes):
        mask = predicted == index
        accepted[mask] = _rule_accept(margin[mask], affinity[mask], rules[str(label)])
    return accepted


def predict_research_artifact(artifact: dict[str, Any], X: np.ndarray) -> dict[str, np.ndarray]:
    """Reproduce the saved Python-only artifact, including class-specific gates."""
    X = _normalize(X)
    scores = decision_scores(artifact["classifier"], X)
    predicted = np.argmax(scores, axis=1)
    ordered = np.sort(scores, axis=1)
    margin = ordered[:, -1] - ordered[:, -2]
    classes = np.asarray(artifact["classOrder"])
    affinity = _affinity(X, predicted, artifact["trainingEmbeddings"], artifact["trainingLabels"], classes)
    accepted = _apply_rules(predicted, margin, affinity, classes, artifact["rejectionRules"])
    return {"labels": classes[predicted], "accepted": accepted, "decisionScores": scores, "decisionMargin": margin, "top3CosineAffinity": affinity}


def _evaluate(predictions: np.ndarray, accepted: np.ndarray, y: np.ndarray, splits: np.ndarray, classes: np.ndarray) -> dict[str, Any]:
    evaluation: dict[str, Any] = {}
    for name in ("val", "test"):
        mask = splits == name
        selected = mask & accepted
        correct_selected = selected & (predictions == y)
        evaluation[name] = {
            "ungated": _classification(y[mask], predictions[mask], classes),
            "acceptedOnly": _classification(y[selected], predictions[selected], classes),
            "coverage": _wilson(int(np.sum(selected)), int(np.sum(mask))),
            "selectiveAccuracy": _wilson(int(np.sum(correct_selected)), int(np.sum(selected))),
            "correctAcceptedPerKnownClip": _wilson(int(np.sum(correct_selected)), int(np.sum(mask))),
            "rejectedCount": int(np.sum(mask & ~accepted)),
            "perClass": [
                {
                    "label": str(label),
                    "coverage": _wilson(int(np.sum(selected & (y == label))), int(np.sum(mask & (y == label)))),
                    "correctTrueClassCoverage": _wilson(int(np.sum(correct_selected & (y == label))), int(np.sum(mask & (y == label)))),
                    "precisionAmongAcceptedKnownPredictions": _wilson(int(np.sum(correct_selected & (predictions == label))), int(np.sum(selected & (predictions == label)))),
                }
                for label in classes
            ],
        }
    for name in ("ood_val", "ood_test"):
        mask = splits == name
        evaluation[name] = {
            "falseAcceptance": _wilson(int(np.sum(mask & accepted)), int(np.sum(mask))),
            "acceptedByLabel": {str(label): int(np.sum(mask & accepted & (predictions == label))) for label in classes},
            "perClassFalseAcceptance": {str(label): _wilson(int(np.sum(mask & accepted & (predictions == label))), int(np.sum(mask))) for label in classes},
            "rejectedCount": int(np.sum(mask & ~accepted)),
        }
    return evaluation


def run_experiment_v2(
    X: np.ndarray, labels: Sequence[str], split: Sequence[str], groups: Sequence[str],
    output_dir: str | Path, random_seed: int = 804, *,
    clip_ids: Sequence[str] | None = None, sha256: Sequence[str] | None = None,
    previously_evaluated_groups: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Select a frozen-encoder classifier on train CV, gate on val, test once.

    Supply uploaders from earlier inspected known/unknown test sets through
    previously_evaluated_groups to enforce a fresh holdout. Old test rows may
    inform explicitly declared development data, but cannot be a new holdout.
    """
    X = _normalize(X)
    y = _strings(labels, "labels", len(X))
    splits = _strings(split, "split", len(X))
    uploader = _strings(groups, "groups", len(X))
    ids = _strings(clip_ids, "clip_ids", len(X)) if clip_ids is not None else None
    hashes = _strings(sha256, "sha256", len(X)) if sha256 is not None else None
    if set(splits) != set(SPLITS):
        raise ValueError(f"Require nonempty splits {SPLITS}")
    _check_disjoint(uploader, splits, "uploader")
    if ids is not None:
        _check_disjoint(ids, splits, "clip_id")
    if hashes is not None:
        if any(len(value) != 64 or any(c not in "0123456789abcdef" for c in value.lower()) for value in hashes):
            raise ValueError("sha256 values must contain 64 hexadecimal characters")
        hashes = np.char.lower(hashes)
        _check_disjoint(hashes, splits, "content SHA-256")
    previously_seen = None
    if previously_evaluated_groups is not None:
        previously_seen = _strings(previously_evaluated_groups, "previously_evaluated_groups", len(previously_evaluated_groups))
        holdout = np.isin(splits, ["test", "ood_test"])
        if set(previously_seen) & set(uploader[holdout]):
            raise ValueError("A previously evaluated uploader overlaps the new held-out test set")

    train = splits == "train"
    classes = np.unique(y[train])
    if len(classes) < 2:
        raise ValueError("Training needs at least two known classes")
    known = np.isin(splits, ["train", "val", "test"])
    if not set(y[known]).issubset(set(classes)):
        raise ValueError("Known validation/test labels must occur in training")
    if set(y[~known]) & set(classes):
        raise ValueError("OOD labels cannot be training classes")
    clip_counts = {str(label): int(np.sum(train & (y == label))) for label in classes}
    group_counts = {str(label): len(np.unique(uploader[train & (y == label)])) for label in classes}
    if min(clip_counts.values()) < TOP_K:
        raise ValueError("Top-three affinity needs at least three training clips per class")
    folds = min(5, min(group_counts.values()))
    if folds < 2:
        raise ValueError("Group CV needs at least two independent training uploaders per class")
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=random_seed)
    fold_indices = list(splitter.split(X[train], y[train], uploader[train]))
    for fit, validation in fold_indices:
        if set(y[train][fit]) != set(classes):
            raise ValueError("A training group-CV fold lacks a class; collect more independent uploaders")
        if set(uploader[train][fit]) & set(uploader[train][validation]):
            raise AssertionError("Unexpected uploader leakage in training CV")
    cv_results = []
    selected_configuration = None
    best_score = -math.inf
    for configuration in _configurations():
        fold_scores = []
        for fit, validation in fold_indices:
            candidate = _classifier(configuration, random_seed)
            candidate.fit(X[train][fit], y[train][fit])
            prediction = candidate.classes_[np.argmax(decision_scores(candidate, X[train][validation]), axis=1)]
            fold_scores.append(float(f1_score(y[train][validation], prediction, labels=classes, average="macro", zero_division=0)))
        mean_score = float(np.mean(fold_scores))
        cv_results.append({**configuration, "foldMacroF1": fold_scores, "meanMacroF1": mean_score})
        # First configuration wins an exact tie: linear, then lower C, then the
        # listed gamma order. No validation/test score selects this model.
        if mean_score > best_score + 1e-12:
            best_score, selected_configuration = mean_score, configuration.copy()
    model = _classifier(selected_configuration, random_seed)
    model.fit(X[train], y[train])
    scores = decision_scores(model, X)
    predicted = np.argmax(scores, axis=1)
    ordered = np.sort(scores, axis=1)
    margin = ordered[:, -1] - ordered[:, -2]
    affinity = _affinity(X, predicted, X[train], y[train], classes)
    rules, selection = _choose_class_rules(predicted, margin, affinity, y, splits, classes)
    accepted = _apply_rules(predicted, margin, affinity, classes, rules)
    evaluation = _evaluate(classes[predicted], accepted, y, splits, classes)
    if evaluation["ood_val"]["falseAcceptance"]["rate"] > MAX_TOTAL_OOD_RATE + 1e-12:
        raise AssertionError("Class validation budgets unexpectedly exceeded the total OOD budget")

    manifest_hashes = {
        name: _manifest_hash(np.flatnonzero(mask), y, splits, uploader, ids, hashes)
        for name, mask in {
            "all": np.ones(len(X), dtype=bool), "train": train,
            "validation": np.isin(splits, ["val", "ood_val"]),
            "test": np.isin(splits, ["test", "ood_test"]),
        }.items()
    }
    artifact = {
        "formatVersion": 2, "promotionAllowed": False, "browserPortable": False,
        "classifier": model, "classOrder": classes.tolist(),
        "trainingEmbeddings": X[train].copy(), "trainingLabels": y[train].copy(),
        "rejectionRules": rules, "manifestSha256": manifest_hashes,
        "normalization": "validate L2 input then renormalize in float64",
        "scoringFunction": "ml.experiment_v2.predict_research_artifact",
    }
    model_details: dict[str, Any] = {**selected_configuration, "classOrder": classes.tolist()}
    if selected_configuration["kind"] == "linear":
        weights, bias = _linear_parameters(model)
        model_details.update({"weights": weights.tolist(), "bias": bias.tolist()})
    else:
        model_details.update({"effectiveGamma": float(model._gamma), "supportVectorCount": int(len(model.support_)), "supportPerClass": model.n_support_.tolist(), "decisionFunctionShape": "ovr"})
    limitations = [
        "Validation constraints are finite curated-sample gates, not reliable-source probabilities or field guarantees.",
        "Wilson intervals omit threshold-selection, uploader dependence, label bias, and recording-domain uncertainty.",
        "The encoder is frozen and may have seen public-source clips during pretraining.",
        "The five broad labels do not establish appliance, facility, location, legal compliance, or harm.",
        "The inspected v1 test set is development evidence; only uploader-disjoint uninspected clips can form a fresh v2 holdout.",
        "This joblib artifact requires Python/sklearn and exact scoring/top-three-affinity logic; it is not a browser-portable SVC export.",
        "Browser feature/model parity and independent field recordings remain required before any promotion.",
    ]
    summary: dict[str, Any] = {
        "formatVersion": 2, "promotionAllowed": False, "browserPortable": False,
        "randomSeed": random_seed, "classOrder": classes.tolist(),
        "counts": {name: int(np.sum(splits == name)) for name in SPLITS},
        "leakageChecks": {
            "uploadersAcrossAllSplits": "passed", "clipIdsAcrossAllSplits": "passed" if ids is not None else "not_provided",
            "contentHashesAcrossAllSplits": "passed" if hashes is not None else "not_provided",
            "previouslyEvaluatedUploadersExcludedFromHoldout": "passed" if previously_seen is not None else "not_provided_external_audit_required",
            "previouslyEvaluatedUploaderCount": int(len(np.unique(previously_seen))) if previously_seen is not None else None,
        },
        "manifestSha256": manifest_hashes,
        "trainingEmbeddingSha256": hashlib.sha256(np.ascontiguousarray(X[train], dtype="<f8").tobytes()).hexdigest(),
        "training": {
            "selectionSplits": ["train"], "groupKey": "original uploader", "folds": folds,
            "trainingClipsPerClass": clip_counts, "distinctGroupsPerClass": group_counts,
            "selectedModel": selected_configuration, "crossValidation": cv_results,
            "tiePreference": "linear before RBF; lower C; gamma scale then1 then2; score differences <=1e-12 treated as ties",
        },
        "affinity": {"method": "mean top-three cosine similarities to predicted-class training clips", "topK": TOP_K, "normalization": "L2 float64"},
        "model": model_details, "rejectionRules": rules, "ruleSelection": selection,
        "allClassGatesPassed": selection["allClassGatesPassed"],
        "splits": evaluation, "limitations": limitations,
        "artifacts": {"model": "classifier_v2.joblib", "evaluation": "evaluation_v2.json"},
        "inferenceContract": {
            "method": "joblib.load then ml.experiment_v2.predict_research_artifact(artifact, normalized_X)",
            "prediction": "argmax in classOrder; binary decision scores are [-d,d], ties choose first class",
            "svc": "sklearn SVC decision_function_shape='ovr', break_ties=True; scores are not probabilities",
            "rejection": "each predicted class applies its own frozen margin and top-three training-positive cosine thresholds",
        },
    }
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, destination / "classifier_v2.joblib", compress=3)
    (destination / "evaluation_v2.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return summary
