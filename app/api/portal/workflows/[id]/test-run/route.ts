import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and } from 'drizzle-orm';
import { runWorkflow } from '@/lib/workflows/runtime';

// POST /api/portal/workflows/[id]/test-run — fire the workflow with a
// synthetic context. The single live call site for the runtime today; real
// CRM event hooks come later via lib/workflows/trigger.ts.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const workflowId = parseInt(id, 10);
  if (!Number.isFinite(workflowId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  const [wf] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.clientId, client.id)))
    .limit(1);
  if (!wf) return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { context?: Record<string, unknown> };
  const context = {
    clientId: client.id,
    triggeredAt: new Date().toISOString(),
    ...(body.context ?? {}),
  };

  const result = await runWorkflow(wf.id, context, { triggeredBy: 'test-run' });

  return NextResponse.json({ success: result.status === 'completed', data: result });
}
