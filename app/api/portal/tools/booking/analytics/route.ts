import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings, bookingPages, bookingSelectedAddOns } from '@/lib/db/schema';
import { eq, and, gte, lte, ne, sql, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const bookingPageId = searchParams.get('bookingPageId');

  // Default to last 30 days
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate + 'T23:59:59Z') : new Date();

  // Build conditions
  const conditions = [
    eq(bookings.clientId, client.id),
    ne(bookings.status, 'cancelled'),
    gte(bookings.createdAt, start),
    lte(bookings.createdAt, end),
  ];

  if (bookingPageId) {
    conditions.push(eq(bookings.bookingPageId, parseInt(bookingPageId)));
  }

  // Get all bookings in range
  const allBookings = await db.select({
    id: bookings.id,
    bookingPageId: bookings.bookingPageId,
    total: bookings.total,
    subtotal: bookings.subtotal,
    discountTotal: bookings.discountTotal,
    paymentStatus: bookings.paymentStatus,
    status: bookings.status,
    groupSize: bookings.groupSize,
    createdAt: bookings.createdAt,
  }).from(bookings)
    .where(and(...conditions));

  // Get add-on revenue
  const bookingIds = allBookings.map(b => b.id);
  let addOnRevenue = 0;
  const addOnCounts: Record<string, { name: string; revenue: number; count: number }> = {};

  if (bookingIds.length > 0) {
    const addOns = await db.select({
      productName: bookingSelectedAddOns.productName,
      quantity: bookingSelectedAddOns.quantity,
      unitPrice: bookingSelectedAddOns.unitPrice,
    }).from(bookingSelectedAddOns)
      .where(sql`${bookingSelectedAddOns.bookingId} IN ${bookingIds}`);

    for (const a of addOns) {
      const lineTotal = a.unitPrice * a.quantity;
      addOnRevenue += lineTotal;
      const key = a.productName;
      if (!addOnCounts[key]) {
        addOnCounts[key] = { name: key, revenue: 0, count: 0 };
      }
      addOnCounts[key].revenue += lineTotal;
      addOnCounts[key].count += a.quantity;
    }
  }

  // Aggregate stats
  const paidBookings = allBookings.filter(b => b.paymentStatus === 'paid' || b.paymentStatus === 'free');
  const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.total || 0), 0);
  const bookingRevenue = totalRevenue - addOnRevenue;
  const cancelledCount = allBookings.filter(b => b.status === 'cancelled').length;
  const totalGuests = paidBookings.reduce((sum, b) => sum + (b.groupSize || 1), 0);

  // Revenue by day
  const byDay: Record<string, { date: string; revenue: number; bookings: number; guests: number }> = {};
  for (const b of paidBookings) {
    const date = b.createdAt.toISOString().split('T')[0];
    if (!byDay[date]) byDay[date] = { date, revenue: 0, bookings: 0, guests: 0 };
    byDay[date].revenue += b.total || 0;
    byDay[date].bookings += 1;
    byDay[date].guests += b.groupSize || 1;
  }

  // Revenue by booking page
  const pageIds = [...new Set(allBookings.map(b => b.bookingPageId))];
  const pages = pageIds.length > 0
    ? await db.select({ id: bookingPages.id, title: bookingPages.title }).from(bookingPages)
      .where(sql`${bookingPages.id} IN ${pageIds}`)
    : [];
  const pageMap = Object.fromEntries(pages.map(p => [p.id, p.title]));

  const byPage: Record<number, { pageId: number; title: string; revenue: number; bookings: number }> = {};
  for (const b of paidBookings) {
    if (!byPage[b.bookingPageId]) {
      byPage[b.bookingPageId] = {
        pageId: b.bookingPageId,
        title: pageMap[b.bookingPageId] || 'Unknown',
        revenue: 0,
        bookings: 0,
      };
    }
    byPage[b.bookingPageId].revenue += b.total || 0;
    byPage[b.bookingPageId].bookings += 1;
  }

  return NextResponse.json({
    success: true,
    data: {
      totalRevenue,
      bookingRevenue,
      addOnRevenue,
      bookingCount: paidBookings.length,
      cancelledCount,
      totalGuests,
      averageBookingValue: paidBookings.length > 0 ? Math.round(totalRevenue / paidBookings.length) : 0,
      byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      byPage: Object.values(byPage).sort((a, b) => b.revenue - a.revenue),
      topAddOns: Object.values(addOnCounts).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    },
  });
}
