import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildReportSpectrum } from '../report/spectrum';
import type { AnalysisResult } from '../types';

export type LearnPlaybackProps = {
  disabled?: boolean;
  onPlaybackChange?: (playing: boolean) => void;
};
export type LearnProps = LearnPlaybackProps & { result?: AnalysisResult | null };

export const LEARN_TONE_FREQUENCIES = [63, 125, 500, 1000, 8000] as const;
export const LEARN_MAX_GAIN = 0.15;
const STARTING_GAIN = 0.025;
type ToneFrequency = typeof LEARN_TONE_FREQUENCIES[number];
type PlaybackState = {
  phase: 'idle' | 'starting' | 'playing' | 'error';
  frequencyHz: ToneFrequency | null;
  error?: string;
};
type PlaybackResources = {
  context: AudioContext;
  oscillator: OscillatorNode | null;
  gain: GainNode | null;
  started: boolean;
  released: boolean;
};

// Coordinate explicit playback across both Learn placements. Importing this
// module creates no AudioContext and makes no network request.
let currentPlayer: TonePlaybackController | null = null;
const boundedGain = (value: number) => Math.max(0, Math.min(LEARN_MAX_GAIN, Number.isFinite(value) ? value : STARTING_GAIN));

function release(resources: PlaybackResources) {
  if (resources.released) return;
  resources.released = true;
  try {
    resources.gain?.gain.cancelScheduledValues(resources.context.currentTime);
    resources.gain?.gain.setValueAtTime(0, resources.context.currentTime);
  } catch { /* Continue releasing a context that already closed. */ }
  if (resources.started) {
    try { resources.oscillator?.stop(); } catch { /* An ended oscillator is already stopped. */ }
  }
  try { resources.oscillator?.disconnect(); } catch { /* Continue cleanup. */ }
  try { resources.gain?.disconnect(); } catch { /* Continue cleanup. */ }
  if (resources.context.state !== 'closed') {
    try { void resources.context.close().catch(() => {}); } catch { /* Closing is best effort after disconnect. */ }
  }
}

/** Explicit-play controller, exported so pending resume/cancel can be tested. */
export class TonePlaybackController {
  private generation = 0;
  private resources: PlaybackResources | null = null;
  private level = STARTING_GAIN;

  constructor(private readonly createContext: () => AudioContext, private readonly onState: (state: PlaybackState) => void) {}

  async play(frequencyHz: ToneFrequency, level = STARTING_GAIN) {
    if (!LEARN_TONE_FREQUENCIES.includes(frequencyHz)) return;
    currentPlayer?.stop();
    currentPlayer = this;
    this.level = boundedGain(level);
    const generation = ++this.generation;
    this.onState({ phase: 'starting', frequencyHz });
    try {
      const context = this.createContext();
      const resources: PlaybackResources = { context, oscillator: null, gain: null, started: false, released: false };
      this.resources = resources;
      resources.gain = context.createGain();
      resources.gain.gain.value = 0;
      resources.oscillator = context.createOscillator();
      resources.oscillator.type = 'sine';
      resources.oscillator.frequency.value = frequencyHz;
      // resume() starts in the click handler; Stop can release all resources
      // even while the browser's autoplay-policy promise is still pending.
      await context.resume();
      if (generation !== this.generation || this.resources !== resources) {
        release(resources);
        return;
      }
      resources.oscillator.connect(resources.gain);
      resources.gain.connect(context.destination);
      resources.gain.gain.setValueAtTime(0, context.currentTime);
      resources.gain.gain.linearRampToValueAtTime(this.level, context.currentTime + 0.04);
      resources.oscillator.start();
      resources.started = true;
      this.onState({ phase: 'playing', frequencyHz });
    } catch {
      if (generation !== this.generation) return;
      if (this.resources) release(this.resources);
      this.resources = null;
      if (currentPlayer === this) currentPlayer = null;
      this.onState({ phase: 'error', frequencyHz: null, error: 'The browser could not play the tone. Check audio output and try again.' });
    }
  }

