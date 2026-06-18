// @vitest-environment node
/**
 * Companion coverage tests for lib/brain/mcp-sdk-adapter.ts.
 *
 * The existing brain-mcp-sdk-adapter.test.ts covers tools up through the
 * posts cluster. This file covers the large uncovered tail:
 *   - initiatives, goals, decisions, topics
 *   - people, org-units, expertise-tags, glossary
 *   - playbooks, playbook-runs
 *   - documents, document-acks
 *
 * Mock scaffolding is copied verbatim from the existing test so both files
 * stay independent and can run in parallel without shared state.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: vi.fn(async () => ({ id: 7, clientId: 1, enabled: true })),
}));

vi.mock('@/lib/brain/search', () => ({
  searchBrain: vi.fn(async () => ({ hits: [], total: 0 })),
}));

vi.mock('@/lib/brain/dashboard', () => ({
  getDashboardSummary: vi.fn(async () => ({ stats: {}, counts: {} })),
}));

vi.mock('@/lib/brain/meetings', () => ({
  createMeetingFromAdapter: vi.fn(async () => ({ id: 100, title: 'Mtg' })),
  getMeeting: vi.fn(async (_clientId: number, id: number) => (id === 999 ? null : { id, title: 'M' })),
  linkMeeting: vi.fn(async (_clientId: number, id: number) => (id === 999 ? null : { id })),
  listMeetings: vi.fn(async () => []),
}));

vi.mock('@/lib/brain/tasks', () => ({
  createTask: vi.fn(async (input: Record<string, unknown>) => ({ id: 200, ...input })),
  getTask: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id })),
  listTasks: vi.fn(async () => []),
  updateTask: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id })),
}));

vi.mock('@/lib/brain/relationships', () => ({
  createOverlay: vi.fn(async () => ({ id: 300 })),
  getRelationship: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id })),
  listRelationships: vi.fn(async () => []),
  updateOverlay: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id })),
}));

vi.mock('@/lib/brain/review', () => ({
  approveReviewItem: vi.fn(async () => ({ id: 400, status: 'approved' })),
  getReviewItem: vi.fn(async (_c: number, id: number) => (id === 999 ? null : { id, status: 'pending', proposedType: 'task', sourceType: 'manual', sourceId: 0, suggestedReviewerPersonId: null, suggestedReviewerScore: null, suggestedReviewerReason: null, createdAt: 'now' })),
  listReviewItems: vi.fn(async () => []),
  rejectReviewItem: vi.fn(async (input: { itemId: number }) => (input.itemId === 999 ? null : { id: input.itemId, status: 'rejected' })),
}));

vi.mock('@/lib/brain/review-routing', () => ({
  suggestReviewerForItem: vi.fn(async () => ({ personId: 5, score: 4, reason: 'expert' })),
  applySuggestionToReviewItem: vi.fn(async () => undefined),
}));

vi.mock('@/lib/brain/notes', () => ({
  bulkUpdateNotes: vi.fn(async () => ({ updated: 1, failed: 0 })),
  createNote: vi.fn(async (input: Record<string, unknown>) => ({
    id: 1001, title: input.title, body: input.body ?? '', tags: input.tags ?? [],
    sourceUrl: input.sourceUrl ?? null, pinned: false, deletedAt: null, updatedAt: 'now',
  })),
  countNotes: vi.fn(async () => 0),
  deleteNote: vi.fn(async (_c: number, id: number) => id !== 999),
  getNote: vi.fn(async (_c: number, id: number) => id === 999 ? null : { id, title: 't', body: '', deletedAt: null }),
  getNoteBySourceUrl: vi.fn(async () => null),
  listNotes: vi.fn(async () => []),
  restoreNote: vi.fn(async (_c: number, id: number) => id === 999 ? null : { id, title: 't', body: '', tags: [], sourceUrl: null, pinned: false, deletedAt: null, updatedAt: 'now' }),
  updateNote: vi.fn(async (_c: number, id: number, patch: Record<string, unknown>) => id === 999 ? null : { id, ...patch }),
}));

vi.mock('@/lib/brain/classify-notes', () => ({
  classifyNotes: vi.fn(async () => ({
    classifications: [
      { noteId: 1, source: 'competitor', slateAreas: [], audiences: [], contentType: 'how-to', recency: 'current-12mo', status: 'canonical', confidence: 0.9 },
    ],
    skipped: [],
    tokensUsed: 100,
    costUsd: 0.01,
  })),
}));

vi.mock('@/lib/brain/apply-classifications', () => ({
  applyClassifications: vi.fn(async () => ({
    notesUpdated: 1, topicsAttached: 2, attachmentsExisted: 0, routedToReview: 0, skipped: [],
  })),
}));

vi.mock('@/lib/brain/saved-searches', () => ({
  createSavedSearch: vi.fn(async (input: Record<string, unknown>) => ({ id: 500, name: input.name, icon: null, userId: input.userId, sortOrder: 0, createdAt: 'now' })),
  deleteSavedSearch: vi.fn(async (_c: number, id: number) => id !== 999),
  getSavedSearch: vi.fn(async (_c: number, id: number) => id === 999 ? null : { id, name: 's', filters: {} }),
  listSavedSearches: vi.fn(async () => []),
  updateSavedSearch: vi.fn(async (_c: number, id: number) => id === 999 ? null : { id, name: 's', icon: null, userId: null, sortOrder: 0, updatedAt: 'now' }),
}));

vi.mock('@/lib/brain/templates', () => {
  class DuplicateTemplateNameError extends Error {
    constructor(public name_: string) {
      super(`Duplicate: ${name_}`);
      this.name = 'DuplicateTemplateNameError';
    }
  }
  return {
    DuplicateTemplateNameError,
    createTemplate: vi.fn(async () => ({ id: 600, name: 'T', trigger: 'manual', enabled: true, body: 'B', createdAt: 'now' })),
    deleteTemplate: vi.fn(async (_c: number, id: number) => id !== 999),
    getTemplate: vi.fn(async (_c: number, id: number) => id === 999 ? null : { id, name: 'Tpl', body: 'B', defaultTags: [], variables: [] }),
    listTemplates: vi.fn(async () => []),
    updateTemplate: vi.fn(async (_c: number, id: number) => id === 999 ? null : { id, name: 'T', trigger: 'manual', enabled: true, body: 'B', updatedAt: 'now' }),
  };
});

vi.mock('@/lib/brain/template', () => ({
  applyTemplate: vi.fn(async (body: string) => `applied:${body}`),
}));

vi.mock('@/lib/security/assert-owned', () => {
  class OwnershipError extends Error {
    constructor(public field: string, public id: number | string) {
      super(`Forbidden: ${field}=${id}`);
      this.name = 'OwnershipError';
    }
  }
  return {
    OwnershipError,
    assertUserVisibleToClient: vi.fn(async () => undefined),
  };
});

// ── initiatives mock ────────────────────────────────────────────────────────

vi.mock('@/lib/brain/initiatives', () => ({
  listInitiatives: vi.fn(async () => [
    {
      id: 1, name: 'Q3 Growth', slug: 'q3-growth', status: 'active', priority: 'high',
      ownerId: 11, targetDate: new Date('2026-09-30'), goalCount: 2,
      description: 'desc', lessonsLearned: null,
    },
  ]),
  getInitiativeById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return {
      initiative: {
        id, name: 'Q3 Growth', slug: 'q3-growth', status: 'active', priority: 'high',
        ownerId: 11, sponsorId: null, startDate: null,
        targetDate: new Date('2026-09-30'), closedAt: null, closeReason: null,
        confidentialityLevel: 'standard', createdBy: 11,
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
        description: 'desc', lessonsLearned: null,
      },
      goals: [{ id: 1, title: 'G', status: 'open', ownerId: null, targetDate: null, sortOrder: 0, currentMetric: null, targetMetric: null, unit: null }],
      links: { byType: { note: 1 }, items: [{ entityType: 'note', entityId: 1, title: 'N', pinned: false, note: null }] },
    };
  }),
  createInitiative: vi.fn(async (_c: number, _u: number, input: Record<string, unknown>) => ({ id: 10, slug: 'new', status: input.status ?? 'planned' })),
  updateInitiative: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, name: 'Updated' }),
  closeInitiative: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : {
    initiative: { id, status: 'completed', closedAt: new Date('2026-06-01') },
    lessonsLearnedNoteId: null,
  }),
  reopenInitiative: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, status: 'active' }),
  linkEntity: vi.fn(async () => ({ linkId: 50, alreadyLinked: false })),
  unlinkEntity: vi.fn(async () => true),
  listInitiativeLinks: vi.fn(async () => [
    { entityType: 'note', entityId: 1, title: 'N', pinned: false, note: null },
  ]),
}));

// ── goals mock ──────────────────────────────────────────────────────────────

vi.mock('@/lib/brain/goals', () => ({
  listGoals: vi.fn(async () => [
    { id: 1, initiativeId: 1, title: 'G1', status: 'open', ownerId: null, targetDate: new Date('2026-12-31'), sortOrder: 0, currentMetric: 5, targetMetric: 10, unit: '%', description: 'desc', lastProgressNote: null, lastCheckedInAt: null, createdAt: new Date(), updatedAt: new Date(), createdBy: 11 },
  ]),
  getGoalById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return {
      goal: { id, initiativeId: 1, title: 'G', status: 'on_track', ownerId: null, unit: '%', targetMetric: 10, currentMetric: 6, targetDate: new Date('2026-12-31'), sortOrder: 0, lastCheckedInAt: new Date('2026-05-01'), createdBy: 11, createdAt: new Date(), updatedAt: new Date(), description: null, lastProgressNote: null },
      initiative: { initiativeId: 1, name: 'Q3 Growth', slug: 'q3-growth', status: 'active' },
    };
  }),
  createGoal: vi.fn(async () => ({ id: 20, status: 'open', initiativeId: 1 })),
  updateGoal: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, updatedAt: new Date() }),
  checkinGoal: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, status: 'on_track', currentMetric: 7, lastCheckedInAt: new Date() }),
  deleteGoal: vi.fn(async (_c: number, _u: number, id: number) => id !== 999),
}));

// ── decisions mock ──────────────────────────────────────────────────────────

vi.mock('@/lib/brain/decisions', () => ({
  listDecisions: vi.fn(async () => [
    { id: 1, title: 'Use Postgres', status: 'accepted', reversibility: 'two_way', decidedAt: 'now', supersededByDecisionId: null, meetingId: null, noteId: null, companyId: null, dealId: null, decisionMakerId: null, context: 'ctx', rationale: 'rat', decision: 'dec', alternativesConsidered: null },
  ]),
  getDecisionById: vi.fn(async (_c: number, id: number) => {
    if (id === 999) return null;
    return {
      decision: { id, title: 'D', status: 'accepted', reversibility: 'two_way', decidedAt: 'now', supersededByDecisionId: null, meetingId: null, noteId: null, companyId: null, dealId: null, decisionMakerId: null, context: 'ctx', rationale: 'rat', decision: 'dec', alternativesConsidered: null, confidentialityLevel: 'standard' },
      ancestors: [],
      descendants: [],
    };
  }),
  createDecision: vi.fn(async () => ({ id: 30, status: 'accepted', decidedAt: 'now' })),
  updateDecision: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, title: 'Updated', context: null, decisionMakerId: null, confidentialityLevel: 'standard', alternativesConsidered: null, meetingId: null, noteId: null, companyId: null, dealId: null }),
  supersedeDecision: vi.fn(async () => ({ id: 31, status: 'accepted', decidedAt: 'now' })),
  softRejectDecision: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, status: 'rejected' }),
}));

// ── topics mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/brain/topics', () => ({
  listTopics: vi.fn(async () => [
    { id: 1, name: 'Engineering', slug: 'engineering', path: '/engineering', parentId: null, sortOrder: 0, color: null, icon: null },
  ]),
  getTopicTree: vi.fn(async () => [
    { id: 1, name: 'Engineering', slug: 'engineering', path: '/engineering', parentId: null, sortOrder: 0, color: null, icon: null, childCount: 1, entityCount: 2, description: null, children: [
      { id: 2, name: 'Backend', slug: 'backend', path: '/engineering/backend', parentId: 1, sortOrder: 0, color: null, icon: null, childCount: 0, entityCount: 0, description: 'back', children: [] },
    ]},
  ]),
  getTopicById: vi.fn(async (_c: number, id: number) => id === 999 ? null : {
    id, name: 'Engineering', slug: 'engineering', path: '/engineering', parentId: null, sortOrder: 0, color: null, icon: null, description: 'The engineering topic',
    breadcrumb: [{ id: 1, name: 'Engineering', slug: 'engineering' }],
  }),
  listEntitiesForTopic: vi.fn(async () => ({
    items: [{ entityType: 'note', entityId: 1, title: 'N' }],
    byType: { note: [1], meeting: [], task: [], decision: [], relationship_overlay: [] },
  })),
  createTopic: vi.fn(async () => ({ id: 40, slug: 'new-topic', path: '/new-topic', parentId: null })),
  updateTopic: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, name: 'Updated', description: null, color: null, icon: null, sortOrder: 0 }),
  moveTopic: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, path: '/new-path' }),
  mergeTopic: vi.fn(async (_c: number, _u: number, sourceId: number) => sourceId === 999 ? null : { targetId: 1, reattached: 2, reparented: 1 }),
  deleteTopic: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return { deleted: false, reason: 'not_found' as const };
    if (id === 888) return { deleted: false, reason: 'has_children' as const };
    if (id === 777) return { deleted: false, reason: 'has_entities' as const };
    return { deleted: true };
  }),
  attachTopics: vi.fn(async () => ({ attached: 2, alreadyAttached: 0 })),
  detachTopics: vi.fn(async () => ({ detached: 1 })),
  importTopicsFromTags: vi.fn(async () => ({ topicsCreated: 3, notesAttached: 10, perTopic: [{ topicId: 1, path: '/t', noteCount: 5 }], dryRun: false })),
}));

// ── people mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/brain/people', () => ({
  listPeople: vi.fn(async () => [{ id: 1, fullName: 'Alice', status: 'active' }]),
  getPersonById: vi.fn(async (_c: number, id: number) => id === 999 ? null : {
    person: { id, clientId: 1, userId: null, fullName: 'Alice', email: 'a@example.com', managerId: null, title: 'Dev', startDate: null, endDate: null, status: 'active', source: 'manual', createdBy: 11, createdAt: 'now', updatedAt: 'now', notes: null, profileUrls: [] },
    manager: null, directReports: [], orgUnits: [], expertise: [],
  }),
  createPerson: vi.fn(async () => ({ id: 60, status: 'active' })),
  updatePerson: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, fullName: 'Updated', updatedAt: 'now' }),
  deletePerson: vi.fn(async (_c: number, _u: number, id: number) => id !== 999),
  attachExpertise: vi.fn(async () => ({ alreadyAttached: false })),
  detachExpertise: vi.fn(async () => true),
  listExpertiseTags: vi.fn(async () => [{ id: 1, name: 'TypeScript', slug: 'typescript', source: 'manual', createdAt: 'now', peopleCount: 3, description: 'A typed superset of JS' }]),
  createExpertiseTag: vi.fn(async () => ({ id: 70, slug: 'new-tag' })),
  updateExpertiseTag: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, updatedAt: 'now' }),
  deleteExpertiseTag: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return { deleted: false, reason: 'not_found' as const };
    if (id === 888) return { deleted: false, reason: 'in_use' as const };
    return { deleted: true };
  }),
  mergeExpertiseTags: vi.fn(async () => ({ reattached: 2 })),
  whoKnows: vi.fn(async () => [{ personId: 1, fullName: 'Alice', matchedTags: ['TypeScript'], score: 5 }]),
}));

// ── org units mock ──────────────────────────────────────────────────────────

vi.mock('@/lib/brain/org-units', () => ({
  listOrgUnits: vi.fn(async () => [{ id: 1, name: 'Engineering', slug: 'eng', path: '/eng', parentId: null, leadPersonId: null, sortOrder: 0, color: null, icon: null, description: null }]),
  getOrgUnitTree: vi.fn(async () => [{ id: 1, name: 'Engineering', slug: 'eng', path: '/eng', parentId: null, leadPersonId: null, sortOrder: 0, color: null, icon: null, description: null, memberCount: 2, children: [] }]),
  getOrgUnitById: vi.fn(async (_c: number, id: number) => id === 999 ? null : {
    unit: { id, name: 'Engineering', slug: 'eng', path: '/eng', parentId: null, leadPersonId: null, sortOrder: 0, color: null, icon: null, description: null },
    ancestors: [], members: [{ personId: 5, fullName: 'Bob', title: 'Dev', primary: true, roleInUnit: null }],
  }),
  createOrgUnit: vi.fn(async () => ({ id: 80, slug: 'new-unit', path: '/new-unit' })),
  updateOrgUnit: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, updatedAt: 'now' }),
  moveOrgUnit: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, path: '/new-path' }),
  mergeOrgUnits: vi.fn(async (_c: number, _u: number, sourceId: number) => sourceId === 999 ? null : { id: 2, name: 'Target' }),
  deleteOrgUnit: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('Org unit has 2 member(s) and 1 child unit(s). Pass force=true to cascade.');
    return true;
  }),
  addMember: vi.fn(async () => ({ id: 1, primary: false })),
  removeMember: vi.fn(async () => true),
  setPrimaryUnit: vi.fn(async (_c: number, _u: number, personId: number) => personId !== 999),
}));

// ── glossary mock ───────────────────────────────────────────────────────────

vi.mock('@/lib/brain/glossary', () => ({
  listGlossaryTerms: vi.fn(async () => ({
    items: [{ id: 1, term: 'SOP', slug: 'sop', shortDefinition: 'Standard Operating Procedure', status: 'active', category: 'ops', ownerId: null, aliasCount: 1 }],
    total: 1, limit: 50, offset: 0,
  })),
  getGlossaryTermById: vi.fn(async (_c: number, id: number) => id === 999 ? null : {
    term: { id, term: 'SOP', slug: 'sop', shortDefinition: 'SOP def', status: 'active', category: 'ops', ownerId: null, source: 'manual', createdAt: 'now', updatedAt: 'now', definition: 'Full def here', aliases: ['Standard Operating Procedure'], relatedTermIds: [2] },
    relatedTerms: [{ id: 2, term: 'Policy', slug: 'policy', shortDefinition: 'A policy doc' }],
  }),
  lookupGlossary: vi.fn(async () => [{ id: 1, term: 'SOP', slug: 'sop', score: 10 }]),
  createGlossaryTerm: vi.fn(async () => ({ id: 90, slug: 'new-term' })),
  updateGlossaryTerm: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id }),
  deleteGlossaryTerm: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? { deleted: false } : { deleted: true, prunedRelatedTermFromCount: 0 }),
  bulkImportGlossary: vi.fn(async () => ({ created: 2, updated: 1, errors: [] })),
}));

// ── playbooks mock ──────────────────────────────────────────────────────────

vi.mock('@/lib/brain/playbooks', () => ({
  listPlaybooks: vi.fn(async () => [{ id: 1, name: 'Onboarding', slug: 'onboarding', status: 'active', category: 'hr', triggerKind: 'manual', ownerId: null, stepCount: 3, activeRunCount: 1 }]),
  getPlaybookById: vi.fn(async (_c: number, id: number) => id === 999 ? null : {
    playbook: { id, name: 'Onboarding', slug: 'onboarding', status: 'active', category: 'hr', triggerKind: 'manual', triggerConfig: null, ownerId: null, defaultTopicIds: [], source: 'manual', createdBy: 11, description: 'Desc', createdAt: new Date(), updatedAt: new Date() },
    steps: [{ id: 1, key: 'step-1', name: 'Setup', kind: 'task', nextStepKeys: ['step-2'], sortOrder: 0, description: null, config: {}, condition: null }],
  }),
  createPlaybook: vi.fn(async () => ({ id: 100, slug: 'new-pb', status: 'draft' })),
  updatePlaybook: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id }),
  activatePlaybook: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('playbook DAG invalid: cycle detected; missing entry');
    if (id === 777) throw new Error('zero steps');
    return { id, status: 'active' };
  }),
  archivePlaybook: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('cannot archive playbook with active runs');
    return { id, status: 'archived' };
  }),
  deletePlaybook: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('cannot delete playbook with existing runs');
    return true;
  }),
  addStep: vi.fn(async () => ({ id: 200, key: 'step-1' })),
  updateStep: vi.fn(async (_c: number, _u: number, stepId: number) => stepId === 999 ? null : { id: stepId }),
  removeStep: vi.fn(async (_c: number, _u: number, stepId: number) => {
    if (stepId === 999) return null;
    if (stepId === 888) throw new Error('run-step row(s) reference this step');
    return true;
  }),
  reorderSteps: vi.fn(async () => [{ id: 1, sortOrder: 0 }, { id: 2, sortOrder: 1 }]),
}));

// ── playbook runs mock ──────────────────────────────────────────────────────

vi.mock('@/lib/brain/playbook-runs', () => ({
  listRuns: vi.fn(async () => [
    { id: 1, playbookId: 1, playbookName: 'Onboarding', label: 'Run A', status: 'active', startedAt: new Date(), completedAt: null, stepProgress: { completed: 1, total: 3 } },
  ]),
  getRunById: vi.fn(async (_c: number, id: number) => id === 999 ? null : {
    run: { id, playbookId: 1, label: 'Run A', status: 'active', startedBy: 11, startedAt: new Date(), completedAt: null, abortedAt: null, abortReason: null, context: { env: 'prod' }, triggerPayload: null, createdAt: new Date(), updatedAt: new Date() },
    playbook: { id: 1, name: 'Onboarding', slug: 'onboarding', status: 'active' },
    steps: [{ id: 1, stepId: 10, key: 'step-1', name: 'Setup', kind: 'task', status: 'active', resultEntityType: null, resultEntityId: null, startedAt: new Date(), completedAt: null, waitUntil: null, failureReason: null }],
    links: [{ id: 1, entityType: 'person', entityId: 5 }],
  }),
  listActiveRunsForEntity: vi.fn(async () => [
    { id: 1, playbookId: 1, playbookName: 'Onboarding', label: 'Run A', status: 'active', startedAt: new Date(), completedAt: null, stepProgress: { completed: 1, total: 3 } },
  ]),
  startRun: vi.fn(async () => ({ runId: 300, runStatus: 'active', firstStepKeys: ['step-1'] })),
  advanceRun: vi.fn(async (_c: number, _u: number, runId: number) => runId === 999 ? null : { runId, newActiveStepKeys: ['step-2'], newStatus: 'active' }),
  completeStep: vi.fn(async (_c: number, _u: number, _runId: number, stepId: number) => stepId === 999 ? null : { stepId, status: 'completed' }),
  skipStep: vi.fn(async (_c: number, _u: number, _runId: number, stepId: number) => stepId === 999 ? null : { stepId, status: 'skipped' }),
  abortRun: vi.fn(async (_c: number, _u: number, runId: number) => runId === 999 ? null : { id: runId, status: 'aborted' }),
}));

// ── documents mock ──────────────────────────────────────────────────────────

vi.mock('@/lib/brain/documents', () => ({
  listDocuments: vi.fn(async () => [
    { id: 1, title: 'Employee Handbook', slug: 'employee-handbook', category: 'policy', status: 'published', ownerId: 11, currentPublishedVersionId: 5, publishedAt: 'now', versionCount: 2, requiredReadCount: 3, ackCount: 2 },
  ]),
  getDocumentById: vi.fn(async (_c: number, id: number) => id === 999 ? null : {
    document: { id, title: 'Handbook', slug: 'handbook', category: 'policy', status: 'published', ownerId: null, currentPublishedVersionId: 5, publishedAt: 'now', archivedAt: null },
    currentPublishedVersion: { id: 5, versionNumber: 1, isDraft: false, publishedAt: 'now', title: 'Handbook', body: 'Content here' },
    currentDraftVersion: null,
    versions: [{ id: 5, versionNumber: 1, isDraft: false, publishedAt: 'now', title: 'Handbook' }],
    links: [],
  }),
  createDocument: vi.fn(async () => ({ document: { id: 400, slug: 'new-doc', status: 'draft' }, version: { id: 401 } })),
  updateDocument: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id }),
  editDraftVersion: vi.fn(async (_c: number, _u: number, docId: number) => docId === 999 ? null : { version: { id: 410, versionNumber: 2 } }),
  publishDocument: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return null;
    if (id === 888) throw new Error('empty body not allowed');
    return { document: { id, status: 'published', publishedAt: 'now' }, version: { id: 420, versionNumber: 1 } };
  }),
  archiveDocument: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, status: 'archived', archivedAt: 'now' }),
  unarchiveDocument: vi.fn(async (_c: number, _u: number, id: number) => id === 999 ? null : { id, status: 'published' }),
  deleteDocument: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return { deleted: false, refused: false, ackCount: 0 };
    if (id === 888) return { deleted: false, refused: true, ackCount: 5 };
    return { deleted: true, refused: false, ackCount: 0 };
  }),
  promoteFromNote: vi.fn(async (_c: number, _u: number, noteId: number) => noteId === 999 ? null : { document: { id: 430, slug: 'promoted', status: 'draft' }, version: { id: 431 } }),
  linkEntity: vi.fn(async () => ({ linkId: 500, alreadyLinked: false })),
  unlinkEntity: vi.fn(async () => true),
  listDocumentLinks: vi.fn(async () => []),
}));

// ── document-acks mock ──────────────────────────────────────────────────────

vi.mock('@/lib/brain/document-acks', () => ({
  assignRequiredRead: vi.fn(async () => ({ assigned: 1, alreadyAssigned: 0 })),
  listRequiredReadsForDocument: vi.fn(async () => [{ id: 1, targetType: 'person', targetId: 5, targetName: 'Alice', pinnedVersionId: null, dueAt: null, assignedAt: 'now' }]),
  listRequiredReadsForPerson: vi.fn(async () => [{ id: 1, documentId: 1, documentTitle: 'Handbook', versionId: 5, status: 'open', dueAt: null }]),
  removeRequiredRead: vi.fn(async (_c: number, _u: number, id: number) => {
    if (id === 999) return { removed: false, reason: 'not_found' as const };
    if (id === 888) return { removed: false, reason: 'has_acks' as const };
    return { removed: true };
  }),
  acknowledge: vi.fn(async () => ({ id: 600, documentId: 1, versionId: 5, personId: 5, acknowledgedAt: 'now' })),
  listAcknowledgmentsForDocument: vi.fn(async () => [{ ackId: 1, versionId: 5, versionNumber: 1, personId: 5, personName: 'Alice', acknowledgedAt: 'now', acknowledgmentNote: null }]),
  listAcknowledgmentsForPerson: vi.fn(async () => [{ ackId: 1, documentId: 1, documentTitle: 'Handbook', versionNumber: 1, acknowledgedAt: 'now' }]),
  complianceReport: vi.fn(async (_c: number, docId: number) => docId === 999 ? null : { acknowledged: [5], pending: [6], overdue: [], summary: { total: 2, acknowledged: 1 } }),
}));

// ── db mock ─────────────────────────────────────────────────────────────────

type QueryResult = unknown[];
const dbState: {
  insertReturning: QueryResult;
  selectRows: QueryResult;
  selectQueue: QueryResult[];
} = {
  insertReturning: [{ id: 700 }],
  selectRows: [],
  selectQueue: [],
};

function makeChain(rows: QueryResult) {
  const proxy: Record<string, unknown> = {} as never;
  return new Proxy(proxy, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: QueryResult) => unknown) => Promise.resolve(rows).then(onFulfilled);
      }
      return () => makeChain(rows);
    },
  });
}

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => dbState.insertReturning),
      })),
    })),
    select: vi.fn(() => {
      const next = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectRows;
      return makeChain(next);
    }),
  },
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  return {
    brainAiReviewItems: { id: col('id'), clientId: col('clientId') },
    brainAuditLogs: { id: col('id'), clientId: col('clientId'), entityType: col('e'), entityId: col('eid'), createdAt: col('createdAt') },
    brainDecisions: { id: col('id'), clientId: col('clientId'), status: col('status'), reversibility: col('rev'), decisionMakerId: col('dm') },
    brainDocumentVersions: { id: col('id'), clientId: col('clientId'), documentId: col('docId'), versionNumber: col('vn'), isDraft: col('draft'), publishedAt: col('pa'), title: col('t'), body: col('body'), changeNotes: col('cn'), summary: col('sum') },
    brainEntityTopics: { id: col('id'), clientId: col('clientId'), topicId: col('tid') },
    brainGlossaryTerms: { id: col('id'), clientId: col('clientId'), definition: col('def'), aliases: col('als') },
    brainOrgUnits: { id: col('id'), clientId: col('clientId'), parentId: col('pid'), path: col('path') },
    brainPeople: { id: col('id'), clientId: col('clientId'), notes: col('notes'), profileUrls: col('urls') },
    brainPersonOrgUnits: { id: col('id'), clientId: col('clientId'), orgUnitId: col('ouid'), personId: col('pid') },
    brainPlaybooks: { id: col('id'), clientId: col('clientId'), description: col('desc'), triggerConfig: col('tc'), defaultTopicIds: col('dti') },
    brainTopics: { id: col('id'), clientId: col('clientId'), path: col('path') },
    portalApiKeys: { id: col('id') },
    users: { id: col('id'), name: col('name'), email: col('email') },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerBrainToolsOnSdk } from '@/lib/brain/mcp-sdk-adapter';

interface CapturedTool {
  name: string;
  config: { title?: string; description?: string; inputSchema?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<{ content: { text: string; type: string }[]; isError?: boolean }>;
}

function makeServer() {
  const tools = new Map<string, CapturedTool>();
  const stub = {
    registerTool: vi.fn((name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) => {
      tools.set(name, { name, config, handler });
      return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
    }),
    registerResource: vi.fn(),
  };
  return { stub, tools };
}

function ctxFor(scopes: string[]): PortalMcpContext {
  return {
    userId: 11,
    keyId: 1,
    scopes,
    client: { id: 1, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll() {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerBrainToolsOnSdk(stub as any, ctxFor(['*']));
  return tools;
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.insertReturning = [{ id: 700 }];
  dbState.selectRows = [];
  dbState.selectQueue = [];
});

// ── initiatives ─────────────────────────────────────────────────────────────

describe('brain_initiatives_list', () => {
  it('returns slim list with pagination envelope', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_list')!.handler({ limit: 5, offset: 0 });
    const out = parseJson(res) as { items: { id: number }[]; limit: number; offset: number };
    expect(out.items[0].id).toBe(1);
    expect(out.limit).toBe(5);
  });

  it('includes description when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_list')!.handler({ include: ['description'] });
    const out = parseJson(res) as { items: { description?: string }[] };
    expect('description' in out.items[0]).toBe(true);
  });

  it('formats targetDate as ISO string', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_list')!.handler({});
    const out = parseJson(res) as { items: { targetDate: string }[] };
    expect(out.items[0].targetDate).toMatch(/^\d{4}/);
  });
});

describe('brain_initiatives_get', () => {
  it('returns not-found for missing initiative', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns the initiative with goals and links', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_get')!.handler({ id: 1, includeGoals: true, includeLinks: true });
    const out = parseJson(res) as { initiative: { id: number }; goals: unknown[]; links: { byType: unknown } };
    expect(out.initiative.id).toBe(1);
    expect(out.goals).toHaveLength(1);
    expect(out.links.byType).toBeDefined();
  });
});

describe('brain_initiatives_links', () => {
  it('returns initiative links with byType tally', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_links')!.handler({ id: 1 });
    const out = parseJson(res) as { items: { entityType: string }[]; byType: Record<string, number>; total: number };
    expect(out.total).toBe(1);
    expect(out.byType.note).toBe(1);
  });
});

describe('brain_initiatives_create', () => {
  it('echoes id, slug, status', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_create')!.handler({ name: 'New Initiative' });
    const out = parseJson(res) as { id: number; slug: string; status: string };
    expect(out.id).toBe(10);
    expect(out.slug).toBe('new');
  });

  it('converts error to err()', async () => {
    const mod = await import('@/lib/brain/initiatives');
    (mod.createInitiative as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_create')!.handler({ name: 'X' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('boom');
  });
});

describe('brain_initiatives_update', () => {
  it('returns not-found when missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_update')!.handler({ id: 999, patch: { name: 'X' } });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_update')!.handler({ id: 1, patch: { name: 'Updated' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
    expect(out.updatedFields).toContain('name');
  });

  it('returns structured error when status change attempted', async () => {
    const mod = await import('@/lib/brain/initiatives');
    (mod.updateInitiative as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('use closeInitiative or reopenInitiative'));
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_update')!.handler({ id: 1, patch: {} });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('use_close_or_reopen');
  });
});

describe('brain_initiatives_close', () => {
  it('returns closed initiative echo', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_close')!.handler({ id: 1, outcome: 'completed' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('completed');
  });

  it('returns not-found for missing initiative', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_close')!.handler({ id: 999, outcome: 'cancelled' });
    expect(res.isError).toBe(true);
  });
});

describe('brain_initiatives_reopen', () => {
  it('returns reopened initiative echo', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_reopen')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('active');
  });

  it('returns structured error for non-terminal status', async () => {
    const mod = await import('@/lib/brain/initiatives');
    (mod.reopenInitiative as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('cannot reopen from non-terminal status'));
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_reopen')!.handler({ id: 1 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('non_terminal_status');
  });
});

describe('brain_initiatives_link / brain_initiatives_unlink', () => {
  it('links an entity and returns linkId', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_link')!.handler({ initiativeId: 1, entityType: 'note', entityId: 5 });
    const out = parseJson(res) as { linkId: number; alreadyLinked: boolean };
    expect(out.linkId).toBe(50);
    expect(out.alreadyLinked).toBe(false);
  });

  it('unlinks an entity and returns removed flag', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_initiatives_unlink')!.handler({ initiativeId: 1, entityType: 'note', entityId: 5 });
    const out = parseJson(res) as { removed: boolean };
    expect(out.removed).toBe(true);
  });
});

// ── goals ───────────────────────────────────────────────────────────────────

describe('brain_goals_list', () => {
  it('returns slim list with ISO targetDate', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_list')!.handler({});
    const out = parseJson(res) as { items: { id: number; targetDate: string }[] };
    expect(out.items[0].id).toBe(1);
    expect(out.items[0].targetDate).toMatch(/^\d{4}/);
  });

  it('includes description when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_list')!.handler({ include: ['description'] });
    const out = parseJson(res) as { items: { description?: string }[] };
    expect('description' in out.items[0]).toBe(true);
  });
});

describe('brain_goals_get', () => {
  it('returns not-found for missing goal', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns goal with initiative reference', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_get')!.handler({ id: 1 });
    const out = parseJson(res) as { goal: { id: number }; initiative: { id: number } };
    expect(out.goal.id).toBe(1);
    expect(out.initiative.id).toBe(1);
  });
});

describe('brain_goals_create', () => {
  it('echoes id, status, initiativeId', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_create')!.handler({ initiativeId: 1, title: 'Grow revenue' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.id).toBe(20);
  });
});

describe('brain_goals_update', () => {
  it('returns not-found for missing goal', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_update')!.handler({ id: 1, patch: { status: 'on_track' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.updatedFields).toContain('status');
  });
});

describe('brain_goals_checkin', () => {
  it('returns updated metric and status', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_checkin')!.handler({ id: 1, currentMetric: 7 });
    const out = parseJson(res) as { id: number; status: string; currentMetric: number };
    expect(out.currentMetric).toBe(7);
  });

  it('returns not-found for missing goal', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_checkin')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });
});

describe('brain_goals_delete', () => {
  it('deletes goal and returns echo', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; deleted: boolean };
    expect(out.deleted).toBe(true);
  });

  it('returns not-found for missing goal', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_goals_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });
});

// ── decisions ────────────────────────────────────────────────────────────────

describe('brain_decisions_list', () => {
  it('returns slim list with pagination', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_list')!.handler({ limit: 10 });
    const out = parseJson(res) as { items: { id: number }[]; total: number; limit: number };
    expect(out.items[0].id).toBe(1);
    expect(out.limit).toBe(10);
  });

  it('includes rationale when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_list')!.handler({ include: ['rationale'] });
    const out = parseJson(res) as { items: { rationale?: string }[] };
    expect('rationale' in out.items[0]).toBe(true);
  });
});

describe('brain_decisions_get', () => {
  it('returns not-found for missing decision', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns decision with ancestors and descendants', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_get')!.handler({ id: 1 });
    const out = parseJson(res) as { decision: { id: number }; ancestors: unknown[]; descendants: unknown[] };
    expect(out.decision.id).toBe(1);
    expect(Array.isArray(out.ancestors)).toBe(true);
  });
});

describe('brain_decisions_create', () => {
  it('echoes id, status, decidedAt', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_create')!.handler({
      title: 'Use Postgres', decision: 'PostgreSQL', rationale: 'battle-tested',
    });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.id).toBe(30);
  });
});

describe('brain_decisions_update', () => {
  it('returns not-found when decision missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_update')!.handler({ id: 1, patch: { title: 'New Title' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
  });

  it('returns use_supersede structured error', async () => {
    const mod = await import('@/lib/brain/decisions');
    (mod.updateDecision as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('use supersedeDecision to change rationale'));
    const tools = registerAll();
    const res = await tools.get('brain_decisions_update')!.handler({ id: 1, patch: {} });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('use_supersede');
  });
});

describe('brain_decisions_supersede', () => {
  it('returns previous and current decision echo', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_supersede')!.handler({
      oldId: 1, title: 'Revised', decision: 'Redis instead', rationale: 'faster',
    });
    const out = parseJson(res) as { previous: { id: number; status: string }; current: { id: number } };
    expect(out.previous.id).toBe(1);
    expect(out.previous.status).toBe('superseded');
    expect(out.current.id).toBe(31);
  });
});

describe('brain_decisions_reject', () => {
  it('returns rejected echo', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_reject')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('rejected');
  });

  it('returns not-found for missing decision', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_decisions_reject')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });
});

// ── topics ───────────────────────────────────────────────────────────────────

describe('brain_topics_list', () => {
  it('returns flat topic list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_list')!.handler({});
    const out = parseJson(res) as { id: number; path: string }[];
    expect(out[0].id).toBe(1);
  });

  it('filters by tagPrefix', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_list')!.handler({ tagPrefix: 'engineering' });
    const out = parseJson(res) as { id: number }[];
    expect(out[0].id).toBe(1);
  });
});

describe('brain_topics_tree', () => {
  it('returns nested tree', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_tree')!.handler({});
    const out = parseJson(res) as { id: number; children: { id: number }[] }[];
    expect(out[0].id).toBe(1);
    expect(out[0].children[0].id).toBe(2);
  });

  it('includes description when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_tree')!.handler({ includeDescriptions: true });
    const out = parseJson(res) as { description?: unknown; children: { description?: unknown }[] }[];
    expect('description' in out[0]).toBe(true);
    expect('description' in out[0].children[0]).toBe(true);
  });
});

describe('brain_topics_get', () => {
  it('returns not-found for missing topic', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns topic with breadcrumb', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_get')!.handler({ id: 1 });
    const out = parseJson(res) as { topic: { id: number }; breadcrumb: { id: number }[] };
    expect(out.topic.id).toBe(1);
    expect(out.breadcrumb).toHaveLength(1);
  });

  it('includes description when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_get')!.handler({ id: 1, includeDescription: true });
    const out = parseJson(res) as { topic: { description?: string } };
    expect('description' in out.topic).toBe(true);
  });
});

describe('brain_topics_entities', () => {
  it('returns entities with byType tally', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_entities')!.handler({ id: 1 });
    const out = parseJson(res) as { items: { entityType: string }[]; byType: Record<string, number>; total: number };
    expect(out.total).toBe(1);
    expect(out.byType.note).toBe(1);
  });
});

describe('brain_topics_create', () => {
  it('returns id, slug, path', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_create')!.handler({ name: 'DevOps' });
    const out = parseJson(res) as { id: number; slug: string; path: string };
    expect(out.id).toBe(40);
  });
});

describe('brain_topics_update', () => {
  it('returns not-found for missing topic', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_update')!.handler({ id: 999, patch: { name: 'X' } });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_update')!.handler({ id: 1, patch: { name: 'Eng' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
  });
});

describe('brain_topics_move', () => {
  it('returns not-found for missing topic', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_move')!.handler({ id: 999, newParentId: null });
    expect(res.isError).toBe(true);
  });

  it('returns new path on success', async () => {
    // The adapter does a db.select count(*) for descendants before calling moveTopic
    dbState.selectQueue = [[{ count: 3 }]];
    const tools = registerAll();
    const res = await tools.get('brain_topics_move')!.handler({ id: 1, newParentId: null });
    const out = parseJson(res) as { id: number; path: string; descendantsRepathed: number };
    expect(out.id).toBe(1);
    expect(out.descendantsRepathed).toBe(3);
  });
});

describe('brain_topics_merge', () => {
  it('returns not-found for missing source topic', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_merge')!.handler({ sourceId: 999, targetId: 1 });
    expect(res.isError).toBe(true);
  });

  it('returns merge stats on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_merge')!.handler({ sourceId: 1, targetId: 2 });
    const out = parseJson(res) as { entitiesReattached: number; childrenReparented: number };
    expect(out.entitiesReattached).toBe(2);
    expect(out.childrenReparented).toBe(1);
  });
});

describe('brain_topics_delete', () => {
  it('returns not-found for missing topic', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns conflict when topic has children', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_delete')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('has_children');
  });

  it('returns conflict when topic has entities', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_delete')!.handler({ id: 777 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBeDefined();
  });

  it('returns deleted:true on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });
});

describe('brain_topics_attach / brain_topics_detach', () => {
  it('attaches topics and echoes counts', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_attach')!.handler({ targetEntityType: 'note', targetEntityId: 1, topicIds: [1, 2] });
    const out = parseJson(res) as { attached: number; alreadyAttached: number };
    expect(out.attached).toBe(2);
  });

  it('detaches topics and echoes count', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_detach')!.handler({ targetEntityType: 'note', targetEntityId: 1, topicIds: [1] });
    const out = parseJson(res) as { detached: number };
    expect(out.detached).toBe(1);
  });
});

describe('brain_topics_import_from_tags', () => {
  it('returns import report', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_topics_import_from_tags')!.handler({});
    const out = parseJson(res) as { topicsCreated: number; notesAttached: number; perTopic: unknown[] };
    expect(out.topicsCreated).toBe(3);
    expect(out.notesAttached).toBe(10);
  });
});

// ── people ───────────────────────────────────────────────────────────────────

describe('brain_people_list', () => {
  it('returns slim list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_list')!.handler({});
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items[0].id).toBe(1);
  });
});

describe('brain_people_get', () => {
  it('returns not-found for missing person', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns person with manager, directReports, etc.', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_get')!.handler({ id: 1 });
    const out = parseJson(res) as { person: { id: number }; orgUnits: unknown[]; expertise: unknown[] };
    expect(out.person.id).toBe(1);
  });

  it('includes notes when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_get')!.handler({ id: 1, include: ['notes'] });
    const out = parseJson(res) as { person: { notes?: unknown } };
    expect('notes' in out.person).toBe(true);
  });
});

describe('brain_people_create', () => {
  it('echoes id and status', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_create')!.handler({ fullName: 'Bob Smith' });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.id).toBe(60);
    expect(out.status).toBe('active');
  });
});

describe('brain_people_update', () => {
  it('returns not-found for missing person', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_update')!.handler({ id: 1, patch: { fullName: 'Alice B.' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
  });

  it('returns manager_cycle structured error', async () => {
    const mod = await import('@/lib/brain/people');
    (mod.updatePerson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('manager cycle detected'));
    const tools = registerAll();
    const res = await tools.get('brain_people_update')!.handler({ id: 1, patch: { managerId: 99 } });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('manager_cycle');
  });
});

describe('brain_people_delete', () => {
  it('returns not-found for missing person', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns deleted:true on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });
});

describe('brain_people_attach_expertise / brain_people_detach_expertise', () => {
  it('attaches expertise and echoes alreadyAttached', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_attach_expertise')!.handler({ personId: 1, expertiseTagId: 1 });
    const out = parseJson(res) as { alreadyAttached: boolean };
    expect(out.alreadyAttached).toBe(false);
  });

  it('detaches expertise and echoes detached flag', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_people_detach_expertise')!.handler({ personId: 1, expertiseTagId: 1 });
    const out = parseJson(res) as { detached: boolean };
    expect(out.detached).toBe(true);
  });
});

describe('brain_who_knows', () => {
  it('returns expertise search results', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_who_knows')!.handler({ query: 'TypeScript' });
    const out = parseJson(res) as { personId: number }[];
    expect(out[0].personId).toBe(1);
  });
});

// ── expertise tags ───────────────────────────────────────────────────────────

describe('brain_expertise_tags_list', () => {
  it('returns slim list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_list')!.handler({});
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items[0].id).toBe(1);
  });

  it('includes description when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_list')!.handler({ include: ['description'] });
    const out = parseJson(res) as { items: { description?: unknown }[] };
    expect('description' in out.items[0]).toBe(true);
  });
});

describe('brain_expertise_tags_create', () => {
  it('echoes id and slug', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_create')!.handler({ name: 'GraphQL' });
    const out = parseJson(res) as { id: number; slug: string };
    expect(out.id).toBe(70);
  });
});

describe('brain_expertise_tags_update', () => {
  it('returns not-found for missing tag', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_update')!.handler({ id: 1, patch: { name: 'TS' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
  });
});

describe('brain_expertise_tags_delete', () => {
  it('returns not-found for missing tag', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns in_use structured error', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_delete')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('in_use');
  });

  it('returns deleted:true on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });
});

describe('brain_expertise_tags_merge', () => {
  it('echoes peopleReattached count', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_expertise_tags_merge')!.handler({ sourceTagId: 1, targetTagId: 2 });
    const out = parseJson(res) as { peopleReattached: number; sourceDeleted: boolean };
    expect(out.peopleReattached).toBe(2);
    expect(out.sourceDeleted).toBe(true);
  });
});

// ── org units ────────────────────────────────────────────────────────────────

describe('brain_org_units_list', () => {
  it('returns flat list with memberCount', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_list')!.handler({});
    const out = parseJson(res) as { items: { id: number; memberCount: number }[] };
    expect(out.items[0].id).toBe(1);
  });
});

describe('brain_org_units_tree', () => {
  it('returns nested tree with childCount', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_tree')!.handler({});
    const out = parseJson(res) as { items: { id: number; childCount: number }[] };
    expect(out.items[0].id).toBe(1);
    expect(out.items[0].childCount).toBe(0);
  });
});

describe('brain_org_units_get', () => {
  it('returns not-found for missing unit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns unit with members', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_get')!.handler({ id: 1 });
    const out = parseJson(res) as { unit: { id: number }; members: { personId: number }[] };
    expect(out.unit.id).toBe(1);
    expect(out.members[0].personId).toBe(5);
  });
});

describe('brain_org_units_create', () => {
  it('echoes id, slug, path', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_create')!.handler({ name: 'Platform' });
    const out = parseJson(res) as { id: number; slug: string; path: string };
    expect(out.id).toBe(80);
  });
});

describe('brain_org_units_update', () => {
  it('returns not-found for missing unit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_update')!.handler({ id: 1, patch: { name: 'Eng 2' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
  });
});

describe('brain_org_units_move', () => {
  it('returns not-found for missing unit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_move')!.handler({ id: 999, newParentId: null });
    expect(res.isError).toBe(true);
  });

  it('returns new path on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_move')!.handler({ id: 1, newParentId: null });
    const out = parseJson(res) as { id: number; path: string; descendantsRepathed: number };
    expect(out.id).toBe(1);
  });
});

describe('brain_org_units_merge', () => {
  it('returns not-found for missing source unit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_merge')!.handler({ sourceId: 999, targetId: 1 });
    expect(res.isError).toBe(true);
  });

  it('returns merge stats on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_merge')!.handler({ sourceId: 1, targetId: 2 });
    const out = parseJson(res) as { membersReattached: number; childrenReparented: number };
    expect(typeof out.membersReattached).toBe('number');
  });
});

describe('brain_org_units_delete', () => {
  it('returns not-found for missing unit', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns in_use structured error when unit has members/children', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_delete')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string; memberCount: number; childCount: number };
    expect(out.error).toBe('in_use');
    expect(out.memberCount).toBe(2);
    expect(out.childCount).toBe(1);
  });

  it('returns deleted:true on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });
});

describe('brain_org_units_add_member / remove_member / set_primary', () => {
  it('add_member echoes alreadyMember and primary', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_add_member')!.handler({ orgUnitId: 1, personId: 5 });
    const out = parseJson(res) as { alreadyMember: boolean; primary: boolean };
    expect(typeof out.alreadyMember).toBe('boolean');
  });

  it('remove_member echoes removed flag', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_remove_member')!.handler({ orgUnitId: 1, personId: 5 });
    const out = parseJson(res) as { removed: boolean };
    expect(out.removed).toBe(true);
  });

  it('set_primary returns success echo', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_set_primary')!.handler({ personId: 1, orgUnitId: 1 });
    const out = parseJson(res) as { primary: boolean };
    expect(out.primary).toBe(true);
  });

  it('set_primary returns error when membership not found', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_org_units_set_primary')!.handler({ personId: 999, orgUnitId: 1 });
    expect(res.isError).toBe(true);
  });
});

// ── glossary ─────────────────────────────────────────────────────────────────

describe('brain_glossary_list', () => {
  it('returns slim list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_list')!.handler({});
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items[0].id).toBe(1);
  });
});

describe('brain_glossary_get', () => {
  it('returns not-found for missing term', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns term with relatedTerms', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_get')!.handler({ id: 1 });
    const out = parseJson(res) as { term: { id: number }; relatedTerms: unknown[] };
    expect(out.term.id).toBe(1);
    expect(out.relatedTerms).toHaveLength(1);
  });

  it('includes definition when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_get')!.handler({ id: 1, include: ['definition'] });
    const out = parseJson(res) as { term: { definition?: string } };
    expect('definition' in out.term).toBe(true);
  });
});

describe('brain_glossary_lookup', () => {
  it('returns ranked results', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_lookup')!.handler({ query: 'SOP' });
    const out = parseJson(res) as { id: number; score: number }[];
    expect(out[0].id).toBe(1);
    expect(out[0].score).toBe(10);
  });
});

describe('brain_glossary_create', () => {
  it('echoes id and slug', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_create')!.handler({ term: 'KPI', definition: 'Key Performance Indicator' });
    const out = parseJson(res) as { id: number; slug: string };
    expect(out.id).toBe(90);
  });
});

describe('brain_glossary_update', () => {
  it('returns not-found for missing term', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_update')!.handler({ id: 1, patch: { term: 'SOPP' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
  });
});

describe('brain_glossary_delete', () => {
  it('returns not-found for missing term', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns deleted:true with prunedRelatedTermFromCount', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean; prunedRelatedTermFromCount: number };
    expect(out.deleted).toBe(true);
    expect(typeof out.prunedRelatedTermFromCount).toBe('number');
  });
});

describe('brain_glossary_bulk_import', () => {
  it('returns created/updated/errors summary', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_glossary_bulk_import')!.handler({
      terms: [
        { term: 'A', definition: 'Def A' },
        { term: 'B', definition: 'Def B' },
      ],
    });
    const out = parseJson(res) as { created: number; updated: number; errors: unknown[] };
    expect(out.created).toBe(2);
    expect(out.updated).toBe(1);
  });
});

// ── playbooks ────────────────────────────────────────────────────────────────

describe('brain_playbooks_list', () => {
  it('returns slim playbook list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_list')!.handler({});
    const out = parseJson(res) as { items: { id: number; status: string }[] };
    expect(out.items[0].id).toBe(1);
    expect(out.items[0].status).toBe('active');
  });
});

describe('brain_playbooks_get', () => {
  it('returns not-found for missing playbook', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns playbook with steps', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_get')!.handler({ id: 1 });
    const out = parseJson(res) as { playbook: { id: number }; steps: { id: number }[] };
    expect(out.playbook.id).toBe(1);
    expect(out.steps).toHaveLength(1);
  });

  it('includes stepConfigs when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_get')!.handler({ id: 1, include: ['stepConfigs'] });
    const out = parseJson(res) as { steps: { config?: unknown }[] };
    expect('config' in out.steps[0]).toBe(true);
  });
});

describe('brain_playbooks_create', () => {
  it('echoes id, slug, status', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_create')!.handler({ name: 'Offboarding' });
    const out = parseJson(res) as { id: number; slug: string; status: string };
    expect(out.status).toBe('draft');
  });
});

describe('brain_playbooks_update', () => {
  it('returns not-found for missing playbook', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns use_activate_or_archive structured error', async () => {
    const mod = await import('@/lib/brain/playbooks');
    (mod.updatePlaybook as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('use activatePlaybook or archivePlaybook'));
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_update')!.handler({ id: 1, patch: {} });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('use_activate_or_archive');
  });
});

describe('brain_playbooks_activate', () => {
  it('returns activated playbook', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_activate')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('active');
  });

  it('returns not-found for missing playbook', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_activate')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns dag_invalid structured error with errors array', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_activate')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string; errors: string[] };
    expect(out.error).toBe('dag_invalid');
    expect(Array.isArray(out.errors)).toBe(true);
  });

  it('returns dag_invalid when zero steps', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_activate')!.handler({ id: 777 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('dag_invalid');
  });
});

describe('brain_playbooks_archive', () => {
  it('returns archived playbook', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_archive')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('archived');
  });

  it('returns active_runs_exist structured error', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_archive')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('active_runs_exist');
  });
});

describe('brain_playbooks_delete', () => {
  it('returns deleted:true on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });

  it('returns runs_exist structured error', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_delete')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('runs_exist');
  });
});

describe('brain_playbooks_add_step', () => {
  it('returns step id and key', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_add_step')!.handler({
      playbookId: 1,
      step: { key: 'step-1', name: 'Setup', kind: 'task' },
    });
    const out = parseJson(res) as { id: number; key: string };
    expect(out.id).toBe(200);
    expect(out.key).toBe('step-1');
  });
});

describe('brain_playbooks_update_step', () => {
  it('returns not-found for missing step', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_update_step')!.handler({ stepId: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_update_step')!.handler({ stepId: 1, patch: { name: 'New Name' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
  });
});

describe('brain_playbooks_remove_step', () => {
  it('returns not-found for missing step', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_remove_step')!.handler({ stepId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns run_steps_reference structured error', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_remove_step')!.handler({ stepId: 888 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('run_steps_reference');
  });

  it('returns deleted:true on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_remove_step')!.handler({ stepId: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });
});

describe('brain_playbooks_reorder_steps', () => {
  it('returns playbookId and count', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbooks_reorder_steps')!.handler({ playbookId: 1, orderedStepIds: [2, 1] });
    const out = parseJson(res) as { playbookId: number; count: number };
    expect(out.playbookId).toBe(1);
    expect(out.count).toBe(2);
  });
});

// ── playbook runs ─────────────────────────────────────────────────────────────

describe('brain_playbook_runs_list', () => {
  it('returns run list with stepProgress', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_list')!.handler({});
    const out = parseJson(res) as { items: { id: number; stepProgress: unknown }[] };
    expect(out.items[0].id).toBe(1);
    expect(out.items[0].stepProgress).toBeDefined();
  });
});

describe('brain_playbook_runs_get', () => {
  it('returns not-found for missing run', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns run with playbook and steps', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_get')!.handler({ id: 1 });
    const out = parseJson(res) as { run: { id: number }; playbook: { id: number }; steps: unknown[] };
    expect(out.run.id).toBe(1);
    expect(out.playbook.id).toBe(1);
  });

  it('includes context when opted in', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_get')!.handler({ id: 1, include: ['context'] });
    const out = parseJson(res) as { run: { context?: unknown } };
    expect('context' in out.run).toBe(true);
  });
});

describe('brain_playbook_runs_active_for_entity', () => {
  it('returns active runs for the entity', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_active_for_entity')!.handler({ entityType: 'person', entityId: 5 });
    const out = parseJson(res) as { items: { id: number }[]; total: number };
    expect(out.total).toBe(1);
    expect(out.items[0].id).toBe(1);
  });
});

describe('brain_playbook_runs_start', () => {
  it('returns runId, status, firstStepKeys', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_start')!.handler({ playbookId: 1, label: 'Onboard Alice' });
    const out = parseJson(res) as { runId: number; status: string; firstStepKeys: string[] };
    expect(out.runId).toBe(300);
    expect(out.firstStepKeys).toContain('step-1');
  });
});

describe('brain_playbook_runs_advance', () => {
  it('returns not-found for missing run', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_advance')!.handler({ runId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns new active step keys', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_advance')!.handler({ runId: 1 });
    const out = parseJson(res) as { runId: number; newActiveStepKeys: string[] };
    expect(out.newActiveStepKeys).toContain('step-2');
  });
});

describe('brain_playbook_run_steps_complete', () => {
  it('returns not-found for missing step', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_run_steps_complete')!.handler({ runId: 1, stepId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns completed status', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_run_steps_complete')!.handler({ runId: 1, stepId: 1 });
    const out = parseJson(res) as { stepId: number; status: string };
    expect(out.status).toBe('completed');
  });
});

describe('brain_playbook_run_steps_skip', () => {
  it('returns skipped status', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_run_steps_skip')!.handler({ runId: 1, stepId: 1 });
    const out = parseJson(res) as { stepId: number; status: string };
    expect(out.status).toBe('skipped');
  });
});

describe('brain_playbook_runs_abort', () => {
  it('returns not-found for missing run', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_abort')!.handler({ runId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns aborted status', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_playbook_runs_abort')!.handler({ runId: 1, reason: 'cancelled by user' });
    const out = parseJson(res) as { runId: number; status: string };
    expect(out.status).toBe('aborted');
  });
});

// ── documents ─────────────────────────────────────────────────────────────────

describe('brain_documents_list', () => {
  it('returns document list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_list')!.handler({});
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items[0].id).toBe(1);
  });
});

describe('brain_documents_get', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_get')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns document with versions and links', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_get')!.handler({ id: 1 });
    const out = parseJson(res) as { document: { id: number }; versions: unknown[]; links: unknown[] };
    expect(out.document.id).toBe(1);
  });
});

describe('brain_documents_create', () => {
  it('echoes id, slug, status, version1Id', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_create')!.handler({ title: 'New Policy' });
    const out = parseJson(res) as { id: number; slug: string; status: string; version1Id: number };
    expect(out.id).toBe(400);
    expect(out.version1Id).toBe(401);
  });
});

describe('brain_documents_update', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_update')!.handler({ id: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns use_publish_or_archive structured error', async () => {
    const mod = await import('@/lib/brain/documents');
    (mod.updateDocument as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('use publishDocument to change status'));
    const tools = registerAll();
    const res = await tools.get('brain_documents_update')!.handler({ id: 1, patch: {} });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('use_publish_or_archive');
  });

  it('returns updatedFields on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_update')!.handler({ id: 1, patch: { title: 'New Title' } });
    const out = parseJson(res) as { id: number; updatedFields: string[] };
    expect(out.id).toBe(1);
  });
});

describe('brain_document_versions_edit_draft', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_versions_edit_draft')!.handler({ documentId: 999, patch: {} });
    expect(res.isError).toBe(true);
  });

  it('returns versionId on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_versions_edit_draft')!.handler({ documentId: 1, patch: { body: 'New content' } });
    const out = parseJson(res) as { documentId: number; versionId: number; isDraft: boolean };
    expect(out.isDraft).toBe(true);
    expect(out.versionId).toBe(410);
  });
});

describe('brain_documents_publish', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_publish')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns empty_draft_body structured error', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_publish')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('empty_draft_body');
  });

  it('returns published status on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_publish')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('published');
  });
});

describe('brain_documents_archive', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_archive')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns archived status on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_archive')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('archived');
  });
});

describe('brain_documents_unarchive', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_unarchive')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns restored status on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_unarchive')!.handler({ id: 1 });
    const out = parseJson(res) as { id: number; status: string };
    expect(out.status).toBe('published');
  });
});

describe('brain_documents_delete', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_delete')!.handler({ id: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns document_has_acks structured error', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_delete')!.handler({ id: 888 });
    const out = parseJson(res) as { error: string; ackCount: number };
    expect(out.error).toBe('document_has_acks');
    expect(out.ackCount).toBe(5);
  });

  it('returns deleted:true on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_delete')!.handler({ id: 1 });
    const out = parseJson(res) as { deleted: boolean };
    expect(out.deleted).toBe(true);
  });
});

describe('brain_documents_promote_from_note', () => {
  it('returns not-found for missing note', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_promote_from_note')!.handler({ noteId: 999 });
    expect(res.isError).toBe(true);
  });

  it('echoes documentId, slug, version1Id', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_promote_from_note')!.handler({ noteId: 1 });
    const out = parseJson(res) as { documentId: number; slug: string; version1Id: number };
    expect(out.documentId).toBe(430);
    expect(out.version1Id).toBe(431);
  });
});

describe('brain_documents_link / brain_documents_unlink', () => {
  it('links entity to document and returns linkId', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_link')!.handler({ documentId: 1, entityType: 'topic', entityId: 1 });
    const out = parseJson(res) as { linkId: number; alreadyLinked: boolean };
    expect(out.linkId).toBe(500);
  });

  it('unlinks entity from document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_unlink')!.handler({ documentId: 1, entityType: 'topic', entityId: 1 });
    const out = parseJson(res) as { removed: boolean };
    expect(out.removed).toBe(true);
  });
});

// ── document-acks ─────────────────────────────────────────────────────────────

describe('brain_document_required_reads_list_for_document', () => {
  it('returns required reads list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_required_reads_list_for_document')!.handler({ documentId: 1 });
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items[0].id).toBe(1);
  });
});

describe('brain_document_required_reads_list_for_person', () => {
  it('returns person required reads', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_required_reads_list_for_person')!.handler({ personId: 5 });
    const out = parseJson(res) as { items: { id: number }[] };
    expect(out.items).toHaveLength(1);
  });
});

describe('brain_document_required_reads_assign', () => {
  it('returns assigned and alreadyAssigned counts', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_required_reads_assign')!.handler({
      documentId: 1, targetType: 'person', targetId: 5,
    });
    const out = parseJson(res) as { assigned: number; alreadyAssigned: number };
    expect(out.assigned).toBe(1);
    expect(out.alreadyAssigned).toBe(0);
  });
});

describe('brain_document_required_reads_remove', () => {
  it('returns not-found for missing required read', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_required_reads_remove')!.handler({ requiredReadId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns has_acks structured error', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_required_reads_remove')!.handler({ requiredReadId: 888 });
    const out = parseJson(res) as { error: string };
    expect(out.error).toBe('has_acks');
  });

  it('returns removed:true on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_required_reads_remove')!.handler({ requiredReadId: 1 });
    const out = parseJson(res) as { removed: boolean };
    expect(out.removed).toBe(true);
  });
});

describe('brain_documents_acknowledge', () => {
  it('echoes ackId, documentId, versionId, personId', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_documents_acknowledge')!.handler({
      documentId: 1, versionId: 5, personId: 5,
    });
    const out = parseJson(res) as { ackId: number; documentId: number };
    expect(out.ackId).toBe(600);
    expect(out.documentId).toBe(1);
  });
});

describe('brain_document_acknowledgments_list_for_document', () => {
  it('returns acknowledgment list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_acknowledgments_list_for_document')!.handler({ documentId: 1 });
    const out = parseJson(res) as { items: { ackId: number }[] };
    expect(out.items[0].ackId).toBe(1);
  });
});

describe('brain_document_acknowledgments_list_for_person', () => {
  it('returns person acknowledgments', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_acknowledgments_list_for_person')!.handler({ personId: 5 });
    const out = parseJson(res) as { items: { ackId: number }[] };
    expect(out.items[0].ackId).toBe(1);
  });
});

describe('brain_document_compliance_report', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_compliance_report')!.handler({ documentId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns compliance report with acknowledged/pending', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_compliance_report')!.handler({ documentId: 1 });
    const out = parseJson(res) as { acknowledged: number[]; pending: number[]; summary: unknown };
    expect(out.acknowledged).toContain(5);
    expect(out.pending).toContain(6);
  });
});

// ── document versions list/get ────────────────────────────────────────────────

describe('brain_document_versions_list', () => {
  it('returns not-found for missing document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_versions_list')!.handler({ documentId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns versions list for found document', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_document_versions_list')!.handler({ documentId: 1 });
    const out = parseJson(res) as { items: unknown[]; limit: number; offset: number };
    expect(typeof out.limit).toBe('number');
    expect(typeof out.offset).toBe('number');
  });
});

describe('brain_document_versions_get', () => {
  it('returns not-found when no version row', async () => {
    const tools = registerAll();
    // db.select mock returns [] by default
    const res = await tools.get('brain_document_versions_get')!.handler({ versionId: 9999 });
    expect(res.isError).toBe(true);
  });

  it('returns version with body', async () => {
    dbState.selectQueue = [[{ id: 5, documentId: 1, versionNumber: 1, isDraft: false, publishedAt: 'now', publishedBy: 11, title: 'v1', body: 'Content', createdBy: 11, createdAt: 'now', updatedAt: 'now', changeNotes: null, summary: null }]];
    const tools = registerAll();
    const res = await tools.get('brain_document_versions_get')!.handler({ versionId: 5 });
    const out = parseJson(res) as { id: number; body: string };
    expect(out.id).toBe(5);
    expect(out.body).toBe('Content');
  });
});

// ── review routing ────────────────────────────────────────────────────────────

describe('brain_review_items_suggest_reviewer', () => {
  it('returns suggestion echo on success', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_review_items_suggest_reviewer')!.handler({ reviewItemId: 1 });
    const out = parseJson(res) as { reviewItemId: number; suggestedPersonId: number; score: number };
    expect(out.suggestedPersonId).toBe(5);
    expect(out.score).toBe(4);
  });

  it('returns not-found when review item missing', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_review_items_suggest_reviewer')!.handler({ reviewItemId: 999 });
    expect(res.isError).toBe(true);
  });

  it('returns null suggestion when none found', async () => {
    const routing = await import('@/lib/brain/review-routing');
    (routing.suggestReviewerForItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const tools = registerAll();
    const res = await tools.get('brain_review_items_suggest_reviewer')!.handler({ reviewItemId: 1 });
    const out = parseJson(res) as { suggestion: null };
    expect(out.suggestion).toBeNull();
  });
});

describe('brain_review_items_list_for_reviewer', () => {
  it('returns slim items list', async () => {
    const tools = registerAll();
    const res = await tools.get('brain_review_items_list_for_reviewer')!.handler({ personId: 5 });
    const out = parseJson(res) as { items: unknown[] };
    expect(Array.isArray(out.items)).toBe(true);
  });
});
