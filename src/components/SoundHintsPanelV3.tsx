import { useEffect, useId, useRef, useState } from 'react';
import type { AnalysisResult } from '../types';
import { soundHintsBlockedReason } from '../ai/policy';
import { SOUND_FAMILY_DISPLAY_V3, SOUND_HINT_MODEL_V3 } from '../ai/modelV3';
import { loadSoundHintHeadV3 } from '../ai/headV3';
import { assessRecordingCheck } from '../analysis/recordingCheck';
import { assessTargetSound, type TargetSoundAssessment, type TargetSoundWindow } from '../ai/targetSound';
import { Icon } from './Icon';
import '../recording-check.css';

export interface SoundHintsInputV3 { pcm: Float32Array; fs: number }
type Family = keyof typeof SOUND_FAMILY_DISPLAY_V3;
type Phase = 'idle' | 'loading' | 'self-test' | 'analyzing' | 'ready' | 'canceled' | 'error';
export interface SoundHintsViewV3 {
  phase: Phase; family: Family | null; error: string;
  windowIndex: number; windowCount: number; windows: TargetSoundWindow[]; target: TargetSoundAssessment | null;
}
type Head = { predict(embedding: Float32Array): { accepted: boolean; label: string } };
type DiagnosticWorker = Pick<Worker, 'onmessage' | 'onerror' | 'postMessage' | 'terminate'>;
interface SessionDependencies {
  onChange(value: SoundHintsViewV3): void;
  createWorker?(): DiagnosticWorker;
  loadHead?(signal: AbortSignal): Promise<Head>;
}

const idleView = (): SoundHintsViewV3 => ({ phase: 'idle', family: null, error: '', windowIndex: 0, windowCount: 0, windows: [], target: null });
const unavailable = 'The optional local sound model could not complete its checks. Your standard indicators and report remain available. Clear the hints or try again in a current browser with enough free memory.';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const copyView = (view: SoundHintsViewV3): SoundHintsViewV3 => ({ ...view,
  windows: view.windows.map(window => ({ ...window })), target: view.target ? { ...view.target } : null });

function blockedReason(result: AnalysisResult, input: SoundHintsInputV3 | null): string | null {
  return soundHintsBlockedReason(result.qualityCodes)
    ?? (result.inputKind !== 'microphone' ? 'Sound hints require a current microphone observation.' : null)
    ?? (!input ? 'The audio for this session is no longer available. Record a new observation to explore sound families.' : null)
    ?? (input && (input.fs !== result.sampleRateHz || ![44_100, 48_000].includes(input.fs)) ? 'The retained audio rate does not match this supported microphone observation.' : null)
    ?? (![5, 15, 30].includes(result.durationSeconds) || !Number.isSafeInteger(result.sampleCount)
      || result.sampleCount !== result.sampleRateHz * result.durationSeconds
      || (input && (!(input.pcm instanceof Float32Array) || input.pcm.length !== result.sampleCount))
      ? 'Sound hints require the complete retained 5, 15 or 30 second microphone capture, with matching sample count and rate.' : null);
}

