// @vitest-environment node
/**
 * Unit tests for the Path Visualizations ("Dev Paths") Phase 3 read API:
 *   - app/api/portal/projects/[id]/path-charts/route.ts   (GET list)
 *   - app/api/portal/path-charts/[id]/route.ts             (GET snapshot)
 *   - app/api/portal/path-charts/[id]/events/route.ts      (GET replay)
 *   - app/api/portal/path-charts/[id]/stream/route.ts      (GET SSE)
 *
 * Strategy: db.select() is mocked with a queue of result rows, in the exact
 * order each route issues its queries (documented per test). `.where()` and
 * `.limit()` calls are additionally captured so we can assert the parsed
 * since/limit values actually reach the query, not just that the pure
 * parse helpers behave.
 *
 * The SSE route is only exercised through its auth-guard early returns
 * (400/401/404) and its exported `parseSince` helper — we never let it open
 * its ReadableStream in a unit test, per the no-real-streaming rule for this
 * layer. `@/lib/pathviz/stream` is fully mocked so no real Postgres LISTEN
 * connection is ever attempted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertMockUsed } from '../helpers/assertMockUsed';

// ---------------------------------------------------------------------------
// Mocks (must precede route imports)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const subscribeChartChannelMock = vi.fn();
vi.mock('@/lib/pathviz/stream', () => ({
  subscribeChartChannel: (...args: unknown[]) => subscribeChartChannelMock(...args),
  chartChannel: (chartId: number) => `pathviz_chart_${chartId}`,
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  gt: (a: unknown, b: unknown) => ({ op: 'gt', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy(
    {
      projects: wrap('projects'),
      pathCharts: wrap('pathCharts'),
      pathChartNodes: wrap('pathChartNodes'),
      pathChartEdges: wrap('pathChartEdges'),
      pathChartClaims: wrap('pathChartClaims'),
      pathChartEvents: wrap('pathChartEvents'),
    },
    {
      has: (t, p) => p in t || !(p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'),
      get: (t, p) =>
        p in t ? (t as Record<string, unknown>)[p as string] : p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string' ? undefined : wrap(p as string),
    },
  );
});

// ---- db mock: queue for select() results + captured where/limit args ----

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const capturedWhereArgs: unknown[] = [];
const capturedLimitArgs: number[] = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftSelect());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'orderBy', 'groupBy']) {
      chain[m] = () => chain;
    }
    chain.where = (arg: unknown) => {
      capturedWhereArgs.push(arg);
      return chain;
    };
    chain.limit = (n: number) => {
      capturedLimitArgs.push(n);
      // NOTE: materialize() is deliberately deferred to `.then()`, not
      // called here. A Promise.all([...]) array literal evaluates every
      // element synchronously before any awaiting happens; if `.limit()`
      // shifted the queue eagerly, a query ending in `.limit()` sitting
      // alongside queries that end in bare `.where()` (no `.limit()`) would
      // consume its queue slot out of order relative to its position in
      // the array. Deferring to `.then()` keeps consumption order equal to
      // Promise.all's left-to-right `.then()` invocation order.
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materialize().then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test (imported AFTER mocks)
// ---------------------------------------------------------------------------

const listRoute = await import('@/app/api/portal/projects/[id]/path-charts/route');
const snapshotRoute = await import('@/app/api/portal/path-charts/[id]/route');
const eventsRoute = await import('@/app/api/portal/path-charts/[id]/events/route');
const streamRoute = await import('@/app/api/portal/path-charts/[id]/stream/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const STAFF_ADMIN = { user: { id: '7', role: 'admin' } };
const CLIENT_SESSION = { user: { id: '12', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  capturedWhereArgs.length = 0;
  capturedLimitArgs.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  subscribeChartChannelMock.mockReset();
});

// ===========================================================================
// GET /api/portal/projects/[id]/path-charts
// ===========================================================================

describe('GET /api/portal/projects/[id]/path-charts', () => {
  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await listRoute.GET(new Request('http://x'), makeParams('10'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
    assertMockUsed(authMock, 'auth');
  });

  it('returns 400 on non-numeric project id', async () => {
    const res = await listRoute.GET(new Request('http://x'), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 403 for a client session whose client does not own the project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 10, clientId: 99 }]); // project lookup — belongs to client 99
    getPortalClientMock.mockResolvedValue({ id: 55 }); // caller's client — mismatch
    const res = await listRoute.GET(new Request('http://x'), makeParams('10'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Forbidden');
  });

  it('returns 200 with [] and a Cache-Control header when the project has no charts', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([{ id: 10, clientId: 55 }]); // project lookup
    selectQueue.push([]); // charts select — empty
    const res = await listRoute.GET(new Request('http://x'), makeParams('10'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=10');
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [] });
  });

  it('returns list shape with merged nodeCount/edgeCount/lastEventAt per chart', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([{ id: 10, clientId: 55 }]); // project lookup
    selectQueue.push([
      { id: 1, title: 'Chart A', description: 'd', appLabel: 'storefront', status: 'active', createdByAgent: 'agent-1', updatedAt: new Date('2026-01-02') },
      { id: 2, title: 'Chart B', description: null, appLabel: null, status: 'archived', createdByAgent: null, updatedAt: new Date('2026-01-01') },
    ]); // charts
    selectQueue.push([{ chartId: 1, count: 3 }]); // nodeCounts (chart 2 has none)
    selectQueue.push([{ chartId: 1, count: 2 }]); // edgeCounts (chart 2 has none)
    selectQueue.push([{ chartId: 2, lastEventAt: new Date('2026-01-03') }]); // lastEvents (chart 1 has none)

    const res = await listRoute.GET(new Request('http://x'), makeParams('10'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=10');
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);

    const chart1 = body.data.find((c: { id: number }) => c.id === 1);
    expect(chart1).toMatchObject({
      title: 'Chart A',
      appLabel: 'storefront',
      status: 'active',
      createdByAgent: 'agent-1',
      nodeCount: 3,
      edgeCount: 2,
      lastEventAt: null,
    });

    const chart2 = body.data.find((c: { id: number }) => c.id === 2);
    expect(chart2).toMatchObject({
      title: 'Chart B',
      nodeCount: 0,
      edgeCount: 0,
    });
    expect(new Date(chart2.lastEventAt).toISOString()).toBe(new Date('2026-01-03').toISOString());
  });
});

// ===========================================================================
// GET /api/portal/path-charts/[id]  (full snapshot)
// ===========================================================================

describe('GET /api/portal/path-charts/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await snapshotRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on non-numeric chart id', async () => {
    const res = await snapshotRoute.GET(new Request('http://x'), makeParams('nope'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the chart row does not exist', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([]); // chart lookup empty
    const res = await snapshotRoute.GET(new Request('http://x'), makeParams('999'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Chart not found');
  });

  it('returns 404 (not 403) for wrong-client access, so existence is not leaked cross-tenant', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 77, title: 'Chart', description: null, appLabel: null, status: 'active', createdByAgent: null, createdAt: new Date(), updatedAt: new Date() }]); // chart lookup
    selectQueue.push([{ id: 77, clientId: 99 }]); // project lookup — belongs to client 99
    getPortalClientMock.mockResolvedValue({ id: 55 }); // caller's client — mismatch
    const res = await snapshotRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Chart not found');
    assertMockUsed(getPortalClientMock, 'getPortalClient');
  });

  it('returns the full snapshot shape: chart, nodes, edges, activeClaims, lastEventId', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([{ id: 1, projectId: 77, title: 'Chart', description: 'd', appLabel: 'app', status: 'active', createdByAgent: 'agent', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }]); // chart
    selectQueue.push([{ id: 77, clientId: 55 }]); // project
    selectQueue.push([{ id: 1, chartId: 1, key: 'home', kind: 'screen' }]); // nodes
    selectQueue.push([{ id: 1, chartId: 1, sourceNodeId: 1, targetNodeId: 2, kind: 'nav' }]); // edges
    selectQueue.push([{ id: 1, chartId: 1, nodeId: 1, agentLabel: 'claude', releasedAt: null }]); // activeClaims
    selectQueue.push([{ id: 42 }]); // lastEventRows

    const res = await snapshotRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.chart.id).toBe(1);
    expect(body.data.nodes).toHaveLength(1);
    expect(body.data.edges).toHaveLength(1);
    expect(body.data.activeClaims).toHaveLength(1);
    expect(body.data.lastEventId).toBe(42);
  });

  it('returns lastEventId null when the chart has no events yet', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([{ id: 2, projectId: 77, title: 'Chart', description: null, appLabel: null, status: 'active', createdByAgent: null, createdAt: new Date(), updatedAt: new Date() }]);
    selectQueue.push([{ id: 77, clientId: 55 }]);
    selectQueue.push([]); // nodes
    selectQueue.push([]); // edges
    selectQueue.push([]); // activeClaims
    selectQueue.push([]); // lastEventRows — none
    const res = await snapshotRoute.GET(new Request('http://x'), makeParams('2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.lastEventId).toBeNull();
  });
});

// ===========================================================================
// GET /api/portal/path-charts/[id]/events
// ===========================================================================

describe('GET /api/portal/path-charts/[id]/events', () => {
  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await eventsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 for wrong-client access', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 77 }]); // chart
    selectQueue.push([{ id: 77, clientId: 99 }]); // project — different client
    getPortalClientMock.mockResolvedValue({ id: 55 });
    const res = await eventsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('defaults to since=0, limit=200 and returns event shape in ascending id order', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([{ id: 1, projectId: 77 }]); // chart
    selectQueue.push([{ id: 77, clientId: 55 }]); // project
    selectQueue.push([
      { id: 5, eventType: 'node.upserted', payload: { key: 'home' }, agentLabel: 'claude', createdAt: new Date('2026-01-01') },
      { id: 6, eventType: 'edge.upserted', payload: {}, agentLabel: null, createdAt: new Date('2026-01-02') },
    ]);

    const res = await eventsRoute.GET(new Request('http://x/api/portal/path-charts/1/events'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      { id: 5, eventType: 'node.upserted', payload: { key: 'home' }, agentLabel: 'claude', createdAt: new Date('2026-01-01').toISOString() },
      { id: 6, eventType: 'edge.upserted', payload: {}, agentLabel: null, createdAt: new Date('2026-01-02').toISOString() },
    ]);

    // Last captured limit() call is the events query itself (after the
    // chart/project auth lookups, which each .limit(1)).
    expect(capturedLimitArgs[capturedLimitArgs.length - 1]).toBe(200);
    // The events where-clause is the last captured where() — assert the
    // `since` value (from gt()) flowed through as 0.
    const eventsWhere = capturedWhereArgs[capturedWhereArgs.length - 1] as { args: Array<{ op: string; b: unknown }> };
    expect(eventsWhere.args[1]).toMatchObject({ op: 'gt', b: 0 });
  });

  it('honors ?since= and clamps ?limit= to 500 max', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([{ id: 1, projectId: 77 }]);
    selectQueue.push([{ id: 77, clientId: 55 }]);
    selectQueue.push([]); // events

    const res = await eventsRoute.GET(new Request('http://x/api/portal/path-charts/1/events?since=100&limit=99999'), makeParams('1'));
    expect(res.status).toBe(200);
    expect(capturedLimitArgs[capturedLimitArgs.length - 1]).toBe(500);
    const eventsWhere = capturedWhereArgs[capturedWhereArgs.length - 1] as { args: Array<{ op: string; b: unknown }> };
    expect(eventsWhere.args[1]).toMatchObject({ op: 'gt', b: 100 });
  });

  it('parseSince/parseLimit clamp invalid input to safe defaults', () => {
    expect(eventsRoute.parseSince(null)).toBe(0);
    expect(eventsRoute.parseSince('not-a-number')).toBe(0);
    expect(eventsRoute.parseSince('-5')).toBe(0);
    expect(eventsRoute.parseSince('42')).toBe(42);

    expect(eventsRoute.parseLimit(null)).toBe(200);
    expect(eventsRoute.parseLimit('0')).toBe(200);
    expect(eventsRoute.parseLimit('-1')).toBe(200);
    expect(eventsRoute.parseLimit('50')).toBe(50);
    expect(eventsRoute.parseLimit('99999')).toBe(500);
  });
});

// ===========================================================================
// GET /api/portal/path-charts/[id]/stream (SSE)
// ===========================================================================
//
// Guard + replay-query construction only — never let the ReadableStream
// actually open in a unit test.

describe('GET /api/portal/path-charts/[id]/stream — auth guard', () => {
  it('returns 400 on non-numeric chart id without touching auth or the subscription', async () => {
    const res = await streamRoute.GET(new Request('http://x'), makeParams('nope'));
    expect(res.status).toBe(400);
    expect(authMock).not.toHaveBeenCalled();
    expect(subscribeChartChannelMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated and never subscribes', async () => {
    authMock.mockResolvedValue(null);
    const res = await streamRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    expect(subscribeChartChannelMock).not.toHaveBeenCalled();
  });

  it('returns 404 for wrong-client access and never subscribes', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 77 }]); // chart
    selectQueue.push([{ id: 77, clientId: 99 }]); // project — different client
    getPortalClientMock.mockResolvedValue({ id: 55 });
    const res = await streamRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    expect(subscribeChartChannelMock).not.toHaveBeenCalled();
  });
});

describe('parseSince (stream route replay cursor)', () => {
  it('prefers the Last-Event-ID header over ?since=', () => {
    const req = new Request('http://x/api/portal/path-charts/1/stream?since=10', {
      headers: { 'Last-Event-ID': '20' },
    });
    expect(streamRoute.parseSince(req)).toBe(20);
  });

  it('falls back to ?since= when no header is present', () => {
    const req = new Request('http://x/api/portal/path-charts/1/stream?since=30');
    expect(streamRoute.parseSince(req)).toBe(30);
  });

  it('returns null when neither is present (fresh connect, no replay)', () => {
    const req = new Request('http://x/api/portal/path-charts/1/stream');
    expect(streamRoute.parseSince(req)).toBeNull();
  });

  it('returns null for a non-numeric or negative value', () => {
    expect(streamRoute.parseSince(new Request('http://x?since=abc'))).toBeNull();
    expect(streamRoute.parseSince(new Request('http://x?since=-1'))).toBeNull();
  });
});
