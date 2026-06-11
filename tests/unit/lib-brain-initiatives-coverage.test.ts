// @vitest-environment node
/**
 * Companion coverage test for lib/brain/initiatives.ts.
 *
 * The existing brain-initiatives.test.ts covers:
 *   - slugifyInitiativeName (all branches)
 *   - updateInitiative: status guard + null return
 *   - closeInitiative: input-validation guards only
 *   - reopenInitiative: not-found + non-terminal guards + happy paths
 *
 * This file covers the UNCOVERED surface:
 *   - createInitiative (happy, blank name, active status revalidate)
 *   - listInitiatives (all filter branches: status single/array, ownerId,
 *       priority single/array, targetDateBefore, hasOpenGoals, limit/offset)
 *   - getInitiativeById (not-found, goals only, links only, both)
 *   - isLinkableEntityType
 *   - linkEntity (happy, invalid type, initiative not found, already linked)
 *   - unlinkEntity (happy returns true, invalid type, not found returns false)
 *   - listInitiativeLinks (empty, entityType filter, all entity-type branches)
 *   - closeInitiative happy paths (reason-only → null row, with lessonsLearned)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── shared state ────────────────────────────────────────────────────────────

type Rows = unknown[];
const state: {
  selectRows: Rows;
  updateRows: Rows;
  insertRows: Rows;
  deleteRows: Rows;
  /** Sequence of select-row arrays — each shift() feeds one select() call. */
  selectSeq: Rows[];
  /** Sequence of insert-return rows — each shift() feeds one insert().returning() call. */
  insertSeq: Rows[];
  revalidateCalls: number[];
  auditCalls: Array<Record<string, unknown>>;
} = {
  selectRows: [],
  updateRows: [],
  insertRows: [],
  deleteRows: [],
  selectSeq: [],
  insertSeq: [],
  revalidateCalls: [],
  auditCalls: [],
};

function resetState() {
  state.selectRows = [];
  state.updateRows = [];
  state.insertRows = [];
  state.deleteRows = [];
  state.selectSeq = [];
  state.insertSeq = [];
  state.revalidateCalls = [];
  state.auditCalls = [];
}

// ─── DB mock ─────────────────────────────────────────────────────────────────

/**
 * Each call to db.select() / tx.select() shifts from selectSeq when available,
 * otherwise falls back to state.selectRows. This lets tests that issue multiple
 * sequential selects (getInitiativeById, listInitiativeLinks) program each
 * result independently.
 */
function makeSelectChain(rowsSource: () => Rows) {
  const node: Record<string, unknown> = {};
  const noop = () => node;
  node.from = noop;
  node.where = noop;
  node.orderBy = noop;
  node.limit = noop;
  node.offset = noop;
  node.innerJoin = noop;
  node.leftJoin = noop;
  (node as { then: (cb: (v: Rows) => unknown) => Promise<unknown> }).then =
    (cb) => Promise.resolve(cb(rowsSource()));
  return node;
}

function makeUpdateChain() {
  const node: Record<string, unknown> = {};
  const noop = () => node;
  node.set = noop;
  node.where = noop;
  node.returning = () => Promise.resolve(state.updateRows);
  return node;
}

function makeInsertChain() {
  const node: Record<string, unknown> = {};
  node.values = () => node;
  node.onConflictDoNothing = () => node;
  node.onConflictDoUpdate = () => node;
  // Pop from insertSeq if available, otherwise fall back to state.insertRows.
  node.returning = () =>
    Promise.resolve(state.insertSeq.length > 0 ? state.insertSeq.shift()! : state.insertRows);
  return node;
}

function makeDeleteChain() {
  const node: Record<string, unknown> = {};
  node.where = () => node;
  node.returning = () => Promise.resolve(state.deleteRows);
  return node;
}

