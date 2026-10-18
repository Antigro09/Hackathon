"""Research-only, unknown-aware linear head with an exact integer scorer.

This module accepts development data only. Model selection is group CV within
fit data; rejection uses calibration data; a separate development audit cannot
change either. It does not evaluate a fresh final test or promote a model.

All embeddings must come from one pinned browser-WASM extraction contract.
Integer scoring removes head reduction/threshold roundoff for IDENTICAL inputs;
it does not remove encoder, browser, recording-domain or field uncertainty.
The fixed guard is an L1 bound for one integer input quantum, not a claim of
acceptance-bit invariance under perturbed inputs or a fix for v2 encoder drift.

Primary implementation references (sklearn 1.7.2):
https://scikit-learn.org/1.7/modules/generated/sklearn.linear_model.LogisticRegression.html
https://scikit-learn.org/1.7/modules/generated/sklearn.model_selection.StratifiedGroupKFold.html
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import platform
from typing import Any, Sequence
import warnings

import numpy as np
import sklearn
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold

from ml.experiment import _check_disjoint, _strings, _wilson

KNOWN_CLASSES = ("buzz", "mechanical_fan", "speech", "traffic", "wind")
UNKNOWN = "__unknown__"
ROLES = ("train", "unknown_train", "calibration", "unknown_calibration", "audit", "unknown_audit")
C_GRID = (0.01, 0.1, 1.0, 10.0)
UNKNOWN_WEIGHTS = (1.0, 2.0)
INPUT_SCALE = 1 << 15
WEIGHT_SCALE = 1 << 20
INPUT_BOUND = INPUT_SCALE + 1
MAX_SAFE_INTEGER = (1 << 53) - 1
GUARD_STEPS = 1
CALIBRATION_OOD_RATE = 0.025


@dataclass(frozen=True)
class ReadinessCriteria:
    """Proposed sample gates; freeze in the protocol before data predictions."""

    min_known_per_class: int = 20
    min_groups_per_class: int = 3
    min_correct_accepted_per_class: int = 5
    min_correct_class_coverage: float = 0.20
    min_predicted_class_precision: float = 0.90
    min_known_precision: float = 0.90
    min_known_precision_wilson_lower: float = 0.80
    min_unknown_clips: int = 100
    min_unknown_groups: int = 10
    max_unknown_wilson_upper: float = 0.05


DEFAULT_CRITERIA = ReadinessCriteria()


def _validate_criteria(criteria: ReadinessCriteria) -> None:
    if not isinstance(criteria, ReadinessCriteria):
        raise ValueError("Require explicit frozen ReadinessCriteria")
    for name, value in asdict(criteria).items():
        if name in {"min_known_per_class", "min_groups_per_class", "min_correct_accepted_per_class", "min_unknown_clips", "min_unknown_groups"}:
            if type(value) is not int or value < 1:
                raise ValueError(f"Invalid positive count criterion: {name}")
        elif type(value) not in (int, float) or not 0 < value <= 1:
            raise ValueError(f"Invalid rate criterion: {name}")


def _json_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _hex_digest(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def validate_embedding_contract(contract: dict[str, Any]) -> None:
    required = ("modelSha256", "runtimeFingerprintSha256", "preprocessingContractSha256")
    if not isinstance(contract, dict) or contract.get("canonicalBackend") != "browser-wasm" or type(contract.get("dimension")) is not int or contract.get("dimension") != 512:
        raise ValueError("Require the canonical browser-wasm, dimension 512 embedding contract")
    if contract.get("normalization") != "l2-float32" or not all(_hex_digest(contract.get(key)) for key in required):
        raise ValueError("Require pinned model/runtime/preprocessing SHA256s and l2-float32 normalization")
    _json_hash(contract)


def quantize_embeddings(X: np.ndarray, dimension: int = 512) -> np.ndarray:
    """Float32 -> signed integers, ties away from zero; no renormalization.

    The identical browser operation is sign(x)*floor(abs(x)*32768+0.5), with
    Float32 input. Power-of-two scaling is exact. Never substitute Math.round
    for negative ties, numpy.rint, float64 renormalization or a CPU embedding.
    """
    values = np.asarray(X)
    if values.ndim != 2 or not len(values) or values.shape[1] != dimension:
        raise ValueError(f"Require nonempty N by {dimension} canonical Float32 embeddings")
    if values.dtype != np.float32 or not np.isfinite(values).all():
        raise ValueError("Require finite, already normalized Float32 embeddings")
    norms = np.linalg.norm(values.astype(np.float64), axis=1)
    if not np.allclose(norms, 1, atol=2e-4, rtol=0):
        raise ValueError("Canonical embeddings must already be L2-normalized")
    if np.any(np.abs(values) > 1 + 1 / INPUT_SCALE):
        raise ValueError("Embedding coordinate exceeds fixed-point input bound")
    return _round_away(values.astype(np.float64) * INPUT_SCALE)


def _round_away(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float64)
    if not np.isfinite(values).all() or np.any(np.abs(values) >= MAX_SAFE_INTEGER / 2):
        raise ValueError("Unsafe quantization range")
    return (np.sign(values) * np.floor(np.abs(values) + 0.5)).astype(np.int64)


def integer_head(weights: np.ndarray, bias: np.ndarray, class_order: Sequence[str]) -> dict[str, Any]:
    """Freeze linear parameters and prove every JS multiply/sum stays exact."""
    weights, bias = np.asarray(weights, np.float64), np.asarray(bias, np.float64)
    classes = list(class_order)
    if classes != [*KNOWN_CLASSES, UNKNOWN] or weights.shape != (6, 512) or bias.shape != (6,):
        raise ValueError("Require the complete fixed five-known-plus-unknown linear head")
    W = _round_away(weights * WEIGHT_SCALE)
    b = _round_away(bias * INPUT_SCALE * WEIGHT_SCALE)
    if np.any(np.abs(W) > (1 << 31) - 1):
        raise ValueError("Fixed weight range exceeded; do not silently rescale")
    guards = np.zeros((6, 6), dtype=np.int64)
    for i in range(6):
        for j in range(6):
            if i != j:
                guards[i, j] = GUARD_STEPS * sum(abs(int(a) - int(c)) for a, c in zip(W[i], W[j])) + 1
    bounds = [INPUT_BOUND * sum(abs(int(v)) for v in row) + abs(int(intercept)) for row, intercept in zip(W, b)]
    maximum = max(bounds)
    # Includes subtraction, guard subtraction, and a threshold at max gap+1.
    if 4 * maximum + 2 * int(guards.max()) + 2 > MAX_SAFE_INTEGER:
        raise ValueError("Head exceeds the JavaScript exact-integer accumulation bound")
    return {
        "formatVersion": 3, "experimental": True, "promotionAllowed": False,
        "classOrder": classes, "dimension": 512, "inputScale": INPUT_SCALE,
        "weightScale": WEIGHT_SCALE, "rounding": "symmetric-half-away-from-zero",
        "weights": W.tolist(), "bias": b.tolist(), "pairGuard": guards.tolist(),
        "guardSteps": GUARD_STEPS, "maxAbsoluteScoreBound": maximum,
        "rejectionRules": {label: {"abstainAll": True, "minGuardedMargin": None} for label in KNOWN_CLASSES},
    }


def _validated_head(head: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if head.get("formatVersion") != 3 or head.get("promotionAllowed") is not False or head.get("experimental") is not True:
        raise ValueError("Require an unpromoted experimental v3 head")
    if head.get("classOrder") != [*KNOWN_CLASSES, UNKNOWN] or head.get("dimension") != 512:
        raise ValueError("Invalid complete class order or dimension")
    if (head.get("inputScale"), head.get("weightScale"), head.get("guardSteps"), head.get("rounding")) != (INPUT_SCALE, WEIGHT_SCALE, GUARD_STEPS, "symmetric-half-away-from-zero"):
        raise ValueError("Unsupported fixed-point contract")
    arrays = []
    for key, shape in (("weights", (6, 512)), ("bias", (6,)), ("pairGuard", (6, 6))):
        raw = np.asarray(head.get(key), dtype=object)
        if raw.shape != shape or any(type(v) is not int or abs(v) > MAX_SAFE_INTEGER for v in raw.flat):
            raise ValueError(f"Invalid integer {key}")
        arrays.append(raw.astype(np.int64))
    W, b, guard = arrays
    if np.any(np.abs(W) > (1 << 31) - 1):
        raise ValueError("Invalid fixed weight range")
    bound = max(INPUT_BOUND * sum(abs(int(v)) for v in row) + abs(int(intercept)) for row, intercept in zip(W, b))
    expected_guard = [[0 if i == j else GUARD_STEPS * sum(abs(int(a) - int(c)) for a, c in zip(W[i], W[j])) + 1 for j in range(6)] for i in range(6)]
    if guard.tolist() != expected_guard or head.get("maxAbsoluteScoreBound") != bound or 4 * bound + 2 * int(guard.max()) + 2 > MAX_SAFE_INTEGER:
        raise ValueError("Invalid guard or exact-integer bound")
    rules = head.get("rejectionRules")
    if not isinstance(rules, dict) or set(rules) != set(KNOWN_CLASSES):
        raise ValueError("Every known class requires a frozen gate")
    for rule in rules.values():
        threshold = rule.get("minGuardedMargin") if isinstance(rule, dict) else None
        if not isinstance(rule, dict) or type(rule.get("abstainAll")) is not bool:
            raise ValueError("Invalid rejection rule")
        if (rule["abstainAll"] and threshold is not None) or (not rule["abstainAll"] and (type(threshold) is not int or not 0 <= threshold <= 2 * bound + int(guard.max()) + 1)):
            raise ValueError("Invalid integer gate threshold")
    return W, b, guard


def predict_fixed_v3(head: dict[str, Any], X: np.ndarray, *, integer_input: bool = False) -> dict[str, np.ndarray]:
    """Exact integer scores/gates; ties use the first fixed class index."""
    W, b, guard = _validated_head(head)
    if integer_input:
        values = np.asarray(X)
        if values.ndim != 2 or not len(values) or values.shape[1] != 512 or values.dtype.kind not in "iu" or np.any(values > INPUT_BOUND) or np.any(values < -INPUT_BOUND):
            raise ValueError("Require bounded integer N by 512 inputs")
        values = values.astype(np.int64)
    else:
        values = quantize_embeddings(X)
    scores = values @ W.T + b
    predicted = np.argmax(scores, axis=1)
    margin = np.empty(len(values), np.int64)
    accepted = np.zeros(len(values), bool)
    for n, winner in enumerate(predicted):
        rivals = [j for j in range(6) if j != winner]
        margin[n] = min(int(scores[n, winner]) - int(scores[n, j]) - int(guard[winner, j]) for j in rivals)
        if winner < len(KNOWN_CLASSES):
            rule = head["rejectionRules"][KNOWN_CLASSES[winner]]
            accepted[n] = not rule["abstainAll"] and margin[n] >= rule["minGuardedMargin"]
    return {"labels": np.asarray(head["classOrder"])[predicted], "accepted": accepted, "integerScores": scores, "guardedMargin": margin}


def _group_weights(y: np.ndarray, groups: np.ndarray, unknown_weight: float) -> np.ndarray:
    result = np.empty(len(y), float)
    for label in np.unique(y):
        class_mask = y == label
        owners = np.unique(groups[class_mask])
        for owner in owners:
            mask = class_mask & (groups == owner)
            result[mask] = (unknown_weight if label == UNKNOWN else 1.0) / (len(owners) * int(mask.sum()))
    return result * (len(result) / result.sum())


def _fit_head(qX: np.ndarray, y: np.ndarray, groups: np.ndarray, C: float, unknown_weight: float, seed: int) -> dict[str, Any]:
    model = LogisticRegression(C=C, solver="lbfgs", max_iter=3000, random_state=seed)
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        model.fit(qX / INPUT_SCALE, y, sample_weight=_group_weights(y, groups, unknown_weight))
    order = [list(model.classes_).index(label) for label in (*KNOWN_CLASSES, UNKNOWN)]
    return integer_head(model.coef_[order], model.intercept_[order], [*KNOWN_CLASSES, UNKNOWN])


def _calibrate(head: dict[str, Any], qX: np.ndarray, y: np.ndarray, unknown: np.ndarray, criteria: ReadinessCriteria) -> dict[str, Any]:
    prediction = predict_fixed_v3(head, qX, integer_input=True)
    labels, margins = prediction["labels"], prediction["guardedMargin"]
    budget = math.floor(CALIBRATION_OOD_RATE * int(unknown.sum()))
    choices, diagnostics = {}, {}
    for label in KNOWN_CLASSES:
        predicted = labels == label
        true_count = int(np.sum(~unknown & (y == label)))
        candidates = sorted({0, *(max(0, int(v) + 1) for v in margins[predicted])})
        by_cost = {}
        for threshold in candidates:
            chosen = predicted & (margins >= threshold)
            correct = int(np.sum(chosen & ~unknown & (y == label)))
            known_count = int(np.sum(chosen & ~unknown))
            cost = int(np.sum(chosen & unknown))
            if not true_count or correct / true_count < criteria.min_correct_class_coverage or not known_count or correct / known_count < criteria.min_predicted_class_precision or cost > budget:
                continue
            option = {"threshold": threshold, "correct": correct, "knownAccepted": known_count, "unknownAccepted": cost, "coverage": Fraction(correct, true_count)}
            key = (correct, -(known_count - correct), threshold)
            if cost not in by_cost or key > by_cost[cost][0]:
                by_cost[cost] = (key, option)
        choices[label] = [item[1] for item in by_cost.values()]
        diagnostics[label] = {"trueClassCount": true_count, "candidateCount": len(candidates), "eligibleCostChoices": len(by_cost)}
    if any(not choices[label] for label in KNOWN_CLASSES):
        return {"allClassesEligible": False, "reason": "At least one class has no eligible calibration rule; all gates remain closed.", "classes": diagnostics, "unknownBudget": budget}
    optimized = _optimize_class_rules(choices, budget)
    if optimized is None:
        return {"allClassesEligible": False, "reason": "No complete set of class rules fits the global unknown budget; all gates remain closed.", "classes": diagnostics, "unknownBudget": budget}
    level, cost, selected = optimized
    for label, option in zip(KNOWN_CLASSES, selected):
        head["rejectionRules"][label] = {"abstainAll": False, "minGuardedMargin": option["threshold"]}
        diagnostics[label].update({k: float(v) if isinstance(v, Fraction) else v for k, v in option.items()})
    return {"allClassesEligible": True, "classes": diagnostics, "unknownBudget": budget, "unknownAccepted": cost, "maximizedMinimumCorrectClassCoverage": float(level), "empiricalUnknownCalibrationRateLimit": CALIBRATION_OOD_RATE, "selectionUncertaintyIncludedInWilson": False}


def _optimize_class_rules(choices: dict[str, list[dict[str, Any]]], budget: int):
    # First maximize minimum class coverage. Feasibility at each level is just
    # the sum of each class's least OOD cost. Then an additive budget DP can
    # safely maximize total correct accepts without discarding a later winner.
    levels = sorted({v["coverage"] for values in choices.values() for v in values}, reverse=True)
    level = next((v for v in levels if all(any(o["coverage"] >= v for o in choices[c]) for c in KNOWN_CLASSES) and sum(min(o["unknownAccepted"] for o in choices[c] if o["coverage"] >= v) for c in KNOWN_CLASSES) <= budget), None)
    if level is None:
        return None
    states = {0: []}
    def utility(options):
        return (sum(v["correct"] for v in options), sum((v["coverage"] for v in options), Fraction()), -sum(v["knownAccepted"] - v["correct"] for v in options), tuple(v["threshold"] for v in options))
    for label in KNOWN_CLASSES:
        next_states = {}
        for used, previous in states.items():
            for option in choices[label]:
                cost = used + option["unknownAccepted"]
                if cost > budget or option["coverage"] < level:
                    continue
                selected = [*previous, option]
                if cost not in next_states or utility(selected) > utility(next_states[cost]):
                    next_states[cost] = selected
        states = next_states
    cost, selected = max(states.items(), key=lambda pair: (*utility(pair[1])[:3], -pair[0], utility(pair[1])[3]))
    return level, cost, selected


def evaluate_readiness(prediction: dict[str, np.ndarray], labels: Sequence[str], unknown: np.ndarray, groups: Sequence[str], datasets: Sequence[str], criteria: ReadinessCriteria = DEFAULT_CRITERIA) -> dict[str, Any]:
    """Report a frozen development audit; it never changes the supplied head.

    Wilson intervals are descriptive clip-level intervals. They do not account
    for group/collection dependence, model selection or field-domain shifts.
    """
    _validate_criteria(criteria)
    y = np.asarray(labels)
    owners, sources = np.asarray(groups), np.asarray(datasets)
    unknown = np.asarray(unknown)
    if unknown.dtype != np.bool_:
        raise ValueError("Unknown mask must contain actual booleans")
    p, accepted = np.asarray(prediction["labels"]), np.asarray(prediction["accepted"])
    if any(len(v) != len(y) for v in [owners, sources, unknown, p, accepted]):
        raise ValueError("Audit vectors must align")
    if any(v.ndim != 1 for v in [y, owners, sources, unknown, p, accepted]) or accepted.dtype != np.bool_ or not len(y):
        raise ValueError("Require aligned nonempty audit vectors and boolean acceptance")
    if not set(p).issubset({*KNOWN_CLASSES, UNKNOWN}) or not set(y[~unknown]).issubset(KNOWN_CLASSES) or set(y[unknown]) & set(KNOWN_CLASSES) or np.any(accepted & (p == UNKNOWN)):
        raise ValueError("Invalid known/unknown audit labels or accepted unknown predictions")
    known = ~unknown
    correct = accepted & known & (p == y)
    precision = _wilson(int(correct.sum()), int(np.sum(accepted & known)))
    false_accept = _wilson(int(np.sum(accepted & unknown)), int(unknown.sum()))
    per_class = []
    for label in KNOWN_CLASSES:
        actual = known & (y == label)
        predicted = accepted & (p == label)
        count = int(actual.sum())
        successes = int(np.sum(correct & actual))
        known_predictions = int(np.sum(predicted & known))
        class_precision = _wilson(successes, known_predictions)
        coverage = _wilson(successes, count)
        groups_count = len(set(owners[actual]))
        passed = count >= criteria.min_known_per_class and groups_count >= criteria.min_groups_per_class and successes >= criteria.min_correct_accepted_per_class and coverage["rate"] >= criteria.min_correct_class_coverage and class_precision["rate"] is not None and class_precision["rate"] >= criteria.min_predicted_class_precision
        per_class.append({"label": label, "passed": bool(passed), "clipCount": count, "groupCount": groups_count, "correctAcceptedCoverage": coverage, "groupsWithAnyCorrectAcceptance": len(set(owners[actual & correct])), "precisionAmongAcceptedKnown": class_precision, "precisionAmongAllAcceptedPredictions": _wilson(successes, int(predicted.sum()))})
    unknown_groups = len(set(owners[unknown]))
    global_pass = precision["rate"] is not None and precision["rate"] >= criteria.min_known_precision and precision["wilson95"][0] >= criteria.min_known_precision_wilson_lower and int(unknown.sum()) >= criteria.min_unknown_clips and unknown_groups >= criteria.min_unknown_groups and false_accept["wilson95"] is not None and false_accept["wilson95"][1] <= criteria.max_unknown_wilson_upper
    true = np.where(unknown, UNKNOWN, y)
    return {
        "developmentAuditPassed": bool(global_pass and all(row["passed"] for row in per_class)),
        "promotionAllowed": False, "criteria": asdict(criteria), "perClass": per_class,
        "knownCoverage": _wilson(int(np.sum(accepted & known)), int(known.sum())),
        "knownSelectivePrecision": precision, "unknownFalseAcceptance": false_accept,
        "acceptedMixturePrecision": _wilson(int(correct.sum()), int(accepted.sum())),
        "unknownAcceptedByLabel": {label: int(np.sum(accepted & unknown & (p == label))) for label in KNOWN_CLASSES},
        "unknownGroupCount": unknown_groups,
        "unknownGroupsWithAnyFalseAcceptance": len(set(owners[unknown & accepted])),
        "ungatedKnownMacroF1": float(f1_score(y[known], p[known], labels=KNOWN_CLASSES, average="macro", zero_division=0)) if known.any() else None,
        "classOrderWithUnknown": [*KNOWN_CLASSES, UNKNOWN],
        "ungatedConfusionMatrixWithUnknown": confusion_matrix(true, p, labels=[*KNOWN_CLASSES, UNKNOWN]).tolist(),
        "perUnknownSource": {str(source): {"falseAcceptance": _wilson(int(np.sum(accepted & unknown & (sources == source))), int(np.sum(unknown & (sources == source)))), "groupCount": len(set(owners[unknown & (sources == source)])), "groupsWithAnyFalseAcceptance": len(set(owners[unknown & accepted & (sources == source)]))} for source in sorted(set(sources[unknown]))},
        "perKnownSource": {str(source): {"correctAcceptedCoverage": _wilson(int(np.sum(correct & (sources == source))), int(np.sum(known & (sources == source)))), "groupCount": len(set(owners[known & (sources == source)])), "groupsWithAnyCorrectAcceptance": len(set(owners[correct & (sources == source)]))} for source in sorted(set(sources[known]))},
        "groupResults": [{"group": str(group), "datasets": sorted(set(sources[owners == group])), "knownCorrectAcceptedCoverage": _wilson(int(np.sum(correct & (owners == group))), int(np.sum(known & (owners == group)))), "unknownFalseAcceptance": _wilson(int(np.sum(accepted & unknown & (owners == group))), int(np.sum(unknown & (owners == group))))} for group in sorted(set(owners))],
        "limitation": "Descriptive clip-level intervals omit group/collection dependence and field-domain uncertainty; this is development evidence, not a fresh final test.",
    }


def fit_research_v3(
    X: np.ndarray, labels: Sequence[str], roles: Sequence[str],
    groups: Sequence[str], output_dir: str | Path, *,
    clip_ids: Sequence[str], pcm_sha256: Sequence[str], datasets: Sequence[str],
    embedding_contract: dict[str, Any], random_seed: int = 18043,
    criteria: ReadinessCriteria = DEFAULT_CRITERIA,
) -> dict[str, Any]:
    """Fit/calibrate on development only; rejects test/ood_test roles outright.

    Known roles: train, calibration, audit. Unknown roles are prefixed unknown_.
    The same session/uploader must stay in one phase, including across known
    and unknown labels. Duplicate clip IDs or PCM hashes are never counted twice.
    Old inspected v1/v2 test material may be explicitly assigned development
    roles by the dataset builder; it is never called fresh evidence here.
    """
    validate_embedding_contract(embedding_contract)
    _validate_criteria(criteria)
    if sklearn.__version__ != "1.7.2":
        raise ValueError("Fitting requires the pinned scikit-learn 1.7.2 backend")
    destination = Path(output_dir)
    output_names = ("research_head_v3.json", "development_v3.json", "development_manifest_v3.json")
    if any((destination / name).exists() for name in output_names):
        raise ValueError("Preserve existing fitted outputs; use a new experiment directory")
    qX = quantize_embeddings(X)
    n = len(qX)
    y, role, owner, ids, hashes, sources = [_strings(v, name, n) for name, v in [("labels", labels), ("roles", roles), ("groups", groups), ("clip_ids", clip_ids), ("pcm_sha256", pcm_sha256), ("datasets", datasets)]]
    if set(role) != set(ROLES):
        raise ValueError(f"Require exactly nonempty development roles {ROLES}; fresh tests are not accepted")
    phase = np.asarray([r.removeprefix("unknown_") for r in role])
    _check_disjoint(owner, phase, "session/uploader")
    if len(set(ids)) != n or len(set(hashes)) != n or not all(_hex_digest(h) for h in hashes):
        raise ValueError("Unique clip IDs and lowercase PCM SHA256s are required")
    if any("mimii" in source.lower() for source in sources):
        raise ValueError("MIMII is excluded from the v3 development/release source policy")
    unknown = np.char.startswith(role, "unknown_")
    if not set(y[~unknown]).issubset(KNOWN_CLASSES) or set(y[unknown]) & set(KNOWN_CLASSES):
        raise ValueError("Known roles require fixed known labels; unknown roles cannot contain them")
    target = np.where(unknown, UNKNOWN, y)
    fit = phase == "train"
    class_order = [*KNOWN_CLASSES, UNKNOWN]
    if set(target[fit]) != set(class_order):
        raise ValueError("Fit data must contain all five known classes and explicit unknowns")
    minimum = min(len(set(owner[fit & (target == c)])) for c in class_order)
    if minimum < 3:
        raise ValueError("Group CV needs at least three independent fit groups per class, including unknowns")
    folds = min(5, minimum)
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=random_seed)
    folds_indices = list(splitter.split(qX[fit], target[fit], owner[fit]))
    for train_idx, val_idx in folds_indices:
        if set(target[fit][train_idx]) != set(class_order) or set(owner[fit][train_idx]) & set(owner[fit][val_idx]):
            raise ValueError("Invalid group fold; collect more independent fit groups")
    cv, selected, best = [], None, -math.inf
    for C in C_GRID:
        for unknown_weight in UNKNOWN_WEIGHTS:
            scores, unweighted = [], []
            for train_idx, val_idx in folds_indices:
                head = _fit_head(qX[fit][train_idx], target[fit][train_idx], owner[fit][train_idx], C, unknown_weight, random_seed)
                p = predict_fixed_v3(head, qX[fit][val_idx], integer_input=True)["labels"]
                weights = _group_weights(target[fit][val_idx], owner[fit][val_idx], 1.0)
                scores.append(float(f1_score(target[fit][val_idx], p, labels=class_order, sample_weight=weights, average="macro", zero_division=0)))
                unweighted.append(float(f1_score(target[fit][val_idx], p, labels=class_order, average="macro", zero_division=0)))
            mean = float(np.mean(scores))
            cv.append({"C": C, "unknownWeight": unknown_weight, "groupBalancedFoldMacroF1": scores, "unweightedFoldMacroF1": unweighted, "selectionMeanMacroF1": mean})
            if mean > best:
                selected, best = (C, unknown_weight), mean
    head = _fit_head(qX[fit], target[fit], owner[fit], *selected, random_seed)
    calibration = phase == "calibration"
    selection = _calibrate(head, qX[calibration], y[calibration], unknown[calibration], criteria)
    head["readinessCriteria"] = asdict(criteria)
    # Calibration rules are now frozen. Audit data is first scored below.
    parameters_hash = _json_hash(head)
    audit = phase == "audit"
    audit_result = evaluate_readiness(predict_fixed_v3(head, qX[audit], integer_input=True), y[audit], unknown[audit], owner[audit], sources[audit], criteria)
    assert _json_hash(head) == parameters_hash
    manifest = [
        {"clipId": str(ids[i]), "role": str(role[i]), "label": str(y[i]),
         "group": str(owner[i]), "dataset": str(sources[i]), "pcmSha256": str(hashes[i])}
        for i in range(n)
    ]
    head["provenance"] = {
        "embeddingContract": embedding_contract,
        "embeddingContractSha256": _json_hash(embedding_contract),
        "manifestSha256": _json_hash(manifest),
        "quantizedEmbeddingSha256ByPhase": {
            name: hashlib.sha256(qX[phase == name].astype("<i8").tobytes()).hexdigest()
            for name in ("train", "calibration", "audit")
        },
        "frozenParametersAndRulesSha256": parameters_hash,
        "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "fitRuntime": {"python": platform.python_version(), "platform": platform.platform(),
                       "numpy": np.__version__, "scikit-learn": sklearn.__version__},
    }
    report = {
        "formatVersion": 3, "promotionAllowed": False, "freshTestEvaluated": False,
        "randomSeed": random_seed, "counts": {r: int(np.sum(role == r)) for r in ROLES},
        "criteria": asdict(criteria),
        "training": {
            "folds": folds, "candidateGrid": cv,
            "selected": {"C": selected[0], "unknownWeight": selected[1]},
            "selectionRoles": ["train", "unknown_train"],
            "tiePreference": "First exact mean-score tie: lower C then lower unknown weight",
            "sampleWeighting": "Equal total per class; equal groups within class; equal clips within class/group; unknown class multiplier; mean weight normalized to 1",
        },
        "calibration": selection, "developmentAudit": audit_result,
        "provenance": head["provenance"],
        "limitations": [
            "No fresh final test was evaluated.",
            "Explicit background training does not represent every possible unknown sound.",
            "Integer head parity requires identical quantized inputs; encoder/runtime drift remains an independent gate.",
            "The one-quantum guard is a fixed representation bound, not a bound on encoder drift or acceptance-bit invariance.",
            "Scores and margins are not calibrated probabilities or equipment/source identity.",
            "Browser parity, independent field validation, licensing and a fresh frozen final test are required before promotion.",
        ],
    }
    destination.mkdir(parents=True, exist_ok=True)
    for filename, value in (("research_head_v3.json", head), ("development_v3.json", report), ("development_manifest_v3.json", manifest)):
        (destination / filename).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return report


def audit_frozen_v3(
    head: dict[str, Any], X: np.ndarray, labels: Sequence[str], groups: Sequence[str], *,
    clip_ids: Sequence[str], pcm_sha256: Sequence[str], datasets: Sequence[str],
    unknown: Sequence[bool], embedding_contract: dict[str, Any],
    development_manifest: Sequence[dict[str, str]],
    previously_inspected_groups: Sequence[str], previously_inspected_clip_ids: Sequence[str],
    previously_inspected_pcm_sha256: Sequence[str],
    criteria: ReadinessCriteria = DEFAULT_CRITERIA,
) -> dict[str, Any]:
    """Optional future final audit, separate from fitting; not called by fit.

    The caller must bind the original development manifest and provide every
    previously inspected historical group. A new independent dataset remains
    the caller's provenance responsibility; this guards identifiers/hashes,
    not hidden shared backgrounds, pretraining overlap or annotation errors.
    """
    validate_embedding_contract(embedding_contract)
    provenance = head.get("provenance", {})
    if _json_hash(embedding_contract) != provenance.get("embeddingContractSha256") or _json_hash(list(development_manifest)) != provenance.get("manifestSha256"):
        raise ValueError("Final audit contract or frozen development manifest does not match")
    if head.get("readinessCriteria") != asdict(criteria):
        raise ValueError("Final audit readiness criteria changed after freeze")
    if hashlib.sha256(Path(__file__).read_bytes()).hexdigest() != provenance.get("sourceSha256"):
        raise ValueError("Final audit scorer source changed after fit")
    frozen = {key: value for key, value in head.items() if key != "provenance"}
    if _json_hash(frozen) != provenance.get("frozenParametersAndRulesSha256"):
        raise ValueError("Final audit parameters or thresholds changed after freeze")
    n = len(X)
    owners, ids, hashes = [_strings(values, name, n) for values, name in [(groups, "groups"), (clip_ids, "clip_ids"), (pcm_sha256, "pcm_sha256")]]
    seen = _strings(previously_inspected_groups, "previously_inspected_groups", len(previously_inspected_groups))
    seen_ids = _strings(previously_inspected_clip_ids, "previously_inspected_clip_ids", len(previously_inspected_clip_ids))
    seen_hashes = _strings(previously_inspected_pcm_sha256, "previously_inspected_pcm_sha256", len(previously_inspected_pcm_sha256))
    if not len(seen) or not len(seen_ids) or not len(seen_hashes) or not all(_hex_digest(h) for h in seen_hashes):
        raise ValueError("Explicit nonempty historical group/clip/PCM exclusions are required")
    dev_groups = {r["group"] for r in development_manifest}
    dev_ids = {r["clipId"] for r in development_manifest}
    dev_hashes = {r["pcmSha256"] for r in development_manifest}
    if (set(owners) & (dev_groups | set(seen))) or set(ids) & (dev_ids | set(seen_ids)) or set(hashes) & (dev_hashes | set(seen_hashes)):
        raise ValueError("Final audit overlaps development or previously inspected material")
    if len(set(ids)) != n or len(set(hashes)) != n or not all(_hex_digest(h) for h in hashes):
        raise ValueError("Final audit clip IDs and PCM hashes must be unique and valid")
    if any("mimii" in str(source).lower() for source in datasets):
        raise ValueError("MIMII is excluded from the v3 final/release source policy")
    if np.asarray(unknown).dtype != np.bool_:
        raise ValueError("Final unknown mask must contain actual booleans")
    result = evaluate_readiness(predict_fixed_v3(head, X), labels, np.asarray(unknown), owners, datasets, criteria)
    result["freshFinalAuditPassed"] = result.pop("developmentAuditPassed")
    result["freshTestEvaluated"] = True
    result["parameterAndRuleSha256"] = provenance["frozenParametersAndRulesSha256"]
    result["previouslyInspectedExclusionsSha256"] = {"groups": _json_hash(sorted(set(seen))), "clipIds": _json_hash(sorted(set(seen_ids))), "pcmSha256": _json_hash(sorted(set(seen_hashes)))}
    result["limitation"] = "Freshness is an identifier/provenance check, not proof against shared recording backgrounds or encoder pretraining overlap; clip-level Wilson intervals omit group dependence. Promotion requires independent browser, field and license review."
    return result
