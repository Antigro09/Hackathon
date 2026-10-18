"""Select attributed MIMII fan recordings and same-dataset unknown controls.

Source: Hitachi's MIMII public 1.0, DOI 10.5281/zenodo.3384388 (2019),
https://zenodo.org/records/3384388 . Copyright belongs to the dataset creators;
audio is CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ .
Citation: Harsh Purohit, Ryo Tanabe, Kenji Ichige, Takashi Endo, Yuki Nikaido,
Kaori Suefusa, and Yohei Kawaguchi, "MIMII Dataset: Sound Dataset for
Malfunctioning Industrial Machine Investigation and Inspection," DCASE 2019.

We download members of only the 0 dB archives using verified HTTP byte ranges.
An immutable, SHA256-pinned ZIP member inventory plus each member's ZIP CRC and
new SHA256 identify the subset. The publisher's whole-archive MD5 is RECORDED,
NOT VERIFIED: selective extraction cannot verify a ten-gigabyte archive MD5.

Unit IDs 00/02 train, 04 validate, 06 test are OUR derived partitions, not an
official MIMII development/evaluation split. Fan is the broad known label;
normal and abnormal operation are both included, without fault labels or
equipment-identity claims. Pump/valve/slider from IDs 04/06 are unknown controls
in validation/test, preventing every MIMII recording from being synonymous
with fan. Shared collection conditions or factory backgrounds can remain
across physical units, so this is not independent field/device validation.

First five seconds, first channel, 16-to-48 kHz polyphase resampling, no gain
normalization. FSD quality gates are reused, but its CC0/BY license allow-list
does NOT apply: MIMII is separately marked BY-SA, raw audio is never committed,
and deployment/redistribution of derived model artifacts needs license review.
"""

from __future__ import annotations

from collections import Counter, defaultdict
import io
import json
from pathlib import Path
import re
import struct
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import zipfile
import zlib

import numpy as np
from scipy.signal import resample_poly
import soundfile as sf

from ml.data import _quality, _rank, _sha256


SOURCE_RECORD = "https://zenodo.org/records/3384388"
LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/"
CREATORS = "Harsh Purohit; Ryo Tanabe; Kenji Ichige; Takashi Endo; Yuki Nikaido; Kaori Suefusa; Yohei Kawaguchi (Hitachi, Ltd.)"
CITATION = "Purohit et al. (2019), MIMII Dataset: Sound Dataset for Malfunctioning Industrial Machine Investigation and Inspection. DOI:10.5281/zenodo.3384388"
ARCHIVES = {
    "fan": {"bytes": 10411902283, "published_md5": "6354d1cc2165c52168f9ef1bcd9c7c52", "inventory_sha256": "667af19a97797663ce8721e24faab82c7ef3f52dfb385be723dfd0baabccb9aa"},
    "pump": {"bytes": 7869431302, "published_md5": "488748295c3f60b25de07b58fe75b049", "inventory_sha256": "2c76233857d38af57943d097859f7e17e9c2c88c7fb1c70fed295ff8898286b7"},
    "valve": {"bytes": 7486536802, "published_md5": "178478eb0d11c79080a35562bfdeee71", "inventory_sha256": "79b740373707e3f9ae4d85aeb9184534b32255167b495f92acc4bcfb75e08153"},
    "slider": {"bytes": 7508958315, "published_md5": "4d674c21474f0646ecd75546db6c0c4e", "inventory_sha256": "d98cdbe5f85c7d5a92ff9072a6e879d116412067ba0aef83a85dac64bdad14cc"},
}
MAX_RANGE_BYTES = 8 * 1024 * 1024
UNIT_SPLITS = {"00": "train", "02": "train", "04": "val", "06": "test"}


