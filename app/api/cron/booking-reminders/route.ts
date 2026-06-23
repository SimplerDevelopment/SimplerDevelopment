import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, bookingPages } from '@/lib/db/schema';
import { sendBookingReminder, loadBookingBrand } from '@/lib/email/booking-emails';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: send a single pre-booking reminder email to the guest ~24h before
 * the booking starts.
 *
 * Selection window:
 *   start_time IN (now + REMINDER_LEAD_HOURS_MIN, now + REMINDER_LEAD_HOURS_MAX]
 *   AND reminder_sent_at IS NULL
 *   AND status = 'confirmed'
 *
 * The window is wide on purpose so that even if the cron runs hourly, we
 * never miss a reminder. The de-dupe is enforced by the `reminder_sent_at`
 * column + the partial index on (start_time) WHERE reminder_sent_at IS NULL
 * defined in drizzle/0113_booking_reminder_sent_at.sql.
 *
 * Idempotency: stamp `reminder_sent_at` AFTER a successful send. If Resend
 * throws, we keep `reminder_sent_at` NULL and the next cron tick retries —
 * up to and including the booking start time. The 24h-window cap means we
 * won't keep retrying for days on a permanently-broken send.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Schedule: every 60 minutes. (Vercel cron config lives outside this PR —
 * add `/api/cron/booking-reminders` with `0 * * * *` once this lands.)
 */

const REMINDER_LEAD_HOURS_MIN = 23; // skip reminders for bookings starting in <23h
const REMINDER_LEAD_HOURS_MAX = 25; // pick up bookings starting in 23–25h
const MS_PER_HOUR = 60 * 60 * 1000;

interface ReminderCandidate {
  bookingId: number;
  clientId: number;
  bookingPageId: number;
  guestName: string;
  guestEmail: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  cancelToken: string;
  meetingLink: string | null;
  pageTitle: string;
  pageSlug: string;
  duration: number;
}

async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  const now = new Date();
  const windowMin = new Date(now.getTime() + REMINDER_LEAD_HOURS_MIN * MS_PER_HOUR);
  const windowMax = new Date(now.getTime() + REMINDER_LEAD_HOURS_MAX * MS_PER_HOUR);

  const candidates = await db
    .select({
      bookingId: bookings.id,
      clientId: bookings.clientId,
      bookingPageId: bookings.bookingPageId,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      timezone: bookings.timezone,
      cancelToken: bookings.cancelToken,
      meetingLink: bookings.meetingLink,
      pageTitle: bookingPages.title,
      pageSlug: bookingPages.slug,
      duration: bookingPages.duration,
    })
    .from(bookings)
    .innerJoin(bookingPages, eq(bookings.bookingPageId, bookingPages.id))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        isNull(bookings.reminderSentAt),
        gt(bookings.startTime, windowMin),
        lt(bookings.startTime, windowMax),
      ),
    );

  let sent = 0;
  let failed = 0;

  for (const c of candidates as ReminderCandidate[]) {
    try {
      const brand = await loadBookingBrand(c.bookingPageId);
      await sendBookingReminder({
        guestName: c.guestName,
        guestEmail: c.guestEmail,
        pageTitle: c.pageTitle,
        startTime: c.startTime,
        endTime: c.endTime,
        timezone: c.timezone,
        cancelToken: c.cancelToken,
        bookingSlug: c.pageSlug,
        duration: c.duration,
        meetingLink: c.meetingLink,
        brand,
      });
      await db
        .update(bookings)
        .set({ reminderSentAt: new Date() })
        .where(eq(bookings.id, c.bookingId));
      sent++;
    } catch (err) {
      failed++;
      console.error(`[booking-reminders] send failed for booking ${c.bookingId}`, err);
      // Leave reminder_sent_at NULL — the next cron tick will retry.
    }
  }

  const durationMs = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: {
      scanned: candidates.length,
      sent,
      failed,
      windowMin: windowMin.toISOString(),
      windowMax: windowMax.toISOString(),
      durationMs,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:booking-reminders', area: 'api-cron' },
  _GET,
);
