// Shared auth+load helper for chart-scoped Path Visualizations routes
// (app/api/portal/path-charts/[id]/**: the full-snapshot route, the events
// replay route, and the SSE stream route all need the exact same check).
//
// Loads the chart, resolves its parent project, and applies the same
// tenant-access model as app/api/portal/projects/[id]/artifacts/route.ts's
// getAuthedProject: staff (admin/employee) bypass everything else;
// otherwise getPortalClient(userId) must resolve to the project's clientId.
//
// Unlike the artifacts route, a tenant mismatch here returns 404 ("Chart not
// found") rather than 403 ("Forbidden") — an unauthorized caller shouldn't
// be able to distinguish "this chart belongs to someone else" from "this
// chart doesn't exist," matching how e.g. crm/contacts/[id] and
// tickets/[id] scope their lookups by clientId so a cross-tenant request
// just misses.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { pathCharts, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

export type AuthedPathChart = {
  userId: number;
  chart: typeof pathCharts.$inferSelect;
  clientId: number;
};

export async function getAuthedPathChart(
  chartId: number,
): Promise<{ error: NextResponse } | AuthedPathChart> {
  // Parallelize auth() and the chart lookup — the chart row doesn't depend
  // on the session, and the staff/client gate runs after both resolve.
  const [session, chartRows] = await Promise.all([
    auth(),
    db.select().from(pathCharts).where(eq(pathCharts.id, chartId)).limit(1),
  ]);

  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }
  const userId = parseInt(session.user.id, 10);

  const chart = chartRows[0];
  if (!chart) {
    return { error: NextResponse.json({ success: false, message: 'Chart not found' }, { status: 404 }) };
  }

  const [project] = await db
    .select({ id: projects.id, clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, chart.projectId))
    .limit(1);
  if (!project) {
    return { error: NextResponse.json({ success: false, message: 'Chart not found' }, { status: 404 }) };
  }

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return { error: NextResponse.json({ success: false, message: 'Chart not found' }, { status: 404 }) };
    }
  }

  return { userId, chart, clientId: project.clientId };
}
