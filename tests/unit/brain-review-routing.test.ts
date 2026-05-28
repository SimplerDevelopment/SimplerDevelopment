// @vitest-environment node
/**
 * Pure-scoring unit tests for lib/brain/review-routing.
 *
 * `scoreReviewerCandidates` is the math heart of the routing system — it
 * takes pre-loaded signals (expertise tags, org-units, past approval counts,
 * pending workload) and returns ranked candidates without touching the DB.
 * `isConfidentSuggestion` gates the orchestrator on the minimum score.
 *
 * Table-driven cases cover each scoring factor in isolation, the empty-
 * candidates degenerate case, tie-breaking, and the threshold guard.
 */
import { describe, expect, it, vi } from 'vitest';

// Avoid the DATABASE_URL trip-wire in @/lib/db at import time — these tests
// only exercise the pure helpers.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  brainAiReviewItems: {},
  brainAuditLogs: {},
  brainEntityTopics: {},
  brainExpertiseTags: {},
  brainMeetings: {},
  brainPeople: {},
  brainPersonExpertise: {},
  brainPersonOrgUnits: {},
  brainTopics: {},
}));
vi.mock('@/lib/brain/audit', () => ({ logAudit: vi.fn(async () => {}) }));

import {
  isConfidentSuggestion,
  scoreReviewerCandidates,
  type ReviewerCandidateSignals,
  type ReviewerScoringContext,
} from '@/lib/brain/review-routing';

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
});

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
});

describe('scoreReviewerCandidates — past approval history', () => {
  it('+1 per past approval, capped at 5', () => {
    const a = mkCandidate({ personId: 1, pastApprovalsForType: 2 });
    const b = mkCandidate({ personId: 2, pastApprovalsForType: 20 });
    const ranked = scoreReviewerCandidates([a, b], { topics: NO_TOPICS, contextOrgUnitIds: NO_CTX_ORG });
    const byId = new Map(ranked.map((r) => [r.personId, r.score]));
    expect(byId.get(1)).toBe(2);
    expect(byId.get(2)).toBe(5); // capped
  });
});

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
});

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
});

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

describe('end-to-end ranking — full multi-factor pass', () => {
  it('combines all four factors and returns the strongest candidate first', () => {
    // Three candidates competing for one routing slot:
    //   alex   — deep expertise (lvl 4 in kubernetes), no org match, 1 prior approval
    //   priya  — generalist (lvl 2 in security), same org, 0 prior approvals, low workload
    //   morgan — no expertise, no org match, 5 prior approvals, heavy workload
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
