import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookings, bookingPageMembers, users } from '@/lib/db/schema';
import { eq, and, gte, lte, ne } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');
  const memberFilter = searchParams.get('memberId');

  if (!startDate || !endDate) {
    return NextResponse.json({ success: false, message: 'start and end query params required' }, { status: 400 });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  // Get all bookings for this client in the date range
  let query = db
    .select({
      id: bookings.id,
      bookingPageId: bookings.bookingPageId,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      timezone: bookings.timezone,
      status: bookings.status,
      assignedTo: bookings.assignedTo,
      groupSize: bookings.groupSize,
      total: bookings.total,
      pageTitle: bookingPages.title,
      pageColor: bookingPages.color,
    })
    .from(bookings)
    .innerJoin(bookingPages, eq(bookingPages.id, bookings.bookingPageId))
    .where(and(
      eq(bookings.clientId, client.id),
      ne(bookings.status, 'cancelled'),
      gte(bookings.startTime, start),
      lte(bookings.startTime, end),
    ))
    .orderBy(bookings.startTime);

  let allBookings = await query;

  // Filter by member if specified
  if (memberFilter) {
    const memberId = parseInt(memberFilter);
    allBookings = allBookings.filter(b => b.assignedTo === memberId);
  }

  // Get all page members for color coding
  const pages = await db.select({ id: bookingPages.id }).from(bookingPages)
    .where(eq(bookingPages.clientId, client.id));
  const pageIds = pages.map(p => p.id);

  const members = pageIds.length > 0 ? await db
    .select({
      id: bookingPageMembers.id,
      bookingPageId: bookingPageMembers.bookingPageId,
      userId: bookingPageMembers.userId,
      displayName: bookingPageMembers.displayName,
      color: bookingPageMembers.color,
      userName: users.name,
    })
    .from(bookingPageMembers)
    .innerJoin(users, eq(users.id, bookingPageMembers.userId))
    .where(eq(bookingPageMembers.active, true)) : [];

  // Build member color map
  const memberMap = new Map<number, { name: string; color: string }>();
  for (const m of members) {
    memberMap.set(m.userId, {
      name: m.displayName || m.userName,
      color: m.color || '#6b7280',
    });
  }

  // Enrich bookings with member info
  const enrichedBookings = allBookings.map(b => ({
    ...b,
    assignedMember: b.assignedTo ? memberMap.get(b.assignedTo) || null : null,
  }));

  return NextResponse.json({
    success: true,
    data: {
      bookings: enrichedBookings,
      members: Array.from(memberMap.entries()).map(([userId, info]) => ({
        userId,
        ...info,
      })),
    },
  });
}
