"""Strict canonical-WASM batch loader and provenance/leakage guard for v3.

No fitting, scoring, renormalization, split assignment or implicit row selection.
The staged manifest is required to prove a batch contains every completed row.
Final roles require explicit opt-in; this does not certify final-data freshness.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from ml.features import ARTIFACT_SHA256, MODEL_ID, MODEL_REVISION

KNOWN = {"buzz", "mechanical_fan", "speech", "traffic", "wind"}
ROLES = {"train", "unknown_train", "calibration", "unknown_calibration", "audit", "unknown_audit", "final", "unknown_final"}
RUNTIME = {
    "ort.wasm.bundle.min.mjs": ("17b52c1ac62b421dc508b4c28b9a9675251c6e25dd512ef54b83a5e2c4242869", 73123),
    "ort-wasm-simd-threaded.mjs": ("c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f", 24381),
    "ort-wasm-simd-threaded.wasm": ("06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3", 14264838),
}
EXECUTION = {"provider": "wasm", "numThreads": 1, "proxy": False, "simdFeatureCheck": "fixed", "graphOptimizationLevel": "all", "executionMode": "sequential"}
NORMALIZATION = "Float64 sequential squared sum and sqrt, then Float32 coordinate division"
PREPROCESSING = "Transformers.js4.3.1 ClapFeatureExtractor: five seconds input plus five seconds zero padding"
TRANSFORMERS_SHA = "ad44c6e41ff23fd5b01fa3fe08199a0440a35711dc9f80a31132fcce08fbd432"
FINAL_COLLECTIONS = {"tobee:nu-hive", "tobee:osbh-citizen-science"}


@dataclass(frozen=True)
class CanonicalBatch:
    embeddings_path: str | Path
    staged_manifest_path: str | Path


@dataclass(frozen=True)
class CanonicalV3Data:
    X: np.ndarray
    labels: np.ndarray
    roles: np.ndarray
    groups: np.ndarray
    clip_ids: np.ndarray
    pcm_sha256: np.ndarray
    datasets: np.ndarray
    embedding_contract: dict[str, Any]
    records: tuple[dict[str, Any], ...]
    batch_provenance: tuple[dict[str, Any], ...]


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _json_hash(value: Any) -> str:
    return _sha(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode())


def _hex(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _read(path: str | Path) -> tuple[bytes, dict[str, Any]]:
    raw = Path(path).read_bytes()
    if len(raw) > 256 * 1024 * 1024:
        raise ValueError("Canonical artifact exceeds bounded JSON size")
    def invalid(value):
        raise ValueError(f"Non-finite JSON constant: {value}")
    value = json.loads(raw, parse_constant=invalid)
    if not isinstance(value, dict):
        raise ValueError("Canonical artifact must be an object")
    return raw, value


def _strict_equal(left: Any, right: Any) -> bool:
    # JSON bool/int equality must not silently turn true into schemaVersion 1.
    return _json_hash(left) == _json_hash(right)


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing nonempty {name}")
    return value


def _group(value: Any) -> str:
    return _text(value, "source group").strip().casefold()


def derive_embedding_contract(contract: Mapping[str, Any]) -> dict[str, Any]:
    """Build dataset-independent fingerprints; preserve full job contracts separately.

    OS/Node/V8, manifest identity, repeat count and timings are job provenance,
    not a reason to relabel a different encoder as equivalent. Cross-platform
    golden qualification is separately required; these hashes cannot prove it.
    """
    required = {"schemaVersion": 1, "implementation": "tw-canonical-clap-wasm-v1", "modelId": MODEL_ID,
                "revision": MODEL_REVISION, "modelFile": "onnx/audio_model_quantized.onnx",
                "modelSha256": ARTIFACT_SHA256["onnx/audio_model_quantized.onnx"],
                "transformersVersion": "4.3.1", "ortVersion": "1.31.0-dev.20260914-8d85527a0",
                "sampleRateHz": 48000, "inputDurationSeconds": 5, "featureShape": [1, 1, 1001, 64],
                "embeddingSize": 512, "normalization": NORMALIZATION, "preprocessing": PREPROCESSING,
                "execution": EXECUTION, "promotionAllowed": False,
                "runtimeSha256": {key: value[0] for key, value in RUNTIME.items()}}
    for key, expected in required.items():
        if not _strict_equal(contract.get(key), expected):
            raise ValueError(f"Unpinned canonical encoder field: {key}")
    root = Path(__file__).resolve().parents[1]
    if "runtimeHashes" in contract:
        runtime = contract["runtimeHashes"]
        expected_runtime = {key: {"sha256": value[0], "bytes": value[1]} for key, value in RUNTIME.items()}
        if not _strict_equal(runtime, expected_runtime):
            raise ValueError("Unpinned runtime bytes")
        transformer_sha = contract.get("transformersBrowserBundleSha256")
        preprocessor_sha = contract.get("preprocessorSha256")
        encoder_sha = contract.get("encoderSourceSha256")
        compiled_resampler_sha = contract.get("compiledResamplerSha256")
        compiled_model_sha = contract.get("compiledModelSha256")
        model_source_sha = contract.get("modelConfigSourceSha256")
        if contract.get("runnerSourceSha256") != _sha((root / "ml/browser/extractCanonicalNode.mjs").read_bytes()):
            raise ValueError("Extractor source differs from the recorded runner")
        environment = contract.get("environment", {})
        if not isinstance(environment, dict) or not all(isinstance(environment.get(key), str) and environment[key] for key in ("node", "v8", "platform", "architecture")):
            raise ValueError("Missing Node environment provenance")
    else:
        files = contract.get("files", {})
        for name, (digest, size) in RUNTIME.items():
            route = f"/runtime/{name}" if name.startswith("ort-wasm") else f"/{name}"
            if not _strict_equal(files.get(route), {"sha256": digest, "bytes": size}):
                raise ValueError("Unpinned browser runtime bytes")
        def file_hash(route):
            value = files.get(route, {})
            if not isinstance(value, dict) or not _hex(value.get("sha256")) or type(value.get("bytes")) is not int or value["bytes"] < 1:
                raise ValueError(f"Missing browser artifact {route}")
            return value["sha256"]
        transformer_sha = contract.get("upstreamTransformersSha256")
        preprocessor_sha = file_hash(f"/models/{MODEL_REVISION}/preprocessor_config.json")
        encoder_sha = file_hash("/canonicalEncoder.mjs")
        compiled_resampler_sha = file_hash("/app/resample.js")
        compiled_model_sha = file_hash("/app/model.js")
        # The browser contract hashes served compiled bytes, not model.ts itself.
        model_source_sha = contract.get("modelConfigSourceSha256")
        if contract.get("serverSourceSha256") != _sha((root / "ml/browser/canonicalServer.mjs").read_bytes()):
            raise ValueError("Browser extractor source differs from its recorded runner")
    if transformer_sha != TRANSFORMERS_SHA or preprocessor_sha != ARTIFACT_SHA256["preprocessor_config.json"]:
        raise ValueError("Unpinned preprocessing library/config bytes")
    if encoder_sha != _sha((root / "ml/browser/canonicalEncoder.mjs").read_bytes()) or contract.get("checkpointValidatorSha256") != _sha((root / "ml/browser/canonicalCheckpoint.mjs").read_bytes()):
        raise ValueError("Encoder/checkpoint validation source differs")
    resampler_sha = contract.get("resamplerSourceSha256")
    if resampler_sha != _sha((root / "src/ai/resample.ts").read_bytes()):
        raise ValueError("Resampler source differs")
    if not _hex(compiled_resampler_sha) or not _hex(compiled_model_sha):
        raise ValueError("Missing compiled resampler/model dependency fingerprints")
    if model_source_sha is not None and model_source_sha != _sha((root / "src/ai/model.ts").read_bytes()):
        raise ValueError("Resampler model-config source differs")
    runtime_fingerprint = {"ortVersion": contract["ortVersion"], "artifacts": {key: {"sha256": value[0], "bytes": value[1]} for key, value in RUNTIME.items()}, "execution": EXECUTION}
    preprocessing_fingerprint = {"implementation": contract["implementation"], "transformersVersion": "4.3.1", "transformersBrowserBundleSha256": transformer_sha,
        "preprocessorSha256": preprocessor_sha, "encoderSourceSha256": encoder_sha, "resamplerSourceSha256": resampler_sha,
        "compiledResamplerSha256": compiled_resampler_sha, "compiledModelSha256": compiled_model_sha,
        "sampleRateHz": 48000, "durationSeconds": 5, "featureShape": [1, 1, 1001, 64], "normalization": NORMALIZATION, "preprocessing": PREPROCESSING}
    return {"canonicalBackend": "browser-wasm", "dimension": 512, "normalization": "l2-float32", "modelSha256": contract["modelSha256"],
            "runtimeFingerprintSha256": _json_hash(runtime_fingerprint), "preprocessingContractSha256": _json_hash(preprocessing_fingerprint),
            "runtimeFingerprint": runtime_fingerprint, "preprocessingContract": preprocessing_fingerprint}


def _phase(role: str) -> str:
    return role.removeprefix("unknown_")


def load_canonical_batches(
    batches: Sequence[CanonicalBatch], role_by_clip_id: Mapping[str, str], *,
    group_by_clip_id: Mapping[str, str] | None = None,
    reserved_final_groups: Sequence[str] = (), allow_final: bool = False,
) -> CanonicalV3Data:
    """Load complete verified jobs in supplied order, then enforce v3 role guards.

    Roles are explicit train/unknown_train, calibration/unknown_calibration,
    audit/unknown_audit, final/unknown_final. Owners may appear in known and
    unknown roles in the SAME phase, never across phases. Optional model-group
    overrides cannot erase original uploader/hive/session ownership. All final
    reservations (including failed downloads) must be supplied by the builder.
    Original/prepared/PCM content cannot cross phases; PCM/clip duplicates are
    rejected even within a phase. This checks recorded lineage, not hidden
    shared backgrounds, pretraining overlap or annotation accuracy.
    """
    if not batches or not isinstance(role_by_clip_id, Mapping) or type(allow_final) is not bool or (group_by_clip_id is not None and not isinstance(group_by_clip_id, Mapping)) or isinstance(reserved_final_groups, str):
        raise ValueError("Require explicit nonempty batches and role assignments")
    reserved = {_group(value) for value in reserved_final_groups}
    records, vectors, provenance = [], [], []
    common_contract = None
    seen_ids, seen_pcm = set(), set()
    owners, contents = {}, {}
    for batch in batches:
        if not isinstance(batch, CanonicalBatch):
            raise ValueError("Require CanonicalBatch paths")
        raw, document = _read(batch.embeddings_path)
        staged_raw, staged = _read(batch.staged_manifest_path)
        contract = document.get("contract")
        if type(document.get("schemaVersion")) is not int or document["schemaVersion"] != 1 or document.get("promotionAllowed") is not False or not isinstance(contract, dict):
            raise ValueError("Invalid/uncompleted canonical output")
        digest = document.get("contractSha256")
        # Match Node JSON.stringify insertion order, with no ASCII escaping.
        if not _hex(digest) or digest != _sha(json.dumps(contract, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()):
            raise ValueError("Full run contract SHA mismatch")
        if contract.get("manifestSha256") != _sha(staged_raw) or type(staged.get("schemaVersion")) is not int or staged["schemaVersion"] != 1 or not _hex(staged.get("sourceManifestSha256")):
            raise ValueError("Staged manifest identity mismatch")
        expected_rows, actual_rows = staged.get("records"), document.get("records")
        if not isinstance(expected_rows, list) or not expected_rows or not isinstance(actual_rows, list) or len(actual_rows) != len(expected_rows):
            raise ValueError("Incomplete canonical batch")
        embedding_contract = derive_embedding_contract(contract)
        if common_contract is not None and not _strict_equal(common_contract, embedding_contract):
            raise ValueError("Differing encoder/runtime/preprocessor/resampler fingerprints across batches")
        common_contract = embedding_contract
        repeat_count = contract.get("repeatCount")
        if type(repeat_count) is not int or not 1 <= repeat_count <= 10:
            raise ValueError("Invalid canonical repeat count")
        browser_identity = None
        for index, (expected, row) in enumerate(zip(expected_rows, actual_rows)):
            if not isinstance(row, dict) or not isinstance(expected, dict) or type(row.get("row")) is not int or row["row"] != index or not _strict_equal({key: value for key, value in row.items() if key != "checkpoint"}, expected):
                raise ValueError("Canonical row differs from staged manifest/order")
            clip = _text(row.get("clip_id"), "clip ID")
            if clip in seen_ids:
                raise ValueError("Duplicate clip ID")
            seen_ids.add(clip)
            role = role_by_clip_id.get(clip)
            if not isinstance(role, str) or role not in ROLES or (not allow_final and _phase(role) == "final"):
                raise ValueError("Missing/invalid role or final data without explicit opt-in")
            phase = _phase(role)
            label = _text(row.get("label"), "label")
            if (role.startswith("unknown_") and label in KNOWN) or (not role.startswith("unknown_") and label not in KNOWN):
                raise ValueError("Known/unknown role-label mismatch")
            if type(row.get("sample_rate")) is not int or row["sample_rate"] not in (44100, 48000) or type(row.get("sample_count")) is not int or row["sample_count"] != row["sample_rate"] * 5:
                raise ValueError("Invalid actual PCM sample count/rate")
            source = row.get("source_record")
            if not isinstance(source, dict) or source.get("clip_id") != clip or source.get("label") != label or source.get("split") != row.get("split") or source.get("uploader") != row.get("uploader"):
                raise ValueError("Source record identity differs")
            dataset = _text(source.get("dataset"), "dataset")
            if "mimii" in dataset.casefold():
                raise ValueError("MIMII is excluded from v3 source policy; parity goldens are not training data")
            original = source.get("original_sha256")
            prepared, pcm_hash = row.get("source_sha256"), row.get("pcm_sha256")
            if not all(_hex(value) for value in (original, prepared, pcm_hash)) or source.get("sha256") != prepared or source.get("pcm_sha256") != pcm_hash:
                raise ValueError("Missing/mismatched original, prepared or PCM hashes")
            if pcm_hash in seen_pcm:
                raise ValueError("Duplicate PCM content")
            seen_pcm.add(pcm_hash)
            uploader = _group(row.get("uploader"))
            original_group = _group(source.get("uploader_group", source.get("uploader")))
            group = _group(group_by_clip_id[clip]) if group_by_clip_id is not None and clip in group_by_clip_id else original_group
            identities = {("model-group", group), ("source-owner", original_group), ("uploader", uploader)}
            for key in ("hive_id", "session_id", "session_group", "source_group", "source_recording_id", "recording_group"):
                if source.get(key) is not None:
                    identities.add((key, dataset.casefold() + ":" + _group(source[key])))
            collection = str(source.get("collection_group", "")).strip().casefold()
            if (dataset.casefold() == "tobee" or original_group.startswith("tobee:") or collection in FINAL_COLLECTIONS or {original_group, uploader, group} & reserved) and phase != "final":
                raise ValueError("Final-reserved source group/collection in development")
            for identity in identities:
                if identity in owners and owners[identity] != phase:
                    raise ValueError("Source owner/group/session crosses phases")
                owners[identity] = phase
            hashes = {"original_sha256": original, "prepared_sha256": prepared, "pcm_sha256": pcm_hash}
            # Compare cross-kind too: a prepared file may be another row's original.
            for value in hashes.values():
                if value in contents and contents[value] != phase:
                    raise ValueError("Original/prepared/PCM content crosses phases")
                contents[value] = phase
            checkpoint = row.get("checkpoint")
            if not isinstance(checkpoint, dict) or type(checkpoint.get("schemaVersion")) is not int or checkpoint.get("schemaVersion") != 1 or type(checkpoint.get("row")) is not int or checkpoint.get("row") != index or checkpoint.get("clipId") != clip or checkpoint.get("contractSha256") != digest or checkpoint.get("sourceSha256") != prepared or checkpoint.get("pcmSha256") != pcm_hash:
                raise ValueError("Checkpoint identity mismatch")
            values = checkpoint.get("embedding")
            if not isinstance(values, list) or len(values) != 512 or any(type(value) not in (int, float) or not np.isfinite(value) or abs(value) > 1 + 1 / 32768 for value in values):
                raise ValueError("Invalid finite embedding")
            vector = np.asarray(values, dtype=np.float32)
            if not np.array_equal(vector.astype(np.float64), np.asarray(values, dtype=np.float64)) or abs(np.linalg.norm(vector.astype(np.float64)) - 1) > 1e-6:
                raise ValueError("Embedding must be already normalized Float32; no renormalization")
            embedding_sha = _sha(vector.astype("<f4", copy=False).tobytes())
            repeats = checkpoint.get("repeats")
            if not isinstance(repeats, list) or len(repeats) != repeat_count:
                raise ValueError("Incomplete repeated extraction")
            for repeat in repeats:
                if not isinstance(repeat, dict) or repeat.get("embeddingSha256") != embedding_sha or any(not _hex(repeat.get(key)) or repeat[key] != repeats[0].get(key) for key in ("pcm48Sha256", "featureSha256", "embeddingSha256")):
                    raise ValueError("Corrupt/non-repeatable extraction checkpoint")
                for key in ("preprocessingMs", "inferenceMs"):
                    if type(repeat.get(key)) not in (int, float) or not np.isfinite(repeat[key]) or repeat[key] < 0:
                        raise ValueError("Invalid extraction timing")
            if "runtimeHashes" not in contract:
                identity = checkpoint.get("browser")
                if not isinstance(identity, dict) or identity.get("transformersVersion") != "4.3.1" or identity.get("ortVersion") != contract["ortVersion"] or not isinstance(identity.get("userAgent"), str) or not isinstance(identity.get("platform"), str):
                    raise ValueError("Missing browser provenance")
                if browser_identity is not None and not _strict_equal(browser_identity, identity):
                    raise ValueError("Browser identity changed inside batch")
                browser_identity = identity
            vectors.append(vector)
            records.append({"clip_id": clip, "label": label, "role": role, "phase": phase, "group": group,
                "original_source_group": original_group, "uploader": row["uploader"], "dataset": dataset,
                "hashes": hashes, "source_record": source, "extraction_row": row, "batch_contract_sha256": digest})
        provenance.append({"embeddings_sha256": _sha(raw), "staged_manifest_sha256": _sha(staged_raw),
            "source_manifest_sha256": staged["sourceManifestSha256"], "contract_sha256": digest, "contract": contract, "rows": len(actual_rows)})
    if set(role_by_clip_id) != seen_ids or (group_by_clip_id is not None and not set(group_by_clip_id).issubset(seen_ids)):
        raise ValueError("Role/group assignments must name only the exact extracted clip IDs")
    X = np.ascontiguousarray(vectors, dtype=np.float32)
    arrays = [X, *[np.asarray([row[key] for row in records]) for key in ("label", "role", "group", "clip_id", "dataset")], np.asarray([row["hashes"]["pcm_sha256"] for row in records])]
    for value in arrays:
        value.setflags(write=False)
    X, labels, roles, groups, clip_ids, datasets, pcm = arrays
    return CanonicalV3Data(X, labels, roles, groups, clip_ids, pcm, datasets, common_contract, tuple(records), tuple(provenance))
