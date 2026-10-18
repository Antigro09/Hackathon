/** Explicit public-city lookup only. This module never reads GPS, observations, notes or audio. */
export interface DiscoveryCoordinates { latitude: number; longitude: number }
export interface DiscoveryAttribution { label: string; url: string }
export interface LocationCandidate extends DiscoveryCoordinates {
  id: number;
  name: string;
  displayName: string;
  admin1: string | null;
  country: string | null;
  countryCode: string;
  sourceUrl: string;
}
export interface LocationSearchResult {
  query: string;
  locations: LocationCandidate[];
  retrievedAt: string;
  attribution: readonly DiscoveryAttribution[];
}
export interface DatacenterFacility extends DiscoveryCoordinates {
  key: string;
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  name: string | null;
  operator: string | null;
  distanceKm: number;
  sourceUrl: string;
  retrievedAt: string;
  kind: 'facility-tag' | 'building-tag' | 'site-tag';
  locationMethod: 'mapped-point' | 'bounding-box-center';
  matchedTags: readonly { key: string; value: string }[];
}
export interface DatacenterSearchResult {
  center: DiscoveryCoordinates;
  radiusKm: number;
  retrievedAt: string;
  osmDataTimestamp: string | null;
  facilities: DatacenterFacility[];
  truncated: boolean;
  /** Full snapshot catalog count, before local radius/tag/quality filtering. */
  receivedCount: number;
  /** All catalog rows not displayed, including outside the radius and the cap. */
  omittedCount: number;
  limit: number;
  attribution: readonly DiscoveryAttribution[];
  snapshot: typeof DATACENTER_SNAPSHOT;
}
export type DiscoveryErrorCode = 'invalid-input' | 'busy' | 'timeout' | 'unavailable' | 'invalid-response' | 'too-large';
export class DatacenterDiscoveryError extends Error {
  constructor(public readonly code: DiscoveryErrorCode, message: string) { super(message); this.name = 'DatacenterDiscoveryError'; }
}

