/**
 * Integration tests for the white-label kill-switch.
 *
 * Routes covered:
 *   - POST /api/portal/agency/white-label
 *
 * Invariants enforced:
 *   - `enabled=true` is rejected (422) until `customDomainVerifiedAt` is set
 *     AND `agencyName` is populated. The 422 path returns an explanatory
 *     error string + a hint about which step to run first.
 *   - Once both gates are satisfied, `enabled=true` flips the flag in DB.
 *   - `enabled=false` is always allowed (the kill-switch is one-directional —
 *     turning off never requires un-verifying DNS).
 *   - 400 on missing/non-boolean `enabled`.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

interface ToggleRow {
  white_label_enabled: boolean;
}

async function readWhiteLabel(clientId: number): Promise<boolean | undefined> {
  const sql = getTestSql();
  const [row] = await sql<ToggleRow[]>`
    SELECT white_label_enabled
    FROM ${sql(TEST_SCHEMA)}.clients
    WHERE id = ${clientId}
  `;
  return row?.white_label_enabled;
}

/**
 * Force a client into the "fully ready for white-label" state without going
 * through the API: verifiedAt set, agencyName populated. This isolates the
 * white-label toggle test from upstream flow tests.
 */
async function makeReady(clientId: number, agencyName = 'Acme Agency'): Promise<void> {
  const sql = getTestSql();
  await sql`
    UPDATE ${sql(TEST_SCHEMA)}.clients
    SET custom_domain = 'portal.acme-wl.com',
        custom_domain_verification_token = 'fake-token-64chars-fake-token-64chars-fake-token-64chars-fakeXX',
        custom_domain_verified_at = NOW(),
        agency_name = ${agencyName}
    WHERE id = ${clientId}
  `;
}

describe('POST /api/portal/agency/white-label', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('wl-toggle-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/agency/white-label/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { enabled: true } },
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid JSON body', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/white-label/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: 'not-json' },
    );
    expect(res.status).toBe(400);
  });

  it('400 when `enabled` is missing or non-boolean', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/white-label/route');

    const missing = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(missing.status).toBe(400);

    const nonBool = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { enabled: 'yes' } },
    );
    expect(nonBool.status).toBe(400);
  });

  it('422 when enabling BEFORE the custom domain is verified', async () => {
    // Fresh client — no verifiedAt, no agencyName.
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/white-label/route');
    const res = await callHandler<{ success: boolean; error: string; hint?: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { enabled: true } },
    );
    expect(res.status).toBe(422);
    expect(res.data?.success).toBe(false);
    expect(res.data?.error).toMatch(/verify|verified|custom domain/i);

    // DB unchanged.
    expect(await readWhiteLabel(A.client.id)).toBe(false);
  });

  it('422 when verified but agencyName is missing', async () => {
    const sql = getTestSql();
    // Verified BUT no agency name.
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.clients
      SET custom_domain = 'portal.no-name.com',
          custom_domain_verification_token = 'xx',
          custom_domain_verified_at = NOW()
      WHERE id = ${A.client.id}
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/white-label/route');
    const res = await callHandler<{ success: boolean; error: string; hint?: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { enabled: true } },
    );
    expect(res.status).toBe(422);
    expect(res.data?.error).toMatch(/agencyName/i);
    expect(await readWhiteLabel(A.client.id)).toBe(false);
  });

  it('200 + persists when enabling AFTER verification + agencyName are in place', async () => {
    await makeReady(A.client.id);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/white-label/route');
    const res = await callHandler<{ success: boolean; data: { whiteLabelEnabled: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { enabled: true } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.whiteLabelEnabled).toBe(true);
    expect(await readWhiteLabel(A.client.id)).toBe(true);
  });

  it('200 + flips back to false on disable (no preconditions)', async () => {
    await makeReady(A.client.id);
    const sql = getTestSql();
    // Pre-flip to true so we can observe the toggle to false.
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.clients
      SET white_label_enabled = true
      WHERE id = ${A.client.id}
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/white-label/route');
    const res = await callHandler<{ success: boolean; data: { whiteLabelEnabled: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { enabled: false } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.whiteLabelEnabled).toBe(false);
    expect(await readWhiteLabel(A.client.id)).toBe(false);
  });

  it('disabling on a client that never verified is still allowed (idempotent off)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/white-label/route');
    const res = await callHandler<{ success: boolean; data: { whiteLabelEnabled: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { enabled: false } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.whiteLabelEnabled).toBe(false);
  });
});

describe('cross-tenant: white-label toggle', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('wl-toggle-xt-a'),
      sessionForNewClientUser('wl-toggle-xt-b'),
    ]);
  });

  it('A\'s POST does not flip B\'s flag', async () => {
    await makeReady(A.client.id);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/agency/white-label/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { enabled: true } },
    );
    expect(res.status).toBe(200);

    expect(await readWhiteLabel(A.client.id)).toBe(true);
    expect(await readWhiteLabel(B.client.id)).toBe(false);
  });
});
