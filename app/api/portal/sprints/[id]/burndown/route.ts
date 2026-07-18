// Burndown chart data for one sprint. Replays sprint_scope_history into a
// daily { remaining, completed, scope, ideal } series. Open to anyone who can
// view the project — read-only.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprints, sprintScopeHistory, projects } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { computeBurndown, type SprintEvent } from '@/lib/portal/sprint-charts';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sprintId = parseInt(id, 10);

  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
  if (!sprint) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const staff = await isPortalStaff();
  if (!staff) {
    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    const [proj] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, sprint.projectId), eq(projects.clientId, client.id))).limit(1);
    if (!proj) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  if (!sprint.startDate || !sprint.endDate) {
    return NextResponse.json({
      success: true,
      data: { series: [], message: 'Sprint has no start/end date — set both before viewing burndown.' },
    });
  }

  const events = await db
    .select({
      action: sprintScopeHistory.action,
      points: sprintScopeHistory.points,
      occurredAt: sprintScopeHistory.occurredAt,
    })
    .from(sprintScopeHistory)
    .where(eq(sprintScopeHistory.sprintId, sprintId))
    .orderBy(asc(sprintScopeHistory.occurredAt));

  const series = computeBurndown(
    events as SprintEvent[],
    sprint.startDate,
    sprint.endDate,
  );

  return NextResponse.json({
    success: true,
    data: {
      sprintId: sprint.id,
      sprintName: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      status: sprint.status,
      series,
    },
  });
}
