/** Normalized analog response shapes; amplitude gains equal one at 1 kHz. */
const F1_SQ = 20.598997 ** 2;
const F2_SQ = 107.65265 ** 2;
const F3_SQ = 737.86223 ** 2;
const F4_SQ = 12194.217 ** 2;

function rawA(hz: number): number {
  const f2 = hz * hz;
  return (F4_SQ * f2 * f2) /
    ((f2 + F1_SQ) * Math.sqrt((f2 + F2_SQ) * (f2 + F3_SQ)) * (f2 + F4_SQ));
}

function rawC(hz: number): number {
  const f2 = hz * hz;
  return (F4_SQ * f2) / ((f2 + F1_SQ) * (f2 + F4_SQ));
}

const A_REFERENCE = rawA(1000);
const C_REFERENCE = rawC(1000);

export function aGain(hz: number): number {
  return hz > 0 && Number.isFinite(hz) ? rawA(hz) / A_REFERENCE : 0;
}

export function cGain(hz: number): number {
  return hz > 0 && Number.isFinite(hz) ? rawC(hz) / C_REFERENCE : 0;
}

export function aWeightingDb(hz: number): number {
  return 20 * Math.log10(aGain(hz));
}

export function cWeightingDb(hz: number): number {
  return 20 * Math.log10(cGain(hz));
}

const binCache = new Map<string, { aSquared: Float64Array; cSquared: Float64Array }>();

export function weightingBins(fs: number, size: number) {
  const key = `${fs}:${size}`;
  let bins = binCache.get(key);
  if (!bins) {
    const aSquared = new Float64Array(size / 2 + 1);
    const cSquared = new Float64Array(size / 2 + 1);
    for (let k = 0; k < aSquared.length; k++) {
      const hz = k * fs / size;
      aSquared[k] = aGain(hz) ** 2;
      cSquared[k] = cGain(hz) ** 2;
    }
    bins = { aSquared, cSquared };
    binCache.set(key, bins);
  }
  return bins;
}
