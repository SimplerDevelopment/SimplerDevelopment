import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, bookingPages, clients, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendCancellationEmail, loadBookingBrand } from '@/lib/email/booking-emails';
import { deleteCalendarEvent } from '@/lib/google-calendar';
import { deleteZoomMeeting } from '@/lib/zoom';
import { emitEvent } from '@/lib/automation';

export async function POST(req: Request) {
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ success: false, message: 'Cancel token is required' }, { status: 400 });
  }

  const [booking] = await db.select().from(bookings)
    .where(eq(bookings.cancelToken, token))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ success: false, message: 'Booking not found' }, { status: 404 });
  }

  if (booking.status === 'cancelled') {
    return NextResponse.json({ success: false, message: 'This booking has already been cancelled' }, { status: 409 });
  }

  // Don't allow cancelling past bookings
  if (booking.startTime < new Date()) {
    return NextResponse.json({ success: false, message: 'Cannot cancel a past booking' }, { status: 400 });
  }

  // Cancel the booking
  await db.update(bookings)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, booking.id));

  // Get page info for emails
  const [page] = await db.select().from(bookingPages)
    .where(eq(bookingPages.id, booking.bookingPageId))
    .limit(1);

  // Delete Google Calendar event if it exists
  if (booking.googleEventId) {
    deleteCalendarEvent(booking.clientId, booking.googleEventId).catch(() => {});
  }

  // Delete Zoom meeting if it exists
  if (booking.meetingLink?.includes('zoom.us')) {
    deleteZoomMeeting(booking.clientId, booking.meetingLink).catch(() => {});
  }

  // Send cancellation email to guest (brand-aware — pulls colors/logo from the
  // booking page's branding profile or the client's default).
  if (page) {
    const brand = await loadBookingBrand(page.id);
    sendCancellationEmail(
      booking.guestEmail,
      booking.guestName,
      page.title,
      booking.startTime,
      booking.timezone,
      page.slug,
      brand,
    ).catch(() => {});

    // Notify host
    const [client] = await db.select({ userId: clients.userId }).from(clients)
      .where(eq(clients.id, booking.clientId)).limit(1);
    if (client) {
      const [host] = await db.select({ email: users.email }).from(users)
        .where(eq(users.id, client.userId)).limit(1);
      if (host) {
        const { resend } = await import('@/lib/email/index');
        resend.emails.send({
          from: `SimplerDevelopment <${process.env.RESEND_FROM_EMAIL || 'bookings@simplerdevelopment.com'}>`,
          to: host.email,
          subject: `Booking Cancelled: ${booking.guestName} — ${page.title}`,
          html: `<p><strong>${booking.guestName}</strong> cancelled their ${page.title} appointment on ${new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: booking.timezone }).format(booking.startTime)}.</p>`,
        }).catch(() => {});
      }
    }
  }

  emitEvent('booking.cancelled', booking.clientId, 0, {
    bookingId: booking.id,
    bookingPageId: booking.bookingPageId,
    pageTitle: page?.title ?? null,
    pageSlug: page?.slug ?? null,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    startTime: booking.startTime,
    timezone: booking.timezone,
  });

  return NextResponse.json({
    success: true,
    data: { message: 'Booking cancelled successfully' },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ success: false, message: 'Token is required' }, { status: 400 });
  }

  const [booking] = await db.select({
    id: bookings.id,
    guestName: bookings.guestName,
    startTime: bookings.startTime,
    endTime: bookings.endTime,
    timezone: bookings.timezone,
    status: bookings.status,
    pageTitle: bookingPages.title,
  }).from(bookings)
    .innerJoin(bookingPages, eq(bookings.bookingPageId, bookingPages.id))
    .where(eq(bookings.cancelToken, token))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ success: false, message: 'Booking not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: booking });
}
