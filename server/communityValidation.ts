import { createHash } from 'node:crypto';
import type { CommunityCoordinates, CommunityFeedQuery, CommunityObservationDraft } from '../src/community/types.js';
import type { QualityCode } from '../src/types.js';

export class CommunityError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export const requireValue: (ok: unknown, message?: string) => asserts ok = (ok, message = 'The public observation is invalid.') => { if (!ok) throw new CommunityError(400, 'invalid-request', message); };
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function exactFields(value: unknown, fields: readonly string[]): asserts value is Record<string, unknown> {
  requireValue(isRecord(value) && Object.keys(value).length === fields.length && Object.keys(value).every(k => fields.includes(k)), 'Send only the reviewed public fields. Audio, spectra, AI results and private context are not accepted.');
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODES = ['near-zero','clipped','near-full-scale','incomplete','unsupported-rate','processing-active','processing-unknown','imported-processing-unknown','non-finite','no-band-power'];
const BLOCKING = ['near-zero','clipped','near-full-scale','incomplete','unsupported-rate','non-finite','no-band-power'];
const DRAFT_FIELDS = ['schemaVersion','consent','inputKind','coordinates','label','note','capturedAtUtc','durationSeconds','sampleRateHz','sampleCount','frameCount','algorithmVersion','qualityCodes','aDigitalDb','cDigitalDb','cMinusADb','peakScreen','nearbyFacility','website'];
function text(value: unknown, maximum: number, allowEmpty = false): string {
  requireValue(typeof value === 'string');
  const clean = value.trim();
  requireValue((allowEmpty || clean.length > 0) && clean.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(clean), `Public text must be ${allowEmpty ? '0' : '1'}–${maximum} characters without control characters.`);
  return clean;
}
export function coordinates(value: unknown, round = false): CommunityCoordinates {
  exactFields(value, ['latitude','longitude']);
  requireValue(typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 85 && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180, 'Enter a valid manual map location (latitude −85 to 85, longitude −180 to 180).');
  const rounded = (n: number) => Object.is(n, -0) ? 0 : n;
  return { latitude: rounded(round ? Math.round(value.latitude * 1000) / 1000 : value.latitude), longitude: rounded(round ? Math.round(value.longitude * 1000) / 1000 : value.longitude) };
}
export function normalizeDraft(value: unknown, now: number): CommunityObservationDraft {
  exactFields(value, DRAFT_FIELDS);
  requireValue(value.schemaVersion === 1 && value.consent === true && value.inputKind === 'microphone' && value.website === '', 'Explicit public-sharing consent and a microphone observation are required.');
  requireValue(value.algorithmVersion === 'tw-screen-v2', 'This observation uses an unsupported analysis method.');
  requireValue([5,15,30].includes(value.durationSeconds as number) && [44100,48000].includes(value.sampleRateHz as number));
  const durationSeconds = value.durationSeconds as 5 | 15 | 30, sampleRateHz = value.sampleRateHz as 44100 | 48000;
  requireValue(value.sampleCount === durationSeconds * sampleRateHz, 'The recorded duration and sample count do not match.');
  requireValue(Array.isArray(value.qualityCodes) && value.qualityCodes.length <= CODES.length && value.qualityCodes.every(v => typeof v === 'string' && CODES.includes(v)) && new Set(value.qualityCodes).size === value.qualityCodes.length);
  const qualityCodes = [...value.qualityCodes] as QualityCode[], blocked = qualityCodes.some(v => BLOCKING.includes(v));
  const expectedFrames = Math.floor((durationSeconds * sampleRateHz - 8192) / 4096) + 1;
  const earlyExit = qualityCodes.some(v => ['near-zero','non-finite','unsupported-rate'].includes(v));
  requireValue(value.frameCount === expectedFrames || earlyExit && value.frameCount === 0, 'The frame count does not match this recorded window.');
  requireValue(typeof value.capturedAtUtc === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.capturedAtUtc) && Number.isFinite(Date.parse(value.capturedAtUtc)) && Date.parse(value.capturedAtUtc) >= Date.UTC(2000,0,1) && Date.parse(value.capturedAtUtc) <= now + 300_000, 'A valid UTC microphone capture time is required.');
  requireValue(new Date(Date.parse(value.capturedAtUtc)).toISOString().slice(0,19) === value.capturedAtUtc.slice(0,19), 'The UTC capture date is not valid.');
  requireValue(['suggested','not-indicated','inconclusive','not-evaluated'].includes(value.peakScreen as string));
  const raw = [value.aDigitalDb,value.cDigitalDb,value.cMinusADb];
  requireValue(raw.every(v => v === null || typeof v === 'number' && Number.isFinite(v)), 'Digital levels must be finite numbers or unavailable.');
  if (!blocked) requireValue(raw.every(v => typeof v === 'number') && (value.aDigitalDb as number) >= -240 && (value.aDigitalDb as number) <= 24 && (value.cDigitalDb as number) >= -240 && (value.cDigitalDb as number) <= 24 && Math.abs(value.cMinusADb as number) <= 100 && Math.abs((value.cDigitalDb as number) - (value.aDigitalDb as number) - (value.cMinusADb as number)) <= 0.05, 'Available weighted levels and their C−A difference must agree.');
  let nearbyFacility: CommunityObservationDraft['nearbyFacility'] = null;
  if (value.nearbyFacility !== null) {
    exactFields(value.nearbyFacility, ['osmType','osmId','name']);
    requireValue(['node','way','relation'].includes(value.nearbyFacility.osmType as string) && typeof value.nearbyFacility.osmId === 'string' && /^[1-9]\d{0,15}$/.test(value.nearbyFacility.osmId));
    nearbyFacility = { osmType: value.nearbyFacility.osmType as 'node' | 'way' | 'relation', osmId: value.nearbyFacility.osmId, name: text(value.nearbyFacility.name,120) };
  }
  return { schemaVersion:1,consent:true,inputKind:'microphone',coordinates:coordinates(value.coordinates,true),label:text(value.label,80),note:text(value.note,280,true),capturedAtUtc:new Date(Date.parse(value.capturedAtUtc)).toISOString(),durationSeconds,sampleRateHz,sampleCount:durationSeconds * sampleRateHz,frameCount:value.frameCount as number,algorithmVersion:'tw-screen-v2',qualityCodes,aDigitalDb:blocked?null:value.aDigitalDb as number,cDigitalDb:blocked?null:value.cDigitalDb as number,cMinusADb:blocked?null:value.cMinusADb as number,peakScreen:blocked?'inconclusive':value.peakScreen as CommunityObservationDraft['peakScreen'],nearbyFacility,website:'' };
}

