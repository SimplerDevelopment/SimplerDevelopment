// @vitest-environment node
/**
 * Batch 32d — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/snapshots/[id]/download/route.ts   (GET)
 *  - app/api/portal/snapshots/[id]/import/route.ts     (POST)
 *  - app/api/portal/snapshots/[id]/route.ts            (GET, DELETE)
 *  - app/api/portal/sprints/[id]/card-order/route.ts   (POST)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit/.orderBy). db.delete + db.update are mocked to capture writes.
 * importSnapshot, getPortalClient and auth() are also fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const importSnapshotMock = vi.fn();
vi.mock('@/lib/snapshots/import', () => ({
  importSnapshot: (...args: unknown[]) => importSnapshotMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
}));

// schema — proxy tables.
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    siteSnapshots: wrap('siteSnapshots'),
    sprints: wrap('sprints'),
    projects: wrap('projects'),
    kanbanCards: wrap('kanbanCards'),
  };
});

// ---------------------------------------------------------------------------
// db mock: select-queue + delete + update capture
// ---------------------------------------------------------------------------

interface DeleteCall {
  table: string;
  filter: unknown;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return {
          returning() {
            return Promise.resolve([]);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              returning() {
                return Promise.resolve([]);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const downloadRoute = await import('@/app/api/portal/snapshots/[id]/download/route');
const importRoute = await import('@/app/api/portal/snapshots/[id]/import/route');
const snapshotRoute = await import('@/app/api/portal/snapshots/[id]/route');
const cardOrderRoute = await import('@/app/api/portal/sprints/[id]/card-order/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7' } };
const ADMIN_SESSION = { user: { id: '7', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '7', role: 'employee' } };

beforeEach(() => {
  selectQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  importSnapshotMock.mockReset();
});

// ===========================================================================
// GET /api/portal/snapshots/[id]/download
// ===========================================================================

describe('GET /api/portal/snapshots/[id]/download', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await downloadRoute.GET(
      makeReq('http://x/api/portal/snapshots/5/download'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await downloadRoute.GET(
      makeReq('http://x/api/portal/snapshots/5/download'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when snapshot does not exist or is not owned', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // snapshot lookup empty
    const res = await downloadRoute.GET(
      makeReq('http://x/api/portal/snapshots/5/download'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 200 with JSON body and attachment headers', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 11,
        name: 'My Snapshot',
        payload: { site: { name: 'Acme' }, posts: [] },
      },
    ]);
    const res = await downloadRoute.GET(
      makeReq('http://x/api/portal/snapshots/11/download'),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="my-snapshot-snapshot.json"',
    );
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ site: { name: 'Acme' }, posts: [] });
  });

  it('slugifies a name with non-alphanumeric chars and trims hyphens', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 12, name: '  Hello World!! ', payload: { x: 1 } },
    ]);
    const res = await downloadRoute.GET(
      makeReq('http://x/api/portal/snapshots/12/download'),
      { params: Promise.resolve({ id: '12' }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="hello-world-snapshot.json"',
    );
  });

  it('falls back to "snapshot" when name slug is empty', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 13, name: '!!!', payload: {} }]);
    const res = await downloadRoute.GET(
      makeReq('http://x/api/portal/snapshots/13/download'),
      { params: Promise.resolve({ id: '13' }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="snapshot-snapshot.json"',
    );
  });
});

// ===========================================================================
// POST /api/portal/snapshots/[id]/import
// ===========================================================================

describe('POST /api/portal/snapshots/[id]/import', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/5/import', 'POST', {}),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/5/import', 'POST', {}),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when snapshot not found for this client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/5/import', 'POST', {}),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 403 when non-staff tries cross-client import', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, payload: { site: { name: 's' } } }]);
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/11/import', 'POST', {
        targetClientId: 99,
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/admin role/);
    expect(importSnapshotMock).not.toHaveBeenCalled();
  });

  it('allows cross-client import for admin role', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, payload: { site: { name: 's' } } }]);
    importSnapshotMock.mockResolvedValue({ siteId: 77, created: true });
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/11/import', 'POST', {
        targetClientId: 99,
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ siteId: 77, created: true });
    expect(importSnapshotMock).toHaveBeenCalledTimes(1);
    const [payload, targetClientId, opts] = importSnapshotMock.mock.calls[0];
    expect(payload).toEqual({ site: { name: 's' } });
    expect(targetClientId).toBe(99);
    expect(opts.createNewSite).toBe(true); // defaulted because no siteId
  });

  it('allows cross-client import for employee role', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, payload: { site: { name: 's' } } }]);
    importSnapshotMock.mockResolvedValue({ siteId: 88, created: true });
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/11/import', 'POST', {
        targetClientId: 99,
        createNewSite: true,
        newSiteName: 'New Site',
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    const opts = importSnapshotMock.mock.calls[0][2];
    expect(opts.newSiteName).toBe('New Site');
    expect(opts.createNewSite).toBe(true);
  });

  it('imports into existing siteId when provided (createNewSite defaults to false)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, payload: { site: { name: 's' } } }]);
    importSnapshotMock.mockResolvedValue({ siteId: 42, created: false });
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/11/import', 'POST', {
        siteId: 42,
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    const [, targetClientId, opts] = importSnapshotMock.mock.calls[0];
    expect(targetClientId).toBe(5); // defaulted to client.id
    expect(opts.siteId).toBe(42);
    expect(opts.createNewSite).toBe(false);
  });

  it('explicit createNewSite=true wins over siteId', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, payload: { site: { name: 's' } } }]);
    importSnapshotMock.mockResolvedValue({ siteId: 50 });
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/11/import', 'POST', {
        siteId: 42,
        createNewSite: true,
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    const opts = importSnapshotMock.mock.calls[0][2];
    expect(opts.createNewSite).toBe(true);
    expect(opts.siteId).toBe(42);
  });

  it('returns 400 when importSnapshot throws an Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, payload: {} }]);
    importSnapshotMock.mockRejectedValue(new Error('slug conflict'));
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/11/import', 'POST', {}),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('slug conflict');
  });

  it('returns 400 with generic message when importSnapshot rejects non-Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, payload: {} }]);
    importSnapshotMock.mockRejectedValue('boom');
    const res = await importRoute.POST(
      makeJsonReq('http://x/api/portal/snapshots/11/import', 'POST', {}),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Import failed');
  });

  it('tolerates invalid JSON body (treats as empty object)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, payload: {} }]);
    importSnapshotMock.mockResolvedValue({ siteId: 1 });
    const req = new Request('http://x/api/portal/snapshots/11/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await importRoute.POST(req, {
      params: Promise.resolve({ id: '11' }),
    });
    expect(res.status).toBe(200);
    const [, targetClientId, opts] = importSnapshotMock.mock.calls[0];
    expect(targetClientId).toBe(5);
    expect(opts.createNewSite).toBe(true); // no siteId → default true
  });
});

// ===========================================================================
// GET /api/portal/snapshots/[id]
// ===========================================================================

describe('GET /api/portal/snapshots/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await snapshotRoute.GET(
      makeReq('http://x/api/portal/snapshots/5'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await snapshotRoute.GET(
      makeReq('http://x/api/portal/snapshots/5'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when snapshot does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await snapshotRoute.GET(
      makeReq('http://x/api/portal/snapshots/5'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns the snapshot row when found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, name: 'snap', payload: { foo: 1 } }]);
    const res = await snapshotRoute.GET(
      makeReq('http://x/api/portal/snapshots/11'),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(11);
    expect(body.data.name).toBe('snap');
    expect(body.data.payload).toEqual({ foo: 1 });
  });
});

// ===========================================================================
// DELETE /api/portal/snapshots/[id]
// ===========================================================================

describe('DELETE /api/portal/snapshots/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await snapshotRoute.DELETE(
      makeReq('http://x/api/portal/snapshots/5', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await snapshotRoute.DELETE(
      makeReq('http://x/api/portal/snapshots/5', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when snapshot does not exist for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await snapshotRoute.DELETE(
      makeReq('http://x/api/portal/snapshots/5', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
    expect(deleteCalls).toHaveLength(0);
  });

  it('deletes the snapshot and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11 }]);
    const res = await snapshotRoute.DELETE(
      makeReq('http://x/api/portal/snapshots/11', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(11);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('siteSnapshots');
  });
});

// ===========================================================================
// POST /api/portal/sprints/[id]/card-order
// ===========================================================================

describe('POST /api/portal/sprints/[id]/card-order', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', { cardIds: [1] }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when sprint does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([]); // sprint lookup empty
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', { cardIds: [1] }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when non-staff user has no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]); // sprint
    getPortalClientMock.mockResolvedValue(null);
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', { cardIds: [1] }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when non-staff user does not own the project', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]); // sprint
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // projects lookup empty
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', { cardIds: [1] }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 403 when project is shared (not private) for non-staff', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]); // sprint
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, isPrivate: false }]); // project found, not private
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', { cardIds: [1] }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Forbidden');
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 400 when cardIds is not an array', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]);
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', { cardIds: 'oops' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('cardIds array required');
  });

  it('admin updates each card with its index and returns success', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]);
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', {
        cardIds: [101, 102, 103],
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[0].table).toBe('kanbanCards');
    expect(updateCalls[0].patch).toEqual({ sprintOrder: 0 });
    expect(updateCalls[1].patch).toEqual({ sprintOrder: 1 });
    expect(updateCalls[2].patch).toEqual({ sprintOrder: 2 });
  });

  it('employee updates each card too', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]);
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', {
        cardIds: [55],
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).toEqual({ sprintOrder: 0 });
  });

  it('non-staff with private project ownership can reorder cards', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]); // sprint
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, isPrivate: true }]); // project private + owned
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', {
        cardIds: [10, 11],
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(2);
  });

  it('skips non-finite cardIds (e.g. NaN) without erroring', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]);
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', {
        cardIds: [1, 'bad', 3],
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    // 'bad' → Number('bad') = NaN → not finite → skipped; only 1 and 3 update
    expect(updateCalls).toHaveLength(2);
    // Indexes 0 and 2 are used (the skipped one keeps its index gap).
    expect(updateCalls[0].patch).toEqual({ sprintOrder: 0 });
    expect(updateCalls[1].patch).toEqual({ sprintOrder: 2 });
  });

  it('returns 200 with empty array (no-op)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 9, projectId: 1 }]);
    const res = await cardOrderRoute.POST(
      makeJsonReq('http://x/api/portal/sprints/9/card-order', 'POST', { cardIds: [] }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });
});
