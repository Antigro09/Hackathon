import { createHmac, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
import type { CommunityFeed, CommunityObservation } from '../src/community/types.js';
import { CommunityError, UUID, exactFields, feedCursor, inFeed, isRecord, normalizeDraft, parseFeed, requireValue, sha256 } from './communityValidation.js';

const PREFIX = 'tw:community:v1:';
const MAX_BODY = 16_384, SCAN_LIMIT = 500;
const NOTICE = 'Public, self-reported and unverified microphone observations. Locations are rounded to 3 decimals. Nearby facilities are reference information, not identified sound sources.';
// All scripts and key structures are fixed. Untrusted values only enter ARGV.
export const COMMUNITY_CREATE_SCRIPT = `-- TW_COMMUNITY_CREATE_V1
local previous=redis.call('GET',KEYS[3])
if previous then
 local p=cjson.decode(previous)
 if p.requestHash~=ARGV[1] then return {'conflict'} end
 local row=redis.call('HGET',KEYS[2],p.id)
 if not row then return {'gone'} end
 return {'replayed',row}
end
local hourly=redis.call('INCR',KEYS[4]); if hourly==1 then redis.call('EXPIRE',KEYS[4],3700) end
local daily=redis.call('INCR',KEYS[5]); if daily==1 then redis.call('EXPIRE',KEYS[5],90000) end
if hourly>10 or daily>1000 then return {'rate'} end
redis.call('HSET',KEYS[2],ARGV[2],ARGV[4])
redis.call('ZADD',KEYS[1],0,ARGV[3])
redis.call('SET',KEYS[3],cjson.encode({requestHash=ARGV[1],id=ARGV[2]}))
return {'created',ARGV[4]}`;
export const COMMUNITY_READ_SCRIPT = `-- TW_COMMUNITY_READ_V1
local count=redis.call('INCR',KEYS[3]); if count==1 then redis.call('EXPIRE',KEYS[3],90) end
if count>120 then return {'rate'} end
local members=redis.call('ZREVRANGEBYLEX',KEYS[1],ARGV[1],'-','LIMIT',0,500)
local result={}
for _,member in ipairs(members) do
 local row=redis.call('HGET',KEYS[2],string.sub(member,15))
 if row then table.insert(result,{member,row}) end
end
return {'rows',result}`;
export const COMMUNITY_DELETE_SCRIPT = `-- TW_COMMUNITY_DELETE_V1
local count=redis.call('INCR',KEYS[3]); if count==1 then redis.call('EXPIRE',KEYS[3],3700) end
if count>30 then return {'rate'} end
local row=redis.call('HGET',KEYS[2],ARGV[1])
if not row then return {'deleted'} end
local data=cjson.decode(row)
if data.deleteTokenHash~=ARGV[2] then return {'denied'} end
redis.call('HDEL',KEYS[2],ARGV[1]);redis.call('ZREM',KEYS[1],data.member)
return {'deleted'}`;

type ApiRequest = IncomingMessage & { body?: unknown };
interface Dependencies {
  env?: Record<string,string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
  uuid?: () => string;
}
interface StoredRow { observation: CommunityObservation; member: string; deleteTokenHash: string }
function storedRow(raw: unknown, now: number): StoredRow {
  try {
    requireValue(typeof raw === 'string' && Buffer.byteLength(raw) <= 5000);
    const data: unknown = JSON.parse(raw);exactFields(data,['observation','member','deleteTokenHash']);
    requireValue(isRecord(data.observation) && typeof data.member === 'string' && /^\d{13}:[0-9a-f-]{36}$/.test(data.member) && typeof data.deleteTokenHash === 'string' && /^[a-f0-9]{64}$/.test(data.deleteTokenHash));
    const {id,publishedAtUtc,provenance,verification,locationPrecision,...fields} = data.observation;
    requireValue(typeof id === 'string' && UUID.test(id) && typeof publishedAtUtc === 'string' && new Date(publishedAtUtc).toISOString() === publishedAtUtc && provenance === 'public-self-reported' && verification === 'unverified' && locationPrecision === 'rounded-3-decimals');
    const normalized = normalizeDraft({...fields,consent:true,website:''},now);
    const {consent: _consent, website: _website,...safe} = normalized;
    requireValue(isDeepStrictEqual(fields,safe) && data.member === `${String(Date.parse(publishedAtUtc)).padStart(13,'0')}:${id}`);
    return data as unknown as StoredRow;
  } catch { throw new CommunityError(503,'unavailable','The community service could not read its stored observations.'); }
}
async function readBody(req: ApiRequest): Promise<unknown> {
  const length = req.headers['content-length'];
  if (length !== undefined && (typeof length !== 'string' || !/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw new CommunityError(413,'body-too-large','Public requests must be at most 16 KiB.');
  const type = req.headers['content-type'];
  if (typeof type !== 'string' || !/^application\/json(?:\s*;|$)/i.test(type)) throw new CommunityError(415,'unsupported-media','Send a JSON public observation.');
  let raw: string;
  if (req.body !== undefined) {
    raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BODY) throw new CommunityError(413,'body-too-large','Public requests must be at most 16 KiB.');
  } else {
    const chunks: Buffer[] = [];let total=0;
    for await (const value of req) { const chunk=Buffer.from(value);total+=chunk.length;if(total>MAX_BODY)throw new CommunityError(413,'body-too-large','Public requests must be at most 16 KiB.');chunks.push(chunk); }
    raw=Buffer.concat(chunks).toString('utf8');
  }
  try { return JSON.parse(raw); } catch { throw new CommunityError(400,'invalid-request','The public request must contain valid JSON.'); }
}
function originCheck(req: ApiRequest): void {
  const origin=req.headers.origin,host=req.headers.host,write=req.method!=='GET';
  if (!origin && !write) return;
  try {
    requireValue(typeof origin==='string'&&typeof host==='string');
    const url=new URL(origin);requireValue(url.origin===origin && url.host===host && (url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)));
    const fetchSite=req.headers['sec-fetch-site'];requireValue(fetchSite===undefined||fetchSite==='same-origin'||fetchSite==='none');
  } catch { throw new CommunityError(403,'same-origin-required','Use the community map on this website to publish or remove a pin.'); }
}
function send(res: ServerResponse,status: number,value: unknown): void {
  res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(value));
}
/** Server-only REST credentials; no dependency package, public fallback, or local-storage database. */
export function createCommunityHandler(deps: Dependencies = {}) {
  return async (req: ApiRequest,res: ServerResponse): Promise<void> => {
    try {
      if (!['GET','POST','DELETE'].includes(req.method??'')) { res.setHeader('Allow','GET, POST, DELETE');throw new CommunityError(405,'method-not-allowed','Use GET, POST or DELETE.'); }
      originCheck(req);
      const env=deps.env??process.env,now=(deps.now??Date.now)();
      const primaryUrl=env.UPSTASH_REDIS_REST_URL?.trim()??'',primaryToken=env.UPSTASH_REDIS_REST_TOKEN?.trim()??'';
      const alternateUrl=env.KV_REST_API_URL?.trim()??'',alternateToken=env.KV_REST_API_TOKEN?.trim()??'';
      if((primaryUrl||primaryToken)&&(!primaryUrl||!primaryToken))throw new CommunityError(503,'unconfigured','Community storage credentials must be configured as a complete pair. Your observation remains local.');
      const redisUrl=primaryUrl||alternateUrl,token=primaryToken||alternateToken;
      if (!redisUrl||!token) throw new CommunityError(503,'unconfigured','Shared community storage is not configured. Your observation remains local.');
      let endpoint: URL;try { endpoint=new URL(redisUrl);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error(); } catch { throw new CommunityError(503,'unavailable','Community storage is unavailable.'); }
      const hmac=(s: string)=>createHmac('sha256',token).update(s).digest('base64url');
      // Vercel overwrites X-Forwarded-For. Never accept an IP in the request body,
      // store raw addresses, or retain these short-lived salted buckets in public rows.
      const forwarded=env.VERCEL==='1'?req.headers['x-forwarded-for']:req.socket?.remoteAddress;
      const address=typeof forwarded==='string'?forwarded.split(',')[0].trim().slice(0,128):'unknown';
      const bucket=hmac(`rate:${Math.floor(now/86_400_000)}:${address}`);
      const keys=[PREFIX+'recent',PREFIX+'rows'];
      async function evalRedis(script: string,scriptKeys: string[],args: string[]): Promise<unknown[]> {
        try {
          const response=await (deps.fetch??fetch)(endpoint,{method:'POST',credentials:'omit',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,String(scriptKeys.length),...scriptKeys,...args]),signal:AbortSignal.timeout(8000)});
          if(!response.ok)throw Error();
          const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks: Uint8Array[]=[];
          try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2_000_000)throw Error();chunks.push(part.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
          const result: unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(!isRecord(result)||result.error||!Array.isArray(result.result))throw Error();return result.result;
        }catch{throw new CommunityError(503,'unavailable','The shared community service is temporarily unavailable. Your local observation is unchanged.');}
      }
      if(req.method==='GET') {
        const query=parseFeed(new URL(req.url??'/api/community','https://community.invalid').searchParams);
        const value=await evalRedis(COMMUNITY_READ_SCRIPT,[...keys,PREFIX+`read:${bucket}:${Math.floor(now/60_000)}`],[query.before]);
        if(value[0]==='rate')throw new CommunityError(429,'rate-limited','Too many map requests. Wait a minute and try again.');
        if(value[0]!=='rows'||!Array.isArray(value[1])||value[1].length>SCAN_LIMIT)throw new CommunityError(503,'unavailable','The community feed is unavailable.');
        const rows=value[1].map(pair=>{if(!Array.isArray(pair)||pair.length!==2)throw new CommunityError(503,'unavailable','The community feed is unavailable.');const entry=storedRow(pair[1],now);if(pair[0]!==entry.member)throw new CommunityError(503,'unavailable','The community feed is unavailable.');return entry;});
        const observations: CommunityObservation[]=[];let end=-1;
        for(let i=0;i<rows.length;i++){end=i;if(inFeed(rows[i].observation.coordinates,query.query))observations.push(rows[i].observation);if(observations.length===query.limit)break;}
        const more=end>=0&&(end<rows.length-1||rows.length===SCAN_LIMIT);
        const feed: CommunityFeed={observations,nextCursor:more?feedCursor(rows[end].member,query.fingerprint):null,limit:query.limit,scanned:rows.length,notice:NOTICE};send(res,200,feed);return;
      }
      if(req.method==='POST') {
        const raw=await readBody(req),draft=normalizeDraft(raw,now),nonceHeader=req.headers['idempotency-key'];
        requireValue(typeof nonceHeader==='string'&&UUID.test(nonceHeader),'Use one random UUID idempotency key for this reviewed publication and its retries.');
        const nonce=nonceHeader.toLowerCase();
        const requestHash=sha256(JSON.stringify(draft)),id=(deps.uuid??randomUUID)();requireValue(UUID.test(id));
        const deleteToken=hmac(`delete:v1:${id}:${nonce}`);
        const {consent:_consent,website:_website,...publicFields}=draft;
        const observation: CommunityObservation={...publicFields,id,publishedAtUtc:new Date(now).toISOString(),provenance:'public-self-reported',verification:'unverified',locationPrecision:'rounded-3-decimals'};
        const entry: StoredRow={observation,member:`${String(now).padStart(13,'0')}:${id}`,deleteTokenHash:sha256(deleteToken)};
        const result=await evalRedis(COMMUNITY_CREATE_SCRIPT,[...keys,PREFIX+'idem:'+sha256(nonce.toLowerCase()),PREFIX+`write:${bucket}:${Math.floor(now/3_600_000)}`,PREFIX+`global-write:${Math.floor(now/86_400_000)}`],[requestHash,id,entry.member,JSON.stringify(entry)]);
        if(result[0]==='rate')throw new CommunityError(429,'rate-limited','Publication limit reached. Wait before sharing another observation.');
        if(result[0]==='conflict')throw new CommunityError(409,'idempotency-conflict','This publication key was already used for different reviewed details.');
        if(result[0]==='gone')throw new CommunityError(410,'publication-removed','This publication was removed. It will not be recreated by a retry.');
        if(!['created','replayed'].includes(result[0] as string))throw new CommunityError(503,'unavailable','Publication could not be confirmed. Retry the identical request with the same key.');
        const saved=storedRow(result[1],now),ownerToken=hmac(`delete:v1:${saved.observation.id}:${nonce}`);
        if(sha256(ownerToken)!==saved.deleteTokenHash)throw new CommunityError(503,'unavailable','Publication ownership could not be recovered.');
        send(res,result[0]==='created'?201:200,{observation:saved.observation,deleteToken:ownerToken,replayed:result[0]==='replayed'});return;
      }
      const body=await readBody(req);exactFields(body,['id','deleteToken']);requireValue(typeof body.id==='string'&&UUID.test(body.id)&&typeof body.deleteToken==='string'&&/^[A-Za-z0-9_-]{43}$/.test(body.deleteToken));
      const result=await evalRedis(COMMUNITY_DELETE_SCRIPT,[...keys,PREFIX+`delete:${bucket}:${Math.floor(now/3_600_000)}`],[body.id,sha256(body.deleteToken)]);
      if(result[0]==='rate')throw new CommunityError(429,'rate-limited','Too many removal attempts. Wait and try again.');
      if(result[0]==='denied')throw new CommunityError(404,'not-found','That publication cannot be removed with this capability.');
      if(result[0]!=='deleted')throw new CommunityError(503,'unavailable','Removal could not be confirmed.');send(res,200,{deleted:true});
    } catch(error) {
      if(error instanceof CommunityError){if(error.status===429)res.setHeader('Retry-After','60');send(res,error.status,{error:{code:error.code,message:error.message}});}
      else send(res,503,{error:{code:'unavailable',message:'The community service is temporarily unavailable. Your observation remains local.'}});
    }
  };
}
