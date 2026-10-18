import { useMemo } from 'react';
import type { AnalysisResult } from '../types';

export function Spectrum({ result }: { result: AnalysisResult | null }) {
  const left = 58, top = 22, width = 850, height = 214;
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
    const line = points.map(([pixel, db], i) => `${i ? 'L' : 'M'}${left + pixel},${y(db).toFixed(2)}`).join(' ');
    return { line, area: `${line} L${left + points[points.length - 1][0]},${top + height} L${left + points[0][0]},${top + height} Z`, high, low };
  }, [result, maxHz]);
  const high = data?.high ?? -20;
  return <div className="spectrum-wrap">
    <svg className="spectrum" viewBox="0 0 940 290" role="img" aria-label={result ? `Frequency spectrum of ${result.inputLabel ?? result.fixtureId ?? result.inputKind}. ${result.peakCandidate ? `Peak candidate near ${result.peakCandidate.centerHz.toFixed(0)} Hz.` : 'No reliable sustained peak candidate.'}` : 'Spectrum awaiting a recording. No signal is plotted.'}>
      <defs><linearGradient id="spectrum-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#aacd85" stopOpacity=".55"/><stop offset="100%" stopColor="#aacd85" stopOpacity=".02"/></linearGradient></defs>
      {[0, 1, 2, 3, 4, 5].map(i => <g key={i}><line x1={left} y1={top + i * height / 5} x2={left + width} y2={top + i * height / 5} stroke="#ffffff18"/><text x={left - 12} y={top + i * height / 5 + 4} textAnchor="end">{high - i * 20}</text></g>)}
      {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(hz => hz <= maxHz).map(hz => <g key={hz}><line x1={x(hz)} x2={x(hz)} y1={top} y2={top + height} stroke="#ffffff0d"/><text x={x(hz)} y={top + height + 24} textAnchor="middle">{hz >= 1000 ? `${hz / 1000}k` : hz}</text></g>)}
      {data ? <><path d={data.area} fill="url(#spectrum-fill)"/><path d={data.line} fill="none" stroke="#c5e39a" strokeWidth="1.6"/></> : <text className="plot-empty" x="485" y="133" textAnchor="middle">{result ? 'No usable spectrum available for this input' : 'Your captured spectrum will appear here'}</text>}
      <text x="485" y="284" textAnchor="middle">Frequency · Hz (log scale)</text>
    </svg>
    <p className="chart-caption">Digital PSD · dB re 1²/Hz <span>{result ? `${(result.sampleRateHz / result.fftSize).toFixed(3)} Hz bin spacing · ${result.frameCount} complete frames` : '20 Hz–20 kHz analysis band'}</span></p>
  </div>;
}
