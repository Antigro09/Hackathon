import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analyzePcm } from '../src/analysis/engine';
import { generateFixture } from '../src/analysis/fixtures';
import { buildReport } from '../src/report/buildReport';
import { ReportView } from '../src/report/ReportView';
import type { InputMeta, ObservationContext } from '../src/types';

const context: ObservationContext = {
  jurisdiction: 'unknown-other', environment: 'unknown', locationDescription: '',
  recurrenceNotes: '', conditionsNotes: '', suspectedSourceNotes: '',
};
const privateSettings = { deviceId: 'PRIVATE-DEVICE', groupId: 'PRIVATE-GROUP',
  filename: 'PRIVATE-FILENAME', fileName: 'PRIVATE-OTHER-NAME', path: 'PRIVATE-PATH',
  arbitraryAiLabel: 'PRIVATE-AI', browserProfile: 'PRIVATE-PROFILE' };

function analyze(settings: Record<string, unknown>, fs = 44100, inputKind: InputMeta['inputKind'] = 'imported-file') {
  return analyzePcm(generateFixture('sine-63', fs), fs, {
    inputKind, fixtureId: null, recordedAtUtc: null, channelPolicy: 'first-channel',
    deviceSettings: settings,
  });
}

describe('safe decoder provenance through analysis and report', () => {
  it.each([false, true])('retains explicit source-rate and crop provenance, including fallback=%s', fallback => {
    const fs = fallback ? 48000 : 44100;
    const safe = {
      decodeMethod: 'local browser decodeAudioData; sample conversion may differ by browser',
      effectiveSampleRateHz: fs, wavSampleRateHintHz: 44100, requestedDecodeSampleRateHz: 44100,
      decodeContextSampleRateHz: fs, sampleRateHintMatched: !fallback,
      decodeRateRequestFallback: fallback,
      decodeRatePolicy: fallback ? 'Requested WAV rate unavailable; default browser context used' : 'WAV rate hint matched; browser sample conversion retained',
      decodedChannels: 2, cropOffsetSeconds: 0, cropDurationSeconds: 5, decodedDurationSeconds: 31,
    };
    const measured = analyze({ ...safe, ...privateSettings }, fs);
    expect(measured.deviceSettings).toEqual(safe);
    const report = buildReport(measured, context);
    const html = renderToStaticMarkup(createElement(ReportView, { report }));
    expect(report.text).toContain('Local file decoding provenance');
    expect(report.text).not.toContain('Reported browser track settings');
    expect(report.text).toContain('A sample-rate hint is container metadata');
    for (const [key, value] of Object.entries(safe)) {
      expect(report.text).toContain(`${key}: ${String(value)}`);
      expect(html).toContain(key);
      expect(html).toContain(String(value));
    }
    expect(JSON.stringify(measured)).not.toContain('PRIVATE-');
    expect(report.text).not.toContain('PRIVATE-');
    expect(html).not.toContain('PRIVATE-');
  });

  it('retains explicit unknown rate-hint states without implying a match', () => {
    const safe = { decodeMethod: 'local browser decodeAudioData', effectiveSampleRateHz: 48000,
      wavSampleRateHintHz: null, requestedDecodeSampleRateHz: null, sampleRateHintMatched: null,
      decodeRateRequestFallback: false, decodeRatePolicy: 'Default browser rate; encoded rate not established' };
    const measured = analyze(safe, 48000);
    expect(measured.deviceSettings).toEqual(safe);
    const text = buildReport(measured, context).text;
    expect(text).toContain('wavSampleRateHintHz: not established');
    expect(text).toContain('requestedDecodeSampleRateHz: not requested');
    expect(text).toContain('sampleRateHintMatched: not applicable; no supported WAV rate hint');
  });

  it('drops malformed nested and non-finite values while report filtering independently excludes private keys', () => {
    const measured = analyze({ decodeMethod: 'local browser decodeAudioData',
      decodedChannels: { deviceId: 'PRIVATE-NESTED' }, cropDurationSeconds: Infinity,
      effectiveSampleRateHz: NaN, cropOffsetSeconds: undefined, ...privateSettings });
    expect(measured.deviceSettings).toEqual({ decodeMethod: 'local browser decodeAudioData' });
    const report = buildReport({ ...measured, deviceSettings: {
      ...measured.deviceSettings, ...privateSettings, decodedChannels: ['PRIVATE-ARRAY'],
      effectiveSampleRateHz: NaN, cropDurationSeconds: Infinity,
    } }, context);
    const html = renderToStaticMarkup(createElement(ReportView, { report }));
    for (const content of [report.text, html]) {
      expect(content).not.toContain('PRIVATE-');
      expect(content).not.toContain('Infinity');
      expect(content).not.toContain('NaN');
    }
  });

  it('keeps decoder-only keys out of microphone results and preserves useful track settings', () => {
    const measured = analyze({ sampleRate: 48000, echoCancellation: false,
      decodeMethod: 'PRIVATE-NOT-A-DECODER', wavSampleRateHintHz: 44100, ...privateSettings }, 48000, 'microphone');
    expect(measured.deviceSettings).toEqual({ sampleRate: 48000, echoCancellation: false });
    const text = buildReport(measured, context).text;
    expect(text).toContain('Reported browser track settings');
    expect(text).not.toContain('Local file decoding provenance');
    expect(text).not.toContain('PRIVATE-');
  });
});
