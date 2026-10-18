"""Synthetic orchestration fixtures only: no encoder or real-data predictions."""
from copy import deepcopy
from dataclasses import asdict
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from ml import run_v3 as runner
from ml.data_v3 import HistoricalSource, assemble_historical_v3
from ml.experiment_v3 import DEFAULT_CRITERIA, KNOWN_CLASSES, UNKNOWN, integer_head, _json_hash
from ml.test_canonical_v3 import make_batch, source, sha, compact, digest, ROOT
from ml.test_data_v3 import fixture, record


def write(path, value):
    # Canonical full-contract hashes intentionally follow JS insertion order.
    path.write_bytes((json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)+'\n').encode())
    return value


def bind_batch(batch, source_path):
    staged = json.loads(Path(batch.staged_manifest_path).read_bytes())
    staged['sourceManifestSha256'] = sha(source_path.read_bytes())
    write(Path(batch.staged_manifest_path), staged)
    data = json.loads(Path(batch.embeddings_path).read_bytes())
    data['contract']['manifestSha256'] = sha(Path(batch.staged_manifest_path).read_bytes())
    data['contractSha256'] = sha(compact(data['contract']))
    for row in data['records']:
        row['checkpoint']['contractSha256'] = data['contractSha256']
    write(Path(batch.embeddings_path), data)


def browser_reference(batch, path):
    data = json.loads(Path(batch.embeddings_path).read_bytes())
    c = data['contract']
    c['files'] = {}
    for name, value in c['runtimeHashes'].items():
        c['files']['/runtime/' + name if name.startswith('ort-wasm') else '/' + name] = value
    for route, key in [('/canonicalEncoder.mjs', 'encoderSourceSha256'), ('/app/resample.js', 'compiledResamplerSha256'),
                       ('/app/model.js', 'compiledModelSha256'), (f"/models/{c['revision']}/preprocessor_config.json", 'preprocessorSha256')]:
        c['files'][route] = {'sha256': c[key], 'bytes': 1}
    c['upstreamTransformersSha256'] = c['transformersBrowserBundleSha256']
    c['serverSourceSha256'] = sha((ROOT/'ml/browser/canonicalServer.mjs').read_bytes())
    for key in ['runtimeHashes', 'encoderSourceSha256', 'compiledResamplerSha256', 'compiledModelSha256', 'preprocessorSha256',
                'transformersBrowserBundleSha256', 'runnerSourceSha256', 'environment', 'modelConfigSourceSha256']:
        c.pop(key)
    data['contractSha256'] = sha(compact(c))
    for row in data['records']:
        row['checkpoint'].update(contractSha256=data['contractSha256'], browser={'userAgent': 'Synthetic Chrome/144.0',
            'platform': 'Synthetic', 'transformersVersion': '4.3.1', 'ortVersion': c['ortVersion']})
    write(path, data)


