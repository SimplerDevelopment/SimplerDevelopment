import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailSegments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.rules !== undefined) updates.rules = body.rules;
  if (body.matchType !== undefined) updates.matchType = body.matchType;

  const [updated] = await db.update(emailSegments)
    .set(updates)
    .where(and(eq(emailSegments.id, parseInt(id, 10)), eq(emailSegments.clientId, client.id)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Segment not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  await db.delete(emailSegments)
    .where(and(eq(emailSegments.id, parseInt(id, 10)), eq(emailSegments.clientId, client.id)));

  return NextResponse.json({ success: true });
}
