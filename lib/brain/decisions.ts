/**
 * Brain decisions — CRUD + supersede + audit.
 *
 * Phase 1 of the brain restructure (see .planning/brain-restructure/PLAN.md).
 * Decisions are immutable-ish: rationale / decision / reversibility never
 * mutate in place. To "change" a decision, call {@link supersedeDecision},
 * which creates a successor row and links the old one via
 * `supersededByDecisionId` while flipping its status to `'superseded'`.
 *
 * Mutations write a `brain_audit_logs` row via {@link logAudit} so the full
 * decision lifecycle is reconstructable.
 */
import { db } from '@/lib/db';
import {
  brainDecisions,
  type BrainDecisionReversibility,
  type BrainDecisionStatus,
  type BrainReviewItemDecisionPayload,
} from '@/lib/db/schema';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainDecision = typeof brainDecisions.$inferSelect;

// ─── Audit action names (registered for grep-ability) ─────────────────────
// brain_decision.create
// brain_decision.update
// brain_decision.supersede
// brain_decision.reject

// ─── List ─────────────────────────────────────────────────────────────────

export interface ListDecisionsOpts {
  status?: BrainDecisionStatus | BrainDecisionStatus[];
  reversibility?: BrainDecisionReversibility;
  decisionMakerId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  /** When true, only return rows whose status === 'superseded'. */
  supersededOnly?: boolean;
  /**
   * TODO(wave-2b+): when topics lib is wired, JOIN brain_entity_topics on
   * (entity_type='decision', entity_id=brain_decisions.id, topic_id=topicId)
   * to filter by topic. Skipped here so this branch does not couple to topics.
   */
  topicId?: number;
  limit?: number;
  offset?: number;
}

export async function listDecisions(
  clientId: number,
  opts: ListDecisionsOpts = {},
): Promise<BrainDecision[]> {
  const conds = [eq(brainDecisions.clientId, clientId)];
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      // Drizzle has no helper for varchar IN that respects the $type<>
      // narrowing; for a small enum we OR the single-value cases inline
      // (callers today always pass a single status — multi-status filtering
      // is a Phase 4 dashboard need).
      if (opts.status.length === 1) {
        conds.push(eq(brainDecisions.status, opts.status[0]));
      }
      // For multiple, fall through (no-op) like listReviewItems does.
    } else {
      conds.push(eq(brainDecisions.status, opts.status));
    }
  }
  if (opts.reversibility) conds.push(eq(brainDecisions.reversibility, opts.reversibility));
  if (opts.decisionMakerId !== undefined) {
    conds.push(eq(brainDecisions.decisionMakerId, opts.decisionMakerId));
  }
  if (opts.dateFrom) conds.push(gte(brainDecisions.decidedAt, opts.dateFrom));
  if (opts.dateTo) conds.push(lte(brainDecisions.decidedAt, opts.dateTo));
  if (opts.supersededOnly) conds.push(eq(brainDecisions.status, 'superseded'));
  // opts.topicId — see TODO above.

  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const offset = Math.max(0, opts.offset ?? 0);

  return db
    .select()
    .from(brainDecisions)
    .where(and(...conds))
    .orderBy(desc(brainDecisions.decidedAt), desc(brainDecisions.id))
    .limit(limit)
    .offset(offset);
}

// ─── Get + supersedes chain ───────────────────────────────────────────────

export interface DecisionChainNode {
  id: number;
  title: string;
  decidedAt: Date;
  status: BrainDecisionStatus;
}

export interface DecisionWithChain {
  decision: BrainDecision;
  /**
   * Decisions this one replaces, ordered oldest → newest. The immediate
   * predecessor (the row that points to `decision.id` via
   * `supersededByDecisionId`) sits at the end of the array.
   */
  ancestors: DecisionChainNode[];
  /**
   * Decisions that replaced this one, ordered newest-first along the chain
   * (each entry is the row pointed to by the previous entry's
   * `supersededByDecisionId`). Length 0 when this decision has not been
   * superseded.
   */
  descendants: DecisionChainNode[];
}

