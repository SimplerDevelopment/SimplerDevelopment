import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingQuotes } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import crypto from 'crypto';

function generateSlug(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 30);
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${base}-${suffix}`;
}

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const quotes = await db.select().from(bookingQuotes)
    .where(eq(bookingQuotes.clientId, client.id))
    .orderBy(desc(bookingQuotes.createdAt));

  return NextResponse.json({ success: true, data: quotes });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    title, description, price,
    customerName, customerEmail, customerPhone,
    lineItems, bookingPageId,
    startTime, endTime, expiresAt,
  } = body;

  if (!title?.trim() || !price || !customerName?.trim() || !customerEmail?.trim()) {
    return NextResponse.json({ success: false, message: 'title, price, customerName, and customerEmail are required' }, { status: 400 });
  }

  const slug = generateSlug(title);

  const [quote] = await db.insert(bookingQuotes).values({
    clientId: client.id,
    bookingPageId: bookingPageId || null,
    slug,
    title: title.trim(),
    description: description?.trim() || null,
    price: parseInt(String(price)),
    customerName: customerName.trim(),
    customerEmail: customerEmail.trim(),
    customerPhone: customerPhone?.trim() || null,
    lineItems: lineItems || [],
    startTime: startTime ? new Date(startTime) : null,
    endTime: endTime ? new Date(endTime) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();

  return NextResponse.json({ success: true, data: quote }, { status: 201 });
}
