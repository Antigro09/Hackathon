"""IVBEE source integrity, no-padding crop policy, and whole-collection holdout."""

from contextlib import ExitStack
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import numpy as np
import soundfile as sf

from ml import buzz


def wave(seconds=6, frequency=125, clipped=False, subtype="PCM_16"):
    rate = 48000
    samples = (0.05 * np.sin(2 * np.pi * frequency * np.arange(seconds * rate) / rate)).astype(np.float32)
    if seconds > 5:
        samples[5 * rate:] = 1
    if clipped:
        samples[100] = 1
    target = io.BytesIO()
    sf.write(target, samples, rate, format="WAV", subtype=subtype)
    return target.getvalue()


class BuzzTests(unittest.TestCase):
    def test_first_five_seconds_preserve_gain_and_ignore_later_clipping(self):
        with tempfile.TemporaryDirectory() as folder:
            prepared, reason = buzz._prepare_wav(wave(), {"clip_id": "fixture"}, Path(folder))
            self.assertIsNone(reason)
            samples, rate = sf.read(prepared["local_path"])
            self.assertEqual(rate, 48000)
            self.assertEqual(samples.shape, (240000,))
            self.assertEqual(prepared["original_subtype"], "PCM_16")
            self.assertFalse(prepared["gain_applied"])
            self.assertAlmostEqual(float(np.sqrt(np.mean(samples**2))), 0.05 / np.sqrt(2), delta=0.0001)

    def test_short_events_are_never_padded_or_stitched(self):
        with tempfile.TemporaryDirectory() as folder:
            prepared, reason = buzz._prepare_wav(wave(seconds=4), {"clip_id": "fixture"}, Path(folder))
            self.assertIsNone(prepared)
            self.assertEqual(reason, "shorter_than_five_seconds")
            self.assertFalse((Path(folder) / "audio").exists())

    def test_clipping_is_rejected_without_gain_repair(self):
        with tempfile.TemporaryDirectory() as folder:
            prepared, reason = buzz._prepare_wav(wave(clipped=True), {"clip_id": "fixture"}, Path(folder))
            self.assertIsNone(prepared)
            self.assertEqual(reason, "source_clipped")

    def test_actual_pcm16_contract_does_not_follow_incorrect_24bit_description(self):
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ValueError, "source format"):
            buzz._prepare_wav(wave(subtype="PCM_24"), {"clip_id": "fixture"}, Path(folder))

    def fixture(self, root):
        payloads = {
            "stable buzz drone/1/Buzz-01.wav": wave(frequency=125),
            "stable buzz worker/2/Buzz-01.wav": wave(frequency=250),
            "variable buzz worker/2/Buzz_variable-01.wav": wave(frequency=375),
            "stable buzz worker/4/Buzz-01.wav": wave(frequency=500),
            "stable buzz worker/5/Buzz-01.wav": wave(seconds=4, frequency=625),
        }
        target = io.BytesIO()
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, raw in payloads.items():
                archive.writestr(name, raw)
        archive_bytes = target.getvalue()
        cached = root / "cache/IVBEE-1.0.zip"
        cached.parent.mkdir(parents=True)
        cached.write_bytes(archive_bytes)
        previous = root / "previous.json"
        previous.write_text('{"records": []}', encoding="utf-8")
        patches = {"ARCHIVE_BYTES": len(archive_bytes), "ARCHIVE_MD5": hashlib.md5(archive_bytes).hexdigest(),
                   "ARCHIVE_SHA256": hashlib.sha256(archive_bytes).hexdigest(), "EXPECTED_WAVS": len(payloads)}
        return previous, patches, payloads

    def test_all_eligible_events_are_test_only_with_specimen_grouping_and_attribution(self):
        with tempfile.TemporaryDirectory() as folder, ExitStack() as context:
            root = Path(folder)
            previous, patches, _ = self.fixture(root)
            for key, value in patches.items():
                context.enter_context(patch.object(buzz, key, value))
            context.enter_context(patch.object(buzz, "urlopen", side_effect=AssertionError("cache should be reused")))
            records = buzz.prepare_buzz(root, previous)
            self.assertEqual(len(records), 4)
            self.assertEqual({r["split"] for r in records}, {"test"})
            self.assertEqual({r["label"] for r in records}, {"buzz"})
            self.assertEqual(len({r["uploader_group"] for r in records}), 3)
            workers = [r for r in records if r["specimen_id"] == "2"]
            self.assertEqual(len({r["uploader_group"] for r in workers}), 1)
            for record in records:
                self.assertEqual(record["license"], buzz.LICENSE)
                self.assertEqual(record["collection_group"], "IVBEE:single-laboratory-collection")
                self.assertFalse(record["original_split_is_official"])
                self.assertTrue(record["full_archive_md5_verified"])
                self.assertTrue(record["archive_member_crc_verified"])
            repeated = buzz.prepare_buzz(root, previous)
            self.assertEqual([r["sha256"] for r in records], [r["sha256"] for r in repeated])
            manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["counts"]["excluded"]["shorter_than_five_seconds"], 1)
            self.assertEqual(manifest["counts"]["shared_laboratory_collections"], 1)

    def test_previous_audio_fingerprint_cannot_be_reused_as_new_test(self):
        with tempfile.TemporaryDirectory() as folder, ExitStack() as context:
            root = Path(folder)
            previous, patches, payloads = self.fixture(root)
            old = {"clip_id": "old", "uploader_group": "old-uploader", "sha256": "a" * 64,
                   "pcm_sha256": "b" * 64, "original_sha256": hashlib.sha256(next(iter(payloads.values()))).hexdigest()}
            previous.write_text(json.dumps({"records": [old]}), encoding="utf-8")
            for key, value in patches.items():
                context.enter_context(patch.object(buzz, key, value))
            with self.assertRaisesRegex(ValueError, "overlaps"):
                buzz.prepare_buzz(root, previous)

    def test_corrupt_cached_source_archive_fails_both_checksum_contracts(self):
        with tempfile.TemporaryDirectory() as folder, ExitStack() as context:
            root = Path(folder)
            _, patches, _ = self.fixture(root)
            for key, value in patches.items():
                context.enter_context(patch.object(buzz, key, value))
            path = root / "cache/IVBEE-1.0.zip"
            raw = bytearray(path.read_bytes())
            raw[100] ^= 1
            path.write_bytes(raw)
            with self.assertRaisesRegex(ValueError, "MD5/SHA256"):
                buzz._archive_bytes(root)


if __name__ == "__main__":
    unittest.main()
