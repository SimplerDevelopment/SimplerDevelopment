import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, bookings, bookingAttendees, bookingDateOverrides, bookingPageMembers } from '@/lib/db/schema';
import { eq, and, gte, lte, ne, sql } from 'drizzle-orm';
import type { BookingAvailabilitySlot } from '@/lib/db/schema';
import { zonedWallTimeToUtc } from '@/lib/booking/timezone';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date');
  const staffId = searchParams.get('staffId');

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ success: false, message: 'Valid date parameter required (YYYY-MM-DD)' }, { status: 400 });
  }

  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.slug, slug), eq(bookingPages.active, true)))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });

  const requestedDate = new Date(dateStr + 'T00:00:00');
  const now = new Date();

  // Check maxAdvanceDays
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + page.maxAdvanceDays);
  if (requestedDate > maxDate) {
    return NextResponse.json({ success: true, data: [] });
  }

  // Check if date is in the past
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (requestedDate < today) {
    return NextResponse.json({ success: true, data: [] });
  }

  // Check for date overrides first
  const [override] = await db.select().from(bookingDateOverrides)
    .where(and(
      eq(bookingDateOverrides.bookingPageId, page.id),
      eq(bookingDateOverrides.date, dateStr),
    ))
    .limit(1);

  // If date is blocked, return no slots
  if (override?.type === 'blocked') {
    return NextResponse.json({ success: true, data: [] });
  }

  // Determine time windows for this date
  type TimeWindow = { startTime: string; endTime: string };
  let timeWindows: TimeWindow[] = [];

  // If a specific staff member is selected, check for their custom availability
  let memberAvailability: BookingAvailabilitySlot[] | null = null;
  if (staffId) {
    const [member] = await db.select().from(bookingPageMembers)
      .where(and(
        eq(bookingPageMembers.bookingPageId, page.id),
        eq(bookingPageMembers.userId, parseInt(staffId)),
        eq(bookingPageMembers.active, true),
      ))
      .limit(1);
    if (member?.availability) {
      memberAvailability = member.availability as BookingAvailabilitySlot[];
    }
  }

  if (override?.type === 'available' && override.startTime && override.endTime) {
    // Use override times instead of day-of-week
    timeWindows = [{ startTime: override.startTime, endTime: override.endTime }];
  } else {
    // Use member-specific availability if set, otherwise page defaults
    const dayOfWeek = requestedDate.getDay();
    const availability = memberAvailability || (page.availability as BookingAvailabilitySlot[]) || [];
    timeWindows = availability
      .filter(s => s.day === dayOfWeek && s.enabled)
      .map(s => ({ startTime: s.startTime, endTime: s.endTime }));
  }

  if (timeWindows.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // Get existing bookings for this date (non-cancelled)
  const dayStart = new Date(dateStr + 'T00:00:00Z');
  const dayEnd = new Date(dateStr + 'T23:59:59Z');

  // When filtering by staff, only check that staff member's bookings for conflicts
  const bookingFilters = [
    eq(bookings.bookingPageId, page.id),
    ne(bookings.status, 'cancelled'),
    gte(bookings.startTime, dayStart),
    lte(bookings.startTime, dayEnd),
  ];
  if (staffId) {
    bookingFilters.push(eq(bookings.assignedTo, parseInt(staffId)));
  }

  const existingBookings = await db.select({
    startTime: bookings.startTime,
    endTime: bookings.endTime,
    groupSize: bookings.groupSize,
  }).from(bookings)
    .where(and(...bookingFilters));

  // Generate available time slots
  const slotDuration = page.duration;
  const bufferBefore = page.bufferBefore;
  const bufferAfter = page.bufferAfter;
  const isGroupBooking = page.bookingType === 'group';
  const groupCapacityVal = (page.groupCapacity ?? page.maxGuests) ?? 0;
  const hasCapacity = isGroupBooking
    ? groupCapacityVal > 0
    : page.maxGuests != null && page.maxGuests > 0;

  // For group bookings, attendee headcount is the source of truth for
  // remaining seats. Pull non-cancelled attendees grouped by slot once.
  const groupAttendeesByStart = new Map<number, number>();
  if (isGroupBooking) {
    const rows = await db
      .select({ startTime: bookings.startTime, cnt: sql<number>`count(${bookingAttendees.id})::int` })
      .from(bookingAttendees)
      .innerJoin(bookings, eq(bookings.id, bookingAttendees.bookingId))
      .where(and(
        eq(bookings.bookingPageId, page.id),
        ne(bookings.status, 'cancelled'),
        ne(bookingAttendees.status, 'cancelled'),
        gte(bookings.startTime, dayStart),
        lte(bookings.startTime, dayEnd),
      ))
      .groupBy(bookings.startTime);
    for (const r of rows) {
      groupAttendeesByStart.set(new Date(r.startTime).getTime(), Number(r.cnt));
    }
  }

  const slots: { time: string; remainingCapacity: number | null }[] = [];

  for (const window of timeWindows) {
    const [startHour, startMin] = window.startTime.split(':').map(Number);
    const [endHour, endMin] = window.endTime.split(':').map(Number);

    const windowStart = startHour * 60 + startMin;
    const windowEnd = endHour * 60 + endMin;

    for (let mins = windowStart; mins + slotDuration <= windowEnd; mins += slotDuration) {
      // Availability windows are wall-clock times in the page's timezone; convert
      // each slot to the correct UTC instant (DST-aware) instead of treating the
      // clock time as UTC. See lib/booking/timezone.ts.
      const slotStart = zonedWallTimeToUtc(dateStr, Math.floor(mins / 60), mins % 60, page.timezone || 'UTC');

      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

      // Check minNoticeMins
      const minNoticeTime = new Date(now.getTime() + page.minNoticeMins * 60 * 1000);
      if (slotStart < minNoticeTime) continue;

      if (hasCapacity) {
        // Capacity mode: count total seats already taken for this slot.
        // Group bookings count attendees rows; legacy bookings count
        // groupSize on the parent rows.
        const booked = isGroupBooking
          ? (groupAttendeesByStart.get(slotStart.getTime()) ?? 0)
          : existingBookings
              .filter(b => {
                const bStart = new Date(b.startTime);
                return bStart.getTime() === slotStart.getTime();
              })
              .reduce((sum, b) => sum + (b.groupSize ?? 1), 0);

        const cap = isGroupBooking ? groupCapacityVal : page.maxGuests!;
        const remaining = cap - booked;
        if (remaining > 0) {
          slots.push({ time: slotStart.toISOString(), remainingCapacity: remaining });
        }
      } else {
        // 1:1 mode: check for conflicts (including buffer)
        const bufferedStart = new Date(slotStart.getTime() - bufferBefore * 60 * 1000);
        const bufferedEnd = new Date(slotEnd.getTime() + bufferAfter * 60 * 1000);

        const hasConflict = existingBookings.some(b => {
          const bStart = new Date(b.startTime);
          const bEnd = new Date(b.endTime);
          return bufferedStart < bEnd && bufferedEnd > bStart;
        });

        if (!hasConflict) {
          slots.push({ time: slotStart.toISOString(), remainingCapacity: null });
        }
      }
    }
  }

  return NextResponse.json({ success: true, data: slots });
}
