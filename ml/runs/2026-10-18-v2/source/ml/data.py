"""Build a small, attributed FSD50K training/evaluation set without full archives.

Only public CC0 / CC BY clips are eligible. Audio remains under its own license.
Requires numpy, scipy and soundfile; downloads never need an account or token.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import random
import re
import struct
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import zipfile

import numpy as np
import scipy
from scipy.signal import resample_poly
import soundfile as sf


MIRROR_REPO = "Fhrozen/FSD50k"
MIRROR_REVISION = "ccf1acaff12f3f4a4c10052dddafbb6d22152c9b"
ORIGINAL_RECORD = "https://zenodo.org/records/4060432"
ARCHIVES = {
    "FSD50K.ground_truth.zip": {
        "sha256": "db2396260a7b1fb06feb6ccac71685794fc89917d71c3a8d64a1de85c2cc0ebf",
        "md5": "ca27382c195e37d2269c4c866dd73485",
    },
    "FSD50K.metadata.zip": {
        "sha256": "9a738e032546f9a2c6e3d04566928d04a65fb79b422cc9d78bb781723537bd19",
        "md5": "b9ea0c829a411c1d42adb9da539ed237",
    },
}
LABELS = {
    "Buzz": "buzz",
    "Mechanical_fan": "mechanical_fan",
    "Traffic_noise_and_roadway_noise": "traffic",
    "Wind": "wind",
    "Speech": "speech",
}
OOD_CATEGORIES = {
    "ood_val": ("Rain", "Water", "Walk_and_footsteps", "Dog"),
    "ood_test": ("Music", "Bird", "Bell", "Door"),
}
SPLITS = ("train", "val", "test", "ood_val", "ood_test")
SAMPLE_RATE = 48_000
SECONDS = 5
MIN_RMS = 1e-5
MAX_PEAK = 0.999


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _rank(seed: int, value: str) -> str:
    return _sha256(f"{seed}:{value}".encode())


def _read_url(url: str, attempts: int = 3) -> bytes:
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"User-Agent": "TonalWatch-research/1.0"})
            with urlopen(request, timeout=45) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("Unreachable download retry state")


def permitted_license(url: str) -> bool:
    """Allow CC0 and unmodified CC BY only, excluding NC/SA/Sampling+."""
    parsed = urlparse(url)
    return parsed.hostname in {"creativecommons.org", "www.creativecommons.org"} and bool(
        re.fullmatch(r"/(?:publicdomain/zero/1\.0|licenses/by/(?:1\.0|2\.0|2\.5|3\.0|4\.0))/?", parsed.path)
    )


def load_source_metadata(output_dir: str | Path) -> tuple[dict[str, list[dict]], dict]:
    """Download and hash-check the original small metadata archives only."""
    cache = Path(output_dir).resolve() / "cache" / "metadata"
    cache.mkdir(parents=True, exist_ok=True)
    opened = {}
    provenance = {}
    for filename, expected in ARCHIVES.items():
        path = cache / filename
        raw = path.read_bytes() if path.exists() else _read_url(f"{ORIGINAL_RECORD}/files/{filename}")
        if _sha256(raw) != expected["sha256"]:
            raise ValueError(f"Metadata checksum mismatch: {filename}")
        if not path.exists():
            path.write_bytes(raw)
        opened[filename] = zipfile.ZipFile(io.BytesIO(raw))
        provenance[filename] = {**expected, "bytes": len(raw), "url": f"{ORIGINAL_RECORD}/files/{filename}"}
    ground_truth = opened["FSD50K.ground_truth.zip"]
    metadata = opened["FSD50K.metadata.zip"]
    result = {}
    for split in ("dev", "eval"):
        rows = csv.DictReader(io.StringIO(ground_truth.read(f"FSD50K.ground_truth/{split}.csv").decode()))
        infos = json.loads(metadata.read(f"FSD50K.metadata/{split}_clips_info_FSD50K.json"))
        result[split] = []
        for row in rows:
            clip_id = row["fname"]
            info = infos[clip_id]
            uploader = str(info.get("uploader", "")).strip()
            result[split].append({
                "clip_id": clip_id,
                "original_split": split,
                "official_dev_split": row.get("split"),
                "original_labels": sorted(row["labels"].split(",")),
                "uploader": uploader,
                "uploader_group": uploader.casefold(),
                "title": info.get("title", ""),
                "license": info.get("license", ""),
                "source_url": f"https://freesound.org/s/{clip_id}/",
                "mirror_url": f"https://huggingface.co/datasets/{MIRROR_REPO}/resolve/{MIRROR_REVISION}/clips/{split}/{clip_id}.wav",
            })
    # This is an original dataset guarantee, and a requirement of this experiment.
    dev_uploaders = {r["uploader_group"] for r in result["dev"] if r["uploader_group"]}
    eval_uploaders = {r["uploader_group"] for r in result["eval"] if r["uploader_group"]}
    if dev_uploaders & eval_uploaders:
        raise ValueError("Official development/evaluation uploader overlap; refusing to leak groups")
    return result, provenance


def _quality(samples: np.ndarray) -> tuple[dict, str | None]:
    finite = bool(np.isfinite(samples).all())
    if not finite or not samples.size:
        return {"finite": finite, "peak": None, "rms": None, "clipping_count": None}, "nonfinite_or_empty"
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(samples.astype(np.float64) ** 2)))
    clipping_count = int(np.count_nonzero(np.abs(samples) >= MAX_PEAK))
    reason = "quiet" if rms < MIN_RMS else "clipped" if peak >= MAX_PEAK else None
    return {"finite": finite, "peak": peak, "rms": rms, "clipping_count": clipping_count}, reason


def _prepare_clip(record: dict, root: Path) -> tuple[dict | None, str | None]:
    """Crop exactly the first channel's first five seconds, never normalize gain."""
    original_path = root / "cache" / "original" / record["original_split"] / f"{record['clip_id']}.wav"
    try:
        if original_path.exists():
            raw = original_path.read_bytes()
        else:
            raw = _read_url(record["mirror_url"])
            original_path.parent.mkdir(parents=True, exist_ok=True)
            original_path.write_bytes(raw)
        with sf.SoundFile(io.BytesIO(raw)) as source:
            sample_rate = source.samplerate
            duration = source.frames / sample_rate
            channels = source.channels
            if sample_rate != 44_100 or channels != 1 or source.subtype != "PCM_16":
                return None, "unexpected_original_format"
            if source.frames < sample_rate * SECONDS:
                return None, "shorter_than_five_seconds"
            pcm = source.read(sample_rate * SECONDS, dtype="float32", always_2d=True)[:, 0]
        source_quality, reason = _quality(pcm)
        if reason:
            return None, f"source_{reason}"
        # Polyphase sample-rate conversion, with no gain adjustment or loudness normalization.
        divisor = math.gcd(sample_rate, SAMPLE_RATE)
        prepared = resample_poly(pcm, SAMPLE_RATE // divisor, sample_rate // divisor).astype(np.float32)
        if prepared.shape != (SAMPLE_RATE * SECONDS,):
            return None, "unexpected_resampled_duration"
        prepared_quality, reason = _quality(prepared)
        if reason:
            return None, f"prepared_{reason}"
        audio_path = root / "audio" / f"{record['clip_id']}.wav"
        audio_path.parent.mkdir(parents=True, exist_ok=True)
        # A minimal IEEE-float WAV avoids libsndfile's optional timestamp-bearing
        # PEAK chunk, keeping prepared-file hashes deterministic across reruns.
        pcm_bytes = prepared.astype("<f4").tobytes()
        fmt = struct.pack("<HHIIHH", 3, 1, SAMPLE_RATE, SAMPLE_RATE * 4, 4, 32)
        chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt
        chunks += b"fact" + struct.pack("<II", 4, len(prepared))
        chunks += b"data" + struct.pack("<I", len(pcm_bytes)) + pcm_bytes
        audio_path.write_bytes(b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WAVE" + chunks)
        result = dict(record)
        result.update({
            "local_path": str(audio_path.resolve()),
            "sha256": _sha256(audio_path.read_bytes()),
            "original_sha256": _sha256(raw),
            "pcm_sha256": _sha256(pcm_bytes),
            "original_sample_rate": sample_rate,
            "original_channels": channels,
            "original_duration_seconds": duration,
            "sample_rate": SAMPLE_RATE,
            "samples": len(prepared),
            "crop_start_seconds": 0,
            "crop_duration_seconds": SECONDS,
            "channel": 0,
            "resampler": "scipy.signal.resample_poly",
            "gain_applied": False,
            "source_quality": source_quality,
            "quality": prepared_quality,
            **prepared_quality,
        })
        return result, None
    except (HTTPError, URLError, TimeoutError) as error:
        return None, f"download_error_{type(error).__name__}"
    except (RuntimeError, ValueError, OSError) as error:
        return None, f"decode_error_{type(error).__name__}"


def _diverse_order(records: list[dict], seed: int) -> list[dict]:
    """Round-robin uploaders before taking another file from a prolific uploader."""
    groups = defaultdict(list)
    for record in records:
        groups[record["uploader_group"]].append(record)
    for values in groups.values():
        values.sort(key=lambda record: _rank(seed, record["clip_id"]))
    ordered_groups = sorted(groups, key=lambda key: _rank(seed, key))
    result = []
    for index in range(max((len(values) for values in groups.values()), default=0)):
        for key in ordered_groups:
            if index < len(groups[key]):
                result.append(groups[key][index])
    return result


def _download_pool(records: list[dict], root: Path, exclusions: Counter, workers: int) -> list[dict]:
    prepared = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_prepare_clip, record, root): record for record in records}
        for index, future in enumerate(as_completed(futures), start=1):
            result, reason = future.result()
            if result:
                prepared.append(result)
            else:
                exclusions[reason] += 1
            if index % 25 == 0 or index == len(futures):
                print(f"Audio prepared: {index}/{len(futures)}, accepted {len(prepared)}", flush=True)
    return sorted(prepared, key=lambda record: (record["label"], record["clip_id"]))


