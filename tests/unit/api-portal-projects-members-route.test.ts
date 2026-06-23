// @vitest-environment node
/**
 * Unit tests for app/api/portal/projects/[id]/members/route.ts
 * (GET / POST / PATCH / DELETE).
 *
 * Strategy: db.select() is mocked with a queue of result rows; each chain
 * call (.from / .innerJoin / .where / .limit / .orderBy) returns the same
 * chainable object that resolves via Promise.all-friendly .then(). Writes
 * (insert / update / delete) capture calls and dequeue rows from separate
 * queues for .returning().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks (must be declared BEFORE importing the route) ----

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const isPortalStaffMock = vi.fn();
vi.mock('@/lib/portal', () => ({
  isPortalStaff: () => isPortalStaffMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// drizzle-orm operators — stubbed to plain objects so column comparisons are inert
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
}));

// schema proxy — any column access returns an opaque object
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
  const tables = {
    projects: wrap('projects'),
    projectMembers: wrap('projectMembers'),
    users: wrap('users'),
    clientMembers: wrap('clientMembers'),
    clients: wrap('clients'),
  };
  return new Proxy(tables, {
    has: (t, p) =>
      p in t ||
      !(
        p === 'then' ||
        p === '__esModule' ||
        p === 'default' ||
        typeof p !== 'string'
      ),
    get: (t, p) =>
      p in t
        ? t[p as keyof typeof t]
        : p === 'then' ||
            p === '__esModule' ||
            p === 'default' ||
            typeof p !== 'string'
          ? undefined
          : wrap(p as string),
  });
});

// ---- db mock ----

interface InsertCall {
  table: string;
  values: Record<string, unknown>;
  returnedRows: Array<Record<string, unknown>>;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
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

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null =
      null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNext());
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'groupBy',
      'having',
    ]) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(
          onF: (v: unknown) => unknown,
          onR?: (e: unknown) => unknown,
        ) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(
          onF: (v: unknown) => unknown,
          onR?: (e: unknown) => unknown,
        ) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (
      onF: (v: unknown) => unknown,
      onR?: (e: unknown) => unknown,
    ) => materialize().then(onF, onR);
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown>) {
        const rows = insertReturnQueue.shift() ?? [];
        insertCalls.push({ table: table.__table, values: v, returnedRows: rows });
        const cloned = rows.map((r) => ({ ...r }));
        return {
          onConflictDoUpdate(_opts: unknown) {
            return {
              returning() {
                return Promise.resolve(cloned);
              },
              then(
                onF: (v: unknown) => unknown,
                onR?: (e: unknown) => unknown,
              ) {
                return Promise.resolve(cloned).then(onF, onR);
              },
            };
          },
          returning() {
            return Promise.resolve(cloned);
          },
          then(
            onF: (v: unknown) => unknown,
            onR?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(cloned).then(onF, onR);
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
            const rows = updateReturnQueue.shift() ?? [];
            updateCalls.push({
              table: table.__table,
              patch,
              filter,
              returnedRows: rows,
            });
            const cloned = rows.map((r) => ({ ...r }));
            return {
              returning() {
                return Promise.resolve(cloned);
              },
              then(
                onF: (v: unknown) => unknown,
                onR?: (e: unknown) => unknown,
              ) {
                return Promise.resolve(cloned).then(onF, onR);
              },
            };
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
          then(
            onF: (v: unknown) => unknown,
            onR?: (e: unknown) => unknown,
          ) {
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

// ---- module under test (imported AFTER mocks) ----

const { GET, POST, PATCH, DELETE } = await import(
  '@/app/api/portal/projects/[id]/members/route'
);

// ---- helpers ----

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(
  body: unknown,
  method: string = 'POST',
  url: string = 'http://x/api/portal/projects/1/members',
): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(qs: string): Request {
  return new Request(
    `http://x/api/portal/projects/1/members?${qs}`,
    { method: 'DELETE' },
  );
}

const SESSION = { user: { id: '7', role: 'client' } };
const STAFF_SESSION = { user: { id: '1', role: 'admin' } };

// Project row with clientId=33
const PROJECT_ROW = { id: 1, clientId: 33 };
// Client that matches clientId=33
const CLIENT = { id: 33 };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  isPortalStaffMock.mockReset();
  getPortalClientMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/projects/[id]/members', () => {
  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue(null);
    isPortalStaffMock.mockResolvedValue(false);
    // select queue: projectRows + memberRows (run in Promise.all)
    selectQueue.push([PROJECT_ROW]);
    selectQueue.push([]);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for non-numeric project id', async () => {
    const res = await GET(new Request('http://x'), makeParams('abc'));
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  it('returns 404 when project does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    isPortalStaffMock.mockResolvedValue(false);
    // projectRows empty, memberRows empty
    selectQueue.push([]);
    selectQueue.push([]);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-staff when portal client does not match project', async () => {
    authMock.mockResolvedValue(SESSION);
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([PROJECT_ROW]);
    selectQueue.push([{ id: 10, userId: 7, role: 'owner', name: 'Me', email: 'm@x.com', addedAt: null }]);
    getPortalClientMock.mockResolvedValue({ id: 99 }); // wrong client
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with member list for matching client', async () => {
    authMock.mockResolvedValue(SESSION);
    isPortalStaffMock.mockResolvedValue(false);
    const members = [
      { id: 10, userId: 7, role: 'owner', name: 'Me', email: 'm@x.com', addedAt: null },
    ];
    selectQueue.push([PROJECT_ROW]);
    selectQueue.push(members);
    getPortalClientMock.mockResolvedValue(CLIENT);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].role).toBe('owner');
  });

  it('returns 200 with member list for staff (skips client check)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([PROJECT_ROW]);
    selectQueue.push([{ id: 11, userId: 1, role: 'owner', name: 'Admin', email: 'a@x.com', addedAt: null }]);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    // staff path never calls getPortalClient
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });

  it('returns 200 with empty member list', async () => {
    authMock.mockResolvedValue(SESSION);
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([PROJECT_ROW]);
    selectQueue.push([]);
    getPortalClientMock.mockResolvedValue(CLIENT);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/portal/projects/[id]/members', () => {
  /**
   * authorizeOwnerAccess runs three parallel selects (isPortalStaff +
   * projectRows + memberRows). Then if non-staff it calls getPortalClient.
   * We push rows in order: projectRows, memberRows (+ optionally userRows,
   * clientMemberRows, ownerRows).
   */
  function setupOwnerAccess({
    staff = false,
    project = PROJECT_ROW,
    callerRole = 'owner' as string | undefined,
    client = CLIENT,
  } = {}) {
    isPortalStaffMock.mockResolvedValue(staff);
    // authorizeOwnerAccess: projectRows + memberRows (parallel)
    selectQueue.push([project]);
    selectQueue.push(callerRole ? [{ role: callerRole }] : []);
    if (!staff) {
      getPortalClientMock.mockResolvedValue(client);
    }
  }

  it('returns 404 when project does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([]); // project not found
    selectQueue.push([]);
    getPortalClientMock.mockResolvedValue(CLIENT);
    const res = await POST(makeJsonRequest({ userId: 8, role: 'viewer' }), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when session has no user', async () => {
    authMock.mockResolvedValue(null);
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([]);
    selectQueue.push([]);
    const res = await POST(makeJsonRequest({ userId: 8, role: 'viewer' }), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is not owner or staff', async () => {
    authMock.mockResolvedValue(SESSION);
    setupOwnerAccess({ callerRole: 'editor' });
    const res = await POST(makeJsonRequest({ userId: 8, role: 'viewer' }), makeParams('1'));
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Forbidden');
  });

  it('returns 400 for invalid role', async () => {
    authMock.mockResolvedValue(SESSION);
    setupOwnerAccess();
    const res = await POST(makeJsonRequest({ userId: 8, role: 'superadmin' }), makeParams('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/valid role/);
  });

  it('returns 400 when userId is not a number', async () => {
    authMock.mockResolvedValue(SESSION);
    setupOwnerAccess();
    const res = await POST(makeJsonRequest({ userId: 'abc', role: 'viewer' }), makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when target user does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    setupOwnerAccess();
    // target user lookup returns empty
    selectQueue.push([]);
    const res = await POST(makeJsonRequest({ userId: 8, role: 'viewer' }), makeParams('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('User not found');
  });

  it('returns 403 when target user is not in the client tenancy', async () => {
    authMock.mockResolvedValue(SESSION);
    setupOwnerAccess();
    // target user is a non-staff client user
    selectQueue.push([{ id: 8, role: 'client' }]);
    // clientMembers lookup empty + clients lookup empty
    selectQueue.push([]);
    selectQueue.push([]);
    const res = await POST(makeJsonRequest({ userId: 8, role: 'viewer' }), makeParams('1'));
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/not part of this client/);
  });

  it('adds member successfully for non-staff target (clientMembers match)', async () => {
    authMock.mockResolvedValue(SESSION);
    setupOwnerAccess();
    // target user: non-staff
    selectQueue.push([{ id: 8, role: 'client' }]);
    // clientMembers has a row
    selectQueue.push([{ id: 8, clientId: 33 }]);
    selectQueue.push([]); // ownerRows (owners lookup doesn't run since memberRows has result)
    insertReturnQueue.push([{ id: 50, projectId: 1, userId: 8, role: 'viewer', addedBy: 7 }]);
    const res = await POST(makeJsonRequest({ userId: 8, role: 'viewer' }), makeParams('1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('viewer');
  });

  it('adds member successfully when target is staff (bypasses tenancy check)', async () => {
    authMock.mockResolvedValue(SESSION);
    setupOwnerAccess();
    // target user is admin (staff) — tenancy check skipped
    selectQueue.push([{ id: 8, role: 'admin' }]);
    insertReturnQueue.push([{ id: 51, projectId: 1, userId: 8, role: 'editor', addedBy: 7 }]);
    const res = await POST(makeJsonRequest({ userId: 8, role: 'editor' }), makeParams('1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.role).toBe('editor');
  });

  it('adds member via owner table match when clientMembers empty', async () => {
    authMock.mockResolvedValue(SESSION);
    setupOwnerAccess();
    selectQueue.push([{ id: 8, role: 'client' }]);
    selectQueue.push([]); // clientMembers empty
    selectQueue.push([{ id: 33 }]); // clients (owner) match
    insertReturnQueue.push([{ id: 52, projectId: 1, userId: 8, role: 'commenter', addedBy: 7 }]);
    const res = await POST(makeJsonRequest({ userId: 8, role: 'commenter' }), makeParams('1'));
    expect(res.status).toBe(201);
  });

  it('returns 201 for staff caller adding themselves', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockResolvedValue(true);
    // authorizeOwnerAccess for staff: projectRows + memberRows
    selectQueue.push([PROJECT_ROW]);
    selectQueue.push([{ role: 'owner' }]);
    // target is another admin
    selectQueue.push([{ id: 8, role: 'employee' }]);
    insertReturnQueue.push([{ id: 53, projectId: 1, userId: 8, role: 'owner', addedBy: 1 }]);
    const res = await POST(makeJsonRequest({ userId: 8, role: 'owner' }), makeParams('1'));
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe('PATCH /api/portal/projects/[id]/members', () => {
  function setupPatchOwner({
    project = PROJECT_ROW,
    callerRole = 'owner' as string,
  } = {}) {
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([project]);
    selectQueue.push([{ role: callerRole }]);
    getPortalClientMock.mockResolvedValue(CLIENT);
  }

  it('returns 404 when project missing', async () => {
    authMock.mockResolvedValue(SESSION);
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([]);
    selectQueue.push([]);
    getPortalClientMock.mockResolvedValue(CLIENT);
    const res = await PATCH(makeJsonRequest({ userId: 8, role: 'editor' }, 'PATCH'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller lacks owner permission', async () => {
    authMock.mockResolvedValue(SESSION);
    setupPatchOwner({ callerRole: 'viewer' });
    const res = await PATCH(makeJsonRequest({ userId: 8, role: 'editor' }, 'PATCH'), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid role', async () => {
    authMock.mockResolvedValue(SESSION);
    setupPatchOwner();
    const res = await PATCH(makeJsonRequest({ userId: 8, role: 'banana' }, 'PATCH'), makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 409 when sole owner tries to demote themselves', async () => {
    authMock.mockResolvedValue(SESSION);
    setupPatchOwner();
    // owners count query → only 1 owner
    selectQueue.push([{ id: 99 }]);
    const res = await PATCH(
      makeJsonRequest({ userId: 7, role: 'editor' }, 'PATCH'),
      makeParams('1'),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/sole owner/);
  });

  it('allows demotion when there are multiple owners', async () => {
    authMock.mockResolvedValue(SESSION);
    setupPatchOwner();
    // owners count → 2
    selectQueue.push([{ id: 99 }, { id: 100 }]);
    updateReturnQueue.push([{ id: 99, role: 'editor' }]);
    const res = await PATCH(
      makeJsonRequest({ userId: 7, role: 'editor' }, 'PATCH'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('editor');
  });

  it('returns 404 when update returns no rows', async () => {
    authMock.mockResolvedValue(SESSION);
    setupPatchOwner();
    updateReturnQueue.push([]); // no rows updated
    const res = await PATCH(
      makeJsonRequest({ userId: 8, role: 'editor' }, 'PATCH'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('updates role for another member without owner-count check', async () => {
    authMock.mockResolvedValue(SESSION);
    setupPatchOwner();
    updateReturnQueue.push([{ id: 88, role: 'commenter' }]);
    const res = await PATCH(
      makeJsonRequest({ userId: 8, role: 'commenter' }, 'PATCH'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('commenter');
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/portal/projects/[id]/members', () => {
  function setupDeleteOwner({
    project = PROJECT_ROW,
    callerRole = 'owner' as string,
  } = {}) {
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([project]);
    selectQueue.push([{ role: callerRole }]);
    getPortalClientMock.mockResolvedValue(CLIENT);
  }

  it('returns 404 when project missing', async () => {
    authMock.mockResolvedValue(SESSION);
    isPortalStaffMock.mockResolvedValue(false);
    selectQueue.push([]);
    selectQueue.push([]);
    getPortalClientMock.mockResolvedValue(CLIENT);
    const res = await DELETE(makeDeleteRequest('userId=8'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller lacks owner permission', async () => {
    authMock.mockResolvedValue(SESSION);
    setupDeleteOwner({ callerRole: 'editor' });
    const res = await DELETE(makeDeleteRequest('userId=8'), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId query param is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    setupDeleteOwner();
    const res = await DELETE(makeDeleteRequest(''), makeParams('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/userId/);
  });

  it('returns 404 when target member row does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    setupDeleteOwner();
    selectQueue.push([]); // target member lookup
    const res = await DELETE(makeDeleteRequest('userId=8'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 409 when removing the sole owner', async () => {
    authMock.mockResolvedValue(SESSION);
    setupDeleteOwner();
    // target member is an owner
    selectQueue.push([{ role: 'owner' }]);
    // owners count → only 1
    selectQueue.push([{ id: 8 }]);
    const res = await DELETE(makeDeleteRequest('userId=8'), makeParams('1'));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/sole owner/);
  });

  it('removes a non-owner member successfully', async () => {
    authMock.mockResolvedValue(SESSION);
    setupDeleteOwner();
    selectQueue.push([{ role: 'editor' }]); // target member
    const res = await DELETE(makeDeleteRequest('userId=8'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('projectMembers');
  });

  it('removes an owner member when multiple owners exist', async () => {
    authMock.mockResolvedValue(SESSION);
    setupDeleteOwner();
    selectQueue.push([{ role: 'owner' }]); // target is owner
    selectQueue.push([{ id: 7 }, { id: 8 }]); // 2 owners
    const res = await DELETE(makeDeleteRequest('userId=8'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('handles staff caller removing a member', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([PROJECT_ROW]);
    selectQueue.push([{ role: 'editor' }]); // caller member row (unused but fetched)
    // target member
    selectQueue.push([{ role: 'viewer' }]);
    const res = await DELETE(makeDeleteRequest('userId=9'), makeParams('1'));
    expect(res.status).toBe(200);
  });
});