  setLevel(level: number) {
    this.level = boundedGain(level);
    const resources = this.resources;
    if (!resources?.gain || !resources.started || resources.released) return;
    try {
      resources.gain.gain.cancelScheduledValues(resources.context.currentTime);
      resources.gain.gain.setTargetAtTime(this.level, resources.context.currentTime, 0.015);
    } catch { this.stop(); }
  }

  stop() {
    ++this.generation;
    const resources = this.resources;
    this.resources = null;
    if (currentPlayer === this) currentPlayer = null;
    if (resources) release(resources);
    this.onState({ phase: 'idle', frequencyHz: null });
  }
}

function browserAudioContext(): AudioContext {
  if (!window.AudioContext) throw new Error('Web Audio is unavailable');
  return new window.AudioContext();
}

const frequencyLabel = (frequencyHz: number) => frequencyHz >= 1000 ? `${frequencyHz / 1000} kHz` : `${frequencyHz} Hz`;

function TonePlayer({ disabled = false, onPlaybackChange }: LearnPlaybackProps) {
  const descriptionId = useId();
  const volumeId = useId();
  const [state, setState] = useState<PlaybackState>({ phase: 'idle', frequencyHz: null });
  const [level, setLevel] = useState(STARTING_GAIN);
  const levelRef = useRef(level);
  const playerElement = useRef<HTMLElement | null>(null);
  const playerRef = useRef<TonePlaybackController | null>(null);
  const callbackRef = useRef(onPlaybackChange);
  callbackRef.current = onPlaybackChange;
  const active = state.phase === 'starting' || state.phase === 'playing';

  useEffect(() => {
    let mounted = true;
    let wasActive = false;
    const player = new TonePlaybackController(browserAudioContext, next => {
      const isActive = next.phase === 'starting' || next.phase === 'playing';
      if (mounted) setState(next);
      if (wasActive !== isActive) {
        wasActive = isActive;
        callbackRef.current?.(isActive);
      }
    });
    playerRef.current = player;
    const stop = () => player.stop();
    const visibilityChanged = () => { if (document.visibilityState === 'hidden') stop(); };
    const details = playerElement.current?.closest('details');
    const detailsChanged = () => { if (!details?.open) stop(); };
    document.addEventListener('visibilitychange', visibilityChanged);
    details?.addEventListener('toggle', detailsChanged);
    window.addEventListener('pagehide', stop);
    window.addEventListener('beforeprint', stop);
    return () => {
      mounted = false;
      player.stop();
      playerRef.current = null;
      document.removeEventListener('visibilitychange', visibilityChanged);
      details?.removeEventListener('toggle', detailsChanged);
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('beforeprint', stop);
    };
  }, []);

  useEffect(() => { if (disabled) playerRef.current?.stop(); }, [disabled]);

  const play = (frequencyHz: ToneFrequency) => {
    if (disabled || document.visibilityState === 'hidden') return;
    void playerRef.current?.play(frequencyHz, levelRef.current);
  };

  return <section ref={playerElement} className="learn-player" aria-label="Synthetic tone player">
    <div className="learn-player-heading"><div><p className="eyebrow">Synthetic listening demo</p><h3>Hear a frequency</h3></div><span className="learn-local-label">Generated on this device</span></div>
    <p id={descriptionId}>Turn your device volume down before pressing a tone. Start low and stop if uncomfortable. Speakers may reproduce low or high frequencies poorly.</p>
    <div className="learn-player-controls">
      <div className="learn-tone-buttons" role="group" aria-label="Choose a tone frequency" aria-describedby={descriptionId}>
        {LEARN_TONE_FREQUENCIES.map(frequencyHz => <button key={frequencyHz} type="button" className="learn-tone-button" disabled={disabled} aria-pressed={active && state.frequencyHz === frequencyHz} onClick={() => play(frequencyHz)}>{frequencyLabel(frequencyHz)}</button>)}
      </div>
      <div className="learn-playback-row"><p role="status" aria-live="polite">{state.phase === 'starting' ? `Preparing ${frequencyLabel(state.frequencyHz!)}…` : state.phase === 'playing' ? `Playing ${frequencyLabel(state.frequencyHz!)} sine tone` : 'Tone player stopped'}</p><button type="button" className="button secondary learn-stop" disabled={!active} onClick={() => playerRef.current?.stop()}>Stop tone</button></div>
      <label className="learn-volume" htmlFor={volumeId}><span>Tone volume <output htmlFor={volumeId}>{Math.round(level / LEARN_MAX_GAIN * 100)}%</output></span><input id={volumeId} type="range" min="0" max={LEARN_MAX_GAIN} step="0.005" value={level} disabled={disabled} onChange={event => {
        const next = boundedGain(Number(event.target.value));
        levelRef.current = next;
        setLevel(next);
        playerRef.current?.setLevel(next);
      }}/><small>A quiet starting level within the player’s output limit. Your device volume also changes loudness.</small></label>
    </div>
    {disabled && <p className="learn-disabled" role="status">Tone playback is unavailable while an observation is being captured or analyzed.</p>}
    {state.error && <p className="learn-error" role="alert">{state.error}</p>}
    <p className="learn-player-note">Listening demonstration only; not a microphone calibration. Stop playback before recording an observation. No recording, download, or external audio service is used.</p>
    <p className="learn-print-tones">Synthetic listening frequencies: 63 Hz, 125 Hz, 500 Hz, 1 kHz, and 8 kHz. Playback requires a click and is stopped for printing.</p>
  </section>;
}

