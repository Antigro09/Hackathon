"""Immutable, explicit v3 fit/final orchestration; no extraction or deployment.

Fit consumes complete canonical WEB-WASM jobs and an independently pinned
26-case Chrome golden reference. Final is a separate, one-attempt operation.
Existing output directories are never resumed, overwritten or rescored.
Run ``python -m ml.run_v3 --help`` for the required raw-byte pins.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import importlib
import json
from pathlib import Path, PurePosixPath
import platform
import sys
from typing import Any

import numpy as np

from ml.canonical_v3 import CanonicalBatch, derive_embedding_contract, load_canonical_batches
from ml.data_v3 import DEFAULT_PINNED_SOURCES, KNOWN, SEED, _aliases, _license
from ml.experiment_v3 import DEFAULT_CRITERIA, ROLES, _json_hash, _validated_head, audit_frozen_v3, fit_research_v3

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = (
    "ml/run_v3.py", "ml/data_v3.py", "ml/canonical_v3.py", "ml/experiment_v3.py",
    "ml/experiment.py", "ml/features.py", "ml/requirements.txt", "ml/V3_PROTOCOL.md",
    "ml/browser/prepareCanonical.py", "ml/browser/extractCanonicalNode.mjs",
    "ml/browser/canonicalEncoder.mjs", "ml/browser/canonicalCheckpoint.mjs",
    "ml/browser/canonicalServer.mjs", "ml/browser/canonicalPage.mjs",
    "src/ai/model.ts", "src/ai/resample.ts",
)
MODEL_OUTPUTS = ("research_head_v3.json", "development_v3.json", "development_manifest_v3.json")


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _hex(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()


def _equal(a: Any, b: Any) -> bool:
    return _bytes(a) == _bytes(b)


def _read(path: str | Path, expected: str | None = None) -> tuple[bytes, Any]:
    raw = Path(path).read_bytes()
    if len(raw) > 256 * 1024 * 1024:
        raise ValueError("JSON artifact exceeds bounded size")
    if expected is not None and (not _hex(expected) or _sha(raw) != expected):
        raise ValueError(f"Raw artifact SHA256 mismatch: {path}")
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    def invalid(value):
        raise ValueError(f"Non-finite JSON constant: {value}")
    return raw, json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def _relative(value: Any) -> str:
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError("Invalid artifact relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in {".", ".."} for p in value.split("/")):
        raise ValueError("Invalid artifact relative path")
    return value


def _text(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Missing nonempty identity")
    return value.strip()


def _group(value: Any) -> str:
    return _text(value).casefold()


def _runtime() -> dict:
    return {"python": platform.python_version(), "implementation": platform.python_implementation(),
            "platform": platform.platform(), "machine": platform.machine(),
            "packages": {name: importlib.import_module(module).__version__ for name, module in
                         (("numpy", "numpy"), ("scipy", "scipy"), ("scikit-learn", "sklearn"), ("joblib", "joblib"))}}


def _sources() -> dict[str, str]:
    return {name: _sha((ROOT / name).read_bytes()) for name in SOURCE_FILES}


def _info(payloads: dict[str, bytes]) -> dict:
    return {name: {"sha256": _sha(raw), "bytes": len(raw)} for name, raw in sorted(payloads.items())}


def _save_exclusive(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as handle:
        handle.write(raw)
        handle.flush()
        # Close/flush before starting fit/audit, so evidence precedes scoring.
        import os
        os.fsync(handle.fileno())


def _start(output_dir: str | Path, payloads: dict[str, bytes], evidence: dict, kind: str) -> Path:
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=False)
    # Evidence first; a partial or failed directory is intentionally not resumable.
    _save_exclusive(destination / f"{kind}-input.json", _bytes(evidence))
    for name, raw in sorted(payloads.items()):
        _save_exclusive(destination / _relative(name), raw)
    return destination


def _development_bundle(source_path: str | Path, expected_sha: str) -> tuple[dict, dict[str, bytes], dict]:
    path = Path(source_path)
    raw, document = _read(path, expected_sha)
    if not isinstance(document, dict) or type(document.get("schema_version")) is not int or document["schema_version"] != 3 or document.get("purpose") != "historical-development-only" or document.get("seed") != SEED:
        raise ValueError("Require the frozen blind historical development manifest")
    for key, expected in (("promotionAllowed", False), ("freshFinalRecordsIncluded", False), ("audioFilesRead", False), ("modelPredictionsRead", False)):
        if document.get(key) is not expected:
            raise ValueError("Development manifest includes final/prediction material")
    if document.get("assemblerSourceSha256") != _sha((ROOT / "ml/data_v3.py").read_bytes()):
        raise ValueError("Historical assembler source changed")
    sidecars = document.get("sidecars")
    required = {"historical-records.json", "historical-exclusions.json", "final-reservations.json", *[f"historical-manifests/{s.name}.json" for s in DEFAULT_PINNED_SOURCES]}
    if not isinstance(sidecars, dict) or set(sidecars) != required:
        raise ValueError("Incomplete historical raw manifests/ledger/exclusions/reservations")
    payloads = {"manifest-v3-development.json": raw}
    objects = {}
    for name, digest in sidecars.items():
        data, value = _read(path.parent / _relative(name), digest)
        payloads[name], objects[name] = data, value
    originals, source_info = [], []
    for pin in sorted(DEFAULT_PINNED_SOURCES, key=lambda p: p.name):
        name = f"historical-manifests/{pin.name}.json"
        data, value = payloads[name], objects[name]
        records = value.get("records") if isinstance(value, dict) else None
        if _sha(data) != pin.sha256 or not isinstance(records, list) or not records:
            raise ValueError("Historical source does not match the fixed raw snapshot")
        source_info.append({"name": pin.name, "sha256": pin.sha256, "bytes": len(data), "records": len(records)})
        originals.extend({"manifest": pin.name, "recordIndex": i, "record": r} for i, r in enumerate(records))
    if not _equal(document.get("sourceManifests"), source_info) or not _equal(objects["historical-records.json"], {"sourceManifests": source_info, "records": originals}):
        raise ValueError("Original historical ledger differs from complete fixed sources")
    ledger = objects["historical-exclusions.json"]
    if not isinstance(ledger, dict):
        raise ValueError("Missing historical exclusions")
    all_rows = [dict(x["record"], dataset=x["record"].get("dataset", "FSD50K")) for x in originals]
    for field, original_field in (("clip_ids", "clip_id"), ("original_sha256", "original_sha256"), ("prepared_sha256", "sha256"), ("pcm_sha256", "pcm_sha256")):
        if ledger.get(field) != sorted({r[original_field] for r in all_rows}):
            raise ValueError("Historical exclusion list omits inspected material")
    hashes = {r[key] for r in all_rows for key in ("original_sha256", "sha256", "pcm_sha256")}
    aliases = {a for r in all_rows for a in _aliases(r)}
    owners = {_group(r[key]) for r in all_rows for key in ("uploader", "uploader_group")}
    if not all(_hex(h) for h in hashes) or ledger.get("all_hashes") != sorted(hashes) or not aliases.issubset(ledger.get("lineage_aliases", [])) or not owners.issubset(ledger.get("groups", [])):
        raise ValueError("Historical hash or ownership exclusions are incomplete")
    reservation = objects["final-reservations.json"]
    if not isinstance(reservation, dict) or document.get("finalReservations", {}).get("sha256") != _sha(payloads["final-reservations.json"]) or not _equal(document["finalReservations"].get("document"), reservation):
        raise ValueError("Frozen final reservation bytes differ")
    records = document.get("records")
    assignments = document.get("assignments", {})
    if not isinstance(records, list) or not records or not isinstance(assignments, dict):
        raise ValueError("Missing complete development records/assignments")
    roles = {r["clip_id"]: r.get("role") for r in records}
    groups = {r["clip_id"]: r.get("v3_group") for r in records}
    if len(roles) != len(records) or set(roles.values()) != set(ROLES) or not _equal(assignments, {"roleByClipId": roles, "groupByClipId": groups}):
        raise ValueError("Frozen whole-lineage roles/groups are incomplete")
    original_lookup = {(entry["manifest"], entry["recordIndex"]): entry["record"] for entry in originals}
    for r in records:
        if r.get("split") != roles[r["clip_id"]] or r.get("historical_development_only") is not True or "mimii" in str(r.get("dataset", "")).casefold() or _license(r.get("license")) is None:
            raise ValueError("Ineligible source or final record in fit")
        if r["clip_id"] not in ledger["clip_ids"] or any(r[key] not in hashes for key in ("original_sha256", "sha256", "pcm_sha256")):
            raise ValueError("Development row is outside historical source lineage")
        history = r.get("history")
        if not isinstance(history, list) or not history or any(not isinstance(h, dict) or type(h.get("recordIndex")) is not int or (h.get("manifest"), h["recordIndex"]) not in original_lookup for h in history):
            raise ValueError("Development row lacks original history references")
        original = dict(original_lookup[(history[0]["manifest"], history[0]["recordIndex"])])
        original.setdefault("dataset", "FSD50K")
        additions = {"history", "historical_split", "v3_group", "role", "v3_phase", "historical_development_only", "split", "local_path"}
        if r.get("historical_split") != original["split"] or not _equal({k: v for k, v in r.items() if k not in additions}, {k: v for k, v in original.items() if k not in {"split", "local_path"}}):
            raise ValueError("Development labels/metadata differ from original historical lineage")
        group = r["v3_group"]
        frozen_aliases = ledger.get("lineage_groups", {}).get(group)
        if not isinstance(frozen_aliases, list) or not _equal(document.get("groupLineageAliases", {}).get(group), frozen_aliases) or not _aliases(r).issubset(frozen_aliases):
            raise ValueError("Development group differs from complete historical lineage")
    return document, payloads, ledger


def _bind_source(source_raw: bytes, source: dict, staged_path: str | Path) -> tuple[bytes, dict]:
    raw, staged = _read(staged_path)
    records = source.get("records") if isinstance(source, dict) else None
    rows = staged.get("records") if isinstance(staged, dict) else None
    if not isinstance(staged, dict) or staged.get("sourceManifestSha256") != _sha(source_raw) or not isinstance(records, list) or not records or not isinstance(rows, list) or len(rows) != len(records):
        raise ValueError("Staging must bind the exact complete source manifest bytes")
    if any(not isinstance(row, dict) or not _equal(row.get("source_record"), record) for row, record in zip(rows, records)):
        raise ValueError("Staged source records differ or are reordered/subselected")
    return raw, staged


def _qualification_document(document: Any, staged: dict | None = None) -> tuple[dict, dict]:
    if not isinstance(document, dict) or type(document.get("schemaVersion")) is not int or document["schemaVersion"] != 1 or document.get("promotionAllowed") is not False:
        raise ValueError("Invalid qualification embeddings")
    contract = document.get("contract")
    if not isinstance(contract, dict):
        raise ValueError("Missing qualification encoder contract")
    fingerprint = derive_embedding_contract(contract)
    digest = _sha(json.dumps(contract, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode())
    if document.get("contractSha256") != digest:
        raise ValueError("Qualification contract SHA mismatch")
    rows = document.get("records")
    repeats = contract.get("repeatCount")
    if not isinstance(rows, list) or len(rows) != 26 or type(repeats) is not int or not 2 <= repeats <= 10:
        raise ValueError("Qualification requires all 26 cases and at least two bit-exact repeats")
    if staged is not None and (len(staged.get("records", [])) != 26 or any(not _equal({k: v for k, v in row.items() if k != "checkpoint"}, expected) for row, expected in zip(rows, staged["records"]))):
        raise ValueError("Qualification rows differ from complete staged order")
    ids = set()
    for index, row in enumerate(rows):
        clip = _text(row.get("clip_id"))
        if clip in ids or type(row.get("row")) is not int or row["row"] != index or type(row.get("sample_rate")) is not int or row["sample_rate"] not in (44100, 48000) or row.get("sample_count") != row["sample_rate"] * 5:
            raise ValueError("Qualification row identity/sample count mismatch")
        ids.add(clip)
        check = row.get("checkpoint", {})
        if type(check.get("schemaVersion")) is not int or check["schemaVersion"] != 1 or type(check.get("row")) is not int or check["row"] != index or check.get("clipId") != clip or check.get("contractSha256") != digest or check.get("sourceSha256") != row.get("source_sha256") or check.get("pcmSha256") != row.get("pcm_sha256") or not all(_hex(row.get(k)) for k in ("source_sha256", "pcm_sha256")):
            raise ValueError("Qualification checkpoint identity mismatch")
        values = check.get("embedding")
        if not isinstance(values, list) or len(values) != 512 or any(type(x) not in (int, float) or not np.isfinite(x) for x in values):
            raise ValueError("Invalid qualification embedding")
        vector = np.asarray(values, dtype=np.float32)
        if not np.array_equal(vector.astype(np.float64), np.asarray(values, dtype=np.float64)) or abs(np.linalg.norm(vector.astype(np.float64)) - 1) > 1e-6:
            raise ValueError("Qualification embedding is not canonical normalized Float32")
        embedding_sha = _sha(vector.astype("<f4").tobytes())
        history = check.get("repeats")
        if not isinstance(history, list) or len(history) != repeats:
            raise ValueError("Incomplete qualification repeats")
        for repeat in history:
            if not isinstance(repeat, dict) or repeat.get("embeddingSha256") != embedding_sha or any(not _hex(repeat.get(k)) or repeat[k] != history[0].get(k) for k in ("pcm48Sha256", "featureSha256", "embeddingSha256")):
                raise ValueError("Qualification repeat/checkpoint hashes mismatch")
            for key in ("preprocessingMs", "inferenceMs"):
                if type(repeat.get(key)) not in (int, float) or not np.isfinite(repeat[key]) or repeat[key] < 0:
                    raise ValueError("Invalid qualification timing")
    return fingerprint, contract


def _qualify(comparison_path: str | Path, embeddings_path: str | Path, staged_path: str | Path,
             reference_path: str | Path, reference_sha256: str, phase_data) -> tuple[dict, dict[str, bytes]]:
    comparison_raw, comparison = _read(comparison_path)
    actual_raw, actual = _read(embeddings_path)
    staged_raw, staged = _read(staged_path)
    reference_raw, reference = _read(reference_path, reference_sha256)
    stable, contract = _qualification_document(actual, staged)
    reference_stable, reference_contract = _qualification_document(reference)
    if contract.get("manifestSha256") != _sha(staged_raw) or not _hex(staged.get("sourceManifestSha256")):
        raise ValueError("Qualification staged manifest identity mismatch")
    if "runtimeHashes" not in contract or "runtimeHashes" in reference_contract or "files" not in reference_contract:
        raise ValueError("Require local Node WEB-WASM qualification against the pinned Chrome reference")
    if not _equal(stable, reference_stable) or not _equal(stable, phase_data.embedding_contract):
        raise ValueError("Qualification uses a different stable encoder fingerprint")
    for provenance in phase_data.batch_provenance:
        if not _equal(provenance["contract"].get("environment"), contract.get("environment")):
            raise ValueError("Phase OS/Node/V8/architecture differs from its qualified local runtime")
    if comparison.get("complete") is not True or comparison.get("allBitExact") is not True or comparison.get("promotionAllowed") is not False or comparison.get("contractSha256") != actual["contractSha256"]:
        raise ValueError("Qualification comparison did not pass this exact contract")
    cases = comparison.get("cases")
    if not isinstance(cases, list) or len(cases) != 26:
        raise ValueError("Qualification comparison omits cases")
    for row, expected, case in zip(actual["records"], reference["records"], cases):
        a, b = row["checkpoint"]["repeats"][0], expected["checkpoint"]["repeats"][0]
        if row["clip_id"] != expected["clip_id"] or case.get("clipId") != row["clip_id"] or any(case.get(k) is not True for k in ("pcmBitExact", "featuresBitExact", "embeddingBitExact")) or type(case.get("embeddingMaxAbs")) not in (int, float) or case["embeddingMaxAbs"] != 0:
            raise ValueError("Qualification ordered case comparison mismatch")
        if row["pcm_sha256"] != expected["pcm_sha256"] or any(a[k] != b[k] for k in ("pcm48Sha256", "featureSha256", "embeddingSha256")) or not _equal(row["checkpoint"]["embedding"], expected["checkpoint"]["embedding"]):
            raise ValueError("Recomputed qualification differs from the pinned reference")
        browser = expected["checkpoint"].get("browser", {})
        if not isinstance(browser.get("userAgent"), str) or "Chrome/" not in browser["userAgent"] or browser.get("transformersVersion") != "4.3.1" or browser.get("ortVersion") != contract["ortVersion"]:
            raise ValueError("Golden reference lacks Chrome provenance")
    payloads = {"comparison.json": comparison_raw, "embeddings.json": actual_raw,
                "staged.json": staged_raw, "chrome-reference.json": reference_raw}
    evidence = {"cases": 26, "allRecomputedBitExact": True, "referenceSha256": reference_sha256,
                "contractSha256": actual["contractSha256"], "embeddingContract": stable,
                "qualifiedNodeEnvironment": contract["environment"], "qualificationOnlyNeverFitRows": True}
    return evidence, payloads


def fit_v3(development_manifest: str | Path, staged_manifest: str | Path, embeddings: str | Path,
           qualification_comparison: str | Path, qualification_embeddings: str | Path,
           qualification_staged_manifest: str | Path, golden_reference: str | Path,
           output_dir: str | Path, *, expected_development_sha256: str,
           golden_reference_sha256: str, frozen_final_source_sha256: str) -> Path:
    """Verify/freeze all evidence, then fit once. Never accepts final rows."""
    if Path(output_dir).exists():
        raise ValueError("Fit output is immutable; preserve the existing attempt")
    if not _hex(frozen_final_source_sha256):
        raise ValueError("Pin the unchanged final source manifest before fit")
    document, dev_payloads, _ = _development_bundle(development_manifest, expected_development_sha256)
    source_raw = dev_payloads["manifest-v3-development.json"]
    staged_raw, _ = _bind_source(source_raw, document, staged_manifest)
    maps = document["assignments"]
    data = load_canonical_batches([CanonicalBatch(embeddings, staged_manifest)], maps["roleByClipId"], group_by_clip_id=maps["groupByClipId"], reserved_final_groups=document["finalReservations"]["document"].get("groups", []))
    qualification, q_payloads = _qualify(qualification_comparison, qualification_embeddings, qualification_staged_manifest, golden_reference, golden_reference_sha256, data)
    embedding_raw, _ = _read(embeddings)
    if _sha(embedding_raw) != data.batch_provenance[0]["embeddings_sha256"] or _sha(staged_raw) != data.batch_provenance[0]["staged_manifest_sha256"]:
        raise ValueError("Embeddings/staging changed during verification")
    payloads = {"inputs/development/" + k: v for k, v in dev_payloads.items()}
    payloads.update({"inputs/qualification/" + k: v for k, v in q_payloads.items()})
    payloads.update({"inputs/development-staged.json": staged_raw, "inputs/development-embeddings.json": embedding_raw})
    sources = _sources()
    payloads.update({"sources/" + name: (ROOT / name).read_bytes() for name in sources})
    if any(_sha(payloads["sources/" + name]) != digest for name, digest in sources.items()):
        raise ValueError("Source changed during evidence collection")
    evidence = {"formatVersion": 3, "phase": "fit", "promotionAllowed": False, "freshFinalEvaluated": False,
                "developmentSourceSha256": expected_development_sha256, "frozenFinalSourceSha256": frozen_final_source_sha256,
                "artifacts": _info(payloads), "sourceSha256": sources, "fitRuntime": _runtime(),
                "qualification": qualification, "embeddingContract": data.embedding_contract,
                "batchProvenance": list(data.batch_provenance), "criteria": asdict(DEFAULT_CRITERIA), "seed": SEED}
    destination = _start(output_dir, payloads, evidence, "fit")
    try:
        fit_research_v3(data.X, data.labels, data.roles, data.groups, destination, clip_ids=data.clip_ids,
                        pcm_sha256=data.pcm_sha256, datasets=data.datasets, embedding_contract=data.embedding_contract,
                        random_seed=SEED, criteria=DEFAULT_CRITERIA)
        if not _equal(_sources(), sources):
            raise ValueError("Frozen source changed during fitting")
        _model_binding(destination, document, evidence)
        complete = {**payloads, "fit-input.json": (destination / "fit-input.json").read_bytes(),
                    **{name: (destination / name).read_bytes() for name in MODEL_OUTPUTS}}
        _save_exclusive(destination / "fit-completion.json", _bytes({"formatVersion": 3, "phase": "fit", "complete": True,
                         "promotionAllowed": False, "artifacts": _info(complete), "fitInputSha256": _sha(complete["fit-input.json"])}))
    except BaseException as error:
        _save_exclusive(destination / "fit-failed.json", _bytes({"complete": False, "errorType": type(error).__name__, "promotionAllowed": False, "retryPolicy": "Preserve this immutable attempt; no automatic retry/rescore"}))
        raise
    return destination / "fit-completion.json"


def _model_binding(root: Path, development: dict, evidence: dict) -> tuple[dict, list]:
    _, head = _read(root / "research_head_v3.json")
    _, report = _read(root / "development_v3.json")
    _, manifest = _read(root / "development_manifest_v3.json")
    expected = [{"clipId": r["clip_id"], "role": r["role"], "label": r["label"], "group": r["v3_group"], "dataset": r["dataset"], "pcmSha256": r["pcm_sha256"]} for r in development["records"]]
    _validated_head(head)
    provenance = head.get("provenance", {})
    if not _equal(manifest, expected) or not _equal(provenance, report.get("provenance")) or not _equal(head.get("readinessCriteria"), evidence["criteria"]):
        raise ValueError("Fit model/manifest/provenance differs from original development lineage")
    frozen = {key: value for key, value in head.items() if key != "provenance"}
    if not _equal(provenance.get("embeddingContract"), evidence["embeddingContract"]) or provenance.get("embeddingContractSha256") != _json_hash(evidence["embeddingContract"]) or provenance.get("manifestSha256") != _json_hash(manifest) or provenance.get("frozenParametersAndRulesSha256") != _json_hash(frozen) or provenance.get("sourceSha256") != evidence["sourceSha256"]["ml/experiment_v3.py"]:
        raise ValueError("Frozen model parameters/rules/encoder/source binding differs")
    return head, manifest


def _load_fit(fit_dir: str | Path, completion_sha256: str) -> tuple[dict, dict, dict, list, dict, bytes]:
    root = Path(fit_dir)
    completion_raw, complete = _read(root / "fit-completion.json", completion_sha256)
    if complete.get("complete") is not True or complete.get("phase") != "fit" or complete.get("promotionAllowed") is not False:
        raise ValueError("Final audit requires completed frozen fitting evidence")
    artifacts = complete.get("artifacts")
    if not isinstance(artifacts, dict) or not {"fit-input.json", *MODEL_OUTPUTS}.issubset(artifacts):
        raise ValueError("Incomplete fit artifact ledger")
    for name, info in artifacts.items():
        raw = (root / _relative(name)).read_bytes()
        if not isinstance(info, dict) or type(info.get("bytes")) is not int or len(raw) != info["bytes"] or _sha(raw) != info.get("sha256"):
            raise ValueError("Frozen fit artifact bytes changed")
    _, evidence = _read(root / "fit-input.json", complete.get("fitInputSha256"))
    if evidence.get("phase") != "fit" or evidence.get("seed") != SEED or not _equal(evidence.get("criteria"), asdict(DEFAULT_CRITERIA)) or not _equal(evidence.get("sourceSha256"), _sources()) or not _equal(evidence.get("fitRuntime"), _runtime()):
        raise ValueError("Frozen fit source, runtime, criteria or seed changed")
    if not _equal({k: v for k, v in artifacts.items() if k not in {"fit-input.json", *MODEL_OUTPUTS}}, evidence.get("artifacts")):
        raise ValueError("Completion does not bind the original input evidence")
    dev, _, exclusions = _development_bundle(root / "inputs/development/manifest-v3-development.json", evidence["developmentSourceSha256"])
    head, model_manifest = _model_binding(root, dev, evidence)
    return evidence, dev, exclusions, model_manifest, head, completion_raw


def _freshness(records: list, development: dict, ledger: dict) -> None:
    old_ids = set(ledger["clip_ids"])
    old_hashes = set(ledger["all_hashes"])
    old_groups = {_group(g) for g in ledger["groups"]}
    old_aliases = set(ledger["lineage_aliases"])
    for r in development["records"]:
        old_ids.add(r["clip_id"])
        old_hashes.update(r[k] for k in ("original_sha256", "sha256", "pcm_sha256"))
        old_groups.update(_group(r[k]) for k in ("uploader", "uploader_group", "v3_group"))
        old_aliases.update(_aliases(r))
    reservation = development["finalReservations"]["document"]
    for r in records:
        if not isinstance(r, dict) or "mimii" in str(r.get("dataset", "")).casefold() or _license(r.get("license")) is None:
            raise ValueError("Ineligible final source/license")
        ids = {_text(r.get("clip_id"))}
        hashes = {r.get(k) for k in ("original_sha256", "sha256", "pcm_sha256")}
        groups = {_group(r.get(k)) for k in ("uploader", "uploader_group")}
        if r.get("v3_group") is not None:
            groups.add(_group(r["v3_group"]))
        aliases = _aliases(r)
        if not all(_hex(h) for h in hashes) or ids & old_ids or hashes & old_hashes or groups & old_groups or aliases & old_aliases:
            raise ValueError("Final audit overlaps ALL historical/development lineage or content")
        if r["clip_id"] not in reservation.get("clip_ids", []) or not groups.intersection({_group(g) for g in reservation.get("groups", [])}) or any(r[field] not in reservation.get(reserved_field, []) for field, reserved_field in (("original_sha256", "original_sha256"), ("sha256", "prepared_sha256"), ("pcm_sha256", "pcm_sha256"))):
            raise ValueError("Final row was not present in the pre-fit reservations")


def final_v3(fit_dir: str | Path, final_manifest: str | Path, staged_manifest: str | Path, embeddings: str | Path,
             qualification_comparison: str | Path, qualification_embeddings: str | Path,
             qualification_staged_manifest: str | Path, golden_reference: str | Path,
             output_dir: str | Path, *, fit_completion_sha256: str, expected_final_sha256: str,
             golden_reference_sha256: str) -> Path:
    """Verify frozen fit and fresh lineage, claim once, then audit unchanged head."""
    if Path(output_dir).exists():
        raise ValueError("Final output is immutable; preserve existing audit attempt")
    if (Path(fit_dir) / "final-audit-claim.json").exists():
        raise FileExistsError("This frozen fit already claimed its single final audit; preserve the original attempt")
    evidence, dev, exclusions, model_manifest, head, completion_raw = _load_fit(fit_dir, fit_completion_sha256)
    if expected_final_sha256 != evidence.get("frozenFinalSourceSha256") or golden_reference_sha256 != evidence["qualification"]["referenceSha256"]:
        raise ValueError("Final cohort or Chrome reference differs from the pre-fit freeze")
    source_raw, source = _read(final_manifest, expected_final_sha256)
    records = source.get("records") if isinstance(source, dict) else None
    if not isinstance(records, list) or not records:
        raise ValueError("Final source manifest must contain complete records")
    _freshness(records, dev, exclusions)
    staged_raw, _ = _bind_source(source_raw, source, staged_manifest)
    roles = {r["clip_id"]: "final" if r["label"] in KNOWN else "unknown_final" for r in records}
    groups = {r["clip_id"]: r.get("v3_group", r.get("uploader_group", r["uploader"])) for r in records}
    data = load_canonical_batches([CanonicalBatch(embeddings, staged_manifest)], roles, group_by_clip_id=groups, allow_final=True)
    if not _equal(data.embedding_contract, evidence["embeddingContract"]):
        raise ValueError("Final encoder fingerprint differs from fit")
    qualification, q_payloads = _qualify(qualification_comparison, qualification_embeddings, qualification_staged_manifest, golden_reference, golden_reference_sha256, data)
    embedding_raw, _ = _read(embeddings)
    if _sha(embedding_raw) != data.batch_provenance[0]["embeddings_sha256"] or _sha(staged_raw) != data.batch_provenance[0]["staged_manifest_sha256"]:
        raise ValueError("Final embeddings/staging changed during verification")
    frozen_head, frozen_head_value = _read(Path(fit_dir) / "research_head_v3.json", json.loads(completion_raw)["artifacts"]["research_head_v3.json"]["sha256"])
    if not _equal(frozen_head_value, head):
        raise ValueError("Frozen head changed during final preflight")
    payloads = {"inputs/final-source.json": source_raw, "inputs/final-staged.json": staged_raw,
                "inputs/final-embeddings.json": embedding_raw, "inputs/fit-completion.json": completion_raw,
                "inputs/frozen-head.json": frozen_head}
    payloads.update({"inputs/qualification/" + k: v for k, v in q_payloads.items()})
    final_evidence = {"formatVersion": 3, "phase": "final", "promotionAllowed": False,
                      "fitCompletionSha256": fit_completion_sha256, "finalSourceSha256": expected_final_sha256,
                      "artifacts": _info(payloads), "sourceSha256": _sources(), "runtime": _runtime(),
                      "qualification": qualification, "embeddingContract": data.embedding_contract,
                      "batchProvenance": list(data.batch_provenance), "criteria": asdict(DEFAULT_CRITERIA),
                      "allHistoricalExclusionsSha256": dev["sidecars"]["historical-exclusions.json"],
                      "roleByClipId": roles, "groupByClipId": groups, "refittingOrRetuningAllowed": False}
    # Claim under the FIT, not just final output, so a different output path
    # cannot repeat an audit. Failed preflight never consumes the single claim.
    claim = {"formatVersion": 3, "fitCompletionSha256": fit_completion_sha256,
             "finalInputSha256": _sha(_bytes(final_evidence)), "finalSourceSha256": expected_final_sha256,
             "outputDirectory": str(Path(output_dir).resolve()), "promotionAllowed": False}
    _save_exclusive(Path(fit_dir) / "final-audit-claim.json", _bytes(claim))
    destination = _start(output_dir, payloads, final_evidence, "final")
    try:
        result = audit_frozen_v3(head, data.X, data.labels, data.groups, clip_ids=data.clip_ids,
                    pcm_sha256=data.pcm_sha256, datasets=data.datasets,
                    unknown=np.asarray([r.startswith("unknown_") for r in data.roles], dtype=np.bool_),
                    embedding_contract=data.embedding_contract, development_manifest=model_manifest,
                    previously_inspected_groups=exclusions["groups"], previously_inspected_clip_ids=exclusions["clip_ids"],
                    previously_inspected_pcm_sha256=exclusions["pcm_sha256"], criteria=DEFAULT_CRITERIA)
        if result.get("promotionAllowed") is not False:
            raise ValueError("Final orchestration cannot promote a model")
        _save_exclusive(destination / "final-audit.json", _bytes(result))
        outputs = {**payloads, "final-input.json": (destination / "final-input.json").read_bytes(),
                   "final-audit.json": (destination / "final-audit.json").read_bytes()}
        _save_exclusive(destination / "final-completion.json", _bytes({"formatVersion": 3, "phase": "final", "complete": True,
                         "promotionAllowed": False, "artifacts": _info(outputs), "finalInputSha256": _sha(outputs["final-input.json"])}))
    except BaseException as error:
        _save_exclusive(destination / "final-failed.json", _bytes({"complete": False, "errorType": type(error).__name__, "promotionAllowed": False, "retryPolicy": "Single final audit attempt consumed; preserve evidence, never rescore"}))
        raise
    return destination / "final-completion.json"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", required=True, choices=("fit", "final"))
    parser.add_argument("--source-manifest", required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--staged-manifest", required=True)
    parser.add_argument("--embeddings", required=True)
    parser.add_argument("--qualification-comparison", required=True)
    parser.add_argument("--qualification-embeddings", required=True)
    parser.add_argument("--qualification-staged-manifest", required=True)
    parser.add_argument("--golden-reference", required=True)
    parser.add_argument("--golden-reference-sha256", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--frozen-final-source-sha256")
    parser.add_argument("--fit-dir")
    parser.add_argument("--fit-completion-sha256")
    args = parser.parse_args(argv)
    common = (args.source_manifest, args.staged_manifest, args.embeddings, args.qualification_comparison,
              args.qualification_embeddings, args.qualification_staged_manifest, args.golden_reference, args.output)
    if args.phase == "fit":
        if not args.frozen_final_source_sha256 or args.fit_dir or args.fit_completion_sha256:
            parser.error("fit requires --frozen-final-source-sha256 and rejects final-only fit arguments")
        result = fit_v3(*common, expected_development_sha256=args.source_sha256,
                        golden_reference_sha256=args.golden_reference_sha256,
                        frozen_final_source_sha256=args.frozen_final_source_sha256)
    else:
        if not args.fit_dir or not args.fit_completion_sha256 or args.frozen_final_source_sha256:
            parser.error("final requires --fit-dir and --fit-completion-sha256; no fit options")
        result = final_v3(args.fit_dir, *common, fit_completion_sha256=args.fit_completion_sha256,
                          expected_final_sha256=args.source_sha256, golden_reference_sha256=args.golden_reference_sha256)
    print(result, flush=True)


if __name__ == "__main__":
    main()
