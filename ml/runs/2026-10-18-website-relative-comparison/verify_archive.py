"""Byte-preserving stdlib verifier/archiver; NEVER imports or queries a model.

Example (after root completes the single frozen comparison and stops logging):
  python output/archive-website-comparison.py --comparison RUN \
    --completion-sha256 SHA --output NEW_ARCHIVE \
    --evidence-dir quality=QUALITY_DIR --evidence-dir baseline=BASELINE_DIR \
    --evidence-file candidate-log=EXTRACTION_LOG

Only text/JSON/source metadata is copied. Raw audio, PCM, ONNX/WASM encoder
weights, binary archives, caches and node_modules are omitted and inventoried.
The small JSON fitted head and complete frozen embedding JSON are retained as
part of the required comparison ledger; neither is a new inference or a fit.
Existing archive directories are never overwritten or removed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import sys

MAX_FILES = 10000
MAX_FILE_BYTES = 256 * 1024 * 1024
MAX_TOTAL_BYTES = 512 * 1024 * 1024
COHORT_SIZE = 416
SUFFIXES = {".json", ".ndjson", ".jsonl", ".txt", ".log", ".out", ".err", ".md", ".py", ".mjs", ".js", ".ts", ".tsx", ".csv", ".tsv"}
SKIP_DIRECTORIES = {"pcm", "audio", "models", "node_modules", "__pycache__", ".git", ".cache", "compiled-app", "compiled-resampler"}
SKIP_FILES = {"preprocessing.web.mjs"}
FINAL_SHA = "197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520"
HEAD_SHA = "1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491"
PARAM_SHA = "6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92"
PROTOCOL_SHA = "b8a453622e02f340b6196c1dca62abecf2646176eb324a5401e2cf05fad38aca"


def need(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def hex_sha(value):
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def parse(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            need(key not in result, "Duplicate JSON key")
            result[key] = value
        return result
    def invalid(value):
        raise ValueError("Nonfinite JSON constant: " + value)
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def relative(value):
    need(isinstance(value, str) and value and "\\" not in value and ":" not in value, "Unsafe relative artifact path")
    path = PurePosixPath(value)
    need(not path.is_absolute() and all(p not in {"", ".", ".."} for p in value.split("/")), "Unsafe relative artifact path")
    return value


def inside(root, name):
    target = root / relative(name)
    need(not any(p.is_symlink() for p in [target, *target.parents] if p != root.parent), "Symlink source/target is forbidden")
    resolved = target.resolve()
    need(resolved.is_relative_to(root.resolve()), "Artifact escaped its root")
    return target


def stable_read(path):
    need(path.is_file() and not path.is_symlink(), "Expected regular file: " + str(path))
    before = path.stat()
    need(before.st_size <= MAX_FILE_BYTES, "Artifact exceeds bounded file size")
    raw = path.read_bytes()
    after = path.stat()
    need(before.st_size == after.st_size == len(raw) and before.st_mtime_ns == after.st_mtime_ns, "Artifact changed while reading; stop logging first")
    need(sha(path.read_bytes()) == sha(raw), "Artifact changed while verifying; stop logging first")
    return raw


def exact(a, b):
    if type(a) in (int, float) and type(b) in (int, float):
        return (type(a) is not float or math.isfinite(a)) and (type(b) is not float or math.isfinite(b)) and a == b
    if type(a) is not type(b):
        return False
    if a is None or type(a) in (str, bool):
        return a == b
    if type(a) is list:
        return len(a) == len(b) and all(exact(x, y) for x, y in zip(a, b))
    return type(a) is dict and a.keys() == b.keys() and all(exact(a[k], b[k]) for k in a)


def json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n").encode()


def read_completed(root, expected):
    """Verify frozen completion/input/source bindings. Never calculate predictions."""
    need(hex_sha(expected), "Require explicit raw completion SHA256")
    complete_raw = stable_read(inside(root, "comparison-completion.json"))
    need(sha(complete_raw) == expected, "Completion raw SHA mismatch")
    complete = parse(complete_raw)
    need(complete.get("complete") is True and complete.get("phase") == "fixed-website-paired-comparison" and complete.get("promotionAllowed") is False, "Not a completed frozen comparison")
    ledger = complete.get("artifacts")
    required = {"comparison-input.json", "comparison-results.json", "protocol.md", "fit/research_head_v3.json", "fit/development_v3.json", "inputs/final-source.json", "inputs/final-staged.json", "inputs/final-embeddings.json", "inputs/baseline-results.json", "inputs/quality-results.json", "inputs/browser-evidence.json", "inputs/quality-browser-evidence.json"}
    need(isinstance(ledger, dict) and required.issubset(ledger), "Incomplete comparison artifact ledger")
    payload = {"comparison-completion.json": complete_raw}
    for name, info in ledger.items():
        need(Path(name).suffix.lower() in SUFFIXES, "Binary encoder/audio artifact in comparison ledger")
        raw = stable_read(inside(root, name))
        need(isinstance(info, dict) and type(info.get("bytes")) is int and len(raw) == info["bytes"] and sha(raw) == info.get("sha256"), "Completion ledger mismatch: " + name)
        payload[name] = raw
    evidence = parse(payload["comparison-input.json"])
    need(complete.get("comparisonInputSha256") == sha(payload["comparison-input.json"]), "Input evidence not completion-bound")
    need(evidence.get("phase") == "fixed-website-paired-comparison" and evidence.get("promotionAllowed") is False and evidence.get("refittingOrRetuningAllowed") is False, "Input evidence allows another experiment")
    need(evidence.get("frozenHeadSha256") == HEAD_SHA and evidence.get("frozenParametersAndRulesSha256") == PARAM_SHA and sha(payload["fit/research_head_v3.json"]) == HEAD_SHA, "Wrong frozen head")
    need(sha(payload["protocol.md"]) == PROTOCOL_SHA and evidence.get("protocol", {}).get("sha256") == PROTOCOL_SHA, "Wrong protocol")
    need(sha(payload["inputs/final-source.json"]) == FINAL_SHA, "Wrong final source bytes")
    input_ledger = evidence.get("artifacts")
    need(exact(input_ledger, {k: v for k, v in ledger.items() if k not in {"comparison-input.json", "comparison-results.json"}}), "Input/completion ledgers disagree")
    for name, digest in evidence.get("sourceSha256", {}).items():
        need("sources/" + name in payload and sha(payload["sources/" + name]) == digest, "Frozen source hash mismatch")
    report = parse(payload["comparison-results.json"])
    old = parse(payload["fit/development_v3.json"])
    need(exact(report.get("originalDevelopmentStrictAudit"), old.get("developmentAudit")), "Original strict result changed")
    need(report.get("promotionAllowed") is False and report.get("productIntegrationAllowed") is False and report.get("independentProductChecksRequired") is True, "Research comparison incorrectly promotes itself")
    need(type(report.get("relativeRecognitionPassed")) is bool and complete.get("relativeRecognitionPassed") is report["relativeRecognitionPassed"], "Completion/result verdict differs")
    source = parse(payload["inputs/final-source.json"])
    quality = parse(payload["inputs/quality-results.json"])
    baseline = parse(payload["inputs/baseline-results.json"])
    records = report.get("records")
    need(isinstance(records, list) and len(records) == len(source["records"]) == len(quality["records"]) == len(baseline["records"]) == COHORT_SIZE, "Missing cohort outcomes")
    for i, (row, original, qrow, brow) in enumerate(zip(records, source["records"], quality["records"], baseline["records"])):
        need(row.get("row") == i and row.get("clipId") == original["clip_id"] == qrow["clip_id"] == brow["clip_id"], "Outcome row reordered")
        need(row.get("originalSha256") == original["original_sha256"] and row.get("preparedSha256") == original["sha256"] and row.get("pcmSha256") == original["pcm_sha256"], "Outcome audio provenance changed")
        eligible = qrow["checkpoint"]["outcome"] == "quality-eligible"
        need(row.get("qualityEligible") is eligible and row["candidate"].get("headQueried") is eligible, "Shared mask differs from outcome")
        need(exact(row["baseline"].get("rawResponse"), brow["checkpoint"]["rawResponse"]) and row["baseline"].get("outcome") == brow["checkpoint"]["outcome"], "Raw baseline outcome/failure omitted")
        if not eligible:
            need(row["candidate"].get("accepted") is False and row["candidate"].get("visibleFamily") is None and row["candidate"].get("integerScores") is None and row["baseline"].get("rawResponse") is None, "Blocked row emitted a hint")
    # Preserve any explicit failure/log alongside the completion rather than
    # filtering it by outcome. Every ordinary payload must already be indexed.
    extras = []
    for file in root.rglob("*"):
        need(not file.is_symlink(), "Symlink in completed comparison")
        if file.is_file():
            name = file.relative_to(root).as_posix()
            if name not in payload:
                need(file.suffix.lower() in SUFFIXES, "Unexpected binary in comparison directory")
                payload[name] = stable_read(file)
                extras.append(name)
    summary = {"relativeRecognitionPassed": report["relativeRecognitionPassed"], "status": report["status"], "relativeChecks": report["relativeChecks"], "counts": report["counts"], "candidateKnownMacroF1": report["candidate"]["knownTop1MacroF1"], "baselineKnownMacroF1": report["baseline"]["knownTop1MacroF1"], "difference": report["pairedKnownMacroF1Difference"], "originalDevelopmentStrictAuditPassed": old["developmentAudit"]["developmentAuditPassed"], "sourceSha256": FINAL_SHA, "headSha256": HEAD_SHA, "completionSha256": expected, "additionalFailureOrLogFilesPreserved": extras, "modelsQueriedByVerifier": 0}
    return payload, summary


def evidence_spec(value):
    need("=" in value, "Evidence must be NAME=PATH")
    name, value = value.split("=", 1)
    relative(name)
    need("/" not in name, "Evidence name must be a single path component")
    return name, Path(value).resolve()


def metadata_file(path):
    # Preserve the documented failed atomic request-log rename as raw JSON;
    # an arbitrary temporary binary is still excluded.
    return path.suffix.lower() in SUFFIXES or re.fullmatch(r"requests\.json\.\d+\.tmp", path.name) is not None


def collect_evidence(directories, files):
    payload, omitted = {}, []
    for spec in directories:
        label, root = evidence_spec(spec)
        need(root.is_dir() and not root.is_symlink(), "Evidence directory missing/symlink")
        for current, dirs, names in os.walk(root, followlinks=False):
            current = Path(current)
            for name in list(dirs):
                path = current/name
                need(not path.is_symlink(), "Symlink evidence directory")
                if name.casefold() in SKIP_DIRECTORIES:
                    dirs.remove(name); omitted.append({"evidence": label, "path": path.relative_to(root).as_posix()+"/", "reason": "raw audio/encoder/cache directory excluded"})
            for name in sorted(names):
                path = current/name
                need(not path.is_symlink(), "Symlink evidence file")
                relative_name = path.relative_to(root).as_posix()
                if name.casefold() in SKIP_FILES:
                    omitted.append({"evidence": label, "path": relative_name, "bytes": path.stat().st_size, "reason": "generated preprocessing code omitted; raw contract/source pins preserved"});continue
                if not metadata_file(path):
                    omitted.append({"evidence": label, "path": relative_name, "bytes": path.stat().st_size, "reason": "nonmetadata binary omitted"});continue
                raw = stable_read(path)
                # Strict UTF-8 source/log metadata only, no binary containers.
                raw.decode("utf-8-sig")
                if path.suffix == ".tmp":parse(raw)
                key = "evidence/"+label+"/"+relative_name
                need(key not in payload, "Duplicate evidence output path")
                payload[key] = raw
    for spec in files:
        label, path = evidence_spec(spec)
        need(metadata_file(path), "Explicit evidence must be text/JSON/source metadata")
        key = "evidence/"+label+"/"+path.name
        need(key not in payload, "Duplicate explicit evidence")
        raw = stable_read(path);raw.decode("utf-8-sig")
        if path.suffix == ".tmp":parse(raw)
        payload[key] = raw
    return payload, omitted


def archive(comparison, expected, output, evidence_dirs=(), evidence_files=()):
    root, destination = Path(comparison).resolve(), Path(output).resolve()
    need(not destination.exists(), "Archive output must be a new directory")
    need(not destination.is_relative_to(root) and not root.is_relative_to(destination), "Archive/source directories must not contain one another")
    payload, summary = read_completed(root, expected)
    extras, omitted = collect_evidence(evidence_dirs, evidence_files)
    payload = {"comparison/"+k: v for k, v in payload.items()} | extras
    summary["omittedNonmetadataInputs"] = omitted
    payload["verification-summary.json"] = json_bytes(summary)
    payload["verify_archive.py"] = Path(__file__).read_bytes()
    need(len(payload) <= MAX_FILES and sum(map(len, payload.values())) <= MAX_TOTAL_BYTES, "Archive exceeds bounded count/total bytes")
    # Refuse Windows case-insensitive collisions on every host.
    need(len({name.casefold() for name in payload}) == len(payload), "Case-insensitive output collision")
    index = {"formatVersion": 1, "purpose": "byte-preserving-frozen-website-comparison-evidence", "completionSha256": expected, "promotionAllowed": False, "verifierDoesNotImportModelCode": True, "artifacts": {name: {"bytes": len(raw), "sha256": sha(raw)} for name, raw in sorted(payload.items())}, "excluded": "No raw audio/PCM, ONNX/WASM encoder weights or binary caches. Small frozen fitted-head JSON and original embedding JSON retained as comparison evidence."}
    # All validation precedes exclusive directory creation. No cleanup/delete.
    destination.mkdir(parents=True, exist_ok=False)
    for name, raw in sorted(payload.items()):
        path = inside(destination, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as handle:
            handle.write(raw);handle.flush();os.fsync(handle.fileno())
    with (destination/"artifact-index.json").open("xb") as handle:
        handle.write(json_bytes(index));handle.flush();os.fsync(handle.fileno())
    verified = verify_archive(destination)
    return {**summary, **verified, "artifactIndexSha256": sha((destination/"artifact-index.json").read_bytes())}


def verify_archive(root):
    root = Path(root).resolve()
    raw = stable_read(root/"artifact-index.json")
    index = parse(raw)
    need(index.get("promotionAllowed") is False and index.get("verifierDoesNotImportModelCode") is True, "Invalid archive index")
    for name, info in index["artifacts"].items():
        data = stable_read(inside(root, name))
        need(len(data) == info["bytes"] and sha(data) == info["sha256"], "Archived file bytes/hash changed")
    # Also verify the original scientific completion ledger, not merely a
    # freshly generated archive index over an unrelated payload.
    _, summary = read_completed(root/"comparison", index["completionSha256"])
    return {"verifiedFiles": len(index["artifacts"]), "bytes": sum(v["bytes"] for v in index["artifacts"].values()), "completionSha256": summary["completionSha256"], "modelsQueriedByVerifier": 0}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only")
    parser.add_argument("--comparison")
    parser.add_argument("--completion-sha256")
    parser.add_argument("--output")
    parser.add_argument("--evidence-dir", action="append", default=[])
    parser.add_argument("--evidence-file", action="append", default=[])
    args = parser.parse_args(argv)
    if args.verify_only:
        need(not any((args.comparison,args.completion_sha256,args.output,args.evidence_dir,args.evidence_file)), "verify-only accepts only its archive path")
        result = verify_archive(args.verify_only)
    else:
        need(all((args.comparison,args.completion_sha256,args.output)), "Required comparison/completion-sha256/output")
        result = archive(args.comparison,args.completion_sha256,args.output,args.evidence_dir,args.evidence_file)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
