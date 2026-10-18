import { useEffect, useId, useRef, useState } from 'react';
import type { AnalysisResult } from '../types';
import { copySoundHintObservation } from '../ai/input';
import { soundHintsBlockedReason } from '../ai/policy';
import { SOUND_FAMILY_DISPLAY_V3, SOUND_HINT_MODEL_V3 } from '../ai/modelV3';
import { loadSoundHintHeadV3 } from '../ai/headV3';
import { Icon } from './Icon';

export interface SoundHintsInputV3 { pcm: Float32Array; fs: number }
type Family = keyof typeof SOUND_FAMILY_DISPLAY_V3;
type Phase = 'idle' | 'loading' | 'self-test' | 'ready' | 'canceled' | 'error';
export interface SoundHintsViewV3 { phase: Phase; family: Family | null; error: string }
type Head = { predict(embedding: Float32Array): { accepted: boolean; label: string } };
type DiagnosticWorker = Pick<Worker, 'onmessage' | 'onerror' | 'postMessage' | 'terminate'>;
interface SessionDependencies {
  onChange(value: SoundHintsViewV3): void;
  createWorker?(): DiagnosticWorker;
  loadHead?(signal: AbortSignal): Promise<Head>;
}

const idleView = (): SoundHintsViewV3 => ({ phase: 'idle', family: null, error: '' });
const unavailable = 'The optional local sound model could not complete its checks. Your standard indicators and report remain available. Clear the hints or try again in a current browser with enough free memory.';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const familyAdvice: Record<Family, string> = {
  buzz: 'The buzz family includes insect recordings. A buzz-like match does not establish electrical hum or equipment noise.',
  mechanical_fan: 'A fan-like resemblance does not distinguish data-center cooling from other fans or machinery. Compare another capture under similar conditions.',
  speech: 'If you are investigating a persistent background sound, try another capture without nearby conversation.',
  traffic: 'If you are investigating a persistent background sound, compare another capture when nearby traffic subsides.',
  wind: 'If wind is audible at the microphone, try a sheltered microphone position and compare another capture.',
};

function blockedReason(result: AnalysisResult, input: SoundHintsInputV3 | null): string | null {
  return soundHintsBlockedReason(result.qualityCodes)
    ?? (result.inputKind !== 'microphone' ? 'Sound hints require a current microphone observation.' : null)
    ?? (!input ? 'The audio for this session is no longer available. Record a new observation to explore sound families.' : null)
    ?? (input && (input.fs !== result.sampleRateHz || ![44_100, 48_000].includes(input.fs)) ? 'The retained audio rate does not match this supported microphone observation.' : null)
    ?? (!Number.isFinite(result.durationSeconds) || result.durationSeconds < SOUND_HINT_MODEL_V3.observationSeconds ? 'Sound hints require at least five seconds of recorded audio.' : null);
}