def _read_range(url: str, start: int, end: int, size: int, attempts: int = 4) -> bytes:
    """Refuse ignored Range requests, wrong archive lengths and oversized bodies."""
    if not 0 <= start <= end < size or end - start + 1 > MAX_RANGE_BYTES:
        raise ValueError("Unsafe or oversized archive byte range")
    length = end - start + 1
    for attempt in range(attempts):
        try:
            request = Request(url, headers={
                "User-Agent": "TonalWatch-research/2.0", "Accept-Encoding": "identity",
                "Range": f"bytes={start}-{end}",
            })
            with urlopen(request, timeout=60) as response:
                if response.status != 206 or response.headers.get("Content-Range") != f"bytes {start}-{end}/{size}":
                    raise ValueError("Source did not honor the exact requested archive byte range")
                encoding = response.headers.get("Content-Encoding", "identity")
                if encoding != "identity":
                    raise ValueError("Encoded archive byte range is not byte-addressable")
                declared = response.headers.get("Content-Length")
                if declared is not None and int(declared) != length:
                    raise ValueError("Archive byte range Content-Length mismatch")
                raw = response.read(length + 1)
            if len(raw) != length:
                raise ValueError("Truncated or oversized archive byte range")
            return raw
        except HTTPError as error:
            if attempt + 1 == attempts or error.code not in {429, 500, 502, 503, 504}:
                raise
            try:
                delay = int(error.headers.get("Retry-After", "5"))
            except ValueError:
                delay = 5
            time.sleep(max(1, min(delay, 60)))
        except (URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("Unreachable range retry state")


class _RemoteReader(io.RawIOBase):
    """Seekable bounded reads let Python's ZIP parser handle ZIP64 directories."""

    def __init__(self, url: str, size: int):
        self.url, self.size, self.position = url, size, 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset if whence == 2 else -1
        if position < 0 or position > self.size:
            raise ValueError("Archive seek outside file")
        self.position = position
        return position

    def read(self, count=-1):
        count = self.size - self.position if count < 0 else min(count, self.size - self.position)
        if count <= 0:
            return b""
        raw = _read_range(self.url, self.position, self.position + count - 1, self.size)
        self.position += len(raw)
        return raw


def _inventory(infos: list[zipfile.ZipInfo]) -> list[dict]:
    return [{"name": i.filename, "crc32": i.CRC, "compressed_size": i.compress_size,
             "size": i.file_size, "offset": i.header_offset, "method": i.compress_type,
             "flags": i.flag_bits} for i in infos]


def _inventory_digest(inventory: list[dict]) -> str:
    return _sha256(json.dumps(inventory, sort_keys=True, separators=(",", ":")).encode())


class RemoteArchive:
    """Verify a pinned member directory, then fetch only chosen WAV members."""

    def __init__(self, machine: str, cache_dir: Path):
        self.machine = machine
        self.expected = ARCHIVES[machine]
        self.url = f"{SOURCE_RECORD}/files/0_dB_{machine}.zip?download=1"
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache = cache_dir / f"0_dB_{machine}.inventory.json"
        if cache.exists():
            inventory = json.loads(cache.read_text(encoding="utf-8"))
        else:
            with zipfile.ZipFile(_RemoteReader(self.url, self.expected["bytes"])) as archive:
                inventory = _inventory(archive.infolist())
        if _inventory_digest(inventory) != self.expected["inventory_sha256"]:
            raise ValueError(f"Immutable MIMII {machine} ZIP inventory mismatch")
        cache.write_text(json.dumps(inventory, indent=2), encoding="utf-8")
        self.members = {entry["name"]: entry for entry in inventory}

    def read_member(self, member: dict) -> bytes:
        # Allow up to 65,535 local extra bytes. One range includes header/name/
        # extras/payload, avoiding three separate requests per selected entry.
        start = member["offset"]
        end = min(start + 30 + len(member["name"].encode("utf-8")) + 65535 + member["compressed_size"] - 1, self.expected["bytes"] - 1)
        raw = _read_range(self.url, start, end, self.expected["bytes"])
        return _decode_member(raw, member)


def _decode_member(raw: bytes, member: dict) -> bytes:
    if len(raw) < 30:
        raise ValueError("Truncated ZIP local header")
    signature, _, flags, method, _, _, crc, compressed, size, name_len, extra_len = struct.unpack("<4s5H3I2H", raw[:30])
    if signature != b"PK\x03\x04" or flags & 1 or method not in {0, 8}:
        raise ValueError("Unsupported or encrypted ZIP local member")
    if flags != member["flags"] or method != member["method"]:
        raise ValueError("ZIP header/directory flags or method mismatch")
    name = raw[30:30 + name_len].decode("utf-8" if flags & 0x800 else "cp437")
    if name != member["name"]:
        raise ValueError("ZIP header/directory filename mismatch")
    if not flags & 8 and (crc != member["crc32"] or compressed != member["compressed_size"] or size != member["size"]):
        raise ValueError("ZIP header/directory size or CRC mismatch")
    begin = 30 + name_len + extra_len
    payload = raw[begin:begin + member["compressed_size"]]
    if len(payload) != member["compressed_size"]:
        raise ValueError("Truncated ZIP member payload")
    if member["size"] > 8 * 1024 * 1024:
        raise ValueError("Unexpectedly large source WAV")
    if method == 0:
        decoded = payload
    else:
        decompressor = zlib.decompressobj(-15)
        decoded = decompressor.decompress(payload, member["size"] + 1)
        if not decompressor.eof or decompressor.unused_data or decompressor.unconsumed_tail:
            raise ValueError("Invalid or oversized ZIP compressed stream")
    if len(decoded) != member["size"] or zlib.crc32(decoded) != member["crc32"]:
        raise ValueError("ZIP member size or CRC integrity mismatch")
    return decoded


def _prepare_audio(raw: bytes, record: dict, root: Path) -> tuple[dict | None, str | None]:
    with sf.SoundFile(io.BytesIO(raw)) as source:
        if source.samplerate != 16000 or source.channels != 8 or source.subtype != "PCM_16":
            return None, "unexpected_original_format"
        if source.frames != 160000:
            return None, "unexpected_original_duration"
        first_channel = source.read(80000, dtype="float32", always_2d=True)[:, 0]
    source_quality, reason = _quality(first_channel)
    if reason:
        return None, f"source_{reason}"
    prepared = resample_poly(first_channel, 3, 1).astype(np.float32)
    quality, reason = _quality(prepared)
    if reason:
        return None, f"prepared_{reason}"
    if prepared.shape != (240000,):
        raise ValueError("Unexpected prepared duration")
    pcm = prepared.astype("<f4").tobytes()
    fmt = struct.pack("<HHIIHH", 3, 1, 48000, 48000 * 4, 4, 32)
    chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt
    chunks += b"fact" + struct.pack("<II", 4, len(prepared))
    chunks += b"data" + struct.pack("<I", len(pcm)) + pcm
    wav = b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WAVE" + chunks
    path = root / "audio" / f"{record['clip_id']}.wav"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(wav)
    return {**record, "local_path": str(path.resolve()), "sha256": _sha256(wav),
            "original_sha256": _sha256(raw), "pcm_sha256": _sha256(pcm),
            "original_sample_rate": 16000, "original_channels": 8,
            "original_duration_seconds": 10, "sample_rate": 48000, "samples": 240000,
            "crop_start_seconds": 0, "crop_duration_seconds": 5, "channel": 0,
            "resampler": "scipy.signal.resample_poly", "gain_applied": False,
            "source_quality": source_quality, "quality": quality, **quality}, None


def _candidate_order(members: list[dict], seed: int) -> list[dict]:
    """Alternate normal/abnormal candidates in fixed hash order, without scores."""
    states = defaultdict(list)
    for member in members:
        states[member["name"].split("/")[2]].append(member)
    for values in states.values():
        values.sort(key=lambda member: _rank(seed, member["name"]))
    return [values[index] for index in range(max((len(v) for v in states.values()), default=0))
            for _, values in sorted(states.items()) if index < len(values)]


def prepare_mimii_fans(output_dir: str | Path, seed: int = 18042,
                       max_train_per_unit: int = 40, max_val: int = 30,
                       max_test: int = 40, max_unknown_per_machine: int = 15) -> list[dict]:
    """Return FSD-compatible records and write a separate BY-SA source manifest.

    original_split=0_dB identifies the source archive condition, not dev/eval;
    every record also says original_split_is_official=False and stores release.
    The output directory must be ignored research storage, not a public asset.
    Unknown controls: pump/valve/slider ID04→ood_val, ID06→ood_test. Every target
    gets at most twice its cap in fixed metadata-ranked quality candidates.
    No model predictions are read. A scarce or failed group raises after its
    manifest is written, rather than silently substituting a different unit.
    """
    if any(v < 1 for v in (max_train_per_unit, max_val, max_test, max_unknown_per_machine)):
        raise ValueError("All source caps must be positive")
    root = Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    selected, exclusions, seen = [], Counter(), set()
    excluded_records = []
    plans = [("fan", "00", "train", max_train_per_unit), ("fan", "02", "train", max_train_per_unit),
             ("fan", "04", "val", max_val), ("fan", "06", "test", max_test)]
    plans += [(machine, unit, split, max_unknown_per_machine) for machine in ("pump", "valve", "slider")
              for unit, split in (("04", "ood_val"), ("06", "ood_test"))]
    inventories, failures = {}, []
    for machine in ("fan", "pump", "valve", "slider"):
        archive = RemoteArchive(machine, root / "cache" / "metadata")
        inventories[machine] = {**archive.expected, "url": archive.url, "full_archive_md5_verified": False}
        for _, unit, split, cap in [p for p in plans if p[0] == machine]:
            eligible = [member for name, member in archive.members.items()
                        if re.fullmatch(rf"{machine}/id_{unit}/(?:abnormal|normal)/\d{{8}}\.wav", name)]
            candidates = _candidate_order(eligible, seed)[:2 * cap]
            own = []
            for member in candidates:
                if len(own) >= cap:
                    break
                state, file_id = member["name"].split("/")[2:]
                clip_id = f"mimii_0db_{machine}_id{unit}_{state}_{file_id[:-4]}"
                cached = root / "cache" / "original" / f"{clip_id}.wav"
                raw = cached.read_bytes() if cached.exists() else archive.read_member(member)
                if len(raw) != member["size"] or zlib.crc32(raw) != member["crc32"]:
                    raise ValueError(f"Source WAV CRC/size mismatch: {member['name']}")
                cached.parent.mkdir(parents=True, exist_ok=True)
                if not cached.exists():
                    cached.write_bytes(raw)
                group = f"mimii:{machine}:id_{unit}"
                record = {"clip_id": clip_id, "dataset": "MIMII", "dataset_release": "public 1.0", "split": split,
                          "label": "mechanical_fan" if machine == "fan" else "unknown",
                          "original_split": "0_dB",
                          "original_split_is_official": False, "source_release": "public 1.0 (2019-09-20)",
                          "split_policy": "derived physical-unit partition: 00/02 train, 04 validation, 06 test",
                          "uploader": CREATORS, "uploader_group": group, "grouping_unit": "physical machine/model ID, not uploader",
                          "physical_unit": f"id_{unit}", "machine_type": machine, "original_condition": state,
                          "original_labels": [machine, state], "snr_db": 0, "license": LICENSE,
                          "license_family": "CC BY-SA 4.0 (separate from FSD50K CC0/CC BY)",
                          "source_url": SOURCE_RECORD, "archive_url": archive.url, "archive_member": member["name"],
                          "archive_inventory_sha256": archive.expected["inventory_sha256"],
                          "published_archive_md5": archive.expected["published_md5"], "full_archive_md5_verified": False,
                          "archive_member_crc32": f"{member['crc32']:08x}", "archive_member_crc_verified": True,
                          "archive_member_size": member["size"], "attribution": CREATORS, "citation": CITATION,
                          "derivation": "First channel, first five seconds; resampled 16 kHz to 48 kHz without normalization."}
                if machine != "fan":
                    record["ood_categories"] = [f"MIMII_{machine}"]
                prepared, reason = _prepare_audio(raw, record, root)
                if reason:
                    exclusions[f"{machine}:id_{unit}:{reason}"] += 1
                    excluded_records.append({"clip_id": clip_id, "archive_member": member["name"],
                                             "split": split, "reason": reason, "original_sha256": _sha256(raw)})
                    continue
                hashes = {prepared[key] for key in ("sha256", "original_sha256", "pcm_sha256")}
                if hashes & seen:
                    exclusions[f"{machine}:id_{unit}:duplicate_audio"] += 1
                    excluded_records.append({"clip_id": clip_id, "archive_member": member["name"],
                                             "split": split, "reason": "duplicate_audio", "original_sha256": _sha256(raw)})
                    continue
                seen.update(hashes)
                own.append(prepared)
                if len(own) % 10 == 0:
                    print(f"MIMII {machine} id_{unit}: {len(own)}/{cap} accepted", flush=True)
            selected.extend(own)
            minimum = min(cap, 8 if split == "train" else 3)
            if len(own) < minimum:
                failures.append(f"{machine}/id_{unit}/{split}: {len(own)} < {minimum}")
            print(f"MIMII {machine} id_{unit}: {len(own)}/{cap} complete", flush=True)
    # Check actual independent grouping and all three audio fingerprints, without
    # using FSD's assertion that eval is an OFFICIAL source split.
    for key in ("clip_id", "uploader_group", "sha256", "original_sha256", "pcm_sha256"):
        owners = {}
        for record in selected:
            owner = owners.setdefault(record[key], record["split"])
            if owner != record["split"]:
                raise ValueError(f"MIMII cross-split {key} leakage")
    manifest = {"dataset": "MIMII public 1.0", "source_url": SOURCE_RECORD,
                "license": LICENSE, "citation": CITATION, "seed": seed,
                "full_archive_checksums_verified": False, "archives": inventories,
                "split_is_official": False, "grouping_unit": "physical machine/model ID",
                "shared_collection_background_independence_established": False,
                "selection_policy": "fixed hash-ranked normal/abnormal alternating candidates; at most twice each cap; quality only, no model scores",
                "caps": {"train_per_unit": max_train_per_unit, "val": max_val, "test": max_test, "unknown_per_machine_per_split": max_unknown_per_machine},
                "counts": dict(Counter(record["split"] for record in selected)),
                "exclusions": dict(exclusions), "excluded_records": excluded_records,
                "failures": failures, "records": selected}
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if failures:
        raise ValueError("Insufficient independent MIMII data: " + "; ".join(failures))
    return selected
