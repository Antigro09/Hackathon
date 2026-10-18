import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunityRequestError, deleteCommunityObservation, listCommunityObservations, publishCommunityObservation } from '../src/community/client';
import type { CommunityObservationDraft } from '../src/community/types';

const observation={schemaVersion:1,inputKind:'microphone',coordinates:{latitude:39,longitude:-77},label:'Public pin',note:'',capturedAtUtc:'2026-10-18T19:00:00.000Z',durationSeconds:5,sampleRateHz:48000,sampleCount:240000,frameCount:57,algorithmVersion:'tw-screen-v2',qualityCodes:[],aDigitalDb:-40,cDigitalDb:-30,cMinusADb:10,peakScreen:'not-indicated',nearbyFacility:null,id:'00000000-0000-4000-8000-000000000001',publishedAtUtc:'2026-10-18T19:01:00.000Z',provenance:'public-self-reported',verification:'unverified',locationPrecision:'rounded-3-decimals'};
const feed={observations:[],nextCursor:null,limit:20,scanned:0,notice:'Public and unverified.'};

afterEach(()=>vi.unstubAllGlobals());
describe('community client explicit network contract',()=>{
  it('requests only the chosen map area and preserves abort semantics without automatic retry',async()=>{
    const controller=new AbortController(),fetch=vi.fn(async()=>Response.json(feed));vi.stubGlobal('fetch',fetch);
    await listCommunityObservations({center:{latitude:39,longitude:-77},radiusKm:5,limit:20},controller.signal);
    const [url,options]=fetch.mock.calls[0] as unknown as [string,RequestInit];const parsed=new URL(url,'https://tonalwatch.test');
    expect(parsed.pathname).toBe('/api/community');expect(Object.fromEntries(parsed.searchParams)).toEqual({lat:'39',lon:'-77',radiusKm:'5',limit:'20'});
    expect(options).toMatchObject({method:'GET',redirect:'error',signal:controller.signal});expect(fetch).toHaveBeenCalledOnce();
  });
  it('reuses exactly the caller publication key and payload; no observation is sent by list or module import',async()=>{
    const fetch=vi.fn(async()=>Response.json({observation,deleteToken:'a'.repeat(43),replayed:false}));vi.stubGlobal('fetch',fetch);
    expect(fetch).not.toHaveBeenCalled();
    const draft={label:'Only reviewed public text'} as CommunityObservationDraft;
    await publishCommunityObservation(draft,'retained-retry-key');
    const [,options]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('idempotency-key')).toBe('retained-retry-key');expect(JSON.parse(String(options.body))).toEqual(draft);
  });
  it('keeps delete capability out of URLs and returns safe service errors without retries',async()=>{
    const fetch=vi.fn(async()=>Response.json({error:{code:'unconfigured',message:'Community storage is not configured.'}},{status:503}));vi.stubGlobal('fetch',fetch);
    await expect(deleteCommunityObservation('public-id','private-token')).rejects.toMatchObject({name:'CommunityRequestError',status:503,code:'unconfigured'} satisfies Partial<CommunityRequestError>);
    const [url,options]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('/api/community');expect(url).not.toContain('private-token');expect(JSON.parse(String(options.body))).toEqual({id:'public-id',deleteToken:'private-token'});expect(fetch).toHaveBeenCalledOnce();
  });
  it('rejects malformed successful feeds before map rendering, including precise locations and owner fields',async()=>{
    for(const value of [null,{}, {...feed,observations:[{...observation,coordinates:{latitude:39.00001,longitude:-77}}]}, {...feed,observations:[{...observation,deleteToken:'private'}]}, {...feed,observations:[{...observation,capturedAtUtc:'not-a-date'}]}, {...feed,observations:[{...observation,verification:'verified'}]}]){
      const fetch=vi.fn(async()=>Response.json(value));vi.stubGlobal('fetch',fetch);
      await expect(listCommunityObservations({center:{latitude:39,longitude:-77}})).rejects.toMatchObject({code:'invalid-response'});expect(fetch).toHaveBeenCalledOnce();
    }
  });
  it('does not trust malformed publish/delete success or an oversized streaming proxy response',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({observation,deleteToken:'short',replayed:false})));
    await expect(publishCommunityObservation({} as CommunityObservationDraft,'key')).rejects.toMatchObject({code:'invalid-response'});
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({deleted:false})));
    await expect(deleteCommunityObservation('id','token')).rejects.toMatchObject({code:'invalid-response'});
    const cancel=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(1_048_577));},cancel}))));
    await expect(listCommunityObservations({center:{latitude:39,longitude:-77}})).rejects.toMatchObject({code:'invalid-response'});expect(cancel).toHaveBeenCalledOnce();
  });
});