/** One local worker/head per mounted panel. Exported to test async ownership without a DOM or model download. */
export function createSoundHintsSessionV3(dependencies: SessionDependencies) {
  let epoch = 0;
  let worker: DiagnosticWorker | null = null;
  let head: Head | null = null;
  let abort: AbortController | null = null;
  let disposed = false;
  let view = idleView();
  const emit = (next: SoundHintsViewV3) => { view = next; dependencies.onChange({ ...next }); };
  const release = () => {
    ++epoch;
    abort?.abort(); abort = null;
    head = null;
    const previous = worker; worker = null;
    if (previous) { previous.onmessage = null; previous.onerror = null; previous.terminate(); }
  };
  const cancel = (phase: 'idle' | 'canceled' = 'canceled') => {
    release();
    if (!disposed) emit({ phase, family: null, error: '' });
  };

  async function run(result: AnalysisResult, input: SoundHintsInputV3 | null) {
    if (disposed || view.phase === 'loading' || view.phase === 'self-test') return;
    release();
    const blocked = blockedReason(result, input);
    if (blocked || !input) { emit({ phase: 'error', family: null, error: blocked ?? unavailable }); return; }
    const sessionId = epoch;
    const requestId = `r${sessionId}`;
    const controller = new AbortController(); abort = controller;
    const current = () => !disposed && epoch === sessionId && !controller.signal.aborted;
    const fail = () => { if (current()) { release(); emit({ phase: 'error', family: null, error: unavailable }); } };
    emit({ phase: 'loading', family: null, error: '' });
    try {
      // Keep the original 44.1/48 kHz rate. Only the verified worker resamples.
      const pcm = copySoundHintObservation(input.pcm, input.fs);
      const loadedHead = await (dependencies.loadHead ?? loadSoundHintHeadV3)(controller.signal);
      if (!current()) return;
      head = loadedHead;
      const next = (dependencies.createWorker ?? (() => new Worker(SOUND_HINT_MODEL_V3.workerUrl, { type: 'module' })))();
      worker = next;
      next.onmessage = (event: MessageEvent<unknown>) => {
        if (!current() || worker !== next) return;
        const message = event.data;
        if (!object(message) || message.requestId !== requestId) return;
        if (message.type === 'status') {
          if (message.phase === 'loading' || message.phase === 'self-test') emit({ phase: message.phase, family: null, error: '' });
        } else if (message.type === 'embedding') {
          try {
            const embedding = message.embedding;
            const provenance = message.provenance;
            if (!(embedding instanceof Float32Array) || embedding.length !== 512 || embedding.some(value => !Number.isFinite(value))
              || !object(provenance) || provenance.selfTestPassed !== true || provenance.dimension !== 512
              || provenance.modelSha256 !== SOUND_HINT_MODEL_V3.modelSha256
              || provenance.runtimeFingerprintSha256 !== SOUND_HINT_MODEL_V3.runtimeFingerprintSha256
              || provenance.preprocessingContractSha256 !== SOUND_HINT_MODEL_V3.preprocessingContractSha256
              || provenance.sampleRateHz !== input.fs || provenance.sampleCount !== input.fs * SOUND_HINT_MODEL_V3.observationSeconds
              || provenance.durationSeconds !== SOUND_HINT_MODEL_V3.observationSeconds || provenance.classifierIncluded !== false
              || provenance.promotionAllowed !== false || !head) throw new Error('Invalid local diagnostic result');
            const prediction = head.predict(embedding);
            const family = prediction.accepted === true && Object.hasOwn(SOUND_FAMILY_DISPLAY_V3, prediction.label) ? prediction.label as Family : null;
            // Keep only a broad accepted family. Do not retain scores, vectors, or closest guesses in UI state.
            emit({ phase: 'ready', family, error: '' });
          } catch { fail(); }
        } else if (message.type === 'cancelled') {
          cancel();
        } else if (message.type === 'error' || message.type === 'disposed') {
          fail();
        }
      };
      next.onerror = () => { fail(); };
      // Transfer the separate five-second copy, never the retained DSP buffer.
      next.postMessage({ type: 'extract', requestId, pcm, sampleRateHz: input.fs }, [pcm.buffer]);
    } catch { fail(); }
  }

  return {
    run, cancel,
    dispose() { disposed = true; release(); view = idleView(); },
    getState: () => ({ ...view }),
  };
}

