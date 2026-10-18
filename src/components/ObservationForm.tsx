import type { ObservationContext } from '../types';

export function ObservationForm({ context, onChange }: { context: ObservationContext; onChange: (value: ObservationContext) => void }) {
  const update = (field: keyof ObservationContext, value: string) => onChange({ ...context, [field]: value });
  return <section className="panel context-panel" aria-labelledby="context-title">
    <div className="section-heading"><div><p className="eyebrow">02 / Add the context</p><h2 id="context-title">What did you notice?</h2></div><span className="quiet-label">All fields optional</span></div>
    <p className="muted">Your experience matters, even when a short recording is inconclusive. Include only details you’re comfortable sharing.</p>
    <div className="form-grid">
      <label>Jurisdiction<select value={context.jurisdiction} onChange={e => update('jurisdiction', e.target.value)}><option value="unknown-other">Unknown / other jurisdiction</option><option value="loudoun">Loudoun County, VA</option><option value="prince-william">Prince William County, VA</option></select><small>Selects informational references; applicability requires agency review.</small></label>
      <label>Where were you listening?<select value={context.environment} onChange={e => update('environment', e.target.value)}><option value="unknown">Unknown / not specified</option><option value="indoors">Indoors</option><option value="outdoors">Outdoors</option></select></label>
      <label className="full-width">Location description<input maxLength={300} value={context.locationDescription} onChange={e => update('locationDescription', e.target.value)} placeholder="e.g. Back patio, approximate neighborhood"/><small>Manual description only. No GPS is collected.</small></label>
      <label>When does it recur?<textarea maxLength={3000} value={context.recurrenceNotes} onChange={e => update('recurrenceNotes', e.target.value)} placeholder="Times, duration, how often, and what you heard…" rows={3}/></label>
      <label>Recording conditions<textarea maxLength={3000} value={context.conditionsNotes} onChange={e => update('conditionsNotes', e.target.value)} placeholder="Wind, traffic, conversations, windows, device handling…" rows={3}/></label>
      <label className="full-width">Suspected source · optional, unverified<input maxLength={600} value={context.suspectedSourceNotes} onChange={e => update('suspectedSourceNotes', e.target.value)} placeholder="Your own observation; the analysis cannot identify a source"/></label>
    </div>
  </section>;
}
