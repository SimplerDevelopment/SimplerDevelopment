// GET — fetch a single snapshot (including the full payload).
// DELETE — remove a snapshot.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteSnapshots } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

async function loadOwnedSnapshot(id: number, clientId: number) {
  const [row] = await db
    .select()
    .from(siteSnapshots)
    .where(and(eq(siteSnapshots.id, id), eq(siteSnapshots.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const { id } = await params;
  const snap = await loadOwnedSnapshot(parseInt(id, 10), client.id);
  if (!snap) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: snap });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const { id } = await params;
  const snap = await loadOwnedSnapshot(parseInt(id, 10), client.id);
  if (!snap) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  await db.delete(siteSnapshots).where(eq(siteSnapshots.id, snap.id));

  return NextResponse.json({ success: true, data: { id: snap.id } });
}
