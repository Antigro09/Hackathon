import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnalysisResult, ObservationContext } from '../src/types';
import { buildReport, formatReportTime } from '../src/report/buildReport';
import { ReportView } from '../src/report/ReportView';
import { interpretResult, referenceProfiles } from '../src/data/references';
import { ResultPanel } from '../src/components/ResultPanel';
import { analyzePcm, FFT_SIZE, HOP_SIZE } from '../src/analysis/engine';

const context: ObservationContext = {
  jurisdiction: 'loudoun', locationDescription: '', environment: 'unknown',
  recurrenceNotes: '', conditionsNotes: '', suspectedSourceNotes: '',
};
const result: AnalysisResult = {
  id: 'report-test', algorithmVersion: 'tw-screen-v1', inputKind: 'synthetic',
  fixtureId: 'sine-63', analysisCreatedUtc: '2026-10-18T15:00:00.000Z', recordedAtUtc: null,
  sampleRateHz: 48000, sampleCount: 240000, durationSeconds: 5,
  channelPolicy: 'mono-capture', fftSize: 8192, hopSize: 4096, analyzedBandHz: [20, 20000],
  frameCount: 57, aDigitalDb: -49.1, cDigitalDb: -23.77, cMinusADb: 25.33,
  lowFrequencyScreen: 'suggested', peakScreen: 'suggested',
  peakCandidate: { centerHz: 64.45, prominenceDb: 28.8, persistentFrameFraction: 1 },
  qualityCodes: [], deviceSettings: null, spectrum: { hz: [], powerDb: [] },
};

describe('observation report', () => {
  it.each([
    [15, 'microphone'], [30, 'microphone'], [15, 'imported-file'], [30, 'imported-file'],
  ] as const)('exports the full %i-second %s DSP window and spectrum rather than the optional five-second AI prefix', (durationSeconds, inputKind) => {
    const fs = 48000;
    const pcm = Float32Array.from({ length: fs * durationSeconds }, (_, index) => 0.1 * Math.sin(2 * Math.PI * 63 * index / fs));
    const measured = analyzePcm(pcm, fs, {
      inputKind, fixtureId: null, recordedAtUtc: inputKind === 'microphone' ? '2026-10-18T15:00:00.000Z' : null,
      channelPolicy: inputKind === 'imported-file' ? 'first-channel' : 'mono-capture',
      deviceSettings: { sampleRate: fs, aiObservationSeconds: 5, arbitraryAiLabel: 'EXCLUDE_AI_HINT' },
      inputLabel: inputKind === 'imported-file' ? 'long recording.wav' : 'Fresh microphone recording',
    });
    const report = buildReport(measured, context);
    const html = renderToStaticMarkup(createElement(ReportView, { report }));
    const frameCount = 1 + Math.floor((fs * durationSeconds - FFT_SIZE) / HOP_SIZE);
    expect(report.text).toContain(`Actual analyzed duration: ${durationSeconds}.000 seconds`);
    expect(report.text).toContain(`Sample count: ${durationSeconds * fs}`);
    expect(report.text).toContain(`Complete frame count: ${frameCount}`);
    expect(report.spectrum.frameCount).toBe(frameCount);
    expect(report.spectrum.hz).toEqual(measured.spectrum.hz);
    expect(report.spectrum.powerDb).toEqual(measured.spectrum.powerDb);
    expect(report.spectrum.origin).toContain(`${durationSeconds}.000 s analyzed`);
    for (const content of [report.text, html]) {
      expect(content).toContain(`${durationSeconds}.000 seconds`);
      expect(content).toContain(`${durationSeconds}.000 s analyzed`);
      expect(content).toContain('does not replicate either county');
      expect(content).not.toContain('Five seconds after');
      expect(content).not.toContain('First five seconds');
      expect(content).not.toContain('EXCLUDE_AI_HINT');
      expect(content).not.toContain('aiObservationSeconds');
      expect(content).not.toContain('meets county');
    }
    expect(report.text).toContain(inputKind === 'imported-file'
      ? `Input window: First ${durationSeconds}.000 seconds from file offset 0`
      : `Input window: ${durationSeconds}.000 seconds after discarding a 0.5-second microphone warm-up`);
  });

  it('keeps synthetic provenance and purpose in both renderings', () => {
    const report = buildReport(result, context, '2026-10-18T15:03:00Z');
    const html = renderToStaticMarkup(createElement(ReportView, { report }));
    for (const content of [report.text, html]) {
      expect(content).toContain('SYNTHETIC DEMONSTRATION — NOT A FIELD OBSERVATION');
      expect(content).toContain('SYNTHETIC DEMO — validates software behavior, not field accuracy');
      expect(content).toContain('not intended for complaint submission');
      expect(content).toContain('sine-63');
      expect(content).toContain('25.33');
    }
    expect(report.text).not.toContain('Please advise whether further review');
  });

  it('uses actual metadata and keeps analysis and preparation time separate', () => {
    const changed = { ...result, sampleRateHz: 44100, sampleCount: 220500, frameCount: 52, analyzedBandHz: [20, 18000] as [number, number] };
    const report = buildReport(changed, context, '2026-10-18T15:03:00Z');
    expect(report.text).toContain('Effective sample rate: 44100 Hz');
    expect(report.text).toContain('Sample count: 220500');
    expect(report.text).toContain('Complete frame count: 52');
    expect(report.text).toContain('20.0–18000.0 Hz');
    expect(report.text).toContain('2026-10-18T15:00:00.000Z');
    expect(report.text).toContain('2026-10-18T15:03:00.000Z');
    expect(report.text).toContain('GMT-04:00');
    expect(report.text).toContain('not authenticated');
  });

  it('never turns file selection or analysis time into imported recording time', () => {
    const imported = { ...result, inputKind: 'imported-file' as const, fixtureId: null,
      inputLabel: 'resident audio.wav', recordedAtUtc: result.analysisCreatedUtc,
      channelPolicy: 'first-channel' as const, qualityCodes: ['imported-processing-unknown' as const] };
    const report = buildReport(imported, context);
    expect(report.text).toContain('IMPORTED FILE — recording context unknown');
    expect(report.text).toContain('Recorded at: not established');
    expect(report.text).toContain('Input label: resident audio.wav');
    expect(report.text).toContain('first channel only');
    expect(report.text).toContain('Please advise whether further review');
    expect(report.text).not.toContain('SYNTHETIC DEMONSTRATION');
  });

  it('preserves null values, quality flags and descriptive observations', () => {
    const report = buildReport({ ...result, aDigitalDb: null, cDigitalDb: null, cMinusADb: null,
      lowFrequencyScreen: 'inconclusive', peakScreen: 'inconclusive', peakCandidate: null,
      qualityCodes: ['near-zero', 'no-band-power'] }, { ...context, recurrenceNotes: 'Hum after midnight' });
    expect(report.text).toContain('A relative: unavailable');
    expect(report.text).toContain('C relative: unavailable');
    expect(report.text).toContain('C−A difference: unavailable');
    expect(report.text).toContain('near-zero');
    expect(report.text).toContain('no-band-power');
    expect(report.text).toContain('Recording is inconclusive');
    expect(report.text).toContain('Hum after midnight');
    expect(report.text).toContain('Location description (manual): not provided');
  });

  it('escapes untrusted notes and labels in HTML and excludes persistent identifiers', () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const report = buildReport({ ...result, inputLabel: hostile, deviceSettings: {
      sampleRate: 48000, echoCancellation: false, noiseSuppression: true,
      deviceId: 'SECRET-DEVICE', groupId: 'SECRET-GROUP', arbitrary: 'SECRET-OTHER',
    } }, { ...context, suspectedSourceNotes: hostile });
    const html = renderToStaticMarkup(createElement(ReportView, { report }));
    expect(report.text).toContain(hostile);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
    for (const content of [report.text, html]) {
      expect(content).not.toContain('SECRET-');
      expect(content).toContain('echoCancellation');
      expect(content).toContain('Suspected source — unverified user statement');
    }
  });

  it('keeps profiles distinct and reports access limitations without invented verification', () => {
    const loudoun = buildReport(result, context);
    const pwc = buildReport(result, { ...context, jurisdiction: 'prince-william' });
    const unknown = buildReport(result, { ...context, jurisdiction: 'unknown-other' });
    expect(loudoun.references.every(source => source.jurisdiction === 'loudoun')).toBe(true);
    expect(pwc.references.every(source => source.jurisdiction === 'prince-william')).toBe(true);
    expect(unknown.references).toHaveLength(0);
    expect(unknown.text).toContain('Jurisdiction and legal applicability were not evaluated');
    expect(loudoun.text).toContain('Content independently checked 2026-10-18');
    expect(loudoun.text).toContain('Access limited; last reviewed 2026-10-18');
    expect(loudoun.text).toContain('content not independently verified in this build');
    expect(Object.isFrozen(referenceProfiles.loudoun.sources[0])).toBe(true);
  });

  it('is deterministic and snapshots the report against later context edits', () => {
    const mutableContext = { ...context, recurrenceNotes: 'Initial note' };
    const report = buildReport(result, mutableContext);
    expect(buildReport(result, mutableContext)).toEqual(report);
    mutableContext.recurrenceNotes = 'Later note';
    expect(report.text).toContain('Initial note');
    expect(report.text).not.toContain('Later note');
    expect(Object.isFrozen(report)).toBe(true);
  });
});

