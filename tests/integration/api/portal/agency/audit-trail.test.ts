/**
 * Integration tests for the custom_domain_history audit trail @tenancy.
 *
 * Every domain mutation (added / verified / removed) is expected to land a
 * row in `custom_domain_history` with the right action and the acting user
 * id. This is the load-bearing tenancy guarantee: a security/admin reviewer
 * must be able to reconstruct every domain change for a client even after
 * the live `clients` row is updated, AND must NOT see another client's
 * history.
 *
 * Because the spec runs the full add → verify → remove cycle through real
 * route handlers, it doubles as a sanity check that the cache-invalidation
 * + transactional invariants hold end-to-end.
 *
 * `node:dns/promises` is mocked so the verify step deterministically
 * succeeds without hitting real DNS.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('node:dns/promises', () => {
  const resolveTxt = vi.fn();
  return {
    default: { resolveTxt },
    resolveTxt,
  };
});

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { resolveTxt } from 'node:dns/promises';
import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;
const mockedResolveTxt = vi.mocked(resolveTxt);

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import { clearCustomDomainCache } from '@/lib/agency/custom-domain';

interface CustomDomainData {
  customDomain: string | null;
  verificationRecord: { host: string; type: string; value: string } | null;
}

interface HistoryRow {
  id: number;
  client_id: number;
  domain: string;
  action: string;
  by_user_id: number | null;
}

async function readHistory(clientId: number): Promise<HistoryRow[]> {
  const sql = getTestSql();
  return sql<HistoryRow[]>`
    SELECT id, client_id, domain, action, by_user_id
    FROM ${sql(TEST_SCHEMA)}.custom_domain_history
    WHERE client_id = ${clientId}
    ORDER BY id ASC
  `;
}

async function readAllHistory(): Promise<HistoryRow[]> {
  const sql = getTestSql();
  return sql<HistoryRow[]>`
    SELECT id, client_id, domain, action, by_user_id
    FROM ${sql(TEST_SCHEMA)}.custom_domain_history
    ORDER BY id ASC
  `;
}

beforeEach(() => {
  mockedResolveTxt.mockReset();
  clearCustomDomainCache();
});

describe('agency custom-domain audit trail @tenancy', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('audit-a'); });

  it('inserts an "added" row on POST', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.audit-add.com' } },
    );
    expect(res.status).toBe(200);

    const history = await readHistory(A.client.id);
    expect(history.length).toBe(1);
    expect(history[0].action).toBe('added');
    expect(history[0].domain).toBe('portal.audit-add.com');
    expect(history[0].by_user_id).toBe(A.user.id);
  });

  it('inserts a "verified" row on successful /verify', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const cdRoute = await import('@/app/api/portal/agency/custom-domain/route');
    const verifyRoute = await import('@/app/api/portal/agency/custom-domain/verify/route');

    const post = await callHandler<{ success: boolean; data: CustomDomainData }>(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.audit-verify.com' } },
    );
    const token = post.data!.data.verificationRecord!.value;

    mockedResolveTxt.mockResolvedValueOnce([[token]]);
    const verify = await callHandler(verifyRoute as unknown as Record<string, unknown>, 'POST');
    expect(verify.status).toBe(200);

    const history = await readHistory(A.client.id);
    const actions = history.map(h => h.action);
    expect(actions).toEqual(['added', 'verified']);
    expect(history[1].domain).toBe('portal.audit-verify.com');
    expect(history[1].by_user_id).toBe(A.user.id);
  });

  it('inserts a "removed" row on DELETE', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const cdRoute = await import('@/app/api/portal/agency/custom-domain/route');

    await callHandler(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.audit-remove.com' } },
    );
    const del = await callHandler(cdRoute as unknown as Record<string, unknown>, 'DELETE');
    expect(del.status).toBe(200);

    const history = await readHistory(A.client.id);
    const actions = history.map(h => h.action);
    expect(actions).toEqual(['added', 'removed']);
    const removed = history.find(h => h.action === 'removed');
    expect(removed?.domain).toBe('portal.audit-remove.com');
    expect(removed?.by_user_id).toBe(A.user.id);
  });

  it('records the full add → verify → remove sequence', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const cdRoute = await import('@/app/api/portal/agency/custom-domain/route');
    const verifyRoute = await import('@/app/api/portal/agency/custom-domain/verify/route');

    const post = await callHandler<{ success: boolean; data: CustomDomainData }>(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.audit-cycle.com' } },
    );
    const token = post.data!.data.verificationRecord!.value;

    mockedResolveTxt.mockResolvedValueOnce([[token]]);
    await callHandler(verifyRoute as unknown as Record<string, unknown>, 'POST');

    await callHandler(cdRoute as unknown as Record<string, unknown>, 'DELETE');

    const history = await readHistory(A.client.id);
    expect(history.map(h => h.action)).toEqual(['added', 'verified', 'removed']);
    for (const row of history) {
      expect(row.domain).toBe('portal.audit-cycle.com');
      expect(row.by_user_id).toBe(A.user.id);
    }
  });

  it('does NOT insert a verified row on a failed /verify (DNS mismatch)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const cdRoute = await import('@/app/api/portal/agency/custom-domain/route');
    const verifyRoute = await import('@/app/api/portal/agency/custom-domain/verify/route');

    await callHandler(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.audit-fail.com' } },
    );

    mockedResolveTxt.mockResolvedValueOnce([['some-other-token']]);
    const verify = await callHandler(verifyRoute as unknown as Record<string, unknown>, 'POST');
    expect(verify.status).toBe(422);

    const history = await readHistory(A.client.id);
    expect(history.map(h => h.action)).toEqual(['added']);
  });
});

describe('cross-tenant: custom_domain_history isolation @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('audit-xt-a'),
      sessionForNewClientUser('audit-xt-b'),
    ]);
  });

  it('A\'s mutations write rows scoped to A only — B\'s history stays empty', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const cdRoute = await import('@/app/api/portal/agency/custom-domain/route');
    const verifyRoute = await import('@/app/api/portal/agency/custom-domain/verify/route');

    const post = await callHandler<{ success: boolean; data: CustomDomainData }>(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.iso-a.com' } },
    );
    const token = post.data!.data.verificationRecord!.value;
    mockedResolveTxt.mockResolvedValueOnce([[token]]);
    await callHandler(verifyRoute as unknown as Record<string, unknown>, 'POST');

    const aHistory = await readHistory(A.client.id);
    const bHistory = await readHistory(B.client.id);
    expect(aHistory.length).toBe(2);
    expect(bHistory.length).toBe(0);
    for (const row of aHistory) {
      expect(row.client_id).toBe(A.client.id);
      expect(row.by_user_id).toBe(A.user.id);
    }
  });

  it('parallel mutations by A and B do not bleed history rows', async () => {
    const cdRoute = await import('@/app/api/portal/agency/custom-domain/route');

    // A starts a flow.
    mockedAuth.mockResolvedValue(A.session);
    await callHandler(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.iso-parallel-a.com' } },
    );

    // B starts a different flow.
    mockedAuth.mockResolvedValue(B.session);
    await callHandler(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.iso-parallel-b.com' } },
    );

    const all = await readAllHistory();
    // Two 'added' rows total — one per tenant — and they're correctly attributed.
    const aRows = all.filter(r => r.client_id === A.client.id);
    const bRows = all.filter(r => r.client_id === B.client.id);
    expect(aRows.length).toBe(1);
    expect(bRows.length).toBe(1);
    expect(aRows[0].domain).toBe('portal.iso-parallel-a.com');
    expect(aRows[0].by_user_id).toBe(A.user.id);
    expect(bRows[0].domain).toBe('portal.iso-parallel-b.com');
    expect(bRows[0].by_user_id).toBe(B.user.id);
  });
});
