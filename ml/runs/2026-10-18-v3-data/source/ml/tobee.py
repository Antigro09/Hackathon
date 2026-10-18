"""A whole-collection-reserved, annotated bee-only final audit augmentation.

Nolasco & Benetos (2018), To bee or not to bee,
https://doi.org/10.5281/zenodo.1321278, CC BY 4.0.
The actual release contains56 WAV/MP3 files; annotations cover78 recording
names. Only available recordings whose HUMAN annotation labels the entire
first0-5s `bee` are eligible. `nobee` is external noise superimposed on bees,
so it is never treated as a clean unknown class. No later segment substitution.

OSBH citizen-science and NU-Hive sources contain repeated hive/device sessions;
source hive IDs remain grouped and the entire collection stays final-only.
Hive groups do not make repeated recordings statistically independent studies.
This supports insect buzz, not electrical hum, equipment or source identity.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from math import gcd
from pathlib import Path
import re
import struct
from urllib.request import Request, urlopen

import numpy as np
from scipy.signal import resample_poly
import soundfile as sf

from ml.data import _quality, _rank, _sha256
from ml.bsd import _freeze, _json_bytes, HASH_FIELDS


SOURCE_URL = "https://zenodo.org/records/1321278"
LICENSE = "https://creativecommons.org/licenses/by/4.0/"
CREATORS = "Inês Nolasco; Emmanouil Benetos (Queen Mary University of London)"
CITATION = "Nolasco, I. & Benetos, E. (2018). To bee or not to bee: An annotated dataset for beehive sound recognition. Zenodo. DOI:10.5281/zenodo.1321278"
CATALOG_SHA256 = "806330750db9d4c488ccea2cadfbeb604856e24189c1f7b6225891d7049094ba"
ANNOTATION_SHA256 = "a16eb64b631f824fb64acf549ae432450a55d5f02be4e25a59c57c13b9bac6f2"
ANNOTATION_MD5 = "de08c3a889049e240c06a7f048f20b09"
ANNOTATION_BYTES = 50311
SELECTION_VERSION = "tobee-annotated-first-five-v1"


def _bounded_download(url: str, maximum: int) -> bytes:
    request = Request(url, headers={"User-Agent": "TonalWatch-research/3.0", "Accept-Encoding": "identity"})
    with urlopen(request, timeout=120) as response:
        raw = response.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError("ToBee source exceeded bounded download size")
    return raw


def load_source(root: Path) -> tuple[list[dict], bytes]:
    source_path = root / "cache/source-record.json"
    source = json.loads(source_path.read_text(encoding="utf-8")) if source_path.exists() else json.loads(_bounded_download("https://zenodo.org/api/records/1321278", 1024 * 1024))
    if source["metadata"]["license"]["id"] != "cc-by-4.0":
        raise ValueError("ToBee license changed")
    catalog = [{"name": row["key"], "bytes": row["size"], "md5": row["checksum"].split(":", 1)[1], "url": row["links"]["self"]}
               for row in source["files"] if row["key"].lower().endswith((".wav", ".mp3"))]
    catalog.sort(key=lambda row: row["name"])
    if len(catalog) != 56 or _sha256(_json_bytes(catalog)) != CATALOG_SHA256:
        raise ValueError("ToBee immutable audio catalog differs")
    annotations_path = root / "cache/beeAnnotations.mlf"
    annotations = annotations_path.read_bytes() if annotations_path.exists() else _bounded_download(SOURCE_URL + "/files/beeAnnotations.mlf?download=1", ANNOTATION_BYTES)
    if (len(annotations) != ANNOTATION_BYTES or _sha256(annotations) != ANNOTATION_SHA256
            or hashlib.md5(annotations).hexdigest() != ANNOTATION_MD5):
        raise ValueError("ToBee human annotation checksum differs")
    source_path.parent.mkdir(parents=True, exist_ok=True)
    if not source_path.exists(): source_path.write_bytes(_json_bytes(source))
    if not annotations_path.exists(): annotations_path.write_bytes(annotations)
    return catalog, annotations


def parse_annotations(raw: bytes, *, invalid_records: list | None = None) -> dict[str, list[tuple[float, float, str]]]:
    result, name, intervals, invalid = {}, None, [], False
    for line_number, line in enumerate(raw.decode("utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        if line == ".":
            if name is None or name in result:
                raise ValueError("Duplicate or nameless ToBee annotation block")
            result[name] = [] if invalid else intervals
            name, intervals, invalid = None, [], False
        elif name is None:
            name = line
        else:
            fields = line.split()
            if len(fields) != 3:
                raise ValueError("Malformed ToBee annotation interval")
            start, end, label = float(fields[0]), float(fields[1]), fields[2]
            if label not in {"bee", "nobee"}:
                raise ValueError("Invalid ToBee annotation label")
            if not np.isfinite([start, end]).all() or not 0 <= start <= end:
                if invalid_records is not None:
                    invalid_records.append({"recording": name, "line_number": line_number, "raw_interval": line, "reason": "invalid interval bounds; entire recording excluded without repair"})
                    invalid = True
                    continue
                raise ValueError("Invalid ToBee annotation bounds/label")
            intervals.append((start, end, label))
    if name is not None:
        raise ValueError("Unterminated ToBee annotation block")
    return result


def build_selection(catalog: list[dict], annotations: bytes, previous: list[dict], *, seed=18043, per_hive=8) -> dict:
    if type(per_hive) is not int or per_hive < 1:
        raise ValueError("ToBee per-hive cap must be a positive integer")
    annotation_issues = []
    intervals = parse_annotations(annotations, invalid_records=annotation_issues)
    prior_groups = {r["uploader_group"].casefold() for r in previous}
    prior_ids = {str(r["clip_id"]) for r in previous}
    if any(group.startswith("tobee:") for group in prior_groups):
        raise ValueError("ToBee source collection/hive already exposed")
    pools, excluded = defaultdict(list), Counter()
    # Reserving whole collection is stronger than reserving selected hives only.
    for item in catalog:
        match = re.match(r"(Hive[13]|[A-Z]{2}[0-9]{3})(?=[ _-])", item["name"])
        if not match:
            raise ValueError("ToBee source lacks expected hive lineage")
        hive = match.group(1)
        group = "tobee:" + hive.casefold()
        stem = item["name"].rsplit(".", 1)[0]
        identity = "tobee_" + _sha256(item["name"].encode())[:24]
        if group in prior_groups or identity in prior_ids:
            raise ValueError("ToBee source collection/hive already exposed")
        labels = intervals.get(stem, [])
        if not labels or labels[0][0] != 0 or labels[0][1] < 5 or labels[0][2] != "bee":
            excluded["first_five_seconds_not_entirely_human_annotated_bee"] += 1
            continue
        pools[group].append({"clip_id": identity, "dataset": "ToBee", "split": "test", "label": "buzz",
                              "uploader": CREATORS, "uploader_group": group, "hive_id": hive,
                              "grouping_unit": "original hive ID across all sessions/codecs; collection entirely final-only",
                              "collection_group": "ToBee:NU-Hive" if hive.startswith("Hive") else "ToBee:OSBH-citizen-science",
                              "original_split": "ToBee release (our whole-collection final holdout)", "original_split_is_official": False,
                              "source_url": SOURCE_URL, "original_url": item["url"], "source_filename": item["name"],
                              "license": LICENSE, "attribution": CREATORS, "citation": CITATION,
                              "original_labels": ["bee"], "label_quality": "human interval annotation: bee for entire first0–5s; not a physical-source or electrical-hum claim",
                              "annotation_interval_seconds": list(labels[0][:2]), "annotation_sha256": ANNOTATION_SHA256,
                              "published_original_md5": item["md5"], "published_original_bytes": item["bytes"]})
    selected = [record for group in sorted(pools, key=lambda g: _rank(seed, g))
                for record in sorted(pools[group], key=lambda r: _rank(seed, r["source_filename"]))[:per_hive]]
    return {"selection_version": SELECTION_VERSION, "seed": seed, "per_hive": per_hive,
            "catalog_sha256": CATALOG_SHA256, "annotation_sha256": ANNOTATION_SHA256,
            "previous_records_sha256": _sha256(_json_bytes(previous)),
            "reserved_collections": ["ToBee:NU-Hive", "ToBee:OSBH-citizen-science"],
            "reserved_uploaders": sorted({"tobee:" + re.match(r"(Hive[13]|[A-Z]{2}[0-9]{3})(?=[ _-])", item["name"]).group(1).casefold() for item in catalog}),
            "policy": f"Entire ToBee collection final-only. Hash-seeded cap{per_hive} per hive, only first0–5s human bee annotation, no later crops/padding/replacement or predictions.",
            "audio_available": len(catalog), "annotated_recording_names": len(intervals),
            "annotation_issues": annotation_issues,
            "eligible_by_hive": {group: len(rows) for group, rows in pools.items()}, "excluded_metadata": dict(excluded), "records": selected}


def prepare_wav(raw: bytes, record: dict, root: Path) -> tuple[dict | None, str | None]:
    md5_verified = "published_original_bytes" in record and "published_original_md5" in record
    if md5_verified and (len(raw) != record["published_original_bytes"]
                         or hashlib.md5(raw).hexdigest() != record["published_original_md5"]):
        raise ValueError("ToBee original source size/MD5 mismatch")
    with sf.SoundFile(io.BytesIO(raw)) as source:
        rate, channels, subtype, frames = source.samplerate, source.channels, source.subtype, source.frames
        if not 8000 <= rate <= 192000 or channels not in {1, 2}:
            raise ValueError("Unsupported ToBee source rate/channel count")
        if frames < rate * 5:
            return None, "shorter_than_five_seconds"
        original = source.read(rate * 5, dtype="float32", always_2d=True)[:, 0]
    source_quality, reason = _quality(original)
    if reason:
        return None, "source_" + reason
    divisor = gcd(rate, 48000)
    pcm = resample_poly(original, 48000 // divisor, rate // divisor).astype(np.float32) if rate != 48000 else original
    quality, reason = _quality(pcm)
    if reason:
        return None, "prepared_" + reason
    if pcm.shape != (240000,):
        raise ValueError("Incorrect ToBee five-second resample count")
    pcm_bytes = pcm.astype("<f4").tobytes()
    fmt = struct.pack("<HHIIHH", 3, 1, 48000, 192000, 4, 32)
    chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"fact" + struct.pack("<II", 4, len(pcm)) + b"data" + struct.pack("<I", len(pcm_bytes)) + pcm_bytes
    prepared = b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WAVE" + chunks
    path = root / "audio" / (record["clip_id"] + ".wav"); path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() != prepared:
        raise ValueError("Existing ToBee PCM differs from deterministic crop")
    if not path.exists(): path.write_bytes(prepared)
    return {**record, "local_path": str(path.resolve()), "sha256": _sha256(prepared), "original_sha256": _sha256(raw), "pcm_sha256": _sha256(pcm_bytes), "full_original_md5_verified": md5_verified,
            "original_sample_rate": rate, "original_channels": channels, "original_subtype": subtype, "original_duration_seconds": frames / rate,
            "sample_rate": 48000, "samples": 240000, "crop_start_seconds": 0, "crop_duration_seconds": 5, "channel": 0,
            "gain_applied": False, "resampler": f"scipy.signal.resample_poly({48000 // divisor},{rate // divisor}), default Kaiser; no normalization" if rate != 48000 else "none",
            "source_quality": source_quality, "quality": quality, **quality}, None


def prepare_tobee(output_dir: str | Path, previous_records: list[dict], *, seed=18043, per_hive=8, workers=4) -> dict:
    root = Path(output_dir).resolve(); root.mkdir(parents=True, exist_ok=True)
    catalog, annotations = load_source(root)
    plan = build_selection(catalog, annotations, previous_records, seed=seed, per_hive=per_hive)
    _freeze(root / "selection-plan.json", plan)
    old_hashes = {r[key] for r in previous_records for key in HASH_FIELDS}

    def one(record):
        # Local names use our safe digest, never untrusted remote file paths.
        path = root / "original" / (record["clip_id"] + Path(record["source_filename"]).suffix.lower())
        raw = path.read_bytes() if path.exists() else _bounded_download(record["original_url"], record["published_original_bytes"])
        if len(raw) != record["published_original_bytes"] or hashlib.md5(raw).hexdigest() != record["published_original_md5"]:
            raise ValueError("ToBee original source size/MD5 mismatch")
        if not path.exists(): path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(raw)
        result, reason = prepare_wav(raw, record, root)
        if result and {result[key] for key in HASH_FIELDS} & old_hashes:
            return None, {"clip_id": record["clip_id"], "reason": "previous_audio_hash_overlap", "original_sha256": _sha256(raw)}
        return result, None if reason is None else {"clip_id": record["clip_id"], "reason": reason, "original_sha256": _sha256(raw)}

    with ThreadPoolExecutor(max_workers=max(1, min(workers, 6))) as pool:
        results = list(pool.map(one, plan["records"]))
    records, exclusions, seen = [], [], set()
    for record, reason in results:
        if reason:
            exclusions.append(reason)
        elif record:
            fingerprints = {record[key] for key in HASH_FIELDS}
            if fingerprints & seen:
                exclusions.append({"clip_id": record["clip_id"], "reason": "duplicate_source_or_prepared_pcm", "original_sha256": record["original_sha256"]})
            else:
                seen.update(fingerprints); records.append(record)
    manifest = {"source_url": SOURCE_URL, "license": LICENSE, "citation": CITATION, "seed": seed,
                "selection_plan_sha256": _sha256((root / "selection-plan.json").read_bytes()), "selection_version": SELECTION_VERSION,
                "catalog_sha256": CATALOG_SHA256, "annotation_sha256": ANNOTATION_SHA256,
                "reserved_collections": plan["reserved_collections"], "reserved_uploaders": plan["reserved_uploaders"],
                "count": len(records), "groups": dict(Counter(r["uploader_group"] for r in records)),
                "actual_source_formats": dict(Counter(f"{r['original_sample_rate']}/{r['original_channels']}/{r['original_subtype']}" for r in records)),
                "exclusion_counts": dict(Counter(r["reason"] for r in exclusions)), "excluded_records": exclusions,
                "limitations": ["Repeated hive/session/device recordings are correlated and are not separate independent studies.", "The release description says78 recordings but only56 audio files are available; no missing source was invented.", "Human bee annotations do not identify electrical hum or equipment; nobee intervals are not clean unknown negatives.", "All collection groups remain final-only, including unselected and quality-failed sources."], "records": records}
    _freeze(root / "manifest.json", manifest)
    print("ToBee final quality preflight: " + json.dumps({key: manifest[key] for key in ("count", "groups", "exclusion_counts", "actual_source_formats")}), flush=True)
    return manifest