/** One local worker/head per mounted panel. Exported to test async ownership without a DOM or model download. */
export function createSoundHintsSessionV3(dependencies: SessionDependencies) {
  let epoch = 0;
  let worker: DiagnosticWorker | null = null;
  let head: Head | null = null;
  let abort: AbortController | null = null;
  let disposed = false;
  let view = idleView();
  const emit = (next: SoundHintsViewV3) => { view = copyView(next); dependencies.onChange(copyView(view)); };
  const release = () => {
    ++epoch;
    abort?.abort(); abort = null;
    head = null;
    const previous = worker; worker = null;
    if (previous) { previous.onmessage = null; previous.onerror = null; previous.terminate(); }
  };
  const cancel = (phase: 'idle' | 'canceled' = 'canceled') => {
    release();
    if (!disposed) emit({ ...idleView(), phase });
  };

  async function run(result: AnalysisResult, input: SoundHintsInputV3 | null) {
    if (disposed || view.phase === 'loading' || view.phase === 'self-test' || view.phase === 'analyzing') return;
    release();
    const blocked = blockedReason(result, input);
    if (blocked || !input) { emit({ ...idleView(), phase: 'error', error: blocked ?? unavailable }); return; }
    const sessionId = epoch;
    const controller = new AbortController(); abort = controller;
    const current = () => !disposed && epoch === sessionId && !controller.signal.aborted;
    const fail = () => { if (current()) { release(); emit({ ...idleView(), phase: 'error', error: unavailable }); } };
    const windowCount = result.durationSeconds / SOUND_HINT_MODEL_V3.observationSeconds;
    emit({ ...idleView(), phase: 'loading', windowIndex: 1, windowCount });
    try {
      // Freeze a separate full native-rate copy before loading. Never transfer
      // or mutate the retained DSP buffer, even while later windows are pending.
      let scanPcm: Float32Array | null = input.pcm.slice();
      if (scanPcm.some(sample => !Number.isFinite(sample))) throw new Error('Invalid retained audio.');
      const loadedHead = await (dependencies.loadHead ?? loadSoundHintHeadV3)(controller.signal);
      if (!current()) return;
      head = loadedHead;
      const next = (dependencies.createWorker ?? (() => new Worker(SOUND_HINT_MODEL_V3.workerUrl, { type: 'module' })))();
      worker = next;
      const completed: TargetSoundWindow[] = [];
      let pendingId: string | null = null;
      const sendWindow = () => {
        if (!current() || worker !== next || !scanPcm) return;
        const index = completed.length;
        const samples = input.fs * SOUND_HINT_MODEL_V3.observationSeconds;
        const pcm = scanPcm.slice(index * samples, (index + 1) * samples);
        pendingId = `r${sessionId}w${index + 1}`;
        emit({ ...idleView(), phase: index === 0 ? 'loading' : 'analyzing', windowIndex: index + 1, windowCount });
        if (!current() || worker !== next) return;
        next.postMessage({ type: 'extract', requestId: pendingId, pcm, sampleRateHz: input.fs }, [pcm.buffer]);
      };
      next.onmessage = (event: MessageEvent<unknown>) => {
        if (!current() || worker !== next) return;
        const message = event.data;
        if (!object(message) || pendingId === null || message.requestId !== pendingId) return;
        if (message.type === 'status') {
          if (completed.length === 0 && (message.phase === 'loading' || message.phase === 'self-test')) {
            emit({ ...idleView(), phase: message.phase, windowIndex: 1, windowCount });
          }
        } else if (message.type === 'embedding') {
          pendingId = null;
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
            // Consume this ID before advancing. Duplicate/out-of-order results
            // cannot score a window twice or produce a partial target verdict.
            const startSeconds = completed.length * SOUND_HINT_MODEL_V3.observationSeconds;
            completed.push({ startSeconds, endSeconds: startSeconds + SOUND_HINT_MODEL_V3.observationSeconds, family });
            if (completed.length < windowCount) sendWindow();
            else {
              scanPcm = null;
              emit({ phase: 'ready', family: completed.every(window => window.family === family) ? family : null,
                error: '', windowIndex: windowCount, windowCount, windows: completed, target: assessTargetSound(completed) });
            }
          } catch { fail(); }
        } else if (message.type === 'cancelled') {
          cancel();
        } else if (message.type === 'error' || message.type === 'disposed') {
          fail();
        }
      };
      next.onerror = () => { fail(); };
      sendWindow();
    } catch { fail(); }
  }

  return {
    run, cancel,
    dispose() { disposed = true; release(); view = idleView(); },
    getState: () => copyView(view),
  };
}

