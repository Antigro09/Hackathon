"""Blind historical development assembly, with no audio reads or inference.

Every old v1/v2 split, including inspected tests, is DEVELOPMENT ONLY here.
Raw input manifests and the explicit final-reservation file are SHA256-bound.
Metadata-only whole-lineage stratification is fixed at seed18043, 50/25/25.
Small class/group strata are reported, never hidden or repaired using scores.

The source manifest can be staged by ml.browser.prepareCanonical. Existing
Colab local_path values are preserved; explicit prefix remapping or relative
path resolution is metadata only. Canonical staging must verify actual files.
Only stdlib is needed, so this step cannot accidentally load an ML model.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
from typing import Any, Mapping, Sequence
from urllib.parse import urlparse

SEED = 18043
KNOWN = ("buzz", "mechanical_fan", "speech", "traffic", "wind")
STRATA = (*KNOWN, "__unknown__")
PHASES = ("train", "calibration", "audit")
FRACTIONS = (0.5, 0.25, 0.25)
OLD_SPLITS = {"train", "val", "test", "ood_val", "ood_test"}
HASH_FIELDS = ("original_sha256", "sha256", "pcm_sha256")
FINAL_COLLECTIONS = {"tobee:nu-hive", "tobee:osbh-citizen-science"}
ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class HistoricalSource:
    name: str
    path: Path
    sha256: str


DEFAULT_PINNED_SOURCES = (
    HistoricalSource("v1", ROOT / "ml/runs/2026-10-18/manifest.json", "1c5f7a8ba2f5d38c661073deeadc5253a5e4c70ce8d2143a975a69a392731549"),
    HistoricalSource("v2", ROOT / "ml/runs/2026-10-18-v2/manifest-v2.json", "8a22e336d2eb1806ab228b381badb46156e67f198013d77b31a0565fbb3f0ab8"),
)


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()


def _hex(value: Any) -> bool:
    return isinstance(value, str) and bool(re.fullmatch("[0-9a-f]{64}", value))


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing nonempty {name}")
    return value.strip()


def _group(value: Any) -> str:
    return _text(value, "group").casefold()


def _read_pinned(path: str | Path, expected: str) -> tuple[bytes, dict]:
    if not _hex(expected):
        raise ValueError("Require an explicit lowercase SHA256 pin")
    raw = Path(path).read_bytes()
    if _sha(raw) != expected:
        raise ValueError(f"Raw file SHA256 mismatch: {path}")
    document = json.loads(raw)
    if not isinstance(document, dict):
        raise ValueError("Pinned input must be a JSON object")
    return raw, document


def _license(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    url = urlparse(value)
    if url.scheme not in {"http", "https"} or url.hostname not in {"creativecommons.org", "www.creativecommons.org"} or url.query or url.fragment:
        return None
    path = url.path.rstrip("/")
    if not re.fullmatch(r"/(publicdomain/zero/1\.0|licenses/by/(1\.0|2\.0|2\.5|3\.0|4\.0))", path):
        return None
    return "https://creativecommons.org" + path + "/"


def _recording_key(record: Mapping[str, Any]) -> str:
    dataset = _group(record["dataset"])
    url = urlparse(_text(record.get("source_url"), "source URL"))
    if url.scheme not in {"http", "https"} or not url.hostname:
        raise ValueError("Require an attributed original source URL")
    if dataset == "fsd50k":
        # Both /s/123/ and /people/creator/sounds/123/ refer to the same sound.
        match = re.search(r"/(?:s|sounds)/(\d+)(?:/|$)", url.path)
        if url.hostname not in {"freesound.org", "www.freesound.org"} or not match or match[1] != record["clip_id"]:
            raise ValueError("FSD50K source URL differs from its Freesound clip ID")
        return "freesound:" + match[1]
    member = record.get("archive_member") or record.get("source_filename") or record.get("source_recording_id")
    if not isinstance(member, str) or not member:
        raise ValueError("Collection URLs require a per-recording member/filename identity")
    return dataset + ":" + url.hostname.casefold() + url.path.rstrip("/") + ":" + member


def _aliases(record: Mapping[str, Any]) -> set[str]:
    dataset = _group(record["dataset"])
    aliases = {"uploader:" + _group(record["uploader"]), "group:" + _group(record["uploader_group"])}
    for key in ("session_id", "session_group", "source_group", "source_recording_id", "recording_group", "physical_unit", "hive_id"):
        if record.get(key) is not None:
            aliases.add(key + ":" + dataset + ":" + _group(record[key]))
    # These collections share laboratory/hive hardware. A dataset-wide platform
    # label such as BSD/Freesound is not automatically a shared physical session.
    if record.get("collection_group") and (dataset in {"ivbee", "tobee"} or record.get("collection_group_is_independence_unit") is True):
        aliases.add("collection:" + _group(record["collection_group"]))
    return aliases


class _Components:
    def __init__(self, count: int):
        self.parent = list(range(count))

    def find(self, index: int) -> int:
        while self.parent[index] != index:
            self.parent[index] = self.parent[self.parent[index]]
            index = self.parent[index]
        return index

    def join(self, a: int, b: int) -> None:
        a, b = self.find(a), self.find(b)
        self.parent[max(a, b)] = min(a, b)


def _path(value: str, source: Path, remap: Mapping[str, str]) -> str:
    normalized = _text(value, "local_path").replace("\\", "/")
    if "://" in normalized or ".." in PurePosixPath(normalized).parts:
        raise ValueError("Invalid local audio path")
    for old in sorted(remap, key=lambda p: (-len(p), p)):
        prefix = old.replace("\\", "/").rstrip("/")
        if normalized == prefix or normalized.startswith(prefix + "/"):
            normalized = remap[old].replace("\\", "/").rstrip("/") + normalized[len(prefix):]
            break
    if PureWindowsPath(normalized).drive and not PureWindowsPath(normalized).is_absolute():
        raise ValueError("Drive-relative local paths are ambiguous")
    if not (PurePosixPath(normalized).is_absolute() or PureWindowsPath(normalized).is_absolute()):
        normalized = str((source.parent / normalized).resolve())
    return normalized


def _reservations(path: str | Path, pin: str) -> tuple[dict, dict[str, set[str]], bytes]:
    raw, document = _read_pinned(path, pin)
    if document.get("formatVersion") != 1 or document.get("seed") != SEED or document.get("purpose") != "v3-final-reservations":
        raise ValueError("Unsupported final reservation schema/policy")
    values = {}
    for name in ("groups", "clip_ids", "original_sha256", "prepared_sha256", "pcm_sha256", "collection_groups"):
        items = document.get(name, [] if name == "collection_groups" else None)
        if not isinstance(items, list) or any(not isinstance(v, str) or not v.strip() for v in items):
            raise ValueError(f"Invalid final reservation list: {name}")
        if name.endswith("sha256") and not all(_hex(v) for v in items):
            raise ValueError("Invalid final reservation content hash")
        values[name] = {_group(v) if name in {"groups", "collection_groups"} else v for v in items}
    if not values["groups"]:
        raise ValueError("Explicit nonempty final group reservations are required")
    values["collection_groups"] |= FINAL_COLLECTIONS
    for evidence in document.get("source_manifests", []):
        if not isinstance(evidence, dict) or not _hex(evidence.get("sha256")) or not isinstance(evidence.get("path"), str):
            raise ValueError("Invalid declared reservation source fingerprint")
    return {"sha256": _sha(raw), "document": document, "sourceManifestsIndependentlyRead": False}, values, raw


def _reserved(record: Mapping[str, Any], values: dict[str, set[str]]) -> bool:
    group = _group(record["uploader_group"])
    identities = {group, _group(record["uploader"])}
    identities.update(_group(record[key]) for key in ("collection_group", "session_id", "session_group", "source_group", "source_recording_id", "recording_group", "physical_unit", "hive_id") if record.get(key) is not None)
    return bool(record["clip_id"] in values["clip_ids"] or identities & values["groups"]
            or any(record[field] in values["original_sha256"] | values["prepared_sha256"] | values["pcm_sha256"] for field in HASH_FIELDS)
            or (record.get("collection_group") and _group(record["collection_group"]) in values["collection_groups"])
            or record["dataset"].casefold() == "tobee" or group.startswith("tobee:"))


def _rank(value: str) -> str:
    return _sha(f"{SEED}:{value}".encode())


def _assign(groups: Mapping[str, list[dict]]) -> dict[str, str]:
    totals = Counter("__unknown__" if r["label"] not in KNOWN else r["label"] for rows in groups.values() for r in rows)
    group_totals = Counter(c for rows in groups.values() for c in {"__unknown__" if r["label"] not in KNOWN else r["label"] for r in rows})
    counts = {phase: Counter() for phase in PHASES}
    owners = {phase: Counter() for phase in PHASES}
    assignment = {}
    def vector(rows):
        return Counter("__unknown__" if r["label"] not in KNOWN else r["label"] for r in rows)
    order = sorted(groups, key=lambda group: (-max(vector(groups[group])[c] / totals[c] for c in vector(groups[group])), _rank(group)))
    for group in order:
        amount = vector(groups[group])
        def cost(phase):
            fraction = FRACTIONS[PHASES.index(phase)]
            # Metadata-only incremental squared imbalance. Equal class strata
            # matter despite unequal clip totals; group imbalance adds 10%.
            return sum((((counts[phase][c] + n - totals[c] * fraction) ** 2 - (counts[phase][c] - totals[c] * fraction) ** 2) / totals[c] ** 2
                        + 0.1 * ((owners[phase][c] + 1 - group_totals[c] * fraction) ** 2 - (owners[phase][c] - group_totals[c] * fraction) ** 2) / group_totals[c] ** 2)
                       for c, n in amount.items())
        chosen = min(PHASES, key=lambda phase: (cost(phase), _rank(group + ":" + phase)))
        assignment[group] = chosen
        counts[chosen].update(amount)
        owners[chosen].update(amount.keys())
    return assignment


def assemble_historical_v3(
    output_dir: str | Path, reservations_path: str | Path, reservation_sha256: str, *,
    sources: Sequence[HistoricalSource] = DEFAULT_PINNED_SOURCES,
    path_prefix_map: Mapping[str, str] | None = None,
) -> Path:
    """Freeze development roles without opening audio, embeddings or final data.

    Source overrides require explicit raw SHA pins (intended for synthetic
    tests/declared historical snapshots). Existing output directories are never
    overwritten. Reservation source-manifest entries are retained declarations;
    the reservation builder owns their separate verification and completeness.
    """
    destination = Path(output_dir)
    if destination.exists():
        raise ValueError("Preserve immutable output; choose a new assembly directory")
    if not sources or any(not isinstance(s, HistoricalSource) or not isinstance(s.name, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*", s.name) for s in sources) or len({s.name for s in sources}) != len(sources):
        raise ValueError("Require uniquely named pinned historical sources")
    remap = dict(path_prefix_map or {})
    if any(not isinstance(k, str) or not k.strip() or not isinstance(v, str) or not v.strip() or ".." in PurePosixPath(v.replace('\\', '/')).parts for k, v in remap.items()):
        raise ValueError("Invalid explicit audio path prefix map")
    reservation, reserved, reservation_raw = _reservations(reservations_path, reservation_sha256)
    originals, candidates, source_info, raw_sources = [], [], [], {}
    for source in sorted(sources, key=lambda item: item.name):
        raw, document = _read_pinned(source.path, source.sha256)
        raw_sources[f"historical-manifests/{source.name}.json"] = raw
        records = document.get("records")
        if not isinstance(records, list) or not records:
            raise ValueError("Historical manifests require nonempty records")
        source_info.append({"name": source.name, "sha256": _sha(raw), "bytes": len(raw), "records": len(records)})
        for index, original in enumerate(records):
            if not isinstance(original, dict):
                raise ValueError("Malformed historical record")
            r = dict(original)
            for key in ("clip_id", "label", "split", "uploader", "uploader_group", "license", "local_path"):
                _text(r.get(key), key)
            r["dataset"] = _text(r.get("dataset", "FSD50K"), "dataset")
            if r["split"] not in OLD_SPLITS or (r["split"].startswith("ood_") == (r["label"] in KNOWN)):
                raise ValueError("Historical known/unknown split-label mismatch")
            if not all(_hex(r.get(key)) for key in HASH_FIELDS):
                raise ValueError("Every historical record needs original/prepared/PCM SHA256s, even if excluded")
            if r.get("sample_rate") != 48000 or r.get("samples") != 240000 or r.get("channel") != 0 or r.get("crop_start_seconds") != 0 or r.get("crop_duration_seconds") != 5 or r.get("gain_applied") is not False:
                raise ValueError("Historical preprocessing differs from the frozen five-second policy")
            identity = _recording_key(r)
            reference = {"manifest": source.name, "recordIndex": index}
            originals.append({**reference, "record": original})
            candidates.append({"record": r, "reference": reference, "path": _path(r["local_path"], Path(source.path), remap), "source": identity})
    # Cross-kind hash identities count too. A prepared file can be another
    # record's original. Collection DOI alone never identifies a single clip.
    duplicates = _Components(len(candidates))
    seen = {}
    for i, item in enumerate(candidates):
        r = item["record"]
        identities = ["clip:" + r["clip_id"], "source:" + item["source"], *["hash:" + r[k] for k in HASH_FIELDS]]
        for identity in identities:
            if identity in seen:
                duplicates.join(i, seen[identity])
            seen[identity] = i
    clusters = defaultdict(list)
    for i, item in enumerate(candidates):
        clusters[duplicates.find(i)].append(item)
    unique = []
    for members in clusters.values():
        members.sort(key=lambda item: (item["record"]["clip_id"], item["reference"]["manifest"], item["reference"]["recordIndex"]))
        representative = members[0]
        base = representative["record"]
        for item in members[1:]:
            r = item["record"]
            equivalent = (r["label"] == base["label"] and r["dataset"].casefold() == base["dataset"].casefold()
                and _group(r["uploader"]) == _group(base["uploader"]) and _group(r["uploader_group"]) == _group(base["uploader_group"])
                and r["original_sha256"] == base["original_sha256"] and r["pcm_sha256"] == base["pcm_sha256"]
                and _license(r["license"]) == _license(base["license"]) and _aliases(r) == _aliases(base)
                and all(r.get(key) == base.get(key) for key in ("sample_rate", "samples", "crop_start_seconds", "crop_duration_seconds", "channel", "gain_applied", "original_sample_rate", "original_channels", "original_labels")))
            if not equivalent:
                raise ValueError(f"Conflicting duplicate label/lineage: {base['clip_id']} versus {r['clip_id']}")
        unique.append({**representative, "history": [item["reference"] for item in members], "members": members})
    unique.sort(key=lambda item: item["record"]["clip_id"])
    connected, alias_owner = _Components(len(unique)), {}
    for i, item in enumerate(unique):
        for alias in _aliases(item["record"]):
            if alias in alias_owner:
                connected.join(i, alias_owner[alias])
            alias_owner[alias] = i
    components = defaultdict(list)
    for i, item in enumerate(unique):
        components[connected.find(i)].append(item)
    groups, group_aliases, excluded = {}, {}, []
    for items in components.values():
        aliases = sorted({alias for item in items for alias in _aliases(item["record"])})
        group = "v3-lineage:" + _sha(_bytes(aliases))
        group_aliases[group] = aliases
        final_reserved = group in reserved["groups"] or any(_reserved(member["record"], reserved) for item in items for member in item["members"])
        for item in items:
            r = item["record"]
            reason = "reserved_final_lineage" if final_reserved else "excluded_mimii" if "mimii" in r["dataset"].casefold() else "disallowed_audio_license" if _license(r["license"]) is None else None
            if reason:
                excluded.append({"clip_id": r["clip_id"], "reason": reason, "group": group, "history": item["history"]})
                continue
            rows = groups.setdefault(group, [])
            rows.append({**r, "local_path": item["path"], "history": item["history"], "historical_split": r["split"], "v3_group": group})
    if not groups:
        raise ValueError("No eligible nonreserved historical development records remain")
    assignment = _assign(groups)
    records = []
    for group, rows in groups.items():
        phase = assignment[group]
        for r in rows:
            role = ("unknown_" if r["label"] not in KNOWN else "") + phase
            records.append({**r, "split": role, "role": role, "v3_phase": phase, "historical_development_only": True})
    records.sort(key=lambda r: r["clip_id"])
    all_rows = [entry["record"] for entry in originals]
    exclusion_groups = {_group(r[key]) for r in all_rows for key in ("uploader", "uploader_group")}
    exclusion_groups.update(group_aliases)
    historical_exclusions = {
        "scope": "ALL historical records, including filtered sources and inspected tests",
        "groups": sorted(exclusion_groups), "clip_ids": sorted({r["clip_id"] for r in all_rows}),
        "lineage_aliases": sorted({alias for aliases in group_aliases.values() for alias in aliases}),
        "lineage_groups": {key: value for key, value in sorted(group_aliases.items())},
        "collection_groups": sorted({_group(r["collection_group"]) for r in all_rows if r.get("collection_group")}),
        **{name: sorted({r[field] for r in all_rows}) for name, field in (("original_sha256", "original_sha256"), ("prepared_sha256", "sha256"), ("pcm_sha256", "pcm_sha256"))},
        "all_hashes": sorted({r[field] for r in all_rows for field in HASH_FIELDS}),
    }
    counts = {phase: {label: sum(r["v3_phase"] == phase and (r["label"] if r["label"] in KNOWN else "__unknown__") == label for r in records) for label in STRATA} for phase in PHASES}
    group_counts = {phase: {label: len({r["v3_group"] for r in records if r["v3_phase"] == phase and (r["label"] if r["label"] in KNOWN else "__unknown__") == label}) for label in STRATA} for phase in PHASES}
    sparse = [f"train/{label}: fewer than three lineage groups" for label in STRATA if group_counts["train"][label] < 3]
    sparse.extend(f"calibration/{label}: no clips" for label in STRATA if not counts["calibration"][label])
    sparse.extend(f"audit/{label}: below20clips/3groups development support" for label in KNOWN if counts["audit"][label] < 20 or group_counts["audit"][label] < 3)
    if counts["audit"]["__unknown__"] < 100 or group_counts["audit"]["__unknown__"] < 10:
        sparse.append("audit/unknown: below100clips/10groups development support")
    original_bytes = _bytes({"sourceManifests": source_info, "records": originals})
    excluded_bytes = _bytes(historical_exclusions)
    assignments = {"roleByClipId": {r["clip_id"]: r["role"] for r in records}, "groupByClipId": {r["clip_id"]: r["v3_group"] for r in records}}
    manifest = {
        "schema_version": 3, "purpose": "historical-development-only", "seed": SEED,
        "promotionAllowed": False, "freshFinalRecordsIncluded": False, "audioFilesRead": False,
        "modelPredictionsRead": False, "sourceManifests": source_info, "finalReservations": reservation,
        "assemblerSourceSha256": _sha(Path(__file__).read_bytes()),
        "splitPolicy": {"phases": PHASES, "fractions": FRACTIONS, "method": "deterministic whole-lineage greedy squared clip/group imbalance; rare large strata first; seed-hash ties; no score-based reroll"},
        "pathPrefixMap": remap, "audioAvailabilityVerified": False,
        "records": records, "assignments": assignments,
        "groupLineageAliases": {group: group_aliases[group] for group in sorted(groups)},
        "summary": {"historicalEntries": len(originals), "uniqueHistoricalClips": len(unique), "duplicatesCollapsed": len(originals) - len(unique), "developmentClips": len(records), "excluded": excluded, "exclusionCounts": dict(Counter(row["reason"] for row in excluded)), "countsByPhase": counts, "groupsByPhase": group_counts, "allKnownClassesPresent": all(any(r["label"] == label for r in records) for label in KNOWN), "sparseDevelopmentStrata": sparse},
        "sidecars": {"historical-records.json": _sha(original_bytes), "historical-exclusions.json": _sha(excluded_bytes), "final-reservations.json": _sha(reservation_raw), **{name: _sha(raw) for name, raw in raw_sources.items()}},
        "limitations": ["Every old split is inspected historical development, never fresh final evidence.", "No class is dropped, no seed is rerolled, and no prediction selects these roles. Sparse strata may fail later readiness criteria.", "Groups reflect recorded uploader/session/collection lineage; hidden common recordings, aliases and encoder pretraining overlap remain possible.", "Existing source attribution/labels are retained, not independently reannotated as field truth.", "No audio files were opened or downloaded; canonical staging must verify local files, hashes and eligible PCM."],
    }
    destination.mkdir(parents=True, exist_ok=False)
    payloads = {"manifest-v3-development.json": _bytes(manifest), "historical-records.json": original_bytes, "historical-exclusions.json": excluded_bytes, "final-reservations.json": reservation_raw, **raw_sources}
    for name, raw in payloads.items():
        (destination / name).parent.mkdir(parents=True, exist_ok=True)
        with (destination / name).open("xb") as handle:
            handle.write(raw)
    index = {name: {"sha256": _sha(raw), "bytes": len(raw)} for name, raw in payloads.items()}
    (destination / "artifact-index.json").write_bytes(_bytes(index))
    return destination / "manifest-v3-development.json"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--reservations", required=True)
    parser.add_argument("--reservation-sha256", required=True)
    args = parser.parse_args()
    print(assemble_historical_v3(args.output, args.reservations, args.reservation_sha256))
