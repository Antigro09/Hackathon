"""Standard-library integrity verification only; no model code or predictions."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct

FIT_COMPLETION = "74cf3f85891cba5f940d8e19ef61eae1d922e1e1640605df48dac09d376a7dee"
HEAD = "1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491"
PARAMETERS = "6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92"
PARITY_COMPLETION = "ad7cdb971464ec6660534bd6e93019a795e03beda190204bd8578048f28a45d5"
STARTUP_REFERENCE = "6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d"
FINAL = "197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520"
MODEL_OUTPUTS = {"research_head_v3.json", "development_v3.json", "development_manifest_v3.json"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def json_sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def read(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "Duplicate JSON key")
            result[key] = value
        return result
    def invalid(value):
        raise ValueError("Non-finite JSON value: " + value)
    return json.loads(Path(path).read_bytes(), object_pairs_hook=pairs, parse_constant=invalid)


def relative(name):
    require(isinstance(name, str) and name and "\\" not in name and ":" not in name, "Unsafe indexed path")
    path = PurePosixPath(name)
    require(not path.is_absolute() and all(part and part not in {".", ".."} for part in name.split("/")), "Unsafe indexed path")
    return name


def check_entries(root, entries):
    require(isinstance(entries, dict) and entries, "Missing artifact index")
    for name, info in entries.items():
        path = root / relative(name)
        require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root.resolve()), "Missing/unsafe artifact: " + name)
        require(isinstance(info, dict) and type(info.get("bytes")) is int and info["bytes"] >= 0
                and isinstance(info.get("sha256"), str) and re.fullmatch("[a-f0-9]{64}", info["sha256"]), "Invalid artifact pin: " + name)
        require(path.stat().st_size == info["bytes"] and sha(path) == info["sha256"], "Artifact bytes/SHA differ: " + name)


def verify_parity(root, fit, head, manifest):
    """Compare saved parity records only; never execute a scorer or encoder."""
    parity = root / "head-parity"
    require(sha(parity / "completion.json") == PARITY_COMPLETION, "Original parity completion changed")
    completion = read(parity / "completion.json")
    require(completion.get("complete") is True and completion.get("passed") is True and completion.get("promotionAllowed") is False
            and completion.get("cases") == 1360 and completion.get("headSha256") == HEAD, "Parity completion/head/count differs")
    inventory = {path.relative_to(parity).as_posix() for path in parity.rglob("*") if path.is_file()}
    require(len(completion["artifacts"]) == 12 and inventory == set(completion["artifacts"]) | {"completion.json"}, "Parity inventory differs")
    check_entries(parity, completion["artifacts"])
    require(sha(parity / "head.json") == HEAD
            and sha(parity / "inputs/00.json") == sha(fit / "inputs/development-embeddings.json")
            and sha(parity / "inputs/00-staged.json") == sha(fit / "inputs/development-staged.json")
            and sha(parity / "inputs/01.json") == STARTUP_REFERENCE, "Parity did not use exact original development/startup/head bytes")
    evidence = read(parity / "input-evidence.json")
    require(evidence["headSha256"] == HEAD and evidence["frozenParametersAndRulesSha256"] == PARAMETERS
            and evidence["embeddingContract"] == head["provenance"]["embeddingContract"]
            and [(item["kind"], item["rows"]) for item in evidence["inputs"]] == [("canonical-development", 1358), ("synthetic-startup", 2)], "Parity input/rule/encoder binding differs")
    expected = read(parity / "python-reference.json")
    actual = read(parity / "javascript/parity.json")
    for document in (evidence, expected, actual):
        require(document.get("promotionAllowed") is False and document.get("accuracyEvaluated") is False and document.get("encoderRun") is False
                and document.get("headSha256") == HEAD and document.get("frozenParametersAndRulesSha256") == PARAMETERS, "Parity status/head/rule identity differs")
    require(actual.get("complete") is True and actual.get("passed") is True and actual.get("cases") == 1360
            and actual.get("mismatchingCases") == 0 and actual.get("maximumIntegerScoreError") == 0
            and actual.get("maximumGuardedMarginError") == 0
            and actual.get("expectedSha256") == sha(parity / "python-reference.json"), "Saved strict parity did not pass exactly")
    require(len(expected["rows"]) == len(actual["rows"]) == 1360 and len(manifest) == 1358, "Parity rows incomplete")
    startup = read(parity / "inputs/01.json")
    identities = [row["clipId"] for row in manifest] + [row["id"] for row in startup["cases"]]
    for index, (reference, observed, identity) in enumerate(zip(expected["rows"], actual["rows"], identities)):
        input_index, source_row = (0, index) if index < 1358 else (1, index - 1358)
        for row in (reference, observed):
            require((row.get("inputIndex"), row.get("sourceRow"), row.get("id")) == (input_index, source_row, identity), "Parity row/source order differs")
        require(reference["embeddingSha256"] == observed["embeddingSha256"] and observed.get("passed") is True
                and observed.get("mismatchedFields") == [], "Parity row did not pass")
        quantized = reference["expectedQuantized"]
        require(isinstance(quantized, list) and len(quantized) == 512 and all(type(value) is int and -(1 << 31) <= value < (1 << 31) for value in quantized), "Invalid saved quantization")
        require(hashlib.sha256(struct.pack("<512i", *quantized)).hexdigest() == observed["quantizedInt32Sha256"], "Saved quantization differs")
        require(all(reference["expected"][key] == observed[key] for key in ("classIndex", "label", "integerScores", "guardedMargin", "accepted")), "Saved integer/label/margin/gate result differs")
    return 1360


def verify(root, index_sha256=None):
    root = Path(root).resolve()
    index_path = root / "checksums.json"
    if index_sha256 is not None:
        require(re.fullmatch("[a-f0-9]{64}", index_sha256) and sha(index_path) == index_sha256, "Whole-index SHA differs")
    index = read(index_path)
    require(index.get("formatVersion") == 1 and index.get("promotionAllowed") is False and index.get("predictionsRecomputed") is False, "Invalid archive index")
    inventory = {path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()}
    require(inventory == set(index["files"]) | {"checksums.json"}, "Archive contains missing/unindexed files")
    check_entries(root, index["files"])
    fit = root / "fit"
    require(sha(fit / "fit-completion.json") == FIT_COMPLETION, "Original fit completion changed")
    completion = read(fit / "fit-completion.json")
    require(completion.get("formatVersion") == 3 and completion.get("phase") == "fit" and completion.get("complete") is True
            and completion.get("promotionAllowed") is False, "Incomplete/promoted fit marker")
    fit_inventory = {path.relative_to(fit).as_posix() for path in fit.rglob("*") if path.is_file()}
    require(len(completion["artifacts"]) == 32 and fit_inventory == set(completion["artifacts"]) | {"fit-completion.json"}, "Original fit inventory differs")
    check_entries(fit, completion["artifacts"])
    require(sha(fit / "fit-input.json") == completion["fitInputSha256"], "Fit input identity differs")
    evidence = read(fit / "fit-input.json")
    require(evidence.get("phase") == "fit" and evidence.get("freshFinalEvaluated") is False and evidence.get("promotionAllowed") is False
            and evidence.get("seed") == 18043 and evidence.get("frozenFinalSourceSha256") == FINAL, "Fit phase/seed/final freeze differs")
    require({key: value for key, value in completion["artifacts"].items() if key not in MODEL_OUTPUTS | {"fit-input.json"}} == evidence["artifacts"], "Original input ledger differs")
    for name, digest in evidence["sourceSha256"].items():
        require(sha(fit / "sources" / relative(name)) == digest, "Frozen source differs: " + name)
    require(sha(fit / "research_head_v3.json") == HEAD, "Original fitted head differs")
    head = read(fit / "research_head_v3.json")
    provenance = head["provenance"]
    require(provenance["frozenParametersAndRulesSha256"] == PARAMETERS
            and json_sha({key: value for key, value in head.items() if key != "provenance"}) == PARAMETERS, "Frozen parameters/rules differ")
    require(head.get("experimental") is True and head.get("promotionAllowed") is False and head["readinessCriteria"] == evidence["criteria"], "Head research status/criteria differ")
    require(provenance["embeddingContract"] == evidence["embeddingContract"]
            and provenance["embeddingContractSha256"] == json_sha(evidence["embeddingContract"])
            and provenance["sourceSha256"] == evidence["sourceSha256"]["ml/experiment_v3.py"], "Head encoder/source binding differs")
    manifest = read(fit / "development_manifest_v3.json")
    require(json_sha(manifest) == provenance["manifestSha256"], "Fitted cohort manifest differs")
    report = read(fit / "development_v3.json")
    require(report["provenance"] == provenance and report.get("freshTestEvaluated") is False
            and report.get("promotionAllowed") is False and report["criteria"] == evidence["criteria"], "Saved report/head binding differs")
    audit = report["developmentAudit"]
    known, unknown = audit["knownSelectivePrecision"], audit["unknownFalseAcceptance"]
    require(audit["developmentAuditPassed"] is False and audit["promotionAllowed"] is False
            and len(audit["perClass"]) == 5 and all(row["passed"] is True for row in audit["perClass"]), "Recorded development failure/class gates differ")
    require((known["successes"], known["total"], unknown["successes"], unknown["total"]) == (103, 106, 6, 116)
            and unknown["wilson95"][1] > evidence["criteria"]["max_unknown_wilson_upper"] == 0.05, "Recorded failed gate differs")
    summary = read(root / "logs/verified-fit-summary.json")
    require(summary["verified"] is True and summary["predictionsRecomputed"] is False and summary["promotionAllowed"] is False
            and summary["headRawSha256"] == HEAD and summary["fitCompletionSha256"] == FIT_COMPLETION
            and summary["frozenParametersAndRulesSha256"] == PARAMETERS and summary["frozenFinalSourceSha256"] == FINAL, "Original verification summary differs")
    parity_cases = verify_parity(root, fit, head, manifest)
    return {"verified": True, "archiveFiles": len(inventory), "indexedFitFiles": 32, "fitFilesIncludingCompletion": len(fit_inventory),
            "indexSha256": sha(index_path), "fitCompletionSha256": FIT_COMPLETION, "headRawSha256": HEAD,
            "developmentAuditPassed": False, "unknownFalseAcceptance": "6/116", "unknownWilsonUpper": unknown["wilson95"][1],
            "headParityCases": parity_cases, "headParityPassed": True, "headParityCompletionSha256": PARITY_COMPLETION,
            "frozenFinalSourceSha256": FINAL, "predictionsRecomputed": False, "promotionAllowed": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--index-sha256")
    args = parser.parse_args(argv)
    print(json.dumps(verify(args.root, args.index_sha256), indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
