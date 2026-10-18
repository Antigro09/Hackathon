import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createCommunityHandler, COMMUNITY_CREATE_SCRIPT, COMMUNITY_READ_SCRIPT, COMMUNITY_DELETE_SCRIPT } from '../server/community';
import { normalizeDraft, parseFeed } from '../server/communityValidation';
import type { CommunityObservationDraft, CommunityPublishResult, CommunityFeed } from '../src/community/types';

const NOW = Date.parse('2026-10-18T20:00:00.000Z');
const SECRET = 'server-only-test-credential';
const ENV = { UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:SECRET,VERCEL:'1' };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function draft(overrides: Partial<CommunityObservationDraft> = {}): CommunityObservationDraft {
  return { schemaVersion:1,consent:true,inputKind:'microphone',coordinates:{latitude:39.043456,longitude:-77.487654},label:'Roadside observation',note:'Public note only',capturedAtUtc:'2026-10-18T19:50:00.000Z',durationSeconds:15,sampleRateHz:48000,sampleCount:720000,frameCount:174,algorithmVersion:'tw-screen-v2',qualityCodes:['processing-unknown'],aDigitalDb:-42,cDigitalDb:-31,cMinusADb:11,peakScreen:'not-indicated',nearbyFacility:{osmType:'way',osmId:'12345',name:'Mapped site reference'},website:'',...overrides };
}
/** Stateful REST service double: independent handlers see the same persisted rows.
 * It checks the Redis wire boundary and models atomic script replies; live Lua is
 * additionally checked against provisioned Redis before production qualification.
 */
class RedisRest {
  rows = new Map<string,string>();
  members: string[] = [];
  idem = new Map<string,{hash:string;id:string}>();
  counters = new Map<string,number>();
  calls: unknown[][] = [];
  error: string | null = null;
  increment(key: string) { const n=(this.counters.get(key)??0)+1;this.counters.set(key,n);return n; }
  fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe('https://test.upstash.io/');
    expect(init?.method).toBe('POST');expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
    const command = JSON.parse(String(init?.body)) as string[];this.calls.push(command);
    expect(command[0]).toBe('EVAL');const count=Number(command[2]),keys=command.slice(3,3+count),args=command.slice(3+count);
    expect(keys.every(k=>k.startsWith('tw:community:v1:'))).toBe(true);
    if(this.error)return Response.json({error:this.error});
    let result: unknown;
    if(command[1]===COMMUNITY_CREATE_SCRIPT) {
      const previous=this.idem.get(keys[2]);
      if(previous)result=previous.hash!==args[0]?['conflict']:this.rows.has(previous.id)?['replayed',this.rows.get(previous.id)]:['gone'];
      else if(this.increment(keys[3])>10||this.increment(keys[4])>1000)result=['rate'];
      else {this.rows.set(args[1],args[3]);this.members.push(args[2]);this.members.sort().reverse();this.idem.set(keys[2],{hash:args[0],id:args[1]});result=['created',args[3]];}
    }else if(command[1]===COMMUNITY_READ_SCRIPT) {
      result=this.increment(keys[2])>120?['rate']:['rows',this.members.filter(m=>args[0]==='+'||m<args[0].slice(1)).slice(0,500).map(m=>[m,this.rows.get(m.slice(14))])];
    }else if(command[1]===COMMUNITY_DELETE_SCRIPT) {
      if(this.increment(keys[2])>30)result=['rate'];
      else {const row=this.rows.get(args[0]);if(!row)result=['deleted'];else if(JSON.parse(row).deleteTokenHash!==args[1])result=['denied'];else {this.rows.delete(args[0]);this.members=this.members.filter(m=>m!==JSON.parse(row).member);result=['deleted'];}}
    }else throw Error('Unapproved Redis script');
    return Response.json({result});
  });
}
function fixture(redis=new RedisRest(), env: Record<string,string | undefined> = ENV) {
  let next=1, now=NOW;
  const handler=createCommunityHandler({env,fetch:redis.fetch as typeof fetch,now:()=>now,uuid:()=>id(next++)});
  return {redis,handler,setNow:(n: number)=>{now=n;}};
}
async function invoke(h: ReturnType<typeof createCommunityHandler>, method='GET', path='/api/community?lat=39.043&lon=-77.488&radiusKm=10', body?: unknown, headers: Record<string,string> = {}, raw?: string) {
  const req=Readable.from(raw===undefined?[]:[Buffer.from(raw)]) as unknown as IncomingMessage & {body?:unknown};
  req.method=method;req.url=path;req.headers={host:'tonalwatch.test',origin:'https://tonalwatch.test','content-type':'application/json','x-forwarded-for':'203.0.113.12',...headers};
  if(body!==undefined)req.body=body;
  const responseHeaders: Record<string,string>={};let text='';
  const res={statusCode:200,setHeader:(key:string,value:string)=>{responseHeaders[key.toLowerCase()]=String(value);},end:(s:string)=>{text=s;}} as unknown as ServerResponse;
  await h(req,res);return {status:res.statusCode,headers:responseHeaders,body:JSON.parse(text)};
}
async function publish(f: ReturnType<typeof fixture>, n=101, value: unknown=draft()) {return invoke(f.handler,'POST','/api/community',value,{'idempotency-key':id(n)});}

