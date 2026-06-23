import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingAddOns } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function resolveAddOn(pageId: number, addOnId: number, userId: number) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [page] = await db.select({ id: bookingPages.id }).from(bookingPages)
    .where(and(eq(bookingPages.id, pageId), eq(bookingPages.clientId, client.id)))
    .limit(1);
  if (!page) return null;
  const [addOn] = await db.select().from(bookingAddOns)
    .where(and(eq(bookingAddOns.id, addOnId), eq(bookingAddOns.bookingPageId, page.id)))
    .limit(1);
  return addOn ?? null;
}

type Params = { params: Promise<{ id: string; addOnId: string }> };

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id, addOnId } = await params;
  const addOn = await resolveAddOn(parseInt(id), parseInt(addOnId), parseInt(session.user.id, 10));
  if (!addOn) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.price !== undefined) updates.price = parseInt(String(body.price));
  if (body.image !== undefined) updates.image = body.image;
  if (body.maxQuantity !== undefined) updates.maxQuantity = body.maxQuantity;
  if (body.active !== undefined) updates.active = body.active;
  if (body.order !== undefined) updates.order = body.order;

  const [updated] = await db.update(bookingAddOns)
    .set(updates)
    .where(eq(bookingAddOns.id, addOn.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id, addOnId } = await params;
  const addOn = await resolveAddOn(parseInt(id), parseInt(addOnId), parseInt(session.user.id, 10));
  if (!addOn) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(bookingAddOns).where(eq(bookingAddOns.id, addOn.id));
  return NextResponse.json({ success: true });
}
