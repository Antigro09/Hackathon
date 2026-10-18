/** Strict research-only Python/JS fitted-head parity. No encoder or activation. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {validateCanonicalCheckpoint} from './canonicalCheckpoint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const HEAD_PARITY_PINS = Object.freeze({
  compilerVersion: '7.0.2',
  scorerSourceSha256: 'c89ed32798a923eaf19b62fabfda9a8b3ae87b5757fd57458e9ec54aa715b0f7',
  compiledScorerSha256: '5b969fa736aad8b336c198d24f20bf59bbe4e788ef7878ea86dd8126c20ed25f',
  pythonScorerSha256: '640e11d60776d8f87f01e9c19f356c49bd5cc02c433e2abd8edb740aecc026d1',
});
const COMPILER_FILES = Object.freeze({
  'package.json': '3722b30210616a13a3213ded11575ba6b2dbab10c32a5ef67afca8513e27017e',
  'bin/tsc': '2219f428a7e55aaf1f7ad85b9b0f0cf5078aeb76ccc9a7c6036c92d48f492ffd',
  'lib/tsc.js': 'cbdfbf11c26ed00dfc073155e316a42d6d6d8a387be61006b82fa9aa93ac572e',
  'lib/getExePath.js': '96c10fd3a18e165d7323de8e314ac8d755ad96811f9fbc304a5b3ba4e05285cc',
});
const ROLES = new Set(['train', 'unknown_train', 'calibration', 'unknown_calibration', 'audit', 'unknown_audit']);
const sha = raw => crypto.createHash('sha256').update(raw).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const require = (condition, message) => { if (!condition) throw new Error(`V3 head parity: ${message}`); };
const stable = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(stable).join(',')}]`
    : `{${Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',')}}`;
const jsonSha = value => sha(Buffer.from(stable(value)));
const read = (file, expected) => {
  const raw = fs.readFileSync(file);
  require(raw.length <= 256 * 1024 * 1024 && (expected === undefined || (hex(expected) && sha(raw) === expected)), `raw SHA/bounds mismatch: ${file}`);
  return {raw, value: JSON.parse(raw)};
};
const relative = name => {
  require(typeof name === 'string' && !name.includes('\\') && !name.includes(':') && !name.startsWith('/') && name.split('/').every(p => p && p !== '.' && p !== '..'), 'unsafe copied input path');
  return name;
};
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
const floatSha = values => sha(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
const vector = (values, expected) => {
  require(Array.isArray(values) && values.length === 512 && values.every(x => typeof x === 'number' && Number.isFinite(x) && Math.fround(x) === x), 'input is not exact finite Float32');
  const result = Float32Array.from(values);
  require(floatSha(result) === expected, 'Float32 array hash mismatch');
  return result;
};

function embeddingContract(c) {
  require(object(c.runtimeHashes), 'canonical input must be a current Node WEB-WASM job');
  const runtimeFingerprint = {ortVersion: c.ortVersion, artifacts: c.runtimeHashes, execution: c.execution};
  const preprocessingContract = {implementation: c.implementation, transformersVersion: c.transformersVersion,
    transformersBrowserBundleSha256: c.transformersBrowserBundleSha256, preprocessorSha256: c.preprocessorSha256,
    encoderSourceSha256: c.encoderSourceSha256, resamplerSourceSha256: c.resamplerSourceSha256,
    compiledResamplerSha256: c.compiledResamplerSha256, compiledModelSha256: c.compiledModelSha256,
    sampleRateHz: c.sampleRateHz, durationSeconds: c.inputDurationSeconds, featureShape: c.featureShape,
    normalization: c.normalization, preprocessing: c.preprocessing};
  return {canonicalBackend: 'browser-wasm', dimension: 512, normalization: 'l2-float32', modelSha256: c.modelSha256,
    runtimeFingerprintSha256: jsonSha(runtimeFingerprint), preprocessingContractSha256: jsonSha(preprocessingContract),
    runtimeFingerprint, preprocessingContract};
}

function sourceCases(expected, directory, head) {
  const result = [];
  let canonicalCount = 0;
  require(Array.isArray(expected.inputs) && expected.inputs.length > 0, 'missing copied sources');
  for (const [inputIndex, input] of expected.inputs.entries()) {
    const {raw, value: document} = read(path.join(directory, relative(input.path)), input.sha256);
    require(raw.length === input.bytes, 'input byte length changed');
    const rows = [];
    if (input.kind === 'canonical-development') {
      canonicalCount++;
      const staged = read(path.join(directory, relative(input.stagedPath)), input.stagedSha256).value;
      require(document.schemaVersion === 1 && document.promotionAllowed === false && object(document.contract)
        && sha(Buffer.from(JSON.stringify(document.contract))) === document.contractSha256
        && document.contractSha256 === input.contractSha256 && document.contract.manifestSha256 === input.stagedSha256, 'canonical contract mismatch');
      require(staged.schemaVersion === 1 && hex(staged.sourceManifestSha256) && Array.isArray(staged.records)
        && staged.records.length > 0 && Array.isArray(document.records) && document.records.length === staged.records.length, 'partial canonical/staged input');
      require(isDeepStrictEqual(embeddingContract(document.contract), expected.embeddingContract), 'canonical encoder differs from frozen head');
      const ids = new Set(), manifest = [];
      for (const [index, row] of document.records.entries()) {
        const {checkpoint, ...metadata} = row;
        require(isDeepStrictEqual(metadata, staged.records[index]) && row.row === index, 'source metadata/order changed');
        const source = row.source_record;
        require(object(source) && source.historical_development_only === true && ROLES.has(source.role)
          && source.split === source.role && source.clip_id === row.clip_id && source.label === row.label
          && source.uploader === row.uploader && typeof source.v3_group === 'string' && source.v3_group.startsWith('v3-lineage:'), 'final/test input or unfrozen role/lineage');
        require(typeof row.clip_id === 'string' && !ids.has(row.clip_id), 'duplicate canonical ID'); ids.add(row.clip_id);
        validateCanonicalCheckpoint(checkpoint, row, document.contractSha256, document.contract.repeatCount);
        manifest.push({clipId: row.clip_id, role: source.role, label: row.label, group: source.v3_group,
          dataset: source.dataset, pcmSha256: row.pcm_sha256});
        rows.push({id: row.clip_id, embedding: vector(checkpoint.embedding, checkpoint.repeats[0].embeddingSha256)});
      }
      require(jsonSha(manifest) === head.provenance.manifestSha256, 'canonical input is not complete frozen development cohort');
    } else if (input.kind === 'synthetic-startup') {
      require(document.formatVersion === 1 && document.implementation === 'tw-v3-synthetic-startup-reference-v1'
        && document.fieldEvidence === false && document.promotionAllowed === false && document.classifierIncluded === false
        && isDeepStrictEqual(document.embeddingContract, expected.embeddingContract), 'invalid synthetic compact reference');
      require(Array.isArray(document.cases) && document.cases.length > 0, 'missing synthetic cases');
      const ids = new Set();
      for (const entry of document.cases) {
        require(typeof entry.id === 'string' && entry.id && !ids.has(entry.id), 'duplicate/missing synthetic ID'); ids.add(entry.id);
        rows.push({id: entry.id, embedding: vector(entry.normalizedEmbedding512, entry.embeddingSha256)});
      }
    } else throw new Error('Unsupported source kind');
    require(rows.length === input.rows, 'copied input count changed');
    rows.forEach((entry, sourceRow) => result.push({inputIndex, sourceRow, ...entry}));
  }
  require(canonicalCount <= 1, 'duplicate development cohorts');
  return result;
}

export async function checkHeadV3({expectedFile, expectedSha256, headFile, outputDir, dependencyRoot = root}) {
  const out = path.resolve(outputDir);
  require(!fs.existsSync(out), 'output already exists; parity attempts are immutable');
  const {raw: expectedRaw, value: expected} = read(expectedFile, expectedSha256);
  require(expected.formatVersion === 1 && expected.implementation === 'tw-v3-python-js-head-parity-v1'
    && expected.researchOnly === true && expected.promotionAllowed === false && isDeepStrictEqual(expected.pins, HEAD_PARITY_PINS), 'invalid/unpinned Python expectations');
  require(new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 4, 'requires little-endian Float32/int32 hashing');
  const sourceNames = ['ml/browser/checkHeadV3.py', 'ml/browser/checkHeadV3.mjs', 'ml/experiment_v3.py', 'ml/canonical_v3.py', 'ml/browser/canonicalCheckpoint.mjs'];
  require(object(expected.sourceSha256) && isDeepStrictEqual(Object.keys(expected.sourceSha256).sort(), sourceNames.slice().sort()), 'missing checker source bindings');
  for (const name of sourceNames) require(sha(fs.readFileSync(path.join(root, name))) === expected.sourceSha256[name], 'checker source changed: ' + name);
  require(sha(fs.readFileSync(path.join(root, 'ml/experiment_v3.py'))) === HEAD_PARITY_PINS.pythonScorerSha256, 'Python scorer source changed');
  const scorer = path.join(root, 'ml/browser/integerHeadV3.ts');
  require(sha(fs.readFileSync(scorer)) === HEAD_PARITY_PINS.scorerSourceSha256, 'TypeScript scorer source changed');
  require(sha(fs.readFileSync(path.join(root, 'ml/browser/canonicalCheckpoint.mjs'))) === '0e91bce95cdddebdf5ca95e6d2b6e2fd343b02c901364bf7bfd9b717aa10ad4a', 'checkpoint validator changed');
  const {value: head} = read(headFile, expected.headSha256);
  const {provenance, ...parameters} = head;
  require(object(provenance) && provenance.sourceSha256 === HEAD_PARITY_PINS.pythonScorerSha256
    && provenance.frozenParametersAndRulesSha256 === expected.frozenParametersAndRulesSha256
    && jsonSha(parameters) === expected.frozenParametersAndRulesSha256
    && isDeepStrictEqual(provenance.embeddingContract, expected.embeddingContract)
    && provenance.embeddingContractSha256 === jsonSha(expected.embeddingContract), 'frozen head/rules/source/encoder binding changed');
  const cases = sourceCases(expected, path.dirname(path.resolve(expectedFile)), head);
  require(Array.isArray(expected.rows) && cases.length === expected.rows.length && cases.length > 0, 'expected rows are incomplete');
  const compilerRoot = path.join(path.resolve(dependencyRoot), 'node_modules/typescript');
  for (const [name, digest] of Object.entries(COMPILER_FILES)) require(sha(fs.readFileSync(path.join(compilerRoot, name))) === digest, 'unpinned compiler wrapper: ' + name);
  require(JSON.parse(fs.readFileSync(path.join(compilerRoot, 'package.json'))).version === HEAD_PARITY_PINS.compilerVersion, 'unpinned compiler version');
  const {default: getExePath} = await import(pathToFileURL(path.join(compilerRoot, 'lib/getExePath.js')).href);
  const executable = getExePath();
  const compiler = {version: HEAD_PARITY_PINS.compilerVersion, wrapperSha256: COMPILER_FILES,
    nativeExecutableSha256: sha(fs.readFileSync(executable))};
  fs.mkdirSync(out, {recursive: false});
  save(path.join(out, 'input-evidence.json'), {researchOnly: true, promotionAllowed: false,
    expectedSha256, headSha256: expected.headSha256, frozenParametersAndRulesSha256: expected.frozenParametersAndRulesSha256,
    pins: HEAD_PARITY_PINS, compiler, node: {node: process.version, v8: process.versions.v8, platform: process.platform, architecture: process.arch},
    comparatorSourceSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url)))});
  try {
    const compiled = path.join(out, 'compiled');
    execFileSync(process.execPath, [path.join(compilerRoot, 'bin/tsc'), '--ignoreConfig', scorer, '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'Bundler', '--skipLibCheck', '--outDir', compiled], {stdio: 'pipe'});
    const compiledFile = path.join(compiled, 'integerHeadV3.js');
    require(sha(fs.readFileSync(compiledFile)) === HEAD_PARITY_PINS.compiledScorerSha256
      && sha(fs.readFileSync(scorer)) === HEAD_PARITY_PINS.scorerSourceSha256, 'unexpected compiled/source scorer bytes');
    // Explicit ESM scope works on Node20 too; compiled scorer bytes stay exact.
    save(path.join(compiled, 'package.json'), {type: 'module'});
    const {createIntegerHeadV3, quantizeEmbeddingV3} = await import(pathToFileURL(compiledFile).href);
    const predictor = createIntegerHeadV3(head);
    const rows = [];
    let maxScoreError = 0, maxMarginError = 0;
    for (const [index, input] of cases.entries()) {
      const reference = expected.rows[index];
      require(reference.inputIndex === input.inputIndex && reference.sourceRow === input.sourceRow && reference.id === input.id
        && reference.embeddingSha256 === floatSha(input.embedding), 'expected row identity/order changed');
      require(Array.isArray(reference.expectedQuantized) && reference.expectedQuantized.length === 512
        && reference.expectedQuantized.every(v => Number.isSafeInteger(v) && v >= -32769 && v <= 32769), 'invalid Python quantization');
      const target = reference.expected;
      require(object(target) && Number.isSafeInteger(target.classIndex) && target.classIndex >= 0 && target.classIndex < 6
        && typeof target.accepted === 'boolean' && Number.isSafeInteger(target.guardedMargin)
        && Array.isArray(target.integerScores) && target.integerScores.length === 6 && target.integerScores.every(Number.isSafeInteger), 'invalid Python integer prediction');
      const before = floatSha(input.embedding);
      const q = quantizeEmbeddingV3(input.embedding), actual = predictor.predict(input.embedding);
      require(isDeepStrictEqual(actual, predictor.predictQuantized(q)), 'float and prequantized JS paths disagree');
      require(floatSha(input.embedding) === before, 'scorer mutated source input');
      const mismatch = [];
      if (!isDeepStrictEqual(Array.from(q), reference.expectedQuantized)) mismatch.push('quantized512');
      for (const key of ['classIndex', 'label', 'integerScores', 'guardedMargin', 'accepted']) if (!isDeepStrictEqual(actual[key], target[key])) mismatch.push(key);
      maxScoreError = Math.max(maxScoreError, ...actual.integerScores.map((v, i) => Math.abs(v-target.integerScores[i])));
      maxMarginError = Math.max(maxMarginError, Math.abs(actual.guardedMargin-target.guardedMargin));
      rows.push({inputIndex: input.inputIndex, sourceRow: input.sourceRow, id: input.id, embeddingSha256: before,
        quantizedInt32Sha256: floatSha(q), ...actual, passed: mismatch.length === 0, mismatchedFields: mismatch});
    }
    require(sha(fs.readFileSync(expectedFile)) === sha(expectedRaw), 'Python expectations changed during comparison');
    const report = {formatVersion: 1, researchOnly: true, promotionAllowed: false, accuracyEvaluated: false, encoderRun: false,
      complete: true, passed: rows.every(row => row.passed), cases: rows.length, mismatchingCases: rows.filter(row => !row.passed).length,
      maximumIntegerScoreError: maxScoreError, maximumGuardedMarginError: maxMarginError,
      headSha256: expected.headSha256, frozenParametersAndRulesSha256: expected.frozenParametersAndRulesSha256,
      expectedSha256, pins: HEAD_PARITY_PINS, compiler, rows};
    save(path.join(out, 'parity.json'), report);
    require(report.passed, 'strict integer/label/gate comparison failed; preserve original rules');
    return report;
  } catch (error) {
    save(path.join(out, 'failed.json'), {passed: false, promotionAllowed: false, error: String(error), retryPolicy: 'Preserve failed attempt; do not retune parameters, gates or tolerances'});
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    require(process.argv[i].startsWith('--') && process.argv[i+1], 'expected --key value pairs');
    const key = process.argv[i].slice(2);
    require(['expected', 'expected-sha256', 'head', 'output', 'dependencies'].includes(key) && !args.has(key), 'unknown/duplicate option');
    args.set(key, process.argv[i+1]);
  }
  require(['expected', 'expected-sha256', 'head', 'output'].every(k => args.has(k)), 'use --expected FILE --expected-sha256 PIN --head FILE --output NEW_DIR [--dependencies REPO]');
  try {
    const result = await checkHeadV3({expectedFile: args.get('expected'), expectedSha256: args.get('expected-sha256'), headFile: args.get('head'), outputDir: args.get('output'), dependencyRoot: args.get('dependencies')});
    console.log(JSON.stringify({passed: result.passed, cases: result.cases, promotionAllowed: false}));
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
