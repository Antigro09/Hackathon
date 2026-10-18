/** Loopback baseline orchestration. Exact deployed assets; no final run without committed protocol. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {LEGACY_DIST,LEGACY_REMOTE,LEGACY_RUNTIME,LEGACY_LABELS,LEGACY_REVISION,sha256,validateLegacyManifest,validateLegacyCheckpoint,validateLegacyQuality} from './legacyBaselineV3.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),options=new Map();
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i]?.slice(2);if(!process.argv[i]?.startsWith('--')||!process.argv[i+1]||!['manifest','output','mode','phase','quality','quality-sha','dist','cache','port','protocol','protocol-sha','protocol-commit'].includes(key)||options.has(key))throw Error('Expected unique allowlisted --key value arguments');options.set(key,process.argv[i+1]);}
if(!options.has('manifest')||!options.has('output')||!['smoke','final'].includes(options.get('mode')))throw Error('Required: --manifest STAGED --output RUN --mode smoke|final; final additionally requires --protocol FILE --protocol-sha SHA --protocol-commit COMMIT');
const mode=options.get('mode'),out=path.resolve(options.get('output')),manifestPath=path.resolve(options.get('manifest')),manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes);
validateLegacyManifest(manifest,mode);
const phase=options.get('phase');if(!['quality','classify'].includes(phase))throw Error('Explicit --phase quality|classify required');
let protocol=null;
if(mode==='final') {
  const file=path.resolve(options.get('protocol')??''),expected=options.get('protocol-sha'),commit=options.get('protocol-commit');
  if(!/^[a-f0-9]{64}$/.test(expected??'')||!/^[a-f0-9]{40}$/.test(commit??'')||!file.startsWith(root+path.sep))throw Error('A pinned committed in-repository comparison protocol is required before final calls');
  const relative=path.relative(root,file).replaceAll('\\','/'),raw=fs.readFileSync(file);
  const committed=execFileSync('git',['show',`${commit}:${relative}`],{cwd:root,maxBuffer:2*1024*1024});
  execFileSync('git',['merge-base','--is-ancestor',commit,'HEAD'],{cwd:root});
  if(sha256(raw)!==expected||!raw.equals(committed))throw Error('Comparison protocol is not the exact committed artifact');
  protocol={path:relative,sha256:expected,commit};
}
const port=Number(options.get('port')??4193);if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const origin=`http://127.0.0.1:${port}`,dist=path.resolve(options.get('dist')??path.join(root,'dist')),cache=path.resolve(options.get('cache')??path.join(root,'output/ml-cache'),LEGACY_REVISION);
const routes=new Map(),remoteFiles=[];
let qualityArtifact=null,qualityArtifactSha256=null;
if(phase==='classify') {
  const raw=fs.readFileSync(path.resolve(options.get('quality')??''));qualityArtifactSha256=sha256(raw);
  if(qualityArtifactSha256!==options.get('quality-sha'))throw Error('Frozen quality raw SHA is required');qualityArtifact=JSON.parse(raw);
  if(qualityArtifact.kind!=='tw-legacy-common-quality-v1'||qualityArtifact.records.length!==manifest.records.length||qualityArtifact.contract.manifestSha256!==sha256(manifestBytes)||qualityArtifact.contract.phase!=='quality')throw Error('Incompatible common quality artifact');
  for(const[row,entry]of manifest.records.entries()) {
    const {checkpoint,...metadata}=qualityArtifact.records[row];if(!isDeepStrictEqual(metadata,entry))throw Error('Quality input metadata changed');validateLegacyQuality(checkpoint,entry,qualityArtifact.contractSha256);
    if(checkpoint.outcome==='quality-error')throw Error('Shared quality error must be resolved before either classifier');
  }
}
const add=(route,bytes,type)=>{if(routes.has(route))throw Error('Duplicate route');routes.set(route,{bytes,type,sha256:sha256(bytes)});};
const verify=(file,pin)=>{const bytes=fs.readFileSync(file);if(bytes.length!==pin.bytes||sha256(bytes)!==pin.sha256)throw Error(`Pinned baseline artifact changed: ${file}`);return bytes;};
for(const[name,pin]of Object.entries(LEGACY_DIST))if(phase==='classify'||name.startsWith('analysis.'))add(`/assets/${name}`,verify(path.join(dist,'assets',name),pin),name.endsWith('.wasm')?'application/wasm':'text/javascript');
for(const[name,pin]of Object.entries(phase==='classify'?LEGACY_REMOTE:{})) {
  const index=remoteFiles.length;add(`/remote/${index}`,verify(path.join(cache,name),pin),name.endsWith('.onnx')?'application/octet-stream':'application/json');
  remoteFiles.push({index,url:`https://huggingface.co/Xenova/clap-htsat-unfused/resolve/${LEGACY_REVISION}/${name}`,...pin});
}
for(const name of phase==='classify'?['ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm']:[]) {
  const pin=LEGACY_RUNTIME[name],index=remoteFiles.length;
  add(`/remote/${index}`,verify(path.join(root,'node_modules/onnxruntime-web/dist',name),pin),name.endsWith('.wasm')?'application/wasm':'text/javascript');
  remoteFiles.push({index,url:`https://cdn.jsdelivr.net/npm/onnxruntime-web@${LEGACY_RUNTIME.version}/dist/${name}`,...pin});
}
for(const row of manifest.records) {
  const file=path.resolve(path.dirname(manifestPath),row.pcm_path);
  if(!file.startsWith(path.dirname(manifestPath)+path.sep))throw Error('Prepared PCM path escaped staged directory');
  const pcm=verify(file,{bytes:row.sample_count*4,sha256:row.pcm_sha256});add(`/pcm/${row.row}`,pcm,'application/octet-stream');
}
fs.mkdirSync(path.join(out,'checkpoints'),{recursive:true});
const compiled=path.join(out,'compiled-resampler');
for(const[file,pin]of [['resample.ts','a73257786eb279a269e4df0bab86eeb2c1b8d682dcd3c32e8fba1df5b89efb81'],['model.ts','04f764ff1abd63d3342126b3d2bc26aaf752664319483f85885c963fa6b04388']])if(sha256(fs.readFileSync(path.join(root,'src/ai',file)))!==pin)throw Error('Original resampler sources changed');
if(JSON.parse(fs.readFileSync(path.join(root,'node_modules/typescript/package.json'))).version!=='7.0.2')throw Error('TypeScript7.0.2 required');
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--ignoreConfig',path.join(root,'src/ai/resample.ts'),path.join(root,'src/ai/model.ts'),'--target','ES2022','--module','ES2022','--moduleResolution','Bundler','--skipLibCheck','--outDir',compiled],{stdio:'pipe'});
add('/resampler/resample.js',verify(path.join(compiled,'resample.js'),{bytes:4233,sha256:'2ab0e2e2a8d3bbc8dc2d3608993c7b27c2df4726a20411e5054414f4223d0477'}),'text/javascript');
const model=verify(path.join(compiled,'model.js'),{bytes:1308,sha256:'a082366e74a74302ca4b55b3a333b53320d619bdc5f2a17a824cfd1b898f25b0'});add('/resampler/model',model,'text/javascript');add('/resampler/model.js',model,'text/javascript');
add('/legacy-page.mjs',fs.readFileSync(path.join(here,'legacyBaselinePageV3.mjs')),'text/javascript');
add('/',Buffer.from('<!doctype html><meta charset="utf-8"><title>Exact website baseline research</title><h1>Exact deployed eight-description baseline</h1><p>Research only. Original rankings remain uncertain. No microphone or uploads.</p><button id="run">Run authorized prepared inputs</button> <button id="cancel">Cancel</button><pre id="status"></pre><script type="module" src="/legacy-page.mjs"></script>'),'text/html');
const contract={schemaVersion:1,implementation:'tw-legacy-website-baseline-v1',mode,phase,protocol,qualityArtifactSha256,manifestSha256:sha256(manifestBytes),sourceManifestSha256:manifest.sourceManifestSha256??null,
  deployedOrigin:'https://tonalwatch.vercel.app',distAssets:LEGACY_DIST,remoteArtifacts:remoteFiles,labels:LEGACY_LABELS,
  originalWorkerReturns:'top2 only; preserve always-uncertain status/reason and provisional gate; no confidence probabilities',
  commonQuality:'exact deployed analysis.worker-BwKrUFVx.js on same original5s PCM; prepared-public import provenance; blocked outcomes retained',
  resamplerSha256:routes.get('/resampler/resample.js').sha256,
  execution:{transformersVersion:'4.3.1',ortVersion:LEGACY_RUNTIME.version,device:'wasm',dtype:'q8',numThreads:1,proxy:false,hypothesisTemplate:'{}',executedInThisPhase:phase==='classify',assertionBasis:'unchanged verified public worker and bundled source; transport artifact GET evidence'},
  sourceHashes:Object.fromEntries(['legacyBaselineServerV3.mjs','legacyBaselineV3.mjs','legacyBaselinePageV3.mjs','legacyBaselineRoutesV3.js'].map(name=>[name,sha256(fs.readFileSync(path.join(here,name)))])),
  environment:{node:process.version,platform:process.platform,architecture:process.arch},promotionAllowed:false};
const contractSha256=sha256(Buffer.from(JSON.stringify(contract))),contractFile=path.join(out,'contract.json');
if(fs.existsSync(contractFile)&&JSON.parse(fs.readFileSync(contractFile)).contractSha256!==contractSha256)throw Error('Run contract changed; choose a new output directory');
if(!fs.existsSync(contractFile))fs.writeFileSync(contractFile,JSON.stringify({contractSha256,contract},null,2),{flag:'wx'});
const completed=new Map(),checkpointFile=row=>path.join(out,'checkpoints',`${String(row).padStart(6,'0')}.json`);
const validateCheckpoint=(value,row)=>{
  if(phase==='quality')return validateLegacyQuality(value,row,contractSha256);
  validateLegacyCheckpoint(value,row,contractSha256);
  if(value.qualityArtifactSha256!==qualityArtifactSha256||!isDeepStrictEqual(value.analysis,qualityArtifact.records[row.row].checkpoint.analysis))throw Error('Frozen common quality mask changed');return value;
};
for(const row of manifest.records)if(fs.existsSync(checkpointFile(row.row)))completed.set(row.row,validateCheckpoint(JSON.parse(fs.readFileSync(checkpointFile(row.row))),row));
const atomic=(file,value)=>{const bytes=Buffer.from(JSON.stringify(value,null,2));if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))return;const temp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file);};
const finish=()=>{
  if(completed.size!==manifest.records.length)return;const records=manifest.records.map(row=>({...row,checkpoint:completed.get(row.row)}));
  if(phase==='quality') {
    const count=rows=>({total:rows.length,eligible:rows.filter(x=>x.checkpoint.outcome==='quality-eligible').length,blocked:rows.filter(x=>x.checkpoint.outcome==='blocked-by-quality').length,error:rows.filter(x=>x.checkpoint.outcome==='quality-error').length});
    atomic(path.join(out,'quality-results.json'),{schemaVersion:1,kind:'tw-legacy-common-quality-v1',contractSha256,contract,records,
      counts:{...count(records),perClass:Object.fromEntries([...new Set(records.map(x=>x.label))].sort().map(label=>[label,count(records.filter(x=>x.label===label))]))},promotionAllowed:false});
  }else atomic(path.join(out,'baseline-results.json'),{schemaVersion:1,contractSha256,contract,records,outcomeCounts:Object.fromEntries(['result','blocked-by-quality','error'].map(outcome=>[outcome,records.filter(x=>x.checkpoint.outcome===outcome).length])),promotionAllowed:false});
};finish();
const token=crypto.randomBytes(32).toString('hex'),requests=[];
const saveRequest=entry=>{if(entry)fs.appendFileSync(path.join(out,'requests.ndjson'),JSON.stringify({schemaVersion:1,contractSha256,...entry})+'\n');};
const server=http.createServer(async(request,response)=>{
  let entry;
  try {
    const pathname=new URL(request.url,origin).pathname;entry={method:request.method,path:pathname,status:200};requests.push(entry);
    if(request.headers.host!==`127.0.0.1:${port}`){entry.status=403;response.writeHead(403).end();return;}
    if(request.method==='POST'&&pathname==='/checkpoint') {
      if(request.headers.origin!==origin||request.headers['x-run-token']!==token||request.headers['content-type']!=='application/json'){entry.status=403;response.writeHead(403).end();return;}
      const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>16000)throw Error('Checkpoint exceeds bound');chunks.push(chunk);}
      const value=JSON.parse(Buffer.concat(chunks)),row=manifest.records[value.row];if(!row)throw Error('Unknown row');validateCheckpoint(value,row);
      if(completed.has(row.row))throw Error('Completed checkpoint is immutable');fs.writeFileSync(checkpointFile(row.row),JSON.stringify(value,null,2),{flag:'wx'});completed.set(row.row,value);finish();response.writeHead(200).end('saved');console.log(JSON.stringify({event:'checkpoint',completed:completed.size,total:manifest.records.length,row:row.row,outcome:value.outcome}));return;
    }
    if(request.method!=='GET'){entry.status=405;response.writeHead(405).end();return;}
    let item=routes.get(pathname);
    if(pathname==='/run.json')item={bytes:Buffer.from(JSON.stringify({token,contractSha256,mode,phase,qualityArtifactSha256,total:manifest.records.length,completed:completed.size,records:manifest.records.filter(row=>!completed.has(row.row)).map(row=>phase==='classify'?{...row,quality:qualityArtifact.records[row.row].checkpoint}:row)})),type:'application/json'};
    if(pathname==='/remote-manifest.json')item={bytes:Buffer.from(JSON.stringify({contractSha256,files:remoteFiles})),type:'application/json'};
    if(pathname==='/favicon.ico'){entry.status=204;response.writeHead(204).end();return;}
    if(!item){entry.status=404;response.writeHead(404).end('Not found');return;}
    response.writeHead(200,{'Content-Type':item.type,'Content-Length':item.bytes.length,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://huggingface.co https://cdn.jsdelivr.net; object-src 'none'; base-uri 'none'"});response.end(item.bytes);
  }catch(error){if(entry)entry.status=400;response.writeHead(400,{'Content-Type':'text/plain'}).end(String(error.message));}
  finally{saveRequest(entry);}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'ready',origin,mode,phase,completed:completed.size,total:manifest.records.length,contractSha256,predictionsStarted:false})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
