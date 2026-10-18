/** Exact deployed eight-description baseline contracts; no mapping or evaluation. */
import crypto from 'node:crypto';
export const LEGACY_LABELS=Object.freeze([
  'a buzzing indoor fluorescent light fixture or lamp ballast','an outdoor electrical transformer humming',
  'outdoor industrial ventilation fans or cooling machinery humming','a household fan or air conditioner running',
  'road traffic passing outside','wind blowing across a microphone','people talking in a room','a quiet room with background noise',
]);
export const LEGACY_BLOCKING=Object.freeze(['near-zero','clipped','near-full-scale','incomplete','unsupported-rate','non-finite','no-band-power']);
export const LEGACY_REVISION='c28f2883575e590e04d3146ff0713c2448d691ba';
export const LEGACY_DIST=Object.freeze({
  'soundHints.worker-BshSXPiJ.js':{bytes:5204,sha256:'26f40691a2c49f2c717beee0a4f415a1003db4f2d5c4c72ebc27cc2d644005b8'},
  'transformers.web-B7_wdX-V.js':{bytes:545164,sha256:'06dfd43d60e53f8c5c191f9054abf594297c4f577eb68b337b89cd26824af8af'},
  'analysis.worker-BwKrUFVx.js':{bytes:10766,sha256:'a5918dda07bf28fd7b705d797734185446be9d13ab0feb7f5b5a5025717d443f'},
  'ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm':{bytes:26861777,sha256:'49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082'},
});
export const LEGACY_REMOTE=Object.freeze({
  'config.json':{bytes:699,sha256:'39c6d90fe29cf2cce650dd5c92c38a1e35b130d9ce0bb98585222ad687ad979b'},
  'preprocessor_config.json':{bytes:541,sha256:'9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753'},
  'tokenizer_config.json':{bytes:1392,sha256:'2c964a338683aec3695ea37687271e75b40905233f5d2a5bbb9be8cb40c4d0a0'},
  'tokenizer.json':{bytes:2108774,sha256:'dc239041d98de27ffc3975473a1a23e3db4c937b23c138c38bbc66588bd247e5'},
  'onnx/model_quantized.onnx':{bytes:161024085,sha256:'3f559313ec268518193101007fc0569ee4b2cfac03e369091c50adb4795f5c5d'},
});
export const LEGACY_RUNTIME=Object.freeze({
  version:'1.31.0-dev.20260914-8d85527a0',
  'ort-wasm-simd-threaded.asyncify.mjs':{bytes:53057,sha256:'0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611'},
  'ort-wasm-simd-threaded.asyncify.wasm':LEGACY_DIST['ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm'],
});
export const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const need=(condition,message)=>{if(!condition)throw Error(`Legacy baseline: ${message}`);};
const fields=(value,allowed)=>value&&Object.keys(value).every(key=>allowed.includes(key));
export function validateLegacyManifest(manifest,mode) {
  need(manifest.schemaVersion===1&&Array.isArray(manifest.records)&&manifest.records.length>0,'invalid staged manifest');
  if(mode==='final')need(manifest.sourceManifestSha256==='197e24e42c36de1368f9cd25424c98a4f8935af7c60429c4521d8d80feaa9520'&&manifest.records.length===416,'fresh source must be the fixed416 cohort');
  else need(mode==='smoke'&&manifest.records.length===2&&manifest.records.every(row=>row.source_record?.kind==='synthetic-software-test'&&row.split==='software_check'),'smoke mode accepts only the2synthetic software inputs');
  const ids=new Set();
  for(const[row,record]of manifest.records.entries()) {
    need(record.row===row&&typeof record.clip_id==='string'&&record.clip_id&&!ids.has(record.clip_id),'invalid/duplicate row ID');ids.add(record.clip_id);
    need(hex(record.source_sha256)&&hex(record.pcm_sha256)&&[44100,48000].includes(record.sample_rate)&&record.sample_count===record.sample_rate*5,'invalid prepared PCM identity');
  }
}
export function validateLegacyQuality(value,row,contractSha256) {
  need(fields(value,['schemaVersion','row','clipId','sourceSha256','pcmSha256','contractSha256','outcome','analysis','inputUnchanged','error'])&&value.schemaVersion===1&&value.row===row.row&&value.clipId===row.clip_id&&value.sourceSha256===row.source_sha256&&value.pcmSha256===row.pcm_sha256&&value.contractSha256===contractSha256&&value.inputUnchanged===true,'quality identity/integrity mismatch');
  if(value.outcome==='quality-error'){need(value.analysis===null&&typeof value.error==='string'&&value.error.length<=2000,'invalid quality error');return value;}
  const q=value.analysis;
  need(fields(q,['algorithmVersion','sampleRateHz','sampleCount','durationSeconds','frameCount','qualityCodes'])&&q.algorithmVersion==='tw-screen-v2'&&q.sampleRateHz===row.sample_rate&&q.sampleCount===row.sample_count&&q.durationSeconds===5&&q.frameCount===Math.floor((row.sample_count-8192)/4096)+1&&Array.isArray(q.qualityCodes)&&q.qualityCodes.every(code=>typeof code==='string')&&value.error===null,'invalid common quality analysis');
  const blocked=q.qualityCodes.some(code=>LEGACY_BLOCKING.includes(code));need(value.outcome===(blocked?'blocked-by-quality':'quality-eligible'),'quality mask changed');return value;
}
/** Preserve the exact top2/raw provisional policy; do not invent all8 scores. */
export function validateLegacyCheckpoint(value,row,contractSha256) {
  need(fields(value,['schemaVersion','row','clipId','sourceSha256','pcmSha256','contractSha256','qualityArtifactSha256','analysis','inputUnchanged','outcome','rawResponse','resampledPcmSha256']),'unexpected checkpoint fields');
  need(value?.schemaVersion===1&&value.row===row.row&&value.clipId===row.clip_id&&value.sourceSha256===row.source_sha256&&value.pcmSha256===row.pcm_sha256&&value.contractSha256===contractSha256,'checkpoint input/contract mismatch');
  const q=value.analysis;
  need(q&&q.algorithmVersion==='tw-screen-v2'&&q.sampleRateHz===row.sample_rate&&q.sampleCount===row.sample_count&&q.durationSeconds===5&&Array.isArray(q.qualityCodes)&&q.qualityCodes.every(code=>typeof code==='string'),'invalid shared quality metadata');
  need(typeof value.inputUnchanged==='boolean'&&value.inputUnchanged===true,'input changed');
  if(value.outcome==='blocked-by-quality') {need(q.qualityCodes.some(code=>LEGACY_BLOCKING.includes(code))&&value.rawResponse===null,'unsubstantiated quality block');return value;}
  if(value.outcome==='error') {need(value.rawResponse?.type==='error'&&value.rawResponse.sessionId===row.row+1&&['invalid-input','unavailable','runtime','harness-error'].includes(value.rawResponse.code)&&typeof value.rawResponse.message==='string'&&value.rawResponse.message.length<=2000,'invalid diagnostic error');return value;}
  need(value.outcome==='result'&&hex(value.resampledPcmSha256)&&!q.qualityCodes.some(code=>LEGACY_BLOCKING.includes(code)),'result bypassed shared quality');
  const message=value.rawResponse,r=message?.result;
  need(message?.type==='result'&&message.sessionId===row.row+1&&r?.status==='uncertain'&&r.modelId==='Xenova/clap-htsat-unfused'&&r.modelRevision===LEGACY_REVISION,'invalid legacy response');
  need(Array.isArray(r.rankings)&&r.rankings.length===2&&r.rankings.every(x=>LEGACY_LABELS.includes(x.label)&&Number.isFinite(x.score)&&x.score>=0&&x.score<=1)&&r.rankings[0].label!==r.rankings[1].label&&r.rankings[0].score>=r.rankings[1].score,'invalid original top2');
  const gate=r.rankings[0].score>=.55&&r.rankings[0].score-r.rankings[1].score>=.2;
  need(r.provisionalGatePassed===gate&&r.reason===(gate?'not-validated':'weak-separation'),'legacy gate was reinterpreted');
  const p=r.preprocessing;
  need(p?.originalSampleRateHz===row.sample_rate&&p.originalSampleCount===row.sample_count&&p.observationSeconds===5&&p.modelSampleRateHz===48000&&p.modelInputSamples===240000&&p.processorSeconds===10&&p.padding==='zero-pad'&&p.configuredPadding==='repeatpad'&&JSON.stringify(p.featureBandHz)==='[50,14000]','legacy preprocessing changed');
  need(r.timing&&['modelLoadMs','inferenceMs','totalMs'].every(key=>Number.isFinite(r.timing[key])&&r.timing[key]>=0)&&typeof r.timing.reusedModel==='boolean','invalid original timing');
  return value;
}