// Primary documentation/terms checked 2026-10-18. Free Open-Meteo is for this
// noncommercial app (<10,000/day,5,000/hour,600/minute); a commercial release
// needs a licensed/self-hosted replacement. Nearby filtering uses the exact
// bundled, dated ODbL snapshot; no coordinates are sent to an external service.
export const DATACENTER_SNAPSHOT = Object.freeze({
  date: '2026-10-18',
  generatedAt: '2026-10-18T00:21:18.778606', // Publisher supplied no timezone.
  sha256: '69e8c95a052c6e25d4ad4c2d6431327ed977ccca54fb12e036c7f9c9ff4a1a45',
  sourceUrl: 'https://opendatacentermap.deuxfleurs.page/data.geojson',
  downloadUrl: '/data/datacenters-osm-2026-10-18.json',
});
export const DATACENTER_DISCOVERY_SOURCES = Object.freeze({
  geocodingEndpoint: 'https://geocoding-api.open-meteo.com/v1/search',
  geocodingDocs: 'https://open-meteo.com/en/docs/geocoding-api',
  geocodingTerms: 'https://open-meteo.com/en/terms',
  snapshotPublisher: 'https://opendatacentermap.deuxfleurs.page/',
  snapshotSources: 'https://framagit.org/opendatacentermap/opendatacentermap-interactive',
  osmCopyright: 'https://www.openstreetmap.org/copyright',
  tagDocumentation: 'https://wiki.openstreetmap.org/wiki/Tag:telecom%3Ddata_center',
});
const LOCATION_CREDITS: readonly DiscoveryAttribution[] = Object.freeze([
  Object.freeze({ label: 'GeoNames location data via Open-Meteo', url: 'https://www.geonames.org/' }),
  Object.freeze({ label: 'Open-Meteo terms / noncommercial API', url: DATACENTER_DISCOVERY_SOURCES.geocodingTerms }),
  Object.freeze({ label: 'Location data: CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }),
]);
const FACILITY_CREDITS: readonly DiscoveryAttribution[] = Object.freeze([
  Object.freeze({ label: '© OpenStreetMap contributors · ODbL', url: DATACENTER_DISCOVERY_SOURCES.osmCopyright }),
  Object.freeze({ label: 'Snapshot via OpenDatacenterMap · 2026-10-18', url: DATACENTER_DISCOVERY_SOURCES.snapshotPublisher }),
  Object.freeze({ label: 'Download the complete ODbL source snapshot', url: DATACENTER_SNAPSHOT.downloadUrl }),
]);
const LIMIT = 200;
const TAGS = [['telecom', 'data_center'], ['building', 'data_center'], ['industrial', 'data_centre']] as const;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value: unknown): string | null => typeof value === 'string' && value.trim() && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const coordinate = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const validCoordinates = (value: DiscoveryCoordinates) => coordinate(value.latitude, 90) && coordinate(value.longitude, 180);
const abortError = () => new DOMException('Location lookup canceled.', 'AbortError');
const need = (condition: unknown, code: DiscoveryErrorCode, message: string): void => { if (!condition) throw new DatacenterDiscoveryError(code, message); };

/** Spherical straight-line distance between mapped points/box centers, not a noise model. */
export function datacenterDistanceKm(a: DiscoveryCoordinates, b: DiscoveryCoordinates): number {
  need(validCoordinates(a) && validCoordinates(b), 'invalid-input', 'Valid coordinates are required.');
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians, dLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

function parseLocations(value: unknown): LocationCandidate[] {
  need(isObject(value) && value.error !== true && (value.results === undefined || Array.isArray(value.results)), 'invalid-response', 'The location provider returned an invalid response.');
  const rows = (value as Record<string, unknown>).results ?? [];
  need(Array.isArray(rows) && rows.length <= 20, 'invalid-response', 'The location provider returned too many results.');
  const seen = new Set<number>(), locations: LocationCandidate[] = [];
  for (const row of rows as unknown[]) {
    if (!isObject(row) || !Number.isSafeInteger(row.id) || Number(row.id) <= 0 || seen.has(row.id as number)) continue;
    const name = cleanText(row.name), countryCode = cleanText(row.country_code);
    if (!name || countryCode !== 'US' || !coordinate(row.latitude, 90) || !coordinate(row.longitude, 180)) continue;
    const admin1 = cleanText(row.admin1), country = cleanText(row.country);
    const id = row.id as number; seen.add(id);
    locations.push({ id, name, displayName: [name, admin1, country ?? countryCode].filter(Boolean).join(', '), latitude: row.latitude, longitude: row.longitude, admin1, country, countryCode, sourceUrl: `https://www.geonames.org/${id}/` });
  }
  return locations.slice(0, 5);
}

function parseFacilities(value: unknown, center: DiscoveryCoordinates, radiusKm: number, retrievedAt: string): DatacenterSearchResult {
  need(isObject(value) && value.type === 'FeatureCollection' && Array.isArray(value.features) && value.features.length <= 20_000 && isObject(value.metadata), 'invalid-response', 'The dated map snapshot is invalid or unavailable.');
  const document = value as Record<string, unknown>, elements = document.features as unknown[], metadata = document.metadata as Record<string, unknown>;
  need(metadata.source === 'OpenStreetMap' && metadata.license === 'ODbL' && metadata.generated_at === DATACENTER_SNAPSHOT.generatedAt && metadata.count === elements.length,
    'invalid-response', 'The map snapshot does not match the expected date and source.');
  const seen = new Set<string>(), facilities: DatacenterFacility[] = [];
  for (const feature of elements) {
    if (!isObject(feature) || feature.type !== 'Feature' || !isObject(feature.properties) || !isObject(feature.geometry) || feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length !== 2) continue;
    const properties = feature.properties, [lon, lat] = feature.geometry.coordinates;
    const element: Record<string, unknown> = { ...properties, lat, lon, center: { lat, lon } };
    if (!isObject(element) || !['node', 'way', 'relation'].includes(String(element.type)) || !Number.isSafeInteger(element.id) || Number(element.id) <= 0 || !isObject(element.tags)) continue;
    const tags = element.tags;
    const matchedTags = TAGS.filter(([key, tag]) => tags[key] === tag).map(([key, tag]) => ({ key, value: tag }));
    // Building purpose alone does not establish current operation. Avoid explicit
    // substations and lifecycle/inactive records even if conflicting tags remain.
    if (!matchedTags.length || tags.power === 'substation' || ['disused', 'abandoned', 'demolished', 'razed', 'proposed'].some(key => tags[key] === 'yes')
      || (tags.construction !== undefined && tags.construction !== 'no')
      || ['proposed', 'construction', 'disused', 'abandoned', 'demolished', 'razed'].some(prefix => TAGS.some(([key, tag]) => tags[`${prefix}:${key}`] === tag))) continue;
    const point = element.type === 'node' ? element : isObject(element.center) ? element.center : null;
    if (!point || !coordinate(point.lat, 90) || !coordinate(point.lon, 180)) continue;
    const location = { latitude: point.lat, longitude: point.lon }, distanceKm = datacenterDistanceKm(center, location);
    // The publisher preserves Overpass bounding-box centers for ways/relations.
    // Distances are point/center distances, not facility edges or noise effects.
    if (distanceKm > radiusKm) continue;
    const osmType = element.type as DatacenterFacility['osmType'], osmId = element.id as number, key = `${osmType}:${osmId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facilities.push({ key, osmType, osmId, name: cleanText(tags.name) ?? cleanText(tags['name:en']), operator: cleanText(tags.operator), ...location, distanceKm,
      sourceUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`, retrievedAt,
      kind: tags.telecom === 'data_center' ? 'facility-tag' : tags.building === 'data_center' ? 'building-tag' : 'site-tag',
      locationMethod: osmType === 'node' ? 'mapped-point' : 'bounding-box-center', matchedTags });
  }
  facilities.sort((a, b) => a.distanceKm - b.distanceKm || a.key.localeCompare(b.key, 'en'));
  const limited = facilities.slice(0, LIMIT);
  return { center: { ...center }, radiusKm, retrievedAt, osmDataTimestamp: null, snapshot: DATACENTER_SNAPSHOT,
    facilities: limited, truncated: facilities.length > LIMIT, receivedCount: elements.length, omittedCount: elements.length - limited.length, limit: LIMIT, attribution: FACILITY_CREDITS };
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(abortError()); };
    signal.addEventListener('abort', aborted, { once: true });
    promise.then(value => { signal.removeEventListener('abort', aborted); resolve(value); }, error => { signal.removeEventListener('abort', aborted); reject(error); });
  });
}

