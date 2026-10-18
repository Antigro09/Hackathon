"""A separate, untouched bee-buzz stress test from IVBEE-1.0 (2026).

Primary source: Piotr Książek, Wrocław University of Science and Technology,
IVBEE-1.0, https://doi.org/10.5281/zenodo.20077113 (version1.0,2026-05-08).
CC BY4.0: https://creativecommons.org/licenses/by/4.0/ . The publisher labels
these honey-bee recordings as stable/variable buzz events. No AI labels are
used. Every >=5s, quality-passing file goes to TEST ONLY; the entire collection
is excluded from training and calibration, not divided into random snippets.

The pinned archive contains226WAVs:203are shorter than5s; all23eligible first
five-second crops passed the existing quality gates in preflight. They cover
six role/specimen groups within ONE shared laboratory/acoustic-chamber and
recording-hardware collection. Specimens are not independent uploaders/studies.
Stable and variable recordings of the same role/specimen retain one group.

All226actual WAVs are mono48kHz PCM16, although the primary description says
24bit; actual decoded format and this discrepancy are recorded. No padding,
stitching, resampling, gain adjustment, or source/fault-identity inference.
This is insect buzz evidence, not a test of electrical hum or field accuracy.
FSD run1's buzz training labels were overwhelmingly insect-related; this is a
new collection for that broad taxonomy, not a newly validated equipment label.
"""

from __future__ import annotations

from collections import Counter
import hashlib
import io
import json
import os
from pathlib import Path
import re
import struct
from urllib.request import Request, urlopen
import zipfile

import numpy as np
import soundfile as sf

from ml.data import _quality, _rank, _sha256


SOURCE_URL = "https://zenodo.org/records/20077113"
ARCHIVE_URL = SOURCE_URL + "/files/IVBEE-1.0.zip?download=1"
ARCHIVE_BYTES = 47744028
ARCHIVE_MD5 = "7d9abe056d2f38ce3017ae940456ff95"
ARCHIVE_SHA256 = "ff4bd1fe46190c203489f81a23c9bce12b80ed0ca5276051a3cb13993e3a6ec5"
LICENSE = "https://creativecommons.org/licenses/by/4.0/"
CREATOR = "Piotr Książek (Wrocław University of Science and Technology)"
CITATION = "Książek, P. (2026). IVBEE-1.0 (Version1.0). Zenodo. https://doi.org/10.5281/zenodo.20077113"
EXPECTED_WAVS = 226
MEMBER_PATTERN = re.compile(r"(stable|variable) buzz (drone|worker)/([1-9][0-9]*)/([A-Za-z0-9_.-]+\.wav)")
FORMAT_DISCREPANCY = "Publisher description says24bit; all226 archived WAV files actually decode as mono48000Hz PCM_16. Actual file format governs preprocessing."


def _archive_bytes(root: Path) -> bytes:
    path = root / "cache/IVBEE-1.0.zip"
    if path.exists():
        raw = path.read_bytes()
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        request = Request(ARCHIVE_URL, headers={"User-Agent": "TonalWatch-research/2.0", "Accept-Encoding": "identity"})
        chunks, count, reported = [], 0, 0
        with urlopen(request, timeout=90) as response:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > ARCHIVE_BYTES:
                    raise ValueError("IVBEE archive exceeds its pinned size")
                chunks.append(chunk)
                if count // (5 * 1024 * 1024) > reported:
                    reported = count // (5 * 1024 * 1024)
                    print(f"IVBEE download: {count}/{ARCHIVE_BYTES} bytes", flush=True)
        raw = b"".join(chunks)
    if len(raw) != ARCHIVE_BYTES or hashlib.md5(raw).hexdigest() != ARCHIVE_MD5 or _sha256(raw) != ARCHIVE_SHA256:
        raise ValueError("IVBEE archive size/MD5/SHA256 mismatch")
    if not path.exists():
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(raw)
        os.replace(temporary, path)
    return raw


def _prepare_wav(raw: bytes, record: dict, root: Path) -> tuple[dict | None, str | None]:
    with sf.SoundFile(io.BytesIO(raw)) as source:
        rate, channels, subtype = source.samplerate, source.channels, source.subtype
        duration = source.frames / rate
        if rate != 48000 or channels != 1 or subtype != "PCM_16":
            raise ValueError("Pinned IVBEE release has an unexpected source format")
        if source.frames < 240000:
            return None, "shorter_than_five_seconds"
        pcm = source.read(240000, dtype="float32", always_2d=True)[:, 0]
    quality, reason = _quality(pcm)
    if reason:
        return None, "source_" + reason
    pcm_bytes = pcm.astype("<f4").tobytes()
    fmt = struct.pack("<HHIIHH", 3, 1, rate, rate * 4, 4, 32)
    chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt
    chunks += b"fact" + struct.pack("<II", 4, len(pcm))
    chunks += b"data" + struct.pack("<I", len(pcm_bytes)) + pcm_bytes
    prepared_bytes = b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WAVE" + chunks
    path = root / "audio" / f"{record['clip_id']}.wav"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(prepared_bytes)
    return {**record, "local_path": str(path.resolve()), "sha256": _sha256(prepared_bytes),
            "original_sha256": _sha256(raw), "pcm_sha256": _sha256(pcm_bytes),
            "original_sample_rate": rate, "original_channels": channels, "original_subtype": subtype,
            "original_duration_seconds": duration, "sample_rate": rate, "samples": len(pcm),
            "crop_start_seconds": 0, "crop_duration_seconds": 5, "channel": 0,
            "resampler": "none (native48000Hz)", "gain_applied": False,
            "source_quality": quality, "quality": quality, **quality}, None


