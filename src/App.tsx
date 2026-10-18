import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FIXTURES, generateFixture, syntheticMeta } from './analysis/fixtures';
import type { FixtureId } from './analysis/fixtures';
import { ALGORITHM_VERSION, METHOD_UPDATED } from './analysis/version';
import { startCapture } from './audio/capture';
import { decodeAudioFile } from './audio/decode';
import { sources, methodLimitations } from './data/references';
import { buildReport, sourceStatus } from './report/buildReport';
import type { ReportModel } from './report/buildReport';
import { ReportView } from './report/ReportView';
import { Icon } from './components/Icon';
import { ObservationForm } from './components/ObservationForm';
import { ResultPanel } from './components/ResultPanel';
import { InputMeter } from './components/InputMeter';
import { LearnPage, LearnPanel } from './components/Learn';
import type { InputMeterReading } from './audio/meter';
import { SoundHintsPanel } from './components/SoundHintsPanel';
import type { SoundHintsInput } from './components/SoundHintsPanel';
import type { AnalysisResponse, AnalysisResult, InputMeta, ObservationContext } from './types';
import type { SessionMapReading } from './data/readings';

const ObservationMap = lazy(() => import('./components/ObservationMap'));

type Route = '/' | '/measure' | '/report' | '/sources' | '/learn' | '/map';
type Phase = 'idle' | 'permission-pending' | 'warming-up' | 'recording' | 'decoding' | 'analyzing' | 'ready';
type InputMode = 'demo' | 'microphone' | 'file';
const emptyContext: ObservationContext = { jurisdiction: 'unknown-other', environment: 'unknown', locationDescription: '', recurrenceNotes: '', conditionsNotes: '', suspectedSourceNotes: '' };
const readRoute = (): Route => {
  const hash = window.location.hash.slice(1);
  return hash === '/measure' || hash === '/report' || hash === '/sources' || hash === '/learn' || hash === '/map' ? hash : '/';
};

function Home({ onDemo }: { onDemo: () => void }) {
  return <main id="main-content" tabIndex={-1} className="home-page">
    <section className="hero">
      <div className="hero-copy"><div className="pill"><span className="live-dot"/> A clearer picture of community noise</div><h1>Make the hum<br/>an <em>observation.</em></h1><p className="hero-description">A recurring sound is hard to explain. Capture what you hear, explore its frequency content, and put your observations into a clear, source-linked report.</p><div className="hero-actions"><a className="button primary" href="#/measure">Start an observation <Icon name="arrow"/></a><button className="button secondary" onClick={onDemo}>Try a synthetic demo</button></div><p className="privacy-inline"><Icon name="shield" size={17}/> Audio stays in your browser. No account. No upload.</p></div>
      <div className="hero-illustration" aria-label="Illustration of a frequency spectrum, not a measurement"><div className="illustration-top"><span className="eyebrow">Listen with a little more context</span><Icon name="wave" size={28}/></div><svg viewBox="0 0 500 260" role="img" aria-label="Illustrative spectrum with narrow peaks"><defs><linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c6e69a" stopOpacity=".5"/><stop offset="100%" stopColor="#c6e69a" stopOpacity="0"/></linearGradient></defs>{[55, 105, 155, 205].map(y => <line key={y} x1="20" x2="480" y1={y} y2={y} stroke="#ffffff15"/>)}{[80, 160, 240, 320, 400].map(x => <line key={x} x1={x} x2={x} y1="25" y2="230" stroke="#ffffff0d"/>)}<path d="M20 216 38 212 50 218 65 210 80 215 90 209 103 210 115 196 125 66 136 196 147 211 158 211 169 207 184 209 195 162 205 209 223 213 240 205 253 209 265 191 276 214 295 210 308 214 326 206 342 215 360 210 382 216 405 211 430 217 450 214 480 219V235H20Z" fill="url(#hero-fill)"/><path d="M20 216 38 212 50 218 65 210 80 215 90 209 103 210 115 196 125 66 136 196 147 211 158 211 169 207 184 209 195 162 205 209 223 213 240 205 253 209 265 191 276 214 295 210 308 214 326 206 342 215 360 210 382 216 405 211 430 217 450 214 480 219" stroke="#cee7a4" strokeWidth="2" fill="none"/><line x1="125" x2="125" y1="38" y2="59" stroke="#d2e7b3"/><text x="125" y="27" textAnchor="middle" fill="#d2e7b3" fontSize="13">A peak is a clue. Context matters.</text></svg><div className="illustration-bottom"><span>Frequency content, made visible</span><span>Illustration only</span></div><div className="illustration-note"><span className="note-number">02</span><p>Independent indicators.<br/><strong>A more careful interpretation.</strong></p></div></div>
    </section>
    <section className="workflow" aria-label="Three steps to a structured observation">{[{n:'01',icon:'mic',title:'Capture a short sample',text:'Use your microphone, load a local file, or explore a labeled synthetic demo.'},{n:'02',icon:'wave',title:'Understand the signal',text:'Inspect low-frequency contribution and an experimental sustained-peak indicator.'},{n:'03',icon:'file',title:'Keep the whole context',text:'Add what you noticed and export a report with methods, limitations, and local references.'}].map(item => <article key={item.n}><div className="workflow-icon"><Icon name={item.icon as 'mic' | 'wave' | 'file'}/><span>{item.n}</span></div><h2>{item.title}</h2><p>{item.text}</p></article>)}</section>
    <div className="home-boundary"><span className="small-cross">+</span><p>A useful starting point for a conversation. <strong>Uncalibrated screening cannot identify a source, establish legal compliance, or replace a qualified measurement.</strong></p><a href="#/sources">Read the method <Icon name="arrow" size={17}/></a></div>
  </main>;
}

