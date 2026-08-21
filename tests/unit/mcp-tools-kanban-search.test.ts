// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/kanban-search.ts.
 *
 * `kanban_cards_search` is the dedup lookup agents call before filing a card,
 * so the things worth pinning are the ones that would let it lie: the tenancy
 * filter, the ownership check on an explicit board, LIKE escaping (a dedup term
 * is a route or an error string, where `%` and `_` are content), and the
 * truncation flag that stops a clipped page reading as the whole result.
 *
 * Strategy mirrors mcp-tools-kanban.test.ts — stub @/lib/db with a chainable
 * proxy seeded per test, mock drizzle helpers as recording no-ops so the
 * conditions themselves can be asserted, and invoke the captured handler.
 */
process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── DB stub ────────────────────────────────────────────────────────────────

const dbState: { selectQueue: unknown[][]; selectDefault: unknown[] } = {
  selectQueue: [],
  selectDefault: [],
};

const nextSelect = () =>
  dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;

function selectChain(rows: unknown[]) {
  const proxy: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => selectChain(nextSelect())),
    selectDistinct: vi.fn(() => selectChain(nextSelect())),
  },
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  const table = (cols: string[]) => Object.fromEntries(cols.map((c) => [c, col(c)]));
  return {
    projects: table(['id', 'clientId', 'name']),
    kanbanCards: table([
      'id', 'projectId', 'columnId', 'title', 'description', 'priority',
      'cardType', 'workflowState', 'dueDate', 'updatedAt',
    ]),
    kanbanColumns: table(['id', 'projectId', 'name']),
    kanbanLabels: table(['id', 'projectId', 'name', 'color']),
    kanbanCardLabels: table(['cardId', 'labelId']),
  };
});

// Recording no-ops: the assertions below read these call logs to prove which
// conditions the handler actually built.
const eqCalls: unknown[][] = [];
const ilikeCalls: unknown[][] = [];
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: unknown[]) => { eqCalls.push(a); return {}; }),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  ilike: vi.fn((...a: unknown[]) => { ilikeCalls.push(a); return {}; }),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
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
    // 7777 stands in for a board that exists but belongs to another company.
    assertProjectInClient: vi.fn(async (projectId: number) => {
      if (projectId === 7777) throw new OwnershipError('projectId', projectId);
    }),
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/portal-auth', () => ({ hasServiceAccess: vi.fn(async () => true) }));

// ── server stub ─────────────────────────────────────────────────────────────

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { text: string; type: string }[]; isError?: boolean;
}>;

function makeServer() {
  const tools = new Map<string, { config: { description?: string }; handler: Handler }>();
  const stub = {
    registerTool: vi.fn((name: string, config: { description?: string }, handler: Handler) => {
      tools.set(name, { config, handler });
      return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
    }),
    registerResource: vi.fn(),
  };
  return { stub, tools };
}

const CLIENT_ID = 42;
const ctxFor = (scopes: string[]): PortalMcpContext => ({
  userId: 11,
  keyId: 1,
  scopes,
  client: { id: CLIENT_ID, company: 'Acme' } as PortalMcpContext['client'],
});

import { registerKanbanSearchTools } from '@/lib/mcp/tools/kanban-search';

function register(scopes: string[] = ['projects:read']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerKanbanSearchTools(stub as any, ctxFor(scopes));
  return tools;
}

const handlerFor = (scopes?: string[]): Handler => {
  const t = register(scopes);
  const entry = t.get('kanban_cards_search');
  if (!entry) throw new Error('kanban_cards_search was not registered');
  return entry.handler;
};

const parse = (res: { content: { text: string }[] }) => JSON.parse(res.content[0].text);

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  eqCalls.length = 0;
  ilikeCalls.length = 0;
});

// ── tests ───────────────────────────────────────────────────────────────────