const MAX_CHAIN_HOPS = 50;

export async function getDecisionById(
  clientId: number,
  id: number,
): Promise<DecisionWithChain | null> {
  const [row] = await db
    .select()
    .from(brainDecisions)
    .where(and(eq(brainDecisions.id, id), eq(brainDecisions.clientId, clientId)))
    .limit(1);
  if (!row) return null;

  // Descendants: walk supersededByDecisionId forward.
  const descendants: DecisionChainNode[] = [];
  const seenForward = new Set<number>([row.id]);
  let cursor: BrainDecision | undefined = row;
  for (let hop = 0; hop < MAX_CHAIN_HOPS; hop++) {
    const nextId: number | null = cursor?.supersededByDecisionId ?? null;
    if (!nextId) break;
    if (seenForward.has(nextId)) break; // cycle guard
    seenForward.add(nextId);
    const nextRows: BrainDecision[] = await db
      .select()
      .from(brainDecisions)
      .where(and(eq(brainDecisions.id, nextId), eq(brainDecisions.clientId, clientId)))
      .limit(1);
    const next: BrainDecision | undefined = nextRows[0];
    if (!next) break;
    descendants.push({
      id: next.id,
      title: next.title,
      decidedAt: next.decidedAt,
      status: next.status as BrainDecisionStatus,
    });
    cursor = next;
  }

  // Ancestors: walk in reverse via "what row points at me?" — capped at 50.
  const ancestors: DecisionChainNode[] = [];
  const seenBackward = new Set<number>([row.id]);
  let targetId: number = row.id;
  for (let hop = 0; hop < MAX_CHAIN_HOPS; hop++) {
    const [prev] = await db
      .select()
      .from(brainDecisions)
      .where(
        and(
          eq(brainDecisions.clientId, clientId),
          eq(brainDecisions.supersededByDecisionId, targetId),
        ),
      )
      .orderBy(desc(brainDecisions.decidedAt), desc(brainDecisions.id))
      .limit(1);
    if (!prev) break;
    if (seenBackward.has(prev.id)) break; // cycle guard
    seenBackward.add(prev.id);
    ancestors.unshift({
      id: prev.id,
      title: prev.title,
      decidedAt: prev.decidedAt,
      status: prev.status as BrainDecisionStatus,
    });
    targetId = prev.id;
  }

  return { decision: row, ancestors, descendants };
}

// ─── Create ───────────────────────────────────────────────────────────────

export interface DecisionAnchors {
  meetingId?: number | null;
  noteId?: number | null;
  companyId?: number | null;
  dealId?: number | null;
}

export interface CreateDecisionInput {
  title: string;
  context?: string | null;
  decision: string;
  rationale: string;
  alternativesConsidered?: string | null;
  reversibility?: BrainDecisionReversibility;
  decidedAt?: Date | string;
  decisionMakerId?: number | null;
  anchors?: DecisionAnchors;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
}

function normalizeDecidedAt(v: Date | string | undefined): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

export async function createDecision(
  clientId: number,
  actorId: number | null,
  input: CreateDecisionInput,
): Promise<BrainDecision> {
  if (!input.title?.trim()) throw new Error('title is required');
  if (!input.decision?.trim()) throw new Error('decision is required');
  if (!input.rationale?.trim()) throw new Error('rationale is required');

  const anchors = input.anchors ?? {};
  const [created] = await db
    .insert(brainDecisions)
    .values({
      clientId,
      title: input.title.trim().slice(0, 255),
      context: input.context ?? null,
      decision: input.decision,
      rationale: input.rationale,
      alternativesConsidered: input.alternativesConsidered ?? null,
      reversibility: input.reversibility ?? 'two_way',
      status: 'accepted',
      decisionMakerId: input.decisionMakerId ?? actorId ?? null,
      decidedAt: normalizeDecidedAt(input.decidedAt),
      meetingId: anchors.meetingId ?? null,
      noteId: anchors.noteId ?? null,
      companyId: anchors.companyId ?? null,
      dealId: anchors.dealId ?? null,
      source: 'manual',
      confidentialityLevel: input.confidentialityLevel ?? 'standard',
      createdBy: actorId ?? null,
    })
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_decision.create',
    entityType: 'brain_decision',
    entityId: created.id,
    metadata: {
      source: 'manual',
      reversibility: created.reversibility,
      hasMeeting: Boolean(anchors.meetingId),
      hasNote: Boolean(anchors.noteId),
      hasCompany: Boolean(anchors.companyId),
      hasDeal: Boolean(anchors.dealId),
    },
  });

  return created;
}

