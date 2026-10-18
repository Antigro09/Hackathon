import { useId } from 'react';
import type { ReportSpectrumModel } from './spectrum';
import { plotReportSpectrum, REPORT_PLOT } from './spectrum';

export function ReportSpectrum({ spectrum }: { spectrum: ReportSpectrumModel }) {
  const id = useId();
  const plot = plotReportSpectrum(spectrum);
  const { left, top, width, height, viewWidth, viewHeight } = REPORT_PLOT;
  return <section className="report-section report-spectrum-section" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>Captured frequency spectrum</h2>
    <figure className="report-spectrum-figure">
      {plot ? <svg className="report-spectrum" viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>Frequency spectrum — {spectrum.origin}</title>
        <desc id={`${id}-description`}>Actual averaged digital PSD over {spectrum.bandHz[0]} to {spectrum.bandHz[1]} Hz, logarithmic frequency axis. {plot.peak?.label ?? 'No reliable sustained peak candidate labeled.'} {spectrum.explanation}</desc>
        <rect x={left} y={top} width={width} height={height} fill="white" stroke="#555" strokeWidth="1"/>
        <text x={left} y="17" fontSize="12" fill="#111">{spectrum.units}</text>
        {plot.yTicks.map(tick => <g key={tick.db}>
          <line x1={left} x2={left + width} y1={tick.y} y2={tick.y} stroke="#bbb" strokeWidth=".6"/>
          <text x={left - 9} y={tick.y + 4} textAnchor="end" fontSize="11" fill="#111">{tick.db}</text>
        </g>)}
        {plot.xTicks.map(tick => <g key={tick.hz}>
          <line x1={tick.x} x2={tick.x} y1={top} y2={top + height} stroke="#ccc" strokeWidth=".6"/>
          <text x={tick.x} y={top + height + 20} textAnchor="middle" fontSize="10" fill="#111">{tick.label}</text>
        </g>)}
        <path className="report-spectrum-line" d={plot.line} stroke="#111" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
        {plot.peak ? <g>
          <line x1={plot.peak.x} x2={plot.peak.x} y1={top} y2={top + height} stroke="#111" strokeWidth="1" strokeDasharray="4 3"/>
          <text x={Math.max(left + 100, Math.min(left + width - 100, plot.peak.x))} y={top + 16} textAnchor="middle" fontSize="11" fill="#111" className="report-spectrum-peak">{plot.peak.label}</text>
        </g> : null}
        <text x={left + width / 2} y="255" textAnchor="middle" fontSize="12" fill="#111">Frequency · Hz (log scale)</text>
      </svg> : <div className="report-spectrum-empty">No usable spectrum available</div>}
      <figcaption>
        <strong>{spectrum.origin}</strong><br/>
        {spectrum.units} · {spectrum.bandHz[0]}–{spectrum.bandHz[1]} Hz analyzed band · {spectrum.binSpacingHz?.toFixed(3) ?? 'unavailable'} Hz bin spacing · {spectrum.frameCount} complete frames.
        {plot ? <> The graph uses a 100 dB display range; lower bins stop at the display floor. The analysis uses the full linear spectral power.</> : null}
      </figcaption>
    </figure>
    <p className={spectrum.status === 'limited' ? 'report-spectrum-warning' : undefined}>{spectrum.explanation}</p>
    <p>PSD is relative to the digital reference 1²/Hz. This is uncalibrated input; it is not a sound-pressure measurement.</p>
  </section>;
}
