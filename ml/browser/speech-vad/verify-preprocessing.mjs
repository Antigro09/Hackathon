import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resample16k} from './resample16k.mjs';
import {speechIntervals} from './vad.mjs';
const out=new URL('../../../output/speech-vad-study/',import.meta.url);
const json=async name=>JSON.parse(await readFile(new URL(name,out),'utf8'));
const float=async name=>{const b=await readFile(new URL(name,out));return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const manifest=await json('inputs.json'), report={segmentationCases:0,resampling:[]};
for(const row of await json('upstream-segmentation-fixtures.json')){assert.deepEqual(speechIntervals(row.probabilities,row.samples),row.intervals);report.segmentationCases++;}
for(const row of manifest.resamplingReferences) {
  const input=await float(row.input),expected=await float(row.expected), before=input.slice(), actual=resample16k(input,row.rate);
  assert.deepEqual(input,before);assert.equal(actual.length,expected.length);
  let maxError=0;for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-expected[i]));
  // The Float32 implementation is expected to be byte-identical to the frozen independent reference.
  assert.deepEqual(actual,expected);
  const interior=actual.subarray(1600,actual.length-1600);
  const rms=Math.sqrt(interior.reduce((sum,x)=>sum+x*x,0)/interior.length);
  if(row.kind==='high-frequency')assert.ok(rms<.001,'12kHz must be rejected before downsampling');
  report.resampling.push({id:row.id,maxError,rms,sha256:createHash('sha256').update(new Uint8Array(actual.buffer)).digest('hex')});
}
for(const rate of [44100,48000])assert.throws(()=>resample16k(Float32Array.from([NaN]),rate));
assert.throws(()=>resample16k(new Float32Array(31*44100),44100));
await writeFile(new URL('preprocessing-proof.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
