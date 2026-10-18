import type { CommunityCoordinates, CommunityObservationDraft, CommunityPublishResult } from '../community/types';

export const COMMUNITY_SESSION_KEY = 'tonalwatch.community.tab.v1';
export interface RemovalAccess { observation: { id: string; label: string; coordinates: CommunityCoordinates }; deleteToken: string }
export interface CommunityMapSession { version: 1; removal: RemovalAccess[]; pending: { draft: CommunityObservationDraft; key: string } | null }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const codes = new Set(['near-zero', 'clipped', 'near-full-scale', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power', 'processing-active', 'processing-unknown', 'imported-processing-unknown']);
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fields = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown, max: number, min = 0): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const coordinates = (v: unknown): v is CommunityCoordinates => fields(v, ['latitude', 'longitude']) && typeof v.latitude === 'number' && typeof v.longitude === 'number' && Number.isFinite(v.latitude) && Number.isFinite(v.longitude) && Math.abs(v.latitude) <= 85 && Math.abs(v.longitude) <= 180 && v.latitude === Math.round(v.latitude * 1000) / 1000 && v.longitude === Math.round(v.longitude * 1000) / 1000;

function validDraft(v: unknown): v is CommunityObservationDraft {
  if (!fields(v, ['schemaVersion', 'consent', 'inputKind', 'coordinates', 'label', 'note', 'capturedAtUtc', 'durationSeconds', 'sampleRateHz', 'sampleCount', 'frameCount', 'algorithmVersion', 'qualityCodes', 'aDigitalDb', 'cDigitalDb', 'cMinusADb', 'peakScreen', 'nearbyFacility', 'website'])) return false;
  const facility = v.nearbyFacility;
  const frameCount = typeof v.sampleCount === 'number' ? Math.floor((v.sampleCount - 8192) / 4096) + 1 : -1;
  return v.schemaVersion === 1 && v.consent === true && v.inputKind === 'microphone' && coordinates(v.coordinates)
    && text(v.label, 80, 1) && text(v.note, 280) && text(v.capturedAtUtc, 40) && /^\d{4}-\d\d-\d\dT.+Z$/.test(v.capturedAtUtc) && Number.isFinite(Date.parse(v.capturedAtUtc))
    && typeof v.durationSeconds === 'number' && [5, 15, 30].includes(v.durationSeconds) && typeof v.sampleRateHz === 'number' && [44100, 48000].includes(v.sampleRateHz) && v.sampleCount === v.sampleRateHz * v.durationSeconds
    && (v.frameCount === 0 || v.frameCount === frameCount) && v.algorithmVersion === 'tw-screen-v2' && Array.isArray(v.qualityCodes) && v.qualityCodes.length <= 10 && v.qualityCodes.every(c => typeof c === 'string' && codes.has(c))
    && [v.aDigitalDb, v.cDigitalDb, v.cMinusADb].every(n => n === null || typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000)
    && ['suggested', 'not-indicated', 'inconclusive', 'not-evaluated'].includes(String(v.peakScreen)) && v.website === ''
    && (facility === null || fields(facility, ['osmType', 'osmId', 'name']) && ['node', 'way', 'relation'].includes(String(facility.osmType)) && text(facility.osmId, 20, 1) && /^[1-9]\d*$/.test(facility.osmId) && text(facility.name, 120, 1));
}
export function validCommunitySession(v: unknown): v is CommunityMapSession {
  return fields(v, ['version', 'removal', 'pending']) && v.version === 1 && Array.isArray(v.removal) && v.removal.length <= 20
    && v.removal.every(r => fields(r, ['observation', 'deleteToken']) && fields(r.observation, ['id', 'label', 'coordinates']) && text(r.observation.id, 36) && UUID.test(r.observation.id) && text(r.observation.label, 80, 1) && coordinates(r.observation.coordinates) && typeof r.deleteToken === 'string' && TOKEN.test(r.deleteToken))
    && new Set(v.removal.map(r => r.observation.id)).size === v.removal.length
    && (v.pending === null || fields(v.pending, ['draft', 'key']) && validDraft(v.pending.draft) && typeof v.pending.key === 'string' && UUID.test(v.pending.key));
}
export function emptyCommunitySession(): CommunityMapSession { return { version: 1, removal: [], pending: null }; }
export function communityTabStorage(): Storage | null { try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; } }
export function readCommunitySession(storage: Pick<Storage, 'getItem'> | null): CommunityMapSession {
  try { const raw = storage?.getItem(COMMUNITY_SESSION_KEY); if (!raw || raw.length > 65536) return emptyCommunitySession(); const value: unknown = JSON.parse(raw); return validCommunitySession(value) ? value : emptyCommunitySession(); } catch { return emptyCommunitySession(); }
}
export function writeCommunitySession(storage: Pick<Storage, 'setItem'> | null, value: CommunityMapSession): boolean {
  try { if (!storage || !validCommunitySession(value)) return false; const raw = JSON.stringify(value); if (raw.length > 65536) return false; storage.setItem(COMMUNITY_SESSION_KEY, raw); return true; } catch { return false; }
}
export function removalAccess(result: CommunityPublishResult): RemovalAccess {
  return { observation: { id: result.observation.id, label: result.observation.label, coordinates: { ...result.observation.coordinates } }, deleteToken: result.deleteToken };
}
