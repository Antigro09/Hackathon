import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {CANONICAL_ENCODER, requirePcm} from './canonicalEncoder.mjs';
import {SELF_TEST_V3, generateSelfTestV3Input} from './selfTestV3.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(here,'productionWorkerV3.mjs'),'utf8');
const reference=JSON.parse(fs.readFileSync(path.join(here,'fixtures/self-test-v3-reference.json')));
const hash=value=>crypto.createHash('sha256').update(Buffer.from(value.buffer??value,value.byteOffset??0,value.byteLength??value.length)).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const userPcm=()=>Float32Array.from({length:240000},(_,i)=>.05*Math.sin(i/100));
let assetFixtures;

async function setup({badAsset,badSelfTest=false,holdModel,holdExtract,holdCreate,holdInputHash,holdSyntheticHash=false,disposeReject=false}={}) {
  const context=vm.createContext({URL,Uint8Array,Uint32Array,Float32Array,SharedArrayBuffer,TextDecoder,TextEncoder,AbortController});
  const ort={env:{wasm:{}}},env={version:'4.3.1'};
  const dependencies={
    'ort.wasm.bundle.min.mjs':{env:ort.env},
    'transformers.web.js':{ClapFeatureExtractor:class{},env},
    'canonicalEncoder.mjs':{CANONICAL_ENCODER,createCanonicalEncoder:()=>{throw Error('test must inject fake encoder');},requirePcm},
    'app/model.js':{},
    'app/resample.js':{resampleForSoundHints:async pcm=>pcm.slice()},
    'selfTestV3.mjs':{SELF_TEST_V3,generateSelfTestV3Input},
  };
  const module=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){meta.url='https://worker.test/assets/productionWorkerV3.mjs';}});
  assert.deepEqual(module.dependencySpecifiers,[]);
  await module.link(()=>{throw Error('bootstrap must not statically import unverified modules');});
  await module.evaluate();
  const assets=module.namespace.WORKER_V3_ASSETS;
  if(!assetFixtures) {
    const files=new Map(),hashes=new Map();let marker=10;
    for(const[name,pin]of Object.entries(assets)) {
      let body;
      if(name==='self-test-v3-reference.json')body=fs.readFileSync(path.join(here,'fixtures/self-test-v3-reference.json'));
      else if(name.endsWith('.json'))body=Buffer.from('{}'+' '.repeat(pin.bytes-2));
      else if(name==='transformers.web.js') {const prefix='import a from "./ort.wasm.bundle.min.mjs";import b from "./ort.wasm.bundle.min.mjs";';body=Buffer.from(prefix+' '.repeat(pin.bytes-prefix.length));}
      else if(name==='app/resample.js') {const prefix="import {SOUND_HINT_MODEL} from './model';";body=Buffer.from(prefix+' '.repeat(pin.bytes-prefix.length));}
      else {body=Buffer.alloc(pin.bytes);body[0]=marker++;}
      files.set(name,body);hashes.set(hash(body),pin.sha256);
    }
    const model=Buffer.alloc(34301667);model[0]=marker++;
    files.set('audio_model_quantized.onnx',model);hashes.set(hash(model),CANONICAL_ENCODER.modelSha256);
    const manifest={schemaVersion:1,packageKind:'tw-canonical-v3-runtime-assets',researchOnly:true,activationReady:false,promotionAllowed:false,
      canonicalEncoder:{modelSha256:CANONICAL_ENCODER.modelSha256,revision:CANONICAL_ENCODER.revision},
      syntheticSelfTest:{moduleSha256:'cf4c6a95f4b5108c4c906829385f062a66ccf363a2ece78c49da31b634af4105',referenceSha256:'6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d',softwareOnly:true,fieldEvidence:false},files:assets};
    files.set('asset-manifest.json',Buffer.from(JSON.stringify(manifest)));
    assetFixtures={files,hashes};
  }
  const {files}=assetFixtures,hashes=new Map(assetFixtures.hashes),messages=[],requests=[];
  const counts={created:0,extracts:0,released:0,heldHashes:0},inputMap=new Map(),moduleImports=[],revoked=[];
  for(const[i,entry]of reference.cases.entries()) {
    const input=generateSelfTestV3Input(entry.id);
    const resampled=Float32Array.of(i+11),features=Float32Array.of(i+21);
    hashes.set(hash(resampled),entry.resampledPcmSha256);hashes.set(hash(features),entry.featureSha256);
    inputMap.set(hash(input.samples),{resampled,features,embedding:Float32Array.from(entry.normalizedEmbedding512)});
  }
  const heldHash=holdSyntheticHash?reference.cases[0].inputSha256:hash(userPcm());
  const shaImpl=async value=>{const digest=hash(value);if(holdInputHash&&digest===heldHash&&counts.heldHashes===0){counts.heldHashes++;await holdInputHash.promise;}return hashes.get(digest)??digest;};
  const fetchImpl=async(url,options)=>{
    requests.push({url,options});const name=new URL(url).pathname.slice('/assets/'.length);
    assert.ok(files.has(name));assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal('body'in options,false);
    if(name==='audio_model_quantized.onnx'&&holdModel) await Promise.race([holdModel.promise,new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true}))]);
    let body=files.get(name);
    if(name===badAsset) {body=Buffer.from(body);body[body.length-1]^=1;}
    return {ok:true,headers:{get:()=>String(body.length)},arrayBuffer:async()=>body};
  };
  const makeEncoder=async options=>{
    counts.created++;assert.equal(options.modelBytes.length,34301667);
    assert.ok(options.wasmPaths.mjs.startsWith('blob:'));assert.ok(options.wasmPaths.wasm.startsWith('blob:'));
    if(holdCreate)await holdCreate.promise;
    return{async extract(pcm,rate){
      counts.extracts++;const canned=inputMap.get(hash(pcm));
      if(canned){if(badSelfTest)return{...canned,features:Float32Array.of(999)};return canned;}
      if(holdExtract)await holdExtract.promise;
      const embedding=new Float32Array(512);embedding[0]=1;
      return{resampled:pcm.slice(),features:Float32Array.of(42),embedding};
    },async dispose(){counts.released++;if(disposeReject)throw Error('injected release failure');}};
  };
  let urlIndex=0;
  const moduleLoader=async(name,rewritten,url)=>{moduleImports.push({name,rewritten,url});assert.ok(dependencies[name]);return dependencies[name];};
  const worker=module.namespace.createProductionWorkerV3({post:value=>messages.push(value),fetchImpl,shaImpl,makeEncoder,makeProcessor:config=>config,
    moduleLoader,createModuleUrl:()=>`blob:https://worker.test/${++urlIndex}`,revokeModuleUrl:url=>revoked.push(url)});
  return{worker,messages,requests,counts,env,ort,moduleImports,revoked};
}

