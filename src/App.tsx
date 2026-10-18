import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIXTURES, generateFixture, syntheticMeta } from './analysis/fixtures';
import type { FixtureId } from './analysis/fixtures';
import { ALGORITHM_VERSION, METHOD_UPDATED } from './analysis/version';
import { startCapture } from './audio/capture';
import { CAPTURE_DURATIONS_SECONDS } from './audio/chunks';
import type { CaptureDurationSeconds } from './audio/chunks';
import { decodeAudioFile } from './audio/decode';
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
import { SoundHintsPanel } from './components/SoundHintsPanel';
import type { SoundHintsInput } from './components/SoundHintsPanel';
import type { AnalysisResponse, AnalysisResult, InputMeta, ObservationContext } from './types';
import type { SessionMapReading } from './data/readings';
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
type Phase = 'idle' | 'permission-pending' | 'warming-up' | 'recording' | 'decoding' | 'analyzing' | 'ready';
type InputMode = 'demo' | 'microphone' | 'file';
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
        <p className="hero-description">Data center hum is deep sound that official noise readings miss. Check it with your phone in 5 seconds.</p>
        <div className="hero-actions"><a className="button primary" href="#/measure"><Icon name="mic" size={20}/> Check a hum</a><a className="button secondary" href="#/map">See the map</a></div>
      </div>
      <section className="group map-preview" aria-label="Data center map preview">
        <a className="map-preview-link" href="#/map"><span className="map-preview-frame"><Suspense fallback={<DataCenterDots/>}><MapPreview/></Suspense><span className="map-preview-legend"><i/>Data center building</span></span><span className="map-preview-caption"><strong>{LOUDOUN_DATA_CENTERS.length}</strong><span>data center buildings in Loudoun County. Tap to open the map.</span><Icon name="chevron" size={20}/></span></a>
        <p className="footnote map-preview-source"><a href={LOUDOUN_DATA_CENTER_SOURCE.url} target="_blank" rel="noreferrer">Loudoun County GIS</a>, retrieved {LOUDOUN_DATA_CENTER_SOURCE.retrieved}</p>
      </section>
    </section>
    <div className="home-lower"><div><a className="group row-link-card" href="#/why"><span className="why-icon"><Icon name="heart" size={22}/></span><span className="row-link-text"><strong>Why it matters</strong><span>What steady deep noise can do to sleep and health</span></span><Icon name="chevron" size={20}/></a></div>
    <div><h2 className="list-title">How it works</h2>
    <ol className="list how-list">
      <li><span className="how-num">1</span>Hold your phone toward the hum</li>
      <li><span className="how-num">2</span>See if a deep hum is there</li>
      <li><span className="how-num">3</span>Print a report for your county</li>
    </ol></div></div>
    <p className="footnote home-boundary-note">A screening tool, not a certified measurement. Audio never leaves your phone. <a href="#/sources">Method</a></p>
  </main>;
}

