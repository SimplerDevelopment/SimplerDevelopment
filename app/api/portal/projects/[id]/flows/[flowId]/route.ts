// Workflow Designer: single agent flow (read/save-graph/delete). Editor+ to
// mutate. `authorize()` re-checks BOTH the project's tenant ownership AND
// that the flow belongs to this exact project (agentFlows.projectId ===
// the route's [id]) in one WHERE clause — a foreign flowId, or a flowId
// that belongs to a different project owned by the same tenant, both fail
// closed to 404. Never 403 on a tenant/ownership mismatch (no existence
// leak) — pattern mirrors ../../goals/route.ts's authorize() helper.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agentFlows, projects, projectMembers } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';
import { PERSONA_SLUGS, findSelfReviewWarnings, type AgentFlowGraph, type AgentFlowStatus } from '@/lib/agent-flows/types';

const STATUSES: AgentFlowStatus[] = ['draft', 'active', 'archived'];
const PERSONA_SLUG_SET: ReadonlySet<string> = new Set(PERSONA_SLUGS);

async function authorize(projectId: number, flowId: number) {
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

  // flowId is never trusted alone — always joined to the tenant-owned
  // project row loaded above.
  const [flow] = await db.select().from(agentFlows)
    .where(and(eq(agentFlows.id, flowId), eq(agentFlows.projectId, projectId)))
    .limit(1);
  if (!flow) return null;

  return { userId, project, flow, canEdit: staff || (await canUserEditProject(userId, projectId)) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; flowId: string }> }) {
  const { id, flowId } = await params;
  const projectId = parseInt(id, 10);
  const fId = parseInt(flowId, 10);
  const access = await authorize(projectId, fId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: access.flow });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; flowId: string }> }) {
  const { id, flowId } = await params;
  const projectId = parseInt(id, 10);
  const fId = parseInt(flowId, 10);
  const access = await authorize(projectId, fId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const graph = body.graph as AgentFlowGraph | undefined;
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return NextResponse.json({ success: false, message: 'graph is required' }, { status: 400 });
  }

  // Bound the payload before we do anything else with it — a huge graph
  // (accidental or malicious) shouldn't be validated node-by-node or hit
  // the DB at all.
  if (graph.nodes.length > 500 || graph.edges.length > 500 || JSON.stringify(graph).length > 256_000) {
    return NextResponse.json({ success: false, message: 'Graph too large' }, { status: 413 });
  }

  // Every node's agentType must be null or a real persona slug, and kind
  // must be one of the two known node kinds — reject anything else in one
  // pass rather than letting garbage into the stored graph.
  for (const node of graph.nodes) {
    const data = node?.data;
    const agentTypeOk = data && (data.agentType === null || (typeof data.agentType === 'string' && PERSONA_SLUG_SET.has(data.agentType)));
    const kindOk = data && (data.kind === 'agent' || data.kind === 'step' || data.kind === 'human' || data.kind === 'flow');
    if (!agentTypeOk || !kindOk) {
      return NextResponse.json({ success: false, message: 'Invalid node in graph' }, { status: 400 });
    }
  }

  // Every edge must connect two nodes that exist in this same payload. The
  // canvas can't produce a dangling edge (onConnect only fires between real
  // nodes, and deleting a node prunes its edges), so this guards the API
  // path: a connector to a missing node renders as an edge to nowhere and
  // would send a future orchestration runtime down a path with no node at
  // the end of it.
  const nodeIds = new Set(graph.nodes.map((n) => n?.id));
  for (const edge of graph.edges) {
    if (!edge || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return NextResponse.json({ success: false, message: 'Invalid edge in graph' }, { status: 400 });
    }
  }

  // Human-in-the-loop nodes carry project-member user ids. Those ids live in
  // a JSONB blob, so without this check an API caller could assign a node to
  // any user id at all — including one belonging to another tenant. Collect
  // every referenced id and confirm in ONE query that they are all members of
  // THIS project.
  const assignedIds = [...new Set(
    graph.nodes.flatMap((n) => (Array.isArray(n?.data?.assigneeIds) ? n.data.assigneeIds : [])),
  )];
  if (assignedIds.length > 0) {
    if (assignedIds.some((v) => !Number.isInteger(v))) {
      return NextResponse.json({ success: false, message: 'Invalid assignee in graph' }, { status: 400 });
    }
    const members = await db.select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        inArray(projectMembers.userId, assignedIds as number[]),
      ));
    const memberIds = new Set(members.map((m) => m.userId));
    if (assignedIds.some((v) => !memberIds.has(v as number))) {
      return NextResponse.json({ success: false, message: 'Invalid assignee in graph' }, { status: 400 });
    }
  }

  const status = body.status !== undefined ? body.status : access.flow.status;
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    graph,
    status,
    updatedAt: new Date(),
  };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 255);
  if (body.description !== undefined) {
    updates.description = typeof body.description === 'string' ? body.description.slice(0, 5000) : null;
  }

  // No projectId/clientId field is ever accepted from the body, and the
  // UPDATE itself is re-scoped by (id, projectId) — a flow can never be
  // moved across projects through this route.
  const [row] = await db.update(agentFlows)
    .set(updates)
    .where(and(eq(agentFlows.id, fId), eq(agentFlows.projectId, projectId)))
    .returning();

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Advisory only — computed AFTER the write, and never a reason to reject.
  // A node that reviews work produced by its own persona is the one defect
  // this system cannot catch by itself (the run goes green either way), but
  // the detector is a keyword heuristic over author-written labels and
  // same-persona sequences are frequently legitimate. Failing a save on that
  // would train people to word around it. /sd-run-flow re-checks at dispatch,
  // where the full prompt is readable.
  const warnings = findSelfReviewWarnings(graph);

  return NextResponse.json({ success: true, data: row, warnings });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; flowId: string }> }) {
  const { id, flowId } = await params;
  const projectId = parseInt(id, 10);
  const fId = parseInt(flowId, 10);
  const access = await authorize(projectId, fId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(agentFlows).where(and(eq(agentFlows.id, fId), eq(agentFlows.projectId, projectId)));

  return NextResponse.json({ success: true });
}
