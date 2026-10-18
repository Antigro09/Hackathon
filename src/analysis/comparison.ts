import type { AnalysisResult, InputKind, QualityCode } from '../types';

export interface ComparisonDeviceSettings {
  sampleRate?: number;
  sampleSize?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  latency?: number;
}

export interface CaptureSnapshot {
  readonly id: string;
  readonly inputKind: InputKind;
  readonly inputLabel: string | null;
  readonly fixtureId: string | null;
  readonly algorithmVersion: string;
  readonly durationSeconds: number;
  readonly sampleRateHz: number;
  readonly channelPolicy: AnalysisResult['channelPolicy'];
  readonly analysisCreatedUtc: string;
  readonly recordedAtUtc: string | null;
  readonly cMinusADb: number;
  readonly lowFrequencyScreen: AnalysisResult['lowFrequencyScreen'];
  readonly peakScreen: AnalysisResult['peakScreen'];
  readonly qualityCodes: readonly QualityCode[];
  readonly deviceSettings: Readonly<ComparisonDeviceSettings> | null;
}

type UnavailableReason = 'missing-both' | 'missing-current' | 'missing-previous' | 'same-analysis'
  | 'invalid-current' | 'invalid-previous' | 'difference-not-finite';

export type CaptureGapComparison = {
  readonly status: 'ready';
  readonly deltaGapDb: number;
  readonly current: CaptureSnapshot;
  readonly previous: CaptureSnapshot;
  readonly includesSynthetic: boolean;
} | {
  readonly status: 'unavailable';
  readonly reason: UnavailableReason;
  readonly message: string;
};

const INVALID_GAP_CODES: ReadonlySet<QualityCode> = new Set([
  'near-zero', 'clipped', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power',
]);
const NUMBER_SETTING_KEYS = ['sampleRate', 'sampleSize', 'channelCount', 'latency'] as const;
const BOOLEAN_SETTING_KEYS = ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const;

/** Never copy deviceId, groupId, device labels, nested objects or arbitrary keys. */
export function comparisonDeviceSettings(settings: AnalysisResult['deviceSettings']): Readonly<ComparisonDeviceSettings> | null {
  if (!settings) return null;
  const filtered: ComparisonDeviceSettings = {};
  for (const key of NUMBER_SETTING_KEYS) {
    const value = settings[key];
    if (typeof value === 'number' && Number.isFinite(value)) filtered[key] = value;
  }
  for (const key of BOOLEAN_SETTING_KEYS) {
    const value = settings[key];
    if (typeof value === 'boolean') filtered[key] = value;
  }
  return Object.keys(filtered).length ? Object.freeze(filtered) : null;
}

function validGap(result: AnalysisResult): result is AnalysisResult & { cMinusADb: number } {
  return result.cMinusADb !== null && Number.isFinite(result.cMinusADb)
    && result.lowFrequencyScreen !== 'inconclusive'
    && !result.qualityCodes.some(code => INVALID_GAP_CODES.has(code));
}

function snapshot(result: AnalysisResult & { cMinusADb: number }): CaptureSnapshot {
  return Object.freeze({
    id: result.id,
    inputKind: result.inputKind,
    inputLabel: result.inputLabel ?? null,
    fixtureId: result.fixtureId,
    algorithmVersion: result.algorithmVersion,
    durationSeconds: result.durationSeconds,
    sampleRateHz: result.sampleRateHz,
    channelPolicy: result.channelPolicy,
    analysisCreatedUtc: result.analysisCreatedUtc,
    recordedAtUtc: result.recordedAtUtc,
    cMinusADb: result.cMinusADb,
    lowFrequencyScreen: result.lowFrequencyScreen,
    peakScreen: result.peakScreen,
    qualityCodes: Object.freeze([...result.qualityCodes]),
    deviceSettings: comparisonDeviceSettings(result.deviceSettings),
  });
}

/** Current minus previous, without correction, pooling, ranking or calibration. */
export function compareCaptures(current: AnalysisResult | null, previous: AnalysisResult | null): CaptureGapComparison {
  if (!current && !previous) return { status: 'unavailable', reason: 'missing-both', message: 'Complete two observations in this browser session to compare their captured-spectrum gaps.' };
  if (!current) return { status: 'unavailable', reason: 'missing-current', message: 'Complete the current observation to compare it with the previous analysis kept in this session.' };
  if (!previous) return { status: 'unavailable', reason: 'missing-previous', message: 'This is the first completed observation. Complete another analysis to compare with this one.' };
  if (current.id === previous.id) return { status: 'unavailable', reason: 'same-analysis', message: 'Current and previous refer to the same analysis. Complete a new observation before comparing.' };
  if (!validGap(current)) return { status: 'unavailable', reason: 'invalid-current', message: 'The current observation has an unavailable or inconclusive gap. A numeric comparison needs two usable gaps; unavailable values are not zero.' };
  if (!validGap(previous)) return { status: 'unavailable', reason: 'invalid-previous', message: 'The previous observation has an unavailable or inconclusive gap. A numeric comparison needs two usable gaps; unavailable values are not zero.' };
  const difference = current.cMinusADb - previous.cMinusADb;
  if (!Number.isFinite(difference)) return { status: 'unavailable', reason: 'difference-not-finite', message: 'The difference cannot be represented as a finite value. No numeric comparison is available.' };
  return Object.freeze({
    status: 'ready',
    deltaGapDb: Object.is(difference, -0) ? 0 : difference,
    current: snapshot(current),
    previous: snapshot(previous),
    includesSynthetic: current.inputKind === 'synthetic' || previous.inputKind === 'synthetic',
  });
}

export function formatGapDelta(difference: number): string {
  if (!Number.isFinite(difference)) return 'Unavailable';
  const fixed = difference.toFixed(1);
  const zero = Number(fixed) === 0;
  return `${difference > 0 && !zero ? '+' : ''}${zero ? '0.0' : fixed} dB`;
}

export function captureOriginLabel(inputKind: InputKind): string {
  if (inputKind === 'synthetic') return 'SYNTHETIC INPUT';
  return inputKind === 'imported-file' ? 'IMPORTED FILE · uncalibrated input' : 'MICROPHONE · uncalibrated input';
}
