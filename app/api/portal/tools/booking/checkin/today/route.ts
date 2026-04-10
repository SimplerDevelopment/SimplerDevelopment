import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings, bookingPages } from '@/lib/db/schema';
import { eq, and, gte, lte, ne, sql, asc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const todayBookings = await db.select({
    id: bookings.id,
    guestName: bookings.guestName,
    guestEmail: bookings.guestEmail,
    guestPhone: bookings.guestPhone,
    startTime: bookings.startTime,
    endTime: bookings.endTime,
    groupSize: bookings.groupSize,
    status: bookings.status,
    paymentStatus: bookings.paymentStatus,
    checkinCode: bookings.checkinCode,
    checkedInAt: bookings.checkedInAt,
    bookingPageId: bookings.bookingPageId,
  }).from(bookings)
    .where(and(
      eq(bookings.clientId, client.id),
      ne(bookings.status, 'cancelled'),
      gte(bookings.startTime, todayStart),
      lte(bookings.startTime, todayEnd),
    ))
    .orderBy(asc(bookings.startTime));

  // Get page titles
  const pageIds = [...new Set(todayBookings.map(b => b.bookingPageId))];
  const pages = pageIds.length > 0
    ? await db.select({ id: bookingPages.id, title: bookingPages.title }).from(bookingPages)
      .where(sql`${bookingPages.id} IN ${pageIds}`)
    : [];
  const pageMap = Object.fromEntries(pages.map(p => [p.id, p.title]));

  const enriched = todayBookings.map(b => ({
    ...b,
    pageTitle: pageMap[b.bookingPageId] || 'Unknown',
    isCheckedIn: !!b.checkedInAt,
  }));

  const checkedIn = enriched.filter(b => b.isCheckedIn).length;
  const totalGuests = enriched.reduce((sum, b) => sum + (b.groupSize || 1), 0);

  return NextResponse.json({
    success: true,
    data: {
      bookings: enriched,
      summary: {
        total: enriched.length,
        checkedIn,
        pending: enriched.length - checkedIn,
        totalGuests,
      },
    },
  });
}
