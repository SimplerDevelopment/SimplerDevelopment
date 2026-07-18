/**
 * Integration tests for branding defaults + messaging routes.
 *
 *   - GET  /api/portal/branding/defaults     (resolves brand-defaults context)
 *   - GET  /api/portal/branding/messaging    (per-client default + per-profile)
 *   - PUT  /api/portal/branding/messaging    (upsert)
 *   - GET  /api/portal/branding              (websites-with-branding listing)
 *
 * Tenancy is the load-bearing assertion — defaults must never leak data
 * across clients, and messaging GET/PUT must be scoped by clientId+profileId.
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

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedProfile(clientId: number, name = `P-${Date.now()}-${Math.floor(Math.random() * 9999)}`): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.branding_profiles (client_id, name, primary_color)
    VALUES (${clientId}, ${name}, ${'#2563eb'})
    RETURNING id
  `;
  return row.id;
}

async function seedMessaging(
  clientId: number,
  opts: { profileId?: number | null; tagline?: string; companyName?: string } = {},
): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.branding_messaging (
      client_id, branding_profile_id, company_name, tagline
    ) VALUES (
      ${clientId},
      ${opts.profileId ?? null},
      ${opts.companyName ?? `Co-${Date.now()}`},
      ${opts.tagline ?? `Tag-${Date.now()}`}
    ) RETURNING id
  `;
  return row.id;
}

// ─── /branding (top-level — websites listing) ──────────────────────────────
describe('GET /api/portal/branding @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-list-a'),
      sessionForNewClientUser('brand-list-b'),
    ]);
  });

  it('happy path: returns the caller\'s websites only', async () => {
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
      VALUES (${A.client.id}, 'A site', ${`a-${Date.now()}.test`})
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
      VALUES (${B.client.id}, 'B site', ${`b-${Date.now()}.test`})
    `;

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/route');
    const res = await callHandler<{ success: boolean; data: Array<{ name: string }> }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const names = res.data!.data.map((r) => r.name).sort();
    expect(names).toEqual(['A site']);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

// ─── /branding/defaults ────────────────────────────────────────────────────
describe('GET /api/portal/branding/defaults @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-defaults-a'),
      sessionForNewClientUser('brand-defaults-b'),
    ]);
  });

  it('happy path: returns BrandDefaultsContext for caller', async () => {
    // Seed messaging for A so defaults has something to surface; B's data
    // should never appear in A's response.
    await seedMessaging(A.client.id, { tagline: 'A-tag' });
    await seedMessaging(B.client.id, { tagline: 'B-tag' });

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/defaults/route');
    const res = await callHandler<{ success: boolean; data: { messaging?: { tagline?: string } } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data).toBeTruthy();
    // Tenant-A messaging surfaced; B's value must not leak.
    expect(res.data?.data?.messaging?.tagline).toBe('A-tag');
    expect(res.data?.data?.messaging?.tagline).not.toBe('B-tag');
  });

  it('happy path: scopes to profileId when provided', async () => {
    const profileId = await seedProfile(A.client.id, 'A-prof');
    await seedMessaging(A.client.id, { profileId, tagline: 'A-prof-tag' });
    // Also seed a default (no profile) row that should NOT win.
    await seedMessaging(A.client.id, { profileId: null, tagline: 'A-default-tag' });

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/defaults/route');
    const res = await callHandler<{ success: boolean; data: { messaging?: { tagline?: string } } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { profileId: String(profileId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.messaging?.tagline).toBe('A-prof-tag');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/defaults/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('non-numeric profileId is treated as null, request still resolves (200)', async () => {
    await seedMessaging(A.client.id, { tagline: 'A-tag' });
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/defaults/route');
    const res = await callHandler<{ success: boolean; data: unknown }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { profileId: 'NaN-here' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
  });
});

// ─── /branding/messaging ───────────────────────────────────────────────────
describe('GET /api/portal/branding/messaging @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-msg-get-a'),
      sessionForNewClientUser('brand-msg-get-b'),
    ]);
  });

  it('returns the caller\'s default (profile-null) row', async () => {
    await seedMessaging(A.client.id, { tagline: 'A-default' });
    await seedMessaging(B.client.id, { tagline: 'B-default' });

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/messaging/route');
    const res = await callHandler<{ success: boolean; data: { tagline: string; clientId: number } | null }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.tagline).toBe('A-default');
    expect(res.data?.data?.clientId).toBe(A.client.id);
  });

  it('returns null when caller has no messaging row', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/messaging/route');
    const res = await callHandler<{ success: boolean; data: unknown }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toBeNull();
  });

  it('scopes to profileId when provided', async () => {
    const profileId = await seedProfile(A.client.id);
    await seedMessaging(A.client.id, { profileId, tagline: 'profile-tag' });
    await seedMessaging(A.client.id, { profileId: null, tagline: 'default-tag' });

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/messaging/route');
    const res = await callHandler<{ success: boolean; data: { tagline: string } | null }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { profileId: String(profileId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data?.tagline).toBe('profile-tag');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/messaging/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/portal/branding/messaging @branding @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brand-msg-put-a'),
      sessionForNewClientUser('brand-msg-put-b'),
    ]);
  });

  it('upserts: first PUT inserts, second PUT updates the same row', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/branding/messaging/route');

    const first = await callHandler<{ success: boolean; data: { id: number; tagline: string } }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { tagline: 'first', companyName: 'Co' } },
    );
    expect(first.status).toBe(200);
    expect(first.data?.data.tagline).toBe('first');

    const second = await callHandler<{ success: boolean; data: { id: number; tagline: string } }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { tagline: 'second' } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.tagline).toBe('second');
    // Same row id (upsert, not append).
    expect(second.data?.data.id).toBe(first.data?.data.id);

    // DB state: exactly one row for this client+profile=null.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.branding_messaging
      WHERE client_id = ${A.client.id} AND branding_profile_id IS NULL
    `;
    expect(rows.length).toBe(1);
  });

  it('cross-tenant: PUT writes only against caller\'s clientId', async () => {
    // Seed B's default messaging — A's PUT must NOT touch it.
    await seedMessaging(B.client.id, { tagline: 'B-untouched' });

    await asTenant(A);
    const route = await import('@/app/api/portal/branding/messaging/route');
    const res = await callHandler<{ success: boolean; data: { clientId: number; tagline: string } }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { tagline: 'A-new' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.clientId).not.toBe(B.client.id);

    // B's row preserved.
    const sql = getTestSql();
    const [bRow] = await sql<{ tagline: string }[]>`
      SELECT tagline FROM ${sql(TEST_SCHEMA)}.branding_messaging
      WHERE client_id = ${B.client.id} AND branding_profile_id IS NULL
    `;
    expect(bRow.tagline).toBe('B-untouched');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/branding/messaging/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { tagline: 'x' } },
    );
    expect(res.status).toBe(401);
  });
});
