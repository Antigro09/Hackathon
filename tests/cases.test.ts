import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createCasesHandler, CASE_CREATE_SCRIPT, CASE_READ_SCRIPT, CASE_DETAIL_SCRIPT, CASE_ATTACH_READ_SCRIPT, CASE_ATTACH_SCRIPT, CASE_DELETE_SCRIPT } from '../server/cases';
import { normalizeCaseDraft, parseCaseFeed } from '../server/caseValidation';
import { feedCursor, normalizeDraft, parseFeed, sha256 } from '../server/communityValidation';
import type { NeighborhoodCaseDraft, NeighborhoodCaseCreateResult } from '../src/community/casesTypes';
import type { CommunityObservationDraft } from '../src/community/types';

const NOW=Date.parse('2026-10-18T20:00:00.000Z'),SECRET='server-only-cases-test-key';
const ENV={UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:SECRET,VERCEL:'1'};
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const CAP='o'.repeat(43);
function draft(changes:Partial<NeighborhoodCaseDraft>={}):NeighborhoodCaseDraft {
  return {schemaVersion:1,title:'Evening neighborhood observations',description:'Compare recurring noise without assuming its source.',neighborhood:'Oak Lane',coordinates:{latitude:39.043456,longitude:-77.487654},radiusKm:5,consent:true,website:'',...changes};
}
function observationRaw(n:number,changes:Partial<CommunityObservationDraft>={},cap=CAP):string {
  const draft:CommunityObservationDraft={schemaVersion:1,consent:true,inputKind:'microphone',coordinates:{latitude:39.044,longitude:-77.488},label:'Repeated recording',note:'Self-reported observation',capturedAtUtc:'2026-10-18T19:50:00.000Z',durationSeconds:15,sampleRateHz:48000,sampleCount:720000,frameCount:174,algorithmVersion:'tw-screen-v2',qualityCodes:['processing-unknown'],aDigitalDb:-42,cDigitalDb:-31,cMinusADb:11,peakScreen:'not-indicated',nearbyFacility:null,website:'',...changes};
  const {consent:_consent,website:_website,...safe}=normalizeDraft(draft,NOW);
  const observation={...safe,id:uuid(n),publishedAtUtc:new Date(NOW).toISOString(),provenance:'public-self-reported',verification:'unverified',locationPrecision:'rounded-3-decimals'};
  return JSON.stringify({observation,member:`${NOW}:${uuid(n)}`,deleteTokenHash:sha256(cap)});
}

