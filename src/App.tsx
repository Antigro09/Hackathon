import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ALGORITHM_VERSION, METHOD_UPDATED } from './analysis/version';
import { startCapture } from './audio/capture';
import { CAPTURE_DURATIONS_SECONDS } from './audio/chunks';
import type { CaptureDurationSeconds } from './audio/chunks';
import { copySoundHintObservation } from './ai/input';
import { sources, methodLimitations } from './data/references';
import { buildReport, sourceStatus } from './report/buildReport';
import type { ReportModel } from './report/buildReport';
import { ReportView } from './report/ReportView';
import { Icon } from './components/Icon';
import { ObservationForm } from './components/ObservationForm';
import { ResultPanel } from './components/ResultPanel';
import { CaptureComparison } from './components/CaptureComparison';
import { InputMeter } from './components/InputMeter';
import { LearnPage, LearnPanel } from './components/Learn';
import type { InputMeterReading } from './audio/meter';
import { SoundHintsPanelV3 as SoundHintsPanel } from './components/SoundHintsPanelV3';
import type { SoundHintsInputV3 as SoundHintsInput } from './components/SoundHintsPanelV3';
import type { AnalysisResponse, AnalysisResult, InputMeta, ObservationContext } from './types';

const ObservationMap = lazy(() => import('./components/ObservationMap'));

type Route = '/' | '/measure' | '/report' | '/sources' | '/learn' | '/map';
type Phase = 'idle' | 'permission-pending' | 'warming-up' | 'recording' | 'analyzing' | 'ready';
const emptyContext: ObservationContext = { jurisdiction: 'unknown-other', environment: 'unknown', locationDescription: '', recurrenceNotes: '', conditionsNotes: '', suspectedSourceNotes: '' };
const readRoute = (): Route => {
  const hash = window.location.hash.slice(1);
  return hash === '/measure' || hash === '/report' || hash === '/sources' || hash === '/learn' || hash === '/map' ? hash : '/';
};

function Home() {
  return <main id="main-content" tabIndex={-1} className="home-page">
    <section className="hero">
      <div className="hero-copy"><div className="pill"><span className="live-dot"/> Noise is pollution too!</div><h1>Annoying data center noise?<br/><em>Map it.</em></h1><p className="hero-description">Low-pitched whining noises can cause long-term psychological effects, and data centers are a key culprit. TonalWatch measures it from your device.</p><div className="hero-actions"><a className="button primary" href="#/measure">Record a complaint <Icon name="arrow"/></a><a className="button secondary" href="#/learn">Learn more</a></div><p className="privacy-inline"><Icon name="shield" size={17}/> Audio stays in your browser. No account. No upload.</p></div>
      <div className="hero-illustration" aria-label="Illustration of noise from a data center spreading over a neighborhood"><img src="img/hero_noise_contour.svg" alt="Illustration: low-frequency noise bands from a data center cooling plant spreading over nearby houses. Synthetic example, not a real location." style={{width:'100%',height:'auto',borderRadius:12}}/></div>
          </section>
    <section className="workflow" aria-label="Three steps to a structured observation">{[{n:'01',icon:'mic',title:'Capture a short sample',text:'Record a live microphone sample for 5, 15, or 30 seconds.'},{n:'02',icon:'wave',title:'Inspect the noise',text:'Inspect the noise coming from data centers and other sources.'},{n:'03',icon:'file',title:'Report it',text:'Report the noise pollution on a public, community-made map.'}].map(item => <article key={item.n}><div className="workflow-icon"><Icon name={item.icon as 'mic' | 'wave' | 'file'}/><span>{item.n}</span></div><h2>{item.title}</h2><p>{item.text}</p></article>)}</section>
    <div className="home-boundary"><span className="small-cross">+</span><p>A useful starting point for a conversation. <strong>Uncalibrated screening cannot identify a source, establish legal compliance, or replace a qualified measurement.</strong></p><a href="#/sources">Read the method <Icon name="arrow" size={17}/></a></div>
  </main>;
}