class RunnerV3Tests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.rows = fixture()
        self.rows[0]['session_id'] = 'old-recording-session'
        # Even excluded sources must remain in the final exclusion ledger.
        self.excluded = record(999, 'buzz', dataset='MIMII', source_url='https://example.invalid/mimii',
                               archive_member='fan.wav', license='https://creativecommons.org/licenses/by-sa/4.0/')
        self.nc = record(998, 'buzz', license='https://creativecommons.org/licenses/by-nc/4.0/')
        self.rows += [self.excluded, self.nc]
        self.final_rows = [record(10001+i, label) for i, label in enumerate((*KNOWN_CLASSES, 'unknown'))]
        self.reservations = {'formatVersion': 1, 'purpose': 'v3-final-reservations', 'seed': 18043,
            'groups': [r['uploader_group'] for r in self.final_rows], 'clip_ids': [r['clip_id'] for r in self.final_rows],
            'original_sha256': [r['original_sha256'] for r in self.final_rows], 'prepared_sha256': [r['sha256'] for r in self.final_rows],
            'pcm_sha256': [r['pcm_sha256'] for r in self.final_rows], 'collection_groups': ['ToBee:NU-Hive', 'ToBee:OSBH-citizen-science'], 'source_manifests': []}
        pins = []
        for name, rows in [('v1', self.rows), ('v2', deepcopy(self.rows[:10]))]:
            path = self.root/(name+'.json')
            write(path, {'records': rows})
            pins.append(HistoricalSource(name, path, sha(path.read_bytes())))
        reservation = self.root/'reservations.json'
        write(reservation, self.reservations)
        self.dev = assemble_historical_v3(self.root/'dev', reservation, sha(reservation.read_bytes()), sources=pins)
        self.addCleanup(patch.stopall)
        patch.object(runner, 'DEFAULT_PINNED_SOURCES', tuple(pins)).start()
        self.dev_document = json.loads(self.dev.read_bytes())
        self.batch = make_batch(self.root, 'dev-batch', self.dev_document['records'])
        bind_batch(self.batch, self.dev)
        self.final_source = self.root/'final-source.json'
        write(self.final_source, {'purpose': 'frozen-final-only', 'records': self.final_rows})
        self.final_batch = make_batch(self.root, 'final-batch', self.final_rows)
        bind_batch(self.final_batch, self.final_source)
        self.qualified = make_batch(self.root, 'qualified', [source('golden-'+str(i)) for i in range(26)])
        qdata = json.loads(Path(self.qualified.embeddings_path).read_bytes())
        self.comparison = self.root/'comparison.json'
        write(self.comparison, {'complete': True, 'allBitExact': True, 'promotionAllowed': False,
              'contractSha256': qdata['contractSha256'], 'cases': [{'clipId': r['clip_id'], 'pcmBitExact': True,
              'featuresBitExact': True, 'embeddingBitExact': True, 'embeddingMaxAbs': 0} for r in qdata['records']]})
        self.reference = self.root/'chrome-reference.json'
        browser_reference(self.qualified, self.reference)
        self.fit_dir = self.root/'fit'

    def fit(self, output=None):
        return runner.fit_v3(self.dev, self.batch.staged_manifest_path, self.batch.embeddings_path, self.comparison,
            self.qualified.embeddings_path, self.qualified.staged_manifest_path, self.reference, output or self.fit_dir,
            expected_development_sha256=sha(self.dev.read_bytes()), golden_reference_sha256=sha(self.reference.read_bytes()),
            frozen_final_source_sha256=sha(self.final_source.read_bytes()))

    def fake_fit(self, X, labels, roles, groups, output, **kwargs):
        destination = Path(output)
        evidence = json.loads((destination/'fit-input.json').read_bytes())
        self.assertEqual(evidence['phase'], 'fit')
        self.assertTrue((destination/'inputs/qualification/chrome-reference.json').exists())
        self.assertEqual(X.dtype, np.float32)
        manifest = [{'clipId': str(clip), 'role': str(role), 'label': str(label), 'group': str(group), 'dataset': str(dataset), 'pcmSha256': str(pcm)}
            for clip, role, label, group, dataset, pcm in zip(kwargs['clip_ids'], roles, labels, groups, kwargs['datasets'], kwargs['pcm_sha256'])]
        head = integer_head(np.zeros((6,512)), np.zeros(6), [*KNOWN_CLASSES, UNKNOWN])
        head['readinessCriteria'] = asdict(DEFAULT_CRITERIA)
        head['provenance'] = {'embeddingContract': kwargs['embedding_contract'], 'embeddingContractSha256': _json_hash(kwargs['embedding_contract']),
            'manifestSha256': _json_hash(manifest), 'frozenParametersAndRulesSha256': _json_hash(head),
            'sourceSha256': sha((ROOT/'ml/experiment_v3.py').read_bytes())}
        write(destination/'research_head_v3.json', head)
        write(destination/'development_manifest_v3.json', manifest)
        write(destination/'development_v3.json', {'promotionAllowed': False, 'provenance': head['provenance']})
        return {}

    def complete_fit(self):
        with patch.object(runner, 'fit_research_v3', side_effect=self.fake_fit) as call:
            self.fit()
            self.assertEqual(call.call_count, 1)

    def final(self, output=None, completion_pin=None):
        return runner.final_v3(self.fit_dir, self.final_source, self.final_batch.staged_manifest_path, self.final_batch.embeddings_path,
            self.comparison, self.qualified.embeddings_path, self.qualified.staged_manifest_path, self.reference, output or self.root/'final',
            fit_completion_sha256=completion_pin or sha((self.fit_dir/'fit-completion.json').read_bytes()),
            expected_final_sha256=sha(self.final_source.read_bytes()), golden_reference_sha256=sha(self.reference.read_bytes()))

    def test_fit_freezes_complete_evidence_before_single_call_and_never_overwrites(self):
        self.complete_fit()
        completion = json.loads((self.fit_dir/'fit-completion.json').read_bytes())
        self.assertFalse(completion['promotionAllowed'])
        for name, info in completion['artifacts'].items():
            raw = (self.fit_dir/name).read_bytes()
            self.assertEqual(sha(raw), info['sha256']); self.assertEqual(len(raw), info['bytes'])
        copied = self.fit_dir/'inputs/development/final-reservations.json'
        self.assertEqual(copied.read_bytes(), (self.dev.parent/'final-reservations.json').read_bytes())
        with patch.object(runner, 'fit_research_v3') as call, self.assertRaisesRegex(ValueError, 'immutable'):
            self.fit()
        call.assert_not_called()

    def test_failed_fit_preserves_evidence_and_cannot_resume(self):
        with patch.object(runner, 'fit_research_v3', side_effect=RuntimeError('synthetic failure')), self.assertRaises(RuntimeError):
            self.fit()
        self.assertTrue((self.fit_dir/'fit-failed.json').exists())
        self.assertFalse((self.fit_dir/'fit-completion.json').exists())
        with self.assertRaisesRegex(ValueError, 'immutable'): self.fit()

    def test_fit_source_pin_and_staged_full_record_order_are_required(self):
        staged_path = Path(self.batch.staged_manifest_path)
        original = staged_path.read_bytes()
        for change in ('source', 'row', 'subset', 'metadata'):
            staged = json.loads(original)
            if change == 'source': staged['sourceManifestSha256'] = digest('wrong source')
            if change == 'row': staged['records'].reverse()
            if change == 'subset': staged['records'].pop()
            if change == 'metadata': staged['records'][0]['source_record']['license'] = 'changed'
            write(staged_path, staged)
            with self.subTest(change=change), patch.object(runner, 'fit_research_v3') as call, self.assertRaises(ValueError): self.fit()
            call.assert_not_called(); self.assertFalse(self.fit_dir.exists())
        staged_path.write_bytes(original)
        with self.assertRaisesRegex(ValueError, 'SHA256'):
            runner.fit_v3(self.dev, self.batch.staged_manifest_path, self.batch.embeddings_path, self.comparison,
                self.qualified.embeddings_path, self.qualified.staged_manifest_path, self.reference, self.fit_dir,
                expected_development_sha256=digest('wrong'), golden_reference_sha256=sha(self.reference.read_bytes()), frozen_final_source_sha256=digest('final'))

    def test_fit_requires_exact_frozen_role_group_maps_and_historical_sidecars(self):
        original = self.dev.read_bytes()
        for which in ('roles', 'groups', 'exclusions'):
            d = json.loads(original)
            if which == 'roles': d['assignments']['roleByClipId'].pop(next(iter(d['assignments']['roleByClipId'])))
            if which == 'groups': d['assignments']['groupByClipId'][d['records'][0]['clip_id']] = 'other'
            if which == 'exclusions': d['sidecars'].pop('historical-exclusions.json')
            write(self.dev, d)
            with self.subTest(which=which), patch.object(runner, 'fit_research_v3') as call, self.assertRaises(ValueError): self.fit()
            call.assert_not_called(); self.assertFalse(self.fit_dir.exists())
        self.dev.write_bytes(original)

    def test_rebound_exclusion_sidecar_cannot_omit_filtered_historical_hash(self):
        path = self.dev.parent/'historical-exclusions.json'
        ledger = json.loads(path.read_bytes())
        ledger['all_hashes'].remove(self.excluded['original_sha256'])
        write(path, ledger)
        d = json.loads(self.dev.read_bytes()); d['sidecars']['historical-exclusions.json'] = sha(path.read_bytes()); write(self.dev, d)
        with patch.object(runner, 'fit_research_v3') as call, self.assertRaisesRegex(ValueError, 'exclusions'):
            self.fit()
        call.assert_not_called(); self.assertFalse(self.fit_dir.exists())

    def test_true_comparison_flags_do_not_hide_forged_feature_hash(self):
        path = Path(self.qualified.embeddings_path)
        data = json.loads(path.read_bytes())
        for repeat in data['records'][0]['checkpoint']['repeats']: repeat['featureSha256'] = digest('forged feature')
        write(path, data)
        with patch.object(runner, 'fit_research_v3') as call, self.assertRaisesRegex(ValueError, 'Recomputed'):
            self.fit()
        call.assert_not_called(); self.assertFalse(self.fit_dir.exists())

    def test_qualification_requires_complete_cases_repeats_and_exact_contract(self):
        raw = self.comparison.read_bytes()
        for kind in ('missing', 'reordered', 'boolean', 'contract'):
            value = json.loads(raw)
            if kind == 'missing': value['cases'].pop()
            if kind == 'reordered': value['cases'].reverse()
            if kind == 'boolean': value['cases'][0]['embeddingBitExact'] = 1
            if kind == 'contract': value['contractSha256'] = digest('other')
            write(self.comparison, value)
            with self.subTest(kind=kind), patch.object(runner, 'fit_research_v3') as call, self.assertRaises(ValueError): self.fit()
            call.assert_not_called(); self.assertFalse(self.fit_dir.exists())
        self.comparison.write_bytes(raw)
        path = Path(self.qualified.embeddings_path)
        data = json.loads(path.read_bytes()); data['records'][0]['checkpoint']['repeats'].pop(); write(path, data)
        with self.assertRaisesRegex(ValueError, 'repeats'): self.fit()

    def test_qualification_phase_node_environment_and_stable_fingerprint_must_match(self):
        path = Path(self.batch.embeddings_path)
        raw = path.read_bytes()
        for field in ('platform', 'node', 'v8', 'architecture', 'compiledModelSha256'):
            data = json.loads(raw)
            if field == 'compiledModelSha256': data['contract'][field] = digest('different')
            else: data['contract']['environment'][field] = 'different'
            data['contractSha256'] = sha(compact(data['contract']))
            for row in data['records']: row['checkpoint']['contractSha256'] = data['contractSha256']
            write(path, data)
            with self.subTest(field=field), patch.object(runner, 'fit_research_v3') as call, self.assertRaisesRegex(ValueError, 'fingerprint|qualified local runtime'): self.fit()
            call.assert_not_called(); self.assertFalse(self.fit_dir.exists())
        path.write_bytes(raw)

    def test_final_uses_frozen_synthetic_head_once_and_binds_all_results(self):
        self.complete_fit()
        # Real integer audit on SYNTHETIC unit-vector features, zero weights.
        # This tests orchestration with the actual frozen scorer, no real audio.
        with patch.object(runner, 'audit_frozen_v3', wraps=runner.audit_frozen_v3) as call:
            self.final()
            self.assertEqual(call.call_count, 1)
        result = json.loads((self.root/'final/final-audit.json').read_bytes())
        self.assertTrue(result['freshTestEvaluated']); self.assertFalse(result['promotionAllowed'])
        self.assertFalse(result['freshFinalAuditPassed'])
        with patch.object(runner, 'audit_frozen_v3') as call, self.assertRaises(FileExistsError):
            self.final(self.root/'second-final')
        call.assert_not_called(); self.assertFalse((self.root/'second-final').exists())

    def test_final_refuses_altered_fit_artifact_or_completion_pin_before_audit(self):
        self.complete_fit()
        with patch.object(runner, 'audit_frozen_v3') as call, self.assertRaisesRegex(ValueError, 'SHA256'):
            self.final(completion_pin=digest('wrong'))
        call.assert_not_called()
        path = self.fit_dir/'research_head_v3.json'; path.write_bytes(path.read_bytes()+b' ')
        with patch.object(runner, 'audit_frozen_v3') as call, self.assertRaisesRegex(ValueError, 'artifact bytes'):
            self.final()
        call.assert_not_called(); self.assertFalse((self.fit_dir/'final-audit-claim.json').exists())

    def test_final_cohort_cannot_change_after_fit(self):
        self.complete_fit()
        value = json.loads(self.final_source.read_bytes()); value['records'].reverse(); write(self.final_source, value)
        with patch.object(runner, 'audit_frozen_v3') as call, self.assertRaisesRegex(ValueError, 'pre-fit freeze'):
            self.final()
        call.assert_not_called(); self.assertFalse((self.root/'final').exists())

    def test_final_excludes_every_historical_identity_and_cross_kind_hash_including_filtered_sources(self):
        _, _, ledger = runner._development_bundle(self.dev, sha(self.dev.read_bytes()))
        for change in ({'clip_id': self.excluded['clip_id']}, {'sha256': self.excluded['original_sha256']},
                       {'original_sha256': self.nc['pcm_sha256']}, {'uploader': self.excluded['uploader']},
                       {'session_id': 'OLD-RECORDING-SESSION'}, {'v3_group': self.dev_document['records'][0]['v3_group']}):
            rows = deepcopy(self.final_rows); rows[0].update(change)
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'ALL historical'):
                runner._freshness(rows, self.dev_document, ledger)

    def test_final_requires_prefit_reservations_for_each_record(self):
        _, _, ledger = runner._development_bundle(self.dev, sha(self.dev.read_bytes()))
        rows = deepcopy(self.final_rows); rows[0]['original_sha256'] = digest('unreserved')
        with self.assertRaisesRegex(ValueError, 'pre-fit reservations'):
            runner._freshness(rows, self.dev_document, ledger)

    def test_failed_final_consumes_one_attempt_and_preserves_evidence(self):
        self.complete_fit()
        with patch.object(runner, 'audit_frozen_v3', side_effect=RuntimeError('synthetic failure')) as call, self.assertRaises(RuntimeError):
            self.final()
        self.assertEqual(call.call_count, 1)
        self.assertTrue((self.root/'final/final-input.json').exists()); self.assertTrue((self.root/'final/final-failed.json').exists())
        self.assertTrue((self.fit_dir/'final-audit-claim.json').exists())
        with patch.object(runner, 'audit_frozen_v3') as call, self.assertRaises(FileExistsError):
            self.final(self.root/'retry-final')
        call.assert_not_called()

    def test_final_staging_cannot_subselect_or_reorder_complete_source(self):
        self.complete_fit()
        path = Path(self.final_batch.staged_manifest_path)
        value = json.loads(path.read_bytes()); value['records'].pop(); write(path, value)
        with patch.object(runner, 'audit_frozen_v3') as call, self.assertRaisesRegex(ValueError, 'complete source'):
            self.final()
        call.assert_not_called(); self.assertFalse((self.fit_dir/'final-audit-claim.json').exists())


if __name__ == '__main__':
    unittest.main()