function WeightingExplanation() {
  return <>
    <div className="learn-weighting-grid">
      <article className="learn-weighting-card"><p className="eyebrow">A-weighting</p><h3>Less contribution from low frequencies</h3><p>A-weighting reduces the contribution of low frequencies more than C-weighting.</p></article>
      <article className="learn-weighting-card"><p className="eyebrow">C-weighting</p><h3>More of the captured low frequencies</h3><p>TonalWatch applies these two frequency weightings to the same captured digital samples.</p></article>
    </div>
    <p className="learn-digital-note">These are uncalibrated weighted digital levels, not sound-pressure levels or a direct measure of discomfort. A speaker or microphone may reproduce low frequencies poorly.</p>
    <article className="learn-gap"><p className="eyebrow">The C−A difference</p><h3>One spectrum, two weightings</h3><p>C-weighted digital level minus A-weighted digital level describes the captured spectrum. A larger difference can suggest low-frequency contribution. It does not by itself establish a tone, identify its source, measure what someone feels, or determine legal compliance. The sustained-peak indicator is a separate experimental check.</p></article>
  </>;
}

const honestyLine = 'Uncalibrated screening only. No source identification or legal-compliance determination.';

function LowFrequencyExhibit({ result, compact = false }: { result: AnalysisResult | null; compact?: boolean }) {
  const titleId = useId();
  const captionId = useId();
  const exhibit = useMemo(() => {
    if (!result) return null;
    const origin = result.inputKind === 'synthetic' ? 'Synthetic demonstration — not a field observation'
      : result.inputKind === 'imported-file' ? 'Imported audio file — original recording context unverified'
        : 'Microphone observation — uncalibrated input';
    const spectrum = buildReportSpectrum(result, origin);
    const bins = spectrum.status === 'unavailable' ? [] : spectrum.hz.flatMap((hz, index) => hz >= 20 && hz <= 200
      ? [{ hz, db: spectrum.powerDb[index] }] : []);
    const peakHz = result.peakScreen === 'suggested' ? spectrum.peakHz : null;
    const left = 62, top = 30, width = 640, height = 150;
    const high = bins.length ? Math.ceil(Math.max(...bins.map(bin => bin.db)) / 10) * 10 + 5 : 0;
    const low = high - 70;
    const x = (hz: number) => left + (hz - 20) / 180 * width;
    const y = (db: number) => top + height * (1 - (Math.max(low, Math.min(high, db)) - low) / (high - low));
    return { origin, spectrum, bins, peakHz, left, top, width, height, high, low, x, y,
      path: bins.map((bin, index) => `${index ? 'L' : 'M'}${x(bin.hz).toFixed(2)},${y(bin.db).toFixed(2)}`).join(' ') };
  }, [result]);

  return <section className={`learn-exhibit${compact ? ' learn-exhibit--compact' : ''}`} aria-labelledby={titleId}>
    <p className="eyebrow">Frequency observation exercise</p><h3 id={titleId}>Look for a peak near 60 Hz</h3>
    <p>Stop the tone player. In Observation → Microphone, select a 15-second capture, hold the device still, and inspect the spectrum near 60 Hz and 120 Hz. A longer capture does not establish legal compliance.</p>
    <p className="learn-frequency-boundary">A peak near 60 Hz is a frequency observation. Several acoustic or recording-chain sources can produce it; this does not identify the power grid, equipment, a building, or transmission through a wall.</p>
    {result && exhibit ? <div className="learn-current-observation">
      <p className={`learn-exhibit-origin${result.inputKind === 'synthetic' ? ' learn-exhibit-origin--synthetic' : ''}`}><strong>{exhibit.origin}</strong>{result.inputLabel ? <span>{result.inputLabel}</span> : null}</p>
      <dl className="learn-exhibit-metadata"><div><dt>Actual analyzed duration</dt><dd>{result.durationSeconds.toFixed(2)} s · {result.sampleCount.toLocaleString('en-US')} samples</dd></div><div><dt>FFT bin spacing</dt><dd>{exhibit.spectrum.binSpacingHz === null ? 'Unavailable' : <>{result.sampleRateHz.toLocaleString('en-US')} Hz ÷ {result.fftSize.toLocaleString('en-US')} = <strong>{exhibit.spectrum.binSpacingHz.toFixed(3)} Hz/bin</strong></>}</dd></div><div><dt>Complete analysis frames</dt><dd>{result.frameCount.toLocaleString('en-US')}</dd></div><div><dt>Experimental sustained-peak check</dt><dd>{exhibit.peakHz !== null ? <>Candidate near <strong>{exhibit.peakHz.toFixed(1)} Hz</strong> · {Math.round(result.peakCandidate!.persistentFrameFraction * 100)}% of complete frames; not confidence</>
        : result.peakScreen === 'not-indicated' && exhibit.spectrum.status === 'available' ? 'No candidate met the heuristic in this recording'
          : 'No reliable candidate available; check recording quality and analysis status'}</dd></div></dl>
      {exhibit.spectrum.status !== 'available' ? <p className="learn-exhibit-quality">{exhibit.spectrum.explanation}</p> : null}
      {!compact && <figure className="learn-frequency-figure">
        {exhibit.bins.length >= 2 ? <svg className="learn-frequency-plot" viewBox="0 0 760 245" role="img" aria-labelledby={titleId} aria-describedby={captionId}>
          {[0, 1, 2, 3].map(index => <g key={index}><line className="learn-plot-grid" x1={exhibit.left} x2={exhibit.left + exhibit.width} y1={exhibit.top + index * exhibit.height / 3} y2={exhibit.top + index * exhibit.height / 3}/><text x={exhibit.left - 9} y={exhibit.top + index * exhibit.height / 3 + 4} textAnchor="end">{Math.round(exhibit.high - index * (exhibit.high - exhibit.low) / 3)}</text></g>)}
          {[20, 60, 120, 200].map(hz => <g key={hz}><line className="learn-plot-tick" x1={exhibit.x(hz)} x2={exhibit.x(hz)} y1={exhibit.top + exhibit.height} y2={exhibit.top + exhibit.height + 5}/><text x={exhibit.x(hz)} y={exhibit.top + exhibit.height + 22} textAnchor="middle">{hz}</text></g>)}
          {[60, 120].map(hz => <g key={hz}><line className="learn-reference-line" x1={exhibit.x(hz)} x2={exhibit.x(hz)} y1={exhibit.top} y2={exhibit.top + exhibit.height}/><text className="learn-reference-label" x={exhibit.x(hz)} y={exhibit.top - 10} textAnchor="middle">{hz} Hz reference</text></g>)}
          <path className="learn-observed-spectrum" d={exhibit.path}/>
          {exhibit.peakHz !== null && exhibit.peakHz >= 20 && exhibit.peakHz <= 200 ? <line className="learn-candidate-line" x1={exhibit.x(exhibit.peakHz)} x2={exhibit.x(exhibit.peakHz)} y1={exhibit.top + 7} y2={exhibit.top + exhibit.height}/> : null}
          <text x="382" y="235" textAnchor="middle">Frequency · Hz (linear scale)</text>
        </svg> : <p className="learn-no-spectrum">No usable spectrum is available in the 20–200 Hz display range.</p>}
        <figcaption id={captionId}>Actual averaged digital PSD · dB re 1²/Hz · uncalibrated input. The line joins recorded FFT bins; dashed 60/120 Hz lines are reference positions, not detections. {exhibit.peakHz !== null && exhibit.peakHz >= 20 && exhibit.peakHz <= 200 ? `The solid vertical marker is the existing candidate near ${exhibit.peakHz.toFixed(1)} Hz. ` : ''}This zoom adds no frequency resolution.</figcaption>
      </figure>}
      {compact ? <a className="learn-full-link" href="#/learn">View this observation’s frequency zoom →</a> : null}
    </div> : <p className="learn-exhibit-empty">No completed observation is available. Record a live microphone observation to view its actual spectrum here. The tone player does not create a measurement.</p>}
    <p className="learn-resolution-note">FFT bin spacing is sample rate divided by FFT size: 5.859 Hz at 48 kHz or 5.383 Hz at 44.1 kHz for 8,192 points. Windowing spreads peaks across neighboring bins. Absence of a visible peak does not rule out a sound or validate microphone sensitivity.</p>
  </section>;
}

