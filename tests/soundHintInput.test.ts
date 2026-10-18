import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { copySoundHintObservation } from '../src/ai/input';
import { SoundHintsPanel } from '../src/components/SoundHintsPanel';
import { analyzePcm } from '../src/analysis/engine';
import { syntheticMeta } from '../src/analysis/fixtures';

describe('immutable first-five-second AI observation', () => {
  it.each([
    [44100, 5], [44100, 15], [44100, 30], [48000, 5], [48000, 15], [48000, 30],
  ] as const)('copies only the first five seconds of %i Hz / %i-second PCM and preserves the full input', (fs, seconds) => {
    const pcm = Float32Array.from({ length: fs * seconds }, (_, index) => 0.1 * Math.sin(2 * Math.PI * (index < fs * 5 ? 63 : 1000) * index / fs));
    const before = pcm.slice();
    const observation = copySoundHintObservation(pcm, fs);
    expect(observation).toHaveLength(fs * 5);
    expect(observation.buffer).not.toBe(pcm.buffer);
    expect(observation.every((value, index) => value === before[index])).toBe(true);
    expect(pcm.every((value, index) => value === before[index])).toBe(true);
    observation[0] = 0.75;
    expect(pcm[0]).toBe(before[0]);
    const oldSecond = observation[1];
    pcm[1] = -0.75;
    expect(observation[1]).toBe(oldSecond);
    expect(pcm).toHaveLength(fs * seconds);
  });

  it('respects an input view offset instead of including unrelated backing-buffer samples', () => {
    const backing = new Float32Array(240032).fill(-0.5);
    const view = backing.subarray(16, 240016);
    view.fill(0.2);
    const observation = copySoundHintObservation(view, 48000);
    expect(observation).toHaveLength(240000);
    expect(observation.every(value => value === view[0])).toBe(true);
    expect(observation.buffer).not.toBe(backing.buffer);
  });

  it.each([44100, 48000])('rejects a %i Hz source even one sample shorter than five seconds', fs => {
    expect(() => copySoundHintObservation(new Float32Array(fs * 5 - 1), fs)).toThrow(/at least five seconds/);
  });

  it.each([0, 32000, 44101, NaN, Infinity])('rejects unsupported rate %s rather than relabeling samples', fs => {
    expect(() => copySoundHintObservation(new Float32Array(240000), fs)).toThrow(/44.1 or 48 kHz/);
  });

  it.each([NaN, Infinity, -Infinity])('rejects invalid PCM even when it occurs after the retained prefix (%s)', value => {
    const pcm = new Float32Array(48000 * 15).fill(0.1);
    pcm[48000 * 10] = value;
    expect(() => copySoundHintObservation(pcm, 48000)).toThrow(/invalid audio samples/);
  });

  it('rejects a non-PCM container without mutating or coercing it', () => {
    expect(() => copySoundHintObservation(new Float64Array(240000) as unknown as Float32Array, 48000)).toThrow(/Float32Array/);
  });
});

describe('AI window disclosure', () => {
  it.each([15, 30])('distinguishes the five-second hints from a full %i-second report', durationSeconds => {
    const result = {
      ...analyzePcm(new Float32Array(240000), 48000, syntheticMeta('silence')),
      durationSeconds, sampleCount: durationSeconds * 48000,
    };
    const html = renderToStaticMarkup(createElement(SoundHintsPanel, { result, input: null, observationDurationSeconds: durationSeconds }));
    expect(html).toContain(`AI window: the first 5 seconds of this ${durationSeconds}.00-second observation`);
    expect(html).toContain(`standard indicators and report use the full ${durationSeconds}.00 seconds`);
    expect(html).toContain('Sounds after the first five seconds are not included');
    expect(html).toContain('Audio stays on this device');
    expect(html).toContain('excluded from exported reports');
  });

  it('uses the actual result duration when no separate disclosure prop is supplied', () => {
    const result = analyzePcm(new Float32Array(240000), 48000, syntheticMeta('silence'));
    const html = renderToStaticMarkup(createElement(SoundHintsPanel, { result, input: null }));
    expect(html).toContain('first 5 seconds of this 5.00-second observation');
    expect(html).not.toContain('Sounds after the first five seconds are not included');
  });
});
