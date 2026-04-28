import { db } from '@/lib/db';
import { brainTasks, type BrainTaskStatus } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainTask = typeof brainTasks.$inferSelect;

interface ListOpts {
  status?: BrainTaskStatus | BrainTaskStatus[];
  ownerId?: number;
  meetingId?: number;
  needsReview?: boolean;
  limit?: number;
}

export async function listTasks(clientId: number, opts: ListOpts = {}): Promise<BrainTask[]> {
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
  return db.select().from(brainTasks)
    .where(and(...conditions))
    .orderBy(desc(brainTasks.createdAt))
    .limit(opts.limit ?? 200);
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
  }
  return result.length > 0;
}
