import { createHmac, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NeighborhoodCase } from '../src/community/casesTypes.js';
import type { CommunityObservation } from '../src/community/types.js';
import { CommunityError, UUID, distanceKm, exactFields, feedCursor, inFeed, isRecord, requireValue, sha256 } from './communityValidation.js';
import { CASE_CAPABILITY, normalizeCaseDraft, parseCaseFeed, storedCase, storedCaseObservation } from './caseValidation.js';
import { getCaseWorkflow, updateCaseWorkflow } from './caseWorkflow.js';

const CASE_PREFIX = 'tw:cases:v1:', COMMUNITY_PREFIX = 'tw:community:v1:';
const MAX_BODY = 16_384, SCAN_LIMIT = 500, MEMBER_LIMIT = 200;
const NOTICE = 'Public, self-reported neighborhood cases and observations. Source attribution and participant identities are unverified. Counts describe observations, not independent residents. Locations are rounded to 3 decimals.';

// Scripts are fixed; caller values enter only KEYS/ARGV. Idempotency records
// never expire, so deleting a case cannot make an old create retry resurrect it.
export const CASE_CREATE_SCRIPT = `-- TW_CASE_CREATE_V1
local previous=redis.call('GET',KEYS[3])
if previous then
 local p=cjson.decode(previous)
 if p.requestHash~=ARGV[1] then return {'conflict'} end
 local row=redis.call('HGET',KEYS[2],p.id)
 if not row then return {'gone'} end
 return {'replayed',row}
end
local hourly=redis.call('INCR',KEYS[4]);if hourly==1 then redis.call('EXPIRE',KEYS[4],3700) end
local daily=redis.call('INCR',KEYS[5]);if daily==1 then redis.call('EXPIRE',KEYS[5],90000) end
if hourly>10 or daily>1000 then return {'rate'} end
redis.call('HSET',KEYS[2],ARGV[2],ARGV[4]);redis.call('ZADD',KEYS[1],0,ARGV[3])
redis.call('SET',KEYS[3],cjson.encode({requestHash=ARGV[1],id=ARGV[2]}))
return {'created',ARGV[4]}`;

export const CASE_READ_SCRIPT = `-- TW_CASE_READ_V1
local count=redis.call('INCR',KEYS[3]);if count==1 then redis.call('EXPIRE',KEYS[3],90) end
if count>120 then return {'rate'} end
local members=redis.call('ZREVRANGEBYLEX',KEYS[1],ARGV[1],'-','LIMIT',0,500)
local rows={}
for _,member in ipairs(members) do
 local row=redis.call('HGET',KEYS[2],string.sub(member,15))
 if row then table.insert(rows,{member,row}) end
end
return {'rows',rows}`;

export const CASE_DETAIL_SCRIPT = `-- TW_CASE_DETAIL_V1
local count=redis.call('INCR',KEYS[4]);if count==1 then redis.call('EXPIRE',KEYS[4],90) end
if count>120 then return {'rate'} end
local row=redis.call('HGET',KEYS[1],ARGV[1]);if not row then return {'missing'} end
local ids=redis.call('SMEMBERS',KEYS[2]);if #ids>200 then return {'invalid'} end
local observations={}
for _,id in ipairs(ids) do
 local observation=redis.call('HGET',KEYS[3],id)
 if observation then table.insert(observations,{id,observation}) end
end
return {'detail',row,observations}`;

// The first transaction proves observation ownership and snapshots both rows.
// Node validates their complete schemas and distance before the second fixed
// transaction compares exact bytes and commits membership atomically.
export const CASE_ATTACH_READ_SCRIPT = `-- TW_CASE_ATTACH_READ_V1
local count=redis.call('INCR',KEYS[3]);if count==1 then redis.call('EXPIRE',KEYS[3],3700) end
local daily=redis.call('INCR',KEYS[4]);if daily==1 then redis.call('EXPIRE',KEYS[4],90000) end
if count>60 or daily>5000 then return {'rate'} end
local row=redis.call('HGET',KEYS[1],ARGV[1]);if not row then return {'case-gone'} end
local observation=redis.call('HGET',KEYS[2],ARGV[2]);if not observation then return {'denied'} end
local ok,data=pcall(cjson.decode,observation)
if not ok or type(data)~='table' then return {'invalid'} end
if data.deleteTokenHash~=ARGV[3] then return {'denied'} end
return {'eligible',row,observation}`;

