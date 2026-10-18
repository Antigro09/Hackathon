/** Research-only stateful Silero16k wrapper and upstream-default short-capture segmentation. */
export const POLICY=Object.freeze({rate:16000,window:512,context:64,threshold:.5,negative:.35,minSpeech:4000,minSilence:1600,pad:480});
export function speechIntervals(probabilities, samples) {
  if(!Number.isSafeInteger(samples)||samples<1||samples>480000||probabilities.length!==Math.ceil(samples/512)||probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw new Error('Invalid VAD probabilities');
  let triggered=false, start=0, tempEnd=0;
  const intervals=[];
  for(let i=0;i<probabilities.length;i++) {
    const p=probabilities[i], position=i*512;
    if(p>=POLICY.threshold&&tempEnd)tempEnd=0;
    if(p>=POLICY.threshold&&!triggered){triggered=true;start=position;continue;}
    if(p<POLICY.negative&&triggered) {
      if(!tempEnd)tempEnd=position;
      if(position-tempEnd<POLICY.minSilence)continue;
      if(tempEnd-start>POLICY.minSpeech)intervals.push({start,end:tempEnd});
      triggered=false;tempEnd=0;start=0;
    }
  }
  if(triggered&&samples-start>POLICY.minSpeech)intervals.push({start,end:samples});
  // Upstream padding divides small inter-segment gaps between neighbors.
  for(let i=0;i<intervals.length;i++) {
    const segment=intervals[i];
    if(i===0)segment.start=Math.max(0,segment.start-POLICY.pad);
    if(i!==intervals.length-1) {
      const gap=intervals[i+1].start-segment.end;
      if(gap<2*POLICY.pad){segment.end+=Math.floor(gap/2);intervals[i+1].start=Math.max(0,intervals[i+1].start-Math.floor(gap/2));}
      else{segment.end=Math.min(samples,segment.end+POLICY.pad);intervals[i+1].start=Math.max(0,intervals[i+1].start-POLICY.pad);}
    } else segment.end=Math.min(samples,segment.end+POLICY.pad);
  }
  return intervals.map(({start,end})=>({start:start/16000,end:end/16000}));
}
export async function runVad(ort,session,pcm,{guard=()=>{}}={}) {
  if(!(pcm instanceof Float32Array)||!pcm.length||pcm.length>480000||pcm.some(x=>!Number.isFinite(x)))throw new Error('Invalid16k bounded PCM');
  let state=new Float32Array(256), context=new Float32Array(64);
  const probabilities=[];
  for(let offset=0;offset<pcm.length;offset+=512) {
    guard();
    const input=new Float32Array(576);input.set(context);input.set(pcm.subarray(offset,Math.min(offset+512,pcm.length)),64);
    const feeds={input:new ort.Tensor('float32',input,[1,576]),state:new ort.Tensor('float32',state,[2,1,128]),sr:new ort.Tensor('int64',BigInt64Array.from([16000n]),[])};
    let outputs;
    try {
      outputs=await session.run(feeds);
      guard();
      if(outputs.output.dims.join()!=='1,1'||outputs.stateN.dims.join()!=='2,1,128')throw new Error('Unexpected Silero output shape');
      probabilities.push(outputs.output.data[0]);state=Float32Array.from(outputs.stateN.data);context=input.slice(-64);
    } finally {
      for(const value of Object.values(feeds))value.dispose();
      if(outputs)for(const value of Object.values(outputs))value.dispose();
    }
    if(offset%16384===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {probabilities,intervals:speechIntervals(probabilities,pcm.length)};
}
