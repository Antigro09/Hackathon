"""Independent arithmetic and gate checks for the frozen-model comparator."""
import copy
import unittest
import numpy as np

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


if __name__ == '__main__':
    unittest.main()