describe('interpretation and time labels', () => {
  it('defaults the waiting result panel to five seconds and follows the selected duration before capture', () => {
    expect(renderToStaticMarkup(createElement(ResultPanel, { result: null, analyzing: false }))).toContain('5-second screening sample');
    for (const targetDurationSeconds of [15, 30]) {
      expect(renderToStaticMarkup(createElement(ResultPanel, { result: null, analyzing: false, targetDurationSeconds }))).toContain(`${targetDurationSeconds}-second screening sample`);
    }
    const html = renderToStaticMarkup(createElement(ResultPanel, { result, analyzing: false, targetDurationSeconds: 30 }));
    expect(html).toContain('5.00 s');
    expect(html).not.toContain('30-second screening sample');
  });

  it('does not present a disabled peak feature as a negative finding', () => {
    const copy = interpretResult({ ...result, lowFrequencyScreen: 'not-indicated', peakScreen: 'not-evaluated', peakCandidate: null });
    expect(copy).toContain('not evaluated');
    expect(copy).not.toContain('Neither indicator');
    expect(interpretResult({ ...result, lowFrequencyScreen: 'not-indicated' })).toContain('sustained narrowband peak is present');
  });

  it('formats Eastern time with the actual seasonal offset and rejects invalid time', () => {
    expect(formatReportTime('2026-01-18T15:00:00Z')).toContain('GMT-05:00');
    expect(formatReportTime('2026-07-18T15:00:00Z')).toContain('GMT-04:00');
    expect(formatReportTime(null)).toBe('not established');
    expect(formatReportTime('invalid')).toContain('not established');
  });
});
