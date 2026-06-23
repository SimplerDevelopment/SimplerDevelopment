/**
 * Review-item routing by expertise — Brain Phase 6.
 *
 * Scores candidate `brain_people` (status='active') for who should review a
 * given `brain_ai_review_items` row, based on:
 *
 *   1. Topic-expertise match  — payload-derived topics intersected with the
 *      person's `brain_person_expertise` tags (substring match on name/desc;
 *      bonus when level >= 3).
 *   2. Org-unit context       — candidates in the same org_unit as the source
 *      entity's linked person/unit get a small bump.
 *   3. Past approval history  — `brain_audit_logs` rows where this person
 *      previously approved a similar review-item type. Capped contribution.
 *   4. Workload                — pending review items already assigned to them
 *      subtract from the score. Discourages overload.
 *
 * The scoring math is extracted into `scoreReviewerCandidates` (pure) so it can
 * be unit-tested without a database. The exported orchestrators
 * (`suggestReviewerForItem`, `applySuggestionToReviewItem`,
 * `runSuggestionForAllPending`) gather signals from the DB and feed them in.
 *
 * SUGGESTIONS, not assignments. The actual reviewer on approval is recorded in
 * `brain_ai_review_items.reviewed_by` per existing convention.
 */

import { db } from '@/lib/db';
import {
  brainAiReviewItems,
  brainAuditLogs,
  brainEntityTopics,
  brainExpertiseTags,
  brainMeetings,
  brainPeople,
  brainPersonExpertise,
  brainPersonOrgUnits,
  brainTopics,
  type BrainReviewItemPayload,
  type BrainReviewItemTopicAssignPayload,
  type BrainReviewItemType,
} from '@/lib/db/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { logAudit } from './audit';

const SCORE_THRESHOLD = 3;
const PAST_APPROVAL_CAP = 5;
const TOPIC_MATCH_POINTS = 3;
const TOPIC_EXPERT_BONUS = 2;
const ORG_UNIT_POINTS = 2;
const PAST_APPROVAL_POINTS = 1;
const WORKLOAD_PENALTY = 1;

// ── Pure scoring layer (no DB) ───────────────────────────────────────────────

/**
 * One candidate reviewer plus everything the scorer needs to grade them.
 * `personId` is opaque to the math; the orchestrator translates back.
 */
export interface ReviewerCandidateSignals {
  personId: number;
  /**
   * Expertise tags this person holds. `name` and `description` are matched
   * substring-wise against topic names/descriptions in `topicSignals`.
   * `level` is 1..4 (advanced/expert at 3+ earn a bonus).
   */
  expertise: Array<{
    name: string;
    description: string | null;
    level: number | null;
  }>;
  /** Org-unit ids the person belongs to. Compared against `signals.contextOrgUnitIds`. */
  orgUnitIds: number[];
  /** How many prior approve actions this person has logged for the same proposed_type. */
  pastApprovalsForType: number;
  /** How many pending review-items already have this person as their suggested reviewer. */
  pendingWorkload: number;
}

/**
 * The non-candidate signals the scorer compares against.
 */
export interface ReviewerScoringContext {
  /** Topics surfaced by the review-item payload. Each entry contributes match points. */
  topics: Array<{ name: string; description: string | null }>;
  /** Org-units derived from the source entity. Membership earns ORG_UNIT_POINTS once. */
  contextOrgUnitIds: number[];
}

export interface RankedReviewerCandidate {
  personId: number;
  score: number;
  reasonParts: string[];
}

/**
 * Pure scoring. Returns every candidate ranked DESC by score, with a list of
 * human-readable reason parts the orchestrator can join into a sentence. No DB
 * access; the orchestrator pre-loads everything.
 *
 * Tie-breaking: when scores are equal, the candidate with the LOWER personId
 * sorts first. This is deterministic and stable across test runs.
 */
