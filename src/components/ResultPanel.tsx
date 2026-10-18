import type { AnalysisResult, QualityCode } from '../types';
import { interpretResult } from '../data/references';
import { Spectrum } from './Spectrum';

const qualityText: Record<QualityCode, string> = {
  'near-zero': 'Almost no digital signal was captured.',
  clipped: 'Clipping distorted this recording. Retry with a lower input level or more distance.',
  'near-full-scale': 'The signal approached the digital limit; distortion is possible.',
  incomplete: 'The recording was interrupted or did not contain the required sample.',
  'unsupported-rate': 'This sample rate has not been validated. Use 44.1 or 48 kHz.',
  'processing-active': 'Device audio processing is active and may reshape the signal.',
  'processing-unknown': 'Device audio processing could not be fully verified.',
  'imported-processing-unknown': 'The imported recording’s original processing and recording context are unknown.',
  'non-finite': 'The input contains invalid samples. Analysis is unavailable.',
  'no-band-power': 'No usable power remained in the analysis band after removing DC.',
};
const screenText = { suggested: 'Suggested', 'not-indicated': 'Not indicated in this sample', inconclusive: 'Inconclusive', 'not-evaluated': 'Not evaluated' };
const number = (value: number | null) => value === null ? '—' : value.toFixed(1);

export function ResultPanel({ result, analyzing, targetDurationSeconds = 5 }: { result: AnalysisResult | null; analyzing: boolean; targetDurationSeconds?: number }) {
  return <section className="panel results-panel" aria-labelledby="results-title">
    <div className="section-heading"><div><p className="eyebrow">01 / Inspect the signal</p><h2 id="results-title">A closer look at the hum</h2></div><span className={`status-tag ${result ? 'complete' : ''}`}>{analyzing ? 'Analyzing PCM…' : result ? 'Analysis complete' : 'Awaiting input'}</span></div>
    <div className="plot-header"><span>Frequency spectrum</span><span>{result ? `${result.durationSeconds.toFixed(2)} s · ${(result.sampleRateHz / 1000).toFixed(1)} kHz` : `${targetDurationSeconds}-second screening sample`}</span></div>
    <Spectrum result={result}/>
    <div className="metrics">
      <div className="metric primary-metric"><p>Captured-spectrum C−A</p><div className="metric-number">{number(result?.cMinusADb ?? null)} <span>dB</span></div><small>Uncalibrated input</small></div>
      <div className="metric"><p>A relative</p><div className="metric-number secondary-number">{number(result?.aDigitalDb ?? null)} <span>dB</span></div><small>Weighted digital level</small></div>
      <div className="metric"><p>C relative</p><div className="metric-number secondary-number">{number(result?.cDigitalDb ?? null)} <span>dB</span></div><small>Weighted digital level</small></div>
    </div>
    <div className="unit-caption level-explanation"><p><strong>Why can the levels be negative?</strong> A and C are digital levels relative to RMS 1. A value below 0 dB means the weighted signal is below that digital reference; for example, −20 dB is one-tenth of its RMS amplitude. It does not mean negative sound pressure. These values are not calibrated dB SPL.</p><p><strong>C−A is a separate difference.</strong> It can be negative when the C-weighted level is lower than the A-weighted level for this spectrum. Negative values alone do not indicate a recording error.</p></div>
    {result ? <>
      <div className="indicator-grid"><div className="indicator"><span className="indicator-label">Low-frequency contribution</span><strong>{screenText[result.lowFrequencyScreen]}</strong><small>C−A ≥ 15 dB · prototype convention</small></div><div className="indicator"><span className="indicator-label">Experimental sustained peak</span><strong>{result.peakCandidate ? `Candidate near ${result.peakCandidate.centerHz.toFixed(0)} Hz` : screenText[result.peakScreen]}</strong><small>{result.peakCandidate ? `${Math.round(result.peakCandidate.persistentFrameFraction * 100)}% of complete frames · not confidence` : '40–2,000 Hz search range'}</small></div></div>
      <div className="interpretation"><strong>What this recording suggests</strong><p>{interpretResult(result)}</p></div>
      {result.qualityCodes.length > 0 ? <div className="quality-notes"><strong>Recording quality & limitations</strong><ul>{result.qualityCodes.map(code => <li key={code}>{qualityText[code]}</li>)}</ul></div> : null}
    </> : <p className="empty-guidance">Choose a demo, record your microphone, or load a local audio file to inspect the two independent indicators.</p>}
    <p className="screening-note">Uncalibrated screening only. No source identification or legal-compliance determination.</p>
    <details className="method-details"><summary>How this analysis works</summary><p>The same PCM engine analyzes every input. It averages linear spectral power across complete 8,192-sample periodic Hann windows with 50% overlap, then applies A and C response curves normalized at 1 kHz over 20 Hz–20 kHz.</p><p>The C−A difference screens for low-frequency contribution. A separate experimental peak test looks for narrow structure in at least 80% of complete frames. Neither establishes legal tonality, an equipment source, or field accuracy. Constant gain cancels in the difference; microphone response, filtering, processing, and clipping do not.</p><a href="#/sources">View sources and full method <span aria-hidden="true">↗</span></a></details>
  </section>;
}
