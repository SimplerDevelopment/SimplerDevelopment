import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookings, clients, users } from '@/lib/db/schema';
import { eq, desc, gte, lte, count, and, sql } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Get all booking pages with client info
  const pages = await db
    .select({
      id: bookingPages.id,
      title: bookingPages.title,
      slug: bookingPages.slug,
      duration: bookingPages.duration,
      active: bookingPages.active,
      googleCalendarSync: bookingPages.googleCalendarSync,
      timezone: bookingPages.timezone,
      createdAt: bookingPages.createdAt,
      company: clients.company,
      clientName: users.name,
    })
    .from(bookingPages)
    .innerJoin(clients, eq(bookingPages.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(bookingPages.createdAt));

  // Get booking counts per page
  const bookingCounts = await db
    .select({
      bookingPageId: bookings.bookingPageId,
      total: count(),
      upcoming: sql<number>`sum(case when ${bookings.startTime} >= now() then 1 else 0 end)`,
    })
    .from(bookings)
    .groupBy(bookings.bookingPageId);

  const countMap = new Map(bookingCounts.map(c => [c.bookingPageId, { total: c.total, upcoming: Number(c.upcoming) }]));

  const pagesWithCounts = pages.map(p => ({
    ...p,
    totalBookings: countMap.get(p.id)?.total ?? 0,
    upcomingBookings: countMap.get(p.id)?.upcoming ?? 0,
  }));

  // Get upcoming bookings (next 30 days)
  const upcomingBookings = await db
    .select({
      id: bookings.id,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      guestPhone: bookings.guestPhone,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      timezone: bookings.timezone,
      status: bookings.status,
      createdAt: bookings.createdAt,
      bookingPageTitle: bookingPages.title,
      company: clients.company,
      clientName: users.name,
    })
    .from(bookings)
    .innerJoin(bookingPages, eq(bookings.bookingPageId, bookingPages.id))
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .where(and(
      gte(bookings.startTime, now),
      lte(bookings.startTime, thirtyDaysFromNow),
    ))
    .orderBy(bookings.startTime);

  const totalPages = pages.length;
  const activePages = pages.filter(p => p.active).length;
  const totalUpcoming = upcomingBookings.length;

  return NextResponse.json({
    success: true,
    pages: pagesWithCounts,
    upcomingBookings,
    stats: { totalPages, activePages, totalUpcoming },
  });
  } catch (error) {
    console.error('Booking API error:', error);
    return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
  }
}