export function scoreReviewerCandidates(
  candidates: ReviewerCandidateSignals[],
  signals: ReviewerScoringContext,
): RankedReviewerCandidate[] {
  return candidates
    .map((c) => {
      let score = 0;
      const reasonParts: string[] = [];

      // 1. Topic-expertise match — substring on tag name vs. topic name OR
      //    description (either direction), plus a bonus when the person rates
      //    the matching tag as advanced+ (lvl>=3). A tag scores at most once
      //    per scoring pass even if it matches several topics — discourages
      //    runaway scoring on broad tags.
      const matchedTags = new Set<string>();
      for (const tag of c.expertise) {
        const tagName = (tag.name || '').toLowerCase().trim();
        if (!tagName) continue;
        if (matchedTags.has(tag.name)) continue;
        for (const topic of signals.topics) {
          const topicName = (topic.name || '').toLowerCase();
          const topicDesc = (topic.description || '').toLowerCase();
          const hitsName = topicName.length > 0 && (topicName.includes(tagName) || tagName.includes(topicName));
          const hitsDesc = topicDesc.length > 0 && topicDesc.includes(tagName);
          if (hitsName || hitsDesc) {
            score += TOPIC_MATCH_POINTS;
            matchedTags.add(tag.name);
            if ((tag.level ?? 0) >= 3) {
              score += TOPIC_EXPERT_BONUS;
            }
            break;
          }
        }
      }
      if (matchedTags.size > 0) {
        reasonParts.push(`expertise in ${[...matchedTags].slice(0, 3).join(', ')}`);
      }

      // 2. Org-unit context — flat bonus once.
      const sharesOrgUnit = signals.contextOrgUnitIds.some((id) => c.orgUnitIds.includes(id));
      if (sharesOrgUnit) {
        score += ORG_UNIT_POINTS;
        reasonParts.push('same org unit');
      }

      // 3. Past approval history — capped at PAST_APPROVAL_CAP.
      const pastPts = Math.min(c.pastApprovalsForType, PAST_APPROVAL_CAP) * PAST_APPROVAL_POINTS;
      if (pastPts > 0) {
        score += pastPts;
        reasonParts.push(`${c.pastApprovalsForType} past approval${c.pastApprovalsForType === 1 ? '' : 's'} of this type`);
      }

      // 4. Workload — subtract per pending item already routed to this person.
      if (c.pendingWorkload > 0) {
        score -= c.pendingWorkload * WORKLOAD_PENALTY;
        reasonParts.push(`-${c.pendingWorkload} workload`);
      }

      return { personId: c.personId, score, reasonParts };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.personId - b.personId;
    });
}

/** Score threshold below which we decline to suggest a reviewer. */
export function isConfidentSuggestion(score: number): boolean {
  return score >= SCORE_THRESHOLD;
}

// ── DB-driven orchestrators ──────────────────────────────────────────────────

export interface ReviewerSuggestion {
  personId: number;
  score: number;
  reason: string;
}

/**
 * Compute the best reviewer for `reviewItem`. Returns null when no candidate
 * crosses SCORE_THRESHOLD (the queue stays unrouted rather than misroute).
 */
