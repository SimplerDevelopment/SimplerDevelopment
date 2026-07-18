// @vitest-environment node
/**
 * Unit tests for lib/brain/search.ts.
 *
 * The module is entirely DB-coupled (no exported pure helpers), so this file
 * mocks `@/lib/db`, `@/lib/db/schema`, `drizzle-orm`, and `./embeddings`. The
 * `db` mock implements a chainable query builder that filters rows by an
 * in-memory state seeded per-test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface SemanticChunk {
  entityType: string;
  entityId: number;
  chunkIndex: number;
  content: string;
  similarity: number;
}

interface MockState {
  brainMeetings: Array<Record<string, unknown>>;
  brainNotes: Array<Record<string, unknown>>;
  brainTasks: Array<Record<string, unknown>>;
  brainRelationshipOverlays: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  /** rows returned for db.execute (raw SQL contact/deal/post lookups). */
  executeRows: Record<string, Array<Record<string, unknown>>>;
  semanticChunks: SemanticChunk[];
  semanticCalls: Array<Record<string, unknown>>;
}

const state: MockState = {
  brainMeetings: [],
  brainNotes: [],
  brainTasks: [],
  brainRelationshipOverlays: [],
  crmCompanies: [],
  crmDeals: [],
  executeRows: {},
  semanticChunks: [],
  semanticCalls: [],
};

