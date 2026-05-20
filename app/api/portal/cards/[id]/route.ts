import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardComments, kanbanCardTimeLogs, kanbanCardFiles, kanbanCardLabels, kanbanLabels, kanbanCardActivities, kanbanCardChecklistItems, kanbanCardAssignees, kanbanCardWatchers, kanbanCardDependencies, kanbanColumns, users, projects } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and, asc, desc } from 'drizzle-orm';
import { logCardActivity } from '@/lib/pm-activity';
import { filterUserIdsVisibleToClient } from '@/lib/security/assert-owned';
import { canUserEditProject } from '@/lib/portal/project-access';
import { recordCardAddedToSprint, recordCardRemovedFromSprint } from '@/lib/portal/sprint-snapshots';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCard(cardId: number, session: any): Promise<{ card: typeof kanbanCards.$inferSelect; canEdit: boolean } | null> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;

  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { card, canEdit: true };

  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
    .limit(1);
  if (!proj) return null;

  return { card, canEdit: await canUserEditProject(userId, proj.id) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const cardId = parseInt(id, 10);

    const result = await authorizeCard(cardId, session);
    if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    const { card } = result;

    const comments = await db
      .select({
        id: kanbanCardComments.id,
        body: kanbanCardComments.body,
        mentions: kanbanCardComments.mentions,
        createdAt: kanbanCardComments.createdAt,
        userId: kanbanCardComments.userId,
        userName: users.name,
      })
      .from(kanbanCardComments)
      .leftJoin(users, eq(kanbanCardComments.userId, users.id))
      .where(eq(kanbanCardComments.cardId, cardId))
      .orderBy(asc(kanbanCardComments.createdAt));

    const role = getRole(session);
    const isStaff = role === 'admin' || role === 'employee';

    const timeLogs = isStaff
      ? await db
          .select({
            id: kanbanCardTimeLogs.id,
            minutes: kanbanCardTimeLogs.minutes,
            note: kanbanCardTimeLogs.note,
            loggedAt: kanbanCardTimeLogs.loggedAt,
            userId: kanbanCardTimeLogs.userId,
            userName: users.name,
          })
          .from(kanbanCardTimeLogs)
          .leftJoin(users, eq(kanbanCardTimeLogs.userId, users.id))
          .where(eq(kanbanCardTimeLogs.cardId, cardId))
          .orderBy(desc(kanbanCardTimeLogs.loggedAt))
      : [];

    const files = await db
      .select({
        id: kanbanCardFiles.id,
        originalName: kanbanCardFiles.originalName,
        mimeType: kanbanCardFiles.mimeType,
        fileSize: kanbanCardFiles.fileSize,
        url: kanbanCardFiles.url,
        commentId: kanbanCardFiles.commentId,
        userId: kanbanCardFiles.userId,
        createdAt: kanbanCardFiles.createdAt,
        userName: users.name,
      })
      .from(kanbanCardFiles)
      .leftJoin(users, eq(kanbanCardFiles.userId, users.id))
      .where(eq(kanbanCardFiles.cardId, cardId))
      .orderBy(asc(kanbanCardFiles.createdAt));

    const labels = await db
      .select({ id: kanbanLabels.id, name: kanbanLabels.name, color: kanbanLabels.color })
      .from(kanbanCardLabels)
      .innerJoin(kanbanLabels, eq(kanbanLabels.id, kanbanCardLabels.labelId))
      .where(eq(kanbanCardLabels.cardId, cardId))
      .orderBy(asc(kanbanLabels.name));

    const activities = await db
      .select({
        id: kanbanCardActivities.id,
        type: kanbanCardActivities.type,
        payload: kanbanCardActivities.payload,
        createdAt: kanbanCardActivities.createdAt,
        userId: kanbanCardActivities.userId,
        userName: users.name,
      })
      .from(kanbanCardActivities)
      .leftJoin(users, eq(users.id, kanbanCardActivities.userId))
      .where(eq(kanbanCardActivities.cardId, cardId))
      .orderBy(desc(kanbanCardActivities.createdAt))
      .limit(200);

    const [project] = await db.select({ projectKey: projects.projectKey }).from(projects).where(eq(projects.id, card.projectId)).limit(1);
    const projectKey = project?.projectKey ?? null;
    const key = projectKey && card.number != null ? `${projectKey}-${card.number}` : null;

    const checklist = await db.select().from(kanbanCardChecklistItems)
      .where(eq(kanbanCardChecklistItems.cardId, cardId))
      .orderBy(asc(kanbanCardChecklistItems.order), asc(kanbanCardChecklistItems.id));

    const assignees = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(kanbanCardAssignees)
      .innerJoin(users, eq(users.id, kanbanCardAssignees.userId))
      .where(eq(kanbanCardAssignees.cardId, cardId))
      .orderBy(asc(users.name));

    const watcherRows = await db
      .select({ userId: kanbanCardWatchers.userId })
      .from(kanbanCardWatchers)
      .where(eq(kanbanCardWatchers.cardId, cardId));
    const watcherIds = watcherRows.map(w => w.userId);
    const sessUserId = parseInt(session.user.id, 10);
    const watching = watcherIds.includes(sessUserId);

    const blockers = await db
      .select({
        id: kanbanCards.id,
        title: kanbanCards.title,
        number: kanbanCards.number,
        columnIsDone: kanbanColumns.isDone,
      })
      .from(kanbanCardDependencies)
      .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardDependencies.blockerCardId))
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .where(eq(kanbanCardDependencies.blockedCardId, cardId));

    const blocking = await db
      .select({
        id: kanbanCards.id,
        title: kanbanCards.title,
        number: kanbanCards.number,
        columnIsDone: kanbanColumns.isDone,
      })
      .from(kanbanCardDependencies)
      .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardDependencies.blockedCardId))
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .where(eq(kanbanCardDependencies.blockerCardId, cardId));

    const decorate = (list: typeof blockers) => list.map(r => ({
      ...r,
      key: projectKey && r.number != null ? `${projectKey}-${r.number}` : null,
    }));

    return NextResponse.json({ success: true, data: {
      card: { ...card, key, projectKey },
      comments, timeLogs, files, labels, activities, checklist, assignees,
      watcherIds, watching,
      blockers: decorate(blockers),
      blocking: decorate(blocking),
    } });
  } catch (err) {
    console.error('[GET /api/portal/cards/[id]]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);

  const result = await authorizeCard(cardId, session);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const before = result.card;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.sprintId !== undefined) updates.sprintId = body.sprintId ?? null;
  if (body.storyPoints !== undefined) {
    const v = body.storyPoints;
    updates.storyPoints = (v === null || v === '') ? null : Number(v);
  }
  if (body.cardType !== undefined && ['task', 'story', 'epic', 'bug', 'spike'].includes(body.cardType)) {
    updates.cardType = body.cardType;
  }
  if (body.parentCardId !== undefined) updates.parentCardId = body.parentCardId ?? null;
  if (body.workflowState !== undefined && ['todo', 'in_progress', 'in_review', 'done', 'canceled'].includes(body.workflowState)) {
    updates.workflowState = body.workflowState;
  }

  const [card] = await db.update(kanbanCards).set(updates).where(eq(kanbanCards.id, cardId)).returning();
  if (!card) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const actorId = parseInt(session.user.id, 10);
  if (body.title !== undefined && body.title !== before.title) {
    await logCardActivity(cardId, actorId, 'card.title_changed', { from: before.title, to: card.title });
  }
  if (body.description !== undefined && body.description !== before.description) {
    await logCardActivity(cardId, actorId, 'card.description_changed', {});
  }
  if (body.priority !== undefined && body.priority !== before.priority) {
    await logCardActivity(cardId, actorId, 'card.priority_changed', { from: before.priority, to: card.priority });
  }
  if (body.dueDate !== undefined) {
    const fromIso = before.dueDate ? new Date(before.dueDate).toISOString() : null;
    const toIso = card.dueDate ? new Date(card.dueDate).toISOString() : null;
    if (fromIso !== toIso) {
      await logCardActivity(cardId, actorId, 'card.due_date_changed', { from: fromIso, to: toIso });
    }
  }
  if (body.assignedTo !== undefined) {
    let next: number | null = body.assignedTo ?? null;
    // For non-staff (per-tenant) callers, drop foreign user ids silently so a
    // client cannot mass-assign cards to users outside their tenancy.
    const role = getRole(session);
    const isStaff = role === 'admin' || role === 'employee' || role === 'editor';
    if (!isStaff && typeof next === 'number') {
      const client = await getPortalClient(actorId);
      if (!client) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      const allowed = await filterUserIdsVisibleToClient([next], client.id);
      next = allowed.length > 0 ? allowed[0] : null;
    }
    await replaceCardAssignees(cardId, actorId, next);
  }
  if (body.sprintId !== undefined && (body.sprintId ?? null) !== before.sprintId) {
    await logCardActivity(cardId, actorId, 'card.sprint_changed', { from: before.sprintId, to: card.sprintId });
    if (before.sprintId) await recordCardRemovedFromSprint(cardId, before.sprintId, actorId);
    if (card.sprintId) await recordCardAddedToSprint(cardId, card.sprintId, actorId);
  }
  if (body.storyPoints !== undefined && (card.storyPoints ?? null) !== (before.storyPoints ?? null)) {
    await logCardActivity(cardId, actorId, 'card.story_points_changed', { from: before.storyPoints ?? null, to: card.storyPoints ?? null });
  }
  if (body.cardType !== undefined && card.cardType !== before.cardType) {
    await logCardActivity(cardId, actorId, 'card.type_changed', { from: before.cardType, to: card.cardType });
  }
  if (body.parentCardId !== undefined && (card.parentCardId ?? null) !== (before.parentCardId ?? null)) {
    await logCardActivity(cardId, actorId, 'card.parent_changed', { from: before.parentCardId ?? null, to: card.parentCardId ?? null });
  }
  if (body.workflowState !== undefined && card.workflowState !== before.workflowState) {
    await logCardActivity(cardId, actorId, 'card.workflow_state_changed', { from: before.workflowState, to: card.workflowState });
  }

  return NextResponse.json({ success: true, data: card });
}

