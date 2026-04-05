import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, bookings, clients, users } from '@/lib/db/schema';
import { eq, and, ne, gte, lte } from 'drizzle-orm';
import crypto from 'crypto';
import { sendGuestConfirmation, sendHostNotification } from '@/lib/email/booking-emails';
import { createCalendarEvent } from '@/lib/google-calendar';
import { createZoomMeeting } from '@/lib/zoom';

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

  const bookingTimezone = timezone || page.timezone;

  // Generate meeting link + calendar event based on conference type
  let meetingLink: string | null = null;

  if (page.googleCalendarSync || page.conferenceType === 'google_meet') {
    const result = await createCalendarEvent({
      clientId: page.clientId,
      bookingId: booking.id,
      title: page.title,
      startTime: slotStart,
      endTime: slotEnd,
      timezone: bookingTimezone,
      guestEmail: booking.guestEmail,
      guestName: booking.guestName,
      addGoogleMeet: page.conferenceType === 'google_meet',
    });
    if (result?.meetingLink) meetingLink = result.meetingLink;
  }

  if (page.conferenceType === 'zoom') {
    meetingLink = await createZoomMeeting({
      clientId: page.clientId,
      bookingId: booking.id,
      title: `${page.title} — ${booking.guestName}`,
      startTime: slotStart,
      duration: page.duration,
      timezone: bookingTimezone,
    });

    // Still create calendar event if sync enabled (without Meet)
    if (page.googleCalendarSync) {
      createCalendarEvent({
        clientId: page.clientId,
        bookingId: booking.id,
        title: page.title,
        description: meetingLink ? `Zoom: ${meetingLink}` : undefined,
        startTime: slotStart,
        endTime: slotEnd,
        timezone: bookingTimezone,
        guestEmail: booking.guestEmail,
        guestName: booking.guestName,
      }).catch(() => {});
    }
  }

  // Send emails after meeting link is available
  const emailData = {
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    pageTitle: page.title,
    startTime: slotStart,
    endTime: slotEnd,
    timezone: bookingTimezone,
    cancelToken,
    bookingSlug: page.slug,
    duration: page.duration,
    meetingLink,
  };

  sendGuestConfirmation(emailData).catch(() => {});

  (async () => {
    const [client] = await db.select({ userId: clients.userId }).from(clients)
      .where(eq(clients.id, page.clientId)).limit(1);
    if (client) {
      const [host] = await db.select({ email: users.email }).from(users)
        .where(eq(users.id, client.userId)).limit(1);
      if (host) {
        sendHostNotification(host.email, emailData).catch(() => {});
      }
    }
  })();

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
      meetingLink,
    },
  });
}
