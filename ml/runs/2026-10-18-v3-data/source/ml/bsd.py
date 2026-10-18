"""A frozen, attributed BSD35k-CS audit subset; no model-derived selection.

Primary source: Anastasopoulou and Font Corbera (2026), BSD35k-CS,
https://doi.org/10.5281/zenodo.19187100 . The dataset metadata is CC BY 4.0;
individual audio licenses govern audio reuse. Only explicit CC0/CC BY audio
is eligible. Creator BST categories and descriptions are WEAK source labels,
not independently adjudicated field ground truth. In particular, this subset
does not establish a physical source, fault, equipment identity or accuracy.

All metadata-selected final source groups are reserved BEFORE audio download
or quality checks. Do not recycle rejected/unselected members of those groups
into development. First five seconds, mono source, 44.1 -> 48 kHz polyphase
resampling, no gain/padding/stitching. Each complete WAV member is checked
against the pinned ZIP directory and CRC. The 35 GB archive MD5 is recorded,
NOT verified by selective extraction. Original means the BSD-distributed WAV,
already converted/cropped by BSD; its hash is not the original Freesound file.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
import hashlib
import io
import json
from math import gcd
from pathlib import Path
import re
import struct
import threading
import time
from urllib.request import Request, urlopen
import zipfile
import zlib

import numpy as np
from scipy.signal import resample_poly
import soundfile as sf

from ml.data import _quality, _rank, _sha256, permitted_license
from ml.mimii import _RemoteReader, _inventory, _inventory_digest, _read_range, _decode_member


SOURCE_URL = "https://zenodo.org/records/19187100"
METADATA_URL = SOURCE_URL + "/files/metadata.zip?download=1"
METADATA_BYTES = 4374871
METADATA_MD5 = "9876254ce2ed845691a9a76efe13fe5a"
METADATA_SHA256 = "b595129c00e65f098bee06aaf442ed454cb30430fadd28461bcdd6628b235a51"
CSV_SHA256 = "2128c89e39d2024ac015bb7053e07099ec287d89122ea0c084e8a3460ab6d363"
ARCHIVE_URL = SOURCE_URL + "/files/audio.zip?download=1"
ARCHIVE_BYTES = 35091942026
ARCHIVE_MD5 = "d47968c99ad4e93a081f380b2d273acd"
INVENTORY_SHA256 = "d106b6d51b32205642ac401701a8df2e38dd4cefc01d1c34d1e46d7ae46a242d"
SELECTION_VERSION = "bsd-creator-metadata-v4"
HASH_FIELDS = ("sha256", "original_sha256", "pcm_sha256")
LABELS = ("buzz", "mechanical_fan", "speech", "traffic", "wind", "unknown")
DEFAULT_CAPS = {"buzz": 60, "mechanical_fan": 80, "speech": 70, "traffic": 80, "wind": 80, "unknown": 200}
CITATION = "Anastasopoulou, P. & Font Corbera, F. (2026). BSD35k-CS (Broad Sound Dataset 35k - Crowd Sourced). Zenodo. DOI:10.5281/zenodo.19187100"

# Reviewed from titles/tags/descriptions BEFORE any audio/model outputs. Explicit
# operating airborne fans/vents; omit contact/geophones, synth/processed/looped
# recordings, folding hand fans, other primary mechanisms, direct fan-on-mic,
# and multi-target scenes. Creator provenance remains fallible even on this list.
FAN_IDS = frozenset("""799513 799531 801595 801599 803447 805667 806681
807196 807687 808820 808821 808822 814917 814918 815796 816271
817022 817023 817024 817025 817026 817027 817028 819059 819060 819061
823531 825869 828153 828780 831786 831899 832384 832385 833312 833513
836534 837652 837653 839004 839007""".split())
BUZZ_IDS = frozenset("""798229 798239 802225 807177 807946 812288 817923
817924 835123 836589""".split())


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _freeze(path: Path, value: object) -> None:
    """Resume only an identical selection; never silently rewrite a holdout."""
    raw = _json_bytes(value)
    if path.exists() and path.read_bytes() != raw:
        raise ValueError(f"Frozen BSD selection differs: {path}")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)


def _download_metadata(root: Path) -> list[dict]:
    cache = root / "cache/metadata.zip"
    if cache.exists():
        raw = cache.read_bytes()
    else:
        request = Request(METADATA_URL, headers={"User-Agent": "TonalWatch-research/3.0", "Accept-Encoding": "identity"})
        with urlopen(request, timeout=90) as response:
            raw = response.read(METADATA_BYTES + 1)
    if (len(raw) != METADATA_BYTES or hashlib.md5(raw).hexdigest() != METADATA_MD5
            or _sha256(raw) != METADATA_SHA256):
        raise ValueError("BSD metadata ZIP size/MD5/SHA256 mismatch")
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(raw)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        csv_bytes = archive.read("metadata/BSD35k-CS_metadata.csv")
    if _sha256(csv_bytes) != CSV_SHA256:
        raise ValueError("BSD metadata CSV SHA256 mismatch")
    rows = list(csv.DictReader(io.StringIO(csv_bytes.decode("utf-8"), newline="")))
    if len(rows) != 33829 or len({row["sound_id"] for row in rows}) != 33829:
        raise ValueError("Unexpected BSD metadata identity/count")
    return rows


class BsdArchive:
    def __init__(self, root: Path):
        cache = root / "cache/audio.inventory.json"
        if cache.exists():
            inventory = json.loads(cache.read_text(encoding="utf-8"))
        else:
            with zipfile.ZipFile(_RemoteReader(ARCHIVE_URL, ARCHIVE_BYTES)) as archive:
                inventory = _inventory(archive.infolist())
        if _inventory_digest(inventory) != INVENTORY_SHA256:
            raise ValueError("BSD ZIP member inventory mismatch")
        if not cache.exists():
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(_json_bytes(inventory))
        self.members = {row["name"]: row for row in inventory}
        self._request_lock = threading.Lock()
        self._last_request = 0.0

    def read_member(self, member: dict) -> bytes:
        # Zenodo can throttle concurrent small Range requests. Bound request
        # start rate independently of decoder/download workers; honor server
        # Retry-After through the shared exact-range reader as well.
        with self._request_lock:
            delay = max(0.0, 2.1 - (time.monotonic() - self._last_request))
            if delay:
                time.sleep(delay)
            self._last_request = time.monotonic()
        start = member["offset"]
        end = min(start + 30 + len(member["name"].encode("utf-8")) + 65535 + member["compressed_size"] - 1, ARCHIVE_BYTES - 1)
        raw = _read_range(ARCHIVE_URL, start, end, ARCHIVE_BYTES)
        return _decode_member(raw, member)


def _text(row: dict) -> str:
    return " ".join(row.get(key, "") for key in ("title", "tags", "description")).casefold()


def _hits(pattern: str, text: str) -> bool:
    return re.search(pattern, text, re.I) is not None


def metadata_label(row: dict) -> tuple[str | None, str]:
    """Fixed metadata-only weak-label policy, never a classifier query."""
    title = row.get("title", "").casefold().replace("_", " ")
    text, category = _text(row), row.get("class", "")
    # Explicit creator opt-outs win over a general CC deed. Conservative broad
    # exclusions are intentional; they are not repaired after seeing scores.
    if _hits(r"no (?:ai|machine learning)|not (?:for|to be used (?:for|in)) (?:ai|machine learning)|do not (?:use|train).*\b(?:ai|model|learning)\b", text):
        return None, "creator_ml_optout"
    if _hits(r"personal.use.only|non.commercial|not.for.commercial|no.commercial|all.rights.reserved", text):
        return None, "creator_restriction_conflicts_with_clean_audio_license"
    if row.get("sound_id") in FAN_IDS:
        return "mechanical_fan", "reviewed_creator_airborne_operating_fan_statement"
    if row.get("sound_id") in BUZZ_IDS:
        return "buzz", "reviewed_creator_insect_buzz_statement"
    if _hits(r"contact.?mic|geophon|hydrophon|synthe(?:tic|sis|sized)|text.to.speech|\btts\b|\b(?:ai|ia)\b|generated.{0,30}(?:ai|elevenlabs)|elevenlabs|cartoon|\bprocessed\b|post.process|distortion|plugins?|pitch.shift|slowed.down|white.noise|\breversed\b|\breverb\b|repeating.loop|seamless.loop|\blooped\b|\bbased on\b|\bremix|\bmimic|\bsimulat", text):
        return None, "processed_or_nonairborne_or_synthetic"
    # Preserve ordinary creator field edits such as trimming; our own pipeline
    # adds no gain/denoising. No tag-only wind/traffic labels: main title must say it.
    leading_title = " ".join(re.findall(r"[a-z]+", title)[:5])
    traffic = (category in {"ss-u", "fx-v"} and _hits(r"\b(?:traffic|highway|motorway|freeway)\b", leading_title)
               and not _hits(r"announcement|streetcar|\btrain|\btrains|railway|\bjeep|\bhorn|\bhorns|crossing.button|traffic.light|\bbirds|\bpigeons|\bdoves|\bstream|\bneighbours|\bneighbors|\barguing|\bchant", title))
    wind = (category in {"ss-n", "fx-n"} and _hits(r"\b(?:wind|windy|gusts?)\b", leading_title)
            and not _hits(r"chimes?|\bbells?|\bfootsteps|\bwalking|\bwalk\b|\brun\b|\bbirdsong|\bbirds?\b|\binsects?\b|\bcrickets?\b|\bwaves?\b|\brain\b|\bdogs?\b|\bhorse|\bplane|\bwaterfall|\bvoices?\b|\bkids?\b|\bviolin|\bwoodpecker|\bcrows?\b|dawn.chorus", title)
            and not _hits(r"\bclipping\b|\bclipped\b|\bdenoise|de.noise", text))
    speech = (category in {"sp-s", "sp-c"} and _hits(r"\b(?:talking|speaking|conversation|speech|reading|people|crowd|voice)\b", title)
              and _hits(r"\brecord(?:ed|ing|er)|microphone|\brode\b|\bzoom\b|\bshure\b|\btascam\b|\biphone\b|\bandroid\b|\bsamsung\b|\bsm57\b|\bnt1\b|voice.memo", text)
              and not _hits(r"\bmovie|\bfilm|\bmonologue|\bcheering|\byelling|\bscreaming|\brobot|\bdemon|\bghost|\bmulti.layer|\blayered", text))
    # Obvious target mixtures are excluded instead of assigned by token order.
    target_tokens = {
        "mechanical_fan": _hits(r"\b(?:fan|hvac|ventilation|air.conditioner)\b", title),
        "buzz": _hits(r"\b(?:bees?|beehive|bumblebees?|mosquito|buzzing)\b", title),
        "traffic": _hits(r"\b(?:traffic|highway|motorway|freeway|cars?|trucks?|motorcycles?|vehicles?)\b", title),
        "wind": _hits(r"\b(?:wind|windy|gusts?)\b", title),
        "speech": _hits(r"\b(?:talking|speaking|conversation|speech|reading|people|crowd|voices?)\b", title),
    }
    hits = [label for label, present in target_tokens.items() if present]
    if len(hits) > 1:
        return None, "multiple_target_families_in_title"
    for label, present in (("traffic", traffic), ("wind", wind), ("speech", speech)):
        if present:
            return label, "creator_BST_category_and_primary_title"
    # Unknowns have explicit primary non-target events and compatible BST labels.
    # Musical wind instruments never become natural wind; speech/song isn't OOD.
    if _hits(r"\b(?:fan|hvac|ventilation|air.conditioner|bee|bees|buzz|buzzing|mosquito|traffic|highway|motorway|freeway|wind|windy|speech|talking|speaking|conversation|singing|vocals?)\b", text):
        return None, "possible_target_family_or_ambiguous_unknown"
    unknown_types = (
        ("water", {"fx-n", "ss-n", "fx-o"}, r"\b(?:water|river|stream|waterfall|waves|rain|raining|shower|faucet)\b"),
        ("bird", {"fx-a", "ss-n"}, r"\b(?:birds?|birdsong|chirping|crows?|ravens?|owls?|ducks?)\b"),
        ("dog", {"fx-a"}, r"\b(?:dog|barking)\b"),
        ("cat", {"fx-a"}, r"\b(?:cat|meow|purring)\b"),
        ("footsteps", {"fx-h", "fx-o"}, r"\b(?:footsteps|walking)\b"),
        ("door", {"fx-o", "fx-m"}, r"\b(?:door|gate)\b"),
        ("percussion", {"m-sp", "is-p"}, r"\b(?:drum|drums|percussion|cymbal|tambourine)\b"),
        ("instrumental_music", {"m-si", "m-m", "is-s", "is-k"}, r"\b(?:piano|guitar|violin|cello|instrumental)\b"),
        ("fire", {"fx-n", "ss-n"}, r"\b(?:fire|fireplace|bonfire|campfire)\b"),
    )
    for name, categories, pattern in unknown_types:
        if category in categories and _hits(pattern, title):
            return "unknown", "creator_primary_non_target:" + name
    return None, "no_unambiguous_predeclared_label"


def _diverse(records: list[dict], seed: int) -> list[dict]:
    by_group = defaultdict(list)
    for row in records:
        by_group[row["uploader_group"]].append(row)
    ordered = [sorted(by_group[group], key=lambda r: _rank(seed, r["clip_id"]))
               for group in sorted(by_group, key=lambda g: _rank(seed, g))]
    return [rows[index] for index in range(max(map(len, ordered), default=0)) for rows in ordered if index < len(rows)]


def build_selection(rows: list[dict], members: dict, previous: list[dict], *, seed: int = 18043,
                    caps: dict | None = None) -> dict:
    """Reserve every selected uploader before quality; no post-score backfill."""
    caps = dict(DEFAULT_CAPS if caps is None else caps)
    if set(caps) != set(LABELS) or any(type(value) is not int or value < 0 for value in caps.values()):
        raise ValueError("BSD caps must give six non-negative integer family counts")
    groups = {row["uploader_group"].casefold() for row in previous}
    ids = {str(row["clip_id"]) for row in previous}
    pools, excluded = defaultdict(list), Counter()
    for row in rows:
        clip_id, uploader = str(row["sound_id"]), row["uploader"].strip()
        group = uploader.casefold()
        if not uploader or not clip_id.isdigit() or not permitted_license(row["license"]):
            excluded["missing_identity_or_disallowed_audio_license"] += 1
            continue
        if group in groups or clip_id in ids:
            excluded["previously_exposed_uploader_or_clip"] += 1
            continue
        label, reason = metadata_label(row)
        if label is None:
            excluded[reason] += 1
            continue
        member = members.get(f"audio/{clip_id}.wav")
        if member is None:
            raise ValueError("BSD metadata refers to absent WAV")
        # 44.1k mono PCM16 is declared by publisher; this only rejects definite
        # short files using byte size. Actual frame counts are checked on decode.
        if member["size"] < 441000 + 44:
            excluded["member_too_small_for_five_seconds"] += 1
            continue
        record = {"clip_id": clip_id, "dataset": "BSD35k-CS", "label": label,
                  "split": "ood_test" if label == "unknown" else "test",
                  "original_split": "BSD35k-CS (no official train/test partition)",
                  "original_split_is_official": False, "uploader": uploader, "uploader_group": group,
                  "grouping_unit": "case-folded Freesound uploader (whole group reserved before quality)",
                  "collection_group": "BSD35k-CS:Freesound-2025-2026", "source_url": f"https://freesound.org/people/{uploader}/sounds/{clip_id}/",
                  "dataset_source_url": SOURCE_URL, "license": row["license"],
                  "attribution": f"{row['title']} by {uploader}, Freesound sound {clip_id}; {row['license']}",
                  "citation": CITATION, "original_labels": [row["class"], row["title"], row["tags"]],
                  "creator_title": row["title"], "creator_tags": row["tags"], "creator_description": row["description"],
                  "label_quality": "creator-provided BST category and metadata; not independently verified",
                  "selection_reason": reason, "unknown_type": reason.split(":", 1)[1] if reason.startswith("creator_primary_non_target:") else None,
                  "archive_url": ARCHIVE_URL, "archive_member": member["name"],
                  "archive_inventory_sha256": INVENTORY_SHA256, "published_archive_md5": ARCHIVE_MD5,
                  "full_archive_md5_verified": False, "archive_member_crc32": f"{member['crc32']:08x}",
                  "archive_member_size": member["size"], "metadata_csv_sha256": CSV_SHA256}
        pools[label].append(record)
    selected = []
    for label in LABELS:
        selected.extend(_diverse(pools[label], seed)[:caps[label]])
    return {"selection_version": SELECTION_VERSION, "seed": seed, "caps": caps,
            "metadata_csv_sha256": CSV_SHA256, "archive_inventory_sha256": INVENTORY_SHA256,
            "previous_records_sha256": _sha256(_json_bytes(previous)),
            "policy": "Metadata-only labels/selection; complete selected uploader groups reserved before quality. No predictions, source normalization, short padding, re-cropping or replacement after exclusion.",
            "reserved_uploaders": sorted({r["uploader_group"] for r in selected}),
            "pool_counts": {label: len(pools[label]) for label in LABELS},
            "pool_uploaders": {label: len({r["uploader_group"] for r in pools[label]}) for label in LABELS},
            "excluded_metadata": dict(excluded), "records": selected}


def prepare_wav(raw: bytes, record: dict, root: Path) -> tuple[dict | None, str | None]:
    crc_verified = "archive_member_crc32" in record and "archive_member_size" in record
    if crc_verified and (len(raw) != record["archive_member_size"]
                         or f"{zlib.crc32(raw):08x}" != record["archive_member_crc32"]):
        raise ValueError("BSD source WAV CRC/size differs from source record")
    with sf.SoundFile(io.BytesIO(raw)) as source:
        rate, channels, subtype, frames = source.samplerate, source.channels, source.subtype, source.frames
        if (rate, channels, subtype) != (44100, 1, "PCM_16"):
            raise ValueError("BSD publisher format differs from pinned mono44100 PCM16 contract")
        if frames < rate * 5:
            return None, "shorter_than_five_seconds"
        source_pcm = source.read(rate * 5, dtype="float32", always_2d=True)[:, 0]
    source_quality, reason = _quality(source_pcm)
    if reason:
        return None, "source_" + reason
    divisor = gcd(rate, 48000)
    pcm = resample_poly(source_pcm, 48000 // divisor, rate // divisor).astype(np.float32)
    quality, reason = _quality(pcm)
    if reason:
        return None, "prepared_" + reason
    if pcm.shape != (240000,):
        raise ValueError("Incorrect BSD prepared five-second sample count")
    pcm_bytes = pcm.astype("<f4").tobytes()
    fmt = struct.pack("<HHIIHH", 3, 1, 48000, 48000 * 4, 4, 32)
    chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"fact" + struct.pack("<II", 4, len(pcm))
    chunks += b"data" + struct.pack("<I", len(pcm_bytes)) + pcm_bytes
    prepared_bytes = b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WAVE" + chunks
    path = root / "audio" / (record["clip_id"] + ".wav")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() != prepared_bytes:
        raise ValueError("Existing BSD prepared WAV does not match deterministic source crop")
    if not path.exists():
        path.write_bytes(prepared_bytes)
    return {**record, "local_path": str(path.resolve()), "sha256": _sha256(prepared_bytes),
            "original_sha256": _sha256(raw), "pcm_sha256": _sha256(pcm_bytes),
            "original_hash_scope": "BSD converted/cropped WAV member, not original Freesound file",
            "original_sample_rate": rate, "original_channels": channels, "original_subtype": subtype,
            "original_duration_seconds": frames / rate, "sample_rate": 48000, "samples": len(pcm),
            "crop_start_seconds": 0, "crop_duration_seconds": 5, "channel": 0,
            "resampler": "scipy.signal.resample_poly(160,147), default Kaiser window; no normalization",
            "gain_applied": False, "archive_member_crc_verified": crc_verified,
            "source_quality": source_quality, "quality": quality, **quality}, None


def prepare_bsd(output_dir: str | Path, previous_records: list[dict], *, seed: int = 18043,
                caps: dict | None = None, workers: int = 6, superseded_plan: dict | None = None) -> dict:
    """Prepare final-only audit candidates and return manifest, even if scarce.

    Caller must enforce V3 readiness jointly with separately attributed sources.
    All `reserved_uploaders` must be excluded from every development role even
    for rejected audio. Existing plan or manifest changes fail closed on reuse.
    """
    root = Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    rows, archive = _download_metadata(root), BsdArchive(root)
    plan = build_selection(rows, archive.members, previous_records, seed=seed, caps=caps)
    if superseded_plan is not None:
        if (superseded_plan.get("metadata_csv_sha256") != CSV_SHA256
                or superseded_plan.get("previous_records_sha256") != plan["previous_records_sha256"]):
            raise ValueError("Superseded BSD plan has a different source or historical exclusion cohort")
        plan["superseded_metadata_plan_sha256"] = _sha256(_json_bytes(superseded_plan))
        plan["superseded_reason"] = "Stricter metadata-only source/type exclusions after synthetic regression and creator-text audit, before any model predictions. All earlier reserved groups remain reserved."
        plan["reserved_uploaders"] = sorted(set(plan["reserved_uploaders"]) | set(superseded_plan["reserved_uploaders"]))
    _freeze(root / "selection-plan.json", plan)
    old_hashes = {row[key] for row in previous_records for key in HASH_FIELDS}

    def one(record):
        member = archive.members[record["archive_member"]]
        cache = root / "original" / (record["clip_id"] + ".wav")
        if cache.exists():
            raw = cache.read_bytes()
            if len(raw) != member["size"] or zlib.crc32(raw) != member["crc32"]:
                raise ValueError("Cached BSD source member CRC/size mismatch")
        else:
            raw = archive.read_member(member)
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(raw)
        prepared, reason = prepare_wav(raw, record, root)
        if prepared is not None and {prepared[key] for key in HASH_FIELDS} & old_hashes:
            return None, {"clip_id": record["clip_id"], "reason": "previous_audio_hash_overlap", "original_sha256": _sha256(raw)}
        return prepared, None if reason is None else {"clip_id": record["clip_id"], "reason": reason, "original_sha256": _sha256(raw)}

    with ThreadPoolExecutor(max_workers=max(1, min(workers, 8))) as pool:
        results = list(pool.map(one, plan["records"]))
    records, exclusions, seen = [], [], set()
    for prepared, reason in results:
        if reason:
            exclusions.append(reason)
        elif prepared:
            fingerprints = {prepared[key] for key in HASH_FIELDS}
            if fingerprints & seen:
                exclusions.append({"clip_id": prepared["clip_id"], "reason": "duplicate_source_or_prepared_pcm", "original_sha256": prepared["original_sha256"]})
            else:
                records.append(prepared)
                seen.update(fingerprints)
    manifest = {"source_url": SOURCE_URL, "citation": CITATION, "seed": seed,
                "selection_version": SELECTION_VERSION, "selection_plan_sha256": _sha256((root / "selection-plan.json").read_bytes()),
                "metadata": {"url": METADATA_URL, "bytes": METADATA_BYTES, "md5": METADATA_MD5, "sha256": METADATA_SHA256, "csv_sha256": CSV_SHA256, "checksums_verified": True},
                "archive": {"url": ARCHIVE_URL, "bytes": ARCHIVE_BYTES, "published_md5": ARCHIVE_MD5, "full_archive_md5_verified": False, "inventory_sha256": INVENTORY_SHA256},
                "reserved_uploaders": plan["reserved_uploaders"], "counts": dict(Counter(r["label"] for r in records)),
                "groups_per_label": {label: len({r["uploader_group"] for r in records if r["label"] == label}) for label in LABELS},
                "exclusion_counts": dict(Counter(r["reason"] for r in exclusions)), "excluded_records": exclusions,
                "limitations": ["Creator categories and metadata are weak labels, not independently verified ground truth.", "BSD original WAVs were already converted/cropped by their publisher; upstream original audio hashes are unavailable.", "Whole-archive MD5 cannot be verified by selective range extraction.", "Uploader names cannot rule out aliases, copied recordings or all pretrained-encoder overlap.", "No final groups may enter development after a failed quality check or unsuccessful audit."],
                "records": records}
    _freeze(root / "manifest.json", manifest)
    print("BSD final quality preflight: " + json.dumps({k: manifest[k] for k in ("counts", "groups_per_label", "exclusion_counts")}), flush=True)
    return manifest
