import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzePcm } from '../src/analysis/engine';
import { generateFixture, syntheticMeta, type FixtureId } from '../src/analysis/fixtures';
import { ResultPanel } from '../src/components/ResultPanel';

function renderFixture(id: FixtureId) {
  const result = analyzePcm(generateFixture(id, 48000), 48000, syntheticMeta(id));
  const html = renderToStaticMarkup(createElement(ResultPanel, { result, analyzing: false }));
  return { result, html };
}

describe('independent low-frequency and sustained-peak result summaries', () => {
  it('does not call a sustained 1 kHz tone absent when its C−A gap is small', () => {
    const { result, html } = renderFixture('sine-1000');
    expect(result.lowFrequencyScreen).toBe('not-indicated');
    expect(result.peakScreen).toBe('suggested');
    expect(html).toContain('Low-frequency contribution below threshold');
    expect(html).toContain('This does not rule out a tone');
    expect(html).toContain(`Candidate near ${result.peakCandidate!.centerHz.toFixed(0)} Hz`);
    expect(html).not.toContain('No tonal noise detected');
  });

  it('does not call low-frequency broadband noise tonal when its C−A gap is large', () => {
    const { result, html } = renderFixture('lf-broadband');
    expect(result.lowFrequencyScreen).toBe('suggested');
    expect(result.peakScreen).toBe('not-indicated');
    expect(html).toContain('Low-frequency contribution suggested');
    expect(html).toContain('Check the separate sustained-peak result below');
    expect(html).toContain('Experimental sustained peak</span><strong>Not indicated in this sample');
    expect(html).not.toContain('Tonal noise likely');
  });

  it('points a blocked recording to the recording check without inventing a source verdict', () => {
    const { result, html } = renderFixture('silence');
    expect(result.cMinusADb).toBeNull();
    expect(html).toContain('Low-frequency check inconclusive');
    expect(html).toContain('Review the recording check before retaking');
    expect(html).not.toContain('Tonal noise likely');
    expect(html).not.toContain('No tonal noise detected');
  });
});
