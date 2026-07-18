import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and } from 'drizzle-orm';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizePortal({ action: 'write' });
  if (isAuthError(authz)) return authz.response;
  const { client } = authz;

  const { id } = await params;

  const body = await req.json();
  const { alt, caption } = body;

  const [updated] = await db
    .update(media)
    .set({
      ...(alt !== undefined && { alt: alt || null }),
      ...(caption !== undefined && { caption: caption || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(media.id, parseInt(id)), eq(media.clientId, client.id)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Media not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizePortal({ action: 'write' });
  if (isAuthError(authz)) return authz.response;
  const { client } = authz;

  const { id } = await params;

  const [deleted] = await db
    .delete(media)
    .where(and(eq(media.id, parseInt(id)), eq(media.clientId, client.id)))
    .returning();

  if (!deleted) return NextResponse.json({ success: false, message: 'Media not found' }, { status: 404 });
  return NextResponse.json({ success: true, message: 'Media deleted' });
}
