import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingQuotes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

type Params = { params: Promise<{ quoteId: string }> };

async function resolveQuote(quoteId: number, userId: number) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [quote] = await db.select().from(bookingQuotes)
    .where(and(eq(bookingQuotes.id, quoteId), eq(bookingQuotes.clientId, client.id)))
    .limit(1);
  return quote ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { quoteId } = await params;
  const quote = await resolveQuote(parseInt(quoteId), parseInt(session.user.id, 10));
  if (!quote) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: quote });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { quoteId } = await params;
  const quote = await resolveQuote(parseInt(quoteId), parseInt(session.user.id, 10));
  if (!quote) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.price !== undefined) updates.price = parseInt(String(body.price));
  if (body.customerName !== undefined) updates.customerName = body.customerName;
  if (body.customerEmail !== undefined) updates.customerEmail = body.customerEmail;
  if (body.customerPhone !== undefined) updates.customerPhone = body.customerPhone;
  if (body.lineItems !== undefined) updates.lineItems = body.lineItems;
  if (body.startTime !== undefined) updates.startTime = body.startTime ? new Date(body.startTime) : null;
  if (body.endTime !== undefined) updates.endTime = body.endTime ? new Date(body.endTime) : null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const [updated] = await db.update(bookingQuotes)
    .set(updates)
    .where(eq(bookingQuotes.id, quote.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { quoteId } = await params;
  const quote = await resolveQuote(parseInt(quoteId), parseInt(session.user.id, 10));
  if (!quote) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(bookingQuotes).where(eq(bookingQuotes.id, quote.id));
  return NextResponse.json({ success: true });
}
