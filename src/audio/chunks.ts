import { AudioInputError } from './errors';

export interface CaptureChunk { startSample: number; samples: Float32Array }

/** Counts real samples, including the warm-up, and never pads missing audio. */
export class CaptureCollector {
  readonly pcm: Float32Array;
  readonly warmupSamples: number;
  private expectedSample = 0;
  private written = 0;

  constructor(readonly sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new AudioInputError('invalid-rate', 'The microphone returned an invalid sample rate. Try a file or demo.');
    }
    this.warmupSamples = Math.round(0.5 * sampleRate);
    this.pcm = new Float32Array(Math.round(5 * sampleRate));
  }

  get recordedSamples(): number { return this.written; }
  get complete(): boolean { return this.written === this.pcm.length; }
  get warmingUp(): boolean { return this.expectedSample < this.warmupSamples; }
  get progress(): number { return this.written / this.pcm.length; }

  push(chunk: CaptureChunk): void {
    if (this.complete) return;
    if (!Number.isSafeInteger(chunk.startSample) || chunk.startSample !== this.expectedSample
      || !(chunk.samples instanceof Float32Array) || chunk.samples.length === 0) {
      throw new AudioInputError('incomplete', 'Recording was interrupted or audio samples were lost. Keep this tab visible and retry, or choose a file or demo.');
    }
    const skip = Math.max(0, Math.min(chunk.samples.length, this.warmupSamples - this.expectedSample));
    const take = Math.min(chunk.samples.length - skip, this.pcm.length - this.written);
    if (take > 0) {
      this.pcm.set(chunk.samples.subarray(skip, skip + take), this.written);
      this.written += take;
    }
    this.expectedSample += chunk.samples.length;
  }
}

/** Device identity and group identifiers are deliberately excluded. */
export function filterDeviceSettings(settings: MediaTrackSettings): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of ['sampleRate', 'sampleSize', 'channelCount', 'latency', 'echoCancellation', 'noiseSuppression', 'autoGainControl'] as const) {
    const value = settings[key];
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      filtered[key] = value;
    }
  }
  return filtered;
}
