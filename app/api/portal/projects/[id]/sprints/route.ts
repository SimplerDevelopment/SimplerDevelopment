import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprints, kanbanCards, kanbanColumns, projects, clients } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { isPortalStaff } from '@/lib/portal';

async function authorizeProject(projectId: number, session: Awaited<ReturnType<typeof auth>>) {
  const staff = await isPortalStaff();
  if (staff) {
    const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return p ?? null;
  }
  const userId = parseInt(session!.user!.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
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

    const cards = await db
      .select({
        id: kanbanCards.id,
        title: kanbanCards.title,
        priority: kanbanCards.priority,
        sprintId: kanbanCards.sprintId,
        columnId: kanbanCards.columnId,
        columnName: kanbanColumns.name,
        order: kanbanCards.order,
      })
      .from(kanbanCards)
      .leftJoin(kanbanColumns, eq(kanbanCards.columnId, kanbanColumns.id))
      .where(eq(kanbanCards.projectId, projectId))
      .orderBy(kanbanCards.order);

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

    const staff = await isPortalStaff();
    if (!staff) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const projectId = parseInt(id, 10);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

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
