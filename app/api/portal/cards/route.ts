import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanColumns, projects } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { logCardActivity } from '@/lib/pm-activity';
import { canUserEditProject } from '@/lib/portal/project-access';
import { checkWipLimit } from '@/lib/portal/wip-limit';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { columnId, title, description, priority, dueDate, storyPoints, cardType, parentCardId, workflowState } = body;
  if (!columnId || !title?.trim()) {
    return NextResponse.json({ success: false, message: 'columnId and title are required' }, { status: 400 });
  }

  const [col] = await db.select().from(kanbanColumns).where(eq(kanbanColumns.id, columnId)).limit(1);
  if (!col) return NextResponse.json({ success: false, message: 'Column not found' }, { status: 404 });

  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';
  const userId = parseInt(session.user.id, 10);

  if (!isStaff) {
    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, col.projectId), eq(projects.clientId, client.id)))
      .limit(1);
    if (!project) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const canEdit = await canUserEditProject(userId, col.projectId);
    if (!canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const wip = await checkWipLimit(columnId);
  if (!wip.allowed) {
    return NextResponse.json(
      { success: false, message: wip.reason, code: 'wip_limit', limit: wip.limit, currentCount: wip.currentCount },
      { status: 409 },
    );
  }

  const existing = await db.select({ id: kanbanCards.id }).from(kanbanCards).where(eq(kanbanCards.columnId, columnId));

  const [{ max }] = await db
    .select({ max: sql<number | null>`MAX(${kanbanCards.number})` })
    .from(kanbanCards)
    .where(eq(kanbanCards.projectId, col.projectId));
  const nextNumber = (max ?? 0) + 1;

  const VALID_TYPES = ['task', 'story', 'epic', 'bug', 'spike'];
  const VALID_STATES = ['todo', 'in_progress', 'in_review', 'done', 'canceled'];

  const [card] = await db.insert(kanbanCards).values({
    columnId,
    projectId: col.projectId,
    number: nextNumber,
    title: title.trim(),
    description: description ?? null,
    priority: priority ?? 'medium',
    dueDate: dueDate ? new Date(dueDate) : null,
    order: existing.length,
    storyPoints: typeof storyPoints === 'number' ? storyPoints : null,
    cardType: VALID_TYPES.includes(cardType) ? cardType : 'task',
    parentCardId: typeof parentCardId === 'number' ? parentCardId : null,
    workflowState: VALID_STATES.includes(workflowState) ? workflowState : 'todo',
    createdBy: userId,
  }).returning();

  await logCardActivity(card.id, userId, 'card.created', { title: card.title });

  return NextResponse.json({ success: true, data: card });
}
