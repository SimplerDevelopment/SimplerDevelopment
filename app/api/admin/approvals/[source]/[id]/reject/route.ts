// Staff (admin/employee) reject dispatcher for the unified approvals inbox.
// See ../approve/route.ts for the approve side. Reuses existing helpers
// per source — no duplication of reject logic.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  mcpPendingChanges,
  brainAiReviewItems,
  serviceRequests,
  suggestedProjectRequests,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rejectReviewItem } from '@/lib/brain/review';

export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user!.id as string, 10);

  const { source, id } = await params;
  const itemId = parseInt(id, 10);
  if (Number.isNaN(itemId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as { note?: string }));
  const note = typeof body?.note === 'string' ? body.note : null;

  try {
    switch (source) {
      case 'mcp': {
        const [change] = await db
          .select({ id: mcpPendingChanges.id, status: mcpPendingChanges.status })
          .from(mcpPendingChanges)
          .where(eq(mcpPendingChanges.id, itemId))
          .limit(1);
        if (!change) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
        if (change.status !== 'pending') {
          return NextResponse.json(
            { success: false, message: `Cannot reject — status is ${change.status}` },
            { status: 400 },
          );
        }
        const [updated] = await db
          .update(mcpPendingChanges)
          .set({
            status: 'rejected',
            reviewerId: userId,
            reviewedAt: new Date(),
            reviewNote: note,
          })
          .where(eq(mcpPendingChanges.id, itemId))
          .returning();
        return NextResponse.json({ success: true, data: updated });
      }

      case 'brain': {
        const [item] = await db
          .select({ clientId: brainAiReviewItems.clientId })
          .from(brainAiReviewItems)
          .where(eq(brainAiReviewItems.id, itemId))
          .limit(1);
        if (!item) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
        const updated = await rejectReviewItem({
          clientId: item.clientId,
          itemId,
          actorId: userId,
          reason: note ?? undefined,
        });
        if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true, data: updated });
      }

      case 'service': {
        const patch: Record<string, unknown> = { status: 'rejected', updatedAt: new Date() };
        if (note) patch.adminNotes = note;
        const [row] = await db
          .update(serviceRequests)
          .set(patch)
          .where(eq(serviceRequests.id, itemId))
          .returning();
        if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true, data: row });
      }

      case 'project': {
        const patch: Record<string, unknown> = { status: 'rejected', updatedAt: new Date() };
        if (note) patch.adminNotes = note;
        const [row] = await db
          .update(suggestedProjectRequests)
          .set(patch)
          .where(eq(suggestedProjectRequests.id, itemId))
          .returning();
        if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true, data: row });
      }

      default:
        return NextResponse.json({ success: false, message: `Unknown source "${source}"` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Reject failed' },
      { status: 500 },
    );
  }
}

