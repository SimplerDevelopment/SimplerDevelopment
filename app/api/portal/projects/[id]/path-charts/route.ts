// GET /api/portal/projects/:id/path-charts
//
// List Path Visualizations ("Dev Paths") charts attached to a project, with
// per-chart node/edge counts and last-event timestamp so the portal can
// render a picker/list without a follow-up fetch per chart.
//
// Auth mirrors app/api/portal/projects/[id]/artifacts/route.ts's
// getAuthedProject exactly: staff (admin/employee) bypass, otherwise
// getPortalClient(userId) must match project.clientId (403 Forbidden on
// mismatch, matching that route's behavior byte-for-byte).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { projects, pathCharts, pathChartNodes, pathChartEdges, pathChartEvents } from '@/lib/db/schema';
import { eq, desc, inArray, sql } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

async function getAuthedProject(projectId: number) {
  // Parallelize auth() and the project lookup. The project row doesn't depend
  // on the session, and the staff/client gate runs after both resolve.
  const [session, projectRows] = await Promise.all([
    auth(),
    db
      .select({ id: projects.id, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  ]);
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);

  const project = projectRows[0];
  if (!project) return { error: NextResponse.json({ success: false, message: 'Project not found' }, { status: 404 }) };

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return { error: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
    }
  }

  return { userId, project, clientId: project.clientId };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (!Number.isFinite(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedProject(projectId);
  if ('error' in result) return result.error;

  const charts = await db
    .select({
      id: pathCharts.id,
      title: pathCharts.title,
      description: pathCharts.description,
      appLabel: pathCharts.appLabel,
      status: pathCharts.status,
      createdByAgent: pathCharts.createdByAgent,
      updatedAt: pathCharts.updatedAt,
    })
    .from(pathCharts)
    .where(eq(pathCharts.projectId, projectId))
    .orderBy(desc(pathCharts.updatedAt));

  if (charts.length === 0) {
    return NextResponse.json(
      { success: true, data: [] },
      { headers: { 'Cache-Control': 'private, max-age=10' } },
    );
  }

  const chartIds = charts.map((c) => c.id);

  // Three independent grouped aggregates, run in parallel — cheaper than a
  // 3-way join fan-out and the per-chart volumes here are small (nodes/edges
  // per chart, not per project).
  const [nodeCounts, edgeCounts, lastEvents] = await Promise.all([
    db
      .select({ chartId: pathChartNodes.chartId, count: sql<number>`count(*)::int` })
      .from(pathChartNodes)
      .where(inArray(pathChartNodes.chartId, chartIds))
      .groupBy(pathChartNodes.chartId),
    db
      .select({ chartId: pathChartEdges.chartId, count: sql<number>`count(*)::int` })
      .from(pathChartEdges)
      .where(inArray(pathChartEdges.chartId, chartIds))
      .groupBy(pathChartEdges.chartId),
    db
      .select({ chartId: pathChartEvents.chartId, lastEventAt: sql<Date>`max(${pathChartEvents.createdAt})` })
      .from(pathChartEvents)
      .where(inArray(pathChartEvents.chartId, chartIds))
      .groupBy(pathChartEvents.chartId),
  ]);

  const nodeCountByChart = new Map(nodeCounts.map((r) => [r.chartId, Number(r.count)]));
  const edgeCountByChart = new Map(edgeCounts.map((r) => [r.chartId, Number(r.count)]));
  const lastEventAtByChart = new Map(lastEvents.map((r) => [r.chartId, r.lastEventAt]));

  const data = charts.map((c) => ({
    ...c,
    nodeCount: nodeCountByChart.get(c.id) ?? 0,
    edgeCount: edgeCountByChart.get(c.id) ?? 0,
    lastEventAt: lastEventAtByChart.get(c.id) ?? null,
  }));

  // Short cache — this list backs a project sidebar/picker, not a live
  // collaborative surface (that's what the SSE stream route is for).
  return NextResponse.json(
    { success: true, data },
    { headers: { 'Cache-Control': 'private, max-age=10' } },
  );
}