/** Atomic script reply model. Actual Lua receives a separate isolated-Redis QA. */
class CasesRedis {
  rows=new Map<string,string>();observations=new Map<string,string>();members=new Map<string,Set<string>>();
  recent:string[]=[];idem=new Map<string,{hash:string;id:string}>();counters=new Map<string,number>();
  calls:string[][]=[];error:string|null=null;beforeAttach:(()=>void)|null=null;
  increment(key:string){const n=(this.counters.get(key)??0)+1;this.counters.set(key,n);return n;}
  fetch=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
    expect(String(url)).toBe('https://test.upstash.io/');expect(init?.method).toBe('POST');expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
    const command=JSON.parse(String(init?.body)) as string[];this.calls.push(command);expect(command[0]).toBe('EVAL');
    const count=Number(command[2]),keys=command.slice(3,3+count),args=command.slice(3+count);
    expect(keys.every(key=>key.startsWith('tw:cases:v1:')||key.startsWith('tw:community:v1:')||key.startsWith('tw:qa:'))).toBe(true);
    if(this.error)return Response.json({error:this.error});
    const setFor=(key:string)=>{if(!this.members.has(key))this.members.set(key,new Set());return this.members.get(key)!;};
    let result:unknown;
    if(command[1]===CASE_CREATE_SCRIPT){
      const old=this.idem.get(keys[2]);
      if(old)result=old.hash!==args[0]?['conflict']:this.rows.has(old.id)?['replayed',this.rows.get(old.id)]:['gone'];
      else if(this.increment(keys[3])>10||this.increment(keys[4])>1000)result=['rate'];
      else{this.rows.set(args[1],args[3]);this.recent.push(args[2]);this.recent.sort().reverse();this.idem.set(keys[2],{hash:args[0],id:args[1]});result=['created',args[3]];}
    }else if(command[1]===CASE_READ_SCRIPT){
      result=this.increment(keys[2])>120?['rate']:['rows',this.recent.filter(member=>args[0]==='+'||member<args[0].slice(1)).slice(0,500).filter(member=>this.rows.has(member.slice(14))).map(member=>[member,this.rows.get(member.slice(14))])];
    }else if(command[1]===CASE_DETAIL_SCRIPT){
      if(this.increment(keys[3])>120)result=['rate'];
      else if(!this.rows.has(args[0]))result=['missing'];
      else{const ids=[...setFor(keys[1])];result=ids.length>200?['invalid']:['detail',this.rows.get(args[0]),ids.filter(id=>this.observations.has(id)).map(id=>[id,this.observations.get(id)])];}
    }else if(command[1]===CASE_ATTACH_READ_SCRIPT){
      if(this.increment(keys[2])>60||this.increment(keys[3])>5000)result=['rate'];
      else if(!this.rows.has(args[0]))result=['case-gone'];
      else{const obs=this.observations.get(args[1]);if(!obs)result=['denied'];else{try{result=JSON.parse(obs).deleteTokenHash===args[2]?['eligible',this.rows.get(args[0]),obs]:['denied'];}catch{result=['invalid'];}}}
    }else if(command[1]===CASE_ATTACH_SCRIPT){
      this.beforeAttach?.();this.beforeAttach=null;
      const row=this.rows.get(args[0]),obs=this.observations.get(args[1]);
      if(!row)result=['case-gone'];else if(!obs)result=['denied'];else if(row!==args[3]||obs!==args[4])result=['stale'];
      else if(JSON.parse(obs).deleteTokenHash!==args[2])result=['denied'];
      else{const members=setFor(keys[1]);if(members.size>200)result=['invalid'];else{for(const id of members)if(!this.observations.has(id))members.delete(id);if(members.has(args[1]))result=['attached'];else if(members.size>=200)result=['full'];else{members.add(args[1]);result=['attached'];}}}
    }else if(command[1]===CASE_DELETE_SCRIPT){
      if(this.increment(keys[3])>30)result=['rate'];else{const row=this.rows.get(args[0]);if(!row)result=['deleted'];else if(JSON.parse(row).deleteTokenHash!==args[1])result=['denied'];else{this.rows.delete(args[0]);this.recent=this.recent.filter(member=>member!==JSON.parse(row).member);this.members.delete(keys[2]);result=['deleted'];}}
    }else throw Error('Unexpected script');
    return Response.json({result});
  });
}
function fixture(redis=new CasesRedis(),env:Record<string,string|undefined>=ENV,testPrefixes?:{cases:string;community:string}){
  let n=1;const handler=createCasesHandler({env,fetch:redis.fetch as typeof fetch,now:()=>NOW,uuid:()=>uuid(n++),testPrefixes});
  return {redis,handler};
}
async function invoke(handler:ReturnType<typeof createCasesHandler>,method='GET',path='/api/cases?lat=39.043&lon=-77.488&radiusKm=10',body?:unknown,headers:Record<string,string>={},raw?:string){
  const req=Readable.from(raw===undefined?[]:[Buffer.from(raw)]) as unknown as IncomingMessage&{body?:unknown};
  req.method=method;req.url=path;req.headers={host:'tonalwatch.test',origin:'https://tonalwatch.test','content-type':'application/json','x-forwarded-for':'203.0.113.12',...headers};if(body!==undefined)req.body=body;
  const responseHeaders:Record<string,string>={};let rawResponse='';
  const res={statusCode:200,setHeader:(key:string,value:string)=>{responseHeaders[key.toLowerCase()]=String(value);},end:(value:string)=>{rawResponse=value;}} as unknown as ServerResponse;
  await handler(req,res);return {status:res.statusCode,headers:responseHeaders,body:JSON.parse(rawResponse)};
}
const create=(f:ReturnType<typeof fixture>,nonce=101,value:unknown=draft())=>invoke(f.handler,'POST','/api/cases',{action:'create',draft:value},{'idempotency-key':uuid(nonce)});
const attach=(f:ReturnType<typeof fixture>,caseId:string,n=501,cap=CAP)=>invoke(f.handler,'POST','/api/cases',{action:'attach',caseId,observationId:uuid(n),deleteToken:cap,consent:true,website:''});
const detail=(f:ReturnType<typeof fixture>,caseId:string)=>invoke(f.handler,'GET','/api/cases?id='+caseId);

