import { describe, expect, it } from 'vitest';
import { COMMUNITY_SESSION_KEY, emptyCommunitySession, readCommunitySession, validCommunitySession, writeCommunitySession } from '../src/components/communityMapSession';
import { makeCommunityDraft } from '../src/components/communityMapDraft';
import { analyzePcm } from '../src/analysis/engine';
import { syntheticMeta } from '../src/analysis/fixtures';
const key = '12345678-1234-4234-8234-123456789abc';
const draft = makeCommunityDraft(analyzePcm(new Float32Array(240000), 48000, { ...syntheticMeta('silence'), inputKind: 'microphone', recordedAtUtc: '2026-10-18T18:00:00.000Z' }), { latitude: '39.044', longitude: '-77.487', label: 'Reviewed public draft', note: '', consent: true, nearbyFacility: null });
const state = () => ({ ...emptyCommunitySession(), removal: [{ observation: { id: key, label: 'My public post', coordinates: { latitude: 39.044, longitude: -77.487 } }, deleteToken: 'a'.repeat(43) }], pending: { draft, key } });

describe('per-tab publication recovery and removal access', () => {
  it('round-trips only reviewed public draft, idempotency key and minimal removal capability', () => {
    const map = new Map<string,string>(); const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k,v); } };
    expect(writeCommunitySession(storage, state())).toBe(true);
    const recovered = readCommunitySession(storage);
    expect(recovered).toEqual(state());
    expect(recovered.pending?.key).toBe(key);
    expect(recovered.pending?.draft).not.toHaveProperty('spectrum');
    expect(map.has(COMMUNITY_SESSION_KEY)).toBe(true);
  });
  it('rejects extra private fields, unbounded entries, invalid tokens and overprecise coordinates', () => {
    for (const change of [
      (v: ReturnType<typeof state>) => Object.assign(v, { deviceSettings: 'private' }),
      (v: ReturnType<typeof state>) => { Object.assign(v.pending.draft, { audio: 'private' }); },
      (v: ReturnType<typeof state>) => { v.removal[0].deleteToken = '<script>'; },
      (v: ReturnType<typeof state>) => { v.removal[0].observation.coordinates.latitude = 39.044123; },
      (v: ReturnType<typeof state>) => { v.removal = Array(21).fill(v.removal[0]); },
      (v: ReturnType<typeof state>) => { v.pending.key = 'not-a-uuid'; },
    ]) { const value = structuredClone(state()); change(value); expect(validCommunitySession(value)).toBe(false); expect(readCommunitySession({getItem:()=>JSON.stringify(value)})).toEqual(emptyCommunitySession()); }
  });
  it('fails safely with unavailable, corrupt or oversized storage', () => {
    expect(readCommunitySession(null)).toEqual(emptyCommunitySession());
    expect(readCommunitySession({getItem:()=>'{broken'})).toEqual(emptyCommunitySession());
    expect(readCommunitySession({getItem:()=> 'x'.repeat(65537)})).toEqual(emptyCommunitySession());
    expect(writeCommunitySession(null, state())).toBe(false);
    expect(writeCommunitySession({setItem:()=>{throw new Error('blocked')}},state())).toBe(false);
  });
});
