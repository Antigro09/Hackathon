/** Research batch extraction with ONNX Runtime WEB WASM. No native backend. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {CANONICAL_ENCODER, createCanonicalEncoder} from './canonicalEncoder.mjs';
import {validateCanonicalCheckpoint} from './canonicalCheckpoint.mjs';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || !process.argv[i + 1]) throw new Error('Expected --key value pairs');
  options.set(process.argv[i].slice(2), process.argv[i + 1]);
}
for (const key of options.keys()) if (!['manifest', 'output', 'cache', 'dependencies', 'repeats', 'golden'].includes(key)) throw new Error(`Unknown option ${key}`);
if (!options.has('manifest') || !options.has('output')) throw new Error('Usage: node ml/browser/extractCanonicalNode.mjs --manifest staged/manifest.json --output output/canonical-run [--cache output/ml-cache] [--repeats 1] [--golden chrome/embeddings.json] [--dependencies ROOT_WITH_NODE_MODULES]');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dependencyRoot = path.resolve(options.get('dependencies') || root);
const out = path.resolve(options.get('output'));
const manifestFile = path.resolve(options.get('manifest'));
const manifestBytes = fs.readFileSync(manifestFile);
const manifest = JSON.parse(manifestBytes);
const repeats = Number(options.get('repeats') || 1);
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.records) || !manifest.records.length || !Number.isSafeInteger(repeats) || repeats < 1 || repeats > 10) throw new Error('Invalid manifest or repeat count');
if (new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] !== 4) throw new Error('Requires a little-endian runtime');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const arraySha = value => sha(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
const atomic = (file, value) => {const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, JSON.stringify(value, null, 2)); fs.renameSync(temporary, file);};
const ids = new Set();
for (const [index, record] of manifest.records.entries()) {
  if (record.row !== index || typeof record.clip_id !== 'string' || !record.clip_id || ids.has(record.clip_id)) throw new Error('Invalid/duplicate clip ID');
  ids.add(record.clip_id);
  if (![44100, 48000].includes(record.sample_rate) || record.sample_count !== record.sample_rate * 5) throw new Error('Invalid sample count/rate');
  for (const key of ['source_sha256', 'pcm_sha256']) if (!/^[a-f0-9]{64}$/.test(record[key])) throw new Error(`Invalid ${key}`);
  for (const key of ['label', 'split', 'uploader']) if (typeof record[key] !== 'string' || !record[key]) throw new Error(`Missing ${key}`);
  const bytes = fs.readFileSync(path.resolve(path.dirname(manifestFile), record.pcm_path));
  if (bytes.length !== record.sample_count * 4 || sha(bytes) !== record.pcm_sha256) throw new Error(`Input PCM SHA/length mismatch for ${record.clip_id}`);
}
const packageVersion = name => JSON.parse(fs.readFileSync(path.join(dependencyRoot, 'node_modules', name, 'package.json'))).version;
if (packageVersion('@huggingface/transformers') !== CANONICAL_ENCODER.transformersVersion || packageVersion('onnxruntime-web') !== CANONICAL_ENCODER.ortVersion || packageVersion('typescript') !== '7.0.2') throw new Error('Requires exact pinned Transformers.js4.3.1, ORT-Web1.31.0-dev.20260914-8d85527a0 and TypeScript7.0.2');
fs.mkdirSync(path.join(out, 'checkpoints'), {recursive: true});
const compiled = path.join(out, 'compiled-app');
execFileSync(process.execPath, [path.join(dependencyRoot, 'node_modules/typescript/bin/tsc'), '--ignoreConfig', path.join(root, 'src/ai/resample.ts'), path.join(root, 'src/ai/model.ts'), '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'Bundler', '--outDir', compiled, '--skipLibCheck'], {stdio: 'pipe'});
const ortRoot = path.join(dependencyRoot, 'node_modules/onnxruntime-web/dist');
const ortFile = path.join(ortRoot, 'ort.wasm.bundle.min.mjs');
const wasmFile = path.join(ortRoot, 'ort-wasm-simd-threaded.wasm');
const runtimeModule = path.join(ortRoot, 'ort-wasm-simd-threaded.mjs');
const transformerFile = path.join(dependencyRoot, 'node_modules/@huggingface/transformers/dist/transformers.web.js');
const source = fs.readFileSync(transformerFile, 'utf8');
const ortUrl = pathToFileURL(ortFile).href;
// Importing the package root in Node would choose onnxruntime-node. This uses
// only its browser bundle, explicitly linking BOTH external imports to ORT-Web.
const patched = source.replaceAll('"onnxruntime-web/webgpu"', JSON.stringify(ortUrl)).replaceAll('"onnxruntime-common"', JSON.stringify(ortUrl));
if (patched === source) throw new Error('Expected explicit browser-bundle imports were not found');
const ort = await import(ortUrl);
const processorModule = path.join(out, 'preprocessing.web.mjs');
fs.writeFileSync(processorModule, patched);
// Transformers.js explicitly supports this runtime override in backends/onnx.js.
// Its browser bundle otherwise chooses an empty native stub when run in Node.
const ortSymbol = Symbol.for('onnxruntime');
if (ortSymbol in globalThis && globalThis[ortSymbol] !== ort) throw new Error('Unexpected pre-existing ONNX runtime');
globalThis[ortSymbol] = ort;
const transformers = await import(pathToFileURL(processorModule).href);
const modelJs = fs.readFileSync(path.join(compiled, 'model.js'), 'utf8');
const resamplerJs = fs.readFileSync(path.join(compiled, 'resample.js'), 'utf8');
const modelUrl = 'data:text/javascript;base64,' + Buffer.from(modelJs).toString('base64');
const resampler = await import('data:text/javascript;base64,' + Buffer.from(resamplerJs.replace("'./model'", JSON.stringify(modelUrl))).toString('base64'));
const cache = path.resolve(options.get('cache') || path.join(root, 'output/ml-cache'), CANONICAL_ENCODER.revision);
const modelBytes = new Uint8Array(fs.readFileSync(path.join(cache, CANONICAL_ENCODER.modelFile)));
if (arraySha(modelBytes) !== CANONICAL_ENCODER.modelSha256) throw new Error('Pinned audio weights SHA mismatch');
const configBytes = fs.readFileSync(path.join(cache, 'preprocessor_config.json'));
if (sha(configBytes) !== '9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753') throw new Error('Pinned preprocessor SHA mismatch');
const runtimeHashes = Object.fromEntries([ortFile, wasmFile, runtimeModule].map(file => [path.basename(file), {sha256: sha(fs.readFileSync(file)), bytes: fs.statSync(file).size}]));
for (const [filename, value] of Object.entries(runtimeHashes)) if (value.sha256 !== CANONICAL_ENCODER.runtimeSha256[filename]) throw new Error('Pinned canonical WASM runtime SHA mismatch');
const contract = {...CANONICAL_ENCODER, repeatCount: repeats, manifestSha256: sha(manifestBytes),
  runtimeHashes, transformersBrowserBundleSha256: sha(Buffer.from(source)), preprocessorSha256: sha(configBytes),
  preprocessingRuntimeOverride: 'Transformers.js documented Symbol.for(onnxruntime) override bound to the same ORT-Web WASM bundle',
  resamplerSourceSha256: sha(fs.readFileSync(path.join(root, 'src/ai/resample.ts'))), compiledResamplerSha256: sha(Buffer.from(resamplerJs)),
  modelConfigSourceSha256: sha(fs.readFileSync(path.join(root, 'src/ai/model.ts'))), compiledModelSha256: sha(Buffer.from(modelJs)),
  encoderSourceSha256: sha(fs.readFileSync(path.join(root, 'ml/browser/canonicalEncoder.mjs'))), runnerSourceSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  checkpointValidatorSha256: sha(fs.readFileSync(path.join(root, 'ml/browser/canonicalCheckpoint.mjs'))),
  environment: {node: process.version, v8: process.versions.v8, platform: process.platform, architecture: process.arch},
  pcmFormat: 'little-endian IEEE754 Float32 mono, exact first five seconds; no browser decoder', promotionAllowed: false};
const contractSha256 = sha(Buffer.from(JSON.stringify(contract)));
const contractFile = path.join(out, 'contract.json');
if (fs.existsSync(contractFile) && JSON.parse(fs.readFileSync(contractFile)).contractSha256 !== contractSha256) throw new Error('Output contract changed; use a new output directory');
atomic(contractFile, {contractSha256, contract});
const goldenDocument = options.has('golden') ? JSON.parse(fs.readFileSync(path.resolve(options.get('golden')))) : null;
const goldens = goldenDocument ? new Map(goldenDocument.records.map(row => [row.clip_id, row])) : null;
if (goldens && (goldens.size !== manifest.records.length || manifest.records.some(row => !goldens.has(row.clip_id)))) throw new Error('Golden comparison must cover exactly the same clip IDs');
if (goldenDocument) {
  if (goldenDocument.contract.modelSha256 !== CANONICAL_ENCODER.modelSha256 || goldenDocument.contract.upstreamTransformersSha256 !== contract.transformersBrowserBundleSha256 || goldenDocument.contract.resamplerSourceSha256 !== contract.resamplerSourceSha256 || goldenDocument.contract.files['/canonicalEncoder.mjs']?.sha256 !== contract.encoderSourceSha256) throw new Error('Golden encoder/preprocessor/resampler identity changed');
  if (goldenDocument.contract.files['/app/model.js']?.sha256 !== contract.compiledModelSha256) throw new Error('Golden resampler configuration changed');
  for (const [filename, value] of Object.entries(runtimeHashes)) {
    const route = filename.startsWith('ort-wasm') ? `/runtime/${filename}` : `/${filename}`;
    if (goldenDocument.contract.files[route]?.sha256 !== value.sha256) throw new Error('Golden WASM bytes changed');
  }
}
const checkpointFile = row => path.join(out, 'checkpoints', `${String(row).padStart(6, '0')}.json`);
const complete = [];
const comparison = [];
const begin = performance.now();
const processor = new transformers.ClapFeatureExtractor(JSON.parse(configBytes));
ort.env.wasm.wasmBinary = new Uint8Array(fs.readFileSync(wasmFile));
const encoder = await createCanonicalEncoder({ort, processor, resample: resampler.resampleForSoundHints, modelBytes, wasmPaths: {mjs: pathToFileURL(runtimeModule).href}});
const modelLoadMs = performance.now() - begin;
try {
  for (const record of manifest.records) {
    const filename = checkpointFile(record.row);
    let checkpoint;
    if (fs.existsSync(filename)) {
      checkpoint = JSON.parse(fs.readFileSync(filename));
      validateCanonicalCheckpoint(checkpoint, record, contractSha256, repeats);
    } else {
      const bytes = fs.readFileSync(path.resolve(path.dirname(manifestFile), record.pcm_path));
      if (sha(bytes) !== record.pcm_sha256) throw new Error('PCM changed during extraction');
      const pcm = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const repeatResults = [];
      let result;
      for (let repeat = 0; repeat < repeats; repeat++) {
        result = await encoder.extract(pcm, record.sample_rate);
        repeatResults.push({pcm48Sha256: arraySha(result.resampled), featureSha256: arraySha(result.features), embeddingSha256: arraySha(result.embedding), preprocessingMs: result.preprocessingMs, inferenceMs: result.inferenceMs});
      }
      if (arraySha(pcm) !== record.pcm_sha256 || repeatResults.some(value => value.pcm48Sha256 !== repeatResults[0].pcm48Sha256 || value.featureSha256 !== repeatResults[0].featureSha256 || value.embeddingSha256 !== repeatResults[0].embeddingSha256)) throw new Error(`Non-repeatable/mutating extraction: ${record.clip_id}`);
      checkpoint = {schemaVersion: 1, row: record.row, clipId: record.clip_id, sourceSha256: record.source_sha256, pcmSha256: record.pcm_sha256, contractSha256, repeats: repeatResults, embedding: Array.from(result.embedding)};
      validateCanonicalCheckpoint(checkpoint, record, contractSha256, repeats);
    }
    if (goldens) {
      const expected = goldens.get(record.clip_id);
      const actual = checkpoint.repeats[0], reference = expected.checkpoint.repeats[0];
      const value = {clipId: record.clip_id, pcmBitExact: expected.pcm_sha256 === record.pcm_sha256 && actual.pcm48Sha256 === reference.pcm48Sha256,
        featuresBitExact: actual.featureSha256 === reference.featureSha256, embeddingBitExact: actual.embeddingSha256 === reference.embeddingSha256,
        embeddingMaxAbs: Math.max(...checkpoint.embedding.map((x, i) => Math.abs(x - expected.checkpoint.embedding[i])))};
      comparison.push(value);
      atomic(path.join(out, 'golden-comparison.json'), {complete: false, contractSha256, cases: comparison, promotionAllowed: false});
      if (!value.pcmBitExact || !value.featuresBitExact || !value.embeddingBitExact) throw new Error(`Canonical golden mismatch: ${JSON.stringify(value)}`);
    }
    if (!fs.existsSync(filename)) atomic(filename, checkpoint);
    complete.push({...record, checkpoint});
    console.log(JSON.stringify({event: 'checkpoint', completed: complete.length, total: manifest.records.length, clipId: record.clip_id, inferenceMs: checkpoint.repeats.map(value => value.inferenceMs)}));
  }
} finally { await encoder.dispose(); }
if (goldens) atomic(path.join(out, 'golden-comparison.json'), {complete: true, contractSha256, allBitExact: true, cases: comparison, promotionAllowed: false});
atomic(path.join(out, 'embeddings.json'), {schemaVersion: 1, contractSha256, contract, records: complete, modelLoadMs, totalWallMs: performance.now() - begin, promotionAllowed: false});
console.log(JSON.stringify({event: 'complete', clips: complete.length, modelLoadMs, wallMs: performance.now() - begin, output: path.join(out, 'embeddings.json'), promotionAllowed: false}));
