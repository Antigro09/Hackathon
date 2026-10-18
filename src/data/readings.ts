import type { AnalysisResult, InputKind, QualityCode } from '../types';

export interface MapCoordinates { latitude: number; longitude: number }
type PeakScreen = AnalysisResult['peakScreen'];

interface ReadingValues {
  aDigitalDb: number | null;
  cDigitalDb: number | null;
  cMinusADb: number | null;
  peakScreen: PeakScreen;
  qualityCodes: readonly QualityCode[];
}

export interface SyntheticMapReading extends ReadingValues {
  id: string;
  provenance: 'synthetic-demo';
  inputKind: 'synthetic';
  label: string;
  coordinates: Readonly<MapCoordinates>;
  exampleDevice: string;
  exampleTime: string;
  exampleConditions: string;
}

export interface SessionMapReading extends ReadingValues {
  id: string;
  provenance: 'session-preview';
  inputKind: InputKind;
  label: string;
  coordinates: Readonly<MapCoordinates> | null;
  locationAssociation: 'user-confirmed' | 'unplaced';
  resultId: string;
  inputLabel: string | null;
  analysisCreatedUtc: string;
  recordedAtUtc: string | null;
  durationSeconds: number;
  sampleRateHz: number;
}

export type MapReading = SyntheticMapReading | SessionMapReading;
export type MapColor = 'neutral' | 'amber' | 'unavailable';

const INVALID_NUMERIC_CODES: ReadonlySet<QualityCode> = new Set([
  'near-zero', 'clipped', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power',
]);

/** Colors describe only the captured-spectrum C−A screen, never the peak check. */
export function readingColor(reading: Pick<ReadingValues, 'cMinusADb'>): MapColor {
  if (reading.cMinusADb === null || !Number.isFinite(reading.cMinusADb)) return 'unavailable';
  return reading.cMinusADb >= 15 ? 'amber' : 'neutral';
}

export function canMapNumericResult(result: AnalysisResult): boolean {
  return result.lowFrequencyScreen !== 'inconclusive'
    && [result.aDigitalDb, result.cDigitalDb, result.cMinusADb].every(value => value !== null && Number.isFinite(value))
    && !result.qualityCodes.some(code => INVALID_NUMERIC_CODES.has(code));
}

/** No geolocation/geocoding: the caller must supply these coordinates deliberately. */
export function parseManualCoordinates(latitude: string, longitude: string): MapCoordinates {
  if (!latitude.trim() || !longitude.trim()) throw new Error('Enter both latitude and longitude, or keep this observation unplaced.');
  const coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!Number.isFinite(coordinates.latitude) || coordinates.latitude < -85 || coordinates.latitude > 85) {
    throw new Error('Latitude must be a number between −85 and 85 for this map.');
  }
  if (!Number.isFinite(coordinates.longitude) || coordinates.longitude < -180 || coordinates.longitude > 180) {
    throw new Error('Longitude must be a number between −180 and 180.');
  }
  return coordinates;
}

/** Snapshot metadata and values; later analyses cannot mutate an existing local pin. */
export function createSessionMapReading(result: AnalysisResult, options: {
  label: string;
  coordinates?: MapCoordinates | null;
  locationConfirmed?: boolean;
}): SessionMapReading {
  const label = options.label.trim();
  if (!label || label.length > 120) throw new Error('Enter a short label of 1–120 characters for this local preview.');
  const numericAvailable = canMapNumericResult(result);
  let coordinates: MapCoordinates | null = null;
  if (options.coordinates) {
    coordinates = parseManualCoordinates(String(options.coordinates.latitude), String(options.coordinates.longitude));
    if (!options.locationConfirmed) throw new Error('Confirm that these coordinates belong to the active observation.');
    if (!numericAvailable) throw new Error('This result is inconclusive. Keep it unplaced as a descriptive observation.');
  }
  return Object.freeze({
    id: `local-${globalThis.crypto.randomUUID()}`,
    provenance: 'session-preview',
    inputKind: result.inputKind,
    label,
    coordinates: coordinates ? Object.freeze(coordinates) : null,
    locationAssociation: coordinates ? 'user-confirmed' : 'unplaced',
    resultId: result.id,
    inputLabel: result.inputLabel ?? null,
    analysisCreatedUtc: result.analysisCreatedUtc,
    recordedAtUtc: result.recordedAtUtc,
    durationSeconds: result.durationSeconds,
    sampleRateHz: result.sampleRateHz,
    aDigitalDb: numericAvailable ? result.aDigitalDb : null,
    cDigitalDb: numericAvailable ? result.cDigitalDb : null,
    cMinusADb: numericAvailable ? result.cMinusADb : null,
    peakScreen: result.peakScreen,
    qualityCodes: Object.freeze([...result.qualityCodes]),
  });
}

