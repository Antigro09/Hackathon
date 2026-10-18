import { describe, expect, it } from 'vitest';
import { analyzePcm } from '../src/analysis/engine';
import { assessRecordingCheck } from '../src/analysis/recordingCheck';
import { soundHintsBlockedReason } from '../src/ai/policy';
import type { AnalysisResult, InputMeta, QualityCode } from '../src/types';

const microphoneMeta: InputMeta = {
  inputKind: 'microphone', fixtureId: null, recordedAtUtc: '2026-10-18T12:00:00Z',
  channelPolicy: 'mono-capture',
  deviceSettings: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};
function tone(fs = 48000, duration = 5): Float32Array {
  return Float32Array.from({ length: fs * duration }, (_, n) => 0.1 * Math.sin(2 * Math.PI * 1000 * n / fs));
}
function result(): AnalysisResult { return analyzePcm(tone(), 48000, microphoneMeta); }

describe('recording usability checks', () => {
  it.each([44100, 48000].flatMap(fs => [5, 15, 30].map(duration => [fs, duration])))('checks the actual full %i Hz, %i second window', (fs, duration) => {
    const analyzed = analyzePcm(tone(fs, duration), fs, microphoneMeta);
    const check = assessRecordingCheck(analyzed);
    expect(check.status).toBe('ready');
    expect(check.window).toMatchObject({ durationSeconds: duration, sampleCount: fs * duration,
      analyzedFrameCount: 1 + Math.floor((fs * duration - 8192) / 4096), metadataConsistent: true, analysisSkipped: false });
    expect(check.processing.state).toBe('reported-off');
    expect(check.microphoneFidelity).toBe('not-validated');
    expect(check.sourceIdentity).toBe('not-assessed');
  });

  it('preserves zero analyzed frames on digital silence rather than inventing successful analysis', () => {
    const analyzed = analyzePcm(new Float32Array(48000 * 15), 48000, microphoneMeta);
    const check = assessRecordingCheck(analyzed);
    expect(check.status).toBe('retake');
    expect(check.window).toMatchObject({ durationSeconds: 15, analyzedFrameCount: 0, metadataConsistent: true, analysisSkipped: true });
    expect(check.issues.map(issue => issue.code)).toEqual(['near-zero']);
  });

  it('checks clipping after the AI first-five-second window in a longer capture', () => {
    const pcm = tone(48000, 15);
    pcm.fill(1, 10 * 48000, 10 * 48000 + 1000);
    const analyzed = analyzePcm(pcm, 48000, microphoneMeta);
    expect(analyzed.qualityCodes).toContain('clipped');
    expect(assessRecordingCheck(analyzed).status).toBe('retake');
    expect(assessRecordingCheck(analyzed).window.durationSeconds).toBe(15);
  });

  it('keeps near-full-scale as a caution without changing the engine or existing AI gate', () => {
    const pcm = tone();
    pcm[7] = 0.99;
    const analyzed = analyzePcm(pcm, 48000, microphoneMeta);
    expect(analyzed.cMinusADb).not.toBeNull();
    expect(analyzed.qualityCodes).toEqual(['near-full-scale']);
    expect(assessRecordingCheck(analyzed).status).toBe('caution');
    expect(soundHintsBlockedReason(analyzed.qualityCodes)).toBeTruthy();
  });

  it.each([
    { sampleCount: 240001 }, { durationSeconds: 30 }, { sampleRateHz: 16000 },
    { frameCount: 0 }, { frameCount: 56 }, { fftSize: 4096 }, { hopSize: 2048 },
    { sampleCount: Number.NaN }, { durationSeconds: Infinity },
  ])('rejects inconsistent recorded-window metadata %j', (change) => {
    const check = assessRecordingCheck({ ...result(), ...change });
    expect(check.status).toBe('retake');
    expect(check.window.metadataConsistent).toBe(false);
    expect(check.issues.map(issue => issue.code)).toContain('recorded-window');
  });

  it('does not confuse an actual 5 second window with a requested 30 second selector', () => {
    const analyzed = analyzePcm(tone(), 48000, { ...microphoneMeta,
      deviceSettings: { ...microphoneMeta.deviceSettings, requestedCaptureDurationSeconds: 30 } });
    expect(analyzed.deviceSettings).not.toHaveProperty('requestedCaptureDurationSeconds');
    expect(assessRecordingCheck(analyzed).window.durationSeconds).toBe(5);
    expect(assessRecordingCheck(analyzed).status).toBe('ready');
  });

  it.each([null, {}, { echoCancellation: false }, { echoCancellation: false, noiseSuppression: false, autoGainControl: 'false' }])('treats missing reported processing as unknown even without quality flags', deviceSettings => {
    const check = assessRecordingCheck({ ...result(), deviceSettings, qualityCodes: [] });
    expect(check.status).toBe('caution');
    expect(check.processing.state).toBe('unknown');
    expect(check.issues.map(issue => issue.code)).toContain('processing-unknown');
  });

  it('uses reported active settings and preserves conservative capture processing flags', () => {
    expect(assessRecordingCheck({ ...result(), deviceSettings: { ...microphoneMeta.deviceSettings, noiseSuppression: true } }).processing.state).toBe('active');
    expect(assessRecordingCheck({ ...result(), qualityCodes: ['processing-active'] }).processing.state).toBe('active');
    expect(assessRecordingCheck({ ...result(), qualityCodes: ['processing-unknown'] }).status).toBe('caution');
  });

  it.each(['near-zero', 'clipped', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power'] satisfies QualityCode[])('retains retake advice for the full-window %s flag', code => {
    const check = assessRecordingCheck({ ...result(), qualityCodes: [code] });
    expect(check.status).toBe('retake');
    expect(check.issues.find(issue => issue.code === code)?.message.length).toBeGreaterThan(50);
  });

  it('fails safely if weighted analysis is missing without a quality flag', () => {
    expect(assessRecordingCheck({ ...result(), cMinusADb: null }).issues.map(issue => issue.code)).toContain('analysis-unavailable');
    expect(assessRecordingCheck({ ...result(), cDigitalDb: Number.NaN }).status).toBe('retake');
  });

  it('does not turn synthetic provenance, a large C−A, or a peak into validated field capture', () => {
    const base = result();
    const changed = { ...base, cMinusADb: 45, lowFrequencyScreen: 'suggested' as const,
      peakScreen: 'suggested' as const, peakCandidate: { centerHz: 60, prominenceDb: 30, persistentFrameFraction: 1 } };
    expect(assessRecordingCheck(changed)).toEqual(assessRecordingCheck(base));
    const synthetic = assessRecordingCheck({ ...changed, inputKind: 'synthetic' });
    expect(synthetic.status).toBe('caution');
    expect(synthetic.sourceIdentity).toBe('not-assessed');
    expect(synthetic.microphoneFidelity).toBe('not-validated');
  });
});
