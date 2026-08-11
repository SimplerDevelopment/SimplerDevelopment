/**
 * GET /api/admin/agent-flow-runs
 *
 * Cross-tenant executions rollup — every agent-flow run of every client,
 * newest first. The staff-wide counterpart to the per-project list at
 * /api/portal/projects/:id/flow-runs.
 *
 * Deliberately unscoped by tenant: routes under app/admin/** are global (see
 * app/admin/CLAUDE.md), and agentFlowRuns.clientId exists precisely so this
 * rollup is additive rather than a migration (lib/db/schema/agentFlows.ts).
 * `clients`/`users` are joined only to render a human name per row.
 *
 * Slim by design, mirroring the portal route — no graph, no event log.
 * projectId travels on every row so the client can reuse the existing
 * per-run detail + SSE routes without a second lookup.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentFlowRuns, agentFlows, projects, clients, users } from '@/lib/db/schema';
import { desc, eq, sql, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { TERMINAL_RUN_STATUSES, type AgentFlowRunStatus } from '@/lib/agent-flows/types';

// Local staff gate, matching every sibling route under app/api/admin/**.
async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

const ACTIVE_STATUSES: AgentFlowRunStatus[] = ['running', 'waiting'];

export async function GET(req: Request) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 200);

  // `active` is the useful default view for a monitor — a run nobody is
  // driving sits in `running` forever, so surfacing those is the point.
  const filter = url.searchParams.get('filter');
  const where =
    filter === 'active' ? inArray(agentFlowRuns.status, ACTIVE_STATUSES)
    : filter === 'terminal' ? inArray(agentFlowRuns.status, [...TERMINAL_RUN_STATUSES])
    : undefined;

  const rows = await db.select({
    id: agentFlowRuns.id,
    flowId: agentFlowRuns.flowId,
    flowName: agentFlows.name,
    projectId: agentFlowRuns.projectId,
    projectName: projects.name,
    clientId: agentFlowRuns.clientId,
    company: clients.company,
    ownerName: users.name,
    ownerEmail: users.email,
    status: agentFlowRuns.status,
    parentRunId: agentFlowRuns.parentRunId,
    depth: agentFlowRuns.depth,
    inputTokens: agentFlowRuns.inputTokens,
    outputTokens: agentFlowRuns.outputTokens,
    startedAt: agentFlowRuns.startedAt,
    finishedAt: agentFlowRuns.finishedAt,
    lastEventAt: agentFlowRuns.lastEventAt,
    nodeCount: sql<number>`jsonb_array_length(coalesce(${agentFlowRuns.graph}->'nodes', '[]'::jsonb))`.as('nodeCount'),
    // Both oddities below are load-bearing and are copied verbatim from the
    // portal route, where they were each a real bug:
    //   - the outer reference is HARD-CODED as `agent_flow_runs.id`. An
    //     interpolated ${agentFlowRuns.id} emits an unqualified column that
    //     resolves against the SUBquery and silently returns 0.
    //   - the ::int cast matters because count() is bigint, which the driver
    //     returns as a STRING; without it any arithmetic concatenates.
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
    .innerJoin(projects, eq(projects.id, agentFlowRuns.projectId))
    // left joins: a run must still be listable if its client row or owner has
    // been cleaned up, otherwise the monitor silently loses history.
    .leftJoin(clients, eq(clients.id, agentFlowRuns.clientId))
    .leftJoin(users, eq(users.id, clients.userId))
    .where(where)
    .orderBy(desc(agentFlowRuns.startedAt))
    .limit(limit);

  return NextResponse.json({ success: true, data: rows });
}
