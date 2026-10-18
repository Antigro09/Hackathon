import { SPEECH_VAD_MODEL as policy } from './speechVadModel';
import type { SpeechVadInterval } from './speechVadTypes';

/** Upstream default hysteresis/minimum-duration/padding for bounded16k captures.
 * Keep exact sample resolution internally; UI timestamps are approximate32ms steps.
 */
export function speechVadIntervals(probabilities: readonly number[], sampleCount: number): SpeechVadInterval[] {
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 480_000
    || probabilities.length !== Math.ceil(sampleCount / 512)
    || probabilities.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Invalid speech screening output.');
  let triggered = false, start = 0, temporaryEnd = 0;
  const intervals: { start: number; end: number }[] = [];
  for (let index = 0; index < probabilities.length; index += 1) {
    const probability = probabilities[index], position = index * 512;
    if (probability >= policy.threshold && temporaryEnd) temporaryEnd = 0;
    if (probability >= policy.threshold && !triggered) { triggered = true; start = position; continue; }
    if (probability < policy.negativeThreshold && triggered) {
      if (!temporaryEnd) temporaryEnd = position;
      if (position - temporaryEnd < policy.minimumSilenceSamples) continue;
      if (temporaryEnd - start > policy.minimumSpeechSamples) intervals.push({ start, end: temporaryEnd });
      triggered = false; temporaryEnd = 0; start = 0;
    }
  }
  if (triggered && sampleCount - start > policy.minimumSpeechSamples) intervals.push({ start, end: sampleCount });
  for (let index = 0; index < intervals.length; index += 1) {
    const segment = intervals[index];
    if (index === 0) segment.start = Math.max(0, segment.start - policy.paddingSamples);
    if (index !== intervals.length - 1) {
      const gap = intervals[index + 1].start - segment.end;
      if (gap < 2 * policy.paddingSamples) {
        segment.end += Math.floor(gap / 2);
        intervals[index + 1].start = Math.max(0, intervals[index + 1].start - Math.floor(gap / 2));
      } else {
        segment.end = Math.min(sampleCount, segment.end + policy.paddingSamples);
        intervals[index + 1].start = Math.max(0, intervals[index + 1].start - policy.paddingSamples);
      }
    } else segment.end = Math.min(sampleCount, segment.end + policy.paddingSamples);
  }
  return intervals.map(segment => ({ startSeconds: segment.start / 16_000, endSeconds: segment.end / 16_000 }));
}
