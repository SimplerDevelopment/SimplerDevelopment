import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mcpPendingChanges } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient, getPortalRole } from '@/lib/portal-client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const role = await getPortalRole(userId, client.id);
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Only owners and admins can reject MCP changes' }, { status: 403 });
  }

  const { id } = await params;
  const changeId = parseInt(id, 10);
  const body = await req.json().catch(() => ({} as { note?: string }));
  const note = typeof body.note === 'string' ? body.note : null;

  const [change] = await db
    .select({ id: mcpPendingChanges.id, status: mcpPendingChanges.status })
    .from(mcpPendingChanges)
    .where(and(eq(mcpPendingChanges.id, changeId), eq(mcpPendingChanges.clientId, client.id)))
    .limit(1);

  if (!change) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (change.status !== 'pending') {
    return NextResponse.json({ success: false, message: `Cannot reject — status is ${change.status}` }, { status: 400 });
  }

  const [updated] = await db
    .update(mcpPendingChanges)
    .set({
      status: 'rejected',
      reviewerId: userId,
      reviewedAt: new Date(),
      reviewNote: note,
    })
    .where(eq(mcpPendingChanges.id, changeId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}