vi.mock('@/lib/db', () => {
  function dbSelect() {
    return makeSelectChain(() =>
      state.selectSeq.length > 0 ? (state.selectSeq.shift() as Rows) : state.selectRows,
    );
  }
  const db = {
    select: vi.fn(() => dbSelect()),
    update: vi.fn(() => makeUpdateChain()),
    insert: vi.fn(() => makeInsertChain()),
    delete: vi.fn(() => makeDeleteChain()),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => dbSelect()),
        update: vi.fn(() => makeUpdateChain()),
        insert: vi.fn(() => makeInsertChain()),
        delete: vi.fn(() => makeDeleteChain()),
      };
      return fn(tx);
    }),
  };
  return { db };
});

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ __col: name });
  return {
    brainInitiatives: {
      id: col('id'),
      clientId: col('client_id'),
      name: col('name'),
      slug: col('slug'),
      description: col('description'),
      status: col('status'),
      priority: col('priority'),
      ownerId: col('owner_id'),
      sponsorId: col('sponsor_id'),
      startDate: col('start_date'),
      targetDate: col('target_date'),
      closedAt: col('closed_at'),
      closeReason: col('close_reason'),
      lessonsLearned: col('lessons_learned'),
      confidentialityLevel: col('confidentiality_level'),
      createdBy: col('created_by'),
      createdAt: col('created_at'),
      updatedAt: col('updated_at'),
      $inferSelect: {},
      $inferInsert: {},
    },
    brainGoals: {
      id: col('id'),
      clientId: col('client_id'),
      initiativeId: col('initiative_id'),
      sortOrder: col('sort_order'),
      createdAt: col('created_at'),
      $inferSelect: {},
    },
    brainInitiativeLinks: {
      id: col('id'),
      clientId: col('client_id'),
      initiativeId: col('initiative_id'),
      entityType: col('entity_type'),
      entityId: col('entity_id'),
      pinned: col('pinned'),
      note: col('note'),
      createdAt: col('created_at'),
      createdBy: col('created_by'),
      $inferSelect: {},
    },
    brainNotes: {
      id: col('id'),
      clientId: col('client_id'),
      title: col('title'),
      $inferSelect: {},
    },
    brainAuditLogs: {
      $inferInsert: {},
    },
    brainTasks: {
      id: col('id'),
      clientId: col('client_id'),
      title: col('title'),
    },
    brainMeetings: {
      id: col('id'),
      clientId: col('client_id'),
      title: col('title'),
    },
    crmDeals: {
      id: col('id'),
      clientId: col('client_id'),
      title: col('title'),
    },
    crmCompanies: {
      id: col('id'),
      clientId: col('client_id'),
      name: col('name'),
    },
    brainPeople: {
      id: col('id'),
      clientId: col('client_id'),
      fullName: col('full_name'),
    },
    brainOrgUnits: {
      id: col('id'),
      clientId: col('client_id'),
      name: col('name'),
    },
    brainGlossaryTerms: {
      id: col('id'),
      clientId: col('client_id'),
      term: col('term'),
    },
  };
});

vi.mock('drizzle-orm', () => {
  // sql is both a tagged-template function AND has a `.as()` on the returned
  // chunk. Both the function itself and its return value need the `.as` method.
  function makeSqlChunk() {
    const chunk = { kind: 'sql', as: () => ({ kind: 'sql-aliased' }) };
    return chunk;
  }
  const sqlTag = () => makeSqlChunk();
  // drizzle also lets you call sql.raw() in some paths — stub it too.
  (sqlTag as unknown as { raw: typeof makeSqlChunk }).raw = makeSqlChunk;
  return {
    eq: (col: { __col: string }, val: unknown) => ({ kind: 'eq', col: col.__col, val }),
    and: (...parts: unknown[]) => ({ kind: 'and', parts }),
    asc: (col: { __col: string }) => ({ kind: 'asc', col: col.__col }),
    desc: (col: { __col: string }) => ({ kind: 'desc', col: col.__col }),
    sql: sqlTag,
    inArray: (col: { __col: string }, val: unknown) => ({ kind: 'inArray', col: col.__col, val }),
  };
});

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

vi.mock('@/lib/brain/dashboard', () => ({
  revalidateBrainDashboard: vi.fn((clientId: number) => {
    state.revalidateCalls.push(clientId);
  }),
}));

