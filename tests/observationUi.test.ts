import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { ResultPanel } from '../src/components/ResultPanel';
import { analyzePcm } from '../src/analysis/engine';
import { syntheticMeta } from '../src/analysis/fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('observation guidance', () => {
  it('makes longer microphone observations discoverable from the default five-second demo', () => {
    vi.stubGlobal('window', { location: { hash: '#/measure' } });
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('Demos use 5 seconds.');
    expect(html).toContain('Microphone and file observations offer 5, 15, or 30 seconds.');
    expect(html).toContain('Use 15-second microphone capture');
  });

  it('describes the optional longer capture without promising finer frequency resolution', () => {
    vi.stubGlobal('window', { location: { hash: '#/sources' } });
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('15 seconds gives more analysis frames');
    expect(html).toContain('Five seconds can also show a peak near 60 Hz');
    expect(html).toContain('does not change the FFT bin spacing');
  });

  it('explains a negative C−A difference separately from negative digital levels beside the displayed values', () => {
    const fs = 48000;
    const pcm = Float32Array.from({ length: fs * 5 }, (_, n) => 0.1 * Math.sin(2 * Math.PI * 4000 * n / fs));
    const result = analyzePcm(pcm, fs, { ...syntheticMeta('sine-1000'), fixtureId: 'sine-4000-test' });
    expect(result.aDigitalDb).toBeLessThan(0);
    expect(result.cDigitalDb).toBeLessThan(0);
    expect(result.cMinusADb).toBeLessThan(-1);
    const html = renderToStaticMarkup(createElement(ResultPanel, { result, analyzing: false }));
    expect(html).toContain('Why can the levels be negative?');
    expect(html).toContain('−20 dB is one-tenth of its RMS amplitude');
    expect(html).toContain('C−A is a separate difference.');
    expect(html).toContain('C-weighted level is lower than the A-weighted level');
    expect(html).toContain('not calibrated dB SPL');
    expect(html).toContain(result.cMinusADb!.toFixed(1));
  });
});
