/**
 * Portal websites — STORE shipping zones (POST/PUT/DELETE) and rates POST.
 *
 * Cross-site rejection: A cannot read/write/delete B's shipping zones or rates,
 * even when guessing the zoneId. Cascade-delete of zone clears its rates.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedZone(siteId: number, name = 'Zone'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.shipping_zones (website_id, name)
    VALUES (${siteId}, ${name})
    RETURNING id
  `;
  return row;
}

async function seedRate(zoneId: number): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.shipping_rates (zone_id, name, rate_type, price)
    VALUES (${zoneId}, 'Standard', 'flat', 500)
    RETURNING id
  `;
  return row;
}

describe('POST /api/portal/websites/[siteId]/store/shipping @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-ship-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { countries: ['US'] } },
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path — zone created with countries + rates: []', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/route');
    const res = await callHandler<{ success: boolean; data: { id: number; rates: unknown[]; websiteId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { name: 'NA', countries: ['US', 'CA'] } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.rates).toEqual([]);
    expect(res.data?.data.websiteId).toBe(siteId);
  });

  it('cross-site rejection — A cannot create zone in B\'s site', async () => {
    const B = await sessionForNewClientUser('store-ship-create-b');
    const { siteId: bSite } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(bSite) }, body: { name: 'Sneak' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.shipping_zones WHERE website_id = ${bSite}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('PUT /api/portal/websites/[siteId]/store/shipping/[zoneId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-ship-update'); });

  it('happy path — renames the zone', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const z = await seedZone(siteId, 'Old');
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/route');
    const res = await callHandler<{ success: boolean; data: { name: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), zoneId: String(z.id) }, body: { name: 'New' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('New');
  });

  it('404 on missing zoneId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), zoneId: '999999' }, body: { name: 'X' } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-site rejection — A cannot rename B\'s zone via A\'s siteId', async () => {
    const B = await sessionForNewClientUser('store-ship-update-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bZone = await seedZone(bSite, 'B zone');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(aSite), zoneId: String(bZone.id) }, body: { name: 'Hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [check] = await sql<{ name: string }[]>`
      SELECT name FROM ${sql(TEST_SCHEMA)}.shipping_zones WHERE id = ${bZone.id}
    `;
    expect(check.name).toBe('B zone');
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/shipping/[zoneId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-ship-delete'); });

  it('happy path — cascades through to rates', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const z = await seedZone(siteId);
    const r = await seedRate(z.id);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), zoneId: String(z.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const zones = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.shipping_zones WHERE id = ${z.id}
    `;
    expect(zones.length).toBe(0);
    const rates = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.shipping_rates WHERE id = ${r.id}
    `;
    expect(rates.length).toBe(0);
  });

  it('404 on missing zoneId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), zoneId: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-site rejection — A cannot delete B\'s zone', async () => {
    const B = await sessionForNewClientUser('store-ship-delete-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bZone = await seedZone(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(aSite), zoneId: String(bZone.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.shipping_zones WHERE id = ${bZone.id}
    `;
    expect(rows.length).toBe(1);
  });
});

describe('POST /api/portal/websites/[siteId]/store/shipping/[zoneId]/rates @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-rate-create'); });

  it('400 when name missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const z = await seedZone(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId), zoneId: String(z.id) }, body: { price: 500 } },
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path — creates a rate scoped to the zone', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const z = await seedZone(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/route');
    const res = await callHandler<{ success: boolean; data: { name: string; zoneId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), zoneId: String(z.id) },
        body: { name: 'Express', rateType: 'flat', price: 1500 },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.zoneId).toBe(z.id);
    expect(res.data?.data.name).toBe('Express');
  });

  it('cross-site rejection — A cannot add rates to B\'s zone', async () => {
    const B = await sessionForNewClientUser('store-rate-create-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bZone = await seedZone(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(aSite), zoneId: String(bZone.id) },
        body: { name: 'Sneak', price: 100 },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.shipping_rates WHERE zone_id = ${bZone.id}
    `;
    expect(rows.length).toBe(0);
  });
});
