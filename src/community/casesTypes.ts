import type { CommunityCoordinates, CommunityFeedQuery, CommunityObservation } from './types';

/** A public resident-organized case, not a verified physical source or official complaint. */
export interface NeighborhoodCase {
  schemaVersion: 1;
  id: string;
  title: string;
  neighborhood: string;
  description: string;
  coordinates: CommunityCoordinates;
  radiusKm: number;
  createdAtUtc: string;
  provenance: 'public-self-reported';
  verification: 'unverified';
  locationPrecision: 'rounded-3-decimals';
}

export interface NeighborhoodCaseDraft {
  schemaVersion: 1;
  title: string;
  neighborhood: string;
  description: string;
  coordinates: CommunityCoordinates;
  radiusKm: number;
  consent: true;
  website: '';
}

export interface NeighborhoodCaseCreateResult {
  case: NeighborhoodCase;
  deleteToken: string;
  replayed: boolean;
}

export type NeighborhoodCaseFeedQuery = CommunityFeedQuery;
export interface NeighborhoodCaseFeed {
  cases: NeighborhoodCase[];
  nextCursor: string | null;
  limit: number;
  scanned: number;
  notice: string;
}

/** Complete current linked observations, bounded to 200 per case; removed posts are omitted. */
export interface NeighborhoodCaseDetail {
  case: NeighborhoodCase;
  observations: CommunityObservation[];
  limit: 200;
  notice: string;
}

export interface NeighborhoodCaseAttachment {
  action: 'attach';
  caseId: string;
  observationId: string;
  deleteToken: string;
  consent: true;
  website: '';
}

export const CASE_OBSERVATION_LIMIT = 200;
export const CASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const caseHref = (id: string) => `#/cases/${id}`;
