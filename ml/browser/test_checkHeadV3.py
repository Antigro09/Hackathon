"""Fictitious axis heads and synthetic vectors only; no actual candidate scoring."""
from copy import deepcopy
from dataclasses import asdict
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import numpy as np

from ml.browser.checkHeadV3 import PINS, ParityInput, ROOT, _bytes, _sha, check_head_v3
from ml.canonical_v3 import derive_embedding_contract
from ml.experiment_v3 import (DEFAULT_CRITERIA, INPUT_SCALE, KNOWN_CLASSES, UNKNOWN,
    _json_hash, integer_head, predict_fixed_v3)
from ml.test_canonical_v3 import make_batch, source, compact, sha, digest


def write(path, value):
    path.write_bytes(_bytes(value))


class HeadV3ParityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        reference = json.loads((ROOT/'ml/browser/fixtures/self-test-v3-reference.json').read_bytes())
        self.embedding_contract = reference['embeddingContract']
        self.startup = ROOT/'ml/browser/fixtures/self-test-v3-reference.json'
        self.vectors = np.zeros((5,512), np.float32)
        self.vectors[0,0] = 1  # known accepted at exact gate equality
        self.vectors[1,5] = 1  # explicit unknown winner
        self.vectors[2,6] = 1  # tied scores; first class, guard rejects
        self.vectors[3,:6] = [.5/INPUT_SCALE,-.5/INPUT_SCALE,1.5/INPUT_SCALE,-1.5/INPUT_SCALE,2.5/INPUT_SCALE,-2.5/INPUT_SCALE]
        self.vectors[3,6] = 1  # positive/negative half ties, no renormalization
        self.vectors[4,2] = 1  # explicitly closed speech gate
        labels = ['buzz','unknown','speech','wind','speech']
        sources = [source('synthetic-'+str(i), label=label, split='unknown_train' if label=='unknown' else 'train',
                    role='unknown_train' if label=='unknown' else 'train', historical_development_only=True,
                    v3_group='v3-lineage:'+digest(str(i))) for i,label in enumerate(labels)]
        def metadata(contract):
            preprocessing = self.embedding_contract['preprocessingContract']
            contract['compiledResamplerSha256'] = preprocessing['compiledResamplerSha256']
            contract['compiledModelSha256'] = preprocessing['compiledModelSha256']
        self.batch = make_batch(self.root, 'canonical', sources, metadata)
        path = Path(self.batch.embeddings_path)
        document = json.loads(path.read_bytes())
        for index,row in enumerate(document['records']):
            row['checkpoint']['embedding'] = self.vectors[index].tolist()
            for repeat in row['checkpoint']['repeats']:
                repeat['embeddingSha256'] = sha(self.vectors[index].astype('<f4').tobytes())
        # Do not sort contract keys: full job SHA follows JS insertion order.
        path.write_bytes((json.dumps(document,indent=2)+'\n').encode())
        self.assertEqual(derive_embedding_contract(document['contract']), self.embedding_contract)
        weights = np.zeros((6,512)); weights[:,:6] = np.eye(6)
        head = integer_head(weights,np.zeros(6),[*KNOWN_CLASSES,UNKNOWN])
        head['rejectionRules'] = {label:{'abstainAll':False,'minGuardedMargin':0} for label in KNOWN_CLASSES}
        head['rejectionRules']['speech'] = {'abstainAll':True,'minGuardedMargin':None}
        margin = int(predict_fixed_v3(head,self.vectors[:1])['guardedMargin'][0])
        head['rejectionRules']['buzz']['minGuardedMargin'] = margin
        head['readinessCriteria'] = asdict(DEFAULT_CRITERIA)
        manifest = [{'clipId': r['clip_id'],'role':r['source_record']['role'],'label':r['label'],
            'group':r['source_record']['v3_group'],'dataset':r['source_record']['dataset'],'pcmSha256':r['pcm_sha256']}for r in document['records']]
        head['provenance'] = {'sourceSha256':PINS['pythonScorerSha256'],'embeddingContract':self.embedding_contract,
            'embeddingContractSha256':_json_hash(self.embedding_contract),'manifestSha256':_json_hash(manifest),
            'frozenParametersAndRulesSha256':_json_hash(head)}
        self.head = self.root/'head.json'; write(self.head,head)
        self.output = self.root/'parity'

    def inputs(self):
        return [ParityInput(self.batch.embeddings_path,sha(Path(self.batch.embeddings_path).read_bytes()),
                            self.batch.staged_manifest_path,sha(Path(self.batch.staged_manifest_path).read_bytes())),
                ParityInput(self.startup,sha(self.startup.read_bytes()))]

    def run_check(self,inputs=None):
        return check_head_v3(self.head,sha(self.head.read_bytes()),inputs or self.inputs(),self.output)

    def node_check(self,expected_path,output,dependencies=ROOT):
        return subprocess.run(['node',str(ROOT/'ml/browser/checkHeadV3.mjs'),'--expected',str(expected_path),
            '--expected-sha256',sha(expected_path.read_bytes()),'--head',str(self.output/'head.json'),
            '--output',str(output),'--dependencies',str(dependencies)],capture_output=True,text=True)

    def rewrite_canonical(self,mutation):
        staged_path = Path(self.batch.staged_manifest_path)
        staged = json.loads(staged_path.read_bytes())
        document = json.loads(Path(self.batch.embeddings_path).read_bytes())
        mutation(staged,document)
        staged_path.write_bytes((json.dumps(staged,indent=2)+'\n').encode())
        document['contract']['manifestSha256'] = sha(staged_path.read_bytes())
        document['contractSha256'] = sha(compact(document['contract']))
        for row in document['records']:row['checkpoint']['contractSha256']=document['contractSha256']
        Path(self.batch.embeddings_path).write_bytes((json.dumps(document,indent=2)+'\n').encode())

    def test_complete_development_and_startup_compare_every_integer_bit_and_pin_all_artifacts(self):
        self.run_check()
        report = json.loads((self.output/'javascript/parity.json').read_bytes())
        self.assertTrue(report['passed']); self.assertEqual(report['cases'],7)
        self.assertEqual(report['maximumIntegerScoreError'],0);self.assertEqual(report['maximumGuardedMarginError'],0)
        self.assertFalse(report['promotionAllowed']);self.assertFalse(report['accuracyEvaluated'])
        self.assertTrue(report['rows'][0]['accepted']);self.assertFalse(report['rows'][1]['accepted'])
        self.assertEqual(report['rows'][1]['label'],'__unknown__');self.assertEqual(report['rows'][2]['classIndex'],0)
        self.assertFalse(report['rows'][2]['accepted']);self.assertFalse(report['rows'][4]['accepted'])
        expected = json.loads((self.output/'python-reference.json').read_bytes())
        self.assertEqual(expected['rows'][3]['expectedQuantized'][:6],[1,-1,2,-2,3,-3])
        completion = json.loads((self.output/'completion.json').read_bytes())
        for name,info in completion['artifacts'].items():
            raw=(self.output/name).read_bytes();self.assertEqual(sha(raw),info['sha256']);self.assertEqual(len(raw),info['bytes'])
        with self.assertRaisesRegex(ValueError,'immutable'):self.run_check()

    def test_raw_head_pin_and_frozen_parameters_cannot_be_swapped(self):
        with self.assertRaisesRegex(ValueError,'SHA256'):
            check_head_v3(self.head,digest('wrong'),self.inputs(),self.output)
        head=json.loads(self.head.read_bytes());head['rejectionRules']['buzz']['minGuardedMargin']+=1;write(self.head,head)
        with self.assertRaisesRegex(ValueError,'binding differs'):self.run_check()
        self.assertFalse(self.output.exists())

    def test_complete_valid_subset_cannot_replace_full_fitted_development_manifest(self):
        def subset(staged,document):staged['records'].pop();document['records'].pop()
        self.rewrite_canonical(subset)
        with self.assertRaisesRegex(ValueError,'COMPLETE original development'):self.run_check()
        self.assertFalse(self.output.exists())

    def test_explicit_union_group_cannot_fall_back_to_uploader_and_final_roles_are_rejected(self):
        original_staged=Path(self.batch.staged_manifest_path).read_bytes()
        original_embeddings=Path(self.batch.embeddings_path).read_bytes()
        for kind in ('group','final','role'):
            Path(self.batch.staged_manifest_path).write_bytes(original_staged)
            Path(self.batch.embeddings_path).write_bytes(original_embeddings)
            def change(staged,document):
                for row in (staged['records'][0],document['records'][0]):
                    if kind=='group':row['source_record'].pop('v3_group')
                    elif kind=='role':row['source_record']['role']='audit'
                    else:row['split']='final';row['source_record'].update(split='final',role='final')
            self.rewrite_canonical(change)
            with self.subTest(kind=kind),self.assertRaises(ValueError):self.run_check()
            self.assertFalse(self.output.exists())

    def test_float64_or_wrong_compact_embedding_hash_is_rejected_without_repair(self):
        original=json.loads(self.startup.read_bytes())
        for kind in ('float64','hash','contract'):
            d=deepcopy(original)
            if kind=='float64':d['cases'][0]['normalizedEmbedding512'][0]=.12345678912345678
            elif kind=='hash':d['cases'][0]['embeddingSha256']=digest('wrong')
            else:d['embeddingContract']['modelSha256']=digest('wrong')
            path=self.root/(kind+'.json');write(path,d)
            with self.subTest(kind=kind),self.assertRaises(ValueError):
                self.run_check([ParityInput(path,sha(path.read_bytes()))])
            self.assertFalse(self.output.exists())

    def test_independent_js_detects_one_integer_and_one_gate_bit_mismatches(self):
        self.run_check()
        original=json.loads((self.output/'python-reference.json').read_bytes())
        for kind in ('quantization','gate','score','margin'):
            d=deepcopy(original)
            if kind=='quantization':d['rows'][0]['expectedQuantized'][0]-=1
            elif kind=='gate':d['rows'][0]['expected']['accepted']=False
            elif kind=='score':d['rows'][0]['expected']['integerScores'][3]+=1
            else:d['rows'][0]['expected']['guardedMargin']+=1
            expected=self.output/('tampered-'+kind+'.json');write(expected,d)
            output=self.root/('node-'+kind);result=self.node_check(expected,output)
            self.assertNotEqual(result.returncode,0,result.stdout)
            report=json.loads((output/'parity.json').read_bytes());self.assertFalse(report['passed'])
            self.assertEqual(report['mismatchingCases'],1);self.assertTrue(report['rows'][0]['mismatchedFields'])

    def test_js_reload_of_copied_raw_source_rejects_input_swapping(self):
        self.run_check()
        path=self.output/'inputs/01.json';path.write_bytes(path.read_bytes()+b' ')
        output=self.root/'node-swapped'
        result=self.node_check(self.output/'python-reference.json',output)
        self.assertNotEqual(result.returncode,0);self.assertFalse(output.exists())

    def test_compiler_wrapper_must_match_independent_pins_before_output(self):
        self.run_check()
        dependencies=self.root/'bad-dependencies';package=dependencies/'node_modules/typescript'
        package.mkdir(parents=True);(package/'package.json').write_text('{"version":"7.0.2"}')
        output=self.root/'node-bad-compiler';result=self.node_check(self.output/'python-reference.json',output,dependencies)
        self.assertNotEqual(result.returncode,0);self.assertIn('unpinned compiler wrapper',result.stderr);self.assertFalse(output.exists())


if __name__=='__main__':unittest.main()
