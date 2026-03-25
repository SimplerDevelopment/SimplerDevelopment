import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookings } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const pageId = parseInt(id);

  // Verify the booking page belongs to this client
  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.id, pageId), eq(bookingPages.clientId, client.id)))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const pageBookings = await db
    .select()
    .from(bookings)
    .where(eq(bookings.bookingPageId, pageId))
    .orderBy(desc(bookings.startTime));

  return NextResponse.json({ success: true, data: pageBookings });
}
