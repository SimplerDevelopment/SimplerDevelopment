// @vitest-environment node
/**
 * Batch 32a — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/projects/[id]/columns/[columnId]/route.ts    (PATCH, DELETE)
 *  - app/api/portal/projects/[id]/route.ts                       (PATCH)
 *  - app/api/portal/projects/[id]/webhooks/route.ts              (GET, POST)
 *  - app/api/portal/projects/route.ts                            (GET, POST)
 *
 * Strategy: heavy mocking — db.select() materializes from a FIFO queue;
 * db.insert / db.update / db.delete capture writes and emit the next queued
 * return rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const generateWebhookSecretMock = vi.fn();
vi.mock('@/lib/pm-webhooks', () => ({
  generateWebhookSecret: () => generateWebhookSecretMock(),
}));

const validateWebhookUrlMock = vi.fn();
vi.mock('@/lib/ssrf-guard', () => ({
  validateWebhookUrl: (...args: unknown[]) => validateWebhookUrlMock(...args),
}));

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

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
    projects: wrap('projects'),
    kanbanColumns: wrap('kanbanColumns'),
    kanbanCards: wrap('kanbanCards'),
    projectWebhooks: wrap('projectWebhooks'),
    projectMembers: wrap('projectMembers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface WriteCall {
  op: 'insert' | 'update' | 'delete';
  table: string;
  values?: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let writeReturnQueue: Array<Array<Record<string, unknown>>> = [];
const writeCalls: WriteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

function shiftWriteRows(): Array<Record<string, unknown>> {
  return writeReturnQueue.shift() ?? [];
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
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
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
        writeCalls.push({ op: 'insert', table: table.__table, values: v });
        const rows = shiftWriteRows();
        const result = {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          onConflictDoNothing() {
            return result;
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
          },
        };
        return result;
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let captured: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        captured = v;
        return chain;
      },
      where() {
        writeCalls.push({ op: 'update', table: table.__table, values: captured });
        const rows = shiftWriteRows();
        const returnable = {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
          },
        };
        return returnable;
      },
    };
    return chain;
  }

  function buildDelete(table: { __table: string }) {
    return {
      where() {
        writeCalls.push({ op: 'delete', table: table.__table });
        return Promise.resolve();
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const columnIdRoute = await import(
  '@/app/api/portal/projects/[id]/columns/[columnId]/route'
);
const projectIdRoute = await import('@/app/api/portal/projects/[id]/route');
const projectWebhooksRoute = await import(
  '@/app/api/portal/projects/[id]/webhooks/route'
);
const projectsRoute = await import('@/app/api/portal/projects/route');

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
const STAFF_SESSION = { user: { id: '7', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '7', role: 'employee' } };

beforeEach(() => {
  selectQueue = [];
  writeReturnQueue = [];
  writeCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  generateWebhookSecretMock.mockReset();
  validateWebhookUrlMock.mockReset();
  emitEventMock.mockReset();
});

// ===========================================================================
// PATCH /api/portal/projects/[id]/columns/[columnId]
// ===========================================================================

describe('PATCH /api/portal/projects/[id]/columns/[columnId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'New' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 (staff) when column does not belong to the project', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // column lookup → none
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'New' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 (non-staff) when invalid user id parses to NaN', async () => {
    authMock.mockResolvedValue({ user: { id: 'abc' } });
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'New' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 (non-staff) when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'New' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 (non-staff) when project not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // project lookup empty
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'New' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 (non-staff) when column missing even though project owned', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    selectQueue.push([]); // column lookup empty
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'New' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 (non-staff) when project is agency (not private)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: false }]);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'New' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Forbidden');
  });

  it('updates name (trimmed and length-capped) for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]); // column lookup
    writeReturnQueue.push([{ id: 3, name: 'Renamed' }]); // update returning
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: '  Renamed  ' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(3);
    const upd = writeCalls.find((c) => c.op === 'update' && c.table === 'kanbanColumns');
    expect((upd!.values as Record<string, unknown>).name).toBe('Renamed');
  });

  it('updates color when matching hex pattern; ignores invalid color', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    writeReturnQueue.push([{ id: 3 }]);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { color: '#abc' /* invalid: 3-char */, name: '' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    const upd = writeCalls.find((c) => c.op === 'update' && c.table === 'kanbanColumns');
    expect((upd!.values as Record<string, unknown>).color).toBeUndefined();
    expect((upd!.values as Record<string, unknown>).name).toBeUndefined();
  });

  it('updates valid 6-char hex color', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    writeReturnQueue.push([{ id: 3, color: '#abcdef' }]);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { color: '#abcdef' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    const upd = writeCalls.find((c) => c.op === 'update' && c.table === 'kanbanColumns');
    expect((upd!.values as Record<string, unknown>).color).toBe('#abcdef');
  });

  it('unsets isDone on all other columns when setting isDone=true', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    writeReturnQueue.push([]); // bulk-unset update returns nothing
    writeReturnQueue.push([{ id: 3, isDone: true }]); // final update returning
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { isDone: true }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    const updates = writeCalls.filter((c) => c.op === 'update' && c.table === 'kanbanColumns');
    expect(updates).toHaveLength(2);
    // First update is the bulk-unset (isDone:false on all others)
    expect((updates[0].values as Record<string, unknown>).isDone).toBe(false);
    // Second update sets the column itself
    expect((updates[1].values as Record<string, unknown>).isDone).toBe(true);
  });

  it('honors isDone=false without a bulk-unset', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    writeReturnQueue.push([{ id: 3, isDone: false }]);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { isDone: false }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    const updates = writeCalls.filter((c) => c.op === 'update' && c.table === 'kanbanColumns');
    expect(updates).toHaveLength(1);
    expect((updates[0].values as Record<string, unknown>).isDone).toBe(false);
  });

  it('treats wipLimit=0 as null', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    writeReturnQueue.push([{ id: 3 }]);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { wipLimit: 0 }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    const upd = writeCalls.find((c) => c.op === 'update' && c.table === 'kanbanColumns');
    expect((upd!.values as Record<string, unknown>).wipLimit).toBeNull();
  });

  it('accepts a positive wipLimit', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    writeReturnQueue.push([{ id: 3 }]);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { wipLimit: 4 }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    const upd = writeCalls.find((c) => c.op === 'update' && c.table === 'kanbanColumns');
    expect((upd!.values as Record<string, unknown>).wipLimit).toBe(4);
  });

  it('accepts wipLimit=null to clear', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    writeReturnQueue.push([{ id: 3 }]);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { wipLimit: null }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    const upd = writeCalls.find((c) => c.op === 'update' && c.table === 'kanbanColumns');
    expect((upd!.values as Record<string, unknown>).wipLimit).toBeNull();
  });

  it('non-staff with private-project ownership can edit', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    selectQueue.push([{ id: 3, projectId: 9 }]);
    selectQueue.push([{ role: 'owner' }]); // projectMembers row → canUserEditProject → true
    writeReturnQueue.push([{ id: 3, name: 'OK' }]);
    const res = await columnIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'OK' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// DELETE /api/portal/projects/[id]/columns/[columnId]
// ===========================================================================

describe('DELETE /api/portal/projects/[id]/columns/[columnId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await columnIdRoute.DELETE(
      makeReq('http://x/y', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 (non-staff) when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await columnIdRoute.DELETE(
      makeReq('http://x/y', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 (non-staff) when project not owned', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // project lookup empty
    const res = await columnIdRoute.DELETE(
      makeReq('http://x/y', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when column not found for project (staff)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // column lookup empty
    const res = await columnIdRoute.DELETE(
      makeReq('http://x/y', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Column not found');
  });

  it('returns 400 when column still has cards', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]); // column lookup
    selectQueue.push([{ id: 100 }]); // cards lookup → has one
    const res = await columnIdRoute.DELETE(
      makeReq('http://x/y', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/has cards/);
  });

  it('deletes an empty column for staff', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 3, projectId: 9 }]); // column lookup
    selectQueue.push([]); // no cards
    const res = await columnIdRoute.DELETE(
      makeReq('http://x/y', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(writeCalls.some((c) => c.op === 'delete' && c.table === 'kanbanColumns')).toBe(true);
  });

  it('non-staff owner can delete an empty column', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5 }]); // project ownership
    selectQueue.push([{ id: 3, projectId: 9 }]); // column lookup
    selectQueue.push([]); // no cards
    const res = await columnIdRoute.DELETE(
      makeReq('http://x/y', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9', columnId: '3' }) },
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// PATCH /api/portal/projects/[id]
// ===========================================================================

describe('PATCH /api/portal/projects/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'Renamed' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when project does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // project lookup empty
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'Renamed' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 (non-staff) when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    getPortalClientMock.mockResolvedValue(null);
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'Renamed' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 (non-staff) when project not owned', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, clientId: 999, isPrivate: true }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // ownership re-check empty
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'Renamed' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 (non-staff) when owned project is not private', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: false }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: false }]); // owned re-check
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'Renamed' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(403);
  });

  it('updates name/description/status/startDate/dueDate for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    writeReturnQueue.push([
      {
        id: 9,
        name: 'New',
        description: 'desc',
        status: 'archived',
        startDate: new Date('2025-01-01'),
        dueDate: new Date('2025-12-31'),
      },
    ]);
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', {
        name: 'New',
        description: 'desc',
        status: 'archived',
        startDate: '2025-01-01',
        dueDate: '2025-12-31',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    const upd = writeCalls.find((c) => c.op === 'update' && c.table === 'projects');
    const vals = upd!.values as Record<string, unknown>;
    expect(vals.name).toBe('New');
    expect(vals.description).toBe('desc');
    expect(vals.status).toBe('archived');
    expect(vals.startDate).toBeInstanceOf(Date);
    expect(vals.dueDate).toBeInstanceOf(Date);
    expect(vals.updatedAt).toBeInstanceOf(Date);
  });

  it('clears description/startDate/dueDate to null when empty', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    writeReturnQueue.push([{ id: 9 }]);
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', {
        description: '',
        startDate: '',
        dueDate: '',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const upd = writeCalls.find((c) => c.op === 'update' && c.table === 'projects');
    const vals = upd!.values as Record<string, unknown>;
    expect(vals.description).toBeNull();
    expect(vals.startDate).toBeNull();
    expect(vals.dueDate).toBeNull();
  });

  it('returns 404 if the row disappeared mid-update', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    writeReturnQueue.push([]); // update returning nothing
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'X' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('non-staff owner of private project can update', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]); // initial fetch
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]); // owned re-check
    selectQueue.push([{ role: 'owner' }]); // projectMembers row → canUserEditProject → true
    writeReturnQueue.push([{ id: 9, name: 'OK' }]);
    const res = await projectIdRoute.PATCH(
      makeJsonReq('http://x/y', 'PATCH', { name: 'OK' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// GET /api/portal/projects/[id]/webhooks
// ===========================================================================

describe('GET /api/portal/projects/[id]/webhooks', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await projectWebhooksRoute.GET(
      makeReq('http://x/y'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // project lookup empty
    const res = await projectWebhooksRoute.GET(
      makeReq('http://x/y'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when non-staff client does not match project clientId', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, clientId: 999, isPrivate: true }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await projectWebhooksRoute.GET(
      makeReq('http://x/y'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when non-staff has no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    getPortalClientMock.mockResolvedValue(null);
    const res = await projectWebhooksRoute.GET(
      makeReq('http://x/y'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('lists webhooks with redacted secrets (staff)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    selectQueue.push([
      { id: 1, projectId: 9, url: 'https://hook/1', secret: 'sk_live_abcdef1234' },
      { id: 2, projectId: 9, url: 'https://hook/2', secret: 'short' },
    ]);
    const res = await projectWebhooksRoute.GET(
      makeReq('http://x/y'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].secret).toBe('sk_liv…');
    // 'short' has 5 chars, slice(0,6) returns the whole thing
    expect(body.data[1].secret).toBe('short…');
  });
});

// ===========================================================================
// POST /api/portal/projects/[id]/webhooks
// ===========================================================================

describe('POST /api/portal/projects/[id]/webhooks', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await projectWebhooksRoute.POST(
      makeJsonReq('http://x/y', 'POST', { url: 'https://hook' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]);
    const res = await projectWebhooksRoute.POST(
      makeJsonReq('http://x/y', 'POST', { url: 'https://hook' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-staff cannot edit (agency project)', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: false }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await projectWebhooksRoute.POST(
      makeJsonReq('http://x/y', 'POST', { url: 'https://hook' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when url is not a string', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    const res = await projectWebhooksRoute.POST(
      makeJsonReq('http://x/y', 'POST', { url: 123 }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('URL required');
  });

  it('returns 400 when SSRF guard rejects the url', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    validateWebhookUrlMock.mockReturnValue({ ok: false, reason: 'blocked' });
    const res = await projectWebhooksRoute.POST(
      makeJsonReq('http://x/y', 'POST', { url: 'http://127.0.0.1' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('blocked');
  });

  it('creates a webhook with full secret returned on creation', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    generateWebhookSecretMock.mockReturnValue('whsec_FULLSECRET');
    writeReturnQueue.push([
      { id: 11, projectId: 9, url: 'https://hook', secret: 'whsec_FULLSECRET', events: ['x.y'] },
    ]);
    const res = await projectWebhooksRoute.POST(
      makeJsonReq('http://x/y', 'POST', {
        url: 'https://hook',
        events: ['x.y', 42, 'a.b'],
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.secret).toBe('whsec_FULLSECRET');
    const ins = writeCalls.find((c) => c.op === 'insert' && c.table === 'projectWebhooks');
    const vals = ins!.values as Record<string, unknown>;
    expect(vals.projectId).toBe(9);
    expect(vals.url).toBe('https://hook');
    expect(vals.secret).toBe('whsec_FULLSECRET');
    // Filtered down to strings only
    expect(vals.events).toEqual(['x.y', 'a.b']);
    expect(vals.createdBy).toBe(7);
  });

  it('treats non-array events as empty list', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    generateWebhookSecretMock.mockReturnValue('s');
    writeReturnQueue.push([{ id: 12 }]);
    const res = await projectWebhooksRoute.POST(
      makeJsonReq('http://x/y', 'POST', { url: 'https://hook', events: 'not-array' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(201);
    const ins = writeCalls.find((c) => c.op === 'insert' && c.table === 'projectWebhooks');
    expect((ins!.values as Record<string, unknown>).events).toEqual([]);
  });

  it('truncates url to 500 chars', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 9, clientId: 5, isPrivate: true }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    generateWebhookSecretMock.mockReturnValue('s');
    writeReturnQueue.push([{ id: 13 }]);
    const longUrl = 'https://' + 'a'.repeat(600);
    const res = await projectWebhooksRoute.POST(
      makeJsonReq('http://x/y', 'POST', { url: longUrl }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(201);
    const ins = writeCalls.find((c) => c.op === 'insert' && c.table === 'projectWebhooks');
    expect(((ins!.values as Record<string, unknown>).url as string).length).toBe(500);
  });
});

// ===========================================================================
// GET /api/portal/projects
// ===========================================================================

describe('GET /api/portal/projects', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await projectsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await projectsRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns projects the user is a member of (with myRole)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // count query
    selectQueue.push([{ total: 2 }]);
    // paginated list
    selectQueue.push([
      { id: 1, clientId: 5, name: 'Pub' },
      { id: 2, clientId: 5, name: 'Priv1' },
    ]);
    // projectMembers filter for non-staff
    selectQueue.push([
      { projectId: 1, role: 'owner' },
      { projectId: 2, role: 'editor' },
    ]);
    const nextReq = Object.assign(
      new Request('http://localhost/api/portal/projects'),
      { nextUrl: new URL('http://localhost/api/portal/projects') },
    ) as unknown as import('next/server').NextRequest;
    const res = await projectsRoute.GET(nextReq);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Pub');
    expect(body.data[0].myRole).toBe('owner');
    expect(body.data[1].myRole).toBe('editor');
  });
});

// ===========================================================================
// POST /api/portal/projects
// ===========================================================================

describe('POST /api/portal/projects', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await projectsRoute.POST(
      makeJsonReq('http://x/y', 'POST', { name: 'X' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await projectsRoute.POST(
      makeJsonReq('http://x/y', 'POST', { name: 'X' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await projectsRoute.POST(
      makeJsonReq('http://x/y', 'POST', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Name is required');
  });

  it('creates a project with derived projectKey and emits event', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    writeReturnQueue.push([
      { id: 42, name: 'My Cool Project', status: 'active', clientId: 5 },
    ]);
    writeReturnQueue.push([]); // projectKey update returning ignored
    const res = await projectsRoute.POST(
      makeJsonReq('http://x/y', 'POST', { name: 'My Cool Project', description: 'd' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
    // First 4 alphanum of "MyCoolProject" → "MYCO" + id 42
    expect(body.data.projectKey).toBe('MYCO42');

    const ins = writeCalls.find((c) => c.op === 'insert' && c.table === 'projects');
    const vals = ins!.values as Record<string, unknown>;
    expect(vals.name).toBe('My Cool Project');
    expect(vals.description).toBe('d');
    expect(vals.clientId).toBe(5);
    expect(vals.status).toBe('active');
    expect(vals.createdBy).toBe(7);

    // projectKey update happened
    expect(writeCalls.some((c) => c.op === 'update' && c.table === 'projects')).toBe(true);

    // emitEvent invoked
    expect(emitEventMock).toHaveBeenCalledWith(
      'project.created',
      5,
      7,
      expect.objectContaining({ id: 42, name: 'My Cool Project', status: 'active' }),
    );
  });

  it('falls back to PRJ prefix when name has no alnum chars', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    writeReturnQueue.push([{ id: 7, name: '!!!', status: 'active' }]);
    writeReturnQueue.push([]);
    const res = await projectsRoute.POST(
      makeJsonReq('http://x/y', 'POST', { name: '!!!' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.projectKey).toBe('PRJ7');
  });

  it('coerces empty description to null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    writeReturnQueue.push([{ id: 8, name: 'X' }]);
    writeReturnQueue.push([]);
    const res = await projectsRoute.POST(
      makeJsonReq('http://x/y', 'POST', { name: 'X', description: '' }),
    );
    expect(res.status).toBe(201);
    const ins = writeCalls.find((c) => c.op === 'insert' && c.table === 'projects');
    expect((ins!.values as Record<string, unknown>).description).toBeNull();
  });
});
