import { describe, expect, it } from 'vitest';
import { analyzePcm } from '../src/analysis/engine';
import { generateFixture, syntheticMeta } from '../src/analysis/fixtures';
import { approximateCommunityCoordinates, makeCommunityDraft } from '../src/components/communityMapDraft';
import type { AnalysisResult } from '../src/types';

const base = analyzePcm(generateFixture('sine-1000', 48000), 48000, syntheticMeta('sine-1000'));
const microphone = (changes: Partial<AnalysisResult> = {}): AnalysisResult => ({ ...base, inputKind: 'microphone', fixtureId: null, recordedAtUtc: '2026-10-18T18:00:00.000Z', ...changes });
const options = { latitude: '39.0438123', longitude: '-77.4874123', label: 'Public courtyard', note: 'A recurring sound during this capture.', consent: true, nearbyFacility: null };

describe('explicit community sharing draft', () => {
  it('rounds the recording location before transport and rejects invalid coordinates', () => {
    expect(approximateCommunityCoordinates(options.latitude, options.longitude)).toEqual({ latitude: 39.044, longitude: -77.487 });
    for (const coords of [['', '0'], ['91', '0'], ['0', '181'], ['Infinity', '0']]) expect(() => approximateCommunityCoordinates(...coords as [string, string])).toThrow();
  });

  it('allows only an explicitly confirmed live microphone result and public text', () => {
    expect(() => makeCommunityDraft(base, options)).toThrow(/live microphone/);
    expect(() => makeCommunityDraft(microphone({ inputKind: 'imported-file' }), options)).toThrow(/live microphone/);
    expect(() => makeCommunityDraft(microphone(), { ...options, consent: false })).toThrow(/confirm public/);
    expect(() => makeCommunityDraft(microphone({ recordedAtUtc: null }), options)).toThrow(/timestamp/);
    expect(() => makeCommunityDraft(microphone({ durationSeconds: 4 }), options)).toThrow(/complete supported/);
    expect(() => makeCommunityDraft(microphone(), { ...options, label: '' })).toThrow(/public label/);
    expect(() => makeCommunityDraft(microphone(), { ...options, note: 'x'.repeat(281) })).toThrow(/280/);
  });

  it('uses a narrow allowlist without microphone settings, spectrum, AI or private context', () => {
    const draft = makeCommunityDraft(microphone({ inputLabel: 'Private device name', deviceSettings: { deviceId: 'private-device' } }), options);
    expect(draft.coordinates).toEqual({ latitude: 39.044, longitude: -77.487 });
    expect(draft.label).toBe('Public courtyard');
    expect(draft.capturedAtUtc).toBe('2026-10-18T18:00:00.000Z');
    expect(draft).not.toHaveProperty('deviceSettings');
    expect(draft).not.toHaveProperty('inputLabel');
    expect(draft).not.toHaveProperty('spectrum');
    expect(draft).not.toHaveProperty('analysisCreatedUtc');
    expect(draft).not.toHaveProperty('id');
    expect(JSON.stringify(draft)).not.toContain('private-device');
  });

  it('shares quality-blocked input descriptively, preserving actual zero analyzed frames', () => {
    const silence = analyzePcm(new Float32Array(240000), 48000, { ...syntheticMeta('silence'), inputKind: 'microphone', recordedAtUtc: '2026-10-18T18:00:00.000Z' });
    const draft = makeCommunityDraft(silence, options);
    expect(draft.qualityCodes).toContain('near-zero');
    expect(draft.frameCount).toBe(0);
    expect([draft.aDigitalDb, draft.cDigitalDb, draft.cMinusADb]).toEqual([null, null, null]);
    const invalid = makeCommunityDraft(microphone({ qualityCodes: ['near-full-scale'] }), options);
    expect([invalid.aDigitalDb, invalid.cDigitalDb, invalid.cMinusADb]).toEqual([null, null, null]);
  });

  it('keeps a facility reference separate from the approximate recording location', () => {
    const nearbyFacility = { osmType: 'way' as const, osmId: '1234', name: 'Mapped facility' };
    const draft = makeCommunityDraft(microphone(), { ...options, nearbyFacility });
    expect(draft.nearbyFacility).toEqual(nearbyFacility);
    expect(draft.nearbyFacility).not.toHaveProperty('coordinates');
    expect(draft.coordinates).toEqual({ latitude: 39.044, longitude: -77.487 });
    expect(draft.nearbyFacility).not.toBe(nearbyFacility);
  });
});
