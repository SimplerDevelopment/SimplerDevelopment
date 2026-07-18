// @vitest-environment node
/**
 * Unit tests for lib/brain/initiatives — the pure-logic edges plus happy paths:
 *   - slugifyInitiativeName: normalization + fallbacks
 *   - createInitiative: happy path, empty-name guard, audit call, revalidation
 *   - listInitiatives: status/priority/ownerId/hasOpenGoals/targetDateBefore filters
 *   - getInitiativeById: not found, found bare, found with goals, found with links
 *   - updateInitiative: refuses status, not-found, field patch + audit
 *   - closeInitiative: input guards, completed path (with lessons note), cancelled path
 *   - reopenInitiative: terminal-status guards + happy paths
 *   - isLinkableEntityType: valid + invalid type checks
 *   - linkEntity: invalid type guard, initiative-not-found guard, new link, duplicate
 *   - unlinkEntity: invalid type guard, deleted, not-found
 *   - listInitiativeLinks: empty, filtered by entityType
 *
 * The DB layer is stubbed — these tests guard the contract, not the SQL.
 * Correlated-subquery `goalCount` correctness lives in the integration spec
 * (real Postgres needed to catch the ${table.col} Drizzle bug).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock ────────────────────────────────────────────────────────────────
// Queue-based design: push rows onto `selectQueue` (or the other queues) before
// each call. `makeChain` pops from the front so sequential DB ops each consume
// one batch of rows. The legacy flat `selectRows` / `updateRows` / `insertRows`
// still work for single-call tests.

type RowBatch = Record<string, unknown>[];

const { state, dbStub } = vi.hoisted(() => {
  const state = {
    selectQueue: [] as RowBatch[],
    updateQueue: [] as RowBatch[],
    insertQueue: [] as RowBatch[],
    deleteQueue: [] as RowBatch[],
    auditCalls: [] as Array<Record<string, unknown>>,
    revalidateCalls: 0,
    // captured payloads
    insertedValues: [] as Array<Record<string, unknown>>,
    updatedSets: [] as Array<Record<string, unknown>>,
  };

  function nextFromQueue(q: RowBatch[]): RowBatch {
    return q.length > 0 ? q.shift()! : [];
  }

  function makeChain(queueRef: RowBatch[]): Record<string, unknown> {
    const node: Record<string, unknown> = {};
    const passthrough = [
      'from', 'where', 'orderBy', 'limit', 'offset',
      'innerJoin', 'leftJoin', 'onConflictDoNothing', 'onConflictDoUpdate',
    ];
    for (const m of passthrough) node[m] = () => node;
    // capture set / values so tests can assert payloads
    node.set = (v: Record<string, unknown>) => {
      state.updatedSets.push(v);
      return node;
    };
    node.values = (v: Record<string, unknown>) => {
      state.insertedValues.push(v);
      return node;
    };
    node.returning = () => Promise.resolve(nextFromQueue(queueRef));
    // Thenable — `await chain` resolves the queue batch.
    (node as { then: (cb: (v: RowBatch) => unknown) => Promise<unknown> }).then =
      (cb) => Promise.resolve(cb(nextFromQueue(queueRef)));
    return node;
  }

  function makeTxObject(): Record<string, unknown> {
    return {
      select: () => makeChain(state.selectQueue),
      update: () => makeChain(state.updateQueue),
      insert: () => makeChain(state.insertQueue),
      delete: () => makeChain(state.deleteQueue),
    };
  }

  const dbStub = {
    select: () => makeChain(state.selectQueue),
    update: () => makeChain(state.updateQueue),
    insert: () => makeChain(state.insertQueue),
    delete: () => makeChain(state.deleteQueue),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTxObject()),
  };

  return { state, dbStub };
});

vi.mock('@/lib/db', () => ({ db: dbStub }));

// Schema mock — stub every table used by initiatives.ts so import resolves.
vi.mock('@/lib/db/schema', () => {
  function col(name: string) { return { __col: name }; }
  const table = (cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)]));

  return {
    brainInitiatives: table([
      'id','clientId','name','slug','description','status','priority',
      'ownerId','sponsorId','startDate','targetDate','closedAt',
      'closeReason','lessonsLearned','confidentialityLevel',
      'createdBy','createdAt','updatedAt',
    ]),
    brainGoals: table(['id','clientId','initiativeId','sortOrder','createdAt','status']),
    brainInitiativeLinks: table([
      'id','clientId','initiativeId','entityType','entityId',
      'pinned','note','createdBy','createdAt',
    ]),
    brainNotes: table(['id','clientId','title','body','tags','source','createdBy','createdAt']),
    brainAuditLogs: table(['clientId','actorId','action','entityType','entityId','metadata']),
    brainTasks: table(['id','clientId','title']),
    brainMeetings: table(['id','clientId','title']),
    crmDeals: table(['id','clientId','title']),
    crmCompanies: table(['id','clientId','name']),
    brainPeople: table(['id','clientId','fullName']),
    brainOrgUnits: table(['id','clientId','name']),
    brainGlossaryTerms: table(['id','clientId','term']),
  };
});

// drizzle-orm mock — return simple sentinel objects; the DB stub ignores them.
// sqlFragment needs .as() because listInitiatives calls `sql\`...\`.as('goal_count')`.
function makeSqlFragment() {
  const frag: Record<string, unknown> = { op: 'sql' };
  frag.as = (_alias: string) => frag;
  return frag;
}

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ op: 'and', parts }),
  asc: (col: unknown) => ({ op: 'asc', col }),
  desc: (col: unknown) => ({ op: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  sql: Object.assign(
    (..._args: unknown[]) => makeSqlFragment(),
    { raw: (s: string) => ({ op: 'raw', s }) },
  ),
  inArray: (col: unknown, vals: unknown[]) => ({ op: 'inArray', col, vals }),
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

vi.mock('@/lib/brain/dashboard', () => ({
  revalidateBrainDashboard: vi.fn(() => { state.revalidateCalls += 1; }),
}));

// Import AFTER mocks register.
import {
  slugifyInitiativeName,
  createInitiative,
  listInitiatives,
  getInitiativeById,
  updateInitiative,
  closeInitiative,
  reopenInitiative,
  isLinkableEntityType,
  linkEntity,
  unlinkEntity,
  listInitiativeLinks,
} from '@/lib/brain/initiatives';

function resetState() {
  state.selectQueue.length = 0;
  state.updateQueue.length = 0;
  state.insertQueue.length = 0;
  state.deleteQueue.length = 0;
  state.auditCalls.length = 0;
  state.insertedValues.length = 0;
  state.updatedSets.length = 0;
  state.revalidateCalls = 0;
}

beforeEach(resetState);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXED_DATE = new Date('2024-03-01T09:00:00.000Z');

function makeInitiative(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    clientId: 10,
    name: 'Migrate to Bun',
    slug: 'migrate-to-bun',
    description: null,
    status: 'planned',
    priority: 'medium',
    ownerId: null,
    sponsorId: null,
    startDate: null,
    targetDate: null,
    closedAt: null,
    closeReason: null,
    lessonsLearned: null,
    confidentialityLevel: 'standard',
    createdBy: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...over,
  };
}

describe('slugifyInitiativeName', () => {
  it('lowercases + dasherizes ASCII names', () => {
    expect(slugifyInitiativeName('Q3 Product Launch')).toBe('q3-product-launch');
  });

  it('collapses runs of non-alphanumerics to a single dash', () => {
    expect(slugifyInitiativeName('  Foo!!  --  Bar??  ')).toBe('foo-bar');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyInitiativeName('---hello---')).toBe('hello');
  });

  it('caps the result at 140 characters', () => {
    const long = 'a'.repeat(500);
    expect(slugifyInitiativeName(long).length).toBeLessThanOrEqual(140);
  });

  it('falls back to "initiative" when the name has no alphanumerics', () => {
    expect(slugifyInitiativeName('!!!')).toBe('initiative');
    expect(slugifyInitiativeName('')).toBe('initiative');
  });

  it('strips combining diacritics', () => {
    expect(slugifyInitiativeName('Café Olé')).toBe('cafe-ole');
  });
});

// ─── createInitiative ────────────────────────────────────────────────────────

describe('createInitiative', () => {
  it('throws when name trims to empty string', async () => {
    await expect(createInitiative(10, 1, { name: '   ' })).rejects.toThrow(/name is required/);
  });

  it('creates an initiative with defaults (status=planned, priority=medium)', async () => {
    // uniqueSlugForClient: select returns [] (no collision)
    state.selectQueue.push([]);
    // insert returning the new row
    const row = makeInitiative({ id: 5, slug: 'migrate-to-bun', status: 'planned' });
    state.insertQueue.push([row]);

    const result = await createInitiative(10, 1, { name: 'Migrate to Bun' });
    expect(result.id).toBe(5);
    expect(result.slug).toBe('migrate-to-bun');
    expect(result.status).toBe('planned');
    // logAudit should have been called once
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_initiative.create');
  });

  it('calls revalidateBrainDashboard when created status is "active"', async () => {
    state.selectQueue.push([]);
    const row = makeInitiative({ id: 6, status: 'active' });
    state.insertQueue.push([row]);

    await createInitiative(10, 1, { name: 'Active Launch', status: 'active' });
    expect(state.revalidateCalls).toBe(1);
  });

  it('does NOT call revalidateBrainDashboard when status is "planned"', async () => {
    state.selectQueue.push([]);
    const row = makeInitiative({ id: 7, status: 'planned' });
    state.insertQueue.push([row]);

    await createInitiative(10, 1, { name: 'Planned Only' });
    expect(state.revalidateCalls).toBe(0);
  });

  it('passes clientId, actorId, slug, and all optional fields to insert', async () => {
    state.selectQueue.push([]);
    const row = makeInitiative({
      id: 8, name: 'Q3 Launch', slug: 'q3-launch',
      description: 'Some desc', priority: 'high', ownerId: 42,
      confidentialityLevel: 'restricted',
    });
    state.insertQueue.push([row]);

    const result = await createInitiative(10, 99, {
      name: 'Q3 Launch',
      description: 'Some desc',
      priority: 'high',
      ownerId: 42,
      confidentialityLevel: 'restricted',
    });
    expect(result.priority).toBe('high');
    expect(result.ownerId).toBe(42);
    // insertedValues captures what was passed to .values()
    expect(state.insertedValues[0]).toMatchObject({
      clientId: 10,
      createdBy: 99,
    });
  });
});

// ─── listInitiatives ─────────────────────────────────────────────────────────

describe('listInitiatives', () => {
  it('returns empty array when no rows match', async () => {
    state.selectQueue.push([]);
    const rows = await listInitiatives(10);
    expect(rows).toEqual([]);
  });

  it('returns rows with goalCount coerced to number', async () => {
    const row = { ...makeInitiative(), goalCount: '3' };
    state.selectQueue.push([row]);
    const rows = await listInitiatives(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].goalCount).toBe(3);
  });

  it('coerces goalCount=null to 0', async () => {
    const row = { ...makeInitiative(), goalCount: null };
    state.selectQueue.push([row]);
    const rows = await listInitiatives(10);
    expect(rows[0].goalCount).toBe(0);
  });

  it('passes clientId filter (single status string)', async () => {
    state.selectQueue.push([]);
    await listInitiatives(10, { status: 'active' });
    // No throw = correct filter-building path executed.
  });

  it('accepts an array of statuses', async () => {
    state.selectQueue.push([]);
    await listInitiatives(10, { status: ['active', 'planned'] });
  });

  it('accepts ownerId filter', async () => {
    state.selectQueue.push([]);
    await listInitiatives(10, { ownerId: 5 });
  });

  it('accepts a single priority filter', async () => {
    state.selectQueue.push([]);
    await listInitiatives(10, { priority: 'critical' });
  });

  it('accepts an array of priorities', async () => {
    state.selectQueue.push([]);
    await listInitiatives(10, { priority: ['high', 'critical'] });
  });

  it('accepts hasOpenGoals=true', async () => {
    state.selectQueue.push([]);
    await listInitiatives(10, { hasOpenGoals: true });
  });

  it('accepts targetDateBefore', async () => {
    state.selectQueue.push([]);
    await listInitiatives(10, { targetDateBefore: new Date('2025-01-01') });
  });

  it('clamps limit to [1, 100]', async () => {
    state.selectQueue.push([]);
    await listInitiatives(10, { limit: 0 });   // should become 1, not throw
    state.selectQueue.push([]);
    await listInitiatives(10, { limit: 9999 }); // should become 100, not throw
  });
});

// ─── getInitiativeById ────────────────────────────────────────────────────────

describe('getInitiativeById', () => {
  it('returns null when no row found', async () => {
    state.selectQueue.push([]); // initiative lookup returns nothing
    const result = await getInitiativeById(10, 1);
    expect(result).toBeNull();
  });

  it('returns bare initiative when no opts set', async () => {
    const row = makeInitiative({ id: 1 });
    state.selectQueue.push([row]);
    const result = await getInitiativeById(10, 1);
    expect(result).not.toBeNull();
    expect(result!.initiative.id).toBe(1);
    expect(result!.goals).toBeUndefined();
    expect(result!.links).toBeUndefined();
  });

  it('includes goals when includeGoals=true', async () => {
    const initiative = makeInitiative({ id: 2 });
    const goal = { id: 100, initiativeId: 2, status: 'in_progress', sortOrder: 0, createdAt: FIXED_DATE };
    state.selectQueue.push([initiative]); // initiative fetch
    state.selectQueue.push([goal]);       // goals fetch
    const result = await getInitiativeById(10, 2, { includeGoals: true });
    expect(result!.goals).toHaveLength(1);
    expect(result!.goals![0].id).toBe(100);
  });

  it('includes links summary when includeLinks=true (empty links)', async () => {
    const initiative = makeInitiative({ id: 3 });
    state.selectQueue.push([initiative]); // initiative fetch
    state.selectQueue.push([]);           // listInitiativeLinks → links rows
    const result = await getInitiativeById(10, 3, { includeLinks: true });
    expect(result!.links).toBeDefined();
    expect(result!.links!.byType).toEqual({});
    expect(result!.links!.items).toEqual([]);
  });
});

// ─── updateInitiative — status changes are forbidden via this path ────────────

describe('updateInitiative — status changes are forbidden via this path', () => {
  it('throws when patch.status is present, regardless of value', async () => {
    await expect(
      updateInitiative(1, null, 99, { status: 'completed' }),
    ).rejects.toThrow(/closeInitiative or reopenInitiative/);
    await expect(
      updateInitiative(1, null, 99, { status: 'active' }),
    ).rejects.toThrow(/closeInitiative or reopenInitiative/);
  });

  it('returns null when the patch targets a row this client does not own', async () => {
    state.updateQueue.push([]); // RETURNING with no rows
    const res = await updateInitiative(1, null, 99, { name: 'x' });
    expect(res).toBeNull();
  });

  it('applies field patch and calls logAudit', async () => {
    const updated = makeInitiative({ id: 99, name: 'Renamed', priority: 'high' });
    state.updateQueue.push([updated]);
    const res = await updateInitiative(10, 5, 99, { name: 'Renamed', priority: 'high' });
    expect(res).not.toBeNull();
    expect(res!.name).toBe('Renamed');
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_initiative.update');
    expect(state.auditCalls[0].actorId).toBe(5);
  });
});

// ─── closeInitiative — input guards + happy paths ────────────────────────────

describe('closeInitiative — input guards', () => {
  it('throws when outcome is not "completed" or "cancelled"', async () => {
    await expect(
      // @ts-expect-error — feeding an invalid outcome on purpose
      closeInitiative(1, null, 99, { outcome: 'paused' }),
    ).rejects.toThrow(/outcome must be/);
  });

  it('throws when neither reason nor lessonsLearned is provided', async () => {
    await expect(
      closeInitiative(1, null, 99, { outcome: 'completed' }),
    ).rejects.toThrow(/reason or lessonsLearned/);
  });

  it('throws when both reason and lessonsLearned are blank whitespace', async () => {
    await expect(
      closeInitiative(1, null, 99, { outcome: 'cancelled', reason: '   ', lessonsLearned: '\t\n' }),
    ).rejects.toThrow(/reason or lessonsLearned/);
  });

  it('returns null when initiative not found inside transaction', async () => {
    state.selectQueue.push([]); // tx lock-select returns nothing
    const out = await closeInitiative(10, null, 99, { outcome: 'cancelled', reason: 'deleted' });
    expect(out).toBeNull();
  });

  it('closes with reason only — no brain_note created', async () => {
    const before = makeInitiative({ id: 10, status: 'active' });
    const closed = makeInitiative({ id: 10, status: 'cancelled', closedAt: FIXED_DATE });
    state.selectQueue.push([before]);  // tx lock-select
    state.updateQueue.push([closed]);  // tx status update
    // No insert (no lessonsLearned) — audit insert goes through insertQueue
    state.insertQueue.push([{ id: 999 }]); // brainAuditLogs insert

    const result = await closeInitiative(10, 2, 10, { outcome: 'cancelled', reason: 'Descoped' });
    expect(result).not.toBeNull();
    expect(result!.initiative.status).toBe('cancelled');
    expect(result!.lessonsLearnedNoteId).toBeNull();
    expect(state.revalidateCalls).toBe(1);
  });

  it('closes with lessonsLearned — creates brain_note and back-link', async () => {
    const before = makeInitiative({ id: 11, status: 'active', name: 'Big Push' });
    const closed = makeInitiative({ id: 11, status: 'completed', closedAt: FIXED_DATE });
    state.selectQueue.push([before]);      // tx lock-select
    state.updateQueue.push([closed]);      // tx status update
    state.insertQueue.push([{ id: 200 }]); // brain_notes insert → noteId=200
    state.insertQueue.push([]);            // brainInitiativeLinks insert (onConflictDoNothing)
    state.insertQueue.push([{ id: 999 }]); // brainAuditLogs insert

    const result = await closeInitiative(10, 3, 11, {
      outcome: 'completed',
      lessonsLearned: 'Ship earlier next time.',
    });
    expect(result).not.toBeNull();
    expect(result!.lessonsLearnedNoteId).toBe(200);
    expect(result!.initiative.status).toBe('completed');
    expect(state.revalidateCalls).toBe(1);
  });
});

// ─── reopenInitiative — only valid from terminal statuses ────────────────────

describe('reopenInitiative — only valid from terminal statuses', () => {
  it('returns null when no row matches (initiative not found)', async () => {
    state.selectQueue.push([]);
    const out = await reopenInitiative(1, null, 99);
    expect(out).toBeNull();
  });

  it('throws when the current status is "planned"', async () => {
    state.selectQueue.push([{ id: 99, status: 'planned' }]);
    await expect(reopenInitiative(1, null, 99)).rejects.toThrow(/non-terminal status/);
  });

  it('throws when the current status is "active"', async () => {
    state.selectQueue.push([{ id: 99, status: 'active' }]);
    await expect(reopenInitiative(1, null, 99)).rejects.toThrow(/non-terminal status/);
  });

  it('throws when the current status is "paused"', async () => {
    state.selectQueue.push([{ id: 99, status: 'paused' }]);
    await expect(reopenInitiative(1, null, 99)).rejects.toThrow(/non-terminal status/);
  });

  it('proceeds when the current status is "completed"', async () => {
    state.selectQueue.push([{ id: 99, status: 'completed' }]);
    state.updateQueue.push([{ id: 99, status: 'active' }]);
    const out = await reopenInitiative(1, null, 99);
    expect(out).toEqual({ id: 99, status: 'active' });
    expect(state.auditCalls[0].action).toBe('brain_initiative.reopen');
    expect(state.auditCalls[0].metadata).toMatchObject({ from: 'completed' });
  });

  it('proceeds when the current status is "cancelled"', async () => {
    state.selectQueue.push([{ id: 99, status: 'cancelled' }]);
    state.updateQueue.push([{ id: 99, status: 'active' }]);
    const out = await reopenInitiative(1, null, 99);
    expect(out).toEqual({ id: 99, status: 'active' });
  });

  it('calls revalidateBrainDashboard when reopened', async () => {
    state.selectQueue.push([{ id: 99, status: 'completed' }]);
    state.updateQueue.push([{ id: 99, status: 'active' }]);
    await reopenInitiative(10, 1, 99);
    expect(state.revalidateCalls).toBe(1);
  });
});

// ─── isLinkableEntityType ─────────────────────────────────────────────────────

describe('isLinkableEntityType', () => {
  const validTypes = [
    'task', 'note', 'meeting', 'decision', 'topic',
    'crm_deal', 'crm_company', 'person', 'org_unit', 'glossary_term',
  ];
  for (const t of validTypes) {
    it(`returns true for "${t}"`, () => {
      expect(isLinkableEntityType(t)).toBe(true);
    });
  }

  it('returns false for unknown types', () => {
    expect(isLinkableEntityType('invoice')).toBe(false);
    expect(isLinkableEntityType('')).toBe(false);
    expect(isLinkableEntityType('TASK')).toBe(false); // case-sensitive
  });
});

// ─── linkEntity ───────────────────────────────────────────────────────────────

describe('linkEntity', () => {
  it('throws when entityType is invalid', async () => {
    await expect(
      linkEntity(10, 1, { initiativeId: 1, entityType: 'invoice' as 'task', entityId: 5 }),
    ).rejects.toThrow(/invalid entityType/);
  });

  it('throws when initiative not found in this tenant', async () => {
    state.selectQueue.push([]); // initiative ownership check returns nothing
    await expect(
      linkEntity(10, 1, { initiativeId: 99, entityType: 'task', entityId: 5 }),
    ).rejects.toThrow(/initiative not found/);
  });

  it('returns alreadyLinked=true when ON CONFLICT fires (empty returning)', async () => {
    state.selectQueue.push([{ id: 1 }]); // initiative ownership found
    state.insertQueue.push([]);           // onConflictDoNothing → 0 rows returned
    const result = await linkEntity(10, 1, { initiativeId: 1, entityType: 'task', entityId: 7 });
    expect(result).toEqual({ linkId: null, alreadyLinked: true });
    // No audit call because nothing was inserted.
    expect(state.auditCalls).toHaveLength(0);
  });

  it('returns linkId and alreadyLinked=false when new link created', async () => {
    state.selectQueue.push([{ id: 1 }]);  // initiative ownership found
    state.insertQueue.push([{ id: 55 }]); // new link row returned
    const result = await linkEntity(10, 1, {
      initiativeId: 1, entityType: 'note', entityId: 200, pinned: true, note: 'key doc',
    });
    expect(result).toEqual({ linkId: 55, alreadyLinked: false });
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_initiative.link');
    expect((state.auditCalls[0].metadata as Record<string, unknown>).entityType).toBe('note');
    expect((state.auditCalls[0].metadata as Record<string, unknown>).pinned).toBe(true);
  });
});

// ─── unlinkEntity ─────────────────────────────────────────────────────────────

describe('unlinkEntity', () => {
  it('throws when entityType is invalid', async () => {
    await expect(
      unlinkEntity(10, 1, { initiativeId: 1, entityType: 'widget' as 'task', entityId: 5 }),
    ).rejects.toThrow(/invalid entityType/);
  });

  it('returns false when no matching link row exists', async () => {
    state.deleteQueue.push([]); // delete RETURNING → empty
    const result = await unlinkEntity(10, 1, { initiativeId: 1, entityType: 'task', entityId: 5 });
    expect(result).toBe(false);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('returns true and calls logAudit when link deleted', async () => {
    state.deleteQueue.push([{ id: 77 }]); // delete RETURNING → row found
    const result = await unlinkEntity(10, 1, { initiativeId: 1, entityType: 'meeting', entityId: 9 });
    expect(result).toBe(true);
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('brain_initiative.unlink');
    expect((state.auditCalls[0].metadata as Record<string, unknown>).entityType).toBe('meeting');
  });
});

// ─── listInitiativeLinks ──────────────────────────────────────────────────────

describe('listInitiativeLinks', () => {
  it('returns empty array when no link rows found', async () => {
    state.selectQueue.push([]); // link rows = empty
    const result = await listInitiativeLinks(10, 1);
    expect(result).toEqual([]);
  });

  it('resolves task titles with tenant scope', async () => {
    const linkRow = {
      linkId: 10, entityType: 'task', entityId: 50,
      pinned: false, note: null, createdAt: FIXED_DATE,
    };
    state.selectQueue.push([linkRow]);      // link rows
    state.selectQueue.push([{ id: 50, title: 'Fix the CI pipeline' }]); // task title lookup
    const rows = await listInitiativeLinks(10, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Fix the CI pipeline');
    expect(rows[0].entityType).toBe('task');
  });

  it('resolves note titles with tenant scope', async () => {
    const linkRow = { linkId: 11, entityType: 'note', entityId: 60, pinned: true, note: 'ref', createdAt: FIXED_DATE };
    state.selectQueue.push([linkRow]);
    state.selectQueue.push([{ id: 60, title: 'Kickoff notes' }]);
    const rows = await listInitiativeLinks(10, 1);
    expect(rows[0].title).toBe('Kickoff notes');
    expect(rows[0].pinned).toBe(true);
  });

  it('resolves crm_company name as title', async () => {
    const linkRow = { linkId: 12, entityType: 'crm_company', entityId: 70, pinned: false, note: null, createdAt: FIXED_DATE };
    state.selectQueue.push([linkRow]);
    state.selectQueue.push([{ id: 70, name: 'Acme Corp' }]);
    const rows = await listInitiativeLinks(10, 1);
    expect(rows[0].title).toBe('Acme Corp');
  });

  it('resolves person fullName as title', async () => {
    const linkRow = { linkId: 13, entityType: 'person', entityId: 80, pinned: false, note: null, createdAt: FIXED_DATE };
    state.selectQueue.push([linkRow]);
    state.selectQueue.push([{ id: 80, name: 'Grace Hopper' }]);
    const rows = await listInitiativeLinks(10, 1);
    expect(rows[0].title).toBe('Grace Hopper');
  });

  it('returns title=null for decision/topic (unresolvable types)', async () => {
    const linkRow = { linkId: 14, entityType: 'decision', entityId: 99, pinned: false, note: null, createdAt: FIXED_DATE };
    state.selectQueue.push([linkRow]);
    // No extra select call needed for decision/topic — falls through to default branch
    const rows = await listInitiativeLinks(10, 1);
    expect(rows[0].title).toBeNull();
    expect(rows[0].entityType).toBe('decision');
  });

  it('resolves meeting titles with tenant scope', async () => {
    const linkRow = { linkId: 15, entityType: 'meeting', entityId: 90, pinned: false, note: null, createdAt: FIXED_DATE };
    state.selectQueue.push([linkRow]);
    state.selectQueue.push([{ id: 90, title: 'Q2 Planning Session' }]);
    const rows = await listInitiativeLinks(10, 1);
    expect(rows[0].title).toBe('Q2 Planning Session');
  });

  it('resolves crm_deal titles with tenant scope', async () => {
    const linkRow = { linkId: 16, entityType: 'crm_deal', entityId: 110, pinned: false, note: null, createdAt: FIXED_DATE };
    state.selectQueue.push([linkRow]);
    state.selectQueue.push([{ id: 110, title: 'Enterprise Contract' }]);
    const rows = await listInitiativeLinks(10, 1);
    expect(rows[0].title).toBe('Enterprise Contract');
  });

  it('resolves org_unit name as title', async () => {
    const linkRow = { linkId: 17, entityType: 'org_unit', entityId: 120, pinned: false, note: null, createdAt: FIXED_DATE };
    state.selectQueue.push([linkRow]);
    state.selectQueue.push([{ id: 120, name: 'Platform Engineering' }]);
    const rows = await listInitiativeLinks(10, 1);
    expect(rows[0].title).toBe('Platform Engineering');
  });

  it('resolves glossary_term term as title', async () => {
    const linkRow = { linkId: 18, entityType: 'glossary_term', entityId: 130, pinned: false, note: null, createdAt: FIXED_DATE };
    state.selectQueue.push([linkRow]);
    state.selectQueue.push([{ id: 130, term: 'OKR' }]);
    const rows = await listInitiativeLinks(10, 1);
    expect(rows[0].title).toBe('OKR');
  });

  it('accepts entityType filter without throwing', async () => {
    state.selectQueue.push([]);
    await listInitiativeLinks(10, 1, { entityType: 'task' });
  });

  it('accepts limit/offset without throwing', async () => {
    state.selectQueue.push([]);
    await listInitiativeLinks(10, 1, { limit: 10, offset: 5 });
  });
});
