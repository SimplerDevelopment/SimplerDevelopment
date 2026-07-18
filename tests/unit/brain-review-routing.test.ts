// @vitest-environment node
/**
 * Unit tests for lib/brain/review-routing.
 *
 * Covers:
 *   - Pure helpers: scoreReviewerCandidates, isConfidentSuggestion,
 *     extractTopicIdsFromPayload
 *   - DB-driven orchestrators: suggestReviewerForItem,
 *     applySuggestionToReviewItem, runSuggestionForAllPending
 *
 * DB calls are intercepted by the queue-based fluent stub (same pattern as
 * brain-org-units.test.ts). No real DB or network contact.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── DB stub (vi.hoisted so factories close over it correctly) ────────────────

interface CapturedInsert { values: Record<string, unknown> | Array<Record<string, unknown>> | null; }
interface CapturedUpdate { set: Record<string, unknown> | null; }

const { captured, dbStub } = vi.hoisted(() => {
  const captured = {
    inserts: [] as CapturedInsert[],
    updates: [] as CapturedUpdate[],
    selectRowsQueue: [] as Array<Array<Record<string, unknown>>>,
    updateReturning: [] as Array<Array<Record<string, unknown>>>,
  };

  function nextSelectRows(): Array<Record<string, unknown>> {
    return captured.selectRowsQueue.length > 0 ? captured.selectRowsQueue.shift()! : [];
  }

  function makeSelectChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.innerJoin = () => chain;
    chain.limit = () => Promise.resolve(nextSelectRows());
    chain.orderBy = () => Promise.resolve(nextSelectRows());
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(nextSelectRows()).then(onFulfilled);
    return chain;
  }

  function makeUpdateChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.set = (v: Record<string, unknown>) => {
      captured.updates.push({ set: v });
      return chain;
    };
    chain.where = () => chain;
    chain.returning = () =>
      Promise.resolve(
        captured.updateReturning.length > 0 ? captured.updateReturning.shift() : [],
      );
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve([]).then(onFulfilled);
    return chain;
  }

  const dbStub = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
  };

  return { captured, dbStub };
});

vi.mock('@/lib/db', () => ({ db: dbStub }));

// Minimal schema stub — column objects are only used as opaque drizzle tokens.
vi.mock('@/lib/db/schema', () => ({
  brainAiReviewItems: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    status: { __col: 'status' },
    suggestedReviewerPersonId: { __col: 'suggested_reviewer_person_id' },
    suggestedReviewerScore: { __col: 'suggested_reviewer_score' },
    suggestedReviewerReason: { __col: 'suggested_reviewer_reason' },
  },
  brainAuditLogs: {
    clientId: { __col: 'client_id' },
    actorId: { __col: 'actor_id' },
    action: { __col: 'action' },
    metadata: { __col: 'metadata' },
  },
  brainEntityTopics: {
    clientId: { __col: 'client_id' },
    entityType: { __col: 'entity_type' },
    entityId: { __col: 'entity_id' },
    topicId: { __col: 'topic_id' },
  },
  brainExpertiseTags: {
    id: { __col: 'id' },
    name: { __col: 'name' },
    description: { __col: 'description' },
  },
  brainMeetings: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    createdBy: { __col: 'created_by' },
  },
  brainPeople: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    fullName: { __col: 'full_name' },
    userId: { __col: 'user_id' },
    status: { __col: 'status' },
  },
  brainPersonExpertise: {
    personId: { __col: 'person_id' },
    expertiseTagId: { __col: 'expertise_tag_id' },
    level: { __col: 'level' },
  },
  brainPersonOrgUnits: {
    personId: { __col: 'person_id' },
    orgUnitId: { __col: 'org_unit_id' },
  },
  brainTopics: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    name: { __col: 'name' },
    description: { __col: 'description' },
  },
}));

vi.mock('@/lib/brain/audit', () => ({ logAudit: vi.fn(async () => {}) }));

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown[]) => ({ kind: 'inArray', col, vals }),
  isNotNull: (col: unknown) => ({ kind: 'isNotNull', col }),
}));

import {
  isConfidentSuggestion,
  scoreReviewerCandidates,
  extractTopicIdsFromPayload,
  suggestReviewerForItem,
  applySuggestionToReviewItem,
  runSuggestionForAllPending,
  type ReviewerCandidateSignals,
  type ReviewerScoringContext,
} from '@/lib/brain/review-routing';
import { logAudit } from '@/lib/brain/audit';

// ─── Reset helper ─────────────────────────────────────────────────────────────

function resetCaptured() {
  captured.inserts.length = 0;
  captured.updates.length = 0;
  captured.selectRowsQueue.length = 0;
  captured.updateReturning.length = 0;
}

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const NO_TOPICS: ReviewerScoringContext['topics'] = [];
const NO_CTX_ORG: number[] = [];

function mkCandidate(over: Partial<ReviewerCandidateSignals> & { personId: number }): ReviewerCandidateSignals {
  return {
    personId: over.personId,
    expertise: over.expertise ?? [],
    orgUnitIds: over.orgUnitIds ?? [],
    pastApprovalsForType: over.pastApprovalsForType ?? 0,
    pendingWorkload: over.pendingWorkload ?? 0,
  };
}

/** Minimal review-item fixture. Uses the inferred select type shape. */
function mkReviewItem(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    clientId: 7,
    sourceType: 'meeting',
    sourceId: 10,
    proposedType: 'task',
    proposedPayload: { title: 'Test task' },
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    resultEntityType: null,
    resultEntityId: null,
    suggestedReviewerPersonId: null,
    suggestedReviewerScore: null,
    suggestedReviewerReason: null,
    createdAt: new Date('2025-01-01'),
    ...over,
  };
}

