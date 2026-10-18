import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCaseActionWorkflow, isCaseActionWorkflow, updateCaseActionWorkflow } from '../src/community/caseWorkflowClient';
import { EMPTY_CASE_ACTION } from '../src/community/caseWorkflowTypes';
import type { CaseActionWorkflow } from '../src/community/caseWorkflowTypes';
const caseId = 'a1111111-1111-4111-8111-111111111111';
const requestId = 'b2222222-2222-4222-8222-222222222222';
const token = 'X'.repeat(43);
const workflow = (): CaseActionWorkflow => {
  const entry = { ...EMPTY_CASE_ACTION, revision: 1, updatedAtUtc: '2026-10-18T20:00:00.000Z', provenance: 'organizer-self-reported' as const };
  return { schemaVersion: 1, caseId, revision: 1, current: entry, history: [entry] };
};
const response = (body: unknown, status = 200) => { const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status })); vi.stubGlobal('fetch', fetcher); return fetcher; };
afterEach(() => vi.unstubAllGlobals());
describe('shared intervention workflow client', () => {
  it('accepts bounded self-reported history and rejects forged claims and inconsistent revisions', () => {
    expect(isCaseActionWorkflow(workflow())).toBe(true);
    for (const bad of [{ ...workflow(), revision: 2 }, { ...workflow(), history: [] }, { ...workflow(), history: Array(21).fill(workflow().current) },
      { ...workflow(), current: { ...workflow().current, provenance: 'operator-verified' } }, { ...workflow(), deleteToken: token }]) expect(isCaseActionWorkflow(bad)).toBe(false);
  });
  it('fetches the separate public workflow without a private owner token', async () => {
    const fetcher = response({ workflow: null }); expect(await getCaseActionWorkflow(caseId)).toEqual({ workflow: null });
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/cases?id=${caseId}&workflow=1`);
  });
  it('rejects another case identity in a successful response', async () => {
    response({ workflow: { ...workflow(), caseId: requestId } }); await expect(getCaseActionWorkflow(caseId)).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it('projects only reviewed fields and sends owner proof in the request body', async () => {
    const fetcher = response({ workflow: workflow() });
    await updateCaseActionWorkflow(caseId, token, { ...EMPTY_CASE_ACTION, actionDescription: ' Reviewed maintenance request ', audio: 'private' } as typeof EMPTY_CASE_ACTION, 0, requestId);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cases'); expect(url).not.toContain(token);
    const body = JSON.parse(String(init.body)); expect(body.deleteToken).toBe(token); expect(body.requestId).toBe(requestId); expect(body.expectedRevision).toBe(0);
    expect(body.draft.actionDescription).toBe('Reviewed maintenance request'); expect(body.draft).not.toHaveProperty('audio');
  });
  it('preserves revision conflict information for an explicit review and retry', async () => {
    response({ error: { code: 'workflow-conflict', message: 'A newer action update exists.' } }, 409);
    await expect(updateCaseActionWorkflow(caseId, token, EMPTY_CASE_ACTION, 0, requestId)).rejects.toMatchObject({ status: 409, code: 'workflow-conflict' });
  });
});
