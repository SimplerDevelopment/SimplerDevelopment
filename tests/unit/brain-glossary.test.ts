// @vitest-environment node
/**
 * Pure-function unit tests for the brain glossary helpers:
 *   - slug derivation
 *   - pruneRelatedTermIdsFromList (the cascade-prune diff)
 *   - lookupGlossary scoring (DB mocked to return canned rows)
 *   - bulkImportGlossary 200-cap enforcement
 *
 * The DB-coupled paths (listGlossaryTerms, getGlossaryTermById,
 * createGlossaryTerm/updateGlossaryTerm/deleteGlossaryTerm round-trip) are
 * exercised at the integration layer in tests/integration/api/brain/glossary.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock surface ────────────────────────────────────────────────────────────

interface FakeRow {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
  definition: string;
  aliases: string[];
  relatedTermIds?: number[];
}

const state: {
  rowsForLookup: FakeRow[];
  rowsForSlugCollision: { slug: string }[];
  rowsForDelete: FakeRow | null;
  referrers: Array<{ id: number; relatedTermIds: number[] }>;
  inserted: unknown[];
  updated: unknown[];
  deleted: number;
  auditCalls: Array<{ action: string; metadata?: Record<string, unknown> }>;
} = {
  rowsForLookup: [],
  rowsForSlugCollision: [],
  rowsForDelete: null,
  referrers: [],
  inserted: [],
  updated: [],
  deleted: 0,
  auditCalls: [],
};

// Track which select() call we're servicing so we can return different canned
// data for slug-collision check / lookup / delete pre-read / referrer scan.
let selectCallCounter = 0;

function resetState() {
  state.rowsForLookup = [];
  state.rowsForSlugCollision = [];
  state.rowsForDelete = null;
  state.referrers = [];
  state.inserted = [];
  state.updated = [];
  state.deleted = 0;
  state.auditCalls = [];
  selectCallCounter = 0;
}

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: { action: string; metadata?: Record<string, unknown> }) => {
    state.auditCalls.push({ action: args.action, metadata: args.metadata });
  }),
}));

vi.mock('@/lib/db/schema', () => ({
  brainGlossaryTerms: {
    id: { __col: 'id' },
    clientId: { __col: 'clientId' },
    term: { __col: 'term' },
    slug: { __col: 'slug' },
    definition: { __col: 'definition' },
    shortDefinition: { __col: 'shortDefinition' },
    aliases: { __col: 'aliases' },
    status: { __col: 'status' },
    category: { __col: 'category' },
    ownerId: { __col: 'ownerId' },
    relatedTermIds: { __col: 'relatedTermIds' },
    source: { __col: 'source' },
    reviewItemId: { __col: 'reviewItemId' },
    createdBy: { __col: 'createdBy' },
    createdAt: { __col: 'createdAt' },
    updatedAt: { __col: 'updatedAt' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
  and: () => ({}),
  inArray: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  sql: Object.assign((..._args: unknown[]) => ({}), {}),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

/**
 * Returns a chainable select() that, when awaited or terminated, serves the
 * next item from a programmable queue.
 */
vi.mock('@/lib/db', () => {
  const queue: Array<unknown[]> = [];
  const insertReturns: unknown[][] = [];
  const updateReturns: unknown[][] = [];

  const selectChain = {
    from() { return this; },
    where() { return this; },
    orderBy() { return this; },
    limit() {
      const next = queue.shift() ?? [];
      return Promise.resolve(next);
    },
    offset() {
      const next = queue.shift() ?? [];
      return Promise.resolve(next);
    },
    then(resolve: (v: unknown) => unknown) {
      // direct-await path (no .limit / .offset)
      const next = queue.shift() ?? [];
      return Promise.resolve(next).then(resolve);
    },
  };

  const insertChain = {
    values(payload: unknown) {
      state.inserted.push(payload);
      return this;
    },
    onConflictDoUpdate() { return this; },
    returning() {
      const next = insertReturns.shift() ?? [{ id: 1, slug: 'fake', createdAt: new Date(), updatedAt: new Date() }];
      return Promise.resolve(next);
    },
  };

  const updateChain = {
    set(payload: unknown) {
      state.updated.push(payload);
      return this;
    },
    where() { return this; },
    returning() {
      const next = updateReturns.shift() ?? [{ id: 1 }];
      return Promise.resolve(next);
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(undefined).then(resolve);
    },
  };

  const deleteChain = {
    where() {
      state.deleted++;
      return Promise.resolve(undefined);
    },
  };

  const db = {
    __setSelectQueue(rows: unknown[][]) { queue.length = 0; queue.push(...rows); },
    __setInsertReturns(rows: unknown[][]) { insertReturns.length = 0; insertReturns.push(...rows); },
    __setUpdateReturns(rows: unknown[][]) { updateReturns.length = 0; updateReturns.push(...rows); },
    select() { selectCallCounter++; return selectChain; },
    insert() { return insertChain; },
    update() { return updateChain; },
    delete() { return deleteChain; },
  };

  return { db };
});

