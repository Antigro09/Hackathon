"""Independent arithmetic and gate checks for the frozen-model comparator."""
import copy
from contextlib import ExitStack, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import numpy as np

from ml import compare_frozen_v1 as comparator
from ml import run_v2 as runner
from ml.compare_frozen_v1 import evaluate_frozen


class FrozenComparisonTests(unittest.TestCase):
    def setUp(self):
        self.artifact = {
            'classOrder': ['a', 'b'], 'embeddingDimension': 2,
            'weights': [[2, 0], [0, 2]], 'bias': [0, 0],
            'classCentroids': [[1, 0], [0, 1]],
            'rejectionRule': {'abstainAll': False, 'minDecisionMargin': 1,
                              'minPredictedCentroidCosine': .9},
        }
        self.X = np.array([[1, 0], [0, 1], [.6, .8], [-1, 0], [1, 0]], dtype=float)
        self.labels = ['a', 'b', 'a', 'unknown', 'unknown']
        self.splits = ['test', 'test', 'test', 'ood_test', 'ood_test']

    def test_known_accuracy_coverage_and_unknown_counts(self):
        before = self.X.copy()
        original = copy.deepcopy(self.artifact)
        result = evaluate_frozen(self.artifact, self.X, self.labels, self.splits)
        known = result['splits']['test']
        self.assertAlmostEqual(known['ungated']['accuracy'], 2/3)
        self.assertEqual(known['coverage']['successes'], 2)
        self.assertEqual(known['selectiveAccuracy']['rate'], 1)
        self.assertEqual(result['splits']['ood_test']['falseAcceptance']['successes'], 1)
        self.assertEqual(known['perClass'][0]['correctTrueClassCoverage']['rate'], .5)
        np.testing.assert_array_equal(self.X, before)
        self.assertEqual(self.artifact, original)

    def test_saved_abstention_is_never_recalibrated(self):
        self.artifact['rejectionRule']['abstainAll'] = True
        result = evaluate_frozen(self.artifact, self.X, self.labels, self.splits)
        self.assertEqual(result['splits']['test']['coverage']['successes'], 0)
        self.assertIsNone(result['splits']['test']['selectiveAccuracy']['rate'])
        self.assertEqual(result['splits']['ood_test']['falseAcceptance']['successes'], 0)

    def test_bad_or_misaligned_inputs_are_rejected(self):
        with self.assertRaises(ValueError):
            evaluate_frozen(self.artifact, self.X * 2, self.labels, self.splits)
        with self.assertRaises(ValueError):
            evaluate_frozen(self.artifact, self.X, self.labels[:-1], self.splits)
        self.artifact['weights'][0][0] = float('nan')
        with self.assertRaises(ValueError):
            evaluate_frozen(self.artifact, self.X, self.labels, self.splits)


