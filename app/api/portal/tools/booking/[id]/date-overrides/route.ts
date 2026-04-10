import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingDateOverrides } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function resolveBookingPage(pageId: number, userId: number) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.id, pageId), eq(bookingPages.clientId, client.id)))
    .limit(1);
  return page ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const page = await resolveBookingPage(parseInt(id), parseInt(session.user.id, 10));
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const overrides = await db.select().from(bookingDateOverrides)
    .where(eq(bookingDateOverrides.bookingPageId, page.id))
    .orderBy(asc(bookingDateOverrides.date));

  return NextResponse.json({ success: true, data: overrides });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const page = await resolveBookingPage(parseInt(id), parseInt(session.user.id, 10));
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { date, type, startTime, endTime, note } = body;

  if (!date || !type) {
    return NextResponse.json({ success: false, message: 'date and type are required' }, { status: 400 });
  }
  if (!['available', 'blocked'].includes(type)) {
    return NextResponse.json({ success: false, message: 'type must be "available" or "blocked"' }, { status: 400 });
  }
  if (type === 'available' && (!startTime || !endTime)) {
    return NextResponse.json({ success: false, message: 'startTime and endTime required for available overrides' }, { status: 400 });
  }

  const [override] = await db.insert(bookingDateOverrides).values({
    bookingPageId: page.id,
    date,
    type,
    startTime: startTime || null,
    endTime: endTime || null,
    note: note || null,
  }).returning();

  return NextResponse.json({ success: true, data: override }, { status: 201 });
}
