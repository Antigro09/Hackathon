import { describe, expect, it } from 'vitest';
import { analyzePcm } from '../src/analysis/engine';
import { generateFixture, syntheticMeta } from '../src/analysis/fixtures';
import {
  canMapNumericResult, createSessionMapReading, parseManualCoordinates,
  readingColor, readingProvenance, syntheticReadings,
} from '../src/data/readings';
import type { AnalysisResult, InputKind, QualityCode } from '../src/types';

const analyzed = analyzePcm(generateFixture('sine-1000', 48000), 48000, syntheticMeta('sine-1000'));

function result(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return { ...analyzed, qualityCodes: [], ...overrides };
}

describe('synthetic map provenance and independent indicators', () => {
  it('marks every seeded site synthetic with invented context, without claiming a field measurement', () => {
    expect(syntheticReadings.length).toBeGreaterThanOrEqual(12);
    expect(syntheticReadings.length).toBeLessThanOrEqual(15);
    for (const reading of syntheticReadings) {
      expect(reading.inputKind).toBe('synthetic');
      expect(reading.provenance).toBe('synthetic-demo');
      expect(reading.label).toContain('synthetic data; no measurement collected');
      expect(readingProvenance(reading)).toContain('SYNTHETIC DEMO');
      expect(reading.exampleDevice).toContain('Fictional');
      expect(reading.exampleTime).toContain('no recording timestamp');
      expect(reading.exampleConditions).toContain('Fictional');
      expect(reading.coordinates.latitude).toBeGreaterThan(38.8);
      expect(reading.coordinates.latitude).toBeLessThan(39.2);
      expect(reading.coordinates.longitude).toBeGreaterThan(-77.6);
      expect(reading.coordinates.longitude).toBeLessThan(-77.3);
      if (reading.cMinusADb !== null) expect(reading.cDigitalDb! - reading.aDigitalDb!).toBeCloseTo(reading.cMinusADb, 10);
    }
  });

  it('shows exactly two amber examples and demonstrates that the gap and peak are independent', () => {
    expect(syntheticReadings.filter(reading => readingColor(reading) === 'amber')).toHaveLength(2);
    expect(syntheticReadings.some(reading => readingColor(reading) === 'amber' && reading.peakScreen === 'not-indicated')).toBe(true);
    expect(syntheticReadings.some(reading => readingColor(reading) === 'neutral' && reading.peakScreen === 'suggested')).toBe(true);
    expect(syntheticReadings.filter(reading => readingColor(reading) === 'unavailable')).toHaveLength(2);
  });

  it.each([
    { cMinusADb: 14.999, expected: 'neutral' },
    { cMinusADb: 15, expected: 'amber' },
    { cMinusADb: null, expected: 'unavailable' },
    { cMinusADb: Number.NaN, expected: 'unavailable' },
    { cMinusADb: Number.POSITIVE_INFINITY, expected: 'unavailable' },
  ])('keeps threshold and unavailable states explicit ($cMinusADb)', ({ cMinusADb, expected }) => {
    expect(readingColor({ cMinusADb })).toBe(expected);
  });
});

