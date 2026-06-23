/**
 * Integration tests for portal services routes.
 *
 * Covers:
 *   - GET /api/portal/services      — list active services for the portal
 *   - GET /api/portal/services/nav  — sidebar nav: hides hosting category,
 *                                     marks subscribed services, applies icon
 *                                     and category-keyed href fallback.
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

interface SeedSvcOpts {
  name: string;
  slug?: string;
  category: string;
  active?: boolean;
  price?: number;
  billingCycle?: string;
}

async function seedService(opts: SeedSvcOpts): Promise<number> {
  const sql = getTestSql();
  const slug = opts.slug ?? `${opts.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services
      (name, slug, category, price, billing_cycle, active)
    VALUES (
      ${opts.name}, ${slug}, ${opts.category},
      ${opts.price ?? 0}, ${opts.billingCycle ?? 'monthly'},
      ${opts.active ?? true}
    )
    RETURNING id
  `;
  return row.id;
}

async function subscribe(clientId: number, serviceId: number, status: string = 'active'): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${clientId}, ${serviceId}, ${status})
  `;
}

describe('GET /api/portal/services @services', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('svc-list');
  });

  it('returns active services only, ordered by category then name', async () => {
    await seedService({ name: 'CMS Plus', category: 'cms' });
    await seedService({ name: 'Bookings', category: 'booking' });
    await seedService({ name: 'Inactive Pro', category: 'cms', active: false });

    await asTenant(A);
    const route = await import('@/app/api/portal/services/route');
    const res = await callHandler<{ success: boolean; data: Array<{ name: string; active: boolean; category: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const names = res.data?.data.map(s => s.name);
    expect(names).toContain('CMS Plus');
    expect(names).toContain('Bookings');
    expect(names).not.toContain('Inactive Pro');
    // All returned rows are active.
    expect(res.data?.data.every(s => s.active)).toBe(true);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/services/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/portal/services/nav @services @nav', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('svc-nav');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/services/nav/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('hides hosting-category services from the sidebar', async () => {
    await seedService({ name: 'Web Hosting', category: 'hosting' });
    await seedService({ name: 'CMS Pro', category: 'cms' });

    await asTenant(A);
    const route = await import('@/app/api/portal/services/nav/route');
    const res = await callHandler<{ data: Array<{ name: string; category: string; href: string; icon: string; subscribed: boolean }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const cats = (res.data?.data ?? []).map(d => d.category);
    expect(cats).not.toContain('hosting');
    expect(cats).toContain('cms');
  });

  it('marks subscribed=true only for active client_services subscriptions', async () => {
    const cmsId = await seedService({ name: 'CMS Pro', category: 'cms' });
    const emailId = await seedService({ name: 'Email Pro', category: 'email' });
    const aiId = await seedService({ name: 'AI Add-on', category: 'ai' });
    await subscribe(A.client.id, cmsId, 'active');
    await subscribe(A.client.id, emailId, 'pending'); // not active → not subscribed
    // aiId not subscribed at all

    await asTenant(A);
    const route = await import('@/app/api/portal/services/nav/route');
    const res = await callHandler<{ data: Array<{ id: number; subscribed: boolean }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    const map = new Map(res.data!.data.map(d => [d.id, d.subscribed]));
    expect(map.get(cmsId)).toBe(true);
    expect(map.get(emailId)).toBe(false);
    expect(map.get(aiId)).toBe(false);
  });

  it('applies category-keyed icon + href, falling back to /portal/services/<id>/request', async () => {
    const cmsId = await seedService({ name: 'CMS Pro', category: 'cms' });
    const oddId = await seedService({ name: 'Mystery', category: 'unknown-category' });

    await asTenant(A);
    const route = await import('@/app/api/portal/services/nav/route');
    const res = await callHandler<{ data: Array<{ id: number; icon: string; href: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    const map = new Map(res.data!.data.map(d => [d.id, d]));
    expect(map.get(cmsId)?.icon).toBe('language');
    expect(map.get(cmsId)?.href).toBe('/portal/websites');
    expect(map.get(oddId)?.icon).toBe('category'); // default fallback
    expect(map.get(oddId)?.href).toBe(`/portal/services/${oddId}/request`);
  });
});
