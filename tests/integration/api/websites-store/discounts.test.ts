/**
 * Portal websites — STORE discount codes (POST/PUT/DELETE).
 *
 * Cross-site rejection: A cannot read/write/delete B's discount codes even
 * when guessing the discountId.
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

async function seedDiscount(siteId: number, code?: string): Promise<{ id: number; code: string }> {
  const sql = getTestSql();
  const c = (code ?? `D${Date.now()}${Math.floor(Math.random() * 9999)}`).toUpperCase();
  const [row] = await sql<{ id: number; code: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.discount_codes (website_id, code, discount_type, amount, applicable_to)
    VALUES (${siteId}, ${c}, 'percent', 10, 'both')
    RETURNING id, code
  `;
  return row;
}

describe('POST /api/portal/websites/[siteId]/store/discounts @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-disc-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { code: 'X', discountType: 'percent', amount: 10 } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when required fields are missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: { code: 'NOTYPE' } },
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path — code uppercased + scoped to caller\'s site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/route');
    const res = await callHandler<{ success: boolean; data: { code: string; websiteId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { code: 'spring10', discountType: 'percent', amount: 10 },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.code).toBe('SPRING10');
    expect(res.data?.data.websiteId).toBe(siteId);
  });

  it('409 on duplicate code in the same site', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const code = `DUP${Date.now()}`;
    await seedDiscount(siteId, code);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId) },
        body: { code, discountType: 'fixed_amount', amount: 500 },
      },
    );
    expect(res.status).toBe(409);
  });

  it('cross-site rejection — A cannot create discount under B\'s site', async () => {
    const B = await sessionForNewClientUser('store-disc-create-b');
    const { siteId: bSite } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(bSite) },
        body: { code: 'HIJACK', discountType: 'percent', amount: 50 },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.discount_codes WHERE website_id = ${bSite}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('PUT /api/portal/websites/[siteId]/store/discounts/[discountId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-disc-update'); });

  it('happy path — updates description + amount', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const d = await seedDiscount(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/[discountId]/route');
    const res = await callHandler<{ success: boolean; data: { amount: number; description: string | null } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), discountId: String(d.id) },
        body: { description: 'spring sale', amount: 25 },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.amount).toBe(25);
    expect(res.data?.data.description).toBe('spring sale');
  });

  it('404 on missing discountId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/[discountId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), discountId: '999999' }, body: { amount: 1 } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-site rejection — A cannot mutate B\'s discount via A\'s siteId', async () => {
    const B = await sessionForNewClientUser('store-disc-update-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bDiscount = await seedDiscount(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/[discountId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(aSite), discountId: String(bDiscount.id) },
        body: { amount: 99 },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [check] = await sql<{ amount: number }[]>`
      SELECT amount FROM ${sql(TEST_SCHEMA)}.discount_codes WHERE id = ${bDiscount.id}
    `;
    expect(check.amount).toBe(10);
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/discounts/[discountId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-disc-delete'); });

  it('happy path — deletes', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const d = await seedDiscount(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/[discountId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), discountId: String(d.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.discount_codes WHERE id = ${d.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 on missing discountId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/[discountId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(siteId), discountId: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-site rejection — A cannot delete B\'s discount', async () => {
    const B = await sessionForNewClientUser('store-disc-delete-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bDiscount = await seedDiscount(bSite);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/discounts/[discountId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { siteId: String(aSite), discountId: String(bDiscount.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.discount_codes WHERE id = ${bDiscount.id}
    `;
    expect(rows.length).toBe(1);
  });
});