// Import AFTER mocks register.
import {
  createInitiative,
  listInitiatives,
  getInitiativeById,
  isLinkableEntityType,
  linkEntity,
  unlinkEntity,
  listInitiativeLinks,
  closeInitiative,
} from '@/lib/brain/initiatives';

beforeEach(resetState);

// ─── isLinkableEntityType ──────────────────────────────────────────────────

describe('isLinkableEntityType', () => {
  it('returns true for all known types', () => {
    const types = [
      'task', 'note', 'meeting', 'decision', 'topic', 'crm_deal',
      'crm_company', 'person', 'org_unit', 'glossary_term',
    ];
    for (const t of types) {
      expect(isLinkableEntityType(t)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isLinkableEntityType('unknown')).toBe(false);
    expect(isLinkableEntityType('')).toBe(false);
    expect(isLinkableEntityType('TASK')).toBe(false);
  });
});

// ─── createInitiative ──────────────────────────────────────────────────────

describe('createInitiative', () => {
  it('throws when name is blank after trim', async () => {
    await expect(
      createInitiative(1, null, { name: '   ' }),
    ).rejects.toThrow('name is required');
  });

  it('creates an initiative with minimal input and returns the row', async () => {
    // uniqueSlugForClient does a select (returns []) then createInitiative does an insert.
    state.selectSeq = [[]]; // slug collision check — no taken slugs
    state.insertRows = [{ id: 1, name: 'Test Initiative', slug: 'test-initiative', status: 'planned', clientId: 5 }];

    const result = await createInitiative(5, 99, { name: 'Test Initiative' });

    expect(result).toMatchObject({ id: 1, name: 'Test Initiative', status: 'planned' });
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_initiative.create');
  });

  it('calls revalidateBrainDashboard when status is active', async () => {
    state.selectSeq = [[]];
    state.insertRows = [{ id: 2, name: 'Active Init', slug: 'active-init', status: 'active', clientId: 5 }];

    await createInitiative(5, null, { name: 'Active Init', status: 'active' });

    expect(state.revalidateCalls).toContain(5);
  });

  it('does NOT call revalidateBrainDashboard when status is planned', async () => {
    state.selectSeq = [[]];
    state.insertRows = [{ id: 3, name: 'Planned', slug: 'planned', status: 'planned', clientId: 5 }];

    await createInitiative(5, null, { name: 'Planned' });

    expect(state.revalidateCalls).toHaveLength(0);
  });

  it('handles slug collision by reading from selectSeq', async () => {
    // First uniqueSlugForClient select returns a taken slug, then the insert succeeds.
    state.selectSeq = [[{ slug: 'my-initiative' }]]; // 'my-initiative' is taken
    state.insertRows = [{ id: 4, name: 'My Initiative', slug: 'my-initiative-2', status: 'planned', clientId: 1 }];

    const result = await createInitiative(1, null, { name: 'My Initiative' });
    expect(result).toMatchObject({ slug: 'my-initiative-2' });
  });
});

// ─── listInitiatives ──────────────────────────────────────────────────────

describe('listInitiatives', () => {
  it('returns an empty array when no rows match', async () => {
    state.selectRows = [];
    const result = await listInitiatives(1);
    expect(result).toEqual([]);
  });

  it('maps goalCount to a number', async () => {
    state.selectRows = [
      { id: 10, clientId: 1, name: 'X', slug: 'x', status: 'active', priority: 'medium',
        goalCount: '3', description: null, ownerId: null, sponsorId: null, startDate: null,
        targetDate: null, closedAt: null, closeReason: null, lessonsLearned: null,
        confidentialityLevel: 'standard', createdBy: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    const result = await listInitiatives(1);
    expect(result[0].goalCount).toBe(3);
    expect(typeof result[0].goalCount).toBe('number');
  });

  it('defaults goalCount to 0 when null', async () => {
    state.selectRows = [
      { id: 11, clientId: 1, name: 'Y', slug: 'y', status: 'planned', priority: 'low',
        goalCount: null, description: null, ownerId: null, sponsorId: null, startDate: null,
        targetDate: null, closedAt: null, closeReason: null, lessonsLearned: null,
        confidentialityLevel: 'standard', createdBy: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    const result = await listInitiatives(1);
    expect(result[0].goalCount).toBe(0);
  });

  it('applies all filter options without throwing', async () => {
    state.selectRows = [];
    // Exercise all conditional branches in listInitiatives
    await expect(
      listInitiatives(1, {
        status: ['active', 'planned'],
        ownerId: 7,
        priority: ['high', 'critical'],
        hasOpenGoals: true,
        targetDateBefore: new Date('2026-12-31'),
        limit: 10,
        offset: 5,
      }),
    ).resolves.toEqual([]);
  });

  it('handles single-element status array', async () => {
    state.selectRows = [];
    await expect(listInitiatives(1, { status: 'active' })).resolves.toEqual([]);
  });

  it('handles single-element priority array', async () => {
    state.selectRows = [];
    await expect(listInitiatives(1, { priority: 'high' })).resolves.toEqual([]);
  });

  it('clamps limit to [1, 100]', async () => {
    state.selectRows = [];
    // Negative / zero → clamped to 1; > 100 → clamped to 100. Just verify no error.
    await expect(listInitiatives(1, { limit: 0 })).resolves.toEqual([]);
    await expect(listInitiatives(1, { limit: 999 })).resolves.toEqual([]);
  });

  it('clamps offset to ≥0', async () => {
    state.selectRows = [];
    await expect(listInitiatives(1, { offset: -5 })).resolves.toEqual([]);
  });
});

// ─── getInitiativeById ─────────────────────────────────────────────────────

describe('getInitiativeById', () => {
  it('returns null when the initiative is not found', async () => {
    state.selectSeq = [[]] ; // first select → no rows
    const result = await getInitiativeById(1, 99);
    expect(result).toBeNull();
  });

  it('returns the initiative with no extras when opts are default', async () => {
    const initiative = { id: 20, clientId: 1, name: 'Found', slug: 'found', status: 'active' };
    state.selectSeq = [[initiative]];
    const result = await getInitiativeById(1, 20);
    expect(result).not.toBeNull();
    expect(result!.initiative).toEqual(initiative);
    expect(result!.goals).toBeUndefined();
    expect(result!.links).toBeUndefined();
  });

  it('returns goals when includeGoals is true', async () => {
    const initiative = { id: 21, clientId: 1, name: 'G', slug: 'g', status: 'active' };
    const goals = [{ id: 1, initiativeId: 21 }, { id: 2, initiativeId: 21 }];
    state.selectSeq = [[initiative], goals];
    const result = await getInitiativeById(1, 21, { includeGoals: true });
    expect(result!.goals).toEqual(goals);
  });

  it('returns links when includeLinks is true (empty link list)', async () => {
    const initiative = { id: 22, clientId: 1, name: 'L', slug: 'l', status: 'active' };
    // includeLinks calls listInitiativeLinks which does its own select → returns []
    state.selectSeq = [[initiative], []];
    const result = await getInitiativeById(1, 22, { includeLinks: true });
    expect(result!.links).toEqual({ byType: {}, items: [] });
  });

  it('aggregates byType counts from links', async () => {
    const initiative = { id: 23, clientId: 1, name: 'M', slug: 'm', status: 'active' };
    const linkRows = [
      { linkId: 1, entityType: 'task', entityId: 10, pinned: false, note: null, createdAt: new Date() },
      { linkId: 2, entityType: 'task', entityId: 11, pinned: false, note: null, createdAt: new Date() },
      { linkId: 3, entityType: 'note', entityId: 5, pinned: true, note: null, createdAt: new Date() },
    ];
    // getInitiativeById select → initiative row
    // listInitiativeLinks select → link rows (raw from brainInitiativeLinks)
    // Then listInitiativeLinks issues one select per entity type: task, note
    state.selectSeq = [
      [initiative],
      linkRows,       // listInitiativeLinks main query
      [{ id: 10, title: 'Task A' }, { id: 11, title: 'Task B' }], // task resolution
      [{ id: 5, title: 'My Note' }], // note resolution
    ];
    const result = await getInitiativeById(1, 23, { includeLinks: true });
    expect(result!.links!.byType).toEqual({ task: 2, note: 1 });
  });
});

// ─── linkEntity ────────────────────────────────────────────────────────────

describe('linkEntity', () => {
  it('throws for an invalid entityType', async () => {
    await expect(
      linkEntity(1, null, { initiativeId: 5, entityType: 'invalid' as never, entityId: 10 }),
    ).rejects.toThrow(/invalid entityType/);
  });

  it('throws when the initiative does not belong to this client', async () => {
    state.selectSeq = [[]]; // owner check returns no row
    await expect(
      linkEntity(1, null, { initiativeId: 5, entityType: 'task', entityId: 10 }),
    ).rejects.toThrow('initiative not found');
  });

  it('returns alreadyLinked=true when insert returns nothing (conflict)', async () => {
    state.selectSeq = [[{ id: 5 }]]; // owner check passes
    state.insertSeq = [[]]; // ON CONFLICT DO NOTHING → empty returning
    const result = await linkEntity(1, 99, { initiativeId: 5, entityType: 'task', entityId: 10 });
    expect(result).toEqual({ linkId: null, alreadyLinked: true });
    expect(state.auditCalls).toHaveLength(0); // no audit on conflict
  });

  it('returns linkId when insert succeeds and logs audit', async () => {
    state.selectSeq = [[{ id: 5 }]];
    state.insertSeq = [[{ id: 42 }]];
    const result = await linkEntity(1, 7, { initiativeId: 5, entityType: 'note', entityId: 3, pinned: true, note: 'important' });
    expect(result).toEqual({ linkId: 42, alreadyLinked: false });
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_initiative.link');
  });
});

// ─── unlinkEntity ──────────────────────────────────────────────────────────

describe('unlinkEntity', () => {
  it('throws for an invalid entityType', async () => {
    await expect(
      unlinkEntity(1, null, { initiativeId: 5, entityType: 'bogus' as never, entityId: 10 }),
    ).rejects.toThrow(/invalid entityType/);
  });

  it('returns false when no row was deleted', async () => {
    state.deleteRows = [];
    const result = await unlinkEntity(1, null, { initiativeId: 5, entityType: 'task', entityId: 10 });
    expect(result).toBe(false);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('returns true and logs audit when a row is deleted', async () => {
    state.deleteRows = [{ id: 99 }];
    const result = await unlinkEntity(1, 7, { initiativeId: 5, entityType: 'meeting', entityId: 20 });
    expect(result).toBe(true);
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_initiative.unlink');
  });
});

// ─── listInitiativeLinks ──────────────────────────────────────────────────

describe('listInitiativeLinks', () => {
  it('returns empty array when no links exist', async () => {
    state.selectRows = [];
    const result = await listInitiativeLinks(1, 5);
    expect(result).toEqual([]);
  });

  it('applies entityType filter without error', async () => {
    state.selectRows = [];
    const result = await listInitiativeLinks(1, 5, { entityType: 'task' });
    expect(result).toEqual([]);
  });

  it('clamps limit and offset', async () => {
    state.selectRows = [];
    await expect(listInitiativeLinks(1, 5, { limit: 0, offset: -1 })).resolves.toEqual([]);
    await expect(listInitiativeLinks(1, 5, { limit: 9999 })).resolves.toEqual([]);
  });

  it('resolves task titles', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 1, entityType: 'task', entityId: 10, pinned: false, note: null, createdAt: now }],
      [{ id: 10, title: 'My Task' }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBe('My Task');
    expect(result[0].entityType).toBe('task');
  });

  it('resolves note titles', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 2, entityType: 'note', entityId: 20, pinned: true, note: 'see this', createdAt: now }],
      [{ id: 20, title: 'Important Note' }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBe('Important Note');
  });

  it('resolves meeting titles', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 3, entityType: 'meeting', entityId: 30, pinned: false, note: null, createdAt: now }],
      [{ id: 30, title: 'Kickoff' }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBe('Kickoff');
  });

  it('resolves crm_deal titles', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 4, entityType: 'crm_deal', entityId: 40, pinned: false, note: null, createdAt: now }],
      [{ id: 40, title: 'Big Deal' }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBe('Big Deal');
  });

  it('resolves crm_company titles via name field', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 5, entityType: 'crm_company', entityId: 50, pinned: false, note: null, createdAt: now }],
      [{ id: 50, name: 'Acme Corp' }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBe('Acme Corp');
  });

  it('resolves person titles via fullName field', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 6, entityType: 'person', entityId: 60, pinned: false, note: null, createdAt: now }],
      [{ id: 60, name: 'Alice Smith' }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBe('Alice Smith');
  });

  it('resolves org_unit titles', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 7, entityType: 'org_unit', entityId: 70, pinned: false, note: null, createdAt: now }],
      [{ id: 70, name: 'Engineering' }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBe('Engineering');
  });

  it('resolves glossary_term titles via term field', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 8, entityType: 'glossary_term', entityId: 80, pinned: false, note: null, createdAt: now }],
      [{ id: 80, term: 'MRR' }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBe('MRR');
  });

  it('returns title=null for decision entity type (not yet shipped)', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 9, entityType: 'decision', entityId: 90, pinned: false, note: null, createdAt: now }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBeNull();
    expect(result[0].entityType).toBe('decision');
  });

  it('returns title=null for topic entity type (not yet shipped)', async () => {
    const now = new Date();
    state.selectSeq = [
      [{ linkId: 10, entityType: 'topic', entityId: 91, pinned: false, note: null, createdAt: now }],
    ];
    const result = await listInitiativeLinks(1, 5);
    expect(result[0].title).toBeNull();
  });
});

