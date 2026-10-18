/** Research-only encoder. The caller supplies verified local library/model bytes. */
export const CANONICAL_ENCODER = Object.freeze({
  schemaVersion: 1,
  implementation: 'tw-canonical-clap-wasm-v1',
  modelId: 'Xenova/clap-htsat-unfused',
  revision: 'c28f2883575e590e04d3146ff0713c2448d691ba',
  modelFile: 'onnx/audio_model_quantized.onnx',
  modelSha256: '3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f',
  transformersVersion: '4.3.1',
  ortVersion: '1.31.0-dev.20260914-8d85527a0',
  runtimeSha256: {
    'ort.wasm.bundle.min.mjs': '17b52c1ac62b421dc508b4c28b9a9675251c6e25dd512ef54b83a5e2c4242869',
    'ort-wasm-simd-threaded.mjs': 'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f',
    'ort-wasm-simd-threaded.wasm': '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3',
  },
  sampleRateHz: 48000,
  inputDurationSeconds: 5,
  featureShape: [1, 1, 1001, 64],
  embeddingSize: 512,
  normalization: 'Float64 sequential squared sum and sqrt, then Float32 coordinate division',
  preprocessing: 'Transformers.js4.3.1 ClapFeatureExtractor: five seconds input plus five seconds zero padding',
  execution: {provider: 'wasm', numThreads: 1, proxy: false, simdFeatureCheck: 'fixed', graphOptimizationLevel: 'all', executionMode: 'sequential'},
});

export function requirePcm(pcm, sampleRateHz) {
  if (!(pcm instanceof Float32Array) || ![44100, 48000].includes(sampleRateHz) || pcm.length !== sampleRateHz * 5) throw new Error('Expected exactly five seconds of mono Float32 PCM at 44100 or 48000 Hz');
  let squares = 0;
  for (const value of pcm) {
    if (!Number.isFinite(value)) throw new Error('Non-finite PCM');
    if (Math.abs(value) >= .999) throw new Error('Clipped or near-full-scale PCM is ineligible for this experiment');
    squares += value * value;
  }
  if (Math.sqrt(squares / pcm.length) < 1e-5) throw new Error('Near-zero PCM is ineligible for this experiment');
}

export function normalizeCanonicalEmbedding(values) {
  if (!(values instanceof Float32Array) || values.length !== 512) throw new Error('Expected 512 Float32 encoder coordinates');
  let squares = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error('Non-finite encoder output');
    squares += value * value;
  }
  const norm = Math.sqrt(squares);
  if (!(norm > 1e-12) || !Number.isFinite(norm)) throw new Error('Zero or invalid encoder output');
  return Float32Array.from(values, value => value / norm);
}

export async function createCanonicalEncoder({ort, processor, resample, modelBytes, wasmPaths}) {
  if (ort.env.versions.web !== CANONICAL_ENCODER.ortVersion) throw new Error('Unpinned ORT Web version');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  // This checks fixed-width SIMD support; the server separately hashes the actual WASM build.
  ort.env.wasm.simd = 'fixed';
  ort.env.wasm.wasmPaths = wasmPaths;
  const session = await ort.InferenceSession.create(modelBytes, {executionProviders: ['wasm'], graphOptimizationLevel: 'all', executionMode: 'sequential'});
  if (session.inputNames.join() !== 'input_features' || !session.outputNames.includes('audio_embeds')) {
    await session.release();
    throw new Error('Unexpected audio-only encoder schema');
  }
  let disposed = false;
  return {
    async extract(pcm, sampleRateHz) {
      if (disposed) throw new Error('Encoder already disposed');
      requirePcm(pcm, sampleRateHz);
      const started = performance.now();
      const resampled = await resample(pcm, sampleRateHz);
      if (!(resampled instanceof Float32Array) || resampled.length !== 240000 || resampled.some(value => !Number.isFinite(value))) throw new Error('Invalid resampled PCM');
      const input = await processor(resampled);
      const features = input.input_features;
      if (features.type !== 'float32' || features.dims.join() !== CANONICAL_ENCODER.featureShape.join() || features.data.some(value => !Number.isFinite(value))) throw new Error('Invalid log-mel features');
      const preprocessingMs = performance.now() - started;
      const output = await session.run({input_features: new ort.Tensor('float32', features.data, features.dims)}, ['audio_embeds']);
      let embedding;
      try { embedding = normalizeCanonicalEmbedding(output.audio_embeds.data); }
      finally { output.audio_embeds.dispose(); }
      const inferenceMs = performance.now() - started - preprocessingMs;
      return {resampled, features: features.data, embedding, preprocessingMs, inferenceMs};
    },
    async dispose() { if (!disposed) { disposed = true; await session.release(); } },
  };
}
