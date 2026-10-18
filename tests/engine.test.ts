import { describe, expect, it } from 'vitest';
import { analyzePcm, FFT_SIZE, HOP_SIZE, oneSidedPsd, periodicHann } from '../src/analysis/engine';
import { FIXTURES, generateFixture, syntheticMeta, type FixtureId } from '../src/analysis/fixtures';
import type { AnalysisResult } from '../src/types';

const results = new Map<FixtureId, AnalysisResult>();
function resultFor(id: FixtureId) {
  let result = results.get(id);
  if (!result) {
    result = analyzePcm(generateFixture(id, 48000), 48000, syntheticMeta(id));
    results.set(id, result);
  }
  return result;
}

describe('FFT wrapper and periodogram normalization', () => {
  it.each([
    { label: 'DC', frame: new Float64Array(8).fill(1), expectedBin: 0, expectedPower: 1 },
    { label: 'Nyquist', frame: Float64Array.from({ length: 8 }, (_, n) => n % 2 ? -1 : 1), expectedBin: 4, expectedPower: 1 },
    { label: 'sine', frame: Float64Array.from({ length: 8 }, (_, n) => Math.sin(2 * Math.PI * 2 * n / 8)), expectedBin: 2, expectedPower: 0.5 },
    { label: 'cosine', frame: Float64Array.from({ length: 8 }, (_, n) => Math.cos(2 * Math.PI * 2 * n / 8)), expectedBin: 2, expectedPower: 0.5 },
  ])('handles $label bins without doubling DC/Nyquist', ({ frame, expectedBin, expectedPower }) => {
    const psd = oneSidedPsd(frame, 8, { window: 'rectangular', removeMean: false });
    expect(psd[expectedBin]).toBeCloseTo(expectedPower, 12);
    expect(Array.from(psd).reduce((sum, value) => sum + value, 0)).toBeCloseTo(expectedPower, 12);
  });

  it('satisfies Parseval for an impulse, including all positive bins', () => {
    const frame = new Float64Array(8);
    frame[0] = 1;
    const psd = oneSidedPsd(frame, 8, { window: 'rectangular', removeMean: false });
    expect(Array.from(psd).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1 / 8, 12);
    expect(psd[1]).toBe(2 * psd[0]);
    expect(psd[4]).toBe(psd[0]);
  });

  it('normalizes Hann PSD by window power after per-frame mean removal', () => {
    const frame = Float64Array.from({ length: 64 }, (_, n) => 0.2 + Math.sin(n * 1.7) + 0.1 * Math.cos(n * 0.3));
    const window = periodicHann(frame.length);
    const mean = Array.from(frame).reduce((sum, value) => sum + value, 0) / frame.length;
    let weightedEnergy = 0;
    let windowEnergy = 0;
    for (let n = 0; n < frame.length; n++) {
      weightedEnergy += ((frame[n] - mean) * window[n]) ** 2;
      windowEnergy += window[n] ** 2;
    }
    const psd = oneSidedPsd(frame, 48000);
    const integrated = Array.from(psd).reduce((sum, value) => sum + value, 0) * 48000 / frame.length;
    expect(integrated).toBeCloseTo(weightedEnergy / windowEnergy, 12);
  });
});

