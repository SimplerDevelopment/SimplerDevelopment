/**
 * POST /api/webhooks/easypost?websiteId=<id>
 *
 * Public (no NextAuth) webhook endpoint for EasyPost tracker / shipment
 * events. The tenant is identified via the `websiteId` query string we
 * encode when registering the URL with EasyPost — their payload has no
 * room for our tenant id.
 *
 * Flow:
 *   1. Resolve provider for the website → 400 if not configured.
 *   2. Verify HMAC via `provider.parseWebhook` → 401 on bad signature.
 *   3. Idempotency: unique index on `easypost_events.event_id` is the
 *      authoritative guard; we both pre-check and catch the 23505 race.
 *   4. Best-effort order match by `easypost_shipment_id` then by
 *      `tracking_number` (tenant-scoped).
 *   5. Persist event + apply status transitions (shipped / delivered)
 *      and append an `order_status_history` row with `changedBy = null`.
 *
 * EasyPost retries non-2xx responses, so we ALWAYS return 200 once the
 * event row is persisted — only auth / config failures surface as
 * non-2xx (and that's intentional so misconfiguration is visible).
 */

import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { easypostEvents, orders, orderStatusHistory } from '@/lib/db/schema';
import {
  resolveProvider,
  CarrierProviderError,
  type ParsedWebhookEvent,
  type TrackingStatus,
} from '@/lib/shipping/providers';

export const runtime = 'nodejs';

const TRANSIT_STATUSES: TrackingStatus[] = ['in_transit', 'out_for_delivery'];

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const direct = (err as { code?: unknown }).code;
  if (direct === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object' && (cause as { code?: unknown }).code === '23505') return true;
  return false;
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function POST(req: Request) {
  // 1. Tenant id from query string.
  const { searchParams } = new URL(req.url);
  const websiteIdRaw = searchParams.get('websiteId');
  const websiteId = websiteIdRaw ? Number(websiteIdRaw) : NaN;
  if (!websiteIdRaw || !Number.isFinite(websiteId) || !Number.isInteger(websiteId)) {
    return fail('websiteId query param required', 400);
  }

  // Read raw body BEFORE any other work so HMAC has the unmodified bytes.
  const rawBody = await req.text();

  // 2. Resolve provider (gets us the per-tenant webhook secret).
  const resolved = await resolveProvider(websiteId);
  if (!resolved) {
    return fail('EasyPost not configured for this site', 400);
  }

  // 3. Verify signature + parse.
  const signature = req.headers.get('x-hmac-signature') ?? undefined;
  let parsed: ParsedWebhookEvent;
  try {
    parsed = await resolved.provider.parseWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof CarrierProviderError) {
      if (err.code === 'auth')   return fail('Invalid signature', 401);
      if (err.code === 'config') return fail('Webhook secret not configured', 500);
      return fail(err.message, 400);
    }
    return fail(err instanceof Error ? err.message : 'invalid payload', 400);
  }

  // 4. Idempotency pre-check. The unique index is still the source of truth,
  //    but a fast pre-check avoids spamming the DB log with constraint errors
  //    in the (common) retry case.
  const [existing] = await db
    .select({ eventId: easypostEvents.eventId })
    .from(easypostEvents)
    .where(eq(easypostEvents.eventId, parsed.eventId))
    .limit(1);
  if (existing) {
    return NextResponse.json({
      success: true,
      data: { duplicate: true, eventId: parsed.eventId },
    });
  }

  // 5. Find the related order, tenant-scoped. Prefer shipment id; fall back
  //    to tracking number; otherwise leave null (still record for forensics).
  let orderId: number | null = null;
  if (parsed.shipmentId) {
    const [byShipment] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.websiteId, websiteId), eq(orders.easypostShipmentId, parsed.shipmentId)))
      .limit(1);
    if (byShipment) orderId = byShipment.id;
  }
  if (orderId === null && parsed.trackingNumber) {
    const [byTracking] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.websiteId, websiteId), eq(orders.trackingNumber, parsed.trackingNumber)))
      .limit(1);
    if (byTracking) orderId = byTracking.id;
  }

  // 6. Persist the event. Unique-constraint race → treat as duplicate.
  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(rawBody);
  } catch {
    // parseWebhook already succeeded, so the body is JSON — but be defensive.
    payloadJson = { raw: rawBody };
  }

  try {
    await db.insert(easypostEvents).values({
      websiteId,
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      shipmentId: parsed.shipmentId ?? null,
      trackerId: parsed.trackerId ?? null,
      orderId,
      payload: payloadJson as Record<string, unknown>,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({
        success: true,
        data: { duplicate: true, eventId: parsed.eventId },
      });
    }
    throw err;
  }

  // 7. Apply status transition to the order if we matched one.
  if (orderId !== null && parsed.trackingStatus) {
    const [current] = await db
      .select({
        status: orders.status,
        shippedAt: orders.shippedAt,
        deliveredAt: orders.deliveredAt,
        trackingNumber: orders.trackingNumber,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (current) {
      const eventAt = parsed.trackingEventAt ? new Date(parsed.trackingEventAt) : new Date();
      const updates: Partial<typeof orders.$inferInsert> = {
        latestTrackingStatus: parsed.trackingStatus,
        latestTrackingEventAt: eventAt,
        updatedAt: new Date(),
      };

      if (parsed.trackingNumber && !current.trackingNumber) {
        updates.trackingNumber = parsed.trackingNumber;
      }

      if (
        TRANSIT_STATUSES.includes(parsed.trackingStatus) &&
        current.status !== 'shipped' &&
        current.status !== 'delivered'
      ) {
        updates.status = 'shipped';
        if (!current.shippedAt) updates.shippedAt = eventAt;
      }

      if (parsed.trackingStatus === 'delivered' && current.status !== 'delivered') {
        updates.status = 'delivered';
        if (!current.deliveredAt) updates.deliveredAt = eventAt;
        if (!current.shippedAt)   updates.shippedAt   = eventAt;
      }

      await db.update(orders).set(updates).where(eq(orders.id, orderId));

      await db.insert(orderStatusHistory).values({
        orderId,
        status: parsed.trackingStatus,
        note: `EasyPost ${parsed.eventType}`,
        changedBy: null,
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: { eventId: parsed.eventId, orderId },
  });
}