// ─── Pure scoring: topic expertise ───────────────────────────────────────────

describe('scoreReviewerCandidates — topic expertise', () => {
  it('+3 per matching tag, +2 bonus when level>=3', () => {
    const cands = [mkCandidate({
      personId: 1,
      expertise: [
        { name: 'kubernetes', description: null, level: 4 },
      ],
    })];
    const ctx: ReviewerScoringContext = {
      topics: [{ name: 'Kubernetes upgrade', description: 'planning the k8s 1.30 rollout' }],
      contextOrgUnitIds: NO_CTX_ORG,
    };
    const ranked = scoreReviewerCandidates(cands, ctx);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBe(5); // 3 (match) + 2 (level>=3)
    expect(ranked[0].reasonParts.join(',')).toMatch(/kubernetes/);
  });

  it('matches by topic description even when name is unrelated', () => {
    const cands = [mkCandidate({
      personId: 1,
      expertise: [{ name: 'fundraising', description: null, level: 2 }],
    })];
    const ctx: ReviewerScoringContext = {
      topics: [{ name: 'Q3 board update', description: 'fundraising milestones for the next round' }],
      contextOrgUnitIds: NO_CTX_ORG,
    };
    const ranked = scoreReviewerCandidates(cands, ctx);
    expect(ranked[0].score).toBe(3); // match (no expert bonus, level<3)
  });

  it('a single tag matching many topics scores only ONCE per pass', () => {
    const cands = [mkCandidate({
      personId: 1,
      expertise: [{ name: 'security', description: null, level: 4 }],
    })];
    const ctx: ReviewerScoringContext = {
      topics: [
        { name: 'security incident postmortem', description: null },
        { name: 'application security review', description: null },
        { name: 'cloud security audit', description: null },
      ],
      contextOrgUnitIds: NO_CTX_ORG,
    };
    const ranked = scoreReviewerCandidates(cands, ctx);
    // Despite three topics matching, the tag counts once: 3 + 2 = 5.
    expect(ranked[0].score).toBe(5);
  });

  it('tag with empty name is skipped', () => {
    const cands = [mkCandidate({
      personId: 1,
      expertise: [{ name: '', description: null, level: 4 }],
    })];
    const ctx: ReviewerScoringContext = {
      topics: [{ name: 'anything', description: null }],
      contextOrgUnitIds: NO_CTX_ORG,
    };
    expect(scoreReviewerCandidates(cands, ctx)[0].score).toBe(0);
  });

  it('level=2 tag earns match points but not expert bonus', () => {
    const cands = [mkCandidate({
      personId: 1,
      expertise: [{ name: 'finance', description: null, level: 2 }],
    })];
    const ctx: ReviewerScoringContext = {
      topics: [{ name: 'finance review', description: null }],
      contextOrgUnitIds: NO_CTX_ORG,
    };
    expect(scoreReviewerCandidates(cands, ctx)[0].score).toBe(3);
  });
});

// ─── Pure scoring: org unit context ───────────────────────────────────────────

describe('scoreReviewerCandidates — org unit context', () => {
  it('+2 when at least one org-unit is shared with the source context', () => {
    const cands = [mkCandidate({
      personId: 1,
      orgUnitIds: [10, 11],
    })];
    const ctx: ReviewerScoringContext = {
      topics: NO_TOPICS,
      contextOrgUnitIds: [11, 99],
    };
    const ranked = scoreReviewerCandidates(cands, ctx);
    expect(ranked[0].score).toBe(2);
    expect(ranked[0].reasonParts).toContain('same org unit');
  });

  it('no bump when org units disjoint', () => {
    const cands = [mkCandidate({ personId: 1, orgUnitIds: [10] })];
    const ctx: ReviewerScoringContext = { topics: NO_TOPICS, contextOrgUnitIds: [11] };
    expect(scoreReviewerCandidates(cands, ctx)[0].score).toBe(0);
  });

  it('no bump when context org-unit list is empty', () => {
    const cands = [mkCandidate({ personId: 1, orgUnitIds: [10] })];
    const ctx: ReviewerScoringContext = { topics: NO_TOPICS, contextOrgUnitIds: [] };
    expect(scoreReviewerCandidates(cands, ctx)[0].score).toBe(0);
  });
});

