/** Research-only static runtime packager. No model, candidate head, audio or activation. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {CANONICAL_ENCODER} from './canonicalEncoder.mjs';
import {float32Sha256, validateCanonicalCheckpoint} from './canonicalCheckpoint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const require = (condition, message) => { if (!condition) throw new Error(`Cannot package v3 runtime: ${message}`); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shaString = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// Independent pins from the qualified frozen encoder, never supplied by callers.
export const PRODUCTION_V3_PINS = Object.freeze({
  compilerVersion: '7.0.2',
  transformersBrowserBundleSha256: 'ad44c6e41ff23fd5b01fa3fe08199a0440a35711dc9f80a31132fcce08fbd432',
  redirectedTransformersSha256: 'f2da43b6b960ca15ae8678e4899a5df0031125c38e94a03e458bd762751d6367',
  preprocessorSha256: '9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753',
  modelConfigSha256: '39c6d90fe29cf2cce650dd5c92c38a1e35b130d9ce0bb98585222ad687ad979b',
  resamplerSourceSha256: 'a73257786eb279a269e4df0bab86eeb2c1b8d682dcd3c32e8fba1df5b89efb81',
  compiledResamplerSha256: '2ab0e2e2a8d3bbc8dc2d3608993c7b27c2df4726a20411e5054414f4223d0477',
  modelConfigSourceSha256: '04f764ff1abd63d3342126b3d2bc26aaf752664319483f85885c963fa6b04388',
  compiledModelSha256: 'a082366e74a74302ca4b55b3a333b53320d619bdc5f2a17a824cfd1b898f25b0',
  encoderSourceSha256: '6cda0b9db5fee7c1612629d014ead11a93d6e369b101a68af9e32d82c031ebb4',
  runnerSourceSha256: 'ea25c92f666b14b54c7a8b3a545b5099617f30d497670d1032b6173ecd1d396d',
  checkpointValidatorSha256: '0e91bce95cdddebdf5ca95e6d2b6e2fd343b02c901364bf7bfd9b717aa10ad4a',
  scorerSourceSha256: 'c89ed32798a923eaf19b62fabfda9a8b3ae87b5757fd57458e9ec54aa715b0f7',
  compiledScorerSha256: '5b969fa736aad8b336c198d24f20bf59bbe4e788ef7878ea86dd8126c20ed25f',
  transformersLicenseSha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
  ortLicenseSha256: '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c',
  ortNoticesSha256: '143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3',
});

// Synthetic startup evidence is optional and separately pinned from numeric assets.
export const PRODUCTION_V3_SELF_TEST_PINS = Object.freeze({
  moduleSha256: 'cf4c6a95f4b5108c4c906829385f062a66ccf363a2ece78c49da31b634af4105',
  referenceSha256: '6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d',
});

function pinnedBytes(file, expected) {
  const bytes = fs.readFileSync(file);
  require(digest(bytes) === expected, `SHA mismatch for ${file}`);
  return bytes;
}

/** The only upstream edits are the two external module specifiers. */
export function redirectTransformersBundle(bytes) {
  require(digest(bytes) === PRODUCTION_V3_PINS.transformersBrowserBundleSha256, 'unpinned upstream Transformers bundle');
  let source = bytes.toString('utf8');
  for (const specifier of ['onnxruntime-web/webgpu', 'onnxruntime-common']) {
    const token = JSON.stringify(specifier);
    require(source.split(token).length === 2, `expected exactly one external import ${specifier}`);
    source = source.replace(token, '"./ort.wasm.bundle.min.mjs"');
  }
  const output = Buffer.from(source);
  require(digest(output) === PRODUCTION_V3_PINS.redirectedTransformersSha256, 'unexpected redirected Transformers bytes');
  return output;
}

