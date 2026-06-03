// @vitest-environment node
/**
 * Batch 26d — unit tests for four admin portal clients routes.
 *
 * Routes covered:
 *  - app/api/admin/portal/clients/route.ts                              (GET / POST)
 *  - app/api/admin/portal/clients/[id]/route.ts                          (GET / PATCH)
 *  - app/api/admin/portal/clients/[id]/members/route.ts                  (GET / POST)
 *  - app/api/admin/portal/clients/[id]/members/[memberId]/route.ts       (DELETE)
 *
 * Strategy: heavy mocking — db.select() materializes from a queue of result rows
 * via a thenable chain; db.insert/update/delete are captured and emit the next
 * queued rows from `insertReturnQueue` / `updateReturnQueue`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const hashMock = vi.fn();
vi.mock('bcryptjs', () => ({
  hash: (...args: unknown[]) => hashMock(...args),
}));

const ensureDefaultPipelineMock = vi.fn();
vi.mock('@/lib/crm/default-pipeline', () => ({
  ensureDefaultPipeline: (...args: unknown[]) => ensureDefaultPipelineMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, vals: unknown) => ({ op: 'inArray', a, vals }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'raw', s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
    clients: wrap('clients'),
    users: wrap('users'),
    clientMembers: wrap('clientMembers'),
    clientServices: wrap('clientServices'),
    services: wrap('services'),
    clientWebsites: wrap('clientWebsites'),
    projects: wrap('projects'),
    supportTickets: wrap('supportTickets'),
    invoices: wrap('invoices'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock — select queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface DeleteCall {
  table: string;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) materialized = Promise.resolve(shiftSelect());
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'rightJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
      chain[m] = passthrough;
    }
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
            const rows = updateReturnQueue.shift() ?? [];
            return Object.assign(Promise.resolve(rows.map((r) => ({ ...r }))), {
              returning(_proj?: unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
            });
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return Promise.resolve(undefined);
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          returning(_proj?: unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- modules under test (imported AFTER all mocks) -----------------------

const clientsRoute = await import('@/app/api/admin/portal/clients/route');
const clientByIdRoute = await import('@/app/api/admin/portal/clients/[id]/route');
const membersRoute = await import('@/app/api/admin/portal/clients/[id]/members/route');
const memberByIdRoute = await import('@/app/api/admin/portal/clients/[id]/members/[memberId]/route');

// ---- helpers -------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeJsonReq(url: string, body: unknown, method: string = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ADMIN = { user: { id: '1', name: 'Admin', role: 'admin' } };
const EMPLOYEE = { user: { id: '2', name: 'Emp', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '3', name: 'Cli', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  hashMock.mockReset();
  ensureDefaultPipelineMock.mockReset();
  vi.restoreAllMocks();
});

// ===========================================================================
// /api/admin/portal/clients  (GET / POST)
// ===========================================================================

describe('admin/portal/clients route', () => {
  it('GET returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await clientsRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('GET returns 401 when caller is not staff', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await clientsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('GET returns 401 when session.user has no id', async () => {
    authMock.mockResolvedValue({ user: { role: 'admin' } });
    const res = await clientsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('GET returns rows for admin', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([
      { id: 10, userId: 100, company: 'Acme', userName: 'A', userEmail: 'a@b' },
      { id: 11, userId: 101, company: 'Beta', userName: 'B', userEmail: 'b@b' },
    ]);
    const res = await clientsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].company).toBe('Acme');
  });

  it('GET works for employee role as well', async () => {
    authMock.mockResolvedValue(EMPLOYEE);
    selectQueue.push([{ id: 99 }]);
    const res = await clientsRoute.GET();
    expect(res.status).toBe(200);
  });

  it('POST returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await clientsRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients', { name: 'n', email: 'e@e', password: 'p' }),
    );
    expect(res.status).toBe(401);
  });

  it('POST returns 400 when required fields are missing', async () => {
    authMock.mockResolvedValue(ADMIN);
    const res = await clientsRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients', { name: 'n' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Name, email, and password are required/);
  });

  it('POST returns 400 when email already exists', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([{ id: 50, email: 'dup@x.com' }]);
    const res = await clientsRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients', {
        name: 'N',
        email: 'dup@x.com',
        password: 'p',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Email already exists/);
  });

  it('POST creates user, client, member, and pipeline on success', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([]); // no existing user
    hashMock.mockResolvedValue('hashed-pw');
    insertReturnQueue.push([{ id: 77, name: 'N', email: 'new@x.com', role: 'client' }]); // user
    insertReturnQueue.push([{ id: 88, userId: 77, company: 'Co' }]); // client
    insertReturnQueue.push([]); // clientMembers — no returning chain
    ensureDefaultPipelineMock.mockResolvedValue({ id: 1 });

    const res = await clientsRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients', {
        name: 'N',
        email: 'new@x.com',
        password: 'pw',
        company: 'Co',
        phone: '555',
        website: 'w',
        address: 'a',
        notes: 'n',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe(77);
    expect(body.data.client.id).toBe(88);
    expect(hashMock).toHaveBeenCalledWith('pw', 12);
    expect(insertCalls.map((c) => c.table)).toEqual(['users', 'clients', 'clientMembers']);
    expect(insertCalls[2].values).toMatchObject({ clientId: 88, userId: 77, role: 'owner' });
    expect(ensureDefaultPipelineMock).toHaveBeenCalledWith(88);
  });
});

// ===========================================================================
// /api/admin/portal/clients/[id]  (GET / PATCH)
// ===========================================================================

describe('admin/portal/clients/[id] route', () => {
  it('GET returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await clientByIdRoute.GET(
      makeReq('http://x/api/admin/portal/clients/5'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('GET returns 401 when caller is a client (not staff)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await clientByIdRoute.GET(
      makeReq('http://x/api/admin/portal/clients/5'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('GET returns 404 when client not found', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([]);
    const res = await clientByIdRoute.GET(
      makeReq('http://x/api/admin/portal/clients/5'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Not found/);
  });

  it('GET returns the client + user when found', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([{ client: { id: 5, company: 'Co' }, user: { id: 9, name: 'U' } }]);
    const res = await clientByIdRoute.GET(
      makeReq('http://x/api/admin/portal/clients/5'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.client.id).toBe(5);
    expect(body.data.user.name).toBe('U');
  });

  it('PATCH returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await clientByIdRoute.PATCH(
      makeJsonReq('http://x/api/admin/portal/clients/5', { company: 'NewCo' }, 'PATCH'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('PATCH updates client only when body has no name/active', async () => {
    authMock.mockResolvedValue(ADMIN);
    updateReturnQueue.push([{ id: 5, userId: 9, company: 'NewCo' }]);
    const res = await clientByIdRoute.PATCH(
      makeJsonReq('http://x/api/admin/portal/clients/5', {
        company: 'NewCo',
        phone: '555',
        website: 'w',
        address: 'a',
        notes: 'n',
      }, 'PATCH'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.company).toBe('NewCo');
    // only the clients update was called, not the users update
    expect(updateCalls.map((c) => c.table)).toEqual(['clients']);
  });

  it('PATCH also updates users when name is supplied', async () => {
    authMock.mockResolvedValue(ADMIN);
    updateReturnQueue.push([{ id: 5, userId: 42, company: 'X' }]); // clients update returns
    const res = await clientByIdRoute.PATCH(
      makeJsonReq('http://x/api/admin/portal/clients/5', {
        company: 'X',
        name: 'NewName',
      }, 'PATCH'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls.map((c) => c.table)).toEqual(['clients', 'users']);
    expect(updateCalls[1].patch).toMatchObject({ name: 'NewName' });
  });

  it('PATCH also updates users when active is supplied (false)', async () => {
    authMock.mockResolvedValue(ADMIN);
    updateReturnQueue.push([{ id: 5, userId: 42, company: 'X' }]);
    const res = await clientByIdRoute.PATCH(
      makeJsonReq('http://x/api/admin/portal/clients/5', {
        active: false,
      }, 'PATCH'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls.map((c) => c.table)).toEqual(['clients', 'users']);
    expect(updateCalls[1].patch).toMatchObject({ active: false });
  });
});

// ===========================================================================
// /api/admin/portal/clients/[id]/members  (GET / POST)
// ===========================================================================

describe('admin/portal/clients/[id]/members route', () => {
  it('GET returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await membersRoute.GET(
      makeReq('http://x/api/admin/portal/clients/5/members'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('GET returns 401 when caller is a client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await membersRoute.GET(
      makeReq('http://x/api/admin/portal/clients/5/members'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('GET returns member rows', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([
      { memberId: 1, role: 'owner', userId: 100, name: 'O', email: 'o@x' },
      { memberId: 2, role: 'member', userId: 101, name: 'M', email: 'm@x' },
    ]);
    const res = await membersRoute.GET(
      makeReq('http://x/api/admin/portal/clients/5/members'),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].role).toBe('owner');
  });

  it('POST returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await membersRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients/5/members', {
        name: 'N', email: 'e@e', password: 'p',
      }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('POST returns 404 when client not found', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([]); // client lookup
    const res = await membersRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients/5/members', {
        name: 'N', email: 'e@e', password: 'p',
      }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('POST returns 400 when required fields missing/blank', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([{ id: 5 }]); // client lookup
    const res = await membersRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients/5/members', {
        name: '   ', email: 'e@e', password: 'p',
      }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Name, email, and password are required/);
  });

  it('POST returns 400 when user is already a member of the client', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([{ id: 5 }]); // client lookup
    selectQueue.push([{ id: 200, name: 'Existing', email: 'e@e' }]); // existing user
    selectQueue.push([{ id: 99, clientId: 5, userId: 200 }]); // existing membership
    const res = await membersRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients/5/members', {
        name: 'Existing', email: 'e@e', password: 'p',
      }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/already a member/);
  });

  it('POST creates a new user when none exists and inserts a member', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([{ id: 5 }]); // client lookup
    selectQueue.push([]); // existing user lookup — none
    selectQueue.push([]); // already-member lookup — none
    hashMock.mockResolvedValue('hashed');
    insertReturnQueue.push([{ id: 300, name: 'N', email: 'new@x.com' }]); // user insert
    insertReturnQueue.push([{ id: 400, clientId: 5, userId: 300, role: 'member' }]); // member insert

    const res = await membersRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients/5/members', {
        name: 'N', email: 'new@x.com', password: 'pw',
      }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(400);
    expect(body.data.email).toBe('new@x.com');
    expect(body.data.name).toBe('N');
    expect(hashMock).toHaveBeenCalledWith('pw', 12);
    expect(insertCalls.map((c) => c.table)).toEqual(['users', 'clientMembers']);
    const memberInsert = insertCalls[1].values as Record<string, unknown>;
    expect(memberInsert.invitedBy).toBe(1); // parsed from ADMIN session id
  });

  it('POST reuses existing user when found and skips bcrypt hash', async () => {
    authMock.mockResolvedValue(EMPLOYEE);
    selectQueue.push([{ id: 5 }]); // client lookup
    selectQueue.push([{ id: 222, name: 'Reuse', email: 'r@x.com' }]); // existing user
    selectQueue.push([]); // not yet a member
    insertReturnQueue.push([{ id: 500, clientId: 5, userId: 222, role: 'member' }]);

    const res = await membersRoute.POST(
      makeJsonReq('http://x/api/admin/portal/clients/5/members', {
        name: 'Whatever', email: 'r@x.com', password: 'pw',
      }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(500);
    expect(body.data.name).toBe('Reuse'); // from existing user, not body
    expect(hashMock).not.toHaveBeenCalled();
    expect(insertCalls.map((c) => c.table)).toEqual(['clientMembers']);
  });
});

// ===========================================================================
// /api/admin/portal/clients/[id]/members/[memberId]  (DELETE)
// ===========================================================================

describe('admin/portal/clients/[id]/members/[memberId] route', () => {
  it('DELETE returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await memberByIdRoute.DELETE(
      makeReq('http://x/api/admin/portal/clients/5/members/7', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5', memberId: '7' }) },
    );
    expect(res.status).toBe(401);
  });

  it('DELETE returns 401 when caller is a client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await memberByIdRoute.DELETE(
      makeReq('http://x/api/admin/portal/clients/5/members/7', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5', memberId: '7' }) },
    );
    expect(res.status).toBe(401);
  });

  it('DELETE returns 404 when member not found', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([]);
    const res = await memberByIdRoute.DELETE(
      makeReq('http://x/api/admin/portal/clients/5/members/7', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5', memberId: '7' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Member not found/);
  });

  it('DELETE returns 400 when target is the owner', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([{ id: 7, clientId: 5, role: 'owner' }]);
    const res = await memberByIdRoute.DELETE(
      makeReq('http://x/api/admin/portal/clients/5/members/7', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5', memberId: '7' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Cannot remove the account owner/);
    expect(deleteCalls).toHaveLength(0);
  });

  it('DELETE removes a non-owner member', async () => {
    authMock.mockResolvedValue(ADMIN);
    selectQueue.push([{ id: 7, clientId: 5, role: 'member' }]);
    const res = await memberByIdRoute.DELETE(
      makeReq('http://x/api/admin/portal/clients/5/members/7', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5', memberId: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('clientMembers');
  });

  it('DELETE accepts employee role as well', async () => {
    authMock.mockResolvedValue(EMPLOYEE);
    selectQueue.push([{ id: 7, clientId: 5, role: 'member' }]);
    const res = await memberByIdRoute.DELETE(
      makeReq('http://x/api/admin/portal/clients/5/members/7', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '5', memberId: '7' }) },
    );
    expect(res.status).toBe(200);
  });
});
