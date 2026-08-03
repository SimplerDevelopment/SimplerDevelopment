/**
 * GET /api/portal/projects/:id/flow-runs/:runId
 *
 * One execution: the run row (including its graph SNAPSHOT — not the flow's
 * current graph) plus its full event log. The snapshot is why a run opened
 * days later still renders coherently even if the flow has since been edited.
 *
 * The live view uses ../stream instead; this is the cold read for a finished
 * run, and the initial payload for a client that would rather not fold from
 * SSE replay.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentFlowRuns, agentFlowRunEvents, agentFlows, projects } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';

const EVENT_LIMIT = 2000;

async function authorize(projectId: number, runId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();

  const [project] = await db.select({ id: projects.id, clientId: projects.clientId })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }

  // runId always joined to the tenant-owned project — a run from another
  // project fails closed to 404 rather than confirming it exists.
  const [run] = await db.select({
    id: agentFlowRuns.id,
    flowId: agentFlowRuns.flowId,
    flowName: agentFlows.name,
    projectId: agentFlowRuns.projectId,
    status: agentFlowRuns.status,
    graph: agentFlowRuns.graph,
    parentRunId: agentFlowRuns.parentRunId,
    parentNodeId: agentFlowRuns.parentNodeId,
    depth: agentFlowRuns.depth,
    inputTokens: agentFlowRuns.inputTokens,
    outputTokens: agentFlowRuns.outputTokens,
    startedBy: agentFlowRuns.startedBy,
    startedAt: agentFlowRuns.startedAt,
    finishedAt: agentFlowRuns.finishedAt,
    lastEventAt: agentFlowRuns.lastEventAt,
  })
    .from(agentFlowRuns)
    .innerJoin(agentFlows, eq(agentFlows.id, agentFlowRuns.flowId))
    .where(and(eq(agentFlowRuns.id, runId), eq(agentFlowRuns.projectId, projectId)))
    .limit(1);
  if (!run) return null;

  return { run };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId: runIdRaw } = await params;
  const projectId = parseInt(id, 10);
  const runId = parseInt(runIdRaw, 10);
  if (isNaN(projectId) || isNaN(runId)) {
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
  }

  const access = await authorize(projectId, runId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const events = await db.select({
    id: agentFlowRunEvents.id,
    type: agentFlowRunEvents.type,
    nodeId: agentFlowRunEvents.nodeId,
    status: agentFlowRunEvents.status,
    summary: agentFlowRunEvents.summary,
    model: agentFlowRunEvents.model,
    inputTokens: agentFlowRunEvents.inputTokens,
    outputTokens: agentFlowRunEvents.outputTokens,
    durationMs: agentFlowRunEvents.durationMs,
    createdAt: agentFlowRunEvents.createdAt,
  })
    .from(agentFlowRunEvents)
    .where(eq(agentFlowRunEvents.runId, runId))
    .orderBy(asc(agentFlowRunEvents.id))
    .limit(EVENT_LIMIT);

  // Child runs, so the UI can link a `flow` node to the execution it spawned.
  const children = await db.select({
    id: agentFlowRuns.id,
    flowId: agentFlowRuns.flowId,
    parentNodeId: agentFlowRuns.parentNodeId,
    status: agentFlowRuns.status,
  }).from(agentFlowRuns).where(eq(agentFlowRuns.parentRunId, runId));

  return NextResponse.json({ success: true, data: { run: access.run, events, children } });
}
