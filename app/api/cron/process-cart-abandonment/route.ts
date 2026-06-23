import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { carts, cartItems, orders, clientWebsites } from '@/lib/db/schema';
import { and, eq, gt, isNotNull, sql, inArray } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation/event-bus';
import { sendCartRecoveryEmail } from '@/lib/email/cart-recovery-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


/** How long the recovery token is valid (ms). */
const RECOVERY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Cron: detect carts that have been active but idle for ≥1 hour, have at least
 * one item, and have no paid order for the same website+email since the cart
 * was last updated.  Marks each as 'abandoned', mints a recovery token, and
 * emits a `cart.abandoned` automation event.
 *
 * Auth: Vercel cron header (`x-vercel-cron: 1`) OR
 *       `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Runs every 30 minutes (vercel.json: path /api/cron/process-cart-abandonment, schedule: every 30 min).
 */
async function _GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();

  // 1. Find candidate carts: active, idle ≥1h, have a customerEmail.
  //    We do a coarse scan here; the anti-duplication guard (no paid order)
  //    is applied per cart below.
  const candidates = await db
    .select({
      id: carts.id,
      websiteId: carts.websiteId,
      customerEmail: carts.customerEmail,
      updatedAt: carts.updatedAt,
    })
    .from(carts)
    .where(
      and(
        eq(carts.status, 'active'),
        isNotNull(carts.customerEmail),
        // Compare against the DB clock, not a JS Date — carts.updated_at is
        // `timestamp without time zone`, so a JS Date param would be offset by
        // the session timezone and wrongly flag fresh carts.
        sql`${carts.updatedAt} < now() - interval '1 hour'`,
      ),
    )
    .limit(200);

  if (candidates.length === 0) {
    return NextResponse.json({ success: true, data: { abandoned: 0, ids: [] } });
  }

  // 2. Filter to carts that actually have ≥1 cart_items row.
  const candidateIds = candidates.map((c) => c.id);
  const cartsWithItems = await db
    .selectDistinct({ cartId: cartItems.cartId })
    .from(cartItems)
    .where(inArray(cartItems.cartId, candidateIds));

  const cartIdsWithItems = new Set(cartsWithItems.map((r) => r.cartId));
  const eligible = candidates.filter((c) => cartIdsWithItems.has(c.id));

  if (eligible.length === 0) {
    return NextResponse.json({ success: true, data: { abandoned: 0, ids: [] } });
  }

  // 3. For each eligible cart: check there is no paid order for same
  //    website+email placed after updatedAt.  Process one at a time to keep
  //    the logic clear (batch size is ≤200 above).
  const abandonedIds: number[] = [];

  for (const cart of eligible) {
    const email = cart.customerEmail!;

    // Check for a paid order placed after this cart was last updated.
    const [paidOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.websiteId, cart.websiteId),
          eq(orders.customerEmail, email),
          eq(orders.paymentStatus, 'paid'),
          // Order was paid after the cart was last active — strong enough guard.
          gt(orders.paidAt, cart.updatedAt),
        ),
      )
      .limit(1);

    if (paidOrder) {
      // Customer completed a purchase — leave cart alone (will be marked
      // converted via the webhook on the next tick if not already).
      continue;
    }

    // 4. Mint a recovery token and mark the cart abandoned.
    const recoveryToken = randomBytes(40).toString('hex'); // 80-char hex string
    const recoveryTokenExpiresAt = new Date(now.getTime() + RECOVERY_TOKEN_TTL_MS);

    await db
      .update(carts)
      .set({
        status: 'abandoned',
        recoveryToken,
        recoveryTokenExpiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(carts.id, cart.id),
          eq(carts.status, 'active'), // CAS: don't overwrite if already abandoned
        ),
      );

    abandonedIds.push(cart.id);

    // 5. Fetch item count + cart value for the event payload.
    const itemRows = await db
      .select({
        quantity: cartItems.quantity,
        unitPrice: cartItems.unitPrice,
      })
      .from(cartItems)
      .where(eq(cartItems.cartId, cart.id));

    const itemCount = itemRows.reduce((sum, r) => sum + r.quantity, 0);
    const cartValue = itemRows.reduce((sum, r) => sum + r.quantity * r.unitPrice, 0);

    // 6. Resolve clientId from clientWebsites for the event bus.
    const [website] = await db
      .select({ clientId: clientWebsites.clientId })
      .from(clientWebsites)
      .where(eq(clientWebsites.id, cart.websiteId))
      .limit(1);

    const clientId = website?.clientId ?? 0;

    // 7. Emit the automation event (fire-and-forget).
    emitEvent('cart.abandoned', clientId, 0, {
      cartId: cart.id,
      websiteId: cart.websiteId,
      customerEmail: email,
      recoveryToken,
      itemCount,
      cartValue,
    });

    // 8. Send the recovery email (best-effort) and stamp recovery_email_sent_at
    //    so we don't re-email the same cart on a later tick.
    try {
      await sendCartRecoveryEmail({
        to: email,
        websiteId: cart.websiteId,
        recoveryToken,
        itemCount,
        cartValue,
      });
    } catch (err) {
      console.error(`[cart-abandonment] recovery email failed for cart ${cart.id}`, err);
    }
    await db.update(carts).set({ recoveryEmailSentAt: now }).where(eq(carts.id, cart.id));
  }

  return NextResponse.json({
    success: true,
    data: {
      abandoned: abandonedIds.length,
      ids: abandonedIds,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-cart-abandonment', area: 'api-cron' },
  _GET,
);