export interface ParsedFeed { query: CommunityFeedQuery; limit: number; before: string; fingerprint: string }
const MEMBER = /^\d{13}:[0-9a-f-]{36}$/;
export function parseFeed(params: URLSearchParams): ParsedFeed {
  const allowed = ['lat','lon','radiusKm','bbox','limit','cursor'];
  requireValue([...params.keys()].every(k => allowed.includes(k)) && allowed.every(k => params.getAll(k).length <= 1));
  const limit = params.has('limit') ? Number(params.get('limit')) : 100;
  requireValue(Number.isSafeInteger(limit) && limit > 0 && limit <= 200, 'Request at most 200 observations per page.');
  let query: CommunityFeedQuery;
  if (params.has('bbox')) {
    requireValue(!params.has('lat') && !params.has('lon') && !params.has('radiusKm'));
    const parts = params.get('bbox')!.split(',');requireValue(parts.length === 4 && parts.every(x => x.trim()));
    const [west,south,east,north] = parts.map(Number);
    coordinates({latitude:south,longitude:west});coordinates({latitude:north,longitude:east});
    requireValue(west < east && south < north && distanceKm({latitude:south,longitude:west},{latitude:north,longitude:east}) <= 50, 'Choose a map area no more than 50 km across.');
    query = { bbox:{west,south,east,north} };
  } else {
    requireValue(params.has('lat') && params.has('lon') && params.get('lat')!.trim() && params.get('lon')!.trim(), 'Choose a map center and radius, or a bounded map area.');
    const center = coordinates({latitude:Number(params.get('lat')),longitude:Number(params.get('lon'))});
    const radiusKm = params.has('radiusKm') ? Number(params.get('radiusKm')) : 10;
    requireValue(Number.isFinite(radiusKm) && radiusKm > 0 && radiusKm <= 25, 'Search radius must be greater than zero and at most 25 km.');query = {center,radiusKm};
  }
  const fingerprint = sha256(JSON.stringify(query));let before = '+';
  if (params.has('cursor')) {
    const cursor = params.get('cursor')!;requireValue(cursor.length <= 512 && /^[A-Za-z0-9_-]+$/.test(cursor));
    let value: unknown;try { value = JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')); } catch { throw new CommunityError(400,'invalid-request','The map page cursor is invalid.'); }
    exactFields(value,['version','before','fingerprint']);requireValue(value.version === 1 && value.fingerprint === fingerprint && typeof value.before === 'string' && MEMBER.test(value.before));before = '(' + value.before;
  }
  return {query,limit,before,fingerprint};
}
export function feedCursor(before: string, fingerprint: string): string { return Buffer.from(JSON.stringify({version:1,before,fingerprint})).toString('base64url'); }
export function distanceKm(a: CommunityCoordinates, b: CommunityCoordinates): number {
  const rad = Math.PI / 180, dl = (b.latitude-a.latitude)*rad, dn = (b.longitude-a.longitude)*rad;
  const h = Math.sin(dl/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dn/2)**2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function inFeed(point: CommunityCoordinates, query: CommunityFeedQuery): boolean {
  if (query.bbox) return point.latitude >= query.bbox.south && point.latitude <= query.bbox.north && point.longitude >= query.bbox.west && point.longitude <= query.bbox.east;
  return distanceKm(point,query.center!) <= query.radiusKm!;
}