// Late import so the mocks apply.
const glossary = await import('@/lib/brain/glossary');
const { db } = await import('@/lib/db') as unknown as {
  db: {
    __setSelectQueue: (rows: unknown[][]) => void;
    __setInsertReturns: (rows: unknown[][]) => void;
    __setUpdateReturns: (rows: unknown[][]) => void;
  };
};

beforeEach(() => {
  resetState();
});

// ─── pruneRelatedTermIdsFromList ─────────────────────────────────────────────

describe('pruneRelatedTermIdsFromList @glossary', () => {
  it('returns only rows that actually contain the removed id', () => {
    const out = glossary.pruneRelatedTermIdsFromList(
      [
        { id: 1, relatedTermIds: [2, 3] },        // unaffected
        { id: 4, relatedTermIds: [99, 5] },       // pruned: 99 → [5]
        { id: 6, relatedTermIds: [99] },          // pruned: 99 → []
        { id: 7, relatedTermIds: [] },            // unaffected
      ],
      99,
    );
    expect(out).toEqual([
      { id: 4, relatedTermIds: [5] },
      { id: 6, relatedTermIds: [] },
    ]);
  });

  it('handles a row with relatedTermIds set to null (defensive)', () => {
    // Some legacy rows may have arrived with non-array values; we filter those.
    const out = glossary.pruneRelatedTermIdsFromList(
      [{ id: 1, relatedTermIds: null as unknown as number[] }, { id: 2, relatedTermIds: [99] }],
      99,
    );
    expect(out).toEqual([{ id: 2, relatedTermIds: [] }]);
  });

  it('returns empty array when nothing references the id', () => {
    expect(glossary.pruneRelatedTermIdsFromList(
      [{ id: 1, relatedTermIds: [2] }, { id: 2, relatedTermIds: [3] }],
      99,
    )).toEqual([]);
  });
});

// ─── slug derivation + collision suffix ──────────────────────────────────────

describe('createGlossaryTerm slug derivation @glossary', () => {
  it('slugifies term to lowercase dashed', async () => {
    db.__setSelectQueue([[]]); // collision pre-check returns empty
    db.__setInsertReturns([[{ id: 1, slug: 'foo-bar' }]]);
    const out = await glossary.createGlossaryTerm(1, null, {
      term: 'Foo Bar!',
      definition: 'x',
    });
    expect(out.slug).toBe('foo-bar');
  });

  it('suffixes -2 on per-tenant collision', async () => {
    db.__setSelectQueue([[{ slug: 'foo-bar' }]]);
    db.__setInsertReturns([[{ id: 2, slug: 'foo-bar-2' }]]);
    const out = await glossary.createGlossaryTerm(1, null, {
      term: 'Foo Bar',
      definition: 'x',
    });
    expect(out.slug).toBe('foo-bar-2');
  });

  it('suffixes -3 when -2 also taken', async () => {
    db.__setSelectQueue([[{ slug: 'foo-bar' }, { slug: 'foo-bar-2' }]]);
    db.__setInsertReturns([[{ id: 3, slug: 'foo-bar-3' }]]);
    const out = await glossary.createGlossaryTerm(1, null, {
      term: 'Foo Bar',
      definition: 'x',
    });
    expect(out.slug).toBe('foo-bar-3');
  });

  it('falls back to "term" when input has no alphanumerics', () => {
    expect(glossary.__test_slugify('!!! ???')).toBe('term');
  });
});

// ─── lookupGlossary scoring (table-driven) ───────────────────────────────────

