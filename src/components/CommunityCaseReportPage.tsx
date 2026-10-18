import { useEffect, useState } from 'react';
import { getNeighborhoodCase } from '../community/casesClient';
import { caseHref } from '../community/casesTypes';
import type { NeighborhoodCaseDetail } from '../community/casesTypes';
import { CommunityCaseReport } from './CommunityCaseReport';

export default function CommunityCaseReportPage({ caseId }: { caseId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ id: string; detail: NeighborhoodCaseDetail | null; error: string }>({ id: caseId, detail: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ id: caseId, detail: null, error: '' });
    void getNeighborhoodCase(caseId, controller.signal).then(detail => {
      if (!controller.signal.aborted) setState({ id: caseId, detail, error: '' });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ id: caseId, detail: null, error: error instanceof Error ? error.message : 'The community report could not load.' });
    });
    return () => controller.abort();
  }, [caseId, attempt]);
  if (state.id === caseId && state.detail) return <CommunityCaseReport key={caseId} detail={state.detail} caseUrl={new URL(caseHref(caseId), window.location.href).href}/>;
  return <main id="main-content" className="page-shell"><section className="panel">
    <h1>Community case report</h1>
    {state.id === caseId && state.error ? <><p role="alert">{state.error}</p><button className="button secondary" type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></> : <p role="status">Loading the current public observations…</p>}
    <p><a href={caseHref(caseId)}>Return to this case</a></p>
  </section></main>;
}