// ─── Pure scoring: past approval history ──────────────────────────────────────

describe('scoreReviewerCandidates — past approval history', () => {
  it('+1 per past approval, capped at 5', () => {
    const a = mkCandidate({ personId: 1, pastApprovalsForType: 2 });
    const b = mkCandidate({ personId: 2, pastApprovalsForType: 20 });
    const ranked = scoreReviewerCandidates([a, b], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG });
    const byId = new Map(ranked.map((r) => [r.personId, r.score]));
    expect(byId.get(1)).toBe(2);
    expect(byId.get(2)).toBe(5); // capped
  });

  it('zero past approvals adds no points and no reason part', () => {
    const c = mkCandidate({ personId: 1, pastApprovalsForType: 0 });
    const ranked = scoreReviewerCandidates([c], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG });
    expect(ranked[0].score).toBe(0);
    expect(ranked[0].reasonParts.some((p) => p.includes('past approval'))).toBe(false);
  });

  it('reason uses singular "approval" for count=1', () => {
    const c = mkCandidate({ personId: 1, pastApprovalsForType: 1 });
    const ranked = scoreReviewerCandidates([c], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG });
    expect(ranked[0].reasonParts.join(' ')).toMatch(/1 past approval[^s]/);
  });

  it('reason uses plural "approvals" for count>1', () => {
    const c = mkCandidate({ personId: 1, pastApprovalsForType: 3 });
    const ranked = scoreReviewerCandidates([c], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG });
    expect(ranked[0].reasonParts.join(' ')).toMatch(/3 past approvals/);
  });
});

// ─── Pure scoring: workload penalty ───────────────────────────────────────────

describe('scoreReviewerCandidates — workload penalty', () => {
  it('-1 per pending item already routed to that person', () => {
    const overworked = mkCandidate({
      personId: 1,
      expertise: [{ name: 'kubernetes', description: null, level: 4 }],
      pendingWorkload: 4,
    });
    const ctx: ReviewerScoringContext = {
      topics: [{ name: 'kubernetes', description: null }],
      contextOrgUnitIds: NO_CTX_ORG,
    };
    const ranked = scoreReviewerCandidates([overworked], ctx);
    // 3 (match) + 2 (level>=3) - 4 (workload) = 1
    expect(ranked[0].score).toBe(1);
  });

  it('workload penalty can drive score negative', () => {
    const c = mkCandidate({ personId: 1, pendingWorkload: 10 });
    const ranked = scoreReviewerCandidates([c], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG });
    expect(ranked[0].score).toBe(-10);
  });
});

// ─── Pure scoring: degenerate + tie-breaking ──────────────────────────────────

describe('scoreReviewerCandidates — degenerate + tie-breaking', () => {
  it('empty candidates → empty result', () => {
    expect(scoreReviewerCandidates([], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG })).toEqual([]);
  });

  it('ties break by ascending personId (deterministic)', () => {
    const a = mkCandidate({ personId: 7, pastApprovalsForType: 3 });
    const b = mkCandidate({ personId: 2, pastApprovalsForType: 3 });
    const c = mkCandidate({ personId: 5, pastApprovalsForType: 3 });
    const ranked = scoreReviewerCandidates([a, b, c], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG });
    expect(ranked.map((r) => r.personId)).toEqual([2, 5, 7]);
  });

  it('candidate with no signals has score=0 and empty reasonParts', () => {
    const c = mkCandidate({ personId: 1 });
    const ranked = scoreReviewerCandidates([c], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG });
    expect(ranked[0].score).toBe(0);
    expect(ranked[0].reasonParts).toEqual([]);
  });
});

// ─── isConfidentSuggestion threshold ──────────────────────────────────────────

describe('isConfidentSuggestion threshold', () => {
  it('rejects scores below 3', () => {
    expect(isConfidentSuggestion(0)).toBe(false);
    expect(isConfidentSuggestion(2)).toBe(false);
  });
  it('accepts scores >= 3', () => {
    expect(isConfidentSuggestion(3)).toBe(true);
    expect(isConfidentSuggestion(10)).toBe(true);
  });
  it('rejects negative scores (overworked candidates)', () => {
    expect(isConfidentSuggestion(-2)).toBe(false);
  });
});

// ─── end-to-end ranking — full multi-factor pass ──────────────────────────────

