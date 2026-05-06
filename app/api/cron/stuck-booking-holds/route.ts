import { NextResponse } from 'next/server';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, bookingPages, clients, crmNotifications } from '@/lib/db/schema';
import { createCrmNotification } from '@/lib/crm/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: detect bookings stuck in a "pending payment" state for 24+ hours.
 *
 * PREVIEW MODE — this handler ONLY notifies the venue/page owner. It does
 * NOT cancel the booking or release inventory. Auto-release will land in a
 * follow-up once the detection has been observed in production for a while.
 *
 * Schema notes (cross-checked against lib/db/schema/tools.ts):
 *   - bookings.status enum: confirmed | cancelled | completed | no_show
 *     ("confirmed" is the default — there is no separate "hold" status; an
 *     unpaid hold is encoded via paymentStatus, not status.)
 *   - bookings.paymentStatus enum: free | pending | paid | refunded
 *     ("pending" = stripe PI created, not yet captured. This is the value
 *     that means "payment hold not yet captured".)
 *   - bookings.paidAt is set when payment lands; null while pending.
 *   - bookings.createdAt is the row creation timestamp.
 *   - bookings.clientId is denormalized on the booking itself (no join needed
 *     to resolve tenant), but we still join bookingPages to find the owner
 *     user to notify (bookingPages.createdBy → users.id, nullable).
 *   - When bookingPages.createdBy is null we fall back to clients.userId
 *     (the legacy single-owner pointer on the clients table — non-null).
 *
 * Window: created_at in [now-7d, now-24h]. The 7-day floor keeps us from
 * re-alerting forever on ancient stuck rows that nobody is going to act on.
 *
 * De-dupe: skip if a `booking_hold_stuck` notification already exists for
 * the same booking entityId within the last 24h.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Run frequency: every 30 minutes (configured in vercel.json — not modified
 * by this PR; the schedule entry is added separately).
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const t0 = Date.now();
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Pull candidate bookings + the join data we need for notification.
  const candidates = await db
    .select({
      bookingId: bookings.id,
      clientId: bookings.clientId,
      bookingPageId: bookings.bookingPageId,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      startTime: bookings.startTime,
      total: bookings.total,
      paymentStatus: bookings.paymentStatus,
      paidAt: bookings.paidAt,
      stripePaymentIntentId: bookings.stripePaymentIntentId,
      createdAt: bookings.createdAt,
      pageTitle: bookingPages.title,
      pageOwnerUserId: bookingPages.createdBy,
      clientLegacyOwnerUserId: clients.userId,
    })
    .from(bookings)
    .innerJoin(bookingPages, eq(bookings.bookingPageId, bookingPages.id))
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(
      and(
        eq(bookings.paymentStatus, 'pending'),
        isNull(bookings.paidAt),
        // Defensive: don't bug owners about already-cancelled rows even if
        // paymentStatus somehow stayed at 'pending'.
        sql`${bookings.status} <> 'cancelled'`,
        lt(bookings.createdAt, cutoff24h),
        gt(bookings.createdAt, cutoff7d),
      ),
    );

  const scanned = candidates.length;
  let matched = 0;
  let notified = 0;
  let skippedDup = 0;

  // De-dupe cutoff: any prior notification of this type within the last 24h.
  const dupCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const c of candidates) {
    matched += 1;

    // Resolve the user to notify. Prefer the booking-page creator; fall back
    // to the client's legacy primary owner. Both nullable / non-null cases
    // covered — clients.userId is NOT NULL per schema, so this should always
    // resolve to a real user.
    const recipientUserId = c.pageOwnerUserId ?? c.clientLegacyOwnerUserId;
    if (!recipientUserId) {
      // Shouldn't happen given the schema, but skip rather than crash.
      continue;
    }

    // De-dupe: existing booking_hold_stuck notification for this booking in
    // the last 24h?
    const [existing] = await db
      .select({ id: crmNotifications.id })
      .from(crmNotifications)
      .where(
        and(
          eq(crmNotifications.type, 'booking_hold_stuck'),
          eq(crmNotifications.entityType, 'booking'),
          eq(crmNotifications.entityId, c.bookingId),
          gt(crmNotifications.createdAt, dupCutoff),
        ),
      )
      .limit(1);

    if (existing) {
      skippedDup += 1;
      continue;
    }

    const ageHours = Math.floor(
      (now.getTime() - new Date(c.createdAt).getTime()) / (60 * 60 * 1000),
    );

    const bodyLines: string[] = [];
    bodyLines.push(`Service: ${c.pageTitle}`);
    bodyLines.push(
      `Guest: ${c.guestName}${c.guestEmail ? ` <${c.guestEmail}>` : ''}`,
    );
    if (c.startTime) {
      bodyLines.push(`Scheduled for: ${new Date(c.startTime).toISOString()}`);
    }
    if (typeof c.total === 'number' && c.total > 0) {
      bodyLines.push(`Total: $${(c.total / 100).toFixed(2)}`);
    }
    bodyLines.push(`Payment status: ${c.paymentStatus} (no paidAt)`);
    if (c.stripePaymentIntentId) {
      bodyLines.push(`Stripe PI: ${c.stripePaymentIntentId}`);
    }
    bodyLines.push(`Pending for ~${ageHours}h since createdAt.`);
    bodyLines.push(
      'PREVIEW MODE: this booking has NOT been auto-cancelled. Review and decide manually.',
    );

    await createCrmNotification({
      clientId: c.clientId,
      userId: recipientUserId,
      type: 'booking_hold_stuck',
      title: `Booking #${c.bookingId} — payment pending for 24+ hours`,
      body: bodyLines.join('\n'),
      entityType: 'booking',
      entityId: c.bookingId,
    });

    notified += 1;
  }

  const durationMs = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: {
      scanned,
      matched,
      notified,
      skippedDup,
      durationMs,
      mode: 'preview',
    },
  });
}
