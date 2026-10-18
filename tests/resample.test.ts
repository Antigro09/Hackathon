import { describe, expect, it } from 'vitest';
import reference from './fixtures/resample-poly/reference.json';
import { resampleForSoundHints, soundHintResampleLength } from '../src/ai/resample';

function sourceFor(kind: string, fs: number): Float32Array {
  const source = new Float32Array(fs * 5);
  if (kind.startsWith('tone')) {
    const hz = Number(kind.slice(4));
    for (let i = 0; i < source.length; i += 1) source[i] = 0.125 * Math.sin(2 * Math.PI * hz * i / fs);
  } else if (kind === 'noise') {
    let state = 0x08042026;
    for (let i = 0; i < source.length; i += 1) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      source[i] = ((state >>> 0) / 4294967296 - 0.5) * 0.25;
    }
  } else {
    [0, 1, fs * 2 + 17, source.length - 2, source.length - 1].forEach((index, i) => {
      source[index] = [0.75, -0.5, 0.375, -0.25, 0.625][i];
    });
  }
  return source;
}

describe('deterministic model sample-rate conversion', () => {
  it.each(reference.cases)('matches independent SciPy $kind at $sampleRateHz Hz including boundary samples', async fixture => {
    const source = sourceFor(fixture.kind, fixture.sampleRateHz);
    const before = source.slice();
    const output = await resampleForSoundHints(source, fixture.sampleRateHz);
    expect(output).toHaveLength(reference.outputSamples);
    expect(output.every(Number.isFinite)).toBe(true);
    let maximumError = 0;
    reference.indices.forEach((index, offset) => {
      maximumError = Math.max(maximumError, Math.abs(output[index] - fixture.values[offset]));
    });
    expect(maximumError).toBeLessThanOrEqual(2e-7);
    expect(source.every((value, index) => Object.is(value, before[index]))).toBe(true);
    expect(output.buffer).not.toBe(source.buffer);
  });

  it('uses an independent copy at 48 kHz and preserves subarray boundaries', async () => {
    const storage = new Float32Array(240004);
    storage[0] = NaN; storage[storage.length - 1] = Infinity;
    const source = storage.subarray(2, 240002);
    source[42] = 0.25;
    const output = await resampleForSoundHints(source, 48000);
    expect(output).toEqual(source);
    output[42] = -0.5;
    expect(source[42]).toBe(0.25);
  });

  it.each([new Float32Array(0), new Float32Array(239999), new Float32Array(240001), new Float32Array(48000 * 15), new Float32Array(48000 * 30)])('rejects incomplete or longer observations instead of padding/cropping silently', async source => {
    await expect(resampleForSoundHints(source, 48000)).rejects.toThrow(/five seconds|invalid/);
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite samples anywhere, including the final sample (%s)', async invalid => {
    const source = new Float32Array(220500); source[source.length - 1] = invalid;
    await expect(resampleForSoundHints(source, 44100)).rejects.toThrow(/invalid audio/);
  });

  it.each([0, 7999, 192001, 44100.5, NaN, Infinity])('rejects invalid actual sample rate %s', async fs => {
    expect(() => soundHintResampleLength(240000, fs)).toThrow(/invalid/);
    await expect(resampleForSoundHints(new Float32Array(240000), fs)).rejects.toThrow(/invalid/);
  });

  it('rejects arrays without a Float32 PCM contract', async () => {
    await expect(resampleForSoundHints(new Float64Array(240000) as unknown as Float32Array, 48000)).rejects.toThrow(/invalid audio/);
  });

  it('never returns non-finite output when a finite but unphysical input overflows the FIR', async () => {
    const source = new Float32Array(16000 * 5).fill(3.4028234663852886e38);
    await expect(resampleForSoundHints(source, 16000)).rejects.toThrow(/invalid audio/);
  });
});
