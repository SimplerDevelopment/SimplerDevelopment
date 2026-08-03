// Workflow Designer: project-scoped agent flows (list + create). Editor+ to
// mutate. No entitlement/requireService gate — this is a free project
// feature, same as goals. Pattern mirrors ../goals/route.ts exactly.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agentFlows, projects } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';
import type { AgentFlowGraph } from '@/lib/agent-flows/types';

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
  return { userId, project, canEdit: staff || (await canUserEditProject(userId, projectId)) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorize(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Derive node/edge counts in SQL instead of selecting the full graph
  // blob just to count it — the list view never needs the graph payload.
  const data = await db.select({
    id: agentFlows.id,
    name: agentFlows.name,
    status: agentFlows.status,
    updatedAt: agentFlows.updatedAt,
    nodeCount: sql<number>`jsonb_array_length(coalesce(${agentFlows.graph}->'nodes', '[]'::jsonb))`.as('nodeCount'),
    edgeCount: sql<number>`jsonb_array_length(coalesce(${agentFlows.graph}->'edges', '[]'::jsonb))`.as('edgeCount'),
  }).from(agentFlows)
    .where(eq(agentFlows.projectId, projectId))
    .orderBy(desc(agentFlows.updatedAt));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorize(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  const emptyGraph: AgentFlowGraph = { nodes: [], edges: [] };

  // clientId is ALWAYS stamped from the loaded project row, never the
  // request body — this is the tenant-scoping invariant for this table.
  const [row] = await db.insert(agentFlows).values({
    projectId,
    clientId: access.project.clientId,
    name: body.name.trim().slice(0, 255),
    description: typeof body.description === 'string' ? body.description.slice(0, 5000) : null,
    graph: emptyGraph,
    createdBy: access.userId,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
