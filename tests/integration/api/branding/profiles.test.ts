/**
 * Integration tests for portal branding profile routes.
 *
 * Routes covered:
 *   - POST   /api/portal/branding/profiles
 *   - GET    /api/portal/branding/profiles/[profileId]
 *   - PUT    /api/portal/branding/profiles/[profileId]
 *   - DELETE /api/portal/branding/profiles/[profileId]
 *
 * For every mutation we assert: happy path, 401 unauthenticated,
 * cross-tenant rejection (the load-bearing tenancy contract), 400
 * bad-input variants, and 404 for missing targets.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// `getPortalClient` reads the active-client cookie via next/headers — outside
// a real request that throws, but the call site catches it. Stub anyway so
// the throw isn't logged and the resolver path is deterministic.
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

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedProfile(
  clientId: number,
  overrides: { name?: string; isDefault?: boolean; primaryColor?: string } = {},
): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.branding_profiles (client_id, name, is_default, primary_color)
    VALUES (
      ${clientId},
      ${overrides.name ?? `Profile-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${overrides.isDefault ?? false},
      ${overrides.primaryColor ?? '#2563eb'}
    )
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/branding/profiles @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-prof-post-a'),
      sessionForNewClientUser('brand-prof-post-b'),
    ]);
  });

  it('creates a profile under the caller\'s tenant (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; name: string; primaryColor: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'BRAND-Acme', primaryColor: '#10b981' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.name).toBe('BRAND-Acme');
    expect(res.data?.data.primaryColor).toBe('#10b981');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.branding_profiles WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    // Did NOT leak into B's tenant.
    expect(row.client_id).not.toBe(B.client.id);
  });

  it('isDefault=true unsets the previous default within the same tenant only', async () => {
    // Seed an existing default for both tenants. After A creates a new
    // default, A's old default must flip to false BUT B's default must
    // remain true (cross-tenant isolation of the unset query).
    const aOldDefaultId = await seedProfile(A.client.id, { name: 'A-old', isDefault: true });
    const bDefaultId = await seedProfile(B.client.id, { name: 'B-keeps', isDefault: true });

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/route');
    const res = await callHandler<{ success: boolean; data: { id: number; isDefault: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'A-new', isDefault: true } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.isDefault).toBe(true);

    const sql = getTestSql();
    const [aOld] = await sql<{ is_default: boolean }[]>`
      SELECT is_default FROM ${sql(TEST_SCHEMA)}.branding_profiles WHERE id = ${aOldDefaultId}
    `;
    expect(aOld.is_default).toBe(false);

    const [bDef] = await sql<{ is_default: boolean }[]>`
      SELECT is_default FROM ${sql(TEST_SCHEMA)}.branding_profiles WHERE id = ${bDefaultId}
    `;
    expect(bDef.is_default).toBe(true);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/profiles/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing name with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('rejects whitespace-only name with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: '   ' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/portal/branding/profiles @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-prof-get-a'),
      sessionForNewClientUser('brand-prof-get-b'),
    ]);
  });

  it('lists only the caller\'s profiles', async () => {
    await seedProfile(A.client.id, { name: 'A-1' });
    await seedProfile(A.client.id, { name: 'A-2' });
    await seedProfile(B.client.id, { name: 'B-only' });

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/route');
    const res = await callHandler<{ success: boolean; data: Array<{ name: string; clientId: number }> }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const names = res.data!.data.map((r) => r.name).sort();
    expect(names).toEqual(['A-1', 'A-2']);
    for (const row of res.data!.data) {
      expect(row.clientId).toBe(A.client.id);
    }
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/profiles/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/portal/branding/profiles/[profileId] @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let bProfileId: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-prof-put-a'),
      sessionForNewClientUser('brand-prof-put-b'),
    ]);
    bProfileId = await seedProfile(B.client.id, { name: 'B-Owned', primaryColor: '#aabbcc' });
  });

  it('happy path: tenant edits own profile (200)', async () => {
    const myId = await seedProfile(A.client.id, { name: 'Mine' });
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler<{ success: boolean; data: { name: string; primaryColor: string; borderRadius: string } }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      {
        params: { profileId: String(myId) },
        body: { primaryColor: '#10b981', borderRadius: '12px' },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.primaryColor).toBe('#10b981');
    expect(res.data?.data.borderRadius).toBe('12px');
    // Name preserved when not in body.
    expect(res.data?.data.name).toBe('Mine');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { profileId: String(bProfileId) }, body: { primaryColor: '#000000' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot mutate B\'s profile (404 + DB untouched)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { profileId: String(bProfileId) }, body: { primaryColor: '#hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ primary_color: string; name: string }[]>`
      SELECT primary_color, name FROM ${sql(TEST_SCHEMA)}.branding_profiles WHERE id = ${bProfileId}
    `;
    expect(row.primary_color).toBe('#aabbcc');
    expect(row.name).toBe('B-Owned');
  });

  it('returns 404 when target id does not exist for caller', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { profileId: '999999' }, body: { primaryColor: '#000000' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/portal/branding/profiles/[profileId] @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-prof-getone-a'),
      sessionForNewClientUser('brand-prof-getone-b'),
    ]);
  });

  it('happy path returns own profile (200)', async () => {
    const id = await seedProfile(A.client.id, { name: 'Mine' });
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler<{ success: boolean; data: { id: number; name: string } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { profileId: String(id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.id).toBe(id);
    expect(res.data?.data.name).toBe('Mine');
  });

  it('cross-tenant: A cannot read B\'s profile (404)', async () => {
    const id = await seedProfile(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { profileId: String(id) } },
    );
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { profileId: '1' } },
    );
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/portal/branding/profiles/[profileId] @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-prof-del-a'),
      sessionForNewClientUser('brand-prof-del-b'),
    ]);
  });

  it('happy path: deletes own profile (200)', async () => {
    const id = await seedProfile(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { profileId: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.branding_profiles WHERE id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { profileId: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete B\'s profile (404, row preserved)', async () => {
    const id = await seedProfile(B.client.id, { name: 'B-keeps' });
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { profileId: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number; name: string }[]>`
      SELECT id, name FROM ${sql(TEST_SCHEMA)}.branding_profiles WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('B-keeps');
  });

  it('returns 404 when target id is unknown', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/profiles/[profileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { profileId: '888888' } },
    );
    expect(res.status).toBe(404);
  });
});
