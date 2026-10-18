"""Synthetic reference integrity regressions; never reads field/final inputs."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from ml.browser import buildSelfTestV3Reference as builder

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ARCHIVE = ROOT / "ml/runs/2026-10-18-v3-startup-selftest"
REFERENCE = HERE / "fixtures/self-test-v3-reference.json"


class ReferenceIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        for directory in ("staged", "node", "chrome"):
            (self.base / directory).mkdir()
        # Generate only the two fixed software inputs; no stored audio required.
        subprocess.run(["node", str(HERE / "stageSelfTestV3.mjs"), "--output", str(self.base / "staged")],
                       check=True, capture_output=True, text=True)
        for directory in ("node", "chrome"):
            shutil.copyfile(ARCHIVE / directory / "embeddings.json", self.base / directory / "embeddings.json")

    def run_builder(self):
        return builder.build_reference(staged_manifest=self.base / "staged/manifest.json",
                                       source_manifest=self.base / "staged/synthetic-source.json",
                                       node_embeddings=self.base / "node/embeddings.json",
                                       chrome_embeddings=self.base / "chrome/embeddings.json",
                                       output=self.base / "reference.json")

    def mutate(self, filename, mutation):
        path = self.base / filename
        value = json.loads(path.read_bytes())
        mutation(value)
        path.write_text(json.dumps(value, indent=2), encoding="utf-8")

    def test_frozen_reference_reproduces_identical_bytes_and_preserves_existing_output(self):
        self.run_builder()
        self.assertEqual((self.base / "reference.json").read_bytes(), REFERENCE.read_bytes())
        self.run_builder()
        self.assertEqual(hashlib.sha256((self.base / "reference.json").read_bytes()).hexdigest(),
                         "6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d")

    def test_changed_single_browser_feature_repeat_fails_without_creating_reference(self):
        self.mutate("chrome/embeddings.json", lambda d: d["records"][0]["checkpoint"]["repeats"][1].update(featureSha256="0" * 64))
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            self.run_builder()
        self.assertFalse((self.base / "reference.json").exists())

    def test_changed_vector_fails_without_creating_reference(self):
        self.mutate("node/embeddings.json", lambda d: d["records"][0]["checkpoint"]["embedding"].__setitem__(0, 0))
        with self.assertRaisesRegex(ValueError, "vectors differ"):
            self.run_builder()
        self.assertFalse((self.base / "reference.json").exists())

    def test_changed_input_byte_fails_before_reference_output(self):
        path = next((self.base / "staged").glob("*.f32"))
        raw = bytearray(path.read_bytes()); raw[0] ^= 1; path.write_bytes(raw)
        with self.assertRaisesRegex(ValueError, "input bytes changed"):
            self.run_builder()
        self.assertFalse((self.base / "reference.json").exists())

    def test_reordered_or_missing_case_is_not_silently_accepted(self):
        for operation in (lambda d: d["records"].reverse(), lambda d: d["records"].pop()):
            shutil.copyfile(ARCHIVE / "chrome/embeddings.json", self.base / "chrome/embeddings.json")
            self.mutate("chrome/embeddings.json", operation)
            with self.assertRaises(ValueError):
                self.run_builder()
            self.assertFalse((self.base / "reference.json").exists())

    def test_changed_encoder_runtime_fails_even_if_contract_hash_is_rebound(self):
        def change(document):
            document["contract"]["runtimeHashes"]["ort-wasm-simd-threaded.wasm"]["sha256"] = "0" * 64
            document["contractSha256"] = hashlib.sha256(json.dumps(document["contract"], separators=(",", ":")).encode()).hexdigest()
        self.mutate("node/embeddings.json", change)
        with self.assertRaisesRegex(ValueError, "runtime bytes"):
            self.run_builder()
        self.assertFalse((self.base / "reference.json").exists())

    def test_existing_mismatched_reference_is_never_overwritten(self):
        path = self.base / "reference.json"
        path.write_bytes(b"preserve previous bytes\n")
        with self.assertRaisesRegex(ValueError, "Refusing changed reference"):
            self.run_builder()
        self.assertEqual(path.read_bytes(), b"preserve previous bytes\n")


if __name__ == "__main__":
    unittest.main()
