// @vitest-environment node
/**
 * Batch 32g — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/tickets/[id]/assignees/route.ts                       (GET)
 *  - app/api/portal/tickets/[id]/messages/route.ts                       (POST)
 *  - app/api/portal/tickets/route.ts                                     (GET, POST)
 *  - app/api/portal/tools/booking/[id]/add-ons/[addOnId]/route.ts        (PUT, DELETE)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy). db.insert/update/delete are mocked to capture writes
 * and emit the next queued return rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

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

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

const computeSlaDeadlinesMock = vi.fn();
vi.mock('@/lib/tickets/sla', () => ({
  computeSlaDeadlines: (...args: unknown[]) => computeSlaDeadlinesMock(...args),
}));

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (...args: unknown[]) => isAuthErrorMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  count: () => ({ op: 'count' }),
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
    supportTickets: wrap('supportTickets'),
    ticketMessages: wrap('ticketMessages'),
    clientMembers: wrap('clientMembers'),
    clients: wrap('clients'),
    users: wrap('users'),
    bookingPages: wrap('bookingPages'),
    bookingAddOns: wrap('bookingAddOns'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
interface UpdateCall {
  table: string;
  set: Record<string, unknown>;
}
interface DeleteCall {
  table: string;
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
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(payload: Record<string, unknown>) {
        const setBlob = payload;
        const chain: Record<string, unknown> = {};
        chain.where = () => {
          updateCalls.push({ table: table.__table, set: setBlob });
          const rows = updateReturnQueue.shift() ?? [];
          return {
            returning() {
              return Promise.resolve(rows.map((r) => ({ ...r })));
            },
            then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
            },
          };
        };
        return chain;
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where() {
        deleteCalls.push({ table: table.__table });
        return Promise.resolve(undefined);
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
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const assigneesRoute = await import('@/app/api/portal/tickets/[id]/assignees/route');
const ticketMessagesRoute = await import('@/app/api/portal/tickets/[id]/messages/route');
const ticketsRoute = await import('@/app/api/portal/tickets/route');
const addOnRoute = await import('@/app/api/portal/tools/booking/[id]/add-ons/[addOnId]/route');

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

const PORTAL_SESSION = { user: { id: '7' } };
const STAFF_SESSION = { user: { id: '7', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '7', role: 'employee' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  emitEventMock.mockReset();
  computeSlaDeadlinesMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockReset();
});

// ===========================================================================
// GET /api/portal/tickets/[id]/assignees
// ===========================================================================

describe('GET /api/portal/tickets/[id]/assignees', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await assigneesRoute.GET(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 403 when user is not staff', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    const res = await assigneesRoute.GET(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Forbidden');
  });

  it('returns 400 when id is not a number', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await assigneesRoute.GET(makeReq('http://x/a'), {
      params: Promise.resolve({ id: 'notanumber' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns 404 when ticket does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // ticket lookup → empty
    const res = await assigneesRoute.GET(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns assignee roster with members and legacy owner', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ clientId: 42 }]); // ticket
    selectQueue.push([
      { userId: 10, name: 'Alice', email: 'a@x.com', role: 'admin' },
      { userId: 11, name: 'Bob', email: 'b@x.com', role: 'member' },
    ]); // members
    selectQueue.push([{ userId: 99 }]); // legacy client.userId
    selectQueue.push([{ id: 99, name: 'Owner', email: 'o@x.com' }]); // owner user
    const res = await assigneesRoute.GET(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);
    const byId = Object.fromEntries(
      (body.data as Array<{ userId: number; role: string }>).map((m) => [m.userId, m.role]),
    );
    expect(byId[10]).toBe('admin');
    expect(byId[11]).toBe('member');
    expect(byId[99]).toBe('owner');
  });

  it('omits legacy owner when already a member', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ clientId: 42 }]); // ticket
    selectQueue.push([
      { userId: 99, name: 'Owner', email: 'o@x.com', role: 'owner' },
    ]); // members already include the legacy owner
    selectQueue.push([{ userId: 99 }]); // legacy client.userId
    const res = await assigneesRoute.GET(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].userId).toBe(99);
    // Owner role stays as the original 'owner' from the members row.
    expect(body.data[0].role).toBe('owner');
  });

  it('handles legacy client with no userId', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ clientId: 42 }]); // ticket
    selectQueue.push([
      { userId: 10, name: 'Alice', email: 'a@x.com', role: 'admin' },
    ]); // members
    selectQueue.push([{ userId: null }]); // client row with no legacy owner
    const res = await assigneesRoute.GET(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it('handles missing owner user row gracefully', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ clientId: 42 }]); // ticket
    selectQueue.push([
      { userId: 10, name: 'Alice', email: 'a@x.com', role: 'admin' },
    ]); // members
    selectQueue.push([{ userId: 99 }]); // legacy client.userId
    selectQueue.push([]); // owner user lookup empty
    const res = await assigneesRoute.GET(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

// ===========================================================================
// POST /api/portal/tickets/[id]/messages
// ===========================================================================

describe('POST /api/portal/tickets/[id]/messages', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: 'hi' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when non-staff has no portal client', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: 'hi' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Forbidden');
  });

  it('returns 404 when non-staff does not own the ticket', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // ticket-ownership lookup → empty
    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: 'hi' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 400 when body is empty', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: '   ' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Message body is required');
  });

  it('returns 400 when body is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', {}),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(400);
  });

  it('staff inserts a message and advances open → in_progress', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    insertReturnQueue.push([{ id: 100, ticketId: 5, body: 'hello' }]);
    selectQueue.push([{ id: 5, status: 'open' }]); // ticket lookup after insert

    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: 'hello', isInternal: true }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(100);

    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(insertCalls[0].table).toBe('ticketMessages');
    expect(inserted.ticketId).toBe(5);
    expect(inserted.authorId).toBe(7);
    expect(inserted.body).toBe('hello');
    expect(inserted.isInternal).toBe(true);

    // status advanced
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('supportTickets');
    expect(updateCalls[0].set.status).toBe('in_progress');
  });

  it('non-staff inserts a message and advances waiting → open', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 5, clientId: 5, status: 'waiting' }]); // ownership ok
    insertReturnQueue.push([{ id: 200, ticketId: 5 }]);
    selectQueue.push([{ id: 5, status: 'waiting' }]); // post-insert lookup

    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: 'hello', isInternal: true }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);

    // non-staff forces isInternal to false regardless of input
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.isInternal).toBe(false);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set.status).toBe('open');
  });

  it('does not advance ticket status when not in matching state', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    insertReturnQueue.push([{ id: 300, ticketId: 5 }]);
    selectQueue.push([{ id: 5, status: 'closed' }]); // post-insert: status closed

    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: 'note' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });

  it('does not update status when ticket lookup returns nothing post-insert', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    insertReturnQueue.push([{ id: 400 }]);
    selectQueue.push([]); // no ticket

    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: 'note' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });

  it('staff with `open` ticket and unset isInternal defaults to false', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    insertReturnQueue.push([{ id: 500 }]);
    selectQueue.push([{ id: 5, status: 'open' }]);

    const res = await ticketMessagesRoute.POST(
      makeJsonReq('http://x/a', 'POST', { body: 'note' }),
      { params: Promise.resolve({ id: '5' }) },
    );
    expect(res.status).toBe(200);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.isInternal).toBe(false);
  });
});

// ===========================================================================
// GET /api/portal/tickets
// ===========================================================================

describe('GET /api/portal/tickets', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await ticketsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await ticketsRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns the list of tickets for the client', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, clientId: 5, subject: 'a' },
      { id: 2, clientId: 5, subject: 'b' },
    ]);
    const res = await ticketsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

// ===========================================================================
// POST /api/portal/tickets
// ===========================================================================

describe('POST /api/portal/tickets', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await ticketsRoute.POST(makeJsonReq('http://x/t', 'POST', {}));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await ticketsRoute.POST(makeJsonReq('http://x/t', 'POST', {}));
    expect(res.status).toBe(404);
  });

  it('returns 400 when subject is missing', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await ticketsRoute.POST(
      makeJsonReq('http://x/t', 'POST', { body: 'hi' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Subject and body are required');
  });

  it('returns 400 when body is missing', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await ticketsRoute.POST(
      makeJsonReq('http://x/t', 'POST', { subject: 'hi' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when subject is whitespace', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await ticketsRoute.POST(
      makeJsonReq('http://x/t', 'POST', { subject: '  ', body: 'hi' }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a ticket with defaults and emits ticket.created', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ count: 4 }]); // ticket-number lookup
    computeSlaDeadlinesMock.mockReturnValue({
      firstResponseDueAt: new Date('2026-01-01T00:00:00Z'),
      resolutionDueAt: new Date('2026-01-02T00:00:00Z'),
    });
    insertReturnQueue.push([
      { id: 88, number: 1005, subject: 'Help', category: 'general', priority: 'medium', clientId: 5 },
    ]);

    const res = await ticketsRoute.POST(
      makeJsonReq('http://x/t', 'POST', { subject: 'Help', body: 'plz' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(88);

    expect(computeSlaDeadlinesMock).toHaveBeenCalledWith('medium');

    // Ticket insert
    expect(insertCalls[0].table).toBe('supportTickets');
    const ticketInsert = insertCalls[0].values as Record<string, unknown>;
    expect(ticketInsert.number).toBe(1005);
    expect(ticketInsert.clientId).toBe(5);
    expect(ticketInsert.subject).toBe('Help');
    expect(ticketInsert.category).toBe('general');
    expect(ticketInsert.priority).toBe('medium');
    expect(ticketInsert.status).toBe('open');
    expect(ticketInsert.createdBy).toBe(7);

    // First message
    expect(insertCalls[1].table).toBe('ticketMessages');
    const msgInsert = insertCalls[1].values as Record<string, unknown>;
    expect(msgInsert.ticketId).toBe(88);
    expect(msgInsert.body).toBe('plz');
    expect(msgInsert.isInternal).toBe(false);

    // Event emitted
    expect(emitEventMock).toHaveBeenCalledWith(
      'ticket.created',
      5,
      7,
      expect.objectContaining({ id: 88, number: 1005, subject: 'Help', status: 'open' }),
    );
  });

  it('honors provided category and priority and starts numbering at 1001 when no rows exist', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ count: 0 }]); // first-ever ticket
    computeSlaDeadlinesMock.mockReturnValue({
      firstResponseDueAt: null,
      resolutionDueAt: null,
    });
    insertReturnQueue.push([
      { id: 1, number: 1001, subject: 'Urgent', category: 'billing', priority: 'urgent' },
    ]);

    const res = await ticketsRoute.POST(
      makeJsonReq('http://x/t', 'POST', {
        subject: 'Urgent',
        body: 'now',
        category: 'billing',
        priority: 'urgent',
      }),
    );
    expect(res.status).toBe(200);
    expect(computeSlaDeadlinesMock).toHaveBeenCalledWith('urgent');
    const ticketInsert = insertCalls[0].values as Record<string, unknown>;
    expect(ticketInsert.number).toBe(1001);
    expect(ticketInsert.category).toBe('billing');
    expect(ticketInsert.priority).toBe('urgent');
  });

  it('handles missing count result gracefully', async () => {
    authMock.mockResolvedValue(PORTAL_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // no rows at all (undefined result)
    computeSlaDeadlinesMock.mockReturnValue({
      firstResponseDueAt: null,
      resolutionDueAt: null,
    });
    insertReturnQueue.push([{ id: 2, number: 1001 }]);

    const res = await ticketsRoute.POST(
      makeJsonReq('http://x/t', 'POST', { subject: 's', body: 'b' }),
    );
    expect(res.status).toBe(200);
    const ticketInsert = insertCalls[0].values as Record<string, unknown>;
    expect(ticketInsert.number).toBe(1001);
  });
});

// ===========================================================================
// PUT /api/portal/tools/booking/[id]/add-ons/[addOnId]
// ===========================================================================

describe('PUT /api/portal/tools/booking/[id]/add-ons/[addOnId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await addOnRoute.PUT(
      makeJsonReq('http://x/a', 'PUT', { name: 'X' }),
      { params: Promise.resolve({ id: '1', addOnId: '2' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error response when auth fails', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const denyRes = NextResponse.json(
      { success: false, message: 'No subscription' },
      { status: 402 },
    );
    authorizePortalMock.mockResolvedValue({ response: denyRes });
    isAuthErrorMock.mockReturnValue(true);

    const res = await addOnRoute.PUT(
      makeJsonReq('http://x/a', 'PUT', { name: 'X' }),
      { params: Promise.resolve({ id: '1', addOnId: '2' }) },
    );
    expect(res).toBe(denyRes);
    expect(authorizePortalMock).toHaveBeenCalledWith({
      action: 'write',
      requireService: 'booking',
    });
  });

  it('returns 404 when portal client is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'admin' });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue(null);

    const res = await addOnRoute.PUT(
      makeJsonReq('http://x/a', 'PUT', { name: 'X' }),
      { params: Promise.resolve({ id: '1', addOnId: '2' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when booking page is not owned by client', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 } });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // booking page lookup empty

    const res = await addOnRoute.PUT(
      makeJsonReq('http://x/a', 'PUT', { name: 'X' }),
      { params: Promise.resolve({ id: '1', addOnId: '2' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when add-on does not belong to the page', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 } });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // page found
    selectQueue.push([]); // add-on not found

    const res = await addOnRoute.PUT(
      makeJsonReq('http://x/a', 'PUT', { name: 'X' }),
      { params: Promise.resolve({ id: '1', addOnId: '2' }) },
    );
    expect(res.status).toBe(404);
  });

  it('updates only the fields present in the body', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 } });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // page
    selectQueue.push([{ id: 2, bookingPageId: 1, name: 'Old' }]); // add-on
    updateReturnQueue.push([
      { id: 2, name: 'New', description: 'd', price: 500, image: 'img', maxQuantity: 3, active: true, order: 1 },
    ]);

    const res = await addOnRoute.PUT(
      makeJsonReq('http://x/a', 'PUT', {
        name: 'New',
        description: 'd',
        price: '500',
        image: 'img',
        maxQuantity: 3,
        active: true,
        order: 1,
      }),
      { params: Promise.resolve({ id: '1', addOnId: '2' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(2);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('bookingAddOns');
    const setPayload = updateCalls[0].set;
    expect(setPayload.name).toBe('New');
    expect(setPayload.description).toBe('d');
    expect(setPayload.price).toBe(500);
    expect(setPayload.image).toBe('img');
    expect(setPayload.maxQuantity).toBe(3);
    expect(setPayload.active).toBe(true);
    expect(setPayload.order).toBe(1);
  });

  it('produces an empty update payload when no fields are sent', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 } });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, bookingPageId: 1 }]);
    updateReturnQueue.push([{ id: 2 }]);

    const res = await addOnRoute.PUT(
      makeJsonReq('http://x/a', 'PUT', {}),
      { params: Promise.resolve({ id: '1', addOnId: '2' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(Object.keys(updateCalls[0].set)).toHaveLength(0);
  });
});

// ===========================================================================
// DELETE /api/portal/tools/booking/[id]/add-ons/[addOnId]
// ===========================================================================

describe('DELETE /api/portal/tools/booking/[id]/add-ons/[addOnId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await addOnRoute.DELETE(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '1', addOnId: '2' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error response when auth fails', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const denyRes = NextResponse.json(
      { success: false, message: 'No subscription' },
      { status: 402 },
    );
    authorizePortalMock.mockResolvedValue({ response: denyRes });
    isAuthErrorMock.mockReturnValue(true);

    const res = await addOnRoute.DELETE(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '1', addOnId: '2' }),
    });
    expect(res).toBe(denyRes);
  });

  it('returns 404 when add-on cannot be resolved', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 } });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue(null);

    const res = await addOnRoute.DELETE(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '1', addOnId: '2' }),
    });
    expect(res.status).toBe(404);
  });

  it('deletes the add-on and returns success', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 } });
    isAuthErrorMock.mockReturnValue(false);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // page
    selectQueue.push([{ id: 2, bookingPageId: 1 }]); // add-on

    const res = await addOnRoute.DELETE(makeReq('http://x/a'), {
      params: Promise.resolve({ id: '1', addOnId: '2' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('bookingAddOns');
  });
});
