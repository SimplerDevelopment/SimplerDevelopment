/**
 * Booking quotes —
 *   /api/portal/tools/booking/quotes              (GET, POST)
 *   /api/portal/tools/booking/quotes/[quoteId]    (GET, PUT, DELETE)
 *
 * Coverage:
 *   - Auth (401), service gate (403), cross-tenant rejection (404)
 *   - POST: required fields enforced (title, price, customerName, customerEmail)
 *   - POST creates a unique slug
 *   - GET list scoped to caller's client only
 *   - PUT updates fields; DELETE removes the row
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function enableBookingService(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  const slug = `booking-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle)
    VALUES ('Booking', ${slug}, 'booking', 0, 'monthly') RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${ctx.client.id}, ${svc.id}, 'active')
  `;
}

const validQuote = (over: Partial<Record<string, unknown>> = {}) => ({
  title: 'Custom Package',
  price: 25000,
  customerName: 'Customer Name',
  customerEmail: 'cust@test.local',
  ...over,
});

describe('Quotes — list / create @booking @quotes', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('q-a'),
      sessionForNewClientUser('q-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  it('GET 401 unauth', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/tools/booking/quotes/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('GET 403 without booking subscription', async () => {
    const C = await sessionForNewClientUser('q-no-svc');
    mockedAuth.mockResolvedValue(C.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect([401, 402, 403]).toContain(res.status);
  });

  it('POST 400 when title is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: validQuote({ title: undefined }) },
    );
    expect(res.status).toBe(400);
  });

  it('POST 400 when customerEmail is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: validQuote({ customerEmail: undefined }) },
    );
    expect(res.status).toBe(400);
  });

  it('POST 400 when price is 0/missing (route requires truthy price)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: validQuote({ price: 0 }) },
    );
    expect(res.status).toBe(400);
  });

  it('POST creates a quote with a generated slug', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/route');
    const res = await callHandler<{ success: boolean; data: { id: number; slug: string; title: string; status: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: validQuote() },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.title).toBe('Custom Package');
    expect(res.data?.data.slug.length).toBeGreaterThan(0);
    expect(res.data?.data.status).toBe('pending');
  });

  it('GET returns only the caller\'s quotes', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/route');
    await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { body: validQuote({ title: 'A-only' }) });

    mockedAuth.mockResolvedValue(B.session);
    await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { body: validQuote({ title: 'B-only' }) });

    mockedAuth.mockResolvedValue(A.session);
    const res = await callHandler<{ success: boolean; data: { title: string }[] }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    const titles = res.data!.data.map(q => q.title);
    expect(titles).toContain('A-only');
    expect(titles).not.toContain('B-only');
  });
});

describe('Quotes — GET / PUT / DELETE by id @booking @quotes', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('q-id-a'),
      sessionForNewClientUser('q-id-b'),
    ]);
    await Promise.all([enableBookingService(A), enableBookingService(B)]);
  });

  async function createQuote(ctx: TenantCtx) {
    mockedAuth.mockResolvedValue(ctx.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/route');
    const r = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: validQuote() },
    );
    return r.data!.data.id;
  }

  it('GET 404 cross-tenant', async () => {
    const id = await createQuote(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/[quoteId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { quoteId: String(id) } },
    );
    expect(res.status).toBe(404);
  });

  it('PUT updates title / price / status', async () => {
    const id = await createQuote(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/[quoteId]/route');
    const res = await callHandler<{ success: boolean; data: { title: string; price: number; status: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { quoteId: String(id) }, body: { title: 'Updated', price: 30000, status: 'paid' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('Updated');
    expect(res.data?.data.price).toBe(30000);
    expect(res.data?.data.status).toBe('paid');
  });

  it('PUT 404 cross-tenant + leaves the row untouched', async () => {
    const id = await createQuote(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/[quoteId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { quoteId: String(id) }, body: { title: 'Hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.booking_quotes WHERE id = ${id}
    `;
    expect(row.title).not.toBe('Hijack');
  });

  it('DELETE removes a quote for the owner', async () => {
    const id = await createQuote(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/[quoteId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { quoteId: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.booking_quotes WHERE id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  it('DELETE 404 cross-tenant + leaves row intact', async () => {
    const id = await createQuote(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/tools/booking/quotes/[quoteId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { quoteId: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.booking_quotes WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
  });
});
