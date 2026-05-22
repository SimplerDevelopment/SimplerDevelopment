/**
 * Company Brain — playbooks (definition) backend.
 *
 * Playbooks are ordered, branching sequences of tasks/notes/meetings/etc.
 * triggered by an event (new-hire, contract-renewal, incident). Unlike
 * `automation_rules` (one-shot reactions), playbooks are multi-step,
 * human-paced, and carry per-run state. This module covers the DEFINITION
 * side: CRUD on `brain_playbooks` + `brain_playbook_steps`, lifecycle
 * transitions, and a DAG validator. The RUN side (start/advance/abort,
 * condition + templating eval, cron) lives in sibling files written by
 * Wave 2b.
 *
 * Audit pattern: lib/db is pinned to max:1, so calling logAudit() inside a
 * db.transaction() deadlocks. Every mutation in this file uses Pattern A —
 * the audit row is written AFTER the tx commits. Wave 2b's `advanceRun`
 * uses Pattern B (txAudit) because the run-step inserts + audit need to be
 * atomic; nothing in this file does.
 *
 * Status transitions:
 *   - createPlaybook seeds 'draft'
 *   - updatePlaybook refuses status changes
 *   - activatePlaybook is the only path to 'active'; refuses zero-step playbooks
 *   - archivePlaybook is the only path to 'archived'; refuses while active runs
 *     exist (unless force=true)
 *   - deletePlaybook is hard-delete; refuses if any runs exist (unless force=true)
 */
import { db } from '@/lib/db';
import {
  brainPlaybooks,
  brainPlaybookSteps,
  brainPlaybookRuns,
  brainPlaybookRunSteps,
  type BrainPlaybookStatus,
  type BrainPlaybookTriggerKind,
  type BrainPlaybookStepKind,
} from '@/lib/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainPlaybook = typeof brainPlaybooks.$inferSelect;
export type BrainPlaybookStep = typeof brainPlaybookSteps.$inferSelect;
export type { BrainPlaybookStatus, BrainPlaybookTriggerKind, BrainPlaybookStepKind };

// Re-export the condition shape — same JSON column schema used by step.condition.
export type BrainPlaybookCondition = {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'not_in' | 'exists' | 'not_exists' | 'gt' | 'lt';
  value?: unknown;
} | null;

// ─── slug ───────────────────────────────────────────────────────────────────

/**
 * Slugify a playbook name: lowercase, collapse non-alphanumeric to '-',
 * strip combining marks, cap at 180 chars (leaves headroom under the 200-char
 * column for a numeric collision suffix).
 */
export function slugifyPlaybookName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 180);
  return base || 'playbook';
}

/**
 * Choose a slug that doesn't collide with an existing playbook for this
 * tenant. On collision, suffix '-2', '-3', … until a free slot.
 */
