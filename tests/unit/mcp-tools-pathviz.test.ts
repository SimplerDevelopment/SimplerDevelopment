// @vitest-environment node
/**
 * Unit tests for lib/mcp/tools/pathviz.ts + lib/mcp/tools/pathviz-coordination.ts.
 *
 * The pathviz module is split across two registrars that together register
 * thirteen MCP tools gated by `projects:read` / `projects:write` scopes:
 * `registerPathvizTools` (8 chart/graph tools) and
 * `registerPathvizCoordinationTools` (5 presence/claims/notes tools), sharing
 * helpers from lib/mcp/tools/pathviz-shared.ts. Mocking strategy mirrors
 * tests/unit/mcp-tools-projects.test.ts: stub `db`, mock schema + drizzle-orm
 * helpers, stub collaborators, and pass in a fake McpServer that captures
 * `{ name -> handler }` so each handler can be invoked directly.
 *
 * `lib/pathviz/events.ts` (appendPathChartEvents — insert + updated_at bump +
 * pg_notify) is mocked wholesale as a spy: this file is a unit test of the
 * registrar's business logic (ownership checks, key resolution, conflict
 * detection), not of the event-append helper's own transaction/notify
 * behavior.
 *
 * Not every one of the 13 tools gets its own describe block — coverage
 * focuses on the meaningful branches: registration/scoping, ownership
 * denial, upsert_nodes parent resolution (in-batch + unknown-parent error),
 * set_status event emission, the claim conflict-warning path, release, and
 * who_owns file matching (exact + prefix glob).
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── DB stub ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const dbState: {
  selectQueue: Row[][];
  selectDefault: Row[];
  insertReturning: Row[];
  insertReturningQueue: Row[][];
  updateReturning: Row[];
  updateReturningQueue: Row[][];
  deleteReturning: Row[];
  deleteReturningQueue: Row[][];
  insertCalls: Row[];
  updateCalls: Row[];
  deleteCalls: number;
} = {
  selectQueue: [],
  selectDefault: [],
  insertReturning: [{ id: 1 }],
  insertReturningQueue: [],
  updateReturning: [{ id: 1, updated: true }],
  updateReturningQueue: [],
  deleteReturning: [{ id: 1, deleted: true }],
  deleteReturningQueue: [],
  insertCalls: [],
  updateCalls: [],
  deleteCalls: 0,
};

function nextSelect(): Row[] {
  return dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.selectDefault;
}
function nextInsertReturning(): Row[] {
  return dbState.insertReturningQueue.length > 0 ? dbState.insertReturningQueue.shift()! : dbState.insertReturning;
}
function nextUpdateReturning(): Row[] {
  return dbState.updateReturningQueue.length > 0 ? dbState.updateReturningQueue.shift()! : dbState.updateReturning;
}
function nextDeleteReturning(): Row[] {
  return dbState.deleteReturningQueue.length > 0 ? dbState.deleteReturningQueue.shift()! : dbState.deleteReturning;
}

function makeChain(rows: Row[]) {
  const proxy: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: Row[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => makeChain(nextSelect())),
    insert: vi.fn(() => ({
      values: vi.fn((vals: Row) => {
        dbState.insertCalls.push(Array.isArray(vals) ? vals[0] : vals);
        const r = nextInsertReturning();
        return {
          returning: vi.fn(async () => r),
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(async () => r),
          })),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Row) => {
        dbState.updateCalls.push(patch);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => nextUpdateReturning()),
          })),
        };
      }),
    })),
    delete: vi.fn(() => {
      dbState.deleteCalls += 1;
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => nextDeleteReturning()),
        })),
      };
    }),
  },
}));

// ── schema mock ──────────────────────────────────────────────────────────────

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;

  return new Proxy(
    {
      projects: make('id', 'clientId', 'name'),
      pathCharts: make('id', 'projectId', 'title', 'description', 'appLabel', 'status', 'createdByAgent', 'createdAt', 'updatedAt'),
      pathChartNodes: make('id', 'chartId', 'key', 'parentNodeId', 'kind', 'label', 'routePath', 'filePath', 'status', 'meta', 'position', 'createdAt', 'updatedAt'),
      pathChartEdges: make('id', 'chartId', 'sourceNodeId', 'targetNodeId', 'kind', 'label', 'meta', 'createdAt'),
      pathChartEvents: make('id', 'chartId', 'eventType', 'payload', 'agentLabel', 'createdAt'),
      pathChartClaims: make('id', 'chartId', 'nodeId', 'agentLabel', 'intent', 'files', 'expiresAt', 'releasedAt', 'createdAt'),
    },
    {
      has: (t, p) =>
        p in t || !(p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'),
      get: (t, p) =>
        p in t
          ? t[p as keyof typeof t]
          : p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'
            ? undefined
            : new Proxy({ __table: String(p) }, {
                get: (_x, c) =>
                  c === '__table' ? String(p) : (typeof c === 'string' ? { __col: c, __table: String(p) } : undefined),
              }),
    },
  );
});

// ── drizzle-orm mock ─────────────────────────────────────────────────────────

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

// ── mcp-auth mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/mcp-auth', () => ({
  hasScope: (granted: string[], required: string) =>
    granted.includes('*') ||
    granted.includes(required) ||
    granted.includes(`${required.split(':')[0]}:*`),
}));

// ── collaborator stubs ───────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: vi.fn(async () => true),
}));

const appendPathChartEventsMock = vi.fn(async () => {});
vi.mock('@/lib/pathviz/events', () => ({
  appendPathChartEvents: (...args: unknown[]) => appendPathChartEventsMock(...args),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

import { registerPathvizTools } from '@/lib/mcp/tools/pathviz';
import { registerPathvizCoordinationTools } from '@/lib/mcp/tools/pathviz-coordination';

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
  };
  return { stub, tools };
}

function ctxFor(scopes: string[]): PortalMcpContext {
  return {
    userId: 42,
    keyId: 1,
    scopes,
    client: { id: 7, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[] = ['*']) {
  const { stub, tools } = makeServer();
  const ctx = ctxFor(scopes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerPathvizTools(stub as any, ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerPathvizCoordinationTools(stub as any, ctx);
  return tools;
}

const ALL_TOOL_NAMES = [
  'pathviz_list_charts',
  'pathviz_get_chart',
  'pathviz_create_chart',
  'pathviz_update_chart',
  'pathviz_upsert_nodes',
  'pathviz_upsert_edges',
  'pathviz_set_status',
  'pathviz_remove',
  'pathviz_touch',
  'pathviz_claim',
  'pathviz_release',
  'pathviz_note',
  'pathviz_who_owns',
];
const READ_TOOLS = ['pathviz_list_charts', 'pathviz_get_chart', 'pathviz_who_owns'];
const WRITE_TOOLS = ALL_TOOL_NAMES.filter((n) => !READ_TOOLS.includes(n));

function resetState() {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.insertReturning = [{ id: 1 }];
  dbState.insertReturningQueue = [];
  dbState.updateReturning = [{ id: 1, updated: true }];
  dbState.updateReturningQueue = [];
  dbState.deleteReturning = [{ id: 1, deleted: true }];
  dbState.deleteReturningQueue = [];
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  dbState.deleteCalls = 0;
  appendPathChartEventsMock.mockReset();
  appendPathChartEventsMock.mockResolvedValue(undefined);
}

// ── registration / scoping ──────────────────────────────────────────────────

describe('registerPathvizTools — tool registration', () => {
  beforeEach(resetState);

  it('registers all thirteen canonical tools when scopes=*', () => {
    const tools = registerAll();
    for (const name of ALL_TOOL_NAMES) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
    expect(tools.size).toBe(13);
  });

  it('registers only read tools when scopes=projects:read', () => {
    const tools = registerAll(['projects:read']);
    for (const name of READ_TOOLS) expect(tools.has(name)).toBe(true);
    for (const name of WRITE_TOOLS) expect(tools.has(name)).toBe(false);
  });

  it('registers only write tools when scopes=projects:write', () => {
    const tools = registerAll(['projects:write']);
    for (const name of WRITE_TOOLS) expect(tools.has(name)).toBe(true);
    for (const name of READ_TOOLS) expect(tools.has(name)).toBe(false);
  });

  it('registers nothing when ctx has no project scopes', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('every tool has a title, description, and inputSchema', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name} should have a title`).toBeTruthy();
      expect((t.config.description ?? '').length, `${t.name} description`).toBeGreaterThan(5);
      expect(t.config.inputSchema, `${t.name}.inputSchema`).toBeDefined();
    }
  });
});

// ── ownership denial ─────────────────────────────────────────────────────────

describe('ownership checks (cross-tenant guard)', () => {
  beforeEach(resetState);

  it('pathviz_update_chart returns "Chart not found" when the chart belongs to another client', async () => {
    dbState.selectQueue = [[]]; // authorizeChart join returns nothing
    const tools = registerAll();
    const res = await tools.get('pathviz_update_chart')!.handler({ chartId: 999, title: 'New title' });
    expect(parseJson(res)).toEqual({ error: 'Chart not found' });
  });

  it('pathviz_create_chart returns "Project not found" when the project belongs to another client', async () => {
    dbState.selectQueue = [[]]; // authorizeProjectForClient returns nothing
    const tools = registerAll();
    const res = await tools.get('pathviz_create_chart')!.handler({ projectId: 999, title: 'Chart' });
    expect(parseJson(res)).toEqual({ error: 'Project not found' });
  });

  it('denies pathviz_upsert_nodes at handler time when caller lacks projects:write', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPathvizTools(stub as any, ctx);
    ctx.scopes = ['projects:read'];
    const res = await tools.get('pathviz_upsert_nodes')!.handler({ chartId: 1, nodes: [{ key: 'a', kind: 'screen', label: 'A' }] });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});

// ── pathviz_upsert_nodes — parent resolution ─────────────────────────────────

describe('pathviz_upsert_nodes — parent resolution', () => {
  beforeEach(resetState);

  it('resolves parentKey to the parent\'s id when the parent is earlier in the SAME batch, processing parent first regardless of input order', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 1 }], // authorizeChart
    ];
    dbState.insertReturningQueue = [
      [{ id: 10, key: 'screenA', kind: 'screen', label: 'Screen A', status: 'planned' }], // parent inserted first
      [{ id: 11, key: 'compA', kind: 'component', label: 'Comp A', status: 'planned' }],  // then child
    ];
    const tools = registerAll();
    // Child listed BEFORE its parent in the input — orderNodesForUpsert must reorder.
    const res = await tools.get('pathviz_upsert_nodes')!.handler({
      chartId: 5,
      nodes: [
        { key: 'compA', kind: 'component', label: 'Comp A', parentKey: 'screenA' },
        { key: 'screenA', kind: 'screen', label: 'Screen A' },
      ],
    });

    const out = parseJson(res) as { upserted: Array<{ key: string; id: number; status: string }> };
    expect(out.upserted).toEqual([
      { key: 'screenA', id: 10, status: 'planned' },
      { key: 'compA', id: 11, status: 'planned' },
    ]);
    // The child's insert must carry the parent's freshly-inserted id.
    expect(dbState.insertCalls[0]!.key).toBe('screenA');
    expect(dbState.insertCalls[0]!.parentNodeId).toBeNull();
    expect(dbState.insertCalls[1]!.key).toBe('compA');
    expect(dbState.insertCalls[1]!.parentNodeId).toBe(10);

    expect(appendPathChartEventsMock).toHaveBeenCalledTimes(1);
    const [chartIdArg, events] = appendPathChartEventsMock.mock.calls[0]!;
    expect(chartIdArg).toBe(5);
    expect(events).toEqual([
      { eventType: 'node.upserted', payload: { key: 'screenA', kind: 'screen', label: 'Screen A', status: 'planned', parentKey: null }, agentLabel: expect.any(String) },
      { eventType: 'node.upserted', payload: { key: 'compA', kind: 'component', label: 'Comp A', status: 'planned', parentKey: 'screenA' }, agentLabel: expect.any(String) },
    ]);
  });

  it('errors listing the unknown parentKey when the parent is neither in the batch nor already in the chart', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 1 }], // authorizeChart
      [], // existing-parent lookup — not found
    ];
    const tools = registerAll();
    const res = await tools.get('pathviz_upsert_nodes')!.handler({
      chartId: 5,
      nodes: [{ key: 'compA', kind: 'component', label: 'Comp A', parentKey: 'ghostScreen' }],
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/Unknown parentKey "ghostScreen"/);
  });

  it('rejects a batch with duplicate keys before touching the DB', async () => {
    dbState.selectQueue = [[{ id: 5, projectId: 1 }]];
    const tools = registerAll();
    const res = await tools.get('pathviz_upsert_nodes')!.handler({
      chartId: 5,
      nodes: [
        { key: 'a', kind: 'screen', label: 'A' },
        { key: 'a', kind: 'screen', label: 'A again' },
      ],
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Duplicate keys/);
    expect(dbState.insertCalls).toEqual([]);
  });
});

// ── pathviz_set_status ───────────────────────────────────────────────────────

describe('pathviz_set_status', () => {
  beforeEach(resetState);

  it('emits a node.status event only for updates that matched an existing node, and reports ok:false for misses', async () => {
    dbState.selectQueue = [[{ id: 5, projectId: 1 }]]; // authorizeChart
    dbState.updateReturningQueue = [
      [{ id: 100 }], // 'nodeA' found
      [],            // 'missing' not found
    ];
    const tools = registerAll();
    const res = await tools.get('pathviz_set_status')!.handler({
      chartId: 5,
      updates: [
        { key: 'nodeA', status: 'wired', note: 'wired it up' },
        { key: 'missing', status: 'blocked' },
      ],
    });

    const out = parseJson(res) as { updated: Array<{ key: string; status: string; ok: boolean }> };
    expect(out.updated).toEqual([
      { key: 'nodeA', status: 'wired', ok: true },
      { key: 'missing', status: 'blocked', ok: false },
    ]);

    expect(appendPathChartEventsMock).toHaveBeenCalledTimes(1);
    const [chartIdArg, events] = appendPathChartEventsMock.mock.calls[0]!;
    expect(chartIdArg).toBe(5);
    expect(events).toEqual([
      { eventType: 'node.status', payload: { key: 'nodeA', status: 'wired', note: 'wired it up' }, agentLabel: expect.any(String) },
    ]);
  });

  it('skips appendPathChartEvents entirely when every update misses', async () => {
    dbState.selectQueue = [[{ id: 5, projectId: 1 }]];
    dbState.updateReturningQueue = [[]];
    const tools = registerAll();
    await tools.get('pathviz_set_status')!.handler({ chartId: 5, updates: [{ key: 'ghost', status: 'blocked' }] });
    expect(appendPathChartEventsMock).not.toHaveBeenCalled();
  });
});

// ── pathviz_claim — conflict warning path ────────────────────────────────────

describe('pathviz_claim — conflict detection', () => {
  beforeEach(resetState);

  it('warns about another agent\'s active claim that overlaps on files (even on a different node), and emits a conflict event', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 1 }],                      // authorizeChart
      [{ id: 100, key: 'nodeA' }],                     // node lookup for requested nodeKeys
      [{ id: 5 }],                                      // projectCharts (charts in project 1)
      [{ agentLabel: 'agentB', chartId: 5, nodeId: 200, intent: 'refactor foo', files: ['lib/foo.ts'] }], // otherActive claims
      [{ id: 200, key: 'nodeB' }],                      // conflictNodeRows — resolve nodeId 200's key
      [],                                                 // recent 'note' events — none
    ];
    dbState.insertReturning = [{ id: 1, chartId: 5, nodeId: 100, agentLabel: 'user:42@Acme', intent: 'add checkout', files: ['lib/foo.ts'] }];

    const tools = registerAll();
    const res = await tools.get('pathviz_claim')!.handler({
      chartId: 5,
      nodeKeys: ['nodeA'],
      intent: 'add checkout',
      files: ['lib/foo.ts'],
    });

    const out = parseJson(res) as {
      granted: boolean;
      warnings: Array<{ agentLabel: string; chartId: number; nodeKey: string; intent: string; files: string[]; recentNotes: unknown[] }>;
    };
    expect(out.granted).toBe(true);
    expect(out.warnings).toEqual([
      { agentLabel: 'agentB', chartId: 5, nodeKey: 'nodeB', intent: 'refactor foo', files: ['lib/foo.ts'], recentNotes: [] },
    ]);

    // Never denies — the claim insert always happened regardless of the conflict.
    expect(dbState.insertCalls[0]!.nodeId).toBe(100);
    expect(dbState.insertCalls[0]!.agentLabel).toBe('user:42@Acme');

    // One 'claim' event + one 'conflict' event since warnings is non-empty.
    expect(appendPathChartEventsMock).toHaveBeenCalledTimes(1);
    const [chartIdArg, events] = appendPathChartEventsMock.mock.calls[0]!;
    expect(chartIdArg).toBe(5);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ eventType: 'claim', payload: { nodeKey: 'nodeA', intent: 'add checkout', files: ['lib/foo.ts'], ttlMinutes: 30 }, agentLabel: 'user:42@Acme' });
    expect(events[1]).toEqual({ eventType: 'conflict', payload: { nodeKeys: ['nodeA'], agents: ['agentB'], files: ['lib/foo.ts'] }, agentLabel: 'user:42@Acme' });
  });

  it('never denies (granted:true) and returns no warnings when no other agent has an overlapping claim', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 1 }],
      [{ id: 100, key: 'nodeA' }],
      [{ id: 5 }],
      [], // no other active claims at all
    ];
    const tools = registerAll();
    const res = await tools.get('pathviz_claim')!.handler({
      chartId: 5, nodeKeys: ['nodeA'], intent: 'solo work', files: ['lib/solo.ts'],
    });
    const out = parseJson(res) as { granted: boolean; warnings: unknown[] };
    expect(out.granted).toBe(true);
    expect(out.warnings).toEqual([]);
  });

  it('returns an error listing unknown node keys instead of creating claims', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 1 }],
      [], // no nodes found for the requested keys
    ];
    const tools = registerAll();
    const res = await tools.get('pathviz_claim')!.handler({
      chartId: 5, nodeKeys: ['ghost'], intent: 'x', files: [],
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Unknown node key\(s\): ghost/);
    expect(dbState.insertCalls).toEqual([]);
  });
});

// ── pathviz_release ───────────────────────────────────────────────────────────

describe('pathviz_release', () => {
  beforeEach(resetState);

  it('releases every active claim the agent holds on the chart when nodeKeys is omitted, resolving keys afterward', async () => {
    dbState.selectQueue = [
      [{ id: 5, projectId: 1 }],                              // authorizeChart
      [{ id: 100, key: 'nodeA' }, { id: 101, key: 'nodeB' }],  // resolve keys for the released node ids
    ];
    dbState.updateReturningQueue = [
      [{ nodeId: 100 }, { nodeId: 101 }], // release update
    ];
    const tools = registerAll();
    const res = await tools.get('pathviz_release')!.handler({ chartId: 5, note: 'handing off' });

    const out = parseJson(res) as { released: string[] };
    expect(out.released.sort()).toEqual(['nodeA', 'nodeB']);

    expect(appendPathChartEventsMock).toHaveBeenCalledTimes(1);
    const [chartIdArg, events] = appendPathChartEventsMock.mock.calls[0]!;
    expect(chartIdArg).toBe(5);
    expect(events).toHaveLength(2);
    for (const ev of events as Array<{ eventType: string; payload: { note: string | null } }>) {
      expect(ev.eventType).toBe('release');
      expect(ev.payload.note).toBe('handing off');
    }
  });

  it('returns released:[] and never calls appendPathChartEvents when the agent holds no active claims', async () => {
    dbState.selectQueue = [[{ id: 5, projectId: 1 }]];
    dbState.updateReturningQueue = [[]];
    const tools = registerAll();
    const res = await tools.get('pathviz_release')!.handler({ chartId: 5 });
    expect(parseJson(res)).toEqual({ released: [] });
    expect(appendPathChartEventsMock).not.toHaveBeenCalled();
  });
});

// ── pathviz_who_owns ──────────────────────────────────────────────────────────

describe('pathviz_who_owns', () => {
  beforeEach(resetState);

  it('returns active claims whose files intersect the request — exact match and trailing-* prefix match', async () => {
    dbState.selectQueue = [
      [{ id: 1 }],                                    // authorizeProjectForClient
      [{ id: 5, title: 'Chart A' }],                   // project's charts
      [
        { agentLabel: 'agentC', chartId: 5, nodeId: 300, intent: 'exact match', files: ['lib/foo.ts'], expiresAt: '2026-08-01T00:00:00Z' },
        { agentLabel: 'agentD', chartId: 5, nodeId: 301, intent: 'prefix match', files: ['lib/utils/*'], expiresAt: '2026-08-01T00:00:00Z' },
        { agentLabel: 'agentE', chartId: 5, nodeId: 302, intent: 'no overlap', files: ['lib/other.ts'], expiresAt: '2026-08-01T00:00:00Z' },
      ], // active claims across project charts
      [{ id: 300, key: 'nodeC' }, { id: 301, key: 'nodeD' }], // resolve matching claims' node keys
    ];
    const tools = registerAll();
    const res = await tools.get('pathviz_who_owns')!.handler({
      projectId: 1,
      files: ['lib/foo.ts', 'lib/utils/helper.ts'],
    });

    const out = parseJson(res) as Array<{ agentLabel: string; chartId: number; chartTitle: string; nodeKey: string; intent: string }>;
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.agentLabel === 'agentC')).toMatchObject({ chartId: 5, chartTitle: 'Chart A', nodeKey: 'nodeC', intent: 'exact match' });
    expect(out.find((r) => r.agentLabel === 'agentD')).toMatchObject({ chartId: 5, chartTitle: 'Chart A', nodeKey: 'nodeD', intent: 'prefix match' });
    expect(out.find((r) => r.agentLabel === 'agentE')).toBeUndefined();
  });

  it('returns [] without querying claims when the project has no charts', async () => {
    dbState.selectQueue = [
      [{ id: 1 }], // authorizeProjectForClient
      [],           // no charts for this project
    ];
    const tools = registerAll();
    const res = await tools.get('pathviz_who_owns')!.handler({ projectId: 1, files: ['lib/foo.ts'] });
    expect(parseJson(res)).toEqual([]);
  });

  it('denies at handler time when caller lacks projects:read', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['*']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPathvizCoordinationTools(stub as any, ctx);
    ctx.scopes = [];
    const res = await tools.get('pathviz_who_owns')!.handler({ projectId: 1, files: ['a.ts'] });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
  });
});
