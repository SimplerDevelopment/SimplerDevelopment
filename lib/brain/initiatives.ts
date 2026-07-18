/**
 * Company Brain — initiatives backend.
 *
 * Initiatives are the multi-quarter umbrella every other brain entity hangs
 * from: goals, tasks, decisions, notes, meetings, topics, and CRM deals /
 * companies. Internal — NOT a CRM deal (those are external/revenue).
 *
 * Mutations are audit-logged. `closeInitiative` is atomic with the
 * lessons-learned brain_note (Pattern B — txAudit), because the two writes
 * are a single user intent. Every other mutation path uses Pattern A
 * (audit AFTER the tx commits) because lib/db is pinned to max:1 and a
 * second writer inside a transaction would deadlock against logAudit().
 *
 * Status transitions are intentionally narrow:
 *   - createInitiative seeds 'planned' (or whatever caller passed)
 *   - updateInitiative refuses status changes
 *   - closeInitiative is the only path to 'completed' / 'cancelled'
 *   - reopenInitiative is the only path back to 'active'
 *   - the REST DELETE handler is a soft-cancel — it routes through
 *     closeInitiative with outcome='cancelled', reason='deleted'
 *
 * brain_initiative_links is polymorphic: (entityType, entityId) with no FK.
 * App-layer resolves each link by type. This lets the table coexist with
 * whichever of brain_decisions / brain_topics has shipped — the linkable
 * entity types are unconditionally accepted, but resolution joins skip the
 * unknown ones gracefully.
 */
import { db } from '@/lib/db';
import {
  brainInitiatives,
  brainGoals,
  brainInitiativeLinks,
  brainNotes,
  brainAuditLogs,
  brainTasks,
  brainMeetings,
  crmDeals,
  crmCompanies,
  brainPeople,
  brainOrgUnits,
  brainGlossaryTerms,
  type BrainInitiativeStatus,
  type BrainInitiativePriority,
  type BrainInitiativeLinkType,
} from '@/lib/db/schema';
import { and, asc, desc, eq, sql, inArray } from 'drizzle-orm';
import { logAudit } from './audit';
import { revalidateBrainDashboard } from './dashboard';
import { slugify } from '@/lib/publishing/slug';

export type BrainInitiative = typeof brainInitiatives.$inferSelect;
export type BrainGoal = typeof brainGoals.$inferSelect;
export type BrainInitiativeLink = typeof brainInitiativeLinks.$inferSelect;
export type { BrainInitiativeStatus, BrainInitiativePriority, BrainInitiativeLinkType };

// ─── slug ───────────────────────────────────────────────────────────────────

/**
 * Slugify an initiative name: lowercase, collapse non-alphanumeric to '-',
 * trim leading/trailing dashes, cap at 140 chars (leaves headroom under the
 * 150-char column for a numeric collision suffix).
 */
export function slugifyInitiativeName(name: string): string {
  return slugify(name, 140) || 'initiative';
}

/**
 * Choose a slug for `name` that doesn't collide with an existing initiative
 * for this client. On collision, suffix '-2', '-3', … until a free slot.
 * Cheap-but-safe: one query per probe; in practice 1 query suffices.
 */