export const CASE_ATTACH_SCRIPT = `-- TW_CASE_ATTACH_V1
local row=redis.call('HGET',KEYS[1],ARGV[1]);if not row then return {'case-gone'} end
local observation=redis.call('HGET',KEYS[3],ARGV[2]);if not observation then return {'denied'} end
if row~=ARGV[4] or observation~=ARGV[5] then return {'stale'} end
local ok,data=pcall(cjson.decode,observation)
if not ok or type(data)~='table' then return {'invalid'} end
if data.deleteTokenHash~=ARGV[3] then return {'denied'} end
local ids=redis.call('SMEMBERS',KEYS[2]);if #ids>200 then return {'invalid'} end
for _,id in ipairs(ids) do
 if redis.call('HEXISTS',KEYS[3],id)==0 then redis.call('SREM',KEYS[2],id) end
end
if redis.call('SISMEMBER',KEYS[2],ARGV[2])==1 then return {'attached'} end
if redis.call('SCARD',KEYS[2])>=200 then return {'full'} end
redis.call('SADD',KEYS[2],ARGV[2]);return {'attached'}`;

export const CASE_DELETE_SCRIPT = `-- TW_CASE_DELETE_V1
local count=redis.call('INCR',KEYS[4]);if count==1 then redis.call('EXPIRE',KEYS[4],3700) end
if count>30 then return {'rate'} end
local row=redis.call('HGET',KEYS[2],ARGV[1]);if not row then return {'deleted'} end
local ok,data=pcall(cjson.decode,row)
if not ok or type(data)~='table' or type(data.member)~='string' then return {'invalid'} end
if data.deleteTokenHash~=ARGV[2] then return {'denied'} end
redis.call('HDEL',KEYS[2],ARGV[1]);redis.call('ZREM',KEYS[1],data.member);redis.call('DEL',KEYS[3],KEYS[5])
return {'deleted'}`;

type ApiRequest = IncomingMessage & { body?: unknown };
interface Dependencies {
  env?: Record<string,string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
  uuid?: () => string;
  /** Explicit local-test seam only. Production never reads prefixes from env or HTTP. */
  testPrefixes?: { cases: string; community: string };
}

async function readBody(req: ApiRequest): Promise<unknown> {
  const length=req.headers['content-length'];
  if(length!==undefined&&(typeof length!=='string'||!/^\d+$/.test(length)||Number(length)>MAX_BODY))throw new CommunityError(413,'body-too-large','Case requests must be at most 16 KiB.');
  const type=req.headers['content-type'];
  if(typeof type!=='string'||!/^application\/json(?:\s*;|$)/i.test(type))throw new CommunityError(415,'unsupported-media','Send a JSON case request.');
  let raw: string;
  if(req.body!==undefined){raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body);if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX_BODY)throw new CommunityError(413,'body-too-large','Case requests must be at most 16 KiB.');}
  else {const chunks:Buffer[]=[];let total=0;for await(const value of req){const chunk=Buffer.from(value);total+=chunk.length;if(total>MAX_BODY)throw new CommunityError(413,'body-too-large','Case requests must be at most 16 KiB.');chunks.push(chunk);}raw=Buffer.concat(chunks).toString('utf8');}
  try{return JSON.parse(raw);}catch{throw new CommunityError(400,'invalid-request','The case request must contain valid JSON.');}
}
function checkOrigin(req: ApiRequest): void {
  const origin=req.headers.origin,host=req.headers.host;
  if(!origin&&req.method==='GET')return;
  try{requireValue(typeof origin==='string'&&typeof host==='string');const parsed=new URL(origin);
    requireValue(parsed.origin===origin&&parsed.host===host&&(parsed.protocol==='https:'||parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)));
    const site=req.headers['sec-fetch-site'];requireValue(site===undefined||site==='same-origin'||site==='none');
  }catch{throw new CommunityError(403,'same-origin-required','Use the case page on this website to create, link or remove a case.');}
}
function send(res: ServerResponse,status: number,value: unknown): void {
  res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(value));
}

