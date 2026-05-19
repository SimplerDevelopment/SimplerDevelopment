// @vitest-environment node
/**
 * Unit tests for app/api/portal/tools/booking/[id]/members/route.ts
 * (GET / POST / PUT / DELETE).
 *
 * Strategy: db.select() is mocked with a queue of result rows. Each chain
 * call (.from / .innerJoin / .where / .limit) returns a thenable that
 * resolves to the next queued result. db.update() / db.insert() /
 * db.delete() capture writes; .returning() resolves a queued row set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---- mocks (must be declared before importing the route) ----

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const authorizePortalMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    typeof r === 'object' && r !== null && 'response' in (r as Record<string, unknown>),
}));

// drizzle-orm — stub operators to plain objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
}));

// schema — proxy tables so `table.col` is inert
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
  return {
    bookingPages: wrap('bookingPages'),
    bookingPageMembers: wrap('bookingPageMembers'),
    clientMembers: wrap('clientMembers'),
    users: wrap('users'),
  };
});

// ---- db mock with select-queue + capture for writes ----

interface DeleteCall {
  table: string;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
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
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy']) {
      chain[m] = passthrough;
    }
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
            const rows = updateReturnQueue.shift() ?? [];
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: rows });
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
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const rows = deleteReturnQueue.shift() ?? [];
        deleteCalls.push({ table: table.__table, filter, returnedRows: rows });
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
          onConflictDoNothing() {
            return Promise.resolve(undefined);
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- module under test (after mocks) ----

const { GET, POST, PUT, DELETE } = await import(
  '@/app/api/portal/tools/booking/[id]/members/route'
);

// ---- helpers ----

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(body: unknown, method: string = 'POST', url: string = 'http://x/api/portal/tools/booking/1/members'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  insertReturnQueue = [];
  deleteReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  // Default: authorizePortal allows the request through
  authorizePortalMock.mockResolvedValue({
    client: { id: 33 },
    userId: 7,
    role: 'admin',
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/tools/booking/[id]/members', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns auth error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }),
    });
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when portal client not resolvable', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when booking page does not belong to client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // booking page lookup returns empty
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with members and team members', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [7] }]); // page lookup
    selectQueue.push([
      { id: 100, userId: 7, displayName: 'Alice', color: '#fff', availability: null, active: true, userName: 'Alice', userEmail: 'a@x.com' },
    ]); // members query
    selectQueue.push([
      { userId: 7, role: 'admin', name: 'Alice', email: 'a@x.com' },
      { userId: 8, role: 'member', name: 'Bob', email: 'b@x.com' },
    ]); // team members
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0].displayName).toBe('Alice');
    expect(body.data.teamMembers).toHaveLength(2);
  });

  it('returns 200 with empty team members when getPortalClient returns null on second call', async () => {
    authMock.mockResolvedValue(SESSION);
    // resolveBookingPage uses one call, then the GET handler calls it again
    getPortalClientMock.mockResolvedValueOnce({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [] }]); // page lookup
    selectQueue.push([]); // members
    getPortalClientMock.mockResolvedValueOnce(null); // 2nd call returns null
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.members).toEqual([]);
    expect(body.data.teamMembers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/portal/tools/booking/[id]/members', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeJsonRequest({}), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns the auth error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false, message: 'No service' }, { status: 403 }),
    });
    const res = await POST(makeJsonRequest({}), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when booking page not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // page lookup empty
    const res = await POST(makeJsonRequest({ userId: 8 }), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when userId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [] }]); // page
    const res = await POST(makeJsonRequest({}), makeParams('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('userId is required');
  });

  it('returns 404 when getPortalClient returns null on team-member check', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValueOnce({ id: 33 }); // resolveBookingPage
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [] }]); // page
    getPortalClientMock.mockResolvedValueOnce(null); // team-member check
    const res = await POST(makeJsonRequest({ userId: 8 }), makeParams('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when target user is not a team member of the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [] }]); // page
    selectQueue.push([]); // isMember check empty
    const res = await POST(makeJsonRequest({ userId: 8 }), makeParams('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('User is not a team member');
  });

  it('updates existing member when one already exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [8] }]); // page
    selectQueue.push([{ userId: 8, clientId: 33 }]); // isMember
    selectQueue.push([{ id: 555, userId: 8 }]); // existing member
    updateReturnQueue.push([{ id: 555, userId: 8, displayName: 'Bobby', color: '#0f0', active: true }]);
    const res = await POST(
      makeJsonRequest({ userId: 8, displayName: 'Bobby', color: '#0f0' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.displayName).toBe('Bobby');
    expect(updateCalls[0].table).toBe('bookingPageMembers');
    expect(updateCalls[0].patch).toMatchObject({ displayName: 'Bobby', color: '#0f0', active: true });
  });

  it('inserts a new member and updates assignedMembers when user not yet present', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [] }]); // page (no members yet)
    selectQueue.push([{ userId: 8 }]); // isMember
    selectQueue.push([]); // existing -> none
    insertReturnQueue.push([{ id: 777, userId: 8, displayName: null, color: null }]);
    const res = await POST(makeJsonRequest({ userId: 8 }), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(777);
    // assignedMembers should have been updated since 8 wasn't in []
    expect(updateCalls.some((u) => u.table === 'bookingPages')).toBe(true);
    const pageUpdate = updateCalls.find((u) => u.table === 'bookingPages')!;
    expect(pageUpdate.patch.assignedMembers).toEqual([8]);
    expect(pageUpdate.patch.updatedAt).toBeInstanceOf(Date);
  });

  it('inserts new member but skips assignedMembers update when already listed', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [8] }]); // page (already lists 8)
    selectQueue.push([{ userId: 8 }]); // isMember
    selectQueue.push([]); // existing -> none
    insertReturnQueue.push([{ id: 778, userId: 8 }]);
    const res = await POST(makeJsonRequest({ userId: 8 }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(updateCalls.filter((u) => u.table === 'bookingPages')).toHaveLength(0);
  });

  it('treats missing assignedMembers JSON as empty array', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: null }]); // page with null
    selectQueue.push([{ userId: 9 }]); // isMember
    selectQueue.push([]); // existing -> none
    insertReturnQueue.push([{ id: 779, userId: 9 }]);
    const res = await POST(makeJsonRequest({ userId: 9 }), makeParams('1'));
    expect(res.status).toBe(200);
    const pageUpdate = updateCalls.find((u) => u.table === 'bookingPages')!;
    expect(pageUpdate.patch.assignedMembers).toEqual([9]);
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/portal/tools/booking/[id]/members', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(makeJsonRequest({}, 'PUT'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await PUT(makeJsonRequest({}, 'PUT'), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when booking page not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // page lookup empty
    const res = await PUT(makeJsonRequest({ memberId: 1 }, 'PUT'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when memberId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // page
    const res = await PUT(makeJsonRequest({}, 'PUT'), makeParams('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('memberId is required');
  });

  it('returns 404 when underlying update returns no rows', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // page
    updateReturnQueue.push([]); // no rows
    const res = await PUT(makeJsonRequest({ memberId: 555, active: false }, 'PUT'), makeParams('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Member not found');
  });

  it('updates only the fields that are explicitly present', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // page
    updateReturnQueue.push([{ id: 555, displayName: 'Foo', color: null, active: true }]);
    const res = await PUT(
      makeJsonRequest({ memberId: 555, displayName: 'Foo', availability: { mon: '9-5' } }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(555);
    const patch = updateCalls[0].patch;
    expect(patch.displayName).toBe('Foo');
    expect(patch.availability).toEqual({ mon: '9-5' });
    expect(patch).not.toHaveProperty('color');
    expect(patch).not.toHaveProperty('active');
  });

  it('coerces empty-string displayName/color to null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // page
    updateReturnQueue.push([{ id: 555 }]);
    await PUT(
      makeJsonRequest({ memberId: 555, displayName: '', color: '' }, 'PUT'),
      makeParams('1'),
    );
    expect(updateCalls[0].patch.displayName).toBeNull();
    expect(updateCalls[0].patch.color).toBeNull();
  });

  it('supports active=false (falsy but defined)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // page
    updateReturnQueue.push([{ id: 555, active: false }]);
    await PUT(
      makeJsonRequest({ memberId: 555, active: false }, 'PUT'),
      makeParams('1'),
    );
    expect(updateCalls[0].patch.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/portal/tools/booking/[id]/members', () => {
  function makeDeleteRequest(qs: string = 'memberId=555'): Request {
    return new Request(`http://x/api/portal/tools/booking/1/members?${qs}`, { method: 'DELETE' });
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns auth-error response from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({
      response: NextResponse.json({ success: false }, { status: 403 }),
    });
    const res = await DELETE(makeDeleteRequest(), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when booking page not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // page lookup empty
    const res = await DELETE(makeDeleteRequest(), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when memberId query param is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [] }]); // page
    const res = await DELETE(makeDeleteRequest(''), makeParams('1'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('memberId query param is required');
  });

  it('returns success even when no row was deleted (no assignedMembers update)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [8] }]); // page
    deleteReturnQueue.push([]); // delete returns no rows
    const res = await DELETE(makeDeleteRequest('memberId=555'), makeParams('1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // No bookingPages update since deleted was undefined
    expect(updateCalls.filter((u) => u.table === 'bookingPages')).toHaveLength(0);
    expect(deleteCalls.some((d) => d.table === 'bookingPageMembers')).toBe(true);
  });

  it('removes the user from assignedMembers JSON when a row was deleted', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: [7, 8, 9] }]); // page
    deleteReturnQueue.push([{ id: 555, userId: 8 }]); // row deleted
    const res = await DELETE(makeDeleteRequest('memberId=555'), makeParams('1'));
    expect(res.status).toBe(200);
    const pageUpdate = updateCalls.find((u) => u.table === 'bookingPages')!;
    expect(pageUpdate.patch.assignedMembers).toEqual([7, 9]);
    expect(pageUpdate.patch.updatedAt).toBeInstanceOf(Date);
  });

  it('handles missing assignedMembers JSON as empty array', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, assignedMembers: null }]); // page
    deleteReturnQueue.push([{ id: 555, userId: 8 }]); // row deleted
    const res = await DELETE(makeDeleteRequest('memberId=555'), makeParams('1'));
    expect(res.status).toBe(200);
    const pageUpdate = updateCalls.find((u) => u.table === 'bookingPages')!;
    expect(pageUpdate.patch.assignedMembers).toEqual([]);
  });
});
