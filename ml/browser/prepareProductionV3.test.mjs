import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {CANONICAL_ENCODER} from './canonicalEncoder.mjs';
import {float32Sha256} from './canonicalCheckpoint.mjs';
import {PRODUCTION_V3_PINS as pins, PRODUCTION_V3_SELF_TEST_PINS as selfTestPins, prepareProductionV3, redirectTransformersBundle, validateProductionReference, validateProductionSelfTest} from './prepareProductionV3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value));
const digest = 'a'.repeat(64);
const runtimeSizes = {'ort.wasm.bundle.min.mjs':73123, 'ort-wasm-simd-threaded.mjs':24381, 'ort-wasm-simd-threaded.wasm':14264838};

function syntheticReference() {
  const record = {row:0,clip_id:'synthetic-packager-test',label:'synthetic',split:'synthetic',uploader:'generated',
    source_sha256:digest,pcm_sha256:digest,sample_rate:48000,sample_count:240000,pcm_path:'deliberately-does-not-exist.f32',
    source_record:{license:'generated synthetic metadata only',notForRelease:true}};
  const staged = {schemaVersion:1,records:[record]}, manifestBytes = bytes(staged);
  const contract = {...structuredClone(CANONICAL_ENCODER),repeatCount:2,manifestSha256:sha(manifestBytes),
    runtimeHashes:Object.fromEntries(Object.entries(CANONICAL_ENCODER.runtimeSha256).map(([name,sha256])=>[name,{sha256,bytes:runtimeSizes[name]}])),
    ...Object.fromEntries(['transformersBrowserBundleSha256','preprocessorSha256','resamplerSourceSha256','compiledResamplerSha256','modelConfigSourceSha256','compiledModelSha256','encoderSourceSha256','runnerSourceSha256','checkpointValidatorSha256'].map(key=>[key,pins[key]])),
    preprocessingRuntimeOverride:'Transformers.js documented Symbol.for(onnxruntime) override bound to the same ORT-Web WASM bundle',
    pcmFormat:'little-endian IEEE754 Float32 mono, exact first five seconds; no browser decoder',promotionAllowed:false};
  const contractSha256=sha(bytes(contract));
  const embedding=Array(512).fill(0);embedding[0]=1;
  const repeat={pcm48Sha256:digest,featureSha256:digest,embeddingSha256:float32Sha256(Float32Array.from(embedding)),preprocessingMs:0,inferenceMs:0};
  const checkpoint={schemaVersion:1,row:0,clipId:record.clip_id,sourceSha256:digest,pcmSha256:digest,contractSha256,repeats:[{...repeat},{...repeat}],embedding};
  return {staged,reference:{schemaVersion:1,contractSha256,contract,records:[{...record,checkpoint}],promotionAllowed:false}};
}
function rehash(value) {
  value.reference.contract.manifestSha256=sha(bytes(value.staged));
  value.reference.contractSha256=sha(bytes(value.reference.contract));
  for(const record of value.reference.records) if(record.checkpoint) record.checkpoint.contractSha256=value.reference.contractSha256;
}
function validate(value) {return validateProductionReference(bytes(value.reference),bytes(value.staged));}
function temporary(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tw-v3-packager-test-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('tw-v3-packager-test-'));fs.rmSync(dir,{recursive:true});});
  return dir;
}
function inputs(dir) {
  const value=syntheticReference(), referenceFile=path.join(dir,'reference.json'),manifestFile=path.join(dir,'manifest.json');
  fs.writeFileSync(referenceFile,bytes(value.reference));fs.writeFileSync(manifestFile,bytes(value.staged));
  return {referenceFile,manifestFile,outputDir:path.join(dir,'assets')};
}

test('complete synthetic checkpoint validates without reading its nonexistent PCM',()=>{
  const value=syntheticReference(), result=validate(value);
  assert.equal(result.completedRecords,1);assert.equal(result.contractSha256,value.reference.contractSha256);
});

test('partial, reordered, duplicate and metadata-substituted references fail closed',()=>{
  for(const mutate of [
    x=>x.reference.records.pop(), x=>x.reference.records[0].row=1,
    x=>x.reference.records[0].source_record={license:'different'},
    x=>{x.staged.records.push({...x.staged.records[0],row:1});x.reference.records.push({...x.reference.records[0],row:1});rehash(x);},
    x=>{x.staged.records[0].sample_rate=16000;x.reference.records[0].sample_rate=16000;rehash(x);},
    x=>{x.staged.records[0].pcm_sha256='bad';rehash(x);},
  ]) {const value=syntheticReference();mutate(value);assert.throws(()=>validate(value));}
});

