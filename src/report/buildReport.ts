import type { AnalysisResult, ObservationContext } from '../types';
import { interpretResult, methodLimitations, qualityDescriptions, referenceProfiles } from '../data/references';
import type { ReferenceProfile, ReferenceSource } from '../data/references';
import { buildReportSpectrum, reportSpectrumText } from './spectrum';
import type { ReportSpectrumModel } from './spectrum';

export interface ReportRow { readonly label: string; readonly value: string }
export interface ReportSection {
  readonly title: string;
  readonly rows: readonly ReportRow[];
  readonly paragraphs: readonly string[];
}
export interface ReportModel {
  readonly title: string;
  readonly isSynthetic: boolean;
  readonly provenanceLabel: string;
  readonly preparedAtUtc: string;
  readonly analysisId: string;
  readonly sections: readonly ReportSection[];
  readonly referenceProfile: ReferenceProfile;
  readonly references: readonly ReferenceSource[];
  readonly spectrum: ReportSpectrumModel;
  readonly text: string;
}

const absent = 'not provided';
const unavailable = 'unavailable';
const uncalibrated = 'Uncalibrated input — weighted digital levels, dB relative to RMS 1. Not sound-pressure levels.';
const safeSettings = ['sampleRate', 'channelCount', 'sampleSize', 'latency', 'echoCancellation', 'noiseSuppression', 'autoGainControl'] as const;

function note(value: string): string { return value.trim() || absent; }
function numeric(value: number | null, digits = 2): string {
  return value !== null && Number.isFinite(value) ? value.toFixed(digits) : unavailable;
}
function row(label: string, value: string): ReportRow { return Object.freeze({ label, value }); }
function section(title: string, rows: ReportRow[] = [], paragraphs: readonly string[] = []): ReportSection {
  return Object.freeze({ title, rows: Object.freeze(rows), paragraphs: Object.freeze([...paragraphs]) });
}

/** Uses an explicit zone so the report is independent of the computer's local timezone. */
export function formatReportTime(value: string | null): string {
  if (!value) return 'not established';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'not established (invalid timestamp)';
  const eastern = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short',
  }).format(parsed);
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', timeZoneName: 'longOffset',
  }).formatToParts(parsed).find(part => part.type === 'timeZoneName')?.value ?? 'America/New_York';
  return `${parsed.toISOString()} · ${eastern} (${offset}; America/New_York)`;
}

export function sourceStatus(source: ReferenceSource): string {
  return source.verifiedAt
    ? `Content independently checked ${source.verifiedAt}`
    : `Access limited; last reviewed ${source.lastReviewedAt}; content not independently verified in this build`;
}

