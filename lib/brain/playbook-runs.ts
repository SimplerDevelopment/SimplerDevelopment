/**
 * Brain playbook runs — lifecycle (start / advance / complete-step / skip-step /
 * abort / retry) plus the step side-effect dispatcher.
 *
 * Tenancy: every read + write filters on clientId.
 *
 * Audit-in-tx (Pattern B): `startRun` and `advanceRun` mutate the run + multiple
 * step rows in a single transaction. `lib/db` is pinned to `max: 1` connection,
 * so calling the module-global `logAudit` from inside the tx callback would
 * deadlock — it'd open a fresh connection and wait forever for the outer tx
 * to release its hold. We use `txAudit(tx, ...)` instead, which writes the
 * audit row via the held connection.
 *
 * Single-mutation paths (abortRun, retryFailedRun) use Pattern A — audit AFTER
 * the tx commits.
 *
 * Step dispatcher (§3a): when a step becomes active, dispatch its side effect
 * based on `step.kind`:
 *   - task        → createTask (step stays active until explicit complete)
 *   - note        → createNote inline (auto-completes the step)
 *   - meeting     → createEvent inline if startAt resolvable (auto-completes)
 *   - decision    → brain_ai_review_items row, stays active
 *   - review_item → brain_ai_review_items row, stays active
 *   - wait        → set wait_until, dormant until cron drains
 *   - branch      → no side effect; auto-complete; advanceRun chains
 *
 * Dispatcher failures don't kill the whole run — they mark the failing step
 * `failed`, write a `playbook_run_step.failed` audit row, and stop advancing
 * that one branch. Parallel branches continue.
 *
 * Phase 6 (Wave 2b). See .planning/brain-playbooks/PLAN.md.
 */

import { db } from '@/lib/db';
import {
  brainPlaybooks,
  brainPlaybookSteps,
  brainPlaybookRuns,
  brainPlaybookRunSteps,
  brainPlaybookLinks,
  brainAuditLogs,
  brainTasks,
  brainNotes,
  brainCalendarEvents,
  brainAiReviewItems,
  type BrainPlaybookRunStatus,
  type BrainPlaybookRunStepStatus,
  type BrainPlaybookStepKind,
  type BrainPlaybookLinkEntityType,
} from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { logAudit } from './audit';
import { evaluateCondition, type PlaybookCondition } from './playbook-condition';
import { renderObject, renderTemplate } from './playbook-templating';

export type BrainPlaybook = typeof brainPlaybooks.$inferSelect;
export type BrainPlaybookStep = typeof brainPlaybookSteps.$inferSelect;
export type BrainPlaybookRun = typeof brainPlaybookRuns.$inferSelect;
export type BrainPlaybookRunStep = typeof brainPlaybookRunSteps.$inferSelect;
export type BrainPlaybookLink = typeof brainPlaybookLinks.$inferSelect;

/** Drizzle transaction handle — extracted from db.transaction's callback signature. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

/**
 * Tx-safe audit insert. Calling `logAudit` (module-global db) from inside a
 * `db.transaction(...)` callback DEADLOCKS — pool max=1, fresh insert waits
 * forever for the outer tx to release. Inside a tx, use this helper with
 * the active `tx` handle.
 */