async function readJson(response: Response, signal: AbortSignal, maximum: number): Promise<unknown> {
  need(response.ok, 'unavailable', 'The public lookup service is temporarily unavailable. Try again later.');
  const declared = response.headers.get('content-length');
  need(declared === null || (/^\d+$/.test(declared) && Number(declared) <= maximum), 'too-large', 'The lookup response exceeded its size limit. Try a smaller area.');
  need(/application\/(?:json|geo\+json)(?:;|$)/i.test(response.headers.get('content-type') ?? ''), 'invalid-response', 'The lookup service did not return map data.');
  const reader = response.body?.getReader();
  need(reader, 'invalid-response', 'The lookup service returned no readable data.');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await withAbort(reader!.read(), signal);
      if (done) break;
      total += value.byteLength;
      need(total <= maximum, 'too-large', 'The lookup response exceeded its size limit. Try a smaller area.');
      chunks.push(value);
    }
  } catch (error) { void reader!.cancel().catch(() => {}); throw error; }
  finally { reader!.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new DatacenterDiscoveryError('invalid-response', 'The lookup service returned invalid map data.'); }
}

export interface DatacenterDiscoveryOptions { fetch?: typeof globalThis.fetch; now?: () => number; timeoutMs?: number }
interface RequestOptions { signal?: AbortSignal }

