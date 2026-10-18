import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ResultPanel, ResultVerdict } from './components/ResultPanel';
import { WhyPage } from './components/WhyPage';
import { CaptureComparison } from './components/CaptureComparison';
import { InputMeter } from './components/InputMeter';
import { LearnPage, LearnPanel } from './components/Learn';
import type { InputMeterReading } from './audio/meter';
import { SoundHintsPanelV3 as SoundHintsPanel } from './components/SoundHintsPanelV3';
import type { SoundHintsInputV3 as SoundHintsInput } from './components/SoundHintsPanelV3';
import type { AnalysisResponse, AnalysisResult, InputMeta, ObservationContext } from './types';
import { LOUDOUN_DATA_CENTERS, LOUDOUN_DATA_CENTER_SOURCE } from './data/loudounDataCenters';

const ObservationMap = lazy(() => import('./components/ObservationMap'));
const MapPreview = lazy(() => import('./components/MapPreview'));
const NAV_ITEMS = [
  { route: '/', label: 'Home', icon: 'home' },
  { route: '/measure', label: 'Check', icon: 'mic' },
  { route: '/map', label: 'Map', icon: 'map' },
  { route: '/why', label: 'Why it matters', icon: 'heart' },
] as const;

type Route = '/' | '/measure' | '/report' | '/sources' | '/learn' | '/map' | '/why';
type Phase = 'idle' | 'permission-pending' | 'warming-up' | 'recording' | 'analyzing' | 'ready';
const emptyContext: ObservationContext = { jurisdiction: 'unknown-other', environment: 'unknown', locationDescription: '', recurrenceNotes: '', conditionsNotes: '', suspectedSourceNotes: '' };
const readRoute = (): Route => {
  const hash = window.location.hash.slice(1);
  return hash === '/measure' || hash === '/report' || hash === '/sources' || hash === '/learn' || hash === '/map' || hash === '/why' ? hash : '/';
};

