/**
 * Apply note classifications — pure DB-write counterpart of `classify-notes.ts`.
 *
 * Takes the LLM classifier's output (`NoteClassification[]`) and persists it as:
 *   1. `brain_notes.status` updates (canonical | draft | stub | duplicate)
 *   2. `brain_entity_topics` attachments for the leaf topics of each facet
 *      (source / slate-area / audiences / content-type / recency / competitor)
 *   3. Low-confidence rows → `brain_ai_review_items` (proposedType='topic_assign')
 *      so a human can approve/reject them in the review queue.
 *
 * BRAIN-1 Phase 1C. See .planning/brain-1/PLAN.md.
 *
 * Tenancy: every db query filters on `clientId`. Topic ids are resolved from
 * slug → id via a per-call map seeded from `brain_topics` rows scoped to this
 * client; cross-tenant ids cannot leak in.
 *
 * Transaction strategy: each note's status-update + topic-attach pair runs in
 * its own `db.transaction(...)` so a partial failure on one note never leaves
 * a half-written state. `logAudit` is called ONCE at the very end (outside any
 * tx) — calling it inside the tx callback would deadlock because the
 * postgres-js pool is `max: 1`.
 */

import { db } from '@/lib/db';
import {
  brainTopics,
  brainEntityTopics,
  brainNotes,
  brainAiReviewItems,
  type BrainReviewItemTopicAssignPayload,
} from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { logAudit } from './audit';
import type {
  NoteClassification,
  SourceSlug,
  SlateAreaSlug,
  AudienceSlug,
  ContentTypeSlug,
  RecencySlug,
  CompetitorSlug,
} from './classify-notes';

// ─── public types ────────────────────────────────────────────────────────────

export interface ApplyClassificationsArgs {
  clientId: number;
  classifications: NoteClassification[];
  actorId?: number | null;
  /** Below this confidence, route to review queue (or skip). Default 0.7. */
  minConfidence?: number;
  /** When false, low-confidence rows are silently skipped. Default true. */
  routeBelowMinToReview?: boolean;
}

export interface ApplyClassificationsResult {
  notesUpdated: number;
  topicsAttached: number;
  attachmentsExisted: number;
  routedToReview: number;
  skipped: Array<{ noteId: number; reason: string }>;
}

// ─── slug catalogue ──────────────────────────────────────────────────────────
// The exhaustive list of leaf slugs across all 6 facets. Source of truth is
// `scripts/brain/seed-taxonomy-topics.ts`. If the seed script changes, update
// these arrays too. Kept in sync via the `Reserved taxonomy not seeded for
// client …` throw below.

const SOURCE_SLUGS: readonly SourceSlug[] = [
  'slate-kb', 'competitor', 'own-marketing', 'industry-news',
  'research-brief', 'meeting-transcript', 'linkedin-draft',
] as const;

const SLATE_AREA_SLUGS: readonly SlateAreaSlug[] = [
  'queries', 'deliver', 'portals', 'forms', 'workflows',
  'reports', 'permissions', 'integrations', 'none',
] as const;

const AUDIENCE_SLUGS: readonly AudienceSlug[] = [
  'vp-enrollment', 'slate-admin', 'advancement', 'internal-only', 'prospect-facing',
] as const;

const CONTENT_TYPE_SLUGS: readonly ContentTypeSlug[] = [
  'how-to', 'case-study', 'reference', 'opinion', 'transcript', 'news', 'service-page',
] as const;

const RECENCY_SLUGS: readonly RecencySlug[] = [
  'evergreen', 'current-12mo', 'archive',
] as const;

const COMPETITOR_SLUGS: readonly CompetitorSlug[] = [
  'carnegie', 'enrollmentfuel', 'rhb', 'waybetter',
  'human-capital', 'huron', 'bwf',
] as const;

/** Root slugs are NOT attached to notes; they exist only as the parent rows
 *  produced by the seed script. We still fetch them to verify the taxonomy is
 *  seeded for this client. */
const ROOT_SLUGS = [
  '_source', '_slate-area', '_audience', '_content-type', '_recency', '_competitor',
] as const;

