import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LEGACY_DIST,LEGACY_LABELS,sha256,validateLegacyManifest,validateLegacyQuality,validateLegacyCheckpoint,validateLegacyBrowserEvidence} from './legacyBaselineV3.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),digest='a'.repeat(64);
const row={row:0,clip_id:'generated',source_sha256:digest,pcm_sha256:digest,sample_rate:48000,sample_count:240000};
const analysis=()=>({algorithmVersion:'tw-screen-v2',sampleRateHz:48000,sampleCount:240000,durationSeconds:5,frameCount:57,qualityCodes:[]});
function quality(){return{schemaVersion:1,row:0,clipId:'generated',sourceSha256:digest,pcmSha256:digest,contractSha256:digest,inputUnchanged:true,analysis:analysis(),outcome:'quality-eligible',error:null};}
function result(){const r=quality();delete r.error;return{...r,outcome:'result',qualityArtifactSha256:digest,resampledPcmSha256:digest,rawResponse:{type:'result',sessionId:1,result:{status:'uncertain',reason:'not-validated',rankings:[{label:LEGACY_LABELS[0],score:.7},{label:LEGACY_LABELS[1],score:.1}],provisionalGatePassed:true,modelId:'Xenova/clap-htsat-unfused',modelRevision:'c28f2883575e590e04d3146ff0713c2448d691ba',preprocessing:{originalSampleRateHz:48000,originalSampleCount:240000,observationSeconds:5,modelSampleRateHz:48000,modelInputSamples:240000,processorSeconds:10,padding:'zero-pad',configuredPadding:'repeatpad',featureBandHz:[50,14000]},timing:{modelLoadMs:1,inferenceMs:1,totalMs:3,reusedModel:false}}}};}
test('all four fixed built assets exactly match pinned public baseline bytes',()=>{
  for(const[name,pin]of Object.entries(LEGACY_DIST)){const bytes=fs.readFileSync(path.join(root,'dist/assets',name));assert.equal(bytes.length,pin.bytes);assert.equal(sha256(bytes),pin.sha256);}
});
test('quality checkpoint preserves exact five-second frame counts and original identity',()=>{
  validateLegacyQuality(quality(),row,digest);
  for(const mutate of [x=>x.clipId='other',x=>x.pcmSha256='b'.repeat(64),x=>x.analysis.frameCount=1,x=>x.analysis.qualityCodes=['clipped'],x=>x.inputUnchanged=false,x=>x.pcm=[1]]){const x=quality();mutate(x);assert.throws(()=>validateLegacyQuality(x,row,digest));}
});
test('blocking quality and technical quality errors are explicit, never eligible',()=>{
  const blocked=quality();blocked.analysis.qualityCodes=['clipped'];blocked.outcome='blocked-by-quality';validateLegacyQuality(blocked,row,digest);
  const failed=quality();failed.analysis=null;failed.outcome='quality-error';failed.error='analysis failed';validateLegacyQuality(failed,row,digest);
  failed.outcome='quality-eligible';assert.throws(()=>validateLegacyQuality(failed,row,digest));
});
test('legacy result stays top2/uncertain and original provisional gate is retained',()=>{
  const x=result();validateLegacyCheckpoint(x,row,digest);
  for(const mutate of [x=>x.rawResponse.result.status='confident',x=>x.rawResponse.result.provisionalGatePassed=false,x=>x.rawResponse.result.rankings.push({label:LEGACY_LABELS[2],score:.01}),x=>x.rawResponse.result.preprocessing.originalSampleRateHz=44100,x=>x.rawResponse.sessionId=2,x=>x.rawResponse.result.rankings[0].label='buzz',x=>x.pcm=[0,1]]){const y=result();mutate(y);assert.throws(()=>validateLegacyCheckpoint(y,row,digest));}
});
test('blocked/error outcomes are retained and cannot impersonate a valid result',()=>{
  const x=result();x.analysis.qualityCodes=['near-zero'];x.outcome='blocked-by-quality';x.rawResponse=null;delete x.resampledPcmSha256;validateLegacyCheckpoint(x,row,digest);
  x.analysis.qualityCodes=[];assert.throws(()=>validateLegacyCheckpoint(x,row,digest));
  const error=result();error.outcome='error';error.rawResponse={type:'error',sessionId:1,code:'runtime',message:'Pipeline failed'};validateLegacyCheckpoint(error,row,digest);
});
test('smoke pins every field of the exact two synthetic inputs, including generator and PCM',()=>{
  const raw=fs.readFileSync(path.join(root,'ml/runs/2026-10-18-v3-startup-selftest/staged/manifest.json')),staged=JSON.parse(raw);validateLegacyManifest(staged,'smoke',raw);
  for(const mutate of [x=>x.records[0].pcm_sha256=digest,x=>x.records[0].clip_id='real',x=>x.records[0].sample_rate=48000,x=>x.records[0].source_record.generatorSha256=digest,x=>x.records.reverse()]){const x=structuredClone(staged);mutate(x);assert.throws(()=>validateLegacyManifest(x,'smoke',raw));assert.throws(()=>validateLegacyManifest(x,'smoke',Buffer.from(JSON.stringify(x))));}
});
test('final preflight independently binds raw source bytes and entire record/order/direct identity',()=>{
  const raw=fs.readFileSync(path.join(root,'ml/runs/2026-10-18-v3-data/final-data.json')),source=JSON.parse(raw);
  const staged={schemaVersion:1,sourceManifestSha256:sha256(raw),records:source.records.map((s,i)=>({row:i,clip_id:s.clip_id,label:s.label,split:s.split,uploader:s.uploader,source_sha256:s.sha256,pcm_sha256:s.pcm_sha256,sample_rate:s.sample_rate,sample_count:s.samples,source_record:s}))};
  validateLegacyManifest(staged,'final',raw);assert.throws(()=>validateLegacyManifest(staged,'final'));
  for(const mutate of [x=>x.records[0].source_record.uploader_group='other',x=>x.records[0].source_record.original_sha256=digest,x=>x.records[0].label='other',x=>x.records[0].uploader='other',x=>x.records[0].source_sha256=digest,x=>x.records[0].pcm_sha256=digest,x=>x.records[0].sample_count=1,x=>x.records.reverse()]){const x=structuredClone(staged);mutate(x);assert.throws(()=>validateLegacyManifest(x,'final',raw));}
  assert.throws(()=>validateLegacyManifest(staged,'final',Buffer.from(JSON.stringify(source))));
});
test('browser sidecar binds both phase contracts and exact measured identity across resume',()=>{
  const browser={userAgent:'Chrome/155',platform:'Win32',hardwareConcurrency:16,language:'en-US'},evidence={schemaVersion:1,qualityContractSha256:digest,baselineContractSha256:digest,browser,capturePhase:'before-baseline-classification',promotionAllowed:false};
  validateLegacyBrowserEvidence(evidence,browser,digest,digest);
  for(const mutate of [x=>x.browser.userAgent='Chrome/156',x=>x.browser.hardwareConcurrency=8,x=>x.browser.audio=[1],x=>x.qualityContractSha256='b'.repeat(64),x=>x.baselineContractSha256='b'.repeat(64),x=>x.capturePhase='after',x=>x.promotionAllowed=true]){const x=structuredClone(evidence);mutate(x);assert.throws(()=>validateLegacyBrowserEvidence(x,browser,digest,digest));}
});