describe('neighborhood case creation, ownership and public boundaries',()=>{
  it('persists rounded cases across clients without exposing caps, raw IP or participant counts',async()=>{
    const f=fixture(),created=await create(f);expect(created.status).toBe(201);
    const value=created.body as NeighborhoodCaseCreateResult;
    expect(value.case.coordinates).toEqual({latitude:39.043,longitude:-77.488});
    expect(value.case).toMatchObject({schemaVersion:1,provenance:'public-self-reported',verification:'unverified',locationPrecision:'rounded-3-decimals'});
    const other=fixture(f.redis),feed=await invoke(other.handler),page=await detail(other,value.case.id);
    expect(feed.body.cases).toEqual([value.case]);expect(page.body.observations).toEqual([]);expect(page.body.limit).toBe(200);
    const publicText=JSON.stringify([feed.body,page.body]);
    expect(publicText).not.toContain(value.deleteToken);expect(publicText).not.toContain('deleteTokenHash');expect(publicText).not.toContain('203.0.113.12');
    expect(publicText).not.toMatch(/participantCount|residentCount|observationCount/);
    expect(page.body.notice).toContain('not independent residents');expect(feed.headers['cache-control']).toBe('no-store');
    const stored=[...f.redis.rows.values()].join('');expect(stored).not.toContain(value.deleteToken);expect(stored).not.toContain('consent');
    expect(JSON.stringify(f.redis.calls)).not.toContain('203.0.113.12');
  });
  it('deduplicates concurrent create retries and permanently refuses deleted replay keys',async()=>{
    const f=fixture(),results=await Promise.all([create(f),create(f)]);
    expect(results.map(result=>result.status).sort()).toEqual([200,201]);expect(f.redis.rows.size).toBe(1);
    expect(results[0].body.deleteToken).toBe(results[1].body.deleteToken);
    expect((await create(f,101,draft({description:'Changed'}))).status).toBe(409);
    const saved=results[0].body as NeighborhoodCaseCreateResult;
    expect((await invoke(f.handler,'DELETE','/api/cases',{id:saved.case.id,deleteToken:saved.deleteToken})).status).toBe(200);
    expect((await create(f)).status).toBe(410);expect(f.redis.rows.size).toBe(0);expect(f.redis.idem.size).toBe(1);
  });
  it('requires consent and exact fields; rejects source/AI/audio/identity claims and malformed area/text',async()=>{
    const f=fixture();
    for(const value of [draft({consent:false as true}),draft({website:'spam' as ''}),draft({radiusKm:0}),draft({radiusKm:26}),draft({title:''}),draft({title:'x'.repeat(81)}),draft({description:'x'.repeat(501)}),draft({neighborhood:'x'.repeat(101)}),draft({title:'unsafe\u0000title'}),draft({coordinates:{latitude:Infinity,longitude:0}}),{...draft(),audio:[1]},{...draft(),residentCount:4},{...draft(),sourceVerified:true}])expect((await create(f,101,value)).status).toBe(400);
    expect((await invoke(f.handler,'POST','/api/cases',{action:'create',draft:draft(),privateContext:{}},{'idempotency-key':uuid(101)})).status).toBe(400);
    expect(f.redis.fetch).not.toHaveBeenCalled();
    const original=draft(),before=structuredClone(original);normalizeCaseDraft(original);expect(original).toEqual(before);
  });
  it('requires same-origin bounded JSON and supports streamed reviewed requests',async()=>{
    const f=fixture(),body={action:'create',draft:draft()};
    for(const headers of [{origin:'https://evil.test'},{origin:''},{'sec-fetch-site':'cross-site'}] as Record<string,string>[])expect((await invoke(f.handler,'POST','/api/cases',body,{...headers,'idempotency-key':uuid(101)})).status).toBe(403);
    expect((await invoke(f.handler,'POST','/api/cases',body,{'content-length':'16385'})).status).toBe(413);
    expect((await invoke(f.handler,'POST','/api/cases',body,{'content-type':'text/plain'})).status).toBe(415);
    expect((await invoke(f.handler,'POST','/api/cases',undefined,{},' '.repeat(16385))).status).toBe(413);
    expect((await invoke(f.handler,'POST','/api/cases',undefined,{'idempotency-key':uuid(101)},JSON.stringify(body))).status).toBe(201);
    expect((await invoke(f.handler,'OPTIONS')).status).toBe(405);
  });
});

