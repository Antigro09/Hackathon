import type { AnalysisResult, ObservationContext, QualityCode } from '../types';

export type Jurisdiction = ObservationContext['jurisdiction'];

export interface ReferenceSource {
  readonly id: string;
  readonly jurisdiction: Jurisdiction;
  readonly title: string;
  readonly summary: string;
  readonly url: string;
  /** Content independently retrieved during this build; null when access failed. */
  readonly verifiedAt: string | null;
  readonly lastReviewedAt: string;
  readonly scopeNote: string;
  readonly status: 'verified' | 'access-limited';
}

export interface ReferenceProfile {
  readonly id: string;
  readonly jurisdiction: Jurisdiction;
  readonly title: string;
  readonly summary: string;
  readonly scopeNote: string;
  readonly sources: readonly ReferenceSource[];
}

const reviewed = '2026-10-18';
const sourceList: ReferenceSource[] = [
  {
    id: 'loudoun-noise', jurisdiction: 'loudoun',
    title: 'Loudoun County: Noise & Air Quality Concerns',
    summary: 'The county identifies a gap in provisions specific to tonal and low-frequency noise and anticipates amendments in spring or summer 2027. That timing is a planning expectation.',
    url: 'https://www.loudoun.gov/6405/Noise-Air-Quality-Concerns',
    verifiedAt: reviewed, lastReviewedAt: reviewed, status: 'verified',
    scopeNote: 'A-weighting de-emphasizes bass; it does not make bass unmeasurable. A proposed amendment is not an enacted requirement.',
  },
  {
    id: 'loudoun-code', jurisdiction: 'loudoun', title: 'Loudoun County zoning ordinance §7.05.03: Noise',
    summary: 'Consult the full current section for receiving-development limits, formal measurement procedure, exemptions and noise-study requirements.',
    url: 'https://online.encodeplus.com/regs/loudouncounty-va-crosswalk/doc-viewer.aspx?secid=1320',
    verifiedAt: null, lastReviewedAt: reviewed, status: 'access-limited',
    scopeNote: 'The dynamic code viewer could not be independently read during this build. Detailed legal thresholds are not reproduced here. Confirm current text and property applicability with county staff.',
  },
  {
    id: 'loudoun-applicability', jurisdiction: 'loudoun', title: 'Loudoun County: Zoning Ordinance applicability',
    summary: 'Vested rights, some Route 28 properties and grandfathered applications can affect which ordinance applies. Incorporated towns have their own zoning ordinances.',
    url: 'https://www.loudoun.gov/zoningordinance',
    verifiedAt: reviewed, lastReviewedAt: reviewed, status: 'verified',
    scopeNote: 'A county selection cannot determine the requirements governing an individual property.',
  },
  {
    id: 'loudoun-routing', jurisdiction: 'loudoun', title: 'Loudoun Express Request: noise routing and privacy',
    summary: 'County guidance distinguishes recurring noise at the receiving lot line from noise heard inside with doors and windows closed. Public requests can display a username and map pin; review the private-request option.',
    url: 'https://www.loudoun.gov/LEX',
    verifiedAt: reviewed, lastReviewedAt: reviewed, status: 'verified',
    scopeNote: 'Read the guidance to choose the appropriate channel. TonalWatch does not submit requests.',
  },
  {
    id: 'pwc-guidance', jurisdiction: 'prince-william', title: 'Prince William County: Steady Tonal Noise',
    summary: 'County guidance describes Chapter 14 changes effective May 1, 2026, directs steady-tonal concerns to PWC311, and specifies Type 1 sound meters for official inspections.',
    url: 'https://pwcaws.pwcva.gov/department/public-works/steady-tonal-noise',
    verifiedAt: reviewed, lastReviewedAt: reviewed, status: 'verified',
    scopeNote: 'The county requires contact information for these complaints. Review its current instructions; this browser screen cannot establish the legal steady-tonal definition.',
  },
  {
    id: 'pwc-definitions', jurisdiction: 'prince-william', title: 'Prince William County §14-3: Definitions',
    summary: 'Official definitions, including time periods and steady-tonal sound, must be read with the full ordinance.',
    url: 'https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-3DE',
    verifiedAt: null, lastReviewedAt: reviewed, status: 'access-limited',
    scopeNote: 'The full code text could not be independently retrieved during this build. The experimental peak screen does not implement this definition.',
  },
  {
    id: 'pwc-levels', jurisdiction: 'prince-william', title: 'Prince William County §14-4: Maximum permissible sound levels',
    summary: 'Consult the current section for A/C-weighted sound limits, receiving-property conditions and exceptions.',
    url: 'https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-4MAPESOLE',
    verifiedAt: null, lastReviewedAt: reviewed, status: 'access-limited',
    scopeNote: 'The full code text could not be independently retrieved during this build. No ordinance threshold is applied to uncalibrated digital values.',
  },
  {
    id: 'pwc-measurement', jurisdiction: 'prince-william', title: 'Prince William County §14-7: Measurement procedures',
    summary: 'Consult the current official procedure for source assessment and formal measurement requirements.',
    url: 'https://library.municode.com/va/prince_william_county/codes/code_of_ordinances?nodeId=CH14NO_S14-7MEPR',
    verifiedAt: null, lastReviewedAt: reviewed, status: 'access-limited',
    scopeNote: 'The full code text could not be independently retrieved during this build. A short browser analysis does not reproduce the county procedure.',
  },
  {
    id: 'pwc-adoption', jurisdiction: 'prince-william', title: 'Prince William County: signed Ordinance 25-62',
    summary: 'Signed ordinance supplied in the planning source ledger. Use the current code and county guidance to confirm amendments and applicability.',
    url: 'https://pwcgov.granicus.com/services/legistar/download/pdf/4103722/Ord._No._25-62.pdf',
    verifiedAt: null, lastReviewedAt: reviewed, status: 'access-limited',
    scopeNote: 'The signed PDF could not be independently retrieved during this build. Adoption details from the plan are not presented as newly verified facts.',
  },
];

