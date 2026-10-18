import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InputMeterAccumulator } from '../src/audio/meter';
import { InputMeter } from '../src/components/InputMeter';

describe('live digital input preview', () => {
  it('measures a known 0.1-peak sine as approximately −23.01 dB relative to RMS 1', () => {
    const sine = Float32Array.from({ length: 4800 }, (_, index) => 0.1 * Math.sin(2 * Math.PI * 1000 * index / 48000));
    const reading = new InputMeterAccumulator().push(sine, 0)!;
    expect(reading.rms).toBeCloseTo(0.1 / Math.sqrt(2), 7);
    expect(reading.peak).toBeCloseTo(0.1, 7);
    expect(reading.levelDb).toBeCloseTo(-23.0103, 4);
    expect(reading.clipped).toBe(false);
  });

  it('aggregates all samples and retains transient clipping between throttled updates', () => {
    const meter = new InputMeterAccumulator();
    expect(meter.push(new Float32Array([0]), 0)?.levelDb).toBeNull();
    expect(meter.push(new Float32Array([1]), 20)).toBeNull();
    expect(meter.push(new Float32Array(99), 99)).toBeNull();
    const reading = meter.push(new Float32Array(100), 100)!;
    expect(reading.rms).toBeCloseTo(1 / Math.sqrt(200), 10);
    expect(reading.peak).toBe(1);
    expect(reading.clipped).toBe(true);
    expect(reading.levelDb).toBeCloseTo(-23.0103, 4);
    const quiet = meter.push(new Float32Array(100), 200)!;
    expect(quiet).toEqual({ rms: 0, peak: 0, clipped: false, levelDb: null });
  });

  it('emits at most ten updates over a second of arriving chunks, without delayed timers', () => {
    const meter = new InputMeterAccumulator();
    const emissions: number[] = [];
    for (let now = 0; now < 1000; now += 10) {
      if (meter.push(new Float32Array([0.25, -0.25]), now)) emissions.push(now);
    }
    expect(emissions).toHaveLength(10);
    expect(emissions.every((now, index) => index === 0 || now - emissions[index - 1] >= 100)).toBe(true);
  });

  it('does not display invalid floating-point samples as a zero or NaN reading', () => {
    const meter = new InputMeterAccumulator();
    expect(meter.push(new Float32Array([NaN, Infinity]), 0)).toBeNull();
    expect(meter.push(new Float32Array(), 0)).toBeNull();
    expect(meter.push(new Float32Array([0.5]), 1)?.levelDb).toBeCloseTo(-6.0206, 4);
  });
});

describe('input meter presentation', () => {
  const reading = { rms: 0.25, peak: 1, clipped: true, levelDb: -12.0412 };

  it('provides bounded meter semantics and describes digital clipping without acoustic claims', () => {
    const html = renderToStaticMarkup(createElement(InputMeter, { reading, active: true }));
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemin="-90"');
    expect(html).toContain('aria-valuemax="0"');
    expect(html).toContain('aria-valuenow="-12.0412"');
    expect(html).toContain('dB relative to RMS 1; digital clipping detected');
    expect(html).toContain('Digital clipping detected. Lower microphone gain and retry.');
    expect(html).not.toMatch(/dBA|dBC|safe|harmful/);
  });

  it('clears stale readings when inactive and describes silence without an infinite value', () => {
    const idle = renderToStaticMarkup(createElement(InputMeter, { reading, active: false }));
    expect(idle).toContain('Microphone idle');
    expect(idle).toContain('aria-valuenow="-90"');
    expect(idle).not.toContain('clipping detected');
    const silence = renderToStaticMarkup(createElement(InputMeter, { reading: { rms: 0, peak: 0, clipped: false, levelDb: null }, active: true }));
    expect(silence).toContain('Digital silence; no measurable input');
    expect(silence).not.toMatch(/Infinity|NaN/);
  });
});
