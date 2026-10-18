/**
 * Deterministic synthetic inputs for numerical startup checks only.
 * These signals are not observations, training data, or evidence of accuracy.
 * Keep this import-free module byte-identical in qualified browser packages.
 */
export const SELF_TEST_V3 = Object.freeze({
  formatVersion: 1,
  implementation: 'tw-v3-synthetic-self-test-inputs-v1',
  purpose: 'synthetic numerical startup parity; no field accuracy or coverage claim',
  durationSeconds: 5,
  noiseSeed: 0x1a2b3c4d,
  cases: Object.freeze([
    Object.freeze({id: 'tw-v3-square-44100', sampleRate: 44100, sampleCount: 220500,
      waveform: 'alternating half cycles floor(n*126/sampleRate), amplitude +/- 0.0625'}),
    Object.freeze({id: 'tw-v3-noise-48000', sampleRate: 48000, sampleCount: 240000,
      waveform: 'xorshift32 shifts 13/17/5, update before sample, ((state>>>8)-0x800000)*2^-27'}),
  ]),
});

/** Each call owns a fresh Float32Array and a fresh, fixed-seed RNG state. */
export function generateSelfTestV3Input(id) {
  const specification = SELF_TEST_V3.cases.find(value => value.id === id);
  if (!specification) throw new Error(`Unknown synthetic self-test case: ${String(id)}`);
  const samples = new Float32Array(specification.sampleCount);
  if (id === 'tw-v3-square-44100') {
    for (let n = 0; n < samples.length; n++) {
      samples[n] = Math.floor(n * 126 / specification.sampleRate) % 2 === 0 ? 0.0625 : -0.0625;
    }
  } else {
    let state = SELF_TEST_V3.noiseSeed;
    for (let n = 0; n < samples.length; n++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      samples[n] = ((state >>> 8) - 0x800000) * (2 ** -27);
    }
  }
  return {id: specification.id, sampleRate: specification.sampleRate, samples};
}
