// @vitest-environment node
/**
 * Unit tests for lib/brain/graph.ts.
 *
 * The module is entirely DB-coupled, so the test file mocks `@/lib/db`,
 * `@/lib/db/schema`, `@/lib/db/schema/crm`, and `drizzle-orm`. The mock
 * implements a chainable query builder backed by in-memory tables that each
 * test seeds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  brainNotes: Array<Record<string, unknown>>;
  brainKbLinks: Array<Record<string, unknown>>;
  brainMeetings: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmContacts: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
}

const state: MockState = {
  brainNotes: [],
  brainKbLinks: [],
  brainMeetings: [],
  crmCompanies: [],
  crmContacts: [],
  crmDeals: [],
};

// Schema mocks — each table column access returns a marker the predicate
// evaluator can inspect to know which column was referenced.
function wrap(tableName: string) {
  return new Proxy(
    { __table: tableName },
    {
      get(_t, prop: string) {
        if (prop === '__table') return tableName;
        return { __col: prop, __table: tableName };
      },
    },
  );
}

vi.mock('@/lib/db/schema', () => ({
  brainNotes: wrap('brainNotes'),
  brainKbLinks: wrap('brainKbLinks'),
  brainMeetings: wrap('brainMeetings'),
}));

vi.mock('@/lib/db/schema/crm', () => ({
  crmCompanies: wrap('crmCompanies'),
  crmContacts: wrap('crmContacts'),
  crmDeals: wrap('crmDeals'),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  isNotNull: (a: unknown) => ({ op: 'isNotNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {},
  ),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    list?: unknown[];
    args?: unknown[];
    values?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
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
    case 'isNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const v = row[col.__col];
      return v === null || v === undefined;
    }
    case 'isNotNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const v = row[col.__col];
      return v !== null && v !== undefined;
    }
    case 'sql':
      // The source uses `sql` only for the tag-contains JSONB filter. The mock
      // implements its own tag filtering via a special predicate hook below.
      // We treat raw sql as "don't filter" by default — individual tests that
      // need tag filtering seed accordingly.
      return tagFilterMatches(f, row);
    default:
      return true;
  }
}

// Special-case the tag filter `${brainNotes.tags}::jsonb @> ${JSON.stringify([tag])}::jsonb`
// — one of the interpolated values is a JSON-stringified single-tag array. Scan
// all values for that shape and match against row.tags.
function tagFilterMatches(
  f: { values?: unknown[] },
  row: Record<string, unknown>,
): boolean {
  const vs = f.values ?? [];
  let wanted: unknown = undefined;
  for (const v of vs) {
    if (typeof v !== 'string') continue;
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed) && parsed.length === 1) {
        wanted = parsed[0];
        break;
      }
    } catch {
      // ignore
    }
  }
  if (wanted === undefined) return true;
  const tags = row.tags;
  if (!Array.isArray(tags)) return false;
  return tags.includes(wanted);
}

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
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
      groupBy() {
        return runQuery();
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
    },
  };
});

beforeEach(() => {
  state.brainNotes.length = 0;
  state.brainKbLinks.length = 0;
  state.brainMeetings.length = 0;
  state.crmCompanies.length = 0;
  state.crmContacts.length = 0;
  state.crmDeals.length = 0;
});

async function importModule() {
  return await import('@/lib/brain/graph');
}

// ---------------------------------------------------------------------------
// getKnowledgeGraph — base behavior
// ---------------------------------------------------------------------------

describe('getKnowledgeGraph — base behavior', () => {
  it('returns empty graph when client has no notes', async () => {
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.truncated).toBe(false);
  });

  it('scopes by clientId — notes from other tenants are not included', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'mine', tags: [], pinned: false, deletedAt: null },
      { id: 2, clientId: 2, title: 'theirs', tags: [], pinned: false, deletedAt: null },
    );
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].id).toBe('note:1');
    expect(graph.nodes[0].title).toBe('mine');
  });

  it('excludes soft-deleted notes', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'live', tags: [], pinned: false, deletedAt: null },
      { id: 2, clientId: 1, title: 'trashed', tags: [], pinned: false, deletedAt: new Date() },
    );
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].title).toBe('live');
  });

  it('emits note nodes with kind=note and pinned defaulting to false', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'A', tags: ['x'], pinned: true, deletedAt: null },
      { id: 2, clientId: 1, title: 'B', tags: null, pinned: null, deletedAt: null },
    );
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.nodes).toHaveLength(2);
    const a = graph.nodes.find((n) => n.id === 'note:1')!;
    const b = graph.nodes.find((n) => n.id === 'note:2')!;
    expect(a.kind).toBe('note');
    expect(a.tags).toEqual(['x']);
    expect(a.pinned).toBe(true);
    // tags=null -> []  and pinned=null -> false
    expect(b.tags).toEqual([]);
    expect(b.pinned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

describe('getKnowledgeGraph — edges', () => {
  it('emits note→note edges and sets hasIncoming/hasOutgoing flags', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'A', tags: [], pinned: false, deletedAt: null },
      { id: 2, clientId: 1, title: 'B', tags: [], pinned: false, deletedAt: null },
    );
    state.brainKbLinks.push({ clientId: 1, fromNoteId: 1, toNoteId: 2 });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.edges).toEqual([{ source: 'note:1', target: 'note:2' }]);
    const a = graph.nodes.find((n) => n.id === 'note:1')!;
    const b = graph.nodes.find((n) => n.id === 'note:2')!;
    expect(a.hasOutgoing).toBe(true);
    expect(a.hasIncoming).toBe(false);
    expect(b.hasIncoming).toBe(true);
    expect(b.hasOutgoing).toBe(false);
  });

  it('drops edges whose target was filtered out of the node set', async () => {
    // Note 2 is on a different client, so node-set excludes it; edge 1->2 dies.
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'A', tags: [], pinned: false, deletedAt: null },
      { id: 2, clientId: 2, title: 'B', tags: [], pinned: false, deletedAt: null },
    );
    state.brainKbLinks.push({ clientId: 1, fromNoteId: 1, toNoteId: 2 });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.edges).toEqual([]);
  });

  it('drops self-loop edges', async () => {
    state.brainNotes.push({ id: 1, clientId: 1, title: 'A', tags: [], pinned: false, deletedAt: null });
    state.brainKbLinks.push({ clientId: 1, fromNoteId: 1, toNoteId: 1 });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.edges).toEqual([]);
  });

  it('drops edges with null toNoteId', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'A', tags: [], pinned: false, deletedAt: null },
      { id: 2, clientId: 1, title: 'B', tags: [], pinned: false, deletedAt: null },
    );
    // Despite isNotNull filter on the SQL side, defensively assert the JS guard too.
    state.brainKbLinks.push(
      { clientId: 1, fromNoteId: 1, toNoteId: null },
      { clientId: 1, fromNoteId: 1, toNoteId: 2 },
    );
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.edges).toEqual([{ source: 'note:1', target: 'note:2' }]);
  });

  it('dedupes repeated edges between the same pair', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'A', tags: [], pinned: false, deletedAt: null },
      { id: 2, clientId: 1, title: 'B', tags: [], pinned: false, deletedAt: null },
    );
    state.brainKbLinks.push(
      { clientId: 1, fromNoteId: 1, toNoteId: 2 },
      { clientId: 1, fromNoteId: 1, toNoteId: 2 },
      { clientId: 1, fromNoteId: 1, toNoteId: 2 },
    );
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.edges).toEqual([{ source: 'note:1', target: 'note:2' }]);
  });
});

// ---------------------------------------------------------------------------
// Tag filter
// ---------------------------------------------------------------------------

describe('getKnowledgeGraph — tag filter', () => {
  it('returns only notes with the requested tag', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'A', tags: ['alpha'], pinned: false, deletedAt: null },
      { id: 2, clientId: 1, title: 'B', tags: ['beta'], pinned: false, deletedAt: null },
      { id: 3, clientId: 1, title: 'C', tags: ['alpha', 'beta'], pinned: false, deletedAt: null },
    );
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { tag: 'alpha' });
    const ids = graph.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['note:1', 'note:3']);
  });
});

// ---------------------------------------------------------------------------
// MAX_NODES truncation
// ---------------------------------------------------------------------------

describe('getKnowledgeGraph — truncation', () => {
  it('caps at MAX_NODES=1000 and reports truncated=true', async () => {
    for (let i = 1; i <= 1005; i++) {
      state.brainNotes.push({
        id: i,
        clientId: 1,
        title: `N${i}`,
        tags: [],
        pinned: false,
        deletedAt: null,
      });
    }
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.nodes).toHaveLength(1000);
    expect(graph.truncated).toBe(true);
  });

  it('reports truncated=false when below the cap', async () => {
    state.brainNotes.push({ id: 1, clientId: 1, title: 'only', tags: [], pinned: false, deletedAt: null });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CRM enrichment
// ---------------------------------------------------------------------------

describe('getKnowledgeGraph — includeCrm', () => {
  it('does NOT include CRM nodes when includeCrm is false (default)', async () => {
    state.brainNotes.push({
      id: 1,
      clientId: 1,
      title: 'note',
      tags: [],
      pinned: false,
      deletedAt: null,
      companyId: 10,
    });
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1);
    expect(graph.nodes.every((n) => n.kind === 'note')).toBe(true);
    expect(graph.edges).toEqual([]);
  });

  it('emits company nodes + note→company edges', async () => {
    state.brainNotes.push({
      id: 1,
      clientId: 1,
      title: 'N',
      tags: [],
      pinned: false,
      deletedAt: null,
      companyId: 10,
    });
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { includeCrm: true });
    const company = graph.nodes.find((n) => n.id === 'company:10');
    expect(company).toMatchObject({ kind: 'company', title: 'Acme' });
    expect(graph.edges).toContainEqual({ source: 'note:1', target: 'company:10' });
  });

  it('builds a contact full-name from firstName + lastName, falling back to "Contact #<id>"', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'N1', tags: [], pinned: false, deletedAt: null, contactId: 20 },
      { id: 2, clientId: 1, title: 'N2', tags: [], pinned: false, deletedAt: null, contactId: 21 },
    );
    state.crmContacts.push(
      { id: 20, clientId: 1, firstName: 'Ada', lastName: 'Lovelace' },
      { id: 21, clientId: 1, firstName: '', lastName: null },
    );
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { includeCrm: true });
    const ada = graph.nodes.find((n) => n.id === 'contact:20');
    const unnamed = graph.nodes.find((n) => n.id === 'contact:21');
    expect(ada).toMatchObject({ kind: 'contact', title: 'Ada Lovelace' });
    expect(unnamed).toMatchObject({ kind: 'contact', title: 'Contact #21' });
  });

  it('emits deal nodes + note→deal edges', async () => {
    state.brainNotes.push({
      id: 1,
      clientId: 1,
      title: 'N',
      tags: [],
      pinned: false,
      deletedAt: null,
      dealId: 30,
    });
    state.crmDeals.push({ id: 30, clientId: 1, title: 'Big Deal' });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { includeCrm: true });
    const deal = graph.nodes.find((n) => n.id === 'deal:30');
    expect(deal).toMatchObject({ kind: 'deal', title: 'Big Deal' });
    expect(graph.edges).toContainEqual({ source: 'note:1', target: 'deal:30' });
  });

  it('emits meeting nodes — uses title when present, falls back to date-based label, then to "Meeting #<id>"', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'N1', tags: [], pinned: false, deletedAt: null, meetingId: 40 },
      { id: 2, clientId: 1, title: 'N2', tags: [], pinned: false, deletedAt: null, meetingId: 41 },
      { id: 3, clientId: 1, title: 'N3', tags: [], pinned: false, deletedAt: null, meetingId: 42 },
    );
    state.brainMeetings.push(
      { id: 40, clientId: 1, title: 'Kickoff', meetingDate: new Date('2026-01-01') },
      { id: 41, clientId: 1, title: null, meetingDate: new Date('2026-02-15') },
      { id: 42, clientId: 1, title: null, meetingDate: null },
    );
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { includeCrm: true });
    const m40 = graph.nodes.find((n) => n.id === 'meeting:40');
    const m41 = graph.nodes.find((n) => n.id === 'meeting:41');
    const m42 = graph.nodes.find((n) => n.id === 'meeting:42');
    expect(m40!.title).toBe('Kickoff');
    expect(m41!.title).toBe('Meeting · 2026-02-15');
    expect(m42!.title).toBe('Meeting #42');
  });

  it('skips CRM edges whose target row is missing (dangling FK)', async () => {
    state.brainNotes.push({
      id: 1,
      clientId: 1,
      title: 'N',
      tags: [],
      pinned: false,
      deletedAt: null,
      companyId: 999, // no company row exists
    });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { includeCrm: true });
    expect(graph.nodes.filter((n) => n.kind === 'company')).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it('dedupes entity nodes when multiple notes link to the same CRM record', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'N1', tags: [], pinned: false, deletedAt: null, companyId: 10 },
      { id: 2, clientId: 1, title: 'N2', tags: [], pinned: false, deletedAt: null, companyId: 10 },
    );
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { includeCrm: true });
    const companyNodes = graph.nodes.filter((n) => n.id === 'company:10');
    expect(companyNodes).toHaveLength(1);
    // both notes have an outgoing edge to the same company
    expect(graph.edges).toContainEqual({ source: 'note:1', target: 'company:10' });
    expect(graph.edges).toContainEqual({ source: 'note:2', target: 'company:10' });
  });

  it('skips CRM enrichment entirely when there are no notes', async () => {
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { includeCrm: true });
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// orphansOnly filter
// ---------------------------------------------------------------------------

describe('getKnowledgeGraph — orphansOnly', () => {
  it('keeps only notes with no incoming note→note edge', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'orphan', tags: [], pinned: false, deletedAt: null },
      { id: 2, clientId: 1, title: 'linked', tags: [], pinned: false, deletedAt: null },
      { id: 3, clientId: 1, title: 'linker', tags: [], pinned: false, deletedAt: null },
    );
    state.brainKbLinks.push({ clientId: 1, fromNoteId: 3, toNoteId: 2 });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { orphansOnly: true });
    const titles = graph.nodes.map((n) => n.title).sort();
    expect(titles).toEqual(['linker', 'orphan']);
  });

  it('removes edges that no longer have both endpoints after the orphan filter', async () => {
    state.brainNotes.push(
      { id: 1, clientId: 1, title: 'A', tags: [], pinned: false, deletedAt: null },
      { id: 2, clientId: 1, title: 'B', tags: [], pinned: false, deletedAt: null },
    );
    // A -> B means B has incoming; B is dropped; the edge must go too.
    state.brainKbLinks.push({ clientId: 1, fromNoteId: 1, toNoteId: 2 });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { orphansOnly: true });
    // B is filtered out; A survives; the A->B edge has no surviving target.
    expect(graph.nodes.map((n) => n.id)).toEqual(['note:1']);
    expect(graph.edges).toEqual([]);
  });

  it('does not deorphan a note just because a CRM entity is attached', async () => {
    state.brainNotes.push({
      id: 1,
      clientId: 1,
      title: 'solo',
      tags: [],
      pinned: false,
      deletedAt: null,
      companyId: 10,
    });
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    const { getKnowledgeGraph } = await importModule();
    const graph = await getKnowledgeGraph(1, { orphansOnly: true, includeCrm: true });
    // The note has an outgoing edge to the company but no incoming; it stays.
    const note = graph.nodes.find((n) => n.id === 'note:1');
    expect(note).toBeDefined();
    // Company stays too because it's a non-note node (the kind filter only
    // drops notes that have hasIncoming=true).
    const company = graph.nodes.find((n) => n.id === 'company:10');
    expect(company).toBeDefined();
    // The note->company edge survives because both endpoints are in the result.
    expect(graph.edges).toContainEqual({ source: 'note:1', target: 'company:10' });
  });
});
