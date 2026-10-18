import FFT from 'fft.js';
import type { AnalysisResult, InputMeta, QualityCode } from '../types';
import { weightingBins } from './weighting';

export const ALGORITHM_VERSION = 'tw-screen-v1';
export const FFT_SIZE = 8192;
export const HOP_SIZE = 4096;
export const TARGET_DURATION_SECONDS = 5;
export const LOW_FREQUENCY_THRESHOLD_DB = 15;

const FFT_CACHE = new Map<number, FFT>();
const WINDOW_CACHE = new Map<number, Float64Array>();
let fallbackResultId = 0;

export function periodicHann(size: number): Float64Array {
  let window = WINDOW_CACHE.get(size);
  if (!window) {
    window = Float64Array.from({ length: size }, (_, n) => 0.5 - 0.5 * Math.cos(2 * Math.PI * n / size));
    WINDOW_CACHE.set(size, window);
  }
  return window;
}

/** One-sided digital PSD in amplitude²/Hz; raw mode exists for transform normalization tests. */
export function oneSidedPsd(
  frame: ArrayLike<number>,
  fs: number,
  options: { window?: 'hann' | 'rectangular'; removeMean?: boolean } = {},
): Float64Array {
  const size = frame.length;
  let fft = FFT_CACHE.get(size);
  if (!fft) {
    fft = new FFT(size);
    FFT_CACHE.set(size, fft);
  }
  const window = options.window === 'rectangular' ? null : periodicHann(size);
  const data = new Float64Array(size);
  let mean = 0;
  if (options.removeMean !== false) {
    for (let n = 0; n < size; n++) mean += frame[n];
    mean /= size;
  }
  let windowPower = 0;
  for (let n = 0; n < size; n++) {
    const gain = window ? window[n] : 1;
    data[n] = (frame[n] - mean) * gain;
    windowPower += gain * gain;
  }
  const transform = fft.createComplexArray();
  fft.realTransform(transform, data);
  const psd = new Float64Array(size / 2 + 1);
  for (let k = 0; k < psd.length; k++) {
    const real = transform[2 * k];
    const imaginary = transform[2 * k + 1];
    const factor = k === 0 || k === size / 2 ? 1 : 2;
    psd[k] = factor * (real * real + imaginary * imaginary) / (fs * windowPower);
  }
  return psd;
}

type FramePeak = { bin: number; prominenceDb: number };

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function framePeaks(psd: Float64Array, df: number, bandEnd: number): FramePeak[] {
  const peaks: FramePeak[] = [];
  const low = Math.ceil(20 / df);
  const high = Math.min(psd.length - 1, Math.floor(bandEnd / df));
  for (let k = Math.ceil(40 / df); k <= Math.min(Math.floor(2000 / df), high - 1); k++) {
    if (!(psd[k] > 0 && psd[k] >= psd[k - 1] && psd[k] > psd[k + 1])) continue;
    let core = 0;
    let neighborhood = 0;
    const background: number[] = [];
    for (let b = Math.max(low, k - 6); b <= Math.min(high, k + 6); b++) {
      neighborhood += psd[b];
      if (Math.abs(b - k) <= 1) core += psd[b];
      if (Math.abs(b - k) >= 3) background.push(psd[b]);
    }
    if (background.length < 4 || neighborhood <= 0) continue;
    const prominenceDb = 10 * Math.log10((core / 3) / Math.max(median(background), 1e-20));
    if (prominenceDb >= 12 && core / neighborhood >= 0.60) peaks.push({ bin: k, prominenceDb });
  }
  return peaks;
}

function sustainedPeak(frames: FramePeak[][], df: number): AnalysisResult['peakCandidate'] {
  if (frames.length < 20) return null;
  let best: { actualBins: number[]; prominences: number[] } | null = null;
  // Adjacent search centers represent one overlapping track. Selecting its actual
  // candidates preserves the peak location rather than reporting a cluster edge.
  for (let center = Math.ceil(40 / df); center <= Math.floor(2000 / df); center++) {
    const actualBins: number[] = [];
    const prominences: number[] = [];
    for (const peaks of frames) {
      const candidate = peaks.filter((peak) => Math.abs(peak.bin - center) <= 1)
        .sort((a, b) => b.prominenceDb - a.prominenceDb)[0];
      if (candidate) {
        actualBins.push(candidate.bin);
        prominences.push(candidate.prominenceDb);
      }
    }
    if (!best || actualBins.length > best.actualBins.length ||
      (actualBins.length === best.actualBins.length && median(prominences) > median(best.prominences))) {
      best = { actualBins, prominences };
    }
  }
  if (!best || best.actualBins.length / frames.length < 0.8) return null;
  return {
    centerHz: median(best.actualBins) * df,
    prominenceDb: median(best.prominences),
    persistentFrameFraction: best.actualBins.length / frames.length,
  };
}

const SETTINGS_ALLOWLIST = ['sampleRate', 'sampleSize', 'channelCount', 'echoCancellation', 'noiseSuppression', 'autoGainControl', 'latency'];

function filteredSettings(settings: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!settings) return null;
  return Object.fromEntries(Object.entries(settings).filter(([key]) => SETTINGS_ALLOWLIST.includes(key)));
}