describe('lookupGlossary scoring @glossary', () => {
  const baseRows: FakeRow[] = [
    { id: 1, term: 'API',            slug: 'api',            shortDefinition: 'Application Programming Interface', definition: 'An API is a contract between systems.', aliases: ['app prog interface'] },
    { id: 2, term: 'apricot',        slug: 'apricot',        shortDefinition: null, definition: 'A small orange-ish fruit.', aliases: [] },
    { id: 3, term: 'Backend',        slug: 'backend',        shortDefinition: null, definition: 'Server-side logic.', aliases: ['BE', 'back-end'] },
    { id: 4, term: 'Marketing Qualified Lead', slug: 'mql',  shortDefinition: 'MQL', definition: 'A lead deemed ready by Marketing.', aliases: ['MQL'] },
    { id: 5, term: 'Customer',       slug: 'customer',       shortDefinition: null, definition: 'A paying user.', aliases: [] },
  ];

  // Eight table-driven cases
  const cases: Array<{ name: string; query: string; expectTop: { id: number; type: string; score: number } }> = [
    { name: 'exact term match (case-insensitive) → 10',  query: 'api',         expectTop: { id: 1, type: 'exact_term', score: 10 } },
    { name: 'exact alias match → 8',                     query: 'be',          expectTop: { id: 3, type: 'exact_alias', score: 8 } },
    { name: 'exact alias match (acronym) → 8',           query: 'mql',         expectTop: { id: 4, type: 'exact_alias', score: 8 } },
    { name: 'term prefix → 5',                           query: 'apri',        expectTop: { id: 2, type: 'term_prefix', score: 5 } },
    { name: 'alias prefix → 4',                          query: 'app prog',    expectTop: { id: 1, type: 'alias_prefix', score: 4 } },
    { name: 'term substring → 3',                        query: 'ckend',       expectTop: { id: 3, type: 'term_substring', score: 3 } },
    { name: 'alias substring → 2',                       query: 'ack-en',      expectTop: { id: 3, type: 'alias_substring', score: 2 } },
    { name: 'definition substring → 1',                  query: 'paying',      expectTop: { id: 5, type: 'definition_substring', score: 1 } },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      db.__setSelectQueue([baseRows]);
      const out = await glossary.lookupGlossary(1, c.query);
      expect(out.matches.length).toBeGreaterThan(0);
      const top = out.matches[0];
      expect(top.id).toBe(c.expectTop.id);
      expect(top.matchType).toBe(c.expectTop.type);
      expect(top.score).toBe(c.expectTop.score);
    });
  }

  it('sorts by score DESC and caps at limit', async () => {
    db.__setSelectQueue([baseRows]);
    const out = await glossary.lookupGlossary(1, 'a', { limit: 3 });
    expect(out.matches.length).toBeLessThanOrEqual(3);
    // Scores must be monotonically non-increasing
    for (let i = 1; i < out.matches.length; i++) {
      expect(out.matches[i - 1].score).toBeGreaterThanOrEqual(out.matches[i].score);
    }
  });

  it('caps limit at 25', async () => {
    db.__setSelectQueue([baseRows]);
    // limit=999 is silently clamped to 25 — output size also bounded by candidate pool here.
    const out = await glossary.lookupGlossary(1, 'a', { limit: 999 });
    expect(out.matches.length).toBeLessThanOrEqual(25);
  });

  it('empty query returns empty matches', async () => {
    const out = await glossary.lookupGlossary(1, '   ');
    expect(out.matches).toEqual([]);
  });
});

// ─── bulkImportGlossary input-cap ─────────────────────────────────────────────

describe('bulkImportGlossary 200-cap @glossary', () => {
  it('throws when input exceeds 200', async () => {
    const terms = Array.from({ length: 201 }, (_, i) => ({ term: `t${i}`, definition: 'd' }));
    await expect(glossary.bulkImportGlossary(1, null, { terms })).rejects.toThrow(/200/);
  });

  it('accepts exactly 200 (no DB writes asserted here — covered in integration)', async () => {
    // Pre-fill insertReturns enough so the per-row inserts don't blow up.
    const inserts: unknown[][] = Array.from({ length: 200 }, (_, i) => [{
      id: i + 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }]);
    db.__setInsertReturns(inserts);
    const terms = Array.from({ length: 200 }, (_, i) => ({ term: `t${i}`, definition: 'd' }));
    const out = await glossary.bulkImportGlossary(1, null, { terms });
    expect(out.created + out.updated + out.errors.length).toBe(200);
  });

  it('records per-row errors for missing term/definition', async () => {
    db.__setInsertReturns([[{ id: 1, createdAt: new Date(0), updatedAt: new Date(0) }]]);
    const out = await glossary.bulkImportGlossary(1, null, {
      terms: [
        { term: '', definition: 'no term' },
        { term: 'no def', definition: '' },
        { term: 'ok', definition: 'ok' },
      ],
    });
    expect(out.errors.length).toBe(2);
    expect(out.errors.map((e) => e.message)).toEqual(expect.arrayContaining([
      expect.stringMatching(/term/i),
      expect.stringMatching(/definition/i),
    ]));
    expect(out.created + out.updated).toBe(1);
  });
});