test('explicit startup verifies allowlisted GET assets and both full-stage synthetic checks',async()=>{
  const h=await setup();assert.equal(h.requests.length,0);
  await h.worker.handle({type:'initialize',requestId:'init'});
  assert.equal(h.counts.created,1);assert.equal(h.counts.extracts,2);
  assert.equal(h.messages.at(-1).type,'ready');assert.equal(h.messages.at(-1).provenance.selfTestPassed,true);
  assert.equal(h.env.allowRemoteModels,false);assert.equal(h.env.useBrowserCache,false);
  assert.equal(h.requests.length,14);
  assert.equal(h.moduleImports.length,6);
  const ortUrl=h.moduleImports.find(value=>value.name==='ort.wasm.bundle.min.mjs').url;
  assert.equal(h.moduleImports.find(value=>value.name==='transformers.web.js').rewritten.split(JSON.stringify(ortUrl)).length,3);
  assert.ok(!h.moduleImports.find(value=>value.name==='app/resample.js').rewritten.includes("'./model'"));
  await h.worker.handle({type:'initialize',requestId:'noop'});assert.equal(h.requests.length,14);
  await h.worker.handle({type:'dispose',requestId:'done'});assert.equal(h.counts.released,1);
  assert.equal(h.revoked.length,8);assert.equal(h.ort.env.wasm.wasmBinary,undefined);
});

test('caller paths, extra metadata, invalid IDs/rates/duration/shared PCM never trigger network',async()=>{
  const h=await setup();
  for(const request of [
    {type:'initialize',requestId:'a',url:'https://example.test/audio.wav'},
    {type:'extract',requestId:'b',pcm:userPcm(),sampleRateHz:48000,filename:'private.wav'},
    {type:'initialize',requestId:'private/path'},
    {type:'extract',requestId:'short',pcm:new Float32Array(10),sampleRateHz:48000},
    {type:'extract',requestId:'rate',pcm:userPcm(),sampleRateHz:16000},
    {type:'extract',requestId:'shared',pcm:new Float32Array(new SharedArrayBuffer(960000)),sampleRateHz:48000},
  ]) {await h.worker.handle(request);assert.equal(h.messages.at(-1).type,'error');}
  assert.equal(h.requests.length,0);assert.equal(h.counts.created,0);
  assert.ok(!JSON.stringify(h.messages).includes('private.wav'));assert.ok(!JSON.stringify(h.messages).includes('example.test'));
});

test('verified initialization then diagnostic extraction preserves input and returns no classifier or raw PCM',async()=>{
  const h=await setup(),pcm=userPcm(),before=pcm.slice();
  await h.worker.handle({type:'extract',requestId:'first',pcm,sampleRateHz:48000});
  const output=h.messages.at(-1);assert.equal(output.type,'embedding');assert.equal(output.embedding.length,512);
  assert.equal(output.provenance.sampleRateHz,48000);assert.equal(output.provenance.sampleCount,240000);
  assert.equal(output.provenance.classifierIncluded,false);assert.equal(output.provenance.promotionAllowed,false);
  assert.equal('pcm'in output,false);assert.equal('label'in output,false);assert.equal('confidence'in output,false);
  assert.deepEqual(pcm,before);await h.worker.handle({type:'dispose',requestId:'done'});
});

