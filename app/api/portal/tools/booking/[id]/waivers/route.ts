import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingWaivers } from '@/lib/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.id, parseInt(id)), eq(bookingPages.clientId, client.id)))
    .limit(1);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const conditions = [eq(bookingWaivers.bookingPageId, page.id)];
  if (startDate) conditions.push(gte(bookingWaivers.signedAt, new Date(startDate)));
  if (endDate) conditions.push(lte(bookingWaivers.signedAt, new Date(endDate + 'T23:59:59Z')));

  const waivers = await db.select({
    id: bookingWaivers.id,
    bookingId: bookingWaivers.bookingId,
    signerName: bookingWaivers.signerName,
    signerEmail: bookingWaivers.signerEmail,
    signedAt: bookingWaivers.signedAt,
    ipAddress: bookingWaivers.ipAddress,
  }).from(bookingWaivers)
    .where(and(...conditions))
    .orderBy(desc(bookingWaivers.signedAt));

  return NextResponse.json({ success: true, data: waivers });
}