export function readingProvenance(reading: MapReading): string {
  if (reading.provenance === 'synthetic-demo') return 'SYNTHETIC DEMO · no measurement collected';
  if (reading.inputKind === 'synthetic') return 'SYNTHETIC INPUT · local preview';
  return reading.inputKind === 'imported-file' ? 'IMPORTED FILE · local preview' : 'MICROPHONE · local preview';
}

export function peakDescription(screen: PeakScreen): string {
  if (screen === 'suggested') return 'Sustained narrowband peak suggested';
  if (screen === 'not-indicated') return 'Sustained narrowband peak not indicated';
  return screen === 'not-evaluated' ? 'Sustained-peak check not evaluated' : 'Sustained-peak check inconclusive';
}

const seeds: ReadonlyArray<readonly [number, number, number | null, PeakScreen, readonly QualityCode[]]> = [
  [39.04, -77.49, 8, 'suggested', []],
  [39.06, -77.48, 11, 'not-indicated', []],
  [39.03, -77.47, 13, 'not-indicated', []],
  [39.02, -77.51, 9, 'inconclusive', ['processing-unknown']],
  [39.05, -77.53, 16, 'suggested', []],
  [39.00, -77.49, 12, 'not-indicated', []],
  [39.01, -77.40, 14, 'not-indicated', []],
  [39.03, -77.39, 10, 'suggested', []],
  [39.00, -77.43, null, 'inconclusive', ['clipped']],
  [38.98, -77.42, 24, 'not-indicated', []],
  [38.94, -77.45, 9, 'not-indicated', []],
  [38.92, -77.41, 13, 'suggested', []],
  [38.90, -77.44, null, 'inconclusive', ['near-zero']],
  [38.89, -77.47, 11, 'not-indicated', []],
];

/** Invented example values at approximate illustrative positions, not field data. */
export const syntheticReadings: readonly SyntheticMapReading[] = Object.freeze(seeds.map((seed, index) => {
  const [latitude, longitude, gap, peakScreen, qualityCodes] = seed;
  const aDigitalDb = gap === null ? null : -48 + index % 5;
  return Object.freeze({
    id: `synthetic-site-${index + 1}`,
    provenance: 'synthetic-demo' as const,
    inputKind: 'synthetic' as const,
    label: `Illustrative site ${index + 1} — synthetic data; no measurement collected`,
    coordinates: Object.freeze({ latitude, longitude }),
    aDigitalDb,
    cDigitalDb: gap === null || aDigitalDb === null ? null : aDigitalDb + gap,
    cMinusADb: gap,
    peakScreen,
    qualityCodes: Object.freeze([...qualityCodes]),
    exampleDevice: `Fictional browser setup ${index % 2 === 0 ? 'A' : 'B'}; no device was used`,
    exampleTime: `Fictional clock time ${String(18 + Math.floor(index / 6)).padStart(2, '0')}:${String(index % 6 * 10).padStart(2, '0')}; no recording timestamp`,
    exampleConditions: `Fictional ${index % 2 === 0 ? 'outdoor, still-air' : 'indoor, closed-window'} example; no field visit`,
  });
}));
