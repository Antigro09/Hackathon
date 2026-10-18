import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCaseObservation, createNeighborhoodCase, deleteNeighborhoodCase, getNeighborhoodCase, isNeighborhoodCase, isNeighborhoodCaseDetail, listNeighborhoodCases } from '../src/community/casesClient';
import type { NeighborhoodCase, NeighborhoodCaseDraft } from '../src/community/casesTypes';
import type { CommunityObservation } from '../src/community/types';

const id = 'a1111111-1111-4111-8111-111111111111';
const postId = 'b2222222-2222-4222-8222-222222222222';
const key = 'c3333333-3333-4333-8333-333333333333';
const token = 'A'.repeat(43);
const entry: NeighborhoodCase = { schemaVersion: 1, id, title: 'Recurring evening hum', neighborhood: 'Example neighborhood', description: 'Reports gathered for review.',
  coordinates: { latitude: 38.9, longitude: -77.4 }, radiusKm: 5, createdAtUtc: '2026-10-18T20:00:00.000Z',
  provenance: 'public-self-reported', verification: 'unverified', locationPrecision: 'rounded-3-decimals' };
const draft = (): NeighborhoodCaseDraft => { const { id: _id, createdAtUtc: _time, provenance: _provenance, verification: _verification, locationPrecision: _precision, ...value } = entry;
  return { ...value, consent: true, website: '' }; };
const observation: CommunityObservation = { schemaVersion: 1, id: postId, inputKind: 'microphone', coordinates: { ...entry.coordinates }, label: 'Evening observation', note: 'No source confirmed.',
  capturedAtUtc: '2026-10-18T20:00:00.000Z', publishedAtUtc: '2026-10-18T20:00:01.000Z', durationSeconds: 5, sampleRateHz: 48000, sampleCount: 240000, frameCount: 57,
  algorithmVersion: 'tw-screen-v2', qualityCodes: [], aDigitalDb: -30, cDigitalDb: -25, cMinusADb: 5, peakScreen: 'not-indicated', nearbyFacility: null,
  provenance: 'public-self-reported', verification: 'unverified', locationPrecision: 'rounded-3-decimals' };
const detail = () => ({ case: structuredClone(entry), observations: [structuredClone(observation)], limit: 200, notice: 'Self-reported observations.' });
const feed = () => ({ cases: [structuredClone(entry)], nextCursor: null, limit: 100, scanned: 1, notice: 'Case centers in this area.' });
const mock = (value: unknown, status = 200) => { const fetcher = vi.fn(async () => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })); vi.stubGlobal('fetch', fetcher); return fetcher; };
afterEach(() => vi.unstubAllGlobals());

describe('public neighborhood case contracts', () => {
  it('accepts a normalized case and rejects private, unrounded or unsupported claims', () => {
    expect(isNeighborhoodCase(entry)).toBe(true);
    for (const invalid of [{ ...entry, deleteToken: token }, { ...entry, coordinates: { latitude: 38.912345, longitude: -77.4 } },
      { ...entry, verification: 'confirmed-data-center' }, { ...entry, radiusKm: 26 }, { ...entry, title: '' }, { ...entry, createdAtUtc: '2026-02-31T00:00:00.000Z' }]) expect(isNeighborhoodCase(invalid)).toBe(false);
  });
  it('accepts complete public observations but rejects duplicates, extra audio, forged metadata and oversized cases', () => {
    expect(isNeighborhoodCaseDetail(detail())).toBe(true);
    for (const invalid of [{ ...detail(), observations: [observation, observation] }, { ...detail(), audio: [1, 2] },
      { ...detail(), observations: [{ ...observation, sampleCount: 1 }] }, { ...detail(), observations: [{ ...observation, deleteToken: token }] },
      { ...detail(), limit: 500 }, { ...detail(), observations: Array.from({ length: 201 }, () => observation) }]) expect(isNeighborhoodCaseDetail(invalid)).toBe(false);
  });
  it('uses a bounded directory query and preserves its cursor', async () => {
    const fetcher = mock(feed()); const signal = new AbortController().signal;
    await listNeighborhoodCases({ center: entry.coordinates, radiusKm: 10, limit: 25, cursor: 'abc123' }, signal);
    expect(fetcher).toHaveBeenCalledWith('/api/cases?lat=38.9&lon=-77.4&radiusKm=10&limit=25&cursor=abc123', expect.objectContaining({ method: 'GET', signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store' }));
  });
  it('does not display a response for the wrong case ID', async () => {
    mock(detail()); await expect(getNeighborhoodCase(id)).resolves.toMatchObject({ case: { id } });
    await expect(getNeighborhoodCase(postId)).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it('rejects duplicated case cards and unsupported feed fields', async () => {
    mock({ ...feed(), cases: [entry, entry] }); await expect(listNeighborhoodCases({ center: entry.coordinates })).rejects.toMatchObject({ code: 'invalid-response' });
    mock({ ...feed(), uniqueResidents: 20 }); await expect(listNeighborhoodCases({ center: entry.coordinates })).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it('creates only the reviewed public fields, rounds before transport and reuses the caller key', async () => {
    const fetcher = mock({ case: entry, deleteToken: token, replayed: false }, 201);
    const supplied = { ...draft(), coordinates: { latitude: 38.912345, longitude: -77.412345 }, audio: new Float32Array([.5]), privateNotes: 'PRIVATE', aiResult: 'PRIVATE_AI' };
    const before = structuredClone(supplied); await createNeighborhoodCase(supplied, key);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(request.body as string);
    expect(url).toBe('/api/cases'); expect(request.headers).toMatchObject({ 'Idempotency-Key': key });
    expect(body).toEqual({ action: 'create', draft: { ...draft(), coordinates: { latitude: 38.912, longitude: -77.412 } } });
    expect(request.body).not.toMatch(/PRIVATE|privateNotes|audio|aiResult/); expect(supplied).toEqual(before);
  });
  it('attaches with an observation capability only in the request body', async () => {
    const fetcher = mock({ attached: true }); await attachCaseObservation(id, postId, token);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cases'); expect(url).not.toContain(token);
    expect(JSON.parse(request.body as string)).toEqual({ action: 'attach', caseId: id, observationId: postId, deleteToken: token, consent: true, website: '' });
  });
  it('deletes only the requested case and never puts the capability in a URL', async () => {
    const fetcher = mock({ deleted: true }); await deleteNeighborhoodCase(id, token);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cases'); expect(request.method).toBe('DELETE'); expect(JSON.parse(request.body as string)).toEqual({ id, deleteToken: token });
  });
  it('keeps explicit server failure codes for recovery without treating failed writes as success', async () => {
    mock({ error: { code: 'idempotency-conflict', message: 'Use the original reviewed details.' } }, 409);
    await expect(createNeighborhoodCase(draft(), key)).rejects.toMatchObject({ code: 'idempotency-conflict', status: 409 });
    mock({ error: { code: 'not-found', message: 'This case was removed.' } }, 404);
    await expect(getNeighborhoodCase(id)).rejects.toMatchObject({ code: 'not-found', status: 404 });
  });
  it('bounds response streaming and rejects unreadable successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(1_048_577))));
    await expect(getNeighborhoodCase(id)).rejects.toMatchObject({ code: 'invalid-response' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not JSON')));
    await expect(getNeighborhoodCase(id)).rejects.toMatchObject({ code: 'invalid-response' });
  });
});