test('contracts reject digest tampering and independently rehashed unpinned numerical fields',()=>{
  const changes=[x=>x.reference.contract.repeatCount=3,x=>x.reference.promotionAllowed=true,x=>x.reference.contractSha256=digest];
  for(const key of ['compiledModelSha256','modelConfigSourceSha256','encoderSourceSha256','runnerSourceSha256','checkpointValidatorSha256','compiledResamplerSha256','transformersBrowserBundleSha256','preprocessorSha256']) changes.push(x=>{x.reference.contract[key]=digest;rehash(x);});
  changes.push(x=>{x.reference.contract.execution.numThreads=2;rehash(x);},x=>{x.reference.contract.preprocessingRuntimeOverride='native';rehash(x);},
    x=>{x.reference.contract.runtimeHashes['ort.wasm.bundle.min.mjs'].sha256=digest;rehash(x);});
  for(const mutate of changes) {const value=syntheticReference();mutate(value);assert.throws(()=>validate(value));}
});

test('checkpoint integrity, Float32 normalization and repeatability are required',()=>{
  for(const mutate of [c=>c.embedding[0]=.9,c=>c.embedding[1]=Math.PI,c=>c.repeats.pop(),c=>c.repeats[1].featureSha256='b'.repeat(64),c=>c.repeats[0].embeddingSha256=digest,c=>c.clipId='substitute',c=>c.repeats[0].inferenceMs=-1]) {
    const value=syntheticReference();mutate(value.reference.records[0].checkpoint);assert.throws(()=>validate(value));
  }
});

test('Transformers patch changes only the two exact external import specifiers',()=>{
  const upstream=fs.readFileSync(path.join(root,'node_modules/@huggingface/transformers/dist/transformers.web.js'));
  const redirected=redirectTransformersBundle(upstream);
  const expected=upstream.toString().replace('"onnxruntime-web/webgpu"','"./ort.wasm.bundle.min.mjs"').replace('"onnxruntime-common"','"./ort.wasm.bundle.min.mjs"');
  assert.equal(redirected.toString(),expected);assert.equal(sha(redirected),pins.redirectedTransformersSha256);
  const altered=Buffer.from(upstream);altered[0]^=1;assert.throws(()=>redirectTransformersBundle(altered),/unpinned upstream/);
});

test('package has exact static modules/config/notices, extensionless JS alias, and no data or model',async t=>{
  const dir=temporary(t), options=inputs(dir);
  const sourcePaths=['src/ai/model.ts','src/ai/resample.ts','ml/browser/canonicalEncoder.mjs','ml/browser/extractCanonicalNode.mjs'];
  const before=sourcePaths.map(file=>sha(fs.readFileSync(path.join(root,file))));
  const manifest=prepareProductionV3(options);
  assert.equal(manifest.promotionAllowed,false);assert.equal(manifest.activationReady,false);
  assert.equal(manifest.syntheticSelfTest,null);
  assert.equal(Object.keys(manifest.files).length,15);
  let total=0;
  for(const [file,entry] of Object.entries(manifest.files)) {
    const asset=fs.readFileSync(path.join(options.outputDir,file));total+=asset.length;
    assert.equal(asset.length,entry.bytes);assert.equal(sha(asset),entry.sha256);
    assert.ok(!/\.onnx$|\.f32$|\.wav$|embeddings|candidate|checkpoints/.test(file));
  }
  assert.equal(manifest.totalAssetBytes,total);
  assert.deepEqual(fs.readFileSync(path.join(options.outputDir,'app/model')),fs.readFileSync(path.join(options.outputDir,'app/model.js')));
  assert.equal(manifest.files['app/model'].contentType,'text/javascript');
  assert.equal(manifest.files['runtime/ort-wasm-simd-threaded.wasm'].contentType,'application/wasm');
  assert.equal(manifest.files['app/resample.js'].sha256,pins.compiledResamplerSha256);
  assert.equal(manifest.files['integerHeadV3.js'].sha256,pins.compiledScorerSha256);
  assert.match(fs.readFileSync(path.join(options.outputDir,'app/resample.js'),'utf8'),/from '\.\/model'/);
  assert.ok(!JSON.stringify(manifest).includes('synthetic-packager-test'));
  assert.ok(!JSON.stringify(manifest).includes('notForRelease'));
  const scorer=await import(pathToFileURL(path.join(options.outputDir,'integerHeadV3.js')));
  assert.equal(typeof scorer.createIntegerHeadV3,'function');
  assert.equal(scorer.V3_CLASSES.length,6);
  assert.deepEqual(sourcePaths.map(file=>sha(fs.readFileSync(path.join(root,file)))),before);
  assert.throws(()=>prepareProductionV3(options),/output already exists/);
});

