import type { AnalysisResult } from '../types';

export const REPORT_SPECTRUM_UNITS = 'Digital PSD · dB re 1²/Hz';
export const REPORT_PLOT = Object.freeze({ left: 66, top: 35, width: 670, height: 175, viewWidth: 760, viewHeight: 268 });

/** A report owns its data, so edits to a later result cannot alter an export. */
export interface ReportSpectrumModel {
  readonly hz: readonly number[];
  readonly powerDb: readonly number[];
  readonly origin: string;
  readonly units: string;
  readonly bandHz: readonly [number, number];
  readonly binSpacingHz: number | null;
  readonly frameCount: number;
  readonly peakHz: number | null;
  readonly status: 'available' | 'limited' | 'unavailable';
  readonly explanation: string;
}

export function buildReportSpectrum(result: AnalysisResult, origin: string): ReportSpectrumModel {
  const hz = Object.freeze([...result.spectrum.hz]);
  const powerDb = Object.freeze([...result.spectrum.powerDb]);
  const bandHz = Object.freeze([...result.analyzedBandHz]) as readonly [number, number];
  const spacing = result.sampleRateHz / result.fftSize;
  const binSpacingHz = Number.isFinite(spacing) && spacing > 0 ? spacing : null;
  let status: ReportSpectrumModel['status'] = 'available';
  let explanation = 'Averaged one-sided spectrum from this analyzed input. It does not identify a sound source.';
  const invalidData = !Number.isFinite(bandHz[0]) || !Number.isFinite(bandHz[1])
    || bandHz[0] <= 0 || bandHz[1] <= bandHz[0] || !binSpacingHz || !Number.isFinite(result.frameCount)
    || hz.length !== powerDb.length || hz.some((value, i) => !Number.isFinite(value) || value < 0 || (i > 0 && value <= hz[i - 1]))
    || powerDb.some(value => !Number.isFinite(value));
  const usableBins = hz.filter(value => value >= bandHz[0] && value <= bandHz[1]).length;
  if (result.qualityCodes.includes('non-finite') || invalidData) {
    status = 'unavailable';
    explanation = 'No usable spectrum: invalid numerical input or spectrum metadata. The missing graph is not a negative finding.';
  } else if (result.qualityCodes.includes('near-zero')) {
    status = 'unavailable';
    explanation = 'No usable spectrum: the captured input was near zero. A device-missed or intermittent sound is not ruled out.';
  } else if (result.qualityCodes.includes('unsupported-rate')) {
    status = 'unavailable';
    explanation = 'No usable spectrum: this effective sample rate is unsupported by the screening analysis.';
  } else if (usableBins < 2 || result.frameCount < 1) {
    status = 'unavailable';
    explanation = 'No usable spectrum is available for this input. The graph requires complete analysis frames and at least two finite bins in the analyzed band.';
  } else if (result.qualityCodes.includes('clipped')) {
    status = 'limited';
    explanation = 'Clipped input: this spectrum includes overload distortion. Indicators are inconclusive; no reliable peak candidate is labeled. Retry at a lower input level.';
  } else if (result.qualityCodes.includes('incomplete') || result.qualityCodes.includes('no-band-power')) {
    status = 'limited';
    explanation = 'Limited input: the capture was incomplete or its band power was unavailable. The displayed bins do not establish a reliable screening result.';
  }
  const candidate = result.peakCandidate?.centerHz;
  const peakHz = status === 'available' && candidate !== undefined && Number.isFinite(candidate)
    && candidate >= bandHz[0] && candidate <= bandHz[1] ? candidate : null;
  return Object.freeze({ hz, powerDb, origin, units: REPORT_SPECTRUM_UNITS, bandHz, binSpacingHz,
    frameCount: result.frameCount, peakHz, status, explanation });
}

export function reportFrequencyLabel(hz: number): string {
  return hz >= 1000 ? `${Number((hz / 1000).toFixed(2))}k` : String(Number(hz.toFixed(2)));
}

export function reportFrequencyX(hz: number, bandHz: readonly [number, number]): number {
  return REPORT_PLOT.left + Math.log(hz / bandHz[0]) / Math.log(bandHz[1] / bandHz[0]) * REPORT_PLOT.width;
}

/** Pixel reduction keeps each column's highest actual bin at its actual frequency. */
export function plotReportSpectrum(spectrum: ReportSpectrumModel) {
  if (spectrum.status === 'unavailable') return null;
  const columns = new Map<number, { hz: number; db: number; x: number }>();
  spectrum.hz.forEach((hz, index) => {
    if (hz < spectrum.bandHz[0] || hz > spectrum.bandHz[1]) return;
    const db = spectrum.powerDb[index];
    const x = reportFrequencyX(hz, spectrum.bandHz);
    const column = Math.round(x);
    if (!columns.has(column) || columns.get(column)!.db < db) columns.set(column, { hz, db, x });
  });
  const bins = [...columns.values()];
  if (!bins.length) return null;
  const highDb = Math.ceil(Math.max(...bins.map(bin => bin.db)) / 20) * 20;
  const lowDb = highDb - 100;
  const y = (db: number) => REPORT_PLOT.top + REPORT_PLOT.height * (highDb - Math.max(lowDb, Math.min(highDb, db))) / 100;
  const points = bins.map(bin => Object.freeze({ ...bin, y: y(bin.db) }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const standardTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const tickValues = [...new Set([spectrum.bandHz[0], ...standardTicks.filter(hz => hz > spectrum.bandHz[0] && hz < spectrum.bandHz[1]), spectrum.bandHz[1]])];
  const xTicks = tickValues.map(hz => Object.freeze({ hz, x: reportFrequencyX(hz, spectrum.bandHz), label: reportFrequencyLabel(hz) }));
  const yTicks = Array.from({ length: 6 }, (_, index) => Object.freeze({ db: highDb - index * 20, y: REPORT_PLOT.top + index * REPORT_PLOT.height / 5 }));
  const peak = spectrum.peakHz === null ? null : Object.freeze({ x: reportFrequencyX(spectrum.peakHz, spectrum.bandHz), label: `Peak candidate ≈${spectrum.peakHz.toFixed(1)} Hz` });
  return Object.freeze({ points: Object.freeze(points), line, xTicks: Object.freeze(xTicks), yTicks: Object.freeze(yTicks), highDb, lowDb, peak });
}

export function reportSpectrumText(spectrum: ReportSpectrumModel): string[] {
  const [lowHz, highHz] = spectrum.bandHz;
  const band = Number.isFinite(lowHz) && Number.isFinite(highHz) && lowHz > 0 && highHz > lowHz
    ? `${lowHz}–${highHz} Hz` : 'unavailable';
  const frames = Number.isInteger(spectrum.frameCount) && spectrum.frameCount >= 0
    ? String(spectrum.frameCount) : 'unavailable';
  return [
    'Captured frequency spectrum — summary',
    `Spectrum origin: ${spectrum.origin}`,
    `Spectrum units: ${spectrum.units} (10 log10(digital amplitude² / Hz), relative to 1²/Hz)`,
    `Spectrum band: ${band}`,
    `Spectrum bin spacing: ${spectrum.binSpacingHz?.toFixed(3) ?? 'unavailable'} Hz; ${frames} complete frames`,
    `Spectrum quality: ${spectrum.status}`,
    spectrum.peakHz === null ? 'No reliable sustained peak candidate labeled.' : `Approximate peak candidate: ${spectrum.peakHz.toFixed(1)} Hz`,
    spectrum.explanation,
    'The visual spectrum is included in the browser report and Print / save PDF. This text summary omits individual frequency/power bins.',
    '',
  ];
}