// ─── Create from a review-item (called by lib/brain/review.ts) ────────────

/**
 * Drizzle `db` or a transaction handle. Mirrors the `DbOrTx` alias in
 * `lib/brain/topics.ts` — TypeScript can't structurally equate
 * `PgTransaction` with `PostgresJsDatabase`, so we degrade to the surface
 * methods we actually use (.insert(), .select(), .update()). Callers in
 * tests can pass a mock that exposes the same shape.
 */
type DbOrTx = Pick<typeof db, 'insert' | 'select' | 'update'>;

interface CreateFromReviewItemArgs {
  /** Source review-item id, written into the row as `reviewItemId`. */
  reviewItemId: number;
  /** Optional meeting anchor inherited from the review-item source. */
  meetingId?: number | null;
  /**
   * Drizzle tx handle so the caller can pull this into the
   * `approveReviewItem` transaction. When omitted, runs against the global
   * `db` connection — useful for direct admin scripts/tests.
   */
  tx?: DbOrTx;
}

/**
 * Insert a `brain_decisions` row whose provenance is an AI review-item.
 * Sets `source='ai_review'`, `reviewItemId=<id>`, and `decisionMakerId=actorId`.
 *
 * NOTE: the audit-log row is intentionally NOT written here when called from
 * within a transaction. The dispatcher in `lib/brain/review.ts` writes a
 * single `review_item.approved` audit row that captures both the proposal
 * and the resulting decision id in metadata — adding a second
 * `brain_decision.create` row inside the same tx would be redundant. When
 * called outside a tx (no `tx` passed), we DO log the create.
 *
 * The transactional dispatcher in `lib/brain/review.ts` is the canonical
 * caller — see the `'decision'` branch of `approveReviewItem`.
 */
export async function createDecisionFromReviewItem(
  clientId: number,
  actorId: number,
  args: CreateFromReviewItemArgs,
  payload: BrainReviewItemDecisionPayload,
): Promise<BrainDecision> {
  if (!payload.title) throw new Error('decision: missing title');
  if (!payload.decision) throw new Error('decision: missing decision');
  if (!payload.rationale) throw new Error('decision: missing rationale');

  const conn = args.tx ?? db;
  const [created] = await conn
    .insert(brainDecisions)
    .values({
      clientId,
      title: payload.title.slice(0, 255),
      context: payload.context ?? null,
      decision: payload.decision,
      rationale: payload.rationale,
      alternativesConsidered: payload.alternativesConsidered ?? null,
      reversibility: payload.reversibility ?? 'two_way',
      status: 'accepted',
      decisionMakerId: actorId,
      decidedAt: payload.decidedAt ? new Date(payload.decidedAt) : new Date(),
      meetingId: args.meetingId ?? null,
      source: 'ai_review',
      reviewItemId: args.reviewItemId,
      createdBy: actorId,
    })
    .returning();

  if (!args.tx) {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_decision.create',
      entityType: 'brain_decision',
      entityId: created.id,
      metadata: { source: 'ai_review', reviewItemId: args.reviewItemId },
    });
  }

  return created;
}

// ─── Update (allowlist) ───────────────────────────────────────────────────