describe('shared PCM engine reference fixtures', () => {
  it.each([
    ['sine-63', 25.3340, 'suggested'],
    ['sine-125', 16.0090, 'suggested'],
    ['sine-1000', 0.00003, 'not-indicated'],
    ['mixed-63-1000', 2.6062, 'not-indicated'],
    ['hum-harmonics', 20.4287, 'suggested'],
    ['lf-broadband', 22.1355, 'suggested'],
  ] as const)('%s agrees with its independent spectral golden', (id, golden, screen) => {
    const result = resultFor(id);
    expect(result.cMinusADb).not.toBeNull();
    expect(Math.abs(result.cMinusADb! - golden)).toBeLessThan(id === 'lf-broadband' ? 0.20 : 0.15);
    expect(result.lowFrequencyScreen).toBe(screen);
    expect(result.sampleCount).toBe(240000);
    expect(result.durationSeconds).toBe(5);
    expect(result.frameCount).toBe(57);
    expect(result.fftSize).toBe(FFT_SIZE);
    expect(result.hopSize).toBe(HOP_SIZE);
  });

  it('reports a digital RMS-1 level rather than adding an acoustic offset', () => {
    const result = resultFor('sine-1000');
    expect(result.aDigitalDb).toBeCloseTo(-23.0103, 2);
    expect(result.cDigitalDb).toBeCloseTo(-23.0103, 2);
  });

  it('preserves the signed gap and constant-gain invariance', () => {
    const original = generateFixture('hum-harmonics');
    const quiet = Float32Array.from(original, (value) => value * 0.1);
    const result = analyzePcm(quiet, 48000, syntheticMeta('hum-harmonics'));
    expect(result.cMinusADb).toBeCloseTo(resultFor('hum-harmonics').cMinusADb!, 5);
    expect(result.aDigitalDb! - resultFor('hum-harmonics').aDigitalDb!).toBeCloseTo(-20, 5);
    const treble = Float32Array.from({ length: 240000 }, (_, n) => 0.1 * Math.sin(2 * Math.PI * 4000 * n / 48000));
    expect(analyzePcm(treble, 48000, syntheticMeta('sine-1000')).cMinusADb).toBeLessThan(0);
  });

  it.each([
    ['sine-63', 25.3992, 25.3440773], ['sine-125', 16.0162, 16.0101045], ['sine-1000', 0, 0.00002502],
    ['mixed-63-1000', 2.6090, 2.6066643], ['hum-harmonics', 20.4524, 20.4324009],
  ] as const)('supports 44.1 kHz without reusing 48 kHz bin frequencies: %s', (id, analytic, rateGolden) => {
    const result = analyzePcm(generateFixture(id, 44100), 44100, syntheticMeta(id));
    expect(result.frameCount).toBe(52);
    expect(Math.abs(result.cMinusADb! - analytic)).toBeLessThan(0.5);
    // Separate 44.1 kHz regression goldens, accepted only after analytic checks.
    expect(Math.abs(result.cMinusADb! - rateGolden)).toBeLessThan(0.15);
    expect(result.spectrum.hz[1] - result.spectrum.hz[0]).toBeCloseTo(44100 / 8192, 10);
  });

  it('regenerates every manifest fixture deterministically', () => {
    for (const fixture of FIXTURES) {
      expect(generateFixture(fixture.id)).toEqual(generateFixture(fixture.id));
    }
    for (const id of ['white-noise', 'lf-broadband'] as const) {
      const pcm = generateFixture(id);
      const mean = pcm.reduce((sum, value) => sum + value, 0) / pcm.length;
      const rms = Math.sqrt(pcm.reduce((sum, value) => sum + value * value, 0) / pcm.length);
      expect(Math.abs(mean)).toBeLessThan(1e-8);
      expect(rms).toBeCloseTo(0.05, 7);
    }
  });
});

describe('experimental sustained-peak indicator', () => {
  it.each(['sine-63', 'sine-125', 'sine-1000', 'mixed-63-1000', 'hum-harmonics'] as const)('finds persistent tones independently of the C−A screen: %s', (id) => {
    const result = resultFor(id);
    expect(result.peakScreen).toBe('suggested');
    expect(result.peakCandidate!.persistentFrameFraction).toBeGreaterThanOrEqual(0.8);
  });

  it('reports the actual candidate bin near 63 Hz rather than its search cluster edge', () => {
    expect(resultFor('sine-63').peakCandidate!.centerHz).toBe(11 * 48000 / 8192);
  });

  it.each(['white-noise', 'lf-broadband', 'short-burst'] as const)('does not call broadband noise or a short beep sustained: %s', (id) => {
    expect(resultFor(id).peakScreen).toBe('not-indicated');
    expect(resultFor(id).peakCandidate).toBeNull();
  });
});