/** Optional local family hints, kept separate from the full observation and report. */
export function SoundHintsPanelV3({ result, input }: {
  result: AnalysisResult; input: SoundHintsInputV3 | null; observationDurationSeconds?: number;
}) {
  const titleId = useId();
  const [state, setState] = useState<SoundHintsViewV3 & { resultId: string; pcm: Float32Array | null; fs: number | null }>({ ...idleView(), resultId: result.id, pcm: input?.pcm ?? null, fs: input?.fs ?? null });
  const session = useRef<ReturnType<typeof createSoundHintsSessionV3> | null>(null);
  const blocked = blockedReason(result, input);
  const recordingCheck = assessRecordingCheck(result);
  const recordingReason = recordingCheck.issues.find(issue => issue.severity === 'retake')?.message
    ?? recordingCheck.issues[0]?.message ?? recordingCheck.summary;
  const view = state.resultId === result.id && state.pcm === (input?.pcm ?? null) && state.fs === (input?.fs ?? null) ? state : idleView();
  const busy = view.phase === 'loading' || view.phase === 'self-test' || view.phase === 'analyzing';

  useEffect(() => {
    const owner = { resultId: result.id, pcm: input?.pcm ?? null, fs: input?.fs ?? null };
    const current = createSoundHintsSessionV3({ onChange: next => setState({ ...next, ...owner }) });
    session.current = current;
    setState({ ...idleView(), ...owner });
    return () => { current.dispose(); if (session.current === current) session.current = null; };
  }, [result.id, input?.pcm, input?.fs, blocked]);

  return <section className="panel sound-hints-panel" aria-labelledby={titleId}>
    <div className="section-heading"><div><p className="eyebrow">Optional / local AI</p><h2 id={titleId}>Sound families &amp; equipment-noise target check</h2></div><span className="experimental-tag">Limited / experimental</span></div>
    <p className="sound-hints-intro">Check whether this capture resembles the equipment noise you want, or contains competing sounds. The model can flag speech-like, traffic-like or wind-like sound. Unfamiliar and mixed audio stays unclear.</p>
    <div className="sound-hints-consent"><Icon name="info" size={21}/><div><strong>Data-center sound comparison: not validated.</strong><p>These broad sound families occur in many settings. A hint cannot confirm a data-center source or faithful microphone capture. Use the separate Recording check to review digital capture problems.</p></div></div>
    <p className="sound-hints-message">AI scan: the full {result.durationSeconds.toFixed(2)}-second capture, in non-overlapping five-second windows. The standard indicators and report use the full {result.durationSeconds.toFixed(2)} seconds. Short sounds, overlapping voices and events spanning window boundaries can be missed.</p>
    <div className="sound-hints-consent"><Icon name="shield" size={21}/><div><strong>Runs locally after you choose Explore.</strong><p>About {SOUND_HINT_MODEL_V3.downloadMegabytes} MB is downloaded when you start the local model. Loading can take a few minutes and needs available memory. Audio stays on this device. No download starts until you choose Explore.</p></div></div>
    {blocked ? <p className="sound-hints-blocked">{blocked}</p> : null}
    <div className="sound-hints-controls">
      {busy ? <div className="sound-hints-progress" role="status"><strong>{view.phase === 'self-test' ? 'Checking the sound model on this device…' : view.phase === 'analyzing' ? `Analyzing window ${view.windowIndex} of ${view.windowCount}…` : 'Loading and verifying the optional local model…'}</strong><span className="working-line"/><span>Full capture scan: window {view.windowIndex} of {view.windowCount}. No target verdict is shown until every window finishes.</span><span>You can review and export your standard observation while this runs.</span><button type="button" className="button secondary" onClick={() => session.current?.cancel()}>Cancel sound hints</button></div>
        : <div className="sound-hints-actions">{view.phase !== 'ready' ? <button type="button" className="button secondary" disabled={Boolean(blocked)} onClick={() => { void session.current?.run(result, input); }}>Explore sound families (experimental)<Icon name="arrow" size={17}/></button> : null}{view.phase === 'ready' ? <button type="button" className="text-button" onClick={() => session.current?.cancel('idle')}>Clear hints &amp; unload model</button> : null}</div>}
      <div className={`recording-check-compact recording-check-${recordingCheck.status}`}>
        <p className="eyebrow">Recording usability</p>
        <strong className="recording-check-status">{recordingCheck.label}</strong>
        <p className="recording-check-compact-reason">{recordingReason}</p>
        <p className="recording-check-compact-boundary">Digital capture checks, separate from AI sound hints. Microphone fidelity and a data-center source remain unverified.</p>
        <button type="button" className="button secondary" aria-controls="recording-check" onClick={() => {
          const card = document.getElementById('recording-check');
          card?.scrollIntoView({ block: 'start' });
          card?.focus({ preventScroll: true });
        }}>Review recording check<Icon name="arrow" size={17}/></button>
      </div>
    </div>
    {view.phase === 'canceled' ? <p className="sound-hints-message" role="status">Sound exploration canceled. Your standard result and report are unchanged.</p> : null}
    {view.phase === 'error' ? <div className="error-box" role="alert"><strong>Sound hints unavailable</strong><p>{view.error}</p></div> : null}
    {view.phase === 'ready' && !blocked && view.target ? <div className="sound-hints-results" aria-live="polite">
      <div className="sound-hints-verdict"><p className="eyebrow">Equipment-noise target check</p><strong>{view.target.label}</strong><p>{view.target.summary}</p>
        {view.target.unclearWindows ? <p>{view.target.unclearWindows} of {view.windowCount} windows remained unclear. An accepted family in another window does not explain these intervals.</p> : null}
        {view.target.mixedFamilies ? <p>Different windows suggested different sound families. Review the timeline and compare another capture.</p> : null}
      </div>
      <ol aria-label="Five-second sound-family timeline">{view.windows.map(window => <li key={window.startSeconds}><div><strong>{window.startSeconds}–{window.endSeconds} seconds</strong></div><p>{window.family ? SOUND_FAMILY_DISPLAY_V3[window.family] : 'No sound family suggested'}</p></li>)}</ol>
      <p className="sound-hints-message">Every recorded second was included in these broad five-second windows. Music, animals, alarms, microphone handling and other competing sounds may go unrecognized, as can short or overlapping events. Review the capture and retake if these obscure the equipment sound. No result confirms an accurate recording or a data-center source.</p>
    </div> : null}
    <p className="screening-note">Hints do not change the indicators and are excluded from exported reports. They cannot identify a facility, device, location or physical source.</p>
    <details className="method-details"><summary>Model, preprocessing &amp; limitations</summary><p><a href={`${SOUND_HINT_MODEL_V3.modelUrl}/tree/${SOUND_HINT_MODEL_V3.revision}`} target="_blank" rel="noreferrer">{SOUND_HINT_MODEL_V3.id}</a>. A verified audio-only model runs in one local WASM worker; the unchanged fixed head can accept a broad family or abstain for each window. These hints are experimental, not probabilities or measured source identity.</p><p>Separate five-second copies scan the complete supported capture sequentially at its actual sample rate until the verified worker resamples each copy to 48 kHz. The pinned processor adds five seconds of zeros per window, which adds no recorded time. The full observation remains intact for the standard analysis and report.</p><p>Speech-like hints suggest retaking for an equipment-noise target; wind or traffic hints suggest interference. This rule interprets broad sound families, not voice activity or foreground isolation. The original model comparison tested individual five-second examples; scanning more windows does not establish continuous speech-detection accuracy.</p><p>The buzz family includes insect recordings and does not validate electrical hum or equipment identification. Public-recording labels and software startup checks do not establish accuracy on this microphone or environment. Quiet, mixed, unfamiliar and weak sounds may remain unclassified.</p><p><a href="#/sources">Read the model comparison and its limits</a>. <a href="/ai/canonical-v3/TRAINING_ATTRIBUTION.json" target="_blank" rel="noreferrer">Training-data credits</a> and <a href="/ai/canonical-v3/MODEL_NOTICE.txt" target="_blank" rel="noreferrer">model notices</a>. Upstream model information: <a href={SOUND_HINT_MODEL_V3.upstreamLicenseUrl} target="_blank" rel="noreferrer">CLAP documentation</a>.</p></details>
  </section>;
}

export default SoundHintsPanelV3;
