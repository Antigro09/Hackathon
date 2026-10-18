import test from 'node:test';
import assert from 'node:assert/strict';
import {CANONICAL_ENCODER, createCanonicalEncoder, normalizeCanonicalEmbedding, requirePcm} from './canonicalEncoder.mjs';
import {float32Sha256, validateCanonicalCheckpoint} from './canonicalCheckpoint.mjs';

const pcm = () => Float32Array.from({length: 240000}, (_, i) => .1 * Math.sin(i * .1));
test('strict actual-rate five-second PCM and hard quality rejection', () => {
  requirePcm(pcm(), 48000);
  requirePcm(new Float32Array(220500).fill(.02), 44100);
  for (const [values, rate] of [[new Float32Array(240000),48000],[new Float32Array(240000).fill(NaN),48000],[new Float32Array(240000).fill(.9999),48000],[pcm(),44100],[pcm(),16000],[Array(240000).fill(.1),48000]]) assert.throws(() => requirePcm(values,rate));
});
test('normalization preserves input and rejects invalid/zero model output', () => {
  const values = new Float32Array(512).fill(.2), before = values.slice();
  const normalized = normalizeCanonicalEmbedding(values);
  assert.deepEqual(values,before); assert.ok(Math.abs(normalized.reduce((s,x)=>s+x*x,0)-1)<1e-6);
  for (const invalid of [new Float32Array(511),new Float32Array(512),new Float32Array(512).fill(Infinity)]) assert.throws(()=>normalizeCanonicalEmbedding(invalid));
});
function fakeRuntime({featureShape=[1,1,1001,64], invalidSchema=false, invalidOutput=false}={}) {
  let calls=0, releases=0, disposedOutputs=0;
  const session={inputNames:invalidSchema?['wrong']:['input_features'],outputNames:['audio_embeds'],
    async run(input,names){calls++;assert.equal(input.input_features.data.length,64064);assert.deepEqual(names,['audio_embeds']);return{audio_embeds:{data:new Float32Array(512).fill(invalidOutput?NaN:.01),dispose(){disposedOutputs++;}}};},async release(){releases++;}};
  const ort={env:{versions:{web:CANONICAL_ENCODER.ortVersion},wasm:{}},Tensor:class{constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;}},InferenceSession:{async create(bytes,options){assert.deepEqual(options,{executionProviders:['wasm'],graphOptimizationLevel:'all',executionMode:'sequential'});return session;}}};
  return {ort,processor:async()=>({input_features:{type:'float32',dims:featureShape,data:new Float32Array(64064)}}),resample:async values=>values.slice(),modelBytes:new Uint8Array([1]),wasmPaths:{mjs:'local',wasm:'local'},counts:()=>({calls,releases,disposedOutputs})};
}
test('extractor uses only explicit WASM session, preserves PCM and releases resources', async()=>{
  const runtime=fakeRuntime(), values=pcm(), before=values.slice();
  const encoder=await createCanonicalEncoder(runtime);
  const output=await encoder.extract(values,48000);
  assert.equal(output.embedding.length,512);assert.deepEqual(values,before);assert.equal(runtime.ort.env.wasm.numThreads,1);assert.equal(runtime.ort.env.wasm.proxy,false);
  await encoder.dispose();await encoder.dispose();assert.deepEqual(runtime.counts(),{calls:1,releases:1,disposedOutputs:1});
  await assert.rejects(encoder.extract(values,48000),/disposed/);
});
test('wrong feature/model schemas reject before scoring',async()=>{
  const runtime=fakeRuntime({featureShape:[1,1,1000,64]});const encoder=await createCanonicalEncoder(runtime);
  await assert.rejects(encoder.extract(pcm(),48000),/features/);assert.equal(runtime.counts().calls,0);await encoder.dispose();
  const invalid=fakeRuntime({invalidSchema:true});await assert.rejects(createCanonicalEncoder(invalid),/schema/);assert.equal(invalid.counts().releases,1);
});
test('failed model-output validation still disposes its tensor',async()=>{
  const runtime=fakeRuntime({invalidOutput:true});const encoder=await createCanonicalEncoder(runtime);
  await assert.rejects(encoder.extract(pcm(),48000),/Non-finite/);assert.equal(runtime.counts().disposedOutputs,1);await encoder.dispose();assert.equal(runtime.counts().releases,1);
});
const digest='a'.repeat(64), row={row:0,clip_id:'generated',source_sha256:digest,pcm_sha256:digest};
function validCheckpoint(){const embedding=Array.from(normalizeCanonicalEmbedding(new Float32Array(512).fill(.2)));const repeat={pcm48Sha256:digest,featureSha256:digest,embeddingSha256:float32Sha256(Float32Array.from(embedding)),preprocessingMs:10,inferenceMs:200};return{schemaVersion:1,row:0,clipId:'generated',sourceSha256:digest,pcmSha256:digest,contractSha256:digest,embedding,repeats:[{...repeat},{...repeat}]};}
test('checkpoint resume binds inputs, contract, normalized Float32 values and repeats',()=>{
  validateCanonicalCheckpoint(validCheckpoint(),row,digest,2);
  for(const mutate of [x=>x.clipId='other',x=>x.row=1,x=>x.contractSha256='b'.repeat(64),x=>x.pcmSha256='b'.repeat(64),x=>x.embedding[0]=.5,x=>x.embedding[0]=NaN,x=>x.embedding[0]=Math.PI,x=>x.repeats.pop(),x=>x.repeats[1].featureSha256='b'.repeat(64),x=>x.repeats[0].inferenceMs=-1,x=>x.repeats[0].embeddingSha256='b'.repeat(64)]){const value=validCheckpoint();mutate(value);assert.throws(()=>validateCanonicalCheckpoint(value,row,digest,2));}
});
