import { describe, expect, it } from 'vitest';
import { analyzePcm } from '../src/analysis/engine';
import { generateFixture, syntheticMeta } from '../src/analysis/fixtures';
import { compareCaptures, comparisonDeviceSettings, formatGapDelta } from '../src/analysis/comparison';
import type { AnalysisResult, InputKind, QualityCode } from '../src/types';

const baseline = analyzePcm(generateFixture('sine-1000', 48000), 48000, syntheticMeta('sine-1000'));
let nextId = 0;
function capture(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return { ...baseline, id: `comparison-test-${nextId++}`, inputKind: 'microphone', fixtureId: null, qualityCodes: [], cMinusADb: 10, lowFrequencyScreen: 'not-indicated', ...overrides };
}

describe('observed gap difference', () => {
  it.each([
    { current: 14.2, previous: 10, difference: 4.2, display: '+4.2 dB' },
    { current: 8.1, previous: 12.3, difference: -4.2, display: '-4.2 dB' },
    { current: 10, previous: 10, difference: 0, display: '0.0 dB' },
    { current: 0, previous: 4.2, difference: -4.2, display: '-4.2 dB' },
  ])('subtracts previous from current without correcting or normalizing ($display)', ({ current, previous, difference, display }) => {
    const comparison = compareCaptures(capture({ cMinusADb: current }), capture({ cMinusADb: previous }));
    expect(comparison.status).toBe('ready');
    if (comparison.status !== 'ready') throw new Error('Expected two valid gaps');
    expect(comparison.deltaGapDb).toBeCloseTo(difference, 10);
    expect(formatGapDelta(comparison.deltaGapDb)).toBe(display);
    expect(comparison.current.cMinusADb).toBe(current);
    expect(comparison.previous.cMinusADb).toBe(previous);
  });

  it('does not turn tiny signed differences into a misleading -0.0 or +0.0 display', () => {
    expect(formatGapDelta(-0)).toBe('0.0 dB');
    expect(formatGapDelta(-0.001)).toBe('0.0 dB');
    expect(formatGapDelta(0.001)).toBe('0.0 dB');
    expect(formatGapDelta(-0.06)).toBe('-0.1 dB');
    expect(formatGapDelta(0.06)).toBe('+0.1 dB');
    expect(formatGapDelta(Number.NaN)).toBe('Unavailable');
    expect(formatGapDelta(Number.POSITIVE_INFINITY)).toBe('Unavailable');
  });

  it('keeps the peak screen independent of the captured-spectrum gap', () => {
    const comparison = compareCaptures(capture({ peakScreen: 'inconclusive' }), capture({ peakScreen: 'not-evaluated' }));
    expect(comparison.status).toBe('ready');
    if (comparison.status !== 'ready') throw new Error('Peak availability must not gate a gap comparison');
    expect(comparison.current.peakScreen).toBe('inconclusive');
    expect(comparison.previous.peakScreen).toBe('not-evaluated');
  });

  it('rejects a subtraction that overflows even if both stored operands are finite', () => {
    expect(compareCaptures(capture({ cMinusADb: 1e308 }), capture({ cMinusADb: -1e308 }))).toMatchObject({ status: 'unavailable', reason: 'difference-not-finite' });
  });
});

describe('missing, identical and invalid observations', () => {
  it('explains missing current and previous captures without supplying a numeric zero', () => {
    expect(compareCaptures(null, null)).toMatchObject({ status: 'unavailable', reason: 'missing-both' });
    expect(compareCaptures(null, capture())).toMatchObject({ status: 'unavailable', reason: 'missing-current' });
    expect(compareCaptures(capture(), null)).toMatchObject({ status: 'unavailable', reason: 'missing-previous' });
    expect(compareCaptures(capture(), null)).not.toHaveProperty('deltaGapDb');
  });

  it('rejects two references to the same analysis even if wrapped in different objects', () => {
    const previous = capture();
    expect(compareCaptures({ ...previous }, previous)).toMatchObject({ status: 'unavailable', reason: 'same-analysis' });
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects an unavailable current/previous gap (%s)', value => {
    expect(compareCaptures(capture({ cMinusADb: value }), capture())).toMatchObject({ status: 'unavailable', reason: 'invalid-current' });
    expect(compareCaptures(capture(), capture({ cMinusADb: value }))).toMatchObject({ status: 'unavailable', reason: 'invalid-previous' });
  });

  it('rejects an inconclusive low-frequency screen even if a stale numeric value remains', () => {
    expect(compareCaptures(capture({ lowFrequencyScreen: 'inconclusive' }), capture())).toMatchObject({ status: 'unavailable', reason: 'invalid-current' });
    expect(compareCaptures(capture(), capture({ lowFrequencyScreen: 'inconclusive' }))).toMatchObject({ status: 'unavailable', reason: 'invalid-previous' });
  });

  it.each<QualityCode>(['near-zero', 'clipped', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power'])('does not compare through %s quality failure', code => {
    expect(compareCaptures(capture({ qualityCodes: [code] }), capture())).toMatchObject({ status: 'unavailable', reason: 'invalid-current' });
    expect(compareCaptures(capture(), capture({ qualityCodes: [code] }))).toMatchObject({ status: 'unavailable', reason: 'invalid-previous' });
  });
});

