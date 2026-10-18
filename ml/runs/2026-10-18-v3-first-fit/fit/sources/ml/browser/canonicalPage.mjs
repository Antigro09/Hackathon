import {AutoProcessor, env} from '/transformers.web.js';
import * as ort from '/ort.wasm.bundle.min.mjs';
import {resampleForSoundHints} from '/app/resample.js';
import {CANONICAL_ENCODER, createCanonicalEncoder} from '/canonicalEncoder.mjs';

const sha = async values => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', values)), value => value.toString(16).padStart(2, '0')).join('');
const dataBytes = values => values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength);
const status = document.getElementById('status');
const run = document.getElementById('run');
window.canonicalState = {status: 'idle', completed: 0};

async function extractAll() {
  run.disabled = true;
  let encoder;
  try {
    window.canonicalState.status = 'loading';
    const config = await (await fetch('/run.json')).json();
    const contract = config.contract;
    if (env.version !== CANONICAL_ENCODER.transformersVersion) throw new Error('Unpinned Transformers.js version');
    if (new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] !== 4) throw new Error('This PCM contract requires a little-endian runtime');
    env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = '/models/';
    env.useBrowserCache = false; env.useFSCache = false;
    const loadedAt = performance.now();
    const processor = await AutoProcessor.from_pretrained(CANONICAL_ENCODER.revision, {local_files_only: true});
    const modelBytes = new Uint8Array(await (await fetch('/audio_model_quantized.onnx')).arrayBuffer());
    if (await sha(modelBytes) !== CANONICAL_ENCODER.modelSha256) throw new Error('Model SHA mismatch in browser');
    encoder = await createCanonicalEncoder({ort, processor, resample: resampleForSoundHints, modelBytes, wasmPaths: {mjs: `${location.origin}/runtime/ort-wasm-simd-threaded.mjs`, wasm: `${location.origin}/runtime/ort-wasm-simd-threaded.wasm`}});
    const browser = {userAgent: navigator.userAgent, platform: navigator.platform, hardwareConcurrency: navigator.hardwareConcurrency, transformersVersion: env.version, ortVersion: ort.env.versions.web};
    window.canonicalState = {status: 'running', completed: 0, total: config.records.length, resumed: config.resumed, modelLoadMs: performance.now() - loadedAt, browser, contractSha256: config.contractSha256};
    for (const record of config.records) {
      const sourceBuffer = await (await fetch(`/pcm/${record.row}`)).arrayBuffer();
      if (await sha(sourceBuffer) !== record.pcm_sha256) throw new Error(`PCM SHA mismatch at row ${record.row}`);
      const pcm = new Float32Array(sourceBuffer);
      const repeats = [];
      let result;
      for (let repeat = 0; repeat < contract.repeatCount; repeat++) {
        result = await encoder.extract(pcm, record.sample_rate);
        repeats.push({pcm48Sha256: await sha(dataBytes(result.resampled)), featureSha256: await sha(dataBytes(result.features)), embeddingSha256: await sha(dataBytes(result.embedding)), preprocessingMs: result.preprocessingMs, inferenceMs: result.inferenceMs});
      }
      if (await sha(sourceBuffer) !== record.pcm_sha256) throw new Error('Encoder mutated input PCM');
      if (repeats.some(value => value.pcm48Sha256 !== repeats[0].pcm48Sha256 || value.featureSha256 !== repeats[0].featureSha256 || value.embeddingSha256 !== repeats[0].embeddingSha256)) throw new Error(`Non-repeatable extraction for row ${record.row}`);
      const checkpoint = {schemaVersion: 1, row: record.row, clipId: record.clip_id, sourceSha256: record.source_sha256, pcmSha256: record.pcm_sha256, contractSha256: config.contractSha256, browser, repeats, embedding: Array.from(result.embedding)};
      const response = await fetch('/checkpoint', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Run-Token': config.token}, body: JSON.stringify(checkpoint)});
      if (!response.ok) throw new Error(`Checkpoint rejected: ${await response.text()}`);
      window.canonicalState.completed++;
      status.textContent = JSON.stringify(window.canonicalState, null, 2);
      // Let the page/service control remain responsive between clips.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    window.canonicalState.status = 'complete';
  } catch (error) {
    window.canonicalState.status = 'error'; window.canonicalState.error = String(error.stack || error);
  } finally {
    if (encoder) await encoder.dispose();
    window.canonicalState.disposed = true;
    status.textContent = JSON.stringify(window.canonicalState, null, 2);
    run.disabled = false;
  }
}
run.addEventListener('click', extractAll);
window.startCanonicalExtraction = extractAll;