export function createCasesHandler(deps: Dependencies = {}) {
  const prefixes=deps.testPrefixes??{cases:CASE_PREFIX,community:COMMUNITY_PREFIX};
  if(deps.testPrefixes&&(!/^tw:qa:[A-Za-z0-9:_-]{1,120}:$/.test(prefixes.cases)||!/^tw:qa:[A-Za-z0-9:_-]{1,120}:$/.test(prefixes.community)||prefixes.cases===prefixes.community))throw new Error('Test prefixes must use two distinct bounded tw:qa: namespaces.');
  return async(req:ApiRequest,res:ServerResponse):Promise<void>=>{
    try{
      if(!['GET','POST','DELETE'].includes(req.method??'')){res.setHeader('Allow','GET, POST, DELETE');throw new CommunityError(405,'method-not-allowed','Use GET, POST or DELETE.');}
      checkOrigin(req);
      const env=deps.env??process.env,now=(deps.now??Date.now)();
      const primaryUrl=env.UPSTASH_REDIS_REST_URL?.trim()??'',primaryToken=env.UPSTASH_REDIS_REST_TOKEN?.trim()??'';
      const alternateUrl=env.KV_REST_API_URL?.trim()??'',alternateToken=env.KV_REST_API_TOKEN?.trim()??'';
      if((primaryUrl||primaryToken)&&(!primaryUrl||!primaryToken))throw new CommunityError(503,'unconfigured','Community storage credentials must be configured as a complete pair.');
      const redisUrl=primaryUrl||alternateUrl,token=primaryToken||alternateToken;
      if(!redisUrl||!token)throw new CommunityError(503,'unconfigured','Shared case storage is not configured.');
      let endpoint:URL;try{endpoint=new URL(redisUrl);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error();}catch{throw new CommunityError(503,'unavailable','Case storage is unavailable.');}
      const hmac=(value:string)=>createHmac('sha256',token).update(value).digest('base64url');
      const forwarded=env.VERCEL==='1'?req.headers['x-forwarded-for']:req.socket?.remoteAddress;
      const address=typeof forwarded==='string'?forwarded.split(',')[0].trim().slice(0,128):'unknown';
      const bucket=hmac(`cases-rate:${Math.floor(now/86_400_000)}:${address}`);
      const recent=prefixes.cases+'recent',rows=prefixes.cases+'rows',observationRows=prefixes.community+'rows';
      const readBucket=prefixes.cases+`read:${bucket}:${Math.floor(now/60_000)}`;
      async function evalRedis(script:string,keys:string[],args:string[]):Promise<unknown[]>{
        try{
          const response=await(deps.fetch??fetch)(endpoint,{method:'POST',credentials:'omit',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,String(keys.length),...keys,...args]),signal:AbortSignal.timeout(8000)});
          if(!response.ok)throw Error();const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks:Uint8Array[]=[];
          try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2_000_000)throw Error();chunks.push(part.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
          const result:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(!isRecord(result)||result.error||!Array.isArray(result.result))throw Error();return result.result;
        }catch{throw new CommunityError(503,'unavailable','The shared case service is temporarily unavailable. Your local observation is unchanged.');}
      }
      const rate=()=>{throw new CommunityError(429,'rate-limited','The case request limit was reached. Wait and try again.');};
      const workflowContext={evalRedis,rows,observationRows,prefix:prefixes.cases,readBucket,writeBucket:prefixes.cases+`workflow-write:${bucket}:${Math.floor(now/3_600_000)}`,now};
      if(req.method==='GET'){
        const params=new URL(req.url??'/api/cases','https://cases.invalid').searchParams;
        if(params.has('id')){
          if(params.has('workflow')){
            requireValue([...params.keys()].every(key=>key==='id'||key==='workflow')&&params.getAll('id').length===1&&UUID.test(params.get('id')!)&&params.getAll('workflow').length===1&&params.get('workflow')==='1','Choose one case action history.');
            send(res,200,await getCaseWorkflow(workflowContext,params.get('id')!.toLowerCase()));return;
          }
          requireValue([...params.keys()].every(key=>key==='id')&&params.getAll('id').length===1&&UUID.test(params.get('id')!), 'Choose one case ID.');
          const id=params.get('id')!.toLowerCase();
          const result=await evalRedis(CASE_DETAIL_SCRIPT,[rows,prefixes.cases+'members:'+id,observationRows,readBucket],[id]);
          if(result[0]==='rate')rate();if(result[0]==='missing')throw new CommunityError(404,'not-found','That case is unavailable or was removed.');
          if(result[0]!=='detail'||!Array.isArray(result[2])||result[2].length>MEMBER_LIMIT)throw new CommunityError(503,'unavailable','Case details are unavailable.');
          const entry=storedCase(result[1],now);if(entry.case.id!==id)throw new CommunityError(503,'unavailable','The stored case identity is unavailable.');
          const observations:CommunityObservation[]=result[2].map(pair=>{
            if(!Array.isArray(pair)||pair.length!==2)throw new CommunityError(503,'unavailable','Linked observations are unavailable.');
            const saved=storedCaseObservation(pair[1],now);
            if(saved.observation.id!==pair[0]||distanceKm(entry.case.coordinates,saved.observation.coordinates)>entry.case.radiusKm)throw new CommunityError(503,'unavailable','Linked observations are unavailable.');
            return saved.observation;
          });
          if(new Set(observations.map(observation=>observation.id)).size!==observations.length)throw new CommunityError(503,'unavailable','Linked observations are unavailable.');
          observations.sort((a,b)=>b.publishedAtUtc.localeCompare(a.publishedAtUtc)||b.id.localeCompare(a.id));
          send(res,200,{case:entry.case,observations,limit:MEMBER_LIMIT,notice:NOTICE});return;
        }
        const query=parseCaseFeed(params);
        const result=await evalRedis(CASE_READ_SCRIPT,[recent,rows,readBucket],[query.before]);
        if(result[0]==='rate')rate();if(result[0]!=='rows'||!Array.isArray(result[1])||result[1].length>SCAN_LIMIT)throw new CommunityError(503,'unavailable','The case feed is unavailable.');
        const entries=result[1].map(pair=>{if(!Array.isArray(pair)||pair.length!==2)throw new CommunityError(503,'unavailable','The case feed is unavailable.');const entry=storedCase(pair[1],now);if(entry.member!==pair[0])throw new CommunityError(503,'unavailable','The case feed is unavailable.');return entry;});
        const cases:NeighborhoodCase[]=[];let end=-1;
        for(let index=0;index<entries.length;index++){end=index;if(inFeed(entries[index].case.coordinates,query.query))cases.push(entries[index].case);if(cases.length===query.limit)break;}
        const more=end>=0&&(end<entries.length-1||entries.length===SCAN_LIMIT);
        send(res,200,{cases,nextCursor:more?feedCursor(entries[end].member,query.fingerprint):null,limit:query.limit,scanned:entries.length,notice:NOTICE});return;
      }
      const body=await readBody(req);
      if(req.method==='POST'){
        requireValue(isRecord(body));
        if(body.action==='workflow'){send(res,200,await updateCaseWorkflow(workflowContext,body));return;}
        if(body.action==='create'){
          exactFields(body,['action','draft']);const draft=normalizeCaseDraft(body.draft);
          const nonceHeader=req.headers['idempotency-key'];requireValue(typeof nonceHeader==='string'&&UUID.test(nonceHeader),'Use one random UUID idempotency key for the reviewed case and identical retries.');
          const nonce=nonceHeader.toLowerCase(),id=(deps.uuid??randomUUID)().toLowerCase();requireValue(UUID.test(id));
          const deleteToken=hmac(`delete:cases:v1:${id}:${nonce}`);
          const {consent:_consent,website:_website,...publicFields}=draft;
          const publicCase:NeighborhoodCase={...publicFields,id,createdAtUtc:new Date(now).toISOString(),provenance:'public-self-reported',verification:'unverified',locationPrecision:'rounded-3-decimals'};
          const entry={case:publicCase,member:`${String(now).padStart(13,'0')}:${id}`,deleteTokenHash:sha256(deleteToken)};
          const result=await evalRedis(CASE_CREATE_SCRIPT,[recent,rows,prefixes.cases+'idem:'+sha256(nonce),prefixes.cases+`write:${bucket}:${Math.floor(now/3_600_000)}`,prefixes.cases+`global-write:${Math.floor(now/86_400_000)}`],[sha256(JSON.stringify(draft)),id,entry.member,JSON.stringify(entry)]);
          if(result[0]==='rate')rate();if(result[0]==='conflict')throw new CommunityError(409,'idempotency-conflict','This case key was already used with different reviewed details.');
          if(result[0]==='gone')throw new CommunityError(410,'case-removed','That case was removed. An old retry cannot recreate it.');
          if(!['created','replayed'].includes(result[0] as string))throw new CommunityError(503,'unavailable','Case creation could not be confirmed. Retry the identical request with the same key.');
          const saved=storedCase(result[1],now),ownerToken=hmac(`delete:cases:v1:${saved.case.id}:${nonce}`);
          if(sha256(ownerToken)!==saved.deleteTokenHash)throw new CommunityError(503,'unavailable','Case ownership could not be recovered.');
          send(res,result[0]==='created'?201:200,{case:saved.case,deleteToken:ownerToken,replayed:result[0]==='replayed'});return;
        }
        requireValue(body.action==='attach');exactFields(body,['action','caseId','observationId','deleteToken','consent','website']);
        requireValue(typeof body.caseId==='string'&&UUID.test(body.caseId)&&typeof body.observationId==='string'&&UUID.test(body.observationId)
          &&typeof body.deleteToken==='string'&&CASE_CAPABILITY.test(body.deleteToken)&&body.consent===true&&body.website==='', 'Review and consent to link an observation you own.');
        const caseId=body.caseId.toLowerCase(),observationId=body.observationId.toLowerCase(),proof=sha256(body.deleteToken);
        const inspected=await evalRedis(CASE_ATTACH_READ_SCRIPT,[rows,observationRows,prefixes.cases+`attach:${bucket}:${Math.floor(now/3_600_000)}`,prefixes.cases+`global-attach:${Math.floor(now/86_400_000)}`],[caseId,observationId,proof]);
        if(inspected[0]==='rate')rate();if(inspected[0]==='case-gone')throw new CommunityError(410,'case-removed','That case is unavailable or was removed.');
        if(inspected[0]==='denied')throw new CommunityError(404,'not-found','That public observation cannot be linked with this capability.');
        if(inspected[0]!=='eligible')throw new CommunityError(503,'unavailable','The observation could not be reviewed for this case.');
        const candidate=storedCase(inspected[1],now),observation=storedCaseObservation(inspected[2],now);
        if(candidate.case.id!==caseId||observation.observation.id!==observationId||observation.deleteTokenHash!==proof)throw new CommunityError(503,'unavailable','The stored attachment could not be verified.');
        requireValue(distanceKm(candidate.case.coordinates,observation.observation.coordinates)<=candidate.case.radiusKm,'The observation location is outside this case area.');
        const attached=await evalRedis(CASE_ATTACH_SCRIPT,[rows,prefixes.cases+'members:'+caseId,observationRows],[caseId,observationId,proof,inspected[1] as string,inspected[2] as string]);
        if(attached[0]==='case-gone')throw new CommunityError(410,'case-removed','That case was removed before the observation could be linked.');
        if(attached[0]==='denied')throw new CommunityError(404,'not-found','That observation is unavailable or cannot be linked with this capability.');
        if(attached[0]==='stale')throw new CommunityError(409,'attachment-changed','The case or observation changed. Review it again before linking.');
        if(attached[0]==='full')throw new CommunityError(409,'case-full','This case already contains 200 existing public observations.');
        if(attached[0]!=='attached')throw new CommunityError(503,'unavailable','The observation link could not be confirmed. Retry the identical link request.');
        send(res,200,{attached:true});return;
      }
      exactFields(body,['id','deleteToken']);requireValue(typeof body.id==='string'&&UUID.test(body.id)&&typeof body.deleteToken==='string'&&CASE_CAPABILITY.test(body.deleteToken));
      const id=body.id.toLowerCase(),result=await evalRedis(CASE_DELETE_SCRIPT,[recent,rows,prefixes.cases+'members:'+id,prefixes.cases+`delete:${bucket}:${Math.floor(now/3_600_000)}`,prefixes.cases+'workflow:'+id],[id,sha256(body.deleteToken)]);
      if(result[0]==='rate')rate();if(result[0]==='denied')throw new CommunityError(404,'not-found','That case cannot be removed with this capability.');
      if(result[0]!=='deleted')throw new CommunityError(503,'unavailable','Case removal could not be confirmed.');send(res,200,{deleted:true});
    }catch(error){
      if(error instanceof CommunityError){if(error.status===429)res.setHeader('Retry-After','60');send(res,error.status,{error:{code:error.code,message:error.message}});}
      else send(res,503,{error:{code:'unavailable',message:'The case service is temporarily unavailable. Your local observation is unchanged.'}});
    }
  };
}
