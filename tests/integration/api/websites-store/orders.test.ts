/**
 * Portal websites — STORE orders (GET list, GET detail, PUT status update).
 *
 * Status transitions trigger transactional email + automation events; we mock
 * those side effects so the test focuses on the data path + cross-site fence.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Stub email + automation side-effects so PUT /orders/:id status transitions
// don't try to send mail or hit the event-bus during tests.
vi.mock('@/lib/email/send-transactional', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email/send-transactional')>('@/lib/email/send-transactional');
  return {
    ...actual,
    sendTransactionalEmail: vi.fn().mockResolvedValue(undefined),
    getWebsiteUrls: vi.fn().mockResolvedValue({
      orderUrl: (n: string) => `https://example.test/orders/${n}`,
      websiteUrl: 'https://example.test',
    }),
  };
});

vi.mock('@/lib/automation/event-bus', () => ({
  emitEvent: vi.fn(),
  onEvent: vi.fn(),
  AUTOMATION_EVENTS: {},
}));

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

async function seedOrder(siteId: number, status = 'pending', orderNumber?: string): Promise<{ id: number; orderNumber: string }> {
  const sql = getTestSql();
  const num = orderNumber ?? `ORD-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number; order_number: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.orders (
      website_id, order_number, customer_email, customer_name,
      subtotal, total, status
    )
    VALUES (${siteId}, ${num}, 'a@b.com', 'Buyer Name', 1000, 1000, ${status})
    RETURNING id, order_number
  `;
  return { id: row.id, orderNumber: row.order_number };
}

describe('GET /api/portal/websites/[siteId]/store/orders @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-orders-list'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(401);
  });

  it('happy path — returns orders scoped to caller\'s site only', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const o = await seedOrder(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/route');
    const res = await callHandler<{ success: boolean; data: { id: number; orderNumber: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.map(o => o.id)).toEqual([o.id]);
  });

  it('cross-site rejection — A cannot list B\'s orders', async () => {
    const B = await sessionForNewClientUser('store-orders-list-b');
    const { siteId: bSite } = await seedSite(B);
    await seedOrder(bSite);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(bSite) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/portal/websites/[siteId]/store/orders/[orderId] @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-orders-update'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const o = await seedOrder(siteId);
    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), orderId: String(o.id) }, body: { status: 'shipped' } },
    );
    expect(res.status).toBe(401);
  });

  it('404 on missing orderId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId), orderId: '999999' }, body: { status: 'shipped' } },
    );
    expect(res.status).toBe(404);
  });

  it('happy path — status transition recorded; orderStatusHistory row inserted', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const o = await seedOrder(siteId, 'pending');
    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/route');
    const res = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId), orderId: String(o.id) },
        body: { status: 'shipped', trackingNumber: 'TRK1', trackingUrl: 'https://carrier/track/TRK1' },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('shipped');

    const sql = getTestSql();
    const history = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE order_id = ${o.id}
    `;
    expect(history.map(h => h.status)).toContain('shipped');
  });

  it('cross-site rejection — A cannot update B\'s order via A\'s siteId', async () => {
    const B = await sessionForNewClientUser('store-orders-update-b');
    const { siteId: aSite } = await seedSite(A);
    const { siteId: bSite } = await seedSite(B);
    const bOrder = await seedOrder(bSite, 'pending');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(aSite), orderId: String(bOrder.id) },
        body: { status: 'cancelled' },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [check] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.orders WHERE id = ${bOrder.id}
    `;
    expect(check.status).toBe('pending');
  });
});
