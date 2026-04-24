import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanCards, kanbanColumns, kanbanCardAssignees, kanbanCardLabels, kanbanLabels, kanbanCardChecklistItems, clients } from '@/lib/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  const url = new URL(req.url);
  const openOnly = url.searchParams.get('openOnly') !== '0';

  // Cards where I'm an assignee
  const assignments = await db
    .select({ cardId: kanbanCardAssignees.cardId })
    .from(kanbanCardAssignees)
    .where(eq(kanbanCardAssignees.userId, userId));
  const cardIds = assignments.map(a => a.cardId);

  if (cardIds.length === 0) return NextResponse.json({ success: true, data: { projects: [] } });

  // Staff can see any card; clients only their own projects
  let visibleCards;
  if (isStaff) {
    visibleCards = await db
      .select({
        id: kanbanCards.id,
        projectId: kanbanCards.projectId,
        columnId: kanbanCards.columnId,
        columnName: kanbanColumns.name,
        columnIsDone: kanbanColumns.isDone,
        number: kanbanCards.number,
        title: kanbanCards.title,
        priority: kanbanCards.priority,
        dueDate: kanbanCards.dueDate,
      })
      .from(kanbanCards)
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .where(inArray(kanbanCards.id, cardIds));
  } else {
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: true, data: { projects: [] } });
    visibleCards = await db
      .select({
        id: kanbanCards.id,
        projectId: kanbanCards.projectId,
        columnId: kanbanCards.columnId,
        columnName: kanbanColumns.name,
        columnIsDone: kanbanColumns.isDone,
        number: kanbanCards.number,
        title: kanbanCards.title,
        priority: kanbanCards.priority,
        dueDate: kanbanCards.dueDate,
      })
      .from(kanbanCards)
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .innerJoin(projects, and(eq(projects.id, kanbanCards.projectId), eq(projects.clientId, client.id)))
      .where(inArray(kanbanCards.id, cardIds));
  }

  const filtered = openOnly ? visibleCards.filter(c => !c.columnIsDone) : visibleCards;
  if (filtered.length === 0) return NextResponse.json({ success: true, data: { projects: [] } });

  const visibleCardIds = filtered.map(c => c.id);
  const projectIds = Array.from(new Set(filtered.map(c => c.projectId)));

  // Project info
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, projectKey: projects.projectKey, clientId: projects.clientId, clientName: clients.company })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(inArray(projects.id, projectIds));

  // Labels
  const labelRows = await db
    .select({ cardId: kanbanCardLabels.cardId, id: kanbanLabels.id, name: kanbanLabels.name, color: kanbanLabels.color })
    .from(kanbanCardLabels)
    .innerJoin(kanbanLabels, eq(kanbanLabels.id, kanbanCardLabels.labelId))
    .where(inArray(kanbanCardLabels.cardId, visibleCardIds));
  const labelsByCard = labelRows.reduce<Record<number, { id: number; name: string; color: string }[]>>((acc, l) => {
    (acc[l.cardId] ??= []).push({ id: l.id, name: l.name, color: l.color });
    return acc;
  }, {});

  // Checklist progress
  const checklistRows = await db
    .select({ cardId: kanbanCardChecklistItems.cardId, completed: kanbanCardChecklistItems.completed })
    .from(kanbanCardChecklistItems)
    .where(inArray(kanbanCardChecklistItems.cardId, visibleCardIds));
  const checklistByCard = checklistRows.reduce<Record<number, { total: number; done: number }>>((acc, i) => {
    const r = (acc[i.cardId] ??= { total: 0, done: 0 });
    r.total += 1;
    if (i.completed) r.done += 1;
    return acc;
  }, {});

  const byProject = new Map<number, { project: typeof projectRows[number]; cards: unknown[] }>();
  for (const p of projectRows) byProject.set(p.id, { project: p, cards: [] });
  for (const c of filtered.sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  })) {
    const slot = byProject.get(c.projectId);
    if (!slot) continue;
    slot.cards.push({
      id: c.id,
      key: slot.project.projectKey && c.number != null ? `${slot.project.projectKey}-${c.number}` : null,
      title: c.title,
      priority: c.priority,
      dueDate: c.dueDate,
      columnName: c.columnName,
      columnIsDone: c.columnIsDone,
      labels: labelsByCard[c.id] ?? [],
      checklist: checklistByCard[c.id] ?? null,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      projects: Array.from(byProject.values())
        .filter(p => p.cards.length > 0)
        .map(p => ({
          id: p.project.id,
          name: p.project.name,
          projectKey: p.project.projectKey,
          clientName: p.project.clientName,
          cards: p.cards,
        })),
    },
  });
}