/**
 * Replace the assignee set for a card with a single user (or clear it).
 * Diffs the junction, inserts/deletes as needed, auto-watches additions,
 * and emits card.assignee_added / card.assignee_removed events for each diff.
 */
async function replaceCardAssignees(cardId: number, actorId: number | null, next: number | null): Promise<void> {
  const current = await db
    .select({ userId: kanbanCardAssignees.userId })
    .from(kanbanCardAssignees)
    .where(eq(kanbanCardAssignees.cardId, cardId));
  const currentSet = new Set(current.map(r => r.userId));
  const nextSet = new Set<number>(typeof next === 'number' ? [next] : []);

  const toAdd = [...nextSet].filter(id => !currentSet.has(id));
  const toRemove = [...currentSet].filter(id => !nextSet.has(id));

  for (const userId of toRemove) {
    await db.delete(kanbanCardAssignees)
      .where(and(eq(kanbanCardAssignees.cardId, cardId), eq(kanbanCardAssignees.userId, userId)));
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    await logCardActivity(cardId, actorId, 'card.assignee_removed', { userId, name: u?.name ?? null });
  }
  for (const userId of toAdd) {
    await db.insert(kanbanCardAssignees).values({ cardId, userId }).onConflictDoNothing();
    await db.insert(kanbanCardWatchers).values({ cardId, userId }).onConflictDoNothing();
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    await logCardActivity(cardId, actorId, 'card.assignee_added', { userId, name: u?.name ?? null });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);

  const result = await authorizeCard(cardId, session);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  await db.delete(kanbanCards).where(eq(kanbanCards.id, cardId));
  return NextResponse.json({ success: true });
}
