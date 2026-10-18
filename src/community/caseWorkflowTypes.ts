export const CASE_ACTION_STATUSES = ['documenting', 'requested', 'planned', 'implemented', 'rechecking', 'improved', 'continues', 'assessment-needed'] as const;
export type CaseActionStatus = typeof CASE_ACTION_STATUSES[number];
export const CASE_ACTION_LABELS: Record<CaseActionStatus, string> = {
  documenting: 'Documenting the baseline', requested: 'Assessment requested', planned: 'Improvement planned',
  implemented: 'Change reported complete', rechecking: 'Rechecking after the change', improved: 'Improvement reported',
  continues: 'Problem continues', 'assessment-needed': 'Professional assessment needed',
};
export interface CaseActionDraft {
  status: CaseActionStatus;
  actionDescription: string;
  responsibleContact: string;
  responseSummary: string;
  targetDate: string | null;
  implementedDate: string | null;
  baselineObservationId: string | null;
  recheckObservationId: string | null;
  outcomeNotes: string;
}
export interface CaseActionEntry extends CaseActionDraft {
  revision: number;
  updatedAtUtc: string;
  provenance: 'organizer-self-reported';
}
export interface CaseActionWorkflow {
  schemaVersion: 1;
  caseId: string;
  revision: number;
  current: CaseActionEntry;
  history: CaseActionEntry[];
}
export interface CaseActionResponse { workflow: CaseActionWorkflow | null }
export interface CaseActionUpdate {
  action: 'workflow'; caseId: string; deleteToken: string; expectedRevision: number;
  requestId: string; draft: CaseActionDraft; consent: true; website: '';
}
export const EMPTY_CASE_ACTION: CaseActionDraft = {
  status: 'documenting', actionDescription: '', responsibleContact: '', responseSummary: '', targetDate: null,
  implementedDate: null, baselineObservationId: null, recheckObservationId: null, outcomeNotes: '',
};
