"""Evaluate the immutable first classifier on v2's already frozen test cohort.

This never fits a model, selects a threshold, or modifies the v2 result. It is
not a comparison with the deployed app's eight-description zero-shot model.
Run only after v2 fitting has completed; both systems then use identical audio
embeddings and held-out labels, with their original frozen rejection rules.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from ml.data_v2 import assert_mixed_disjoint, fresh_test_record
from ml.experiment import _accept, _classification, _score_features, _wilson
from ml.run_v2 import (
    ROOT, _cache_path, _load_embedding_cache, encoder_contract, read_json,
    sha_file, write_json,
)

V1_MODEL_SHA256 = '36b280011b1864b12fd4341ca3d2ed5e6f49df0bdd794a7d3bbfc9eeb4328c82'


def evaluate_frozen(artifact: dict, X, labels, splits) -> dict:
    """Apply saved coefficients/centroids/gate, with no calibration path."""
    X = np.asarray(X, dtype=np.float64)
    classes = np.asarray(artifact['classOrder'])
    weights = np.asarray(artifact['weights'], dtype=np.float64)
    bias = np.asarray(artifact['bias'], dtype=np.float64)
    centroids = np.asarray(artifact['classCentroids'], dtype=np.float64)
    if (X.ndim != 2 or X.shape[1] != artifact['embeddingDimension']
            or weights.shape != (len(classes), X.shape[1])
            or centroids.shape != weights.shape or bias.shape != (len(classes),)
            or not all(np.isfinite(a).all() for a in (X, weights, bias, centroids))):
        raise ValueError('Invalid frozen classifier/embedding dimensions or values')
    norms = np.linalg.norm(X, axis=1)
    if not np.allclose(norms, 1, atol=2e-4, rtol=0):
        raise ValueError('Embeddings must be L2-normalized')
    X = X / norms[:, None]
    y, split = np.asarray(labels), np.asarray(splits)
    if y.shape != (len(X),) or split.shape != y.shape:
        raise ValueError('Labels/splits must align with embeddings')
    known, unknown = split == 'test', split == 'ood_test'
    if not known.any() or not unknown.any() or not set(y[known]).issubset(classes):
        raise ValueError('Need held-out known and unknown recordings in saved class order')
    if set(y[unknown]) & set(classes):
        raise ValueError('Unknown labels overlap known classes')
    predicted, margins, affinity = _score_features(X @ weights.T + bias, X, centroids)
    predictions = classes[predicted]
    accepted = _accept(margins, affinity, artifact['rejectionRule'])
    correct = predictions == y
    kept = known & accepted
    per_class = []
    for label in classes:
        true = known & (y == label)
        predicted_kept = kept & (predictions == label)
        per_class.append({
            'label': str(label),
            'coverage': _wilson(int(np.sum(true & accepted)), int(np.sum(true))),
            'correctTrueClassCoverage': _wilson(int(np.sum(true & accepted & correct)), int(np.sum(true))),
            'acceptedPredictedPrecision': _wilson(int(np.sum(predicted_kept & correct)), int(np.sum(predicted_kept))),
        })
    return {
        'classOrder': classes.tolist(), 'rejectionRule': artifact['rejectionRule'],
        'splits': {
            'test': {
                'ungated': _classification(y[known], predictions[known], classes),
                'acceptedOnly': _classification(y[kept], predictions[kept], classes),
                'coverage': _wilson(int(kept.sum()), int(known.sum())),
                'selectiveAccuracy': _wilson(int(np.sum(kept & correct)), int(kept.sum())),
                'correctAcceptedPerKnownClip': _wilson(int(np.sum(kept & correct)), int(known.sum())),
                'perClass': per_class,
            },
            'ood_test': {'falseAcceptance': _wilson(int(np.sum(unknown & accepted)), int(unknown.sum()))},
        },
    }


def compare(args) -> dict:
    artifact_path = args.previous_run / 'linear_probe.json'
    if sha_file(artifact_path) != V1_MODEL_SHA256:
        raise ValueError('Historical classifier differs from the immutable completed v1 artifact')
    result_path = args.output / 'results/evaluation_v2.json'
    if not result_path.exists() or not (args.output / 'run_environment.json').exists():
        raise ValueError('Complete and freeze v2 before evaluating the historical comparator')
    v2 = read_json(result_path)
    environment = read_json(args.output / 'run_environment.json')
    for name in ('results/evaluation_v2.json', 'results/classifier_v2.joblib'):
        path = args.output / name
        if not path.exists() or environment.get('fit_artifacts_sha256', {}).get(name) != sha_file(path):
            raise ValueError('Completed v2 evaluation/classifier checksum mismatch')
    artifact, manifest = read_json(artifact_path), read_json(args.output / 'manifest-v2.json')
    frozen = read_json(args.output / 'fit_input_contract.json')
    previous_manifest_path = args.previous_run / 'manifest.json'
    previous_digest = sha_file(previous_manifest_path)
    if any(value != previous_digest for value in (
            artifact['featureContract']['manifest'],
            manifest.get('previous_manifest_sha256'),
            frozen.get('previous_manifest_sha256'))):
        raise ValueError('Historical manifest identity differs from v1 or frozen v2 inputs')
    if artifact['classOrder'] != v2['classOrder'] or not manifest.get('validation_passed'):
        raise ValueError('Class order or manifest validation differs')
    assert_mixed_disjoint(manifest['records'])
    old = read_json(previous_manifest_path)['records']
    if any(not fresh_test_record(r, old) for r in manifest['records'] if r['split'] in {'test', 'ood_test'}):
        raise ValueError('Comparison cohort includes a previously exposed uploader or recording')
    contract = encoder_contract()
    feature = artifact['featureContract']
    if any(feature[key] != contract[key] for key in ('model_revision', 'weights', 'preprocessor', 'extractor_source')):
        raise ValueError('Historical and current encoder/preprocessing contracts differ')
    cache_path, key = _cache_path(args, args.output / 'manifest-v2.json', contract)
    X, completed = _load_embedding_cache(cache_path, manifest['records'], key)
    if environment.get('fit_input_contract_sha256') != sha_file(args.output / 'fit_input_contract.json'):
        raise ValueError('Completed v2 fit input contract checksum mismatch')
    scoring_source_sha256 = sha_file(ROOT / 'ml/experiment.py')
    if frozen.get('sources_sha256', {}).get('ml/experiment.py') != scoring_source_sha256:
        raise ValueError('Comparison scoring/metric helpers differ from the frozen source')
    if not completed.all() or frozen['embedding_cache_sha256'] != sha_file(cache_path) or frozen['manifest_sha256'] != key['manifest_sha256']:
        raise ValueError('Comparison must use the exact completed v2 audio/embedding inputs')
    previous = evaluate_frozen(artifact, X, [r['label'] for r in manifest['records']], [r['split'] for r in manifest['records']])
    comparison = {
        'historicalModelSha256': V1_MODEL_SHA256, 'v2EvaluationSha256': sha_file(result_path),
        'comparisonSourceSha256': sha_file(Path(__file__)),
        'scoringSourceSha256': scoring_source_sha256,
        'manifestSha256': key['manifest_sha256'], 'embeddingCacheSha256': sha_file(cache_path),
        'selectionOrCalibrationPerformed': False, 'promotionAllowed': False,
        'comparison': 'Frozen v1 classifier versus completed v2 classifier on identical fresh recordings and native embeddings; not the live eight-description app.',
        'frozenV1': previous,
        'v2': {'training': v2['training']['selectedModel'], 'splits': {s: v2['splits'][s] for s in ('test', 'ood_test')}},
        'limitations': [
            'Higher acceptance can trade precision for coverage; inspect every class and unknown false accepts.',
            'These source-tagged public recordings do not establish equipment identity or field accuracy.',
            'Corpus/pretraining overlap and machine/uploader sampling limit independence and generalization.',
            'No test-driven tuning or retesting of the fitted candidate is performed here.',
        ],
    }
    target = args.output / 'results/frozen_v1_comparison.json'
    if target.exists() and read_json(target) != comparison:
        raise ValueError('Existing frozen comparison differs; refusing to replace evidence')
    write_json(target, comparison)
    for name, system in (('Frozen v1', previous), ('V2', v2)):
        known = system['splits']['test']
        unknown = system['splits']['ood_test']['falseAcceptance']
        print(name, 'macroF1', known['ungated']['macroF1'],
              'accepted', known['coverage'], 'selective accuracy', known['selectiveAccuracy'],
              'unknown false accepts', unknown, flush=True)
    print('Saved immutable-cohort comparison:', target, flush=True)
    return comparison


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--previous-run', type=Path, default=ROOT / 'ml/runs/2026-10-18')
    args = parser.parse_args()
    args.output, args.previous_run = args.output.resolve(), args.previous_run.resolve()
    compare(args)


if __name__ == '__main__':
    main()
