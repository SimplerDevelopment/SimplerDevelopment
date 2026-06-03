// @vitest-environment node
/**
 * Batch 22a — unit tests for four small portal route.ts files. Each describe
 * block scopes mocks to its target route so they don't interfere with each
 * other:
 *
 *   1. app/api/portal/api-keys/route.ts
 *   2. app/api/portal/snapshots/route.ts
 *   3. app/api/portal/my-tasks/route.ts
 *   4. app/api/portal/forgot-password/route.ts
 *
 * Strategy: all I/O is mocked. The Drizzle `db` is a hand-rolled stub with
 * queued select/insert returns and recorded update/insert call shapes. Auth,
 * portal-client, and module-specific helpers (mcp-auth, my-tasks-collect,
 * email, crypto, token-hash) are mocked via `vi.mock`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
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
  return new Proxy({
    portalApiKeys: wrap('portalApiKeys'),
    siteSnapshots: wrap('siteSnapshots'),
    users: wrap('users'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---- DB stub ---------------------------------------------------------------

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNext());
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        const rows = insertReturnQueue.shift() ?? [];
        insertCalls.push({ table: table.__table, values: v, returnedRows: rows });
        const cloned = rows.map((r) => ({ ...r }));
        return {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- Module-specific mocks -------------------------------------------------

const generatePortalApiKeyMock = vi.fn(() => ({
  key: 'pk_live_FAKEKEY',
  hash: 'HASH_FAKEKEY',
  preview: 'pk_..KEY',
}));
vi.mock('@/lib/mcp-auth', () => ({
  generatePortalApiKey: () => generatePortalApiKeyMock(),
}));

const collectKanbanTasksMock = vi.fn();
const collectBrainTasksMock = vi.fn();
vi.mock('@/lib/portal/my-tasks-collect', () => ({
  collectKanbanTasks: (...args: unknown[]) => collectKanbanTasksMock(...args),
  collectBrainTasks: (...args: unknown[]) => collectBrainTasksMock(...args),
}));

const resendSendMock = vi.fn();
vi.mock('@/lib/email', () => ({
  resend: {
    emails: { send: (...args: unknown[]) => resendSendMock(...args) },
  },
}));

vi.mock('crypto', () => ({
  randomBytes: (n: number) => ({
    toString: (_enc: string) => 'a'.repeat(n * 2),
  }),
}));

const hashTokenMock = vi.fn((t: string) => `HASH(${t.slice(0, 6)})`);
vi.mock('@/lib/security/token-hash', () => ({
  hashToken: (...args: unknown[]) => hashTokenMock(...(args as [string])),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const apiKeysRoute = await import('@/app/api/portal/api-keys/route');
const snapshotsRoute = await import('@/app/api/portal/snapshots/route');
const myTasksRoute = await import('@/app/api/portal/my-tasks/route');
const forgotPasswordRoute = await import('@/app/api/portal/forgot-password/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonRequest(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

const SESSION = { user: { id: '42', name: 'Sam' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  generatePortalApiKeyMock.mockClear();
  collectKanbanTasksMock.mockReset();
  collectBrainTasksMock.mockReset();
  resendSendMock.mockReset();
  hashTokenMock.mockClear();
});

// ===========================================================================
// 1. /api/portal/api-keys — GET / POST / DELETE
// ===========================================================================

describe('GET /api/portal/api-keys', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns the list of keys for the active client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    selectQueue.push([
      { id: 1, name: 'ci', keyPreview: 'pk_..AAA', scopes: ['*'], active: true },
      { id: 2, name: 'mcp', keyPreview: 'pk_..BBB', scopes: ['*'], active: false },
    ]);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('ci');
  });
});

describe('POST /api/portal/api-keys', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysRoute.POST(makeJsonRequest('http://x/api/portal/api-keys', {}));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysRoute.POST(makeJsonRequest('http://x/api/portal/api-keys', { name: 'x' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing or blank', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    const res = await apiKeysRoute.POST(makeJsonRequest('http://x/api/portal/api-keys', { name: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Name is required');
  });

  it('falls back to default scopes when none provided and returns the raw key once', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    insertReturnQueue.push([
      {
        id: 100,
        name: 'My Key',
        keyPreview: 'pk_..KEY',
        scopes: ['*'],
        expiresAt: null,
        createdAt: new Date('2026-05-19'),
      },
    ]);
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/api-keys', { name: 'My Key' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.key).toBe('pk_live_FAKEKEY');
    expect(body.data.scopes).toEqual(['*']);
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0].table).toBe('portalApiKeys');
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.scopes).toEqual(['*']);
    expect(values.requireCmsApproval).toBe(false);
    expect(values.expiresAt).toBe(null);
  });

  it('honors provided scopes, requireCmsApproval flag, and a valid expiresAt', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    insertReturnQueue.push([
      { id: 101, name: 'Scoped', keyPreview: 'pk_..KEY', scopes: ['cms:read'], expiresAt: null, createdAt: new Date() },
    ]);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/api-keys', {
        name: 'Scoped',
        scopes: ['cms:read'],
        requireCmsApproval: true,
        expiresAt: future,
      }),
    );
    expect(res.status).toBe(201);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.scopes).toEqual(['cms:read']);
    expect(values.requireCmsApproval).toBe(true);
    expect(values.expiresAt).toBeInstanceOf(Date);
  });

  it('drops an invalid expiresAt date silently and stores null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    insertReturnQueue.push([
      { id: 102, name: 'Bad Date', keyPreview: 'pk_..KEY', scopes: ['*'], expiresAt: null, createdAt: new Date() },
    ]);
    const res = await apiKeysRoute.POST(
      makeJsonRequest('http://x/api/portal/api-keys', {
        name: 'Bad Date',
        expiresAt: 'not-a-date',
      }),
    );
    expect(res.status).toBe(201);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.expiresAt).toBe(null);
  });
});

describe('DELETE /api/portal/api-keys', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysRoute.DELETE(makeGetRequest('http://x/api/portal/api-keys?id=1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysRoute.DELETE(makeGetRequest('http://x/api/portal/api-keys?id=1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when id is missing or not parseable', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    const res = await apiKeysRoute.DELETE(makeGetRequest('http://x/api/portal/api-keys'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('id required');
  });

  it('soft-revokes by patching active=false and revokedAt', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    const res = await apiKeysRoute.DELETE(makeGetRequest('http://x/api/portal/api-keys?id=55'));
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch;
    expect(patch.active).toBe(false);
    expect(patch.revokedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// 2. /api/portal/snapshots — GET / POST
// ===========================================================================

describe('GET /api/portal/snapshots', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await snapshotsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await snapshotsRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the slim list of snapshots scoped to the active client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    selectQueue.push([
      { id: 1, name: 'snap-a', description: null, sourceSiteId: null, version: 1, isPublic: false },
      { id: 2, name: 'snap-b', description: 'desc', sourceSiteId: null, version: 2, isPublic: true },
    ]);
    const res = await snapshotsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

describe('POST /api/portal/snapshots', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await snapshotsRoute.POST(makeJsonRequest('http://x/api/portal/snapshots', {}));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await snapshotsRoute.POST(makeJsonRequest('http://x/api/portal/snapshots', { name: 'n' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when body JSON is not an object', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    const req = new Request('http://x/api/portal/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json-(at-all)',
    });
    const res = await snapshotsRoute.POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid JSON body');
  });

  it('returns 400 when name or payload is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    const res = await snapshotsRoute.POST(
      makeJsonRequest('http://x/api/portal/snapshots', { name: 'n' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/required/);
  });

  it('returns 400 when payload schemaVersion is not 1', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    const res = await snapshotsRoute.POST(
      makeJsonRequest('http://x/api/portal/snapshots', {
        name: 'n',
        payload: { schemaVersion: 2 },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Unsupported snapshot schemaVersion 2/);
  });

  it('inserts a snapshot with sourceSiteId=null and returns the slim row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    insertReturnQueue.push([
      {
        id: 77,
        name: 'imported',
        description: 'd',
        sourceSiteId: null,
        version: 1,
        isPublic: false,
        createdAt: new Date('2026-05-19'),
      },
    ]);
    const res = await snapshotsRoute.POST(
      makeJsonRequest('http://x/api/portal/snapshots', {
        name: 'imported',
        description: 'd',
        payload: { schemaVersion: 1 },
        isPublic: false,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(77);
    expect(insertCalls).toHaveLength(1);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.sourceSiteId).toBe(null);
    expect(values.clientId).toBe(12);
  });

  it('defaults description to null and isPublic to false when omitted', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    insertReturnQueue.push([{ id: 78 }]);
    const res = await snapshotsRoute.POST(
      makeJsonRequest('http://x/api/portal/snapshots', {
        name: 'n',
        payload: { schemaVersion: 1 },
      }),
    );
    expect(res.status).toBe(200);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.description).toBe(null);
    expect(values.isPublic).toBe(false);
  });
});

// ===========================================================================
// 3. /api/portal/my-tasks — GET (sources, filters, pagination)
// ===========================================================================

describe('GET /api/portal/my-tasks', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await myTasksRoute.GET(makeGetRequest('http://x/api/portal/my-tasks'));
    expect(res.status).toBe(401);
  });

  it('aggregates kanban + brain groups and applies pagination', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    const kanban = [
      {
        id: 1,
        source: 'kanban',
        name: 'Proj A',
        projectKey: 'PA',
        clientName: 'Client',
        cards: [
          {
            id: 11,
            source: 'kanban',
            key: 'PA-1',
            title: 'k1',
            priority: 'high',
            dueDate: null,
            columnName: 'Todo',
            columnIsDone: false,
            labels: [],
            checklist: null,
            linkUrl: '/x',
            doneColumnId: null,
          },
          {
            id: 12,
            source: 'kanban',
            key: 'PA-2',
            title: 'k2',
            priority: 'low',
            dueDate: null,
            columnName: 'Todo',
            columnIsDone: false,
            labels: [],
            checklist: null,
            linkUrl: '/x',
            doneColumnId: null,
          },
        ],
      },
    ];
    const brain = [
      {
        id: 'brain-uncategorized',
        source: 'brain',
        name: 'Brain',
        projectKey: null,
        clientName: null,
        cards: [
          {
            id: 21,
            source: 'brain',
            key: 'BRAIN-1',
            title: 'b1',
            priority: 'medium',
            dueDate: null,
            columnName: 'Open',
            columnIsDone: false,
            labels: [],
            checklist: null,
            linkUrl: '/b',
            doneColumnId: null,
          },
        ],
      },
    ];
    collectKanbanTasksMock.mockResolvedValue(kanban);
    collectBrainTasksMock.mockResolvedValue(brain);

    const res = await myTasksRoute.GET(makeGetRequest('http://x/api/portal/my-tasks'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(3);
    expect(body.data.projectsAvailable).toHaveLength(1);
    expect(body.data.projectsAvailable[0].id).toBe(1);
    expect(body.data.nextCursor).toBe(null);
  });

  it('source=kanban skips the brain collector entirely', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    collectKanbanTasksMock.mockResolvedValue([]);
    collectBrainTasksMock.mockResolvedValue([]);
    const res = await myTasksRoute.GET(makeGetRequest('http://x/api/portal/my-tasks?source=kanban'));
    expect(res.status).toBe(200);
    expect(collectBrainTasksMock).not.toHaveBeenCalled();
    expect(collectKanbanTasksMock).toHaveBeenCalled();
  });

  it('source=brain skips the kanban collector entirely', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    collectKanbanTasksMock.mockResolvedValue([]);
    collectBrainTasksMock.mockResolvedValue([]);
    const res = await myTasksRoute.GET(makeGetRequest('http://x/api/portal/my-tasks?source=brain'));
    expect(res.status).toBe(200);
    expect(collectKanbanTasksMock).not.toHaveBeenCalled();
    expect(collectBrainTasksMock).toHaveBeenCalled();
  });

  it('refetches unfiltered kanban for projectsAvailable when projectIds filter is active', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    collectKanbanTasksMock.mockResolvedValue([]);
    collectBrainTasksMock.mockResolvedValue([]);
    await myTasksRoute.GET(makeGetRequest('http://x/api/portal/my-tasks?projectIds=1,2'));
    // First call uses projectIds filter; second call is the unfiltered re-fetch.
    expect(collectKanbanTasksMock).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// 4. /api/portal/forgot-password — POST
// ===========================================================================

describe('POST /api/portal/forgot-password', () => {
  it('returns 400 when the email is missing', async () => {
    const res = await forgotPasswordRoute.POST(
      makeJsonRequest('http://x/api/portal/forgot-password', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Email is required/);
  });

  it('returns 400 when the email is not a string', async () => {
    const res = await forgotPasswordRoute.POST(
      makeJsonRequest('http://x/api/portal/forgot-password', { email: 12345 }),
    );
    expect(res.status).toBe(400);
  });

  it('returns success without sending mail when no user matches (enumeration guard)', async () => {
    selectQueue.push([]); // no user
    const res = await forgotPasswordRoute.POST(
      makeJsonRequest('http://x/api/portal/forgot-password', { email: 'missing@example.com' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('returns success without sending mail when the user is inactive', async () => {
    selectQueue.push([{ id: 5, name: 'X', active: false }]);
    const res = await forgotPasswordRoute.POST(
      makeJsonRequest('http://x/api/portal/forgot-password', { email: 'x@example.com' }),
    );
    expect(res.status).toBe(200);
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('persists a hashed reset token and sends a reset email when the user is active', async () => {
    selectQueue.push([{ id: 5, name: 'Alice', active: true }]);
    resendSendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const res = await forgotPasswordRoute.POST(
      makeJsonRequest('http://x/api/portal/forgot-password', { email: 'Alice@Example.COM' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('users');
    const patch = updateCalls[0].patch;
    expect(typeof patch.passwordResetToken).toBe('string');
    // Hashed via mocked hashToken — should never equal the raw token.
    expect(patch.passwordResetToken).toMatch(/^HASH\(/);
    expect(patch.passwordResetExpires).toBeInstanceOf(Date);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const sendArgs = resendSendMock.mock.calls[0][0] as { to: string; html: string };
    expect(sendArgs.to).toBe('alice@example.com');
    expect(sendArgs.html).toMatch(/Reset your password/);
  });

  it('still returns success when the email provider returns an error object', async () => {
    selectQueue.push([{ id: 6, name: null, active: true }]);
    resendSendMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await forgotPasswordRoute.POST(
      makeJsonRequest('http://x/api/portal/forgot-password', { email: 'b@example.com' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('still returns success when sending the email throws', async () => {
    selectQueue.push([{ id: 7, name: 'C', active: true }]);
    resendSendMock.mockRejectedValue(new Error('network down'));
    const res = await forgotPasswordRoute.POST(
      makeJsonRequest('http://x/api/portal/forgot-password', { email: 'c@example.com' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});
