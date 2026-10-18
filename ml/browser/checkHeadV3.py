"""Freeze Python references and check the unchanged v3 JS head; research only.

No fitting, threshold changes, encoder calls, final-data scoring or activation.
Canonical inputs must be the complete development cohort bound by the head.
Existing output directories are immutable, including failed parity attempts.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
import platform
import subprocess
from typing import Any, Sequence

import numpy as np

from ml.canonical_v3 import CanonicalBatch, load_canonical_batches
from ml.experiment_v3 import (DEFAULT_CRITERIA, ROLES, _json_hash, _validated_head,
    predict_fixed_v3, quantize_embeddings, validate_embedding_contract)

ROOT = Path(__file__).resolve().parents[2]
PINS = {
    "compilerVersion": "7.0.2",
    "scorerSourceSha256": "c89ed32798a923eaf19b62fabfda9a8b3ae87b5757fd57458e9ec54aa715b0f7",
    "compiledScorerSha256": "5b969fa736aad8b336c198d24f20bf59bbe4e788ef7878ea86dd8126c20ed25f",
    "pythonScorerSha256": "640e11d60776d8f87f01e9c19f356c49bd5cc02c433e2abd8edb740aecc026d1",
}


@dataclass(frozen=True)
class ParityInput:
    path: str | Path
    sha256: str
    staged_manifest: str | Path | None = None
    staged_sha256: str | None = None


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _hex(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()


def _read(path: str | Path, expected: str | None = None):
    raw = Path(path).read_bytes()
    if len(raw) > 256 * 1024 * 1024 or (expected is not None and (not _hex(expected) or _sha(raw) != expected)):
        raise ValueError("Artifact exceeds bounds or differs from its explicit raw SHA256")
    def invalid(value):
        raise ValueError("Non-finite JSON: " + value)
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    return raw, json.loads(raw, parse_constant=invalid, object_pairs_hook=pairs)


def _save(path: Path, raw: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as handle:
        handle.write(raw)
        handle.flush()
        import os
        os.fsync(handle.fileno())


def _head(path: str | Path, expected: str):
    raw, head = _read(path, expected)
    _validated_head(head)
    actual_python = _sha((ROOT / "ml/experiment_v3.py").read_bytes())
    if actual_python != PINS["pythonScorerSha256"] or _sha((ROOT / "ml/browser/integerHeadV3.ts").read_bytes()) != PINS["scorerSourceSha256"]:
        raise ValueError("Unpinned Python or TypeScript scorer source")
    provenance = head.get("provenance", {})
    contract = provenance.get("embeddingContract")
    validate_embedding_contract(contract)
    frozen = {k: v for k, v in head.items() if k != "provenance"}
    if provenance.get("sourceSha256") != actual_python or provenance.get("frozenParametersAndRulesSha256") != _json_hash(frozen) or provenance.get("embeddingContractSha256") != _json_hash(contract) or not _hex(provenance.get("manifestSha256")) or head.get("readinessCriteria") != asdict(DEFAULT_CRITERIA):
        raise ValueError("Head source, embedding contract, criteria or frozen parameter/rule binding differs")
    return raw, head


def _float_vector(values, digest):
    if not isinstance(values, list) or len(values) != 512 or any(type(v) not in (int, float) or not np.isfinite(v) for v in values):
        raise ValueError("Require 512 finite normalized Float32 values")
    vector = np.asarray(values, dtype=np.float32)
    if not np.array_equal(vector.astype(np.float64), np.asarray(values, dtype=np.float64)) or _sha(vector.astype("<f4").tobytes()) != digest:
        raise ValueError("Input is not exact Float32 or differs from its embedding hash")
    quantize_embeddings(vector.reshape(1, 512))  # Validate normalization, never repair it.
    return vector


def _input(item: ParityInput, index: int, head: dict):
    if not isinstance(item, ParityInput):
        raise ValueError("Require explicit ParityInput pins")
    raw, document = _read(item.path, item.sha256)
    copied = f"inputs/{index:02d}.json"
    payloads = {copied: raw}
    artifact = {"path": copied, "sha256": item.sha256, "bytes": len(raw)}
    vectors, ids = [], []
    if isinstance(document, dict) and document.get("schemaVersion") == 1 and "records" in document:
        if item.staged_manifest is None or not _hex(item.staged_sha256):
            raise ValueError("Canonical parity input needs an explicitly pinned complete staged manifest")
        staged_raw, _ = _read(item.staged_manifest, item.staged_sha256)
        records = document.get("records")
        if not isinstance(records, list) or not records:
            raise ValueError("Empty canonical input")
        roles, groups = {}, {}
        for row in records:
            source = row.get("source_record", {})
            role = source.get("role")
            if source.get("historical_development_only") is not True or role not in ROLES or source.get("split") != role:
                raise ValueError("Only explicitly frozen historical development rows are accepted; no final/test data")
            roles[row["clip_id"]], groups[row["clip_id"]] = role, source.get("v3_group")
        data = load_canonical_batches([CanonicalBatch(item.path, item.staged_manifest)], roles, group_by_clip_id=groups)
        manifest = [{"clipId": r["clip_id"], "role": r["role"], "label": r["label"], "group": r["group"], "dataset": r["dataset"], "pcmSha256": r["hashes"]["pcm_sha256"]} for r in data.records]
        if _json_hash(manifest) != head["provenance"]["manifestSha256"] or _json_hash(data.embedding_contract) != head["provenance"]["embeddingContractSha256"]:
            raise ValueError("Canonical input is not the COMPLETE original development cohort/encoder bound to this head")
        if data.batch_provenance[0]["embeddings_sha256"] != item.sha256 or data.batch_provenance[0]["staged_manifest_sha256"] != item.staged_sha256:
            raise ValueError("Canonical input changed during verification")
        vectors, ids = list(data.X), list(data.clip_ids)
        staged_copy = f"inputs/{index:02d}-staged.json"
        payloads[staged_copy] = staged_raw
        artifact.update(kind="canonical-development", stagedPath=staged_copy, stagedSha256=item.staged_sha256,
                        contractSha256=document["contractSha256"])
    elif isinstance(document, dict) and document.get("implementation") == "tw-v3-synthetic-startup-reference-v1":
        if item.staged_manifest is not None or item.staged_sha256 is not None:
            raise ValueError("Compact synthetic reference has no staged manifest argument")
        if type(document.get("formatVersion")) is not int or document["formatVersion"] != 1 or document.get("fieldEvidence") is not False or document.get("promotionAllowed") is not False or document.get("classifierIncluded") is not False:
            raise ValueError("Compact reference must remain synthetic software evidence without a classifier")
        if _json_hash(document.get("embeddingContract")) != head["provenance"]["embeddingContractSha256"]:
            raise ValueError("Synthetic reference encoder differs from the frozen head")
        cases = document.get("cases")
        if not isinstance(cases, list) or not cases:
            raise ValueError("Empty synthetic reference")
        for case in cases:
            identity = case.get("id")
            if not isinstance(identity, str) or not identity or identity in ids:
                raise ValueError("Missing/duplicate synthetic case ID")
            ids.append(identity)
            vectors.append(_float_vector(case.get("normalizedEmbedding512"), case.get("embeddingSha256")))
        artifact["kind"] = "synthetic-startup"
    else:
        raise ValueError("Unsupported input; require complete canonical development or compact synthetic startup reference")
    artifact["rows"] = len(vectors)
    return artifact, payloads, [str(identity) for identity in ids], np.ascontiguousarray(vectors, dtype=np.float32)


def check_head_v3(head_path: str | Path, head_sha256: str, inputs: Sequence[ParityInput], output_dir: str | Path,
                  *, dependency_root: str | Path = ROOT, node: str = "node") -> Path:
    destination = Path(output_dir)
    if destination.exists():
        raise ValueError("Parity output is immutable; preserve existing results/failures")
    if not inputs:
        raise ValueError("Require every supplied input to be explicitly pinned")
    head_raw, head = _head(head_path, head_sha256)
    artifacts, payloads, source_rows = [], {"head.json": head_raw}, []
    for index, item in enumerate(inputs):
        artifact, copies, identities, X = _input(item, index, head)
        artifacts.append(artifact)
        payloads.update(copies)
        source_rows.append((index, identities, X))
    if sum(a["kind"] == "canonical-development" for a in artifacts) > 1:
        raise ValueError("Provide one complete frozen development extraction, without duplicate cohorts")
    evidence = {"formatVersion": 1, "implementation": "tw-v3-python-js-head-parity-v1", "researchOnly": True,
        "promotionAllowed": False, "encoderRun": False, "accuracyEvaluated": False,
        "headSha256": head_sha256, "frozenParametersAndRulesSha256": head["provenance"]["frozenParametersAndRulesSha256"],
        "embeddingContract": head["provenance"]["embeddingContract"], "pins": PINS, "inputs": artifacts,
        "python": {"version": platform.python_version(), "implementation": platform.python_implementation(), "numpy": np.__version__, "platform": platform.platform()},
        "sourceSha256": {name: _sha((ROOT/name).read_bytes()) for name in ("ml/browser/checkHeadV3.py", "ml/browser/checkHeadV3.mjs", "ml/experiment_v3.py", "ml/canonical_v3.py", "ml/browser/canonicalCheckpoint.mjs")}}
    destination.mkdir(parents=True, exist_ok=False)
    _save(destination/"input-evidence.json", _bytes(evidence))
    for name, raw in payloads.items():
        _save(destination/name, raw)
    try:
        rows = []
        for input_index, identities, X in source_rows:
            quantized = quantize_embeddings(X)
            prediction = predict_fixed_v3(head, X)
            for index, identity in enumerate(identities):
                label = str(prediction["labels"][index])
                rows.append({"inputIndex": input_index, "sourceRow": index, "id": identity,
                    "embeddingSha256": _sha(X[index].astype("<f4").tobytes()), "expectedQuantized": quantized[index].tolist(),
                    "expected": {"classIndex": head["classOrder"].index(label), "label": label,
                        "integerScores": prediction["integerScores"][index].tolist(),
                        "guardedMargin": int(prediction["guardedMargin"][index]), "accepted": bool(prediction["accepted"][index])}})
        expected = {**evidence, "rows": rows}
        expected_raw = _bytes(expected)
        _save(destination/"python-reference.json", expected_raw)
        command = [node, str(ROOT/"ml/browser/checkHeadV3.mjs"), "--expected", str((destination/"python-reference.json").resolve()),
            "--expected-sha256", _sha(expected_raw), "--head", str((destination/"head.json").resolve()),
            "--output", str((destination/"javascript").resolve()), "--dependencies", str(Path(dependency_root).resolve())]
        result = subprocess.run(command, text=True, encoding="utf-8", errors="replace", capture_output=True, check=False)
        _save(destination/"node-stdout.txt", result.stdout.encode())
        _save(destination/"node-stderr.txt", result.stderr.encode())
        if result.returncode != 0:
            raise ValueError(f"Strict JavaScript parity failed (exit {result.returncode}); preserve the recorded evidence")
        _, parity = _read(destination/"javascript/parity.json")
        if parity.get("passed") is not True or parity.get("promotionAllowed") is not False or parity.get("cases") != len(rows):
            raise ValueError("Missing/incomplete strict JavaScript comparison")
        payload_index = {p.relative_to(destination).as_posix(): {"sha256": _sha(p.read_bytes()), "bytes": p.stat().st_size}
            for p in sorted(destination.rglob("*")) if p.is_file()}
        _save(destination/"completion.json", _bytes({"complete": True, "passed": True, "promotionAllowed": False,
            "cases": len(rows), "headSha256": head_sha256, "artifacts": payload_index}))
    except BaseException as error:
        _save(destination/"failed.json", _bytes({"complete": False, "passed": False, "promotionAllowed": False,
            "errorType": type(error).__name__, "retryPolicy": "Preserve inputs/results; do not change head, gates or tolerances to obtain a pass"}))
        raise
    return destination/"completion.json"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--head", required=True)
    parser.add_argument("--head-sha256", required=True)
    parser.add_argument("--canonical")
    parser.add_argument("--canonical-sha256")
    parser.add_argument("--staged-manifest")
    parser.add_argument("--staged-sha256")
    parser.add_argument("--self-test-reference")
    parser.add_argument("--self-test-sha256")
    parser.add_argument("--output", required=True)
    parser.add_argument("--dependencies", default=str(ROOT))
    parser.add_argument("--node", default="node")
    args = parser.parse_args(argv)
    inputs = []
    if any((args.canonical, args.canonical_sha256, args.staged_manifest, args.staged_sha256)):
        if not all((args.canonical, args.canonical_sha256, args.staged_manifest, args.staged_sha256)):
            parser.error("Canonical input requires all four canonical/staged path/SHA arguments")
        inputs.append(ParityInput(args.canonical, args.canonical_sha256, args.staged_manifest, args.staged_sha256))
    if args.self_test_reference or args.self_test_sha256:
        if not args.self_test_reference or not args.self_test_sha256:
            parser.error("Synthetic reference needs its explicit raw SHA256")
        inputs.append(ParityInput(args.self_test_reference, args.self_test_sha256))
    if not inputs:
        parser.error("Supply complete canonical development and/or compact synthetic inputs")
    print(check_head_v3(args.head, args.head_sha256, inputs, args.output, dependency_root=args.dependencies, node=args.node), flush=True)


if __name__ == "__main__":
    main()
