import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprints, kanbanCards, kanbanColumns, projects } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and, or, inArray, isNull } from 'drizzle-orm';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

// How many recent (non-active) sprints to include cards for. Older completed
// sprints still appear in the sprint list (counts only); their cards are
// fetchable via the per-sprint endpoint if/when needed.
const RECENT_SPRINT_CARD_LOOKBACK = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeProject(projectId: number, session: any) {
  const staff = await isPortalStaff();
  if (staff) {
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return p ?? null;
  }
  const userId = parseInt((session as unknown as { user: { id: string } }).user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [p] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.clientId, client.id)))
    .limit(1);
  return p ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const project = await authorizeProject(projectId, session);
    if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const sprintList = await db.select().from(sprints)
      .where(eq(sprints.projectId, projectId))
      .orderBy(sprints.order);

    // Only load cards for sprints the UI actually renders: all
    // active/planning sprints + the last N completed sprints. Older
    // completed sprints stay in the metadata list with empty cards. This
    // replaces the previous "every card in the project" scan.
    const activeOrPlanning = sprintList
      .filter(s => s.status === 'active' || s.status === 'planning')
      .map(s => s.id);
    const recentCompleted = sprintList
      .filter(s => s.status === 'completed')
      .sort((a, b) => {
        const aT = a.endDate ? new Date(a.endDate).getTime() : 0;
        const bT = b.endDate ? new Date(b.endDate).getTime() : 0;
        if (aT !== bT) return bT - aT;
        return b.id - a.id;
      })
      .slice(0, RECENT_SPRINT_CARD_LOOKBACK)
      .map(s => s.id);
    const sprintIdsToLoad = [...activeOrPlanning, ...recentCompleted];

    // Where clause: cards in this project AND (backlog OR card.sprintId in loaded set).
    const sprintMembership = sprintIdsToLoad.length > 0
      ? or(isNull(kanbanCards.sprintId), inArray(kanbanCards.sprintId, sprintIdsToLoad))
      : isNull(kanbanCards.sprintId);

    const cards = await db
      .select({
        id: kanbanCards.id,
        number: kanbanCards.number,
        title: kanbanCards.title,
        priority: kanbanCards.priority,
        sprintId: kanbanCards.sprintId,
        sprintOrder: kanbanCards.sprintOrder,
        columnId: kanbanCards.columnId,
        columnName: kanbanColumns.name,
        columnIsDone: kanbanColumns.isDone,
        order: kanbanCards.order,
        storyPoints: kanbanCards.storyPoints,
        cardType: kanbanCards.cardType,
        parentCardId: kanbanCards.parentCardId,
        workflowState: kanbanCards.workflowState,
      })
      .from(kanbanCards)
      .leftJoin(kanbanColumns, eq(kanbanCards.columnId, kanbanColumns.id))
      .where(and(eq(kanbanCards.projectId, projectId), sprintMembership))
      .orderBy(kanbanCards.sprintOrder, kanbanCards.order);

    const cardsBySprintId = cards.reduce<Record<string, typeof cards>>((acc, c) => {
      const key = c.sprintId != null ? String(c.sprintId) : 'backlog';
      (acc[key] ??= []).push(c);
      return acc;
    }, {});

    const result = {
      sprints: sprintList.map(s => ({
        ...s,
        cards: cardsBySprintId[String(s.id)] ?? [],
      })),
      backlog: cardsBySprintId['backlog'] ?? [],
    };

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('[GET /api/portal/projects/[id]/sprints]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const project = await authorizeProject(projectId, session);
    if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const staff = await isPortalStaff();
    if (!staff) {
      const userId = parseInt((session as unknown as { user: { id: string } }).user.id, 10);
      const canEdit = await canUserEditProject(userId, projectId);
      if (!canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const { name, goal, startDate, endDate } = await req.json();
    if (!name?.trim()) return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });

    const existing = await db.select({ id: sprints.id }).from(sprints).where(eq(sprints.projectId, projectId));

    const [sprint] = await db.insert(sprints).values({
      projectId,
      name: name.trim(),
      goal: goal ?? null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      status: 'planning',
      order: existing.length,
    }).returning();

    return NextResponse.json({ success: true, data: { ...sprint, cards: [] } });
  } catch (err) {
    console.error('[POST /api/portal/projects/[id]/sprints]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
