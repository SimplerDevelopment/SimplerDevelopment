// Per-assignee capacity for one sprint: committed (sum of points on cards
// assigned to user where sprintId=this) and completed (subset that are now
// in a `is_done` column).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprints, kanbanCards, kanbanCardAssignees, kanbanColumns, projects, users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';

interface AssigneeCapacityRow {
  userId: number;
  name: string | null;
  email: string;
  cardCount: number;
  committedPoints: number;
  completedPoints: number;
  // byColumn[columnId] = { cards, points } for cards this user has in that
  // column. Lets the UI stack the bar by column instead of binary
  // committed/completed.
  byColumn: Record<number, { cards: number; points: number }>;
}

interface ColumnRef {
  id: number;
  name: string;
  color: string | null;
  order: number;
  isDone: boolean;
}

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

  // Pull every (assignee × card-in-sprint) row with the destination column's
  // is_done flag and the card's points. Aggregate in JS; SUM CASE WHEN works
  // too but the data volume is bounded and the JS path is more readable.
  const rows = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      cardId: kanbanCards.id,
      points: kanbanCards.storyPoints,
      columnId: kanbanCards.columnId,
      isDone: kanbanColumns.isDone,
    })
    .from(kanbanCardAssignees)
    .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardAssignees.cardId))
    .innerJoin(users, eq(users.id, kanbanCardAssignees.userId))
    .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
    .where(eq(kanbanCards.sprintId, sprintId));

  // Project's columns — used by the UI to render stacked segments in board
  // order regardless of which columns currently have cards assigned to a user.
  const projectColumns: ColumnRef[] = await db
    .select({
      id: kanbanColumns.id,
      name: kanbanColumns.name,
      color: kanbanColumns.color,
      order: kanbanColumns.order,
      isDone: kanbanColumns.isDone,
    })
    .from(kanbanColumns)
    .where(eq(kanbanColumns.projectId, sprint.projectId))
    .orderBy(kanbanColumns.order);

  const byUser = new Map<number, AssigneeCapacityRow>();
  for (const r of rows) {
    if (!byUser.has(r.userId)) {
      byUser.set(r.userId, {
        userId: r.userId,
        name: r.userName,
        email: r.userEmail,
        cardCount: 0,
        committedPoints: 0,
        completedPoints: 0,
        byColumn: {},
      });
    }
    const bucket = byUser.get(r.userId)!;
    bucket.cardCount += 1;
    const pts = r.points ?? 0;
    bucket.committedPoints += pts;
    if (r.isDone) bucket.completedPoints += pts;
    if (r.columnId != null) {
      const slot = bucket.byColumn[r.columnId] ?? { cards: 0, points: 0 };
      slot.cards += 1;
      slot.points += pts;
      bucket.byColumn[r.columnId] = slot;
    }
  }

  const result = [...byUser.values()].sort((a, b) => b.committedPoints - a.committedPoints);

  return NextResponse.json({
    success: true,
    data: {
      sprintId,
      sprintName: sprint.name,
      columns: projectColumns,
      rows: result,
    },
  });
}
