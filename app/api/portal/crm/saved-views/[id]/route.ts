import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmSavedViews } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const viewId = parseInt(id, 10);
  if (isNaN(viewId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.filters !== undefined) updates.filters = body.filters;
  if (body.isDefault !== undefined) updates.isDefault = body.isDefault;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, message: 'No fields to update' },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(crmSavedViews)
    .set(updates)
    .where(and(eq(crmSavedViews.id, viewId), eq(crmSavedViews.clientId, client.id)))
    .returning();

  if (!updated)
    return NextResponse.json({ success: false, message: 'View not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const viewId = parseInt(id, 10);
  if (isNaN(viewId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmSavedViews)
    .where(and(eq(crmSavedViews.id, viewId), eq(crmSavedViews.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'View not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