/** Verify a complete current Node extraction, without reading audio or predicting. */
export function validateProductionReference(referenceBytes, manifestBytes) {
  const reference = JSON.parse(referenceBytes), staged = JSON.parse(manifestBytes);
  require(reference.schemaVersion === 1 && reference.promotionAllowed === false && object(reference.contract), 'unpromoted canonical embeddings document required');
  const contract = reference.contract;
  require(shaString(reference.contractSha256) && digest(Buffer.from(JSON.stringify(contract))) === reference.contractSha256, 'contract digest mismatch');
  for (const [key, value] of Object.entries(CANONICAL_ENCODER)) require(isDeepStrictEqual(contract[key], value), `canonical ${key} changed`);
  require(contract.promotionAllowed === false, 'reference contract must remain unpromoted');
  require(contract.preprocessingRuntimeOverride === 'Transformers.js documented Symbol.for(onnxruntime) override bound to the same ORT-Web WASM bundle'
    && contract.pcmFormat === 'little-endian IEEE754 Float32 mono, exact first five seconds; no browser decoder', 'unrecognized extraction preprocessing/input contract');
  for (const key of ['transformersBrowserBundleSha256', 'preprocessorSha256', 'resamplerSourceSha256', 'compiledResamplerSha256', 'modelConfigSourceSha256', 'compiledModelSha256', 'encoderSourceSha256', 'runnerSourceSha256', 'checkpointValidatorSha256']) {
    require(contract[key] === PRODUCTION_V3_PINS[key], `unpinned contract ${key}`);
  }
  require(object(contract.runtimeHashes) && Object.keys(contract.runtimeHashes).length === 3, 'current Node runtime dependency hashes required');
  for (const [name, expected] of Object.entries(CANONICAL_ENCODER.runtimeSha256)) {
    const item = contract.runtimeHashes[name];
    require(object(item) && item.sha256 === expected && Number.isSafeInteger(item.bytes) && item.bytes > 0, `invalid runtime identity ${name}`);
  }
  require(Number.isSafeInteger(contract.repeatCount) && contract.repeatCount >= 1 && contract.repeatCount <= 10, 'invalid repeat count');
  require(contract.manifestSha256 === digest(manifestBytes), 'staged manifest digest mismatch');
  require(staged.schemaVersion === 1 && Array.isArray(staged.records) && staged.records.length > 0
    && Array.isArray(reference.records) && reference.records.length === staged.records.length, 'partial or invalid completed reference');
  const ids = new Set();
  for (let row = 0; row < staged.records.length; row++) {
    const record = staged.records[row], complete = reference.records[row];
    require(object(record) && record.row === row && typeof record.clip_id === 'string' && record.clip_id.length > 0 && !ids.has(record.clip_id), 'invalid or duplicate staged row');
    ids.add(record.clip_id);
    require([44100, 48000].includes(record.sample_rate) && record.sample_count === record.sample_rate * 5
      && shaString(record.source_sha256) && shaString(record.pcm_sha256), 'invalid staged input metadata');
    require(object(complete), 'missing completed row');
    const {checkpoint, ...metadata} = complete;
    require(isDeepStrictEqual(metadata, record), `completed metadata differs at row ${row}`);
    validateCanonicalCheckpoint(checkpoint, record, reference.contractSha256, contract.repeatCount);
  }
  return {contract, referenceSha256: digest(referenceBytes), contractSha256: reference.contractSha256,
    stagedManifestSha256: digest(manifestBytes), completedRecords: staged.records.length};
}

const sortedJson = value => JSON.stringify(sortKeys(value));
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])]));
}