export const sources: readonly ReferenceSource[] = Object.freeze(sourceList.map(source => Object.freeze(source)));

export const referenceProfiles: Readonly<Record<Jurisdiction, ReferenceProfile>> = Object.freeze({
  loudoun: Object.freeze({
    id: 'loudoun-context-2026-10-18', jurisdiction: 'loudoun', title: 'Loudoun County, Virginia',
    summary: 'Informational county context. Confirm the governing ordinance, property approvals, exemptions and measurement requirements with the responsible agency.',
    scopeNote: 'No property-specific legal applicability was evaluated. Prince William standards do not automatically govern a Loudoun observation.',
    sources: Object.freeze(sources.filter(source => source.jurisdiction === 'loudoun')),
  }),
  'prince-william': Object.freeze({
    id: 'prince-william-context-2026-10-18', jurisdiction: 'prince-william', title: 'Prince William County, Virginia',
    summary: 'Informational county context. Official guidance covers steady-tonal noise under Chapter 14 as modified effective May 1, 2026. Confirm the full code and exceptions before relying on it.',
    scopeNote: 'The experimental sustained-peak screen is not the county’s legal steady-tonal definition. No compliance comparison is made.',
    sources: Object.freeze(sources.filter(source => source.jurisdiction === 'prince-william')),
  }),
  'unknown-other': Object.freeze({
    id: 'unknown-jurisdiction', jurisdiction: 'unknown-other', title: 'Unknown / other jurisdiction',
    summary: 'Jurisdiction and legal applicability were not evaluated. Ask the relevant local agency which rules and formal measurement procedure apply.',
    scopeNote: 'Neither Loudoun nor Prince William references are assumed to govern this observation.',
    sources: Object.freeze([]),
  }),
});

export const methodLimitations: readonly string[] = Object.freeze([
  'Uncalibrated screening only. No source identification or legal-compliance determination.',
  'These are weighted digital levels relative to RMS 1, not calibrated dBA/dBC sound-pressure levels. Device response, filtering, gain changes, noise suppression and compression can alter the captured spectrum.',
  'A short recording may miss intermittent or recurring sound. A weak or inconclusive indicator does not invalidate a descriptive observation.',
  'Ambient sources such as traffic, speech, wind and room effects are not separated from a suspected source.',
  'This prototype is not a certified sound-level meter or a standardized tonality assessment. It does not replicate either county’s prescribed measurement procedure.',
  'A common constant gain cancels in C−A; frequency-dependent response, processing and clipping do not.',
]);

export const qualityDescriptions: Readonly<Record<QualityCode, string>> = Object.freeze({
  'near-zero': 'Near-zero digital input; indicators are inconclusive.',
  clipped: 'Clipped input; distortion makes indicators inconclusive.',
  'near-full-scale': 'Input approached full scale; inspect for distortion.',
  incomplete: 'Capture was incomplete or interrupted; indicators are inconclusive.',
  'unsupported-rate': 'Effective sample rate is outside the tested 44.1 / 48 kHz rates.',
  'processing-active': 'At least one browser processing setting is active; the spectrum may be reshaped.',
  'processing-unknown': 'Browser/device processing could not be established.',
  'imported-processing-unknown': 'Original recording time, calibration and processing of the imported audio are not established.',
  'non-finite': 'Invalid numerical samples; indicators are inconclusive.',
  'no-band-power': 'No usable power remains in the analyzed band; indicators are inconclusive.',
});

export function interpretResult(result: AnalysisResult): string {
  if (result.lowFrequencyScreen === 'inconclusive') {
    return 'Recording is inconclusive. You can retry or export a descriptive observation.';
  }
  const largeGap = result.lowFrequencyScreen === 'suggested';
  if (result.peakScreen === 'not-evaluated') {
    return `${largeGap ? 'Low-frequency contribution suggested. This does not by itself indicate a tone.' : 'The C−A difference is below this prototype’s bass-screen threshold. This does not rule out recurring or device-missed noise.'} Sustained-peak analysis was not evaluated.`;
  }
  if (result.peakScreen === 'inconclusive') {
    return `${largeGap ? 'Low-frequency contribution suggested. This does not by itself indicate a tone.' : 'The C−A difference is below this prototype’s bass-screen threshold.'} The sustained-peak result is inconclusive.`;
  }
  if (result.peakScreen === 'suggested') {
    return largeGap
      ? 'Low-frequency contribution suggested; a sustained narrowband peak is also present in this recording.'
      : 'A sustained narrowband peak is present; the C−A difference is below this prototype’s bass-screen threshold.';
  }
  return largeGap
    ? 'Low-frequency contribution suggested. This does not by itself indicate a tone.'
    : 'Neither indicator was strong in this short recording. This does not rule out recurring or device-missed noise.';
}