def _dev_groups(records: list[dict], seed: int, min_train: int, min_val: int) -> set[str]:
    """Choose a development validation partition by uploader, never by clip."""
    uploaders = sorted({record["uploader_group"] for record in records})
    totals = Counter(record["label"] for record in records)
    rng = random.Random(seed)
    best = None
    for _ in range(2_000):
        validation = {uploader for uploader in uploaders if rng.random() < 0.2}
        counts = Counter(record["label"] for record in records if record["uploader_group"] in validation)
        feasible = all(counts[label] >= min_val and totals[label] - counts[label] >= min_train for label in LABELS.values())
        penalty = sum(abs(counts[label] / max(totals[label], 1) - 0.2) for label in LABELS.values())
        score = (not feasible, penalty, tuple(sorted(validation)))
        if best is None or score < best[0]:
            best = score, validation
    # If minima are impossible, still return the closest whole-uploader split.
    # prepare_dataset writes its failure counts/manifest before raising.
    if best is None:
        return set()
    return best[1]


def assert_disjoint(records: list[dict]) -> None:
    """Fail on leakage between any two splits, including the unknown split pairs."""
    for field in ("clip_id", "uploader_group", "sha256", "original_sha256", "pcm_sha256"):
        owners = {}
        for record in records:
            value = record[field]
            if not value:
                raise ValueError(f"Missing required grouping field: {field}")
            owner = owners.setdefault(value, record["split"])
            if owner != record["split"]:
                raise ValueError(f"Cross-split {field} leakage: {owner} / {record['split']}")
    if any(record["original_split"] != "eval" for record in records if record["split"] in {"test", "ood_test"}):
        raise ValueError("Test records must originate in the official evaluation set")