/**
 * Fields that may be mutated in-place on an existing decision. Rationale,
 * decision text, and reversibility are deliberately excluded — to change any
 * of those, the caller must {@link supersedeDecision}.
 *
 * (Status is also excluded: it transitions only via supersede / soft-reject.)
 */
export interface UpdateDecisionInput {
  title?: string;
  context?: string | null;
  decisionMakerId?: number | null;
  anchors?: DecisionAnchors;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
  alternativesConsidered?: string | null;
}

/**
 * Patch a decision in place. Throws if the caller attempts to mutate
 * rationale, decision text, or reversibility — those changes require
 * {@link supersedeDecision}.
 */
export async function updateDecision(
  clientId: number,
  actorId: number | null,
  id: number,
  // Use `unknown` so the caller can pass an untyped request body — we
  // explicitly reject forbidden keys at runtime.
  rawPatch: UpdateDecisionInput & Record<string, unknown>,
): Promise<BrainDecision | null> {
  if (
    'decision' in rawPatch ||
    'rationale' in rawPatch ||
    'reversibility' in rawPatch
  ) {
    throw new Error('use supersedeDecision to change rationale or decision text');
  }

  const [before] = await db
    .select()
    .from(brainDecisions)
    .where(and(eq(brainDecisions.id, id), eq(brainDecisions.clientId, clientId)))
    .limit(1);
  if (!before) return null;

  const patch: Partial<typeof brainDecisions.$inferInsert> = { updatedAt: new Date() };
  const changed: string[] = [];

  if (rawPatch.title !== undefined) {
    patch.title = rawPatch.title.trim().slice(0, 255);
    changed.push('title');
  }
  if (rawPatch.context !== undefined) {
    patch.context = rawPatch.context;
    changed.push('context');
  }
  if (rawPatch.decisionMakerId !== undefined) {
    patch.decisionMakerId = rawPatch.decisionMakerId;
    changed.push('decisionMakerId');
  }
  if (rawPatch.confidentialityLevel !== undefined) {
    patch.confidentialityLevel = rawPatch.confidentialityLevel;
    changed.push('confidentialityLevel');
  }
  if (rawPatch.alternativesConsidered !== undefined) {
    patch.alternativesConsidered = rawPatch.alternativesConsidered;
    changed.push('alternativesConsidered');
  }
  if (rawPatch.anchors) {
    const a = rawPatch.anchors;
    if (a.meetingId !== undefined) {
      patch.meetingId = a.meetingId;
      changed.push('meetingId');
    }
    if (a.noteId !== undefined) {
      patch.noteId = a.noteId;
      changed.push('noteId');
    }
    if (a.companyId !== undefined) {
      patch.companyId = a.companyId;
      changed.push('companyId');
    }
    if (a.dealId !== undefined) {
      patch.dealId = a.dealId;
      changed.push('dealId');
    }
  }

  if (changed.length === 0) return before;

  const [updated] = await db
    .update(brainDecisions)
    .set(patch)
    .where(and(eq(brainDecisions.id, id), eq(brainDecisions.clientId, clientId)))
    .returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_decision.update',
      entityType: 'brain_decision',
      entityId: id,
      metadata: { changedFields: changed },
    });
  }
  return updated ?? null;
}

// ─── Supersede ────────────────────────────────────────────────────────────

export interface SupersedeDecisionInput extends CreateDecisionInput {
  /** Must NOT be set by the caller — the helper wires it itself. */
  supersededByDecisionId?: never;
}

/**
 * Create a successor decision and atomically link the old row to it.
 *
 * Postconditions (single transaction):
 *   - new row exists with the provided input; `source='manual'`,
 *     `status='accepted'`, `decidedAt` defaults to now() if unset
 *   - old row's `supersededByDecisionId = new.id`, `status = 'superseded'`
 *
 * Cycle guard: refuses if the old decision is already superseded (its chain
 * is closed; create a new decision from the head of the chain instead).
 */
