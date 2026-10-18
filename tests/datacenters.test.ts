import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatacenterDiscovery, datacenterDistanceKm, DatacenterDiscoveryError, DATACENTER_SNAPSHOT } from '../src/data/datacenters';

const time = Date.parse('2026-10-18T20:00:00Z');
const center = { latitude: 39.04, longitude: -77.49 };
const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
const place = (extra = {}) => ({ id: 4744870, name: 'Ashburn', latitude: 39.04376, longitude: -77.48744, admin1: 'Virginia', country: 'United States', country_code: 'US', ...extra });
const node = (extra = {}) => ({ type: 'node', id: 1, lat: 39.04, lon: -77.49, tags: { telecom: 'data_center', name: 'Mapped test facility', operator: 'Mapped test operator' }, ...extra });
const snapshot = (elements: unknown) => ({ type: 'FeatureCollection', features: Array.isArray(elements) ? elements.map(e => ({ type: 'Feature', properties: { id: e.id, type: e.type, tags: e.tags }, geometry: { type: 'Point', coordinates: e.type === 'node' ? [e.lon, e.lat] : [e.center?.lon, e.center?.lat] } })) : elements, metadata: { source: 'OpenStreetMap', license: 'ODbL', generated_at: DATACENTER_SNAPSHOT.generatedAt, count: Array.isArray(elements) ? elements.length : 0 } });
const setup = (document: unknown) => {
  const data = document && typeof document === 'object' && 'elements' in document ? snapshot(document.elements) : document;
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(data));
  return { fetch, client: createDatacenterDiscovery({ fetch, now: () => time }) };
};
afterEach(() => vi.useRealTimers());

