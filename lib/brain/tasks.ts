import { db } from '@/lib/db';
import {
  brainAuditLogs,
  brainTasks,
  kanbanCards,
  kanbanColumns,
  projects,
  type BrainTaskStatus,
} from '@/lib/db/schema';
import { eq, and, desc, inArray, max, sql } from 'drizzle-orm';
import { logAudit } from './audit';
import { revalidateBrainDashboard } from './dashboard';

export type BrainTask = typeof brainTasks.$inferSelect;

interface ListOpts {
  status?: BrainTaskStatus | BrainTaskStatus[];
  ownerId?: number;
  meetingId?: number;
  needsReview?: boolean;
  /** Hard cap of rows fetched. Default 200, max 200. */
  limit?: number;
  /** Pagination offset; pairs with `limit`. Default 0. */
  offset?: number;
}

function buildTaskFilters(clientId: number, opts: ListOpts) {
  const conditions = [eq(brainTasks.clientId, clientId)];
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      conditions.push(inArray(brainTasks.status, opts.status));
    } else {
      conditions.push(eq(brainTasks.status, opts.status));
    }
  }
  if (opts.ownerId !== undefined) conditions.push(eq(brainTasks.ownerId, opts.ownerId));
  if (opts.meetingId !== undefined) conditions.push(eq(brainTasks.meetingId, opts.meetingId));
  if (opts.needsReview !== undefined) conditions.push(eq(brainTasks.needsReview, opts.needsReview));
  return conditions;
}

export async function listTasks(clientId: number, opts: ListOpts = {}): Promise<BrainTask[]> {
  const conditions = buildTaskFilters(clientId, opts);
  return db.select().from(brainTasks)
    .where(and(...conditions))
    .orderBy(desc(brainTasks.createdAt))
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);
}

/** Count rows matching the same filter set as {@link listTasks}. */
export async function countTasks(clientId: number, opts: Omit<ListOpts, 'limit' | 'offset'> = {}): Promise<number> {
  const conditions = buildTaskFilters(clientId, opts);
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(brainTasks)
    .where(and(...conditions));
  return row?.count ?? 0;
}

export async function getTask(clientId: number, taskId: number): Promise<BrainTask | null> {
  const [row] = await db.select().from(brainTasks)
    .where(and(eq(brainTasks.id, taskId), eq(brainTasks.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

interface CreateTaskInput {
  clientId: number;
  meetingId?: number | null;
  title: string;
  description?: string;
  ownerId?: number | null;
  status?: BrainTaskStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date | null;
  source?: 'manual' | 'meeting' | 'ai_suggestion';
  createdByAi?: boolean;
  needsReview?: boolean;
  complianceFlag?: boolean;
  createdBy?: number | null;
}

export async function createTask(input: CreateTaskInput, opts: { tx?: typeof db } = {}): Promise<BrainTask> {
  const conn = opts.tx ?? db;
  const [created] = await conn.insert(brainTasks).values({
    clientId: input.clientId,
    meetingId: input.meetingId ?? null,
    title: input.title.slice(0, 500),
    description: input.description,
    ownerId: input.ownerId ?? null,
    status: input.status ?? 'open',
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    source: input.source ?? 'manual',
    createdByAi: input.createdByAi ?? false,
    needsReview: input.needsReview ?? false,
    complianceFlag: input.complianceFlag ?? false,
    createdBy: input.createdBy ?? null,
  }).returning();
  // Tasks feed openTasks / aiCreatedTasks / overdue / blocked / upcoming tiles —
  // bump the per-client dashboard cache so the next read recomputes.
  revalidateBrainDashboard(input.clientId);
  return created;
}

interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  ownerId?: number | null;
  status?: BrainTaskStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date | null;
  blockedReason?: string | null;
  needsReview?: boolean;
}

export async function updateTask(
  clientId: number,
  taskId: number,
  input: UpdateTaskInput,
  actorId: number | null,
): Promise<BrainTask | null> {
  const before = await getTask(clientId, taskId);
  if (!before) return null;

  const [updated] = await db.update(brainTasks).set({
    ...input,
    updatedAt: new Date(),
  }).where(and(eq(brainTasks.id, taskId), eq(brainTasks.clientId, clientId))).returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'task.updated',
      entityType: 'brain_task',
      entityId: taskId,
      metadata: { changedFields: Object.keys(input) },
    });
    // Status / due-date / priority / needsReview flips all change dashboard
    // tile membership — always bump.
    revalidateBrainDashboard(clientId);
  }
  return updated ?? null;
}

export async function deleteTask(clientId: number, taskId: number, actorId: number | null): Promise<boolean> {
  const result = await db.delete(brainTasks)
    .where(and(eq(brainTasks.id, taskId), eq(brainTasks.clientId, clientId)))
    .returning({ id: brainTasks.id });
  if (result.length > 0) {
    await logAudit({
      clientId,
      actorId,
      action: 'task.deleted',
      entityType: 'brain_task',
      entityId: taskId,
    });
    revalidateBrainDashboard(clientId);
  }
  return result.length > 0;
}

