"""Frozen paired website comparison; no fitting, downloading or promotion.

Only the already fitted integer head is queried. All input bytes and software
evidence are persisted before that query. A failed/finished output is immutable.
The relative recognition verdict does not substitute for product/browser checks.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import asdict
import json
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support

from ml import run_v3 as run
from ml.canonical_v3 import CanonicalBatch, load_canonical_batches
from ml.experiment_v3 import DEFAULT_CRITERIA, KNOWN_CLASSES, UNKNOWN, evaluate_readiness, predict_fixed_v3, _json_hash

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = {"path": "ml/BASELINE_COMPARISON_PROTOCOL.md", "sha256": "b8a453622e02f340b6196c1dca62abecf2646176eb324a5401e2cf05fad38aca", "commit": "dbb71588a7d4897f30fe6f64a395ace300cad6f1"}
FINAL_SHA = "197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520"
DEV_SHA = "e0c86b5613b2c0b16e3f6df8f19abe7241228eb30b3df40f67ba1632b08d9ff7"
RESERVATION_SHA = "08f9e9bcd5eecdcf7fe3273ffd8d8e75397ce3291938fd0d32fe6b8e10ea5b7b"
HEAD_SHA = "1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491"
PARAM_SHA = "6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92"
COMPLETION_SHA = "74cf3f85891cba5f940d8e19ef61eae1d922e1e1640605df48dac09d376a7dee"
CHROME_SHA = "f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4"
COUNTS = {"buzz": 36, "mechanical_fan": 35, "speech": 52, "traffic": 52, "wind": 47, "unknown": 194}
LABELS = (
    "a buzzing indoor fluorescent light fixture or lamp ballast", "an outdoor electrical transformer humming",
    "outdoor industrial ventilation fans or cooling machinery humming", "a household fan or air conditioner running",
    "road traffic passing outside", "wind blowing across a microphone", "people talking in a room", "a quiet room with background noise",
)
MAPPING = dict(zip(LABELS, ("buzz", "buzz", "mechanical_fan", "mechanical_fan", "traffic", "wind", "speech", UNKNOWN)))
BLOCKING = {"near-zero", "clipped", "near-full-scale", "incomplete", "unsupported-rate", "non-finite", "no-band-power"}
REVISION = "c28f2883575e590e04d3146ff0713c2448d691ba"
DIST = {
    "soundHints.worker-BshSXPiJ.js": {"bytes": 5204, "sha256": "26f40691a2c49f2c717beee0a4f415a1003db4f2d5c4c72ebc27cc2d644005b8"},
    "transformers.web-B7_wdX-V.js": {"bytes": 545164, "sha256": "06dfd43d60e53f8c5c191f9054abf594297c4f577eb68b337b89cd26824af8af"},
    "analysis.worker-BwKrUFVx.js": {"bytes": 10766, "sha256": "a5918dda07bf28fd7b705d797734185446be9d13ab0feb7f5b5a5025717d443f"},
    "ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm": {"bytes": 26861777, "sha256": "49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082"},
}
REMOTE = {
    "config.json": {"bytes": 699, "sha256": "39c6d90fe29cf2cce650dd5c92c38a1e35b130d9ce0bb98585222ad687ad979b"},
    "preprocessor_config.json": {"bytes": 541, "sha256": "9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753"},
    "tokenizer_config.json": {"bytes": 1392, "sha256": "2c964a338683aec3695ea37687271e75b40905233f5d2a5bbb9be8cb40c4d0a0"},
    "tokenizer.json": {"bytes": 2108774, "sha256": "dc239041d98de27ffc3975473a1a23e3db4c937b23c138c38bbc66588bd247e5"},
    "onnx/model_quantized.onnx": {"bytes": 161024085, "sha256": "3f559313ec268518193101007fc0569ee4b2cfac03e369091c50adb4795f5c5d"},
}
ORT_VERSION = "1.31.0-dev.20260914-8d85527a0"
RUNTIME = {"ort-wasm-simd-threaded.asyncify.mjs": {"bytes": 53057, "sha256": "0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611"}, "ort-wasm-simd-threaded.asyncify.wasm": DIST["ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm"]}
HARNESS = ("legacyBaselineServerV3.mjs", "legacyBaselineV3.mjs", "legacyBaselinePageV3.mjs", "legacyBaselineRoutesV3.js")
# Completed pre-AI quality-v2 sources. Later transport/resume guards may change
# the classification harness, never these raw evidence bytes or its quality mask.
QUALITY_HARNESS = {
    "legacyBaselineServerV3.mjs": "620c479e50d489b9a5cc9534dbc2a19d8f7373bc82ab076bf19aaea68053da77",
    "legacyBaselineV3.mjs": "4e4b9a4c1d5c417b7b7dff6d10691ae71c3a0d67e7f13040c032ab43524e6ab9",
    "legacyBaselinePageV3.mjs": "63f0272438fcab16d814e3ec5fc5b16b7927a983fc55fdf3e42f837e4f0fd16f",
    "legacyBaselineRoutesV3.js": "feabdb20ac6d67a6c7eaaaa95fcbf1c107f0735433cf6246e331776009e204e6",
}
EXECUTION = {"transformersVersion": "4.3.1", "ortVersion": ORT_VERSION, "device": "wasm", "dtype": "q8", "numThreads": 1, "proxy": False, "hypothesisTemplate": "{}", "assertionBasis": "unchanged verified public worker and bundled source; transport artifact GET evidence"}


def need(condition: Any, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _contract(document: dict, phase: str, staged_raw: bytes) -> dict:
    c = document.get("contract", {})
    need(document.get("schemaVersion") == 1 and type(document.get("schemaVersion")) is int and document.get("promotionAllowed") is False, "Invalid baseline/quality document")
    # Node JSON.stringify insertion order; these contracts contain integer counts.
    digest = run._sha(json.dumps(c, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode())
    need(document.get("contractSha256") == digest, "Legacy contract SHA mismatch")
    need(c.get("implementation") == "tw-legacy-website-baseline-v1" and c.get("mode") == "final" and c.get("phase") == phase and c.get("promotionAllowed") is False, "Wrong legacy phase/mode")
    need(run._equal(c.get("protocol"), PROTOCOL) and c.get("manifestSha256") == run._sha(staged_raw) and c.get("sourceManifestSha256") == FINAL_SHA, "Legacy protocol/input mismatch")
    need(run._equal(c.get("distAssets"), DIST) and c.get("deployedOrigin") == "https://tonalwatch.vercel.app" and run._equal(c.get("labels"), list(LABELS)), "Legacy public assets/prompts changed")
    need(c.get("resamplerSha256") == "2ab0e2e2a8d3bbc8dc2d3608993c7b27c2df4726a20411e5054414f4223d0477", "Legacy resampler changed")
    expected_sources = QUALITY_HARNESS if phase == "quality" else {n: run._sha((ROOT / "ml/browser" / n).read_bytes()) for n in HARNESS}
    need(run._equal(c.get("sourceHashes"), expected_sources), "Legacy harness source changed")
    need(run._equal(c.get("execution"), {**EXECUTION, "executedInThisPhase": phase == "classify"}), "Legacy execution/session options changed")
    env = c.get("environment", {})
    need(all(isinstance(env.get(k), str) and env[k] for k in ("node", "platform", "architecture")), "Missing legacy host runtime")
    remote = c.get("remoteArtifacts")
    expected = [{"index": i, "url": f"https://huggingface.co/Xenova/clap-htsat-unfused/resolve/{REVISION}/{n}", **pin} for i, (n, pin) in enumerate(REMOTE.items())]
    expected += [{"index": len(REMOTE) + i, "url": f"https://cdn.jsdelivr.net/npm/onnxruntime-web@{ORT_VERSION}/dist/{n}", **pin} for i, (n, pin) in enumerate(RUNTIME.items())]
    need(run._equal(remote, expected if phase == "classify" else []), "Legacy model/runtime artifact pins changed")
    return c


def validate_browser_evidence(before: dict, quality_before: dict, quality: dict, baseline: dict, count: int) -> None:
    need(type(before.get("schemaVersion")) is int and before["schemaVersion"] == 1 and before.get("promotionAllowed") is False and before.get("capturePhase") == "before-baseline-classification" and before.get("qualityContractSha256") == quality["contractSha256"] and before.get("baselineContractSha256") == baseline["contractSha256"], "Missing pre-classification browser/contract evidence")
    need(type(quality_before.get("schemaVersion")) is int and quality_before["schemaVersion"] == 1 and quality_before.get("promotionAllowed") is False and quality_before.get("capturePhase") == "quality-complete-before-either-classifier", "Missing pre-AI quality browser evidence")
    q = quality_before.get("browser", {})
    need(q.get("qualityContractSha256") == quality["contractSha256"] and q.get("phase") == "complete" and type(q.get("completed")) is int and q["completed"] == count and type(q.get("timeOrigin")) in (int, float) and np.isfinite(q["timeOrigin"]) and q["timeOrigin"] > 0, "Quality browser evidence is incomplete/unbound")
    browser = before.get("browser", {})
    for key in ("userAgent", "platform", "language"):
        need(isinstance(browser.get(key), str) and browser[key] and browser[key] == q.get(key), "Quality/classifier browser runtime changed")
    need("Chrome/" in browser["userAgent"] and type(browser.get("hardwareConcurrency")) is int and browser["hardwareConcurrency"] >= 1 and browser["hardwareConcurrency"] == q.get("hardwareConcurrency"), "Missing measured Chrome/hardware browser provenance")


def _identity(check: dict, row: dict, digest: str) -> None:
    need(isinstance(check, dict) and type(check.get("schemaVersion")) is int and check["schemaVersion"] == 1 and type(check.get("row")) is int and check["row"] == row["row"] and check.get("clipId") == row["clip_id"] and check.get("sourceSha256") == row["source_sha256"] and check.get("pcmSha256") == row["pcm_sha256"] and check.get("contractSha256") == digest and check.get("inputUnchanged") is True, "Checkpoint identity/integrity mismatch")


def validate_quality(document: dict, staged: dict, staged_raw: bytes) -> np.ndarray:
    c = _contract(document, "quality", staged_raw)
    need(document.get("kind") == "tw-legacy-common-quality-v1" and c.get("qualityArtifactSha256") is None, "Wrong common quality artifact")
    rows = document.get("records")
    need(isinstance(rows, list) and len(rows) == len(staged["records"]), "Incomplete quality rows")
    eligible = []
    for item, row in zip(rows, staged["records"]):
        need(run._equal({k: v for k, v in item.items() if k != "checkpoint"}, row), "Quality reordered/changed staged row")
        q = item.get("checkpoint", {})
        _identity(q, row, document["contractSha256"])
        if q.get("outcome") == "quality-error":
            need(q.get("analysis") is None and isinstance(q.get("error"), str), "Malformed quality error")
            raise ValueError("Unresolved technical quality error prevents paired comparison")
        a = q.get("analysis", {})
        need(a.get("algorithmVersion") == "tw-screen-v2" and type(a.get("sampleRateHz")) is int and a["sampleRateHz"] == row["sample_rate"] and type(a.get("sampleCount")) is int and a["sampleCount"] == row["sample_count"] and type(a.get("durationSeconds")) in (int, float) and a["durationSeconds"] == 5 and type(a.get("frameCount")) is int and a["frameCount"] == (row["sample_count"] - 8192) // 4096 + 1, "Quality actual-rate/duration/method mismatch")
        codes = a.get("qualityCodes")
        need(isinstance(codes, list) and all(isinstance(x, str) for x in codes) and q.get("error") is None, "Invalid quality flags")
        ok = not bool(set(codes) & BLOCKING)
        need(q.get("outcome") == ("quality-eligible" if ok else "blocked-by-quality"), "Shared quality mask changed")
        eligible.append(ok)
    def counts(indices):
        return {"total": len(indices), "eligible": sum(eligible[i] for i in indices), "blocked": sum(not eligible[i] for i in indices), "error": 0}
    labels = [r["label"] for r in rows]
    expected = {**counts(range(len(rows))), "perClass": {label: counts([i for i, v in enumerate(labels) if v == label]) for label in sorted(set(labels))}}
    need(run._equal(document.get("counts"), expected), "Quality denominators do not match rows")
    return np.asarray(eligible, dtype=np.bool_)


def validate_baseline(document: dict, quality: dict, quality_raw: bytes, staged: dict, staged_raw: bytes, data) -> tuple[np.ndarray, list, np.ndarray]:
    c = _contract(document, "classify", staged_raw)
    qsha = run._sha(quality_raw)
    need(c.get("qualityArtifactSha256") == qsha, "Baseline did not consume exact frozen quality bytes")
    rows = document.get("records")
    need(isinstance(rows, list) and len(rows) == len(staged["records"]), "Incomplete paired baseline rows")
    labels, top2, errors = [], [], []
    for i, (item, row, frozen) in enumerate(zip(rows, staged["records"], quality["records"])):
        need(run._equal({k: v for k, v in item.items() if k != "checkpoint"}, row), "Baseline reordered/changed staged row")
        q = item.get("checkpoint", {})
        _identity(q, row, document["contractSha256"])
        need(q.get("qualityArtifactSha256") == qsha and run._equal(q.get("analysis"), frozen["checkpoint"]["analysis"]), "Baseline quality mask changed")
        outcome = q.get("outcome")
        if frozen["checkpoint"]["outcome"] == "blocked-by-quality":
            need(outcome == "blocked-by-quality" and q.get("rawResponse") is None, "Quality-blocked baseline emitted hints")
            labels.append(UNKNOWN); top2.append([]); errors.append(False); continue
        if outcome == "error":
            response = q.get("rawResponse", {})
            need(response.get("type") == "error" and type(response.get("sessionId")) is int and response["sessionId"] == i + 1 and response.get("code") in {"invalid-input", "unavailable", "runtime", "harness-error"} and isinstance(response.get("message"), str), "Malformed baseline error")
            labels.append(UNKNOWN); top2.append([]); errors.append(True); continue
        response = q.get("rawResponse", {})
        r = response.get("result", {})
        need(outcome == "result" and response.get("type") == "result" and type(response.get("sessionId")) is int and response["sessionId"] == i + 1 and r.get("status") == "uncertain" and r.get("modelId") == "Xenova/clap-htsat-unfused" and r.get("modelRevision") == REVISION, "Legacy successful response changed")
        ranking = r.get("rankings")
        need(isinstance(ranking, list) and len(ranking) == 2 and all(isinstance(x, dict) and x.get("label") in MAPPING and type(x.get("score")) in (int, float) and np.isfinite(x["score"]) and 0 <= x["score"] <= 1 for x in ranking), "Require ONLY original top2 finite scores")
        first, second = ranking
        need(first["label"] != second["label"] and first["score"] >= second["score"] and (first["score"] != second["score"] or LABELS.index(first["label"]) < LABELS.index(second["label"])), "Original ranking/tie order changed")
        gate = first["score"] >= .55 and first["score"] - second["score"] >= .20
        need(r.get("provisionalGatePassed") is gate and r.get("reason") == ("not-validated" if gate else "weak-separation"), "Provisional gate was reinterpreted")
        expected = {"originalSampleRateHz": row["sample_rate"], "originalSampleCount": row["sample_count"], "observationSeconds": 5, "modelSampleRateHz": 48000, "modelInputSamples": 240000, "processorSeconds": 10, "padding": "zero-pad", "configuredPadding": "repeatpad", "featureBandHz": [50, 14000]}
        need(run._equal(r.get("preprocessing"), expected), "Legacy preprocessing changed")
        timing = r.get("timing", {})
        need(all(type(timing.get(k)) in (int, float) and np.isfinite(timing[k]) and timing[k] >= 0 for k in ("modelLoadMs", "inferenceMs", "totalMs")) and type(timing.get("reusedModel")) is bool, "Invalid legacy timing")
        need(q.get("resampledPcmSha256") == data.records[i]["extraction_row"]["checkpoint"]["repeats"][0]["pcm48Sha256"], "Systems used different resampled PCM")
        labels.append(MAPPING[first["label"]]); top2.append([MAPPING[x["label"]] for x in ranking]); errors.append(False)
    expected_counts = {outcome: sum(r["checkpoint"]["outcome"] == outcome for r in rows) for outcome in ("result", "blocked-by-quality", "error")}
    need(run._equal(document.get("outcomeCounts"), expected_counts), "Baseline outcome counts mismatch")
    return np.asarray(labels), top2, np.asarray(errors, dtype=np.bool_)


def ratio(successes: int, total: int) -> dict:
    return {"successes": int(successes), "total": int(total), "rate": float(successes / total) if total else None}


def paired_metrics(prediction: dict, baseline_labels: np.ndarray, top2: list, labels: np.ndarray, eligible: np.ndarray, groups: np.ndarray, datasets: np.ndarray, collections: np.ndarray, errors: np.ndarray) -> dict:
    """Pure fixed metric calculation. Errors remain rows and make verdict incomplete."""
    known = np.isin(labels, KNOWN_CLASSES)
    true = np.where(known, labels, UNKNOWN)
    p = np.asarray(prediction["labels"])
    accepted = np.asarray(prediction["accepted"]) & eligible
    b = np.asarray(baseline_labels)
    candidate_emits = accepted & (p != UNKNOWN)
    baseline_emits = eligible & ~errors & (b != UNKNOWN)
    ek, eu = eligible & known, eligible & ~known
    candidate_correct = candidate_emits & known & (p == labels)
    baseline_correct = baseline_emits & known & (b == labels)
    def system(predicted, emits, correct):
        precision, recall, f1, support = precision_recall_fscore_support(labels[ek], predicted[ek], labels=list(KNOWN_CLASSES), zero_division=0)
        return {"knownTop1MacroF1": float(np.mean(f1)), "perClass": [{"label": label, "eligibleTrueCount": int(support[i]), "fullTrueCount": int(np.sum(known & (labels == label))), "ungatedPrecision": float(precision[i]), "ungatedRecall": float(recall[i]), "ungatedF1": float(f1[i]), "correctAcceptedEligible": ratio(int(np.sum(correct & (labels == label))), int(support[i])), "correctAcceptedFull": ratio(int(np.sum(correct & (labels == label))), int(np.sum(known & (labels == label))))} for i, label in enumerate(KNOWN_CLASSES)],
            "knownSelectivePrecision": ratio(int(correct.sum()), int(np.sum(emits & known))), "knownEligibleOutputCoverage": ratio(int(np.sum(emits & known)), int(ek.sum())), "knownFullOutputCoverage": ratio(int(np.sum(emits & known)), int(known.sum())),
            "knownCorrectOutputs": int(correct.sum()), "knownWrongOutputs": int(np.sum(emits & known & ~correct)), "unknownEligibleHintRate": ratio(int(np.sum(emits & ~known)), int(eu.sum())), "unknownFullHintRate": ratio(int(np.sum(emits & ~known)), int(np.sum(~known))), "mixturePrecision": ratio(int(correct.sum()), int(emits.sum())), "unknownHintFamilies": {label: int(np.sum(emits & ~known & (predicted == label))) for label in KNOWN_CLASSES},
            "eligibleConfusionClassOrder": [*KNOWN_CLASSES, UNKNOWN], "eligibleUngatedConfusion": confusion_matrix(true[eligible], predicted[eligible], labels=[*KNOWN_CLASSES, UNKNOWN]).tolist()}
    cm, bm = system(p, candidate_emits, candidate_correct), system(b, baseline_emits, baseline_correct)
    complete = not bool(errors.any()) and all(np.any(ek & (labels == label)) for label in KNOWN_CLASSES) and bool(eu.any()) and cm["knownSelectivePrecision"]["rate"] is not None and bm["knownSelectivePrecision"]["rate"] is not None
    checks = {"strictlyGreaterKnownMacroF1": cm["knownTop1MacroF1"] > bm["knownTop1MacroF1"], "knownSelectivePrecisionAtLeastBaseline": complete and cm["knownSelectivePrecision"]["rate"] >= bm["knownSelectivePrecision"]["rate"], "unknownHintRateAtMostBaseline": complete and cm["unknownEligibleHintRate"]["rate"] <= bm["unknownEligibleHintRate"]["rate"], "allFiveClassesHaveCorrectAcceptance": all(np.any(candidate_correct & (labels == label)) for label in KNOWN_CLASSES), "completePairedRecognition": complete}
    any_top2 = np.asarray([any(v != UNKNOWN for v in ranking) for ranking in top2]) & eligible & ~errors
    top2correct = np.asarray([label in ranking for label, ranking in zip(labels, top2)]) & ek & ~errors
    subgroup = {}
    for name, values in (("group", groups), ("dataset", datasets), ("collection", collections)):
        subgroup[name] = [{"value": str(value), "total": int(np.sum(values == value)), "eligible": int(np.sum(eligible & (values == value))), "known": int(np.sum(known & (values == value))), "unknown": int(np.sum(~known & (values == value))), "candidateCorrectKnown": int(np.sum(candidate_correct & (values == value))), "baselineCorrectKnown": int(np.sum(baseline_correct & (values == value))), "candidateKnownHints": int(np.sum(candidate_emits & known & (values == value))), "baselineKnownHints": int(np.sum(baseline_emits & known & (values == value))), "candidateUnknownHints": int(np.sum(candidate_emits & ~known & (values == value))), "baselineUnknownHints": int(np.sum(baseline_emits & ~known & (values == value))), "baselineErrors": int(np.sum(errors & (values == value)))} for value in sorted(set(values))]
    return {"relativeRecognitionPassed": bool(all(checks.values())), "relativeChecks": {k: bool(v) for k, v in checks.items()}, "status": "complete" if complete else "inconclusive", "candidate": cm, "baseline": bm, "pairedKnownMacroF1Difference": cm["knownTop1MacroF1"] - bm["knownTop1MacroF1"], "counts": {"total": len(labels), "qualityEligible": int(eligible.sum()), "qualityBlockedBothAbstain": int((~eligible).sum()), "eligibleKnown": int(ek.sum()), "eligibleUnknown": int(eu.sum()), "fullKnown": int(known.sum()), "fullUnknown": int((~known).sum()), "baselineErrors": int(errors.sum())}, "baselineActualTop2Exposure": {"trueKnownFamilyIncluded": ratio(int(top2correct.sum()), int(ek.sum())), "unknownAnyKnownFamilyEligible": ratio(int(np.sum(any_top2 & ~known)), int(eu.sum())), "unknownAnyKnownFamilyFull": ratio(int(np.sum(any_top2 & ~known)), int((~known).sum())), "quietTop1WithKnownSecondOnUnknown": int(np.sum(eu & (b == UNKNOWN) & any_top2))}, "subgroups": subgroup, "productIntegrationAllowed": False, "independentProductChecksRequired": True, "intervals": "Optional paired bootstrap omitted; no significance claim; groups/collections dependent."}


def _fit(fit_dir: Path) -> tuple[dict, dict, dict, dict, dict[str, bytes]]:
    raw, completed = run._read(fit_dir / "fit-completion.json", COMPLETION_SHA)
    need(completed.get("complete") is True and completed.get("phase") == "fit" and completed.get("promotionAllowed") is False, "Incomplete frozen fit")
    ledger = completed.get("artifacts", {})
    need({"fit-input.json", *run.MODEL_OUTPUTS}.issubset(ledger), "Missing fit artifact ledger")
    payload = {"fit/fit-completion.json": raw}
    for name, info in ledger.items():
        data = (fit_dir / run._relative(name)).read_bytes()
        need(isinstance(info, dict) and type(info.get("bytes")) is int and len(data) == info["bytes"] and run._sha(data) == info.get("sha256"), "Fit artifact bytes changed")
        payload["fit/" + name] = data
    _, evidence = run._read(fit_dir / "fit-input.json", completed.get("fitInputSha256"))
    need(evidence.get("phase") == "fit" and evidence.get("seed") == 18043 and run._equal(evidence.get("criteria"), asdict(DEFAULT_CRITERIA)) and run._equal(evidence.get("sourceSha256"), run._sources()), "Frozen fit scientific source/rules changed")
    need(run._equal({k: v for k, v in ledger.items() if k not in {"fit-input.json", *run.MODEL_OUTPUTS}}, evidence.get("artifacts")), "Fit input/completion ledger mismatch")
    need(evidence.get("developmentSourceSha256") == DEV_SHA and evidence.get("frozenFinalSourceSha256") == FINAL_SHA, "Fit used another development/final cohort")
    dev, _, exclusions = run._development_bundle(fit_dir / "inputs/development/manifest-v3-development.json", DEV_SHA)
    need(dev["sidecars"]["final-reservations.json"] == RESERVATION_SHA, "Final reservations changed")
    head, _ = run._model_binding(fit_dir, dev, evidence)
    need(run._sha(payload["fit/research_head_v3.json"]) == HEAD_SHA and head["provenance"]["frozenParametersAndRulesSha256"] == PARAM_SHA, "Candidate head/parameters changed")
    _, report = run._read(fit_dir / "development_v3.json")
    return evidence, dev, exclusions, head, payload


def compare(fit_dir: str | Path, source_manifest: str | Path, staged_manifest: str | Path, embeddings: str | Path,
            quality_results: str | Path, baseline_results: str | Path, output_dir: str | Path, *,
            quality_sha256: str, baseline_sha256: str, embeddings_sha256: str,
            qualification_comparison: str | Path, qualification_embeddings: str | Path, qualification_staged_manifest: str | Path,
            golden_reference: str | Path, browser_evidence: str | Path, browser_evidence_sha256: str,
            quality_browser_evidence: str | Path, quality_browser_evidence_sha256: str) -> Path:
    """Validate all frozen bytes/lineages, persist evidence, then predict once."""
    need(not Path(output_dir).exists(), "Comparison output is immutable; preserve original attempt")
    evidence, dev, exclusions, head, payload = _fit(Path(fit_dir))
    evaluator_runtime = run._runtime()
    need(run._equal(evaluator_runtime["packages"], evidence["fitRuntime"]["packages"]), "Require the same frozen numerical/metric package versions")
    protocol_raw = (ROOT / PROTOCOL["path"]).read_bytes()
    need(run._sha(protocol_raw) == PROTOCOL["sha256"], "Frozen comparison protocol changed")
    source_raw, source = run._read(source_manifest, FINAL_SHA)
    records = source.get("records")
    need(isinstance(records, list) and Counter(r.get("label") for r in records) == COUNTS and len(records) == sum(COUNTS.values()), "Require entire fixed ordered cohort")
    need(all(r.get("split") == ("test" if r["label"] in KNOWN_CLASSES else "ood_test") and not any(k in r for k in ("role", "v3_role", "historical_development_only")) for r in records), "Final source role changed")
    run._freshness(records, dev, exclusions)
    staged_raw, staged = run._bind_source(source_raw, source, staged_manifest)
    roles = {r["clip_id"]: "final" if r["label"] in KNOWN_CLASSES else "unknown_final" for r in records}
    groups = {r["clip_id"]: r.get("v3_group", r.get("uploader_group", r["uploader"])) for r in records}
    embedding_raw, _ = run._read(embeddings, embeddings_sha256)
    data = load_canonical_batches([CanonicalBatch(embeddings, staged_manifest)], roles, group_by_clip_id=groups, allow_final=True)
    need(run._equal(data.embedding_contract, evidence["embeddingContract"]), "Candidate final encoder differs from fit")
    need(data.batch_provenance[0]["embeddings_sha256"] == run._sha(embedding_raw) and data.batch_provenance[0]["staged_manifest_sha256"] == run._sha(staged_raw), "Candidate artifacts changed during verification")
    qualified, q_payload = run._qualify(qualification_comparison, qualification_embeddings, qualification_staged_manifest, golden_reference, CHROME_SHA, data)
    quality_raw, quality = run._read(quality_results, quality_sha256)
    baseline_raw, baseline = run._read(baseline_results, baseline_sha256)
    browser_raw, browser = run._read(browser_evidence, browser_evidence_sha256)
    quality_browser_raw, quality_browser = run._read(quality_browser_evidence, quality_browser_evidence_sha256)
    # The approved original quality implementation remains separately archived;
    # never relabel its source provenance as the later classification guards.
    for name, digest in QUALITY_HARNESS.items():
        raw = (Path(quality_results).parent / "source" / name).read_bytes()
        need(run._sha(raw) == digest, "Approved pre-AI quality source snapshot changed/missing")
        payload["inputs/quality-source/" + name] = raw
    eligible = validate_quality(quality, staged, staged_raw)
    b, top2, errors = validate_baseline(baseline, quality, quality_raw, staged, staged_raw, data)
    validate_browser_evidence(browser, quality_browser, quality, baseline, len(records))
    payload.update({"inputs/final-source.json": source_raw, "inputs/final-staged.json": staged_raw, "inputs/final-embeddings.json": embedding_raw, "inputs/quality-results.json": quality_raw, "inputs/baseline-results.json": baseline_raw, "inputs/browser-evidence.json": browser_raw, "inputs/quality-browser-evidence.json": quality_browser_raw, "protocol.md": protocol_raw})
    payload.update({"inputs/qualification/" + k: v for k, v in q_payload.items()})
    sources = {**run._sources(), "ml/compare_website_v3.py": run._sha(Path(__file__).read_bytes()), **{"ml/browser/" + n: run._sha((ROOT / "ml/browser" / n).read_bytes()) for n in HARNESS}}
    for name in sources:
        raw = (ROOT / name).read_bytes()
        need(run._sha(raw) == sources[name], "Comparison source changed while freezing evidence")
        payload["sources/" + name] = raw
    input_evidence = {"formatVersion": 1, "phase": "fixed-website-paired-comparison", "protocol": PROTOCOL, "promotionAllowed": False, "refittingOrRetuningAllowed": False, "artifacts": run._info(payload), "sourceSha256": sources, "evaluatorRuntime": evaluator_runtime, "originalFitRuntime": evidence["fitRuntime"], "candidateQualification": qualified, "embeddingContract": data.embedding_contract, "candidateBatchProvenance": list(data.batch_provenance), "roleByClipId": roles, "groupByClipId": groups, "commonQualityCounts": quality["counts"], "originalStrictCriteria": asdict(DEFAULT_CRITERIA), "mapping": MAPPING, "frozenHeadSha256": HEAD_SHA, "frozenParametersAndRulesSha256": PARAM_SHA, "allHistoricalExclusionsSha256": dev["sidecars"]["historical-exclusions.json"], "finalReservationsSha256": RESERVATION_SHA}
    destination = run._start(output_dir, payload, input_evidence, "comparison")
    try:
        # The exact common mask precedes prediction and is applied before every metric.
        # Blocked rows are never queried by the head and have no family hint.
        prediction = {"labels": np.full(len(records), UNKNOWN, dtype="<U32"), "accepted": np.zeros(len(records), dtype=np.bool_), "integerScores": np.zeros((len(records), 6), dtype=np.int64), "guardedMargin": np.zeros(len(records), dtype=np.int64)}
        if eligible.any():
            part = predict_fixed_v3(head, data.X[eligible])
            for key in prediction:
                prediction[key][eligible] = part[key]
        collections = np.asarray([str(r.get("collection_group", "(unspecified)")) for r in records])
        result = paired_metrics(prediction, b, top2, data.labels, eligible, data.groups, data.datasets, collections, errors)
        # Read the already checksum-bound immutable snapshot, never a mutable
        # live path after inference has started.
        old_report = json.loads(payload["fit/development_v3.json"])
        result["originalDevelopmentStrictAudit"] = old_report["developmentAudit"]
        unknown = np.asarray([r.startswith("unknown_") for r in data.roles], dtype=np.bool_)
        result["candidateOriginalStrictCriteriaFullOperational"] = evaluate_readiness(prediction, data.labels, unknown, data.groups, data.datasets)
        result["candidateOriginalStrictCriteriaEligibleOnly"] = evaluate_readiness({k: v[eligible] for k, v in prediction.items()}, data.labels[eligible], unknown[eligible], data.groups[eligible], data.datasets[eligible]) if eligible.any() else None
        result["originalStrictMetricsAreNotRelativeReleaseBar"] = True
        result["promotionAllowed"] = False
        result["limitations"] = "Prepared public clips and creator labels; group/collection/domain dependence and possible encoder pretraining overlap. Relative scores are not probabilities, certified measurements or physical-source identity. Relative recognition pass requires separate product checks before integration."
        result["records"] = [{"row": i, "clipId": r["clip_id"], "label": r["label"], "group": str(data.groups[i]), "dataset": r["dataset"], "collection": str(collections[i]), "originalSha256": r["original_sha256"], "preparedSha256": r["sha256"], "pcmSha256": r["pcm_sha256"], "qualityEligible": bool(eligible[i]), "qualityCodes": quality["records"][i]["checkpoint"]["analysis"]["qualityCodes"], "candidate": {"headQueried": bool(eligible[i]), "ungatedLabel": str(prediction["labels"][i]) if eligible[i] else None, "accepted": bool(prediction["accepted"][i]), "visibleFamily": str(prediction["labels"][i]) if prediction["accepted"][i] else None, "integerScores": prediction["integerScores"][i].tolist() if eligible[i] else None, "guardedMargin": int(prediction["guardedMargin"][i]) if eligible[i] else None}, "baseline": {"outcome": baseline["records"][i]["checkpoint"]["outcome"], "mappedTop1": str(b[i]) if eligible[i] and not errors[i] else None, "mappedTop2": top2[i], "rawResponse": baseline["records"][i]["checkpoint"]["rawResponse"]}} for i, r in enumerate(records)]
        run._save_exclusive(destination / "comparison-results.json", run._bytes(result))
        outputs = {**payload, "comparison-input.json": (destination / "comparison-input.json").read_bytes(), "comparison-results.json": (destination / "comparison-results.json").read_bytes()}
        run._save_exclusive(destination / "comparison-completion.json", run._bytes({"complete": True, "phase": "fixed-website-paired-comparison", "promotionAllowed": False, "relativeRecognitionPassed": result["relativeRecognitionPassed"], "artifacts": run._info(outputs), "comparisonInputSha256": run._sha(outputs["comparison-input.json"])}))
    except BaseException as error:
        run._save_exclusive(destination / "comparison-failed.json", run._bytes({"complete": False, "errorType": type(error).__name__, "promotionAllowed": False, "retryPolicy": "Preserve immutable failure; no parameter, metric or outcome-based row changes"}))
        raise
    return destination / "comparison-completion.json"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("fit-dir", "source-manifest", "staged-manifest", "embeddings", "embeddings-sha256", "quality-results", "quality-sha256", "baseline-results", "baseline-sha256", "qualification-comparison", "qualification-embeddings", "qualification-staged-manifest", "golden-reference", "browser-evidence", "browser-evidence-sha256", "quality-browser-evidence", "quality-browser-evidence-sha256", "output-dir"):
        parser.add_argument("--" + name, required=True)
    args = vars(parser.parse_args(argv))
    result = compare(**args)
    print(json.dumps({"completion": str(result), "sha256": run._sha(result.read_bytes()), "promotionAllowed": False}))


if __name__ == "__main__":
    main()
