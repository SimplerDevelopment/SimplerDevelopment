import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { workflowRuns, workflowRunSteps } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and } from 'drizzle-orm';

// GET /api/portal/workflows/runs/[runId]
// Returns the run row plus all its workflowRunSteps, tenant-scoped.
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const authResult = await authorizePortal({ action: 'read' });
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

  // Fetch the run, verifying tenant ownership via clientId.
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, id), eq(workflowRuns.clientId, client.id)))
    .limit(1);

  if (!run) {
    return NextResponse.json({ success: false, error: 'Run not found' }, { status: 404 });
  }

  // Fetch the mutable step queue rows for this run.
  const steps = await db
    .select({
      id: workflowRunSteps.id,
      nodeId: workflowRunSteps.nodeId,
      action: workflowRunSteps.action,
      status: workflowRunSteps.status,
      attemptCount: workflowRunSteps.attemptCount,
      nextRetryAt: workflowRunSteps.nextRetryAt,
      result: workflowRunSteps.result,
      error: workflowRunSteps.error,
      createdAt: workflowRunSteps.createdAt,
      updatedAt: workflowRunSteps.updatedAt,
    })
    .from(workflowRunSteps)
    // clientId on steps is redundant given the run check above, but is a
    // defence-in-depth tenant guard so cross-tenant rows can never leak.
    .where(and(eq(workflowRunSteps.runId, id), eq(workflowRunSteps.clientId, client.id)));

  return NextResponse.json({ success: true, data: { run, steps } });
}
