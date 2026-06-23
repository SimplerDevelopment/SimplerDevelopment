import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, bookingDateOverrides } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function resolveOverride(pageId: number, overrideId: number, userId: number) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [page] = await db.select({ id: bookingPages.id }).from(bookingPages)
    .where(and(eq(bookingPages.id, pageId), eq(bookingPages.clientId, client.id)))
    .limit(1);
  if (!page) return null;
  const [override] = await db.select().from(bookingDateOverrides)
    .where(and(eq(bookingDateOverrides.id, overrideId), eq(bookingDateOverrides.bookingPageId, page.id)))
    .limit(1);
  return override ?? null;
}

type Params = { params: Promise<{ id: string; overrideId: string }> };

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id, overrideId } = await params;
  const override = await resolveOverride(parseInt(id), parseInt(overrideId), parseInt(session.user.id, 10));
  if (!override) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.date !== undefined) updates.date = body.date;
  if (body.type !== undefined) updates.type = body.type;
  if (body.startTime !== undefined) updates.startTime = body.startTime;
  if (body.endTime !== undefined) updates.endTime = body.endTime;
  if (body.note !== undefined) updates.note = body.note;

  const [updated] = await db.update(bookingDateOverrides)
    .set(updates)
    .where(eq(bookingDateOverrides.id, override.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id, overrideId } = await params;
  const override = await resolveOverride(parseInt(id), parseInt(overrideId), parseInt(session.user.id, 10));
  if (!override) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(bookingDateOverrides).where(eq(bookingDateOverrides.id, override.id));
  return NextResponse.json({ success: true });
}
