import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { workflowRuns, workflowRunSteps } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and } from 'drizzle-orm';

// POST /api/portal/workflows/runs/[runId]/retry
// Resets dead_letter steps to pending and moves the run back to pending so the
// cron drainer picks it up on its next tick. Tenant-scoped via clientId.
export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const authResult = await authorizePortal({ action: 'write' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
  }

  const { runId } = await params;
  const id = parseInt(runId, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: 'Invalid runId' }, { status: 400 });
  }

  // Verify tenant ownership before mutating anything.
  const [run] = await db
    .select({ id: workflowRuns.id, status: workflowRuns.status })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, id), eq(workflowRuns.clientId, client.id)))
    .limit(1);

  if (!run) {
    return NextResponse.json({ success: false, error: 'Run not found' }, { status: 404 });
  }

  // Reset dead_letter steps → pending, clearing nextRetryAt so the cron
  // drainer can claim them immediately.
  const resetSteps = await db
    .update(workflowRunSteps)
    .set({
      status: 'pending',
      nextRetryAt: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRunSteps.runId, id),
        eq(workflowRunSteps.clientId, client.id),
        eq(workflowRunSteps.status, 'dead_letter'),
      ),
    )
    .returning({ id: workflowRunSteps.id });

  // Move the run itself back to pending so the UI reflects the queued state.
  const [updatedRun] = await db
    .update(workflowRuns)
    .set({ status: 'pending', error: null, completedAt: null })
    .where(and(eq(workflowRuns.id, id), eq(workflowRuns.clientId, client.id)))
    .returning({ id: workflowRuns.id, status: workflowRuns.status });

  return NextResponse.json({
    success: true,
    data: { run: updatedRun, resetStepCount: resetSteps.length },
  });
}
