import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailSubscriberTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const tagId = parseInt(id, 10);
  if (Number.isNaN(tagId)) {
    return NextResponse.json({ success: false, message: 'Invalid tag id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof emailSubscriberTags.$inferInsert> = {};
  if (typeof body.name === 'string') updates.name = body.name;
  if (typeof body.color === 'string') updates.color = body.color;

  const [updated] = await db
    .update(emailSubscriberTags)
    .set(updates)
    .where(and(eq(emailSubscriberTags.id, tagId), eq(emailSubscriberTags.clientId, client.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ success: false, message: 'Tag not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: { id: updated.id, name: updated.name, color: updated.color },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  await db.delete(emailSubscriberTags)
    .where(and(eq(emailSubscriberTags.id, parseInt(id, 10)), eq(emailSubscriberTags.clientId, client.id)));

  return NextResponse.json({ success: true });
}