async function txAudit(conn: DbOrTx, args: {
  clientId: number;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await conn.insert(brainAuditLogs).values({
    clientId: args.clientId,
    actorId: args.actorId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId ?? null,
    metadata: args.metadata ?? {},
  });
}

// ─── List / get ────────────────────────────────────────────────────────────

export interface ListRunsOpts {
  status?: BrainPlaybookRunStatus | BrainPlaybookRunStatus[];
  playbookId?: number;
  entityType?: BrainPlaybookLinkEntityType;
  entityId?: number;
  limit?: number;
  offset?: number;
}

export interface SlimRunRow {
  id: number;
  playbookId: number;
  playbookName: string;
  label: string;
  status: BrainPlaybookRunStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  stepProgress: { completed: number; total: number };
}

export async function listRuns(clientId: number, opts: ListRunsOpts = {}): Promise<SlimRunRow[]> {
  const conds = [eq(brainPlaybookRuns.clientId, clientId)];
  if (opts.status) {
    if (Array.isArray(opts.status)) conds.push(inArray(brainPlaybookRuns.status, opts.status));
    else conds.push(eq(brainPlaybookRuns.status, opts.status));
  }
  if (opts.playbookId !== undefined) conds.push(eq(brainPlaybookRuns.playbookId, opts.playbookId));

  // Optional join through links for entity-anchored filter.
  let runIdsFilter: number[] | null = null;
  if (opts.entityType && opts.entityId !== undefined) {
    const linkRows = await db.select({ runId: brainPlaybookLinks.runId })
      .from(brainPlaybookLinks)
      .where(and(
        eq(brainPlaybookLinks.clientId, clientId),
        eq(brainPlaybookLinks.entityType, opts.entityType),
        eq(brainPlaybookLinks.entityId, opts.entityId),
      ));
    runIdsFilter = linkRows.map((r) => r.runId);
    if (runIdsFilter.length === 0) return [];
    conds.push(inArray(brainPlaybookRuns.id, runIdsFilter));
  }

  const rows = await db.select({
    id: brainPlaybookRuns.id,
    playbookId: brainPlaybookRuns.playbookId,
    playbookName: brainPlaybooks.name,
    label: brainPlaybookRuns.label,
    status: brainPlaybookRuns.status,
    startedAt: brainPlaybookRuns.startedAt,
    completedAt: brainPlaybookRuns.completedAt,
  }).from(brainPlaybookRuns)
    .innerJoin(brainPlaybooks, eq(brainPlaybooks.id, brainPlaybookRuns.playbookId))
    .where(and(...conds))
    .orderBy(desc(brainPlaybookRuns.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  if (rows.length === 0) return [];

  // Step progress aggregate — group by run.
  const runIds = rows.map((r) => r.id);
  const progress = await db.select({
    runId: brainPlaybookRunSteps.runId,
    status: brainPlaybookRunSteps.status,
    count: sql<number>`count(*)::int`,
  }).from(brainPlaybookRunSteps)
    .where(and(
      eq(brainPlaybookRunSteps.clientId, clientId),
      inArray(brainPlaybookRunSteps.runId, runIds),
    ))
    .groupBy(brainPlaybookRunSteps.runId, brainPlaybookRunSteps.status);

  const progressByRun = new Map<number, { completed: number; total: number }>();
  for (const p of progress) {
    const slot = progressByRun.get(p.runId) ?? { completed: 0, total: 0 };
    slot.total += Number(p.count);
    if (p.status === 'completed' || p.status === 'skipped') slot.completed += Number(p.count);
    progressByRun.set(p.runId, slot);
  }

  return rows.map((r) => ({
    id: r.id,
    playbookId: r.playbookId,
    playbookName: r.playbookName,
    label: r.label,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    stepProgress: progressByRun.get(r.id) ?? { completed: 0, total: 0 },
  }));
}

export interface RunDetailStep {
  id: number;
  stepId: number;
  key: string;
  name: string;
  kind: BrainPlaybookStepKind;
  status: BrainPlaybookRunStepStatus;
  resultEntityType: string | null;
  resultEntityId: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  waitUntil: Date | null;
  failureReason: string | null;
}

export interface RunDetail {
  run: BrainPlaybookRun;
  playbook: BrainPlaybook;
  steps: RunDetailStep[];
  links: BrainPlaybookLink[];
}

export async function getRunById(clientId: number, runId: number): Promise<RunDetail | null> {
  const [run] = await db.select().from(brainPlaybookRuns)
    .where(and(eq(brainPlaybookRuns.id, runId), eq(brainPlaybookRuns.clientId, clientId)))
    .limit(1);
  if (!run) return null;

  const [playbook] = await db.select().from(brainPlaybooks)
    .where(and(eq(brainPlaybooks.id, run.playbookId), eq(brainPlaybooks.clientId, clientId)))
    .limit(1);
  if (!playbook) return null;

  const stepRows = await db.select({
    id: brainPlaybookRunSteps.id,
    stepId: brainPlaybookRunSteps.stepId,
    key: brainPlaybookSteps.key,
    name: brainPlaybookSteps.name,
    kind: brainPlaybookSteps.kind,
    status: brainPlaybookRunSteps.status,
    resultEntityType: brainPlaybookRunSteps.resultEntityType,
    resultEntityId: brainPlaybookRunSteps.resultEntityId,
    startedAt: brainPlaybookRunSteps.startedAt,
    completedAt: brainPlaybookRunSteps.completedAt,
    waitUntil: brainPlaybookRunSteps.waitUntil,
    failureReason: brainPlaybookRunSteps.failureReason,
    sortOrder: brainPlaybookSteps.sortOrder,
  }).from(brainPlaybookRunSteps)
    .innerJoin(brainPlaybookSteps, eq(brainPlaybookSteps.id, brainPlaybookRunSteps.stepId))
    .where(and(
      eq(brainPlaybookRunSteps.clientId, clientId),
      eq(brainPlaybookRunSteps.runId, runId),
    ))
    .orderBy(asc(brainPlaybookSteps.sortOrder), asc(brainPlaybookRunSteps.id));

  const links = await db.select().from(brainPlaybookLinks)
    .where(and(
      eq(brainPlaybookLinks.clientId, clientId),
      eq(brainPlaybookLinks.runId, runId),
    ));

  const steps: RunDetailStep[] = stepRows.map((r) => ({
    id: r.id,
    stepId: r.stepId,
    key: r.key,
    name: r.name,
    kind: r.kind,
    status: r.status,
    resultEntityType: r.resultEntityType,
    resultEntityId: r.resultEntityId,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    waitUntil: r.waitUntil,
    failureReason: r.failureReason,
  }));

  return { run, playbook, steps, links };
}

export async function listActiveRunsForEntity(
  clientId: number,
  entityType: BrainPlaybookLinkEntityType,
  entityId: number,
): Promise<SlimRunRow[]> {
  return listRuns(clientId, {
    entityType,
    entityId,
    status: ['active', 'paused'],
  });
}

// ─── Side-effect dispatcher ────────────────────────────────────────────────

/**
 * Result of a step dispatch:
 *   - completed: step should be marked status='completed' immediately
 *   - waiting:   step stays status='active' (task / decision / review_item) OR
 *                status='active' with wait_until set (wait)
 *   - failed:    dispatcher threw; step marked status='failed', branch stops
 */
type DispatchOutcome =
  | { kind: 'completed'; resultEntityType: string | null; resultEntityId: number | null }
  | { kind: 'waiting'; resultEntityType: string | null; resultEntityId: number | null; waitUntil: Date | null }
  | { kind: 'failed'; reason: string };

interface DispatchArgs {
  conn: Tx;
  clientId: number;
  actorId: number | null;
  step: BrainPlaybookStep;
  context: Record<string, unknown>;
  now: Date;
}

async function dispatchStep(args: DispatchArgs): Promise<DispatchOutcome> {
  const { conn, clientId, actorId, step, context, now } = args;
  const config = renderObject((step.config ?? {}) as Record<string, unknown>, context);

  try {
    switch (step.kind) {
      case 'task': {
        const title = String(config.title ?? step.name ?? 'Untitled task').slice(0, 500);
        const description = config.description !== undefined ? String(config.description) : undefined;
        const priorityRaw = String(config.priority ?? 'medium').toLowerCase();
        const priority = (['low', 'medium', 'high', 'urgent'] as const).includes(priorityRaw as 'low' | 'medium' | 'high' | 'urgent')
          ? (priorityRaw as 'low' | 'medium' | 'high' | 'urgent')
          : 'medium';
        const dueOffsetDays = typeof config.dueOffsetDays === 'number' ? config.dueOffsetDays : null;
        const dueDate = dueOffsetDays != null
          ? new Date(now.getTime() + dueOffsetDays * 86_400_000)
          : null;

        const [task] = await conn.insert(brainTasks).values({
          clientId,
          title,
          description,
          priority,
          status: 'open',
          dueDate,
          source: 'ai_suggestion',
          createdBy: actorId,
        }).returning({ id: brainTasks.id });

        return { kind: 'waiting', resultEntityType: 'brain_task', resultEntityId: task.id, waitUntil: null };
      }

      case 'note': {
        const title = String(config.title ?? step.name ?? 'Playbook note').slice(0, 255);
        const body = String(config.body ?? '').slice(0, 50_000);
        const tagsRaw = Array.isArray(config.tags) ? config.tags : [];
        const tags = tagsRaw.filter((t): t is string => typeof t === 'string');

        const [note] = await conn.insert(brainNotes).values({
          clientId,
          title,
          body,
          tags,
          source: 'manual',
          createdBy: actorId,
        }).returning({ id: brainNotes.id });

        return { kind: 'completed', resultEntityType: 'brain_note', resultEntityId: note.id };
      }

      case 'meeting': {
        const title = String(config.title ?? step.name ?? 'Playbook meeting').slice(0, 255);
        const startOffsetDays = typeof config.startOffsetDays === 'number' ? config.startOffsetDays : null;
        const durationMin = typeof config.durationMin === 'number' ? config.durationMin : 30;
        if (startOffsetDays == null) {
          // No schedule data — log a TODO and skip rather than failing the run.
          console.warn('[brain.playbook-runs] meeting step has no startOffsetDays — skipping side effect', {
            stepId: step.id,
            stepKey: step.key,
          });
          return { kind: 'completed', resultEntityType: null, resultEntityId: null };
        }
        const startAt = new Date(now.getTime() + startOffsetDays * 86_400_000);
        const endAt = new Date(startAt.getTime() + durationMin * 60_000);

        const [evt] = await conn.insert(brainCalendarEvents).values({
          clientId,
          title,
          description: config.description !== undefined ? String(config.description) : null,
          startAt,
          endAt,
          source: 'manual',
          createdBy: actorId,
        }).returning({ id: brainCalendarEvents.id });

        return { kind: 'completed', resultEntityType: 'brain_calendar_event', resultEntityId: evt.id };
      }

      case 'decision': {
        // Open a review-item the user must approve to promote into a real
        // brain_decisions row.
        const payload = {
          title: String(config.title ?? step.name ?? 'Decision'),
          context: config.context !== undefined ? String(config.context) : undefined,
          decision: String(config.decision ?? ''),
          rationale: String(config.rationale ?? ''),
          alternativesConsidered: config.alternativesConsidered !== undefined
            ? String(config.alternativesConsidered)
            : undefined,
          reversibility: config.reversibility === 'one_way' ? 'one_way' as const : 'two_way' as const,
        };
        const [ri] = await conn.insert(brainAiReviewItems).values({
          clientId,
          sourceType: 'playbook',
          sourceId: step.id,
          proposedType: 'decision',
          proposedPayload: payload,
          status: 'pending',
        }).returning({ id: brainAiReviewItems.id });

        return { kind: 'waiting', resultEntityType: 'brain_ai_review_item', resultEntityId: ri.id, waitUntil: null };
      }

      case 'review_item': {
        const proposedType = typeof config.proposedType === 'string' ? config.proposedType : 'note';
        const payload = (config.payload ?? {}) as Record<string, unknown>;
        const [ri] = await conn.insert(brainAiReviewItems).values({
          clientId,
          sourceType: 'playbook',
          sourceId: step.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          proposedType: proposedType as any,
          proposedPayload: payload,
          status: 'pending',
        }).returning({ id: brainAiReviewItems.id });

        return { kind: 'waiting', resultEntityType: 'brain_ai_review_item', resultEntityId: ri.id, waitUntil: null };
      }

      case 'wait': {
        const untilOffsetDays = typeof config.untilOffsetDays === 'number' ? config.untilOffsetDays : 0;
        const waitUntil = new Date(now.getTime() + untilOffsetDays * 86_400_000);
        return { kind: 'waiting', resultEntityType: null, resultEntityId: null, waitUntil };
      }

      case 'branch': {
        // Pure routing — no side effect.
        return { kind: 'completed', resultEntityType: null, resultEntityId: null };
      }

      default: {
        const exhaustive: never = step.kind as never;
        return { kind: 'failed', reason: `Unknown step kind: ${String(exhaustive)}` };
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[brain.playbook-runs] dispatch failed', {
      stepId: step.id,
      stepKey: step.key,
      kind: step.kind,
      reason,
    });
    return { kind: 'failed', reason };
  }
}

// ─── DAG helpers ────────────────────────────────────────────────────────────

/**
 * Resolve entry steps — those NOT referenced by any other step's nextStepKeys.
 * If every step references at least one peer, this returns the lowest-sortOrder
 * step as a deterministic fallback.
 */
function resolveEntrySteps(steps: BrainPlaybookStep[]): BrainPlaybookStep[] {
  if (steps.length === 0) return [];
  const referenced = new Set<string>();
  for (const s of steps) {
    for (const k of s.nextStepKeys ?? []) referenced.add(k);
  }
  const entries = steps.filter((s) => !referenced.has(s.key));
  if (entries.length > 0) return entries;
  // Cyclic / no clear root — fall back to lowest sortOrder.
  const sorted = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.slice(0, 1);
}

interface SpawnArgs {
  conn: Tx;
  clientId: number;
  actorId: number | null;
  runId: number;
  step: BrainPlaybookStep;
  context: Record<string, unknown>;
  now: Date;
}

/**
 * Create a run-step row for `step`, dispatch its side effect, and update the
 * row to reflect the dispatch outcome. Returns the final status of the row
 * (the caller uses this to decide whether to spawn next steps).
 */
async function spawnAndDispatchStep(args: SpawnArgs): Promise<{
  runStepId: number;
  status: BrainPlaybookRunStepStatus;
}> {
  const { conn, clientId, actorId, runId, step, context, now } = args;

  // Insert the run_step row first. ON CONFLICT on (runId, stepId) keeps this
  // idempotent if the caller accidentally double-spawns; we return the
  // existing row in that case.
  const inserted = await conn.insert(brainPlaybookRunSteps).values({
    clientId,
    runId,
    stepId: step.id,
    status: 'active',
    startedAt: now,
  }).onConflictDoNothing().returning({ id: brainPlaybookRunSteps.id });

  let runStepId: number;
  if (inserted.length > 0) {
    runStepId = inserted[0].id;
  } else {
    // Already existed — pick it up.
    const [existing] = await conn.select({ id: brainPlaybookRunSteps.id })
      .from(brainPlaybookRunSteps)
      .where(and(
        eq(brainPlaybookRunSteps.runId, runId),
        eq(brainPlaybookRunSteps.stepId, step.id),
      ))
      .limit(1);
    if (!existing) {
      // Shouldn't happen — conflict-do-nothing but no row found means a race
      // we can't recover from. Mark failed and stop.
      return { runStepId: -1, status: 'failed' };
    }
    runStepId = existing.id;
  }

  const outcome = await dispatchStep({ conn, clientId, actorId, step, context, now });

  let finalStatus: BrainPlaybookRunStepStatus;
  if (outcome.kind === 'failed') {
    finalStatus = 'failed';
    await conn.update(brainPlaybookRunSteps).set({
      status: 'failed',
      failureReason: outcome.reason.slice(0, 5000),
      completedAt: now,
    }).where(eq(brainPlaybookRunSteps.id, runStepId));

    await txAudit(conn, {
      clientId,
      actorId,
      action: 'playbook_run_step.failed',
      entityType: 'brain_playbook_run_step',
      entityId: runStepId,
      metadata: { stepId: step.id, stepKey: step.key, kind: step.kind, reason: outcome.reason },
    });
  } else if (outcome.kind === 'completed') {
    finalStatus = 'completed';
    await conn.update(brainPlaybookRunSteps).set({
      status: 'completed',
      resultEntityType: outcome.resultEntityType,
      resultEntityId: outcome.resultEntityId,
      completedAt: now,
    }).where(eq(brainPlaybookRunSteps.id, runStepId));
  } else {
    // waiting
    finalStatus = 'active';
    await conn.update(brainPlaybookRunSteps).set({
      resultEntityType: outcome.resultEntityType,
      resultEntityId: outcome.resultEntityId,
      waitUntil: outcome.waitUntil,
    }).where(eq(brainPlaybookRunSteps.id, runStepId));
  }

  return { runStepId, status: finalStatus };
}

// ─── startRun ──────────────────────────────────────────────────────────────

export interface StartRunArgs {
  playbookId: number;
  label: string;
  context?: Record<string, unknown>;
  triggerPayload?: Record<string, unknown>;
  links?: { entityType: BrainPlaybookLinkEntityType; entityId: number }[];
}

export interface StartRunResult {
  runId: number;
  firstStepKeys: string[];
  runStatus: BrainPlaybookRunStatus;
}

export async function startRun(
  clientId: number,
  actorId: number | null,
  args: StartRunArgs,
): Promise<StartRunResult> {
  if (!args.label?.trim()) throw new Error('startRun: label is required');

  return db.transaction(async (tx) => {
    // 1. Verify playbook is active + same tenant.
    const [playbook] = await tx.select().from(brainPlaybooks)
      .where(and(eq(brainPlaybooks.id, args.playbookId), eq(brainPlaybooks.clientId, clientId)))
      .limit(1);
    if (!playbook) throw new Error(`startRun: playbook ${args.playbookId} not found`);
    if (playbook.status !== 'active') {
      throw new Error(`startRun: playbook is ${playbook.status}, must be 'active' to start a run`);
    }

    // 2. Pull all steps + resolve entry points.
    const steps = await tx.select().from(brainPlaybookSteps)
      .where(and(
        eq(brainPlaybookSteps.clientId, clientId),
        eq(brainPlaybookSteps.playbookId, args.playbookId),
      ))
      .orderBy(asc(brainPlaybookSteps.sortOrder), asc(brainPlaybookSteps.id));
    if (steps.length === 0) {
      throw new Error('startRun: playbook has no steps');
    }
    const entries = resolveEntrySteps(steps);

    // 3. Create the run row.
    const now = new Date();
    const context = args.context ?? {};
    const [run] = await tx.insert(brainPlaybookRuns).values({
      clientId,
      playbookId: args.playbookId,
      label: args.label.trim().slice(0, 255),
      status: 'active',
      context,
      startedBy: actorId,
      triggerPayload: args.triggerPayload ?? null,
      startedAt: now,
    }).returning();

    // 4. Optional polymorphic links.
    if (args.links && args.links.length > 0) {
      for (const link of args.links) {
        await tx.insert(brainPlaybookLinks).values({
          clientId,
          runId: run.id,
          entityType: link.entityType,
          entityId: link.entityId,
        }).onConflictDoNothing();
      }
    }

    // 5. Spawn each entry step. If a step's condition fails, mark it skipped
    //    immediately and chain to its nextStepKeys.
    const firstStepKeys: string[] = [];
    const stepsByKey = new Map(steps.map((s) => [s.key, s]));
    const visited = new Set<number>(); // guard against pathological self-references

    const spawn = async (step: BrainPlaybookStep): Promise<void> => {
      if (visited.has(step.id)) return;
      visited.add(step.id);

      const conditionPasses = evaluateCondition(
        (step.condition ?? null) as PlaybookCondition | null,
        context,
      );
      if (!conditionPasses) {
        // Mark skipped + chain.
        await tx.insert(brainPlaybookRunSteps).values({
          clientId,
          runId: run.id,
          stepId: step.id,
          status: 'skipped',
          startedAt: now,
          completedAt: now,
        }).onConflictDoNothing();
        for (const nk of step.nextStepKeys ?? []) {
          const next = stepsByKey.get(nk);
          if (next) await spawn(next);
        }
        return;
      }

      firstStepKeys.push(step.key);
      const res = await spawnAndDispatchStep({
        conn: tx,
        clientId,
        actorId,
        runId: run.id,
        step,
        context,
        now,
      });
      // If this entry step was a branch / note / meeting that auto-completed
      // synchronously, chain to its nextStepKeys here so the run kicks off
      // wholly within the start tx.
      if (res.status === 'completed') {
        for (const nk of step.nextStepKeys ?? []) {
          const next = stepsByKey.get(nk);
          if (next) await spawn(next);
        }
      }
      // failed → stop this branch. waiting → caller will resume via advance.
    };

    for (const entry of entries) {
      await spawn(entry);
    }

    // 6. Decide run-level status. If every step is terminal already, complete
    //    the run.
    const stepStates = await tx.select({
      status: brainPlaybookRunSteps.status,
    }).from(brainPlaybookRunSteps)
      .where(eq(brainPlaybookRunSteps.runId, run.id));
    const hasActive = stepStates.some((s) => s.status === 'active');
    const allTerminal = !hasActive && stepStates.length > 0;
    let runStatus: BrainPlaybookRunStatus = 'active';
    if (allTerminal) {
      const anyFailed = stepStates.some((s) => s.status === 'failed');
      runStatus = anyFailed ? 'failed' : 'completed';
      await tx.update(brainPlaybookRuns).set({
        status: runStatus,
        completedAt: now,
        updatedAt: now,
      }).where(eq(brainPlaybookRuns.id, run.id));
    }

    await txAudit(tx, {
      clientId,
      actorId,
      action: 'playbook_run.started',
      entityType: 'brain_playbook_run',
      entityId: run.id,
      metadata: {
        playbookId: args.playbookId,
        firstStepKeys,
        linkCount: args.links?.length ?? 0,
      },
    });

    return { runId: run.id, firstStepKeys, runStatus };
  });
}

// ─── advanceRun ────────────────────────────────────────────────────────────

export interface AdvanceRunResult {
  runId: number;
  newActiveStepKeys: string[];
  newStatus: BrainPlaybookRunStatus;
}

/**
 * Advance any branch-step rows that are still active (branches have no side
 * effect — they exist only to evaluate a condition and route to next steps).
 *
 * `task` / `decision` / `review_item` / `wait` steps stay active until an
 * explicit `completeStep` (or the cron for wait). This function does not
 * touch them; it only resolves branch-kind run_steps and chains forward.
 *
 * If the run has no remaining active steps after, mark it completed.
 */
export async function advanceRun(
  clientId: number,
  actorId: number | null,
  runId: number,
): Promise<AdvanceRunResult | null> {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(brainPlaybookRuns)
      .where(and(eq(brainPlaybookRuns.id, runId), eq(brainPlaybookRuns.clientId, clientId)))
      .limit(1);
    if (!run) return null;
    if (run.status !== 'active' && run.status !== 'paused') {
      return { runId, newActiveStepKeys: [], newStatus: run.status };
    }

    const steps = await tx.select().from(brainPlaybookSteps)
      .where(and(
        eq(brainPlaybookSteps.clientId, clientId),
        eq(brainPlaybookSteps.playbookId, run.playbookId),
      ));
    const stepsByKey = new Map(steps.map((s) => [s.key, s]));
    const stepsById = new Map(steps.map((s) => [s.id, s]));

    // Find active branch run_steps. (Tasks/decisions/etc. require explicit
    // completion; branches are pure routing nodes that advanceRun can resolve
    // unilaterally.)
    const activeRunSteps = await tx.select().from(brainPlaybookRunSteps)
      .where(and(
        eq(brainPlaybookRunSteps.clientId, clientId),
        eq(brainPlaybookRunSteps.runId, runId),
        eq(brainPlaybookRunSteps.status, 'active'),
      ));

    const context = (run.context ?? {}) as Record<string, unknown>;
    const now = new Date();
    const newActiveStepKeys: string[] = [];
    const visited = new Set<number>();

    const spawn = async (step: BrainPlaybookStep): Promise<void> => {
      if (visited.has(step.id)) return;
      visited.add(step.id);

      // Skip if a run_step row already exists in a terminal state.
      const [existing] = await tx.select().from(brainPlaybookRunSteps)
        .where(and(
          eq(brainPlaybookRunSteps.runId, runId),
          eq(brainPlaybookRunSteps.stepId, step.id),
        ))
        .limit(1);
      if (existing && existing.status !== 'pending') {
        // Already processed for this run. If it's terminal and completed,
        // chain forward.
        if (existing.status === 'completed') {
          for (const nk of step.nextStepKeys ?? []) {
            const next = stepsByKey.get(nk);
            if (next) await spawn(next);
          }
        }
        return;
      }

      const conditionPasses = evaluateCondition(
        (step.condition ?? null) as PlaybookCondition | null,
        context,
      );
      if (!conditionPasses) {
        if (existing) {
          await tx.update(brainPlaybookRunSteps).set({
            status: 'skipped',
            completedAt: now,
          }).where(eq(brainPlaybookRunSteps.id, existing.id));
        } else {
          await tx.insert(brainPlaybookRunSteps).values({
            clientId,
            runId,
            stepId: step.id,
            status: 'skipped',
            startedAt: now,
            completedAt: now,
          }).onConflictDoNothing();
        }
        for (const nk of step.nextStepKeys ?? []) {
          const next = stepsByKey.get(nk);
          if (next) await spawn(next);
        }
        return;
      }

      const res = await spawnAndDispatchStep({
        conn: tx,
        clientId,
        actorId,
        runId,
        step,
        context,
        now,
      });
      if (res.status === 'active') newActiveStepKeys.push(step.key);
      if (res.status === 'completed') {
        for (const nk of step.nextStepKeys ?? []) {
          const next = stepsByKey.get(nk);
          if (next) await spawn(next);
        }
      }
    };

    // Resolve every branch step that's currently active.
    for (const rs of activeRunSteps) {
      const step = stepsById.get(rs.stepId);
      if (!step) continue;
      if (step.kind !== 'branch') continue;

      const conditionPasses = evaluateCondition(
        (step.condition ?? null) as PlaybookCondition | null,
        context,
      );
      await tx.update(brainPlaybookRunSteps).set({
        status: conditionPasses ? 'completed' : 'skipped',
        completedAt: now,
      }).where(eq(brainPlaybookRunSteps.id, rs.id));

      if (conditionPasses) {
        for (const nk of step.nextStepKeys ?? []) {
          const next = stepsByKey.get(nk);
          if (next) await spawn(next);
        }
      }
    }

    // After all branches resolved + any spawn cascades — check overall state.
    const all = await tx.select({
      status: brainPlaybookRunSteps.status,
    }).from(brainPlaybookRunSteps)
      .where(eq(brainPlaybookRunSteps.runId, runId));
    const hasActive = all.some((s) => s.status === 'active');
    let newStatus: BrainPlaybookRunStatus = run.status;
    if (!hasActive && all.length > 0) {
      const anyFailed = all.some((s) => s.status === 'failed');
      newStatus = anyFailed ? 'failed' : 'completed';
      await tx.update(brainPlaybookRuns).set({
        status: newStatus,
        completedAt: now,
        updatedAt: now,
      }).where(eq(brainPlaybookRuns.id, runId));
    } else {
      await tx.update(brainPlaybookRuns).set({ updatedAt: now })
        .where(eq(brainPlaybookRuns.id, runId));
    }

    return { runId, newActiveStepKeys, newStatus };
  });
}

// ─── completeStep / skipStep ───────────────────────────────────────────────

export interface CompleteStepArgs {
  resultEntityType?: string;
  resultEntityId?: number;
}

/**
 * Mark a run_step completed (used by the UI's "I did this manually" button,
 * by the wait-drainer cron, and by external systems that have done the work
 * the step was tracking). After the mutation, calls advanceRun to chain to
 * any next steps.
 *
 * The step is located by its underlying `stepId` (the catalog step), not by
 * the run_step row id — callers refer to the step by id throughout the API.
 */
export async function completeStep(
  clientId: number,
  actorId: number | null,
  runId: number,
  stepId: number,
  args: CompleteStepArgs = {},
): Promise<{ stepId: number; status: 'completed' } | null> {
  const result = await db.transaction(async (tx) => {
    const [rs] = await tx.select().from(brainPlaybookRunSteps)
      .where(and(
        eq(brainPlaybookRunSteps.clientId, clientId),
        eq(brainPlaybookRunSteps.runId, runId),
        eq(brainPlaybookRunSteps.stepId, stepId),
      ))
      .limit(1);
    if (!rs) return null;
    if (rs.status === 'completed') return { stepId, status: 'completed' as const };

    const now = new Date();
    await tx.update(brainPlaybookRunSteps).set({
      status: 'completed',
      resultEntityType: args.resultEntityType ?? rs.resultEntityType,
      resultEntityId: args.resultEntityId ?? rs.resultEntityId,
      completedAt: now,
    }).where(eq(brainPlaybookRunSteps.id, rs.id));

    return { stepId, status: 'completed' as const };
  });

  if (!result) return null;
  // Chain forward — outside the original tx, advanceRun opens its own.
  await advanceRun(clientId, actorId, runId);
  return result;
}

export async function skipStep(
  clientId: number,
  actorId: number | null,
  runId: number,
  stepId: number,
  args: { reason?: string } = {},
): Promise<{ stepId: number; status: 'skipped' } | null> {
  const result = await db.transaction(async (tx) => {
    const [rs] = await tx.select().from(brainPlaybookRunSteps)
      .where(and(
        eq(brainPlaybookRunSteps.clientId, clientId),
        eq(brainPlaybookRunSteps.runId, runId),
        eq(brainPlaybookRunSteps.stepId, stepId),
      ))
      .limit(1);
    if (!rs) return null;
    if (rs.status === 'skipped' || rs.status === 'completed') {
      return { stepId, status: 'skipped' as const };
    }

    const now = new Date();
    await tx.update(brainPlaybookRunSteps).set({
      status: 'skipped',
      failureReason: args.reason ?? null,
      completedAt: now,
    }).where(eq(brainPlaybookRunSteps.id, rs.id));

    return { stepId, status: 'skipped' as const };
  });

  if (!result) return null;
  await advanceRun(clientId, actorId, runId);
  return result;
}

// ─── abortRun / retryFailedRun ─────────────────────────────────────────────

export async function abortRun(
  clientId: number,
  actorId: number | null,
  runId: number,
  args: { reason?: string } = {},
): Promise<BrainPlaybookRun | null> {
  const result = await db.transaction(async (tx) => {
    const [run] = await tx.select().from(brainPlaybookRuns)
      .where(and(eq(brainPlaybookRuns.id, runId), eq(brainPlaybookRuns.clientId, clientId)))
      .limit(1);
    if (!run) return null;
    if (run.status === 'aborted' || run.status === 'completed') return run;

    const now = new Date();
    const [updated] = await tx.update(brainPlaybookRuns).set({
      status: 'aborted',
      abortedAt: now,
      abortReason: args.reason ?? null,
      updatedAt: now,
    }).where(eq(brainPlaybookRuns.id, runId)).returning();

    // Mark any still-active step rows as skipped — defensively so dashboards
    // and step-progress counts settle.
    await tx.update(brainPlaybookRunSteps).set({
      status: 'skipped',
      completedAt: now,
      failureReason: args.reason ?? 'run aborted',
    }).where(and(
      eq(brainPlaybookRunSteps.runId, runId),
      eq(brainPlaybookRunSteps.status, 'active'),
    ));

    await txAudit(tx, {
      clientId,
      actorId,
      action: 'playbook_run.aborted',
      entityType: 'brain_playbook_run',
      entityId: runId,
      metadata: { reason: args.reason ?? null },
    });

    return updated;
  });
  return result;
}

/**
 * Retry a failed run — finds any failed step rows and resets them to pending
 * so the caller (or the next advanceRun) can re-dispatch them. The run's
 * top-level status is flipped back to 'active'.
 *
 * Pattern A — single transaction for the state flip, audit AFTER commit.
 */
export async function retryFailedRun(
  clientId: number,
  actorId: number | null,
  runId: number,
): Promise<BrainPlaybookRun | null> {
  const result = await db.transaction(async (tx) => {
    const [run] = await tx.select().from(brainPlaybookRuns)
      .where(and(eq(brainPlaybookRuns.id, runId), eq(brainPlaybookRuns.clientId, clientId)))
      .limit(1);
    if (!run) return null;
    if (run.status !== 'failed') return run;

    const now = new Date();
    const failedSteps = await tx.select({
      id: brainPlaybookRunSteps.id,
    }).from(brainPlaybookRunSteps)
      .where(and(
        eq(brainPlaybookRunSteps.runId, runId),
        eq(brainPlaybookRunSteps.status, 'failed'),
      ));
    if (failedSteps.length > 0) {
      await tx.update(brainPlaybookRunSteps).set({
        status: 'pending',
        failureReason: null,
        completedAt: null,
      }).where(inArray(brainPlaybookRunSteps.id, failedSteps.map((r) => r.id)));
    }

    const [updated] = await tx.update(brainPlaybookRuns).set({
      status: 'active',
      completedAt: null,
      updatedAt: now,
    }).where(eq(brainPlaybookRuns.id, runId)).returning();

    return updated;
  });

  if (result) {
    await logAudit({
      clientId,
      actorId,
      action: 'playbook_run.retried',
      entityType: 'brain_playbook_run',
      entityId: runId,
    });
  }
  return result;
}

// ─── Cron — drain wait steps ───────────────────────────────────────────────

/**
 * Find every active run_step whose wait_until is in the past, and advance it.
 * Called by the process-playbook-waits cron route. Returns counts for logging.
 *
 * Each drained step gets `completeStep` (which itself chains advanceRun). We
 * intentionally do NOT batch under one transaction — drains for one tenant
 * shouldn't block another's, and the underlying step dispatchers can be slow.
 */
export async function drainExpiredWaitSteps(): Promise<{
  examined: number;
  drained: number;
  failed: number;
}> {
  const now = new Date();
  const due = await db.select({
    id: brainPlaybookRunSteps.id,
    clientId: brainPlaybookRunSteps.clientId,
    runId: brainPlaybookRunSteps.runId,
    stepId: brainPlaybookRunSteps.stepId,
  }).from(brainPlaybookRunSteps)
    .where(and(
      eq(brainPlaybookRunSteps.status, 'active'),
      isNotNull(brainPlaybookRunSteps.waitUntil),
      lte(brainPlaybookRunSteps.waitUntil, now),
    ))
    .limit(500);

  if (due.length === 0) return { examined: 0, drained: 0, failed: 0 };

  // Lookup each row's run.startedBy to use as the "actor" for the cron-driven
  // advance. Falls back to null if not set.
  const runIds = Array.from(new Set(due.map((r) => r.runId)));
  const runRows = await db.select({
    id: brainPlaybookRuns.id,
    startedBy: brainPlaybookRuns.startedBy,
  }).from(brainPlaybookRuns)
    .where(inArray(brainPlaybookRuns.id, runIds));
  const actorByRun = new Map(runRows.map((r) => [r.id, r.startedBy] as const));

  let drained = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const actor = actorByRun.get(row.runId) ?? null;
      await completeStep(row.clientId, actor, row.runId, row.stepId);
      drained++;
    } catch (err) {
      failed++;
      console.error('[brain.playbook-runs] drain failed', {
        runStepId: row.id,
        runId: row.runId,
        stepId: row.stepId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { examined: due.length, drained, failed };
}

// ─── Templating re-export (so route can render a label preview) ──────────

export { renderTemplate };
