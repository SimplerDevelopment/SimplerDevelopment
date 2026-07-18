// Walks every project that has at least one column and records today's
// (cardCount, totalPoints) per column into column_daily_snapshots. Idempotent
// via the unique index on (projectId, columnId, snapshotDate).

import { db } from '@/lib/db';
import { columnDailySnapshots, kanbanCards, kanbanColumns } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

interface CfdSummary {
  projectsTouched: number;
  rowsUpserted: number;
}

function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function recordColumnDailySnapshots(now: Date = new Date()): Promise<CfdSummary> {
  const date = todayISO(now);

  // Aggregate per (projectId, columnId): count cards + sum storyPoints.
  const aggs = await db
    .select({
      projectId: kanbanColumns.projectId,
      columnId: kanbanColumns.id,
      cardCount: sql<number>`count(${kanbanCards.id})::int`,
      totalPoints: sql<number>`coalesce(sum(${kanbanCards.storyPoints}), 0)::int`,
    })
    .from(kanbanColumns)
    .leftJoin(kanbanCards, eq(kanbanCards.columnId, kanbanColumns.id))
    .groupBy(kanbanColumns.projectId, kanbanColumns.id);

  const projects = new Set<number>();
  let upserted = 0;
  for (const row of aggs) {
    projects.add(row.projectId);
    await db.insert(columnDailySnapshots).values({
      projectId: row.projectId,
      columnId: row.columnId,
      snapshotDate: date,
      cardCount: row.cardCount ?? 0,
      totalPoints: row.totalPoints ?? 0,
    }).onConflictDoUpdate({
      target: [columnDailySnapshots.projectId, columnDailySnapshots.columnId, columnDailySnapshots.snapshotDate],
      set: {
        cardCount: row.cardCount ?? 0,
        totalPoints: row.totalPoints ?? 0,
        recordedAt: now,
      },
    });
    upserted += 1;
  }

  return { projectsTouched: projects.size, rowsUpserted: upserted };
}
