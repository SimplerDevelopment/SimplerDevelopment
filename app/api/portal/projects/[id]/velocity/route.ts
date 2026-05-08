// Velocity rollup for a project: last N completed sprints with committed +
// completed point totals, plus running averages.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, sprints, sprintScopeHistory } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import {
  computeSprintTotals,
  computeVelocityAverages,
  type SprintEvent,
  type VelocityRow,
} from '@/lib/portal/sprint-charts';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const url = new URL(req.url);
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') ?? '8', 10)));

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const staff = await isPortalStaff();
  if (!staff) {
    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
  }

  // Pull the most recent completed sprints first, then re-sort chronologically
  // when returning so the chart reads left-to-right oldest-to-newest.
  const recentSprints = await db
    .select({ id: sprints.id, name: sprints.name, endDate: sprints.endDate })
    .from(sprints)
    .where(and(eq(sprints.projectId, projectId), eq(sprints.status, 'completed')))
    .orderBy(desc(sprints.endDate), desc(sprints.id))
    .limit(limit);

  if (recentSprints.length === 0) {
    return NextResponse.json({
      success: true,
      data: { rows: [], averageCommitted: 0, averageCompleted: 0 },
    });
  }

  const sprintIds = recentSprints.map(s => s.id);
  const events = await db
    .select({
      sprintId: sprintScopeHistory.sprintId,
      action: sprintScopeHistory.action,
      points: sprintScopeHistory.points,
      occurredAt: sprintScopeHistory.occurredAt,
    })
    .from(sprintScopeHistory)
    .where(inArray(sprintScopeHistory.sprintId, sprintIds));

  const eventsBySprint = new Map<number, SprintEvent[]>();
  for (const ev of events) {
    if (!eventsBySprint.has(ev.sprintId)) eventsBySprint.set(ev.sprintId, []);
    eventsBySprint.get(ev.sprintId)!.push({
      action: ev.action as SprintEvent['action'],
      points: ev.points,
      occurredAt: ev.occurredAt,
    });
  }

  const rows: VelocityRow[] = recentSprints
    .map(s => {
      const totals = computeSprintTotals(eventsBySprint.get(s.id) ?? []);
      return {
        sprintId: s.id,
        sprintName: s.name,
        endDate: s.endDate ? new Date(s.endDate).toISOString() : null,
        committed: totals.committed,
        completed: totals.completed,
      };
    })
    .reverse(); // oldest → newest for the chart

  const averages = computeVelocityAverages(rows);

  return NextResponse.json({
    success: true,
    data: {
      rows,
      averageCommitted: averages.averageCommitted,
      averageCompleted: averages.averageCompleted,
    },
  });
}
