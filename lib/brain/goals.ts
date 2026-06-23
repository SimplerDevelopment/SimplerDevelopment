/**
 * Brain Goals — OKR-shaped progress trackers owned by a single brain_initiative.
 *
 * Surface area:
 *   - listGoals / getGoalById        read paths (slim filters, slim parent join)
 *   - createGoal / updateGoal        full mutation paths
 *   - checkinGoal                    progress drop — bumps lastCheckedInAt and
 *                                    can auto-classify status from the metric
 *   - deleteGoal                     hard delete (leaf row)
 *   - autoClassifyGoalStatus         pure helper used by checkin AND directly
 *                                    by the dashboard / aggregate code paths
 *   - aggregateGoalsForInitiative    cheap by-status counts for the initiative
 *                                    detail UI
 *
 * Audit policy — per PLAN.md:
 *   - `create`, `update`, `delete` write a `brain_goal.<action>` audit row.
 *   - `checkin` does NOT audit (too chatty) — we rely on `lastCheckedInAt`
 *     as the breadcrumb.
 *
 * Audit-in-tx deadlock note: lib/db is pinned to `max: 1` connections, so any
 * `logAudit` call inside a `db.transaction(...)` block will deadlock against
 * itself. Our paths are all single-mutation, so we use Pattern A: do the write,
 * then call `logAudit` AFTER the write returns.
 */

import { db } from '@/lib/db';
import {
  brainGoals,
  brainInitiatives,
  type BrainGoalStatus,
} from '@/lib/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { logAudit } from './audit';
import { revalidateBrainDashboard } from './dashboard';

export type BrainGoal = typeof brainGoals.$inferSelect;

export interface ListGoalsOpts {
  initiativeId?: number;
  status?: BrainGoalStatus | BrainGoalStatus[];
  ownerId?: number;
  /** Default 100, max 100. */
  limit?: number;
  offset?: number;
}

export interface CreateGoalInput {
  initiativeId: number;
  title: string;
  description?: string | null;
  ownerId?: number | null;
  unit?: string | null;
  targetMetric?: number | null;
  currentMetric?: number | null;
  targetDate?: Date | null;
  sortOrder?: number;
  status?: BrainGoalStatus;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string | null;
  ownerId?: number | null;
  unit?: string | null;
  targetMetric?: number | null;
  currentMetric?: number | null;
  targetDate?: Date | null;
  sortOrder?: number;
  status?: BrainGoalStatus;
}

export interface CheckinGoalArgs {
  currentMetric?: number;
  note?: string | null;
  status?: BrainGoalStatus;
}

export interface GoalAggregate {
  total: number;
  byStatus: Record<BrainGoalStatus, number>;
}

const GOAL_STATUS_KEYS: BrainGoalStatus[] = [
  'open',
  'on_track',
  'at_risk',
  'off_track',
  'achieved',
  'missed',
];

function emptyByStatus(): Record<BrainGoalStatus, number> {
  return GOAL_STATUS_KEYS.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Record<BrainGoalStatus, number>);
}

// ─── reads ───────────────────────────────────────────────────────────────────

export async function listGoals(
  clientId: number,
  opts: ListGoalsOpts = {},
): Promise<BrainGoal[]> {
  const conds = [eq(brainGoals.clientId, clientId)];
  if (opts.initiativeId !== undefined) conds.push(eq(brainGoals.initiativeId, opts.initiativeId));
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      // Multi-status filter via OR
      conds.push(sql`${brainGoals.status} = ANY(${opts.status as string[]})`);
    } else {
      conds.push(eq(brainGoals.status, opts.status));
    }
  }
  if (opts.ownerId !== undefined) conds.push(eq(brainGoals.ownerId, opts.ownerId));

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  return db
    .select()
    .from(brainGoals)
    .where(and(...conds))
    // sortOrder ASC, then targetDate ASC NULLS LAST, then id for stable ordering.
    .orderBy(
      asc(brainGoals.sortOrder),
      sql`${brainGoals.targetDate} ASC NULLS LAST`,
      asc(brainGoals.id),
    )
    .limit(limit)
    .offset(offset);
}

export interface GoalWithInitiativeRef {
  goal: BrainGoal;
  initiative: {
    initiativeId: number;
    name: string;
    slug: string;
    status: string;
  } | null;
}

/**
 * Single goal + slim parent initiative reference. Returns null when the goal
 * does not exist OR belongs to another tenant.
 */
