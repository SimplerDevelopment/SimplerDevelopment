// Staff (admin/employee) approval dispatcher for the unified approvals inbox.
// Routes to the correct underlying business logic by source. NEVER duplicates
// the per-source apply/transaction logic — just adapts staff auth onto the
// existing helpers:
//   - mcp     → applyPendingChange() from lib/mcp/approvals.ts
//   - brain   → approveReviewItem() from lib/brain/review.ts
//   - service → PATCH status='approved' on serviceRequests
//   - project → PATCH status='approved' on suggestedProjectRequests

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  mcpPendingChanges,
  brainAiReviewItems,
  serviceRequests,
  suggestedProjectRequests,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { applyPendingChange } from '@/lib/mcp/approvals';
import { approveReviewItem } from '@/lib/brain/review';

export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function POST(
  _req: Request,
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

  try {
    switch (source) {
      case 'mcp': {
        const [change] = await db
          .select()
          .from(mcpPendingChanges)
          .where(eq(mcpPendingChanges.id, itemId))
          .limit(1);
        if (!change) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
        if (change.status !== 'pending') {
          return NextResponse.json(
            { success: false, message: `Cannot approve — status is ${change.status}` },
            { status: 400 },
          );
        }
        try {
          const result = await applyPendingChange(change, change.clientId, userId);
          const [updated] = await db
            .update(mcpPendingChanges)
            .set({
              status: 'applied',
              reviewerId: userId,
              reviewedAt: new Date(),
              appliedAt: new Date(),
            })
            .where(eq(mcpPendingChanges.id, itemId))
            .returning();
          try { revalidatePath('/portal', 'layout'); } catch { /* ignore */ }
          return NextResponse.json({ success: true, data: { change: updated, result } });
        } catch (err) {
          const message = (err as Error).message;
          await db
            .update(mcpPendingChanges)
            .set({
              status: 'failed',
              reviewerId: userId,
              reviewedAt: new Date(),
              errorMessage: message,
            })
            .where(eq(mcpPendingChanges.id, itemId));
          return NextResponse.json({ success: false, message: `Apply failed: ${message}` }, { status: 500 });
        }
      }

      case 'brain': {
        // approveReviewItem enforces tenancy via (clientId, itemId), so resolve
        // the clientId first then delegate to the helper.
        const [item] = await db
          .select({ clientId: brainAiReviewItems.clientId })
          .from(brainAiReviewItems)
          .where(eq(brainAiReviewItems.id, itemId))
          .limit(1);
        if (!item) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
        const result = await approveReviewItem({
          clientId: item.clientId,
          itemId,
          actorId: userId,
        });
        return NextResponse.json({ success: true, data: result });
      }

      case 'service': {
        const [row] = await db
          .update(serviceRequests)
          .set({ status: 'approved', updatedAt: new Date() })
          .where(eq(serviceRequests.id, itemId))
          .returning();
        if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true, data: row });
      }

      case 'project': {
        const [row] = await db
          .update(suggestedProjectRequests)
          .set({ status: 'approved', updatedAt: new Date() })
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
      { success: false, message: err instanceof Error ? err.message : 'Approve failed' },
      { status: 500 },
    );
  }
}