describe('explicit location discovery', () => {
  it('does no network or location access at creation; only the explicit city request runs', async () => {
    const { fetch, client } = setup({ results: [place()] });
    expect(fetch).not.toHaveBeenCalled();
    const result = await client.searchLocations(' Ashburn, VA ');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, options] = fetch.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'Ashburn, VA', count: '5', language: 'en', format: 'json', countryCode: 'US' });
    expect(options).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    expect(options?.body).toBeUndefined();
    expect(result.locations[0]).toMatchObject({ displayName: 'Ashburn, Virginia, United States', sourceUrl: 'https://www.geonames.org/4744870/', countryCode: 'US' });
    expect(result.retrievedAt).toBe('2026-10-18T20:00:00.000Z');
    expect(result.attribution.some(x => x.url === 'https://www.geonames.org/')).toBe(true);
  });

  it('returns ambiguous candidates for user selection without a second network request', async () => {
    const { fetch, client } = setup({ results: [place(), place({ id: 2, admin1: 'Georgia' })] });
    const result = await client.searchLocations('Ashburn');
    expect(result.locations).toHaveLength(2); expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.locations.map(x => x.admin1)).toEqual(['Virginia', 'Georgia']);
  });

  it('accepts explicit ZIP search and empty genuine results', async () => {
    const { fetch, client } = setup({});
    expect((await client.searchLocations('20147')).locations).toEqual([]);
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('name')).toBe('20147');
  });

  it.each(['', 'A', '<script>', 'person@example.com', 'https://example.com', 'Ashburn\nVA', 'x'.repeat(101)])('rejects invalid query %j before sending', async query => {
    const { fetch, client } = setup({});
    await expect(client.searchLocations(query)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('filters invalid/foreign/duplicate identities without inventing location data', async () => {
    const { client } = setup({ results: [place(), place(), place({ id: 3, latitude: NaN }), place({ id: 4, country_code: 'GB' }), place({ id: '5' }), place({ id: 6, name: '' })] });
    expect((await client.searchLocations('Ashburn')).locations).toHaveLength(1);
  });

  it.each([{ results: null }, { error: true, reason: 'Bad request' }, { results: Array.from({ length: 21 }, () => place()) }])('rejects malformed provider responses', async document => {
    const { client } = setup(document);
    await expect(client.searchLocations('Ashburn')).rejects.toMatchObject({ code: 'invalid-response' });
  });
});

describe('bounded OSM discovery and provenance', () => {
  it('fetches only a fixed same-origin snapshot without sending city coordinates or search content', async () => {
    const { fetch, client } = setup({ elements: [] });
    const result = await client.findNearby(center, 10);
    const [input, options] = fetch.mock.calls[0];
    expect(input).toBe('/data/datacenters-osm-2026-10-18.json');
    expect(String(input)).not.toMatch(/\?|39\.04|77\.49|substation|power|notes|audio|observation/);
    expect(options).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' }); expect(options?.body).toBeUndefined();
    expect(result).toMatchObject({ facilities: [], truncated: false, receivedCount: 0, omittedCount: 0, radiusKm: 10 });
    expect(result.attribution).toContainEqual({ label: '© OpenStreetMap contributors · ODbL', url: 'https://www.openstreetmap.org/copyright' });
  });

  it('retains separate facility/building/site evidence, approximate locations, source identity and distance', async () => {
    const { client } = setup({ osm3s: { timestamp_osm_base: '2026-10-18T19:55:00Z' }, elements: [
      node({ id: 3, lon: -77.48 }),
      { type: 'way', id: 2, center: { lat: 39.041, lon: -77.49 }, tags: { building: 'data_center' } },
      { type: 'relation', id: 1, center: { lat: 39.04, lon: -77.49 }, tags: { industrial: 'data_centre', name: 'Mapped campus' } },
    ] });
    const result = await client.findNearby(center);
    expect(result.facilities.map(x => x.key)).toEqual(['relation:1', 'way:2', 'node:3']);
    expect(result.facilities.map(x => x.kind)).toEqual(['site-tag', 'building-tag', 'facility-tag']);
    expect(result.facilities[1]).toMatchObject({ name: null, operator: null, locationMethod: 'bounding-box-center', sourceUrl: 'https://www.openstreetmap.org/way/2', retrievedAt: '2026-10-18T20:00:00.000Z' });
    expect(result.facilities[2]).toMatchObject({ name: 'Mapped test facility', operator: 'Mapped test operator', locationMethod: 'mapped-point', matchedTags: [{ key: 'telecom', value: 'data_center' }] });
    expect(result.osmDataTimestamp).toBeNull(); // Publisher generation time is not an OSM base timestamp.
    expect(result.snapshot).toEqual(DATACENTER_SNAPSHOT);
    expect(result.facilities[0].distanceKm).toBe(0);
    expect(result.facilities[1].distanceKm).toBeCloseTo(0.111195, 5);
  });

  it('deduplicates OSM type+ID, not names or coincident node/way identities', async () => {
    const { client } = setup({ elements: [node(), node(), node({ type: 'way', center: { lat: 39.04, lon: -77.49 } }), node({ id: 2 })] });
    const result = await client.findNearby(center);
    expect(result.facilities.map(x => x.key)).toEqual(['node:1', 'node:2', 'way:1']);
    expect(result.omittedCount).toBe(1);
  });

  it('does not relabel substations, exchanges, planned/inactive tags or invalid/outside centers as nearby facilities', async () => {
    const { client } = setup({ elements: [
      node({ id: 2, tags: { power: 'substation' } }), node({ id: 3, tags: { telecom: 'exchange' } }),
      node({ id: 4, tags: { telecom: 'data_center', power: 'substation' } }),
      node({ id: 5, tags: { building: 'data_center', 'construction:telecom': 'data_center' } }),
      node({ id: 6, tags: { telecom: 'data_center', disused: 'yes' } }),
      node({ id: 7, lat: '39.04' }), node({ id: 8, lon: 999 }), node({ id: -1 }),
      node({ id: 9, lat: 38 }), node({ type: 'way', id: 10, center: null }),
    ] });
    const result = await client.findNearby(center);
    expect(result.facilities).toEqual([]); expect(result.omittedCount).toBe(10);
  });

  it('caps the nearest valid records after filtering the whole catalog', async () => {
    const elements = Array.from({ length: 202 }, (_, id) => node({ id: id + 1, lon: -77.49 + (202 - id) * 0.00001 }));
    elements[0] = node({ id: 1, lat: 999 });
    const { client } = setup({ elements });
    const result = await client.findNearby(center);
    expect(result).toMatchObject({ truncated: true, receivedCount: 202, omittedCount: 2, limit: 200 });
    expect(result.facilities).toHaveLength(200);
    expect(result.facilities[0].osmId).toBe(202);
    expect(result.facilities.at(-1)!.osmId).toBe(3);
  });

  it.each([{ type: 'FeatureCollection', features: [], metadata: { source: 'Other', count: 0 } }, { elements: null }, { type: 'FeatureCollection', features: [], metadata: { source: 'OpenStreetMap', license: 'ODbL', generated_at: '2026-10-19', count: 0 } }, { ...snapshot([]), metadata: { ...snapshot([]).metadata, count: 5 } }])('rejects malformed or wrong-source snapshots instead of claiming an empty area', async document => {
    const { client } = setup(document);
    await expect(client.findNearby(center)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it.each([0, 26, 1.5, NaN, Infinity])('rejects radius %s without network', async radius => {
    const { fetch, client } = setup({});
    await expect(client.findNearby(center, radius)).rejects.toMatchObject({ code: 'invalid-input' }); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: NaN, longitude: 0 }])('rejects invalid center without network', async point => {
    const { fetch, client } = setup({});
    await expect(client.findNearby(point)).rejects.toMatchObject({ code: 'invalid-input' }); expect(fetch).not.toHaveBeenCalled();
  });

  it('handles antipodal and antimeridian distance with finite bounded arithmetic', () => {
    expect(datacenterDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeCloseTo(20015.1144, 3);
    expect(datacenterDistanceKm({ latitude: 0, longitude: 179.99 }, { latitude: 0, longitude: -179.99 })).toBeCloseTo(2.2239, 3);
  });

  it('preserves exact licensed source bytes and finds actual Ashburn records from that snapshot', async () => {
    const bytes = readFileSync('public/data/datacenters-osm-2026-10-18.json');
    expect(bytes.byteLength).toBe(3_142_621);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(DATACENTER_SNAPSHOT.sha256);
    const data = JSON.parse(bytes.toString('utf8'));
    expect(data.features).toHaveLength(5035);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'application/json' } }));
    const result = await createDatacenterDiscovery({ fetch, now: () => time }).findNearby({ latitude: 39.04376, longitude: -77.48744 }, 3);
    expect(result.facilities).toHaveLength(5);
    expect(result.facilities.map(x => x.osmId)).toEqual([1188691868, 556599694, 1188691869, 793888430, 460053030]);
    expect(result.facilities.every(x => x.distanceKm <= 3 && x.sourceUrl.startsWith('https://www.openstreetmap.org/'))).toBe(true);
    expect(result).toMatchObject({ receivedCount: 5035, truncated: false, osmDataTimestamp: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('request lifetime and failure boundaries', () => {
  it('bounds response bytes without trusting a missing content-length and cancels the reader', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(131073)); }, cancel }), { headers: { 'content-type': 'application/json' } });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    await expect(createDatacenterDiscovery({ fetch }).searchLocations('Ashburn')).rejects.toMatchObject({ code: 'too-large' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized declared data and HTML without parsing it as no results', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({}, { headers: { 'content-length': '999999' } })).mockResolvedValueOnce(new Response('<html>unavailable</html>', { headers: { 'content-type': 'text/html' } }));
    const client = createDatacenterDiscovery({ fetch });
    await expect(client.searchLocations('Ashburn')).rejects.toMatchObject({ code: 'too-large' });
    await expect(client.searchLocations('Ashburn')).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('allows only one in-flight lookup, honors cancellation and permits explicit later retry', async () => {
    let resolve!: (value: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(() => new Promise(res => { resolve = res; })).mockResolvedValue(json({ results: [] }));
    const client = createDatacenterDiscovery({ fetch }), abort = new AbortController();
    const first = client.searchLocations('Ashburn', { signal: abort.signal });
    await expect(client.findNearby(center)).rejects.toMatchObject({ code: 'busy' });
    abort.abort(); await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    resolve(json({ results: [place()] }));
    expect((await client.searchLocations('20147')).locations).toEqual([]); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not request an already-aborted lookup', async () => {
    const { fetch, client } = setup({}); const abort = new AbortController(); abort.abort();
    await expect(client.searchLocations('Ashburn', { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' }); expect(fetch).not.toHaveBeenCalled();
  });

  it('times out even an injected fetch that ignores abort, without retry or a late result', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => {}));
    const pending = createDatacenterDiscovery({ fetch, timeoutMs: 100 }).searchLocations('Ashburn');
    const failed = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(101); await failed; expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds a response that stalls while streaming, and cancels its reader', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const pending = createDatacenterDiscovery({ fetch, timeoutMs: 100 }).searchLocations('Ashburn');
    const failed = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(101); await failed;
    expect(cancel).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('records connection/HTTP failure as unavailable, without hidden fallbacks or retries', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError('Network')).mockResolvedValueOnce(json({}, { status: 429 }));
    const client = createDatacenterDiscovery({ fetch });
    await expect(client.searchLocations('Ashburn')).rejects.toBeInstanceOf(DatacenterDiscoveryError);
    await expect(client.searchLocations('Ashburn')).rejects.toMatchObject({ code: 'unavailable' }); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
