import { request } from './casesClient';
import { CASE_UUID } from './casesTypes';
import { CASE_ACTION_STATUSES } from './caseWorkflowTypes';
import type { CaseActionDraft, CaseActionEntry, CaseActionResponse, CaseActionUpdate, CaseActionWorkflow } from './caseWorkflowTypes';

const fields = (v: unknown, names: string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === names.length && names.every(name => Object.hasOwn(v, name));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && v.trim() === v && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(v);
const date = (v: unknown) => v === null || typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const id = (v: unknown) => v === null || typeof v === 'string' && CASE_UUID.test(v);
const draftFields = ['status','actionDescription','responsibleContact','responseSummary','targetDate','implementedDate','baselineObservationId','recheckObservationId','outcomeNotes'];
export function isCaseActionEntry(v: unknown): v is CaseActionEntry {
  return fields(v, [...draftFields, 'revision','updatedAtUtc','provenance']) && CASE_ACTION_STATUSES.includes(v.status as never)
    && text(v.actionDescription, 500) && text(v.responsibleContact, 120) && text(v.responseSummary, 500) && text(v.outcomeNotes, 500)
    && date(v.targetDate) && date(v.implementedDate) && id(v.baselineObservationId) && id(v.recheckObservationId)
    && (v.baselineObservationId === null || v.baselineObservationId !== v.recheckObservationId)
    && Number.isSafeInteger(v.revision) && Number(v.revision) >= 1 && Number(v.revision) <= 1_000_000
    && typeof v.updatedAtUtc === 'string' && Number.isFinite(Date.parse(v.updatedAtUtc)) && new Date(v.updatedAtUtc).toISOString() === v.updatedAtUtc
    && v.provenance === 'organizer-self-reported';
}
export function isCaseActionWorkflow(v: unknown): v is CaseActionWorkflow {
  if (!fields(v, ['schemaVersion','caseId','revision','current','history']) || v.schemaVersion !== 1 || typeof v.caseId !== 'string' || !CASE_UUID.test(v.caseId)
    || !isCaseActionEntry(v.current) || v.current.revision !== v.revision || !Array.isArray(v.history) || v.history.length < 1 || v.history.length > 20 || !v.history.every(isCaseActionEntry)) return false;
  const history = v.history, current = v.current;
  return history.every((entry, index) => entry.revision === Number(v.revision) - history.length + index + 1)
    && draftFields.concat(['revision','updatedAtUtc','provenance']).every(field => history.at(-1)![field as keyof CaseActionEntry] === current[field as keyof CaseActionEntry]);
}
const responseFor = (caseId: string) => (v: unknown): v is CaseActionResponse => fields(v, ['workflow'])
  && (v.workflow === null || isCaseActionWorkflow(v.workflow) && v.workflow.caseId.toLowerCase() === caseId.toLowerCase());
export const getCaseActionWorkflow = (caseId: string, signal?: AbortSignal): Promise<CaseActionResponse> => request(
  `/api/cases?id=${encodeURIComponent(caseId)}&workflow=1`, { method: 'GET' }, responseFor(caseId), signal);
export function updateCaseActionWorkflow(caseId: string, deleteToken: string, draft: CaseActionDraft, expectedRevision: number, requestId: string, signal?: AbortSignal): Promise<CaseActionResponse> {
  const publicDraft: CaseActionDraft = { status: draft.status, actionDescription: draft.actionDescription.trim(), responsibleContact: draft.responsibleContact.trim(),
    responseSummary: draft.responseSummary.trim(), targetDate: draft.targetDate, implementedDate: draft.implementedDate,
    baselineObservationId: draft.baselineObservationId, recheckObservationId: draft.recheckObservationId, outcomeNotes: draft.outcomeNotes.trim() };
  const body: CaseActionUpdate = { action: 'workflow', caseId, deleteToken, expectedRevision, requestId, draft: publicDraft, consent: true, website: '' };
  return request('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    (v: unknown): v is CaseActionResponse => responseFor(caseId)(v) && v.workflow !== null, signal);
}
