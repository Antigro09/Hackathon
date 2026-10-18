import type { SoundFamilyV3 } from './modelV3';

export interface TargetSoundWindow {
  startSeconds: number;
  endSeconds: number;
  family: SoundFamilyV3 | null;
}

export interface TargetSoundAssessment {
  status: 'retake' | 'interference' | 'potentially-relevant' | 'unclear';
  label: string;
  summary: string;
  unclearWindows: number;
  mixedFamilies: boolean;
  competingFamilies: ('speech' | 'wind' | 'traffic')[];
  speechScreenDetected: boolean;
}

const families = new Set<SoundFamilyV3>(['buzz', 'mechanical_fan', 'speech', 'traffic', 'wind']);

/** Interpret accepted broad families as equipment-target guidance, never source proof. */
export function assessTargetSound(windows: readonly TargetSoundWindow[], speechScreenDetected = false): TargetSoundAssessment {
  if (![1, 3, 6].includes(windows.length) || windows.some((window, index) =>
    window.startSeconds !== index * 5 || window.endSeconds !== (index + 1) * 5 ||
    (window.family !== null && !families.has(window.family))) || typeof speechScreenDetected !== 'boolean') {
    throw new Error('Target guidance requires a complete ordered 5, 15 or 30 second scan.');
  }
  const accepted = new Set(windows.flatMap(window => window.family === null ? [] : [window.family]));
  const competingFamilies = (['speech', 'wind', 'traffic'] as const).filter(family => accepted.has(family) || (family === 'speech' && speechScreenDetected));
  const common = { unclearWindows: windows.filter(window => window.family === null).length,
    mixedFamilies: accepted.size > 1, competingFamilies, speechScreenDetected };
  if (speechScreenDetected || accepted.has('speech')) return {
    ...common, status: 'retake', label: 'Possible talking — retake for equipment noise',
    summary: `${speechScreenDetected ? 'The separate speech screen flagged possible voices.' : 'At least one five-second window resembled speech.'} This capture may include conversation rather than the equipment sound you want. Retake without talking near the microphone; also review any other competing sounds shown below.`,
  };
  if (accepted.has('wind') || accepted.has('traffic')) return {
    ...common, status: 'interference', label: 'Possible interference — review or retake',
    summary: 'Wind-like or traffic-like sound was suggested in part of this capture. It may interfere with the equipment sound you want. Compare a sheltered capture or another capture when traffic subsides.',
  };
  if (accepted.has('mechanical_fan') && (common.unclearWindows > 0 || common.mixedFamilies)) return {
    ...common, status: 'unclear', label: 'Mixed or unexplained sound — review or retake',
    summary: 'Some of the capture resembled a mechanical fan, but other intervals were unexplained or suggested another family. The recording may not consistently represent the equipment noise you want. Review the whole capture and retake if competing sounds dominate.',
  };
  if (accepted.has('mechanical_fan')) return {
    ...common, status: 'potentially-relevant', label: 'Cooling-like sound — potentially relevant',
    summary: 'Every five-second window resembled a mechanical fan. That may be relevant to cooling noise, but other HVAC, fans and machinery can sound similar, and competing sounds can be missed. This does not identify a data-center source or confirm an accurate recording.',
  };
  if (accepted.has('buzz')) return {
    ...common, status: 'unclear', label: 'Target unclear — buzz-like sound',
    summary: 'The model suggested buzz-like sound, a family that includes insect recordings. This does not establish equipment or data-center noise.',
  };
  return {
    ...common, status: 'unclear', label: 'Target unclear — no family accepted',
    summary: 'The model left every five-second window unclassified. The intended equipment sound is unconfirmed; unfamiliar or competing sounds may be present. Review the capture and retake if needed. This does not establish quiet or the absence of equipment noise.',
  };
}
