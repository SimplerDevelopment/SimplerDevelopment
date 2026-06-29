import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { db } from '@/lib/db';
import { mcpPendingChanges } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Bearer-aware (mobile) + NextAuth (web). action:'admin' enforces the
  // owner/admin gate that previously lived in an explicit role check.
  const authResult = await authorizePortal({ action: 'admin' });
  if (isAuthError(authResult)) return authResult.response;
  const { client, userId } = authResult;

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

  // Invalidate the per-client approvals-count cache used by the layout bell.
  try { revalidateTag(`approvals:${client.id}`, 'max'); } catch { /* ignore */ }

  return NextResponse.json({ success: true, data: updated });
}
