import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, bookings } from '@/lib/db/schema';
import { eq, and, gte, lte, ne } from 'drizzle-orm';
import type { BookingAvailabilitySlot } from '@/lib/db/schema';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date');

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

  // Get availability for this day of week
  const dayOfWeek = requestedDate.getDay();
  const availability = (page.availability as BookingAvailabilitySlot[]) || [];
  const daySlots = availability.filter(s => s.day === dayOfWeek && s.enabled);

  if (daySlots.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // Get existing bookings for this date (non-cancelled)
  const dayStart = new Date(dateStr + 'T00:00:00Z');
  const dayEnd = new Date(dateStr + 'T23:59:59Z');

  const existingBookings = await db.select({
    startTime: bookings.startTime,
    endTime: bookings.endTime,
  }).from(bookings)
    .where(and(
      eq(bookings.bookingPageId, page.id),
      ne(bookings.status, 'cancelled'),
      gte(bookings.startTime, dayStart),
      lte(bookings.startTime, dayEnd),
    ));

  // Generate available time slots
  const slots: string[] = [];
  const slotDuration = page.duration;
  const bufferBefore = page.bufferBefore;
  const bufferAfter = page.bufferAfter;

  for (const daySlot of daySlots) {
    const [startHour, startMin] = daySlot.startTime.split(':').map(Number);
    const [endHour, endMin] = daySlot.endTime.split(':').map(Number);

    const windowStart = startHour * 60 + startMin;
    const windowEnd = endHour * 60 + endMin;

    for (let mins = windowStart; mins + slotDuration <= windowEnd; mins += slotDuration) {
      const slotStart = new Date(dateStr + 'T00:00:00Z');
      slotStart.setUTCHours(Math.floor(mins / 60), mins % 60, 0, 0);

      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

      // Check minNoticeMins
      const minNoticeTime = new Date(now.getTime() + page.minNoticeMins * 60 * 1000);
      if (slotStart < minNoticeTime) continue;

      // Check for conflicts (including buffer)
      const bufferedStart = new Date(slotStart.getTime() - bufferBefore * 60 * 1000);
      const bufferedEnd = new Date(slotEnd.getTime() + bufferAfter * 60 * 1000);

      const hasConflict = existingBookings.some(b => {
        const bStart = new Date(b.startTime);
        const bEnd = new Date(b.endTime);
        return bufferedStart < bEnd && bufferedEnd > bStart;
      });

      if (!hasConflict) {
        slots.push(slotStart.toISOString());
      }
    }
  }

  return NextResponse.json({ success: true, data: slots });
}
