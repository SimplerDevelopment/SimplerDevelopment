// Cumulative flow diagram data: per-day column counts for the last N days.
// Returns { columns, days[] } where each day has { date, counts: {colId: n} }.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanColumns, columnDailySnapshots } from '@/lib/db/schema';
import { and, asc, eq, gte } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const url = new URL(req.url);
  const days = Math.min(120, Math.max(7, parseInt(url.searchParams.get('days') ?? '30', 10)));
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Parallelize the four independent reads. Auth + staff check + project
  // gate + columns + snapshot rows — none depend on each other; we just
  // need to know if the user is authorized after they all resolve.
  const [session, staff, projectRows, cols, rows] = await Promise.all([
    auth(),
    isPortalStaff(),
    db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
    db.select({ id: kanbanColumns.id, name: kanbanColumns.name, order: kanbanColumns.order })
      .from(kanbanColumns)
      .where(eq(kanbanColumns.projectId, projectId))
      .orderBy(asc(kanbanColumns.order)),
    db.select().from(columnDailySnapshots)
      .where(and(eq(columnDailySnapshots.projectId, projectId), gte(columnDailySnapshots.snapshotDate, sinceDate)))
      .orderBy(asc(columnDailySnapshots.snapshotDate)),
  ]);
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const project = projectRows[0];
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  if (!staff) {
    const userId = parseInt(session.user.id, 10);
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
  }

  // Bucket rows by date.
  const byDate = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (!byDate.has(r.snapshotDate)) byDate.set(r.snapshotDate, new Map());
    byDate.get(r.snapshotDate)!.set(r.columnId, r.cardCount);
  }

  const dates = [...byDate.keys()].sort();
  const series = dates.map(date => {
    const counts: Record<number, number> = {};
    const m = byDate.get(date)!;
    for (const c of cols) counts[c.id] = m.get(c.id) ?? 0;
    return { date, counts };
  });

  return NextResponse.json({
    success: true,
    data: {
      columns: cols.map(c => ({ id: c.id, name: c.name, order: c.order })),
      days: series,
    },
  });
}
