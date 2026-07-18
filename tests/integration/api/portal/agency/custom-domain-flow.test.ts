/**
 * Integration tests for the white-label / SaaS Mode custom-domain flow.
 *
 * Routes covered:
 *   - GET    /api/portal/agency/custom-domain
 *   - POST   /api/portal/agency/custom-domain          (start verification)
 *   - DELETE /api/portal/agency/custom-domain          (remove)
 *   - POST   /api/portal/agency/custom-domain/verify   (run DNS check)
 *
 * Key invariants:
 *   - GET on a fresh client returns nulls.
 *   - POST persists customDomain + customDomainVerificationToken; verifiedAt
 *     stays null until /verify succeeds.
 *   - /verify with mocked DNS returning the matching token sets verifiedAt;
 *     mismatched DNS yields 422 and verifiedAt remains null.
 *   - DELETE clears all custom_domain_* columns and inserts a 'removed'
 *     audit row.
 *   - Cross-tenant: another client cannot see or mutate the first client's
 *     domain mapping.
 *
 * `node:dns/promises` is mocked so we never hit real DNS.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// dns mock MUST be declared before importing modules that capture resolveTxt
// at import time. lib/agency/dns-verify imports `{ resolveTxt }` once and
// holds the reference, so the mock has to be in place before that import is
// triggered (transitively, via the route module).
vi.mock('node:dns/promises', () => {
  const resolveTxt = vi.fn();
  return {
    default: { resolveTxt },
    resolveTxt,
  };
});

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// `getPortalClient` reads the active-client cookie via next/headers — outside
// a real request context that throws, but the call site catches it. Stub
// anyway so the throw isn't logged and the resolver path is deterministic.
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
  verifiedAt: string | null;
  verificationRecord: { host: string; type: string; value: string } | null;
  whiteLabelEnabled: boolean;
}

interface ClientRow {
  custom_domain: string | null;
  custom_domain_verified_at: Date | null;
  custom_domain_verification_token: string | null;
  white_label_enabled: boolean;
}

async function readClientDomain(clientId: number): Promise<ClientRow | undefined> {
  const sql = getTestSql();
  const [row] = await sql<ClientRow[]>`
    SELECT custom_domain, custom_domain_verified_at,
           custom_domain_verification_token, white_label_enabled
    FROM ${sql(TEST_SCHEMA)}.clients
    WHERE id = ${clientId}
  `;
  return row;
}

interface HistoryRow {
  domain: string;
  action: string;
  by_user_id: number | null;
}

async function readHistory(clientId: number): Promise<HistoryRow[]> {
  const sql = getTestSql();
  return sql<HistoryRow[]>`
    SELECT domain, action, by_user_id
    FROM ${sql(TEST_SCHEMA)}.custom_domain_history
    WHERE client_id = ${clientId}
    ORDER BY id ASC
  `;
}

beforeEach(() => {
  mockedResolveTxt.mockReset();
  // Wipe the in-memory custom-domain cache so cached negatives from a
  // previous spec don't bleed into this one.
  clearCustomDomainCache();
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe('GET /api/portal/agency/custom-domain', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('cdflow-get-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('returns null state for a fresh client', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.customDomain).toBeNull();
    expect(res.data?.data.verifiedAt).toBeNull();
    expect(res.data?.data.verificationRecord).toBeNull();
    expect(res.data?.data.whiteLabelEnabled).toBe(false);
  });

  it('returns the domain + verification record after POST', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');

    const post = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.acme-agency-get.com' } },
    );
    expect(post.status).toBe(200);

    const get = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(get.status).toBe(200);
    expect(get.data?.data.customDomain).toBe('portal.acme-agency-get.com');
    expect(get.data?.data.verifiedAt).toBeNull();
    expect(get.data?.data.verificationRecord?.host).toBe('_simplerdev.portal.acme-agency-get.com');
    expect(get.data?.data.verificationRecord?.type).toBe('TXT');
    expect(get.data?.data.verificationRecord?.value).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── POST (start verification) ───────────────────────────────────────────────

describe('POST /api/portal/agency/custom-domain', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('cdflow-post-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.acme.com' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid JSON body', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: 'not-json' },
    );
    expect(res.status).toBe(400);
  });

  it('400 when the domain shape is implausible', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'no-tld' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when the apex is our own platform domain', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'foo.simplerdevelopment.com' } },
    );
    expect(res.status).toBe(400);
  });

  it('persists customDomain + token; verifiedAt stays null until /verify succeeds', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.acme-post.com' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.customDomain).toBe('portal.acme-post.com');
    expect(res.data?.data.verifiedAt).toBeNull();
    expect(res.data?.data.verificationRecord?.value).toMatch(/^[0-9a-f]{64}$/);

    const row = await readClientDomain(A.client.id);
    expect(row?.custom_domain).toBe('portal.acme-post.com');
    expect(row?.custom_domain_verification_token).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.custom_domain_verified_at).toBeNull();
    expect(row?.white_label_enabled).toBe(false);
  });

  it('lowercases + trims the domain before persisting', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: '  Portal.Acme-Mixed.COM  ' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.customDomain).toBe('portal.acme-mixed.com');
    const row = await readClientDomain(A.client.id);
    expect(row?.custom_domain).toBe('portal.acme-mixed.com');
  });

  it('409 when another client already claimed the domain', async () => {
    const B = await sessionForNewClientUser('cdflow-post-b-collide');
    mockedAuth.mockResolvedValue(B.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');

    // B claims first.
    const first = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.contested.com' } },
    );
    expect(first.status).toBe(200);

    // A tries to claim the same — 409.
    mockedAuth.mockResolvedValue(A.session);
    const second = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.contested.com' } },
    );
    expect(second.status).toBe(409);

    // A's row was not updated.
    const aRow = await readClientDomain(A.client.id);
    expect(aRow?.custom_domain).toBeNull();
  });

  it('issues a fresh token on re-POST by the same client (rotation)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');

    const first = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.rotate.com' } },
    );
    const tokenA = first.data?.data.verificationRecord?.value;

    const second = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.rotate.com' } },
    );
    const tokenB = second.data?.data.verificationRecord?.value;

    expect(tokenA).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenB).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenA).not.toBe(tokenB);
  });
});

// ─── POST /verify ────────────────────────────────────────────────────────────

describe('POST /api/portal/agency/custom-domain/verify', () => {
  let A: TenantCtx;

  async function startVerification(domain: string): Promise<string> {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain } },
    );
    expect(res.status).toBe(200);
    return res.data!.data.verificationRecord!.value;
  }

  beforeEach(async () => { A = await sessionForNewClientUser('cdflow-verify-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/agency/custom-domain/verify/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect(res.status).toBe(401);
  });

  it('400 when no pending domain exists', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/verify/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect(res.status).toBe(400);
  });

  it('200 + sets verifiedAt when the TXT record matches the persisted token', async () => {
    const token = await startVerification('portal.verify-ok.com');
    mockedResolveTxt.mockResolvedValueOnce([[token]]);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/verify/route');
    const res = await callHandler<{ success: boolean; data: { verifiedAt: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.verifiedAt).toBeTruthy();

    expect(mockedResolveTxt).toHaveBeenCalledWith('_simplerdev.portal.verify-ok.com');

    const row = await readClientDomain(A.client.id);
    expect(row?.custom_domain_verified_at).not.toBeNull();
  });

  it('422 + verifiedAt stays null on TXT mismatch', async () => {
    await startVerification('portal.verify-nope.com');
    mockedResolveTxt.mockResolvedValueOnce([['not-the-right-token']]);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/verify/route');
    const res = await callHandler<{ success: boolean; error: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
    );
    expect(res.status).toBe(422);
    expect(res.data?.success).toBe(false);
    expect(res.data?.error).toMatch(/TXT record/i);

    const row = await readClientDomain(A.client.id);
    expect(row?.custom_domain_verified_at).toBeNull();
    // Token must persist so the user can retry without re-issuing.
    expect(row?.custom_domain_verification_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('422 when DNS resolution throws (e.g. NXDOMAIN before propagation)', async () => {
    await startVerification('portal.verify-nxdomain.com');
    mockedResolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'));

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/verify/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect(res.status).toBe(422);
    const row = await readClientDomain(A.client.id);
    expect(row?.custom_domain_verified_at).toBeNull();
  });

  it('idempotent: re-verifying an already-verified domain still returns 200', async () => {
    const token = await startVerification('portal.verify-twice.com');
    // First verify — succeeds.
    mockedResolveTxt.mockResolvedValueOnce([[token]]);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/verify/route');
    const first = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect(first.status).toBe(200);

    // Second verify — DNS still matches, route should short-circuit.
    mockedResolveTxt.mockResolvedValueOnce([[token]]);
    const second = await callHandler(route as unknown as Record<string, unknown>, 'POST');
    expect(second.status).toBe(200);

    // Only one 'verified' history row should exist.
    const history = await readHistory(A.client.id);
    const verifiedEntries = history.filter(h => h.action === 'verified');
    expect(verifiedEntries.length).toBe(1);
  });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe('DELETE /api/portal/agency/custom-domain', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('cdflow-delete-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'DELETE');
    expect(res.status).toBe(401);
  });

  it('clears all custom_domain_* columns and writes a removed history row', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');

    // Start the flow first.
    const post = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.delete-me.com' } },
    );
    expect(post.status).toBe(200);

    // Sanity: row was populated.
    const before = await readClientDomain(A.client.id);
    expect(before?.custom_domain).toBe('portal.delete-me.com');
    expect(before?.custom_domain_verification_token).toMatch(/^[0-9a-f]{64}$/);

    const del = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
    );
    expect(del.status).toBe(200);
    expect(del.data?.success).toBe(true);

    const after = await readClientDomain(A.client.id);
    expect(after?.custom_domain).toBeNull();
    expect(after?.custom_domain_verification_token).toBeNull();
    expect(after?.custom_domain_verified_at).toBeNull();
    expect(after?.white_label_enabled).toBe(false);

    const history = await readHistory(A.client.id);
    const removed = history.find(h => h.action === 'removed');
    expect(removed).toBeDefined();
    expect(removed?.domain).toBe('portal.delete-me.com');
    expect(removed?.by_user_id).toBe(A.user.id);
  });

  it('also forces white-label off when DELETE is called on a verified, white-labeled account', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const cdRoute = await import('@/app/api/portal/agency/custom-domain/route');
    const verifyRoute = await import('@/app/api/portal/agency/custom-domain/verify/route');

    const post = await callHandler<{ success: boolean; data: CustomDomainData }>(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.kill-switch.com' } },
    );
    const token = post.data!.data.verificationRecord!.value;

    mockedResolveTxt.mockResolvedValueOnce([[token]]);
    const verify = await callHandler(verifyRoute as unknown as Record<string, unknown>, 'POST');
    expect(verify.status).toBe(200);

    // Manually flip white-label on at the DB level (simulate the toggle
    // succeeded post-verification).
    const sql = getTestSql();
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.clients
      SET white_label_enabled = true, agency_name = 'Killswitch Agency'
      WHERE id = ${A.client.id}
    `;

    const del = await callHandler(cdRoute as unknown as Record<string, unknown>, 'DELETE');
    expect(del.status).toBe(200);

    const after = await readClientDomain(A.client.id);
    expect(after?.white_label_enabled).toBe(false);
    expect(after?.custom_domain).toBeNull();
  });

  it('DELETE on a client with no domain is a safe no-op (no history row)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    const del = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
    );
    expect(del.status).toBe(200);
    expect(del.data?.success).toBe(true);

    const history = await readHistory(A.client.id);
    expect(history.length).toBe(0);
  });
});

// ─── Cross-tenant guards ─────────────────────────────────────────────────────

describe('cross-tenant: agency custom-domain', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('cdflow-xtenant-a'),
      sessionForNewClientUser('cdflow-xtenant-b'),
    ]);
  });

  it('B\'s GET returns nulls even after A starts a verification flow', async () => {
    const route = await import('@/app/api/portal/agency/custom-domain/route');
    mockedAuth.mockResolvedValue(A.session);
    const post = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.xtenant-a.com' } },
    );
    expect(post.status).toBe(200);

    mockedAuth.mockResolvedValue(B.session);
    const get = await callHandler<{ success: boolean; data: CustomDomainData }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(get.status).toBe(200);
    expect(get.data?.data.customDomain).toBeNull();
    expect(get.data?.data.verifiedAt).toBeNull();
  });

  it('B\'s DELETE does not clear A\'s domain mapping', async () => {
    const route = await import('@/app/api/portal/agency/custom-domain/route');

    // A starts verification.
    mockedAuth.mockResolvedValue(A.session);
    await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.xtenant-a-keep.com' } },
    );

    // B issues DELETE — only mutates B's own row.
    mockedAuth.mockResolvedValue(B.session);
    const del = await callHandler(route as unknown as Record<string, unknown>, 'DELETE');
    expect(del.status).toBe(200);

    // A's row still has the domain.
    const aRow = await readClientDomain(A.client.id);
    expect(aRow?.custom_domain).toBe('portal.xtenant-a-keep.com');
  });

  it('B\'s /verify cannot verify A\'s pending domain', async () => {
    const cdRoute = await import('@/app/api/portal/agency/custom-domain/route');
    const verifyRoute = await import('@/app/api/portal/agency/custom-domain/verify/route');

    mockedAuth.mockResolvedValue(A.session);
    const post = await callHandler<{ success: boolean; data: CustomDomainData }>(
      cdRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { domain: 'portal.xtenant-verify.com' } },
    );
    const aToken = post.data!.data.verificationRecord!.value;

    // B has no pending domain → /verify returns 400 even if DNS would
    // happen to publish A's token (which wouldn't help B anyway).
    mockedAuth.mockResolvedValue(B.session);
    mockedResolveTxt.mockResolvedValueOnce([[aToken]]);
    const verify = await callHandler(verifyRoute as unknown as Record<string, unknown>, 'POST');
    expect(verify.status).toBe(400);

    // A's verifiedAt remains null — B's call did not bleed.
    const aRow = await readClientDomain(A.client.id);
    expect(aRow?.custom_domain_verified_at).toBeNull();
  });
});
