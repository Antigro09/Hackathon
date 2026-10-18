"""Safety and split/preprocessing tests; no network or model predictions."""

import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import zlib

import numpy as np
import soundfile as sf

from ml import mimii


def source_wav(frequency=125, clipped=False):
    rate = 16000
    samples = np.zeros((160000, 8), dtype=np.float32)
    samples[:80000, 0] = 0.05 * np.sin(2 * np.pi * frequency * np.arange(80000) / rate)
    # Other channels and the second five seconds must not contaminate the crop.
    samples[:, 1] = 1
    samples[80000:, 0] = 0.8
    if clipped:
        samples[100, 0] = 1
    buffer = io.BytesIO()
    sf.write(buffer, samples, rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


class Response(io.BytesIO):
    def __init__(self, raw, status=206, headers=None):
        super().__init__(raw)
        self.status = status
        self.headers = {"Content-Range": "bytes 10-13/100", "Content-Length": "4", **(headers or {})}


class MimiiTests(unittest.TestCase):
    def test_range_checks_exact_status_range_length_and_body(self):
        with patch.object(mimii, "urlopen", return_value=Response(b"abcd")):
            self.assertEqual(mimii._read_range("https://example.org/archive.zip", 10, 13, 100), b"abcd")
        for response in [Response(b"abcd", status=200),
                         Response(b"abcd", headers={"Content-Range": "bytes 10-13/101"}),
                         Response(b"abcd", headers={"Content-Length": "5"}),
                         Response(b"abc"), Response(b"abcde"),
                         Response(b"abcd", headers={"Content-Encoding": "gzip"})]:
            with patch.object(mimii, "urlopen", return_value=response), self.assertRaises(ValueError):
                mimii._read_range("https://example.org/archive.zip", 10, 13, 100)

    def test_range_limits_prevent_full_archive_download(self):
        with patch.object(mimii, "urlopen") as request:
            for start, end, size in [(0, 99, 50), (-1, 1, 10), (0, mimii.MAX_RANGE_BYTES, 10**10)]:
                with self.assertRaises(ValueError):
                    mimii._read_range("https://example.org/archive.zip", start, end, size)
            request.assert_not_called()

    def test_zip_local_header_and_crc_are_verified(self):
        for compression in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", compression=compression) as archive:
                archive.writestr("fan/id_00/normal/00000000.wav", b"test WAV payload" * 100)
            raw = buffer.getvalue()
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                member = mimii._inventory(archive.infolist())[0]
            self.assertEqual(mimii._decode_member(raw, member), b"test WAV payload" * 100)
            with self.assertRaisesRegex(ValueError, "CRC"):
                mimii._decode_member(raw, {**member, "crc32": member["crc32"] ^ 1})
            with self.assertRaisesRegex(ValueError, "filename"):
                mimii._decode_member(raw, {**member, "name": "fan/id_02/normal/00000000.wav"})
            if compression == zipfile.ZIP_STORED:
                corrupted = bytearray(raw)
                corrupted[30 + len(member["name"].encode()) + 3] ^= 1
                with self.assertRaisesRegex(ValueError, "integrity"):
                    mimii._decode_member(bytes(corrupted), member)

    def test_cached_inventory_must_match_pinned_digest(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "0_dB_fan.inventory.json").write_text("[]", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "inventory mismatch"):
                mimii.RemoteArchive("fan", Path(folder))

    def test_first_channel_first_five_seconds_and_gain_are_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            raw = source_wav()
            prepared, reason = mimii._prepare_audio(raw, {"clip_id": "test"}, Path(folder))
            self.assertIsNone(reason)
            pcm, rate = sf.read(prepared["local_path"])
            self.assertEqual(rate, 48000)
            self.assertEqual(pcm.shape, (240000,))
            self.assertFalse(prepared["gain_applied"])
            self.assertEqual(prepared["channel"], 0)
            self.assertAlmostEqual(np.sqrt(np.mean(pcm**2)), 0.05 / np.sqrt(2), delta=0.0001)
            again, _ = mimii._prepare_audio(raw, {"clip_id": "test"}, Path(folder))
            self.assertEqual(prepared["sha256"], again["sha256"])
            self.assertEqual(prepared["pcm_sha256"], again["pcm_sha256"])

    def test_clipped_first_channel_is_not_attenuated_to_pass(self):
        with tempfile.TemporaryDirectory() as folder:
            prepared, reason = mimii._prepare_audio(source_wav(clipped=True), {"clip_id": "test"}, Path(folder))
            self.assertIsNone(prepared)
            self.assertEqual(reason, "source_clipped")

    def test_selection_separates_physical_units_and_unknown_controls(self):
        class FakeArchive:
            def __init__(self, machine, cache):
                self.machine, self.expected, self.url = machine, mimii.ARCHIVES[machine], "https://example.org/archive.zip"
                self.members = {}
                for unit in ("00", "02", "04", "06"):
                    name = f"{machine}/id_{unit}/normal/00000000.wav"
                    frequency = 100 + (int(unit) * 30) + ["fan", "pump", "valve", "slider"].index(machine)
                    raw = source_wav(frequency)
                    self.members[name] = {"name": name, "size": len(raw), "crc32": zlib.crc32(raw), "fixture": raw}

            def read_member(self, member):
                return member["fixture"]

        with tempfile.TemporaryDirectory() as folder, patch.object(mimii, "RemoteArchive", FakeArchive):
            records = mimii.prepare_mimii_fans(folder, max_train_per_unit=1, max_val=1, max_test=1, max_unknown_per_machine=1)
            self.assertEqual(len(records), 10)
            owners = {}
            for record in records:
                self.assertEqual(record["dataset"], "MIMII")
                self.assertEqual(record["original_split"], "0_dB")
                self.assertEqual(record["license"], mimii.LICENSE)
                self.assertFalse(record["original_split_is_official"])
                self.assertTrue(record["archive_member_crc_verified"])
                group = record["uploader_group"]
                self.assertEqual(owners.setdefault(group, record["split"]), record["split"])
                if record["machine_type"] == "fan":
                    self.assertEqual(record["label"], "mechanical_fan")
                    self.assertEqual(record["split"], mimii.UNIT_SPLITS[record["physical_unit"][-2:]])
                else:
                    self.assertEqual(record["label"], "unknown")
                    self.assertIn(record["split"], {"ood_val", "ood_test"})
            manifest = json.loads(Path(folder, "manifest.json").read_text(encoding="utf-8"))
            self.assertFalse(manifest["split_is_official"])
            self.assertFalse(manifest["full_archive_checksums_verified"])

    def test_normal_and_abnormal_candidates_are_balanced_without_model_scores(self):
        members = [{"name": f"fan/id_00/{state}/{index:08d}.wav"} for state in ("normal", "abnormal") for index in range(5)]
        first = mimii._candidate_order(members, 18042)
        self.assertEqual(first, mimii._candidate_order(list(reversed(members)), 18042))
        self.assertEqual([item["name"].split("/")[2] for item in first[:4]], ["abnormal", "normal", "abnormal", "normal"])


if __name__ == "__main__":
    unittest.main()
