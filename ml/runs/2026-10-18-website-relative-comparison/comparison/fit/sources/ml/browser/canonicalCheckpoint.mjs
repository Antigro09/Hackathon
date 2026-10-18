import crypto from 'node:crypto';
export const float32Sha256 = values => crypto.createHash('sha256').update(Buffer.from(values.buffer, values.byteOffset, values.byteLength)).digest('hex');

/** Fail closed on partial, wrong-input, corrupt or non-repeatable checkpoints. */
export function validateCanonicalCheckpoint(value, record, contractSha256, repeatCount) {
  if (value?.schemaVersion !== 1 || value.row !== record.row || value.contractSha256 !== contractSha256 || value.clipId !== record.clip_id || value.sourceSha256 !== record.source_sha256 || value.pcmSha256 !== record.pcm_sha256) throw new Error('Checkpoint identity/contract mismatch');
  if (!Array.isArray(value.embedding) || value.embedding.length !== 512 || value.embedding.some(x => !Number.isFinite(x) || Math.fround(x) !== x)) throw new Error('Invalid Float32 embedding');
  const norm = Math.sqrt(value.embedding.reduce((sum, x) => sum + x * x, 0));
  if (Math.abs(norm - 1) > 1e-6) throw new Error('Embedding is not unit normalized');
  if (!Array.isArray(value.repeats) || value.repeats.length !== repeatCount) throw new Error('Invalid repeat count');
  const digest = float32Sha256(Float32Array.from(value.embedding));
  for (const repeat of value.repeats) {
    for (const key of ['pcm48Sha256', 'featureSha256', 'embeddingSha256']) if (!/^[a-f0-9]{64}$/.test(repeat[key]) || repeat[key] !== value.repeats[0][key]) throw new Error('Non-repeatable checkpoint');
    if (repeat.embeddingSha256 !== digest || !Number.isFinite(repeat.preprocessingMs) || repeat.preprocessingMs < 0 || !Number.isFinite(repeat.inferenceMs) || repeat.inferenceMs < 0) throw new Error('Checkpoint embedding digest/timing mismatch');
  }
  return value;
}