function DataCenterDots() {
  const plot = useMemo(() => {
    const lats = LOUDOUN_DATA_CENTERS.map(d => d[0]), lngs = LOUDOUN_DATA_CENTERS.map(d => d[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const spanX = Math.max(1e-6, (maxLng - minLng) * k), spanY = Math.max(1e-6, maxLat - minLat);
    const W = 360, pad = 14, H = Math.round(Math.max(150, Math.min(240, (W - 2 * pad) * spanY / spanX + 2 * pad)));
    const dots = LOUDOUN_DATA_CENTERS.map(([lat, lng]) => [pad + (lng - minLng) * k / spanX * (W - 2 * pad), pad + (maxLat - lat) / spanY * (H - 2 * pad)] as const);
    return { W, H, dots };
  }, []);
  return <svg className="dc-dots" viewBox={`0 0 ${plot.W} ${plot.H}`} role="img" aria-label={`${LOUDOUN_DATA_CENTERS.length} data center building locations in Loudoun County`}>
    {plot.dots.map(([x, y], i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.6"/>)}
  </svg>;
}

function Home() {
  return <main id="main-content" tabIndex={-1} className="home-page">
    <section className="hero">
      <div className="hero-copy">
        <h1>The law can’t hear it. <span>Now you can show it.</span></h1>
        <p className="hero-description">Data center hum is deep sound that official noise readings miss. Check it with your phone in 5 seconds and share it on the community map.</p>
        <div className="hero-actions"><a className="button primary" href="#/measure"><Icon name="mic" size={20}/> Check a hum</a><a className="button secondary" href="#/map">Find nearby data centers</a></div>
      </div>
      <section className="group map-preview" aria-label="Data center map preview">
        <a className="map-preview-link" href="#/map"><span className="map-preview-frame"><Suspense fallback={<DataCenterDots/>}><MapPreview/></Suspense><span className="map-preview-legend"><i/>Data center building</span></span><span className="map-preview-caption"><strong>{LOUDOUN_DATA_CENTERS.length}</strong><span>data center buildings in Loudoun County. Tap to open the map.</span><Icon name="chevron" size={20}/></span></a>
        <p className="footnote map-preview-source"><a href={LOUDOUN_DATA_CENTER_SOURCE.url} target="_blank" rel="noreferrer">Loudoun County GIS</a>, retrieved {LOUDOUN_DATA_CENTER_SOURCE.retrieved}</p>
      </section>
    </section>
    <div className="home-lower"><div><a className="group row-link-card" href="#/why"><span className="why-icon"><Icon name="heart" size={22}/></span><span className="row-link-text"><strong>Why it matters</strong><span>What steady deep noise can do to sleep and health</span></span><Icon name="chevron" size={20}/></a></div>
    <div><h2 className="list-title">How it works</h2>
    <ol className="list how-list">
      <li><a className="how-row" href="#/measure"><span className="how-num">1</span><span className="how-text"><strong>Start an observation</strong><span>Record a live microphone sample for 5, 15, or 30 seconds.</span></span><Icon name="chevron" size={20}/></a></li>
      <li><a className="how-row" href="#/learn"><span className="how-num">2</span><span className="how-text"><strong>Understand the signal</strong><span>See if a deep hum is there.</span></span><Icon name="chevron" size={20}/></a></li>
      <li><div className="how-row"><span className="how-num">3</span><span className="how-text"><strong>Print a report</strong><span>With your county’s own sources.</span></span></div></li>
    </ol></div></div>
    <p className="footnote home-boundary-note">A screening tool, not a certified measurement. Audio stays in your browser; you choose which map details to publish. <a href="#/sources">Method</a></p>
  </main>;
}

function SourcesPage() {
  return <main id="main-content" className="sources-page page-shell">
    <div className="page-heading"><div><h1>Method</h1><p>How the result is calculated, what it can’t establish, and the original references.</p></div></div>
    <section className="group"><div className="group-head"><h2>Two screening indicators</h2></div><div className="group-body prose">
      <p>The captured-spectrum C−A difference compares A- and C-weighted digital powers from the same samples. A difference of at least 15 dB suggests low-frequency contribution under this prototype convention. It does not establish a tone.</p>
      <p>The experimental sustained-peak heuristic checks 40–2,000 Hz for a narrow peak in at least 80% of all complete frames, with at least 20 frames. Among qualifying tracks, it selects the strongest median three-bin power, with persistence and prominence as tie-breakers. This does not identify a fundamental or source. Its thresholds and ranking are engineering choices, not a standardized tonality assessment or a county definition.</p>
      <p>Linear power is averaged before conversion to dB. A/C curves are normalized at 1 kHz; integration spans 20 Hz to min(20 kHz, Nyquist). Digital levels use RMS 1 as the reference. Constant gain cancels in C−A; frequency response and processing do not.</p>
      <p><strong>Choose a capture duration:</strong> On Check, open Mic options and choose a 5, 15, or 30-second live microphone capture. For the 60 Hz exercise, 15 seconds gives more analysis frames to inspect persistence. Five seconds can also show a peak near 60 Hz; a longer capture does not change the FFT bin spacing or establish a source. Optional AI sound hints use only the first 5 seconds of any observation.</p>
    </div>
    <dl className="spec-list"><div><dt>Method</dt><dd>{ALGORITHM_VERSION}</dd></div><div><dt>Updated</dt><dd>{METHOD_UPDATED}</dd></div><div><dt>Captures</dt><dd>5 / 15 / 30 s</dd></div><div><dt>FFT</dt><dd>8,192 points, periodic Hann, 50% overlap</dd></div><div><dt>Tested rates</dt><dd>44.1 / 48 kHz</dd></div></dl></section>
    <section className="group"><div className="group-head"><h2>Optional local sound hints</h2></div><div className="group-body prose"><p>A trained classifier on frozen CLAP audio features can suggest five broad sound families or leave a sound unclassified. It runs only after you choose Explore, using the first five recorded seconds. It does not change the standard indicators or exported report.</p><p>In an October 18, 2026 comparison of 416 reserved public recordings, both models used the same quality checks: 218 known-family and 191 unfamiliar recordings were eligible, and 7 recordings were blocked for both. Known-family macro F1 increased from 0.394 for the previous eight-description model to 0.778 for this classifier.</p><p>The classifier suggested a family on 103 of 218 eligible known recordings, with 98 correct. It also suggested families on 7 of 191 unfamiliar recordings; the previous model’s mapped first description did so on 182 of 191. These are results on this test set, not confidence probabilities or accuracy guarantees for your microphone.</p><p>The model trades coverage for fewer incorrect hints. When applied to this comparison, the original stricter criteria still fail on the unknown-sound uncertainty bound and wind-family precision. The earlier development audit also failed. Public labels, shared recording conditions and possible encoder-pretraining overlap limit interpretation. The buzz examples include insects and do not establish electrical or equipment identification.</p><p><a href="https://github.com/Antigro09/Hackathon/blob/main/docs/AI_V3_RESULTS.md" target="_blank" rel="noreferrer">Read the full comparison, original audit failures and source links</a> · <a href="/ai/sound-hints-v3-comparison.json" target="_blank" rel="noreferrer">Download comparison summary</a> · <a href="/ai/canonical-v3/TRAINING_ATTRIBUTION.json" target="_blank" rel="noreferrer">Training-data credits</a>.</p></div></section>
    <section className="group"><div className="group-head"><h2>What the result can’t establish</h2></div><div className="group-body prose"><ul className="limitation-list">{methodLimitations.map((text, i) => <li key={i}>{text}</li>)}</ul><p>Audio and notes stay in memory until reset or page close. No accounts, tracking, GPS, or automatic sharing. Reports contain the context you type; review them before sharing.</p></div></section>
    <h2 className="list-title">Original sources</h2>
    <p className="footnote list-note">A county selection supplies context. Only the responsible agency can confirm which requirements apply. A short browser sample implements neither county’s formal procedure.</p>
    <ul className="list source-list">{sources.map(source => <li className="source-row" key={source.id}><span className="source-jurisdiction">{source.jurisdiction === 'loudoun' ? 'Loudoun County' : source.jurisdiction === 'prince-william' ? 'Prince William County' : 'Acoustics & implementation'}</span><a href={source.url} target="_blank" rel="noreferrer">{source.title} <Icon name="external" size={15}/></a><p>{source.summary}</p><small>{source.scopeNote}</small><small className="source-date">{sourceStatus(source)}</small></li>)}</ul>
    <a className="button secondary page-end-action" href="#/measure">Back to Check</a>
  </main>;
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
  const clearAll = () => { invalidate(); setContext({ ...emptyContext }); setPreviousResult(null); lastCompletedResult.current = null; };
  const ready = Boolean(result) && !busy;
  const durationPicker = <fieldset className="duration-picker length-picker" disabled={busy} aria-describedby="duration-help"><legend>Length</legend><div className="duration-options">{CAPTURE_DURATIONS_SECONDS.map(seconds => <button type="button" key={seconds} className={durationSeconds === seconds ? 'selected' : ''} aria-label={`${seconds}-second observation`} aria-pressed={durationSeconds === seconds} onClick={() => { if (seconds !== durationSeconds) { invalidate(); setDurationSeconds(seconds); } }}>{seconds} s</button>)}</div><p id="duration-help" className="footnote">For the 60 Hz exercise, try <strong>15 seconds</strong>. Five seconds can also show a nearby peak.</p><p className="footnote duration-ai-note">The report uses all {durationSeconds} seconds. Optional sound hints use the first 5.</p></fieldset>;

  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.setAttribute('tabindex', '-1'); main?.focus(); main?.scrollIntoView(); }}>Skip to content</a>
    <header className="site-header app-bar"><a className="brand" href="#/" aria-label="TonalWatch home"><span className="brand-icon"><Icon name="wave" size={18}/></span>TonalWatch</a><nav className="top-nav" aria-label="Main navigation">{NAV_ITEMS.map(item => <a key={item.route} href={`#${item.route}`} aria-current={route === item.route ? 'page' : undefined}>{item.label}</a>)}<a href="#/sources" aria-current={route === '/sources' ? 'page' : undefined}>Method</a></nav><a className="app-bar-action" href="#/sources" aria-label="Method and sources" aria-current={route === '/sources' ? 'page' : undefined}><Icon name="info" size={22}/></a></header>
    <nav className="tab-bar" aria-label="App navigation">{NAV_ITEMS.map(item => <a key={item.route} href={`#${item.route}`} aria-current={route === item.route ? 'page' : undefined}><Icon name={item.icon} size={24}/><span>{item.label}</span></a>)}</nav>
    {result ? <div className="origin-strip" role="note"><strong>Microphone</strong><span>Recorded on this phone; not calibrated.</span></div> : null}
    {route === '/' ? <Home/> : null}
    {route === '/measure' ? <main id="main-content" className="page-shell measure-page">
      <div className="page-heading"><h1>Check</h1>{result || error ? <button className="text-button" onClick={clearAll}>Clear</button> : null}</div>
      {result ? <>
        <ResultVerdict className="m-verdict" result={result} analyzing={false} action={result.lowFrequencyScreen === 'suggested' ? <a className="verdict-link" href="#/why"><Icon name="heart" size={18}/><span>What this can do to sleep and health</span><Icon name="chevron" size={18}/></a> : null}/>
        <section className="group next-steps" aria-label="Next steps">
          <label className="field county-field">County for your report<select value={context.jurisdiction} onChange={e => { setContext({ ...context, jurisdiction: e.target.value as ObservationContext['jurisdiction'] }); setReport(null); }}><option value="unknown-other">Unknown / other jurisdiction</option><option value="loudoun">Loudoun County, VA</option><option value="prince-william">Prince William County, VA</option></select></label>
          <button className="button primary" onClick={review} disabled={!ready}>Create report</button>
          <a className="button secondary" href="#/map"><Icon name="pin" size={20}/> Log on community map</a>
        </section>
        <p className="footnote screening-line">Screening only: not a certified measurement or a legal finding.</p>
      </> : null}
      <section className={`group check-panel${result ? ' check-panel--again' : ''}`} aria-label="Live microphone">
        {result ? <h2 className="check-again-title">Check again</h2> : null}
        <button className={`check-button${busy ? ' is-listening' : ''}`} onClick={startInput} disabled={busy || tonePlaying} aria-describedby="check-hint"><span className="check-circle" aria-hidden="true"><Icon name="mic" size={result ? 28 : 40}/></span><span className="check-label">Check</span><span className="check-sub">Start {durationSeconds}-second capture</span></button>
        <p id="check-hint" className="check-hint">Hold your phone toward the sound and stay quiet.</p>
        {phase === 'warming-up' || phase === 'recording' ? <InputMeter reading={meterReading} active/> : null}
        {tonePlaying ? <p className="learn-disabled" role="status">Stop the listening tone before checking.</p> : null}
        {busy ? <div className="capture-progress" role="status"><strong>{phase === 'permission-pending' ? 'Waiting for microphone permission…' : phase === 'warming-up' ? 'Getting ready…' : phase === 'recording' ? `Listening ${(Math.max(0, progress) * durationSeconds).toFixed(1)} / ${durationSeconds.toFixed(1)} s` : 'Checking…'}</strong>{phase === 'recording' ? <progress value={progress} max={1} aria-label="Recorded sample progress"/> : <span className="working-line"/>}<button className="button secondary" onClick={invalidate}>Cancel</button></div> : null}
        {error ? <div className="error-box" role="alert"><strong>That didn’t work</strong><p>{error}</p><span>Check microphone permission and try another capture.</span></div> : null}
        <details className="inline-options"><summary>Mic options</summary><div className="inline-options-body">{durationPicker}<p className="footnote input-footnote">A 0.5 s warm-up comes first. Needs microphone permission (HTTPS or localhost). Your phone may still filter the sound. Access ends after the check.</p></div></details>
      </section>
      <p className="local-note"><Icon name="shield" size={18}/><span>Audio stays on your phone. Nothing is uploaded.</span></p>
      {result ? <details className="group notes-disclosure"><summary><span>What did you notice?</span><small>Optional notes</small></summary><ObservationForm showJurisdiction={false} context={context} onChange={value => { setContext(value); setReport(null); }}/></details> : null}
      <details className="group details-disclosure"><summary><span>{result ? 'Details' : 'How it works'}</span></summary>
        <div className="details-body">
          {result ? <>
            <ResultPanel result={result} analyzing={phase === 'analyzing'} targetDurationSeconds={durationSeconds}/>
            <CaptureComparison current={result} previous={previousResult}/>
            <details className="disclosure"><summary><span>Sound type hints</span><small>Experimental</small></summary><SoundHintsPanel key={result.id} result={result} input={retainedAudio.current}/></details>
          </> : <ol className="how-lines">
            <li>TonalWatch takes two readings of the same sound: the official one, and one with the deep sounds left in.</li>
            <li>The difference is <strong>the gap</strong>. 15 dB or more points to a deep hum.</li>
            <li>Official noise readings mostly leave deep sounds out, so a hum can barely register.</li>
          </ol>}
          <details className="disclosure"><summary><span>Listening tones</span><small>Hear deep vs. high</small></summary><LearnPanel result={result} disabled={busy} onPlaybackChange={updateTonePlayback}/></details>
          <p className="details-links"><a href="#/learn">Learn the signal</a><a href="#/sources">Method & sources</a></p>
        </div>
      </details>
      <div className="sr-only" aria-live="polite">{phase === 'ready' ? 'Check complete. The answer and report options are available.' : ''}</div>
    </main> : null}
    {route === '/why' ? <WhyPage/> : null}
    {route === '/learn' ? <LearnPage result={result} disabled={busy} onPlaybackChange={updateTonePlayback}/> : null}
    {route === '/map' ? <Suspense fallback={<main id="main-content" className="page-shell"><p role="status">Loading community map…</p></main>}><ObservationMap currentResult={result}/></Suspense> : null}
    {route === '/sources' ? <SourcesPage/> : null}
    {route === '/report' ? <main id="main-content" className="page-shell report-page">{report && result ? <><a className="back-link" href="#/measure">‹ Check</a><div className="page-heading report-toolbar"><div><h1>Report</h1><p>Download a concise text summary, or print / save PDF to include the graph. Review your notes before sharing.</p></div><div className="report-actions"><button className="button primary" onClick={() => window.print()}><Icon name="print" size={18}/> Print / save PDF</button><button className="button secondary" onClick={downloadText}><Icon name="download" size={18}/> Download text summary</button></div></div><ReportView report={report}/></> : <div className="empty-state"><span className="empty-icon"><Icon name="file" size={32}/></span><h1>No report yet</h1><p>Record a live microphone sample to create your analysis and report.</p><a className="button primary" href="#/measure">Go to Check</a></div>}</main> : null}
    <footer className="site-footer"><a className="brand footer-brand" href="#/"><Icon name="wave" size={18}/> TonalWatch</a><a href="#/sources">Method & sources</a></footer>
  </>;
}
