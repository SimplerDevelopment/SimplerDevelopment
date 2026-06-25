// Daily-standup data for the authenticated user across all their projects:
//   yesterday — cards I moved or commented on in the last 24h
//   today     — cards assigned to me, not done, ordered by priority + due
//   blocked   — cards assigned to me with at least one unfinished blocker

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  kanbanCards, kanbanColumns, kanbanCardActivities, kanbanCardAssignees,
  kanbanCardDependencies, projects,
} from '@/lib/db/schema';
import { and, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  // Always scope to the caller's ACTIVE client — even for staff. getPortalClient
  // honors the sd-active-client cookie (and impersonation), so a staff user is
  // bounded to the tenant they're currently viewing, never the whole DB. This
  // mirrors app/api/portal/projects/route.ts, which scopes by clientId for staff
  // and clients alike. (tenant-leak: standup-staff-sees-all-projects)
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  const allProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.clientId, client.id));
  const projectIds = allProjects.map(p => p.id);

  if (projectIds.length === 0) {
    return NextResponse.json({ success: true, data: { yesterday: [], today: [], blocked: [] } });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // YESTERDAY: card activities by this user in the last 24h that count as
  // "did something" — column changes and comments. Aggregate to unique cards.
  const recentActivities = await db
    .select({
      cardId: kanbanCardActivities.cardId,
      type: kanbanCardActivities.type,
      createdAt: kanbanCardActivities.createdAt,
    })
    .from(kanbanCardActivities)
    .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardActivities.cardId))
    .where(and(
      eq(kanbanCardActivities.userId, userId),
      inArray(kanbanCards.projectId, projectIds),
      gte(kanbanCardActivities.createdAt, since),
      or(
        eq(kanbanCardActivities.type, 'card.column_changed'),
        eq(kanbanCardActivities.type, 'card.commented'),
        eq(kanbanCardActivities.type, 'card.created'),
      ),
    ))
    .orderBy(desc(kanbanCardActivities.createdAt));

  const yesterdayCardIds = [...new Set(recentActivities.map(a => a.cardId))].slice(0, 50);

  const cardLookup = async (ids: number[]) => {
    if (ids.length === 0) return [];
    return db
      .select({
        id: kanbanCards.id,
        number: kanbanCards.number,
        title: kanbanCards.title,
        priority: kanbanCards.priority,
        dueDate: kanbanCards.dueDate,
        storyPoints: kanbanCards.storyPoints,
        cardType: kanbanCards.cardType,
        workflowState: kanbanCards.workflowState,
        projectId: kanbanCards.projectId,
        projectName: projects.name,
        projectKey: projects.projectKey,
        columnId: kanbanCards.columnId,
        columnName: kanbanColumns.name,
        columnIsDone: kanbanColumns.isDone,
      })
      .from(kanbanCards)
      .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .where(inArray(kanbanCards.id, ids));
  };

  const yesterday = await cardLookup(yesterdayCardIds);

  // TODAY: cards assigned to me, not in a done column.
  const todayRows = await db
    .select({
      id: kanbanCards.id,
      number: kanbanCards.number,
      title: kanbanCards.title,
      priority: kanbanCards.priority,
      dueDate: kanbanCards.dueDate,
      storyPoints: kanbanCards.storyPoints,
      cardType: kanbanCards.cardType,
      workflowState: kanbanCards.workflowState,
      projectId: kanbanCards.projectId,
      projectName: projects.name,
      projectKey: projects.projectKey,
      columnId: kanbanCards.columnId,
      columnName: kanbanColumns.name,
      columnIsDone: kanbanColumns.isDone,
    })
    .from(kanbanCardAssignees)
    .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardAssignees.cardId))
    .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
    .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
    .where(and(
      eq(kanbanCardAssignees.userId, userId),
      inArray(kanbanCards.projectId, projectIds),
    ));
  const today = todayRows.filter(r => !r.columnIsDone).sort((a, b) => {
    const pri = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (pri !== 0) return pri;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  }).slice(0, 50);

  // BLOCKED: today's cards that have at least one unfinished blocker.
  const todayIds = today.map(t => t.id);
  let blocked: typeof today = [];
  if (todayIds.length > 0) {
    const blockers = await db
      .select({
        blockedCardId: kanbanCardDependencies.blockedCardId,
        blockerColumnIsDone: kanbanColumns.isDone,
      })
      .from(kanbanCardDependencies)
      .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardDependencies.blockerCardId))
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .where(inArray(kanbanCardDependencies.blockedCardId, todayIds));

    const blockedSet = new Set<number>();
    for (const b of blockers) {
      if (!b.blockerColumnIsDone) blockedSet.add(b.blockedCardId);
    }
    blocked = today.filter(t => blockedSet.has(t.id));
  }

  return NextResponse.json({ success: true, data: { yesterday, today, blocked } });
}

function priorityWeight(p: string | null): number {
  switch (p) {
    case 'urgent': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}