class FrozenComparisonCliTests(unittest.TestCase):
    """Run the CLI entry point against temporary synthetic completed artifacts."""

    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        directory = self.stack.enter_context(tempfile.TemporaryDirectory())
        self.args = SimpleNamespace(output=Path(directory) / 'v2', previous_run=Path(directory) / 'v1')
        self.args.output.mkdir()
        self.args.previous_run.mkdir()
        self.results = self.args.output / 'results'
        self.results.mkdir()
        self.previous_manifest = self.args.previous_run / 'manifest.json'
        runner.write_json(self.previous_manifest, {'records': [{
            'clip_id': 'synthetic-old', 'uploader_group': 'old-uploader',
            'sha256': '1' * 64, 'original_sha256': '2' * 64, 'pcm_sha256': '3' * 64}]})
        old_digest = runner.sha_file(self.previous_manifest)
        self.contract = {name: 'synthetic-' + name for name in ('model_revision', 'weights', 'preprocessor', 'extractor_source')}
        self.records = [{
            'clip_id': f'synthetic-{i}', 'uploader_group': f'fresh-uploader-{i}',
            'label': label, 'split': split, 'dataset': 'FSD50K', 'original_split': 'eval',
            'sha256': runner.digest_json(['prepared', i]),
            'original_sha256': runner.digest_json(['source', i]),
            'pcm_sha256': runner.digest_json(['pcm', i]),
        } for i, (label, split) in enumerate((('a', 'test'), ('b', 'test'), ('unknown', 'ood_test'), ('unknown', 'ood_test')))]
        self.manifest = self.args.output / 'manifest-v2.json'
        runner.write_json(self.manifest, {'validation_passed': True, 'previous_manifest_sha256': old_digest, 'records': self.records})
        self.X = np.zeros((4, 512), dtype=np.float32)
        self.X[0, 0] = self.X[1, 1] = self.X[2, 0] = self.X[3, 2] = 1
        weights = np.zeros((2, 512)); weights[0, 0] = weights[1, 1] = 2
        self.artifact = {
            'classOrder': ['a', 'b'], 'embeddingDimension': 512,
            'weights': weights.tolist(), 'bias': [0, 0], 'classCentroids': (weights / 2).tolist(),
            'rejectionRule': {'abstainAll': False, 'minDecisionMargin': 1, 'minPredictedCentroidCosine': .9},
            'featureContract': {**self.contract, 'manifest': old_digest},
        }
        artifact_path = self.args.previous_run / 'linear_probe.json'
        runner.write_json(artifact_path, self.artifact)
        self.stack.enter_context(patch.object(comparator, 'V1_MODEL_SHA256', runner.sha_file(artifact_path)))
        self.stack.enter_context(patch.object(comparator, 'encoder_contract', return_value=self.contract))
        self.evaluator = self.stack.enter_context(patch.object(comparator, 'evaluate_frozen', wraps=evaluate_frozen))
        self.stack.enter_context(redirect_stdout(io.StringIO()))
        self.cache, self.key = runner._cache_path(self.args, self.manifest, self.contract)
        runner._write_embedding_cache(self.cache, self.X, np.ones(4, dtype=bool), self.records, self.key)
        synthetic_evaluation = evaluate_frozen(self.artifact, self.X,
                                              [r['label'] for r in self.records], [r['split'] for r in self.records])
        synthetic_evaluation['training'] = {'selectedModel': {'kind': 'synthetic-fixed'}}
        runner.write_json(self.results / 'evaluation_v2.json', synthetic_evaluation)
        (self.results / 'classifier_v2.joblib').write_bytes(b'synthetic-completed-v2-classifier')
        self.freeze = self.args.output / 'fit_input_contract.json'
        runner.write_json(self.freeze, {
            **self.key, 'previous_manifest_sha256': old_digest,
            'embedding_cache_sha256': runner.sha_file(self.cache),
            'sources_sha256': {'ml/experiment.py': runner.sha_file(runner.ROOT / 'ml/experiment.py')},
        })
        self.environment = self.args.output / 'run_environment.json'
        runner.write_json(self.environment, {
            'fit_input_contract_sha256': runner.sha_file(self.freeze),
            'fit_artifacts_sha256': {name: runner.sha_file(self.args.output / name)
                                    for name in ('results/evaluation_v2.json', 'results/classifier_v2.joblib')},
        })
        self.target = self.results / 'frozen_v1_comparison.json'

    def cli(self):
        argv = ['compare_frozen_v1', '--output', str(self.args.output), '--previous-run', str(self.args.previous_run)]
        with patch('sys.argv', argv):
            comparator.main()

    def rewrite(self, path, update):
        value = runner.read_json(path)
        update(value)
        runner.write_json(path, value)

    def assert_rejected_without_overwrite(self, message):
        original = self.target.read_bytes() if self.target.exists() else None
        calls = self.evaluator.call_count
        with self.assertRaisesRegex(ValueError, message):
            self.cli()
        self.assertEqual(self.evaluator.call_count, calls)
        if original is None:
            self.assertFalse(self.target.exists())
        else:
            self.assertEqual(self.target.read_bytes(), original)

    def test_cli_uses_exact_completed_inputs_and_records_helper_source_without_retraining(self):
        self.cli()
        result = runner.read_json(self.target)
        self.assertFalse(result['selectionOrCalibrationPerformed'])
        self.assertFalse(result['promotionAllowed'])
        self.assertEqual(result['manifestSha256'], runner.sha_file(self.manifest))
        self.assertEqual(result['embeddingCacheSha256'], runner.sha_file(self.cache))
        self.assertEqual(result['scoringSourceSha256'], runner.sha_file(runner.ROOT / 'ml/experiment.py'))
        self.assertEqual(result['frozenV1']['splits']['test']['coverage']['successes'], 2)
        self.assertEqual(self.evaluator.call_count, 1)

    def test_cli_rejects_swapped_historical_manifest_before_predictions(self):
        self.cli()
        self.rewrite(self.previous_manifest, lambda value: value.update(unrelated_metadata='changed raw identity'))
        self.assert_rejected_without_overwrite('Historical manifest identity')

    def test_cli_rejects_each_declared_historical_manifest_binding(self):
        self.cli()
        for path in (self.manifest, self.freeze):
            with self.subTest(path=path.name):
                original = path.read_bytes()
                self.rewrite(path, lambda value: value.update(previous_manifest_sha256='changed'))
                self.assert_rejected_without_overwrite('Historical manifest identity')
                path.write_bytes(original)

    def test_cli_rejects_modified_evaluation_or_classifier_before_predictions(self):
        self.cli()
        for name in ('evaluation_v2.json', 'classifier_v2.joblib'):
            with self.subTest(name=name):
                path = self.results / name
                original = path.read_bytes()
                path.write_bytes(original + b' ')
                self.assert_rejected_without_overwrite('evaluation/classifier checksum')
                path.write_bytes(original)

    def test_cli_rejects_reordered_cache_identity_and_changed_embedding_bytes(self):
        self.cli()
        original = self.cache.read_bytes()
        reordered = [dict(record) for record in self.records]
        reordered[0]['clip_id'], reordered[1]['clip_id'] = reordered[1]['clip_id'], reordered[0]['clip_id']
        runner._write_embedding_cache(self.cache, self.X, np.ones(4, dtype=bool), reordered, self.key)
        self.assert_rejected_without_overwrite('row order mismatch')
        self.cache.write_bytes(original)
        changed = self.X.copy(); changed[[0, 1]] = changed[[1, 0]]
        runner._write_embedding_cache(self.cache, changed, np.ones(4, dtype=bool), self.records, self.key)
        self.assert_rejected_without_overwrite('exact completed v2 audio/embedding inputs')

    def test_cli_rejects_incomplete_embeddings_and_wrong_completion_contract(self):
        self.cli()
        original = self.cache.read_bytes()
        runner._write_embedding_cache(self.cache, self.X, np.array([True, True, True, False]), self.records, self.key)
        self.assert_rejected_without_overwrite('exact completed v2 audio/embedding inputs')
        self.cache.write_bytes(original)
        self.rewrite(self.environment, lambda value: value.update(fit_input_contract_sha256='changed'))
        self.assert_rejected_without_overwrite('fit input contract checksum')

    def test_cli_rejects_scoring_helpers_changed_after_fit(self):
        self.cli()
        self.rewrite(self.freeze, lambda value: value['sources_sha256'].update({'ml/experiment.py': 'changed'}))
        self.rewrite(self.environment, lambda value: value.update(fit_input_contract_sha256=runner.sha_file(self.freeze)))
        self.assert_rejected_without_overwrite('scoring/metric helpers')

    def test_cli_does_not_replace_existing_conflicting_comparison_evidence(self):
        runner.write_json(self.target, {'preserve_this_existing_evidence': True})
        original = self.target.read_bytes()
        with self.assertRaisesRegex(ValueError, 'refusing to replace evidence'):
            self.cli()
        self.assertEqual(self.target.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
