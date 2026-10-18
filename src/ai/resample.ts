import { SOUND_HINT_MODEL } from './model';

export function soundHintResampleLength(inputLength: number, inputSampleRateHz: number): number {
  if (!Number.isSafeInteger(inputLength) || inputLength < 1 || !Number.isSafeInteger(inputSampleRateHz) || inputSampleRateHz < 8_000 || inputSampleRateHz > 192_000) {
    throw new Error('The audio length or sample rate is invalid.');
  }
  return Math.ceil(inputLength * SOUND_HINT_MODEL.sampleRateHz / inputSampleRateHz);
}

function gcd(a: number, b: number): number {
  while (b !== 0) { const remainder = a % b; a = b; b = remainder; }
  return a;
}

// I0's convergent power series is sufficient for the fixed Kaiser beta of 5.
function besselI0(x: number): number {
  const quarterSquare = x * x / 4;
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 64; k += 1) {
    term *= quarterSquare / (k * k);
    sum += term;
    if (term <= sum * Number.EPSILON) break;
  }
  return sum;
}

/** SciPy 1.15.3 resample_poly's default, symmetric firwin Kaiser(beta=5) FIR.
 * The design is Float64, then cast to Float32 BEFORE multiplication by up,
 * matching the training pipeline's Float32 waveform path. No gain adjustment
 * is applied to the waveform. See scipy.signal.resample_poly and firwin.
 */
function designFilter(up: number, down: number): Float32Array {
  const maxRate = Math.max(up, down);
  const halfLength = 10 * maxRate;
  const taps = new Float64Array(2 * halfLength + 1);
  const denominator = besselI0(5);
  let sum = 0;
  for (let index = 0; index < taps.length; index += 1) {
    const offset = index - halfLength;
    const argument = offset / maxRate;
    const sinc = argument === 0 ? 1 : Math.sin(Math.PI * argument) / (Math.PI * argument);
    const relative = offset / halfLength;
    const window = besselI0(5 * Math.sqrt(Math.max(0, 1 - relative * relative))) / denominator;
    taps[index] = sinc * window / maxRate;
    sum += taps[index];
  }
  return Float32Array.from(taps, tap => Math.fround(Math.fround(tap / sum) * up));
}

/** Deterministic local conversion of the first five seconds to 48 kHz.
 * Matches scipy.signal.resample_poly(pcm, 48000, actualRate)'s default Kaiser
 * FIR and zero extension, rather than browser-dependent Web Audio resampling.
 * The zero-phase alignment below incorporates SciPy's padded-filter trimming:
 * coefficient index = halfLength + outputIndex*down - inputIndex*up.
 * All inputs/outputs are independent copies; the DSP waveform stays intact.
 */
export async function resampleForSoundHints(pcm: Float32Array, inputSampleRateHz: number): Promise<Float32Array> {
  if (!(pcm instanceof Float32Array) || pcm.some(sample => !Number.isFinite(sample))) {
    throw new Error('The recording contains invalid audio samples.');
  }
  const outputLength = soundHintResampleLength(pcm.length, inputSampleRateHz);
  if (pcm.length !== inputSampleRateHz * SOUND_HINT_MODEL.observationSeconds) {
    throw new Error('Sound hints need exactly five seconds at the actual input sample rate.');
  }
  if (inputSampleRateHz === SOUND_HINT_MODEL.sampleRateHz) return pcm.slice();

  const divisor = gcd(SOUND_HINT_MODEL.sampleRateHz, inputSampleRateHz);
  const up = SOUND_HINT_MODEL.sampleRateHz / divisor;
  const down = inputSampleRateHz / divisor;
  const coefficients = designFilter(up, down);
  const halfLength = (coefficients.length - 1) / 2;
  const output = new Float32Array(outputLength);
  for (let index = 0; index < output.length; index += 1) {
    const center = halfLength + index * down;
    const first = Math.max(0, Math.ceil((center - 2 * halfLength) / up));
    const last = Math.min(pcm.length - 1, Math.floor(center / up));
    let sum = 0;
    // Ascending source order and Float32 products/sums reproduce upfirdn's
    // Float32 accumulation, including its boundary transients.
    for (let source = first; source <= last; source += 1) {
      sum = Math.fround(sum + Math.fround(pcm[source] * coefficients[center - source * up]));
    }
    output[index] = sum;
  }
  if (output.some(sample => !Number.isFinite(sample))) {
    throw new Error('The sample-rate conversion produced invalid audio samples.');
  }
  return output;
}