// ─── closeInitiative happy paths ──────────────────────────────────────────

describe('closeInitiative — happy paths', () => {
  it('returns null when the initiative row is not found in transaction', async () => {
    // tx.select inside transaction returns no row
    state.selectSeq = [[]];
    const result = await closeInitiative(1, null, 99, { outcome: 'completed', reason: 'done' });
    expect(result).toBeNull();
  });

  it('closes with reason only — no note created, returns initiative', async () => {
    const before = { id: 50, clientId: 1, name: 'Test', status: 'active', closeReason: null, lessonsLearned: null };
    const updated = { id: 50, clientId: 1, name: 'Test', status: 'completed', closedAt: new Date() };
    state.selectSeq = [[before]];
    state.updateRows = [updated];
    state.insertSeq = []; // audit insert — brainAuditLogs (no note insert)

    const result = await closeInitiative(1, null, 50, { outcome: 'completed', reason: 'All done' });

    expect(result).not.toBeNull();
    expect(result!.initiative).toEqual(updated);
    expect(result!.lessonsLearnedNoteId).toBeNull();
    expect(state.revalidateCalls).toContain(1);
  });

  it('closes with lessonsLearned — creates note and back-link', async () => {
    const before = { id: 51, clientId: 1, name: 'WithLessons', status: 'active', closeReason: null, lessonsLearned: null };
    const updated = { id: 51, clientId: 1, name: 'WithLessons', status: 'completed', closedAt: new Date() };

    state.selectSeq = [[before]]; // tx.select for lock/verify
    state.updateRows = [updated]; // tx.update returning

    // insertSeq: [note returning, link returning (onConflictDoNothing), audit returning]
    state.insertSeq = [
      [{ id: 77 }], // brainNotes insert → noteId = 77
      [],           // brainInitiativeLinks insert (onConflictDoNothing — empty ok)
      [],           // brainAuditLogs insert
    ];

    const result = await closeInitiative(1, 9, 51, {
      outcome: 'cancelled',
      lessonsLearned: 'Ship smaller batches next time.',
    });

    expect(result).not.toBeNull();
    expect(result!.initiative).toEqual(updated);
    expect(result!.lessonsLearnedNoteId).toBe(77);
    expect(state.revalidateCalls).toContain(1);
  });
});
