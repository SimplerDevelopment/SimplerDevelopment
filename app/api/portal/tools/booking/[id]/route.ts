import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
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

  // Service access check
  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const page = await resolveBookingPage(parseInt(id), parseInt(session.user.id, 10));
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: page });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const page = await resolveBookingPage(parseInt(id), parseInt(session.user.id, 10));
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.bufferBefore !== undefined) updates.bufferBefore = body.bufferBefore;
  if (body.bufferAfter !== undefined) updates.bufferAfter = body.bufferAfter;
  if (body.maxAdvanceDays !== undefined) updates.maxAdvanceDays = body.maxAdvanceDays;
  if (body.minNoticeMins !== undefined) updates.minNoticeMins = body.minNoticeMins;
  if (body.timezone !== undefined) updates.timezone = body.timezone;
  if (body.availability !== undefined) updates.availability = body.availability;
  if (body.questions !== undefined) updates.questions = body.questions;
  if (body.color !== undefined) updates.color = body.color;
  if (body.brandingProfileId !== undefined) updates.brandingProfileId = body.brandingProfileId || null;
  if (body.active !== undefined) updates.active = body.active;
  if (body.googleCalendarSync !== undefined) updates.googleCalendarSync = body.googleCalendarSync;

  const [updated] = await db.update(bookingPages)
    .set(updates)
    .where(eq(bookingPages.id, page.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const { id } = await params;
  const page = await resolveBookingPage(parseInt(id), parseInt(session.user.id, 10));
  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(bookingPages).where(eq(bookingPages.id, page.id));
  return NextResponse.json({ success: true });
}
