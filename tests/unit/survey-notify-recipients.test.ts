/**
 * PUX-084 — resolveSurveyRecipients.
 *
 * This function is the tenancy boundary for survey notifications: it is the only
 * place stored user ids become email addresses, and it re-checks membership on
 * every send rather than trusting what was written. These tests pin that
 * behaviour, because the failure mode it prevents is silent — a stale or
 * cross-tenant id would otherwise route one client's survey responses (which can
 * carry PII) to someone outside that account.
 *
 * The db mock mirrors the `selectQueue` shape used in lib-misc-batch-37b.test.ts:
 * each `db.select()` shifts one queued result, so a test asserts the query
 * SEQUENCE as much as the return value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface SelectChainResult {
  rows: Record<string, unknown>[];
}

const dbMockState = {
  selectQueue: [] as SelectChainResult[],
  selectCount: 0,
};

function makeSelectChain() {
  dbMockState.selectCount += 1;
  const rows = dbMockState.selectQueue.shift()?.rows ?? [];
  const chain: Record<string, unknown> = {};
  for (const k of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy']) {
    chain[k] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(async () => rows);
  (chain as { then?: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled);
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn(() => makeSelectChain()) },
}));

vi.mock('@/lib/email', () => ({ resend: { emails: { send: vi.fn() } } }));

async function subject() {
  const mod = await import('@/lib/automation/survey-notifications');
  return mod.resolveSurveyRecipients;
}

describe('resolveSurveyRecipients @surveys', () => {
  beforeEach(() => {
    dbMockState.selectQueue = [];
    dbMockState.selectCount = 0;
  });

  it('falls back to the client owner when no recipients are configured', async () => {
    // Empty list must not even query membership — it goes straight to the owner,
    // which is what every survey did before notify_user_ids existed.
    dbMockState.selectQueue.push({ rows: [{ email: 'owner@example.com' }] });

    const resolve = await subject();
    expect(await resolve(7, [])).toEqual(['owner@example.com']);
    expect(dbMockState.selectCount).toBe(1);
  });

  it('treats a null list the same as an empty one', async () => {
    dbMockState.selectQueue.push({ rows: [{ email: 'owner@example.com' }] });

    const resolve = await subject();
    expect(await resolve(7, null)).toEqual(['owner@example.com']);
  });

  it('resolves configured member ids to their addresses', async () => {
    dbMockState.selectQueue.push({
      rows: [{ email: 'sam@example.com' }, { email: 'alex@example.com' }],
    });

    const resolve = await subject();
    expect(await resolve(7, [11, 12])).toEqual(['sam@example.com', 'alex@example.com']);
    // Membership resolved, so the owner lookup must NOT run.
    expect(dbMockState.selectCount).toBe(1);
  });

  it('falls back to the owner when every configured id fails to resolve', async () => {
    // This is the revoked-membership and cross-tenant case: the ids are stored,
    // but the clientId-scoped join returns nothing for them. Losing the
    // notification entirely would be worse than surprising the owner with it.
    dbMockState.selectQueue.push({ rows: [] });
    dbMockState.selectQueue.push({ rows: [{ email: 'owner@example.com' }] });

    const resolve = await subject();
    expect(await resolve(7, [999])).toEqual(['owner@example.com']);
    expect(dbMockState.selectCount).toBe(2);
  });

  it('drops non-integer ids before querying', async () => {
    // A junk-only list must behave like an empty one — no membership query.
    dbMockState.selectQueue.push({ rows: [{ email: 'owner@example.com' }] });

    const resolve = await subject();
    const junk = ['3', 1.5, null, undefined, NaN] as unknown as number[];
    expect(await resolve(7, junk)).toEqual(['owner@example.com']);
    expect(dbMockState.selectCount).toBe(1);
  });

  it('returns nothing when even the owner has no address', async () => {
    // Caller must skip the send rather than call the email API with an empty list.
    dbMockState.selectQueue.push({ rows: [] });
    dbMockState.selectQueue.push({ rows: [] });

    const resolve = await subject();
    expect(await resolve(7, [11])).toEqual([]);
  });
});
