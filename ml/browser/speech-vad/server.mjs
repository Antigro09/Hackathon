import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'output/speech-vad-study'),research=path.join(root,'ml/browser/speech-vad'),vendor=path.join(root,'public/ai/canonical-v3');
const routes=new Map([
 ['/vendor/ort.wasm.bundle.min.mjs',path.join(vendor,'ort.wasm.bundle.min.mjs')],
 ['/vendor/ort-wasm-simd-threaded.mjs',path.join(vendor,'runtime/ort-wasm-simd-threaded.mjs')],
 ['/vendor/ort-wasm-simd-threaded.wasm',path.join(vendor,'runtime/ort-wasm-simd-threaded.wasm')],
 ...['page.mjs','vad.mjs','resample16k.mjs'].map(x=>['/research/'+x,path.join(research,x)])
]);
const inputs=JSON.parse(await readFile(path.join(out,'inputs16k.json'),'utf8'));
for(const name of ['inputs16k.json','cpu-reference.json','silero_vad_16k_op15.onnx',...inputs.records.map(x=>x.file)])routes.set('/data/'+name,path.join(out,name));
http.createServer(async(req,res)=>{
 try {
  if(req.method==='POST'&&req.url==='/result') {
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw new Error('Too large');chunks.push(chunk);}
    const value=JSON.parse(Buffer.concat(chunks));if(value.status!=='complete'||value.records?.length!==12)throw new Error('Unexpected result');
    await writeFile(path.join(out,'browser-proof.json'),JSON.stringify(value,null,2)+'\n');res.end('saved');return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Speech VAD research</title><h1>Prospective local speech screen</h1><button id="run">Run fixed study</button><pre id="status">idle</pre><script type="module" src="/research/page.mjs"></script>');return;}
  const file=routes.get(req.url);if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(await readFile(file));
 }catch(error){res.writeHead(500);res.end(String(error));}
}).listen(4194,'127.0.0.1',()=>console.log('Speech study http://127.0.0.1:4194'));
