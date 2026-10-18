import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildCaseReport, caseReportText, caseReportTime } from '../src/community/buildCaseReport';
import { CommunityCaseReport } from '../src/components/CommunityCaseReport';
import type { NeighborhoodCaseDetail } from '../src/community/casesTypes';
import type { CommunityObservation } from '../src/community/types';
import type { QualityCode } from '../src/types';

const caseId = 'aaaaaaaa-1111-4111-8111-000000000001';
const observationId = (index: number) => `bbbbbbbb-2222-4222-8222-${String(index).padStart(12, '0')}`;
const blockedCodes: QualityCode[] = ['near-zero', 'clipped', 'near-full-scale', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power'];
function observation(index = 1, overrides: Partial<CommunityObservation> = {}): CommunityObservation {
  return { schemaVersion: 1, id: observationId(index), inputKind: 'microphone', coordinates: { latitude: 39.044, longitude: -77.487 },
    label: `Public observation ${index}`, note: 'A recurring sound was audible outside; source unconfirmed.', capturedAtUtc: '2026-10-18T12:00:00.000Z',
    publishedAtUtc: '2026-10-18T12:01:00.000Z', durationSeconds: 15, sampleRateHz: 48000, sampleCount: 720000, frameCount: 174,
    algorithmVersion: 'tw-screen-v2', qualityCodes: [], aDigitalDb: -40, cDigitalDb: -24, cMinusADb: 16, peakScreen: 'suggested',
    nearbyFacility: null, provenance: 'public-self-reported', verification: 'unverified', locationPrecision: 'rounded-3-decimals', ...overrides };
}
function blocked(index: number, code: QualityCode): CommunityObservation {
  return observation(index, { qualityCodes: [code], aDigitalDb: null, cDigitalDb: null, cMinusADb: null, peakScreen: 'inconclusive',
    frameCount: ['near-zero', 'non-finite', 'unsupported-rate'].includes(code) ? 0 : 174 });
}
function detail(observations: CommunityObservation[] = []): NeighborhoodCaseDetail {
  return { case: { schemaVersion: 1, id: caseId, title: 'Recurring evening sound in our area', neighborhood: 'Example neighborhood',
    description: 'Please review the recurring sound described in these public observations.', coordinates: { latitude: 39.044, longitude: -77.487 },
    radiusKm: 3, createdAtUtc: '2026-10-17T08:00:00.000Z', provenance: 'public-self-reported', verification: 'unverified', locationPrecision: 'rounded-3-decimals' },
    observations, limit: 200, notice: 'Complete current linked public observations, up to200.' };
}

describe('community case report current-snapshot aggregation', () => {
  it('counts observations rather than residents and sorts capture times independently of publication order', () => {
    const input = detail([
      observation(3, { capturedAtUtc: '2026-10-19T00:00:00.000Z', publishedAtUtc: '2026-10-19T00:00:01.000Z' }),
      observation(2, { capturedAtUtc: '2026-10-18T23:59:59.000Z', publishedAtUtc: '2026-10-20T00:00:00.000Z' }),
      observation(1, { capturedAtUtc: '2026-10-18T00:00:00.000Z' }),
    ]), before = structuredClone(input), report = buildCaseReport(input);
    expect(report.summary).toMatchObject({ observationCount: 3, distinctUtcDays: 2,
      firstCaptureUtc: '2026-10-18T00:00:00.000Z', lastCaptureUtc: '2026-10-19T00:00:00.000Z' });
    expect(report.observations.map(row => row.id)).toEqual([observationId(1), observationId(2), observationId(3)]);
    expect(input).toEqual(before);
    expect(caseReportText(report)).toContain('Counts are observations, not people or households');
  });

  it('deduplicates identical immutable IDs but refuses conflicting copies instead of picking a preferred statement', () => {
    const row = observation();
    const report = buildCaseReport(detail([row, structuredClone(row), observation(2)]));
    expect(report.summary.observationCount).toBe(2); expect(report.duplicateCopiesRemoved).toBe(1);
    expect(report.summary.peakSuggestedCount).toBe(2);
    expect(() => buildCaseReport(detail([row, { ...row, note: 'Conflicting public note' }]))).toThrow('could not be verified');
  });

  it('handles every blocking code, counts unavailable numeric screening, and excludes it from both suggestion totals', () => {
    const report = buildCaseReport(detail([...blockedCodes.map((code, index) => blocked(index + 1, code)), observation(100)]));
    expect(report.summary).toMatchObject({ observationCount: 8, flaggedObservationCount: 7, unusableNumbersCount: 7,
      numericEligibleCount: 1, peakSuggestedCount: 1, lowFrequencySuggestedCount: 1 });
    expect(report.qualityCounts.map(flag => flag.code).sort()).toEqual([...blockedCodes].sort());
    expect(report.qualityCounts.every(flag => flag.count === 1)).toBe(true);
    expect(report.observations.filter(row => !row.numericEligible).every(row => row.cMinusADb === null)).toBe(true);
  });

  it('counts multiple flags per observation without presenting their sum as a number of observations', () => {
    const first = blocked(1, 'clipped'); first.qualityCodes.push('processing-active');
    const report = buildCaseReport(detail([first, observation(2, { qualityCodes: ['processing-active', 'processing-unknown'] })]));
    expect(report.summary.flaggedObservationCount).toBe(2); expect(report.summary.numericEligibleCount).toBe(1);
    expect(report.qualityCounts.find(flag => flag.code === 'processing-active')?.count).toBe(2);
    expect(report.qualityCounts.reduce((sum, flag) => sum + flag.count, 0)).toBe(4);
  });

  it('preserves zero levels as available, evaluates the unrounded15dB convention and never averages levels', () => {
    const report = buildCaseReport(detail([
      observation(1, { aDigitalDb: 0, cDigitalDb: 0, cMinusADb: 0, peakScreen: 'not-indicated' }),
      observation(2, { aDigitalDb: -40, cDigitalDb: -25, cMinusADb: 15, peakScreen: 'not-indicated' }),
      observation(3, { aDigitalDb: -40, cDigitalDb: -25.001, cMinusADb: 14.999, peakScreen: 'not-evaluated' }),
    ]));
    expect(report.summary).toMatchObject({ numericEligibleCount: 3, unusableNumbersCount: 0, lowFrequencySuggestedCount: 1, peakSuggestedCount: 0 });
    expect(report.observations[0].cMinusADb).toBe(0);
    const text = caseReportText(report);
    expect(text).toContain('C−A: 0.00 dB'); expect(text).toContain('No uncalibrated dB values are averaged');
    expect(Object.keys(report.summary).some(key => /average|mean|resident|household/i.test(key))).toBe(false);
  });

  it('recomputes all totals from the new current detail after a linked observation is deleted', () => {
    const input = detail([observation(1), observation(2, { capturedAtUtc: '2026-10-19T00:00:00.000Z' })]);
    const old = buildCaseReport(input);
    const refreshed = buildCaseReport({ ...input, observations: [input.observations[0]] });
    expect(old.summary).toMatchObject({ observationCount: 2, distinctUtcDays: 2, peakSuggestedCount: 2 });
    expect(refreshed.summary).toMatchObject({ observationCount: 1, distinctUtcDays: 1, peakSuggestedCount: 1 });
    expect(refreshed.observations.some(row => row.id === observationId(2))).toBe(false);
  });

  it('represents an empty case honestly without treating it as evidence of quiet', () => {
    const report = buildCaseReport(detail());
    expect(report.summary).toEqual({ observationCount: 0, distinctUtcDays: 0, firstCaptureUtc: null, lastCaptureUtc: null,
      flaggedObservationCount: 0, numericEligibleCount: 0, unusableNumbersCount: 0, peakSuggestedCount: 0, lowFrequencySuggestedCount: 0 });
    expect(report.preparedAtUtc).toBeNull(); expect(caseReportTime(null)).toBe('No captures in this snapshot');
    const html = renderToStaticMarkup(createElement(CommunityCaseReport, { detail: detail(), preparedAtUtc: '2026-10-20T00:00:00.000Z' }));
    expect(html).toContain('An empty case is not evidence of quiet'); expect(html).not.toContain('<table');
  });
});

describe('bounded public export projection and integrity', () => {
  it('drops private session additions at every level and exports no raw arrays, audio or AI predictions', () => {
    const secret = 'PRIVATE_CANARY_DO_NOT_EXPORT';
    const row = { ...observation(), ai: { diagnosis: secret }, spectrum: { hz: new Array(10000).fill(60), powerDb: new Array(10000).fill(-25) },
      pcm: new Float32Array(10000), deleteToken: secret, privateNotes: secret, deviceSettings: { serial: secret },
      nearbyFacility: { osmType: 'way', osmId: '123', name: 'Optional mapped site', hidden: secret } };
    const input = { ...detail([row as unknown as CommunityObservation]), privateContext: secret,
      case: { ...detail().case, ownerToken: secret, ai: secret, privateNotes: secret } };
    const report = buildCaseReport(input);
    expect(JSON.stringify(report)).not.toContain(secret); expect(JSON.stringify(report)).not.toContain('powerDb');
    const text = caseReportText(report);
    expect(text).not.toContain(secret); expect(text).not.toContain('60,60,60'); expect(text.split('\n').length).toBeLessThan(75);
    expect(text).toContain('Optional mapped site'); expect(text).toContain('not an identified sound source');
  });

  it('retains all200 chronological rows for print but limits text details to20 with accurate totals and omission count', () => {
    const input = detail(Array.from({ length: 200 }, (_, index) => observation(index + 1, {
      capturedAtUtc: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(), note: 'A'.repeat(280), label: `Public record ${index + 1}`,
    })));
    const report = buildCaseReport(input, { caseUrl: `https://tonalwatch.vercel.app/#/cases/${caseId}/report`, preparedAtUtc: '2026-10-20T12:00:00.000Z' });
    const text = caseReportText(report);
    expect(report.summary.observationCount).toBe(200); expect(report.observations).toHaveLength(200);
    expect(text).toContain('200 observations across 1 distinct UTC calendar days');
    expect(text).toContain('20 shown, newest capture first; 180 older observation(s) omitted');
    expect(text).toContain('Public record 200'); expect(text).toContain('Public record 181'); expect(text).not.toContain('Public record 180');
    expect(text.match(/^- \d{4}-\d\d-\d\d/gm)).toHaveLength(20);
    expect(text.split('\n').length).toBeLessThan(160); expect(text.length).toBeLessThan(30000);
    expect(text).toContain(`Public case: https://tonalwatch.vercel.app/#/cases/${caseId}`);
    const html = renderToStaticMarkup(createElement(CommunityCaseReport, { detail: input, preparedAtUtc: '2026-10-20T00:00:00.000Z' }));
    expect(html.match(/<tr>/g)).toHaveLength(201); expect(html).toContain('All 200 observations, oldest capture first');
  });

  it('normalizes the public case URL without credentials, query parameters or a stale report hash', () => {
    const report = buildCaseReport(detail(), { caseUrl: 'https://tonalwatch.vercel.app/?private=must-not-export#/other', preparedAtUtc: '2026-10-20T00:00:00Z' });
    expect(report.caseUrl).toBe(`https://tonalwatch.vercel.app/#/cases/${caseId}`); expect(report.preparedAtUtc).toBe('2026-10-20T00:00:00.000Z');
    for (const caseUrl of ['javascript:alert(1)', 'https://name:secret@example.com/', 'not-a-url', `https://example.com/${'x'.repeat(3000)}`]) {
      expect(() => buildCaseReport(detail(), { caseUrl })).toThrow('could not be verified');
    }
  });

  it('keeps times explicitUTC and keeps report preparation separate from observation capture', () => {
    const report = buildCaseReport(detail([observation()]), { preparedAtUtc: '2026-10-20T13:14:15Z' });
    expect(caseReportTime(report.summary.firstCaptureUtc)).toBe('2026-10-18 12:00:00 UTC');
    expect(caseReportText(report)).toContain('Report snapshot prepared: 2026-10-20 13:14:15 UTC. Preparation is not a capture time');
    expect(report.summary.firstCaptureUtc).not.toBe(report.preparedAtUtc);
  });

  it('rejects malformed or incomplete public data rather than making a partial evidentiary report', () => {
    const good = detail([observation()]);
    const bad = [
      { ...good, limit: 20 }, { ...good, observations: undefined }, { ...good, observations: new Array(201).fill(observation()) },
      { ...good, case: { ...good.case, coordinates: { latitude: 39.044123, longitude: -77.487 } } },
      { ...good, observations: [observation(1, { aDigitalDb: null })] },
      { ...good, observations: [observation(1, { cMinusADb: NaN })] },
      { ...good, observations: [observation(1, { capturedAtUtc: '2026-02-30T12:00:00.000Z' })] },
      { ...good, observations: [observation(1, { sampleCount: 100 })] },
      { ...good, observations: [observation(1, { qualityCodes: ['future-code'] as unknown as QualityCode[] })] },
    ];
    for (const input of bad) expect(() => buildCaseReport(input as NeighborhoodCaseDetail)).toThrow('could not be verified');
  });
});

describe('community report HTML, fictional provenance and print/mobile structure', () => {
  it('renders escaped public statements and exposes metadata in a semantically headed table', () => {
    const input = detail([observation(1, { label: '<script>unsafe()</script>', note: '<img src=x onerror=unsafe()>' })]);
    const html = renderToStaticMarkup(createElement(CommunityCaseReport, { detail: input, preparedAtUtc: '2026-10-20T00:00:00.000Z' }));
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img src=x'); expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('scope="col"'); expect(html).toContain('<caption>All 1 observation,');
    expect(html).toContain('data-label="Captured / UTC"'); expect(html).toContain('data-label="Public label &amp; note"');
    expect(html).toMatch(/datetime="2026-10-18T12:00:00\.000Z"/i); expect(html).toContain(observationId(1));
    expect(html).toContain('720,000 samples'); expect(html).toContain('174 frames'); expect(html).toContain('tw-screen-v2');
    expect(html).toContain('Counts do not establish how widespread a sound is');
    expect(html).toContain('Print / save PDF'); expect(html).toContain('Download text summary');
  });

  it('marks fictional examples prominently in both text and printable HTML', () => {
    const input = detail([observation()]);
    const report = buildCaseReport(input, { isExample: true });
    expect(caseReportText(report).startsWith('FICTIONAL EXAMPLE — NOT FIELD DATA')).toBe(true);
    const html = renderToStaticMarkup(createElement(CommunityCaseReport, { detail: input, isExample: true, preparedAtUtc: '2026-10-20T00:00:00.000Z' }));
    expect(html).toContain('case-report-is-example'); expect(html).toContain('case-report-example');
    expect(html).toContain('All observations in this example are invented'); expect(html.match(/FICTIONAL EXAMPLE — NOT FIELD DATA/g)?.length).toBe(2);
    const css = readFileSync('src/community-report.css', 'utf8');
    expect(css).toContain('@page community-case-example'); expect(css).toContain("content:'FICTIONAL EXAMPLE — NOT FIELD DATA'");
    expect(css).toContain('page:community-case-example');
  });

  it('retains an accessible mobile table while restoring repeated print headers and avoiding clipped rows', () => {
    const css = readFileSync('src/community-report.css', 'utf8');
    const mobile = css.split('@media(max-width:760px)')[1].split('@page community-case-example')[0];
    const print = css.split('@media print')[1];
    expect(mobile).toContain('content:attr(data-label)'); expect(mobile).not.toContain('thead{display:none');
    expect(print).toContain('display:table-header-group'); expect(print).toContain('page-break-inside:avoid');
    expect(print).toContain('.case-report-toolbar,.case-report-back{display:none!important}');
    expect(print).toContain('overflow:visible'); expect(print).not.toMatch(/height:\s*\d+(?:px|pt|mm)/);
  });

  it('does not contact anyone, start a download or print while rendering, and offers both counties without inferring jurisdiction', () => {
    const fetch = vi.fn(), print = vi.fn(), createObjectURL = vi.fn();
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('window', { print });
    const original = URL.createObjectURL; URL.createObjectURL = createObjectURL;
    try {
      const html = renderToStaticMarkup(createElement(CommunityCaseReport, { detail: detail([observation()]), preparedAtUtc: '2026-10-20T00:00:00.000Z' }));
      expect(html).toContain('Loudoun County, Virginia'); expect(html).toContain('Prince William County, Virginia');
      expect(html).toContain('No county was inferred'); expect(html).toContain('does not submit this report or contact anyone');
      expect(fetch).not.toHaveBeenCalled(); expect(print).not.toHaveBeenCalled(); expect(createObjectURL).not.toHaveBeenCalled();
    } finally { URL.createObjectURL = original; vi.unstubAllGlobals(); }
  });

  it('renders an actionable generic error without exposing rejected private payloads or export controls', () => {
    const invalid = { ...detail(), observations: [observation(1, { aDigitalDb: NaN })], privateContext: 'PRIVATE_REJECTED_CANARY' };
    const html = renderToStaticMarkup(createElement(CommunityCaseReport, { detail: invalid }));
    expect(html).toContain('Community report unavailable'); expect(html).toContain('role="alert"'); expect(html).toContain('reload it before exporting');
    expect(html).not.toContain('PRIVATE_REJECTED_CANARY'); expect(html).not.toContain('Print / save PDF'); expect(html).not.toContain('Download text summary');
  });
});
