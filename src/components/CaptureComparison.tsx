import { useId, useState } from 'react';
import type { AnalysisResult } from '../types';
import { captureOriginLabel, compareCaptures, formatGapDelta } from '../analysis/comparison';
import type { CaptureSnapshot } from '../analysis/comparison';
import { qualityDescriptions } from '../data/references';
import '../comparison.css';

export interface CaptureComparisonProps { current: AnalysisResult | null; previous: AnalysisResult | null }

function CaptureContext({ capture, label }: { capture: CaptureSnapshot; label: string }) {
  return <article className="comparison-capture">
    <p className="comparison-capture-label">{label}</p>
    <p className="comparison-origin">{captureOriginLabel(capture.inputKind)}</p>
    <strong>{capture.cMinusADb.toFixed(1)} dB <span>captured-spectrum C−A</span></strong>
    <p className="comparison-input-label">{capture.inputLabel ?? (capture.inputKind === 'synthetic' ? `Generated fixture: ${capture.fixtureId ?? 'unspecified'}` : 'Recording label not supplied')}</p>
    <p>{capture.durationSeconds.toFixed(2)} s · {capture.sampleRateHz.toLocaleString()} Hz</p>
    <details className="comparison-capture-context"><summary>Capture provenance & limits</summary>
      <dl><div><dt>Input kind</dt><dd>{capture.inputKind}</dd></div><div><dt>Analysis created (UTC)</dt><dd>{capture.analysisCreatedUtc}</dd></div><div><dt>Recording time (UTC)</dt><dd>{capture.recordedAtUtc ?? 'Unknown; analysis time is not a recording timestamp'}</dd></div><div><dt>Channel policy</dt><dd>{capture.channelPolicy}</dd></div><div><dt>Algorithm</dt><dd>{capture.algorithmVersion}</dd></div><div><dt>Separate peak check</dt><dd>{capture.peakScreen}</dd></div></dl>
      {capture.deviceSettings ? <><p>Reported browser settings · not hardware validation</p><dl>{Object.entries(capture.deviceSettings).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></> : <p>Browser/device processing settings are not established for this input.</p>}
      {capture.qualityCodes.length ? <ul>{capture.qualityCodes.map(code => <li key={code}>{qualityDescriptions[code]}</li>)}</ul> : null}
    </details>
  </article>;
}

export function CaptureComparison({ current, previous }: CaptureComparisonProps) {
  const comparison = compareCaptures(current, previous);
  const [visiblePair, setVisiblePair] = useState<string | null>(null);
  const pair = current && previous ? JSON.stringify([previous.id, current.id]) : null;
  const expanded = comparison.status === 'ready' && visiblePair === pair;
  const helpId = useId();
  const contentId = useId();
  return <section className="capture-comparison" aria-label="Compare captured-spectrum gap with the previous observation">
    <div className="comparison-heading"><div><p className="eyebrow">An optional look at two captures</p><h2>Compare with previous</h2></div><button type="button" className="button secondary" disabled={comparison.status !== 'ready'} aria-describedby={helpId} aria-expanded={expanded} aria-controls={contentId} onClick={() => setVisiblePair(expanded ? null : pair)}>{expanded ? 'Hide comparison' : 'Compare with previous'}</button></div>
    <p id={helpId} className="comparison-availability">{comparison.status === 'unavailable' ? comparison.message : 'Two usable gaps are available in this browser session. Choose Compare with previous to show the observed difference.'}</p>
    <div id={contentId} hidden={!expanded}>
      {comparison.status === 'ready' && expanded ? <>
        <div className="comparison-delta" role="status"><span>Δgap vs previous capture</span><strong>{formatGapDelta(comparison.deltaGapDb)}</strong><small>Current C−A minus previous C−A · uncalibrated inputs</small></div>
        {comparison.includesSynthetic ? <p className="comparison-synthetic"><strong>SYNTHETIC COMPARISON</strong> · at least one input is generated audio. This comparison does not describe two field measurements.</p> : null}
        <div className="comparison-captures"><CaptureContext capture={comparison.previous} label="Previous analysis" /><CaptureContext capture={comparison.current} label="Current analysis" /></div>
      </> : null}
    </div>
    <details className="comparison-explainer"><summary>What can change this difference?</summary><p>This is the observed difference between these two captures. Changes in sound, placement, microphone frequency response, or processing can change the gap. It is not a calibration offset and does not make devices interchangeable.</p><p>Only constant gain on otherwise identical, unclipped samples cancels in C−A; device response shaping does not. The sustained-peak check remains separate.</p><p>This feature keeps a previous analysis in this browser session. It does not link phones, import another device’s observation, or correct and pool map readings. The comparison resets on reload.</p></details>
  </section>;
}

export default CaptureComparison;
