import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisResult } from '../types';

/* Drawn in real pixels (the SVG viewBox follows the rendered width), so axis labels stay
   readable at phone width instead of shrinking with a fixed viewBox. */
export function Spectrum({ result }: { result: AnalysisResult | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(640);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => { const w = Math.round(el.clientWidth); if (w > 0) setVw(w); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const narrow = vw < 520;
  const left = 40, right = 12, top = 14, height = narrow ? 150 : 190;
  const width = Math.max(120, vw - left - right);
  const vh = top + height + 30;
  const maxHz = result?.analyzedBandHz[1] ?? 20000;
  const x = (hz: number) => left + Math.log(hz / 20) / Math.log(maxHz / 20) * width;
  const data = useMemo(() => {
    if (!result?.spectrum.hz.length) return null;
    const bins = new Map<number, number>();
    result.spectrum.hz.forEach((hz, i) => {
      const db = result.spectrum.powerDb[i];
      if (hz < 20 || hz > maxHz || !Number.isFinite(db)) return;
      const pixel = Math.round(Math.log(hz / 20) / Math.log(maxHz / 20) * width);
      bins.set(pixel, Math.max(bins.get(pixel) ?? -300, db));
    });
    const points = [...bins.entries()].sort((a, b) => a[0] - b[0]);
    if (!points.length) return null;
    const high = Math.min(0, Math.ceil(Math.max(...points.map(p => p[1])) / 20) * 20 + 10);
    const low = high - 100;
    const y = (db: number) => top + height * (1 - (Math.max(low, Math.min(high, db)) - low) / (high - low));
    const line = points.map(([pixel, db], i) => `${i ? 'L' : 'M'}${(left + pixel).toFixed(1)},${y(db).toFixed(2)}`).join(' ');
    return { line, high, low };
  }, [result, maxHz, width, height]);
  const high = data?.high ?? -20;
  const ticks = (narrow ? [20, 100, 1000, 10000] : [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]).filter(hz => hz <= maxHz);
  const peakHz = result?.peakCandidate?.centerHz ?? null;
  const peakX = peakHz !== null && peakHz >= 20 && peakHz <= maxHz ? x(peakHz) : null;
  return <div className="spectrum-wrap" ref={wrapRef}>
    <svg className="spectrum" viewBox={`0 0 ${vw} ${vh}`} width="100%" height={vh} preserveAspectRatio="none" role="img" aria-label={result ? `Frequency spectrum of ${result.inputLabel ?? result.fixtureId ?? result.inputKind}. ${result.peakCandidate ? `Peak candidate near ${result.peakCandidate.centerHz.toFixed(0)} Hz.` : 'No reliable sustained peak candidate.'}` : 'Spectrum awaiting a recording. No signal is plotted.'}>
      {[0, 1, 2, 3, 4, 5].filter(i => !narrow || i % 2 === 0 || i === 5).map(i => <g key={i}><line className="spectrum-grid" x1={left} y1={top + i * height / 5} x2={left + width} y2={top + i * height / 5}/><text x={left - 8} y={top + i * height / 5 + 4} textAnchor="end">{high - i * 20}</text></g>)}
      {ticks.map(hz => <text key={hz} x={Math.min(Math.max(x(hz), left + 8), left + width - 12)} y={top + height + 20} textAnchor="middle">{hz >= 1000 ? `${hz / 1000}k` : hz}</text>)}
      {data ? <path className="spectrum-line" d={data.line} fill="none"/> : <text className="plot-empty" x={left + width / 2} y={top + height / 2} textAnchor="middle">{result ? 'No usable spectrum for this input' : 'Your spectrum will appear here'}</text>}
      {data && peakX !== null ? <g className="spectrum-peak"><line x1={peakX} x2={peakX} y1={top} y2={top + height}/><text x={peakX + 6} y={top + 12} textAnchor="start">{peakHz!.toFixed(0)} Hz</text></g> : null}
    </svg>
    <p className="chart-caption"><span>dB re 1²/Hz · Hz, log scale</span><span>{result ? `${(result.sampleRateHz / result.fftSize).toFixed(3)} Hz bins · ${result.frameCount} frames` : '20 Hz–20 kHz'}</span></p>
  </div>;
}
