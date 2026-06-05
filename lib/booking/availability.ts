import { db } from '@/lib/db';
import { bookingDateOverrides, bookingPageMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { BookingAvailabilitySlot } from '@/lib/db/schema';
import { zonedDateStr, zonedDayOfWeek, zonedMinutesOfDay } from '@/lib/booking/timezone';

type PageLike = {
  id: number;
  duration: number;
  availability: unknown;
  timezone: string | null;
};

/**
 * Server-side availability guard for booking submissions.
 *
 * Returns true iff `slotStart` lands on a valid bookable slot boundary inside
 * the booking page's configured availability for that date. This MIRRORS the
 * slot generation in `app/api/public/booking/[slug]/slots/route.ts` — same
 * page-timezone wall-clock windows, same duration grid, same date-override and
 * per-staff-availability precedence — so any time the slots API *offers* will
 * pass, and only times it would never offer are rejected.
 *
 * It deliberately does NOT check capacity/conflicts or min-notice/max-advance:
 * the booking POST route already enforces those separately. The slots route is
 * the source of truth for this logic; keep the two in sync.
 */
export async function isSlotWithinAvailability(
  page: PageLike,
  slotStart: Date,
  staffId?: number | null,
): Promise<boolean> {
  const tz = page.timezone || 'UTC';
  const dateStr = zonedDateStr(slotStart, tz); // calendar date in the page timezone

  // Date overrides take precedence over the weekly availability grid.
  const [override] = await db.select().from(bookingDateOverrides)
    .where(and(
      eq(bookingDateOverrides.bookingPageId, page.id),
      eq(bookingDateOverrides.date, dateStr),
    ))
    .limit(1);

  if (override?.type === 'blocked') return false;

  type TimeWindow = { startTime: string; endTime: string };
  let timeWindows: TimeWindow[] = [];

  if (override?.type === 'available' && override.startTime && override.endTime) {
    timeWindows = [{ startTime: override.startTime, endTime: override.endTime }];
  } else {
    // Per-staff availability wins over page defaults when a staff member was
    // selected (allowStaffSelection flow), exactly as the slots route resolves it.
    let memberAvailability: BookingAvailabilitySlot[] | null = null;
    if (staffId) {
      const [member] = await db.select().from(bookingPageMembers)
        .where(and(
          eq(bookingPageMembers.bookingPageId, page.id),
          eq(bookingPageMembers.userId, staffId),
          eq(bookingPageMembers.active, true),
        ))
        .limit(1);
      if (member?.availability) memberAvailability = member.availability as BookingAvailabilitySlot[];
    }
    const dayOfWeek = zonedDayOfWeek(slotStart, tz);
    const availability = memberAvailability || (page.availability as BookingAvailabilitySlot[]) || [];
    timeWindows = availability
      .filter(s => s.day === dayOfWeek && s.enabled)
      .map(s => ({ startTime: s.startTime, endTime: s.endTime }));
  }

  if (timeWindows.length === 0) return false;

  const slotMinutes = zonedMinutesOfDay(slotStart, tz); // wall-clock minutes in the page timezone
  const duration = page.duration;

  for (const w of timeWindows) {
    const [sh, sm] = w.startTime.split(':').map(Number);
    const [eh, em] = w.endTime.split(':').map(Number);
    const windowStart = sh * 60 + sm;
    const windowEnd = eh * 60 + em;
    if (slotMinutes < windowStart) continue;
    if (slotMinutes + duration > windowEnd) continue;
    // Must align to the duration grid measured from the window start, matching
    // the `mins += slotDuration` stepping in slots/route.ts.
    if ((slotMinutes - windowStart) % duration === 0) return true;
  }
  return false;
}
