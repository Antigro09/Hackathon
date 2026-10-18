import type { CommunityFeed, CommunityFeedQuery, CommunityObservation, CommunityObservationDraft, CommunityPublishResult } from './types';

export class CommunityRequestError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); this.name = 'CommunityRequestError'; }
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const fields = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => record(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const utc = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0,19)===v.slice(0,19);
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const qualityCodes = ['near-zero','clipped','near-full-scale','incomplete','unsupported-rate','processing-active','processing-unknown','imported-processing-unknown','non-finite','no-band-power'];
export function isCommunityObservation(value: unknown): value is CommunityObservation {
  if (!fields(value,['schemaVersion','inputKind','coordinates','label','note','capturedAtUtc','durationSeconds','sampleRateHz','sampleCount','frameCount','algorithmVersion','qualityCodes','aDigitalDb','cDigitalDb','cMinusADb','peakScreen','nearbyFacility','id','publishedAtUtc','provenance','verification','locationPrecision'])) return false;
  if (value.schemaVersion !== 1 || value.inputKind !== 'microphone' || !uuid(value.id) || !utc(value.capturedAtUtc) || !utc(value.publishedAtUtc) || value.provenance !== 'public-self-reported' || value.verification !== 'unverified' || value.locationPrecision !== 'rounded-3-decimals' || value.algorithmVersion !== 'tw-screen-v2') return false;
  const p = value.coordinates;
  if (!fields(p,['latitude','longitude']) || !finite(p.latitude) || !finite(p.longitude) || Math.abs(p.latitude)>85 || Math.abs(p.longitude)>180 || Math.abs(p.latitude*1000-Math.round(p.latitude*1000))>1e-8 || Math.abs(p.longitude*1000-Math.round(p.longitude*1000))>1e-8) return false;
  if (typeof value.label !== 'string' || !value.label.trim() || value.label.length>80 || typeof value.note !== 'string' || value.note.length>280 || ![5,15,30].includes(value.durationSeconds as number) || ![44100,48000].includes(value.sampleRateHz as number) || value.sampleCount !== (value.durationSeconds as number)*(value.sampleRateHz as number)) return false;
  if (!Array.isArray(value.qualityCodes) || value.qualityCodes.some(c=>typeof c!=='string'||!qualityCodes.includes(c)) || new Set(value.qualityCodes).size!==value.qualityCodes.length) return false;
  const q=value.qualityCodes as string[],expectedFrames=Math.floor(((value.sampleCount as number)-8192)/4096)+1;
  if (value.frameCount!==expectedFrames && !(value.frameCount===0 && q.some(c=>['near-zero','non-finite','unsupported-rate'].includes(c)))) return false;
  if (!['suggested','not-indicated','inconclusive','not-evaluated'].includes(value.peakScreen as string)) return false;
  const numbers=[value.aDigitalDb,value.cDigitalDb,value.cMinusADb],blocked=q.some(c=>['near-zero','clipped','near-full-scale','incomplete','unsupported-rate','non-finite','no-band-power'].includes(c));
  if (blocked ? numbers.some(n=>n!==null)||value.peakScreen!=='inconclusive' : numbers.some(n=>!finite(n)) || (value.aDigitalDb as number)<-240 || (value.aDigitalDb as number)>24 || (value.cDigitalDb as number)<-240 || (value.cDigitalDb as number)>24 || Math.abs(value.cMinusADb as number)>100 || Math.abs((value.cDigitalDb as number)-(value.aDigitalDb as number)-(value.cMinusADb as number))>0.05) return false;
  const f=value.nearbyFacility;
  return f===null || fields(f,['osmType','osmId','name']) && ['node','way','relation'].includes(f.osmType as string) && typeof f.osmId==='string' && /^[1-9]\d{0,15}$/.test(f.osmId) && typeof f.name==='string' && f.name.length>0 && f.name.length<=120;
}
const feed = (v: unknown): v is CommunityFeed => fields(v,['observations','nextCursor','limit','scanned','notice']) && Number.isSafeInteger(v.limit) && (v.limit as number)>0 && (v.limit as number)<=200 && Number.isSafeInteger(v.scanned) && (v.scanned as number)>=0 && (v.scanned as number)<=500 && Array.isArray(v.observations) && v.observations.length<=(v.limit as number) && v.observations.every(isCommunityObservation) && (v.nextCursor===null || typeof v.nextCursor==='string' && /^[A-Za-z0-9_-]{1,512}$/.test(v.nextCursor)) && typeof v.notice==='string' && v.notice.length<=1000;
const publication = (v: unknown): v is CommunityPublishResult => fields(v,['observation','deleteToken','replayed']) && isCommunityObservation(v.observation) && typeof v.deleteToken==='string' && /^[A-Za-z0-9_-]{43}$/.test(v.deleteToken) && typeof v.replayed==='boolean';
async function request<T>(url: string, init: RequestInit, validate: (value: unknown) => value is T, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { ...init, signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
  const reader=response.body?.getReader();let value: unknown=null;
  if(reader){let total=0;const chunks: Uint8Array[]=[];try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>1_048_576)throw new CommunityRequestError('invalid-response','The community service returned an invalid response.',response.status);chunks.push(part.value);}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{value=null;}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}}
  if (!response.ok) { const error=record(value)&&record(value.error)?value.error:null;throw new CommunityRequestError(typeof error?.code==='string'?error.code:'unavailable', typeof error?.message==='string'?error.message:'The community service is unavailable. Your observation remains local.', response.status); }
  if(!validate(value))throw new CommunityRequestError('invalid-response','The community service returned an invalid response. Refresh the map or try again later.',response.status);
  return value;
}
export function listCommunityObservations(query: CommunityFeedQuery, signal?: AbortSignal): Promise<CommunityFeed> {
  const params = new URLSearchParams();
  if (query.center) { params.set('lat', String(query.center.latitude)); params.set('lon', String(query.center.longitude)); params.set('radiusKm', String(query.radiusKm ?? 10)); }
  if (query.bbox) params.set('bbox', [query.bbox.west, query.bbox.south, query.bbox.east, query.bbox.north].join(','));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return request(`/api/community?${params}`, { method: 'GET' }, feed, signal);
}
/** Retain one random UUID key for retries of the identical reviewed payload. */
export function publishCommunityObservation(draft: CommunityObservationDraft, idempotencyKey: string, signal?: AbortSignal): Promise<CommunityPublishResult> {
  return request('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(draft) }, publication, signal);
}
/** The deletion capability is private. Never put it in a URL, map feature, or public feed. */
export function deleteCommunityObservation(id: string, deleteToken: string, signal?: AbortSignal): Promise<{ deleted: true }> {
  return request('/api/community', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, deleteToken }) }, (v: unknown): v is {deleted:true}=>fields(v,['deleted'])&&v.deleted===true, signal);
}
