// @vitest-environment node
/**
 * Batch 33h — unit tests for 4 portal route.ts files (website environments).
 *
 * Routes covered:
 *  - app/api/portal/websites/[siteId]/environments/[envId]/restore/route.ts        (POST)
 *  - app/api/portal/websites/[siteId]/environments/[envId]/sync/route.ts           (POST)
 *  - app/api/portal/websites/[siteId]/environments/[envId]/vars/[varId]/route.ts   (PATCH, DELETE)
 *  - app/api/portal/websites/[siteId]/environments/[envId]/vars/route.ts           (GET, POST)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit/.orderBy). db.insert, db.delete, db.update are mocked to capture
 * writes. getEnvironmentForClient, snapshotEnvironment, setEnvVars, and auth()
 * are also fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getEnvironmentForClientMock = vi.fn();
const snapshotEnvironmentMock = vi.fn();
vi.mock('@/lib/environment-helpers', () => ({
  getEnvironmentForClient: (...args: unknown[]) => getEnvironmentForClientMock(...args),
  snapshotEnvironment: (...args: unknown[]) => snapshotEnvironmentMock(...args),
}));

const setEnvVarsMock = vi.fn();
vi.mock('@/lib/vercel', () => ({
  setEnvVars: (...args: unknown[]) => setEnvVarsMock(...args),
}));

const requireServiceMock = vi.fn();
vi.mock('@/lib/mcp/types', () => ({
  requireService: (...args: unknown[]) => requireServiceMock(...args),
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
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
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
  return new Proxy({
    websiteBackups: wrap('websiteBackups'),
    websiteEnvVars: wrap('websiteEnvVars'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + insert/delete/update capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
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
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
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

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
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
      insert(table: { __table: string }) {
        return buildInsert(table);
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

const restoreRoute = await import(
  '@/app/api/portal/websites/[siteId]/environments/[envId]/restore/route'
);
const syncRoute = await import(
  '@/app/api/portal/websites/[siteId]/environments/[envId]/sync/route'
);
const varIdRoute = await import(
  '@/app/api/portal/websites/[siteId]/environments/[envId]/vars/[varId]/route'
);
const varsRoute = await import(
  '@/app/api/portal/websites/[siteId]/environments/[envId]/vars/route'
);

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

function envResult(overrides: {
  clientId?: number;
  siteId?: number;
  envId?: number;
  vercelProjectId?: string | null;
  vercelTarget?: string;
} = {}) {
  return {
    client: { id: overrides.clientId ?? 5 },
    site: {
      id: overrides.siteId ?? 100,
      clientId: overrides.clientId ?? 5,
      vercelProjectId:
        'vercelProjectId' in overrides ? overrides.vercelProjectId : 'prj_abc',
    },
    env: {
      id: overrides.envId ?? 200,
      websiteId: overrides.siteId ?? 100,
      vercelTarget: overrides.vercelTarget ?? 'production',
    },
  };
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  deleteCalls.length = 0;
  updateCalls.length = 0;
  authMock.mockReset();
  getEnvironmentForClientMock.mockReset();
  snapshotEnvironmentMock.mockReset();
  setEnvVarsMock.mockReset();
  requireServiceMock.mockReset();
  requireServiceMock.mockResolvedValue(true);
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/environments/[envId]/restore
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/environments/[envId]/restore', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/restore', 'POST', { backupId: 1 }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when getEnvironmentForClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/restore', 'POST', { backupId: 1 }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 400 when backupId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/restore', 'POST', {}),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('backupId is required');
  });

  it('returns 404 when backup not found for this environment', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    selectQueue.push([]); // backup lookup empty
    const res = await restoreRoute.POST(
      makeJsonReq('http://x/restore', 'POST', { backupId: 999 }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Backup not found');
    expect(insertCalls).toHaveLength(0);
    expect(deleteCalls).toHaveLength(0);
  });

  it('restores backup: snapshots current, inserts auto-backup, clears env vars, inserts from snapshot', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const snapshotPayload = {
      envVars: [
        { key: 'FOO', value: 'bar' },
        { key: 'BAZ', value: 'qux' },
      ],
    };
    selectQueue.push([{ id: 1, snapshot: snapshotPayload }]); // backup lookup
    snapshotEnvironmentMock.mockResolvedValue({ envVars: [{ key: 'OLD', value: '1' }] });

    const res = await restoreRoute.POST(
      makeJsonReq('http://x/restore', 'POST', { backupId: 1 }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/restored from backup/);

    // snapshotEnvironment called with (envId, siteId) from result
    expect(snapshotEnvironmentMock).toHaveBeenCalledWith(200, 100);

    // Auto-backup inserted into websiteBackups
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    const autoBackupCall = insertCalls.find((c) => c.table === 'websiteBackups');
    expect(autoBackupCall).toBeDefined();
    expect(autoBackupCall!.values).toMatchObject({
      environmentId: 200,
      createdBy: 7,
      snapshot: { envVars: [{ key: 'OLD', value: '1' }] },
    });
    expect(String((autoBackupCall!.values as Record<string, unknown>).name)).toMatch(/Auto-backup before restore/);

    // Existing env vars cleared
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('websiteEnvVars');

    // Snapshot env vars inserted
    const envVarInsert = insertCalls.find((c) => c.table === 'websiteEnvVars');
    expect(envVarInsert).toBeDefined();
    expect(envVarInsert!.values).toEqual([
      { environmentId: 200, key: 'FOO', value: 'bar', syncedToVercel: false },
      { environmentId: 200, key: 'BAZ', value: 'qux', syncedToVercel: false },
    ]);
  });

  it('restores backup with empty envVars: clears but does not insert env vars', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    selectQueue.push([{ id: 1, snapshot: { envVars: [] } }]);
    snapshotEnvironmentMock.mockResolvedValue({ envVars: [] });

    const res = await restoreRoute.POST(
      makeJsonReq('http://x/restore', 'POST', { backupId: 1 }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);

    // Only the auto-backup insert; no env var insert.
    const envVarInsert = insertCalls.find((c) => c.table === 'websiteEnvVars');
    expect(envVarInsert).toBeUndefined();
    // Still cleared.
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('websiteEnvVars');
  });

  it('restores backup when snapshot.envVars is undefined (no insert)', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    selectQueue.push([{ id: 1, snapshot: {} }]);
    snapshotEnvironmentMock.mockResolvedValue({ envVars: [] });

    const res = await restoreRoute.POST(
      makeJsonReq('http://x/restore', 'POST', { backupId: 1 }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    const envVarInsert = insertCalls.find((c) => c.table === 'websiteEnvVars');
    expect(envVarInsert).toBeUndefined();
    expect(deleteCalls).toHaveLength(1);
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/environments/[envId]/sync
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/environments/[envId]/sync', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await syncRoute.POST(
      makeReq('http://x/sync', { method: 'POST' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when getEnvironmentForClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await syncRoute.POST(
      makeReq('http://x/sync', { method: 'POST' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 400 when site has no vercelProjectId', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult({ vercelProjectId: null }));
    const res = await syncRoute.POST(
      makeReq('http://x/sync', { method: 'POST' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/must be provisioned/);
  });

  it('returns 200 with "No env vars to sync" when none exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    selectQueue.push([]); // no env vars

    const res = await syncRoute.POST(
      makeReq('http://x/sync', { method: 'POST' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('No env vars to sync.');
    expect(setEnvVarsMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('syncs env vars to Vercel, marks each synced, returns singular message for 1 var', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    selectQueue.push([
      { id: 1, key: 'A', value: '1' },
    ]);
    setEnvVarsMock.mockResolvedValue(undefined);

    const res = await syncRoute.POST(
      makeReq('http://x/sync', { method: 'POST' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/1 variable synced to Vercel \(production\)/);

    expect(setEnvVarsMock).toHaveBeenCalledTimes(1);
    expect(setEnvVarsMock.mock.calls[0][0]).toBe('prj_abc');
    expect(setEnvVarsMock.mock.calls[0][1]).toEqual([
      { key: 'A', value: '1', target: ['production'] },
    ]);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('websiteEnvVars');
    expect(updateCalls[0].patch.syncedToVercel).toBe(true);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('uses plural "variables" message for >1 var', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult({ vercelTarget: 'preview' }));
    selectQueue.push([
      { id: 1, key: 'A', value: '1' },
      { id: 2, key: 'B', value: '2' },
    ]);
    setEnvVarsMock.mockResolvedValue(undefined);

    const res = await syncRoute.POST(
      makeReq('http://x/sync', { method: 'POST' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/2 variables synced to Vercel \(preview\)/);
    expect(updateCalls).toHaveLength(2);
  });

  it('returns 500 with message when setEnvVars throws an Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    selectQueue.push([{ id: 1, key: 'A', value: '1' }]);
    setEnvVarsMock.mockRejectedValue(new Error('vercel boom'));

    const res = await syncRoute.POST(
      makeReq('http://x/sync', { method: 'POST' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('vercel boom');
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 500 with generic message when setEnvVars throws non-Error', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    selectQueue.push([{ id: 1, key: 'A', value: '1' }]);
    setEnvVarsMock.mockRejectedValue('weirdness');

    const res = await syncRoute.POST(
      makeReq('http://x/sync', { method: 'POST' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Sync failed');
  });
});

// ===========================================================================
// PATCH /api/portal/websites/[siteId]/environments/[envId]/vars/[varId]
// ===========================================================================

describe('PATCH /api/portal/websites/[siteId]/environments/[envId]/vars/[varId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await varIdRoute.PATCH(
      makeJsonReq('http://x/vars/5', 'PATCH', { key: 'A' }),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when getEnvironmentForClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await varIdRoute.PATCH(
      makeJsonReq('http://x/vars/5', 'PATCH', { key: 'A' }),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('updates only key (trimmed) when provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varIdRoute.PATCH(
      makeJsonReq('http://x/vars/5', 'PATCH', { key: '  MY_KEY  ' }),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('websiteEnvVars');
    expect(updateCalls[0].patch.key).toBe('MY_KEY');
    expect(updateCalls[0].patch.syncedToVercel).toBe(false);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    // value not included
    expect('value' in updateCalls[0].patch).toBe(false);
  });

  it('updates only value (coerced to string) when provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varIdRoute.PATCH(
      makeJsonReq('http://x/vars/5', 'PATCH', { value: 42 }),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.value).toBe('42');
    expect('key' in updateCalls[0].patch).toBe(false);
  });

  it('updates both key and value when both present', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varIdRoute.PATCH(
      makeJsonReq('http://x/vars/5', 'PATCH', { key: 'K', value: 'V' }),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({
      key: 'K',
      value: 'V',
      syncedToVercel: false,
    });
  });

  it('updates with neither key nor value still sets updatedAt + syncedToVercel=false', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varIdRoute.PATCH(
      makeJsonReq('http://x/vars/5', 'PATCH', {}),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.syncedToVercel).toBe(false);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect('key' in updateCalls[0].patch).toBe(false);
    expect('value' in updateCalls[0].patch).toBe(false);
  });
});

// ===========================================================================
// DELETE /api/portal/websites/[siteId]/environments/[envId]/vars/[varId]
// ===========================================================================

describe('DELETE /api/portal/websites/[siteId]/environments/[envId]/vars/[varId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await varIdRoute.DELETE(
      makeReq('http://x/vars/5', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when getEnvironmentForClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await varIdRoute.DELETE(
      makeReq('http://x/vars/5', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('deletes the env var and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varIdRoute.DELETE(
      makeReq('http://x/vars/5', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '100', envId: '200', varId: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Deleted.');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('websiteEnvVars');
  });
});

// ===========================================================================
// GET /api/portal/websites/[siteId]/environments/[envId]/vars
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/environments/[envId]/vars', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await varsRoute.GET(
      makeReq('http://x/vars'),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when getEnvironmentForClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await varsRoute.GET(
      makeReq('http://x/vars'),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns the list of env vars when present', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const rows = [
      { id: 1, key: 'A', value: '1', environmentId: 200 },
      { id: 2, key: 'B', value: '2', environmentId: 200 },
    ];
    selectQueue.push(rows);

    const res = await varsRoute.GET(
      makeReq('http://x/vars'),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(rows);
  });

  it('returns empty array when no env vars exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    selectQueue.push([]);
    const res = await varsRoute.GET(
      makeReq('http://x/vars'),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/websites/[siteId]/environments/[envId]/vars
// ===========================================================================

describe('POST /api/portal/websites/[siteId]/environments/[envId]/vars', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { key: 'A', value: '1' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when getEnvironmentForClient returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(null);
    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { key: 'A', value: '1' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 400 when key is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { value: '1' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('key is required');
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 400 when key is not a string', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { key: 123, value: '1' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('key is required');
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 400 when value is undefined', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { key: 'A' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('value is required');
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 400 when value is null', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { key: 'A', value: null }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('value is required');
    expect(insertCalls).toHaveLength(0);
  });

  it('inserts new env var and returns the row', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    const newRow = { id: 42, environmentId: 200, key: 'MY_KEY', value: 'hello' };
    insertReturnQueue.push([newRow]);

    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { key: '  MY_KEY  ', value: 'hello' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(newRow);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('websiteEnvVars');
    expect(insertCalls[0].values).toEqual({
      environmentId: 200,
      key: 'MY_KEY', // trimmed
      value: 'hello',
    });
  });

  it('coerces non-string value to string when inserting', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    insertReturnQueue.push([{ id: 1, key: 'NUM', value: '7' }]);

    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { key: 'NUM', value: 7 }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    expect(insertCalls[0].values).toMatchObject({
      environmentId: 200,
      key: 'NUM',
      value: '7',
    });
  });

  it('accepts empty string value (not null/undefined)', async () => {
    authMock.mockResolvedValue(SESSION);
    getEnvironmentForClientMock.mockResolvedValue(envResult());
    insertReturnQueue.push([{ id: 1, key: 'EMPTY', value: '' }]);

    const res = await varsRoute.POST(
      makeJsonReq('http://x/vars', 'POST', { key: 'EMPTY', value: '' }),
      { params: Promise.resolve({ siteId: '100', envId: '200' }) },
    );
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({ value: '' });
  });
});
