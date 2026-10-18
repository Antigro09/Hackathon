import { useId } from 'react';
import { sources } from '../data/references';
import '../noise-solutions.css';

const contacts = [
  { county: 'Loudoun County, Virginia', sourceId: 'loudoun-routing' },
  { county: 'Prince William County, Virginia', sourceId: 'pwc-guidance' },
].flatMap(({ county, sourceId }) => {
  const source = sources.find(item => item.id === sourceId);
  return source ? [{ county, title: source.title, url: source.url }] : [];
});

/** Practical discussion prompts, not a site-specific engineering design or an automated complaint. */
export function NoiseSolutions({ compact = false }: { compact?: boolean }) {
  const titleId = useId();
  return <section className={`noise-solutions${compact ? ' noise-solutions-compact' : ''}`} aria-labelledby={titleId}>
    <div className="noise-solutions-heading"><p className="eyebrow">From observations to action</p><h2 id={titleId}>What can reduce the noise?</h2>
      <p>Use the community brief to ask for a site assessment and a practical improvement plan.</p></div>
    <ol className="noise-solutions-cards">
      <li><span className="noise-solution-number" aria-hidden="true">01</span><h3>Reduce it at the source</h3><p>Ask the operator about equipment maintenance, quieter fans and cooling equipment, and operating changes that reduce noise while meeting cooling needs.</p></li>
      <li><span className="noise-solution-number" aria-hidden="true">02</span><h3>Block the transmission path</h3><p>Ask a noise-control professional whether barriers, acoustic enclosures or vibration isolation fit the problem. Designs must preserve cooling airflow; a simple wall may do little for low-frequency sound.</p></li>
      <li><span className="noise-solution-number" aria-hidden="true">03</span><h3>Verify the improvement</h3><p>Have a qualified acoustician identify the source contribution and compare calibrated measurements before and after changes. Add repeat resident observations under comparable conditions to document what people still hear.</p></li>
    </ol>
    <div className="noise-solutions-residents"><h3>A next step for residents</h3><p>Review the <a href="#/cases">community case brief</a>, then choose the official contact for the location. No county was inferred from the case area. TonalWatch does not submit this report or contact anyone.</p>
      <ul>{contacts.map(contact => <li key={contact.county}><a href={contact.url} target="_blank" rel="noreferrer">{contact.county}: {contact.title}</a><span className="noise-solution-contact-url">{contact.url}</span></li>)}</ul>
      <p className="noise-solutions-limits">The right fix depends on the site and the sound source. A phone recording cannot guarantee a solution.</p></div>
    <p className="noise-solutions-sources">Read the basis: <a href="https://www.cdc.gov/niosh/noise/prevent/engineering.html" target="_blank" rel="noreferrer">NIOSH general engineering controls</a> · <a href="https://invc.com/resources/noise-control-case-studies/environmental-noise-control/data-centre-server-farm-chiller-fan-noise-reduction/" target="_blank" rel="noreferrer">INVC data-center cooling case study</a> (provider-reported example).</p>
  </section>;
}

export default NoiseSolutions;