export async function getGoalById(
  clientId: number,
  id: number,
): Promise<GoalWithInitiativeRef | null> {
  const rows = await db
    .select({
      goal: brainGoals,
      initiativeId: brainInitiatives.id,
      initiativeName: brainInitiatives.name,
      initiativeSlug: brainInitiatives.slug,
      initiativeStatus: brainInitiatives.status,
    })
    .from(brainGoals)
    .leftJoin(brainInitiatives, eq(brainGoals.initiativeId, brainInitiatives.id))
    .where(and(eq(brainGoals.id, id), eq(brainGoals.clientId, clientId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    goal: row.goal,
    initiative: row.initiativeId != null
      ? {
          initiativeId: row.initiativeId,
          name: row.initiativeName ?? '',
          slug: row.initiativeSlug ?? '',
          status: row.initiativeStatus ?? '',
        }
      : null,
  };
}

// ─── mutations ───────────────────────────────────────────────────────────────

/**
 * Verify an initiative belongs to the given tenant. Throws "initiative not
 * found in tenant" so callers (REST handlers, tests) can map to 404 / 400.
 */
async function assertInitiativeInTenant(clientId: number, initiativeId: number): Promise<void> {
  const [row] = await db
    .select({ id: brainInitiatives.id })
    .from(brainInitiatives)
    .where(and(eq(brainInitiatives.id, initiativeId), eq(brainInitiatives.clientId, clientId)))
    .limit(1);
  if (!row) throw new Error('initiative not found in tenant');
}

export async function createGoal(
  clientId: number,
  actorId: number | null,
  input: CreateGoalInput,
): Promise<BrainGoal> {
  await assertInitiativeInTenant(clientId, input.initiativeId);

  const status: BrainGoalStatus = input.status ?? 'open';
  const currentMetric =
    input.currentMetric !== undefined && input.currentMetric !== null
      ? input.currentMetric
      : input.unit != null
        ? 0
        : null;

  const [created] = await db
    .insert(brainGoals)
    .values({
      clientId,
      initiativeId: input.initiativeId,
      title: input.title.trim().slice(0, 255),
      description: input.description ?? null,
      status,
      ownerId: input.ownerId ?? null,
      unit: input.unit ?? null,
      targetMetric: input.targetMetric ?? null,
      currentMetric,
      targetDate: input.targetDate ?? null,
      sortOrder: input.sortOrder ?? 0,
      createdBy: actorId ?? null,
    })
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_goal.create',
    entityType: 'brain_goal',
    entityId: created.id,
    metadata: { initiativeId: created.initiativeId },
  });

  // goalsAtRisk / goalsAchievedThisQuarter dashboard tiles.
  if (created.status === 'at_risk' || created.status === 'off_track' || created.status === 'achieved') {
    revalidateBrainDashboard(clientId);
  }
  return created;
}

export async function updateGoal(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdateGoalInput,
): Promise<BrainGoal | null> {
  // Need the before-row to: (a) confirm tenant ownership and (b) warn if the
  // caller is forcing status='achieved' while currentMetric < targetMetric.
  const before = await getGoalById(clientId, id);
  if (!before) return null;

  const set: Partial<typeof brainGoals.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 255);
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  if (patch.unit !== undefined) set.unit = patch.unit;
  if (patch.targetMetric !== undefined) set.targetMetric = patch.targetMetric;
  if (patch.currentMetric !== undefined) set.currentMetric = patch.currentMetric;
  if (patch.targetDate !== undefined) set.targetDate = patch.targetDate;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.status !== undefined) set.status = patch.status;

  if (patch.status === 'achieved') {
    const target = patch.targetMetric ?? before.goal.targetMetric;
    const current = patch.currentMetric ?? before.goal.currentMetric;
    if (
      typeof target === 'number' &&
      typeof current === 'number' &&
      current < target
    ) {
      // Don't reject — PLAN says warn only. Operators sometimes mark a goal
      // achieved even when the headline metric undershoots (e.g., they hit it
      // via a different path).
      console.warn('[brain.goals] forcing status=achieved with currentMetric < targetMetric', {
        goalId: id,
        current,
        target,
      });
    }
  }

  const [updated] = await db
    .update(brainGoals)
    .set(set)
    .where(and(eq(brainGoals.id, id), eq(brainGoals.clientId, clientId)))
    .returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_goal.update',
      entityType: 'brain_goal',
      entityId: id,
      metadata: { changedFields: Object.keys(patch) },
    });
    // Status field is the only one that drives dashboard counts, but other
    // fields (targetMetric / targetDate) can flip the auto-classify outcome
    // on the next checkin — bump on any update.
    if (patch.status !== undefined) revalidateBrainDashboard(clientId);
  }
  return updated ?? null;
}

/**
 * Apply a progress check-in. Does NOT audit (per PLAN.md — too chatty;
 * lastCheckedInAt is the breadcrumb). When `status` is omitted but
 * `currentMetric` is provided, the auto-classifier picks the new status.
 */
export async function checkinGoal(
  clientId: number,
  _actorId: number | null,
  id: number,
  args: CheckinGoalArgs,
): Promise<BrainGoal | null> {
  // Fetch before-row so the auto-classifier sees the merged shape.
  const beforeRow = await db
    .select()
    .from(brainGoals)
    .where(and(eq(brainGoals.id, id), eq(brainGoals.clientId, clientId)))
    .limit(1);
  const before = beforeRow[0];
  if (!before) return null;

  const now = new Date();
  const set: Partial<typeof brainGoals.$inferInsert> = {
    updatedAt: now,
    lastCheckedInAt: now,
  };
  if (args.currentMetric !== undefined) set.currentMetric = args.currentMetric;
  if (args.note !== undefined) set.lastProgressNote = args.note;

  if (args.status !== undefined) {
    set.status = args.status;
  } else if (args.currentMetric !== undefined) {
    // Auto-classify against the merged goal shape.
    const merged: BrainGoal = {
      ...before,
      currentMetric: args.currentMetric,
    };
    set.status = autoClassifyGoalStatus(merged, now);
  }

  const [updated] = await db
    .update(brainGoals)
    .set(set)
    .where(and(eq(brainGoals.id, id), eq(brainGoals.clientId, clientId)))
    .returning();

  // Checkins routinely flip status via auto-classify — bump if status moved.
  if (updated && before.status !== updated.status) revalidateBrainDashboard(clientId);
  return updated ?? null;
}

