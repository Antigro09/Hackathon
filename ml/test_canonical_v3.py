"""Synthetic artifacts only. No model inference or real final-test data."""
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from ml.canonical_v3 import CanonicalBatch, EXECUTION, MODEL_ID, MODEL_REVISION, NORMALIZATION, PREPROCESSING, RUNTIME, TRANSFORMERS_SHA, derive_embedding_contract, load_canonical_batches
from ml.features import ARTIFACT_SHA256

ROOT = Path(__file__).resolve().parents[1]
def sha(value):return hashlib.sha256(value).hexdigest()
def digest(value):return sha(str(value).encode())
def compact(value):return json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()

def contract():
    return {'schemaVersion':1,'implementation':'tw-canonical-clap-wasm-v1','modelId':MODEL_ID,'revision':MODEL_REVISION,'modelFile':'onnx/audio_model_quantized.onnx',
        'modelSha256':ARTIFACT_SHA256['onnx/audio_model_quantized.onnx'],'transformersVersion':'4.3.1','ortVersion':'1.31.0-dev.20260914-8d85527a0',
        'runtimeSha256':{k:v[0] for k,v in RUNTIME.items()},'sampleRateHz':48000,'inputDurationSeconds':5,'featureShape':[1,1,1001,64],'embeddingSize':512,
        'normalization':NORMALIZATION,'preprocessing':PREPROCESSING,'execution':copy.deepcopy(EXECUTION),'repeatCount':2,'manifestSha256':digest('placeholder'),
        'runtimeHashes':{k:{'sha256':v[0],'bytes':v[1]} for k,v in RUNTIME.items()},'transformersBrowserBundleSha256':TRANSFORMERS_SHA,
        'preprocessorSha256':ARTIFACT_SHA256['preprocessor_config.json'],'resamplerSourceSha256':sha((ROOT/'src/ai/resample.ts').read_bytes()),
        'compiledResamplerSha256':digest('compiledresampler'),'compiledModelSha256':digest('compiledmodel'),'modelConfigSourceSha256':sha((ROOT/'src/ai/model.ts').read_bytes()),
        'encoderSourceSha256':sha((ROOT/'ml/browser/canonicalEncoder.mjs').read_bytes()),'runnerSourceSha256':sha((ROOT/'ml/browser/extractCanonicalNode.mjs').read_bytes()),
        'checkpointValidatorSha256':sha((ROOT/'ml/browser/canonicalCheckpoint.mjs').read_bytes()),'environment':{'node':'v24.18.0','v8':'synthetic','platform':'win32','architecture':'x64'},'promotionAllowed':False}

def source(clip, **changes):
    value={'clip_id':clip,'label':'speech','split':'development','uploader':clip+'-owner','uploader_group':clip+'-owner','dataset':'SyntheticFixture',
        'sha256':digest(clip+'prepared'),'original_sha256':digest(clip+'original'),'pcm_sha256':digest(clip+'pcm'),
        'license':'synthetic-only','source_url':'https://example.invalid/'+clip,'title':'Generated test metadata','quality':{'finite':True}}
    value.update(changes);return value

