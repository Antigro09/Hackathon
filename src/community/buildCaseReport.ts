import { qualityDescriptions, sources } from '../data/references';
import { soundHintsBlockedReason } from '../ai/policy';
import { isCommunityObservation } from './client';
import { isNeighborhoodCase } from './casesClient';
import { CASE_OBSERVATION_LIMIT, caseHref } from './casesTypes';
import type { NeighborhoodCase, NeighborhoodCaseDetail } from './casesTypes';
import type { CommunityObservation } from './types';
import type { QualityCode } from '../types';

export interface CaseReportOptions { caseUrl?: string; preparedAtUtc?: string; isExample?: boolean }
export interface CaseReportObservation {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly capturedAtUtc: string;
  readonly publishedAtUtc: string;
  readonly durationSeconds: number;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  readonly frameCount: number;
  readonly algorithmVersion: string;
  readonly qualityCodes: readonly QualityCode[];
  readonly numericEligible: boolean;
  readonly cMinusADb: number | null;
  readonly peakScreen: CommunityObservation['peakScreen'];
  readonly coordinates: { readonly latitude: number; readonly longitude: number };
  readonly nearbyFacility: CommunityObservation['nearbyFacility'];
}
export interface CaseReportModel {
  readonly caseId: string;
  readonly title: string;
  readonly neighborhood: string;
  readonly description: string;
  readonly area: { readonly latitude: number; readonly longitude: number; readonly radiusKm: number };
  readonly caseCreatedAtUtc: string;
  readonly preparedAtUtc: string | null;
  readonly caseUrl: string;
  readonly isExample: boolean;
  readonly observations: readonly CaseReportObservation[];
  readonly summary: {
    readonly observationCount: number;
    readonly distinctUtcDays: number;
    readonly firstCaptureUtc: string | null;
    readonly lastCaptureUtc: string | null;
    readonly flaggedObservationCount: number;
    readonly numericEligibleCount: number;
    readonly unusableNumbersCount: number;
    readonly peakSuggestedCount: number;
    readonly lowFrequencySuggestedCount: number;
  };
  readonly qualityCounts: readonly { readonly code: QualityCode; readonly description: string; readonly count: number }[];
  readonly duplicateCopiesRemoved: number;
  readonly followUpLinks: readonly { readonly county: string; readonly title: string; readonly url: string }[];
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (): never => { throw new Error('This community case could not be verified for a report. Refresh the case and try again.'); };
function utc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return fail();
  const normalized = new Date(value).toISOString();
  return normalized.slice(0, 19) === value.slice(0, 19) ? normalized : fail();
}

/** Explicit public-field projection prevents private session additions from entering exports. */
function publicCase(value: unknown): NeighborhoodCase {
  if (!object(value) || !object(value.coordinates)) return fail();
  const candidate = { schemaVersion: value.schemaVersion, id: value.id, title: value.title, neighborhood: value.neighborhood,
    description: value.description, coordinates: { latitude: value.coordinates.latitude, longitude: value.coordinates.longitude },
    radiusKm: value.radiusKm, createdAtUtc: value.createdAtUtc, provenance: value.provenance,
    verification: value.verification, locationPrecision: value.locationPrecision };
  return isNeighborhoodCase(candidate) ? candidate : fail();
}

function publicObservation(value: unknown): CommunityObservation {
  if (!object(value) || !object(value.coordinates)) return fail();
  const facility = value.nearbyFacility;
  const candidate = { schemaVersion: value.schemaVersion, inputKind: value.inputKind,
    coordinates: { latitude: value.coordinates.latitude, longitude: value.coordinates.longitude }, label: value.label, note: value.note,
    capturedAtUtc: value.capturedAtUtc, durationSeconds: value.durationSeconds, sampleRateHz: value.sampleRateHz,
    sampleCount: value.sampleCount, frameCount: value.frameCount, algorithmVersion: value.algorithmVersion,
    qualityCodes: Array.isArray(value.qualityCodes) ? [...value.qualityCodes] : value.qualityCodes,
    aDigitalDb: value.aDigitalDb, cDigitalDb: value.cDigitalDb, cMinusADb: value.cMinusADb, peakScreen: value.peakScreen,
    nearbyFacility: facility === null ? null : object(facility) ? { osmType: facility.osmType, osmId: facility.osmId, name: facility.name } : facility,
    id: value.id, publishedAtUtc: value.publishedAtUtc, provenance: value.provenance, verification: value.verification,
    locationPrecision: value.locationPrecision };
  return isCommunityObservation(candidate) ? candidate : fail();
}

