import { useState } from 'react';
import { buildCaseReport, caseReportPeak, caseReportText, caseReportTime } from '../community/buildCaseReport';
import { caseHref } from '../community/casesTypes';
import type { NeighborhoodCaseDetail } from '../community/casesTypes';
import type { CaseReportModel } from '../community/buildCaseReport';
import { Icon } from './Icon';
import { NoiseSolutions } from './NoiseSolutions';
import '../community-report.css';

export interface CommunityCaseReportProps {
  detail: NeighborhoodCaseDetail;
  isExample?: boolean;
  caseUrl?: string;
  preparedAtUtc?: string;
}

/** A printable snapshot of reviewed public metadata. It never fetches or sends a complaint. */
export function CommunityCaseReport({ detail, isExample = false, caseUrl, preparedAtUtc }: CommunityCaseReportProps) {
  const [prepared] = useState(() => new Date().toISOString());
  const [downloadError, setDownloadError] = useState('');
  let report: CaseReportModel;
  try { report = buildCaseReport(detail, { isExample, caseUrl, preparedAtUtc: preparedAtUtc ?? prepared }); }
  catch {
    return <main id="main-content" className="page-shell report-page community-case-report-page"><section className="panel" role="alert">
      <h1>Community report unavailable</h1><p>This case snapshot could not be verified. Return to neighborhood cases and reload it before exporting.</p>
      <a className="button secondary" href="#/cases">Return to neighborhood cases</a>
    </section></main>;
  }
  const { summary } = report;
  const download = () => {
    let url: string | null = null, anchor: HTMLAnchorElement | null = null;
    try {
      setDownloadError('');
      url = URL.createObjectURL(new Blob([caseReportText(report)], { type: 'text/plain;charset=utf-8' }));
      anchor = document.createElement('a'); anchor.href = url; anchor.download = `tonalwatch-case-${report.caseId}.txt`;
      anchor.style.display = 'none'; document.body.appendChild(anchor); anchor.click();
    } catch { setDownloadError('The text download could not start. You can still print or save this report as a PDF.'); }
    finally { anchor?.remove(); if (url) { const objectUrl = url; setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); } }
  };

  return <main id="main-content" className="page-shell report-page community-case-report-page">
    <div className="case-report-toolbar"><div><p className="eyebrow">Community case / Review &amp; export</p><h1>Bring the observations together</h1>
      <p>Print or save a PDF with the complete timeline. The text summary keeps all totals and the 20 most recent observation details. Review public statements before sharing.</p></div>
      <div className="case-report-controls"><button type="button" className="button secondary" onClick={download}><Icon name="download" size={18}/>Download text summary</button>
        <button type="button" className="button primary" onClick={() => window.print()}><Icon name="print" size={18}/>Print / save PDF</button></div></div>
    <a className="case-report-back" href={caseHref(report.caseId)}>← Return to this case</a>
    {downloadError ? <p className="error-box" role="alert">{downloadError}</p> : null}
    <article className={`community-case-report${report.isExample ? ' case-report-is-example' : ''}`} aria-labelledby="community-case-report-title">
      {report.isExample ? <div className="case-report-example"><strong>FICTIONAL EXAMPLE — NOT FIELD DATA</strong>All observations in this example are invented to demonstrate the workflow. Do not submit this as a real noise complaint.</div> : null}
      <div className="case-report-origin"><strong>PUBLIC, SELF-REPORTED SNAPSHOT · UNVERIFIED</strong>Community observations organized for investigation. Uncalibrated browser screening does not identify a source or establish an ordinance violation.</div>
      <header className="case-report-header"><p className="eyebrow">TonalWatch / Community case report</p><h1 id="community-case-report-title">{report.title}</h1>
        <p className="case-report-subtitle">{report.neighborhood}</p>
        <dl className="case-report-context"><div className="case-report-wide"><dt>Public description — unverified statement</dt><dd>{report.description || 'No description shared.'}</dd></div>
          <div><dt>Approximate case area</dt><dd>{report.area.latitude.toFixed(3)}, {report.area.longitude.toFixed(3)} · {report.area.radiusKm} km radius. The chosen area is not a sound-source boundary.</dd></div>
          <div><dt>Report snapshot prepared</dt><dd>{caseReportTime(report.preparedAtUtc)}. Preparation is not the time a sound was captured.</dd></div>
          <div><dt>Case ID / creation</dt><dd>{report.caseId}<br/>{caseReportTime(report.caseCreatedAtUtc)}</dd></div>
          <div><dt>Public case link</dt><dd><a href={report.caseUrl}>{report.caseUrl}</a></dd></div></dl>
      </header>

      <section className="case-report-section" aria-labelledby="case-report-summary"><h2 id="case-report-summary">What was documented</h2>
        <dl className="case-report-stats"><div><dt>Linked public observations</dt><dd>{summary.observationCount}</dd></div><div><dt>Distinct UTC calendar days</dt><dd>{summary.distinctUtcDays}</dd></div><div><dt>Observations with quality flags</dt><dd>{summary.flaggedObservationCount}</dd></div></dl>
        <p><strong>First capture:</strong> {caseReportTime(summary.firstCaptureUtc)}<br/><strong>Last capture:</strong> {caseReportTime(summary.lastCaptureUtc)}</p>
        <p>These are counts of observations, not people or households. Repeated posts may come from the same person or device. Capture times come from device clocks and are not authenticated.</p>
        <p>Only the current linked public observations returned for this report are included, with a maximum of 200. Removed posts are omitted. Refresh the case for a new snapshot; this exported copy will not update.</p>
        {report.duplicateCopiesRemoved ? <p>{report.duplicateCopiesRemoved} identical duplicate copies were removed before counting.</p> : null}
        <div className="case-report-request"><h3>Requested follow-up</h3><p>Please investigate the recurring sound described in these public observations, advise which agency and measurement procedure apply, and consider qualified acoustic review. The source, recording fidelity and statements have not been independently verified.</p></div>
      </section>

      <section className="case-report-section" aria-labelledby="case-report-screens"><h2 id="case-report-screens">Prototype screening, with limits</h2>
        <dl className="case-report-stats"><div><dt>Available unblocked digital values</dt><dd>{summary.numericEligibleCount}</dd></div><div><dt>Sustained-peak suggestions</dt><dd>{summary.peakSuggestedCount}</dd></div><div><dt>C−A at least 15 dB suggestions</dt><dd>{summary.lowFrequencySuggestedCount}</dd></div></dl>
        <p>{summary.unusableNumbersCount} {summary.unusableNumbersCount === 1 ? 'observation has' : 'observations have'} unusable numeric screening and {summary.unusableNumbersCount === 1 ? 'is' : 'are'} excluded from both suggestion counts. The seven blocking quality codes are near-zero, clipped, near-full-scale, incomplete, unsupported-rate, non-finite and no-band-power.</p>
        <div className="case-report-boundary"><p><strong>Uncalibrated screening only.</strong> C−A is a difference between weighted digital powers, not a calibrated sound-pressure level. The 15 dB screen and sustained-peak heuristic are independent prototype suggestions, not official thresholds or a standardized tonality test. Processing flags can still limit observations with available values.</p>
          <p>No uncalibrated dB values are averaged. Suggestion counts use unrounded shared values. Counts do not establish how widespread a sound is, a data-center source, responsibility, or a legal violation. Unflagged or inconclusive samples do not establish quiet.</p></div>
        <h3 style={{ marginTop: 20 }}>Quality flags in this snapshot</h3>
        {report.qualityCounts.length ? <><ul className="case-report-quality-list">{report.qualityCounts.map(flag => <li key={flag.code}><span><strong>{flag.code}</strong> · {flag.description}</span><strong>{flag.count}</strong></li>)}</ul>
          <p>A capture can raise several flags, so these counts are not additive.</p></> : <p>No quality flags are listed in this snapshot. Absence of flags does not establish acoustic accuracy.</p>}
      </section>

      <section className="case-report-section" aria-labelledby="case-report-timeline"><h2 id="case-report-timeline">Public observation timeline</h2>
        {report.observations.length ? <table className="case-report-table"><caption>All {report.observations.length} {report.observations.length === 1 ? 'observation' : 'observations'}, oldest capture first. Notes and labels are unverified public statements. Each row is a live-microphone, public-self-reported observation; recording locations are rounded to three decimals.</caption>
          <thead><tr><th scope="col">Captured / UTC</th><th scope="col">Public label &amp; note</th><th scope="col">Digital screening &amp; capture metadata</th></tr></thead>
          <tbody>{report.observations.map(observation => <tr key={observation.id}>
            <td data-label="Captured / UTC"><time dateTime={observation.capturedAtUtc}>{caseReportTime(observation.capturedAtUtc)}</time><p>Published <time dateTime={observation.publishedAtUtc}>{caseReportTime(observation.publishedAtUtc)}</time></p></td>
            <td data-label="Public label & note"><strong>{observation.label}</strong><p>{observation.note || 'No public note shared.'}</p><p className="case-report-id">Observation ID: {observation.id}</p>
              <p>Recording area: {observation.coordinates.latitude.toFixed(3)}, {observation.coordinates.longitude.toFixed(3)}</p>
              {observation.nearbyFacility ? <p>Optional nearby mapped reference: {observation.nearbyFacility.name} ({observation.nearbyFacility.osmType}/{observation.nearbyFacility.osmId}). This is not an identified sound source.</p> : null}</td>
            <td data-label="Digital screening & capture metadata"><p className="case-report-digital">C−A: {observation.cMinusADb === null ? 'unavailable' : `${observation.cMinusADb.toFixed(2)} dB`}{observation.cMinusADb !== null ? ' · uncalibrated digital difference' : ''}</p>
              <p>{caseReportPeak(observation)}.</p><p>Quality flags: {observation.qualityCodes.join(', ') || 'none raised; not proof of accuracy'}.</p>
              <p>{observation.durationSeconds} s · {observation.sampleRateHz.toLocaleString('en-US')} Hz · {observation.sampleCount.toLocaleString('en-US')} samples · {observation.frameCount} frames<br/>Method {observation.algorithmVersion}</p></td>
          </tr>)}</tbody></table> : <div className="case-report-empty"><p>No linked observations are available in this snapshot. An empty case is not evidence of quiet. Link public observations before sharing an evidence packet.</p></div>}
      </section>

      <section className="case-report-section"><NoiseSolutions compact caseId={report.caseId} caseTitle={report.title} includeReport/>
        <p><a href="#/sources">Sources &amp; method</a> explains the prototype indicators and limits. Individual spectrum graphs belong to separate local observation reports; no graph is reconstructed from the public metadata.</p>
      </section>
      <footer className="case-report-footer"><p>This report uses only the case description and linked public metadata. It contains no audio, spectrum bins, optional AI results, private local notes or removal credentials.</p>
        <p>Public locations are approximate, not anonymous by guarantee. Facility proximity is context, not source attribution.</p>
        {report.isExample ? <p className="case-report-print-note"><strong>FICTIONAL EXAMPLE — NOT FIELD DATA. Do not submit as a real complaint.</strong></p> : null}</footer>
    </article>
  </main>;
}

export default CommunityCaseReport;