export async function suggestReviewerForItem(
  clientId: number,
  reviewItem: typeof brainAiReviewItems.$inferSelect,
): Promise<ReviewerSuggestion | null> {
  // ── Candidates ─────────────────────────────────────────────────────────────
  const people = await db.select({
    id: brainPeople.id,
    fullName: brainPeople.fullName,
  }).from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.status, 'active')));

  if (people.length === 0) return null;

  const personIds = people.map((p) => p.id);

  // Expertise per person (left join through brain_expertise_tags for names/desc).
  const expertiseRows = await db.select({
    personId: brainPersonExpertise.personId,
    level: brainPersonExpertise.level,
    tagName: brainExpertiseTags.name,
    tagDescription: brainExpertiseTags.description,
  }).from(brainPersonExpertise)
    .innerJoin(brainExpertiseTags, eq(brainExpertiseTags.id, brainPersonExpertise.expertiseTagId))
    .where(inArray(brainPersonExpertise.personId, personIds));

  const expertiseByPerson = new Map<number, ReviewerCandidateSignals['expertise']>();
  for (const r of expertiseRows) {
    const list = expertiseByPerson.get(r.personId) ?? [];
    list.push({ name: r.tagName, description: r.tagDescription, level: r.level });
    expertiseByPerson.set(r.personId, list);
  }

  // Org-unit memberships per person.
  const orgUnitRows = await db.select({
    personId: brainPersonOrgUnits.personId,
    orgUnitId: brainPersonOrgUnits.orgUnitId,
  }).from(brainPersonOrgUnits)
    .where(inArray(brainPersonOrgUnits.personId, personIds));

  const orgUnitsByPerson = new Map<number, number[]>();
  for (const r of orgUnitRows) {
    const list = orgUnitsByPerson.get(r.personId) ?? [];
    list.push(r.orgUnitId);
    orgUnitsByPerson.set(r.personId, list);
  }

  // Past approval counts for this proposed_type. We look at brain_audit_logs
  // entries shaped `review_item.approved` (and `review_item.edited_and_approved`)
  // and filter by metadata.proposedType. Drizzle's JSON metadata is loosely
  // typed so we do this in JS to keep the dialect portable.
  const auditRows = await db.select({
    actorId: brainAuditLogs.actorId,
    action: brainAuditLogs.action,
    metadata: brainAuditLogs.metadata,
  }).from(brainAuditLogs)
    .where(and(
      eq(brainAuditLogs.clientId, clientId),
      isNotNull(brainAuditLogs.actorId),
    ));

  // Map user_id → past approvals for this type. Then we need to translate
  // user_id → brain_people.id via brain_people.user_id below.
  const pastByUserId = new Map<number, number>();
  for (const r of auditRows) {
    if (r.actorId == null) continue;
    if (r.action !== 'review_item.approved' && r.action !== 'review_item.edited_and_approved') continue;
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (meta.proposedType !== reviewItem.proposedType) continue;
    pastByUserId.set(r.actorId, (pastByUserId.get(r.actorId) ?? 0) + 1);
  }

  // Map person_id → user_id so we can attribute past approvals.
  const peopleWithUser = await db.select({
    id: brainPeople.id,
    userId: brainPeople.userId,
  }).from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), inArray(brainPeople.id, personIds)));
  const userIdByPerson = new Map<number, number | null>();
  for (const p of peopleWithUser) userIdByPerson.set(p.id, p.userId);

  // Current pending workload per suggested person.
  const workloadRows = await db.select({
    suggestedReviewerPersonId: brainAiReviewItems.suggestedReviewerPersonId,
  }).from(brainAiReviewItems)
    .where(and(
      eq(brainAiReviewItems.clientId, clientId),
      eq(brainAiReviewItems.status, 'pending'),
      isNotNull(brainAiReviewItems.suggestedReviewerPersonId),
    ));
  const workloadByPerson = new Map<number, number>();
  for (const r of workloadRows) {
    const pid = r.suggestedReviewerPersonId;
    if (pid == null) continue;
    // Don't count the review item we're scoring against itself — re-scoring
    // an already-routed item should be idempotent rather than self-penalize.
    if (pid === reviewItem.suggestedReviewerPersonId && reviewItem.id) {
      // We can't tell from this slim row whether it's *this* item, so we
      // subtract one off the current candidate's tally below. Simpler:
      // count it here, then the orchestrator deducts 1 if pid matches.
    }
    workloadByPerson.set(pid, (workloadByPerson.get(pid) ?? 0) + 1);
  }
  // If this review item is already routed to person X, that "1" includes
  // itself — deduct one so re-running suggestReviewerForItem is idempotent.
  if (reviewItem.suggestedReviewerPersonId != null) {
    const pid = reviewItem.suggestedReviewerPersonId;
    workloadByPerson.set(pid, Math.max(0, (workloadByPerson.get(pid) ?? 0) - 1));
  }

  // ── Context signals ────────────────────────────────────────────────────────
  const topicIds = extractTopicIdsFromPayload(reviewItem.proposedType, reviewItem.proposedPayload);
  // Also include any topics already attached to the source entity (meeting).
  if (reviewItem.sourceType === 'meeting') {
    const sourceTopics = await db.select({ topicId: brainEntityTopics.topicId })
      .from(brainEntityTopics)
      .where(and(
        eq(brainEntityTopics.clientId, clientId),
        eq(brainEntityTopics.entityType, 'meeting'),
        eq(brainEntityTopics.entityId, reviewItem.sourceId),
      ));
    for (const r of sourceTopics) topicIds.add(r.topicId);
  }

  let topicRows: Array<{ name: string; description: string | null }> = [];
  if (topicIds.size > 0) {
    topicRows = await db.select({
      name: brainTopics.name,
      description: brainTopics.description,
    }).from(brainTopics)
      .where(and(
        eq(brainTopics.clientId, clientId),
        inArray(brainTopics.id, [...topicIds]),
      ));
  }

  // Context org units — derived from a source meeting's linked CRM company /
  // deal owners (via brain_people.user_id matching). Phase 6 keeps this lean:
  // when the source is a meeting and the meeting has a `createdBy` user, find
  // brain_people rows for that user and use their org units. Future revisions
  // can expand this to people mentioned in the proposal payload.
  const contextOrgUnitIds: number[] = [];
  if (reviewItem.sourceType === 'meeting') {
    const [mtg] = await db.select({
      createdBy: brainMeetings.createdBy,
    }).from(brainMeetings)
      .where(and(eq(brainMeetings.clientId, clientId), eq(brainMeetings.id, reviewItem.sourceId)))
      .limit(1);
    if (mtg?.createdBy) {
      const linkedPeople = await db.select({ id: brainPeople.id })
        .from(brainPeople)
        .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.userId, mtg.createdBy)));
      if (linkedPeople.length > 0) {
        const units = await db.select({ orgUnitId: brainPersonOrgUnits.orgUnitId })
          .from(brainPersonOrgUnits)
          .where(inArray(brainPersonOrgUnits.personId, linkedPeople.map((p) => p.id)));
        for (const u of units) contextOrgUnitIds.push(u.orgUnitId);
      }
    }
  }

  // ── Assemble + score ───────────────────────────────────────────────────────
  const candidateSignals: ReviewerCandidateSignals[] = people.map((p) => {
    const userId = userIdByPerson.get(p.id);
    return {
      personId: p.id,
      expertise: expertiseByPerson.get(p.id) ?? [],
      orgUnitIds: orgUnitsByPerson.get(p.id) ?? [],
      pastApprovalsForType: userId != null ? (pastByUserId.get(userId) ?? 0) : 0,
      pendingWorkload: workloadByPerson.get(p.id) ?? 0,
    };
  });

  const ranked = scoreReviewerCandidates(candidateSignals, {
    topics: topicRows,
    contextOrgUnitIds,
  });

  const top = ranked[0];
  if (!top || !isConfidentSuggestion(top.score)) return null;

  const personRow = people.find((p) => p.id === top.personId);
  const personLabel = personRow?.fullName ?? `person #${top.personId}`;
  const reason = top.reasonParts.length > 0
    ? `${personLabel} — ${top.reasonParts.join('; ')}`
    : `${personLabel} — best available match`;

  return { personId: top.personId, score: top.score, reason };
}

