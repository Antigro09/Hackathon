"""Guard source licensing, crop policy, and split isolation without downloads."""

from pathlib import Path
import tempfile
import unittest

import numpy as np
import soundfile as sf

from ml.data import permitted_license, _prepare_clip, assert_disjoint


class DataTests(unittest.TestCase):
    def test_only_exact_cc0_and_attribution_licenses_are_allowed(self):
        for url in ["https://creativecommons.org/publicdomain/zero/1.0/", "http://creativecommons.org/licenses/by/3.0/", "https://creativecommons.org/licenses/by/4.0/"]:
            self.assertTrue(permitted_license(url))
        for url in ["https://creativecommons.org/licenses/by-nc/4.0/", "https://creativecommons.org/licenses/by-sa/4.0/", "https://creativecommons.org.attacker.example/licenses/by/4.0/", "https://example.org/licenses/by/4.0/"]:
            self.assertFalse(permitted_license(url))

    def test_crop_excludes_later_audio_and_preserves_gain(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            original = root / "cache/original/dev/123.wav"
            original.parent.mkdir(parents=True)
            rate = 44100
            first = 0.05 * np.sin(2 * np.pi * 63 * np.arange(5 * rate) / rate)
            later = 0.5 * np.sin(2 * np.pi * 1000 * np.arange(2 * rate) / rate)
            sf.write(original, np.concatenate([first, later]), rate, subtype="PCM_16")
            prepared, error = _prepare_clip({"clip_id": "123", "original_split": "dev"}, root)
            self.assertIsNone(error)
            samples, output_rate = sf.read(prepared["local_path"])
            self.assertEqual(output_rate, 48000)
            self.assertEqual(samples.shape, (240000,))
            self.assertFalse(prepared["gain_applied"])
            self.assertAlmostEqual(float(np.sqrt(np.mean(samples ** 2))), 0.05 / np.sqrt(2), delta=0.0001)

    def test_clipped_input_is_rejected_without_attenuation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            original = root / "cache/original/dev/123.wav"
            original.parent.mkdir(parents=True)
            samples = np.full(5 * 44100, 0.05)
            samples[100] = 1
            sf.write(original, samples, 44100, subtype="PCM_16")
            prepared, error = _prepare_clip({"clip_id": "123", "original_split": "dev"}, root)
            self.assertIsNone(prepared)
            self.assertEqual(error, "source_clipped")

    def test_uploader_or_content_leakage_is_rejected(self):
        first = {"clip_id": "1", "uploader_group": "recorder", "sha256": "a", "original_sha256": "b", "pcm_sha256": "e", "split": "train", "original_split": "dev"}
        second = {"clip_id": "2", "uploader_group": "recorder", "sha256": "c", "original_sha256": "d", "pcm_sha256": "f", "split": "test", "original_split": "eval"}
        with self.assertRaisesRegex(ValueError, "uploader_group leakage"):
            assert_disjoint([first, second])
        second["uploader_group"] = "different recorder"
        second["sha256"] = first["sha256"]
        with self.assertRaisesRegex(ValueError, "sha256 leakage"):
            assert_disjoint([first, second])


if __name__ == "__main__":
    unittest.main()
