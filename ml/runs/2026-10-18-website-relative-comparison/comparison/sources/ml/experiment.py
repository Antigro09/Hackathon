"""Train a small audio embedding probe without tuning on the held-out test set.

Inputs must already be L2-normalized embeddings. This module never downloads
audio or trains the CLAP encoder. Its exported scores are decision scores, not
calibrated confidence or evidence that an appliance caused a sound.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Sequence

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.model_selection import StratifiedGroupKFold


SPLITS = ("train", "val", "test", "ood_val", "ood_test")
C_GRID = (0.01, 0.1, 1.0, 10.0)
MAX_VALIDATION_OOD_FALSE_ACCEPTANCE = 0.10
MIN_VALIDATION_KNOWN_COVERAGE = 0.20


def _strings(values: Sequence[str], name: str, count: int) -> np.ndarray:
    result = np.asarray(values)
    if result.ndim != 1 or len(result) != count:
        raise ValueError(f"{name} must contain one value for every embedding")
    if any(not isinstance(value, (str, np.str_)) or not str(value).strip() for value in result):
        raise ValueError(f"{name} must contain nonempty strings")
    return result.astype(str)


def _check_disjoint(values: np.ndarray, splits: np.ndarray, name: str) -> None:
    owners: dict[str, str] = {}
    for value, split in zip(values.tolist(), splits.tolist()):
        previous = owners.setdefault(value, split)
        if previous != split:
            raise ValueError(f"{name} leakage: an identifier occurs in both {previous} and {split}")


def _manifest_hash(
    indices: np.ndarray,
    labels: np.ndarray,
    splits: np.ndarray,
    groups: np.ndarray,
    clip_ids: np.ndarray | None,
    sha256: np.ndarray | None,
) -> str:
    rows = [
        {
            "clip_id": str(clip_ids[i]) if clip_ids is not None else None,
            "label": str(labels[i]),
            "split": str(splits[i]),
            "uploader": str(groups[i]),
            "sha256": str(sha256[i]) if sha256 is not None else None,
        }
        for i in indices
    ]
    encoded = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _wilson(successes: int, total: int) -> dict[str, Any]:
    if not total:
        return {"successes": successes, "total": total, "rate": None, "wilson95": None}
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denominator
    radius = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return {
        "successes": successes,
        "total": total,
        "rate": p,
        "wilson95": [max(0.0, center - radius), min(1.0, center + radius)],
    }


def _classification(y: np.ndarray, predictions: np.ndarray, classes: np.ndarray) -> dict[str, Any]:
    precision, recall, f1, support = precision_recall_fscore_support(
        y, predictions, labels=classes, zero_division=0
    )
    return {
        "sampleCount": int(len(y)),
        "accuracy": float(accuracy_score(y, predictions)) if len(y) else None,
        "macroF1": float(f1_score(y, predictions, labels=classes, average="macro", zero_division=0)) if len(y) else None,
        "balancedAccuracy": float(balanced_accuracy_score(y, predictions)) if len(y) else None,
        "confusionMatrix": confusion_matrix(y, predictions, labels=classes).tolist(),
        "classOrder": classes.tolist(),
        "perClass": [
            {"label": str(label), "precision": float(p), "recall": float(r), "f1": float(f), "support": int(n)}
            for label, p, r, f, n in zip(classes, precision, recall, f1, support)
        ],
        "classesAbsentFromThisSplit": [str(label) for label, n in zip(classes, support) if not n],
    }


def _linear_parameters(model: LogisticRegression) -> tuple[np.ndarray, np.ndarray]:
    # sklearn stores one signed score for binary problems; two explicit rows
    # preserve its class order and make browser inference unambiguous.
    if len(model.classes_) == 2:
        return np.concatenate((-model.coef_, model.coef_)), np.concatenate((-model.intercept_, model.intercept_))
    return model.coef_.copy(), model.intercept_.copy()


def _score_features(scores: np.ndarray, X: np.ndarray, centroids: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    predicted = np.argmax(scores, axis=1)
    ordered = np.sort(scores, axis=1)
    margins = ordered[:, -1] - ordered[:, -2]
    cosines = np.einsum("ij,ij->i", X, centroids[predicted])
    return predicted, margins, cosines


def _threshold_candidates(values: np.ndarray) -> list[float | None]:
    # Values come exclusively from validation. Quantiles bound the candidate
    # search even when the requested download cap is increased.
    unique = np.unique(values)
    if len(unique) > 32:
        unique = np.unique(np.quantile(unique, np.linspace(0, 1, 32), method="nearest"))
    return [None, *[float(value) for value in unique], float(np.nextafter(unique[-1], np.inf))]


def _accept(margins: np.ndarray, cosines: np.ndarray, rule: dict[str, Any]) -> np.ndarray:
    accepted = np.ones(len(margins), dtype=bool)
    if rule["abstainAll"]:
        return ~accepted
    if rule["minDecisionMargin"] is not None:
        accepted &= margins >= rule["minDecisionMargin"]
    if rule["minPredictedCentroidCosine"] is not None:
        accepted &= cosines >= rule["minPredictedCentroidCosine"]
    return accepted


def _choose_rule(
    predictions: np.ndarray,
    margins: np.ndarray,
    cosines: np.ndarray,
    y: np.ndarray,
    splits: np.ndarray,
    classes: np.ndarray,
) -> tuple[dict[str, Any], dict[str, Any]]:
    known = splits == "val"
    ood = splits == "ood_val"
    calibration = known | ood
    best: tuple[Any, ...] | None = None
    selected = {"abstainAll": True, "minDecisionMargin": None, "minPredictedCentroidCosine": None}
    eligible_count = 0
    tried_count = 0
    # Thresholds use no test observations, labels, scores, or distribution.
    for margin in _threshold_candidates(margins[calibration]):
        for cosine in _threshold_candidates(cosines[calibration]):
            tried_count += 1
            rule = {"abstainAll": False, "minDecisionMargin": margin, "minPredictedCentroidCosine": cosine}
            accepted = _accept(margins[calibration], cosines[calibration], rule)
            accepted_known = accepted[splits[calibration] == "val"]
            accepted_ood = accepted[splits[calibration] == "ood_val"]
            coverage = float(np.mean(accepted_known))
            false_acceptance = float(np.mean(accepted_ood))
            if coverage + 1e-12 < MIN_VALIDATION_KNOWN_COVERAGE or false_acceptance > MAX_VALIDATION_OOD_FALSE_ACCEPTANCE + 1e-12:
                continue
            eligible_count += 1
            correct = classes[predictions[known]] == y[known]
            correct_accepted = int(np.sum(correct & accepted_known))
            # Maximize useful correct answers per known validation recording,
            # then coverage, then precision; deterministic lower thresholds win ties.
            key = (correct_accepted, int(np.sum(accepted_known)), float(np.mean(correct[accepted_known])), -false_acceptance)
            if best is None or key > best:
                best, selected = key, rule
    return selected, {
        "eligible": best is not None,
        "reason": "validation_sample_constraints_met" if best is not None else "no_eligible_candidate_abstain_all",
        "candidateCount": tried_count,
        "eligibleCandidateCount": eligible_count,
        "selectionSplits": ["val", "ood_val"],
        "maxEmpiricalOodFalseAcceptance": MAX_VALIDATION_OOD_FALSE_ACCEPTANCE,
        "minKnownCoverage": MIN_VALIDATION_KNOWN_COVERAGE,
        "objective": "correct accepted known clips, then known coverage, then selective accuracy, then lower OOD acceptance",
        "limitation": "These are empirical gates on a small selected sample, not guarantees for field recordings.",
    }


def _evaluate_scores(
    scores: np.ndarray,
    X: np.ndarray,
    y: np.ndarray,
    splits: np.ndarray,
    classes: np.ndarray,
    centroids: np.ndarray,
) -> tuple[dict[str, Any], dict[str, Any]]:
    predictions, margins, cosines = _score_features(scores, X, centroids)
    rule, selection = _choose_rule(predictions, margins, cosines, y, splits, classes)
    accepted = _accept(margins, cosines, rule)
    evaluation: dict[str, Any] = {"ruleSelection": selection, "rejectionRule": rule, "splits": {}}
    for name in ("val", "test"):
        mask = splits == name
        accepted_mask = mask & accepted
        correct = classes[predictions[mask]] == y[mask]
        accepted_correct = classes[predictions[accepted_mask]] == y[accepted_mask]
        evaluation["splits"][name] = {
            "ungated": _classification(y[mask], classes[predictions[mask]], classes),
            "acceptedOnly": _classification(y[accepted_mask], classes[predictions[accepted_mask]], classes),
            "coverage": _wilson(int(np.sum(accepted_mask)), int(np.sum(mask))),
            "selectiveAccuracy": _wilson(int(np.sum(accepted_correct)), int(np.sum(accepted_mask))),
            "correctAcceptedPerKnownClip": _wilson(int(np.sum(accepted_correct)), int(np.sum(mask))),
            "ungatedAccuracyInterval": _wilson(int(np.sum(correct)), int(np.sum(mask))),
            "rejectedCount": int(np.sum(mask) - np.sum(accepted_mask)),
            "perClassAcceptance": [
                {
                    "label": str(label),
                    "coverage": _wilson(int(np.sum(accepted_mask & (y == label))), int(np.sum(mask & (y == label)))),
                    "selectiveAccuracy": _wilson(
                        int(np.sum(accepted_mask & (y == label) & (classes[predictions] == y))),
                        int(np.sum(accepted_mask & (y == label))),
                    ),
                }
                for label in classes
            ],
        }
    for name in ("ood_val", "ood_test"):
        mask = splits == name
        accepted_labels, counts = np.unique(classes[predictions[mask & accepted]], return_counts=True)
        evaluation["splits"][name] = {
            "falseAcceptance": _wilson(int(np.sum(mask & accepted)), int(np.sum(mask))),
            "acceptedByLabel": {str(label): int(count) for label, count in zip(accepted_labels, counts)},
            "rejectedCount": int(np.sum(mask & ~accepted)),
        }
    return evaluation, rule


def run_experiment(
    X: np.ndarray,
    labels: Sequence[str],
    split: Sequence[str],
    groups: Sequence[str],
    output_dir: str | Path,
    baseline_scores: np.ndarray | None = None,
    random_seed: int = 804,
    *,
    clip_ids: Sequence[str] | None = None,
    sha256: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Fit train-only group-CV probe, freeze val rejection, then evaluate test.

    ``baseline_scores`` must be N by K scores for exactly ``sorted(train_labels)``
    in that order, using matched broad label prompts. Scores are compared fairly
    on the same clips, with their own val-only gate. Eight appliance descriptions
    from the existing app are not a matched-label baseline for broad FSD labels.
    ``groups`` are original uploaders, never random per-clip identifiers.
    Pass both clip_ids and source/content SHA-256 values for full leakage checks.
    """
    X = np.asarray(X, dtype=np.float64)
    if X.ndim != 2 or min(X.shape) < 2 or not np.all(np.isfinite(X)):
        raise ValueError("X must be a finite N by D embedding array with N,D >= 2")
    norms = np.linalg.norm(X, axis=1)
    if not np.allclose(norms, 1.0, atol=2e-4, rtol=0):
        raise ValueError("Every embedding must be L2-normalized before training")
    # Match the explicit normalization step in the portable inference contract,
    # including small float32 encoder rounding, without mutating the caller.
    X = X / norms[:, None]
    y = _strings(labels, "labels", len(X))
    splits = _strings(split, "split", len(X))
    uploader = _strings(groups, "groups", len(X))
    ids = _strings(clip_ids, "clip_ids", len(X)) if clip_ids is not None else None
    hashes = _strings(sha256, "sha256", len(X)) if sha256 is not None else None
    if set(splits) != set(SPLITS):
        raise ValueError(f"Require nonempty splits {SPLITS}; received {sorted(set(splits))}")
    _check_disjoint(uploader, splits, "uploader")
    if ids is not None:
        _check_disjoint(ids, splits, "clip_id")
    if hashes is not None:
        if any(len(value) != 64 or any(c not in "0123456789abcdef" for c in value.lower()) for value in hashes):
            raise ValueError("sha256 values must contain 64 hexadecimal characters")
        hashes = np.char.lower(hashes)
        _check_disjoint(hashes, splits, "content SHA-256")

    train = splits == "train"
    classes = np.unique(y[train])
    if len(classes) < 2:
        raise ValueError("Training requires at least two known classes")
    known = np.isin(splits, ["train", "val", "test"])
    if not set(y[known]).issubset(set(classes)):
        raise ValueError("Known validation/test labels must occur in training")
    if set(y[~known]) & set(classes):
        raise ValueError("OOD splits must not use any training class label")
    baseline = np.asarray(baseline_scores, dtype=np.float64) if baseline_scores is not None else None
    if baseline is not None and (baseline.shape != (len(X), len(classes)) or not np.all(np.isfinite(baseline))):
        raise ValueError("baseline_scores must be finite N by K matched-label scores in sorted training-class order")

    distinct_groups_per_class = {str(label): len(np.unique(uploader[train & (y == label)])) for label in classes}
    folds = min(5, min(distinct_groups_per_class.values()))
    if folds < 2:
        raise ValueError("Group cross-validation needs at least two distinct training uploaders per class; collect more independent clips")
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=random_seed)
    cv_splits = list(splitter.split(X[train], y[train], uploader[train]))
    for fit, validation in cv_splits:
        if set(y[train][fit]) != set(classes):
            raise ValueError("A training group-CV fold lacks a class; collect more independent uploaders per class")
        if set(uploader[train][fit]) & set(uploader[train][validation]):
            raise AssertionError("Group cross-validation unexpectedly leaked an uploader")
    cv_results = []
    for c in C_GRID:
        fold_scores = []
        for fit, validation in cv_splits:
            model = LogisticRegression(C=c, max_iter=2000, solver="lbfgs", class_weight="balanced", random_state=random_seed)
            model.fit(X[train][fit], y[train][fit])
            prediction = model.predict(X[train][validation])
            fold_scores.append(float(f1_score(y[train][validation], prediction, labels=classes, average="macro", zero_division=0)))
        cv_results.append({"C": c, "foldMacroF1": fold_scores, "meanMacroF1": float(np.mean(fold_scores))})
    # A tie selects the smaller, more regularized C; validation/test are unused.
    chosen = max(cv_results, key=lambda row: (row["meanMacroF1"], -row["C"]))
    model = LogisticRegression(C=chosen["C"], max_iter=2000, solver="lbfgs", class_weight="balanced", random_state=random_seed)
    model.fit(X[train], y[train])
    weights, bias = _linear_parameters(model)
    centroids = np.asarray([np.mean(X[train & (y == label)], axis=0) for label in classes])
    centroid_norms = np.linalg.norm(centroids, axis=1, keepdims=True)
    if np.any(centroid_norms < 1e-8):
        raise ValueError("A class has a near-zero centroid; inspect the training labels and embeddings")
    centroids /= centroid_norms
    probe_scores = X @ weights.T + bias
    probe_evaluation, rule = _evaluate_scores(probe_scores, X, y, splits, classes, centroids)

    all_indices = np.arange(len(X))
    manifest_hashes = {
        "all": _manifest_hash(all_indices, y, splits, uploader, ids, hashes),
        "train": _manifest_hash(np.flatnonzero(train), y, splits, uploader, ids, hashes),
        "validation": _manifest_hash(np.flatnonzero(np.isin(splits, ["val", "ood_val"])), y, splits, uploader, ids, hashes),
        "test": _manifest_hash(np.flatnonzero(np.isin(splits, ["test", "ood_test"])), y, splits, uploader, ids, hashes),
    }
    limitations = [
        "Sample-only estimates; source, uploader, room, microphone, and recording-domain shifts remain unmeasured.",
        "Wilson intervals describe binomial sampling uncertainty; they do not repair curated-sample or label bias.",
        "Validation intervals also omit uncertainty from threshold selection; use the untouched test evaluation for final estimates.",
        "The frozen encoder may have encountered source audio in pretraining; uploader separation does not establish pretraining independence.",
        "Broad sound labels do not identify an appliance, prove causation, or determine a legal/health threshold.",
        "Decision margins and cosine similarities are not calibrated confidence or probabilities.",
        "The app's eight-label zero-shot hints are not an equivalent baseline for these broad target classes.",
        "Browser preprocessing/embedding/linear-head parity and independent field validation are required before promotion.",
    ]
    artifact = {
        "formatVersion": 1,
        "kind": "frozen-embedding-linear-probe-experimental",
        "promotionAllowed": False,
        "classOrder": classes.tolist(),
        "embeddingDimension": int(X.shape[1]),
        "normalization": {"input": "l2", "zeroVector": "reject", "centroids": "l2", "tolerance": 0.0002},
        "inference": "scores = l2(embedding) @ weights.T + bias; argmax in classOrder; apply rejectionRule",
        "weights": weights.tolist(),
        "bias": bias.tolist(),
        "classCentroids": centroids.tolist(),
        "rejectionRule": rule,
        "manifestSha256": manifest_hashes,
        "trainingEmbeddingSha256": hashlib.sha256(np.ascontiguousarray(X[train], dtype="<f4").tobytes()).hexdigest(),
        "selectedC": chosen["C"],
        "randomSeed": random_seed,
        "limitations": limitations,
    }
    summary: dict[str, Any] = {
        "formatVersion": 1,
        "promotionAllowed": False,
        "randomSeed": random_seed,
        "classOrder": classes.tolist(),
        "counts": {name: int(np.sum(splits == name)) for name in SPLITS},
        "leakageChecks": {"uploadersAcrossAllSplits": "passed", "clipIdsAcrossAllSplits": "passed" if ids is not None else "not_provided", "contentHashesAcrossAllSplits": "passed" if hashes is not None else "not_provided"},
        "manifestSha256": manifest_hashes,
        "training": {"method": "balanced LogisticRegression on frozen L2 embeddings", "selectionSplits": ["train"], "groupKey": "original uploader", "folds": folds, "distinctGroupsPerClass": distinct_groups_per_class, "CGrid": list(C_GRID), "selectedC": chosen["C"], "crossValidation": cv_results},
        "probe": probe_evaluation,
        "zeroShotMatchedLabels": None,
        "baselineComparison": "No matched-label zero-shot scores supplied.",
        "limitations": limitations,
        "artifacts": {"model": "linear_probe.json", "evaluation": "evaluation.json"},
    }
    if baseline is not None:
        baseline_evaluation, _ = _evaluate_scores(baseline, X, y, splits, classes, centroids)
        summary["zeroShotMatchedLabels"] = baseline_evaluation
        summary["baselineComparison"] = "Same recordings and broad class order; each system freezes its own val/ood_val rejection rule before test evaluation. This does not compare the app's eight-label hints."
        summary["testDifferenceProbeMinusMatchedZeroShot"] = {
            "ungatedMacroF1": probe_evaluation["splits"]["test"]["ungated"]["macroF1"] - baseline_evaluation["splits"]["test"]["ungated"]["macroF1"],
            "knownCoverage": probe_evaluation["splits"]["test"]["coverage"]["rate"] - baseline_evaluation["splits"]["test"]["coverage"]["rate"],
            "oodFalseAcceptance": probe_evaluation["splits"]["ood_test"]["falseAcceptance"]["rate"] - baseline_evaluation["splits"]["ood_test"]["falseAcceptance"]["rate"],
        }
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "linear_probe.json").write_text(json.dumps(artifact, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (destination / "evaluation.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return summary