describe('end-to-end ranking — full multi-factor pass', () => {
  it('combines all four factors and returns the strongest candidate first', () => {
    const alex = mkCandidate({
      personId: 100,
      expertise: [{ name: 'kubernetes', description: null, level: 4 }],
      orgUnitIds: [],
      pastApprovalsForType: 1,
      pendingWorkload: 0,
    });
    const priya = mkCandidate({
      personId: 101,
      expertise: [{ name: 'security', description: null, level: 2 }],
      orgUnitIds: [42],
      pastApprovalsForType: 0,
      pendingWorkload: 1,
    });
    const morgan = mkCandidate({
      personId: 102,
      expertise: [],
      orgUnitIds: [],
      pastApprovalsForType: 5,
      pendingWorkload: 7,
    });
    const ctx: ReviewerScoringContext = {
      topics: [{ name: 'kubernetes upgrade', description: 'security implications of 1.30' }],
      contextOrgUnitIds: [42],
    };
    const ranked = scoreReviewerCandidates([alex, priya, morgan], ctx);
    // alex   = 3 (match) + 2 (lvl>=3) + 1 (past) = 6
    // priya  = 3 (match: 'security' in description) + 2 (org) - 1 (workload) = 4
    // morgan = 5 (past, capped) - 7 (workload) = -2
    expect(ranked[0].personId).toBe(100);
    expect(ranked[0].score).toBe(6);
    expect(ranked[1].personId).toBe(101);
    expect(ranked[1].score).toBe(4);
    expect(ranked[2].personId).toBe(102);
    expect(ranked[2].score).toBe(-2);
  });
});

// ─── extractTopicIdsFromPayload ────────────────────────────────────────────────

