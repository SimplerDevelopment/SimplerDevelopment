import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardLabels, kanbanCardChecklistItems, kanbanColumns, projects, cardTemplates } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { logCardActivity } from '@/lib/pm-activity';
import { canUserEditProject } from '@/lib/portal/project-access';
import { checkWipLimit } from '@/lib/portal/wip-limit';

const VALID_TYPES = ['task', 'story', 'epic', 'bug', 'spike'] as const;
const VALID_STATES = ['todo', 'in_progress', 'in_review', 'done', 'canceled'] as const;

interface TemplatePayload {
  titlePattern?: string;
  description?: string;
  cardType?: string;
  priority?: string;
  storyPoints?: number;
  workflowState?: string;
  labelIds?: number[];
  checklist?: { text: string; order?: number }[];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { columnId, fromTemplateId } = body;

  if (!columnId) {
    return NextResponse.json({ success: false, message: 'columnId is required' }, { status: 400 });
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

  // Resolve template (if any) and merge under user-provided fields. Explicit
  // body fields always win — the template only fills gaps.
  let template: TemplatePayload | null = null;
  if (typeof fromTemplateId === 'number') {
    const [tpl] = await db.select().from(cardTemplates).where(eq(cardTemplates.id, fromTemplateId)).limit(1);
    if (!tpl) return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
    // Tenancy guard: the template's clientId must match the destination
    // project's clientId. Without this, a user from one tenancy could
    // theoretically craft a request that pulled a template from another.
    const [proj] = await db.select({ clientId: projects.clientId }).from(projects)
      .where(eq(projects.id, col.projectId)).limit(1);
    if (!proj || proj.clientId !== tpl.clientId) {
      return NextResponse.json({ success: false, message: 'Template not available for this project' }, { status: 403 });
    }
    template = tpl.payload as TemplatePayload;
  }

  const title = (body.title ?? template?.titlePattern ?? '').toString().trim();
  if (!title) return NextResponse.json({ success: false, message: 'title is required' }, { status: 400 });

  const description = body.description ?? template?.description ?? null;
  const priority = body.priority ?? template?.priority ?? 'medium';
  const cardType = VALID_TYPES.includes(body.cardType)
    ? body.cardType
    : VALID_TYPES.includes(template?.cardType as (typeof VALID_TYPES)[number])
      ? template?.cardType
      : 'task';
  const workflowState = VALID_STATES.includes(body.workflowState)
    ? body.workflowState
    : VALID_STATES.includes(template?.workflowState as (typeof VALID_STATES)[number])
      ? template?.workflowState
      : 'todo';
  const storyPoints = typeof body.storyPoints === 'number'
    ? body.storyPoints
    : typeof template?.storyPoints === 'number' ? template.storyPoints : null;
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  const parentCardId = typeof body.parentCardId === 'number' ? body.parentCardId : null;

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

  const [card] = await db.insert(kanbanCards).values({
    columnId,
    projectId: col.projectId,
    number: nextNumber,
    title,
    description,
    priority,
    dueDate,
    order: existing.length,
    storyPoints,
    cardType,
    parentCardId,
    workflowState,
    createdBy: userId,
  }).returning();

  // Apply template-side artifacts (labels + checklist) after the card row
  // exists. Failures here log but don't roll back the card itself.
  if (template) {
    const labelIds = Array.isArray(template.labelIds) ? template.labelIds : [];
    if (labelIds.length > 0) {
      await db.insert(kanbanCardLabels)
        .values(labelIds.map(labelId => ({ cardId: card.id, labelId })))
        .onConflictDoNothing()
        .catch(err => console.error('[card create — template labels]', err));
    }
    const items = Array.isArray(template.checklist) ? template.checklist : [];
    if (items.length > 0) {
      await db.insert(kanbanCardChecklistItems).values(
        items.map((it, idx) => ({
          cardId: card.id,
          text: String(it.text ?? '').slice(0, 500),
          order: typeof it.order === 'number' ? it.order : idx,
          createdBy: userId,
        })),
      ).catch(err => console.error('[card create — template checklist]', err));
    }
  }

  await logCardActivity(card.id, userId, 'card.created', { title: card.title, fromTemplateId: fromTemplateId ?? null });

  return NextResponse.json({ success: true, data: card });
}