def make_batch(directory, name, sources, modify_contract=None):
    destination=directory/name;destination.mkdir()
    staged={'schemaVersion':1,'sourceManifestSha256':digest(name+'source-manifest'),'preparation':'synthetic fixture only','records':[]}
    for index,item in enumerate(sources):
        staged['records'].append({'clip_id':item['clip_id'],'label':item['label'],'split':item['split'],'uploader':item['uploader'],'row':index,
            'source_sha256':item['sha256'],'pcm_sha256':item['pcm_sha256'],'pcm_path':f'pcm/{index}.f32','sample_rate':48000,'sample_count':240000,'source_record':copy.deepcopy(item)})
    manifest=destination/'manifest.json';manifest.write_bytes(json.dumps(staged,indent=2).encode())
    metadata=contract();metadata['manifestSha256']=sha(manifest.read_bytes())
    if modify_contract:modify_contract(metadata)
    contract_sha=sha(compact(metadata));rows=[]
    for index,item in enumerate(staged['records']):
        vector=np.zeros(512,dtype=np.float32);vector[index%512]=1
        repeat={'pcm48Sha256':item['pcm_sha256'],'featureSha256':digest(item['clip_id']+'features'),'embeddingSha256':sha(vector.astype('<f4').tobytes()),'preprocessingMs':10.0,'inferenceMs':200.0}
        checkpoint={'schemaVersion':1,'row':index,'clipId':item['clip_id'],'sourceSha256':item['source_sha256'],'pcmSha256':item['pcm_sha256'],'contractSha256':contract_sha,'repeats':[copy.deepcopy(repeat),copy.deepcopy(repeat)],'embedding':vector.tolist()}
        rows.append(copy.deepcopy(item)|{'checkpoint':checkpoint})
    output=destination/'embeddings.json';output.write_bytes(json.dumps({'schemaVersion':1,'contractSha256':contract_sha,'contract':metadata,'records':rows,'promotionAllowed':False},indent=2).encode())
    return CanonicalBatch(output,manifest)

def mutate_output(batch, mutation):
    value=json.loads(Path(batch.embeddings_path).read_bytes());mutation(value);Path(batch.embeddings_path).write_bytes(json.dumps(value).encode())

