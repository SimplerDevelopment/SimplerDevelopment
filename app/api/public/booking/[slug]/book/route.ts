import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, bookings } from '@/lib/db/schema';
import { eq, and, ne, gte, lte } from 'drizzle-orm';
import crypto from 'crypto';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.slug, slug), eq(bookingPages.active, true)))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });

  const { name, email, phone, startTime, timezone, answers } = await req.json();

  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ success: false, message: 'Email is required' }, { status: 400 });
  if (!startTime) return NextResponse.json({ success: false, message: 'Start time is required' }, { status: 400 });

  const slotStart = new Date(startTime);
  if (isNaN(slotStart.getTime())) {
    return NextResponse.json({ success: false, message: 'Invalid start time' }, { status: 400 });
  }

  const slotEnd = new Date(slotStart.getTime() + page.duration * 60 * 1000);

  // Check minNoticeMins
  const now = new Date();
  const minNoticeTime = new Date(now.getTime() + page.minNoticeMins * 60 * 1000);
  if (slotStart < minNoticeTime) {
    return NextResponse.json({ success: false, message: 'This time slot is no longer available' }, { status: 409 });
  }

  // Check maxAdvanceDays
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + page.maxAdvanceDays);
  if (slotStart > maxDate) {
    return NextResponse.json({ success: false, message: 'This date is too far in advance' }, { status: 400 });
  }

  // Re-check for conflicts (race condition protection)
  const bufferStart = new Date(slotStart.getTime() - page.bufferBefore * 60 * 1000);
  const bufferEnd = new Date(slotEnd.getTime() + page.bufferAfter * 60 * 1000);

  const conflicting = await db.select({ id: bookings.id }).from(bookings)
    .where(and(
      eq(bookings.bookingPageId, page.id),
      ne(bookings.status, 'cancelled'),
      lte(bookings.startTime, bufferEnd),
      gte(bookings.endTime, bufferStart),
    ))
    .limit(1);

  if (conflicting.length > 0) {
    return NextResponse.json({ success: false, message: 'This time slot is no longer available' }, { status: 409 });
  }

  const cancelToken = crypto.randomUUID();

  const [booking] = await db.insert(bookings).values({
    bookingPageId: page.id,
    clientId: page.clientId,
    guestName: name.trim(),
    guestEmail: email.trim(),
    guestPhone: phone?.trim() || null,
    startTime: slotStart,
    endTime: slotEnd,
    timezone: timezone || page.timezone,
    answers: answers || null,
    cancelToken,
  }).returning();

  // TODO: If page.googleCalendarSync is enabled and the client has Google tokens,
  // create a Google Calendar event using a helper function

  return NextResponse.json({
    success: true,
    data: {
      id: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
      status: booking.status,
    },
  });
}