/**
 * Call only from explicit Search/Find actions, never autocomplete, map panning or
 * capture. Choose a city/ZIP candidate before findNearby; do not silently choose
 * an ambiguous first hit. Send no resident address, microphone coordinates,
 * observation notes or audio. Nearby filtering is local on a fixed snapshot;
 * only the explicit city/ZIP query goes to Open-Meteo. No automatic refresh.
 * No network, GPS or persistence occurs on creation.
 */
export function createDatacenterDiscovery(options: DatacenterDiscoveryOptions = {}) {
  const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const now = options.now ?? Date.now, timeoutMs = options.timeoutMs ?? 20_000;
  need(Number.isFinite(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 25_000, 'invalid-input', 'Lookup timeout must be between 1 and 25000 milliseconds.');
  let active = false;
  const retrievedAt = () => { const ms = now(); need(Number.isFinite(ms) && Math.abs(ms) <= 8.64e15, 'invalid-input', 'A valid retrieval time is required.'); return new Date(ms).toISOString(); };
  const request = async (url: URL | string, maximum: number, signal?: AbortSignal): Promise<unknown> => {
    if (signal?.aborted) throw abortError();
    need(!active, 'busy', 'Wait for the current location lookup or cancel it first.');
    active = true;
    const controller = new AbortController(); let timedOut = false;
    const canceled = () => controller.abort();
    signal?.addEventListener('abort', canceled, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await withAbort(fetcher(typeof url === 'string' ? url : url.href, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal }), controller.signal);
      return await readJson(response, controller.signal, maximum);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timedOut) throw new DatacenterDiscoveryError('timeout', 'The public lookup timed out. Try a smaller area later.');
      if (error instanceof DatacenterDiscoveryError) throw error;
      throw new DatacenterDiscoveryError('unavailable', 'The public lookup could not connect. No location result is available.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', canceled); controller.abort(); active = false; }
  };
  return Object.freeze({
    async searchLocations(query: string, { signal }: RequestOptions = {}): Promise<LocationSearchResult> {
      need(typeof query === 'string', 'invalid-input', 'Enter a city or ZIP code.');
      const text = query.trim();
      need(text.length >= 2 && text.length <= 100 && /^[\p{L}\p{M}\p{N} .,'’()-]+$/u.test(text), 'invalid-input', 'Enter a city or ZIP code between 2 and 100 characters; do not enter an address or personal details.');
      const url = new URL(DATACENTER_DISCOVERY_SOURCES.geocodingEndpoint);
      url.search = new URLSearchParams({ name: text, count: '5', language: 'en', format: 'json', countryCode: 'US' }).toString();
      const data = await request(url, 131_072, signal);
      if (signal?.aborted) throw abortError();
      return { query: text, locations: parseLocations(data), retrievedAt: retrievedAt(), attribution: LOCATION_CREDITS };
    },
    async findNearby(center: DiscoveryCoordinates, radiusKm = 10, { signal }: RequestOptions = {}): Promise<DatacenterSearchResult> {
      need(isObject(center) && validCoordinates(center), 'invalid-input', 'Choose a valid public city location first.');
      need(Number.isInteger(radiusKm) && radiusKm >= 1 && radiusKm <= 25, 'invalid-input', 'Choose a whole-kilometer radius from 1 to 25.');
      const rounded = { latitude: Number(center.latitude.toFixed(6)), longitude: Number(center.longitude.toFixed(6)) };
      const data = await request(DATACENTER_SNAPSHOT.downloadUrl, 4_194_304, signal);
      if (signal?.aborted) throw abortError();
      return parseFacilities(data, rounded, radiusKm, retrievedAt());
    },
  });
}
