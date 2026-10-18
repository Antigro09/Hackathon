import type { AnalysisResult } from '../types';
import type { CommunityCoordinates, CommunityFacilityReference, CommunityObservationDraft } from '../community/types';
import { parseManualCoordinates } from '../data/readings';

const BLOCKING = new Set(['near-zero', 'clipped', 'near-full-scale', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power']);

export function communityScreeningPreview(result: AnalysisResult) {
  const blocked = result.qualityCodes.some(code => BLOCKING.has(code));
  const numeric = !blocked && result.lowFrequencyScreen !== 'inconclusive'
    && [result.aDigitalDb, result.cDigitalDb, result.cMinusADb].every(value => value !== null && Number.isFinite(value));
  return {
    aDigitalDb: numeric ? result.aDigitalDb : null,
    cDigitalDb: numeric ? result.cDigitalDb : null,
    cMinusADb: numeric ? result.cMinusADb : null,
    peakScreen: blocked ? 'inconclusive' as const : result.peakScreen,
  };
}

/** Round before sending: the endpoint never receives the more precise input. */
export function approximateCommunityCoordinates(latitude: string, longitude: string): CommunityCoordinates {
  const value = parseManualCoordinates(latitude, longitude);
  return { latitude: Math.round(value.latitude * 1000) / 1000, longitude: Math.round(value.longitude * 1000) / 1000 };
}

/** Deliberate public allowlist. No audio, spectrum, AI, device or private notes. */
export function makeCommunityDraft(result: AnalysisResult, options: {
  latitude: string; longitude: string; label: string; note: string;
  consent: boolean; nearbyFacility: CommunityFacilityReference | null;
}): CommunityObservationDraft {
  if (result.inputKind !== 'microphone') throw new Error('Record a live microphone observation before publishing. Imported and synthetic inputs cannot be shared.');
  if (!result.recordedAtUtc || !Number.isFinite(Date.parse(result.recordedAtUtc))) throw new Error('This observation has no recording timestamp. Make a new microphone capture before publishing.');
  if (![5, 15, 30].includes(result.durationSeconds) || ![44100, 48000].includes(result.sampleRateHz) || result.sampleCount !== result.sampleRateHz * result.durationSeconds || result.algorithmVersion !== 'tw-screen-v2') {
    throw new Error('Publish a complete supported 5, 15 or 30 second microphone observation.');
  }
  if (!options.consent) throw new Error('Review the approximate recording location and confirm public sharing.');
  const label = options.label.trim(), note = options.note.trim();
  if (!label || label.length > 80) throw new Error('Enter a public label of 1–80 characters.');
  if (note.length > 280) throw new Error('Keep the public note to 280 characters.');
  return {
    schemaVersion: 1, consent: true, inputKind: 'microphone',
    coordinates: approximateCommunityCoordinates(options.latitude, options.longitude), label, note,
    capturedAtUtc: result.recordedAtUtc, durationSeconds: result.durationSeconds as 5 | 15 | 30,
    sampleRateHz: result.sampleRateHz as 44100 | 48000, sampleCount: result.sampleCount,
    frameCount: result.frameCount, algorithmVersion: 'tw-screen-v2', qualityCodes: [...result.qualityCodes],
    ...communityScreeningPreview(result),
    nearbyFacility: options.nearbyFacility ? { ...options.nearbyFacility } : null, website: '',
  };
}