def prepare_buzz(output_dir: str | Path, previous_manifest: str | Path, seed: int = 18042) -> list[dict]:
    """Return all eligible IVBEE clips as a separately attributed test cohort.

    Writes manifest.json even on insufficient data; no old identifiers, groups,
    or original/prepared/PCM hashes may enter this held-out collection. Original
    split is the source release, never falsely described as official FSD eval.
    """
    root = Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    previous_path = Path(previous_manifest)
    previous = json.loads(previous_path.read_text(encoding="utf-8"))["records"]
    old_groups = {r["uploader_group"] for r in previous}
    old_ids = {r["clip_id"] for r in previous}
    hash_keys = ("sha256", "original_sha256", "pcm_sha256")
    old_hashes = {r[key] for r in previous for key in hash_keys}
    raw_archive = _archive_bytes(root)
    records, excluded, seen = [], [], set()
    format_counts = Counter()
    with zipfile.ZipFile(io.BytesIO(raw_archive)) as archive:
        members = [info for info in archive.infolist() if info.filename.lower().endswith(".wav")]
        if len(members) != EXPECTED_WAVS:
            raise ValueError("Unexpected IVBEE source WAV count")
        for info in sorted(members, key=lambda value: _rank(seed, value.filename)):
            match = MEMBER_PATTERN.fullmatch(info.filename)
            if not match or info.file_size > 10 * 1024 * 1024:
                raise ValueError("Unexpected IVBEE member name or size")
            category, role, specimen, filename = match.groups()
            # ZipFile.read validates member CRC; no archive paths are extracted.
            raw = archive.read(info)
            with sf.SoundFile(io.BytesIO(raw)) as source:
                format_counts[f"{source.samplerate}/{source.channels}/{source.subtype}"] += 1
            clip_id = f"ivbee_{role}_id{specimen}_{category}_{filename[:-4]}"
            group = f"ivbee:{role}:id_{specimen}"
            record = {"clip_id": clip_id, "dataset": "IVBEE", "dataset_release": "1.0 (2026-05-08)",
                      "split": "test", "label": "buzz", "original_split": "IVBEE-1.0",
                      "original_split_is_official": False,
                      "split_policy": "entire IVBEE collection held out; no training or calibration recordings",
                      "uploader": CREATOR, "uploader_group": group,
                      "grouping_unit": "bee role/specimen ID within one shared laboratory collection; not uploader/study",
                      "collection_group": "IVBEE:single-laboratory-collection", "specimen_id": specimen,
                      "bee_role": role, "buzz_category": category, "original_labels": [category + " buzz", role],
                      "source_url": SOURCE_URL, "archive_url": ARCHIVE_URL, "archive_member": info.filename,
                      "archive_sha256": ARCHIVE_SHA256, "published_archive_md5": ARCHIVE_MD5,
                      "full_archive_md5_verified": True, "archive_member_crc32": f"{info.CRC:08x}",
                      "archive_member_crc_verified": True, "archive_member_size": info.file_size,
                      "license": LICENSE, "attribution": CREATOR, "citation": CITATION,
                      "source_format_discrepancy": FORMAT_DISCREPANCY,
                      "derivation": "First five seconds, channel0, native48kHz; no padding, stitching, gain adjustment or resampling."}
            prepared, reason = _prepare_wav(raw, record, root)
            if reason:
                excluded.append({"archive_member": info.filename, "reason": reason, "original_sha256": _sha256(raw)})
                continue
            fingerprints = {prepared[key] for key in hash_keys}
            if clip_id in old_ids or group in old_groups or fingerprints & old_hashes:
                raise ValueError("IVBEE held-out source overlaps the inspected first run")
            if fingerprints & seen:
                raise ValueError("Duplicate IVBEE source/PCM within the proposed cohort")
            seen.update(fingerprints)
            records.append(prepared)
    records.sort(key=lambda r: (r["uploader_group"], r["clip_id"]))
    groups = Counter(r["uploader_group"] for r in records)
    failures = [] if len(records) >= 3 and len(groups) >= 3 else ["Need at least3quality-passing clips and3specimen groups"]
    manifest = {"dataset": "IVBEE", "source_url": SOURCE_URL, "license": LICENSE, "citation": CITATION,
                "archive": {"url": ARCHIVE_URL, "bytes": ARCHIVE_BYTES, "published_md5": ARCHIVE_MD5,
                            "sha256": ARCHIVE_SHA256, "full_archive_checksums_verified": True},
                "previous_manifest_sha256": _sha256(previous_path.read_bytes()), "seed": seed,
                "selection": "all>=5s first-channel first-five-second crops passing unchanged finite/RMS/clipping gates; no predictions",
                "split_policy": "entire new collection test-only", "source_wav_count": len(members),
                "actual_source_formats": dict(format_counts), "format_discrepancy": FORMAT_DISCREPANCY,
                "counts": {"test_buzz": len(records), "specimen_groups": dict(groups), "shared_laboratory_collections": 1,
                           "excluded": dict(Counter(r["reason"] for r in excluded))},
                "validation_passed": not failures, "validation_failures": failures,
                "limitations": ["Six eligible specimen groups share ONE laboratory/hardware collection, not six independent studies/uploaders.",
                                "The collection is entirely held out, so it is a new-domain insect-buzz stress test rather than source-balanced field evidence.",
                                "Bee buzz does not validate electrical hum, particular equipment identity, location or calibrated confidence.",
                                "No scores were used to select recordings; changes after inspecting this test need another untouched holdout."],
                "excluded_records": excluded, "records": records}
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"IVBEE: {len(records)}/{len(members)} held-out buzz clips, {len(groups)} specimen groups, ONE lab collection; exclusions={manifest['counts']['excluded']}", flush=True)
    if failures:
        raise ValueError("Insufficient IVBEE data; see its manifest")
    return records