/** Validate only the frozen two-case software reference; never run its inputs. */
export function validateProductionSelfTest(moduleBytes, referenceBytes, contract) {
  require(digest(moduleBytes) === PRODUCTION_V3_SELF_TEST_PINS.moduleSha256, 'altered synthetic self-test module');
  require(digest(referenceBytes) === PRODUCTION_V3_SELF_TEST_PINS.referenceSha256, 'altered synthetic self-test reference');
  const reference = JSON.parse(referenceBytes);
  require(reference.formatVersion === 1 && reference.implementation === 'tw-v3-synthetic-startup-reference-v1'
    && reference.fieldEvidence === false && reference.promotionAllowed === false && reference.classifierIncluded === false, 'software-only self-test reference required');
  require(reference.generator?.sha256 === PRODUCTION_V3_SELF_TEST_PINS.moduleSha256, 'self-test generator identity mismatch');
  const embedding = reference.embeddingContract;
  require(object(embedding) && embedding.canonicalBackend === 'browser-wasm' && embedding.dimension === 512
    && embedding.normalization === 'l2-float32' && embedding.modelSha256 === CANONICAL_ENCODER.modelSha256, 'self-test encoder mismatch');
  const runtime = {ortVersion: contract.ortVersion, artifacts: contract.runtimeHashes, execution: contract.execution};
  const preprocessing = {
    implementation: contract.implementation, transformersVersion: contract.transformersVersion,
    ...Object.fromEntries(['transformersBrowserBundleSha256', 'preprocessorSha256', 'encoderSourceSha256', 'resamplerSourceSha256', 'compiledResamplerSha256', 'compiledModelSha256'].map(key => [key, contract[key]])),
    sampleRateHz: contract.sampleRateHz, durationSeconds: contract.inputDurationSeconds, featureShape: contract.featureShape,
    normalization: contract.normalization, preprocessing: contract.preprocessing,
  };
  require(isDeepStrictEqual(embedding.runtimeFingerprint, runtime) && isDeepStrictEqual(embedding.preprocessingContract, preprocessing)
    && embedding.runtimeFingerprintSha256 === digest(Buffer.from(sortedJson(runtime)))
    && embedding.preprocessingContractSha256 === digest(Buffer.from(sortedJson(preprocessing))), 'self-test runtime/preprocessing fingerprint mismatch');
  require(reference.provenance?.repeatsPerCasePerEnvironment === 3 && reference.provenance.allStagesBitExact === true, 'incomplete self-test parity evidence');
  require(Array.isArray(reference.cases) && reference.cases.length === 2, 'two fixed synthetic cases required');
  require(new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 4, 'self-test reference requires little-endian Float32');
  for (const [index, [id, sampleRate]] of [['tw-v3-square-44100', 44100], ['tw-v3-noise-48000', 48000]].entries()) {
    const entry = reference.cases[index];
    require(entry.id === id && entry.sampleRate === sampleRate && entry.sampleCount === sampleRate * 5, 'self-test case identity mismatch');
    for (const key of ['inputSha256', 'resampledPcmSha256', 'featureSha256', 'embeddingSha256']) require(shaString(entry[key]), 'missing full self-test stage digest');
    const values = entry.normalizedEmbedding512;
    require(Array.isArray(values) && values.length === 512 && values.every(value => Number.isFinite(value) && Math.fround(value) === value), 'invalid synthetic Float32 vector');
    require(Math.abs(Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) - 1) <= 1e-6
      && float32Sha256(Float32Array.from(values)) === entry.embeddingSha256, 'synthetic vector normalization/digest mismatch');
  }
  return {moduleSha256: PRODUCTION_V3_SELF_TEST_PINS.moduleSha256, referenceSha256: PRODUCTION_V3_SELF_TEST_PINS.referenceSha256,
    caseCount: 2, softwareOnly: true, fieldEvidence: false};
}