test('altered ORT dependency and false package versions are rejected before output creation',t=>{
  const dir=temporary(t), options=inputs(dir), dependencyRoot=path.join(dir,'deps');
  function write(relative,data) {const target=path.join(dependencyRoot,'node_modules',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
  for(const [name,version] of [['@huggingface/transformers','4.3.1'],['onnxruntime-web',CANONICAL_ENCODER.ortVersion],['typescript','7.0.2']]) write(`${name}/package.json`,JSON.stringify({version}));
  write('@huggingface/transformers/dist/transformers.web.js',fs.readFileSync(path.join(root,'node_modules/@huggingface/transformers/dist/transformers.web.js')));
  write('onnxruntime-web/dist/ort.wasm.bundle.min.mjs','altered runtime');
  assert.throws(()=>prepareProductionV3({...options,dependencyRoot}),/SHA mismatch/);
  assert.equal(fs.existsSync(options.outputDir),false);
  write('typescript/package.json',JSON.stringify({version:'untrusted'}));
  assert.throws(()=>prepareProductionV3({...options,dependencyRoot}),/unpinned package typescript/);
  assert.equal(fs.existsSync(options.outputDir),false);
});

test('altered preprocessor config is rejected without opening or requiring any weights',t=>{
  const dir=temporary(t), options=inputs(dir), cacheDir=path.join(dir,'cache'),cache=path.join(cacheDir,CANONICAL_ENCODER.revision);
  fs.mkdirSync(cache,{recursive:true});
  fs.copyFileSync(path.join(root,'output/ml-cache',CANONICAL_ENCODER.revision,'config.json'),path.join(cache,'config.json'));
  fs.writeFileSync(path.join(cache,'preprocessor_config.json'),'{}');
  assert.throws(()=>prepareProductionV3({...options,cacheDir}),/SHA mismatch/);
  assert.equal(fs.existsSync(options.outputDir),false);
});

test('CLI refuses unknown options before creating output',()=>{
  assert.throws(()=>execFileSync(process.execPath,[path.join(root,'ml/browser/prepareProductionV3.mjs'),'--activate','true'],{stdio:'pipe'}),error=>/unknown or duplicate option activate/.test(error.stderr.toString()));
});

const selfTestModule=()=>fs.readFileSync(path.join(root,'ml/browser/selfTestV3.mjs'));
const selfTestReferenceFile=path.join(root,'ml/browser/fixtures/self-test-v3-reference.json');
const selfTestReference=()=>fs.readFileSync(selfTestReferenceFile);

test('optional synthetic reference binds the exact module, two vectors and numeric dependency contract',()=>{
  const contract=syntheticReference().reference.contract;
  const result=validateProductionSelfTest(selfTestModule(),selfTestReference(),contract);
  assert.deepEqual(result,{...selfTestPins,caseCount:2,softwareOnly:true,fieldEvidence:false});
  assert.equal('moduleSha256' in pins,false);
  for(const mutate of [x=>x.compiledModelSha256=digest,x=>x.runtimeHashes['ort.wasm.bundle.min.mjs'].bytes++,x=>x.execution.numThreads=2]) {
    const changed=structuredClone(contract);mutate(changed);
    assert.throws(()=>validateProductionSelfTest(selfTestModule(),selfTestReference(),changed),/fingerprint mismatch/);
  }
});

test('modified synthetic generator and reference fail closed without running any encoder',()=>{
  const changedModule=Buffer.from(selfTestModule());changedModule[0]^=1;
  assert.throws(()=>validateProductionSelfTest(changedModule,selfTestReference(),syntheticReference().reference.contract),/altered synthetic self-test module/);
  const changed=JSON.parse(selfTestReference());changed.cases[0].normalizedEmbedding512[0]=0;
  assert.throws(()=>validateProductionSelfTest(selfTestModule(),bytes(changed),syntheticReference().reference.contract),/altered synthetic self-test reference/);
  const partial=JSON.parse(selfTestReference());partial.cases.pop();
  assert.throws(()=>validateProductionSelfTest(selfTestModule(),bytes(partial),syntheticReference().reference.contract),/altered synthetic self-test reference/);
});

test('optional package copies only exact generator/reference bytes as software-only assets',t=>{
  const options=inputs(temporary(t));
  const manifest=prepareProductionV3({...options,selfTestReferenceFile});
  assert.equal(Object.keys(manifest.files).length,17);
  assert.deepEqual(fs.readFileSync(path.join(options.outputDir,'selfTestV3.mjs')),selfTestModule());
  assert.deepEqual(fs.readFileSync(path.join(options.outputDir,'self-test-v3-reference.json')),selfTestReference());
  assert.equal(manifest.files['selfTestV3.mjs'].sha256,selfTestPins.moduleSha256);
  assert.equal(manifest.files['self-test-v3-reference.json'].sha256,selfTestPins.referenceSha256);
  assert.equal(manifest.syntheticSelfTest.softwareOnly,true);assert.equal(manifest.syntheticSelfTest.fieldEvidence,false);
  assert.equal(manifest.promotionAllowed,false);assert.equal(manifest.activationReady,false);
});

test('a substituted optional reference is rejected before any output directory exists',t=>{
  const dir=temporary(t),options=inputs(dir),badReference=path.join(dir,'bad-reference.json');
  fs.writeFileSync(badReference,'{}');
  assert.throws(()=>prepareProductionV3({...options,selfTestReferenceFile:badReference}),/altered synthetic self-test reference/);
  assert.equal(fs.existsSync(options.outputDir),false);
});