async function uniqueSlugForClient(clientId: number, name: string): Promise<string> {
  const base = slugifyPlaybookName(name);
  const taken = await db
    .select({ slug: brainPlaybooks.slug })
    .from(brainPlaybooks)
    .where(and(
      eq(brainPlaybooks.clientId, clientId),
      sql`${brainPlaybooks.slug} = ${base} OR ${brainPlaybooks.slug} LIKE ${base + '-%'}`,
    ));
  const takenSet = new Set(taken.map((r) => r.slug));
  if (!takenSet.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`;
    if (!takenSet.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// ─── list ───────────────────────────────────────────────────────────────────

export interface ListPlaybooksOpts {
  status?: BrainPlaybookStatus | BrainPlaybookStatus[];
  category?: string;
  triggerKind?: BrainPlaybookTriggerKind | BrainPlaybookTriggerKind[];
  ownerId?: number;
  limit?: number;
  offset?: number;
}

export interface PlaybookListRow {
  id: number;
  name: string;
  slug: string;
  status: BrainPlaybookStatus;
  triggerKind: BrainPlaybookTriggerKind;
  category: string | null;
  ownerId: number | null;
  stepCount: number;
  activeRunCount: number;
}

export async function listPlaybooks(
  clientId: number,
  opts: ListPlaybooksOpts = {},
): Promise<PlaybookListRow[]> {
  const conds = [eq(brainPlaybooks.clientId, clientId)];

  if (opts.status !== undefined) {
    const list = Array.isArray(opts.status) ? opts.status : [opts.status];
    if (list.length === 1) conds.push(eq(brainPlaybooks.status, list[0]));
    else if (list.length > 1) conds.push(inArray(brainPlaybooks.status, list));
  }
  if (opts.category !== undefined) {
    conds.push(eq(brainPlaybooks.category, opts.category));
  }
  if (opts.triggerKind !== undefined) {
    const list = Array.isArray(opts.triggerKind) ? opts.triggerKind : [opts.triggerKind];
    if (list.length === 1) conds.push(eq(brainPlaybooks.triggerKind, list[0]));
    else if (list.length > 1) conds.push(inArray(brainPlaybooks.triggerKind, list));
  }
  if (opts.ownerId !== undefined) {
    conds.push(eq(brainPlaybooks.ownerId, opts.ownerId));
  }

  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 100)) : 50;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;

  // Both counts via correlated subqueries. MUST hard-code the outer table +
  // column names — using `${brainPlaybook_steps.playbook_id}` etc. emits the
  // column unqualified and silently matches the inner table, returning 0 for
  // every row. Project memory: feedback_drizzle_correlated_subqueries.md.
  const rows = await db
    .select({
      id: brainPlaybooks.id,
      name: brainPlaybooks.name,
      slug: brainPlaybooks.slug,
      status: brainPlaybooks.status,
      triggerKind: brainPlaybooks.triggerKind,
      category: brainPlaybooks.category,
      ownerId: brainPlaybooks.ownerId,
      stepCount: sql<number>`(
        SELECT COUNT(*)::int FROM brain_playbook_steps
        WHERE brain_playbook_steps.playbook_id = brain_playbooks.id
          AND brain_playbook_steps.client_id = ${clientId}
      )`.as('step_count'),
      activeRunCount: sql<number>`(
        SELECT COUNT(*)::int FROM brain_playbook_runs
        WHERE brain_playbook_runs.playbook_id = brain_playbooks.id
          AND brain_playbook_runs.client_id = ${clientId}
          AND brain_playbook_runs.status IN ('pending', 'active', 'paused')
      )`.as('active_run_count'),
    })
    .from(brainPlaybooks)
    .where(and(...conds))
    .orderBy(asc(brainPlaybooks.name))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    triggerKind: r.triggerKind,
    category: r.category,
    ownerId: r.ownerId,
    stepCount: Number(r.stepCount ?? 0),
    activeRunCount: Number(r.activeRunCount ?? 0),
  }));
}

// ─── get (single) ────────────────────────────────────────────────────────────

export interface PlaybookWithSteps {
  playbook: BrainPlaybook;
  steps: BrainPlaybookStep[];
}

export async function getPlaybookById(
  clientId: number,
  id: number,
): Promise<PlaybookWithSteps | null> {
  const [playbook] = await db
    .select()
    .from(brainPlaybooks)
    .where(and(eq(brainPlaybooks.id, id), eq(brainPlaybooks.clientId, clientId)))
    .limit(1);
  if (!playbook) return null;

  const steps = await db
    .select()
    .from(brainPlaybookSteps)
    .where(and(
      eq(brainPlaybookSteps.playbookId, id),
      eq(brainPlaybookSteps.clientId, clientId),
    ))
    .orderBy(asc(brainPlaybookSteps.sortOrder), asc(brainPlaybookSteps.id));

  return { playbook, steps };
}

// ─── create ──────────────────────────────────────────────────────────────────

export interface CreatePlaybookInput {
  name: string;
  description?: string | null;
  triggerKind?: BrainPlaybookTriggerKind;
  triggerConfig?: {
    event?: string;
    filters?: Record<string, unknown>;
    cron?: string;
  } | null;
  category?: string | null;
  ownerId?: number | null;
  defaultTopicIds?: number[];
}

export async function createPlaybook(
  clientId: number,
  actorId: number | null,
  input: CreatePlaybookInput,
): Promise<BrainPlaybook> {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new Error('name is required');
  const slug = await uniqueSlugForClient(clientId, name);

  const [created] = await db
    .insert(brainPlaybooks)
    .values({
      clientId,
      name,
      slug,
      description: input.description ?? null,
      status: 'draft',
      triggerKind: input.triggerKind ?? 'manual',
      triggerConfig: input.triggerConfig ?? null,
      category: input.category ?? null,
      ownerId: input.ownerId ?? null,
      defaultTopicIds: input.defaultTopicIds ?? [],
      source: 'manual',
      createdBy: actorId ?? null,
    })
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_playbook.create',
    entityType: 'brain_playbook',
    entityId: created.id,
    metadata: { slug: created.slug, triggerKind: created.triggerKind },
  });

  return created;
}

// ─── update ──────────────────────────────────────────────────────────────────

export interface UpdatePlaybookInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  ownerId?: number | null;
  triggerKind?: BrainPlaybookTriggerKind;
  triggerConfig?: {
    event?: string;
    filters?: Record<string, unknown>;
    cron?: string;
  } | null;
  defaultTopicIds?: number[];
  /** If present, throws. Status changes go through activate/archive. */
  status?: BrainPlaybookStatus;
}

export async function updatePlaybook(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdatePlaybookInput,
): Promise<BrainPlaybook | null> {
  if (patch.status !== undefined) {
    throw new Error('use activatePlaybook or archivePlaybook to change status');
  }

  const set: Partial<typeof brainPlaybooks.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 200);
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  if (patch.triggerKind !== undefined) set.triggerKind = patch.triggerKind;
  if (patch.triggerConfig !== undefined) set.triggerConfig = patch.triggerConfig;
  if (patch.defaultTopicIds !== undefined) set.defaultTopicIds = patch.defaultTopicIds;

  const [updated] = await db
    .update(brainPlaybooks)
    .set(set)
    .where(and(eq(brainPlaybooks.id, id), eq(brainPlaybooks.clientId, clientId)))
    .returning();

  if (!updated) return null;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_playbook.update',
    entityType: 'brain_playbook',
    entityId: id,
    metadata: { changedFields: Object.keys(patch).filter((k) => k !== 'status') },
  });

  return updated;
}

// ─── activate / archive / delete ─────────────────────────────────────────────

/**
 * Flip status to 'active'. Refuses if the playbook has zero steps (no-op
 * playbooks are meaningless) OR if the step graph fails DAG validation
 * (cycles, missing next-step refs, no entry point). The DAG validator
 * returns errors as strings — we surface them in the thrown Error message
 * so the REST handler can pass them through to the UI.
 */
export async function activatePlaybook(
  clientId: number,
  actorId: number | null,
  id: number,
): Promise<BrainPlaybook | null> {
  const [before] = await db
    .select()
    .from(brainPlaybooks)
    .where(and(eq(brainPlaybooks.id, id), eq(brainPlaybooks.clientId, clientId)))
    .limit(1);
  if (!before) return null;

  // Step-count + DAG sanity gates.
  const stepRows = await db
    .select({ id: brainPlaybookSteps.id })
    .from(brainPlaybookSteps)
    .where(and(
      eq(brainPlaybookSteps.playbookId, id),
      eq(brainPlaybookSteps.clientId, clientId),
    ));
  if (stepRows.length === 0) {
    throw new Error('cannot activate a playbook with zero steps');
  }
  const dag = await validatePlaybookDag(clientId, id);
  if (!dag.valid) {
    throw new Error(`playbook DAG invalid: ${dag.errors.join('; ')}`);
  }

  const [updated] = await db
    .update(brainPlaybooks)
    .set({ status: 'active', updatedAt: new Date() })
    .where(and(eq(brainPlaybooks.id, id), eq(brainPlaybooks.clientId, clientId)))
    .returning();

  if (!updated) return null;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_playbook.activate',
    entityType: 'brain_playbook',
    entityId: id,
    metadata: { from: before.status, stepCount: stepRows.length },
  });

  return updated;
}

/**
 * Flip status to 'archived'. Refuses while active/pending/paused runs exist
 * unless `force=true`. The `force` escape hatch is for support / admin
 * teardown — UI should always confirm before passing it.
 */
export async function archivePlaybook(
  clientId: number,
  actorId: number | null,
  id: number,
  opts: { force?: boolean } = {},
): Promise<BrainPlaybook | null> {
  const [before] = await db
    .select()
    .from(brainPlaybooks)
    .where(and(eq(brainPlaybooks.id, id), eq(brainPlaybooks.clientId, clientId)))
    .limit(1);
  if (!before) return null;

  if (!opts.force) {
    const [activeCount] = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(brainPlaybookRuns)
      .where(and(
        eq(brainPlaybookRuns.playbookId, id),
        eq(brainPlaybookRuns.clientId, clientId),
        inArray(brainPlaybookRuns.status, ['pending', 'active', 'paused']),
      ));
    if (Number(activeCount?.c ?? 0) > 0) {
      throw new Error(`cannot archive playbook with ${Number(activeCount.c)} active run(s); pass force=true to override`);
    }
  }

  const [updated] = await db
    .update(brainPlaybooks)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(brainPlaybooks.id, id), eq(brainPlaybooks.clientId, clientId)))
    .returning();

  if (!updated) return null;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_playbook.archive',
    entityType: 'brain_playbook',
    entityId: id,
    metadata: { from: before.status, forced: opts.force === true },
  });

  return updated;
}

/**
 * Hard-delete a playbook. Refuses if any runs (active OR historical) exist
 * unless `force=true`. Force=true relies on the schema's ON DELETE CASCADE
 * from brain_playbook_runs → brain_playbook_run_steps + brain_playbook_links.
 */
export async function deletePlaybook(
  clientId: number,
  actorId: number | null,
  id: number,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const [before] = await db
    .select({ id: brainPlaybooks.id })
    .from(brainPlaybooks)
    .where(and(eq(brainPlaybooks.id, id), eq(brainPlaybooks.clientId, clientId)))
    .limit(1);
  if (!before) return false;

  if (!opts.force) {
    const [runCount] = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(brainPlaybookRuns)
      .where(and(
        eq(brainPlaybookRuns.playbookId, id),
        eq(brainPlaybookRuns.clientId, clientId),
      ));
    if (Number(runCount?.c ?? 0) > 0) {
      throw new Error(`cannot delete playbook with ${Number(runCount.c)} run(s); pass force=true to cascade`);
    }
  }

  // Audit FIRST so the entity_id is meaningful when the deletion completes.
  await logAudit({
    clientId,
    actorId,
    action: 'brain_playbook.delete',
    entityType: 'brain_playbook',
    entityId: id,
    metadata: { forced: opts.force === true },
  });

  const deleted = await db
    .delete(brainPlaybooks)
    .where(and(eq(brainPlaybooks.id, id), eq(brainPlaybooks.clientId, clientId)))
    .returning({ id: brainPlaybooks.id });

  return deleted.length > 0;
}

// ─── steps: add / update / remove / reorder ─────────────────────────────────

async function assertPlaybookInTenant(clientId: number, playbookId: number): Promise<void> {
  const [row] = await db
    .select({ id: brainPlaybooks.id })
    .from(brainPlaybooks)
    .where(and(eq(brainPlaybooks.id, playbookId), eq(brainPlaybooks.clientId, clientId)))
    .limit(1);
  if (!row) throw new Error('playbook not found in tenant');
}

export interface AddStepInput {
  key: string;
  name: string;
  description?: string | null;
  kind: BrainPlaybookStepKind;
  config?: Record<string, unknown>;
  condition?: BrainPlaybookCondition;
  nextStepKeys?: string[];
  sortOrder?: number;
}

export async function addStep(
  clientId: number,
  actorId: number | null,
  playbookId: number,
  step: AddStepInput,
): Promise<BrainPlaybookStep> {
  await assertPlaybookInTenant(clientId, playbookId);

  const key = step.key.trim().slice(0, 100);
  const name = step.name.trim().slice(0, 200);
  if (!key) throw new Error('step.key is required');
  if (!name) throw new Error('step.name is required');

  // Auto-pick sortOrder if caller didn't supply one — append to the end.
  let sortOrder = step.sortOrder;
  if (sortOrder === undefined) {
    const [max] = await db
      .select({ m: sql<number>`COALESCE(MAX(${brainPlaybookSteps.sortOrder}), -1)::int` })
      .from(brainPlaybookSteps)
      .where(and(
        eq(brainPlaybookSteps.playbookId, playbookId),
        eq(brainPlaybookSteps.clientId, clientId),
      ));
    sortOrder = Number(max?.m ?? -1) + 1;
  }

  const [created] = await db
    .insert(brainPlaybookSteps)
    .values({
      clientId,
      playbookId,
      key,
      name,
      description: step.description ?? null,
      kind: step.kind,
      config: step.config ?? {},
      condition: step.condition ?? null,
      nextStepKeys: step.nextStepKeys ?? [],
      sortOrder,
    })
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_playbook_step.create',
    entityType: 'brain_playbook_step',
    entityId: created.id,
    metadata: { playbookId, key: created.key, kind: created.kind },
  });

  return created;
}

export interface UpdateStepInput {
  key?: string;
  name?: string;
  description?: string | null;
  kind?: BrainPlaybookStepKind;
  config?: Record<string, unknown>;
  condition?: BrainPlaybookCondition;
  nextStepKeys?: string[];
  sortOrder?: number;
}

export async function updateStep(
  clientId: number,
  actorId: number | null,
  stepId: number,
  patch: UpdateStepInput,
): Promise<BrainPlaybookStep | null> {
  const set: Partial<typeof brainPlaybookSteps.$inferInsert> = { updatedAt: new Date() };
  if (patch.key !== undefined) set.key = patch.key.trim().slice(0, 100);
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 200);
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.config !== undefined) set.config = patch.config;
  if (patch.condition !== undefined) set.condition = patch.condition;
  if (patch.nextStepKeys !== undefined) set.nextStepKeys = patch.nextStepKeys;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

  const [updated] = await db
    .update(brainPlaybookSteps)
    .set(set)
    .where(and(eq(brainPlaybookSteps.id, stepId), eq(brainPlaybookSteps.clientId, clientId)))
    .returning();

  if (!updated) return null;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_playbook_step.update',
    entityType: 'brain_playbook_step',
    entityId: stepId,
    metadata: { playbookId: updated.playbookId, changedFields: Object.keys(patch) },
  });

  return updated;
}

/**
 * Remove a step. Refuses if any run-step row references it — schema CASCADE
 * would clean those up on delete, but we want the failure to be explicit so
 * authors don't silently destroy run history. Also walks every other step
 * in the same playbook and drops this step's `key` from their `nextStepKeys`
 * arrays — keeps the DAG free of dangling references.
 */
export async function removeStep(
  clientId: number,
  actorId: number | null,
  stepId: number,
): Promise<boolean> {
  // Fetch the step so we know the playbookId + key for the orphan-cleanup pass.
  const [before] = await db
    .select()
    .from(brainPlaybookSteps)
    .where(and(eq(brainPlaybookSteps.id, stepId), eq(brainPlaybookSteps.clientId, clientId)))
    .limit(1);
  if (!before) return false;

  // Defensive: refuse if any run-step row references this step. The schema
  // CASCADE would obliterate that history; we'd rather make the author do
  // it deliberately (e.g. delete the run first).
  const [runStepCount] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(brainPlaybookRunSteps)
    .where(and(
      eq(brainPlaybookRunSteps.stepId, stepId),
      eq(brainPlaybookRunSteps.clientId, clientId),
    ));
  if (Number(runStepCount?.c ?? 0) > 0) {
    throw new Error(`cannot remove step ${stepId}: ${Number(runStepCount.c)} run-step row(s) reference it`);
  }

  // Clean orphan nextStepKeys references on sibling steps. Pull the siblings
  // in one query, mutate in JS, write back only the ones that actually
  // changed.
  const siblings = await db
    .select({ id: brainPlaybookSteps.id, nextStepKeys: brainPlaybookSteps.nextStepKeys })
    .from(brainPlaybookSteps)
    .where(and(
      eq(brainPlaybookSteps.playbookId, before.playbookId),
      eq(brainPlaybookSteps.clientId, clientId),
    ));

  for (const sib of siblings) {
    if (sib.id === stepId) continue;
    const next = (sib.nextStepKeys ?? []).filter((k) => k !== before.key);
    if (next.length !== (sib.nextStepKeys ?? []).length) {
      await db
        .update(brainPlaybookSteps)
        .set({ nextStepKeys: next, updatedAt: new Date() })
        .where(and(
          eq(brainPlaybookSteps.id, sib.id),
          eq(brainPlaybookSteps.clientId, clientId),
        ));
    }
  }

  const deleted = await db
    .delete(brainPlaybookSteps)
    .where(and(eq(brainPlaybookSteps.id, stepId), eq(brainPlaybookSteps.clientId, clientId)))
    .returning({ id: brainPlaybookSteps.id });

  if (deleted.length === 0) return false;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_playbook_step.delete',
    entityType: 'brain_playbook_step',
    entityId: stepId,
    metadata: { playbookId: before.playbookId, key: before.key },
  });

  return true;
}

/**
 * Atomically re-sortOrder the given step ids. All ids must belong to the
 * same playbook + tenant; otherwise the whole batch is rejected. Steps not
 * present in `orderedStepIds` are left untouched (so partial-list reorders
 * work — they just won't be renumbered).
 */
export async function reorderSteps(
  clientId: number,
  actorId: number | null,
  playbookId: number,
  orderedStepIds: number[],
): Promise<BrainPlaybookStep[]> {
  if (orderedStepIds.length === 0) {
    throw new Error('orderedStepIds is empty');
  }
  // Dedupe — repeating the same id is almost certainly a UI bug; refuse.
  const seen = new Set<number>();
  for (const id of orderedStepIds) {
    if (seen.has(id)) throw new Error(`duplicate step id in orderedStepIds: ${id}`);
    seen.add(id);
  }

  return db.transaction(async (tx) => {
    // Confirm every id belongs to the target playbook + tenant.
    const owned = await tx
      .select({ id: brainPlaybookSteps.id })
      .from(brainPlaybookSteps)
      .where(and(
        eq(brainPlaybookSteps.playbookId, playbookId),
        eq(brainPlaybookSteps.clientId, clientId),
        inArray(brainPlaybookSteps.id, orderedStepIds),
      ));
    if (owned.length !== orderedStepIds.length) {
      throw new Error('one or more step ids do not belong to this playbook + tenant');
    }

    // Apply new sortOrder values 0..N-1 in order.
    const now = new Date();
    for (let i = 0; i < orderedStepIds.length; i++) {
      await tx
        .update(brainPlaybookSteps)
        .set({ sortOrder: i, updatedAt: now })
        .where(and(
          eq(brainPlaybookSteps.id, orderedStepIds[i]),
          eq(brainPlaybookSteps.clientId, clientId),
        ));
    }

    const refreshed = await tx
      .select()
      .from(brainPlaybookSteps)
      .where(and(
        eq(brainPlaybookSteps.playbookId, playbookId),
        eq(brainPlaybookSteps.clientId, clientId),
      ))
      .orderBy(asc(brainPlaybookSteps.sortOrder), asc(brainPlaybookSteps.id));

    // Pattern A: audit AFTER the tx commits. We return from within the tx
    // here and write audit after — but to keep this function single-await,
    // we attach the audit to the post-tx phase below.
    return refreshed;
  }).then(async (refreshed) => {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_playbook_step.reorder',
      entityType: 'brain_playbook',
      entityId: playbookId,
      metadata: { count: orderedStepIds.length },
    });
    return refreshed;
  });
}

// ─── DAG validator ──────────────────────────────────────────────────────────

export interface DagValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate the step graph for a playbook:
 *   (a) every nextStepKey resolves to an actual step in this playbook
 *   (b) at least one step is an "entry" — i.e. no other step's nextStepKeys
 *       includes it (the run engine starts from these)
 *   (c) no cycles — DFS detection
 *
 * Returns a list of human-readable errors when invalid. Empty array when
 * valid. Called by activatePlaybook; also exposed directly so the editor
 * can pre-validate before nudging the user toward activation.
 */
export async function validatePlaybookDag(
  clientId: number,
  playbookId: number,
): Promise<DagValidationResult> {
  const steps = await db
    .select({
      id: brainPlaybookSteps.id,
      key: brainPlaybookSteps.key,
      nextStepKeys: brainPlaybookSteps.nextStepKeys,
    })
    .from(brainPlaybookSteps)
    .where(and(
      eq(brainPlaybookSteps.playbookId, playbookId),
      eq(brainPlaybookSteps.clientId, clientId),
    ));

  const errors: string[] = [];

  if (steps.length === 0) {
    return { valid: false, errors: ['playbook has no steps'] };
  }

  const byKey = new Map<string, { id: number; nextStepKeys: string[] }>();
  for (const s of steps) {
    byKey.set(s.key, { id: s.id, nextStepKeys: s.nextStepKeys ?? [] });
  }

  // (a) Every nextStepKey resolves.
  const incomingKeys = new Set<string>();
  for (const s of steps) {
    for (const k of s.nextStepKeys ?? []) {
      if (!byKey.has(k)) {
        errors.push(`step "${s.key}" references missing nextStepKey "${k}"`);
      } else {
        incomingKeys.add(k);
      }
    }
  }

  // (b) At least one entry point — i.e. a step with no incoming edges.
  const entryKeys = steps.map((s) => s.key).filter((k) => !incomingKeys.has(k));
  if (entryKeys.length === 0) {
    errors.push('no entry step: every step is targeted by another step\'s nextStepKeys (cycle or no root)');
  }

  // (c) Cycle detection — DFS with white/gray/black coloring. We DFS from
  //     every node to cover disconnected components and from-target-only
  //     subgraphs. A 'gray' (currently-in-stack) hit during DFS is a back
  //     edge — i.e. a cycle.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const k of byKey.keys()) color.set(k, WHITE);

  function visit(k: string, path: string[]): string | null {
    color.set(k, GRAY);
    const node = byKey.get(k);
    if (!node) return null;
    for (const next of node.nextStepKeys) {
      const c = color.get(next);
      if (c === undefined) continue; // missing-ref already reported above
      if (c === GRAY) {
        const cycleStart = path.indexOf(next);
        const cyclePath = cycleStart >= 0
          ? [...path.slice(cycleStart), next].join(' -> ')
          : `${k} -> ${next}`;
        return cyclePath;
      }
      if (c === WHITE) {
        const cycle = visit(next, [...path, next]);
        if (cycle) return cycle;
      }
    }
    color.set(k, BLACK);
    return null;
  }

  for (const k of byKey.keys()) {
    if (color.get(k) === WHITE) {
      const cycle = visit(k, [k]);
      if (cycle) {
        errors.push(`cycle detected: ${cycle}`);
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