function publicUrl(value: string | undefined, id: string): string {
  if (value === undefined || value === '') return caseHref(id);
  if (typeof value !== 'string' || value.length > 2048) return fail();
  let url: URL;
  try { url = new URL(value); } catch { return fail(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return fail();
  // A report route or stale hash becomes the public case route. Do not export query parameters.
  url.search = ''; url.hash = caseHref(id).slice(1);
  return url.href;
}

function observationSnapshot(source: CommunityObservation): CaseReportObservation {
  const numericEligible = soundHintsBlockedReason(source.qualityCodes) === null
    && [source.aDigitalDb, source.cDigitalDb, source.cMinusADb].every(value => typeof value === 'number' && Number.isFinite(value));
  return Object.freeze({ id: source.id, label: source.label, note: source.note,
    capturedAtUtc: utc(source.capturedAtUtc), publishedAtUtc: utc(source.publishedAtUtc),
    durationSeconds: source.durationSeconds, sampleRateHz: source.sampleRateHz, sampleCount: source.sampleCount,
    frameCount: source.frameCount, algorithmVersion: source.algorithmVersion, qualityCodes: Object.freeze([...source.qualityCodes]),
    numericEligible, cMinusADb: numericEligible ? source.cMinusADb : null, peakScreen: source.peakScreen,
    coordinates: Object.freeze({ latitude: source.coordinates.latitude, longitude: source.coordinates.longitude }),
    nearbyFacility: source.nearbyFacility ? Object.freeze({ osmType: source.nearbyFacility.osmType, osmId: source.nearbyFacility.osmId, name: source.nearbyFacility.name }) : null });
}

/** Pure current-snapshot report. Never queries storage, reads a clock or infers resident identity. */
export function buildCaseReport(detail: NeighborhoodCaseDetail, options: CaseReportOptions = {}): CaseReportModel {
  if (!object(detail) || detail.limit !== CASE_OBSERVATION_LIMIT || !Array.isArray(detail.observations)
    || detail.observations.length > CASE_OBSERVATION_LIMIT || typeof detail.notice !== 'string' || detail.notice.length > 1000) return fail();
  const neighborhoodCase = publicCase(detail.case);
  const unique = new Map<string, CommunityObservation>(); let duplicateCopiesRemoved = 0;
  for (const value of detail.observations) {
    const observation = publicObservation(value), prior = unique.get(observation.id);
    if (prior) {
      // Immutable public posts with conflicting values cannot safely be reconciled in a report.
      if (JSON.stringify(prior) !== JSON.stringify(observation)) return fail();
      duplicateCopiesRemoved += 1;
    } else unique.set(observation.id, observation);
  }
  const observations = [...unique.values()].map(observationSnapshot).sort((left, right) =>
    Date.parse(left.capturedAtUtc) - Date.parse(right.capturedAtUtc) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const qualityCounts = (Object.keys(qualityDescriptions) as QualityCode[]).flatMap(code => {
    const count = observations.filter(observation => observation.qualityCodes.includes(code)).length;
    return count ? [Object.freeze({ code, description: qualityDescriptions[code], count })] : [];
  });
  const numericEligibleCount = observations.filter(observation => observation.numericEligible).length;
  const followUpLinks = [
    { county: 'Loudoun County, Virginia', sourceId: 'loudoun-routing' },
    { county: 'Prince William County, Virginia', sourceId: 'pwc-guidance' },
  ].map(({ county, sourceId }) => {
    const source = sources.find(item => item.id === sourceId);
    if (!source) return fail();
    return Object.freeze({ county, title: source.title, url: source.url });
  });
  return Object.freeze({ caseId: neighborhoodCase.id, title: neighborhoodCase.title, neighborhood: neighborhoodCase.neighborhood,
    description: neighborhoodCase.description, area: Object.freeze({ ...neighborhoodCase.coordinates, radiusKm: neighborhoodCase.radiusKm }),
    caseCreatedAtUtc: utc(neighborhoodCase.createdAtUtc), preparedAtUtc: options.preparedAtUtc ? utc(options.preparedAtUtc) : null,
    caseUrl: publicUrl(options.caseUrl, neighborhoodCase.id), isExample: options.isExample === true,
    observations: Object.freeze(observations), summary: Object.freeze({ observationCount: observations.length,
      distinctUtcDays: new Set(observations.map(observation => observation.capturedAtUtc.slice(0, 10))).size,
      firstCaptureUtc: observations[0]?.capturedAtUtc ?? null, lastCaptureUtc: observations.at(-1)?.capturedAtUtc ?? null,
      flaggedObservationCount: observations.filter(observation => observation.qualityCodes.length > 0).length,
      numericEligibleCount, unusableNumbersCount: observations.length - numericEligibleCount,
      peakSuggestedCount: observations.filter(observation => observation.numericEligible && observation.peakScreen === 'suggested').length,
      lowFrequencySuggestedCount: observations.filter(observation => observation.numericEligible && observation.cMinusADb !== null && observation.cMinusADb >= 15).length }),
    qualityCounts: Object.freeze(qualityCounts), duplicateCopiesRemoved, followUpLinks: Object.freeze(followUpLinks) });
}

export const caseReportTime = (value: string | null): string => value ? `${value.slice(0, 10)} ${value.slice(11, 19)} UTC` : 'No captures in this snapshot';
export function caseReportPeak(observation: Pick<CaseReportObservation, 'numericEligible' | 'peakScreen'>): string {
  if (!observation.numericEligible) return 'Inconclusive: numeric screening excluded';
  return observation.peakScreen === 'suggested' ? 'Sustained-peak heuristic suggested'
    : observation.peakScreen === 'not-indicated' ? 'Sustained-peak heuristic not indicated'
      : observation.peakScreen === 'not-evaluated' ? 'Sustained-peak heuristic not evaluated' : 'Sustained-peak heuristic inconclusive';
}
const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** Concise text handoff: all-case totals, at most20 recent details and an explicit omission count. */
export function caseReportText(report: CaseReportModel): string {
  const summary = report.summary, recent = report.observations.slice(-20).reverse(), omitted = report.observations.length - recent.length;
  const lines = [report.isExample ? 'FICTIONAL EXAMPLE — NOT FIELD DATA' : 'TonalWatch community case — request for investigation',
    ...(report.isExample ? ['Demonstration only. Do not submit this fictional example as a real complaint.'] : []),
    oneLine(report.title), `Neighborhood (public user statement): ${oneLine(report.neighborhood)}`,
    `Public case: ${report.caseUrl}`, `Case ID: ${report.caseId}`,
    `Approximate area center: ${report.area.latitude.toFixed(3)}, ${report.area.longitude.toFixed(3)}; radius ${report.area.radiusKm} km. Rounded to 3 decimals; this is not a sound-source boundary.`,
    `Description (unverified public statement): ${oneLine(report.description) || 'Not provided.'}`,
    `Case created: ${caseReportTime(report.caseCreatedAtUtc)}`,
    ...(report.preparedAtUtc ? [`Report snapshot prepared: ${caseReportTime(report.preparedAtUtc)}. Preparation is not a capture time.`] : []), '',
    `CURRENT SNAPSHOT: ${summary.observationCount} observations across ${summary.distinctUtcDays} distinct UTC calendar days. Counts are observations, not people or households.`,
    `First capture: ${caseReportTime(summary.firstCaptureUtc)}; last capture: ${caseReportTime(summary.lastCaptureUtc)}. Device-clock timestamps are not authenticated.`,
    `${summary.flaggedObservationCount} observations have quality flags; ${summary.unusableNumbersCount} have unusable numeric screening.`,
    `${summary.numericEligibleCount} observations have available unblocked digital screening values; processing limitations can still apply.`,
    `Prototype suggestions among these ${summary.numericEligibleCount}: sustained peak ${summary.peakSuggestedCount}; C−A at least 15 dB ${summary.lowFrequencySuggestedCount}. These are independent suggestions, not source identification or official thresholds.`,
    'No uncalibrated dB values are averaged. These counts do not establish prevalence, independence, sound pressure, a data-center source or an ordinance violation.',
    ...report.qualityCounts.map(flag => `Quality flag ${flag.code}: ${flag.count} observation(s). ${flag.description}`),
    ...(report.duplicateCopiesRemoved ? [`${report.duplicateCopiesRemoved} identical duplicate copies were removed before counting.`] : []), '',
    'REQUEST: Please investigate the recurring sound described here, advise which agency and measurement procedure apply, and consider qualified acoustic review. Public statements and short browser captures have not been independently verified.',
    'Only current linked public observations supplied in this snapshot are included; removed posts are omitted. Refresh for a new snapshot. Locations are approximate and no source contribution is isolated.', '',
    `RECENT OBSERVATION DETAILS: ${recent.length} shown, newest capture first; ${omitted} older observation(s) omitted from this text summary. Print/save PDF includes the complete bounded timeline.`,
  ];
  for (const observation of recent) {
    lines.push(`- ${caseReportTime(observation.capturedAtUtc)} | ${oneLine(observation.label)} | ID ${observation.id}`,
      `  Public note (unverified): ${oneLine(observation.note) || 'No note shared.'}`,
      `  C−A: ${observation.cMinusADb === null ? 'unavailable' : `${observation.cMinusADb.toFixed(2)} dB (uncalibrated digital difference)`}; ${caseReportPeak(observation)}.`,
      `  Flags: ${observation.qualityCodes.join(', ') || 'none raised; not proof of accuracy'}. Capture: ${observation.durationSeconds} s, ${observation.sampleRateHz} Hz, ${observation.sampleCount} samples, ${observation.frameCount} frames; ${observation.algorithmVersion}.`,
      `  Published: ${caseReportTime(observation.publishedAtUtc)}; public self-reported, unverified; approximate recording location ${observation.coordinates.latitude.toFixed(3)}, ${observation.coordinates.longitude.toFixed(3)}.`,
      ...(observation.nearbyFacility ? [`  Optional nearby mapped reference: ${oneLine(observation.nearbyFacility.name)} (${observation.nearbyFacility.osmType}/${observation.nearbyFacility.osmId}); not an identified sound source.`] : []));
  }
  lines.push('', 'FOLLOW-UP: Choose the responsible jurisdiction; no county was inferred from the case area. TonalWatch does not submit a complaint.',
    ...report.followUpLinks.map(link => `${link.county}: ${link.title} — ${link.url}`),
    'Sources and method: open Sources & method in TonalWatch.',
    'This public-case report contains no audio, spectrum bins, private local notes, deletion tokens or optional AI results. Individual spectrum reports remain separate local exports.');
  return `${lines.join('\n')}\n`;
}