/** No clock, DOM, storage or network access: the same arguments always yield the same report. */
export function buildReport(
  result: AnalysisResult,
  context: ObservationContext,
  preparedAtUtc: string = result.analysisCreatedUtc,
): ReportModel {
  const isSynthetic = result.inputKind === 'synthetic';
  const title = isSynthetic
    ? 'SYNTHETIC DEMONSTRATION — NOT A FIELD OBSERVATION'
    : 'TonalWatch noise observation — screening only';
  const provenanceLabel = isSynthetic
    ? 'SYNTHETIC DEMO — validates software behavior, not field accuracy'
    : result.inputKind === 'imported-file'
      ? 'IMPORTED FILE — recording context unknown'
      : 'MICROPHONE INPUT — uncalibrated browser capture';
  const referenceProfile = referenceProfiles[context.jurisdiction];
  const spectrumOrigin = `${provenanceLabel}${result.fixtureId ? ` · Fixture ${result.fixtureId}` : result.inputLabel ? ` · ${result.inputLabel}` : ''}`;
  const spectrum = buildReportSpectrum(result, spectrumOrigin);
  const settings = safeSettings.flatMap(key => {
    const value = result.deviceSettings?.[key];
    return typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
      ? [row(key, String(value))] : [];
  });
  const quality = result.qualityCodes.length
    ? result.qualityCodes.map(code => `${code}: ${qualityDescriptions[code]}`)
    : ['No software quality flag was raised. This does not establish acoustic accuracy.'];
  const peak = result.peakCandidate;
  const peakDetails = peak
    ? `${numeric(peak.centerHz, 1)} Hz; median prominence ${numeric(peak.prominenceDb, 1)} dB; present in ${numeric(peak.persistentFrameFraction * 100, 1)}% of complete overlapping frames (descriptive persistence, not confidence)`
    : result.peakScreen === 'not-evaluated' ? 'not evaluated' : 'no reliable candidate';
  const nextStep = isSynthetic
    ? ['This report demonstrates the software workflow using generated audio. It is not intended for complaint submission.']
    : [
      'I am documenting a recurring sound as described in the observation notes. This short, uncalibrated screening analysis contains relative digital values, not certified sound-pressure measurements.',
      'The result does not establish a source, an ordinance violation, or the applicability of a particular property requirement. A weak or inconclusive indicator does not rule out intermittent or device-missed sound.',
      'Please advise whether further review is appropriate and which measurement procedure or qualified professional, if any, is needed. County references are supplied for context and should be confirmed by the responsible agency.',
    ];
  const sections = Object.freeze([
    section('Origin and times', [
      row('Origin', provenanceLabel),
      row('Input label', note(result.inputLabel ?? '')),
      row('Fixture ID', result.fixtureId ?? 'not applicable'),
      row('Analysis ID', result.id),
      row('Recorded at', isSynthetic ? 'not applicable — generated audio' : result.inputKind === 'imported-file' ? 'not established — importing a file does not establish its recording time' : formatReportTime(result.recordedAtUtc)),
      row('Analysis created', formatReportTime(result.analysisCreatedUtc)),
      row('Report prepared for export', formatReportTime(preparedAtUtc)),
    ], [
      'Timestamps come from the device clock and are not authenticated. Report preparation and file selection are not the time a sound originally occurred.',
    ]),
    section('Observation context — user reported', [
      row('Location description (manual)', note(context.locationDescription)),
      row('Environment', context.environment),
      row('Recurrence notes', note(context.recurrenceNotes)),
      row('Conditions / possible contamination', note(context.conditionsNotes)),
      row('Suspected source — unverified user statement', note(context.suspectedSourceNotes)),
    ]),
    section('Method', [
      row('Calibration', uncalibrated),
      row('Algorithm version', result.algorithmVersion),
      row('Actual analyzed duration', `${numeric(result.durationSeconds, 3)} seconds`),
      row('Effective sample rate', `${numeric(result.sampleRateHz, 0)} Hz`),
      row('Sample count', numeric(result.sampleCount, 0)),
      row('Channel policy', result.channelPolicy === 'first-channel' ? 'first channel only (decoded sample rate may differ from original encoding)' : isSynthetic ? 'generated mono PCM' : 'mono capture'),
      row('Input window', result.inputKind === 'imported-file' ? 'First five seconds from file offset 0; decoded locally; browser may resample. Original encoding rate, recording time and processing are not established.' : isSynthetic ? 'Five seconds of generated PCM; no acoustic recording' : 'Five seconds after discarding a 0.5-second microphone warm-up'),
      row('FFT / window / hop', `${result.fftSize} samples / periodic Hann / ${result.hopSize} samples`),
      row('Analyzed band', `${numeric(result.analyzedBandHz[0], 1)}–${numeric(result.analyzedBandHz[1], 1)} Hz`),
      row('Complete frame count', numeric(result.frameCount, 0)),
      row('Frequency bin spacing', `${numeric(result.sampleRateHz / result.fftSize, 3)} Hz`),
      row('Estimator', 'One-sided PSD averaged in linear power; normalized A/C responses at 1 kHz; weighted power integrated over the analyzed band'),
      row('Spectrum units', '10 log10(digital amplitude² / Hz), relative to digital reference 1²/Hz'),
    ]),
    section('Captured-signal results', [
      row('A relative', `${numeric(result.aDigitalDb)} dB relative to RMS 1`),
      row('C relative', `${numeric(result.cDigitalDb)} dB relative to RMS 1`),
      row('Captured-spectrum C−A difference', `${numeric(result.cMinusADb)} dB`),
      row('Low-frequency screen', result.lowFrequencyScreen),
      row('Sustained-peak screen', result.peakScreen),
      row('Peak candidate', peakDetails),
    ], [
      interpretResult(result),
      'The 15.0 dB C−A threshold is a prototype screening convention, not a legal trigger or a universal diagnostic threshold.',
      result.peakScreen === 'not-evaluated'
        ? 'Sustained-peak analysis was not evaluated. An unavailable feature is not a negative finding.'
        : 'The experimental peak heuristic searches 40–2000 Hz: prominence ≥12 dB, local concentration ≥60%, at least 20 complete frames and persistence ≥80% of all complete frames. It is not standardized tonality or a legal steady-tonal determination.',
      methodLimitations[0],
    ]),
    section('Recording quality', [], quality),
    section('Reported browser track settings', settings, [
      settings.length ? 'Only useful non-identifying settings are included. Requested processing preferences do not prove flat or raw acoustic response.' : 'No useful browser track settings were available. Processing and input response remain unestablished.',
    ]),
    section('Limitations', [], methodLimitations),
    section('Jurisdiction context', [row('Selected profile', referenceProfile.title)], [referenceProfile.summary, referenceProfile.scopeNote]),
    section(isSynthetic ? 'Demonstration purpose' : 'Requested next step', [], nextStep),
    section('Review before sharing', [], [
      'This report can contain personal location and notes. Review it before sharing. Raw audio is not attached. TonalWatch does not automatically send this report to an agency.',
    ]),
  ]);
  const references = referenceProfile.sources;
  const text = [title, 'TonalWatch noise observation — screening only', provenanceLabel, '',
    ...sections.flatMap(part => [part.title, ...part.rows.map(item => `${item.label}: ${item.value}`), ...part.paragraphs, '',
      ...(part.title === 'Captured-signal results' ? reportSpectrumText(spectrum) : []),
    ]),
    'Dated official reference links',
    ...(references.length ? references.flatMap(source => [
      source.title, source.summary, source.url, sourceStatus(source), source.scopeNote, '',
    ]) : ['No county applicability evaluated; no county profile applied.']),
  ].join('\n');
  return Object.freeze({ title, isSynthetic, provenanceLabel, preparedAtUtc, analysisId: result.id, sections, referenceProfile, references, spectrum, text });
}
