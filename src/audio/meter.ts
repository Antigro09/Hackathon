/** A short unweighted digital preview, never an acoustic sound-pressure level. */
export interface InputMeterReading {
  rms: number;
  peak: number;
  clipped: boolean;
  levelDb: number | null;
}

/** Aggregates every incoming chunk while limiting UI updates to ten per second. */
export class InputMeterAccumulator {
  private sumSquares = 0;
  private sampleCount = 0;
  private peak = 0;
  private lastEmittedAt = Number.NEGATIVE_INFINITY;

  push(samples: Float32Array, now: number): InputMeterReading | null {
    if (!samples.length || !Number.isFinite(now)) return null;
    // An invalid chunk must never leave NaN or a fabricated zero in the meter.
    if (samples.some(sample => !Number.isFinite(sample))) {
      this.sumSquares = 0;
      this.sampleCount = 0;
      this.peak = 0;
      return null;
    }
    for (const sample of samples) {
      this.sumSquares += sample * sample;
      this.peak = Math.max(this.peak, Math.abs(sample));
    }
    this.sampleCount += samples.length;
    if (now - this.lastEmittedAt < 100) return null;

    const rms = Math.sqrt(this.sumSquares / this.sampleCount);
    const reading = {
      rms,
      peak: this.peak,
      clipped: this.peak >= 0.999,
      levelDb: rms > 0 ? 20 * Math.log10(rms) : null,
    };
    this.sumSquares = 0;
    this.sampleCount = 0;
    this.peak = 0;
    this.lastEmittedAt = now;
    return reading;
  }
}
