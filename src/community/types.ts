import type { AnalysisResult, QualityCode } from '../types';

export interface CommunityCoordinates { latitude: number; longitude: number }
export interface CommunityFacilityReference {
  osmType: 'node' | 'way' | 'relation';
  osmId: string;
  name: string;
}
/** Public, self-reported metadata only. Never send audio, bins, AI, or private form context. */
export interface CommunityObservationDraft {
  schemaVersion: 1;
  consent: true;
  inputKind: 'microphone';
  coordinates: CommunityCoordinates;
  label: string;
  note: string;
  capturedAtUtc: string;
  durationSeconds: 5 | 15 | 30;
  sampleRateHz: 44100 | 48000;
  sampleCount: number;
  frameCount: number;
  algorithmVersion: 'tw-screen-v2';
  qualityCodes: QualityCode[];
  aDigitalDb: number | null;
  cDigitalDb: number | null;
  cMinusADb: number | null;
  peakScreen: AnalysisResult['peakScreen'];
  nearbyFacility: CommunityFacilityReference | null;
  website: '';
}
export interface CommunityObservation extends Omit<CommunityObservationDraft, 'consent' | 'website'> {
  id: string;
  publishedAtUtc: string;
  provenance: 'public-self-reported';
  verification: 'unverified';
  locationPrecision: 'rounded-3-decimals';
}
export interface CommunityFeedQuery {
  center?: CommunityCoordinates;
  radiusKm?: number;
  bbox?: { west: number; south: number; east: number; north: number };
  limit?: number;
  cursor?: string;
}
export interface CommunityFeed {
  observations: CommunityObservation[];
  nextCursor: string | null;
  limit: number;
  scanned: number;
  notice: string;
}
export interface CommunityPublishResult { observation: CommunityObservation; deleteToken: string; replayed: boolean }
export interface CommunityApiError { error: { code: string; message: string } }
