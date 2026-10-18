import { useId, useState } from 'react';
import { sources } from '../data/references';
import { CASE_UUID, caseHref } from '../community/casesTypes';
import '../noise-solutions.css';

const contacts = [
  { county: 'Loudoun County, Virginia', sourceId: 'loudoun-routing' },
  { county: 'Prince William County, Virginia', sourceId: 'pwc-guidance' },
].flatMap(({ county, sourceId }) => {
  const source = sources.find(item => item.id === sourceId);
  return source ? [{ county, title: source.title, url: source.url }] : [];
});

const PLAN_KEY = 'tonalwatch.noise-plans.v1';
const steps = ['Document baseline conditions', 'Review and share the community brief', 'Request an assessment and mitigation plan', 'Verify the result after changes'];
type Tasks = [boolean, boolean, boolean, boolean];
type SavedPlan = { id: string; tasks: Tasks };
const emptyTasks = (): Tasks => [false, false, false, false];
function readPlans(): SavedPlan[] {
  try {
    const raw = window.localStorage.getItem(PLAN_KEY); if (!raw || raw.length > 16384) return [];
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'plans,version') return [];
    const data = value as { version?: unknown; plans?: unknown };
    if (data.version !== 1 || !Array.isArray(data.plans) || data.plans.length > 20) return [];
    const plans = data.plans as SavedPlan[];
    if (!plans.every(p => p && typeof p === 'object' && Object.keys(p).sort().join(',') === 'id,tasks' && typeof p.id === 'string' && CASE_UUID.test(p.id) && Array.isArray(p.tasks) && p.tasks.length === 4 && p.tasks.every(t => typeof t === 'boolean')) || new Set(plans.map(p => p.id)).size !== plans.length) return [];
    return plans;
  } catch { return []; }
}