/** Optional local family hints, kept separate from the full observation and report. */
export function SoundHintsPanelV3({ result, input, observationDurationSeconds = result.durationSeconds }: {
  result: AnalysisResult; input: SoundHintsInputV3 | null; observationDurationSeconds?: number;
}) {
  const titleId = useId();
  const [state, setState] = useState<SoundHintsViewV3 & { resultId: string; pcm: Float32Array | null; fs: number | null }>({ ...idleView(), resultId: result.id, pcm: input?.pcm ?? null, fs: input?.fs ?? null });
  const session = useRef<ReturnType<typeof createSoundHintsSessionV3> | null>(null);
  const blocked = blockedReason(result, input);
  const view = state.resultId === result.id && state.pcm === (input?.pcm ?? null) && state.fs === (input?.fs ?? null) ? state : idleView();
  const busy = view.phase === 'loading' || view.phase === 'self-test';

  useEffect(() => {
    const owner = { resultId: result.id, pcm: input?.pcm ?? null, fs: input?.fs ?? null };
    const current = createSoundHintsSessionV3({ onChange: next => setState({ ...next, ...owner }) });
    session.current = current;
    setState({ ...idleView(), ...owner });
    return () => { current.dispose(); if (session.current === current) session.current = null; };
  }, [result.id, input?.pcm, input?.fs, blocked]);

  return <section className="panel sound-hints-panel" aria-labelledby={titleId}>
    <div className="section-heading"><div><p className="eyebrow">Optional / local AI</p><h2 id={titleId}>Explore a broad sound family</h2></div><span className="experimental-tag">Limited / experimental</span></div>
    <p className="sound-hints-intro">This limited model explores buzz-like, mechanical fan-like, speech-like, traffic-like and wind-like sounds. It can leave a sound unclassified.</p>
    <div className="sound-hints-consent"><Icon name="info" size={21}/><div><strong>Data-center sound comparison: not validated.</strong><p>These broad sound families occur in many settings. A hint cannot confirm a data-center source or faithful microphone capture. Use the separate Recording check to review digital capture problems.</p></div></div>
    <p className="sound-hints-message">AI window: the first {SOUND_HINT_MODEL_V3.observationSeconds} seconds of this {observationDurationSeconds.toFixed(2)}-second observation. The standard indicators and report use the full {result.durationSeconds.toFixed(2)} seconds.{observationDurationSeconds > SOUND_HINT_MODEL_V3.observationSeconds ? ' Sounds after the first five seconds are not included in these hints.' : ''}</p>
    <div className="sound-hints-consent"><Icon name="shield" size={21}/><div><strong>Runs locally after you choose Explore.</strong><p>About {SOUND_HINT_MODEL_V3.downloadMegabytes} MB is downloaded when you start the local model. Loading can take a few minutes and needs available memory. Audio stays on this device. No download starts until you choose Explore.</p></div></div>
    {blocked ? <p className="sound-hints-blocked">{blocked}</p> : null}
    {busy ? <div className="sound-hints-progress" role="status"><strong>{view.phase === 'self-test' ? 'Checking the sound model on this device…' : 'Loading and verifying the optional local model…'}</strong><span className="working-line"/><span>You can review and export your standard observation while this runs.</span><button type="button" className="button secondary" onClick={() => session.current?.cancel()}>Cancel sound hints</button></div>
      : <div className="sound-hints-actions">{view.phase !== 'ready' ? <button type="button" className="button secondary" disabled={Boolean(blocked)} onClick={() => { void session.current?.run(result, input); }}>Explore sound families (experimental)<Icon name="arrow" size={17}/></button> : null}{view.phase === 'ready' ? <button type="button" className="text-button" onClick={() => session.current?.cancel('idle')}>Clear hints &amp; unload model</button> : null}</div>}
    {view.phase === 'canceled' ? <p className="sound-hints-message" role="status">Sound exploration canceled. Your standard result and report are unchanged.</p> : null}
    {view.phase === 'error' ? <div className="error-box" role="alert"><strong>Sound hints unavailable</strong><p>{view.error}</p></div> : null}
    {view.phase === 'ready' && !blocked ? <div className="sound-hints-results" aria-live="polite"><div className="sound-hints-verdict"><strong>{view.family ? SOUND_FAMILY_DISPLAY_V3[view.family] : 'No sound family suggested'}</strong><p>{view.family ? 'A limited experimental resemblance, with substantial uncertainty. This does not establish what produced the sound.' : 'This model did not accept a known family strongly enough. Unclassified does not mean quiet or that equipment noise is absent.'}</p>{view.family ? <p>{familyAdvice[view.family]}</p> : null}</div></div> : null}
    <p className="screening-note">Hints do not change the indicators and are excluded from exported reports. They cannot identify a facility, device, location or physical source.</p>
    <details className="method-details"><summary>Model, preprocessing &amp; limitations</summary><p><a href={`${SOUND_HINT_MODEL_V3.modelUrl}/tree/${SOUND_HINT_MODEL_V3.revision}`} target="_blank" rel="noreferrer">{SOUND_HINT_MODEL_V3.id}</a>. A verified audio-only model runs in a local WASM worker; a fixed head can accept a broad family or abstain. These hints are experimental, not probabilities or measured source identity.</p><p>A separate copy of the first five recorded seconds keeps its actual sample rate until the verified worker resamples to 48 kHz. The pinned processor adds five seconds of zeros, which adds no recorded time. The full observation remains intact for the standard analysis and report.</p><p>The buzz family includes insect recordings and does not validate electrical hum or equipment identification. Public-recording labels and software startup checks do not establish accuracy on this microphone or environment. Quiet, mixed, unfamiliar and weak sounds may remain unclassified.</p><p><a href="#/sources">Read the model comparison and its limits</a>. <a href="/ai/canonical-v3/TRAINING_ATTRIBUTION.json" target="_blank" rel="noreferrer">Training-data credits</a> and <a href="/ai/canonical-v3/MODEL_NOTICE.txt" target="_blank" rel="noreferrer">model notices</a>. Upstream model information: <a href={SOUND_HINT_MODEL_V3.upstreamLicenseUrl} target="_blank" rel="noreferrer">CLAP documentation</a>.</p></details>
  </section>;
}

export default SoundHintsPanelV3;
