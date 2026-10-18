import * as ort from '/vendor/ort.wasm.bundle.min.mjs';
import {runVad} from '/research/vad.mjs';
import {resample16k} from '/research/resample16k.mjs';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const fetchBytes=async(path,hash)=>{const response=await fetch(path);if(!response.ok)throw new Error('Missing'+path);const b=await response.arrayBuffer();if(hash&&await sha(b)!==hash)throw new Error('Hash mismatch'+path);return b;};
window.vadStudy={status:'idle'};
window.startVadStudy=async()=>{
  let session;
  try {
    window.vadStudy={status:'loading',records:[]};
    const manifest=await(await fetch('/data/inputs16k.json')).json(),reference=await(await fetch('/data/cpu-reference.json')).json();
    const vendor=[['/vendor/ort.wasm.bundle.min.mjs','17b52c1ac62b421dc508b4c28b9a9675251c6e25dd512ef54b83a5e2c4242869'],['/vendor/ort-wasm-simd-threaded.mjs','c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f'],['/vendor/ort-wasm-simd-threaded.wasm','06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3']];
    const resources=[];for(const [path,hash] of vendor)resources.push(await fetchBytes(path,hash));
    const model=await fetchBytes('/data/silero_vad_16k_op15.onnx','7ed98ddbad84ccac4cd0aeb3099049280713df825c610a8ed34543318f1b2c49');
    if(ort.env.versions.web!=='1.31.0-dev.20260914-8d85527a0')throw new Error('Unexpected ORT version');
    ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.simd='fixed';ort.env.wasm.wasmPaths={mjs:location.origin+'/vendor/ort-wasm-simd-threaded.mjs',wasm:location.origin+'/vendor/ort-wasm-simd-threaded.wasm'};
    ort.env.wasm.wasmBinary=new Uint8Array(resources[2]);
    const loaded=performance.now();session=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all',executionMode:'sequential'});
    window.vadStudy.modelLoadMs=performance.now()-loaded;window.vadStudy.ortVersion=ort.env.versions.web;window.vadStudy.userAgent=navigator.userAgent;
    if(session.inputNames.join()!=='input,state,sr'||session.outputNames.join()!=='output,stateN')throw new Error('Unexpected model interface');
    window.vadStudy.status='running';
    for(const row of manifest.records) {
      const source=new Float32Array(await fetchBytes('/data/'+row.file,row.sha256)),start=performance.now(),converted=resample16k(source,row.rate),resampleMs=performance.now()-start;
      if(await sha(converted.buffer)!==row.sha25616k)throw new Error('Browser resampler not exact');
      const before=await sha(converted.buffer),began=performance.now(),result=await runVad(ort,session,converted),firstMs=performance.now()-began;
      const repeated=await runVad(ort,session,converted);
      if(JSON.stringify(result)!==JSON.stringify(repeated))throw new Error('State reset/repeat mismatch');
      if(await sha(converted.buffer)!==before||await sha(source.buffer)!==row.sha256)throw new Error('Input mutation');
      const expected=reference.records.find(x=>x.id===row.id);let cpuMaximumError=0;
      for(let i=0;i<result.probabilities.length;i++)cpuMaximumError=Math.max(cpuMaximumError,Math.abs(result.probabilities[i]-expected.probabilities[i]));
      if(cpuMaximumError>2e-5||JSON.stringify(result.intervals)!==JSON.stringify(expected.intervals))throw new Error('CPU parity failure'+row.id+' '+cpuMaximumError);
      window.vadStudy.records.push({...row,...result,resampleMs,inferenceMs:firstMs,cpuMaximumError,repeatExact:true,inputUnchanged:true});
      document.getElementById('status').textContent=JSON.stringify({status:'running',completed:window.vadStudy.records.length,last:row.id,intervals:result.intervals});
    }
    window.vadStudy.status='complete';
    await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(window.vadStudy)});
  }catch(error){window.vadStudy.status='failed';window.vadStudy.error=String(error.stack||error);}
  finally{if(session)await session.release();window.vadStudy.disposed=true;document.getElementById('status').textContent=JSON.stringify(window.vadStudy,null,2);}
};
document.getElementById('run').addEventListener('click',window.startVadStudy);
