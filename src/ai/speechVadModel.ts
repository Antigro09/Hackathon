export const SPEECH_VAD_MODEL = Object.freeze({
  id: 'snakers4/silero-vad' as const,
  revision: '1e261b036686cd0017d500ee96acd1c4ba572a9d',
  sha256: '7ed98ddbad84ccac4cd0aeb3099049280713df825c610a8ed34543318f1b2c49',
  bytes: 1_289_603,
  filename: 'silero_vad_16k_op15.onnx',
  policyVersion: 'tw-speech-interference-v1' as const,
  ortVersion: '1.31.0-dev.20260914-8d85527a0',
  sampleRateHz: 16_000 as const,
  frameSamples: 512,
  contextSamples: 64,
  threshold: .5,
  negativeThreshold: .35,
  minimumSpeechSamples: 4_000,
  minimumSilenceSamples: 1_600,
  paddingSamples: 480,
  maximumSeconds: 30,
});

export const SPEECH_VAD_RUNTIME = Object.freeze({
  'ort.wasm.bundle.min.mjs': Object.freeze({ bytes: 73_123, sha256: '17b52c1ac62b421dc508b4c28b9a9675251c6e25dd512ef54b83a5e2c4242869' }),
  'runtime/ort-wasm-simd-threaded.mjs': Object.freeze({ bytes: 24_381, sha256: 'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f' }),
  'runtime/ort-wasm-simd-threaded.wasm': Object.freeze({ bytes: 14_264_838, sha256: '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3' }),
});

export function validSpeechVadCapture(pcm: unknown, rate: unknown): pcm is Float32Array {
  return pcm instanceof Float32Array && (rate === 44_100 || rate === 48_000)
    && [5, 15, 30].some(seconds => pcm.length === rate * seconds)
    && pcm.every(value => Number.isFinite(value) && Math.abs(value) <= 1);
}
