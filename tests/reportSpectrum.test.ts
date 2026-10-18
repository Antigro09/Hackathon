import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzePcm } from '../src/analysis/engine';
import { generateFixture, syntheticMeta } from '../src/analysis/fixtures';
import type { AnalysisResult, ObservationContext } from '../src/types';
import { buildReport } from '../src/report/buildReport';
import { ReportView } from '../src/report/ReportView';
import { ReportSpectrum } from '../src/report/ReportSpectrum';
import { buildReportSpectrum, plotReportSpectrum, reportFrequencyX, REPORT_PLOT, REPORT_SPECTRUM_UNITS } from '../src/report/spectrum';

const context: ObservationContext = { jurisdiction: 'unknown-other', locationDescription: '', environment: 'unknown', recurrenceNotes: '', conditionsNotes: '', suspectedSourceNotes: '' };
const base: AnalysisResult = {
  id: 'spectrum-test', algorithmVersion: 'tw-screen-v1', inputKind: 'synthetic', fixtureId: 'sine-63',
  analysisCreatedUtc: '2026-10-18T15:00:00.000Z', recordedAtUtc: null,
  sampleRateHz: 48000, sampleCount: 240000, durationSeconds: 5, channelPolicy: 'mono-capture', fftSize: 8192, hopSize: 4096,
  analyzedBandHz: [20, 20000], frameCount: 57, aDigitalDb: -49, cDigitalDb: -24, cMinusADb: 25,
  lowFrequencyScreen: 'suggested', peakScreen: 'suggested',
  peakCandidate: { centerHz: 64.45, prominenceDb: 28.8, persistentFrameFraction: 1 },
  qualityCodes: [], deviceSettings: null, spectrum: { hz: [20, 64.45, 1000, 20000], powerDb: [-100, -20, -80, -120] },
};

describe('report spectrum snapshot and rendering', () => {
  it('preserves a real engine spectrum and its metadata in HTML and the text fallback', () => {
    const input = analyzePcm(generateFixture('sine-63', 48000), 48000, syntheticMeta('sine-63'));
    const report = buildReport(input, context);
    const html = renderToStaticMarkup(createElement(ReportView, { report }));
    expect(report.spectrum.hz).toEqual(input.spectrum.hz);
    expect(report.spectrum.powerDb).toEqual(input.spectrum.powerDb);
    expect(report.spectrum.hz).not.toBe(input.spectrum.hz);
    expect(report.spectrum.binSpacingHz).toBe(48000 / 8192);
    expect(report.spectrum.bandHz).toEqual([20, 20000]);
    for (const content of [html, report.text]) {
      expect(content).toContain('Captured frequency spectrum');
      expect(content).toContain(REPORT_SPECTRUM_UNITS);
      expect(content).toContain('5.859 Hz');
      expect(content).toContain('57 complete frames');
      expect(content).toContain('SYNTHETIC DEMO');
      expect(content).toContain('sine-63');
      expect(content).toContain('64.5 Hz');
    }
    expect(html).toContain('log scale');
    expect(html).toContain('stroke="#111"');
    expect(html).not.toContain('linearGradient');
    expect(report.text).toContain(`${input.spectrum.hz[20]}, ${input.spectrum.powerDb[20]}`);
  });

  it('freezes all spectrum arrays and peak values against later result mutations', () => {
    const input = { ...base, spectrum: { hz: [...base.spectrum.hz], powerDb: [...base.spectrum.powerDb] },
      peakCandidate: { ...base.peakCandidate! }, analyzedBandHz: [20, 20000] as [number, number] };
    const report = buildReport(input, context);
    input.spectrum.hz[1] = 900;
    input.spectrum.powerDb[1] = 10;
    input.analyzedBandHz[1] = 10000;
    input.peakCandidate.centerHz = 900;
    expect(report.spectrum.hz[1]).toBe(64.45);
    expect(report.spectrum.powerDb[1]).toBe(-20);
    expect(report.spectrum.bandHz[1]).toBe(20000);
    expect(report.spectrum.peakHz).toBe(64.45);
    expect(Object.isFrozen(report.spectrum)).toBe(true);
    expect(Object.isFrozen(report.spectrum.hz)).toBe(true);
    expect(Object.isFrozen(report.spectrum.powerDb)).toBe(true);
    expect(Object.isFrozen(report.spectrum.bandHz)).toBe(true);
  });

  it('escapes imported filenames in spectrum origin and accessible descriptions', () => {
    const label = '<svg onload="alert(1)">.wav';
    const report = buildReport({ ...base, inputKind: 'imported-file', fixtureId: null, inputLabel: label }, context);
    const html = renderToStaticMarkup(createElement(ReportSpectrum, { spectrum: report.spectrum }));
    expect(html).toContain('IMPORTED FILE — recording context unknown');
    expect(html).toContain('&lt;svg onload=');
    expect(html).not.toContain('<svg onload=');
    expect(report.text).toContain(label);
  });

  it.each(['silence', 'clipped'] as const)('explains the %s quality state without inventing a peak', fixture => {
    const input = analyzePcm(generateFixture(fixture, 48000), 48000, syntheticMeta(fixture));
    const report = buildReport(input, context);
    const html = renderToStaticMarkup(createElement(ReportSpectrum, { spectrum: report.spectrum }));
    expect(report.spectrum.peakHz).toBeNull();
    expect(html).not.toContain('Peak candidate ≈');
    if (fixture === 'clipped') {
      expect(report.spectrum.status).toBe('limited');
      expect(html).toContain('overload distortion');
      expect(html).toContain('<path');
    } else {
      expect(report.spectrum.status).toBe('unavailable');
      expect(html).toContain('near zero');
      expect(html).not.toContain('<path');
    }
  });

  it.each([
    { spectrum: { hz: [], powerDb: [] } },
    { spectrum: { hz: [20, 1000], powerDb: [-40] } },
    { spectrum: { hz: [20, 1000], powerDb: [-40, NaN] } },
    { spectrum: { hz: [20, Infinity], powerDb: [-40, -50] } },
    { spectrum: { hz: [1000, 20], powerDb: [-40, -50] } },
    { analyzedBandHz: [0, 20000] as [number, number] },
    { analyzedBandHz: [20, 20] as [number, number] },
    { qualityCodes: ['non-finite'] as AnalysisResult['qualityCodes'] },
  ])('shows an explanatory state for unavailable or invalid data %#', change => {
    const spectrum = buildReportSpectrum({ ...base, ...change }, 'MICROPHONE INPUT — uncalibrated browser capture');
    expect(spectrum.status).toBe('unavailable');
    expect(plotReportSpectrum(spectrum)).toBeNull();
    const html = renderToStaticMarkup(createElement(ReportSpectrum, { spectrum }));
    expect(html).toContain('No usable spectrum');
    expect(html).not.toContain('<path');
    expect(html).not.toContain('Peak candidate ≈');
  });
});