export function LearnPanel({ result = null, ...playback }: LearnProps) {
  const headingId = useId();
  return <section className="panel learn-panel learn-panel--compact" aria-labelledby={headingId}>
    <div className="section-heading"><div><p className="eyebrow">A little more context</p><h2 id={headingId}>How this works</h2></div><a className="learn-full-link" href="#/learn">Open Learn →</a></div>
    <WeightingExplanation/>
    <details className="learn-listening-details"><summary>Try the five listening tones</summary><TonePlayer {...playback}/></details>
    <LowFrequencyExhibit result={result} compact/>
    <p className="learn-honesty">{honestyLine}</p>
  </section>;
}

export function LearnPage({ result = null, ...playback }: LearnProps) {
  return <main id="main-content" tabIndex={-1} className="page-shell learn-page">
    <div className="page-heading"><p className="eyebrow">Listen, then interpret carefully</p><h1>Learn the signal</h1><p>Explore frequency, digital weighting, and the difference between two independent screening indicators.</p><button type="button" className="button secondary learn-print-button" onClick={() => window.print()}>Print learning guide</button></div>
    <div className="panel learn-panel"><TonePlayer {...playback}/><WeightingExplanation/><p className="learn-honesty">{honestyLine}</p></div>
    <div className="panel learn-panel learn-exhibit-panel"><LowFrequencyExhibit result={result}/></div>
    <section className="panel learn-examples" aria-label="Synthetic examples of independent indicators"><p className="eyebrow">Synthetic examples</p><h2>A large gap and a sustained peak answer different questions</h2><p>These illustrative signal types show why the two indicators need separate interpretation. The tone player is a listening aid; microphone observations measure the sound around you.</p><div className="learn-example-grid"><article><span>Synthetic · 1 kHz tone</span><h3>A peak with almost no gap</h3><p>The A and C curves are normalized near 1 kHz, so this clear sustained tone has a C−A difference close to zero.</p></article><article><span>Synthetic · Low-frequency broadband</span><h3>A large gap without an isolated sustained peak</h3><p>This generated noise concentrates energy at low frequencies. It demonstrates low-frequency contribution without a persistent isolated peak under the prototype heuristic.</p></article></div><a className="button secondary" href="#/measure">Record an observation</a></section>
  </main>;
}
