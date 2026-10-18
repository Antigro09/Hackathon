import { useId } from 'react';
import '../decibel-guide.css';

/** Plain-language units guide; illustrative values never enter the analysis or reports. */
export function DecibelGuide({ compact = false }: { compact?: boolean }) {
  const titleId = useId();
  const content = <div className="decibel-guide-content">
    <p><strong>dB is a logarithmic comparison, not a linear score.</strong> A 10 dB increase means ten times the power for the same reference and weighting. It does not mean ten times the perceived loudness.</p>
    <dl className="decibel-guide-weightings"><div><dt>A-weighting</dt><dd>Reduces low-frequency contributions strongly. It roughly follows human hearing sensitivity; it does not make bass disappear.</dd></div>
      <div><dt>C-weighting</dt><dd>A flatter weighting that retains more bass. It measures the same recording through a different frequency filter.</dd></div></dl>
    <table className="decibel-guide-table"><caption>Same letters, different references</caption><thead><tr><th scope="col">Label</th><th scope="col">What it means</th></tr></thead><tbody>
      <tr><th scope="row">TonalWatch A relative / C relative</th><td>A/C-weighted digital levels, referenced to digital RMS 1. They are uncalibrated and are not certified sound-pressure measurements.</td></tr>
      <tr><th scope="row">Calibrated dBA / dBC</th><td>A/C-weighted sound-pressure levels tied to a physical pressure reference through a calibrated measurement system.</td></tr>
    </tbody></table>
    <div className="decibel-guide-example"><strong>Illustration only — not a real measurement</strong><p>A relative = −40 dB, C relative = −20 dB.<br/>C−A = −20 − (−40) = <strong>20 dB</strong>.</p>
      <p>The larger C value suggests more contribution from frequencies A-weighting reduces. It does not identify a data center, isolate a source, or establish an official threshold.</p></div>
    <p><strong>Why negative values?</strong> A negative app level is below its digital reference. It does not mean negative physical noise. For example, −20 dB is one-tenth the RMS amplitude of the app’s RMS-1 reference.</p>
    <p>Do not average the displayed dB numbers as ordinary scores. Device frequency response, wind and audio processing can change the result. The app’s C−A screen is an experimental convention, not a calibrated limit.</p>
    <p className="decibel-guide-sources">Read more: <a href="https://www.osha.gov/otm/section-3-health-hazards/chapter-5" target="_blank" rel="noreferrer">OSHA: sound levels and frequency weighting</a> · <a href="https://www.cdc.gov/niosh/noise/about/app.html" target="_blank" rel="noreferrer">NIOSH: sound-level measurement and calibration</a>.</p>
  </div>;
  return compact ? <details className="decibel-guide decibel-guide-compact"><summary>What do dB, dBA and dBC mean?</summary>{content}</details>
    : <section className="decibel-guide" aria-labelledby={titleId}><p className="eyebrow">Understand the numbers</p><h2 id={titleId}>What do dB, dBA and dBC mean?</h2>{content}</section>;
}

export default DecibelGuide;