describe('print spectrum geometry', () => {
  it('positions frequency logarithmically across the actual analyzed band', () => {
    const band = [20, 20000] as const;
    expect(reportFrequencyX(20, band)).toBe(REPORT_PLOT.left);
    expect(reportFrequencyX(20000, band)).toBe(REPORT_PLOT.left + REPORT_PLOT.width);
    expect(reportFrequencyX(Math.sqrt(20 * 20000), band)).toBeCloseTo(REPORT_PLOT.left + REPORT_PLOT.width / 2, 10);
    expect(reportFrequencyX(100, band) - reportFrequencyX(50, band)).toBeCloseTo(reportFrequencyX(2000, band) - reportFrequencyX(1000, band), 10);
    const spectrum = buildReportSpectrum({ ...base, analyzedBandHz: [40, 18000] }, 'input');
    const plot = plotReportSpectrum(spectrum)!;
    expect(plot.xTicks[0].hz).toBe(40);
    expect(plot.xTicks.at(-1)?.hz).toBe(18000);
    expect(plot.peak?.x).toBeCloseTo(reportFrequencyX(64.45, [40, 18000]), 10);
    expect(plot.points.some(point => point.hz === 20 || point.hz === 20000)).toBe(false);
  });

  it('keeps the highest actual bin in a compressed pixel without changing its frequency', () => {
    const spectrum = buildReportSpectrum({ ...base, peakCandidate: null,
      spectrum: { hz: [20, 10000, 10000.1, 20000], powerDb: [-100, -50, -10, -90] } }, 'input');
    const plot = plotReportSpectrum(spectrum)!;
    expect(plot.points.map(point => point.hz)).toEqual([20, 10000.1, 20000]);
    const peak = plot.points[1];
    expect(peak.x).toBeCloseTo(reportFrequencyX(10000.1, [20, 20000]), 10);
    expect(peak.db).toBe(-10);
    expect(plot.peak).toBeNull();
  });

  it('uses finite coordinates and displays positive digital PSD without clamping to zero', () => {
    const spectrum = buildReportSpectrum({ ...base, spectrum: { hz: [20, 1000, 20000], powerDb: [-300, 13, -100] } }, 'input');
    const plot = plotReportSpectrum(spectrum)!;
    expect(plot.highDb).toBe(20);
    expect(plot.lowDb).toBe(-80);
    expect(plot.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(plot.points[0].y).toBe(REPORT_PLOT.top + REPORT_PLOT.height);
    expect(plot.line).not.toMatch(/NaN|Infinity/);
  });
});
