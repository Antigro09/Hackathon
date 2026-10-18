/** Local, resumable browser-WASM extraction. Never serves arbitrary paths or proxies HTTP. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {CANONICAL_ENCODER} from './canonicalEncoder.mjs';
import {validateCanonicalCheckpoint} from './canonicalCheckpoint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || !process.argv[i + 1]) throw new Error('Expected --key value arguments');
  args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
for (const key of args.keys()) if (!['manifest', 'output', 'cache', 'port', 'repeats'].includes(key)) throw new Error(`Unknown argument ${key}`);
if (!args.has('manifest') || !args.has('output')) throw new Error('Usage: node ml/browser/canonicalServer.mjs --manifest staged/manifest.json --output output/run --port 4186 --repeats 2');
const port = Number(args.get('port') || 4186);
const repeatCount = Number(args.get('repeats') || 2);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || !Number.isSafeInteger(repeatCount) || repeatCount < 1 || repeatCount > 10) throw new Error('Invalid port or repeat count');
const origin = `http://127.0.0.1:${port}`;
const outputDir = path.resolve(args.get('output'));
fs.mkdirSync(path.join(outputDir, 'checkpoints'), {recursive: true});
const manifestFile = path.resolve(args.get('manifest'));
const manifestBytes = fs.readFileSync(manifestFile);
const manifest = JSON.parse(manifestBytes);
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.records) || !manifest.records.length) throw new Error('Invalid staged manifest');
const rows = manifest.records;
const ids = new Set();
for (const [index, row] of rows.entries()) {
  if (row.row !== index || typeof row.clip_id !== 'string' || !row.clip_id || ids.has(row.clip_id)) throw new Error('Invalid/duplicate manifest row ID');
  ids.add(row.clip_id);
  for (const key of ['source_sha256', 'pcm_sha256']) if (!/^[a-f0-9]{64}$/.test(row[key])) throw new Error(`Invalid ${key}`);
  if (![44100, 48000].includes(row.sample_rate) || row.sample_count !== row.sample_rate * 5) throw new Error('Invalid staged sample rate/count');
  const bytes = fs.readFileSync(path.resolve(path.dirname(manifestFile), row.pcm_path));
  if (bytes.length !== row.sample_count * 4 || sha(bytes) !== row.pcm_sha256) throw new Error(`PCM SHA/size mismatch at row ${index}`);
}
const cache = path.resolve(args.get('cache') || 'output/ml-cache', CANONICAL_ENCODER.revision);
const routeBytes = new Map();
const add = (route, file, expected = null) => {
  const bytes = fs.readFileSync(file);
  if (expected && sha(bytes) !== expected) throw new Error(`Pinned artifact SHA mismatch: ${file}`);
  routeBytes.set(route, bytes);
};
add('/canonicalEncoder.mjs', path.join(here, 'canonicalEncoder.mjs'));
add('/canonicalPage.mjs', path.join(here, 'canonicalPage.mjs'));
add('/transformers.web.js', path.join(root, 'node_modules/@huggingface/transformers/dist/transformers.web.js'));
const upstreamTransformersSha256 = sha(routeBytes.get('/transformers.web.js'));
// Resolve the two documented external imports to the SAME standard WASM bundle.
// The processor does not create an ONNX model; the explicit session below does.
routeBytes.set('/transformers.web.js', Buffer.from(routeBytes.get('/transformers.web.js').toString('utf8').replaceAll('"onnxruntime-web/webgpu"', '"/ort.wasm.bundle.min.mjs"').replaceAll('"onnxruntime-common"', '"/ort.wasm.bundle.min.mjs"')));
add('/ort.wasm.bundle.min.mjs', path.join(root, 'node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs'), CANONICAL_ENCODER.runtimeSha256['ort.wasm.bundle.min.mjs']);
for (const filename of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) add(`/runtime/${filename}`, path.join(root, 'node_modules/onnxruntime-web/dist', filename), CANONICAL_ENCODER.runtimeSha256[filename]);
for (const [filename, expected] of Object.entries({
  'config.json': '39c6d90fe29cf2cce650dd5c92c38a1e35b130d9ce0bb98585222ad687ad979b',
  'preprocessor_config.json': '9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753',
})) add(`/models/${CANONICAL_ENCODER.revision}/${filename}`, path.join(cache, filename), expected);
add('/audio_model_quantized.onnx', path.join(cache, CANONICAL_ENCODER.modelFile), CANONICAL_ENCODER.modelSha256);
const compiledDir = path.join(outputDir, 'compiled-app');
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--ignoreConfig', path.join(root, 'src/ai/resample.ts'), path.join(root, 'src/ai/model.ts'), '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'Bundler', '--outDir', compiledDir, '--skipLibCheck'], {stdio: 'pipe'});
for (const name of ['resample', 'model']) {
  routeBytes.set(`/app/${name}.js`, fs.readFileSync(path.join(compiledDir, `${name}.js`)));
}
routeBytes.set('/app/model', routeBytes.get('/app/model.js'));
const files = Object.fromEntries([...routeBytes].map(([route, bytes]) => [route, {sha256: sha(bytes), bytes: bytes.length}]));
const contract = {...CANONICAL_ENCODER, repeatCount, manifestSha256: sha(manifestBytes), files,
  upstreamTransformersSha256,
  resamplerSourceSha256: sha(fs.readFileSync(path.join(root, 'src/ai/resample.ts'))),
  serverSourceSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  checkpointValidatorSha256: sha(fs.readFileSync(path.join(here, 'canonicalCheckpoint.mjs'))),
  pcmFormat: 'little-endian IEEE754 Float32 mono, exact first five seconds; no browser decoder',
  sessionOptions: {executionProviders: ['wasm'], graphOptimizationLevel: 'all', executionMode: 'sequential'},
  promotionAllowed: false};
const contractSha256 = sha(Buffer.from(JSON.stringify(contract)));
const contractFile = path.join(outputDir, 'contract.json');
if (fs.existsSync(contractFile) && JSON.parse(fs.readFileSync(contractFile)).contractSha256 !== contractSha256) throw new Error('Output belongs to a different contract; choose a new output directory');
const atomicJson = (filename, value) => { const temp = `${filename}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2)); fs.renameSync(temp, filename); };
atomicJson(contractFile, {contractSha256, contract});
const checkpointFile = index => path.join(outputDir, 'checkpoints', `${String(index).padStart(6, '0')}.json`);
let browserIdentity = null;
function validateCheckpoint(value) {
  const row = rows[value.row];
  if (!row) throw new Error('Unknown checkpoint row');
  validateCanonicalCheckpoint(value, row, contractSha256, repeatCount);
  if (!value.browser || value.browser.transformersVersion !== CANONICAL_ENCODER.transformersVersion || value.browser.ortVersion !== CANONICAL_ENCODER.ortVersion || typeof value.browser.userAgent !== 'string' || typeof value.browser.platform !== 'string') throw new Error('Invalid browser identity');
  const identity = JSON.stringify(value.browser);
  if (browserIdentity && browserIdentity !== identity) throw new Error('Browser/environment changed; start a new extraction output');
  browserIdentity = identity;
  return value;
}
const completed = new Map();
for (const row of rows) if (fs.existsSync(checkpointFile(row.row))) completed.set(row.row, validateCheckpoint(JSON.parse(fs.readFileSync(checkpointFile(row.row)))));
function finishIfComplete() {
  if (completed.size !== rows.length) return;
  const results = rows.map(row => ({...row, checkpoint: completed.get(row.row)}));
  atomicJson(path.join(outputDir, 'embeddings.json'), {schemaVersion: 1, contractSha256, contract, records: results, promotionAllowed: false});
  console.log(JSON.stringify({event: 'complete', completed: completed.size, contractSha256, output: path.join(outputDir, 'embeddings.json')}));
}
finishIfComplete();
const token = crypto.randomBytes(32).toString('hex');
const server = http.createServer(async (request, response) => {
  try {
    if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403).end(); return; }
    const pathname = new URL(request.url, origin).pathname;
    if (request.method === 'POST' && pathname === '/checkpoint') {
      if (request.headers.origin !== origin || request.headers['x-run-token'] !== token || request.headers['content-type'] !== 'application/json') { response.writeHead(403).end(); return; }
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 32000) throw new Error('Checkpoint too large'); chunks.push(chunk); }
      const value = validateCheckpoint(JSON.parse(Buffer.concat(chunks)));
      if (completed.has(value.row)) throw new Error('Existing checkpoint is immutable');
      atomicJson(checkpointFile(value.row), value); completed.set(value.row, value);
      console.log(JSON.stringify({event: 'checkpoint', row: value.row, clipId: value.clipId, completed: completed.size, total: rows.length, inferenceMs: value.repeats.map(x => x.inferenceMs)}));
      finishIfComplete(); response.writeHead(200).end('saved'); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    let bytes;
    if (pathname === '/') bytes = Buffer.from('<!doctype html><meta charset="utf-8"><title>Local canonical audio extraction</title><h1>Local canonical audio extraction</h1><p>Research only. No classifier, score, or promotion.</p><button id="run">Extract local PCM</button><pre id="status">Ready</pre><script type="module" src="/canonicalPage.mjs"></script>');
    else if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    else if (pathname === '/run.json') bytes = Buffer.from(JSON.stringify({contract, contractSha256, token, resumed: completed.size, records: rows.filter(row => !completed.has(row.row)).map(({pcm_path, ...row}) => row)}));
    else if (/^\/pcm\/\d+$/.test(pathname)) { const row = rows[Number(pathname.slice(5))]; if (row) bytes = fs.readFileSync(path.resolve(path.dirname(manifestFile), row.pcm_path)); }
    else bytes = routeBytes.get(pathname);
    if (!bytes) { response.writeHead(404).end('Not found'); return; }
    const type = pathname === '/' ? 'text/html' : pathname.endsWith('.json') ? 'application/json' : pathname.endsWith('.wasm') ? 'application/wasm' : /\.(?:m?js)$/.test(pathname) || pathname === '/app/model' ? 'text/javascript' : 'application/octet-stream';
    response.writeHead(200, {'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'"});
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) { response.writeHead(400, {'Content-Type': 'text/plain'}).end(String(error.message)); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({event: 'ready', url: origin, total: rows.length, resumed: completed.size, contractSha256, repeatCount})));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
