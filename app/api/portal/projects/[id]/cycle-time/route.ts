// Cycle time / lead time per completed card. Derived from kanban_card_activities.
//   leadTime  = card.createdAt → moved into a `is_done` column (most recent)
//   cycleTime = first `card.column_changed` event → done event
// Cards currently in a non-done column are excluded.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanCards, kanbanColumns, kanbanCardActivities } from '@/lib/db/schema';
import { and, eq, inArray, asc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';

interface CycleRow {
  cardId: number;
  number: number | null;
  title: string;
  createdAt: string;
  doneAt: string;
  leadTimeMinutes: number;
  cycleTimeMinutes: number;
  storyPoints: number | null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Parallelize the three independent gate queries: auth(), staff check,
  // and the project lookup. Previously these ran sequentially even though
  // none depend on each other.
  const [session, staff, projectRows] = await Promise.all([
    auth(),
    isPortalStaff(),
    db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
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

  // Cards currently in a done column. Run in parallel with the columns
  // lookup since both are scoped to projectId and independent of each other.
  const [cards, cols] = await Promise.all([
    db
      .select({
        id: kanbanCards.id,
        number: kanbanCards.number,
        title: kanbanCards.title,
        createdAt: kanbanCards.createdAt,
        updatedAt: kanbanCards.updatedAt,
        storyPoints: kanbanCards.storyPoints,
        columnIsDone: kanbanColumns.isDone,
      })
      .from(kanbanCards)
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .where(eq(kanbanCards.projectId, projectId)),
    db
      .select({ id: kanbanColumns.id, isDone: kanbanColumns.isDone })
      .from(kanbanColumns)
      .where(eq(kanbanColumns.projectId, projectId)),
  ]);

  const doneCards = cards.filter(c => c.columnIsDone);
  if (doneCards.length === 0) {
    return NextResponse.json({ success: true, data: { rows: [], averageLeadDays: 0, averageCycleDays: 0 } });
  }

  const cardIds = doneCards.map(c => c.id);

  // Pull every column_changed activity for those cards in chronological order.
  const moves = await db
    .select({
      cardId: kanbanCardActivities.cardId,
      type: kanbanCardActivities.type,
      payload: kanbanCardActivities.payload,
      createdAt: kanbanCardActivities.createdAt,
    })
    .from(kanbanCardActivities)
    .where(and(
      inArray(kanbanCardActivities.cardId, cardIds),
      eq(kanbanCardActivities.type, 'card.column_changed'),
    ))
    .orderBy(asc(kanbanCardActivities.createdAt));

  const isDoneById = new Map(cols.map(c => [c.id, c.isDone]));

  type Move = { cardId: number; createdAt: Date; toIsDone: boolean };
  const movesByCard = new Map<number, Move[]>();
  for (const m of moves) {
    const to = (m.payload as { to?: number } | null)?.to ?? null;
    if (to == null) continue;
    const arr = movesByCard.get(m.cardId) ?? [];
    arr.push({
      cardId: m.cardId,
      createdAt: m.createdAt,
      toIsDone: isDoneById.get(to) ?? false,
    });
    movesByCard.set(m.cardId, arr);
  }

  const rows: CycleRow[] = doneCards.map(c => {
    const arr = movesByCard.get(c.id) ?? [];
    // doneAt = the most recent move into a done column; fall back to updatedAt.
    const doneMove = [...arr].reverse().find(m => m.toIsDone);
    const doneAt = doneMove?.createdAt ?? c.updatedAt;
    // cycleStart = first column change; fall back to createdAt.
    const firstMove = arr[0];
    const cycleStart = firstMove?.createdAt ?? c.createdAt;
    const lead = (new Date(doneAt).getTime() - new Date(c.createdAt).getTime()) / 60000;
    const cycle = (new Date(doneAt).getTime() - new Date(cycleStart).getTime()) / 60000;
    return {
      cardId: c.id,
      number: c.number,
      title: c.title,
      createdAt: new Date(c.createdAt).toISOString(),
      doneAt: new Date(doneAt).toISOString(),
      leadTimeMinutes: Math.max(0, Math.round(lead)),
      cycleTimeMinutes: Math.max(0, Math.round(cycle)),
      storyPoints: c.storyPoints,
    };
  }).sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime());

  const avg = (xs: number[]) => xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
  const averageLeadDays = Math.round((avg(rows.map(r => r.leadTimeMinutes)) / (60 * 24)) * 10) / 10;
  const averageCycleDays = Math.round((avg(rows.map(r => r.cycleTimeMinutes)) / (60 * 24)) * 10) / 10;

  return NextResponse.json({
    success: true,
    data: { rows, averageLeadDays, averageCycleDays },
  });
}
