/**
 * POST /api/webhooks/printful?websiteId=<id>
 *
 * Public (no NextAuth) webhook endpoint for Printful fulfillment events.
 * The tenant is identified via the `websiteId` query string encoded when
 * registering the URL with Printful.
 *
 * Flow:
 *   1. Resolve websiteId from query string → 400 if missing/invalid.
 *   2. Read raw body for HMAC verification.
 *   3. Load storeSettings for the website → 200 (skip) if not Printful.
 *   4. Verify x-printful-signature HMAC-SHA256 → 401 on mismatch.
 *   5. Idempotency: insert into printfulEvents; unique constraint → 200.
 *   6. Handle shipment_sent / package_shipped and order_status_changed /
 *      order_updated event types; all others are no-op acknowledged.
 *   7. Return { received: true }.
 *
 * Printful retries non-2xx responses, so once the event row is persisted
 * we always return 200. Auth / config failures surface as non-2xx so
 * misconfiguration stays visible.
 */

import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  orders,
  orderStatusHistory,
  storeSettings,
  printfulEvents,
} from '@/lib/db/schema';
import { decryptApiKey } from '@/lib/crypto/api-key';
import { sendTransactionalEmail } from '@/lib/email/send-transactional';

export const runtime = 'nodejs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const direct = (err as { code?: unknown }).code;
  if (direct === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === 'object' &&
    (cause as { code?: unknown }).code === '23505'
  )
    return true;
  return false;
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // 1. Tenant id from query string.
  const { searchParams } = new URL(req.url);
  const websiteIdRaw = searchParams.get('websiteId');
  const websiteId = websiteIdRaw ? Number(websiteIdRaw) : NaN;
  if (
    !websiteIdRaw ||
    !Number.isFinite(websiteId) ||
    !Number.isInteger(websiteId)
  ) {
    return fail('websiteId query param required', 400);
  }

  // 2. Read raw body BEFORE any other work so HMAC has the unmodified bytes.
  const rawBody = await req.text();

  // 3. Load storeSettings — skip gracefully if Printful not configured.
  const [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, websiteId))
    .limit(1);

  if (!settings || settings.fulfillmentProvider !== 'printful') {
    // Acknowledge so Printful stops retrying; this site just isn't using Printful.
    return NextResponse.json({ received: true });
  }

  // 4. HMAC-SHA256 signature verification.
  //    Printful uses the API key as the webhook signing secret.
  const signature = req.headers.get('x-printful-signature');
  if (settings.printfulApiKeyEncrypted) {
    let apiKey: string;
    try {
      apiKey = decryptApiKey(settings.printfulApiKeyEncrypted);
    } catch {
      console.error('[printful-webhook] Failed to decrypt API key for websiteId', websiteId);
      return fail('Webhook secret misconfigured', 500);
    }

    if (!signature) {
      return fail('Missing x-printful-signature', 401);
    }

    const expected = createHmac('sha256', apiKey)
      .update(rawBody)
      .digest('hex');

    let signatureValid = false;
    try {
      signatureValid = timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      // Buffer lengths differ → invalid
      signatureValid = false;
    }

    if (!signatureValid) {
      return fail('Invalid signature', 401);
    }
  } else {
    console.warn(
      '[printful-webhook] No printfulApiKeyEncrypted for websiteId',
      websiteId,
      '— skipping signature verification',
    );
  }

  // 5. Parse body and extract event id for idempotency.
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return fail('Invalid JSON payload', 400);
  }

  const eventType = typeof body.type === 'string' ? body.type : 'unknown';
  const created =
    typeof body.created === 'number' ? body.created : Date.now();

  // Derive a stable event id: prefer Printful's own event.id, else synthesise one.
  const rawEventId =
    typeof body.id === 'string' || typeof body.id === 'number'
      ? String(body.id)
      : `${eventType}:${created}:${settings.printfulStoreId ?? websiteId}`;

  // Pre-check for duplicate (the unique index is the authoritative guard).
  const [existing] = await db
    .select({ eventId: printfulEvents.eventId })
    .from(printfulEvents)
    .where(eq(printfulEvents.eventId, rawEventId))
    .limit(1);

  if (existing) {
    return NextResponse.json({ received: true });
  }

  // Extract Printful order id from the payload for association.
  const data = (body.data ?? {}) as Record<string, unknown>;
  const orderData = (data.order ?? {}) as Record<string, unknown>;
  const printfulOrderId =
    orderData.id != null ? String(orderData.id) : null;

  // Find matching local order (tenant-scoped).
  let orderId: number | null = null;
  if (printfulOrderId) {
    const [byPrintfulId] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.websiteId, websiteId),
          eq(orders.printfulOrderId, printfulOrderId),
        ),
      )
      .limit(1);
    if (byPrintfulId) orderId = byPrintfulId.id;
  }

  // Persist the event (idempotency guard — unique constraint races handled below).
  try {
    await db.insert(printfulEvents).values({
      websiteId,
      eventId: rawEventId,
      eventType,
      printfulOrderId,
      orderId,
      payload: body,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ received: true });
    }
    throw err;
  }

  // 6. Handle event types.
  switch (eventType) {
    case 'shipment_sent':
    case 'package_shipped': {
      const shipment = (data.shipment ?? {}) as Record<string, unknown>;
      const trackingNumber =
        typeof shipment.tracking_number === 'string'
          ? shipment.tracking_number
          : null;
      const trackingUrl =
        typeof shipment.tracking_url === 'string'
          ? shipment.tracking_url
          : null;

      if (orderId !== null) {
        await db
          .update(orders)
          .set({
            trackingNumber: trackingNumber ?? undefined,
            trackingUrl: trackingUrl ?? undefined,
            shippedAt: new Date(),
            printfulFulfillmentStatus: 'fulfilled',
            latestTrackingStatus: 'pre_transit',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId));

        await db.insert(orderStatusHistory).values({
          orderId,
          status: 'shipped',
          note: `Shipped via Printful – tracking: ${trackingNumber ?? 'N/A'}`,
          changedBy: null,
        });

        // Fire-and-forget shipping notification email.
        const [order] = await db
          .select({
            customerEmail: orders.customerEmail,
            customerName: orders.customerName,
            orderNumber: orders.orderNumber,
          })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);

        if (order) {
          sendTransactionalEmail({
            websiteId,
            event: 'order.shipped',
            to: order.customerEmail,
            variables: {
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              trackingNumber: trackingNumber ?? '',
              trackingUrl: trackingUrl ?? '',
            },
          }).catch((err: unknown) => {
            console.error(
              '[printful-webhook] Failed to send shipping email for order',
              orderId,
              err,
            );
          });
        }
      }
      break;
    }

    case 'order_status_changed':
    case 'order_updated': {
      const newStatus =
        typeof orderData.status === 'string' ? orderData.status : null;

      if (orderId !== null && newStatus) {
        const updates: Partial<typeof orders.$inferInsert> = {
          printfulFulfillmentStatus: newStatus,
          updatedAt: new Date(),
        };

        // Map select Printful statuses onto our local order status.
        if (newStatus === 'fulfilled') {
          updates.status = 'processing';
        } else if (newStatus === 'cancelled') {
          // printfulFulfillmentStatus already set above; no local status change.
        }

        await db.update(orders).set(updates).where(eq(orders.id, orderId));
      }
      break;
    }

    default:
      // All other event types are acknowledged without action.
      break;
  }

  return NextResponse.json({ received: true });
}
