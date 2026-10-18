import { describe, expect, it } from 'vitest';
import { CASES_SESSION_KEY, emptyCasesSession, readCasesSession, validCasesSession, writeCasesSession } from '../src/community/casesSession';
import type { CasesSession } from '../src/community/casesSession';

const id = '12345678-1234-4234-8234-123456789abc';
const observationId = '12345678-1234-4234-8234-123456789abd';
function state(): CasesSession { return {
  version: 1,
  removal: [{ case: { id, title: 'Evening neighborhood check-in' }, deleteToken: 'a'.repeat(43) }],
  pending: { key: id, draft: { schemaVersion: 1, title: 'Evening neighborhood check-in', neighborhood: 'Ashburn', description: 'Public context only.', coordinates: { latitude: 39.044, longitude: -77.487 }, radiusKm: 2, consent: true, website: '' } },
  contribution: { caseId: id, observationId, resultId: 'capture-1', publicationKey: null, attached: false },
}; }

describe('bounded case ownership and explicit recovery state', () => {
  it('round-trips reviewed public creation and attachment progress without audio, private notes or observation tokens', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    expect(writeCasesSession(storage, state())).toBe(true);
    expect(readCasesSession(storage)).toEqual(state());
    expect(data.has(CASES_SESSION_KEY)).toBe(true);
    expect(readCasesSession(storage).contribution).not.toHaveProperty('deleteToken');
  });
  it('rejects private extras, overprecise locations, changed consent, invalid capabilities and unbounded ownership', () => {
    const changes: Array<(v: CasesSession) => void> = [
      v => { Object.assign(v, { audio: 'private' }); },
      v => { Object.assign(v.pending!.draft, { privateContext: 'private' }); },
      v => { v.pending!.draft.coordinates.latitude = 39.044123; },
      v => { Object.assign(v.pending!.draft, { consent: false }); },
      v => { v.pending!.draft.radiusKm = 26; },
      v => { v.pending!.draft.radiusKm = NaN; },
      v => { v.pending!.key = 'not-a-uuid'; },
      v => { v.removal[0].deleteToken = 'wrong'; },
      v => { v.removal = Array.from({ length: 21 }, () => v.removal[0]); },
      v => { v.removal.push(v.removal[0]); },
      v => { Object.assign(v.contribution!, { deleteToken: 'private' }); },
      v => { v.contribution!.publicationKey = id; },
      v => { v.contribution!.observationId = null; v.contribution!.attached = true; },
    ];
    for (const change of changes) { const value = state(); change(value); expect(validCasesSession(value)).toBe(false);
      expect(readCasesSession({ getItem: () => JSON.stringify(value) })).toEqual(emptyCasesSession()); }
  });
  it('accepts unresolved publication recovery and fails safely for corrupt or unavailable storage', () => {
    const value = state(); value.contribution!.observationId = null; value.contribution!.publicationKey = id;
    expect(validCasesSession(value)).toBe(true);
    expect(readCasesSession(null)).toEqual(emptyCasesSession());
    expect(readCasesSession({ getItem: () => '{broken' })).toEqual(emptyCasesSession());
    expect(readCasesSession({ getItem: () => 'x'.repeat(32769) })).toEqual(emptyCasesSession());
    expect(writeCasesSession(null, value)).toBe(false);
    expect(writeCasesSession({ setItem: () => { throw new Error('blocked'); } }, value)).toBe(false);
  });
});
