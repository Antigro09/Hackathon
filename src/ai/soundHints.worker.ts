import { SOUND_HINT_LABELS } from './labels';
import { pinSoundHintDownloads } from './environment';
import { SOUND_HINT_MODEL } from './model';
import { evaluateSoundHintRankings, validateSoundHintPcm } from './policy';
import type { SoundHintsRequest, SoundHintsResponse } from './types';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<SoundHintsRequest>) => void) | null;
  postMessage: (message: SoundHintsResponse) => void;
};

// The worker is created only after the explicit Explore action. The library,
// model and runtime are all lazy-loaded inside the first accepted request.
async function createClassifier(sessionId: number) {
  const { env, pipeline } = await import('@huggingface/transformers');
  pinSoundHintDownloads(env);
  // Single-threaded WASM also works without cross-origin isolation; this worker
  // keeps that work off the page thread. WebGPU is intentionally not requested.
  if (!env.backends.onnx.wasm) throw new Error('WASM is unavailable in this browser.');
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  return pipeline('zero-shot-audio-classification', SOUND_HINT_MODEL.id, {
    revision: SOUND_HINT_MODEL.revision,
    dtype: SOUND_HINT_MODEL.dtype,
    device: SOUND_HINT_MODEL.device,
    progress_callback: info => {
      workerScope.postMessage({
        type: 'progress', sessionId, phase: 'loading', status: info.status,
        ...('file' in info ? { file: info.file } : {}),
        ...('loaded' in info ? { loaded: info.loaded } : {}),
        ...('total' in info ? { total: info.total } : {}),
        ...('progress' in info ? { progress: info.progress } : {}),
      });
    },
  });
}

let classifier: Awaited<ReturnType<typeof createClassifier>> | null = null;
let busy = false;

workerScope.onmessage = async ({ data }) => {
  const { sessionId } = data;
  if (busy) {
    workerScope.postMessage({ type: 'error', sessionId, code: 'runtime', message: 'A sound comparison is already running. Cancel it before starting another.' });
    return;
  }
  busy = true;
  let phase: 'validation' | 'loading' | 'inference' = 'validation';
  const started = performance.now();
  try {
    validateSoundHintPcm(data.pcm, data.sampleRateHz, data.qualityCodes);
    if (![44_100, 48_000].includes(data.originalSampleRateHz)
      || data.originalSampleCount !== data.originalSampleRateHz * SOUND_HINT_MODEL.observationSeconds) {
      throw new Error('The original five-second recording metadata is invalid. Try a fresh recording.');
    }
    phase = 'loading';
    const reusedModel = classifier !== null;
    workerScope.postMessage({ type: 'progress', sessionId, phase: 'loading', status: reusedModel ? 'cached' : 'initiate' });
    const loadStarted = performance.now();
    classifier ??= await createClassifier(sessionId);
    const modelLoadMs = performance.now() - loadStarted;
    phase = 'inference';
    workerScope.postMessage({ type: 'progress', sessionId, phase: 'inference', status: 'running' });
    const inferenceStarted = performance.now();
    // A typed PCM array is passed directly. No URL, upload endpoint, or remote
    // inference call receives the recording. The processor's repeatpad policy
    // zero-pads this exact five-second input; it does not add observation time.
    const raw = await classifier(data.pcm, [...SOUND_HINT_LABELS], { hypothesis_template: '{}' });
    if (!Array.isArray(raw) || raw.some(item => Array.isArray(item))) throw new Error('Unexpected model output.');
    const rankings = evaluateSoundHintRankings(raw as Array<{ label: string; score: number }>);
    workerScope.postMessage({
      type: 'result', sessionId,
      result: {
        ...rankings,
        modelId: SOUND_HINT_MODEL.id,
        modelRevision: SOUND_HINT_MODEL.revision,
        preprocessing: {
          originalSampleRateHz: data.originalSampleRateHz,
          originalSampleCount: data.originalSampleCount,
          observationSeconds: data.originalSampleCount / data.originalSampleRateHz,
          modelSampleRateHz: SOUND_HINT_MODEL.sampleRateHz,
          modelInputSamples: data.pcm.length,
          processorSeconds: SOUND_HINT_MODEL.processorSeconds,
          padding: SOUND_HINT_MODEL.padding,
          configuredPadding: SOUND_HINT_MODEL.configuredPadding,
          featureBandHz: [SOUND_HINT_MODEL.featureMinHz, SOUND_HINT_MODEL.featureMaxHz],
        },
        timing: { modelLoadMs, inferenceMs: performance.now() - inferenceStarted, totalMs: performance.now() - started, reusedModel },
      },
    });
  } catch (error) {
    // Release a failed runtime; a retry starts from a clean pipeline. Successful
    // requests reuse the model. Cancel/reset terminate the entire worker and its
    // WASM memory, while the parent ignores late messages by session ID.
    if (phase === 'inference' && classifier) {
      try { await classifier.dispose(); } catch { /* Preserve the original failure. */ }
      classifier = null;
    }
    workerScope.postMessage({
      type: 'error', sessionId,
      code: phase === 'validation' ? 'invalid-input' : phase === 'loading' ? 'unavailable' : 'runtime',
      message: phase === 'validation' && error instanceof Error ? error.message
        : phase === 'loading'
          ? 'The optional sound model could not load. Check your connection and available memory, then retry. Standard analysis and reports are still available.'
          : 'The local sound comparison could not finish. Try again or continue with the standard analysis and report.',
    });
  } finally {
    // The transferred input is not retained after inference or an error.
    data.pcm = new Float32Array(0);
    busy = false;
  }
};
