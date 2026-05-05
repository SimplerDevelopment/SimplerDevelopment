/**
 * Integration tests for portal settings profile route.
 *
 * Covers:
 *   - GET   /api/portal/settings/profile  — returns current user + client fields
 *   - PATCH /api/portal/settings/profile  — updates user.name/email + client fields
 *
 * Tenancy contract: a PATCH from user A must update only A's user row and
 * A's client row; user B's records must be untouched. Email-collision
 * (uniqueness across users) is also enforced here so the route doesn't
 * silently let two accounts share an email.
 *
 * Does not duplicate `tests/integration/api/auth-flows.test.ts` (which covers
 * forgot/reset/invite-accept on different routes).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

describe('GET /api/portal/settings/profile @settings @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('prof-get');
  });

  it('returns the caller\'s user + client profile (200)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/profile/route');
    const res = await callHandler<{ success: boolean; data: { name: string; email: string; company: string } }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.email).toBe(A.user.email);
    expect(res.data?.data.company).toBe(A.client.name);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/settings/profile/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the session user has no client row', async () => {
    // Forge a session for a user that exists but has no clients row
    const sql = getTestSql();
    const [u] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
      VALUES ('Orphan', ${`orphan-${Date.now()}@test.local`}, 'x', 'editor', true)
      RETURNING id
    `;
    mockedAuth.mockResolvedValue({
      user: { id: String(u.id), email: 'x', name: 'x', role: 'editor' },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    });

    const route = await import('@/app/api/portal/settings/profile/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/portal/settings/profile @settings @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('prof-patch-a'),
      sessionForNewClientUser('prof-patch-b'),
    ]);
  });

  it('happy path: caller can update own name + client metadata (200)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/profile/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        body: {
          name: 'Renamed User',
          email: A.user.email,           // unchanged email
          company: 'New Co',
          phone: '(555) 123-4567',
          website: 'https://example.com',
          address: '123 Main St',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [user] = await sql<{ name: string; email: string }[]>`
      SELECT name, email FROM ${sql(TEST_SCHEMA)}.users WHERE id = ${A.user.id}
    `;
    const [client] = await sql<{ company: string; phone: string; website: string; address: string }[]>`
      SELECT company, phone, website, address FROM ${sql(TEST_SCHEMA)}.clients WHERE id = ${A.client.id}
    `;
    expect(user.name).toBe('Renamed User');
    expect(client.company).toBe('New Co');
    expect(client.phone).toBe('(555) 123-4567');
    expect(client.website).toBe('https://example.com');
    expect(client.address).toBe('123 Main St');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/settings/profile/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { body: { name: 'X', email: 'x@x.com' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects empty name (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/profile/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { body: { name: '   ', email: A.user.email } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects empty email (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/profile/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { body: { name: 'Ok', email: '' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects email collision with another user (400, B unchanged)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/profile/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { body: { name: 'A', email: B.user.email } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/already in use/i);

    // A's email is unchanged, B's email is unchanged.
    const sql = getTestSql();
    const [a] = await sql<{ email: string }[]>`SELECT email FROM ${sql(TEST_SCHEMA)}.users WHERE id = ${A.user.id}`;
    const [b] = await sql<{ email: string }[]>`SELECT email FROM ${sql(TEST_SCHEMA)}.users WHERE id = ${B.user.id}`;
    expect(a.email).toBe(A.user.email);
    expect(b.email).toBe(B.user.email);
  });

  it('cross-user: A\'s PATCH updates only A\'s rows (B untouched)', async () => {
    // Capture B's pre-state.
    const sql = getTestSql();
    const [bUserBefore] = await sql<{ name: string; email: string }[]>`
      SELECT name, email FROM ${sql(TEST_SCHEMA)}.users WHERE id = ${B.user.id}
    `;
    const [bClientBefore] = await sql<{ company: string | null }[]>`
      SELECT company FROM ${sql(TEST_SCHEMA)}.clients WHERE id = ${B.client.id}
    `;

    await asTenant(A);
    const route = await import('@/app/api/portal/settings/profile/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        body: {
          name: 'A-Updated',
          email: A.user.email,
          company: 'A-Only Co',
        },
      },
    );

    const [bUserAfter] = await sql<{ name: string; email: string }[]>`
      SELECT name, email FROM ${sql(TEST_SCHEMA)}.users WHERE id = ${B.user.id}
    `;
    const [bClientAfter] = await sql<{ company: string | null }[]>`
      SELECT company FROM ${sql(TEST_SCHEMA)}.clients WHERE id = ${B.client.id}
    `;
    expect(bUserAfter.name).toBe(bUserBefore.name);
    expect(bUserAfter.email).toBe(bUserBefore.email);
    expect(bClientAfter.company).toBe(bClientBefore.company);
  });
});