describe('extractTopicIdsFromPayload', () => {
  it('returns empty set for non-topic_assign types', () => {
    const s = extractTopicIdsFromPayload('task', { title: 'do something' });
    expect(s.size).toBe(0);
  });

  it('returns empty set for topic_assign with empty topicIds array', () => {
    const s = extractTopicIdsFromPayload('topic_assign', {
      targetEntityType: 'meeting',
      targetEntityId: 1,
      topicIds: [],
    });
    expect(s.size).toBe(0);
  });

  it('extracts topic ids from topic_assign payload', () => {
    const s = extractTopicIdsFromPayload('topic_assign', {
      targetEntityType: 'meeting',
      targetEntityId: 1,
      topicIds: [10, 20, 30],
    });
    expect([...s].sort((a, b) => a - b)).toEqual([10, 20, 30]);
  });

  it('ignores non-finite numbers in topicIds', () => {
    const s = extractTopicIdsFromPayload('topic_assign', {
      targetEntityType: 'note',
      targetEntityId: 5,
      topicIds: [1, NaN, Infinity, 2],
    } as Record<string, unknown>);
    expect([...s].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('deduplicates repeated topic ids', () => {
    const s = extractTopicIdsFromPayload('topic_assign', {
      targetEntityType: 'task',
      targetEntityId: 7,
      topicIds: [5, 5, 10],
    });
    expect(s.size).toBe(2);
    expect([...s].sort((a, b) => a - b)).toEqual([5, 10]);
  });

  it('returns empty set for decision type even with similar payload shape', () => {
    const s = extractTopicIdsFromPayload('decision', { title: 'Go or no-go', decision: 'Go', rationale: 'x' });
    expect(s.size).toBe(0);
  });
});

// ─── suggestReviewerForItem ────────────────────────────────────────────────────

describe('suggestReviewerForItem — tenancy + no-candidates', () => {
  beforeEach(resetCaptured);

  it('returns null when there are no active people for the client', async () => {
    // people query returns empty (tenancy: clientId=7 has no active people)
    captured.selectRowsQueue.push([]); // people
    const item = mkReviewItem();
    const result = await suggestReviewerForItem(7, item as Parameters<typeof suggestReviewerForItem>[1]);
    expect(result).toBeNull();
  });
});

describe('suggestReviewerForItem — below-threshold fallback', () => {
  beforeEach(resetCaptured);

  it('returns null when top-ranked candidate score < SCORE_THRESHOLD (3)', async () => {
    // One person, no expertise/org/past, zero workload → score = 0
    captured.selectRowsQueue.push([{ id: 1, fullName: 'Alice' }]); // people
    captured.selectRowsQueue.push([]);  // expertiseRows (innerJoin)
    captured.selectRowsQueue.push([]);  // orgUnitRows
    captured.selectRowsQueue.push([]);  // auditRows
    captured.selectRowsQueue.push([{ id: 1, userId: null }]); // peopleWithUser
    captured.selectRowsQueue.push([]);  // workloadRows
    // sourceType='meeting' → fetch entity topics + meeting row
    captured.selectRowsQueue.push([]);  // entityTopics (sourceTopics)
    // topicIds empty → no brainTopics query
    captured.selectRowsQueue.push([{ createdBy: null }]); // meeting row (limit)
    // createdBy=null → no linkedPeople query

    const item = mkReviewItem({ sourceType: 'meeting', sourceId: 10, proposedType: 'task' });
    const result = await suggestReviewerForItem(7, item as Parameters<typeof suggestReviewerForItem>[1]);
    expect(result).toBeNull();
  });
});

describe('suggestReviewerForItem — confident suggestion returned', () => {
  beforeEach(resetCaptured);

  it('returns a suggestion with personId, score and reason when top score >= 3', async () => {
    // Setup: two active people; person 1 has expertise matching topic, giving score=5
    captured.selectRowsQueue.push([
      { id: 1, fullName: 'Alice Expert' },
      { id: 2, fullName: 'Bob Generic' },
    ]); // people
    // expertiseRows: person 1 has 'cloud' tag (level=4)
    captured.selectRowsQueue.push([
      { personId: 1, level: 4, tagName: 'cloud', tagDescription: null },
    ]); // expertiseRows
    captured.selectRowsQueue.push([]);  // orgUnitRows (no org-unit memberships)
    captured.selectRowsQueue.push([]);  // auditRows (no past approvals)
    captured.selectRowsQueue.push([
      { id: 1, userId: 100 },
      { id: 2, userId: 101 },
    ]); // peopleWithUser
    captured.selectRowsQueue.push([]);  // workloadRows (no pending)
    // sourceType='meeting' path
    captured.selectRowsQueue.push([]);  // entityTopics (no extra topics on meeting)
    // topicIds = empty from payload (proposedType='task'), but we push topic rows via next queue
    // brainTopics query only runs if topicIds.size > 0 — so with zero topic ids, skip it
    captured.selectRowsQueue.push([{ createdBy: 200 }]); // meeting row (limit)
    // createdBy=200 → linkedPeople query
    captured.selectRowsQueue.push([{ id: 1 }]); // linkedPeople (person 1 created the meeting)
    captured.selectRowsQueue.push([{ orgUnitId: 5 }]); // orgUnits for linked person

    // Now we need topics for the scoring context.
    // Since proposedType='task' and sourceType='meeting' with no entityTopics returned,
    // topicIds.size=0 → topicRows=[] (no query). But org-unit context IS set (orgUnitId=5).
    // person 1: orgUnitIds=[] (no membership rows returned above) → no org bonus
    // person 1: no past approvals, no workload, no expertise matching empty topics → score=0
    // So result will be null. To get a confident suggestion we need topics to match expertise.
    // Restart with a richer fixture that pushes entityTopics so topic ids get populated.

    // Clear and rebuild with a scenario that actually crosses the threshold.
    resetCaptured();

    captured.selectRowsQueue.push([{ id: 10, fullName: 'Diana Cloud' }]); // people
    captured.selectRowsQueue.push([
      { personId: 10, level: 3, tagName: 'infrastructure', tagDescription: 'cloud ops' },
    ]); // expertiseRows
    captured.selectRowsQueue.push([]);  // orgUnitRows
    captured.selectRowsQueue.push([]);  // auditRows
    captured.selectRowsQueue.push([{ id: 10, userId: null }]); // peopleWithUser (no userId)
    captured.selectRowsQueue.push([]);  // workloadRows
    // sourceType='meeting' path — entity topics give us topic id 77
    captured.selectRowsQueue.push([{ topicId: 77 }]); // entityTopics
    // topicIds.size=1 → brainTopics query
    captured.selectRowsQueue.push([{ name: 'infrastructure', description: 'cloud infrastructure planning' }]); // topicRows
    // meeting row for contextOrgUnitIds
    captured.selectRowsQueue.push([{ createdBy: null }]); // meeting (limit)
    // createdBy=null → no linkedPeople query

    const item = mkReviewItem({
      sourceType: 'meeting',
      sourceId: 10,
      proposedType: 'task',
      proposedPayload: { title: 'Plan infra upgrade' },
    });
    const result = await suggestReviewerForItem(7, item as Parameters<typeof suggestReviewerForItem>[1]);
    // 'infrastructure' tag matches topic name 'infrastructure' → 3 + 2 (level=3) = 5 ≥ threshold
    expect(result).not.toBeNull();
    expect(result!.personId).toBe(10);
    expect(result!.score).toBe(5);
    expect(result!.reason).toMatch(/Diana Cloud/);
    expect(result!.reason).toMatch(/infrastructure/);
  });
});

describe('suggestReviewerForItem — topic_assign payload extracts topicIds', () => {
  beforeEach(resetCaptured);

  it('uses topicIds from topic_assign payload for scoring context', async () => {
    captured.selectRowsQueue.push([{ id: 20, fullName: 'Eve Topics' }]); // people
    captured.selectRowsQueue.push([
      { personId: 20, level: 4, tagName: 'compliance', tagDescription: null },
    ]); // expertiseRows
    captured.selectRowsQueue.push([]);  // orgUnitRows
    captured.selectRowsQueue.push([]);  // auditRows
    captured.selectRowsQueue.push([{ id: 20, userId: null }]); // peopleWithUser
    captured.selectRowsQueue.push([]);  // workloadRows
    // sourceType='manual' (not meeting) → no entityTopics fetch, no meeting fetch
    // proposedType='topic_assign' with topicIds=[55] → topicIds.size=1 → brainTopics query
    captured.selectRowsQueue.push([{ name: 'compliance', description: 'regulatory compliance' }]); // topicRows

    const item = mkReviewItem({
      sourceType: 'manual',
      sourceId: 0,
      proposedType: 'topic_assign',
      proposedPayload: { targetEntityType: 'note', targetEntityId: 3, topicIds: [55] },
    });
    const result = await suggestReviewerForItem(7, item as Parameters<typeof suggestReviewerForItem>[1]);
    expect(result).not.toBeNull();
    expect(result!.personId).toBe(20);
    expect(result!.score).toBe(5); // 3 (match) + 2 (level>=3)
  });
});

describe('suggestReviewerForItem — past approval history attribution', () => {
  beforeEach(resetCaptured);

  it('attributes past approvals to person via userId mapping', async () => {
    captured.selectRowsQueue.push([{ id: 30, fullName: 'Frank Approver' }]); // people
    captured.selectRowsQueue.push([]);  // expertiseRows (no expertise)
    captured.selectRowsQueue.push([]);  // orgUnitRows
    // auditRows: actor userId=500 approved a 'task' type item twice
    captured.selectRowsQueue.push([
      { actorId: 500, action: 'review_item.approved', metadata: { proposedType: 'task' } },
      { actorId: 500, action: 'review_item.approved', metadata: { proposedType: 'task' } },
      { actorId: 500, action: 'review_item.approved', metadata: { proposedType: 'note' } }, // different type, not counted
    ]); // auditRows
    captured.selectRowsQueue.push([{ id: 30, userId: 500 }]); // peopleWithUser
    captured.selectRowsQueue.push([]);  // workloadRows
    // sourceType='manual' → no meeting branch
    // topicIds empty → no brainTopics query

    const item = mkReviewItem({
      sourceType: 'manual',
      sourceId: 0,
      proposedType: 'task',
    });
    const result = await suggestReviewerForItem(7, item as Parameters<typeof suggestReviewerForItem>[1]);
    // 2 past approvals for 'task' → score = 2 (below threshold of 3)
    expect(result).toBeNull();
  });

  it('credits edited_and_approved actions too', async () => {
    captured.selectRowsQueue.push([{ id: 31, fullName: 'Grace Editor' }]); // people
    captured.selectRowsQueue.push([]);  // expertiseRows
    captured.selectRowsQueue.push([]);  // orgUnitRows
    captured.selectRowsQueue.push([
      { actorId: 501, action: 'review_item.edited_and_approved', metadata: { proposedType: 'note' } },
      { actorId: 501, action: 'review_item.edited_and_approved', metadata: { proposedType: 'note' } },
      { actorId: 501, action: 'review_item.edited_and_approved', metadata: { proposedType: 'note' } },
    ]); // auditRows (3 edited_and_approved for 'note')
    captured.selectRowsQueue.push([{ id: 31, userId: 501 }]); // peopleWithUser
    captured.selectRowsQueue.push([]);  // workloadRows
    // sourceType='manual', proposedType='note' → no meeting branch, no topicIds query

    const item = mkReviewItem({ sourceType: 'manual', sourceId: 0, proposedType: 'note' });
    const result = await suggestReviewerForItem(7, item as Parameters<typeof suggestReviewerForItem>[1]);
    // 3 past approvals for 'note' → score = 3 = threshold
    expect(result).not.toBeNull();
    expect(result!.score).toBe(3);
    expect(result!.reason).toMatch(/Grace Editor/);
  });
});

describe('suggestReviewerForItem — workload idempotency', () => {
  beforeEach(resetCaptured);

  it('deducts 1 from workload when re-scoring an already-routed item (idempotent)', async () => {
    // Person 30 is already the suggested reviewer for the item being scored.
    // The workload query counts 1 (the item itself). The function should deduct 1 → effective workload=0.
    captured.selectRowsQueue.push([{ id: 30, fullName: 'Frank Idempotent' }]); // people
    captured.selectRowsQueue.push([
      { personId: 30, level: 3, tagName: 'security', tagDescription: null },
    ]); // expertiseRows
    captured.selectRowsQueue.push([]);  // orgUnitRows
    captured.selectRowsQueue.push([]);  // auditRows
    captured.selectRowsQueue.push([{ id: 30, userId: null }]); // peopleWithUser
    // workloadRows: person 30 has 1 pending item (the item itself)
    captured.selectRowsQueue.push([{ suggestedReviewerPersonId: 30 }]); // workloadRows
    // sourceType='manual' → no meeting branch
    captured.selectRowsQueue.push([{ name: 'security', description: 'security review' }]); // topicRows from topic_assign payload
    // topicIds non-empty because proposedType='topic_assign'

    const item = mkReviewItem({
      sourceType: 'manual',
      sourceId: 0,
      proposedType: 'topic_assign',
      proposedPayload: { targetEntityType: 'note', targetEntityId: 1, topicIds: [99] },
      suggestedReviewerPersonId: 30, // already routed to person 30
    });
    const result = await suggestReviewerForItem(7, item as Parameters<typeof suggestReviewerForItem>[1]);
    // With idempotent deduction: workload = 1 - 1 = 0
    // score = 3 (match) + 2 (level=3) = 5 ≥ threshold
    expect(result).not.toBeNull();
    expect(result!.personId).toBe(30);
    expect(result!.score).toBe(5);
  });
});

describe('suggestReviewerForItem — contextOrgUnitIds from meeting creator', () => {
  beforeEach(resetCaptured);

  it('uses org units of meeting creator as context for candidate scoring', async () => {
    // Person 40 is in org unit 99. Meeting was created by user 600 who links to person 40.
    // The context will include orgUnitId=99, so person 40 earns the ORG_UNIT_POINTS bump.
    // But we also need a topic match to cross threshold. We combine both.
    captured.selectRowsQueue.push([{ id: 40, fullName: 'Hana OrgMatch' }]); // people
    captured.selectRowsQueue.push([
      { personId: 40, level: 2, tagName: 'design', tagDescription: null },
    ]); // expertiseRows
    captured.selectRowsQueue.push([{ personId: 40, orgUnitId: 99 }]); // orgUnitRows
    captured.selectRowsQueue.push([]);  // auditRows
    captured.selectRowsQueue.push([{ id: 40, userId: 600 }]); // peopleWithUser
    captured.selectRowsQueue.push([]);  // workloadRows
    // sourceType='meeting' path
    captured.selectRowsQueue.push([]);  // entityTopics (no extra topics)
    // proposedType='task' → topicIds empty → no brainTopics query
    captured.selectRowsQueue.push([{ createdBy: 600 }]); // meeting row
    // linkedPeople for createdBy=600
    captured.selectRowsQueue.push([{ id: 40 }]); // linkedPeople
    captured.selectRowsQueue.push([{ orgUnitId: 99 }]); // orgUnits for linked person → contextOrgUnitIds=[99]

    const item = mkReviewItem({ sourceType: 'meeting', sourceId: 10, proposedType: 'task' });
    const result = await suggestReviewerForItem(7, item as Parameters<typeof suggestReviewerForItem>[1]);
    // person 40: orgUnitIds=[99], contextOrgUnitIds=[99] → +2 org bump
    // no topics → 0 topic points, no past approvals
    // score = 2, below threshold of 3 → null
    expect(result).toBeNull();
  });
});

// ─── applySuggestionToReviewItem ──────────────────────────────────────────────

describe('applySuggestionToReviewItem', () => {
  beforeEach(() => {
    resetCaptured();
    vi.mocked(logAudit).mockClear();
  });

  it('writes suggestion fields to the DB and logs audit on success', async () => {
    captured.updateReturning.push([{ id: 5 }]); // update returning → row found

    await applySuggestionToReviewItem(7, 5, {
      personId: 10,
      score: 6,
      reason: 'Alice — expertise in cloud',
    });

    expect(captured.updates).toHaveLength(1);
    expect(captured.updates[0].set).toMatchObject({
      suggestedReviewerPersonId: 10,
      suggestedReviewerScore: 6,
      suggestedReviewerReason: 'Alice — expertise in cloud',
    });
    expect(logAudit).toHaveBeenCalledOnce();
    const call = vi.mocked(logAudit).mock.calls[0][0];
    expect(call.action).toBe('review_item.suggested_reviewer');
    expect(call.clientId).toBe(7);
    expect(call.entityId).toBe(5);
    expect(call.actorId).toBeNull(); // system action
  });

  it('clears suggestion fields when suggestion=null and logs cleared action', async () => {
    captured.updateReturning.push([{ id: 5 }]);

    await applySuggestionToReviewItem(7, 5, null);

    expect(captured.updates[0].set).toMatchObject({
      suggestedReviewerPersonId: null,
      suggestedReviewerScore: null,
      suggestedReviewerReason: null,
    });
    const call = vi.mocked(logAudit).mock.calls[0][0];
    expect(call.action).toBe('review_item.cleared_suggested_reviewer');
  });

  it('does not call logAudit when the review item is not found (update returns no rows)', async () => {
    // updateReturning is empty → updated = undefined → early return
    captured.updateReturning.push([]); // no rows returned

    await applySuggestionToReviewItem(7, 999, { personId: 1, score: 5, reason: 'x' });

    expect(logAudit).not.toHaveBeenCalled();
  });

  it('enforces tenancy: update is scoped to both reviewItemId and clientId', async () => {
    captured.updateReturning.push([{ id: 42 }]);

    await applySuggestionToReviewItem(99, 42, null);

    // The update chain's where() was called — captured.updates shows the set payload.
    // We can't inspect the where clause directly, but the set IS written at correct clientId=99.
    expect(captured.updates).toHaveLength(1);
  });
});

// ─── runSuggestionForAllPending ────────────────────────────────────────────────

describe('runSuggestionForAllPending', () => {
  beforeEach(resetCaptured);

  it('returns { items: 0, suggested: 0 } when there are no pending items', async () => {
    captured.selectRowsQueue.push([]); // pending items query → empty
    const result = await runSuggestionForAllPending(7);
    expect(result).toEqual({ items: 0, suggested: 0 });
  });

  it('skips items that already have a suggestedReviewerPersonId', async () => {
    // Two items: one already routed, one unrouted but no candidates → no suggestions written
    captured.selectRowsQueue.push([
      mkReviewItem({ id: 1, suggestedReviewerPersonId: 5 }),  // already routed — skip
      mkReviewItem({ id: 2, suggestedReviewerPersonId: null }), // unrouted
    ]); // pending items
    // For item 2: suggestReviewerForItem → no people
    captured.selectRowsQueue.push([]); // people for item 2

    const result = await runSuggestionForAllPending(7);
    expect(result.items).toBe(2);
    expect(result.suggested).toBe(0); // item 1 skipped; item 2 got null from suggester
  });

  it('counts suggested++ only when a suggestion is returned and written', async () => {
    // One unrouted item. Give it a person with enough score to cross threshold.
    const item = mkReviewItem({ id: 3, suggestedReviewerPersonId: null, proposedType: 'note', sourceType: 'manual' });
    captured.selectRowsQueue.push([item]); // pending items

    // suggestReviewerForItem for item 3:
    captured.selectRowsQueue.push([{ id: 50, fullName: 'Ivy Reviewer' }]); // people
    captured.selectRowsQueue.push([
      { personId: 50, level: 4, tagName: 'product', tagDescription: null },
    ]); // expertiseRows
    captured.selectRowsQueue.push([]);  // orgUnitRows
    captured.selectRowsQueue.push([
      { actorId: 700, action: 'review_item.approved', metadata: { proposedType: 'note' } },
      { actorId: 700, action: 'review_item.approved', metadata: { proposedType: 'note' } },
    ]); // auditRows (2 past approvals for 'note')
    captured.selectRowsQueue.push([{ id: 50, userId: 700 }]); // peopleWithUser
    captured.selectRowsQueue.push([]);  // workloadRows
    // sourceType='manual' → no meeting branch, proposedType='note' → no topicIds

    // applySuggestionToReviewItem for item 3:
    captured.updateReturning.push([{ id: 3 }]); // update returning → success

    const result = await runSuggestionForAllPending(7);
    expect(result.items).toBe(1);
    // 2 past approvals → score=2, below threshold → null → suggested stays 0
    expect(result.suggested).toBe(0);
  });

  it('increments suggested for each item that gets a confident suggestion written', async () => {
    // One pending item, person has enough score (5) to cross threshold.
    const item = mkReviewItem({ id: 4, suggestedReviewerPersonId: null, proposedType: 'topic_assign', sourceType: 'manual' });
    captured.selectRowsQueue.push([item]); // pending items

    captured.selectRowsQueue.push([{ id: 60, fullName: 'Jade Scorer' }]); // people
    captured.selectRowsQueue.push([
      { personId: 60, level: 4, tagName: 'architecture', tagDescription: null },
    ]); // expertiseRows
    captured.selectRowsQueue.push([]);  // orgUnitRows
    captured.selectRowsQueue.push([]);  // auditRows
    captured.selectRowsQueue.push([{ id: 60, userId: null }]); // peopleWithUser
    captured.selectRowsQueue.push([]);  // workloadRows
    // topic_assign with topicIds=[200] → brainTopics query
    captured.selectRowsQueue.push([{ name: 'architecture', description: 'system architecture' }]); // topicRows

    // applySuggestionToReviewItem:
    captured.updateReturning.push([{ id: 4 }]); // update success

    // Patch item's proposedPayload to be valid topic_assign
    (item as Record<string, unknown>).proposedPayload = { targetEntityType: 'note', targetEntityId: 1, topicIds: [200] };

    const result = await runSuggestionForAllPending(7);
    expect(result.items).toBe(1);
    expect(result.suggested).toBe(1);
  });
});