describe('linking existing observations with publisher proof',()=>{
  it('requires observation ownership, consent and a live in-area observation; duplicate links stay one member',async()=>{
    const f=fixture(),created=(await create(f)).body as NeighborhoodCaseCreateResult;
    f.redis.observations.set(uuid(501),observationRaw(501));
    expect((await attach(f,created.case.id,501,'a'.repeat(43))).status).toBe(404);
    expect((await attach(f,created.case.id,501,created.deleteToken)).status).toBe(404);
    expect((await attach(f,created.case.id,999)).status).toBe(404);
    expect((await attach(f,created.case.id)).body).toEqual({attached:true});expect((await attach(f,created.case.id)).status).toBe(200);
    const page=await detail(f,created.case.id);expect(page.body.observations).toHaveLength(1);expect(page.body.observations[0].id).toBe(uuid(501));
    expect(JSON.stringify(page.body)).not.toContain(CAP);expect(JSON.stringify(page.body)).not.toContain('deleteTokenHash');
    f.redis.observations.set(uuid(502),observationRaw(502,{coordinates:{latitude:40,longitude:-75}}));
    expect((await attach(f,created.case.id,502)).status).toBe(400);
    const malformed={action:'attach',caseId:created.case.id,observationId:uuid(501),deleteToken:CAP,consent:false,website:''};
    expect((await invoke(f.handler,'POST','/api/cases',malformed)).status).toBe(400);
    expect((await invoke(f.handler,'POST','/api/cases',{...malformed,consent:true,coordinates:{latitude:39,longitude:-77}})).status).toBe(400);
  });
  it('omits removed observations atomically and frees their references before enforcing the 200 limit',async()=>{
    const f=fixture(),saved=(await create(f)).body as NeighborhoodCaseCreateResult,key='tw:cases:v1:members:'+saved.case.id;
    const members=new Set<string>();for(let n=1000;n<1200;n++){f.redis.observations.set(uuid(n),observationRaw(n));members.add(uuid(n));}f.redis.members.set(key,members);
    f.redis.observations.set(uuid(501),observationRaw(501));expect((await attach(f,saved.case.id)).body.error.code).toBe('case-full');
    f.redis.observations.delete(uuid(1000));
    const before=await detail(f,saved.case.id);expect(before.body.observations).toHaveLength(199);expect(members.size).toBe(200);
    expect((await attach(f,saved.case.id)).status).toBe(200);expect(members.size).toBe(200);expect(members.has(uuid(1000))).toBe(false);
    expect((await detail(f,saved.case.id)).body.observations).toHaveLength(200);
  });
  it.each(['case-deleted','observation-deleted','observation-changed'])('atomically prevents stale attachment race: %s',async race=>{
    const f=fixture(),saved=(await create(f)).body as NeighborhoodCaseCreateResult;f.redis.observations.set(uuid(501),observationRaw(501));
    f.redis.beforeAttach=()=>{if(race==='case-deleted')f.redis.rows.delete(saved.case.id);else if(race==='observation-deleted')f.redis.observations.delete(uuid(501));else f.redis.observations.set(uuid(501),observationRaw(501,{note:'Changed by an operator'}));};
    const result=await attach(f,saved.case.id);expect(result.status).toBe(race==='case-deleted'?410:race==='observation-deleted'?404:409);
    expect(f.redis.members.get('tw:cases:v1:members:'+saved.case.id)?.size??0).toBe(0);
  });
  it('case deletion requires its own capability and never deletes existing public observations',async()=>{
    const f=fixture(),saved=(await create(f)).body as NeighborhoodCaseCreateResult;f.redis.observations.set(uuid(501),observationRaw(501));await attach(f,saved.case.id);
    expect((await invoke(f.handler,'DELETE','/api/cases',{id:saved.case.id,deleteToken:CAP})).status).toBe(404);
    expect((await invoke(f.handler,'DELETE','/api/cases',{id:saved.case.id,deleteToken:saved.deleteToken})).body).toEqual({deleted:true});
    expect(f.redis.observations.has(uuid(501))).toBe(true);expect((await detail(f,saved.case.id)).status).toBe(404);
    expect((await attach(f,saved.case.id)).status).toBe(410);
  });
  it('fails closed on malformed stored cases/observations rather than leaking private or fabricated fields',async()=>{
    const f=fixture(),saved=(await create(f)).body as NeighborhoodCaseCreateResult;
    const raw=JSON.parse(observationRaw(501));raw.observation.privateContext='private-test-value';f.redis.observations.set(uuid(501),JSON.stringify(raw));
    const linked=await attach(f,saved.case.id);expect(linked.status).toBe(503);expect(JSON.stringify(linked.body)).not.toContain('private-test-value');
    f.redis.members.set('tw:cases:v1:members:'+saved.case.id,new Set([uuid(501)]));expect((await detail(f,saved.case.id)).status).toBe(503);
    f.redis.rows.set(saved.case.id,'{"case":"invalid"}');expect((await invoke(f.handler)).status).toBe(503);expect((await detail(f,saved.case.id)).status).toBe(503);
  });
});

