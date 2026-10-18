import type { ReactNode } from 'react';
import type { AnalysisResult, QualityCode } from '../types';
import { interpretResult } from '../data/references';
import { Spectrum } from './Spectrum';
import { GapRuler } from './Motif';

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
const GAP_SCALE_MAX = 30;
const GAP_THRESHOLD = 15;

const verdict = (result: AnalysisResult | null, analyzing: boolean) => {
  if (analyzing) return { tone: 'busy', text: 'Checking…' };
  if (!result) return { tone: 'idle', text: 'No check yet' };
  if (result.lowFrequencyScreen === 'suggested') return { tone: 'alert', text: 'Deep hum detected' };
  if (result.lowFrequencyScreen === 'not-indicated') return { tone: 'calm', text: 'No deep hum found' };
  return { tone: 'muted', text: 'Couldn’t tell — try again' };
};
const meaning = (result: AnalysisResult | null) => {
  if (!result) return 'Hold your phone toward the sound to check it.';
  const gap = result.cMinusADb;
  if (result.lowFrequencyScreen === 'suggested' && gap !== null) return `${gap.toFixed(0)} dB louder once deep sounds are counted. 15 or more means a deep hum.`;
  if (result.lowFrequencyScreen === 'not-indicated') return 'Counting deep sounds barely changes the reading. Under 15 means no deep hum.';
  return 'This clip was too quiet, short or distorted to judge.';
};

/** The answer in words first, then the gap number with its 15 dB scale, then one plain sentence. */
export function ResultVerdict({ result, analyzing, action, className = '' }: { result: AnalysisResult | null; analyzing: boolean; action?: ReactNode; className?: string }) {
  const v = verdict(result, analyzing);
  const gap = result?.cMinusADb ?? null;
  const fill = gap === null ? 0 : Math.max(0, Math.min(1, gap / GAP_SCALE_MAX));
  const tick = `${GAP_THRESHOLD / GAP_SCALE_MAX * 100}%`;
  return <section className={`verdict verdict--${v.tone} ${className}`} aria-labelledby="verdict-title" aria-live="polite">
    <h2 id="verdict-title" className="verdict-answer">{v.text}</h2>
    <div className="verdict-gap"><span className="verdict-label">The gap</span><span className="verdict-number"><strong>{analyzing || gap === null ? '--.-' : number(gap)}</strong><span className="verdict-unit">dB</span></span></div>
    <div className="gap-scale" aria-hidden="true">
      <div className="gap-track"><span className="gap-fill" style={{ width: `${fill * 100}%` }}/><span className="gap-threshold" style={{ left: tick }}/></div>
      <GapRuler/>
      <div className="gap-ticks"><span>0</span><span style={{ left: tick }}>15 dB</span><span>30+</span></div>
    </div>
    <p className="verdict-help">{meaning(result)}</p>
    {action}
  </section>;
}

export function ResultPanel({ result, analyzing, targetDurationSeconds = 5 }: { result: AnalysisResult | null; analyzing: boolean; targetDurationSeconds?: number }) {
  return <section className={`group results-panel${result ? '' : ' is-empty'}`} aria-labelledby="results-title">
    <div className="group-head"><h2 id="results-title">Picture of the sound</h2><span>{analyzing ? 'Checking…' : result ? `${result.durationSeconds.toFixed(2)} s · ${(result.sampleRateHz / 1000).toFixed(1)} kHz` : `${targetDurationSeconds}-second screening sample`}</span></div>
    <div className="group-body">
      <p className="plot-header"><span>Deep sounds on the left, high sounds on the right</span></p>
      <Spectrum result={result}/>
      <dl className="metrics">
        <div className="metric"><dt>Official reading <small>A-weighted</small></dt><dd>{number(result?.aDigitalDb ?? null)} <span>dB</span></dd></div>
        <div className="metric"><dt>With the deep sounds left in <small>C-weighted</small></dt><dd>{number(result?.cDigitalDb ?? null)} <span>dB</span></dd></div>
        <div className="metric metric--gap"><dt>The gap <small>C−A</small></dt><dd>{number(result?.cMinusADb ?? null)} <span>dB</span></dd></div>
      </dl>
      <div className="unit-caption level-explanation"><p><strong>Why can the levels be negative?</strong> A and C are digital levels relative to RMS 1. A value below 0 dB means the weighted signal is below that digital reference; for example, −20 dB is one-tenth of its RMS amplitude. It does not mean negative sound pressure. These values are not calibrated dB SPL.</p><p><strong>C−A is a separate difference.</strong> It can be negative when the C-weighted level is lower than the A-weighted level for this spectrum. Negative values alone do not indicate a recording error.</p></div>
      {result ? <>
        <dl className="indicator-list">
          <div className="indicator"><dt>Deep hum check<small>Gap of 15 dB or more · prototype rule</small></dt><dd>{screenText[result.lowFrequencyScreen]}</dd></div>
          <div className="indicator"><dt>Steady tone check <small>{result.peakCandidate ? `Experimental · in ${Math.round(result.peakCandidate.persistentFrameFraction * 100)}% of the clip, not confidence` : 'Experimental · 40–2,000 Hz'}</small></dt><dd>{result.peakCandidate ? `Near ${result.peakCandidate.centerHz.toFixed(0)} Hz` : screenText[result.peakScreen]}</dd></div>
        </dl>
        <div className="interpretation"><strong>Technical summary</strong><p>{interpretResult(result)}</p></div>
        {result.qualityCodes.length > 0 ? <div className="quality-notes"><strong>Recording quality</strong><ul>{result.qualityCodes.map(code => <li key={code}>{qualityText[code]}</li>)}</ul></div> : null}
      </> : <p className="empty-guidance">Record a live microphone sample to inspect the two independent indicators.</p>}
      <details className="method-details"><summary>How the analysis works</summary><p>The same PCM engine analyzes every input. It averages linear spectral power (PSD) across complete 8,192-sample periodic Hann windows with 50% overlap, then applies A and C response curves normalized at 1 kHz over 20 Hz–20 kHz.</p><p>The C−A difference screens for low-frequency contribution. A separate experimental peak test looks for narrow structure in at least 80% of complete frames. Neither establishes legal tonality, an equipment source, or field accuracy. Constant gain cancels in the difference; microphone response, filtering, processing, and clipping do not.</p><a href="#/sources">Sources and full method</a></details>
    </div>
  </section>;
}
