"""Verify this project's downloaded first-v3-fit ZIP; never predict/refit a model."""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MAX_ENTRIES = 1000
MAX_EXPANDED = 100 * 1024 * 1024
EXPECTED_DEV = "e0c86b5613b2c0b16e3f6df8f19abe7241228eb30b3df40f67ba1632b08d9ff7"
EXPECTED_FINAL = "197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520"
EXPECTED_CHROME = "f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4"


def require(value, message):
    if not value:
        raise ValueError(message)


def hex_digest(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def sha_file(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def archive_path(name):
    require(isinstance(name, str) and name and "\x00" not in name and "\\" not in name and ":" not in name,
            "Unsafe ZIP/ledger path")
    p = PurePosixPath(name)
    parts = name.rstrip("/").split("/")
    require(not p.is_absolute() and all(v and v not in {".", ".."} and not v.endswith((" ", ".")) for v in parts),
            "Absolute, traversal or Windows-aliased ZIP/ledger path")
    devices = {"con", "prn", "aux", "nul", *[f"com{i}" for i in range(1, 10)], *[f"lpt{i}" for i in range(1, 10)]}
    require(all(v.split(".")[0].casefold() not in devices for v in parts), "Windows device path in archive")
    return "/".join(parts)


def plan_zip(archive):
    infos = archive.infolist()
    require(0 < len(infos) <= MAX_ENTRIES, "ZIP entry count outside bounded limit")
    plan, seen, expanded = [], {}, 0
    for info in infos:
        require(info.filename == info.orig_filename and not (info.flag_bits & 1), "Truncated/encrypted ZIP entry")
        name = archive_path(info.filename)
        mode = (info.external_attr >> 16) & 0xffff
        kind = stat.S_IFMT(mode)
        require(kind in {0, stat.S_IFREG, stat.S_IFDIR} and not stat.S_ISLNK(mode), "Symlink/device entry in ZIP")
        require(not (info.external_attr & 0x400), "Windows reparse attribute in ZIP")
        directory = info.is_dir()
        require(kind != stat.S_IFDIR or directory, "Directory mode/name disagree")
        require(info.file_size >= 0 and info.compress_size >= 0 and (not directory or info.file_size == 0), "Invalid ZIP entry size")
        key = name.casefold()
        require(key not in seen, "Duplicate/case-colliding ZIP entry")
        seen[key] = directory
        expanded += info.file_size
        require(expanded <= MAX_EXPANDED, "ZIP expanded size exceeds 100 MiB")
        plan.append((info, name, directory))
    for _, name, _ in plan:
        parents = PurePosixPath(name).parents
        require(all(seen.get(p.as_posix().casefold(), True) for p in parents if p.as_posix() != "."),
                "File/directory ancestor collision in ZIP")
    return plan, expanded


def extract_zip(zip_path, expected_sha256, output):
    destination = Path(output).resolve()
    require(not destination.exists(), "Output already exists; preserve the immutable extraction")
    require(hex_digest(expected_sha256) and sha_file(zip_path) == expected_sha256, "Downloaded ZIP raw SHA256 mismatch")
    with zipfile.ZipFile(zip_path) as archive:
        plan, declared_size = plan_zip(archive)
        destination.mkdir(parents=True, exist_ok=False)
        actual_size = 0
        for info, relative, directory in plan:
            target = destination.joinpath(*PurePosixPath(relative).parts)
            require(target.resolve().is_relative_to(destination), "Resolved extraction target escapes new output")
            if directory:
                target.mkdir(parents=True, exist_ok=True)
                require(target.resolve().is_relative_to(destination) and not target.is_symlink(), "Unsafe extraction directory")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            require(target.parent.resolve().is_relative_to(destination) and not target.is_symlink(), "Unsafe extraction parent/file")
            member_size = 0
            # Exclusive creation and streaming independently enforce declared sizes;
            # ZipExtFile also verifies the member CRC when the stream is exhausted.
            with archive.open(info, "r") as source, target.open("xb") as saved:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    member_size += len(chunk)
                    actual_size += len(chunk)
                    require(member_size <= info.file_size and actual_size <= MAX_EXPANDED, "Actual expanded ZIP exceeds bounded sizes")
                    saved.write(chunk)
            require(member_size == info.file_size, "Expanded ZIP member size differs")
        require(actual_size == declared_size, "Total expanded ZIP size differs")
    require(sha_file(zip_path) == expected_sha256, "ZIP changed while extracting")
    return destination, {"entries": len(plan), "expandedBytes": actual_size, "zipSha256": expected_sha256}


def verify_fit(destination):
    # Existing local pinned packages are optional path discovery, never installed.
    sys.path.insert(0, str(ROOT))
    if (ROOT / "output/ml-python").is_dir():
        sys.path.insert(0, str(ROOT / "output/ml-python"))
    from ml.run_v3 import MODEL_OUTPUTS, _read, _equal, _sources, _development_bundle, _model_binding
    from ml.experiment_v3 import DEFAULT_CRITERIA

    completions = list(destination.rglob("fit-completion.json"))
    require(len(completions) == 1, "ZIP must contain exactly one completed fit")
    completion_path = completions[0]
    fit = completion_path.parent
    _, completion = _read(completion_path)
    require(type(completion.get("formatVersion")) is int and completion["formatVersion"] == 3 and completion.get("phase") == "fit"
            and completion.get("complete") is True and completion.get("promotionAllowed") is False, "Invalid/uncompleted fit marker")
    artifacts = completion.get("artifacts")
    require(isinstance(artifacts, dict) and {"fit-input.json", *MODEL_OUTPUTS}.issubset(artifacts), "Incomplete fit artifact index")
    inventory = {p.relative_to(fit).as_posix() for p in fit.rglob("*") if p.is_file()}
    require(inventory == set(artifacts) | {"fit-completion.json"}, "Unindexed or missing file inside fitted artifact tree")
    for relative, expected in artifacts.items():
        relative = archive_path(relative)
        target = fit / relative
        require(target.resolve().is_relative_to(fit.resolve()) and target.is_file() and not target.is_symlink(), "Unsafe/missing indexed artifact")
        require(isinstance(expected, dict) and type(expected.get("bytes")) is int and expected["bytes"] >= 0 and hex_digest(expected.get("sha256"))
                and target.stat().st_size == expected["bytes"] and sha_file(target) == expected["sha256"], "Indexed artifact bytes/SHA differ: " + relative)
    _, evidence = _read(fit / "fit-input.json", completion.get("fitInputSha256"))
    current_sources = _sources()
    require(evidence.get("phase") == "fit" and evidence.get("promotionAllowed") is False and evidence.get("freshFinalEvaluated") is False
            and evidence.get("seed") == 18043 and _equal(evidence.get("criteria"), asdict(DEFAULT_CRITERIA)), "Changed fit phase/seed/criteria")
    require(evidence.get("developmentSourceSha256") == EXPECTED_DEV and evidence.get("frozenFinalSourceSha256") == EXPECTED_FINAL, "Wrong frozen development/final manifest")
    require(_equal(evidence.get("sourceSha256"), current_sources), "Fit source pins differ from current ROOT")
    require(_equal({k: v for k, v in artifacts.items() if k not in {"fit-input.json", *MODEL_OUTPUTS}}, evidence.get("artifacts")), "Completion is not bound to all original input artifacts")
    for relative, digest in current_sources.items():
        require(sha_file(fit / "sources" / relative) == digest, "Copied source differs from current ROOT pin")
    dev, _, _ = _development_bundle(fit / "inputs/development/manifest-v3-development.json", EXPECTED_DEV)
    qualification = evidence.get("qualification", {})
    require(qualification.get("referenceSha256") == EXPECTED_CHROME and qualification.get("cases") == 26
            and qualification.get("allRecomputedBitExact") is True, "Wrong/unpassed numerical qualification")
    require(sha_file(fit / "inputs/qualification/chrome-reference.json") == EXPECTED_CHROME, "Copied Chrome reference changed")
    # This validates integer bounds, exact parameters/rules and source/manifest/
    # encoder bindings. It calls no predictor. Deliberately DO NOT call _load_fit:
    # the recorded Linux training runtime is evidence, not this Windows runtime.
    head, _ = _model_binding(fit, dev, evidence)
    _, report = _read(fit / "development_v3.json")
    require(report.get("promotionAllowed") is False and report.get("freshTestEvaluated") is False
            and _equal(report.get("criteria"), asdict(DEFAULT_CRITERIA)), "Report wrongly claims promotion/final data")
    audit = report["developmentAudit"]
    require(audit.get("promotionAllowed") is False and len(audit["perClass"]) == 5, "Invalid recorded development audit")
    summary = {"verified": True, "promotionAllowed": False, "predictionsRecomputed": False,
        "fitDirectory": str(fit), "headRawSha256": sha_file(fit / "research_head_v3.json"),
        "fitCompletionSha256": sha_file(completion_path), "frozenParametersAndRulesSha256": head["provenance"]["frozenParametersAndRulesSha256"],
        "selected": report["training"]["selected"], "calibration": report["calibration"],
        "developmentAuditPassed": audit["developmentAuditPassed"], "perClass": audit["perClass"],
        "knownPrecision": audit["knownSelectivePrecision"], "unknownFalseAcceptance": audit["unknownFalseAcceptance"],
        "fitRuntime": evidence["fitRuntime"], "developmentSourceSha256": EXPECTED_DEV,
        "frozenFinalSourceSha256": EXPECTED_FINAL, "indexedFitFiles": len(artifacts)}
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", required=True, dest="archive")
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    destination, archive_info = extract_zip(args.archive, args.sha256, args.output)
    summary = {**verify_fit(destination), "download": archive_info}
    raw = (json.dumps(summary, indent=2, allow_nan=False) + "\n").encode()
    with (destination / "verified-fit-summary.json").open("xb") as handle:
        handle.write(raw)
    print(raw.decode(), end="")


if __name__ == "__main__":
    main()