function SourcesPage() {
  return <main id="main-content" className="sources-page page-shell">
    <div className="page-heading"><div><h1>Method</h1><p>How the result is calculated, what it can’t establish, and the original references.</p></div></div>
    <section className="group"><div className="group-head"><h2>Two screening indicators</h2></div><div className="group-body prose">
      <p>The captured-spectrum C−A difference compares A- and C-weighted digital powers from the same samples. A difference of at least 15 dB suggests low-frequency contribution under this prototype convention. It does not establish a tone.</p>
      <p>The experimental sustained-peak heuristic checks 40–2,000 Hz for a narrow peak in at least 80% of all complete frames, with at least 20 frames. Its prominence and persistence thresholds are engineering choices, not a standardized tonality assessment or a county definition.</p>
      <p>Linear power is averaged before conversion to dB. A/C curves are normalized at 1 kHz; integration spans 20 Hz to min(20 kHz, Nyquist). Digital levels use RMS 1 as the reference. Constant gain cancels in C−A; frequency response and processing do not.</p>
    </div>
    <dl className="spec-list"><div><dt>Method</dt><dd>{ALGORITHM_VERSION}</dd></div><div><dt>Updated</dt><dd>{METHOD_UPDATED}</dd></div><div><dt>Captures</dt><dd>5 / 15 / 30 s</dd></div><div><dt>FFT</dt><dd>8,192 points, periodic Hann, 50% overlap</dd></div><div><dt>Tested rates</dt><dd>44.1 / 48 kHz</dd></div></dl></section>
    <section className="group"><div className="group-head"><h2>What the result can’t establish</h2></div><div className="group-body prose"><ul className="limitation-list">{methodLimitations.map((text, i) => <li key={i}>{text}</li>)}</ul><p>Audio and notes stay in memory until reset or page close. No accounts, tracking, GPS, or automatic sharing. Reports contain the context you type; review them before sharing.</p></div></section>
    <h2 className="list-title">Original sources</h2>
    <p className="footnote list-note">A county selection supplies context. Only the responsible agency can confirm which requirements apply. A short browser sample implements neither county’s formal procedure.</p>
    <ul className="list source-list">{sources.map(source => <li className="source-row" key={source.id}><span className="source-jurisdiction">{source.jurisdiction === 'loudoun' ? 'Loudoun County' : source.jurisdiction === 'prince-william' ? 'Prince William County' : 'Acoustics & implementation'}</span><a href={source.url} target="_blank" rel="noreferrer">{source.title} <Icon name="external" size={15}/></a><p>{source.summary}</p><small>{source.scopeNote}</small><small className="source-date">{sourceStatus(source)}</small></li>)}</ul>
    <a className="button secondary page-end-action" href="#/measure">Back to Check</a>
  </main>;
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [mode, setMode] = useState<InputMode>('microphone');
  const [fixture, setFixture] = useState<FixtureId>('hum-harmonics');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [meterReading, setMeterReading] = useState<InputMeterReading | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [previousResult, setPreviousResult] = useState<AnalysisResult | null>(null);
  const lastCompletedResult = useRef<AnalysisResult | null>(null);
  const [context, setContext] = useState<ObservationContext>({ ...emptyContext });
  const [report, setReport] = useState<ReportModel | null>(null);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<CaptureDurationSeconds>(5);
  const [mapReadings, setMapReadings] = useState<SessionMapReading[]>([]);
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
      nextWorker.onerror = () => { if (sessionId === activeId.current) { setError('Analysis could not finish. Retry this input or choose another.'); setPhase('idle'); } nextWorker.terminate(); };
      nextWorker.postMessage({ sessionId, pcm, fs, meta }, [pcm.buffer]);
    } catch { setError('Your browser could not start the analysis worker. Retry in a current browser.'); setPhase('idle'); }
  };
  const runDemo = (id: FixtureId = fixture) => {
    invalidate(); const sessionId = activeId.current;
    setFixture(id); setMode('demo');
    analyze(generateFixture(id, 48000), 48000, syntheticMeta(id), sessionId);
  };
  const startInput = async () => {
    if (mode === 'microphone' && tonePlayingRef.current) {
      setError('Stop the Learn tone before recording an observation.');
      return;
    }
    invalidate(); const sessionId = activeId.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      if (mode === 'microphone') {
        setPhase('permission-pending');
        const input = await startCapture({ durationSeconds, signal: abort.signal, onProgress: (nextPhase, fraction) => { if (sessionId === activeId.current) { setPhase(nextPhase); setProgress(fraction); } }, onMeter: reading => { if (sessionId === activeId.current) setMeterReading(reading); } });
        if (sessionId === activeId.current) setMeterReading(null);
        analyze(input.pcm, input.fs, input.meta, sessionId);
      } else if (selectedFile) {
        setPhase('decoding');
        const input = await decodeAudioFile(selectedFile, abort.signal, durationSeconds);
        analyze(input.pcm, input.fs, input.meta, sessionId);
      }
    } catch (cause) {
      if (sessionId !== activeId.current || abort.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'This input could not be read. Try a demo or another recording.'); setPhase('idle'); setMeterReading(null);
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
    const a = document.createElement('a'); a.href = url; a.download = `tonalwatch-${result?.inputKind === 'synthetic' ? 'synthetic-demo' : 'observation'}-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const switchMode = (next: InputMode) => { invalidate(); setMode(next); };
  const originLabel = result?.inputKind === 'synthetic' ? 'Synthetic demo' : result?.inputKind === 'imported-file' ? 'Imported file' : result ? 'Microphone' : '';
  const clearAll = () => { invalidate(); setSelectedFile(null); setContext({ ...emptyContext }); setMapReadings([]); setPreviousResult(null); lastCompletedResult.current = null; };
  const ready = Boolean(result) && !busy;
  const durationSelect = <label className="field duration-picker">Length<select value={durationSeconds} disabled={busy} onChange={event => { invalidate(); setDurationSeconds(Number(event.target.value) as CaptureDurationSeconds); }}>{CAPTURE_DURATIONS_SECONDS.map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>;

  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.setAttribute('tabindex', '-1'); main?.focus(); main?.scrollIntoView(); }}>Skip to content</a>
    <header className="site-header app-bar"><a className="brand" href="#/" aria-label="TonalWatch home"><span className="brand-icon"><Icon name="wave" size={18}/></span>TonalWatch</a><nav className="top-nav" aria-label="Main navigation">{NAV_ITEMS.map(item => <a key={item.route} href={`#${item.route}`} aria-current={route === item.route ? 'page' : undefined}>{item.label}</a>)}<a href="#/sources" aria-current={route === '/sources' ? 'page' : undefined}>Method</a></nav><a className="app-bar-action" href="#/sources" aria-label="Method and sources" aria-current={route === '/sources' ? 'page' : undefined}><Icon name="info" size={22}/></a></header>
    <nav className="tab-bar" aria-label="App navigation">{NAV_ITEMS.map(item => <a key={item.route} href={`#${item.route}`} aria-current={route === item.route ? 'page' : undefined}><Icon name={item.icon} size={24}/><span>{item.label}</span></a>)}</nav>
    {result ? <div className={`origin-strip ${result.inputKind === 'synthetic' ? 'synthetic-strip' : ''}`} role="note"><strong>{originLabel}</strong><span>{result.inputKind === 'synthetic' ? 'Made on this device, not a real recording.' : result.inputKind === 'imported-file' ? 'Recording time and processing unknown.' : 'Recorded on this phone; not calibrated.'}</span></div> : null}
    {route === '/' ? <Home/> : null}
    {route === '/measure' ? <main id="main-content" className="page-shell measure-page">
      <div className="page-heading"><h1>Check</h1>{result || error ? <button className="text-button" onClick={clearAll}>Clear</button> : null}</div>
      {result ? <>
        <ResultVerdict className="m-verdict" result={result} analyzing={false} action={result.lowFrequencyScreen === 'suggested' ? <a className="verdict-link" href="#/why"><Icon name="heart" size={18}/><span>What this can do to sleep and health</span><Icon name="chevron" size={18}/></a> : null}/>
        <section className="group next-steps" aria-label="Next steps">
          <label className="field county-field">County for your report<select value={context.jurisdiction} onChange={e => { setContext({ ...context, jurisdiction: e.target.value as ObservationContext['jurisdiction'] }); setReport(null); }}><option value="unknown-other">Unknown / other jurisdiction</option><option value="loudoun">Loudoun County, VA</option><option value="prince-william">Prince William County, VA</option></select></label>
          <button className="button primary" onClick={review} disabled={!ready}>Create report</button>
          <a className="button secondary" href="#/map"><Icon name="pin" size={20}/> Add to map</a>
        </section>
        <p className="footnote screening-line">Screening only: not a certified measurement or a legal finding.</p>
      </> : null}
      <section className={`group check-panel${result ? ' check-panel--again' : ''}`} aria-label="Check a sound">
        {result ? <h2 className="check-again-title">Check again</h2> : null}
        {mode === 'microphone' ? <>
          <button className={`check-button${busy ? ' is-listening' : ''}`} onClick={startInput} disabled={busy || tonePlaying} aria-describedby="check-hint"><span className="check-circle" aria-hidden="true"><Icon name="mic" size={result ? 28 : 40}/></span><span className="check-label">Check</span></button>
          <p id="check-hint" className="check-hint">Hold your phone toward the sound for {durationSeconds} seconds.</p>
          {phase === 'warming-up' || phase === 'recording' ? <InputMeter reading={meterReading} active/> : null}
          {tonePlaying ? <p className="learn-disabled" role="status">Stop the listening tone before checking.</p> : null}
          <details className="inline-options"><summary>Mic options</summary><div className="inline-options-body">{durationSelect}<p className="footnote input-footnote">Needs microphone permission (HTTPS or localhost). Your phone may still filter the sound. Access ends after the check.</p></div></details>
        </> : null}
        {mode === 'demo' ? <div className="input-body">
          <label className="field">Demo signal<select value={fixture} disabled={busy} onChange={e => { invalidate(); setFixture(e.target.value as FixtureId); }}>{FIXTURES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          {result ? null : <p className="footnote fixture-description">Synthetic sound made on this device, not a real recording.</p>}
          <button className={`button ${ready ? 'secondary' : 'primary'} input-action`} disabled={busy} onClick={() => runDemo()}>Analyze demo</button>
        </div> : null}
        {mode === 'file' ? <div className="input-body">
          <label className="field file-picker">Audio file, up to 10 MB<input type="file" accept="audio/*,.wav" disabled={busy} onChange={e => { const file = e.target.files?.[0] ?? null; invalidate(); setSelectedFile(file); e.target.value = ''; }}/></label>
          {selectedFile ? <p className="selected-filename">{selectedFile.name}</p> : null}
          {durationSelect}
          <p className="footnote input-footnote">Uses the first {durationSeconds} seconds; WAV works best. Recording time and processing are unknown.</p>
          <button className={`button ${ready ? 'secondary' : 'primary'} input-action`} onClick={startInput} disabled={busy || !selectedFile}>Analyze file</button>
        </div> : null}
        {busy ? <div className="capture-progress" role="status"><strong>{phase === 'permission-pending' ? 'Waiting for microphone permission…' : phase === 'warming-up' ? 'Getting ready…' : phase === 'recording' ? `Listening ${(Math.max(0, progress) * durationSeconds).toFixed(1)} / ${durationSeconds.toFixed(1)} s` : phase === 'decoding' ? 'Opening the file…' : 'Checking…'}</strong>{phase === 'recording' ? <progress value={progress} max={1} aria-label="Recorded sample progress"/> : <span className="working-line"/>}<button className="button secondary" onClick={invalidate}>Cancel</button></div> : null}
        {error ? <div className="error-box" role="alert"><strong>That didn’t work</strong><p>{error}</p></div> : null}
        <div className="mode-switch" role="group" aria-label="Other ways to check">
          {mode !== 'microphone' ? <button className="text-button" disabled={busy} onClick={() => switchMode('microphone')}>Use microphone</button> : null}
          {mode !== 'demo' ? <button className="text-button" disabled={busy} onClick={() => switchMode('demo')}>Try a demo</button> : null}
          {mode !== 'file' ? <button className="text-button" disabled={busy} onClick={() => switchMode('file')}>Use a file</button> : null}
        </div>
      </section>
      <p className="local-note"><Icon name="shield" size={18}/><span>Audio stays on your phone. Nothing is uploaded.</span></p>
      {result ? <details className="group notes-disclosure"><summary><span>What did you notice?</span><small>Optional notes</small></summary><ObservationForm showJurisdiction={false} context={context} onChange={value => { setContext(value); setReport(null); }}/></details> : null}
      <details className="group details-disclosure"><summary><span>{result ? 'Details' : 'How it works'}</span></summary>
        <div className="details-body">
          {result ? <>
            <ResultPanel result={result} analyzing={phase === 'analyzing'} targetDurationSeconds={mode === 'demo' ? 5 : durationSeconds}/>
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
    {route === '/map' ? <Suspense fallback={<main id="main-content" className="page-shell"><p role="status">Loading map…</p></main>}><ObservationMap currentResult={result} sessionReadings={mapReadings} onAddReading={reading => setMapReadings(previous => [...previous, reading])} onClearSessionReadings={() => setMapReadings([])}/></Suspense> : null}
    {route === '/sources' ? <SourcesPage/> : null}
    {route === '/report' ? <main id="main-content" className="page-shell report-page">{report && result ? <><a className="back-link" href="#/measure">‹ Check</a><div className="page-heading report-toolbar"><div><h1>Report</h1><p>Review before sharing. Your notes may contain personal information.</p></div><div className="report-actions"><button className="button primary" onClick={() => window.print()}><Icon name="print" size={18}/> Print / save PDF</button><button className="button secondary" onClick={downloadText}><Icon name="download" size={18}/> Download text</button></div></div><ReportView report={report}/></> : <div className="empty-state"><span className="empty-icon"><Icon name="file" size={32}/></span><h1>No report yet</h1><p>Check a sound or a demo first. Your report is built from that result.</p><a className="button primary" href="#/measure">Go to Check</a></div>}</main> : null}
    <footer className="site-footer"><a className="brand footer-brand" href="#/"><Icon name="wave" size={18}/> TonalWatch</a><a href="#/sources">Method & sources</a></footer>
  </>;
}
