import { SPEECH_VAD_MODEL, SPEECH_VAD_RUNTIME, validSpeechVadCapture } from './speechVadModel';
import { resampleForSpeechVad } from './speechVadResample';
import { runSpeechVadFrames, speechVadSelfTestPassed, SPEECH_VAD_SELF_TEST } from './speechVadInference';
import type { SpeechVadOrt, SpeechVadSession } from './speechVadInference';
import type { SpeechVadProgress, SpeechVadResponse, SpeechVadResult } from './speechVadTypes';

const scope = self as unknown as { location: Location; onmessage: ((event: MessageEvent<unknown>) => void) | null; postMessage(value: SpeechVadResponse): void };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
class ScanError extends Error { constructor(public code: string, message: string) { super(message); } }
const actualSha = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), value => value.toString(16).padStart(2, '0')).join('');

/** Stream bounded static bytes, reject redirects and validate independent source pins before execution. */
async function verifiedAsset(url: URL, expected: { bytes: number; sha256: string }): Promise<Uint8Array<ArrayBuffer>> {
  if (url.origin !== scope.location.origin || !['http:', 'https:'].includes(url.protocol)) throw new ScanError('asset-origin', 'Unexpected asset origin.');
  const response = await fetch(url, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new ScanError('asset-unavailable', 'Speech assets are unavailable.');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > expected.bytes)) throw new ScanError('asset-size', 'Unexpected speech asset size.');
  const reader = response.body?.getReader();
  if (!reader) throw new ScanError('asset-stream', 'Speech assets require bounded streaming.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > expected.bytes) throw new ScanError('asset-size', 'Speech asset exceeded its bound.');
      chunks.push(chunk.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (bytes.byteLength !== expected.bytes || await actualSha(bytes) !== expected.sha256) throw new ScanError('asset-mismatch', 'Speech asset verification failed.');
  return bytes;
}

let busy = false;
scope.onmessage = async event => {
  const request = event.data;
  if (!record(request) || request.type !== 'scan' || typeof request.requestId !== 'string' || !/^speech\d+$/.test(request.requestId)) return;
  const requestId = request.requestId;
  if (busy) { scope.postMessage({ type: 'error', requestId, code: 'busy', message: 'Only one recording is screened per worker.' }); return; }
  busy = true;
  let session: SpeechVadSession | undefined, ort: SpeechVadOrt | undefined, result: SpeechVadResult | undefined, failure: unknown;
  const urls: string[] = [];
  const makeUrl = (bytes: Uint8Array<ArrayBuffer>, type = 'text/javascript') => { const url = URL.createObjectURL(new Blob([bytes], { type })); urls.push(url); return url; };
  const duration = request.pcm instanceof Float32Array && typeof request.sampleRateHz === 'number' ? request.pcm.length / request.sampleRateHz : 0;
  const totalFrames = Math.ceil(duration * 16_000 / 512);
  const progress = (phase: SpeechVadProgress['phase'], completedFrames = 0) => scope.postMessage({ type: 'progress', requestId, progress: { phase, completedFrames, totalFrames } });
  try {
    if (!validSpeechVadCapture(request.pcm, request.sampleRateHz)) throw new ScanError('invalid-input', 'A complete microphone capture is required.');
    progress('loading');
    const base = new URL('/ai/canonical-v3/', scope.location.href);
    const resources = new Map<string, Uint8Array<ArrayBuffer>>();
    for (const [name, expected] of Object.entries(SPEECH_VAD_RUNTIME)) resources.set(name, await verifiedAsset(new URL(name, base), expected));
    const model = await verifiedAsset(new URL(`/ai/speech-vad/${SPEECH_VAD_MODEL.filename}`, scope.location.href), SPEECH_VAD_MODEL);
    // Execute exactly the verified bytes, rather than re-fetching executable URLs after verification.
    const ortUrl = makeUrl(resources.get('ort.wasm.bundle.min.mjs')!);
    ort = await import(/* @vite-ignore */ ortUrl) as SpeechVadOrt;
    if (ort.env.versions.web !== SPEECH_VAD_MODEL.ortVersion) throw new ScanError('runtime-version', 'Unexpected speech runtime version.');
    const loader = makeUrl(resources.get('runtime/ort-wasm-simd-threaded.mjs')!);
    const wasm = makeUrl(resources.get('runtime/ort-wasm-simd-threaded.wasm')!, 'application/wasm');
    ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.simd = 'fixed';
    ort.env.wasm.wasmBinary = resources.get('runtime/ort-wasm-simd-threaded.wasm')!;
    ort.env.wasm.wasmPaths = { mjs: loader, wasm };
    session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', executionMode: 'sequential' });
    if (session.inputNames.join() !== 'input,state,sr' || session.outputNames.join() !== 'output,stateN') throw new ScanError('model-schema', 'Unexpected speech model interface.');
    progress('self-test');
    const startup = await runSpeechVadFrames(ort, session, new Float32Array(SPEECH_VAD_SELF_TEST.length * 512));
    if (!speechVadSelfTestPassed(startup.probabilities) || startup.intervals.length !== 0) throw new ScanError('self-test', 'The speech model startup check failed.');
    progress('analyzing');
    const pcm16k = resampleForSpeechVad(request.pcm, request.sampleRateHz as number);
    const scanned = await runSpeechVadFrames(ort, session, pcm16k, frames => progress('analyzing', frames));
    result = { speechDetected: scanned.intervals.length > 0, intervals: scanned.intervals, captureDurationSeconds: duration,
      frameCount: scanned.probabilities.length, coverage: 'full-recording', sampleRateHz: 16_000,
      modelId: SPEECH_VAD_MODEL.id, modelRevision: SPEECH_VAD_MODEL.revision, modelSha256: SPEECH_VAD_MODEL.sha256,
      policyVersion: SPEECH_VAD_MODEL.policyVersion, selfTestPassed: true };
  } catch (error) { failure = error; }
  finally {
    try { await session?.release(); } catch (error) { failure = error; }
    if (ort) ort.env.wasm.wasmBinary = undefined;
    for (const url of urls) URL.revokeObjectURL(url);
  }
  // Only publish after disposing the inference session; the caller then terminates this worker.
  if (failure) scope.postMessage({ type: 'error', requestId, code: failure instanceof ScanError ? failure.code : 'runtime', message: 'The speech check is unavailable.' });
  else if (result) scope.postMessage({ type: 'result', requestId, result });
};