test('corrupt asset fails before model/session use; failed synthetic checks release the candidate',async()=>{
  const bad=await setup({badAsset:'app/model'});await bad.worker.handle({type:'initialize',requestId:'bad'});
  assert.equal(bad.messages.at(-1).code,'asset-mismatch');assert.equal(bad.counts.created,0);
  assert.equal(bad.moduleImports.length,0);
  assert.ok(!bad.requests.some(request=>request.url.endsWith('.onnx')));
  const failed=await setup({badSelfTest:true});await failed.worker.handle({type:'extract',requestId:'bad',pcm:userPcm(),sampleRateHz:48000});
  assert.equal(failed.messages.at(-1).code,'self-test-mismatch');assert.equal(failed.counts.released,1);
  assert.equal(failed.messages.some(message=>message.type==='embedding'),false);
});

test('busy requests do not overlap; cancellation aborts model fetch and suppresses readiness',async()=>{
  const gate=deferred(),h=await setup({holdModel:gate});
  const pending=h.worker.handle({type:'initialize',requestId:'loading'});
  while(!h.requests.some(request=>request.url.endsWith('.onnx')))await tick();
  await h.worker.handle({type:'initialize',requestId:'overlap'});assert.equal(h.messages.at(-1).code,'busy');
  await h.worker.handle({type:'cancel',requestId:'cancel',targetRequestId:'loading'});await pending;
  assert.ok(h.messages.some(message=>message.type==='cancelled'&&message.requestId==='loading'));
  assert.equal(h.messages.some(message=>message.type==='ready'),false);assert.equal(h.counts.created,0);
});

test('cancel during session creation releases the eventually-created candidate',async()=>{
  const gate=deferred(),h=await setup({holdCreate:gate}),pending=h.worker.handle({type:'initialize',requestId:'create'});
  while(!h.counts.created)await tick();
  await h.worker.handle({type:'cancel',requestId:'cancel',targetRequestId:'create'});gate.resolve();await pending;
  assert.equal(h.counts.released,1);assert.equal(h.messages.some(message=>message.type==='ready'),false);
});

test('dispose waits for extraction, suppresses late embedding, releases once, and is terminal',async()=>{
  const gate=deferred(),h=await setup({holdExtract:gate});await h.worker.handle({type:'initialize',requestId:'init'});
  const pending=h.worker.handle({type:'extract',requestId:'slow',pcm:userPcm(),sampleRateHz:48000});
  while(h.counts.extracts<3)await tick();
  const disposing=h.worker.handle({type:'dispose',requestId:'stop'});
  await tick();assert.equal(h.counts.released,0);gate.resolve();await pending;await disposing;
  assert.equal(h.counts.released,1);assert.equal(h.messages.some(message=>message.type==='embedding'),false);
  assert.equal(h.messages.at(-1).type,'disposed');const fetched=h.requests.length;
  await h.worker.handle({type:'initialize',requestId:'later'});assert.equal(h.messages.at(-1).code,'disposed');assert.equal(h.requests.length,fetched);
  await h.worker.handle({type:'dispose',requestId:'again'});assert.equal(h.counts.released,1);
});

test('cancellation received during input hashing never starts the next inference',async()=>{
  for(const synthetic of [false,true]) {
    const gate=deferred(),h=await setup({holdInputHash:gate,holdSyntheticHash:synthetic});
    if(!synthetic)await h.worker.handle({type:'initialize',requestId:'init'});
    const pending=h.worker.handle(synthetic?{type:'initialize',requestId:'hash'}:{type:'extract',requestId:'hash',pcm:userPcm(),sampleRateHz:48000});
    while(!h.counts.heldHashes)await tick();
    const before=h.counts.extracts;
    await h.worker.handle({type:'cancel',requestId:'cancel',targetRequestId:'hash'});gate.resolve();await pending;
    assert.equal(h.counts.extracts,before);assert.equal(h.messages.at(-1).type,'cancelled');
    await h.worker.handle({type:'dispose',requestId:'done'});assert.equal(h.counts.released,1);
  }
});

test('release failures still revoke modules and clear WASM; startup retains the original failure',async()=>{
  const failed=await setup({badSelfTest:true,disposeReject:true});
  await failed.worker.handle({type:'initialize',requestId:'bad'});
  assert.equal(failed.messages.at(-1).code,'self-test-mismatch');assert.equal(failed.revoked.length,8);
  assert.equal(failed.ort.env.wasm.wasmBinary,undefined);
  const h=await setup({disposeReject:true});await h.worker.handle({type:'initialize',requestId:'init'});
  await h.worker.handle({type:'dispose',requestId:'stop'});
  assert.equal(h.messages.at(-1).code,'dispose-failed');assert.equal(h.worker.getState().phase,'disposed');
  assert.equal(h.revoked.length,8);assert.equal(h.ort.env.wasm.wasmBinary,undefined);
  await h.worker.handle({type:'initialize',requestId:'again'});assert.equal(h.messages.at(-1).code,'disposed');assert.equal(h.counts.released,1);
});
