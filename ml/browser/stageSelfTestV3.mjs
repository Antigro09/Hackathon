import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SELF_TEST_V3, generateSelfTestV3Input} from './selfTestV3.mjs';

const base = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(base, '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytesOf = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
if (new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] !== 4) throw new Error('Little-endian runtime required');
const generatorPath = path.join(base, 'selfTestV3.mjs');
const generatorSha256 = sha(fs.readFileSync(generatorPath));
if (process.argv.length !== 2 && (process.argv.length !== 4 || process.argv[2] !== '--output')) throw new Error('Usage: node ml/browser/stageSelfTestV3.mjs [--output OUTPUT_DIRECTORY]');
const staged = path.resolve(process.argv[3] || path.join(repository, 'output/v3-selftest/staged'));
fs.mkdirSync(staged, {recursive: true});
const writeExact = (filename, bytes) => {
  if (fs.existsSync(filename)) {
    if (!fs.readFileSync(filename).equals(bytes)) throw new Error(`Refusing changed synthetic artifact: ${filename}`);
  } else fs.writeFileSync(filename, bytes);
};
const records = SELF_TEST_V3.cases.map((specification, row) => {
  const input = generateSelfTestV3Input(specification.id);
  const bytes = bytesOf(input.samples);
  const pcmSha256 = sha(bytes);
  const pcmPath = `${input.id}.f32`;
  writeExact(path.join(staged, pcmPath), bytes);
  return {row, clip_id: input.id, source_sha256: pcmSha256, pcm_sha256: pcmSha256,
    pcm_path: pcmPath, sample_rate: input.sampleRate, sample_count: input.samples.length,
    label: 'synthetic_software_check', split: 'software_check', uploader: 'deterministic-generator',
    source_record: {kind: 'synthetic-software-test', generatorSha256, generatorImplementation: SELF_TEST_V3.implementation,
      specification, notTrainingData: true, fieldEvidence: false, sourceHashScope: 'generated Float32 input bytes'}};
});
const source = {schemaVersion: 1, generatorPath: 'ml/browser/selfTestV3.mjs', generatorSha256,
  specification: SELF_TEST_V3, records, fieldEvidence: false, promotionAllowed: false};
const sourceBytes = Buffer.from(JSON.stringify(source, null, 2) + '\n');
writeExact(path.join(staged, 'synthetic-source.json'), sourceBytes);
const manifest = {schemaVersion: 1, sourceManifestSha256: sha(sourceBytes),
  preparation: 'Exact generated little-endian Float32; no audio decoder, gain, normalization, or training', records};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
writeExact(path.join(staged, 'manifest.json'), manifestBytes);
console.log(JSON.stringify({generatorSha256, manifestSha256: sha(manifestBytes), cases: records.map(row => ({id: row.clip_id, pcmSha256: row.pcm_sha256, samples: row.sample_count}))}, null, 2));
