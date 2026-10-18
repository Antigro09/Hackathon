import { useId } from 'react';
import type { AnalysisResult } from '../types';
import { assessRecordingCheck } from '../analysis/recordingCheck';
import '../recording-check.css';

function finiteNumber(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : 'Unavailable';
}

export function RecordingCheck({ result }: { result: AnalysisResult | null }) {
  const titleId = useId();
  if (!result) return null;
  const check = assessRecordingCheck(result);
  return <section className={`recording-check recording-check-${check.status}`} aria-labelledby={titleId}>
    <div className="recording-check-heading"><h3 id={titleId}>Recording check</h3><span className="recording-check-status">{check.label}</span></div>
    <p>{check.summary}</p>
    <dl className="recording-check-facts">
      <div><dt>Recorded window</dt><dd>{finiteNumber(check.window.durationSeconds, 3)} seconds</dd></div>
      <div><dt>Digital input</dt><dd>{finiteNumber(check.window.sampleRateHz)} Hz · {finiteNumber(check.window.sampleCount)} samples</dd></div>
      <div><dt>Analyzed frames</dt><dd>{finiteNumber(check.window.analyzedFrameCount)}{check.window.analysisSkipped ? ' · stopped for a quality flag' : check.window.metadataConsistent ? ' complete FFT windows' : ' · review window metadata'}</dd></div>
    </dl>
    <div className="recording-check-processing"><h4>Browser-reported processing</h4>
      <dl>{check.processing.settings.map(setting => <div key={setting.key}><dt>{setting.label}</dt><dd>{setting.state === 'on' ? 'Reported on' : setting.state === 'off' ? 'Reported off' : 'Unknown'}</dd></div>)}</dl>
      <p>{check.processing.state === 'reported-off' ? 'The browser reports these three settings off. Other device or hardware processing is not established.' : check.processing.state === 'active' ? 'Audio processing is reported active and can change the captured sound balance.' : 'Processing is not fully established for this recording, even if no other problem was flagged.'}</p>
    </div>
    {check.issues.length ? <ul className="recording-check-advice">{check.issues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul> : null}
    <p className="recording-check-boundary">These checks assess digital recording usability across the recorded window. They do not validate microphone accuracy, faithful capture of the real sound, calibrated sound levels, or a data-center source. Optional AI sound-family hints provide separate context.</p>
  </section>;
}
