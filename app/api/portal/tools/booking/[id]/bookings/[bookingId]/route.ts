import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; bookingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id, bookingId } = await params;
  const pageId = parseInt(id);

  // Verify the booking page belongs to this client
  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.id, pageId), eq(bookingPages.clientId, client.id)))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });

  // Verify the booking belongs to this page
  const [booking] = await db.select().from(bookings)
    .where(and(eq(bookings.id, parseInt(bookingId)), eq(bookings.bookingPageId, pageId)))
    .limit(1);

  if (!booking) return NextResponse.json({ success: false, message: 'Booking not found' }, { status: 404 });

  const { status, notes, assignedTo } = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (status !== undefined) {
    updates.status = status;
    if (status === 'cancelled') {
      updates.cancelledAt = new Date();
    }
  }
  if (notes !== undefined) updates.notes = notes;
  if (assignedTo !== undefined) updates.assignedTo = assignedTo || null;

  const [updated] = await db.update(bookings)
    .set(updates)
    .where(eq(bookings.id, booking.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}
