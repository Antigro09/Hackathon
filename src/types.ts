export type InputKind = 'microphone' | 'imported-file' | 'synthetic';
export type Screen = 'suggested' | 'not-indicated' | 'inconclusive';
export type QualityCode = 'near-zero' | 'clipped' | 'near-full-scale' | 'incomplete'
  | 'unsupported-rate' | 'processing-active' | 'processing-unknown'
  | 'imported-processing-unknown' | 'non-finite' | 'no-band-power';

export interface InputMeta {
  inputKind: InputKind;
  fixtureId: string | null;
  recordedAtUtc: string | null;
  channelPolicy: 'mono-capture' | 'first-channel';
  deviceSettings: Record<string, unknown> | null;
  qualityCodes?: QualityCode[];
  inputLabel?: string;
}

export interface AnalysisResult {
  id: string;
  algorithmVersion: string;
  inputKind: InputKind;
  fixtureId: string | null;
  inputLabel?: string;
  analysisCreatedUtc: string;
  recordedAtUtc: string | null;
  sampleRateHz: number;
  sampleCount: number;
  durationSeconds: number;
  channelPolicy: 'mono-capture' | 'first-channel';
  fftSize: number;
  hopSize: number;
  analyzedBandHz: [number, number];
  frameCount: number;
  aDigitalDb: number | null;
  cDigitalDb: number | null;
  cMinusADb: number | null;
  lowFrequencyScreen: Screen;
  peakScreen: Screen | 'not-evaluated';
  peakCandidate: null | { centerHz: number; prominenceDb: number; persistentFrameFraction: number };
  qualityCodes: QualityCode[];
  deviceSettings: Record<string, unknown> | null;
  spectrum: { hz: number[]; powerDb: number[] };
}

export interface ObservationContext {
  jurisdiction: 'loudoun' | 'prince-william' | 'unknown-other';
  locationDescription: string;
  environment: 'indoors' | 'outdoors' | 'unknown';
  recurrenceNotes: string;
  conditionsNotes: string;
  suspectedSourceNotes: string;
}

export interface AnalysisRequest { sessionId: number; pcm: Float32Array; fs: number; meta: InputMeta }
export type AnalysisResponse = { sessionId: number; result: AnalysisResult } | { sessionId: number; error: string };