const ALL_LEAF_SLUGS: readonly string[] = [
  ...SOURCE_SLUGS,
  ...SLATE_AREA_SLUGS,
  ...AUDIENCE_SLUGS,
  ...CONTENT_TYPE_SLUGS,
  ...RECENCY_SLUGS,
  ...COMPETITOR_SLUGS,
] as const;

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a slug → topicId map for the reserved BRAIN-1 taxonomy, scoped to
 * the given client. Throws if any expected leaf slug is missing (the seed
 * script hasn't been run for this tenant yet).
 */
async function buildSlugMap(clientId: number): Promise<Map<string, number>> {
  const expected = [...ROOT_SLUGS, ...ALL_LEAF_SLUGS];
  // tenant scoping
  const rows = await db.select({ id: brainTopics.id, slug: brainTopics.slug })
    .from(brainTopics)
    .where(and(
      eq(brainTopics.clientId, clientId),
      inArray(brainTopics.slug, expected as unknown as string[]),
    ));

  const map = new Map<string, number>();
  for (const r of rows) map.set(r.slug, r.id);

  const missingLeaves = ALL_LEAF_SLUGS.filter((s) => !map.has(s));
  if (missingLeaves.length > 0) {
    throw new Error(
      `Reserved taxonomy not seeded for client ${clientId}; ` +
      `run db:seed:brain-taxonomy first. Missing leaves: ${missingLeaves.join(', ')}`,
    );
  }
  return map;
}

/**
 * Resolve a single classification's facet slugs to a `topicIds` list using the
 * pre-built slug map. Returns an empty array if the classification carries no
 * resolvable slugs (defensive — should never happen since contentType, source,
 * and recency are required by the type).
 */
function resolveTopicIds(c: NoteClassification, slugMap: Map<string, number>): number[] {
  const ids: number[] = [];
  const add = (slug: string | null | undefined) => {
    if (!slug) return;
    const id = slugMap.get(slug);
    if (typeof id === 'number') ids.push(id);
  };

  add(c.source);
  for (const s of c.slateAreas) add(s);
  for (const a of c.audiences) add(a);
  add(c.contentType);
  add(c.recency);
  if (c.competitor) add(c.competitor);

  // Dedup — the same slug could only appear once across facets in practice,
  // but it's cheap insurance against future facet overlaps.
  return Array.from(new Set(ids));
}

// ─── main entry ──────────────────────────────────────────────────────────────

export async function applyClassifications(
  args: ApplyClassificationsArgs,
): Promise<ApplyClassificationsResult> {
  const {
    clientId,
    classifications,
    actorId = null,
    minConfidence = 0.7,
    routeBelowMinToReview = true,
  } = args;

  const result: ApplyClassificationsResult = {
    notesUpdated: 0,
    topicsAttached: 0,
    attachmentsExisted: 0,
    routedToReview: 0,
    skipped: [],
  };

  if (classifications.length === 0) {
    await logAudit({
      clientId,
      actorId,
      action: 'brain_notes.apply_classifications',
      entityType: 'brain_notes',
      metadata: {
        count: 0,
        notesUpdated: 0,
        topicsAttached: 0,
        attachmentsExisted: 0,
        routedToReview: 0,
      },
    });
    return result;
  }

  const slugMap = await buildSlugMap(clientId);

  for (const c of classifications) {
    // Low-confidence path — route to review queue (or skip silently).
    if (c.confidence < minConfidence) {
      if (!routeBelowMinToReview) {
        result.skipped.push({ noteId: c.noteId, reason: 'low-confidence' });
        continue;
      }

      const topicIds = resolveTopicIds(c, slugMap);
      const payload: BrainReviewItemTopicAssignPayload = {
        targetEntityType: 'note',
        targetEntityId: c.noteId,
        topicIds,
        rationale: c.reasoning ?? `Auto-classified at confidence ${c.confidence.toFixed(2)}`,
      };
      // tenant scoping (clientId is the leftmost column)
      await db.insert(brainAiReviewItems).values({
        clientId,
        sourceType: 'manual',
        sourceId: c.noteId,
        proposedType: 'topic_assign',
        proposedPayload: payload,
        // status defaults to 'pending'
      });
      result.routedToReview += 1;
      continue;
    }

    // High-confidence path — apply status + attach topics atomically.
    const topicIds = resolveTopicIds(c, slugMap);

    await db.transaction(async (tx) => {
      // (1) Update the note's status. tenant scoping via clientId guard.
      const updated = await tx.update(brainNotes)
        .set({ status: c.status, updatedAt: new Date() })
        .where(and(eq(brainNotes.id, c.noteId), eq(brainNotes.clientId, clientId)))
        .returning({ id: brainNotes.id });

      if (updated.length === 0) {
        // Note doesn't exist for this client — record but don't throw so the
        // rest of the batch still processes.
        result.skipped.push({ noteId: c.noteId, reason: 'note-not-found-or-wrong-tenant' });
        return;
      }
      result.notesUpdated += 1;

      if (topicIds.length === 0) return;

      // (2) Tenant-check topic ids — drop any that aren't this client's. Our
      // slugMap is already client-scoped, but defending the join keeps this
      // robust if the caller passes pre-resolved ids in the future.
      // tenant scoping
      const valid = await tx.select({ id: brainTopics.id }).from(brainTopics)
        .where(and(
          eq(brainTopics.clientId, clientId),
          inArray(brainTopics.id, topicIds),
        ));
      const validIds = new Set(valid.map((r) => r.id));
      const safeTopicIds = topicIds.filter((id) => validIds.has(id));
      if (safeTopicIds.length === 0) return;

      // (3) Idempotent bulk insert. The unique index
      // `brain_entity_topics_entity_topic_idx (entity_type, entity_id, topic_id)`
      // backs ON CONFLICT DO NOTHING.
      // tenant scoping (clientId is denormalized onto each row)
      const inserted = await tx.insert(brainEntityTopics).values(
        safeTopicIds.map((tid) => ({
          clientId,
          topicId: tid,
          entityType: 'note' as const,
          entityId: c.noteId,
          createdBy: actorId,
        })),
      )
        .onConflictDoNothing({
          target: [
            brainEntityTopics.entityType,
            brainEntityTopics.entityId,
            brainEntityTopics.topicId,
          ],
        })
        .returning({ id: brainEntityTopics.id });

      const attached = inserted.length;
      const existed = safeTopicIds.length - attached;
      result.topicsAttached += attached;
      result.attachmentsExisted += existed;
    });
  }

  // (4) Single audit row for the whole batch. Outside any transaction so we
  // don't hit the postgres-js max:1 pool deadlock (see lib/brain/topics.ts
  // `txAudit` comment for the gory details).
  await logAudit({
    clientId,
    actorId,
    action: 'brain_notes.apply_classifications',
    entityType: 'brain_notes',
    metadata: {
      count: classifications.length,
      notesUpdated: result.notesUpdated,
      topicsAttached: result.topicsAttached,
      attachmentsExisted: result.attachmentsExisted,
      routedToReview: result.routedToReview,
      skipped: result.skipped.length,
      minConfidence,
      routeBelowMinToReview,
    },
  });

  return result;
}

