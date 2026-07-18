import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingAddOns } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.id, parseInt(id)), eq(bookingPages.clientId, client.id)))
    .limit(1);
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { products: productList } = body;
  // productList: Array<{ productId: number; variantId?: number; maxQuantity?: number }>

  if (!Array.isArray(productList) || productList.length === 0) {
    return NextResponse.json({ success: false, message: 'products array is required' }, { status: 400 });
  }

  // Get current max order
  const existing = await db.select({ order: bookingAddOns.order }).from(bookingAddOns)
    .where(eq(bookingAddOns.bookingPageId, page.id));
  let nextOrder = existing.length > 0 ? Math.max(...existing.map(e => e.order)) + 1 : 0;

  const created = [];
  for (const item of productList) {
    const [addOn] = await db.insert(bookingAddOns).values({
      bookingPageId: page.id,
      source: 'product',
      productId: item.productId,
      variantId: item.variantId || null,
      maxQuantity: item.maxQuantity ?? 10,
      order: nextOrder++,
    }).returning();
    created.push(addOn);
  }

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