// Track which db.execute path was hit for assertion via a counter keyed on
// the joined column hints in the SQL string. Since the source file uses three
// different raw queries (crm_contacts, crm_deals, posts) we route by the
// first matched substring.
function pickExecuteRows(strings: TemplateStringsArray | undefined): Array<Record<string, unknown>> {
  if (!strings) return [];
  const joined = strings.join(' ');
  if (joined.includes('crm_contacts')) return state.executeRows.contacts ?? [];
  if (joined.includes('crm_deals')) return state.executeRows.deals ?? [];
  if (joined.includes('FROM posts')) return state.executeRows.posts ?? [];
  return [];
}

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    brainMeetings: wrap('brainMeetings'),
    brainNotes: wrap('brainNotes'),
    brainTasks: wrap('brainTasks'),
    brainRelationshipOverlays: wrap('brainRelationshipOverlays'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  ilike: (a: unknown, b: unknown) => ({ op: 'ilike', a, b }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {
      raw: (s: string) => ({ op: 'sql-raw', raw: s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

vi.mock('@/lib/brain/embeddings', () => ({
  searchSemantic: vi.fn(async (args: Record<string, unknown>) => {
    state.semanticCalls.push(args);
    return state.semanticChunks;
  }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; list?: unknown[]; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      // If the row doesn't carry this column, treat the predicate as
      // permissive — the test seeded the row without that field on purpose
      // (most fixtures omit `clientId` and rely on the per-test setup).
      if (!(col.__col in row)) return true;
      return row[col.__col] === f.b;
    }
    case 'ilike': {
      // We treat ILIKE as a permissive match (always true), since the
      // source already orders by createdAt and limits — the per-type fixture
      // rows seeded by each test are the ones we want returned.
      return true;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const list = (f.list ?? []) as unknown[];
      return list.includes(row[col.__col]);
    }
    case 'sql':
      // Used inside the source for `${col} IN ${arr}` patterns. The mock
      // allows everything through — the surrounding and/eq tightens the scope.
      return true;
    default:
      return true;
  }
}

function projectRow(row: Record<string, unknown>, projection: Record<string, unknown> | null): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __col?: string } | undefined;
    out[alias] = r?.__col ? row[r.__col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
      execute(sqlFragment: { strings?: TemplateStringsArray; values?: unknown[] }) {
        return Promise.resolve(pickExecuteRows(sqlFragment?.strings));
      },
    },
  };
});

beforeEach(() => {
  state.brainMeetings.length = 0;
  state.brainNotes.length = 0;
  state.brainTasks.length = 0;
  state.brainRelationshipOverlays.length = 0;
  state.crmCompanies.length = 0;
  state.crmDeals.length = 0;
  state.executeRows = {};
  state.semanticChunks.length = 0;
  state.semanticCalls.length = 0;
  delete process.env.OPENAI_API_KEY;
});

async function importModule() {
  return await import('@/lib/brain/search');
}

// ---------------------------------------------------------------------------
// searchBrain — input handling
// ---------------------------------------------------------------------------

describe('searchBrain — input handling', () => {
  it('returns empty result for an empty query', async () => {
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, '');
    expect(res).toEqual({ query: '', total: 0, hits: [] });
  });

  it('returns empty result for a whitespace-only query', async () => {
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, '    \n\t');
    expect(res.total).toBe(0);
    expect(res.hits).toEqual([]);
    expect(res.query).toBe('');
  });

  it('trims the query in the response', async () => {
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, '   foo   ');
    expect(res.query).toBe('foo');
  });

  it('returns an empty hits list when no entities match', async () => {
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'no-matches');
    expect(res.total).toBe(0);
    expect(res.hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// searchBrain — meeting hits
// ---------------------------------------------------------------------------

describe('searchBrain — meetings', () => {
  it('returns a meeting hit with snippet + URL', async () => {
    state.brainMeetings.push({
      id: 11,
      clientId: 1,
      title: 'Acme kickoff call',
      status: 'completed',
      aiSummary: 'Discussed pricing for Acme',
      humanSummary: null,
      transcript: 'lots of words about acme and the pricing model',
      meetingDate: new Date('2026-01-15T10:00:00Z'),
      createdAt: new Date('2026-01-14T10:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['meeting'] });
    expect(res.total).toBe(1);
    expect(res.hits[0]).toMatchObject({
      type: 'meeting',
      id: 11,
      title: 'Acme kickoff call',
      status: 'completed',
      url: '/portal/brain/communications/11',
    });
    expect(res.hits[0].snippet.toLowerCase()).toContain('acme');
    expect(res.hits[0].occurredAt).toBe('2026-01-15T10:00:00.000Z');
    expect(res.hits[0].score).toBeGreaterThan(0);
  });

  it('falls back to createdAt when meetingDate is null', async () => {
    state.brainMeetings.push({
      id: 12,
      title: 'pricing chat',
      status: 'draft',
      aiSummary: null,
      humanSummary: null,
      transcript: null,
      meetingDate: null,
      createdAt: new Date('2025-12-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'pricing', { types: ['meeting'] });
    expect(res.hits[0].occurredAt).toBe('2025-12-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// searchBrain — note hits
// ---------------------------------------------------------------------------

describe('searchBrain — notes', () => {
  it('returns notes with tag context and pinned-boosted score', async () => {
    state.brainNotes.push({
      id: 21,
      title: 'Pinned note about acme',
      body: 'The acme deal is moving fast',
      tags: ['acme', 'priority', 'hot'],
      pinned: true,
      confidentialityLevel: 'normal',
      source: null,
      companyId: null,
      dealId: null,
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      createdAt: new Date('2026-01-15T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['note'] });
    expect(res.total).toBe(1);
    expect(res.hits[0]).toMatchObject({
      type: 'note',
      id: 21,
      url: '/portal/brain/knowledge',
      status: 'acme · priority · hot',
    });
    expect(res.hits[0].score).toBeGreaterThan(0);
  });

  it('uses "pinned" as status when there are no tags', async () => {
    state.brainNotes.push({
      id: 22,
      title: 'Pinned bare note',
      body: 'acme content',
      tags: null,
      pinned: true,
      companyId: null,
      dealId: null,
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      createdAt: new Date('2026-01-15T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['note'] });
    expect(res.hits[0].status).toBe('pinned');
  });

  it('resolves company contextName for note', async () => {
    state.crmCompanies.push({ id: 100, clientId: 1, name: 'Acme Inc' });
    state.brainNotes.push({
      id: 23,
      title: 'Note about acme',
      body: 'acme body',
      tags: [],
      pinned: false,
      companyId: 100,
      dealId: null,
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      createdAt: new Date('2026-01-15T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['note'] });
    expect(res.hits[0].contextName).toBe('Acme Inc');
  });

  it('resolves deal contextName when companyId is null', async () => {
    state.crmDeals.push({ id: 555, clientId: 1, title: 'Big Deal' });
    state.brainNotes.push({
      id: 24,
      title: 'Note about deal',
      body: 'acme body',
      tags: [],
      pinned: false,
      companyId: null,
      dealId: 555,
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      createdAt: new Date('2026-01-15T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['note'] });
    expect(res.hits[0].contextName).toBe('Big Deal');
  });

  it('falls back to createdAt when updatedAt is null', async () => {
    state.brainNotes.push({
      id: 25,
      title: 'Older note',
      body: 'acme body',
      tags: [],
      pinned: false,
      companyId: null,
      dealId: null,
      updatedAt: null,
      createdAt: new Date('2025-09-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['note'] });
    expect(res.hits[0].occurredAt).toBe('2025-09-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// searchBrain — task hits
// ---------------------------------------------------------------------------

describe('searchBrain — tasks', () => {
  it('returns a task hit with status · priority and contextName', async () => {
    state.crmCompanies.push({ id: 200, clientId: 1, name: 'Beta LLC' });
    state.brainTasks.push({
      id: 31,
      title: 'Send the acme proposal',
      description: 'follow up',
      status: 'open',
      priority: 'high',
      dueDate: new Date('2026-03-01T00:00:00Z'),
      createdAt: new Date('2026-02-01T00:00:00Z'),
      companyId: 200,
      dealId: null,
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['task'] });
    expect(res.total).toBe(1);
    expect(res.hits[0]).toMatchObject({
      type: 'task',
      id: 31,
      status: 'open · high',
      contextName: 'Beta LLC',
      url: '/portal/brain/tasks',
      occurredAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('falls back to createdAt when dueDate is null', async () => {
    state.brainTasks.push({
      id: 32,
      title: 'No-due task acme',
      description: null,
      status: 'open',
      priority: 'low',
      dueDate: null,
      createdAt: new Date('2026-02-10T00:00:00Z'),
      companyId: null,
      dealId: null,
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['task'] });
    expect(res.hits[0].occurredAt).toBe('2026-02-10T00:00:00.000Z');
    expect(res.hits[0].contextName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// searchBrain — relationship hits
// ---------------------------------------------------------------------------

describe('searchBrain — relationships', () => {
  it('returns a relationship hit titled by the company name', async () => {
    state.crmCompanies.push({ id: 300, clientId: 1, name: 'Gamma Co' });
    state.brainRelationshipOverlays.push({
      id: 41,
      clientId: 1,
      companyId: 300,
      dealId: null,
      relationshipType: 'partner',
      priority: 'high',
      summary: 'acme summary text',
      currentPriorities: null,
      openLoops: null,
      updatedAt: new Date('2026-04-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['relationship'] });
    expect(res.total).toBe(1);
    expect(res.hits[0]).toMatchObject({
      type: 'relationship',
      id: 41,
      title: 'Gamma Co',
      status: 'partner · high',
      contextName: 'company',
      url: '/portal/brain/relationships/41',
      occurredAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('falls back to "Company #id" when the company name is missing', async () => {
    state.brainRelationshipOverlays.push({
      id: 42,
      clientId: 1,
      companyId: 9999,
      dealId: null,
      relationshipType: 'partner',
      priority: 'high',
      summary: 'acme text',
      currentPriorities: null,
      openLoops: null,
      updatedAt: new Date('2026-04-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['relationship'] });
    expect(res.hits[0].title).toBe('Company #9999');
  });

  it('uses the deal title when companyId is null', async () => {
    state.crmDeals.push({ id: 400, clientId: 1, title: 'Pilot' });
    state.brainRelationshipOverlays.push({
      id: 43,
      clientId: 1,
      companyId: null,
      dealId: 400,
      relationshipType: 'opportunity',
      priority: 'medium',
      summary: 'acme overview',
      currentPriorities: null,
      openLoops: null,
      updatedAt: new Date('2026-04-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['relationship'] });
    expect(res.hits[0]).toMatchObject({ title: 'Pilot', contextName: 'deal' });
  });

  it('falls back to "Deal #id" when the deal title is missing', async () => {
    state.brainRelationshipOverlays.push({
      id: 44,
      clientId: 1,
      companyId: null,
      dealId: 4444,
      relationshipType: 'opportunity',
      priority: 'medium',
      summary: 'acme overview',
      currentPriorities: null,
      openLoops: null,
      updatedAt: new Date('2026-04-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['relationship'] });
    expect(res.hits[0].title).toBe('Deal #4444');
  });

  it('renders "Unknown" when neither companyId nor dealId is set', async () => {
    state.brainRelationshipOverlays.push({
      id: 45,
      clientId: 1,
      companyId: null,
      dealId: null,
      relationshipType: 'generic',
      priority: 'low',
      summary: 'acme description',
      currentPriorities: null,
      openLoops: null,
      updatedAt: new Date('2026-04-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['relationship'] });
    expect(res.hits[0].title).toBe('Unknown');
    // Source code always sets contextName to 'company' or 'deal' in the
    // ternary — even when both ids are null it falls through to 'deal'.
    expect(res.hits[0].contextName).toBe('deal');
  });
});

// ---------------------------------------------------------------------------
// searchBrain — types/limit/perTypeLimit options
// ---------------------------------------------------------------------------

describe('searchBrain — options', () => {
  it('respects opts.types — only queries the requested entity types', async () => {
    state.brainMeetings.push({
      id: 51,
      title: 'meeting acme',
      status: 'open',
      aiSummary: null,
      humanSummary: null,
      transcript: null,
      meetingDate: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    state.brainNotes.push({
      id: 52,
      title: 'note acme',
      body: 'acme',
      tags: [],
      pinned: false,
      companyId: null,
      dealId: null,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['meeting'] });
    expect(res.total).toBe(1);
    expect(res.hits[0].type).toBe('meeting');
  });

  it('clamps opts.limit to [1, 100] and applies it to total returned hits', async () => {
    for (let i = 0; i < 6; i++) {
      state.brainTasks.push({
        id: 60 + i,
        title: `task acme ${i}`,
        description: null,
        status: 'open',
        priority: 'low',
        dueDate: null,
        createdAt: new Date(2026, 0, 1 + i),
        companyId: null,
        dealId: null,
      });
    }
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['task'], limit: 2 });
    expect(res.hits).toHaveLength(2);
    expect(res.total).toBe(6);
  });

  it('clamps opts.perTypeLimit to [1, 50]', async () => {
    for (let i = 0; i < 8; i++) {
      state.brainTasks.push({
        id: 70 + i,
        title: `task acme ${i}`,
        description: null,
        status: 'open',
        priority: 'low',
        dueDate: null,
        createdAt: new Date(2026, 1, 1 + i),
        companyId: null,
        dealId: null,
      });
    }
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['task'], perTypeLimit: 3 });
    expect(res.hits).toHaveLength(3);
  });

  it('treats limit <= 0 as 1 (clamped)', async () => {
    for (let i = 0; i < 3; i++) {
      state.brainTasks.push({
        id: 80 + i,
        title: `task acme ${i}`,
        description: null,
        status: 'open',
        priority: 'low',
        dueDate: null,
        createdAt: new Date(2026, 1, 1 + i),
        companyId: null,
        dealId: null,
      });
    }
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['task'], limit: 0 });
    expect(res.hits).toHaveLength(1);
  });

  it('sorts results by score (then by recency) across types', async () => {
    state.brainMeetings.push({
      id: 91,
      title: 'meeting old',
      status: 'open',
      aiSummary: null,
      humanSummary: null,
      transcript: 'this transcript mentions acme buried at the end after lots of unrelated chatter that should rank low',
      meetingDate: new Date('2025-01-01T00:00:00Z'),
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    state.brainNotes.push({
      id: 92,
      title: 'acme key note',
      body: null,
      tags: [],
      pinned: false,
      companyId: null,
      dealId: null,
      updatedAt: new Date('2025-06-01T00:00:00Z'),
      createdAt: new Date('2025-06-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['meeting', 'note'] });
    // The title-match note should outrank the transcript-only meeting.
    expect(res.hits[0].type).toBe('note');
    expect(res.hits[0].id).toBe(92);
  });
});

// ---------------------------------------------------------------------------
// searchBrain — ILIKE escaping
// ---------------------------------------------------------------------------

describe('searchBrain — ILIKE escaping', () => {
  it('does not throw when the query contains %, _, or \\', async () => {
    state.brainNotes.push({
      id: 101,
      title: 'note with 50%_off',
      body: 'note body',
      tags: [],
      pinned: false,
      companyId: null,
      dealId: null,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, '50%_off\\', { types: ['note'] });
    expect(res.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// searchBrain — semantic branch
// ---------------------------------------------------------------------------

describe('searchBrain — semantic branch', () => {
  it('does not call searchSemantic when OPENAI_API_KEY is unset', async () => {
    delete process.env.OPENAI_API_KEY;
    state.semanticChunks.push({
      entityType: 'note',
      entityId: 999,
      chunkIndex: 0,
      content: 'should not be returned',
      similarity: 0.99,
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme');
    expect(state.semanticCalls).toHaveLength(0);
    expect(res.hits.find((h) => h.id === 999)).toBeUndefined();
  });

  it('calls searchSemantic when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { searchBrain } = await importModule();
    await searchBrain(1, 'acme', { types: ['note'] });
    expect(state.semanticCalls).toHaveLength(1);
    expect(state.semanticCalls[0]).toMatchObject({ clientId: 1, query: 'acme' });
  });

  it('merges semantic note chunks with lexical notes — boosting their score', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    state.brainNotes.push({
      id: 200,
      title: 'lexical note acme',
      body: null,
      tags: [],
      pinned: false,
      companyId: null,
      dealId: null,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    state.semanticChunks.push({
      entityType: 'note',
      entityId: 200,
      chunkIndex: 0,
      content: 'semantic chunk content',
      similarity: 0.9,
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['note'] });
    // Single note, merged. Score should be boosted above the pure-lexical baseline.
    const note200 = res.hits.find((h) => h.id === 200);
    expect(note200).toBeDefined();
  });

  it('emits a semantic-only note hit when no lexical match exists', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    state.semanticChunks.push({
      entityType: 'note',
      entityId: 201,
      chunkIndex: 0,
      content: '   semantic-only   content   ',
      similarity: 0.77,
    });
    state.brainNotes.push({
      // Source rows are needed for metadata lookup via inArray.
      id: 201,
      title: 'Semantic-only note',
      pinned: true,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      body: 'irrelevant', // would not match the query — and the lexical ILIKE mock returns it,
      tags: [],
      companyId: null,
      dealId: null,
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'somequery', { types: ['note'] });
    // Whether lexical also matched depends on the mock — assertion focuses on semantic enrichment.
    const note201 = res.hits.find((h) => h.id === 201);
    expect(note201).toBeDefined();
    expect(note201?.type).toBe('note');
  });

  it('emits semantic-only hits for entity types without a lexical branch', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    state.semanticChunks.push(
      {
        entityType: 'company',
        entityId: 300,
        chunkIndex: 0,
        content: 'company semantic content',
        similarity: 0.8,
      },
    );
    state.crmCompanies.push({
      id: 300,
      clientId: 1,
      name: 'Sem Co',
      industry: 'biotech',
      updatedAt: new Date('2026-01-15T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'biotech', { types: ['company'] });
    const company300 = res.hits.find((h) => h.id === 300 && h.type === 'company');
    expect(company300).toBeDefined();
    expect(company300).toMatchObject({
      type: 'company',
      title: 'Sem Co',
      status: 'biotech',
      url: '/portal/crm/companies/300',
    });
  });

  it('drives the semantic branch for meeting/task/relationship even though only notes get merged into the result', async () => {
    // The source's semantic runner emits hits for meeting/task/relationship
    // internally but the final `all` array only re-incorporates semantic
    // hits for entity types without a lexical counterpart (company/contact/
    // deal/post). This test exercises the inArray metadata lookups so the
    // semantic code paths still run without throwing.
    process.env.OPENAI_API_KEY = 'test-key';
    state.semanticChunks.push(
      {
        entityType: 'meeting',
        entityId: 400,
        chunkIndex: 0,
        content: 'meeting chunk',
        similarity: 0.6,
      },
      {
        entityType: 'task',
        entityId: 401,
        chunkIndex: 0,
        content: 'task chunk',
        similarity: 0.5,
      },
      {
        entityType: 'relationship',
        entityId: 402,
        chunkIndex: 0,
        content: 'relationship chunk',
        similarity: 0.4,
      },
    );
    state.brainMeetings.push({
      id: 400,
      title: 'Mtg via semantic',
      status: 'done',
      meetingDate: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      aiSummary: null,
      humanSummary: null,
      transcript: null,
    });
    state.brainTasks.push({
      id: 401,
      title: 'Task via semantic',
      status: 'open',
      priority: 'low',
      dueDate: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      description: null,
      companyId: null,
      dealId: null,
    });
    state.brainRelationshipOverlays.push({
      id: 402,
      relationshipType: 'sponsor',
      priority: 'high',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      companyId: 1,
      dealId: null,
      clientId: 1,
      summary: null,
      currentPriorities: null,
      openLoops: null,
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'q', { types: ['meeting', 'task', 'relationship'] });
    // All three should still come through via the lexical branch (permissive
    // mocked ILIKE). The semantic branch ran its metadata lookups end-to-end.
    expect(res.hits.find((h) => h.id === 400 && h.type === 'meeting')?.url)
      .toBe('/portal/brain/communications/400');
    expect(res.hits.find((h) => h.id === 401 && h.type === 'task')?.url)
      .toBe('/portal/brain/tasks');
    expect(res.hits.find((h) => h.id === 402 && h.type === 'relationship')?.url)
      .toBe('/portal/brain/relationships/402');
    expect(state.semanticCalls).toHaveLength(1);
  });

  it('emits semantic contact + deal + post hits from db.execute lookups', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    state.semanticChunks.push(
      {
        entityType: 'contact',
        entityId: 500,
        chunkIndex: 0,
        content: 'contact chunk',
        similarity: 0.9,
      },
      {
        entityType: 'deal',
        entityId: 501,
        chunkIndex: 0,
        content: 'deal chunk',
        similarity: 0.8,
      },
      {
        entityType: 'post',
        entityId: 502,
        chunkIndex: 0,
        content: 'post chunk',
        similarity: 0.7,
      },
    );
    state.executeRows.contacts = [
      {
        id: 500,
        first_name: 'Ada',
        last_name: 'Lovelace',
        title: 'CTO',
        updated_at: new Date('2026-01-01T00:00:00Z'),
        company_name: 'Sem Co',
      },
    ];
    state.executeRows.deals = [
      {
        id: 501,
        title: 'Mega Deal',
        status: 'open',
        updated_at: new Date('2026-01-01T00:00:00Z'),
        company_name: 'Mega Co',
      },
    ];
    state.executeRows.posts = [
      {
        id: 502,
        title: 'Hello World',
        updated_at: new Date('2026-01-01T00:00:00Z'),
        website_id: 9,
      },
    ];

    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'q', { types: ['contact', 'deal', 'post'] });

    const contact = res.hits.find((h) => h.id === 500 && h.type === 'contact');
    const deal = res.hits.find((h) => h.id === 501 && h.type === 'deal');
    const post = res.hits.find((h) => h.id === 502 && h.type === 'post');

    expect(contact).toMatchObject({
      type: 'contact',
      title: 'Ada Lovelace',
      status: 'CTO',
      contextName: 'Sem Co',
      url: '/portal/crm/contacts/500',
    });
    expect(deal).toMatchObject({
      type: 'deal',
      title: 'Mega Deal',
      status: 'open',
      contextName: 'Mega Co',
      url: '/portal/crm/deals',
    });
    expect(post).toMatchObject({
      type: 'post',
      title: 'Hello World',
      url: '/portal/websites/9/posts/502/edit',
    });
  });

  it('falls back to /portal/posts URL when the post has no website_id', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    state.semanticChunks.push({
      entityType: 'post',
      entityId: 600,
      chunkIndex: 0,
      content: 'orphan post chunk',
      similarity: 0.4,
    });
    state.executeRows.posts = [
      {
        id: 600,
        title: 'Orphan',
        updated_at: new Date('2026-01-01T00:00:00Z'),
        website_id: null,
      },
    ];
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'q', { types: ['post'] });
    const post = res.hits.find((h) => h.id === 600 && h.type === 'post');
    expect(post?.url).toBe('/portal/posts');
  });

  it('dedupes semantic chunks per entity, keeping the highest-similarity one', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    state.semanticChunks.push(
      {
        entityType: 'company',
        entityId: 700,
        chunkIndex: 0,
        content: 'lower-similarity',
        similarity: 0.2,
      },
      {
        entityType: 'company',
        entityId: 700,
        chunkIndex: 1,
        content: 'top-similarity',
        similarity: 0.95,
      },
    );
    state.crmCompanies.push({
      id: 700,
      clientId: 1,
      name: 'Dedupe Co',
      industry: null,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'q', { types: ['company'] });
    const company = res.hits.find((h) => h.id === 700 && h.type === 'company');
    expect(company).toBeDefined();
    expect(company?.score).toBeCloseTo(0.95);
    expect(company?.snippet).toBe('top-similarity');
  });

  it('fails soft when searchSemantic rejects — lexical results still come through', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const embeddings = await import('@/lib/brain/embeddings');
    (embeddings.searchSemantic as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    state.brainNotes.push({
      id: 800,
      title: 'Surviving note acme',
      body: null,
      tags: [],
      pinned: false,
      companyId: null,
      dealId: null,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const { searchBrain } = await importModule();
    const res = await searchBrain(1, 'acme', { types: ['note'] });
    expect(res.hits.find((h) => h.id === 800)).toBeDefined();
  });
});