describe('registration + scope gate', () => {
  it('registers kanban_cards_search under projects:read', () => {
    expect(register(['projects:read']).has('kanban_cards_search')).toBe(true);
  });

  it('does not register without projects:read', () => {
    expect(register(['projects:write']).has('kanban_cards_search')).toBe(false);
  });

  it('names itself so isReadOnlyTool classifies it read-only', () => {
    // client-scope.ts fails CLOSED — a name with no read verb counts as a write,
    // which would bar viewers from a pure lookup.
    const segments = 'kanban_cards_search'.split('_');
    expect(segments).toContain('search');
  });
});

describe('tenancy', () => {
  it('always filters on the active company, with no filters supplied', async () => {
    dbState.selectQueue = [[], []];
    await handlerFor()({});
    expect(eqCalls.some(([col, val]) =>
      (col as { name?: string })?.name === 'clientId' && val === CLIENT_ID)).toBe(true);
  });

  it("refuses another company's board rather than returning an empty set", async () => {
    const res = await handlerFor()({ projectId: 7777 });
    expect(parse(res)).toEqual({ error: 'Forbidden: projectId=7777' });
  });

  it('scopes the label lookup to the company too', async () => {
    dbState.selectQueue = [[]]; // label lookup finds nothing
    const res = await handlerFor()({ labels: ['NEEDS-HUMAN'] });
    expect(parse(res)).toEqual({ cards: [] });
    expect(eqCalls.some(([col, val]) =>
      (col as { name?: string })?.name === 'clientId' && val === CLIENT_ID)).toBe(true);
  });
});

describe('query matching', () => {
  it('escapes LIKE metacharacters so a literal % is not a wildcard', async () => {
    dbState.selectQueue = [[], []];
    await handlerFor()({ query: '100% cpu_load' });
    expect(ilikeCalls[0][1]).toBe('%100\\% cpu\\_load%');
  });

  it('matches title only by default', async () => {
    dbState.selectQueue = [[], []];
    await handlerFor()({ query: 'modal' });
    expect(ilikeCalls).toHaveLength(1);
    expect((ilikeCalls[0][0] as { name?: string }).name).toBe('title');
  });

  it('matches description too when asked', async () => {
    dbState.selectQueue = [[], []];
    await handlerFor()({ query: 'modal', searchDescription: true });
    expect(ilikeCalls.map((c) => (c[0] as { name?: string }).name)).toEqual(['title', 'description']);
  });
});

describe('results', () => {
  it('attaches labels to the cards they belong to', async () => {
    dbState.selectQueue = [
      [{ id: 1, title: 'PUX-088' }, { id: 2, title: 'PUX-089' }],
      [
        { cardId: 1, name: 'CRM79', color: '#f97316' },
        { cardId: 1, name: 'NEEDS-HUMAN', color: '#dc2626' },
      ],
    ];
    const out = parse(await handlerFor()({})) as { cards: { id: number; labels: unknown[] }[] };
    expect(out.cards[0].labels).toEqual([
      { name: 'CRM79', color: '#f97316' },
      { name: 'NEEDS-HUMAN', color: '#dc2626' },
    ]);
    expect(out.cards[1].labels).toEqual([]);
  });

  it('flags truncation so a clipped page cannot read as the whole result', async () => {
    dbState.selectQueue = [[{ id: 1 }, { id: 2 }], []];
    const out = parse(await handlerFor()({ limit: 2 }));
    expect(out).toMatchObject({ truncated: true, limit: 2 });
  });

  it('omits the flag when the cap was not hit', async () => {
    dbState.selectQueue = [[{ id: 1 }], []];
    const out = parse(await handlerFor()({ limit: 2 })) as Record<string, unknown>;
    expect(out.truncated).toBeUndefined();
  });

  it('skips the label round trip when nothing matched', async () => {
    dbState.selectQueue = [[]];
    expect(parse(await handlerFor()({}))).toEqual({ cards: [] });
  });
});
