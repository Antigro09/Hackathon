import type { InputMeta } from '../types';

export const FIXTURES = [
  { id: 'white-noise', label: 'Broadband noise', description: 'Seeded broadband noise. Compare its spectrum with the harmonic hum.' },
  { id: 'hum-harmonics', label: 'Harmonic hum', description: 'A 63 Hz hum with 126 and 189 Hz harmonics.' },
  { id: 'sine-1000', label: '1 kHz tone', description: 'A clear sustained tone with almost zero C−A difference.' },
  { id: 'lf-broadband', label: 'Low-frequency broadband', description: 'Filtered seeded noise: a large bass-screen difference without a persistent isolated peak.' },
  { id: 'sine-63', label: '63 Hz tone', description: 'A sustained bass tone at 0.1 digital peak amplitude.' },
  { id: 'sine-125', label: '125 Hz tone', description: 'A sustained tone just above the prototype bass-screen threshold.' },
  { id: 'mixed-63-1000', label: 'Bass + 1 kHz mixture', description: 'Equal-amplitude tones show that a small overall gap can include bass.' },
  { id: 'short-burst', label: 'Short beep', description: 'A 1 kHz tone for only 0.2 seconds of the five-second sample.' },
  { id: 'silence', label: 'Digital silence', description: 'Empty digital input should remain inconclusive.' },
  { id: 'clipped', label: 'Clipped tone', description: 'An overloaded 125 Hz signal demonstrates the recording-quality gate.' },
] as const;

export type FixtureId = (typeof FIXTURES)[number]['id'];
export const fixtureManifest = FIXTURES;

function noiseGenerator() {
  let state = 0x08042026 >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return 2 * (state / 4294967296) - 1;
  };
}

function normalizeNoise(values: Float64Array): Float32Array {
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / values.length;
  let squareSum = 0;
  for (let n = 0; n < values.length; n++) {
    values[n] -= mean;
    squareSum += values[n] * values[n];
  }
  const scale = 0.05 / Math.sqrt(squareSum / values.length);
  return Float32Array.from(values, (value) => value * scale);
}

/** Every regeneration starts from the same seed; no playback or microphone is involved. */
export function generateFixture(id: FixtureId, fs = 48000): Float32Array {
  if (fs !== 44100 && fs !== 48000) throw new Error('Fixtures support 44.1 or 48 kHz.');
  const length = Math.round(5 * fs);
  if (id === 'white-noise' || id === 'lf-broadband') {
    const noise = noiseGenerator();
    const values = new Float64Array(length);
    if (id === 'white-noise') {
      for (let n = 0; n < length; n++) values[n] = noise();
    } else {
      const alpha = Math.exp(-2 * Math.PI * 40 / fs);
      const warmup = Math.round(2 * fs);
      let s1 = 0;
      let s2 = 0;
      for (let n = 0; n < warmup + length; n++) {
        s1 = (1 - alpha) * noise() + alpha * s1;
        s2 = (1 - alpha) * s1 + alpha * s2;
        if (n >= warmup) values[n - warmup] = s2;
      }
    }
    return normalizeNoise(values);
  }

  const pcm = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    const t = n / fs;
    const sine = (hz: number) => Math.sin(2 * Math.PI * hz * t);
    switch (id) {
      case 'sine-63': pcm[n] = 0.1 * sine(63); break;
      case 'sine-125': pcm[n] = 0.1 * sine(125); break;
      case 'sine-1000': pcm[n] = 0.1 * sine(1000); break;
      case 'mixed-63-1000': pcm[n] = 0.1 * sine(63) + 0.1 * sine(1000); break;
      case 'hum-harmonics': pcm[n] = 0.1 * sine(63) + 0.04 * sine(126) + 0.02 * sine(189); break;
      case 'short-burst': pcm[n] = t >= 2 && t < 2.2 ? 0.1 * sine(1000) : 0; break;
      case 'clipped': pcm[n] = Math.max(-1, Math.min(1, 2 * sine(125))); break;
      case 'silence': break;
      default: throw new Error(`Unknown synthetic fixture: ${String(id)}`);
    }
  }
  return pcm;
}

export function syntheticMeta(id: FixtureId): InputMeta {
  return {
    inputKind: 'synthetic', fixtureId: id, recordedAtUtc: null,
    channelPolicy: 'mono-capture', deviceSettings: null,
    inputLabel: FIXTURES.find((fixture) => fixture.id === id)?.label,
  };
}