/** Same deterministic calculation for synthetic, imported and microphone PCM. */
export function analyzePcm(pcm: Float32Array, fs: number, meta: InputMeta): AnalysisResult {
  const codes: QualityCode[] = [...new Set(meta.qualityCodes ?? [])];
  const flag = (code: QualityCode) => { if (!codes.includes(code)) codes.push(code); };
  const duration = Number.isFinite(fs) && fs > 0 ? pcm.length / fs : 0;
  const bandEnd = Number.isFinite(fs) && fs > 0 ? Math.min(20000, fs / 2) : 0;
  const settings = filteredSettings(meta.deviceSettings);
  const result: AnalysisResult = {
    id: globalThis.crypto?.randomUUID?.() ?? `tw-${Date.now()}-${++fallbackResultId}`,
    algorithmVersion: ALGORITHM_VERSION,
    inputKind: meta.inputKind,
    fixtureId: meta.fixtureId,
    inputLabel: meta.inputLabel,
    analysisCreatedUtc: new Date().toISOString(),
    recordedAtUtc: meta.recordedAtUtc,
    sampleRateHz: fs,
    sampleCount: pcm.length,
    durationSeconds: duration,
    channelPolicy: meta.channelPolicy,
    fftSize: FFT_SIZE,
    hopSize: HOP_SIZE,
    analyzedBandHz: [20, bandEnd],
    frameCount: 0,
    aDigitalDb: null,
    cDigitalDb: null,
    cMinusADb: null,
    lowFrequencyScreen: 'inconclusive',
    peakScreen: 'inconclusive',
    peakCandidate: null,
    qualityCodes: codes,
    deviceSettings: settings,
    spectrum: { hz: [], powerDb: [] },
  };

  if (meta.inputKind === 'imported-file') flag('imported-processing-unknown');
  if (meta.inputKind === 'microphone') {
    const flags = ['echoCancellation', 'noiseSuppression', 'autoGainControl'].map((key) => settings?.[key]);
    if (flags.some((value) => value === true)) flag('processing-active');
    else if (flags.some((value) => typeof value !== 'boolean')) flag('processing-unknown');
  }
  if (fs !== 44100 && fs !== 48000) flag('unsupported-rate');
  if (duration < TARGET_DURATION_SECONDS || pcm.length < FFT_SIZE) flag('incomplete');

  // Reject non-finite input before sums, clipping checks or transforms.
  for (const sample of pcm) {
    if (!Number.isFinite(sample)) {
      flag('non-finite');
      return result;
    }
  }
  let squareSum = 0;
  let peak = 0;
  let clippedCount = 0;
  for (const sample of pcm) {
    squareSum += sample * sample;
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    if (absolute >= 0.999) clippedCount++;
  }
  if (!pcm.length || Math.sqrt(squareSum / pcm.length) < 1e-5) flag('near-zero');
  if (peak >= 0.98 || clippedCount > 0) flag('near-full-scale');
  if (pcm.length > 0 && clippedCount / pcm.length >= 0.001) flag('clipped');
  if (codes.includes('unsupported-rate') || codes.includes('near-zero')) return result;

  const df = fs / FFT_SIZE;
  const averagePsd = new Float64Array(FFT_SIZE / 2 + 1);
  const candidateFrames: FramePeak[][] = [];
  for (let start = 0; start + FFT_SIZE <= pcm.length; start += HOP_SIZE) {
    const psd = oneSidedPsd(pcm.subarray(start, start + FFT_SIZE), fs);
    for (let k = 0; k < psd.length; k++) averagePsd[k] += psd[k];
    candidateFrames.push(framePeaks(psd, df, bandEnd));
  }
  result.frameCount = candidateFrames.length;
  if (result.frameCount === 0) return result;
  for (let k = 0; k < averagePsd.length; k++) averagePsd[k] /= result.frameCount;
  const weights = weightingBins(fs, FFT_SIZE);
  let aPower = 0;
  let cPower = 0;
  for (let k = Math.ceil(20 / df); k <= Math.floor(bandEnd / df); k++) {
    aPower += averagePsd[k] * weights.aSquared[k] * df;
    cPower += averagePsd[k] * weights.cSquared[k] * df;
    result.spectrum.hz.push(k * df);
    // A plotting floor alone must never enter power integration or screening.
    result.spectrum.powerDb.push(10 * Math.log10(Math.max(averagePsd[k], 1e-30)));
  }
  if (!(aPower > 0 && cPower > 0 && Number.isFinite(aPower) && Number.isFinite(cPower))) {
    flag('no-band-power');
    return result;
  }
  const hardFailure = codes.some((code) => ['non-finite', 'incomplete', 'unsupported-rate', 'near-zero', 'clipped'].includes(code));
  if (hardFailure) return result;
  result.aDigitalDb = 10 * Math.log10(aPower);
  result.cDigitalDb = 10 * Math.log10(cPower);
  result.cMinusADb = 10 * Math.log10(cPower / aPower);
  result.lowFrequencyScreen = result.cMinusADb >= LOW_FREQUENCY_THRESHOLD_DB ? 'suggested' : 'not-indicated';
  result.peakCandidate = sustainedPeak(candidateFrames, df);
  result.peakScreen = result.frameCount < 20 ? 'inconclusive' : result.peakCandidate ? 'suggested' : 'not-indicated';
  return result;
}