interface PromoteToKanbanArgs {
  clientId: number;
  taskId: number;
  projectId: number;
  /** Column to drop the new card into. Defaults to the lowest-order non-done column. */
  columnId?: number;
  actorId: number;
}

interface PromoteResult {
  task: BrainTask;
  cardId: number;
  projectId: number;
  columnId: number;
}

/**
 * Promote a Brain task into a project kanban board. Inserts a kanban_cards row
 * in the chosen project + column and links the brain_task to it. Idempotent:
 * if the task is already linked, returns the existing link without creating a
 * duplicate.
 */
export async function promoteTaskToKanban(args: PromoteToKanbanArgs): Promise<PromoteResult> {
  return db.transaction(async (tx) => {
    // 1. Verify task belongs to client.
    const [task] = await tx.select().from(brainTasks)
      .where(and(eq(brainTasks.id, args.taskId), eq(brainTasks.clientId, args.clientId)))
      .limit(1);
    if (!task) throw new Error('Brain task not found.');
    if (task.linkedKanbanCardId) {
      // Idempotent — already promoted. Return existing link.
      const [existing] = await tx.select().from(kanbanCards)
        .where(eq(kanbanCards.id, task.linkedKanbanCardId)).limit(1);
      if (existing) {
        return { task, cardId: existing.id, projectId: existing.projectId, columnId: existing.columnId };
      }
      // Stale link — drop it and re-promote.
    }

    // 2. Verify project belongs to client.
    const [project] = await tx.select().from(projects)
      .where(and(eq(projects.id, args.projectId), eq(projects.clientId, args.clientId)))
      .limit(1);
    if (!project) throw new Error('Project not found in this workspace.');

    // 3. Resolve target column.
    let columnId = args.columnId;
    if (columnId) {
      const [col] = await tx.select().from(kanbanColumns)
        .where(and(eq(kanbanColumns.id, columnId), eq(kanbanColumns.projectId, args.projectId)))
        .limit(1);
      if (!col) throw new Error('Column not found in selected project.');
    } else {
      const cols = await tx.select().from(kanbanColumns)
        .where(eq(kanbanColumns.projectId, args.projectId))
        .orderBy(kanbanColumns.order);
      const firstOpen = cols.find((c) => !c.isDone) ?? cols[0];
      if (!firstOpen) throw new Error('Project has no kanban columns yet.');
      columnId = firstOpen.id;
    }

    // 4. Compute next sort order in the column.
    const [maxOrder] = await tx.select({ m: max(kanbanCards.order) }).from(kanbanCards)
      .where(eq(kanbanCards.columnId, columnId));
    const nextOrder = (maxOrder?.m ?? -1) + 1;

    // 5. Insert kanban card.
    const cardPriority = ['low', 'medium', 'high', 'urgent'].includes(task.priority) ? task.priority : 'medium';
    const [card] = await tx.insert(kanbanCards).values({
      columnId,
      projectId: args.projectId,
      title: task.title,
      description: task.description ?? null,
      priority: cardPriority,
      dueDate: task.dueDate,
      order: nextOrder,
      createdBy: args.actorId,
    }).returning();

    // 6. Link the brain task to the new card.
    const [updatedTask] = await tx.update(brainTasks).set({
      linkedKanbanCardId: card.id,
      updatedAt: new Date(),
    }).where(eq(brainTasks.id, args.taskId)).returning();

    await tx.insert(brainAuditLogs).values({
      clientId: args.clientId,
      actorId: args.actorId,
      action: 'task.promoted_to_kanban',
      entityType: 'brain_task',
      entityId: args.taskId,
      metadata: { kanbanCardId: card.id, projectId: args.projectId, columnId },
    });

    return { task: updatedTask, cardId: card.id, projectId: args.projectId, columnId };
  });
}

/**
 * List the projects + columns the user can promote tasks into. Lightweight —
 * one row per project with its columns inlined.
 */
export async function listPromotionTargets(clientId: number): Promise<{
  id: number;
  name: string;
  projectKey: string | null;
  status: string;
  columns: { id: number; name: string; isDone: boolean }[];
}[]> {
  const rows = await db.select({
    id: projects.id,
    name: projects.name,
    projectKey: projects.projectKey,
    status: projects.status,
  }).from(projects)
    .where(and(eq(projects.clientId, clientId), inArray(projects.status, ['active', 'paused'])))
    .orderBy(projects.name);

  if (rows.length === 0) return [];

  const projectIds = rows.map((r) => r.id);
  const allColumns = await db.select().from(kanbanColumns)
    .where(inArray(kanbanColumns.projectId, projectIds))
    .orderBy(kanbanColumns.order);

  return rows.map((r) => ({
    ...r,
    columns: allColumns
      .filter((c) => c.projectId === r.id)
      .map((c) => ({ id: c.id, name: c.name, isDone: c.isDone })),
  }));
}
