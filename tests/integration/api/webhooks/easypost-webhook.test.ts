/**
 * POST /api/webhooks/easypost?websiteId=<id>
 *
 * Public (no NextAuth) endpoint that ingests EasyPost tracker / shipment
 * webhooks. The tests below exercise:
 *   - Missing tenant id → 400
 *   - Valid HMAC + in_transit → order.status='shipped', shippedAt set
 *   - Valid HMAC + delivered → order.status='delivered', shippedAt backfilled
 *   - Replay (same eventId) → 200 { duplicate: true }, no new history row
 *   - Invalid HMAC → 401, no event row inserted
 *   - Order match by trackingNumber when shipmentId is absent
 *
 * The handler does NOT call the EasyPost HTTP API — HMAC is verified locally
 * against the per-site webhookSecret — so no fetch mock is required here.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';

// The webhook handler reads the stored ciphertext via resolveProvider, which
// calls decryptApiKey. Set ENCRYPTION_KEY before any module that uses the
// crypto helper is imported.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
// auth is unused by the public webhook handler but the mock is wired to
// match the shape of all other integration tests in this directory.
void (auth as unknown as Mock);

import { encryptApiKey } from '@/lib/crypto/api-key';
import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

const FIXTURE_API_KEY = 'EZTK_test_abcdef1234567890SUFFIX';
const WEBHOOK_SECRET = 'whsec_test_secret_value_12345';

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedStoreSettings(siteId: number, opts?: { webhookSecret?: string | null }): Promise<void> {
  const sql = getTestSql();
  const encrypted = encryptApiKey(FIXTURE_API_KEY);
  const secret = opts?.webhookSecret === null ? null : (opts?.webhookSecret ?? WEBHOOK_SECRET);
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (
      website_id, shipping_provider, easypost_api_key_encrypted, easypost_mode, easypost_webhook_secret
    )
    VALUES (${siteId}, 'easypost', ${encrypted}, 'test', ${secret})
  `;
}

interface SeedOrderOpts {
  shipmentId?: string | null;
  trackingNumber?: string | null;
  status?: string;
  shippedAt?: Date | null;
}
async function seedOrder(siteId: number, opts: SeedOrderOpts = {}): Promise<{ id: number; orderNumber: string }> {
  const sql = getTestSql();
  const num = `ORD-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number; order_number: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.orders (
      website_id, order_number, customer_email, customer_name,
      subtotal, total, status, easypost_shipment_id, tracking_number, shipped_at
    )
    VALUES (
      ${siteId}, ${num}, 'buyer@example.test', 'Buyer',
      1000, 1000, ${opts.status ?? 'paid'},
      ${opts.shipmentId ?? null}, ${opts.trackingNumber ?? null}, ${opts.shippedAt ?? null}
    )
    RETURNING id, order_number
  `;
  return { id: row.id, orderNumber: row.order_number };
}

function signPayload(secret: string, rawBody: string): string {
  return `hmac-sha256-hex=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

function buildPayload(opts: {
  eventId: string;
  description?: string;
  shipmentId?: string;
  trackingCode?: string;
  status?: string;
  updatedAt?: string;
  trackerId?: string;
}): string {
  return JSON.stringify({
    id: opts.eventId,
    object: 'Event',
    description: opts.description ?? 'tracker.updated',
    result: {
      object: 'Tracker',
      id: opts.trackerId ?? 'trk_1',
      shipment_id: opts.shipmentId,
      tracking_code: opts.trackingCode,
      status: opts.status,
      updated_at: opts.updatedAt ?? '2026-05-19T12:00:00Z',
    },
  });
}

async function postWebhook(rawBody: string, websiteId: number | null, signature: string | undefined) {
  const route = await import('@/app/api/webhooks/easypost/route');
  const url = websiteId === null
    ? 'http://localhost:3000/api/webhooks/easypost'
    : `http://localhost:3000/api/webhooks/easypost?websiteId=${websiteId}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-hmac-signature'] = signature;
  return callHandler<{ success: boolean; message?: string; data?: { duplicate?: boolean; eventId?: string; orderId?: number | null } }>(
    route as unknown as Record<string, unknown>,
    'POST',
    { url, body: rawBody, headers },
  );
}

describe('POST /api/webhooks/easypost @webhooks @store @easypost', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('easypost-webhook');
  });

  it('400 when websiteId query param is missing', async () => {
    const rawBody = buildPayload({ eventId: 'evt_missing', shipmentId: 'shp_x', trackingCode: '1Z123', status: 'in_transit' });
    const res = await postWebhook(rawBody, null, signPayload(WEBHOOK_SECRET, rawBody));
    expect(res.status).toBe(400);
  });

  it('valid HMAC + in_transit + matching easypostShipmentId — marks order shipped', async () => {
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const order = await seedOrder(siteId, { shipmentId: 'shp_abc', status: 'paid' });

    const rawBody = buildPayload({
      eventId: 'evt_1',
      description: 'tracker.updated',
      shipmentId: 'shp_abc',
      trackingCode: '1Z_in_transit',
      status: 'in_transit',
    });
    const res = await postWebhook(rawBody, siteId, signPayload(WEBHOOK_SECRET, rawBody));
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.duplicate).toBeUndefined();

    const sql = getTestSql();
    const [o] = await sql<{
      status: string;
      shipped_at: Date | null;
      latest_tracking_status: string | null;
    }[]>`
      SELECT status, shipped_at, latest_tracking_status
      FROM ${sql(TEST_SCHEMA)}.orders WHERE id = ${order.id}
    `;
    expect(o.status).toBe('shipped');
    expect(o.shipped_at).not.toBeNull();
    expect(o.latest_tracking_status).toBe('in_transit');

    const events = await sql<{ event_id: string; order_id: number | null }[]>`
      SELECT event_id, order_id FROM ${sql(TEST_SCHEMA)}.easypost_events WHERE event_id = 'evt_1'
    `;
    expect(events.length).toBe(1);
    expect(events[0].order_id).toBe(order.id);

    const history = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE order_id = ${order.id}
    `;
    expect(history.length).toBe(1);
    expect(history[0].status).toBe('in_transit');
  });

  it('valid HMAC + delivered — sets deliveredAt + backfills shippedAt', async () => {
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    // paid order, never marked shipped — shipped_at must be backfilled.
    const order = await seedOrder(siteId, { shipmentId: 'shp_del', status: 'paid', shippedAt: null });

    const rawBody = buildPayload({
      eventId: 'evt_delivered',
      description: 'tracker.updated',
      shipmentId: 'shp_del',
      trackingCode: '1Z_delivered',
      status: 'delivered',
      updatedAt: '2026-05-19T15:30:00Z',
    });
    const res = await postWebhook(rawBody, siteId, signPayload(WEBHOOK_SECRET, rawBody));
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [o] = await sql<{
      status: string;
      shipped_at: Date | null;
      delivered_at: Date | null;
      latest_tracking_status: string | null;
    }[]>`
      SELECT status, shipped_at, delivered_at, latest_tracking_status
      FROM ${sql(TEST_SCHEMA)}.orders WHERE id = ${order.id}
    `;
    expect(o.status).toBe('delivered');
    expect(o.delivered_at).not.toBeNull();
    expect(o.shipped_at).not.toBeNull(); // backfilled
    expect(o.latest_tracking_status).toBe('delivered');
  });

  it('replay (same eventId) returns duplicate:true and does not double-write history', async () => {
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const order = await seedOrder(siteId, { shipmentId: 'shp_dup', status: 'paid' });

    const rawBody = buildPayload({
      eventId: 'evt_dup',
      description: 'tracker.updated',
      shipmentId: 'shp_dup',
      trackingCode: '1Z_dup',
      status: 'in_transit',
    });
    const sig = signPayload(WEBHOOK_SECRET, rawBody);

    const r1 = await postWebhook(rawBody, siteId, sig);
    expect(r1.status).toBe(200);
    expect(r1.data?.data?.duplicate).toBeUndefined();

    const r2 = await postWebhook(rawBody, siteId, sig);
    expect(r2.status).toBe(200);
    expect(r2.data?.data?.duplicate).toBe(true);

    const sql = getTestSql();
    const history = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE order_id = ${order.id}
    `;
    expect(history.length).toBe(1); // not 2

    const events = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.easypost_events WHERE event_id = 'evt_dup'
    `;
    expect(events.length).toBe(1);
  });

  it('invalid HMAC → 401 and persists nothing', async () => {
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const order = await seedOrder(siteId, { shipmentId: 'shp_bad', status: 'paid' });

    const rawBody = buildPayload({
      eventId: 'evt_bad',
      shipmentId: 'shp_bad',
      trackingCode: '1Z_bad',
      status: 'in_transit',
    });
    // signature signed with a DIFFERENT secret
    const badSig = signPayload('totally-different-secret', rawBody);

    const res = await postWebhook(rawBody, siteId, badSig);
    expect(res.status).toBe(401);

    const sql = getTestSql();
    const events = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.easypost_events WHERE event_id = 'evt_bad'
    `;
    expect(events.length).toBe(0);

    const [o] = await sql<{ status: string; shipped_at: Date | null }[]>`
      SELECT status, shipped_at FROM ${sql(TEST_SCHEMA)}.orders WHERE id = ${order.id}
    `;
    expect(o.status).toBe('paid');
    expect(o.shipped_at).toBeNull();
  });

  it('matches order by trackingNumber when easypostShipmentId is not set on the order', async () => {
    const { siteId } = await seedSite(A);
    await seedStoreSettings(siteId);
    const order = await seedOrder(siteId, {
      shipmentId: null,
      trackingNumber: '1Z123_TRACKONLY',
      status: 'paid',
    });

    const rawBody = buildPayload({
      eventId: 'evt_track_match',
      shipmentId: 'shp_only_in_payload', // no matching order for this shipment id
      trackingCode: '1Z123_TRACKONLY',
      status: 'in_transit',
    });
    const res = await postWebhook(rawBody, siteId, signPayload(WEBHOOK_SECRET, rawBody));
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const events = await sql<{ order_id: number | null }[]>`
      SELECT order_id FROM ${sql(TEST_SCHEMA)}.easypost_events WHERE event_id = 'evt_track_match'
    `;
    expect(events.length).toBe(1);
    expect(events[0].order_id).toBe(order.id);

    const history = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.order_status_history WHERE order_id = ${order.id}
    `;
    expect(history.length).toBe(1);
  });
});
