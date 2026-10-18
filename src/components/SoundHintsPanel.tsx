import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '../types';
import { SOUND_HINT_MODEL } from '../ai/model';
import { SOUND_HINT_DISPLAY_LABELS, SOUND_HINT_LABELS } from '../ai/labels';
import { soundHintsBlockedReason } from '../ai/policy';
import { copySoundHintObservation } from '../ai/input';
import { resampleForSoundHints } from '../ai/resample';
import type { SoundHintResult, SoundHintsRequest, SoundHintsResponse } from '../ai/types';
import { Icon } from './Icon';

export interface SoundHintsInput { pcm: Float32Array; fs: number }
type Phase = 'idle' | 'preparing' | 'loading' | 'inference' | 'ready' | 'canceled' | 'error';
type DownloadProgress = { file: string; loaded?: number; total?: number; percent?: number };

export function SoundHintsPanel({ result, input, observationDurationSeconds = result.durationSeconds }: { result: AnalysisResult; input: SoundHintsInput | null; observationDurationSeconds?: number }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [comparison, setComparison] = useState<SoundHintResult | null>(null);
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const busy = phase === 'preparing' || phase === 'loading' || phase === 'inference';
  const blocked = soundHintsBlockedReason(result.qualityCodes) ?? (!input ? 'The audio for this session is no longer available. Analyze a new input to explore sound types.' : null);

  useEffect(() => () => { ++requestId.current; worker.current?.terminate(); worker.current = null; }, [result.id]);

  const stop = (nextPhase: 'canceled' | 'idle' = 'canceled') => {
    ++requestId.current;
    worker.current?.terminate(); worker.current = null;
    setPhase(nextPhase); setComparison(null); setDownload(null); setError('');
  };

  const run = async () => {
    if (!input || blocked || busy) return;
    const sessionId = ++requestId.current;
    setPhase('preparing'); setComparison(null); setDownload(null); setError('');
    try {
      const observation = copySoundHintObservation(input.pcm, input.fs);
      const pcm = await resampleForSoundHints(observation, input.fs);
      if (sessionId !== requestId.current) return;
      if (!worker.current) {
        const nextWorker = new Worker(new URL('../ai/soundHints.worker.ts', import.meta.url), { type: 'module' });
        worker.current = nextWorker;
        nextWorker.onmessage = (event: MessageEvent<SoundHintsResponse>) => {
          const message = event.data;
          if (message.sessionId !== requestId.current) return;
          if (message.type === 'progress') {
            setPhase(message.phase);
            if (message.phase === 'loading' && message.file) setDownload({ file: message.file, loaded: message.loaded, total: message.total, percent: message.progress });
          } else if (message.type === 'result') {
            setComparison(message.result); setPhase('ready'); setDownload(null);
          } else {
            setError(message.message); setPhase('error'); setDownload(null);
            nextWorker.terminate(); if (worker.current === nextWorker) worker.current = null;
          }
        };
        nextWorker.onerror = () => {
          if (worker.current !== nextWorker) return;
          setError('The optional local model could not start. Retry in a current browser with enough free memory. Your screening results and report remain available.');
          setPhase('error'); setDownload(null); nextWorker.terminate(); worker.current = null;
        };
      }
      setPhase('loading');
      const message: SoundHintsRequest = { type: 'classify', sessionId, pcm, sampleRateHz: 48000, originalSampleRateHz: input.fs, originalSampleCount: observation.length, qualityCodes: result.qualityCodes };
      worker.current.postMessage(message, [pcm.buffer]);
    } catch (cause) {
      if (sessionId !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : 'Sound hints could not start. Your standard report is still available.');
      setPhase('error'); worker.current?.terminate(); worker.current = null;
    }
  };

  return <section className="panel sound-hints-panel" aria-labelledby="sound-hints-title">
    <div className="section-heading"><div><p className="eyebrow">Optional / AI exploration</p><h2 id="sound-hints-title">What might this sound resemble?</h2></div><span className="experimental-tag">Experimental</span></div>
    <p className="sound-hints-intro">Compare this clip with descriptions of light-fixture buzz, equipment hum, household fans, traffic, wind, speech, and quiet background sound.</p>
    <p className="sound-hints-message">AI window: the first {SOUND_HINT_MODEL.observationSeconds} seconds of this {observationDurationSeconds.toFixed(2)}-second observation. The standard indicators and report use the full {result.durationSeconds.toFixed(2)} seconds.{observationDurationSeconds > SOUND_HINT_MODEL.observationSeconds ? ' Sounds after the first five seconds are not included in these hints.' : ''}</p>
    <div className="sound-hints-consent"><Icon name="shield" size={21}/><div><strong>Runs locally. Downloads a model on your first use.</strong><p>About {SOUND_HINT_MODEL.approximateDownloadMb} MB of model files, plus the AI runtime. The browser may cache these files. Audio stays on this device; loading can take a few minutes and needs available memory. No download starts until you choose Explore.</p></div></div>
    {blocked ? <p className="sound-hints-blocked">{blocked}</p> : null}
    {busy ? <div className="sound-hints-progress" role="status"><strong>{phase === 'preparing' ? 'Preparing a separate audio copy…' : phase === 'inference' ? 'Comparing sound descriptions on this device…' : 'Loading the optional sound model…'}</strong>{phase === 'loading' && download ? <><p>{download.file.split('/').pop()}{download.loaded !== undefined ? ` · ${(download.loaded / 1_000_000).toFixed(1)} MB${download.total ? ` / ${(download.total / 1_000_000).toFixed(1)} MB` : ''}` : ''}</p>{download.percent !== undefined ? <progress value={download.percent} max={100} aria-label="Current model file download"/> : <span className="working-line"/>}</> : <span className="working-line"/>}<span>You can review and export your standard observation while this runs.</span><button className="button secondary" onClick={() => stop()}>Cancel sound hints</button></div> : <div className="sound-hints-actions"><button className="button secondary" disabled={Boolean(blocked)} onClick={run}>{phase === 'ready' ? 'Compare again' : phase === 'error' || phase === 'canceled' ? 'Retry sound exploration' : 'Explore possible sound types (experimental)'}<Icon name="arrow" size={17}/></button>{phase === 'ready' ? <button className="text-button" onClick={() => stop('idle')}>Clear hints & unload model</button> : null}</div>}
    {phase === 'canceled' ? <p className="sound-hints-message" role="status">Sound exploration canceled. Your screening result is unchanged.</p> : null}
    {phase === 'error' ? <div className="error-box" role="alert"><strong>Sound hints unavailable</strong><p>{error}</p></div> : null}
    {comparison ? <div className="sound-hints-results" aria-live="polite"><div className="sound-hints-verdict"><strong>No confirmed sound type</strong><p>{comparison.reason === 'weak-separation' ? 'The model did not clearly separate the alternatives. These are only its closest text matches.' : 'These are exploratory sound resemblances. This app has not validated equipment or source identification.'}</p></div><ol>{comparison.rankings.map(item => <li key={item.label}><div><strong>{SOUND_HINT_DISPLAY_LABELS[item.label]}</strong><span>{item.score.toFixed(3)} <small>relative score</small></span></div><div className="sound-score-track" aria-hidden="true"><span style={{ width: `${item.score * 100}%` }}/></div></li>)}</ol><p className="sound-score-caption">Scores compare this fixed set of eight descriptions. They are not probabilities, acoustic measurements, or proof of a physical source. Changing descriptions can change the ranking. {result.inputKind === 'synthetic' ? 'This input is synthetic; its rankings do not validate real-world recognition.' : ''}</p><p className="sound-timing">Model load: {(comparison.timing.modelLoadMs / 1000).toFixed(1)} s · Comparison: {(comparison.timing.inferenceMs / 1000).toFixed(1)} s{comparison.timing.reusedModel ? ' · Model reused in memory' : ''}</p></div> : null}
    <p className="screening-note">AI cannot identify a facility or confirm where a sound originated. Suggestions do not change the indicators and are excluded from exported reports.</p>
    <details className="method-details"><summary>Model, preprocessing & limitations</summary><p><a href={`${SOUND_HINT_MODEL.modelUrl}/tree/${SOUND_HINT_MODEL.revision}`} target="_blank" rel="noreferrer">{SOUND_HINT_MODEL.id}</a> · quantized q8 · WASM on this device · Transformers.js {SOUND_HINT_MODEL.packageVersion}. Revision: <code>{SOUND_HINT_MODEL.revision}</code>.</p><p>A separate mono copy of only the first five seconds is resampled at its actual rate to 48 kHz. The model uses a 50 Hz–14 kHz feature range. Five seconds of observation is followed by five seconds of zero padding in the pinned processor; this does not add recorded time. A longer recording remains intact for the standard indicators and report. Core PCM analysis is unchanged.</p><p>No independent equipment-recording contrast set has validated this app’s source distinctions. Every comparison stays uncertain, including a strongly separated score. Do not use these rankings to assign blame or establish an indoor/outdoor location.</p><p>Upstream model license: <a href={SOUND_HINT_MODEL.licenseUrl} target="_blank" rel="noreferrer">Apache-2.0</a>. The conversion repository references the upstream model and does not separately declare a license.</p><p>Fixed comparison descriptions:</p><ul>{SOUND_HINT_LABELS.map(label => <li key={label}>{label}</li>)}</ul></details>
  </section>;
}