export async function deleteGoal(
  clientId: number,
  actorId: number | null,
  id: number,
): Promise<boolean> {
  // brain_goals is a leaf — no ON DELETE CASCADE from this row matters.
  // Audit BEFORE delete so the goal id is still meaningful in the log row.
  const before = await db
    .select({ id: brainGoals.id, initiativeId: brainGoals.initiativeId })
    .from(brainGoals)
    .where(and(eq(brainGoals.id, id), eq(brainGoals.clientId, clientId)))
    .limit(1);
  if (!before[0]) return false;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_goal.delete',
    entityType: 'brain_goal',
    entityId: id,
    metadata: { initiativeId: before[0].initiativeId },
  });

  const res = await db
    .delete(brainGoals)
    .where(and(eq(brainGoals.id, id), eq(brainGoals.clientId, clientId)))
    .returning({ id: brainGoals.id });

  if (res.length > 0) revalidateBrainDashboard(clientId);
  return res.length > 0;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Pure, side-effect-free auto-classifier. Used by `checkinGoal` and exposed
 * for downstream consumers (the dashboard's "goals at risk" rollup, MCP echo).
 *
 * Rules (in order — the first matching rule wins):
 *   1. currentMetric >= targetMetric  → 'achieved'
 *   2. targetDate < now (overdue)     → 'missed'   (regardless of metric)
 *   3. linear pacing against targetDate:
 *        expectedByNow = targetMetric * elapsed / total
 *        current / expected  <  0.5   → 'off_track'
 *                            <  0.8   → 'at_risk'
 *                            otherwise → 'on_track'
 *   4. Insufficient data (no targetDate AND no targetMetric, or both null
 *      after the metric branch is skipped) → 'open'
 *
 * Notes:
 *   - When targetMetric is set but targetDate is not, we can still hit rule 1
 *     but cannot pace — we fall to 'open'.
 *   - When targetDate is set but targetMetric is not, rule 2 still applies
 *     for an overdue goal; otherwise 'open'.
 *   - createdAt is the pacing anchor. If a goal somehow has createdAt >=
 *     targetDate we degrade to 'open' rather than divide by zero.
 */
export function autoClassifyGoalStatus(
  goal: Pick<BrainGoal, 'targetMetric' | 'currentMetric' | 'targetDate' | 'createdAt'>,
  now: Date = new Date(),
): BrainGoalStatus {
  const target = goal.targetMetric;
  const current = goal.currentMetric;
  const targetDate = goal.targetDate;
  const createdAt = goal.createdAt;

  // Rule 1 — hit or surpassed the target.
  if (typeof target === 'number' && typeof current === 'number' && current >= target) {
    return 'achieved';
  }

  // Rule 2 — overdue.
  if (targetDate && targetDate.getTime() < now.getTime()) {
    return 'missed';
  }

  // Rule 3 — pacing.
  if (
    typeof target === 'number' &&
    typeof current === 'number' &&
    targetDate &&
    createdAt &&
    targetDate.getTime() > createdAt.getTime()
  ) {
    const totalMs = targetDate.getTime() - createdAt.getTime();
    const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
    const fractionElapsed = Math.min(1, elapsedMs / totalMs);
    const expected = target * fractionElapsed;
    if (expected <= 0) {
      // Either total is zero or elapsed is zero. Without pacing data we
      // can't make a confident call.
      return 'on_track';
    }
    const ratio = current / expected;
    if (ratio < 0.5) return 'off_track';
    if (ratio < 0.8) return 'at_risk';
    return 'on_track';
  }

  // Rule 4 — insufficient data.
  return 'open';
}

/**
 * Cheap aggregate used by the initiative-detail view. One round trip with
 * GROUP BY status.
 */
export async function aggregateGoalsForInitiative(
  clientId: number,
  initiativeId: number,
): Promise<GoalAggregate> {
  const rows = await db
    .select({
      status: brainGoals.status,
      count: sql<number>`count(*)::int`,
    })
    .from(brainGoals)
    .where(and(eq(brainGoals.clientId, clientId), eq(brainGoals.initiativeId, initiativeId)))
    .groupBy(brainGoals.status);

  const byStatus = emptyByStatus();
  let total = 0;
  for (const r of rows) {
    const k = r.status as BrainGoalStatus;
    byStatus[k] = Number(r.count) || 0;
    total += byStatus[k];
  }
  return { total, byStatus };
}

// Re-export the status type for caller convenience — saves a second import.
export type { BrainGoalStatus };
