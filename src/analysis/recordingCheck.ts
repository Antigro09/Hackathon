import type { AnalysisResult, QualityCode } from '../types';

export type RecordingCheckStatus = 'retake' | 'caution' | 'ready';
export type ReportedProcessingState = 'on' | 'off' | 'unknown';
export interface RecordingCheckIssue {
  code: QualityCode | 'recorded-window' | 'analysis-unavailable' | 'input-provenance';
  severity: 'retake' | 'caution';
  message: string;
}
export interface RecordingCheckAssessment {
  status: RecordingCheckStatus;
  label: string;
  summary: string;
  window: {
    durationSeconds: number;
    sampleRateHz: number;
    sampleCount: number;
    analyzedFrameCount: number;
    expectedFrameCount: number | null;
    metadataConsistent: boolean;
    analysisSkipped: boolean;
  };
  processing: {
    state: 'active' | 'unknown' | 'reported-off';
    settings: { key: string; label: string; state: ReportedProcessingState }[];
  };
  issues: RecordingCheckIssue[];
  microphoneFidelity: 'not-validated';
  sourceIdentity: 'not-assessed';
}

const PROCESSING_SETTINGS = [
  ['echoCancellation', 'Echo cancellation'],
  ['noiseSuppression', 'Noise suppression'],
  ['autoGainControl', 'Automatic gain control'],
] as const;
const RETAKE_CODES = new Set<QualityCode>([
  'near-zero', 'clipped', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power',
]);
// These checks can stop the engine before any FFT frame is analyzed. A recorded
// window with zero analyzed frames must not be described as a successful FFT run.
const EARLY_EXIT_CODES = new Set<QualityCode>(['near-zero', 'unsupported-rate', 'non-finite']);
const FLAG_ADVICE: Record<QualityCode, string> = {
  'near-zero': 'Almost no digital signal was captured. Check the selected microphone and live input meter, then retake while the intended sound is audible. This does not establish that the surroundings were quiet.',
  clipped: 'Clipping distorted this recording. Reduce microphone input gain where available, or change placement to reduce the level, then retake.',
  'near-full-scale': 'The signal approached the digital limit; distortion is possible. Reduce the input level or change placement and retake, especially before using optional sound hints.',
  incomplete: 'The recording is incomplete. Keep this tab visible, check the microphone connection, and retry the capture.',
  'unsupported-rate': 'This sample rate is outside the tested 44.1 and 48 kHz rates. Try a microphone or browser that provides a supported rate.',
  'processing-active': 'The browser reports audio processing that may reshape hum or background sound. Where available, turn off voice enhancements and compare another capture; this does not verify the microphone response.',
  'processing-unknown': 'The browser did not fully report its audio processing. Treat the sound balance cautiously; try microphone settings that expose voice-enhancement controls.',
  'imported-processing-unknown': 'The original recording processing and context are unknown. Make a new live microphone capture with its settings reported before drawing capture-quality conclusions.',
  'non-finite': 'Invalid digital samples prevented analysis. Reconnect the microphone if needed and retake.',
  'no-band-power': 'No usable analyzed-band energy remained after DC removal. Check the microphone and placement, then retake; this is not evidence of a quiet location.',
};

/** Digital usability only: no model, microphone calibration, or source inference. */
export function assessRecordingCheck(result: AnalysisResult): RecordingCheckAssessment {
  const codes = [...new Set(result.qualityCodes)];
  const issues: RecordingCheckIssue[] = codes.map(code => ({
    code, severity: RETAKE_CODES.has(code) ? 'retake' : 'caution', message: FLAG_ADVICE[code],
  }));
  const supportedRate = result.sampleRateHz === 44100 || result.sampleRateHz === 48000;
  const validSamples = Number.isSafeInteger(result.sampleCount) && result.sampleCount >= 0;
  const validFrames = Number.isSafeInteger(result.frameCount) && result.frameCount >= 0;
  const validDuration = Number.isFinite(result.durationSeconds) &&
    [5, 15, 30].includes(result.durationSeconds) &&
    result.durationSeconds === result.sampleCount / result.sampleRateHz;
  const expectedFrameCount = supportedRate && validSamples
    ? Math.max(0, 1 + Math.floor((result.sampleCount - 8192) / 4096)) : null;
  const analysisSkipped = result.frameCount === 0 && codes.some(code => EARLY_EXIT_CODES.has(code));
  const metadataConsistent = supportedRate && validSamples && validFrames && validDuration &&
    result.fftSize === 8192 && result.hopSize === 4096 &&
    (result.frameCount === expectedFrameCount || analysisSkipped);
  if (!metadataConsistent) {
    issues.push({ code: 'recorded-window', severity: 'retake', message: 'The recorded-window metadata does not match a supported 5, 15, or 30 second capture and its expected analysis frames. Retake before interpreting this result.' });
  }
  const numericAnalysisAvailable = result.frameCount > 0 &&
    [result.aDigitalDb, result.cDigitalDb, result.cMinusADb]
      .every(value => typeof value === 'number' && Number.isFinite(value));
  if (!numericAnalysisAvailable && !issues.some(issue => issue.severity === 'retake')) {
    issues.push({ code: 'analysis-unavailable', severity: 'retake', message: 'Usable weighted digital analysis is unavailable for this window. Check the microphone and retake.' });
  }

  const settings = PROCESSING_SETTINGS.map(([key, label]) => ({
    key, label,
    state: (result.deviceSettings?.[key] === true ? 'on' : result.deviceSettings?.[key] === false ? 'off' : 'unknown') as ReportedProcessingState,
  }));
  // Preserve conservative capture flags even if a later settings object differs.
  const processingState = codes.includes('processing-active') || settings.some(setting => setting.state === 'on')
    ? 'active' : codes.some(code => code === 'processing-unknown' || code === 'imported-processing-unknown') ||
      settings.some(setting => setting.state === 'unknown') ? 'unknown' : 'reported-off';
  if (processingState !== 'reported-off' && !codes.some(code =>
    code === 'processing-active' || code === 'processing-unknown' || code === 'imported-processing-unknown')) {
    const code = processingState === 'active' ? 'processing-active' : 'processing-unknown';
    issues.push({ code, severity: 'caution', message: FLAG_ADVICE[code] });
  }
  if (result.inputKind !== 'microphone') {
    issues.push({ code: 'input-provenance', severity: 'caution', message: 'This input is not a live microphone observation. Its digital checks do not establish field recording quality; record a live microphone sample for that context.' });
  }

  const status = issues.some(issue => issue.severity === 'retake') ? 'retake' : issues.length ? 'caution' : 'ready';
  return {
    status,
    label: status === 'retake' ? 'Retake this recording' : status === 'caution' ? 'Use with limitations' : 'No obvious digital capture problem',
    summary: status === 'retake' ? 'A capture or analysis problem limits interpretation of this recorded window.'
      : status === 'caution' ? 'Review the limitations below before interpreting this recorded window.'
        : 'The digital checks found no flagged capture problem in this recorded window. They do not validate faithful acoustic capture.',
    window: { durationSeconds: result.durationSeconds, sampleRateHz: result.sampleRateHz,
      sampleCount: result.sampleCount, analyzedFrameCount: result.frameCount,
      expectedFrameCount, metadataConsistent, analysisSkipped },
    processing: { state: processingState, settings }, issues,
    microphoneFidelity: 'not-validated', sourceIdentity: 'not-assessed',
  };
}