function SourcesPage() {
  return <main id="main-content" className="sources-page page-shell"><div className="page-heading"><p className="eyebrow">Transparency, by design</p><h1>Sources & method</h1><p>Inspect the calculation, understand its limits, and check the original references.</p></div><div className="source-intro panel"><h2>Two independent screening indicators</h2><p>The captured-spectrum C−A difference compares A- and C-weighted digital powers from the same samples. A difference of at least 15 dB suggests low-frequency contribution under this prototype convention. It does not establish a tone.</p><p>The experimental sustained-peak heuristic checks 40–2,000 Hz for a narrow peak in at least 80% of all complete frames, with at least 20 frames. Its prominence and persistence thresholds are engineering choices, not a standardized tonality assessment or a county definition.</p><div className="method-specs"><span>Method {ALGORITHM_VERSION}</span><span>Updated {METHOD_UPDATED}</span><span>5 seconds</span><span>8,192-point FFT</span><span>Periodic Hann</span><span>50% overlap</span><span>44.1 / 48 kHz tested rates</span></div><p>Linear power is averaged before conversion to dB. A/C curves are normalized at 1 kHz; integration spans 20 Hz to min(20 kHz, Nyquist). Digital levels use RMS 1 as the reference. Constant gain cancels in C−A; frequency response and processing do not.</p></div><section className="panel"><h2>What the result can’t establish</h2><ul className="limitation-list">{methodLimitations.map((text, i) => <li key={i}>{text}</li>)}</ul><p>Audio and notes stay in memory until reset or page close. No accounts, tracking, GPS, or automatic sharing. Reports contain the context you type; review them before sharing.</p></section><div className="section-heading"><div><p className="eyebrow">Curated references</p><h2>Read the original sources</h2></div></div><p className="muted">A county selection supplies context. Only the responsible agency can confirm which requirements apply. A five-second browser sample implements neither county’s formal procedure.</p><div className="source-grid">{sources.map(source => <article className="panel source-card" key={source.id}><p className="eyebrow">{source.jurisdiction === 'loudoun' ? 'Loudoun County' : source.jurisdiction === 'prince-william' ? 'Prince William County' : 'Acoustics & implementation'}</p><h3><a href={source.url} target="_blank" rel="noreferrer">{source.title} <Icon name="external" size={15}/></a></h3><p>{source.summary}</p><small>{source.scopeNote}</small><span className="source-date">{sourceStatus(source)}</span></article>)}</div><a className="button primary" href="#/measure">Return to observation <Icon name="arrow"/></a></main>;
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [mode, setMode] = useState<InputMode>('demo');
  const [fixture, setFixture] = useState<FixtureId>('hum-harmonics');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [meterReading, setMeterReading] = useState<InputMeterReading | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [context, setContext] = useState<ObservationContext>({ ...emptyContext });
  const [report, setReport] = useState<ReportModel | null>(null);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    retainedAudio.current = { pcm: pcm.slice(), fs };
    setPhase('analyzing');
    try {
      const nextWorker = new Worker(new URL('./analysis/analysis.worker.ts', import.meta.url), { type: 'module' });
      worker.current = nextWorker;
      nextWorker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
        if (event.data.sessionId !== activeId.current) return;
        if ('error' in event.data) { setError(event.data.error); setPhase('idle'); }
        else { setResult(event.data.result); setPhase('ready'); }
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
        const input = await startCapture({ signal: abort.signal, onProgress: (nextPhase, fraction) => { if (sessionId === activeId.current) { setPhase(nextPhase); setProgress(fraction); } }, onMeter: reading => { if (sessionId === activeId.current) setMeterReading(reading); } });
        if (sessionId === activeId.current) setMeterReading(null);
        analyze(input.pcm, input.fs, input.meta, sessionId);
      } else if (selectedFile) {
        setPhase('decoding');
        const input = await decodeAudioFile(selectedFile, abort.signal);
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
  const selectedFixture = FIXTURES.find(item => item.id === fixture);
  const originLabel = result?.inputKind === 'synthetic' ? 'SYNTHETIC DEMO' : result?.inputKind === 'imported-file' ? 'IMPORTED FILE · CONTEXT UNKNOWN' : result ? 'MICROPHONE · UNCALIBRATED' : '';

  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.setAttribute('tabindex', '-1'); main?.focus(); main?.scrollIntoView(); }}>Skip to content</a>
    <header className="site-header"><a className="brand" href="#/" aria-label="TonalWatch home"><span className="brand-icon"><Icon name="wave" size={24}/></span>Tonal<span>Watch</span></a><nav aria-label="Main navigation"><a className="home-nav-link" href="#/" aria-current={route === '/' ? 'page' : undefined}><Icon name="home" size={16}/>Home</a><a href="#/measure" aria-current={route === '/measure' ? 'page' : undefined}>Observation</a><a href="#/learn" aria-current={route === '/learn' ? 'page' : undefined}>Learn</a><a href="#/map" aria-current={route === '/map' ? 'page' : undefined}>Map</a><a href="#/sources" aria-current={route === '/sources' ? 'page' : undefined}>Sources & method</a></nav><span className="header-privacy"><span className="live-dot"/> Local by design</span></header>
    {result ? <div className={`origin-strip ${result.inputKind === 'synthetic' ? 'synthetic-strip' : ''}`}><strong>{originLabel}</strong><span>{result.inputKind === 'synthetic' ? 'Generated audio validates software behavior, not field accuracy.' : result.inputKind === 'imported-file' ? 'Original recording time and processing are not established.' : 'A short screening sample, not a certified measurement.'}</span></div> : null}
    {route === '/' ? <Home onDemo={() => { window.location.hash = '/measure'; runDemo('hum-harmonics'); }}/ > : null}
    {route === '/measure' ? <main id="main-content" className="page-shell measure-page"><div className="page-heading"><div><p className="eyebrow">Your noise observation</p><h1>Listen. Inspect. Document.</h1><p>A short sample, two independent indicators, and the details only you can add.</p></div><button className="text-button" onClick={() => { invalidate(); setSelectedFile(null); setContext({ ...emptyContext }); setMapReadings([]); }}>Clear session <span aria-hidden="true">↺</span></button></div>
      <div className="analysis-layout"><aside className="input-column"><section className="panel input-panel"><div className="section-heading"><h2>Choose your input</h2><span className="tiny-label">5 SEC</span></div><div className="input-tabs" role="group" aria-label="Input type">{(['demo', 'microphone', 'file'] as const).map(item => <button key={item} className={mode === item ? 'selected' : ''} aria-pressed={mode === item} onClick={() => switchMode(item)} disabled={busy}><Icon name={item === 'demo' ? 'demo' : item === 'microphone' ? 'mic' : 'file'} size={18}/>{item === 'microphone' ? 'Mic' : item === 'file' ? 'File' : 'Demo'}</button>)}</div>
        {mode === 'demo' ? <><div className="input-symbol"><Icon name="demo" size={32}/></div><h3>Explore a known signal</h3><p className="muted">A reliable way to see what the indicators can—and can’t—tell you.</p><label>Demo signal<select value={fixture} disabled={busy} onChange={e => { invalidate(); setFixture(e.target.value as FixtureId); }}>{FIXTURES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p className="fixture-description">{selectedFixture?.description}</p><button className="button primary input-action" disabled={busy} onClick={() => runDemo()}>Analyze demo <Icon name="arrow" size={18}/></button><p className="demo-disclosure">SYNTHETIC DEMO<br/><span>Generated locally. Not a field recording.</span></p></> : null}
        {mode === 'microphone' ? <><div className="input-symbol"><Icon name="mic" size={32}/></div><h3>Record what you hear</h3><p className="muted">Hold your device still. Avoid speaking, touching the microphone, or blocking it.</p><div className="capture-note"><strong>0.5 s warm-up + 5 s capture</strong><p>We request disabled audio processing, but your device may still filter or reshape the sound.</p></div><InputMeter reading={meterReading} active={phase === 'warming-up' || phase === 'recording'}/><button className="button primary input-action" onClick={startInput} disabled={busy || tonePlaying}><Icon name="mic" size={18}/> Start 5-second capture</button>{tonePlaying ? <p className="learn-disabled" role="status">Stop the listening tone before microphone capture.</p> : null}<small className="input-footnote">Microphone requires permission and HTTPS or localhost. Access ends after capture, cancel, or navigation.</small></> : null}
        {mode === 'file' ? <><div className="input-symbol"><Icon name="file" size={32}/></div><h3>Load a local recording</h3><p className="muted">Choose an audio file at least five seconds long. PCM WAV is the supported baseline.</p><label className="file-picker">Audio file · up to 10 MB<input type="file" accept="audio/*,.wav" disabled={busy} onChange={e => { const file = e.target.files?.[0] ?? null; invalidate(); setSelectedFile(file); e.target.value = ''; }}/></label>{selectedFile ? <p className="selected-filename">{selectedFile.name}</p> : null}<button className="button primary input-action" onClick={startInput} disabled={busy || !selectedFile}>Analyze file <Icon name="arrow" size={18}/></button><small className="input-footnote">First five seconds from offset 0, first channel. Decoded locally; browser may resample. Original recording time and processing unknown.</small></> : null}
        {busy ? <div className="capture-progress" role="status"><strong>{phase === 'permission-pending' ? 'Waiting for microphone permission…' : phase === 'warming-up' ? 'Warming up the microphone…' : phase === 'recording' ? `Recording ${(Math.max(0, progress) * 5).toFixed(1)} / 5.0 s` : phase === 'decoding' ? 'Decoding local audio…' : 'Analyzing the captured PCM…'}</strong>{phase === 'recording' ? <progress value={progress} max={1} aria-label="Recorded sample progress"/> : <span className="working-line"/>}<button className="button secondary" onClick={invalidate}>Cancel</button></div> : null}
        {error ? <div className="error-box" role="alert"><strong>Input needs attention</strong><p>{error}</p><span>Retry, choose a demo, or load a local file.</span></div> : null}
      </section><div className="local-note"><Icon name="shield" size={22}/><div><strong>Your audio stays here.</strong><p>Processed in this browser. No recording is uploaded or attached to your report.</p></div></div></aside><div className="result-stack"><ResultPanel result={result} analyzing={phase === 'analyzing'}/><LearnPanel result={result} disabled={busy} onPlaybackChange={updateTonePlayback}/></div></div>
      {result ? <SoundHintsPanel key={result.id} result={result} input={retainedAudio.current}/> : null}<ObservationForm context={context} onChange={value => { setContext(value); setReport(null); }}/><div className="review-bar"><div><p className="eyebrow">03 / Bring it together</p><strong>A clear observation starts a better conversation.</strong><p>Review your notes, results, and references before sharing.</p></div><button className="button primary" onClick={review} disabled={!result || busy}>Review observation <Icon name="arrow"/></button></div><div className="sr-only" aria-live="polite">{phase === 'ready' ? 'Analysis complete. Results and report review are available.' : ''}</div>
    </main> : null}
    {route === '/learn' ? <LearnPage result={result} disabled={busy} onPlaybackChange={updateTonePlayback}/> : null}
    {route === '/map' ? <Suspense fallback={<main id="main-content" className="page-shell"><p role="status">Loading observation map…</p></main>}><ObservationMap currentResult={result} sessionReadings={mapReadings} onAddReading={reading => setMapReadings(previous => [...previous, reading])} onClearSessionReadings={() => setMapReadings([])}/></Suspense> : null}
    {route === '/sources' ? <SourcesPage/> : null}
    {route === '/report' ? <main id="main-content" className="page-shell report-page">{report && result ? <><div className="page-heading report-toolbar"><div><p className="eyebrow">03 / Review & export</p><h1>Your observation packet</h1><p>Review the preview. Your notes may contain personal information.</p></div><div className="report-actions"><button className="button secondary" onClick={downloadText}><Icon name="download" size={18}/> Download text</button><button className="button primary" onClick={() => window.print()}><Icon name="print" size={18}/> Print / save PDF</button></div></div><a className="back-link" href="#/measure">← Edit observation</a><ReportView report={report}/></> : <div className="panel empty-report"><Icon name="file" size={42}/><h1>Create an observation first</h1><p>A report needs an input and its analysis. A synthetic demo works, too.</p><a className="button primary" href="#/measure">Start an observation <Icon name="arrow"/></a></div>}</main> : null}
    <footer className="site-footer"><a className="brand footer-brand" href="#/"><Icon name="wave" size={20}/> TonalWatch</a><p>Careful observations. Clearer conversations.</p><span>Uncalibrated screening · <a href="#/sources">Method & limitations</a></span></footer>
  </>;
}
