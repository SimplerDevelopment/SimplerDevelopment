/**
 * Integration tests for portal hosting routes.
 *
 * Covers:
 *   - GET /api/portal/hosting          — list hosted sites for caller's client
 *   - GET /api/portal/hosting/[id]     — get a single hosted site by id
 *
 * /api/portal/hosting requires an active 'hosting' service subscription
 * (authorizePortal({ requireService: 'hosting' })). /api/portal/hosting/[id]
 * does NOT — it's a direct tenant lookup.
 *
 * Each route verifies happy path, 401, cross-tenant rejection, and the list
 * endpoint also verifies the service-gating 403.
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

async function enableHostingService(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  const slug = `hosting-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Hosting', ${slug}, 'hosting', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

interface SeedSiteOpts {
  name?: string;
  status?: string;
  plan?: string;
  customDomain?: string | null;
}

async function seedHostedSite(clientId: number, opts: SeedSiteOpts = {}): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.hosted_sites
      (client_id, name, custom_domain, status, plan)
    VALUES (
      ${clientId},
      ${opts.name ?? 'Acme Site'},
      ${opts.customDomain ?? null},
      ${opts.status ?? 'active'},
      ${opts.plan ?? 'starter'}
    )
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/portal/hosting @hosting @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('hosting-list-a'),
      sessionForNewClientUser('hosting-list-b'),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/hosting/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller has no active hosting service', async () => {
    // No subscription → authorizePortal blocks the call.
    await asTenant(A);
    const route = await import('@/app/api/portal/hosting/route');
    const res = await callHandler<{ success: boolean; requiresService?: string }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(403);
    expect(res.data?.requiresService).toBe('hosting');
  });

  it('happy path: returns only the caller tenant\'s hosted sites', async () => {
    await enableHostingService(A);
    await seedHostedSite(A.client.id, { name: 'A-site-1' });
    await seedHostedSite(A.client.id, { name: 'A-site-2' });
    await seedHostedSite(B.client.id, { name: 'B-site-X' });

    await asTenant(A);
    const route = await import('@/app/api/portal/hosting/route');
    const res = await callHandler<{ success: boolean; data: Array<{ name: string; clientId: number }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.length).toBe(2);
    const names = res.data!.data.map(s => s.name).sort();
    expect(names).toEqual(['A-site-1', 'A-site-2']);
    expect(res.data?.data.every(s => s.clientId === A.client.id)).toBe(true);
  });
});

describe('GET /api/portal/hosting/[id] @hosting @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('hosting-get-a'),
      sessionForNewClientUser('hosting-get-b'),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/hosting/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/hosting/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('happy path: returns A\'s site to A', async () => {
    const siteA = await seedHostedSite(A.client.id, { name: 'A-prod', plan: 'pro' });
    await asTenant(A);
    const route = await import('@/app/api/portal/hosting/[id]/route');
    const res = await callHandler<{ success: boolean; data: { id: number; name: string; plan: string } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(siteA) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.id).toBe(siteA);
    expect(res.data?.data.name).toBe('A-prod');
    expect(res.data?.data.plan).toBe('pro');
  });

  it('cross-tenant: A querying B\'s site returns 404 (no leak of existence)', async () => {
    const siteB = await seedHostedSite(B.client.id, { name: 'B-secret' });
    await asTenant(A);
    const route = await import('@/app/api/portal/hosting/[id]/route');
    const res = await callHandler<{ success: boolean; data: unknown }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(siteB) } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.data).toBeUndefined();
  });
});
