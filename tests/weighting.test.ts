import { describe, expect, it } from 'vitest';
import { aGain, aWeightingDb, cGain, cWeightingDb } from '../src/analysis/weighting';

describe('normalized A/C weighting', () => {
  it('uses exactly unity amplitude gain at 1 kHz and rejects DC', () => {
    expect(aGain(1000)).toBe(1);
    expect(cGain(1000)).toBe(1);
    expect(aGain(0)).toBe(0);
    expect(cGain(0)).toBe(0);
  });

  it.each([
    [31.5, -39.5, -3.0],
    [63, -26.2, -0.8],
    [125, -16.2, -0.2],
    [250, -8.7, 0.0],
    [4000, 1.0, -0.8],
    [8000, -1.1, -3.0],
  ])('agrees with rounded response tables at %s Hz', (hz, aDb, cDb) => {
    expect(Math.abs(aWeightingDb(hz) - aDb)).toBeLessThan(0.15);
    expect(Math.abs(cWeightingDb(hz) - cDb)).toBeLessThan(0.15);
  });

  it.each([[63, 25.3992], [125, 16.0162], [1000, 0]])('matches analytic C−A at %s Hz', (hz, expected) => {
    expect(cWeightingDb(hz) - aWeightingDb(hz)).toBeCloseTo(expected, 3);
  });
});
