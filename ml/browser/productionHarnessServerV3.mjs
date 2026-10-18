/** Loopback-only, immutable snapshot, GET-only synthetic worker qualification server. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const options=new Map();
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i]?.slice(2);if(!process.argv[i]?.startsWith('--')||!process.argv[i+1]||!['assets','cache','port','log','qualification-manifest','qualification-reference'].includes(key)||options.has(key))throw Error('Expected unique allowlisted arguments');options.set(key,process.argv[i+1]);}
if(!options.has('assets'))throw Error('Usage: node ml/browser/productionHarnessServerV3.mjs --assets QUALIFIED_STATIC_DIR [--cache CACHE] [--port 4192] [--log output/requests.json]');
const port=Number(options.get('port')??4192);if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port');
const assets=path.resolve(options.get('assets')),routes=new Map(),requests=[];
const manifestBytes=fs.readFileSync(path.join(assets,'asset-manifest.json')),manifest=JSON.parse(manifestBytes);
if(manifest.packageKind!=='tw-canonical-v3-runtime-assets'||manifest.promotionAllowed!==false||manifest.activationReady!==false||!manifest.syntheticSelfTest)throw Error('A self-test-enabled unpromoted asset package is required');
const add=(route,bytes,type)=>{if(routes.has(route))throw Error('Duplicate route');routes.set(route,{bytes,type,sha256:sha(bytes)});};
for(const[name,metadata]of Object.entries(manifest.files)) {
  if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.split('/').includes('..')||path.isAbsolute(name))throw Error('Unsafe manifest asset path');
  const file=path.resolve(assets,name);if(!file.startsWith(assets+path.sep))throw Error('Asset escaped static directory');
  const bytes=fs.readFileSync(file);if(bytes.length!==metadata.bytes||sha(bytes)!==metadata.sha256)throw Error(`Static asset mismatch ${name}`);
  add(`/assets/${name}`,bytes,metadata.contentType);
}
add('/assets/asset-manifest.json',manifestBytes,'application/json');
const model=fs.readFileSync(path.join(path.resolve(options.get('cache')??path.join(root,'output/ml-cache')),'c28f2883575e590e04d3146ff0713c2448d691ba/onnx/audio_model_quantized.onnx'));
if(model.length!==34301667||sha(model)!=='3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f')throw Error('Pinned audio-only graph mismatch');
add('/assets/audio_model_quantized.onnx',model,'application/octet-stream');
add('/assets/productionWorkerV3.mjs',fs.readFileSync(path.join(here,'productionWorkerV3.mjs')),'text/javascript');
add('/harness.mjs',fs.readFileSync(path.join(here,'productionHarnessV3.mjs')),'text/javascript');
if(options.has('qualification-manifest')!==options.has('qualification-reference'))throw Error('Both fixed qualification inputs are required');
if(options.has('qualification-manifest')) {
  const stagedPath=path.resolve(options.get('qualification-manifest')),stagedBytes=fs.readFileSync(stagedPath),referenceBytes=fs.readFileSync(path.resolve(options.get('qualification-reference')));
  const stagedSha=sha(stagedBytes),referenceSha=sha(referenceBytes);
  if(stagedSha!=='25448ca576662cf21511b2f691100e6e8d93d4f76c985bc35e6da55430f63e68'||referenceSha!=='f713e30fb35ed458a3ec80337476bf2e0feccf627e8a2e5d27248563610404f4')throw Error('Only the fixed original26 qualification set/reference is allowed');
  const staged=JSON.parse(stagedBytes),reference=JSON.parse(referenceBytes);
  if(staged.records.length!==26||reference.records.length!==26)throw Error('Incomplete fixed qualification set');
  const records=staged.records.map((row,index)=>{
    const golden=reference.records[index];
    if(row.row!==index||golden.clip_id!==row.clip_id||golden.pcm_sha256!==row.pcm_sha256||row.sample_count!==row.sample_rate*5)throw Error('Qualification row mismatch');
    const file=path.resolve(path.dirname(stagedPath),row.pcm_path);
    if(!file.startsWith(path.dirname(stagedPath)+path.sep))throw Error('Qualification path escaped staged directory');
    const pcm=fs.readFileSync(file);if(pcm.length!==row.sample_count*4||sha(pcm)!==row.pcm_sha256)throw Error('Qualification PCM mismatch');
    add(`/qualification/pcm/${index}`,pcm,'application/octet-stream');
    const expected=golden.checkpoint.repeats[0];
    return{row:index,id:row.clip_id,sampleRateHz:row.sample_rate,sampleCount:row.sample_count,inputSha256:row.pcm_sha256,
      resampledPcmSha256:expected.pcm48Sha256,featureSha256:expected.featureSha256,embeddingSha256:expected.embeddingSha256,normalizedEmbedding512:golden.checkpoint.embedding};
  });
  add('/qualification.json',Buffer.from(JSON.stringify({schemaVersion:1,stagedManifestSha256:stagedSha,referenceSha256:referenceSha,softwareParityOnly:true,productionData:false,
    scope:'Original20 historical validation/ood-validation plus6 generated inputs; MIMII-containing cases are noncommercial software-parity research only, never production training data.',records})),'application/json');
}
add('/',Buffer.from('<!doctype html><meta charset="utf-8"><title>Canonical worker qualification</title><h1>Research worker: numerical qualification only</h1><p>No microphone, classifier or promotion. Optional original26 fixtures are software-parity research, never production data.</p><button id="initialize">Initialize verified runtime</button> <button id="run">Run two synthetic checks</button> <button id="qualification">Run fixed26 qualification</button> <button id="dispose">Dispose worker</button><pre id="status"></pre><script type="module" src="/harness.mjs"></script>'),'text/html');
const origin=`http://127.0.0.1:${port}`,log=options.has('log')?path.resolve(options.get('log')):null;
if(log)fs.mkdirSync(path.dirname(log),{recursive:true});
const evidence={schemaVersion:1,origin,immutableSnapshot:true,assetManifestSha256:sha(manifestBytes),workerSha256:routes.get('/assets/productionWorkerV3.mjs').sha256,
  routes:Object.fromEntries([...routes].map(([route,value])=>[route,{sha256:value.sha256,bytes:value.bytes.length,type:value.type}])),requests,promotionAllowed:false};
const save=()=>{if(log)fs.writeFileSync(log,JSON.stringify(evidence,null,2));};
const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,origin).pathname;
  const entry={method:request.method,path:pathname,status:200};requests.push(entry);if(requests.length>2000)requests.shift();
  if(request.headers.host!==`127.0.0.1:${port}`){entry.status=403;response.writeHead(403).end();save();return;}
  if(request.method!=='GET'){entry.status=405;response.writeHead(405).end();save();return;}
  if(pathname==='/favicon.ico'){entry.status=204;response.writeHead(204).end();save();return;}
  const item=pathname==='/requests.json'?{bytes:Buffer.from(JSON.stringify(evidence)),type:'application/json'}:routes.get(pathname);
  if(!item){entry.status=404;response.writeHead(404).end('Not found');save();return;}
  response.writeHead(200,{'Content-Type':item.type,'Content-Length':item.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'"});
  response.end(item.bytes);save();
});
server.listen(port,'127.0.0.1',()=>{save();console.log(JSON.stringify({event:'ready',origin,immutableRoutes:routes.size,workerSha256:evidence.workerSha256,assetManifestSha256:evidence.assetManifestSha256,promotionAllowed:false}));});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
