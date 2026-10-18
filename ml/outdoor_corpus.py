"""Metadata-only outdoor datacenter corpus audit. No audio, network or model I/O.

The ledger contains human evidence assertions; this audit cannot verify their
truth. Its positive label is a prospective training role, not causal proof.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlsplit


LABELS = {"verified-source-positive", "facility-adjacent-uncertain", "hard-negative", "excluded"}
SPLITS = {"unassigned", "train", "calibration", "test", "excluded"}
ACTIVE_SPLITS = ("train", "calibration", "test")
CONTROLS = {"non-datacenter-cooling", "road-traffic", "rail-traffic", "wind", "transformer",
            "insects", "speech", "generator", "industrial-machinery", "quiet-background"}
SOURCE_METHODS = {"paired-source-isolation", "documented-operational-change",
                  "independent-acoustic-study", "operator-confirmation-with-audio"}
EVIDENCE_METHODS = SOURCE_METHODS | {"context-only", "none", "unknown"}
HASH_FIELDS = ("originalSha256", "derivedSha256", "pcmSha256")
HISTORICAL_FIELDS = ("sourceIds", "facilityIds", "sessionGroups", "collectionGroups", *HASH_FIELDS)


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _identity(value: str) -> str:
    return value.strip().casefold()


def _url(value: Any) -> bool:
    if not _text(value):
        return False
    try:
        parsed = urlsplit(value)
        return parsed.scheme in {"https", "http"} and bool(parsed.hostname) and not parsed.username and not parsed.password
    except ValueError:
        return False


def _number(value: Any) -> bool:
    return type(value) in (int, float) and math.isfinite(value)


def _hash(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) is not None


def _record_errors(row: Any) -> list[str]:
    if not isinstance(row, dict):
        return ["Record must be an object."]
    errors = []
    for key in ("sourceId", "collectionGroup", "sessionGroup"):
        if not _text(row.get(key)):
            errors.append(f"{key} must be a nonempty string.")
    if not _url(row.get("sourceUrl")):
        errors.append("sourceUrl must be an exact HTTP(S) source URL without credentials.")
    if "facilityId" not in row or (row.get("facilityId") is not None and not _text(row.get("facilityId"))):
        errors.append("facilityId must be null or a nonempty string.")
    choices = {"split": SPLITS, "domain": {"outdoor", "indoor", "mixed", "unknown"},
               "claimedLabel": LABELS, "history": {"new", "historical-development", "inspected-evaluation", "unknown"}}
    for key, allowed in choices.items():
        if not isinstance(row.get(key), str) or row[key] not in allowed:
            errors.append(f"{key} has an unsupported or missing value.")
    if row.get("controlType") is not None and (not isinstance(row["controlType"], str) or row["controlType"] not in CONTROLS):
        errors.append("controlType must be null or a supported outdoor control type.")
    lineage = row.get("lineage")
    if not isinstance(lineage, dict):
        errors.append("lineage must be an object.")
    else:
        if not _text(lineage.get("originalSourceId")):
            errors.append("lineage.originalSourceId must identify the original recording.")
        for key in HASH_FIELDS:
            if key not in lineage or (lineage[key] is not None and not _hash(lineage[key])):
                errors.append(f"lineage.{key} must be null or a lowercase SHA256.")
        parents = lineage.get("parentSourceIds")
        if not isinstance(parents, list) or not all(_text(p) for p in parents):
            errors.append("lineage.parentSourceIds must be a list of source IDs.")
    observation = row.get("observation")
    if not isinstance(observation, dict):
        errors.append("observation must be an object.")
    else:
        for key in ("durationSeconds", "unpaddedDurationSeconds"):
            value = observation.get(key)
            if key not in observation or (value is not None and (not _number(value) or value <= 0)):
                errors.append(f"observation.{key} must be null or a finite positive number.")
        for key in ("sampleRateHz", "channels"):
            value = observation.get(key)
            if key not in observation or (value is not None and (type(value) is not int or value <= 0)):
                errors.append(f"observation.{key} must be null or a positive integer.")
        duration, natural = observation.get("durationSeconds"), observation.get("unpaddedDurationSeconds")
        if _number(duration) and _number(natural) and natural > duration:
            errors.append("Unpadded duration cannot exceed observed duration.")
    processing = row.get("processing")
    if not isinstance(processing, dict):
        errors.append("processing must be an object.")
    else:
        for key, allowed in {"status": {"unprocessed", "processed", "unknown"},
                             "loopStatus": {"none", "looped", "unknown"},
                             "voiceoverStatus": {"none", "present", "unknown"},
                             "musicStatus": {"none", "present", "unknown"}}.items():
            if not isinstance(processing.get(key), str) or processing[key] not in allowed:
                errors.append(f"processing.{key} has an unsupported or missing value.")
        if not isinstance(processing.get("details"), str):
            errors.append("processing.details must be a string; describe known processing.")
        elif processing.get("status") == "processed" and not processing["details"].strip():
            errors.append("Known processing requires processing.details.")
    evidence = row.get("evidence")
    if not isinstance(evidence, dict):
        errors.append("evidence must be an object.")
    else:
        for key in ("facilityVerified", "outdoorVerified", "naturalAudioVerified"):
            if type(evidence.get(key)) is not bool:
                errors.append(f"evidence.{key} must be an explicit boolean.")
        if "facilityIdentityPublic" in evidence and type(evidence["facilityIdentityPublic"]) is not bool:
            errors.append("evidence.facilityIdentityPublic must be a boolean when supplied.")
        for key, allowed in {"sourceContribution": {"verified", "uncertain", "not-applicable", "unknown"},
                             "method": EVIDENCE_METHODS}.items():
            if not isinstance(evidence.get(key), str) or evidence[key] not in allowed:
                errors.append(f"evidence.{key} has an unsupported or missing value.")
        refs = evidence.get("references")
        if not isinstance(refs, list) or not all(_url(value) for value in refs):
            errors.append("evidence.references must be a list of exact HTTP(S) evidence URLs.")
        if not _text(evidence.get("rationale")):
            errors.append("evidence.rationale must explain the asserted context and source evidence.")
    return errors


class _Components:
    def __init__(self, size: int):
        self.parents = list(range(size))

    def find(self, index: int) -> int:
        while self.parents[index] != index:
            self.parents[index] = self.parents[self.parents[index]]
            index = self.parents[index]
        return index

    def union(self, left: int, right: int) -> None:
        a, b = self.find(left), self.find(right)
        if a != b:
            self.parents[max(a, b)] = min(a, b)


def audit_corpus(document: Any) -> dict[str, Any]:
    """Return blockers, warnings and conservative dependency-component counts.

    Reads only supplied metadata. A successful result permits a prospective
    pilot's next review, never model promotion, source proof or file validation.
    """
    blockers: list[dict] = []
    warnings: list[dict] = []

    def issue(target, code, message, source_ids=None):
        value = {"code": code, "message": message}
        if source_ids:
            value["sourceIds"] = source_ids
        target.append(value)

    report: dict[str, Any] = {"schemaVersion": 1, "audit": "tw-outdoor-corpus-metadata-v1",
                             "metadataOnly": True, "audioFilesRead": False, "modelQueries": False,
                             "promotionAllowed": False, "readyForPilot": False,
                             "blockers": blockers, "warnings": warnings, "records": [], "components": []}
    if not isinstance(document, dict) or type(document.get("schemaVersion")) is not int or document["schemaVersion"] != 1 or not isinstance(document.get("records"), list):
        issue(blockers, "invalid-ledger", "Require schemaVersion 1 and a records list.")
        return report
    if not document["records"]:
        issue(blockers, "empty-ledger", "No recordings are available for a field pilot.")

    exclusions = document.get("historicalExclusions")
    history: dict[str, set] = {key: set() for key in HISTORICAL_FIELDS}
    if not isinstance(exclusions, dict):
        issue(blockers, "historical-exclusions-missing", "Bind the already inspected cohorts' IDs and hashes before a fresh pilot.")
    else:
        for key in HISTORICAL_FIELDS:
            values = exclusions.get(key, [])
            if not isinstance(values, list) or not all(_hash(v) if key in HASH_FIELDS else _text(v) for v in values):
                issue(blockers, "invalid-historical-exclusions", f"historicalExclusions.{key} is malformed.")
            else:
                history[key] = {_identity(value) for value in values}
        if not any(history[key] for key in ("sourceIds", *HASH_FIELDS)):
            issue(blockers, "historical-exclusions-empty", "An empty history assertion cannot establish separation from inspected audio.")

    valid = []
    seen_ids = set()
    for index, row in enumerate(document["records"]):
        errors = _record_errors(row)
        source_id = row.get("sourceId") if isinstance(row, dict) else None
        if errors:
            issue(blockers, "malformed-record", f"Record {index}: " + " ".join(errors), [source_id] if _text(source_id) else None)
            continue
        identity = _identity(source_id)
        if identity in seen_ids:
            issue(blockers, "duplicate-source-id", "Source IDs must be unique, including case/space variants.", [source_id])
        seen_ids.add(identity)
        valid.append(row)

    components = _Components(len(valid))
    seen_tokens: dict[tuple[str, str], int] = {}
    edge_reasons: dict[int, set[str]] = defaultdict(set)
    for index, row in enumerate(valid):
        lineage = row["lineage"]
        tokens = [("sourceId", row["sourceId"]), ("sourceId", lineage["originalSourceId"]),
                  ("collectionGroup", row["collectionGroup"]), ("sessionGroup", row["sessionGroup"]),
                  ("sourceUrl", row["sourceUrl"].split("#", 1)[0])]
        tokens.extend(("sourceId", parent) for parent in lineage["parentSourceIds"])
        if row["facilityId"] is not None:
            tokens.append(("facilityId", row["facilityId"]))
        # Hash domains deliberately share a namespace: a source's original can
        # be another source's derived copy, and identical PCM is still duplicate.
        tokens.extend(("contentSha256", lineage[key]) for key in HASH_FIELDS if lineage[key])
        for kind, value in tokens:
            token = (kind, value if kind == "sourceUrl" else _identity(value))
            if token in seen_tokens:
                other = seen_tokens[token]
                components.union(index, other)
                edge_reasons[index].add(kind)
                edge_reasons[other].add(kind)
            else:
                seen_tokens[token] = index

    effective = []
    historical_hashes = set().union(*(history[key] for key in HASH_FIELDS))
    for row in valid:
        source_id, claimed = row["sourceId"], row["claimedLabel"]
        observation, processing, evidence, lineage = (row[key] for key in ("observation", "processing", "evidence", "lineage"))
        reasons = []
        history_matches = []
        for field, value in (("sourceIds", source_id), ("sourceIds", lineage["originalSourceId"]),
                             ("facilityIds", row["facilityId"]), ("sessionGroups", row["sessionGroup"]),
                             ("collectionGroups", row["collectionGroup"])):
            if value is not None and _identity(value) in history[field]:
                history_matches.append(field)
        if any(_identity(parent) in history["sourceIds"] for parent in lineage["parentSourceIds"]):
            history_matches.append("parentSourceIds")
        # Compare each content identity across all historical hash roles too.
        if any(lineage[key] in historical_hashes for key in HASH_FIELDS if lineage[key]):
            history_matches.append("contentSha256")
        if history_matches or row["history"] != "new":
            reasons.append("Fresh-pilot separation is absent or historical/inspected lineage is present.")
            if row["split"] in ACTIVE_SPLITS:
                issue(blockers, "historical-audio-in-fresh-split", reasons[-1], [source_id])
        if row["domain"] != "outdoor" or not evidence["outdoorVerified"]:
            reasons.append("The selected audio interval is not verified outdoor audio.")
        if not evidence["naturalAudioVerified"]:
            reasons.append("Natural ambient audio has not been verified.")
        if not _number(observation["unpaddedDurationSeconds"]) or observation["unpaddedDurationSeconds"] < 5:
            reasons.append("At least five genuine unpadded seconds have not been established.")
        if observation["durationSeconds"] is None:
            reasons.append("Observed duration is unknown.")
        if observation["sampleRateHz"] is None or observation["channels"] is None:
            reasons.append("Observed sample rate or channel count is unknown.")
        if any(lineage[key] is None for key in HASH_FIELDS):
            reasons.append("Original, derived and PCM identities are not all pinned.")
        for key in ("loopStatus", "voiceoverStatus", "musicStatus"):
            if processing[key] != "none":
                reasons.append(f"{key} is {processing[key]}; select and review an eligible natural interval first.")
        if processing["status"] == "unknown":
            issue(warnings, "unknown-processing", "Microphone/production processing is unknown; no fidelity claim follows.", [source_id])
            reasons.append("Production processing has not been reviewed for destructive edits.")
        elif processing["status"] == "processed":
            issue(warnings, "processed-recording", "Documented processing requires review; do not treat it as an unprocessed measurement.", [source_id])
        if observation["sampleRateHz"] not in (None, 44100, 48000):
            issue(warnings, "preparation-rate-needed", "Native rate needs an explicitly documented preparation/resampling contract before this app's encoder.", [source_id])
        if not evidence["references"]:
            reasons.append("No independently reviewable evidence URL is recorded.")

        label = claimed
        if claimed in {"verified-source-positive", "facility-adjacent-uncertain"}:
            if row["facilityId"] is None or not evidence["facilityVerified"]:
                reasons.append("Datacenter facility context has not been verified.")
            if evidence.get("facilityIdentityPublic") is False:
                issue(warnings, "opaque-facility-identity", "The expert/source context uses an opaque site identity. Share the collection group wherever independent facilities or sessions cannot be established.", [source_id])
        if claimed == "verified-source-positive" and (evidence["sourceContribution"] != "verified" or evidence["method"] not in SOURCE_METHODS):
            label = "facility-adjacent-uncertain"
            issue(blockers if row["split"] in ACTIVE_SPLITS else warnings, "positive-source-evidence-missing",
                  "Facility proximity/context cannot establish a positive source-contribution label.", [source_id])
        if claimed == "hard-negative":
            if row["controlType"] is None:
                reasons.append("Hard negatives require a documented control type.")
            if evidence["sourceContribution"] != "not-applicable":
                reasons.append("A hard negative must explicitly document a non-datacenter context, not uncertain absence.")
        if reasons or claimed == "excluded" or row["split"] == "excluded":
            label = "excluded"
        if row["split"] in ACTIVE_SPLITS and label == "excluded":
            issue(blockers, "ineligible-active-record", "Record assigned to a pilot split is ineligible: " + " ".join(reasons), [source_id])
        elif reasons and claimed != "excluded":
            issue(warnings, "ineligible-source-lead", " ".join(reasons), [source_id])
        if claimed == "facility-adjacent-uncertain" or label == "facility-adjacent-uncertain":
            issue(warnings, "uncertain-not-ground-truth", "Keep this context example uncertain; it is neither a positive nor a verified negative.", [source_id])
        if label != "excluded" and row["split"] == "unassigned":
            issue(blockers, "split-unassigned", "Freeze group-disjoint roles before embedding or fitting.", [source_id])
        effective.append(label)
        report["records"].append({"sourceId": source_id, "claimedLabel": claimed, "effectiveLabel": label,
                                  "split": row["split"], "ineligibilityReasons": reasons,
                                  "historicalMatches": sorted(set(history_matches))})

    members: dict[int, list[int]] = defaultdict(list)
    for index in range(len(valid)):
        members[components.find(index)].append(index)
    for number, indices in enumerate(members.values(), 1):
        active = {valid[i]["split"] for i in indices if valid[i]["split"] in ACTIVE_SPLITS}
        source_ids = [valid[i]["sourceId"] for i in indices]
        if any(valid[i]["history"] != "new" or report["records"][i]["historicalMatches"] for i in indices):
            active_ids = [valid[i]["sourceId"] for i in indices if valid[i]["split"] in ACTIVE_SPLITS]
            if active_ids:
                issue(blockers, "historical-component-in-fresh-split",
                      "A connected parent/variant/site component contains historical or inspected lineage.", active_ids)
            for i in indices:
                if effective[i] != "excluded":
                    effective[i] = "excluded"
                    report["records"][i]["effectiveLabel"] = "excluded"
                    report["records"][i]["ineligibilityReasons"].append("Connected component contains historical or inspected lineage.")
        component = {"componentId": f"group-{number:04d}", "sourceIds": source_ids,
                     "facilityIds": sorted({valid[i]["facilityId"] for i in indices if valid[i]["facilityId"]}),
                     "activeSplits": sorted(active), "effectiveLabels": dict(Counter(effective[i] for i in indices)),
                     "dependencyReasons": sorted(set().union(*(edge_reasons[i] for i in indices)))}
        report["components"].append(component)
        if len(active) > 1:
            issue(blockers, "connected-split-leakage", "A facility/session/collection/lineage/content component crosses pilot splits.", source_ids)
        if len(indices) > 1:
            issue(warnings, "dependent-recordings", f"These {len(indices)} records count as one dependent group, not independent examples.", source_ids)

    by_split = {}
    for split in ACTIVE_SPLITS:
        indices = [i for i, row in enumerate(valid) if row["split"] == split and effective[i] != "excluded"]
        labels = Counter(effective[i] for i in indices)
        controls = Counter(valid[i]["controlType"] for i in indices if effective[i] == "hard-negative")
        positive_groups = {components.find(i) for i in indices if effective[i] == "verified-source-positive"}
        negative_groups = {components.find(i) for i in indices if effective[i] == "hard-negative"}
        by_split[split] = {"records": len(indices), "labels": dict(labels), "controlTypes": dict(controls),
                           "positiveIndependentGroups": len(positive_groups), "negativeIndependentGroups": len(negative_groups)}
        for label in ("verified-source-positive", "hard-negative"):
            if not labels[label]:
                issue(blockers, "missing-split-class", f"{split} has no eligible {label} recording.")
        if not controls["non-datacenter-cooling"]:
            issue(blockers, "missing-lookalike-control", f"{split} needs real non-datacenter cooling controls.")
        if len(positive_groups) == 1:
            issue(warnings, "single-positive-group", f"{split} has only one independent positive group; its result cannot establish facility generalization.")
    eligible_controls = {row["controlType"] for row, label in zip(valid, effective) if label == "hard-negative" and row["split"] in ACTIVE_SPLITS}
    for family, required in (("traffic", {"road-traffic", "rail-traffic"}), ("wind", {"wind"})):
        if not eligible_controls & required:
            issue(blockers, "missing-environment-control", f"The pilot lacks eligible {family} controls.")
    positive_facilities = {_identity(row["facilityId"]) for row, label in zip(valid, effective) if label == "verified-source-positive" and row["facilityId"]}
    report["summary"] = {"submittedRecords": len(document["records"]), "validMetadataRecords": len(valid),
                         "effectiveLabels": dict(Counter(effective)), "dependencyComponents": len(members),
                         "eligiblePositiveFacilities": len(positive_facilities), "bySplit": by_split}
    report["readyForPilot"] = not blockers
    return report


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"Duplicate JSON key: {key}")
        value[key] = item
    return value


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    path, destination = Path(args.ledger), Path(args.output)
    if path.resolve() == destination.resolve():
        parser.error("Output must not overwrite the input ledger.")
    raw = path.read_bytes()
    if len(raw) > 8 * 1024 * 1024:
        parser.error("Ledger exceeds 8 MiB metadata limit.")
    try:
        document = json.loads(raw, object_pairs_hook=_unique_object,
                              parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Nonfinite JSON value: {value}")))
    except (ValueError, UnicodeDecodeError) as exc:
        parser.error(f"Invalid ledger JSON: {exc}")
    report = audit_corpus(document)
    report["ledgerSha256"] = hashlib.sha256(raw).hexdigest()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"readyForPilot": report["readyForPilot"], "blockers": len(report["blockers"]),
                      "warnings": len(report["warnings"]), "report": str(destination), "modelQueries": False}))
    return 0 if report["readyForPilot"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
