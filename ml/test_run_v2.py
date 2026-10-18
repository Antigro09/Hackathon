"""Synthetic runner contract checks; never score real held-out recordings."""

from contextlib import ExitStack, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

import numpy as np

from ml import run_v2 as runner


class FitCompletionTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        directory = self.stack.enter_context(tempfile.TemporaryDirectory())
        root = Path(directory)
        self.args = SimpleNamespace(output=root / "output", previous_run=root / "previous",
                                    seed=18042, data_source_commit=None)
        self.args.output.mkdir()
        self.args.previous_run.mkdir()
        runner.write_json(self.args.previous_run / "manifest.json", {"records": [{"uploader_group": "old-group"}]})
        runner.write_json(self.args.output / "data_provenance.json", {"source_commit": "data-source"})
        self.records = [
            {"clip_id": "synthetic-a", "label": "buzz", "split": "train", "uploader_group": "train-group",
             "sha256": "a" * 64, "pcm_sha256": "c" * 64},
            {"clip_id": "synthetic-b", "label": "speech", "split": "test", "uploader_group": "fresh-group",
             "sha256": "b" * 64, "pcm_sha256": "d" * 64},
        ]
        self.manifest = self.args.output / "manifest-v2.json"
        runner.write_json(self.manifest, {"validation_passed": True, "records": self.records})
        self.encoder = {"synthetic_encoder_contract": "fixed"}
        self.stack.enter_context(patch.object(runner, "encoder_contract", return_value=self.encoder))
        # Retain a real source hash while limiting the synthetic audit bundle.
        self.stack.enter_context(patch.object(runner, "SOURCE_FILES", ("ml/run_v2.py",)))
        self.versions = {name: "synthetic-1" for name in runner.PACKAGES}
        self.stack.enter_context(patch.object(runner.importlib.metadata, "version", side_effect=lambda name: self.versions[name]))
        self.python = self.stack.enter_context(patch.object(runner.platform, "python_version", return_value="3.10.99"))
        self.stack.enter_context(patch.object(runner.platform, "python_implementation", return_value="CPython"))
        self.platform = self.stack.enter_context(patch.object(runner.platform, "platform", return_value="original-platform"))
        self.commit = self.stack.enter_context(patch.object(runner, "source_commit", return_value="original-fit-source"))
        self.pip = self.stack.enter_context(patch.object(runner.subprocess, "check_output", return_value="original package freeze\n"))
        self.stack.enter_context(patch.object(runner, "_print_summary"))
        self.stack.enter_context(redirect_stdout(io.StringIO()))
        self.evaluator = self.stack.enter_context(patch("ml.experiment_v2.run_experiment_v2", side_effect=self.fake_fit))
        self.cache, self.key = runner._cache_path(self.args, self.manifest, self.encoder)
        self.X = np.zeros((2, 512), dtype=np.float32)
        self.X[0, 0] = self.X[1, 1] = 1
        runner._write_embedding_cache(self.cache, self.X, np.ones(2, dtype=bool), self.records, self.key)
        runner.write_json(self.args.output / "embedding_environment.json", {**self.key, "complete": True})

    @staticmethod
    def fake_fit(X, labels, splits, groups, results, **kwargs):
        # These bytes are a synthetic fixture, not a model or test prediction.
        results.mkdir(parents=True, exist_ok=True)
        evaluation = {"synthetic_fixture": True}
        runner.write_json(results / "evaluation_v2.json", evaluation)
        (results / "classifier_v2.joblib").write_bytes(b"synthetic classifier artifact")
        return evaluation

    def fit(self):
        return runner.fit_phase(self.args, self.manifest)

    def test_identical_completed_reuse_preserves_original_completion_environment_and_pip_freeze(self):
        first = self.fit()
        originals = {name: (self.args.output / name).read_bytes()
                     for name in ("run_environment.json", "pip-freeze.txt", "fit_input_contract.json")}
        self.commit.return_value = "later-unrelated-source-commit"
        self.platform.return_value = "later-platform"
        self.pip.return_value = "later package freeze\n"
        self.assertEqual(first, self.fit())
        self.assertEqual(self.evaluator.call_count, 1)
        self.assertEqual(self.pip.call_count, 1)
        for name, original in originals.items():
            self.assertEqual((self.args.output / name).read_bytes(), original)
        environment = runner.read_json(self.args.output / "run_environment.json")
        self.assertEqual(environment["source_commit"], "original-fit-source")
        self.assertEqual(environment["platform"], "original-platform")
        self.assertEqual(environment["fit_runtime"]["python"], "3.10.99")

    def test_completed_fit_rejects_changed_sklearn_joblib_or_python_without_reevaluation(self):
        self.fit()
        environment = (self.args.output / "run_environment.json").read_bytes()
        for package in ("scikit-learn", "joblib"):
            with self.subTest(package=package):
                self.versions[package] = "changed-version"
                with self.assertRaisesRegex(ValueError, "Fit inputs/protocol changed"):
                    self.fit()
                self.versions[package] = "synthetic-1"
        self.python.return_value = "3.11.99"
        with self.assertRaisesRegex(ValueError, "Fit inputs/protocol changed"):
            self.fit()
        self.assertEqual(self.evaluator.call_count, 1)
        self.assertEqual((self.args.output / "run_environment.json").read_bytes(), environment)

    def test_interrupted_fit_also_freezes_runtime_before_any_model_evaluation(self):
        self.evaluator.side_effect = RuntimeError("synthetic pre-fit interruption")
        with self.assertRaisesRegex(RuntimeError, "pre-fit interruption"):
            self.fit()
        frozen = runner.read_json(self.args.output / "fit_input_contract.json")
        self.assertEqual(frozen["fit_runtime"]["packages"]["joblib"], "synthetic-1")
        self.versions["joblib"] = "changed-after-interruption"
        with self.assertRaisesRegex(ValueError, "Fit inputs/protocol changed"):
            self.fit()
        self.assertEqual(self.evaluator.call_count, 1)

    def test_replaced_completion_artifacts_or_pip_freeze_are_not_silently_adopted(self):
        self.fit()
        for name in ("results/classifier_v2.joblib", "results/evaluation_v2.json", "pip-freeze.txt"):
            with self.subTest(name=name):
                path = self.args.output / name
                original = path.read_bytes()
                path.write_bytes(original + b" ")
                with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                    self.fit()
                path.write_bytes(original)
        self.assertEqual(self.evaluator.call_count, 1)

    def test_missing_original_completion_metadata_fails_without_test_reevaluation(self):
        self.fit()
        (self.args.output / "run_environment.json").unlink()
        with self.assertRaisesRegex(ValueError, "Incomplete saved fit"):
            self.fit()
        self.assertEqual(self.evaluator.call_count, 1)

    def test_saved_evaluation_without_input_contract_is_never_adopted(self):
        self.fake_fit(None, None, None, None, self.args.output / "results")
        with self.assertRaisesRegex(ValueError, "no frozen fit input contract"):
            self.fit()
        self.assertFalse((self.args.output / "fit_input_contract.json").exists())
        self.evaluator.assert_not_called()

    def test_zip_index_matches_all_payload_names_and_bytes_on_windows_and_posix(self):
        self.fit()
        with zipfile.ZipFile(self.args.output / "tonalwatch-v2-results.zip") as archive:
            index = json.loads(archive.read("artifact_index.json"))
            self.assertEqual(set(index), set(archive.namelist()) - {"artifact_index.json"})
            for name, metadata in index.items():
                self.assertNotIn("\\", name)
                content = archive.read(name)
                self.assertEqual(len(content), metadata["bytes"])
                self.assertEqual(runner.hashlib.sha256(content).hexdigest(), metadata["sha256"])
            self.assertNotIn(self.cache.name, archive.namelist())
            self.assertEqual(archive.read("run_environment.json"), (self.args.output / "run_environment.json").read_bytes())

    def test_embedding_cache_rejects_changed_manifest_contract_and_ordered_pcm_or_ids(self):
        for field in ("clip_id", "pcm_sha256"):
            records = [dict(record) for record in self.records]
            records.reverse()
            # Swap only the selected field, so each identity dimension is tested.
            changed = [{**original, field: reversed_record[field]} for original, reversed_record in zip(self.records, records)]
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "row order mismatch"):
                runner._load_embedding_cache(self.cache, changed, self.key)
        with self.assertRaisesRegex(ValueError, "contract mismatch"):
            runner._load_embedding_cache(self.cache, self.records, {**self.key, "manifest_sha256": "changed"})


if __name__ == "__main__":
    unittest.main()
