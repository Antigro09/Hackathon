/** Local synthetic-only browser harness. No app or microphone integration. */
const GENERATOR_SHA='cf4c6a95f4b5108c4c906829385f062a66ccf363a2ece78c49da31b634af4105';
const REFERENCE_SHA='6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d';
const status=document.getElementById('status');
const state={phase:'idle',cases:[],errors:[],messages:[],classifierIncluded:false,promotionAllowed:false};
let worker=null,sequence=0,ready=false;
const pending=new Map();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),byte=>byte.toString(16).padStart(2,'0')).join('');
const arrayBytes=value=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);
const show=()=>{status.textContent=JSON.stringify(state,null,2);};
function spawn() {
  if(worker)return;
  worker=new Worker('/assets/productionWorkerV3.mjs',{type:'module'});
  worker.addEventListener('message',event=>{
    const message=event.data;
    state.messages.push({type:message.type,requestId:message.requestId,phase:message.phase,code:message.code});
    if(message.type==='status')state.phase=message.phase;
    else {
      const operation=pending.get(message.requestId);
      if(operation){pending.delete(message.requestId);if(message.type==='error'||message.type==='cancelled')operation.reject(Error(message.code??message.type));else operation.resolve(message);}
    }
    show();
  });
  worker.addEventListener('error',event=>{state.phase='error';state.errors.push(event.message);for(const operation of pending.values())operation.reject(Error(event.message));pending.clear();show();});
}
function request(type,extra={}) {
  spawn();const requestId=`qa-${++sequence}`;
  return new Promise((resolve,reject)=>{pending.set(requestId,{resolve,reject});worker.postMessage({type,requestId,...extra});});
}
async function initialize() {
  state.phase='initializing';show();
  try {const result=await request('initialize');ready=true;state.phase='ready';state.startupProvenance=result.provenance;show();return result;}
  catch(error){state.phase='error';state.errors.push(error.message);show();throw error;}
}
async function getVerifiedSelfTest() {
  const [moduleResponse,referenceResponse]=await Promise.all([fetch('/assets/selfTestV3.mjs',{credentials:'omit',redirect:'error'}),fetch('/assets/self-test-v3-reference.json',{credentials:'omit',redirect:'error'})]);
  if(!moduleResponse.ok||!referenceResponse.ok)throw Error('Synthetic harness assets unavailable');
  const [moduleBytes,referenceBytes]=await Promise.all([moduleResponse.arrayBuffer(),referenceResponse.arrayBuffer()]);
  if(await sha(moduleBytes)!==GENERATOR_SHA||await sha(referenceBytes)!==REFERENCE_SHA)throw Error('Synthetic harness asset mismatch');
  const url=URL.createObjectURL(new Blob([moduleBytes],{type:'text/javascript'}));
  try{return{module:await import(url),reference:JSON.parse(new TextDecoder().decode(referenceBytes))};}
  finally{URL.revokeObjectURL(url);}
}
async function run() {
  try {
    if(!ready)await initialize();
    const verified=await getVerifiedSelfTest();state.cases=[];
    for(const expected of verified.reference.cases) {
      const input=verified.module.generateSelfTestV3Input(expected.id),before=await sha(arrayBytes(input.samples));
      const result=await request('extract',{pcm:input.samples,sampleRateHz:input.sampleRate});
      const embeddingSha256=await sha(arrayBytes(result.embedding));
      const inputUnchanged=before===await sha(arrayBytes(input.samples));
      for(const key of ['inputSha256','resampledPcmSha256','featureSha256','embeddingSha256'])if(result.provenance[key]!==expected[key])throw Error(`Synthetic stage mismatch: ${key}`);
      if(!inputUnchanged||embeddingSha256!==expected.embeddingSha256)throw Error('Synthetic embedding/input mismatch');
      state.cases.push({id:expected.id,inputUnchanged,allStageHashesExact:true,embeddingSha256,sampleRateHz:result.provenance.sampleRateHz,
        sampleCount:result.provenance.sampleCount,embeddingDimension:result.embedding.length,provenance:result.provenance});show();
    }
    state.phase='complete';state.allSyntheticStagesExact=true;show();return structuredClone(state);
  }catch(error){state.phase='error';state.errors.push(error.message);show();throw error;}
}
async function dispose() {
  try {if(worker)await request('dispose');}
  finally {if(worker)worker.terminate();worker=null;ready=false;state.phase='disposed';show();}
  return structuredClone(state);
}
async function runQualification() {
  try {
    if(!ready)await initialize();
    const response=await fetch('/qualification.json',{credentials:'omit',redirect:'error'});if(!response.ok)throw Error('Fixed26 qualification not enabled');
    const fixed=await response.json();
    if(fixed.schemaVersion!==1||fixed.stagedManifestSha256!=='25448ca576662cf21511b2f691100e6e8d93d4f76c985bc35e6da55430f63e68'
      ||fixed.referenceSha256!=='f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4'||fixed.records.length!==26||fixed.productionData!==false)throw Error('Unexpected qualification set');
    state.qualification={stagedManifestSha256:fixed.stagedManifestSha256,referenceSha256:fixed.referenceSha256,softwareParityOnly:true,productionData:false,cases:[]};
    for(const expected of fixed.records) {
      if(!Number.isInteger(expected.row)||expected.row<0||expected.row>=26)throw Error('Invalid fixed row');
      const pcmResponse=await fetch(`/qualification/pcm/${expected.row}`,{credentials:'omit',redirect:'error'});if(!pcmResponse.ok)throw Error('Fixed PCM unavailable');
      const source=await pcmResponse.arrayBuffer();if(await sha(source)!==expected.inputSha256)throw Error('Fixed PCM hash mismatch');
      const pcm=new Float32Array(source),result=await request('extract',{pcm,sampleRateHz:expected.sampleRateHz});
      const inputUnchanged=await sha(source)===expected.inputSha256;
      for(const key of ['inputSha256','resampledPcmSha256','featureSha256','embeddingSha256'])if(result.provenance[key]!==expected[key])throw Error(`Qualification stage mismatch row${expected.row}: ${key}`);
      const vector=Array.from(result.embedding),maxAbs=Math.max(...vector.map((value,index)=>Math.abs(value-expected.normalizedEmbedding512[index])));
      if(!inputUnchanged||vector.length!==512||maxAbs!==0||await sha(arrayBytes(result.embedding))!==expected.embeddingSha256)throw Error('Qualification full vector/input mismatch');
      state.qualification.cases.push({row:expected.row,id:expected.id,inputUnchanged,allStageHashesExact:true,embeddingMaxAbs:0,normalizedEmbedding512:vector,provenance:result.provenance});show();
    }
    state.qualification.all26Exact=true;state.phase='qualification-complete';show();return structuredClone(state);
  }catch(error){state.phase='error';state.errors.push(error.message);show();throw error;}
}
document.getElementById('initialize').addEventListener('click',()=>{void initialize().catch(()=>{});});
document.getElementById('run').addEventListener('click',()=>{void run().catch(()=>{});});
document.getElementById('dispose').addEventListener('click',()=>{void dispose().catch(error=>{state.errors.push(error.message);show();});});
document.getElementById('qualification').addEventListener('click',()=>{void runQualification().catch(()=>{});});
window.productionV3Harness={state,initialize,run,runQualification,dispose};show();
