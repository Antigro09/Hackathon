import { SPEECH_VAD_MODEL, validSpeechVadCapture } from './speechVadModel';
import type { SpeechVadOptions, SpeechVadProgress, SpeechVadResult } from './speechVadTypes';
export type { SpeechVadOptions, SpeechVadProgress, SpeechVadResult, SpeechVadInterval } from './speechVadTypes';
export { SPEECH_VAD_MODEL, SPEECH_VAD_RUNTIME } from './speechVadModel';

export class SpeechVadError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'SpeechVadError'; }
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
let nextRequest = 0;

function validResult(value: unknown, duration: number): value is SpeechVadResult {
  if (!record(value) || value.captureDurationSeconds !== duration || value.frameCount !== Math.ceil(duration * 16_000 / 512)
    || value.coverage !== 'full-recording' || value.sampleRateHz !== 16_000 || value.modelId !== SPEECH_VAD_MODEL.id
    || value.modelRevision !== SPEECH_VAD_MODEL.revision || value.modelSha256 !== SPEECH_VAD_MODEL.sha256
    || value.policyVersion !== SPEECH_VAD_MODEL.policyVersion || value.selfTestPassed !== true
    || !Array.isArray(value.intervals) || value.intervals.length > 128 || value.speechDetected !== (value.intervals.length > 0)) return false;
  let previousEnd = 0;
  for (const interval of value.intervals) {
    if (!record(interval) || typeof interval.startSeconds !== 'number' || typeof interval.endSeconds !== 'number'
      || !Number.isFinite(interval.startSeconds) || !Number.isFinite(interval.endSeconds)
      || interval.startSeconds < previousEnd || interval.endSeconds <= interval.startSeconds || interval.endSeconds > duration) return false;
    previousEnd = interval.endSeconds;
  }
  return true;
}

function validProgress(value: unknown, frames: number): value is SpeechVadProgress {
  return record(value) && ['loading', 'self-test', 'analyzing'].includes(String(value.phase))
    && Number.isSafeInteger(value.completedFrames) && Number(value.completedFrames) >= 0 && Number(value.completedFrames) <= frames
    && value.totalFrames === frames;
}

/** Test seam only: production always creates its own same-origin dedicated worker. */
export function createSpeechVadScanner({ createWorker = () => new Worker(new URL('./speechVad.worker.ts', import.meta.url), { type: 'module' }), timeoutMs = 120_000 }: {
  createWorker?: () => Worker; timeoutMs?: number;
} = {}) {
  return function scan(pcm: Float32Array, sampleRateHz: number, options: SpeechVadOptions = {}): Promise<SpeechVadResult> {
    if (!validSpeechVadCapture(pcm, sampleRateHz)) return Promise.reject(new SpeechVadError('invalid-input', 'Speech screening needs the complete five, fifteen or thirty second microphone recording.'));
    if (options.signal?.aborted) return Promise.reject(new DOMException('Speech screening cancelled.', 'AbortError'));
    const requestId = `speech${++nextRequest}`, duration = pcm.length / sampleRateHz, totalFrames = Math.ceil(duration * 16_000 / 512);
    return new Promise((resolve, reject) => {
      let worker: Worker | null = null, done = false;
      const cleanup = () => {
        clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
        if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); worker = null; }
      };
      const fail = (error: Error) => { if (!done) { done = true; cleanup(); reject(error); } };
      const abort = () => fail(new DOMException('Speech screening cancelled.', 'AbortError'));
      const timer = setTimeout(() => fail(new SpeechVadError('timeout', 'Speech screening took too long. Try again on this device.')), timeoutMs);
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        worker = createWorker();
        worker.onerror = () => fail(new SpeechVadError('worker', 'The local speech worker is unavailable.'));
        worker.onmessageerror = () => fail(new SpeechVadError('message', 'The speech worker returned unreadable data.'));
        worker.onmessage = event => {
          const response: unknown = event.data;
          if (done || !record(response) || response.requestId !== requestId) return;
          if (response.type === 'progress') {
            if (!validProgress(response.progress, totalFrames)) { fail(new SpeechVadError('invalid-progress', 'The speech worker returned invalid progress.')); return; }
            try { options.onProgress?.(response.progress); }
            catch { fail(new SpeechVadError('progress-handler', 'The speech check could not update its progress.')); }
          } else if (response.type === 'result') {
            if (!validResult(response.result, duration)) { fail(new SpeechVadError('invalid-result', 'The local speech result could not be verified.')); return; }
            done = true; cleanup(); resolve(response.result);
          } else if (response.type === 'error') {
            fail(new SpeechVadError(typeof response.code === 'string' ? response.code : 'runtime', 'The local speech check is unavailable. Try again or review the recording yourself.'));
          } else fail(new SpeechVadError('invalid-message', 'The speech worker returned an unexpected message.'));
        };
        // The caller retains its native recording for DSP, the family head and local playback.
        if (done || options.signal?.aborted) { worker.terminate(); worker = null; abort(); return; }
        const copy = pcm.slice();
        worker.postMessage({ type: 'scan', requestId, pcm: copy, sampleRateHz }, [copy.buffer]);
      } catch { fail(new SpeechVadError('worker', 'The local speech worker could not start.')); }
    });
  };
}

/** The worker is released and terminated before this promise resolves or rejects. */
export const scanSpeechInterference = createSpeechVadScanner();