/** Resident-owned progress and an explicit request draft; nothing is sent to an operator. */
export function NoiseSolutions({ compact = false, caseId, caseTitle, includeReport = false }: { compact?: boolean; caseId?: string; caseTitle?: string; includeReport?: boolean }) {
  const titleId = useId();
  const validId = caseId && CASE_UUID.test(caseId) ? caseId : null;
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<Tasks>(() => readPlans().find(p => p.id === validId)?.tasks ?? emptyTasks());
  const [feedback, setFeedback] = useState('');
  const [saveStatus, setSaveStatus] = useState(() => validId && readPlans().some(p => p.id === validId) ? 'Saved on this device' : '');
  const publicUrl = validId ? `${typeof window === 'undefined' || !window.location ? 'https://tonalwatch.vercel.app/' : `${window.location.origin}${window.location.pathname}`}${caseHref(validId)}` : null;
  const requestText = `Subject: Request for neighborhood noise assessment and improvement plan\n\nHello,\n\nWe are documenting a recurring neighborhood sound${caseTitle?.trim() ? ` in the case “${caseTitle.trim().slice(0, 80)}”` : ''}.${publicUrl ? `\nPublic case: ${publicUrl}${includeReport ? `\nCommunity brief: ${publicUrl}/report` : ''}` : ''}\n\nThese observations are self-reported, approximate and uncalibrated. They do not establish a particular source or a violation. We would appreciate a professional investigation and a practical response:\n\n1. Identify the appropriate site contact and propose a response timeline.\n2. Assess equipment and background sound contributions, including cooling fans, vibration and sound transmission paths, using suitable calibrated measurements.\n3. Review maintenance, quieter fans or cooling equipment, operating adjustments, and appropriate barriers, enclosures or vibration isolation while preserving cooling airflow.\n4. Share an assessment and proposed mitigation schedule, then verify any improvement with comparable before-and-after measurements and follow-up resident observations.\n\nPlease let us know what additional recording context would help and when we can expect the next update.\n\nThank you.`;
  const updateTask = (index: number, checked: boolean) => {
    const next: Tasks = [...tasks]; next[index] = checked; setTasks(next);
    if (!validId) { setSaveStatus('Progress stays on this page. Open a case to save its checklist on this device.'); return; }
    try { const plans = readPlans().filter(p => p.id !== validId).slice(-19); plans.push({ id: validId, tasks: next });
      window.localStorage.setItem(PLAN_KEY, JSON.stringify({ version: 1, plans })); setSaveStatus('Saved on this device');
    } catch { setSaveStatus('Device storage is unavailable. Keep this page open to retain this checklist.'); }
  };
  const copyRequest = async () => { try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(requestText); setFeedback('Request copied. Review it and choose the appropriate recipient before sending.'); }
    catch { setFeedback('Clipboard unavailable. Select the request text below or download it.'); } };
  const downloadRequest = () => {
    const url = URL.createObjectURL(new Blob([requestText], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tonalwatch-noise-assessment-request.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback('Request downloaded. Review it and choose the appropriate recipient before sending.');
  };
  return <section className={`noise-solutions${compact ? ' noise-solutions-compact' : ''}`} aria-labelledby={titleId}>
    <div className="noise-solutions-heading"><p className="eyebrow">From observations to action</p><h2 id={titleId}>What can reduce the noise?</h2>
      <p>Use the community brief to ask for a site assessment and a practical improvement plan.</p></div>
    <div className="noise-action-workflow"><button className="button primary" type="button" aria-expanded={expanded} aria-controls={`${titleId}-plan`} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide noise reduction plan' : 'Start a noise reduction plan'}</button>
      {expanded ? <div id={`${titleId}-plan`} className="noise-action-plan"><h3>Your next steps</h3><p>Track your own follow-up. These checkmarks are local to this device and are not shared case tasks or verified progress.</p><ol className="noise-action-checklist">{steps.map((step, index) => <li key={step}><label><input type="checkbox" checked={tasks[index]} onChange={event => updateTask(index, event.target.checked)} /><span>{step}</span></label><p>{[
        'Record where and when you heard the sound, weather and competing sounds. Keep separate observations under comparable conditions.',
        'Review public details and limitations before sharing the brief with neighbors or the appropriate contact.',
        'Use the request below to ask about source assessment, practical fixes, the responsible contact and a response timeline.',
        'After any change, compare qualified measurements and new resident observations. Keep unresolved results visible.',
      ][index]}</p>{index === 1 && validId && includeReport ? <a href={`${caseHref(validId)}/report`}>Open community report →</a> : null}</li>)}</ol>
      <p className="noise-action-save" role="status">{saveStatus || (validId ? 'Check a step to save progress on this device.' : 'Open a neighborhood case to save its checklist on this device.')}</p>
      <div className="noise-request"><h3>Ask for an investigation and a response</h3><p>Review this draft and send it yourself to the appropriate operator or official contact. TonalWatch does not contact anyone.</p><label htmlFor={`${titleId}-request`}>Noise assessment request</label><textarea id={`${titleId}-request`} readOnly rows={12} value={requestText} /><div className="noise-request-actions"><button className="button secondary" type="button" onClick={() => { void copyRequest(); }}>Copy request</button><button className="button secondary" type="button" onClick={downloadRequest}>Download request</button></div>{feedback ? <p role="status">{feedback}</p> : null}</div>
      </div> : null}</div>
    <ol className="noise-solutions-cards">
      <li><span className="noise-solution-number" aria-hidden="true">01</span><h3>Reduce it at the source</h3><p>Ask the operator about equipment maintenance, quieter fans and cooling equipment, and operating changes that reduce noise while meeting cooling needs.</p></li>
      <li><span className="noise-solution-number" aria-hidden="true">02</span><h3>Block the transmission path</h3><p>Ask a noise-control professional whether barriers, acoustic enclosures or vibration isolation fit the problem. Designs must preserve cooling airflow; a simple wall may do little for low-frequency sound.</p></li>
      <li><span className="noise-solution-number" aria-hidden="true">03</span><h3>Verify the improvement</h3><p>Have a qualified acoustician identify the source contribution and compare calibrated measurements before and after changes. Add repeat resident observations under comparable conditions to document what people still hear.</p></li>
    </ol>
    <div className="noise-solutions-residents"><h3>A next step for residents</h3><p>{validId && includeReport ? <>Review the <a href={`${caseHref(validId)}/report`}>community case brief</a></> : <>Review the public observations and their context</>}, then choose the official contact for the location. No county was inferred from the case area. TonalWatch does not submit this report or contact anyone.</p>
      <ul>{contacts.map(contact => <li key={contact.county}><a href={contact.url} target="_blank" rel="noreferrer">{contact.county}: {contact.title}</a><span className="noise-solution-contact-url">{contact.url}</span></li>)}</ul>
      <p className="noise-solutions-limits">The right fix depends on the site and the sound source. A phone recording cannot guarantee a solution.</p></div>
    <p className="noise-solutions-sources">Read the basis: <a href="https://www.cdc.gov/niosh/noise/prevent/engineering.html" target="_blank" rel="noreferrer">NIOSH general engineering controls</a> · <a href="https://invc.com/resources/noise-control-case-studies/environmental-noise-control/data-centre-server-farm-chiller-fan-noise-reduction/" target="_blank" rel="noreferrer">INVC data-center cooling case study</a> (provider-reported example).</p>
  </section>;
}

export default NoiseSolutions;
