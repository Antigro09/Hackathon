import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzePcm, FFT_SIZE, HOP_SIZE } from '../src/analysis/engine';
import { FIXTURES, generateFixture, syntheticMeta } from '../src/analysis/fixtures';
import type { AnalysisResult, QualityCode } from '../src/types';

interface FieldPeak {
  centerHz: number;
  prominenceDb: number;
  persistentFrameFraction: number;
}
interface FieldAnalysis {
  algorithmVersion: string;
  sampleRateHz: number;
  sampleCount: number;
  durationSeconds: number;
  fftSize: number;
  hopSize: number;
  frameCount: number;
  binSpacingHz: number | null;
  aDigitalDb: number | null;
  cDigitalDb: number | null;
  cMinusADb: number | null;
  lowFrequencyScreen: AnalysisResult['lowFrequencyScreen'];
  peakScreen: AnalysisResult['peakScreen'];
  peakCandidate: FieldPeak | null;
  qualityCodes: QualityCode[];
  spectrum: { hz: number[]; powerDb: number[] };
  lineFrequencyCandidates: Array<FieldPeak & { referenceHz: number; binIndex: number; binSpacingHz: number }>;
}

const html = readFileSync(new URL('../field_lab.html', import.meta.url), 'utf8');
const source = html.match(/<script\s+id=["']field-lab-dsp["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
if (!source) throw new Error('The standalone lab must contain its dependency-free field-lab-dsp script.');
const analyzeStandalone = new Function(`${source}\nreturn analyzeStandalonePcm;`)() as (pcm: Float32Array, fs: number, expectedDuration?: number) => FieldAnalysis;
const sine = (fs: number, seconds: number, hz = 63) => Float32Array.from({ length: fs * seconds }, (_, n) => 0.1 * Math.sin(2 * Math.PI * hz * n / fs));

function compareAnalysis(actual: FieldAnalysis, expected: AnalysisResult) {
  expect(actual.sampleRateHz).toBe(expected.sampleRateHz);
  expect(actual.sampleCount).toBe(expected.sampleCount);
  expect(actual.durationSeconds).toBe(expected.durationSeconds);
  expect(actual.frameCount).toBe(expected.frameCount);
  expect(actual.fftSize).toBe(FFT_SIZE);
  expect(actual.hopSize).toBe(HOP_SIZE);
  expect(actual.qualityCodes).toEqual(expected.qualityCodes);
  expect(actual.lowFrequencyScreen).toBe(expected.lowFrequencyScreen);
  expect(actual.peakScreen).toBe(expected.peakScreen);
  for (const key of ['aDigitalDb', 'cDigitalDb', 'cMinusADb'] as const) {
    if (expected[key] === null) expect(actual[key]).toBeNull();
    else expect(actual[key]).toBeCloseTo(expected[key], 7);
  }
  if (!expected.peakCandidate) expect(actual.peakCandidate).toBeNull();
  else {
    expect(actual.peakCandidate!.centerHz).toBe(expected.peakCandidate.centerHz);
    expect(actual.peakCandidate!.prominenceDb).toBeCloseTo(expected.peakCandidate.prominenceDb, 5);
    expect(actual.peakCandidate!.persistentFrameFraction).toBe(expected.peakCandidate.persistentFrameFraction);
  }
  expect(actual.spectrum.hz).toEqual(expected.spectrum.hz);
  expect(actual.spectrum.powerDb).toHaveLength(expected.spectrum.powerDb.length);
  // Compare every bin in linear power: negligible numerical sidelobes do not
  // justify strict dB equality near the plotting floor. No bins are skipped.
  let largestToleranceRatio = 0;
  for (let i = 0; i < actual.spectrum.powerDb.length; i++) {
    const actualPower = 10 ** (actual.spectrum.powerDb[i] / 10);
    const expectedPower = 10 ** (expected.spectrum.powerDb[i] / 10);
    const tolerance = Math.max(1e-20, expectedPower * 1e-6);
    largestToleranceRatio = Math.max(largestToleranceRatio, Math.abs(actualPower - expectedPower) / tolerance);
  }
  expect(largestToleranceRatio).toBeLessThanOrEqual(1);
}

describe('standalone full-recording DSP compared with the main numerical engine', () => {
  it.each([44100, 48000])('matches every fixed fixture and full PSD at %i Hz without an FFT dependency', fs => {
    for (const fixture of FIXTURES) {
      const pcm = generateFixture(fixture.id, fs);
      compareAnalysis(analyzeStandalone(pcm, fs), analyzePcm(pcm, fs, syntheticMeta(fixture.id)));
    }
  }, 15_000);

  it.each([[44100, 15], [44100, 30], [48000, 15], [48000, 30]] as const)('uses all %i Hz × %i-second samples and complete frames', (fs, seconds) => {
    const pcm = sine(fs, seconds);
    const actual = analyzeStandalone(pcm, fs, seconds);
    compareAnalysis(actual, analyzePcm(pcm, fs, syntheticMeta('sine-63')));
    expect(actual.algorithmVersion).toBe('tw-field-lab-v2');
    expect(actual.sampleCount).toBe(fs * seconds);
    expect(actual.frameCount).toBe(1 + Math.floor((fs * seconds - FFT_SIZE) / HOP_SIZE));
    expect(actual.binSpacingHz).toBe(fs / FFT_SIZE);
  });

  it('averages early bass and later treble over the whole recording instead of the final analyser frame', () => {
    const fs = 48000;
    const pcm = sine(fs, 15, 1000);
    pcm.set(sine(fs, 5, 63));
    const actual = analyzeStandalone(pcm, fs, 15);
    const expected = analyzePcm(pcm, fs, syntheticMeta('mixed-63-1000'));
    compareAnalysis(actual, expected);
    expect(actual.cMinusADb).toBeGreaterThan(1);
    expect(actual.cMinusADb).toBeLessThan(3);
    expect(actual.peakScreen).toBe('not-indicated');
  });
});

describe('standalone quality and observation duration gates', () => {
  it('does not turn a shorter recording into the selected duration', () => {
    const actual = analyzeStandalone(sine(48000, 5), 48000, 30);
    expect(actual.durationSeconds).toBe(5);
    expect(actual.sampleCount).toBe(240000);
    expect(actual.qualityCodes).toContain('incomplete');
    expect(actual.aDigitalDb).toBeNull();
    expect(actual.cDigitalDb).toBeNull();
    expect(actual.cMinusADb).toBeNull();
    expect(actual.lineFrequencyCandidates).toEqual([]);
  });

  it.each([NaN, Infinity, -Infinity])('rejects invalid samples before FFT or level arithmetic (%s)', bad => {
    const pcm = sine(48000, 5);
    pcm[100] = bad;
    const actual = analyzeStandalone(pcm, 48000);
    expect(actual.qualityCodes).toContain('non-finite');
    expect(actual.frameCount).toBe(0);
    expect(actual.spectrum.hz).toEqual([]);
    expect(actual.aDigitalDb).toBeNull();
    expect(actual.cDigitalDb).toBeNull();
    expect(actual.cMinusADb).toBeNull();
  });

  it.each([0, 32000, 96000, NaN])('keeps unsupported sample rate %s inconclusive', fs => {
    const actual = analyzeStandalone(sine(48000, 5), fs);
    expect(actual.qualityCodes).toContain('unsupported-rate');
    expect(actual.aDigitalDb).toBeNull();
    expect(actual.cDigitalDb).toBeNull();
    expect(actual.cMinusADb).toBeNull();
    expect(actual.frameCount).toBe(0);
  });

  it('keeps silence and overload inconclusive and does not reuse an earlier valid result', () => {
    expect(analyzeStandalone(sine(48000, 5), 48000).cMinusADb).not.toBeNull();
    for (const fixture of ['silence', 'clipped'] as const) {
      const actual = analyzeStandalone(generateFixture(fixture), 48000);
      expect(actual.qualityCodes).toContain(fixture === 'silence' ? 'near-zero' : 'clipped');
      expect(actual.aDigitalDb).toBeNull();
      expect(actual.cDigitalDb).toBeNull();
      expect(actual.cMinusADb).toBeNull();
      expect(actual.peakCandidate).toBeNull();
      expect(actual.lineFrequencyCandidates).toEqual([]);
    }
  });
});

describe('separate near-60/120 frequency observations', () => {
  it.each([44100, 48000])('labels actual persistent FFT bins with resolution at %i Hz', fs => {
    const pcm = Float32Array.from({ length: fs * 5 }, (_, n) => 0.1 * Math.sin(2 * Math.PI * 60 * n / fs) + 0.05 * Math.sin(2 * Math.PI * 120 * n / fs));
    const result = analyzeStandalone(pcm, fs);
    expect(result.lineFrequencyCandidates.map(candidate => candidate.referenceHz)).toEqual([60, 120]);
    for (const candidate of result.lineFrequencyCandidates) {
      expect(candidate.persistentFrameFraction).toBeGreaterThanOrEqual(0.8);
      expect(candidate.prominenceDb).toBeGreaterThanOrEqual(12);
      expect(candidate.centerHz).toBe(candidate.binIndex * fs / FFT_SIZE);
      expect(Math.abs(candidate.centerHz - candidate.referenceHz)).toBeLessThanOrEqual(fs / FFT_SIZE);
      expect(candidate.binSpacingHz).toBe(fs / FFT_SIZE);
    }
  });

  it('never equates a high broadband gap, unrelated tone, or short event with a near-line-frequency candidate', () => {
    const broadband = analyzeStandalone(generateFixture('lf-broadband'), 48000);
    expect(broadband.cMinusADb).toBeGreaterThan(15);
    expect(broadband.lowFrequencyScreen).toBe('suggested');
    expect(broadband.peakScreen).toBe('not-indicated');
    expect(broadband.lineFrequencyCandidates).toEqual([]);
    expect(analyzeStandalone(sine(48000, 5, 100), 48000).lineFrequencyCandidates).toEqual([]);
    const short = new Float32Array(48000 * 15);
    short.set(sine(48000, 5, 60));
    const result = analyzeStandalone(short, 48000, 15);
    expect(result.peakScreen).toBe('not-indicated');
    expect(result.lineFrequencyCandidates).toEqual([]);
  });
});
