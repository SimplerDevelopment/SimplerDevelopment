/**
 * GET /api/portal/projects/:id/flow-runs
 *
 * Executions list for one project — every run of every flow in it, newest
 * first. Read-only: runs are created by the RUNNER through the
 * agent_flow_runs_start MCP tool, not from the portal, because execution lives
 * in a Claude Code session (see lib/agent-flows/events.ts).
 *
 * Slim by design — no graph, no event log. `nodeCount`/`doneCount` are derived
 * in SQL so the list can show "7 of 14" without shipping either payload.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentFlowRuns, agentFlows, projects } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';

async function authorize(projectId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return { project };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const access = await authorize(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
  const flowIdParam = url.searchParams.get('flowId');
  const flowId = flowIdParam ? Number.parseInt(flowIdParam, 10) : null;

  const where = flowId && Number.isFinite(flowId)
    ? and(eq(agentFlowRuns.projectId, projectId), eq(agentFlowRuns.flowId, flowId))
    : eq(agentFlowRuns.projectId, projectId);

  const rows = await db.select({
    id: agentFlowRuns.id,
    flowId: agentFlowRuns.flowId,
    flowName: agentFlows.name,
    status: agentFlowRuns.status,
    parentRunId: agentFlowRuns.parentRunId,
    depth: agentFlowRuns.depth,
    inputTokens: agentFlowRuns.inputTokens,
    outputTokens: agentFlowRuns.outputTokens,
    startedAt: agentFlowRuns.startedAt,
    finishedAt: agentFlowRuns.finishedAt,
    lastEventAt: agentFlowRuns.lastEventAt,
    // Derived in SQL so the list never ships the graph or the event log.
    nodeCount: sql<number>`jsonb_array_length(coalesce(${agentFlowRuns.graph}->'nodes', '[]'::jsonb))`.as('nodeCount'),
    // The outer reference is HARD-CODED as `agent_flow_runs.id`, not
    // interpolated as ${agentFlowRuns.id}. Drizzle emits an unqualified column
    // name for an interpolated outer ref inside a correlated subquery, which
    // resolves against the SUBquery and silently returns 0 rather than
    // erroring — see the footgun documented in lib/db/CLAUDE.md. A progress
    // bar stuck at 0/20 with no error is exactly that bug.
    // The ::int cast is load-bearing, not cosmetic. Postgres count() returns
    // bigint, which the driver hands back as a STRING to avoid precision loss
    // — so without the cast this field is typed number and is actually '2'.
    // It survives `${doneCount}/${nodeCount}` rendering and even division by
    // coercion, which is exactly why it would have gone unnoticed, but any
    // arithmetic on it concatenates. Caught by the integration test asserting
    // toBe(2) rather than a loose equality.
    doneCount: sql<number>`(
      select count(distinct e.node_id)::int
      from agent_flow_run_events e
      where e.run_id = agent_flow_runs.id
        and e.type = 'node.status'
        and e.status in ('finished','skipped')
    )`.as('doneCount'),
  })
    .from(agentFlowRuns)
    .innerJoin(agentFlows, eq(agentFlows.id, agentFlowRuns.flowId))
    .where(where)
    .orderBy(desc(agentFlowRuns.startedAt))
    .limit(limit);

  return NextResponse.json({ success: true, data: rows });
}