describe('public community storage and ownership',()=>{
  it('persists shared pins across handler instances, rounds on server, and never lists owner capabilities',async()=>{
    const f=fixture();const created=await publish(f);expect(created.status).toBe(201);
    const p=created.body as CommunityPublishResult;
    expect(p.observation.coordinates).toEqual({latitude:39.043,longitude:-77.488});
    expect(p.observation).toMatchObject({provenance:'public-self-reported',verification:'unverified',locationPrecision:'rounded-3-decimals',publishedAtUtc:'2026-10-18T20:00:00.000Z'});
    expect(p.deleteToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const other=fixture(f.redis),feed=await invoke(other.handler);
    expect(feed.status).toBe(200);expect(feed.body.observations).toEqual([p.observation]);
    expect(JSON.stringify(feed.body)).not.toContain(p.deleteToken);expect(JSON.stringify(feed.body)).not.toContain('deleteTokenHash');expect(JSON.stringify(feed.body)).not.toContain('203.0.113.12');
    const persisted=[...f.redis.rows.values()].join('');expect(persisted).not.toContain(p.deleteToken);expect(persisted).not.toContain('203.0.113.12');expect(persisted).not.toContain('consent');
    expect(JSON.stringify(f.redis.calls)).not.toContain('203.0.113.12');
    expect(feed.headers['cache-control']).toBe('no-store');expect(feed.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('atomically deduplicates concurrent identical keys and preserves capability on network retries',async()=>{
    const f=fixture(),results=await Promise.all([publish(f),publish(f)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,201]);expect(f.redis.rows.size).toBe(1);
    expect(results[0].body.observation).toEqual(results[1].body.observation);expect(results[0].body.deleteToken).toBe(results[1].body.deleteToken);
    expect((await publish(f,101,draft({note:'Changed after review'}))).status).toBe(409);expect(f.redis.rows.size).toBe(1);
  });
  it('requires the private deletion token and cannot recreate a removed pin with an old retry key',async()=>{
    const f=fixture(),created=(await publish(f)).body as CommunityPublishResult;
    const denied=await invoke(f.handler,'DELETE','/api/community',{id:created.observation.id,deleteToken:'a'.repeat(43)});expect(denied.status).toBe(404);expect(f.redis.rows.size).toBe(1);
    const deleted=await invoke(f.handler,'DELETE','/api/community',{id:created.observation.id,deleteToken:created.deleteToken});expect(deleted).toMatchObject({status:200,body:{deleted:true}});
    expect((await invoke(f.handler)).body.observations).toEqual([]);expect((await publish(f)).status).toBe(410);
  });
  it('fails explicitly when unconfigured or Redis fails without leaking provider messages or credentials',async()=>{
    const no=fixture(new RedisRest(),{});expect((await invoke(no.handler)).status).toBe(503);expect(no.redis.fetch).not.toHaveBeenCalled();
    const f=fixture();f.redis.error=`Credentials ${SECRET} or internal database unavailable`;
    const response=await publish(f);expect(response.status).toBe(503);expect(JSON.stringify(response.body)).not.toContain(SECRET);expect(response.body.error.code).toBe('unavailable');
  });
  it('accepts a complete KV alias pair behind empty template primaries and never mixes partial providers',async()=>{
    const alias=fixture(new RedisRest(),{UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:' ',KV_REST_API_URL:ENV.UPSTASH_REDIS_REST_URL,KV_REST_API_TOKEN:SECRET,VERCEL:'1'});
    expect((await publish(alias)).status).toBe(201);expect(alias.redis.rows.size).toBe(1);
    for(const configuration of [
      {UPSTASH_REDIS_REST_URL:'https://test.upstash.io',KV_REST_API_TOKEN:SECRET},
      {UPSTASH_REDIS_REST_TOKEN:SECRET,KV_REST_API_URL:'https://test.upstash.io'},
      {UPSTASH_REDIS_REST_URL:'https://test.upstash.io',KV_REST_API_URL:'https://test.upstash.io',KV_REST_API_TOKEN:SECRET},
      {KV_REST_API_URL:'https://test.upstash.io'},
    ]) {const invalid=fixture(new RedisRest(),configuration);expect((await invoke(invalid.handler)).status).toBe(503);expect(invalid.redis.fetch).not.toHaveBeenCalled();}
  });
});

describe('community public boundary and analysis provenance',()=>{
  it('rejects missing consent, nonmicrophone, private context, audio, bins and spoofed fields before storage',async()=>{
    const f=fixture();
    const invalid=[{...draft(),consent:false},{...draft(),inputKind:'synthetic'},{...draft(),audio:[1,2]},{...draft(),spectrum:{hz:[1]}},{...draft(),aiScore:.9},{...draft(),ip:'203.0.113.1'},{...draft(),context:{locationDescription:'private'}},{...draft(),id:id(999)},{...draft(),website:'spam'}];
    for(const value of invalid)expect((await publish(f,101,value)).status).toBe(400);
    expect(f.redis.fetch).not.toHaveBeenCalled();
  });
  it('accepts 5/15/30 and native sample counts, actual early-exit zero frames, and strips blocked numeric claims',async()=>{
    const f=fixture();let n=100;
    for(const rate of [44100,48000] as const)for(const duration of [5,15,30] as const){const count=rate*duration;const response=await publish(f,n++,draft({durationSeconds:duration,sampleRateHz:rate,sampleCount:count,frameCount:Math.floor((count-8192)/4096)+1}));expect(response.status).toBe(201);expect(response.body.observation.sampleCount).toBe(count);}
    const silent=await publish(f,n++,draft({qualityCodes:['near-zero'],frameCount:0,aDigitalDb:null,cDigitalDb:null,cMinusADb:null}));expect(silent.status).toBe(201);expect(silent.body.observation.frameCount).toBe(0);
    const clipped=await publish(f,n++,draft({qualityCodes:['clipped'],peakScreen:'suggested'}));expect(clipped.status).toBe(201);expect(clipped.body.observation).toMatchObject({aDigitalDb:null,cDigitalDb:null,cMinusADb:null,peakScreen:'inconclusive'});
  });
  it('rejects inconsistent DSP metadata, bad coordinates/times/numbers/text and facility coordinate substitution',async()=>{
    const f=fixture();const invalid=[draft({sampleCount:1}),draft({frameCount:0}),draft({cMinusADb:42}),draft({algorithmVersion:'unsupported' as 'tw-screen-v2'}),draft({coordinates:{latitude:NaN,longitude:0}}),draft({coordinates:{latitude:0,longitude:181}}),draft({capturedAtUtc:'2026-10-19T00:00:00Z'}),draft({capturedAtUtc:'not-a-time'}),draft({label:'x'.repeat(81)}),draft({note:'x'.repeat(281)}),draft({qualityCodes:['fake' as never]}),{...draft(),nearbyFacility:{osmType:'way',osmId:'123',name:'Reference',coordinates:{latitude:1,longitude:2}}}];
    for(const value of invalid)expect((await publish(f,101,value)).status).toBe(400);expect(f.redis.fetch).not.toHaveBeenCalled();
  });
  it('requires same-origin writes and valid bounded JSON, including streamed bodies',async()=>{
    const f=fixture();
    expect((await invoke(f.handler,'POST','/api/community',draft(),{origin:'https://evil.example','idempotency-key':id(101)})).status).toBe(403);
    expect((await invoke(f.handler,'POST','/api/community',draft(),{origin:'','idempotency-key':id(101)})).status).toBe(403);
    expect((await invoke(f.handler,'POST','/api/community',draft(),{'content-length':'16385','idempotency-key':id(101)})).status).toBe(413);
    expect((await invoke(f.handler,'POST','/api/community',draft(),{'content-type':'text/plain','idempotency-key':id(101)})).status).toBe(415);
    expect((await invoke(f.handler,'POST','/api/community',undefined,{'idempotency-key':id(101)},' '.repeat(16385))).status).toBe(413);
    expect((await invoke(f.handler,'POST','/api/community',undefined,{'idempotency-key':id(101)},JSON.stringify(draft()))).status).toBe(201);
    expect((await invoke(f.handler,'OPTIONS')).status).toBe(405);
  });
});

describe('bounded community feed and abuse controls',()=>{
  it('uses geographic bounds and cursor pagination without exposing other-region pins or losing equal-time IDs',async()=>{
    const f=fixture();await publish(f,101,draft({label:'First'}));await publish(f,102,draft({label:'Second'}));await publish(f,103,draft({label:'Other region',coordinates:{latitude:40,longitude:-75}}));
    const first=await invoke(f.handler,'GET','/api/community?lat=39.043&lon=-77.488&radiusKm=10&limit=1');expect(first.status).toBe(200);
    const page=first.body as CommunityFeed;expect(page.observations.map(x=>x.label)).toEqual(['Second']);expect(page.nextCursor).toBeTruthy();
    const second=await invoke(f.handler,'GET','/api/community?lat=39.043&lon=-77.488&radiusKm=10&limit=1&cursor='+page.nextCursor);expect(second.body.observations.map((x:CommunityObservationDraft)=>x.label)).toEqual(['First']);
    expect((await invoke(f.handler,'GET','/api/community?lat=40&lon=-75&radiusKm=10&cursor='+page.nextCursor)).status).toBe(400);
    const box=await invoke(f.handler,'GET','/api/community?bbox=-77.5,39.03,-77.47,39.06');expect(box.body.observations).toHaveLength(2);
  });
  it('rejects global, oversized, malformed, duplicated and incompatible read queries before Redis',async()=>{
    const f=fixture();for(const query of ['', '?lat=0&lon=0&radiusKm=26','?bbox=-180,-85,180,85','?lat=0&lon=0&limit=201','?lat=0&lat=1&lon=0','?lat=0&lon=0&audio=1','?lat=0&lon=0&cursor=bad','?lat=0&lon=0&bbox=0,0,1,1'])expect((await invoke(f.handler,'GET','/api/community'+query)).status).toBe(400);
    expect(f.redis.fetch).not.toHaveBeenCalled();
  });
  it('limits anonymous publication atomically without persisting raw addresses or retrying writes automatically',async()=>{
    const f=fixture();for(let i=0;i<10;i++)expect((await publish(f,101+i)).status).toBe(201);
    const limited=await publish(f,999);expect(limited.status).toBe(429);expect(limited.headers['retry-after']).toBe('60');expect(f.redis.rows.size).toBe(10);
    expect((await publish(f,101)).status).toBe(200);expect(f.redis.rows.size).toBe(10);
  });
  it('normalizes only explicit public copies, leaving original analysis/draft objects unchanged',()=>{
    const value=draft(),before=structuredClone(value);const safe=normalizeDraft(value,NOW);expect(value).toEqual(before);expect(safe.coordinates).not.toEqual(value.coordinates);
    expect(()=>parseFeed(new URLSearchParams('lat=&lon=0'))).toThrow();
  });
});
