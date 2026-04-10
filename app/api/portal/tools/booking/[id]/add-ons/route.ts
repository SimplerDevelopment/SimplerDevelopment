import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingAddOns } from '@/lib/db/schema';
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

  const addOns = await db.select().from(bookingAddOns)
    .where(eq(bookingAddOns.bookingPageId, page.id))
    .orderBy(asc(bookingAddOns.order));

  return NextResponse.json({ success: true, data: addOns });
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
  const { source, name, description, price, image, productId, variantId, maxQuantity, order } = body;

  if (source === 'custom' && (!name || price === undefined)) {
    return NextResponse.json({ success: false, message: 'Custom add-ons require name and price' }, { status: 400 });
  }
  if (source === 'product' && !productId) {
    return NextResponse.json({ success: false, message: 'Product add-ons require productId' }, { status: 400 });
  }

  const [addOn] = await db.insert(bookingAddOns).values({
    bookingPageId: page.id,
    source: source || 'custom',
    name: name || null,
    description: description || null,
    price: price != null ? parseInt(String(price)) : null,
    image: image || null,
    productId: productId || null,
    variantId: variantId || null,
    maxQuantity: maxQuantity ?? 10,
    order: order ?? 0,
  }).returning();

  return NextResponse.json({ success: true, data: addOn }, { status: 201 });
}