describe('manual coordinates and observation association', () => {
  it('never treats missing coordinates as zero, while accepting a deliberately entered zero', () => {
    expect(() => parseManualCoordinates('', '')).toThrow('Enter both');
    expect(() => parseManualCoordinates('  ', '-77.4')).toThrow('Enter both');
    expect(parseManualCoordinates('0', '0')).toEqual({ latitude: 0, longitude: 0 });
    expect(parseManualCoordinates('39.0421', '-77.4876')).toEqual({ latitude: 39.0421, longitude: -77.4876 });
  });

  it.each([['86', '-77'], ['-86', '-77'], ['39', '181'], ['39', '-181'], ['abc', '-77'], ['Infinity', '0']])('rejects unsupported coordinates %s, %s', (latitude, longitude) => {
    expect(() => parseManualCoordinates(latitude, longitude)).toThrow();
  });

  it('requires deliberate confirmation before a numeric result can become a pin', () => {
    const coordinates = { latitude: 39.04, longitude: -77.49 };
    expect(() => createSessionMapReading(result(), { label: 'Current observation', coordinates })).toThrow('Confirm');
    const reading = createSessionMapReading(result(), { label: 'Current observation', coordinates, locationConfirmed: true });
    expect(reading.coordinates).toEqual(coordinates);
    expect(reading.locationAssociation).toBe('user-confirmed');
  });

  it('preserves unknown location as unplaced rather than assigning a seeded coordinate', () => {
    const reading = createSessionMapReading(result(), { label: 'Recording with unknown location' });
    expect(reading.coordinates).toBeNull();
    expect(reading.locationAssociation).toBe('unplaced');
  });
});

describe('session snapshots and unavailable values', () => {
  it.each<InputKind>(['synthetic', 'imported-file', 'microphone'])('preserves original %s provenance and observed metadata', inputKind => {
    const current = result({ inputKind, inputLabel: 'Original recording label', durationSeconds: 15, recordedAtUtc: null });
    const reading = createSessionMapReading(current, { label: 'My local preview' });
    expect(reading.provenance).toBe('session-preview');
    expect(reading.inputKind).toBe(inputKind);
    expect(reading.resultId).toBe(current.id);
    expect(reading.inputLabel).toBe(current.inputLabel);
    expect(reading.analysisCreatedUtc).toBe(current.analysisCreatedUtc);
    expect(reading.recordedAtUtc).toBeNull();
    expect(reading.durationSeconds).toBe(15);
    expect(reading.cMinusADb).toBe(current.cMinusADb);
    expect(reading.peakScreen).toBe(current.peakScreen);
    expect(readingProvenance(reading)).toContain(inputKind === 'synthetic' ? 'SYNTHETIC INPUT' : inputKind === 'imported-file' ? 'IMPORTED FILE' : 'MICROPHONE');
  });

  it.each<QualityCode>(['near-zero', 'clipped', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power'])('does not map numeric values through a %s quality failure', code => {
    const current = result({ qualityCodes: [code] });
    expect(canMapNumericResult(current)).toBe(false);
    const unplaced = createSessionMapReading(current, { label: 'Descriptive entry only' });
    expect([unplaced.aDigitalDb, unplaced.cDigitalDb, unplaced.cMinusADb]).toEqual([null, null, null]);
    expect(unplaced.coordinates).toBeNull();
    expect(() => createSessionMapReading(current, { label: 'Do not plot this', coordinates: { latitude: 39, longitude: -77 }, locationConfirmed: true })).toThrow('inconclusive');
  });

  it('retains partial-result and numerical failures as unavailable without replacing them with zero', () => {
    for (const overrides of [{ cMinusADb: null }, { aDigitalDb: Number.NaN }, { cDigitalDb: Number.POSITIVE_INFINITY }, { lowFrequencyScreen: 'inconclusive' as const }]) {
      expect(canMapNumericResult(result(overrides))).toBe(false);
      expect(createSessionMapReading(result(overrides), { label: 'Unknown values' }).cMinusADb).toBeNull();
    }
  });

  it('copies context and quality flags instead of retaining mutable analysis state', () => {
    const current = result({ qualityCodes: ['processing-unknown'] });
    const coordinates = { latitude: 39.04, longitude: -77.49 };
    const reading = createSessionMapReading(current, { label: 'Snapshot', coordinates, locationConfirmed: true });
    current.qualityCodes.push('clipped');
    current.cMinusADb = 999;
    coordinates.latitude = 0;
    expect(reading.qualityCodes).toEqual(['processing-unknown']);
    expect(reading.cMinusADb).toBe(analyzed.cMinusADb);
    expect(reading.coordinates?.latitude).toBe(39.04);
  });
});
