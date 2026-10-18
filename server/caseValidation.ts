import { isDeepStrictEqual } from 'node:util';
import type { NeighborhoodCase, NeighborhoodCaseDraft } from '../src/community/casesTypes.js';
import type { CommunityObservation } from '../src/community/types.js';
import { CommunityError, UUID, coordinates, exactFields, isRecord, normalizeDraft, parseFeed, requireValue, sha256 } from './communityValidation.js';

const CASE_FIELDS = ['schemaVersion','title','description','neighborhood','coordinates','radiusKm','consent','website'];
const MEMBER = /^\d{13}:[0-9a-f-]{36}$/;
export const CASE_CAPABILITY = /^[A-Za-z0-9_-]{43}$/;

function text(value: unknown, maximum: number, allowEmpty = false): string {
  requireValue(typeof value === 'string', 'Case text must be plain text.');
  const clean = value.trim();
  requireValue((allowEmpty || clean.length > 0) && clean.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(clean), 'Case text is missing, too long or contains unsupported control characters.');
  return clean;
}

export function normalizeCaseDraft(value: unknown): NeighborhoodCaseDraft {
  exactFields(value, CASE_FIELDS);
  requireValue(value.schemaVersion === 1 && value.consent === true && value.website === '', 'Review and consent to the public case fields before sharing.');
  requireValue(typeof value.radiusKm === 'number' && Number.isFinite(value.radiusKm) && value.radiusKm >= 1 && value.radiusKm <= 25, 'Case radius must be between 1 and 25 km.');
  return { schemaVersion:1, title:text(value.title,80), description:text(value.description,500,true),
    neighborhood:text(value.neighborhood,100), coordinates:coordinates(value.coordinates,true), radiusKm:value.radiusKm,
    consent:true, website:'' };
}

export interface StoredCase { case: NeighborhoodCase; member: string; deleteTokenHash: string }
export interface StoredCaseObservation { observation: CommunityObservation; member: string; deleteTokenHash: string }

/** Validate persisted public fields again; never forward capabilities or raw rows. */
export function storedCase(raw: unknown, now: number): StoredCase {
  try {
    requireValue(typeof raw === 'string' && Buffer.byteLength(raw) <= 5000);
    const data: unknown = JSON.parse(raw); exactFields(data,['case','member','deleteTokenHash']);
    requireValue(isRecord(data.case) && typeof data.member === 'string' && MEMBER.test(data.member)
      && typeof data.deleteTokenHash === 'string' && /^[a-f0-9]{64}$/.test(data.deleteTokenHash));
    const { id,createdAtUtc,provenance,verification,locationPrecision,...fields } = data.case;
    requireValue(typeof id === 'string' && UUID.test(id) && id === id.toLowerCase()
      && typeof createdAtUtc === 'string' && new Date(createdAtUtc).toISOString() === createdAtUtc
      && Date.parse(createdAtUtc) >= Date.UTC(2000,0,1) && Date.parse(createdAtUtc) <= now + 300_000
      && provenance === 'public-self-reported' && verification === 'unverified' && locationPrecision === 'rounded-3-decimals');
    const { consent:_consent,website:_website,...safe } = normalizeCaseDraft({ ...fields,consent:true,website:'' });
    requireValue(isDeepStrictEqual(fields,safe) && data.member === `${String(Date.parse(createdAtUtc)).padStart(13,'0')}:${id}`);
    return data as unknown as StoredCase;
  } catch { throw new CommunityError(503,'unavailable','The case service could not read its stored cases.'); }
}

/** Existing observation format remains unchanged; case membership adds no fields. */
export function storedCaseObservation(raw: unknown, now: number): StoredCaseObservation {
  try {
    requireValue(typeof raw === 'string' && Buffer.byteLength(raw) <= 5000);
    const data: unknown = JSON.parse(raw); exactFields(data,['observation','member','deleteTokenHash']);
    requireValue(isRecord(data.observation) && typeof data.member === 'string' && MEMBER.test(data.member)
      && typeof data.deleteTokenHash === 'string' && /^[a-f0-9]{64}$/.test(data.deleteTokenHash));
    const { id,publishedAtUtc,provenance,verification,locationPrecision,...fields } = data.observation;
    requireValue(typeof id === 'string' && UUID.test(id) && typeof publishedAtUtc === 'string'
      && new Date(publishedAtUtc).toISOString() === publishedAtUtc && provenance === 'public-self-reported'
      && verification === 'unverified' && locationPrecision === 'rounded-3-decimals');
    const { consent:_consent,website:_website,...safe } = normalizeDraft({ ...fields,consent:true,website:'' },now);
    requireValue(isDeepStrictEqual(fields,safe) && data.member === `${String(Date.parse(publishedAtUtc)).padStart(13,'0')}:${id}`);
    return data as unknown as StoredCaseObservation;
  } catch { throw new CommunityError(503,'unavailable','The case service could not read its linked observations.'); }
}

export function parseCaseFeed(params: URLSearchParams) {
  requireValue(params.getAll('cursor').length <= 1);
  const clean = new URLSearchParams(params); clean.delete('cursor');
  const query = parseFeed(clean);
  const fingerprint = sha256('cases:v1:' + query.fingerprint);
  let before = '+';
  if (params.has('cursor')) {
    const cursor = params.get('cursor')!;
    requireValue(cursor.length <= 512 && /^[A-Za-z0-9_-]+$/.test(cursor));
    let value: unknown;
    try { value = JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')); }
    catch { throw new CommunityError(400,'invalid-request','The case page cursor is invalid.'); }
    exactFields(value,['version','before','fingerprint']);
    requireValue(value.version === 1 && value.fingerprint === fingerprint && typeof value.before === 'string' && MEMBER.test(value.before), 'The case cursor belongs to a different area or feed.');
    before = '(' + value.before;
  }
  return { ...query,before,fingerprint };
}
