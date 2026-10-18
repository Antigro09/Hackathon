import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('leaflet', () => ({}));
import CommunityMap from '../src/components/CommunityMap';
import { analyzePcm } from '../src/analysis/engine';
import { generateFixture, syntheticMeta } from '../src/analysis/fixtures';

const result = analyzePcm(generateFixture('sine-1000', 48000), 48000, syntheticMeta('sine-1000'));
afterEach(() => vi.unstubAllGlobals());

describe('public map rendering boundaries', () => {
  it('shows separate provenance and explicit searches without invented community records or render-time requests', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const html = renderToStaticMarkup(createElement(CommunityMap, { currentResult: null }));
    expect(html).toContain('Community noise map');
    expect(html).toContain('SELF-REPORTED · UNVERIFIED');
    expect(html).toContain('Shared observations appear after contributors choose to publish.');
    expect(html).toContain('Search places');
    expect(html).toContain('Find data centers');
    expect(html).toContain('Neither search starts automatically');
    expect(html).toContain('The street map loads automatically from OpenStreetMap');
    expect(html).toContain('filters it locally');
    expect(html).not.toContain('Private.coffee');
    expect(html).toContain('Open-Meteo');
    expect(html).not.toContain('Illustrative site');
    expect(html).not.toContain('Add a local preview');
    expect(html).not.toContain('community-label');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires microphone provenance and an explicit public location review', () => {
    const rejected = renderToStaticMarkup(createElement(CommunityMap, { currentResult: result }));
    expect(rejected).toContain('Record a live microphone sample before publishing');
    expect(rejected).not.toContain('id="community-label"');
    const html = renderToStaticMarkup(createElement(CommunityMap, { currentResult: { ...result, inputKind: 'microphone', fixtureId: null, recordedAtUtc: '2026-10-18T18:00:00.000Z' } }));
    expect(html).toContain('id="community-label"');
    expect(html).toContain('id="community-note"');
    expect(html).toContain('rounded before sending to three decimals');
    expect(html).toContain('I confirm this approximate location is where I recorded');
    expect(html).toContain('Publish public observation');
    expect(html).toContain('No facility reference');
    expect(html).not.toContain('Private device');
    expect(html).toMatch(/disabled="">Publish public observation/);
  });

  it('reviews quality-blocked captures descriptively with no suggested peak or numeric result', () => {
    const html = renderToStaticMarkup(createElement(CommunityMap, { currentResult: { ...result, inputKind: 'microphone', fixtureId: null, recordedAtUtc: '2026-10-18T18:00:00.000Z', qualityCodes: ['clipped'] } }));
    expect(html).toContain('Numeric screening unavailable');
    expect(html).toContain('Sustained-peak check inconclusive');
    expect(html).not.toContain('Sustained narrowband peak suggested');
  });
});
