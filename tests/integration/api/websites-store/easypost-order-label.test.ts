/**
 * Portal websites — EasyPost order rates + label routes.
 *
 * Routes covered:
 *   POST   /api/portal/websites/[siteId]/store/orders/[orderId]/rates
 *   POST   /api/portal/websites/[siteId]/store/orders/[orderId]/label
 *   DELETE /api/portal/websites/[siteId]/store/orders/[orderId]/label
 *
 * Unlike the webhook handler, these routes DO call EasyPost over HTTPS — every
 * test that exercises a happy path mocks `globalThis.fetch` to intercept the
 * provider request and synthesise a representative response.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { randomBytes } from 'node:crypto';

// resolveProvider decrypts the stored ciphertext via lib/crypto/api-key, which
// reads ENCRYPTION_KEY at call time. Set it before any module that touches the
// crypto helper is imported.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { encryptApiKey } from '@/lib/crypto/api-key';
import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

const FIXTURE_API_KEY = 'EZTK_test_abcdef1234567890SUFFIX';

const VALID_SHIP_FROM = {
  name: 'Warehouse',
  line1: '100 Sender St',
  city: 'Portland',
  state: 'OR',
  postalCode: '97201',
  country: 'US',
};

const VALID_SHIP_TO = {
  line1: '500 Receiver Ave',
  city: 'Seattle',
  state: 'WA',
  postalCode: '98101',
  country: 'US',
};

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedStoreSettings(
  siteId: number,
  opts: { shipFrom?: typeof VALID_SHIP_FROM | null; defaultParcelWeightOz?: string | null } = {},
): Promise<void> {
  const sql = getTestSql();
  const encrypted = encryptApiKey(FIXTURE_API_KEY);
  const shipFrom = opts.shipFrom === undefined ? VALID_SHIP_FROM : opts.shipFrom;
  const defaultWeight = opts.defaultParcelWeightOz === undefined ? null : opts.defaultParcelWeightOz;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (
      website_id, shipping_provider, easypost_api_key_encrypted, easypost_mode,
      ship_from_address, default_parcel_weight_oz, default_parcel_length_in,
      default_parcel_width_in, default_parcel_height_in
    )
    VALUES (
      ${siteId}, 'easypost', ${encrypted}, 'test',
      ${shipFrom ? sql.json(shipFrom) : null},
      ${defaultWeight}, ${'8'}, ${'6'}, ${'4'}
    )
  `;
}

async function seedProduct(
  siteId: number,
  opts: { weight?: string | null; lengthIn?: string; widthIn?: string; heightIn?: string } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const weight = opts.weight === undefined ? '12' : opts.weight; // 12g default
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.products (
      website_id, name, slug, price, weight, weight_unit, length_in, width_in, height_in
    )
    VALUES (
      ${siteId}, 'Test Product',
      ${`tp-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      1000, ${weight}, 'oz',
      ${opts.lengthIn ?? '6'}, ${opts.widthIn ?? '4'}, ${opts.heightIn ?? '2'}
    )
    RETURNING id
  `;
  return { id: row.id };
}

interface SeedOrderOpts {
  shippingAddress?: typeof VALID_SHIP_TO | null;
  status?: string;
  easypostShipmentId?: string | null;
  labelUrl?: string | null;
  labelPurchasedAt?: Date | null;
  trackingNumber?: string | null;
}
async function seedOrder(siteId: number, opts: SeedOrderOpts = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const num = `ORD-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const shipTo = opts.shippingAddress === undefined ? VALID_SHIP_TO : opts.shippingAddress;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.orders (
      website_id, order_number, customer_email, customer_name,
      shipping_address, subtotal, total, status,
      easypost_shipment_id, label_url, label_purchased_at, tracking_number
    )
    VALUES (
      ${siteId}, ${num}, 'buyer@example.test', 'Buyer',
      ${shipTo ? sql.json(shipTo) : null}, 1000, 1000, ${opts.status ?? 'paid'},
      ${opts.easypostShipmentId ?? null},
      ${opts.labelUrl ?? null},
      ${opts.labelPurchasedAt ?? null},
      ${opts.trackingNumber ?? null}
    )
    RETURNING id
  `;
  return { id: row.id };
}

async function seedOrderItem(orderId: number, productId: number, qty = 1): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.order_items (
      order_id, product_id, product_name, unit_price, quantity, total
    )
    VALUES (${orderId}, ${productId}, 'Test Product', 1000, ${qty}, ${1000 * qty})
  `;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/portal/websites/[siteId]/store/orders/[orderId]/rates @websites @store @easypost', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('order-rates'); });

  it('happy path — returns shipmentId + rates + persists easypostShipmentId on the order', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const product = await seedProduct(siteId);
    const order = await seedOrder(siteId);
    await seedOrderItem(order.id, product.id);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : String(input);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.endsWith('/v2/shipments') && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'shp_x',
          rates: [
            { id: 'rate_1', shipment_id: 'shp_x', carrier: 'USPS', service: 'Priority', rate: '8.50', currency: 'USD', delivery_days: 3 },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/rates/route');
    const res = await callHandler<{
      success: boolean;
      data: { shipmentId: string; parcel: unknown; rates: Array<{ id: string; carrier: string; amountCents: number }> };
    }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { siteId: String(siteId), orderId: String(order.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.shipmentId).toBe('shp_x');
    expect(res.data?.data.rates.length).toBe(1);
    expect(res.data?.data.rates[0].amountCents).toBe(850);
    expect(fetchMock).toHaveBeenCalled();

    const sql = getTestSql();
    const [persisted] = await sql<{ easypost_shipment_id: string | null }[]>`
      SELECT easypost_shipment_id FROM ${sql(TEST_SCHEMA)}.orders WHERE id = ${order.id}
    `;
    expect(persisted.easypost_shipment_id).toBe('shp_x');
  });

  it('400 with code:no_weight when product has no weight AND no default parcel weight', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId, { defaultParcelWeightOz: null });
    const product = await seedProduct(siteId, { weight: null });
    const order = await seedOrder(siteId);
    await seedOrderItem(order.id, product.id);

    // No fetch mock — handler must short-circuit before calling EasyPost.
    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/rates/route');
    const res = await callHandler<{ success: boolean; code?: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { siteId: String(siteId), orderId: String(order.id) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.code).toBe('no_weight');
  });

  it('400 when the order has no shippingAddress', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const product = await seedProduct(siteId);
    const order = await seedOrder(siteId, { shippingAddress: null });
    await seedOrderItem(order.id, product.id);

    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/rates/route');
    const res = await callHandler<{ success: boolean; message?: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { siteId: String(siteId), orderId: String(order.id) } },
    );
    expect(res.status).toBe(400);
    expect((res.data?.message ?? '').toLowerCase()).toMatch(/shipping address/);
  });
});

describe('POST /api/portal/websites/[siteId]/store/orders/[orderId]/label @websites @store @easypost', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('order-label-buy'); });

  it('happy path — persists trackingNumber/carrier/labelUrl/labelCostCents + appends label_purchased history', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const order = await seedOrder(siteId, { easypostShipmentId: 'shp_x' });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : String(input);
      if (/\/v2\/shipments\/shp_x\/buy$/.test(url)) {
        return new Response(JSON.stringify({
          id: 'shp_x',
          tracking_code: '9400123',
          selected_rate: { rate: '8.50', carrier: 'USPS', service: 'Priority' },
          postage_label: { label_url: 'https://easypost.com/labels/x.pdf' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/label/route');
    const res = await callHandler<{ success: boolean; data: { trackingNumber: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        params: { siteId: String(siteId), orderId: String(order.id) },
        body: { rateId: 'rate_1', shipmentId: 'shp_x' },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.trackingNumber).toBe('9400123');

    const sql = getTestSql();
    const [o] = await sql<{
      tracking_number: string | null;
      carrier: string | null;
      shipping_method: string | null;
      label_url: string | null;
      label_cost_cents: number | null;
      label_purchased_at: Date | null;
    }[]>`
      SELECT tracking_number, carrier, shipping_method, label_url, label_cost_cents, label_purchased_at
      FROM ${sql(TEST_SCHEMA)}.orders WHERE id = ${order.id}
    `;
    expect(o.tracking_number).toBe('9400123');
    expect(o.carrier).toBe('USPS');
    expect(o.shipping_method).toBe('USPS Priority');
    expect(o.label_url).toBe('https://easypost.com/labels/x.pdf');
    expect(o.label_cost_cents).toBe(850);
    expect(o.label_purchased_at).not.toBeNull();

    const history = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE order_id = ${order.id}
    `;
    expect(history.some(h => h.status === 'label_purchased')).toBe(true);
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/orders/[orderId]/label @websites @store @easypost', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('order-label-refund'); });

  it('happy path — clears labelUrl/labelPurchasedAt, keeps trackingNumber, appends label_refund_requested with note', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const order = await seedOrder(siteId, {
      easypostShipmentId: 'shp_x',
      labelUrl: 'https://easypost.com/labels/x.pdf',
      labelPurchasedAt: new Date('2026-05-19T10:00:00Z'),
      trackingNumber: '9400123',
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : String(input);
      if (/\/v2\/shipments\/shp_x\/refund$/.test(url)) {
        return new Response(JSON.stringify({ refund_status: 'submitted' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/label/route');
    const res = await callHandler<{ success: boolean; data: { refundStatus: string } }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { siteId: String(siteId), orderId: String(order.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.refundStatus).toBe('submitted');

    const sql = getTestSql();
    const [o] = await sql<{
      label_url: string | null;
      label_purchased_at: Date | null;
      tracking_number: string | null;
    }[]>`
      SELECT label_url, label_purchased_at, tracking_number
      FROM ${sql(TEST_SCHEMA)}.orders WHERE id = ${order.id}
    `;
    expect(o.label_url).toBeNull();
    expect(o.label_purchased_at).toBeNull();
    expect(o.tracking_number).toBe('9400123'); // unchanged

    const history = await sql<{ status: string; note: string | null }[]>`
      SELECT status, note FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE order_id = ${order.id}
    `;
    const refundRow = history.find(h => h.status === 'label_refund_requested');
    expect(refundRow).toBeDefined();
    expect(refundRow?.note).toBe('submitted');
  });

  it('400 when the order has no easypostShipmentId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const order = await seedOrder(siteId, { easypostShipmentId: null });

    const route = await import('@/app/api/portal/websites/[siteId]/store/orders/[orderId]/label/route');
    const res = await callHandler<{ success: boolean; message?: string }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { siteId: String(siteId), orderId: String(order.id) } },
    );
    expect(res.status).toBe(400);
  });
});