export async function supersedeDecision(
  clientId: number,
  actorId: number | null,
  oldId: number,
  input: SupersedeDecisionInput,
): Promise<BrainDecision> {
  if ((input as unknown as Record<string, unknown>).supersededByDecisionId !== undefined) {
    throw new Error('supersededByDecisionId is set automatically; do not pass it');
  }
  if (!input.title?.trim()) throw new Error('title is required');
  if (!input.decision?.trim()) throw new Error('decision is required');
  if (!input.rationale?.trim()) throw new Error('rationale is required');

  const created = await db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(brainDecisions)
      .where(and(eq(brainDecisions.id, oldId), eq(brainDecisions.clientId, clientId)))
      .limit(1);
    if (!old) throw new Error('decision not found');
    if (old.status === 'superseded' || old.supersededByDecisionId !== null) {
      throw new Error('decision is already superseded');
    }

    const anchors = input.anchors ?? {};
    const [row] = await tx
      .insert(brainDecisions)
      .values({
        clientId,
        title: input.title.trim().slice(0, 255),
        context: input.context ?? null,
        decision: input.decision,
        rationale: input.rationale,
        alternativesConsidered: input.alternativesConsidered ?? null,
        reversibility: input.reversibility ?? old.reversibility,
        status: 'accepted',
        decisionMakerId: input.decisionMakerId ?? actorId ?? null,
        decidedAt: normalizeDecidedAt(input.decidedAt),
        meetingId: anchors.meetingId ?? null,
        noteId: anchors.noteId ?? null,
        companyId: anchors.companyId ?? null,
        dealId: anchors.dealId ?? null,
        source: 'manual',
        confidentialityLevel:
          input.confidentialityLevel ??
          (old.confidentialityLevel as 'standard' | 'restricted' | 'confidential'),
        createdBy: actorId ?? null,
      })
      .returning();

    await tx
      .update(brainDecisions)
      .set({
        supersededByDecisionId: row.id,
        status: 'superseded',
        updatedAt: new Date(),
      })
      .where(and(eq(brainDecisions.id, oldId), eq(brainDecisions.clientId, clientId)));

    return row;
  });

  // Audit log written outside the transaction so a slow audit insert can't
  // hold the row lock on brain_decisions. The supersede is durable by the
  // time we get here.
  await logAudit({
    clientId,
    actorId,
    action: 'brain_decision.supersede',
    entityType: 'brain_decision',
    entityId: oldId,
    metadata: { newDecisionId: created.id },
  });

  return created;
}

// ─── Soft reject ──────────────────────────────────────────────────────────

/**
 * Soft-reject a decision — flips its status to `'rejected'`. No row is ever
 * deleted (decisions are immutable history; rejection is a status transition).
 * Idempotent: re-rejecting an already-rejected row is a no-op + returns it.
 */
export async function softRejectDecision(
  clientId: number,
  actorId: number | null,
  id: number,
  reason?: string,
): Promise<BrainDecision | null> {
  const [before] = await db
    .select()
    .from(brainDecisions)
    .where(and(eq(brainDecisions.id, id), eq(brainDecisions.clientId, clientId)))
    .limit(1);
  if (!before) return null;
  if (before.status === 'rejected') return before;

  const [updated] = await db
    .update(brainDecisions)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(and(eq(brainDecisions.id, id), eq(brainDecisions.clientId, clientId)))
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_decision.reject',
    entityType: 'brain_decision',
    entityId: id,
    metadata: { reason: reason ?? null, previousStatus: before.status },
  });
  return updated ?? null;
}

// ─── Helpers used by callers (e.g. for tenancy-scoped existence check) ────

/** Cheap existence check used by REST handlers before deriving a 404. */
export async function decisionExists(clientId: number, id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: brainDecisions.id })
    .from(brainDecisions)
    .where(and(eq(brainDecisions.id, id), eq(brainDecisions.clientId, clientId)))
    .limit(1);
  return Boolean(row);
}

