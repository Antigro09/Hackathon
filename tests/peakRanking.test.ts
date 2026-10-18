import { describe, expect, it } from 'vitest';
import { analyzePcm, ALGORITHM_VERSION, FFT_SIZE } from '../src/analysis/engine';
import { generateFixture, syntheticMeta } from '../src/analysis/fixtures';

function analyze(pcm: Float32Array, fs: number, label: string) {
  return analyzePcm(pcm, fs, { ...syntheticMeta('sine-63'), fixtureId: label, inputLabel: label });
}
function tone(fs: number, seconds: number, hz: number, amplitude: number) {
  return Float32Array.from({ length: fs * seconds }, (_, n) => amplitude * Math.sin(2 * Math.PI * hz * n / fs));
}
function competing(fs: number, fraction: number) {
  return Float32Array.from({ length: fs * 15 }, (_, n) => {
    const fade = Math.min(1, Math.max(0, (Math.floor(fs * 15 * fraction) - n) / (fs * 0.02)));
    return 0.1 * fade * Math.sin(2 * Math.PI * 63 * n / fs) + 0.001 * Math.sin(2 * Math.PI * 1000 * n / fs);
  });
}

describe('strongest eligible sustained peak', () => {
  it('versions the changed candidate-ranking behavior', () => {
    expect(ALGORITHM_VERSION).toBe('tw-screen-v2');
  });

  it.each([44100, 48000])('selects the dominant tone rather than tiny periodic PCM16 harmonics at %i Hz', fs => {
    for (const seconds of [5, 15]) {
      for (const browserNormalization of [false, true]) {
        const pcm = tone(fs, seconds, 63, 0.1).map(value => {
          const integer = Math.round(value * 32767);
          return integer / (browserNormalization && integer > 0 ? 32767 : 32768);
        });
        const result = analyze(pcm, fs, 'generated-quantized-63hz');
        expect(result.qualityCodes).toEqual([]);
        expect(result.peakScreen).toBe('suggested');
        expect(Math.abs(result.peakCandidate!.centerHz - 63)).toBeLessThanOrEqual(fs / FFT_SIZE);
        expect(result.peakCandidate!.persistentFrameFraction).toBe(1);
        expect(result.cMinusADb).toBeGreaterThan(25);
      }
    }
  });

  it.each([44100, 48000])('ranks an eligible stronger ~80%% track above a weaker 100%% track at %i Hz', fs => {
    const result = analyze(competing(fs, 0.8), fs, 'strong-80percent-vs-weak-persistent');
    expect(result.peakScreen).toBe('suggested');
    expect(Math.abs(result.peakCandidate!.centerHz - 63)).toBeLessThanOrEqual(fs / FFT_SIZE);
    expect(result.peakCandidate!.persistentFrameFraction).toBeGreaterThanOrEqual(0.8);
    expect(result.peakCandidate!.persistentFrameFraction).toBeLessThan(0.85);
  });

  it.each([44100, 48000])('excludes a stronger ~75%% track before power ranking at %i Hz', fs => {
    const result = analyze(competing(fs, 0.75), fs, 'strong-ineligible-vs-weak-persistent');
    expect(Math.abs(result.peakCandidate!.centerHz - 1000)).toBeLessThanOrEqual(fs / FFT_SIZE);
    expect(result.peakCandidate!.persistentFrameFraction).toBe(1);
  });

  it.each([44100, 48000])('retains low-gain eligible tones without an arbitrary absolute-power floor at %i Hz', fs => {
    for (const amplitude of [0.1, 0.0001]) {
      const result = analyze(tone(fs, 15, 63, amplitude), fs, 'gain-scaled-63hz');
      expect(result.qualityCodes).toEqual([]);
      expect(Math.abs(result.peakCandidate!.centerHz - 63)).toBeLessThanOrEqual(fs / FFT_SIZE);
    }
  });

  it.each([44100, 48000])('retains rejection of broadband noise and a brief burst at %i Hz', fs => {
    for (const fixture of ['white-noise', 'short-burst'] as const) {
      const result = analyzePcm(generateFixture(fixture, fs), fs, syntheticMeta(fixture));
      expect(result.peakCandidate).toBeNull();
      expect(result.peakScreen).toBe('not-indicated');
    }
  });
});
