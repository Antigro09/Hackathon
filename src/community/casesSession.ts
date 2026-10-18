import { CASE_UUID } from './casesTypes';
import type { NeighborhoodCaseCreateResult, NeighborhoodCaseDraft } from './casesTypes';

export const CASES_SESSION_KEY = 'tonalwatch.cases.tab.v1';
export interface CaseRemovalAccess { case: { id: string; title: string }; deleteToken: string }
export interface CaseContribution {
  caseId: string;
  observationId: string | null;
  resultId: string | null;
  publicationKey: string | null;
  attached: boolean;
}
export interface CasesSession {
  version: 1;
  removal: CaseRemovalAccess[];
  pending: { draft: NeighborhoodCaseDraft; key: string } | null;
  contribution: CaseContribution | null;
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const fields = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown, max: number, min = 0): v is string => typeof v === 'string' && v.length >= min && v.length <= max && v.trim() === v && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && CASE_UUID.test(v);
const token = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
const coordinates = (v: unknown): boolean => fields(v, ['latitude', 'longitude'])
  && typeof v.latitude === 'number' && typeof v.longitude === 'number' && Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
  && Math.abs(v.latitude) <= 85 && Math.abs(v.longitude) <= 180
  && v.latitude === Math.round(v.latitude * 1000) / 1000 && v.longitude === Math.round(v.longitude * 1000) / 1000;

export function validPendingCaseDraft(v: unknown): v is NeighborhoodCaseDraft {
  return fields(v, ['schemaVersion', 'title', 'neighborhood', 'description', 'coordinates', 'radiusKm', 'consent', 'website'])
    && v.schemaVersion === 1 && text(v.title, 80, 1) && text(v.neighborhood, 100, 1) && text(v.description, 500)
    && coordinates(v.coordinates) && typeof v.radiusKm === 'number' && Number.isFinite(v.radiusKm) && v.radiusKm >= 1 && v.radiusKm <= 25
    && v.consent === true && v.website === '';
}
export function validCasesSession(v: unknown): v is CasesSession {
  if (!fields(v, ['version', 'removal', 'pending', 'contribution']) || v.version !== 1 || !Array.isArray(v.removal) || v.removal.length > 20) return false;
  if (!v.removal.every(r => fields(r, ['case', 'deleteToken']) && fields(r.case, ['id', 'title']) && uuid(r.case.id) && text(r.case.title, 80, 1) && token(r.deleteToken))) return false;
  if (new Set(v.removal.map(r => r.case.id)).size !== v.removal.length) return false;
  if (v.pending !== null && !(fields(v.pending, ['draft', 'key']) && validPendingCaseDraft(v.pending.draft) && uuid(v.pending.key))) return false;
  const c = v.contribution;
  return c === null || fields(c, ['caseId', 'observationId', 'resultId', 'publicationKey', 'attached']) && uuid(c.caseId)
    && (c.observationId === null || uuid(c.observationId)) && (c.resultId === null || text(c.resultId, 120, 1))
    && (c.observationId === null ? uuid(c.publicationKey) : c.publicationKey === null)
    && typeof c.attached === 'boolean' && (!c.attached || c.observationId !== null);
}
export const emptyCasesSession = (): CasesSession => ({ version: 1, removal: [], pending: null, contribution: null });
export function readCasesSession(storage: Pick<Storage, 'getItem'> | null): CasesSession {
  try { const raw = storage?.getItem(CASES_SESSION_KEY); if (!raw || raw.length > 32768) return emptyCasesSession();
    const value: unknown = JSON.parse(raw); return validCasesSession(value) ? value : emptyCasesSession();
  } catch { return emptyCasesSession(); }
}
export function writeCasesSession(storage: Pick<Storage, 'setItem'> | null, value: CasesSession): boolean {
  try { if (!storage || !validCasesSession(value)) return false; const raw = JSON.stringify(value); if (raw.length > 32768) return false;
    storage.setItem(CASES_SESSION_KEY, raw); return true;
  } catch { return false; }
}
export const caseRemovalAccess = (value: NeighborhoodCaseCreateResult): CaseRemovalAccess => ({ case: { id: value.case.id, title: value.case.title }, deleteToken: value.deleteToken });
