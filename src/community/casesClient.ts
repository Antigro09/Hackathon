import { CommunityRequestError, isCommunityObservation } from './client';
import { CASE_UUID } from './casesTypes';
import type { NeighborhoodCase, NeighborhoodCaseAttachment, NeighborhoodCaseCreateResult, NeighborhoodCaseDetail, NeighborhoodCaseDraft, NeighborhoodCaseFeed, NeighborhoodCaseFeedQuery } from './casesTypes';

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const fields = (v: unknown, names: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === names.length && names.every(name => Object.hasOwn(v, name));
const text = (v: unknown, max: number, min = 0): v is string => typeof v === 'string' && v.length >= min && v.length <= max && v.trim() === v && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(v);
const utc = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

export function isNeighborhoodCase(v: unknown): v is NeighborhoodCase {
  if (!fields(v, ['schemaVersion', 'id', 'title', 'neighborhood', 'description', 'coordinates', 'radiusKm', 'createdAtUtc', 'provenance', 'verification', 'locationPrecision'])) return false;
  const p = v.coordinates;
  return v.schemaVersion === 1 && typeof v.id === 'string' && CASE_UUID.test(v.id)
    && text(v.title, 80, 1) && text(v.neighborhood, 100, 1) && text(v.description, 500)
    && fields(p, ['latitude', 'longitude']) && typeof p.latitude === 'number' && typeof p.longitude === 'number'
    && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 85 && Math.abs(p.longitude) <= 180
    && Math.abs(p.latitude * 1000 - Math.round(p.latitude * 1000)) < 1e-8 && Math.abs(p.longitude * 1000 - Math.round(p.longitude * 1000)) < 1e-8
    && typeof v.radiusKm === 'number' && Number.isFinite(v.radiusKm) && v.radiusKm >= 1 && v.radiusKm <= 25
    && utc(v.createdAtUtc) && v.provenance === 'public-self-reported' && v.verification === 'unverified' && v.locationPrecision === 'rounded-3-decimals';
}

const validFeed = (v: unknown): v is NeighborhoodCaseFeed => fields(v, ['cases', 'nextCursor', 'limit', 'scanned', 'notice'])
  && Number.isSafeInteger(v.limit) && Number(v.limit) >= 1 && Number(v.limit) <= 200
  && Number.isSafeInteger(v.scanned) && Number(v.scanned) >= 0 && Number(v.scanned) <= 500
  && Array.isArray(v.cases) && v.cases.length <= Number(v.limit) && v.cases.every(isNeighborhoodCase)
  && new Set(v.cases.map(c => c.id)).size === v.cases.length
  && (v.nextCursor === null || typeof v.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(v.nextCursor)) && text(v.notice, 1000);
export const isNeighborhoodCaseDetail = (v: unknown): v is NeighborhoodCaseDetail => fields(v, ['case', 'observations', 'limit', 'notice'])
  && isNeighborhoodCase(v.case) && v.limit === 200 && Array.isArray(v.observations) && v.observations.length <= 200
  && v.observations.every(isCommunityObservation) && new Set(v.observations.map(o => o.id)).size === v.observations.length && text(v.notice, 1000);
const validCreate = (v: unknown): v is NeighborhoodCaseCreateResult => fields(v, ['case', 'deleteToken', 'replayed'])
  && isNeighborhoodCase(v.case) && typeof v.deleteToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v.deleteToken) && typeof v.replayed === 'boolean';

async function request<T>(url: string, init: RequestInit, validate: (v: unknown) => v is T, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { ...init, signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
  const reader = response.body?.getReader(); let value: unknown = null;
  if (reader) {
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length;
        if (size > 1_048_576) throw new CommunityRequestError('invalid-response', 'The cases service returned too much data.', response.status); chunks.push(chunk.value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { value = null; }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  }
  if (!response.ok) { const error = object(value) && object(value.error) ? value.error : null;
    throw new CommunityRequestError(typeof error?.code === 'string' ? error.code : 'unavailable', typeof error?.message === 'string' ? error.message : 'Neighborhood cases are temporarily unavailable. Try again.', response.status); }
  if (!validate(value)) throw new CommunityRequestError('invalid-response', 'The case response could not be verified. Refresh and try again.', response.status);
  return value;
}

export function listNeighborhoodCases(query: NeighborhoodCaseFeedQuery, signal?: AbortSignal): Promise<NeighborhoodCaseFeed> {
  const p = new URLSearchParams();
  if (query.center) { p.set('lat', String(query.center.latitude)); p.set('lon', String(query.center.longitude)); p.set('radiusKm', String(query.radiusKm ?? 10)); }
  if (query.bbox) p.set('bbox', [query.bbox.west, query.bbox.south, query.bbox.east, query.bbox.north].join(','));
  if (query.limit !== undefined) p.set('limit', String(query.limit)); if (query.cursor) p.set('cursor', query.cursor);
  return request(`/api/cases?${p}`, { method: 'GET' }, validFeed, signal);
}
export const getNeighborhoodCase = (id: string, signal?: AbortSignal): Promise<NeighborhoodCaseDetail> => request(`/api/cases?id=${encodeURIComponent(id)}`, { method: 'GET' },
  (v: unknown): v is NeighborhoodCaseDetail => isNeighborhoodCaseDetail(v) && v.case.id.toLowerCase() === id.toLowerCase(), signal);
export function createNeighborhoodCase(draft: NeighborhoodCaseDraft, key: string, signal?: AbortSignal): Promise<NeighborhoodCaseCreateResult> {
  // Project only deliberately shared fields and round before transport, even
  // if a future caller accidentally includes private context on its object.
  const publicDraft: NeighborhoodCaseDraft = { schemaVersion: draft.schemaVersion, title: draft.title, neighborhood: draft.neighborhood,
    description: draft.description, coordinates: { latitude: Math.round(draft.coordinates.latitude * 1000) / 1000,
      longitude: Math.round(draft.coordinates.longitude * 1000) / 1000 }, radiusKm: draft.radiusKm, consent: draft.consent, website: draft.website };
  return request('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ action: 'create', draft: publicDraft }),
  }, validCreate, signal);
}
export const attachCaseObservation = (caseId: string, observationId: string, deleteToken: string, signal?: AbortSignal): Promise<{ attached: true }> => {
  const body: NeighborhoodCaseAttachment = { action: 'attach', caseId, observationId, deleteToken, consent: true, website: '' };
  return request('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, (v: unknown): v is { attached: true } => fields(v, ['attached']) && v.attached === true, signal);
};
export const deleteNeighborhoodCase = (id: string, deleteToken: string, signal?: AbortSignal): Promise<{ deleted: true }> => request('/api/cases', {
  method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, deleteToken }),
}, (v: unknown): v is { deleted: true } => fields(v, ['deleted']) && v.deleted === true, signal);