describe('bounded feeds, provider failures and abuse controls',()=>{
  it('bounds regions, preserves equal-time pagination and rejects cross-area/community cursors',async()=>{
    const f=fixture();await create(f,101,draft({title:'First'}));await create(f,102,draft({title:'Second'}));await create(f,103,draft({title:'Elsewhere',coordinates:{latitude:40,longitude:-75}}));
    const first=await invoke(f.handler,'GET','/api/cases?lat=39.043&lon=-77.488&radiusKm=10&limit=1');expect(first.body.cases.map((item:{title:string})=>item.title)).toEqual(['Second']);
    const cursor=first.body.nextCursor;expect(cursor).toBeTruthy();
    const second=await invoke(f.handler,'GET','/api/cases?lat=39.043&lon=-77.488&radiusKm=10&limit=1&cursor='+cursor);expect(second.body.cases.map((item:{title:string})=>item.title)).toEqual(['First']);
    expect((await invoke(f.handler,'GET','/api/cases?lat=40&lon=-75&cursor='+cursor)).status).toBe(400);
    const ordinary=parseFeed(new URLSearchParams('lat=39.043&lon=-77.488&radiusKm=10'));
    const otherCursor=feedCursor(`${NOW}:${uuid(2)}`,ordinary.fingerprint);
    expect((await invoke(f.handler,'GET','/api/cases?lat=39.043&lon=-77.488&radiusKm=10&cursor='+otherCursor)).status).toBe(400);
    expect((await invoke(f.handler,'GET','/api/cases?bbox=-77.5,39.03,-77.47,39.06')).body.cases).toHaveLength(2);
  });
  it('rejects unbounded, duplicated, extra-field and invalid detail queries before provider calls',async()=>{
    const f=fixture();for(const query of ['', '?lat=0&lon=0&radiusKm=26','?bbox=-180,-85,180,85','?lat=0&lon=0&limit=201','?lat=0&lat=1&lon=0','?lat=0&lon=0&audio=1','?lat=0&lon=0&cursor=bad','?id='+uuid(1)+'&lat=0','?id='+uuid(1)+'&id='+uuid(2),'?id=bad'])expect((await invoke(f.handler,'GET','/api/cases'+query)).status).toBe(400);
    expect(f.redis.fetch).not.toHaveBeenCalled();expect(()=>parseCaseFeed(new URLSearchParams('lat=0&lon=0&cursor=a&cursor=b'))).toThrow();
  });
  it('fails safely when unconfigured, credentials are partial or provider replies are errors/oversized',async()=>{
    for(const env of [{},{UPSTASH_REDIS_REST_URL:ENV.UPSTASH_REDIS_REST_URL,KV_REST_API_TOKEN:SECRET},{KV_REST_API_URL:ENV.UPSTASH_REDIS_REST_URL}]){const f=fixture(new CasesRedis(),env);expect((await invoke(f.handler)).status).toBe(503);expect(f.redis.fetch).not.toHaveBeenCalled();}
    const alias=fixture(new CasesRedis(),{UPSTASH_REDIS_REST_URL:' ',UPSTASH_REDIS_REST_TOKEN:'',KV_REST_API_URL:ENV.UPSTASH_REDIS_REST_URL,KV_REST_API_TOKEN:SECRET,VERCEL:'1'});expect((await create(alias)).status).toBe(201);
    const f=fixture();f.redis.error='provider-secret '+SECRET;const failed=await create(f);expect(failed.status).toBe(503);expect(JSON.stringify(failed.body)).not.toContain(SECRET);
    const huge=createCasesHandler({env:ENV,fetch:async()=>new Response('x'.repeat(2_000_001))});expect((await invoke(huge)).status).toBe(503);
  });
  it('limits creates, attachments and reads while keeping identical create retries recoverable',async()=>{
    const f=fixture();for(let n=0;n<10;n++)expect((await create(f,100+n)).status).toBe(201);
    expect((await create(f,999)).status).toBe(429);expect((await create(f,100)).status).toBe(200);
    const limited=await create(f,998);expect(limited.headers['retry-after']).toBe('60');
    const g=fixture(),saved=(await create(g)).body as NeighborhoodCaseCreateResult;g.redis.observations.set(uuid(501),observationRaw(501));
    for(let n=0;n<60;n++)expect((await attach(g,saved.case.id)).status).toBe(200);expect((await attach(g,saved.case.id)).status).toBe(429);
    for(let n=0;n<120;n++)expect((await invoke(g.handler)).status).toBe(200);expect((await detail(g,saved.case.id)).status).toBe(429);
  });
  it('permits isolated QA namespaces only through an explicit dependency, never environment/request input',async()=>{
    const prefixes={cases:'tw:qa:case-test:',community:'tw:qa:observation-test:'},f=fixture(new CasesRedis(),ENV,prefixes);await create(f);
    const command=f.redis.calls[0],keys=command.slice(3,3+Number(command[2]));expect(keys.every(key=>key.startsWith(prefixes.cases))).toBe(true);
    expect(()=>createCasesHandler({testPrefixes:{cases:'tw:cases:v1:',community:'tw:community:v1:'}})).toThrow('Test prefixes');
  });
});
