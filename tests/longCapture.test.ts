import { describe, expect, it } from 'vitest';
import { CaptureCollector } from '../src/audio/chunks';
import type { CaptureDurationSeconds } from '../src/audio/chunks';
import { analyzePcm, FFT_SIZE, HOP_SIZE } from '../src/analysis/engine';
import { syntheticMeta } from '../src/analysis/fixtures';

const cases = [[44100, 15], [44100, 30], [48000, 15], [48000, 30]] as const;
const sine = (fs: number, seconds: number) => Float32Array.from(
  { length: fs * seconds }, (_, index) => 0.1 * Math.sin(2 * Math.PI * 63 * index / fs),
);

describe('selected-duration sample collection', () => {
  it.each(cases)('discards only .5-second warmup and keeps exactly %i Hz × %i seconds across irregular chunks', (fs, durationSeconds) => {
    const collector = new CaptureCollector(fs, durationSeconds);
    const lengths = [127, 1000, 4093, 8192];
    let startSample = 0;
    let count = 0;
    let previousProgress = 0;
    while (!collector.complete) {
      const length = lengths[count++ % lengths.length];
      collector.push({ startSample, samples: Float32Array.from({ length }, (_, index) => startSample + index) });
      startSample += length;
      expect(collector.progress).toBeGreaterThanOrEqual(previousProgress);
      expect(collector.progress).toBeLessThanOrEqual(1);
      previousProgress = collector.progress;
    }
    expect(collector.warmupSamples).toBe(fs / 2);
    expect(collector.recordedSamples).toBe(fs * durationSeconds);
    expect(collector.pcm[0]).toBe(fs / 2);
    expect(collector.pcm.at(-1)).toBe(fs * (durationSeconds + 0.5) - 1);
    expect(collector.progress).toBe(1);
    const last = collector.pcm.at(-1);
    collector.push({ startSample, samples: new Float32Array([999]) });
    expect(collector.pcm.at(-1)).toBe(last);
  });

  it.each([0, 1, 10, 60, -1, NaN, Infinity, null, '15'])('rejects unsupported duration %s at runtime', duration => {
    expect(() => new CaptureCollector(48000, duration as CaptureDurationSeconds)).toThrow(/5, 15, or 30 seconds/);
  });
});

describe('longer deterministic spectrum analysis', () => {
  it.each(cases)('uses actual full-duration Hann frames and preserves the 63 Hz gap at %i Hz for %i seconds', (fs, durationSeconds) => {
    const short = analyzePcm(sine(fs, 5), fs, syntheticMeta('sine-63'));
    const result = analyzePcm(sine(fs, durationSeconds), fs, syntheticMeta('sine-63'));
    expect(result.sampleCount).toBe(fs * durationSeconds);
    expect(result.durationSeconds).toBe(durationSeconds);
    expect(result.frameCount).toBe(1 + Math.floor((fs * durationSeconds - FFT_SIZE) / HOP_SIZE));
    expect(result.fftSize).toBe(8192);
    expect(result.hopSize).toBe(4096);
    expect(result.spectrum.hz[1] - result.spectrum.hz[0]).toBeCloseTo(fs / FFT_SIZE, 10);
    expect(result.cMinusADb).toBeCloseTo(short.cMinusADb!, 3);
    expect(result.aDigitalDb).toBeCloseTo(short.aDigitalDb!, 3);
    expect(result.cDigitalDb).toBeCloseTo(short.cDigitalDb!, 3);
    expect(result.lowFrequencyScreen).toBe('suggested');
    expect(result.peakScreen).toBe('suggested');
    expect(result.peakCandidate!.persistentFrameFraction).toBe(1);
  });

  it.each(cases)('keeps all %i Hz / %i-second frames in the sustained-peak denominator when only the first five seconds contain a tone', (fs, durationSeconds) => {
    const pcm = new Float32Array(fs * durationSeconds);
    pcm.set(sine(fs, 5));
    const result = analyzePcm(pcm, fs, syntheticMeta('sine-63'));
    expect(result.frameCount).toBe(1 + Math.floor((pcm.length - FFT_SIZE) / HOP_SIZE));
    expect(result.qualityCodes).not.toContain('incomplete');
    expect(result.qualityCodes).not.toContain('near-zero');
    expect(result.lowFrequencyScreen).toBe('suggested');
    expect(result.peakScreen).toBe('not-indicated');
    expect(result.peakCandidate).toBeNull();
  });
});