const compileArguments = files => ['--ignoreConfig', ...files, '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'Bundler', '--skipLibCheck'];

/** All verification/compilation precedes output creation; existing output is never overwritten. */
export function prepareProductionV3({referenceFile, manifestFile, outputDir, cacheDir = path.join(repository, 'output/ml-cache'), dependencyRoot = repository, selfTestReferenceFile}) {
  const out = path.resolve(outputDir);
  require(!fs.existsSync(out), 'output already exists; choose a new directory');
  require(fs.existsSync(path.dirname(out)) && fs.statSync(path.dirname(out)).isDirectory(), 'output parent must exist');
  const verified = validateProductionReference(fs.readFileSync(referenceFile), fs.readFileSync(manifestFile));
  const nodeModules = path.join(path.resolve(dependencyRoot), 'node_modules');
  for (const [name, expected] of [['@huggingface/transformers', CANONICAL_ENCODER.transformersVersion], ['onnxruntime-web', CANONICAL_ENCODER.ortVersion], ['typescript', PRODUCTION_V3_PINS.compilerVersion]]) {
    require(JSON.parse(fs.readFileSync(path.join(nodeModules, name, 'package.json'))).version === expected, `unpinned package ${name}`);
  }
  const sources = {
    resample: path.join(repository, 'src/ai/resample.ts'), model: path.join(repository, 'src/ai/model.ts'),
    scorer: path.join(here, 'integerHeadV3.ts'), encoder: path.join(here, 'canonicalEncoder.mjs'),
  };
  for (const [name, key] of [['resample', 'resamplerSourceSha256'], ['model', 'modelConfigSourceSha256'], ['scorer', 'scorerSourceSha256'], ['encoder', 'encoderSourceSha256']]) pinnedBytes(sources[name], PRODUCTION_V3_PINS[key]);
  pinnedBytes(path.join(here, 'extractCanonicalNode.mjs'), PRODUCTION_V3_PINS.runnerSourceSha256);
  pinnedBytes(path.join(here, 'canonicalCheckpoint.mjs'), PRODUCTION_V3_PINS.checkpointValidatorSha256);
  const files = new Map();
  const add = (relativePath, bytes, contentType, role) => {
    require(!files.has(relativePath), 'duplicate asset path');
    files.set(relativePath, {bytes, contentType, role});
  };
  let syntheticSelfTest = null;
  if (selfTestReferenceFile !== undefined) {
    const moduleBytes = pinnedBytes(path.join(here, 'selfTestV3.mjs'), PRODUCTION_V3_SELF_TEST_PINS.moduleSha256);
    const referenceBytes = fs.readFileSync(selfTestReferenceFile);
    syntheticSelfTest = validateProductionSelfTest(moduleBytes, referenceBytes, verified.contract);
    add('selfTestV3.mjs', moduleBytes, 'text/javascript', 'unchanged optional two-case synthetic input generator');
    add('self-test-v3-reference.json', referenceBytes, 'application/json', 'unchanged optional synthetic startup reference; no real observations or classifier');
  }
  add('canonicalEncoder.mjs', pinnedBytes(sources.encoder, PRODUCTION_V3_PINS.encoderSourceSha256), 'text/javascript', 'unchanged canonical encoder');
  const transformerPath = path.join(nodeModules, '@huggingface/transformers/dist/transformers.web.js');
  add('transformers.web.js', redirectTransformersBundle(fs.readFileSync(transformerPath)), 'text/javascript', 'upstream preprocessing bundle; two external import specifiers redirected');
  for (const [name, expected] of Object.entries(CANONICAL_ENCODER.runtimeSha256)) {
    const bytes = pinnedBytes(path.join(nodeModules, 'onnxruntime-web/dist', name), expected);
    require(bytes.length === verified.contract.runtimeHashes[name].bytes, `runtime size differs from reference ${name}`);
    add(name.startsWith('ort-wasm-') ? `runtime/${name}` : name, bytes, name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', 'unchanged standard ORT Web WASM runtime');
  }
  const cache = path.join(path.resolve(cacheDir), CANONICAL_ENCODER.revision);
  for (const [name, pin] of [['config.json', 'modelConfigSha256'], ['preprocessor_config.json', 'preprocessorSha256']]) {
    add(`models/${CANONICAL_ENCODER.revision}/${name}`, pinnedBytes(path.join(cache, name), PRODUCTION_V3_PINS[pin]), 'application/json', 'unchanged upstream configuration; no weights');
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-v3-assets-'));
  try {
    const compiler = path.join(nodeModules, 'typescript/bin/tsc');
    const app = path.join(temporary, 'app'), scorer = path.join(temporary, 'scorer');
    execFileSync(process.execPath, [compiler, ...compileArguments([sources.resample, sources.model]), '--outDir', app], {stdio: 'pipe'});
    execFileSync(process.execPath, [compiler, ...compileArguments([sources.scorer]), '--outDir', scorer], {stdio: 'pipe'});
    const resample = pinnedBytes(path.join(app, 'resample.js'), PRODUCTION_V3_PINS.compiledResamplerSha256);
    const model = pinnedBytes(path.join(app, 'model.js'), PRODUCTION_V3_PINS.compiledModelSha256);
    add('app/resample.js', resample, 'text/javascript', 'exact TypeScript 7.0.2 output; unchanged import');
    add('app/model.js', model, 'text/javascript', 'exact TypeScript 7.0.2 output');
    add('app/model', model, 'text/javascript', 'byte-identical extensionless import alias; JavaScript MIME required');
    add('integerHeadV3.js', pinnedBytes(path.join(scorer, 'integerHeadV3.js'), PRODUCTION_V3_PINS.compiledScorerSha256), 'text/javascript', 'research integer scorer only; no candidate parameters');
  } finally {
    // Remove only the verified, newly-created OS temporary compilation directory.
    require(path.dirname(path.resolve(temporary)) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('tw-v3-assets-'), 'temporary cleanup escaped its designated directory');
    fs.rmSync(temporary, {recursive: true});
  }
  add('licenses/transformers-APACHE-2.0.txt', pinnedBytes(path.join(nodeModules, '@huggingface/transformers/LICENSE'), PRODUCTION_V3_PINS.transformersLicenseSha256), 'text/plain', 'upstream Transformers.js license');
  add('licenses/onnxruntime-LICENSE.txt', pinnedBytes(path.join(here, 'licenses/onnxruntime-LICENSE.txt'), PRODUCTION_V3_PINS.ortLicenseSha256), 'text/plain', 'upstream ONNX Runtime MIT license');
  add('licenses/onnxruntime-ThirdPartyNotices.txt', pinnedBytes(path.join(here, 'licenses/onnxruntime-ThirdPartyNotices.txt'), PRODUCTION_V3_PINS.ortNoticesSha256), 'text/plain', 'unfiltered upstream ONNX Runtime notices; not a claim every component is used');
  const notices = `Research-only canonical runtime assets. No graph, candidate parameters, audio or real-observation embeddings are included. Optional synthetic startup vectors are software checks, not field evidence. Activation and promotion are not authorized by this package.\n\nTransformers.js 4.3.1: Apache-2.0, https://github.com/huggingface/transformers.js . Only the two external imports onnxruntime-web/webgpu and onnxruntime-common were redirected to ./ort.wasm.bundle.min.mjs; all other upstream bytes are retained. Full license: licenses/transformers-APACHE-2.0.txt .\n\nONNX Runtime Web ${CANONICAL_ENCODER.ortVersion}: MIT. Exact standard WASM, loader and JS bundle bytes retained. Full upstream license and unfiltered third-party notices from commit 8d85527a010e294a26b274749f74294b2a32cec5 are included under licenses/. Source: https://github.com/microsoft/onnxruntime/tree/8d85527a010e294a26b274749f74294b2a32cec5 . The upstream notice covers the broader project; inclusion does not imply every listed library is in this WASM binary.\n\nModel config attribution: Xenova/clap-htsat-unfused at ${CANONICAL_ENCODER.revision}, based on laion/clap-htsat-unfused. The upstream LAION card declares Apache-2.0; the pinned Xenova card does not declare a separate license. No model weights or deployment-license determination are supplied here.\n\nServe every JS module, including extensionless app/model, as text/javascript. Serve WASM as application/wasm. Do not send these files through Vite transforms, dependency optimization, minification or numeric rewrites. No SPA HTML fallback for asset routes. Future app qualification must verify the emitted bytes and actual browser golden parity before use.\n`;
  add('NOTICES.txt', Buffer.from(notices), 'text/plain', 'attribution, modification notice and serving requirements');
  // Recheck the source bytes after compilation; the shared worktree may be active.
  pinnedBytes(sources.resample, PRODUCTION_V3_PINS.resamplerSourceSha256);
  pinnedBytes(sources.model, PRODUCTION_V3_PINS.modelConfigSourceSha256);
  const assets = Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, item]) => [name, {sha256: digest(item.bytes), bytes: item.bytes.length, contentType: item.contentType, role: item.role}]));
  const manifest = {schemaVersion: 1, packageKind: 'tw-canonical-v3-runtime-assets', researchOnly: true, activationReady: false, promotionAllowed: false,
    sourceReference: {referenceSha256: verified.referenceSha256, contractSha256: verified.contractSha256, stagedManifestSha256: verified.stagedManifestSha256, completedRecords: verified.completedRecords},
    canonicalEncoder: CANONICAL_ENCODER, pins: PRODUCTION_V3_PINS, syntheticSelfTest,
    sourcePackagerSha256: digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    servingRequirements: {staticBytesOnly: true, extensionlessJavaScriptAlias: 'app/model', noSpaFallback: true, modelWeightsIncluded: false, candidateHeadIncluded: false},
    totalAssetBytes: [...files.values()].reduce((sum, item) => sum + item.bytes.length, 0), files: assets};
  fs.mkdirSync(out);
  for (const [name, item] of files) { const destination = path.join(out, name); fs.mkdirSync(path.dirname(destination), {recursive: true}); fs.writeFileSync(destination, item.bytes, {flag: 'wx'}); }
  fs.writeFileSync(path.join(out, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  return manifest;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const options = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    require(process.argv[i].startsWith('--') && process.argv[i + 1], 'expected --key value pairs');
    const key = process.argv[i].slice(2);
    require(['reference', 'manifest', 'output', 'cache', 'dependencies', 'self-test-reference'].includes(key) && !options.has(key), `unknown or duplicate option ${key}`);
    options.set(key, process.argv[i + 1]);
  }
  require(['reference', 'manifest', 'output'].every(key => options.has(key)), 'usage: --reference complete/embeddings.json --manifest staged/manifest.json --output NEW_DIRECTORY [--cache CACHE] [--dependencies DEPENDENCY_ROOT] [--self-test-reference FROZEN_SYNTHETIC_REFERENCE]');
  const result = prepareProductionV3({referenceFile: options.get('reference'), manifestFile: options.get('manifest'), outputDir: options.get('output'), cacheDir: options.get('cache'), dependencyRoot: options.get('dependencies'), selfTestReferenceFile: options.get('self-test-reference')});
  console.log(JSON.stringify({output: path.resolve(options.get('output')), assets: Object.keys(result.files).length, bytes: result.totalAssetBytes, referenceContractSha256: result.sourceReference.contractSha256, activationReady: false, promotionAllowed: false}));
}
