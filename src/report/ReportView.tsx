import type { ReportModel } from './buildReport';
import { sourceStatus } from './buildReport';
import { Fragment } from 'react';
import { ReportSpectrum } from './ReportSpectrum';

export function ReportView({ report }: { report: ReportModel }) {
  return (
    <article className="observation-report report-document" aria-labelledby="report-title">
      <div className={`report-provenance ${report.isSynthetic ? 'synthetic-badge' : ''}`}>
        {report.provenanceLabel}
      </div>
      <header className="report-header">
        <p className="eyebrow">TonalWatch · observation packet</p>
        <h1 id="report-title">{report.title}</h1>
        {report.isSynthetic && <p>TonalWatch noise observation — screening only.</p>}
        <p>Uncalibrated screening only. No source identification or legal-compliance determination.</p>
      </header>
      {report.sections.map(section => (
        <Fragment key={section.title}><section className={`report-section ${section.rows.length <= 5 && section.paragraphs.join('').length + section.rows.map(item => item.value).join('').length < 1800 ? 'compact-section' : ''}`}>
          <h2>{section.title}</h2>
          {section.rows.length > 0 && (
            <dl className="report-fields">
              {section.rows.map(item => (
                <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
              ))}
            </dl>
          )}
          {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>
        {section.title === 'Captured-signal results' ? <ReportSpectrum spectrum={report.spectrum}/> : null}</Fragment>
      ))}
      <section className="report-section report-references">
        <h2>Dated official reference links</h2>
        {report.references.length === 0 && <p>No county applicability evaluated; no county profile applied.</p>}
        {report.references.map(source => (
          <div className="reference-entry" key={source.id}>
            <h3><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h3>
            <p>{source.summary}</p>
            <p className="source-status">{sourceStatus(source)}</p>
            <p>{source.scopeNote}</p>
            <p className="report-source-url">{source.url}</p>
          </div>
        ))}
      </section>
    </article>
  );
}
