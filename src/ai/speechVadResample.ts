/** Independent speech-only16k conversion. The frozen CLAP preprocessing is unchanged. */
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
function besselI0(x: number): number {
  let sum = 1, term = 1;
  for (let k = 1; k < 64; k += 1) {
    term *= x * x / (4 * k * k); sum += term;
    if (term <= sum * Number.EPSILON) break;
  }
  return sum;
}
function designFilter(up: number, down: number): Float32Array {
  const rate = Math.max(up, down), half = 10 * rate, taps = new Float64Array(2 * half + 1), denominator = besselI0(5);
  let sum = 0;
  for (let index = 0; index < taps.length; index += 1) {
    const offset = index - half, argument = offset / rate, relative = offset / half;
    const sinc = argument === 0 ? 1 : Math.sin(Math.PI * argument) / (Math.PI * argument);
    taps[index] = sinc * besselI0(5 * Math.sqrt(Math.max(0, 1 - relative * relative))) / denominator / rate;
    sum += taps[index];
  }
  return Float32Array.from(taps, tap => Math.fround(Math.fround(tap / sum) * up));
}

/** SciPy1.15.3 resample_poly Float32 default Kaiser(beta5), zero extension and no gain adjustment.
 * Anti-aliases before downsampling44.1/48kHz; accepts short synthetic startup/test inputs too.
 */
export function resampleForSpeechVad(pcm: Float32Array, rate: number): Float32Array {
  if (!(pcm instanceof Float32Array) || ![16_000, 44_100, 48_000].includes(rate) || !pcm.length
    || pcm.length > rate * 30 || pcm.some(value => !Number.isFinite(value))) throw new Error('Invalid bounded mono PCM for speech screening.');
  if (rate === 16_000) return pcm.slice();
  const divisor = gcd(rate, 16_000), up = 16_000 / divisor, down = rate / divisor;
  const filter = designFilter(up, down), half = (filter.length - 1) / 2;
  const output = new Float32Array(Math.ceil(pcm.length * up / down));
  for (let index = 0; index < output.length; index += 1) {
    const center = half + index * down;
    const first = Math.max(0, Math.ceil((center - 2 * half) / up));
    const last = Math.min(pcm.length - 1, Math.floor(center / up));
    let sum = 0;
    for (let source = first; source <= last; source += 1) {
      sum = Math.fround(sum + Math.fround(pcm[source] * filter[center - source * up]));
    }
    output[index] = sum;
  }
  return output;
}