describe('provenance and immutable comparison snapshots', () => {
  it.each<[InputKind, InputKind, boolean]>([
    ['synthetic', 'microphone', true], ['imported-file', 'synthetic', true],
    ['synthetic', 'synthetic', true], ['microphone', 'imported-file', false],
  ])('retains %s/%s origins and marks synthetic participation', (currentKind, previousKind, synthetic) => {
    const comparison = compareCaptures(capture({ inputKind: currentKind }), capture({ inputKind: previousKind }));
    expect(comparison.status).toBe('ready');
    if (comparison.status !== 'ready') throw new Error('Expected two valid gaps');
    expect(comparison.includesSynthetic).toBe(synthetic);
    expect(comparison.current.inputKind).toBe(currentKind);
    expect(comparison.previous.inputKind).toBe(previousKind);
  });

  it('preserves duration, effective rate, input labels and actual/unknown times separately', () => {
    const current = capture({ durationSeconds: 30, sampleRateHz: 48000, inputLabel: 'Thirty-second recording', analysisCreatedUtc: '2026-10-18T16:10:00Z', recordedAtUtc: '2026-10-18T16:09:30Z' });
    const previous = capture({ durationSeconds: 5, sampleRateHz: 44100, inputKind: 'imported-file', inputLabel: 'imported.wav', analysisCreatedUtc: '2026-10-18T16:08:00Z', recordedAtUtc: null });
    const comparison = compareCaptures(current, previous);
    if (comparison.status !== 'ready') throw new Error('Expected two valid gaps');
    expect(comparison.current).toMatchObject({ durationSeconds: 30, sampleRateHz: 48000, inputLabel: 'Thirty-second recording', recordedAtUtc: '2026-10-18T16:09:30Z', analysisCreatedUtc: '2026-10-18T16:10:00Z' });
    expect(comparison.previous).toMatchObject({ durationSeconds: 5, sampleRateHz: 44100, inputLabel: 'imported.wav', recordedAtUtc: null, analysisCreatedUtc: '2026-10-18T16:08:00Z' });
    expect(comparison.deltaGapDb).toBe(0);
  });

  it('keeps processing limitations without treating unknown processing as a calibrated device', () => {
    const comparison = compareCaptures(capture({ qualityCodes: ['processing-active'], deviceSettings: { autoGainControl: true } }), capture({ qualityCodes: ['imported-processing-unknown'] }));
    if (comparison.status !== 'ready') throw new Error('A descriptive comparison retains nonfatal limitations');
    expect(comparison.current.qualityCodes).toEqual(['processing-active']);
    expect(comparison.current.deviceSettings).toEqual({ autoGainControl: true });
    expect(comparison.previous.qualityCodes).toEqual(['imported-processing-unknown']);
  });

  it('copies values and typed settings rather than referencing mutable source objects', () => {
    const current = capture({ qualityCodes: ['processing-unknown'], deviceSettings: { sampleRate: 48000, echoCancellation: false } });
    const comparison = compareCaptures(current, capture());
    if (comparison.status !== 'ready') throw new Error('Expected two valid gaps');
    current.cMinusADb = 99;
    current.qualityCodes.push('clipped');
    current.deviceSettings!.sampleRate = 8000;
    expect(comparison.current.cMinusADb).toBe(10);
    expect(comparison.current.qualityCodes).toEqual(['processing-unknown']);
    expect(comparison.current.deviceSettings).toEqual({ sampleRate: 48000, echoCancellation: false });
    expect(Object.isFrozen(comparison.current)).toBe(true);
    expect(Object.isFrozen(comparison.current.qualityCodes)).toBe(true);
    expect(Object.isFrozen(comparison.current.deviceSettings)).toBe(true);
  });

  it('never forwards device identifiers, arbitrary fields, object values, or mislabeled setting strings', () => {
    expect(comparisonDeviceSettings({ deviceId: 'fake-private-id', groupId: 'fake-group', label: 'fake-device-name', arbitrary: 'omit', sampleRate: 48000, sampleSize: 16, channelCount: 1, latency: 0.01, echoCancellation: false, noiseSuppression: true, autoGainControl: false })).toEqual({ sampleRate: 48000, sampleSize: 16, channelCount: 1, latency: 0.01, echoCancellation: false, noiseSuppression: true, autoGainControl: false });
    expect(comparisonDeviceSettings({ deviceId: 'fake-id', sampleRate: 'fake-secret', latency: Number.POSITIVE_INFINITY, noiseSuppression: { unexpected: 'object' } })).toBeNull();
    expect(comparisonDeviceSettings(null)).toBeNull();
  });
});