def prepare_dataset(
    output_dir: str | Path,
    seed: int = 804,
    max_train_per_class: int = 80,
    max_val_per_class: int = 20,
    max_test_per_class: int = 40,
    max_ood_per_split: int = 80,
    min_train_per_class: int = 12,
    min_val_per_class: int = 4,
    min_test_per_class: int = 8,
    min_ood_per_split: int = 20,
    workers: int = 6,
) -> Path:
    """Return manifest.json, or fail transparently if eligible data are too scarce.

    Metadata-selection caps bound bandwidth. Only first-five-second quality-passing
    clips count. Existing downloads are reused, but all outputs are revalidated.
    """
    if any(value < 1 for value in (max_train_per_class, max_val_per_class, max_test_per_class, max_ood_per_split, workers)):
        raise ValueError("Caps and workers must be positive")
    root = Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    source, provenance = load_source_metadata(root)
    exclusions = Counter()
    pools = {"dev": [], "eval": []}
    for original_split, records in source.items():
        eligible = defaultdict(list)
        for record in records:
            hits = set(record["original_labels"]) & set(LABELS)
            if not hits:
                continue
            if not record["uploader_group"]:
                exclusions["missing_uploader"] += 1
            elif not permitted_license(record["license"]):
                exclusions["target_license_not_permitted"] += 1
            elif len(hits) != 1:
                exclusions["multiple_target_labels"] += 1
            else:
                record = {**record, "label": LABELS[next(iter(hits))]}
                eligible[record["label"]].append(record)
        # Surplus candidates allow for short clips and quality failures; never use
        # an unbounded search to cherry-pick the held-out evaluation results.
        cap = 2 * (max_train_per_class + max_val_per_class) if original_split == "dev" else 2 * max_test_per_class
        for label in LABELS.values():
            values = _diverse_order(eligible[label], seed)
            pools[original_split].extend(values[:cap])
            exclusions[f"{original_split}_beyond_candidate_cap"] += max(len(values) - cap, 0)
    known = _download_pool(pools["dev"] + pools["eval"], root, exclusions, workers)
    # Prevent even duplicate audio within a source pool from entering two groups.
    unique = []
    seen_hashes = set()
    for record in known:
        hashes = {record["sha256"], record["original_sha256"], record["pcm_sha256"]}
        if hashes & seen_hashes:
            exclusions["duplicate_audio"] += 1
            continue
        seen_hashes.update(hashes)
        unique.append(record)
    dev = [record for record in unique if record["original_split"] == "dev"]
    validation_uploaders = _dev_groups(dev, seed, min_train_per_class, min_val_per_class)
    selected = []
    for record in unique:
        record["split"] = "test" if record["original_split"] == "eval" else "val" if record["uploader_group"] in validation_uploaders else "train"
    caps = {"train": max_train_per_class, "val": max_val_per_class, "test": max_test_per_class}
    for split in caps:
        for label in LABELS.values():
            eligible = [record for record in unique if record["split"] == split and record["label"] == label]
            selected.extend(_diverse_order(eligible, seed)[:caps[split]])
    reserved_uploaders = {record["uploader_group"] for record in selected}
    reserved_ids = {record["clip_id"] for record in selected}
    for split, original_split in (("ood_val", "dev"), ("ood_test", "eval")):
        own = set(OOD_CATEGORIES[split])
        other = set(OOD_CATEGORIES["ood_test" if split == "ood_val" else "ood_val"])
        eligible = []
        for record in source[original_split]:
            labels = set(record["original_labels"])
            if (
                labels & own and not labels & (set(LABELS) | other)
                and record["uploader_group"] and record["uploader_group"] not in reserved_uploaders
                and record["clip_id"] not in reserved_ids and permitted_license(record["license"])
            ):
                eligible.append({**record, "label": "unknown", "split": split, "ood_categories": sorted(labels & own)})
        candidate_pool = _diverse_order(eligible, seed)[: 3 * max_ood_per_split]
        prepared = _download_pool(candidate_pool, root, exclusions, workers)
        for record in _diverse_order(prepared, seed):
            hashes = {record["sha256"], record["original_sha256"], record["pcm_sha256"]}
            if hashes & seen_hashes:
                exclusions["duplicate_audio"] += 1
                continue
            selected.append(record)
            seen_hashes.update(hashes)
            if sum(item["split"] == split for item in selected) >= max_ood_per_split:
                break
        reserved_uploaders.update(record["uploader_group"] for record in selected)
        reserved_ids.update(record["clip_id"] for record in selected)
    assert_disjoint(selected)
    counts = {split: dict(Counter(record["label"] for record in selected if record["split"] == split)) for split in SPLITS}
    summary = {
        "counts": counts,
        "uploaders": {split: len({record["uploader_group"] for record in selected if record["split"] == split}) for split in SPLITS},
        "exclusions": dict(sorted(exclusions.items())),
        "ood_categories": OOD_CATEGORIES,
        "group_disjoint_fields": ["clip_id", "uploader_group", "sha256", "original_sha256", "pcm_sha256"],
    }
    failures = []
    minima = {"train": min_train_per_class, "val": min_val_per_class, "test": min_test_per_class}
    for split, minimum in minima.items():
        for label in LABELS.values():
            if counts[split].get(label, 0) < minimum:
                failures.append(f"{split}/{label}: {counts[split].get(label, 0)} < {minimum}")
    for split in OOD_CATEGORIES:
        if counts[split].get("unknown", 0) < min_ood_per_split:
            failures.append(f"{split}: {counts[split].get('unknown', 0)} < {min_ood_per_split}")
    manifest = {
        "schema_version": 1,
        "seed": seed,
        "labels": list(LABELS.values()),
        "source": {"original_record": ORIGINAL_RECORD, "metadata_archives": provenance, "mirror_repo": MIRROR_REPO, "mirror_revision": MIRROR_REVISION},
        "preprocessing": {"sample_rate": SAMPLE_RATE, "seconds": SECONDS, "channel": 0, "offset_seconds": 0, "rms_minimum": MIN_RMS, "peak_exclusive_maximum": MAX_PEAK, "gain_normalization": False, "format": "WAV/FLOAT", "library_versions": {"numpy": np.__version__, "scipy": scipy.__version__, "soundfile": sf.__version__}},
        "summary": summary,
        "validation_passed": not failures,
        "validation_failures": failures,
        "records": sorted(selected, key=lambda record: (record["split"], record["label"], record["clip_id"])),
        "limitations": [
            "FSD50K labels are clip-level; the event is not guaranteed to dominate the first five seconds.",
            "Buzz is source-ambiguous and does not establish electrical hum, a transformer, or a light fixture.",
            "Mechanical fan does not establish air conditioning, household/industrial context, or a particular machine.",
            "Wind does not establish wind striking a microphone.",
            "No labeled silence class is provided; quiet input is handled by the separate input-quality gate.",
            "These recordings may overlap the pretrained encoder's training material; downstream splits do not prove encoder-unseen accuracy.",
        ],
    }
    manifest_path = root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)
    if failures:
        raise ValueError(f"Insufficient eligible data; see {manifest_path}: {'; '.join(failures)}")
    return manifest_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="output/tonalwatch-training-data")
    parser.add_argument("--seed", type=int, default=804)
    args = parser.parse_args()
    print(prepare_dataset(args.output_dir, seed=args.seed))
