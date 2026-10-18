/** Research harness for the unmodified deployed worker. Never relabels scores. */
import {resampleForSoundHints} from '/resampler/resample.js';
const status=document.getElementById('status'),button=document.getElementById('run');
const state={phase:'idle',completed:0,errors:[],network:[],results:[],promotionAllowed:false};
const show=()=>{status.textContent=JSON.stringify({...state,results:state.results.map(x=>({row:x.row,outcome:x.outcome}))},null,2);};
const sha=async values=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',values)),x=>x.toString(16).padStart(2,'0')).join('');
const arrayBytes=x=>x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength);
let modelWorker=null,analysisWorker=null,cancelled=false;
let abortRun=null;
const blocking=['near-zero','clipped','near-full-scale','incomplete','unsupported-rate','non-finite','no-band-power'];
function ask(worker,message) {
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{worker.removeEventListener('message',listener);worker.removeEventListener('error',onError);abortRun?.signal.removeEventListener('abort',onAbort);clearTimeout(timer);};
    const listener=event=>{const data=event.data;if(data.sessionId!==message.sessionId)return;if(data.type==='progress'){state.progress=data;show();return;}cleanup();resolve(data);};
    const onError=event=>{cleanup();reject(Error(event.message));},onAbort=()=>{cleanup();reject(Error('Cancelled'));};
    const timer=setTimeout(()=>{cleanup();reject(Error('Worker request timed out'));},180000);
    worker.addEventListener('message',listener);worker.addEventListener('error',onError);abortRun?.signal.addEventListener('abort',onAbort,{once:true});worker.postMessage(message);
  });
}
async function run() {
  button.disabled=true;cancelled=false;abortRun=new AbortController();
  try {
    const config=await(await fetch('/run.json')).json();state.contractSha256=config.contractSha256;state.mode=config.mode;state.runPhase=config.phase;state.total=config.total;state.completed=config.completed;state.phase='running';show();
    if(config.phase==='classify'&&!window.legacyBaselineRoutingInstalled)throw Error('Install exact pinned remote artifact routing before running.');
    if(config.phase==='quality')analysisWorker=new Worker('/assets/analysis.worker-BwKrUFVx.js',{type:'module'});
    for(const row of config.records) {
      if(cancelled)throw Error('Cancelled');
      const source=await(await fetch(`/pcm/${row.row}`)).arrayBuffer();if(await sha(source)!==row.pcm_sha256)throw Error('Prepared PCM hash mismatch');
      const pcm=new Float32Array(source),sessionId=row.row+1;
      const checkpoint={schemaVersion:1,row:row.row,clipId:row.clip_id,sourceSha256:row.source_sha256,pcmSha256:row.pcm_sha256,contractSha256:config.contractSha256,inputUnchanged:false,rawResponse:null};
      if(config.phase==='quality') {
        delete checkpoint.rawResponse;checkpoint.error=null;
        try {
          const analysis=await ask(analysisWorker,{sessionId,pcm:pcm.slice(),fs:row.sample_rate,meta:{inputKind:config.mode==='smoke'?'synthetic':'imported-file',fixtureId:null,recordedAtUtc:null,channelPolicy:'first-channel',deviceSettings:null}});
          if(analysis.error)throw Error(analysis.error);const a=analysis.result;
          checkpoint.analysis={algorithmVersion:a.algorithmVersion,sampleRateHz:a.sampleRateHz,sampleCount:a.sampleCount,durationSeconds:a.durationSeconds,frameCount:a.frameCount,qualityCodes:a.qualityCodes};
          checkpoint.outcome=a.qualityCodes.some(code=>blocking.includes(code))?'blocked-by-quality':'quality-eligible';
        }catch(error){checkpoint.outcome='quality-error';checkpoint.analysis=null;checkpoint.error=String(error.message).slice(0,2000);}
      }else {
        checkpoint.analysis=row.quality.analysis;checkpoint.qualityArtifactSha256=config.qualityArtifactSha256;
        if(row.quality.outcome==='blocked-by-quality')checkpoint.outcome='blocked-by-quality';
        else {
        try {
          const prepared=await resampleForSoundHints(pcm.slice(),row.sample_rate);checkpoint.resampledPcmSha256=await sha(arrayBytes(prepared));
          modelWorker??=new Worker('/assets/soundHints.worker-BshSXPiJ.js',{type:'module'});
          checkpoint.rawResponse=await ask(modelWorker,{type:'classify',sessionId,pcm:prepared,sampleRateHz:48000,originalSampleRateHz:row.sample_rate,originalSampleCount:row.sample_count,qualityCodes:checkpoint.analysis.qualityCodes});
          checkpoint.outcome=checkpoint.rawResponse.type==='result'?'result':'error';
        }catch(error){checkpoint.outcome='error';checkpoint.rawResponse={type:'error',sessionId,code:'harness-error',message:String(error.message).slice(0,2000)};modelWorker?.terminate();modelWorker=null;}
        }
      }
      checkpoint.inputUnchanged=await sha(source)===row.pcm_sha256;
      if(cancelled)throw Error('Cancelled');
      const response=await fetch('/checkpoint',{method:'POST',headers:{'content-type':'application/json','x-run-token':config.token},body:JSON.stringify(checkpoint)});
      if(!response.ok)throw Error(`Checkpoint rejected: ${await response.text()}`);
      state.results.push(checkpoint);state.completed++;show();
    }
    state.phase='complete';
  }catch(error){state.phase=cancelled?'cancelled':'error';state.errors.push(String(error.message));}
  finally{modelWorker?.terminate();analysisWorker?.terminate();modelWorker=null;analysisWorker=null;button.disabled=false;show();}
  return state;
}
function cancel(){cancelled=true;abortRun?.abort();modelWorker?.terminate();analysisWorker?.terminate();state.phase='cancelled';show();}
button.addEventListener('click',()=>{void run();});document.getElementById('cancel').addEventListener('click',cancel);
window.legacyBaselineHarness={state,run,cancel};show();
