import type { QualityCode } from '../types';
import { SOUND_HINT_LABELS } from './labels';
import { SOUND_HINT_MODEL } from './model';
import type { SoundHintRanking } from './types';

const BLOCKING_QUALITY_CODES: QualityCode[] = [
  'near-zero', 'clipped', 'near-full-scale', 'incomplete', 'unsupported-rate', 'non-finite', 'no-band-power',
];

export function soundHintsBlockedReason(qualityCodes: readonly QualityCode[]): string | null {
  return qualityCodes.some(code => BLOCKING_QUALITY_CODES.includes(code))
    ? 'Sound hints are unavailable because this recording’s quality flags make an optional AI comparison unreliable. Try a fresh, unclipped recording with an audible signal.'
    : null;
}

export function validateSoundHintPcm(pcm: Float32Array, sampleRateHz: number, qualityCodes: readonly QualityCode[]): void {
  const blocked = soundHintsBlockedReason(qualityCodes);
  if (blocked) throw new Error(blocked);
  if (sampleRateHz !== SOUND_HINT_MODEL.sampleRateHz || pcm.length !== sampleRateHz * SOUND_HINT_MODEL.observationSeconds) {
    throw new Error('Sound hints need a separately resampled five-second mono copy at 48 kHz.');
  }
  let power = 0;
  for (const sample of pcm) {
    if (!Number.isFinite(sample) || Math.abs(sample) >= 0.999) {
      throw new Error('Sound hints cannot analyze invalid or clipped samples. Try a fresh recording.');
    }
    power += sample * sample;
  }
  if (Math.sqrt(power / pcm.length) < 1e-5) {
    throw new Error('There is too little signal for sound hints. Try a fresh recording with an audible sound.');
  }
}

// This provisional gate is deliberately NOT a source-confidence decision. No
// independent field contrast set has validated this application, so even a
// strongly separated ranking remains uncertain and cannot name a real source.
export function evaluateSoundHintRankings(raw: ReadonlyArray<{ label: string; score: number }>): {
  status: 'uncertain';
  reason: 'weak-separation' | 'not-validated';
  provisionalGatePassed: boolean;
  rankings: SoundHintRanking[];
} {
  if (raw.length !== SOUND_HINT_LABELS.length || new Set(raw.map(item => item.label)).size !== SOUND_HINT_LABELS.length
    || raw.some(item => !SOUND_HINT_LABELS.includes(item.label as SoundHintRanking['label'])
      || !Number.isFinite(item.score) || item.score < 0 || item.score > 1)) {
    throw new Error('The model returned an invalid comparison. Please retry.');
  }
  const sorted = raw.map(item => ({ ...item, label: item.label as SoundHintRanking['label'] })).sort((a, b) => b.score - a.score);
  const provisionalGatePassed = sorted[0].score >= 0.55 && sorted[0].score - sorted[1].score >= 0.20;
  return { status: 'uncertain', reason: provisionalGatePassed ? 'not-validated' : 'weak-separation', provisionalGatePassed, rankings: sorted.slice(0, 2) };
}
