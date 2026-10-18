import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NeighborhoodCases, { CaseObservationList, caseContainsObservation, caseInviteUrl, makeNeighborhoodCaseDraft } from '../src/components/NeighborhoodCases';
import type { CommunityObservation } from '../src/community/types';

const id = '12345678-1234-4234-8234-123456789abc';
const draftOptions = () => ({ title: '  Evening hum observations  ', neighborhood: ' Ashburn ', description: ' Public description. ', latitude: '39.043765', longitude: '-77.487446', radiusKm: 2, consent: true });
function observation(): CommunityObservation { return {
  schemaVersion: 1, inputKind: 'microphone', coordinates: { latitude: 39.044, longitude: -77.487 }, label: '<script>not HTML</script>', note: 'A resident described a recurring sound.',
  capturedAtUtc: '2026-10-18T19:00:00.000Z', durationSeconds: 15, sampleRateHz: 48000, sampleCount: 720000, frameCount: 174, algorithmVersion: 'tw-screen-v2',
  qualityCodes: ['processing-unknown'], aDigitalDb: -60, cDigitalDb: -40, cMinusADb: 20, peakScreen: 'not-indicated', nearbyFacility: null,
  id, publishedAtUtc: '2026-10-18T19:01:00.000Z', provenance: 'public-self-reported', verification: 'unverified', locationPrecision: 'rounded-3-decimals',
}; }
afterEach(() => vi.unstubAllGlobals());

describe('reviewed neighborhood cases', () => {
  it('rounds public centers before transport and creates only the public allowlist', () => {
    const draft = makeNeighborhoodCaseDraft({ ...draftOptions(), audio: 'private', aiHint: 'private', privateNotes: 'private' } as ReturnType<typeof draftOptions>);
    expect(draft.coordinates).toEqual({ latitude: 39.044, longitude: -77.487 });
    expect(draft.title).toBe('Evening hum observations');
    expect(Object.keys(draft).sort()).toEqual(['schemaVersion', 'title', 'neighborhood', 'description', 'coordinates', 'radiusKm', 'consent', 'website'].sort());
    expect(draft).not.toHaveProperty('audio'); expect(draft).not.toHaveProperty('privateNotes'); expect(draft).not.toHaveProperty('aiHint');
  });
  it('requires consent, actual finite coordinates and bounded public case text/area', () => {
    for (const change of [{ consent: false }, { latitude: '' }, { longitude: 'Infinity' }, { latitude: '86' }, { radiusKm: 0 }, { radiusKm: 25.1 }, { radiusKm: NaN }, { title: 'x'.repeat(81) }, { neighborhood: '' }, { description: 'x'.repeat(501) }]) {
      expect(() => makeNeighborhoodCaseDraft({ ...draftOptions(), ...change })).toThrow();
    }
  });
  it('checks the actual recording point against the spherical case radius', () => {
    const area = { coordinates: { latitude: 39.044, longitude: -77.487 }, radiusKm: 1 };
    expect(caseContainsObservation(area, area.coordinates)).toBe(true);
    expect(caseContainsObservation(area, { latitude: 39.048, longitude: -77.487 })).toBe(true);
    expect(caseContainsObservation(area, { latitude: 39.064, longitude: -77.487 })).toBe(false);
    expect(caseContainsObservation(area, { latitude: NaN, longitude: 0 })).toBe(false);
  });
  it('makes public invite URLs without current queries, hashes or private access', () => {
    expect(caseInviteUrl(id, 'https://tonalwatch.vercel.app/sub/?deleteToken=private#/map')).toBe(`https://tonalwatch.vercel.app/sub/#/cases/${id}`);
    expect(() => caseInviteUrl('not-a-case', 'https://tonalwatch.vercel.app')).toThrow();
  });
  it('renders an empty explicit directory without requests, GPS, invented cases or a report link', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const html = renderToStaticMarkup(createElement(NeighborhoodCases, { caseId: null, currentResult: null, onContribute: vi.fn() }));
    expect(html).toContain('Neighborhood cases'); expect(html).toContain('Search places'); expect(html).toContain('No GPS is read');
    expect(html).toContain('Find a neighborhood to begin'); expect(html).toContain('Create public case');
    expect(html).toContain('agree to publish this unverified case'); expect(html).not.toContain('Sample neighborhood');
    expect(html).not.toContain('/report'); expect(html).not.toContain('deleteToken'); expect(fetch).not.toHaveBeenCalled();
    expect(html).toMatch(/disabled="">Create public case/);
  });
  it('rejects malformed case links before making a request', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const html = renderToStaticMarkup(createElement(NeighborhoodCases, { caseId: '../private', currentResult: null, onContribute: vi.fn() }));
    expect(html).toContain('Case link not recognized'); expect(fetch).not.toHaveBeenCalled();
  });
  it('renders observations as separate unverified reports with independent peak checks and escaped text', () => {
    const html = renderToStaticMarkup(createElement(CaseObservationList, { observations: [observation()] }));
    expect(html).toContain('PUBLIC OBSERVATION · SELF-REPORTED · UNVERIFIED');
    expect(html).toContain('&lt;script&gt;not HTML&lt;/script&gt;'); expect(html).not.toContain('<script>');
    expect(html).toContain('C−A 20.0 dB · uncalibrated'); expect(html).toContain('independent check');
    expect(html).not.toContain('average'); expect(html).not.toContain('residents confirmed'); expect(html).not.toContain('deleteToken');
  });
  it('keeps quality-blocked observations descriptive and exposes their quality flags', () => {
    const reading = { ...observation(), aDigitalDb: null, cDigitalDb: null, cMinusADb: null, peakScreen: 'inconclusive' as const, qualityCodes: ['clipped' as const] };
    const html = renderToStaticMarkup(createElement(CaseObservationList, { observations: [reading] }));
    expect(html).toContain('Descriptive observation; numeric screening unavailable');
    expect(html).toContain('Sustained-peak check inconclusive'); expect(html).not.toContain('C−A 20.0');
    expect(html).toContain('Clipped input');
  });
});
