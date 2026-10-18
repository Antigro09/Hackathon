import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { ResultPanel } from '../src/components/ResultPanel';
import { analyzePcm } from '../src/analysis/engine';
import { syntheticMeta } from '../src/analysis/fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('observation guidance', () => {
  it('opens directly to live microphone capture with every duration available', () => {
    vi.stubGlobal('window', { location: { hash: '#/measure' } });
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('Live microphone');
    expect(html).toContain('Start 5-second capture');
    expect(html).toContain('aria-label="5-second observation" aria-pressed="true"');
    expect(html).toContain('aria-label="15-second observation" aria-pressed="false"');
    expect(html).toContain('aria-label="30-second observation" aria-pressed="false"');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('Analyze file');
    expect(html).not.toContain('Analyze demo');
    expect(html).not.toContain('Input type');
  });

  it('offers microphone capture and learning from Home without demo or import instructions', () => {
    vi.stubGlobal('window', { location: { hash: '#/' } });
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('Start an observation');
    expect(html).toContain('Understand the signal');
    expect(html).toContain('Record a live microphone sample for 5, 15, or 30 seconds.');
    expect(html).not.toContain('Try a synthetic demo');
    expect(html).not.toContain('load a local file');
  });

  it('guides Learn and empty reports back to live microphone observation', () => {
    for (const route of ['/learn', '/report']) {
      vi.stubGlobal('window', { location: { hash: `#${route}` } });
      const html = renderToStaticMarkup(createElement(App));
      expect(html).toContain('live microphone');
      expect(html).not.toContain('imported file');
      expect(html).not.toContain('Observation → Demo');
      expect(html).not.toContain('Explore synthetic demos');
    }
  });

  it('describes the optional longer capture without promising finer frequency resolution', () => {
    vi.stubGlobal('window', { location: { hash: '#/sources' } });
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('15 seconds gives more analysis frames');
    expect(html).toContain('Five seconds can also show a peak near 60 Hz');
    expect(html).toContain('does not change the FFT bin spacing');
    expect(html).toContain('live microphone capture');
    expect(html).not.toContain('Microphone or File');
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