function SourcesPage() {
  return <main id="main-content" className="sources-page page-shell"><div className="page-heading"><p className="eyebrow">Transparency, by design</p><h1>Sources & method</h1><p>Inspect the calculation, understand its limits, and check the original references.</p></div><div className="source-intro panel"><h2>Two independent screening indicators</h2><p>The captured-spectrum C−A difference compares A- and C-weighted digital powers from the same samples. A difference of at least 15 dB suggests low-frequency contribution under this prototype convention. It does not establish a tone.</p><p>The experimental sustained-peak heuristic checks 40–2,000 Hz for a narrow peak in at least 80% of all complete frames, with at least 20 frames. Among qualifying tracks, it selects the strongest median three-bin power, with persistence and prominence as tie-breakers. This does not identify a fundamental or source. Its thresholds and ranking are engineering choices, not a standardized tonality assessment or a county definition.</p><div className="method-specs"><span>Method {ALGORITHM_VERSION}</span><span>Updated {METHOD_UPDATED}</span><span>5 / 15 / 30 second captures</span><span>8,192-point FFT</span><span>Periodic Hann</span><span>50% overlap</span><span>44.1 / 48 kHz tested rates</span></div><p>Linear power is averaged before conversion to dB. A/C curves are normalized at 1 kHz; integration spans 20 Hz to min(20 kHz, Nyquist). Digital levels use RMS 1 as the reference. Constant gain cancels in C−A; frequency response and processing do not.</p><p><strong>Choose a capture duration:</strong> In Observation, choose a 5, 15, or 30-second live microphone capture. For the 60 Hz exercise, 15 seconds gives more analysis frames to inspect persistence. Five seconds can also show a peak near 60 Hz; a longer capture does not change the FFT bin spacing or establish a source. Optional AI sound hints use only the first 5 seconds of any observation.</p></div><section className="panel"><h2>Recording usability and data-center comparison</h2><p>The Recording check reviews the actual captured window, clipping and signal flags, analysis availability, and three browser-reported processing settings. Its advice helps decide whether to retake a sample. It is a digital usability check, not an AI estimate of microphone accuracy or faithful acoustic capture.</p><p>The optional AI separately suggests a broad sound family. Data-center sound comparison is not validated: a fan-like or buzz-like match cannot distinguish a data center from other sources. A nearby mapped facility is context, not proof of the source.</p><p>A source review found licensed indoor server-room examples, but no suitable licensed outdoor reference dataset for validating community data-center matches. Credible validation needs verified field recordings, competing sounds, independent recording sites and an option to abstain.</p><p><a href="https://github.com/Antigro09/Hackathon/blob/main/docs/DATACENTER_AUDIO_READINESS.md" target="_blank" rel="noreferrer">Read the reference-audio review and validation requirements</a>.</p></section><section className="panel"><h2>Optional local sound hints</h2><p>A trained classifier on frozen CLAP audio features can suggest five broad sound families or leave a sound unclassified. It runs only after you choose Explore, using the first five recorded seconds. It does not change the standard indicators or exported report.</p><p>In an October 18, 2026 comparison of 416 reserved public recordings, both models used the same quality checks: 218 known-family and 191 unfamiliar recordings were eligible, and 7 recordings were blocked for both. Known-family macro F1 increased from 0.394 for the previous eight-description model to 0.778 for this classifier.</p><p>The classifier suggested a family on 103 of 218 eligible known recordings, with 98 correct. It also suggested families on 7 of 191 unfamiliar recordings; the previous model’s mapped first description did so on 182 of 191. These are results on this test set, not confidence probabilities or accuracy guarantees for your microphone.</p><p>The model trades coverage for fewer incorrect hints. When applied to this comparison, the original stricter criteria still fail on the unknown-sound uncertainty bound and wind-family precision. The earlier development audit also failed. Public labels, shared recording conditions and possible encoder-pretraining overlap limit interpretation. The buzz examples include insects and do not establish electrical or equipment identification.</p><p><a href="https://github.com/Antigro09/Hackathon/blob/main/docs/AI_V3_RESULTS.md" target="_blank" rel="noreferrer">Read the full comparison, original audit failures and source links</a> · <a href="/ai/sound-hints-v3-comparison.json" target="_blank" rel="noreferrer">Download comparison summary</a> · <a href="/ai/canonical-v3/TRAINING_ATTRIBUTION.json" target="_blank" rel="noreferrer">Training-data credits</a>.</p></section><section className="panel"><h2>What the result can’t establish</h2><ul className="limitation-list">{methodLimitations.map((text, i) => <li key={i}>{text}</li>)}</ul><p>Audio stays on your device. Private observation and report notes stay in memory until reset or page close. The community map publishes only the fields you review and submit, including an approximate location. Posts are public; audio and AI hints are excluded. City/ZIP lookups contact the named map-data providers. The community map automatically loads street tiles from OpenStreetMap, which receives your IP address and viewed area. The map shows nearby sites and self-reported observations; source attribution requires separate investigation.</p></section><div className="section-heading"><div><p className="eyebrow">Curated references</p><h2>Read the original sources</h2></div></div><p className="muted">A county selection supplies context. Only the responsible agency can confirm which requirements apply. A short browser sample implements neither county’s formal procedure.</p><div className="source-grid">{sources.map(source => <article className="panel source-card" key={source.id}><p className="eyebrow">{source.jurisdiction === 'loudoun' ? 'Loudoun County' : source.jurisdiction === 'prince-william' ? 'Prince William County' : 'Acoustics & implementation'}</p><h3><a href={source.url} target="_blank" rel="noreferrer">{source.title} <Icon name="external" size={15}/></a></h3><p>{source.summary}</p><small>{source.scopeNote}</small><span className="source-date">{sourceStatus(source)}</span></article>)}</div><a className="button primary" href="#/measure">Return to observation <Icon name="arrow"/></a></main>;
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [meterReading, setMeterReading] = useState<InputMeterReading | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [previousResult, setPreviousResult] = useState<AnalysisResult | null>(null);
  const lastCompletedResult = useRef<AnalysisResult | null>(null);
  const [context, setContext] = useState<ObservationContext>({ ...emptyContext });
  const [report, setReport] = useState<ReportModel | null>(null);
  const [error, setError] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<CaptureDurationSeconds>(5);
  const [tonePlaying, setTonePlaying] = useState(false);
  const tonePlayingRef = useRef(false);
  const updateTonePlayback = useCallback((playing: boolean) => {
    tonePlayingRef.current = playing;
    setTonePlaying(playing);
  }, []);
  const activeId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const worker = useRef<Worker | null>(null);
  const retainedAudio = useRef<SoundHintsInput | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const busy = !['idle', 'ready'].includes(phase);

  useEffect(() => {
    const changed = () => {
      const next = readRoute();
      if (next !== '/measure' && !['idle', 'ready'].includes(phaseRef.current)) {
        ++activeId.current;
        controller.current?.abort(); worker.current?.terminate(); worker.current = null;
        retainedAudio.current = null;
        setPhase('idle'); setResult(null); setReport(null); setError(''); setMeterReading(null);
      }
      setRoute(next);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', changed);
    return () => { window.removeEventListener('hashchange', changed); ++activeId.current; controller.current?.abort(); worker.current?.terminate(); retainedAudio.current = null; };
  }, []);

  const invalidate = () => {
    ++activeId.current; controller.current?.abort(); controller.current = null;
    worker.current?.terminate(); worker.current = null;
    retainedAudio.current = null;
    setResult(null); setReport(null); setPhase('idle'); setProgress(0); setError(''); setMeterReading(null);
  };
  const analyze = (pcm: Float32Array, fs: number, meta: InputMeta, sessionId: number) => {
    if (sessionId !== activeId.current) return;
    try { retainedAudio.current = { pcm: copySoundHintObservation(pcm, fs), fs }; }
    catch { retainedAudio.current = null; }
    setPhase('analyzing');
    try {
      const nextWorker = new Worker(new URL('./analysis/analysis.worker.ts', import.meta.url), { type: 'module' });
      worker.current = nextWorker;
      nextWorker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
        if (event.data.sessionId !== activeId.current) return;
        if ('error' in event.data) { setError(event.data.error); setPhase('idle'); }
        else {
          setPreviousResult(lastCompletedResult.current);
          lastCompletedResult.current = event.data.result;
          setResult(event.data.result); setPhase('ready');
        }
        nextWorker.terminate(); if (worker.current === nextWorker) worker.current = null;
      };
      nextWorker.onerror = () => { if (sessionId === activeId.current) { setError('Analysis could not finish. Record another microphone observation.'); setPhase('idle'); } nextWorker.terminate(); };
      nextWorker.postMessage({ sessionId, pcm, fs, meta }, [pcm.buffer]);
    } catch { setError('Your browser could not start the analysis worker. Retry in a current browser.'); setPhase('idle'); }
  };
  const startInput = async () => {
    if (tonePlayingRef.current) {
      setError('Stop the Learn tone before recording an observation.');
      return;
    }
    invalidate(); const sessionId = activeId.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      setPhase('permission-pending');
      const input = await startCapture({ durationSeconds, signal: abort.signal, onProgress: (nextPhase, fraction) => { if (sessionId === activeId.current) { setPhase(nextPhase); setProgress(fraction); } }, onMeter: reading => { if (sessionId === activeId.current) setMeterReading(reading); } });
      if (sessionId === activeId.current) setMeterReading(null);
      analyze(input.pcm, input.fs, input.meta, sessionId);
    } catch (cause) {
      if (sessionId !== activeId.current || abort.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Microphone capture could not finish. Check microphone permission and try again.'); setPhase('idle'); setMeterReading(null);
    }
  };
  const review = () => {
    if (!result || busy) return;
    setReport(buildReport(result, context, new Date().toISOString()));
    window.location.hash = '/report';
  };
  const downloadText = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report.text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `tonalwatch-observation-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.setAttribute('tabindex', '-1'); main?.focus(); main?.scrollIntoView(); }}>Skip to content</a>
    <header className="site-header"><a className="brand" href="#/" aria-label="TonalWatch home"><span className="brand-icon"><Icon name="wave" size={24}/></span>Tonal<span>Watch</span></a><nav aria-label="Main navigation"><a className="home-nav-link" href="#/" aria-current={route === '/' ? 'page' : undefined}><Icon name="home" size={16}/>Home</a><a href="#/measure" aria-current={route === '/measure' ? 'page' : undefined}>Observation</a><a href="#/learn" aria-current={route === '/learn' ? 'page' : undefined}>Learn</a><a href="#/map" aria-current={route === '/map' ? 'page' : undefined}>Community map</a><a href="#/sources" aria-current={route === '/sources' ? 'page' : undefined}>Sources & method</a></nav><span className="header-privacy"><span className="live-dot"/> Audio stays local</span></header>
    {result ? <div className="origin-strip"><strong>MICROPHONE · UNCALIBRATED</strong><span>A short screening sample, not a certified measurement.</span></div> : null}
    {route === '/' ? <Home/> : null}
    {route === '/measure' ? <main id="main-content" className="page-shell measure-page"><div className="page-heading"><div><p className="eyebrow">Your noise observation</p><h1>Record data center noise with a short sample, plus details only you can add.</h1></div><button className="text-button" onClick={() => { invalidate(); setContext({ ...emptyContext }); setMapReadings([]); setPreviousResult(null); lastCompletedResult.current = null; }}>Clear session <span aria-hidden="true">↺</span></button></div>
      <div className="analysis-layout"><aside className="input-column"><section className="panel input-panel"><div className="section-heading"><h2>Live microphone</h2><span className="tiny-label">{durationSeconds} SEC</span></div>
        <fieldset className="duration-picker" disabled={busy} aria-describedby="duration-help"><legend>Observation duration</legend><div className="duration-options">{CAPTURE_DURATIONS_SECONDS.map(seconds => <button type="button" key={seconds} className={durationSeconds === seconds ? 'selected' : ''} aria-label={`${seconds}-second observation`} aria-pressed={durationSeconds === seconds} onClick={() => { if (seconds !== durationSeconds) { invalidate(); setDurationSeconds(seconds); } }}><strong>{seconds} s</strong><span>{seconds === 5 ? 'Quick sample' : seconds === 15 ? 'More context' : 'Longer view'}</span></button>)}</div><p id="duration-help">For the 60 Hz exercise, try <strong>15 seconds</strong>. Five seconds can also show a nearby peak. More time adds analysis frames, without changing FFT bin spacing.</p><p className="duration-ai-note">Spectrum and report use all {durationSeconds} seconds. Optional AI sound hints use the first 5 seconds.</p></fieldset>
        <div className="input-symbol"><Icon name="mic" size={32}/></div><h3><div className="howto" style={{margin:'14px 0 18px',padding:'14px 18px',border:'1px solid #e3e8d8',borderRadius:10,background:'#f7f9ef'}}><p style={{margin:'0 0 8px',fontWeight:700}}>How to measure well</p><ol style={{margin:0,paddingLeft:'20px'}}><li>Find a quiet spot — away from voices, traffic, and air blowing at the mic.</li><li>Step back from the machine. Closer is not better: the tone reads clearer from a little distance.</li><li>Hold still for the whole capture.</li><li>Take three captures. The middle value is your reading.</li></ol></div>Record what you hear</h3><p className="muted">Hold your device still. Avoid speaking, touching the microphone, or blocking it.</p><div className="capture-note"><strong>0.5 s warm-up + {durationSeconds} s capture</strong><p>We request disabled audio processing, but your device may still filter or reshape the sound.</p></div><InputMeter reading={meterReading} active={phase === 'warming-up' || phase === 'recording'}/><button className="button primary input-action" onClick={startInput} disabled={busy || tonePlaying}><Icon name="mic" size={18}/> Start {durationSeconds}-second capture</button>{tonePlaying ? <p className="learn-disabled" role="status">Stop the listening tone before microphone capture.</p> : null}<small className="input-footnote">Microphone requires permission and HTTPS or localhost. Access ends after capture, cancel, or navigation.</small>
        {busy ? <div className="capture-progress" role="status"><strong>{phase === 'permission-pending' ? 'Waiting for microphone permission…' : phase === 'warming-up' ? 'Warming up the microphone…' : phase === 'recording' ? `Recording ${(Math.max(0, progress) * durationSeconds).toFixed(1)} / ${durationSeconds.toFixed(1)} s` : 'Analyzing the captured PCM…'}</strong>{phase === 'recording' ? <progress value={progress} max={1} aria-label="Recorded sample progress"/> : <span className="working-line"/>}<button className="button secondary" onClick={invalidate}>Cancel</button></div> : null}
        {error ? <div className="error-box" role="alert"><strong>Input needs attention</strong><p>{error}</p><span>Check microphone permission and try another capture.</span></div> : null}
      </section><div className="local-note"><Icon name="shield" size={22}/><div><strong>Your audio stays here.</strong><p>Processed in this browser. No recording is uploaded or attached to your report.</p></div></div></aside><div className="result-stack"><ResultPanel result={result} analyzing={phase === 'analyzing'} targetDurationSeconds={durationSeconds}/><CaptureComparison current={result} previous={previousResult}/><LearnPanel result={result} disabled={busy} onPlaybackChange={updateTonePlayback}/></div></div>
      {result ? <SoundHintsPanel key={result.id} result={result} input={retainedAudio.current}/> : null}<ObservationForm context={context} onChange={value => { setContext(value); setReport(null); }}/><div className="review-bar"><div><p className="eyebrow">03 / Bring it together</p><strong>A clear observation starts a better conversation.</strong><p>Review your notes, results, and references before sharing.</p></div><div className="review-actions"><button type="button" className="button secondary" disabled={!result || busy} onClick={() => { if (result && !busy) window.location.hash = '/map'; }}>Log on community map <Icon name="arrow" size={17}/></button><button className="button primary" onClick={review} disabled={!result || busy}>Review observation <Icon name="arrow"/></button></div></div><div className="sr-only" aria-live="polite">{phase === 'ready' ? 'Analysis complete. Results and report review are available.' : ''}</div>
    </main> : null}
    {route === '/learn' ? <LearnPage result={result} disabled={busy} onPlaybackChange={updateTonePlayback}/> : null}
    {route === '/map' ? <Suspense fallback={<main id="main-content" className="page-shell"><p role="status">Loading community map…</p></main>}><ObservationMap currentResult={result}/></Suspense> : null}
    {route === '/sources' ? <SourcesPage/> : null}
    {route === '/report' ? <main id="main-content" className="page-shell report-page">{report && result ? <><div className="page-heading report-toolbar"><div><p className="eyebrow">03 / Review & export</p><h1>Your observation packet</h1><p>Download a concise text summary, or print / save PDF to include the graph. Review your notes before sharing.</p></div><div className="report-actions"><button className="button secondary" onClick={downloadText}><Icon name="download" size={18}/> Download text summary</button><button className="button primary" onClick={() => window.print()}><Icon name="print" size={18}/> Print / save PDF</button></div></div><a className="back-link" href="#/measure">← Edit observation</a><ReportView report={report}/></> : <div className="panel empty-report"><Icon name="file" size={42}/><h1>Create an observation first</h1><p>Record a live microphone sample to create your analysis and report.</p><a className="button primary" href="#/measure">Start an observation <Icon name="arrow"/></a></div>}</main> : null}
    <footer className="site-footer"><a className="brand footer-brand" href="#/"><Icon name="wave" size={20}/> TonalWatch</a><p>Careful observations. Clearer conversations.</p><span>Uncalibrated screening · <a href="#/sources">Method & limitations</a></span></footer>
  </>;
}
