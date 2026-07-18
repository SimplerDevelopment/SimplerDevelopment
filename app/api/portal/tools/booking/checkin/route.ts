import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings, bookingPages } from '@/lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { code } = body;

  if (!code?.trim()) {
    return NextResponse.json({ success: false, message: 'Check-in code is required' }, { status: 400 });
  }

  // Look up booking by checkin code or booking ID
  const trimmedCode = code.trim().toUpperCase();

  const [booking] = await db.select({
    id: bookings.id,
    guestName: bookings.guestName,
    guestEmail: bookings.guestEmail,
    startTime: bookings.startTime,
    endTime: bookings.endTime,
    groupSize: bookings.groupSize,
    status: bookings.status,
    checkinCode: bookings.checkinCode,
    checkedInAt: bookings.checkedInAt,
    bookingPageId: bookings.bookingPageId,
    clientId: bookings.clientId,
  }).from(bookings)
    .where(and(
      eq(bookings.clientId, client.id),
      eq(bookings.status, 'confirmed'),
      or(
        eq(bookings.checkinCode, trimmedCode),
        eq(bookings.id, parseInt(trimmedCode) || 0),
      ),
    ))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ success: false, message: 'Booking not found or already checked in' }, { status: 404 });
  }

  if (booking.checkedInAt) {
    return NextResponse.json({ success: false, message: 'Guest has already been checked in' }, { status: 409 });
  }

  // Verify booking is for today (±1 day for flexibility)
  const now = new Date();
  const bookingDate = new Date(booking.startTime);
  const dayDiff = Math.abs(now.getTime() - bookingDate.getTime()) / (1000 * 60 * 60 * 24);

  if (dayDiff > 1) {
    return NextResponse.json({
      success: false,
      message: `This booking is for ${bookingDate.toISOString().split('T')[0]}, not today`,
    }, { status: 400 });
  }

  // Mark checked in
  await db.update(bookings)
    .set({
      checkedInAt: now,
      checkedInBy: parseInt(session.user.id, 10),
      updatedAt: now,
    })
    .where(eq(bookings.id, booking.id));

  // Get booking page title
  const [page] = await db.select({ title: bookingPages.title }).from(bookingPages)
    .where(eq(bookingPages.id, booking.bookingPageId)).limit(1);

  return NextResponse.json({
    success: true,
    data: {
      bookingId: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      groupSize: booking.groupSize,
      startTime: booking.startTime,
      pageTitle: page?.title || 'Unknown',
      checkedInAt: now,
    },
  });
}