describe('recording quality and provenance gates', () => {
  it.each(['silence', 'clipped'] as const)('keeps %s inconclusive', (id) => {
    const result = resultFor(id);
    expect(result.lowFrequencyScreen).toBe('inconclusive');
    expect(result.peakScreen).toBe('inconclusive');
    expect(result.cMinusADb).toBeNull();
    expect(result.aDigitalDb).toBeNull();
    expect(result.cDigitalDb).toBeNull();
    expect(result.qualityCodes).toContain(id === 'silence' ? 'near-zero' : 'clipped');
  });

  it('recognizes DC after mean removal without manufacturing weighted power', () => {
    const result = analyzePcm(new Float32Array(240000).fill(0.1), 48000, syntheticMeta('silence'));
    expect(result.qualityCodes).toContain('no-band-power');
    expect(result.cMinusADb).toBeNull();
    expect(result.peakScreen).toBe('inconclusive');
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite PCM before arithmetic (%s)', (bad) => {
    const pcm = generateFixture('sine-63');
    pcm[100] = bad;
    const result = analyzePcm(pcm, 48000, syntheticMeta('sine-63'));
    expect(result.qualityCodes).toContain('non-finite');
    expect(result.spectrum.hz).toHaveLength(0);
    expect(result.cMinusADb).toBeNull();
  });

  it('keeps truncated or explicitly interrupted captures inconclusive', () => {
    const pcm = generateFixture('sine-63');
    for (const result of [
      analyzePcm(pcm.subarray(0, 200000), 48000, syntheticMeta('sine-63')),
      analyzePcm(pcm, 48000, { ...syntheticMeta('sine-63'), qualityCodes: ['incomplete'] }),
    ]) {
      expect(result.qualityCodes).toContain('incomplete');
      expect(result.lowFrequencyScreen).toBe('inconclusive');
      expect(result.peakScreen).toBe('inconclusive');
    }
  });

  it('rejects untested sample rates', () => {
    const result = analyzePcm(new Float32Array(5 * 32000), 32000, syntheticMeta('silence'));
    expect(result.qualityCodes).toContain('unsupported-rate');
    expect(result.cMinusADb).toBeNull();
  });

  it('warns at near full scale without invalidating an otherwise unclipped sample', () => {
    const pcm = generateFixture('sine-1000');
    pcm[100] = 0.99;
    const result = analyzePcm(pcm, 48000, syntheticMeta('sine-1000'));
    expect(result.qualityCodes).toContain('near-full-scale');
    expect(result.qualityCodes).not.toContain('clipped');
    expect(result.cMinusADb).not.toBeNull();
  });

  it('applies the clipping fraction boundary at exactly 0.1 percent', () => {
    for (const clippedCount of [239, 240]) {
      const pcm = generateFixture('sine-1000');
      pcm.fill(1, 0, clippedCount);
      const result = analyzePcm(pcm, 48000, syntheticMeta('sine-1000'));
      expect(result.qualityCodes.includes('clipped')).toBe(clippedCount === 240);
      expect(result.lowFrequencyScreen === 'inconclusive').toBe(clippedCount === 240);
    }
  });

  it('retains useful provenance while filtering persistent hardware identifiers', () => {
    const result = analyzePcm(generateFixture('sine-63'), 48000, {
      ...syntheticMeta('sine-63'), inputKind: 'microphone', fixtureId: null, inputLabel: 'Room observation',
      recordedAtUtc: '2026-10-18T14:00:00.000Z',
      deviceSettings: { sampleRate: 48000, deviceId: 'private-id', groupId: 'private-group', echoCancellation: true },
    });
    expect(result.qualityCodes).toContain('processing-active');
    expect(result.cMinusADb).not.toBeNull();
    expect(result.recordedAtUtc).toBe('2026-10-18T14:00:00.000Z');
    expect(result.inputLabel).toBe('Room observation');
    expect(result.deviceSettings).toEqual({ sampleRate: 48000, echoCancellation: true });
    const imported = analyzePcm(generateFixture('sine-63'), 48000, {
      ...syntheticMeta('sine-63'), inputKind: 'imported-file', recordedAtUtc: null, channelPolicy: 'first-channel',
    });
    expect(imported.qualityCodes).toContain('imported-processing-unknown');
    expect(imported.recordedAtUtc).toBeNull();
    const unknown = analyzePcm(generateFixture('sine-63'), 48000, {
      ...syntheticMeta('sine-63'), inputKind: 'microphone', deviceSettings: null,
    });
    expect(unknown.qualityCodes).toContain('processing-unknown');
  });
});