async function uniqueSlugForClient(clientId: number, name: string): Promise<string> {
  const base = slugifyInitiativeName(name);
  // Pull every slug that starts with the base so we can pick the lowest free
  // suffix without a tight loop of round-trips.
  const taken = await db
    .select({ slug: brainInitiatives.slug })
    .from(brainInitiatives)
    .where(and(
      eq(brainInitiatives.clientId, clientId),
      sql`${brainInitiatives.slug} = ${base} OR ${brainInitiatives.slug} LIKE ${base + '-%'}`,
    ));
  const takenSet = new Set(taken.map((r) => r.slug));
  if (!takenSet.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`;
    if (!takenSet.has(candidate)) return candidate;
  }
  // Pathological: 10k slugs sharing a base. Use a timestamp tail.
  return `${base}-${Date.now()}`;
}

// ─── list ───────────────────────────────────────────────────────────────────

export interface ListInitiativesOpts {
  status?: BrainInitiativeStatus | BrainInitiativeStatus[];
  ownerId?: number;
  priority?: BrainInitiativePriority | BrainInitiativePriority[];
  /** When true, only return initiatives that have ≥1 brain_goals row whose status is not 'achieved' / 'missed'. */
  hasOpenGoals?: boolean;
  /** Filter to initiatives whose targetDate is < this date. */
  targetDateBefore?: Date;
  limit?: number;
  offset?: number;
}

export interface InitiativeListRow extends BrainInitiative {
  goalCount: number;
}

export async function listInitiatives(
  clientId: number,
  opts: ListInitiativesOpts = {},
): Promise<InitiativeListRow[]> {
  const conds = [eq(brainInitiatives.clientId, clientId)];

  if (opts.status !== undefined) {
    const list = Array.isArray(opts.status) ? opts.status : [opts.status];
    if (list.length === 1) conds.push(eq(brainInitiatives.status, list[0]));
    else if (list.length > 1) conds.push(inArray(brainInitiatives.status, list));
  }
  if (opts.ownerId !== undefined) {
    conds.push(eq(brainInitiatives.ownerId, opts.ownerId));
  }
  if (opts.priority !== undefined) {
    const list = Array.isArray(opts.priority) ? opts.priority : [opts.priority];
    if (list.length === 1) conds.push(eq(brainInitiatives.priority, list[0]));
    else if (list.length > 1) conds.push(inArray(brainInitiatives.priority, list));
  }
  if (opts.targetDateBefore !== undefined) {
    conds.push(sql`${brainInitiatives.targetDate} IS NOT NULL AND ${brainInitiatives.targetDate} < ${opts.targetDateBefore}`);
  }
  if (opts.hasOpenGoals) {
    // Correlated subquery — MUST hard-code the outer table name; using
    // ${brainInitiatives.id} would emit `id` unqualified and silently match
    // the inner table, returning every row. (Project memory:
    // feedback_drizzle_correlated_subqueries.md)
    conds.push(sql`EXISTS (
      SELECT 1 FROM brain_goals
      WHERE brain_goals.initiative_id = brain_initiatives.id
        AND brain_goals.client_id = ${clientId}
        AND brain_goals.status NOT IN ('achieved', 'missed')
    )`);
  }

  // Priority ranking — varchar in DB, but we want critical > high > medium > low.
  const priorityRank = sql<number>`CASE ${brainInitiatives.priority}
    WHEN 'critical' THEN 4
    WHEN 'high'     THEN 3
    WHEN 'medium'   THEN 2
    WHEN 'low'      THEN 1
    ELSE 0
  END`;

  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 100)) : 50;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;

  // goalCount via correlated subquery — same outer-ref pitfall as hasOpenGoals.
  const rows = await db
    .select({
      id: brainInitiatives.id,
      clientId: brainInitiatives.clientId,
      name: brainInitiatives.name,
      slug: brainInitiatives.slug,
      description: brainInitiatives.description,
      status: brainInitiatives.status,
      priority: brainInitiatives.priority,
      ownerId: brainInitiatives.ownerId,
      sponsorId: brainInitiatives.sponsorId,
      startDate: brainInitiatives.startDate,
      targetDate: brainInitiatives.targetDate,
      closedAt: brainInitiatives.closedAt,
      closeReason: brainInitiatives.closeReason,
      lessonsLearned: brainInitiatives.lessonsLearned,
      confidentialityLevel: brainInitiatives.confidentialityLevel,
      createdBy: brainInitiatives.createdBy,
      createdAt: brainInitiatives.createdAt,
      updatedAt: brainInitiatives.updatedAt,
      goalCount: sql<number>`(
        SELECT COUNT(*)::int FROM brain_goals
        WHERE brain_goals.initiative_id = brain_initiatives.id
          AND brain_goals.client_id = ${clientId}
      )`.as('goal_count'),
    })
    .from(brainInitiatives)
    .where(and(...conds))
    .orderBy(
      desc(priorityRank),
      sql`${brainInitiatives.targetDate} ASC NULLS LAST`,
      desc(brainInitiatives.createdAt),
    )
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({ ...r, goalCount: Number(r.goalCount ?? 0) }));
}

// ─── get (single) ────────────────────────────────────────────────────────────

export interface GetInitiativeOpts {
  includeGoals?: boolean;
  includeLinks?: boolean;
}

export interface InitiativeWithDetails {
  initiative: BrainInitiative;
  goals?: BrainGoal[];
  links?: {
    byType: Record<string, number>;
    items?: Array<{
      entityType: BrainInitiativeLinkType;
      entityId: number;
      title: string | null;
      pinned: boolean;
      note: string | null;
    }>;
  };
}

export async function getInitiativeById(
  clientId: number,
  id: number,
  opts: GetInitiativeOpts = {},
): Promise<InitiativeWithDetails | null> {
  const [initiative] = await db
    .select()
    .from(brainInitiatives)
    .where(and(eq(brainInitiatives.id, id), eq(brainInitiatives.clientId, clientId)))
    .limit(1);
  if (!initiative) return null;

  const out: InitiativeWithDetails = { initiative };

  if (opts.includeGoals) {
    out.goals = await db
      .select()
      .from(brainGoals)
      .where(and(eq(brainGoals.initiativeId, id), eq(brainGoals.clientId, clientId)))
      .orderBy(asc(brainGoals.sortOrder), asc(brainGoals.createdAt));
  }

  if (opts.includeLinks) {
    const items = await listInitiativeLinks(clientId, id);
    const byType: Record<string, number> = {};
    for (const it of items) byType[it.entityType] = (byType[it.entityType] ?? 0) + 1;
    out.links = { byType, items };
  }

  return out;
}

// ─── create ──────────────────────────────────────────────────────────────────

export interface CreateInitiativeInput {
  name: string;
  description?: string | null;
  status?: BrainInitiativeStatus;
  priority?: BrainInitiativePriority;
  ownerId?: number | null;
  sponsorId?: number | null;
  startDate?: Date | null;
  targetDate?: Date | null;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
}

export async function createInitiative(
  clientId: number,
  actorId: number | null,
  input: CreateInitiativeInput,
): Promise<BrainInitiative> {
  const name = input.name.trim().slice(0, 255);
  if (!name) throw new Error('name is required');
  const slug = await uniqueSlugForClient(clientId, name);

  const [created] = await db
    .insert(brainInitiatives)
    .values({
      clientId,
      name,
      slug,
      description: input.description ?? null,
      status: input.status ?? 'planned',
      priority: input.priority ?? 'medium',
      ownerId: input.ownerId ?? null,
      sponsorId: input.sponsorId ?? null,
      startDate: input.startDate ?? null,
      targetDate: input.targetDate ?? null,
      confidentialityLevel: input.confidentialityLevel ?? 'standard',
      createdBy: actorId ?? null,
    })
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_initiative.create',
    entityType: 'brain_initiative',
    entityId: created.id,
    metadata: { slug: created.slug, status: created.status },
  });

  // initiativesActive count tile.
  if (created.status === 'active') revalidateBrainDashboard(clientId);
  return created;
}

// ─── update ──────────────────────────────────────────────────────────────────

export interface UpdateInitiativeInput {
  name?: string;
  description?: string | null;
  priority?: BrainInitiativePriority;
  ownerId?: number | null;
  sponsorId?: number | null;
  startDate?: Date | null;
  targetDate?: Date | null;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
  /** If present, throws. Status changes go through closeInitiative / reopenInitiative. */
  status?: BrainInitiativeStatus;
}

export async function updateInitiative(
  clientId: number,
  actorId: number | null,
  id: number,
  patch: UpdateInitiativeInput,
): Promise<BrainInitiative | null> {
  if (patch.status !== undefined) {
    throw new Error('use closeInitiative or reopenInitiative to change status');
  }

  const set: Partial<typeof brainInitiatives.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 255);
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  if (patch.sponsorId !== undefined) set.sponsorId = patch.sponsorId;
  if (patch.startDate !== undefined) set.startDate = patch.startDate;
  if (patch.targetDate !== undefined) set.targetDate = patch.targetDate;
  if (patch.confidentialityLevel !== undefined) set.confidentialityLevel = patch.confidentialityLevel;

  const [updated] = await db
    .update(brainInitiatives)
    .set(set)
    .where(and(eq(brainInitiatives.id, id), eq(brainInitiatives.clientId, clientId)))
    .returning();

  if (!updated) return null;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_initiative.update',
    entityType: 'brain_initiative',
    entityId: id,
    metadata: { changedFields: Object.keys(patch).filter((k) => k !== 'status') },
  });

  return updated;
}

// ─── close ───────────────────────────────────────────────────────────────────

export interface CloseInitiativeArgs {
  outcome: 'completed' | 'cancelled';
  reason?: string;
  lessonsLearned?: string;
}

export interface CloseInitiativeResult {
  initiative: BrainInitiative;
  lessonsLearnedNoteId: number | null;
}

/**
 * Close an initiative — terminal status transition. Atomic with the
 * lessons-learned brain_note (when provided) and the back-link row. Uses
 * Pattern B (txAudit) — both writes share one connection and one commit.
 *
 * Requires at least one of `reason` / `lessonsLearned`. The note is only
 * created when `lessonsLearned` is non-empty (a `reason` alone is captured
 * inline in the `close_reason` column, no need for a note).
 */
export async function closeInitiative(
  clientId: number,
  actorId: number | null,
  id: number,
  args: CloseInitiativeArgs,
): Promise<CloseInitiativeResult | null> {
  if (args.outcome !== 'completed' && args.outcome !== 'cancelled') {
    throw new Error('outcome must be "completed" or "cancelled"');
  }
  const reasonTrim = args.reason?.trim() ?? '';
  const lessonsTrim = args.lessonsLearned?.trim() ?? '';
  if (!reasonTrim && !lessonsTrim) {
    throw new Error('closeInitiative requires either reason or lessonsLearned');
  }

  const result = await db.transaction(async (tx) => {
    // 1. Lock + verify ownership.
    const [before] = await tx
      .select()
      .from(brainInitiatives)
      .where(and(eq(brainInitiatives.id, id), eq(brainInitiatives.clientId, clientId)))
      .limit(1);
    if (!before) return null;

    // 2. Flip status. Idempotent if already closed — still re-stamp closedAt
    //    so the caller knows their close went through.
    const now = new Date();
    const [updated] = await tx
      .update(brainInitiatives)
      .set({
        status: args.outcome,
        closedAt: now,
        closeReason: reasonTrim ? reasonTrim : before.closeReason,
        lessonsLearned: lessonsTrim ? lessonsTrim : before.lessonsLearned,
        updatedAt: now,
      })
      .where(and(eq(brainInitiatives.id, id), eq(brainInitiatives.clientId, clientId)))
      .returning();

    let noteId: number | null = null;
    if (lessonsTrim) {
      // 3. Auto-create a brain_note with the lessons text. We do this inline
      //    (not via lib/brain/notes.createNote) because that helper opens its
      //    own DB ops outside the tx — and we need the note creation to be
      //    atomic with the status change. Wikilink extraction is skipped on
      //    the audit path; the daily reindex picks it up if needed.
      const [note] = await tx
        .insert(brainNotes)
        .values({
          clientId,
          title: `Initiative closed: ${before.name}`.slice(0, 255),
          body: lessonsTrim.slice(0, 50_000),
          tags: ['initiative-close', args.outcome],
          source: 'manual',
          createdBy: actorId,
        })
        .returning({ id: brainNotes.id });
      noteId = note.id;

      // 4. Back-link the note to the initiative so the detail page can
      //    surface it next to the close stamp.
      await tx
        .insert(brainInitiativeLinks)
        .values({
          clientId,
          initiativeId: id,
          entityType: 'note',
          entityId: noteId,
          pinned: true,
          note: 'Lessons learned at close',
          createdBy: actorId,
        })
        .onConflictDoNothing();
    }

    // 5. Pattern B — write audit via the same held connection. Doing this
    //    inside the tx is the whole point of Pattern B (deadlock-safe because
    //    we never call out to logAudit() which would grab a fresh connection).
    await tx.insert(brainAuditLogs).values({
      clientId,
      actorId,
      action: 'brain_initiative.close',
      entityType: 'brain_initiative',
      entityId: id,
      metadata: {
        outcome: args.outcome,
        hasReason: reasonTrim.length > 0,
        hasLessons: lessonsTrim.length > 0,
        lessonsLearnedNoteId: noteId,
      },
    });

    return { initiative: updated, lessonsLearnedNoteId: noteId };
  });
  // closeInitiative always flips status away from 'active' (or stays in a
  // terminal state) — either way the initiativesActive tile may shift.
  if (result) revalidateBrainDashboard(clientId);
  return result;
}

// ─── reopen ──────────────────────────────────────────────────────────────────

export async function reopenInitiative(
  clientId: number,
  actorId: number | null,
  id: number,
): Promise<BrainInitiative | null> {
  const [before] = await db
    .select()
    .from(brainInitiatives)
    .where(and(eq(brainInitiatives.id, id), eq(brainInitiatives.clientId, clientId)))
    .limit(1);
  if (!before) return null;
  if (before.status !== 'completed' && before.status !== 'cancelled') {
    throw new Error(`cannot reopen from non-terminal status: ${before.status}`);
  }

  const [updated] = await db
    .update(brainInitiatives)
    .set({
      status: 'active',
      closedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(brainInitiatives.id, id), eq(brainInitiatives.clientId, clientId)))
    .returning();

  await logAudit({
    clientId,
    actorId,
    action: 'brain_initiative.reopen',
    entityType: 'brain_initiative',
    entityId: id,
    metadata: { from: before.status },
  });

  if (updated) revalidateBrainDashboard(clientId);
  return updated ?? null;
}

// ─── links ───────────────────────────────────────────────────────────────────

const LINKABLE_TYPES: BrainInitiativeLinkType[] = [
  'task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company',
  'person', 'org_unit', 'glossary_term',
];
export function isLinkableEntityType(s: string): s is BrainInitiativeLinkType {
  return (LINKABLE_TYPES as readonly string[]).includes(s);
}

export interface LinkEntityArgs {
  initiativeId: number;
  entityType: BrainInitiativeLinkType;
  entityId: number;
  note?: string | null;
  pinned?: boolean;
}

/**
 * Link an entity to an initiative. ON CONFLICT DO NOTHING so the same
 * (initiative, entityType, entityId) triple can be reposted idempotently;
 * the caller learns whether anything happened from `alreadyLinked`.
 */
export async function linkEntity(
  clientId: number,
  actorId: number | null,
  args: LinkEntityArgs,
): Promise<{ linkId: number | null; alreadyLinked: boolean }> {
  if (!isLinkableEntityType(args.entityType)) {
    throw new Error(`invalid entityType: ${args.entityType}`);
  }
  // Verify the initiative belongs to this tenant before we write.
  const [owner] = await db
    .select({ id: brainInitiatives.id })
    .from(brainInitiatives)
    .where(and(
      eq(brainInitiatives.id, args.initiativeId),
      eq(brainInitiatives.clientId, clientId),
    ))
    .limit(1);
  if (!owner) throw new Error('initiative not found');

  const inserted = await db
    .insert(brainInitiativeLinks)
    .values({
      clientId,
      initiativeId: args.initiativeId,
      entityType: args.entityType,
      entityId: args.entityId,
      pinned: args.pinned ?? false,
      note: args.note ?? null,
      createdBy: actorId,
    })
    .onConflictDoNothing()
    .returning({ id: brainInitiativeLinks.id });

  if (inserted.length === 0) {
    return { linkId: null, alreadyLinked: true };
  }

  await logAudit({
    clientId,
    actorId,
    action: 'brain_initiative.link',
    entityType: 'brain_initiative',
    entityId: args.initiativeId,
    metadata: {
      entityType: args.entityType,
      entityId: args.entityId,
      pinned: args.pinned ?? false,
    },
  });

  return { linkId: inserted[0].id, alreadyLinked: false };
}

export async function unlinkEntity(
  clientId: number,
  actorId: number | null,
  args: { initiativeId: number; entityType: BrainInitiativeLinkType; entityId: number },
): Promise<boolean> {
  if (!isLinkableEntityType(args.entityType)) {
    throw new Error(`invalid entityType: ${args.entityType}`);
  }
  const deleted = await db
    .delete(brainInitiativeLinks)
    .where(and(
      eq(brainInitiativeLinks.clientId, clientId),
      eq(brainInitiativeLinks.initiativeId, args.initiativeId),
      eq(brainInitiativeLinks.entityType, args.entityType),
      eq(brainInitiativeLinks.entityId, args.entityId),
    ))
    .returning({ id: brainInitiativeLinks.id });
  if (deleted.length === 0) return false;

  await logAudit({
    clientId,
    actorId,
    action: 'brain_initiative.unlink',
    entityType: 'brain_initiative',
    entityId: args.initiativeId,
    metadata: { entityType: args.entityType, entityId: args.entityId },
  });
  return true;
}

export interface ListInitiativeLinksOpts {
  entityType?: BrainInitiativeLinkType;
  limit?: number;
  offset?: number;
}

export interface ResolvedInitiativeLink {
  linkId: number;
  entityType: BrainInitiativeLinkType;
  entityId: number;
  title: string | null;
  pinned: boolean;
  note: string | null;
  createdAt: Date;
}

/**
 * List links for an initiative, resolved to display rows. Per-type LEFT JOIN
 * to recover the title/name field for known entity types. Unknown entity
 * types (e.g. 'decision' / 'topic' when brain-restructure hasn't merged)
 * return title=null.
 */
export async function listInitiativeLinks(
  clientId: number,
  initiativeId: number,
  opts: ListInitiativeLinksOpts = {},
): Promise<ResolvedInitiativeLink[]> {
  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 200)) : 100;
  const offset = opts.offset !== undefined ? Math.max(0, opts.offset) : 0;

  const conds = [
    eq(brainInitiativeLinks.clientId, clientId),
    eq(brainInitiativeLinks.initiativeId, initiativeId),
  ];
  if (opts.entityType) conds.push(eq(brainInitiativeLinks.entityType, opts.entityType));

  const rows = await db
    .select({
      linkId: brainInitiativeLinks.id,
      entityType: brainInitiativeLinks.entityType,
      entityId: brainInitiativeLinks.entityId,
      pinned: brainInitiativeLinks.pinned,
      note: brainInitiativeLinks.note,
      createdAt: brainInitiativeLinks.createdAt,
    })
    .from(brainInitiativeLinks)
    .where(and(...conds))
    .orderBy(desc(brainInitiativeLinks.pinned), desc(brainInitiativeLinks.createdAt))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  // Group ids by type and resolve titles in one batch per type. Each lookup
  // is tenant-scoped — never trust the link table alone.
  const byType = new Map<BrainInitiativeLinkType, number[]>();
  for (const r of rows) {
    const t = r.entityType as BrainInitiativeLinkType;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(r.entityId);
  }

  const titleByKey = new Map<string, string | null>();
  const key = (t: string, id: number) => `${t}:${id}`;

  for (const [t, ids] of byType.entries()) {
    if (ids.length === 0) continue;
    let resolved: Array<{ id: number; title: string | null }> = [];
    switch (t) {
      case 'task':
        resolved = await db
          .select({ id: brainTasks.id, title: brainTasks.title })
          .from(brainTasks)
          .where(and(eq(brainTasks.clientId, clientId), inArray(brainTasks.id, ids)));
        break;
      case 'note':
        resolved = await db
          .select({ id: brainNotes.id, title: brainNotes.title })
          .from(brainNotes)
          .where(and(eq(brainNotes.clientId, clientId), inArray(brainNotes.id, ids)));
        break;
      case 'meeting':
        resolved = await db
          .select({ id: brainMeetings.id, title: brainMeetings.title })
          .from(brainMeetings)
          .where(and(eq(brainMeetings.clientId, clientId), inArray(brainMeetings.id, ids)));
        break;
      case 'crm_deal':
        resolved = await db
          .select({ id: crmDeals.id, title: crmDeals.title })
          .from(crmDeals)
          .where(and(eq(crmDeals.clientId, clientId), inArray(crmDeals.id, ids)));
        break;
      case 'crm_company':
        resolved = (await db
          .select({ id: crmCompanies.id, name: crmCompanies.name })
          .from(crmCompanies)
          .where(and(eq(crmCompanies.clientId, clientId), inArray(crmCompanies.id, ids))))
          .map((r) => ({ id: r.id, title: r.name }));
        break;
      case 'person':
        resolved = (await db
          .select({ id: brainPeople.id, name: brainPeople.fullName })
          .from(brainPeople)
          .where(and(eq(brainPeople.clientId, clientId), inArray(brainPeople.id, ids))))
          .map((r) => ({ id: r.id, title: r.name }));
        break;
      case 'org_unit':
        resolved = (await db
          .select({ id: brainOrgUnits.id, name: brainOrgUnits.name })
          .from(brainOrgUnits)
          .where(and(eq(brainOrgUnits.clientId, clientId), inArray(brainOrgUnits.id, ids))))
          .map((r) => ({ id: r.id, title: r.name }));
        break;
      case 'glossary_term':
        resolved = (await db
          .select({ id: brainGlossaryTerms.id, term: brainGlossaryTerms.term })
          .from(brainGlossaryTerms)
          .where(and(eq(brainGlossaryTerms.clientId, clientId), inArray(brainGlossaryTerms.id, ids))))
          .map((r) => ({ id: r.id, title: r.term }));
        break;
      case 'decision':
      case 'topic':
      default:
        // brain_decisions / brain_topics ship in the sibling brain-restructure
        // branch. Until that lands, leave title=null — UI renders the entity
        // type + id as a fallback.
        resolved = ids.map((id) => ({ id, title: null }));
        break;
    }
    for (const r of resolved) titleByKey.set(key(t, r.id), r.title);
  }

  return rows.map((r) => ({
    linkId: r.linkId,
    entityType: r.entityType as BrainInitiativeLinkType,
    entityId: r.entityId,
    title: titleByKey.get(key(r.entityType, r.entityId)) ?? null,
    pinned: r.pinned,
    note: r.note,
    createdAt: r.createdAt,
  }));
}