/**
 * Extract topic ids the payload implies. Phase 6 only the `topic_assign`
 * proposal type carries explicit topic ids; other types contribute the empty
 * set and rely on source-entity topic anchors gathered separately.
 */
export function extractTopicIdsFromPayload(
  proposedType: BrainReviewItemType,
  payload: BrainReviewItemPayload,
): Set<number> {
  const out = new Set<number>();
  if (proposedType === 'topic_assign') {
    const tap = payload as BrainReviewItemTopicAssignPayload;
    if (Array.isArray(tap.topicIds)) {
      for (const id of tap.topicIds) {
        if (typeof id === 'number' && Number.isFinite(id)) out.add(id);
      }
    }
  }
  return out;
}

/**
 * Persist a suggestion onto the review item. Audit log AFTER the write
 * (Pattern A). Idempotent — calling again with a new suggestion overwrites the
 * previous fields.
 */
export async function applySuggestionToReviewItem(
  clientId: number,
  reviewItemId: number,
  suggestion: ReviewerSuggestion | null,
): Promise<void> {
  const [updated] = await db.update(brainAiReviewItems)
    .set({
      suggestedReviewerPersonId: suggestion?.personId ?? null,
      suggestedReviewerScore: suggestion?.score ?? null,
      suggestedReviewerReason: suggestion?.reason ?? null,
    })
    .where(and(
      eq(brainAiReviewItems.id, reviewItemId),
      eq(brainAiReviewItems.clientId, clientId),
    ))
    .returning({ id: brainAiReviewItems.id });

  if (!updated) return;

  await logAudit({
    clientId,
    actorId: null, // system — not a user action
    action: suggestion ? 'review_item.suggested_reviewer' : 'review_item.cleared_suggested_reviewer',
    entityType: 'brain_ai_review_item',
    entityId: reviewItemId,
    metadata: suggestion
      ? { personId: suggestion.personId, score: suggestion.score, reason: suggestion.reason }
      : {},
  });
}

/**
 * Bulk-apply suggestions to every pending review item that doesn't yet have
 * one. Returns `{ items, suggested }` — items examined, suggestions written.
 *
 * Phase 6 ships this helper but doesn't wire a cron — call it manually or from
 * a follow-up branch's worker.
 */
export async function runSuggestionForAllPending(
  clientId: number,
): Promise<{ items: number; suggested: number }> {
  const pending = await db.select().from(brainAiReviewItems)
    .where(and(
      eq(brainAiReviewItems.clientId, clientId),
      eq(brainAiReviewItems.status, 'pending'),
    ));

  let suggested = 0;
  for (const item of pending) {
    if (item.suggestedReviewerPersonId != null) continue;
    const out = await suggestReviewerForItem(clientId, item);
    if (out) {
      await applySuggestionToReviewItem(clientId, item.id, out);
      suggested += 1;
    }
  }

  return { items: pending.length, suggested };
}
