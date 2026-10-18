import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resample16k} from './resample16k.mjs';
const out=new URL('../../../output/speech-vad-study/',import.meta.url);
const inputs=JSON.parse(await readFile(new URL('inputs.json',out),'utf8'));
const proof=JSON.parse(await readFile(new URL('preprocessing-proof.json',out),'utf8'));
if(proof.segmentationCases!==2000||proof.resampling.length!==6)throw new Error('Preprocessing not qualified');
for(const row of inputs.records) {
 const b=await readFile(new URL(row.file,out));const pcm=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
 const converted=resample16k(pcm,row.rate),bytes=new Uint8Array(converted.buffer);
 row.file16k=row.id+'.16k.f32';row.samples16k=converted.length;row.sha25616k=createHash('sha256').update(bytes).digest('hex');
 await writeFile(new URL(row.file16k,out),bytes);
}
await writeFile(new URL('inputs16k.json',out),JSON.stringify(inputs,null,2)+'\n');
console.log(JSON.stringify({prepared16k:inputs.records.length,modelQueries:false}));