class CanonicalV3Tests(unittest.TestCase):
    def setUp(self):self.temporary=tempfile.TemporaryDirectory();self.directory=Path(self.temporary.name)
    def tearDown(self):self.temporary.cleanup()

    def test_two_platform_batches_share_stable_contract_and_preserve_exact_values(self):
        first=make_batch(self.directory,'first',[source('a')])
        second=make_batch(self.directory,'second',[source('b')],lambda c:c['environment'].update(platform='linux',node='v24.19.0'))
        result=load_canonical_batches([first,second],{'a':'train','b':'audit'})
        self.assertEqual(result.X.dtype,np.float32);self.assertEqual(result.X.shape,(2,512));self.assertFalse(result.X.flags.writeable)
        self.assertEqual(result.X[0,0],1);self.assertEqual(result.X[0,1],0)
        self.assertEqual(result.embedding_contract['normalization'],'l2-float32');self.assertEqual(result.embedding_contract['canonicalBackend'],'browser-wasm')
        self.assertEqual(result.records[0]['source_record'],source('a'))
        self.assertEqual(result.records[0]['hashes'],{'original_sha256':digest('aoriginal'),'prepared_sha256':digest('aprepared'),'pcm_sha256':digest('apcm')})
        self.assertEqual(len(result.batch_provenance),2)

    def test_browser_and_node_metadata_derive_the_same_stable_encoder_contract(self):
        first=make_batch(self.directory,'node',[source('a')])
        def browser_contract(c):
            c['files']={}
            for name,(digest_value,size) in RUNTIME.items():
                route='/runtime/'+name if name.startswith('ort-wasm') else '/'+name
                c['files'][route]={'sha256':digest_value,'bytes':size}
            for route,hash_value in [('/canonicalEncoder.mjs',c['encoderSourceSha256']),('/app/resample.js',c['compiledResamplerSha256']),('/app/model.js',c['compiledModelSha256']),
                    (f'/models/{MODEL_REVISION}/preprocessor_config.json',c['preprocessorSha256'])]:c['files'][route]={'sha256':hash_value,'bytes':1}
            c['upstreamTransformersSha256']=c['transformersBrowserBundleSha256'];c['serverSourceSha256']=sha((ROOT/'ml/browser/canonicalServer.mjs').read_bytes())
            for key in ['runtimeHashes','encoderSourceSha256','compiledResamplerSha256','compiledModelSha256','preprocessorSha256','transformersBrowserBundleSha256','runnerSourceSha256','environment','modelConfigSourceSha256']:c.pop(key)
        second=make_batch(self.directory,'browser',[source('b')],browser_contract)
        mutate_output(second,lambda d:d['records'][0]['checkpoint'].update(browser={'transformersVersion':'4.3.1','ortVersion':'1.31.0-dev.20260914-8d85527a0','userAgent':'SyntheticFixture','platform':'Synthetic'}))
        self.assertEqual(load_canonical_batches([first,second],{'a':'train','b':'audit'}).X.shape,(2,512))

    def test_requires_complete_manifest_and_contract_identity(self):
        mutations=[lambda d:d['records'].pop(),lambda d:d.update(contractSha256=digest('wrong')),lambda d:d['records'][0]['checkpoint'].update(contractSha256=digest('wrong')),
            lambda d:d['records'][0].update(label='wind'),lambda d:d['records'][0]['checkpoint'].update(schemaVersion=True),lambda d:d['records'][0]['checkpoint'].update(row=True)]
        for index,mutation in enumerate(mutations):
            with self.subTest(index=index):
                batch=make_batch(self.directory,f'b{index}',[source('a')]);mutate_output(batch,mutation)
                with self.assertRaises(ValueError):load_canonical_batches([batch],{'a':'train'})
        batch=make_batch(self.directory,'manifest',[source('a')]);Path(batch.staged_manifest_path).write_text('{}')
        with self.assertRaisesRegex(ValueError,'manifest'):load_canonical_batches([batch],{'a':'train'})

    def test_rejects_nonfinite_float64_unscaled_or_corrupt_embedding_without_repair(self):
        def replace(vector):
            def mutate(d):
                checkpoint=d['records'][0]['checkpoint'];checkpoint['embedding']=vector
                for repeat in checkpoint['repeats']:repeat['embeddingSha256']=sha(np.asarray(vector,np.float32).astype('<f4').tobytes())
            return mutate
        vectors=[([.99]+[0]*511),([float(np.sqrt(.5)),float(np.sqrt(.5))]+[0]*510),([float('nan')]+[0]*511),([True]+[0]*511)]
        for index,vector in enumerate(vectors):
            batch=make_batch(self.directory,f'emb{index}',[source('a')]);mutate_output(batch,replace(vector))
            with self.assertRaises(ValueError):load_canonical_batches([batch],{'a':'train'})

    def test_repeats_are_finite_complete_and_bit_exact(self):
        mutations=[lambda d:d['records'][0]['checkpoint']['repeats'].pop(),lambda d:d['records'][0]['checkpoint']['repeats'][1].update(featureSha256=digest('changed')),
            lambda d:d['records'][0]['checkpoint']['repeats'][0].update(embeddingSha256=digest('changed')),lambda d:d['records'][0]['checkpoint']['repeats'][0].update(inferenceMs=-1)]
        for index,mutation in enumerate(mutations):
            batch=make_batch(self.directory,f'repeat{index}',[source('a')]);mutate_output(batch,mutation)
            with self.assertRaises(ValueError):load_canonical_batches([batch],{'a':'train'})

    def test_rejects_all_encoder_fingerprint_changes(self):
        mutations=[lambda c:c.update(modelSha256=digest('other')),lambda c:c.update(transformersBrowserBundleSha256=digest('other')),lambda c:c.update(resamplerSourceSha256=digest('other')),
            lambda c:c.update(encoderSourceSha256=digest('other')),lambda c:c['runtimeHashes']['ort-wasm-simd-threaded.wasm'].update(sha256=digest('other')),
            lambda c:c['execution'].update(numThreads=2),lambda c:c.update(compiledResamplerSha256=digest('other')),lambda c:c.update(compiledModelSha256=digest('other'))]
        first=make_batch(self.directory,'first',[source('a')])
        for index,mutation in enumerate(mutations):
            second=make_batch(self.directory,f'changed{index}',[source('b')],mutation)
            with self.assertRaises(ValueError):load_canonical_batches([first,second],{'a':'train','b':'audit'})

    def test_missing_dependency_fingerprint_is_rejected(self):
        batch=make_batch(self.directory,'missing',[source('a')],lambda c:c.pop('compiledModelSha256'))
        with self.assertRaisesRegex(ValueError,'dependency'):load_canonical_batches([batch],{'a':'train'})

    def test_duplicate_clip_and_pcm_content_rejected_even_in_same_phase(self):
        for index,items in enumerate([[source('a'),source('a')],[source('a'),source('b',pcm_sha256=digest('apcm'))]]):
            batch=make_batch(self.directory,f'dup{index}',items)
            with self.assertRaisesRegex(ValueError,'Duplicate'):load_canonical_batches([batch],{item['clip_id']:'train' for item in items})

    def test_original_prepared_and_cross_kind_content_cannot_cross_phases(self):
        for index,changes in enumerate([{'original_sha256':digest('aoriginal')},{'sha256':digest('aprepared')},{'original_sha256':digest('aprepared')}]):
            batch=make_batch(self.directory,f'hash{index}',[source('a'),source('b',**changes)])
            with self.assertRaisesRegex(ValueError,'content crosses'):load_canonical_batches([batch],{'a':'train','b':'audit'})

    def test_original_owner_survives_group_overrides_and_case_aliases(self):
        for index,items in enumerate([[source('a',uploader_group='same'),source('b',uploader_group='SAME')],[source('a',uploader='Shared'),source('b',uploader=' shared ')],
                [source('a',session_id='session'),source('b',session_id='session')]]):
            batch=make_batch(self.directory,f'owner{index}',items)
            with self.assertRaisesRegex(ValueError,'owner/group/session'):load_canonical_batches([batch],{'a':'train','b':'calibration'},group_by_clip_id={'a':'different-one','b':'different-two'})

    def test_known_and_unknown_may_share_owner_within_one_phase(self):
        batch=make_batch(self.directory,'samephase',[source('a',uploader_group='shared'),source('b',uploader_group='shared',label='background')])
        result=load_canonical_batches([batch],{'a':'train','b':'unknown_train'})
        self.assertEqual(result.groups.tolist(),['shared','shared'])

    def test_roles_are_explicit_and_exact(self):
        batch=make_batch(self.directory,'roles',[source('a')])
        for mapping in [{},{'a':'test'},{'a':'unknown_train'},{'a':'train','extra':'audit'}]:
            with self.subTest(mapping=mapping),self.assertRaises(ValueError):load_canonical_batches([batch],mapping)

    def test_final_opt_in_and_group_reservations(self):
        batch=make_batch(self.directory,'final',[source('a')])
        with self.assertRaisesRegex(ValueError,'opt-in'):load_canonical_batches([batch],{'a':'final'})
        result=load_canonical_batches([batch],{'a':'final'},allow_final=True)
        self.assertEqual(result.roles.tolist(),['final'])
        with self.assertRaisesRegex(ValueError,'reserved'):load_canonical_batches([batch],{'a':'train'},reserved_final_groups=['a-owner'])

    def test_all_tobee_collections_are_final_only_and_mimii_is_never_v3_training(self):
        for index,changes in enumerate([{'dataset':'ToBee','uploader_group':'tobee:hive1','hive_id':'hive1'}, {'collection_group':'ToBee:NU-Hive'},{'uploader_group':'tobee:other'}]):
            batch=make_batch(self.directory,f'tobee{index}',[source('a',**changes)])
            with self.assertRaisesRegex(ValueError,'reserved'):load_canonical_batches([batch],{'a':'train'})
            self.assertEqual(load_canonical_batches([batch],{'a':'final'},allow_final=True).roles.tolist(),['final'])
        batch=make_batch(self.directory,'mimii',[source('a',dataset='MIMII')])
        with self.assertRaisesRegex(ValueError,'MIMII'):load_canonical_batches([batch],{'a':'train'})

    def test_missing_original_or_inconsistent_source_hash_is_rejected(self):
        for index,changes in enumerate([{'original_sha256':None},{'pcm_sha256':'not-a-sha'}]):
            batch=make_batch(self.directory,f'provenance{index}',[source('a',**changes)])
            with self.assertRaises(ValueError):load_canonical_batches([batch],{'a':'train'})

if __name__=='__main__':unittest.main()
