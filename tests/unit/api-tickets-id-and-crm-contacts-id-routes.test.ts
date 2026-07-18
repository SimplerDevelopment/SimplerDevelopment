// @vitest-environment node
/**
 * Unit tests for two portal id-routes:
 *   - app/api/portal/tickets/[id]/route.ts          (GET / PATCH)
 *   - app/api/portal/crm/contacts/[id]/route.ts     (GET / PUT / DELETE)
 *
 * Strategy: db.select() is mocked with a queue of result rows. Each chain
 * method returns a thenable that resolves to the next queued result. The
 * routes' SQL is queue-order-deterministic so we can line up rows by setup.
 *
 * db.update() and db.delete() return the next queued return-row set; writes
 * are also captured so the assertions can inspect the patch payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (must precede route import)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

vi.mock('@/lib/portal-auth', () => ({
  hasServiceAccess: vi.fn().mockResolvedValue(true),
}));

const createCrmNotificationMock = vi.fn();
const notifyAllClientUsersMock = vi.fn();
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: (...args: unknown[]) => createCrmNotificationMock(...args),
  notifyAllClientUsers: (...args: unknown[]) => notifyAllClientUsersMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
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
    supportTickets: wrap('supportTickets'),
    clientMembers: wrap('clientMembers'),
    users: wrap('users'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmContactTags: wrap('crmContactTags'),
    crmTags: wrap('crmTags'),
    crmActivities: wrap('crmActivities'),
    crmCustomFields: wrap('crmCustomFields'),
    crmCustomFieldValues: wrap('crmCustomFieldValues'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---- db mock: queues for select/update/delete returning rows ----

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
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftSelect());
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
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = updateReturnQueue.shift() ?? [];
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: rows });
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        return {
          onConflictDoNothing() {
            return Promise.resolve(undefined);
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

// ---------------------------------------------------------------------------
// Modules under test (imported AFTER mocks)
// ---------------------------------------------------------------------------

const ticketsRoute = await import('@/app/api/portal/tickets/[id]/route');
const contactsRoute = await import('@/app/api/portal/crm/contacts/[id]/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(
  url: string,
  method: string,
  body: unknown,
): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const STAFF_ADMIN = { user: { id: '7', role: 'admin' } };
const STAFF_EMPLOYEE = { user: { id: '7', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '12', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  createCrmNotificationMock.mockReset().mockResolvedValue(undefined);
  notifyAllClientUsersMock.mockReset().mockResolvedValue(undefined);
});

// ===========================================================================
// /api/portal/tickets/[id]
// ===========================================================================

describe('GET /api/portal/tickets/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await ticketsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await ticketsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when caller is a client (not admin/employee)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await ticketsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    const res = await ticketsRoute.GET(new Request('http://x'), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when ticket row not found', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([]); // ticket lookup empty
    const res = await ticketsRoute.GET(new Request('http://x'), makeParams('99'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 200 with flat assignee block when ticket has assignedTo', async () => {
    authMock.mockResolvedValue(STAFF_EMPLOYEE);
    selectQueue.push([
      {
        ticket: {
          id: 1,
          clientId: 10,
          number: 42,
          subject: 'Help',
          status: 'open',
          assignedTo: 7,
        },
        assigneeName: 'Alice',
        assigneeEmail: 'a@x.test',
      },
    ]);
    const res = await ticketsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.assignee).toEqual({ id: 7, name: 'Alice', email: 'a@x.test' });
  });

  it('returns 200 with assignee=null when ticket is unassigned', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([
      {
        ticket: {
          id: 2,
          clientId: 10,
          number: 43,
          subject: 'Q',
          status: 'open',
          assignedTo: null,
        },
        assigneeName: null,
        assigneeEmail: null,
      },
    ]);
    const res = await ticketsRoute.GET(new Request('http://x'), makeParams('2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.assignee).toBeNull();
  });
});

describe('PATCH /api/portal/tickets/[id]', () => {
  it('returns 401 when caller is not staff', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { status: 'open' }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { status: 'open' }),
      makeParams('xx'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 400 when body is not a valid object', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    const bad = new Request('http://x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await ticketsRoute.PATCH(bad, makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid body');
  });

  it('returns 404 when ticket does not exist', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([]); // existing ticket lookup empty
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { status: 'open' }),
      makeParams('99'),
    );
    expect(res.status).toBe(404);
  });

  it('rejects invalid status value', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([
      { id: 1, clientId: 10, number: 5, subject: 's', status: 'open', assignedTo: null, firstResponseAt: null },
    ]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { status: 'bogus' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid status');
  });

  it('updates status to resolved, sets resolvedAt + firstResponseAt, fires status change notification to assignee', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    // existing ticket: open, has an assignee (different user), no first response yet
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        number: 42,
        subject: 'Help',
        status: 'open',
        assignedTo: 99,
        firstResponseAt: null,
      },
    ]);
    updateReturnQueue.push([{ id: 1, status: 'resolved' }]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { status: 'resolved' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('resolved');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.status).toBe('resolved');
    expect(updateCalls[0].patch.resolvedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.firstResponseAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
    expect(createCrmNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        userId: 99,
        type: 'ticket_status_changed',
        entityType: 'ticket',
        entityId: 1,
      }),
    );
  });

  it('accepts legacy status alias "waiting" and does not set firstResponseAt when already stamped', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([
      {
        id: 2,
        clientId: 10,
        number: 7,
        subject: 's',
        status: 'open',
        assignedTo: null,
        firstResponseAt: new Date('2026-01-01'),
      },
    ]);
    updateReturnQueue.push([{ id: 2, status: 'waiting' }]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { status: 'waiting' }),
      makeParams('2'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.status).toBe('waiting');
    expect(updateCalls[0].patch.firstResponseAt).toBeUndefined();
  });

  it('clears assignee when assigneeId=null (no notification fired)', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([
      {
        id: 3,
        clientId: 10,
        number: 8,
        subject: 's',
        status: 'open',
        assignedTo: 99,
        firstResponseAt: null,
      },
    ]);
    updateReturnQueue.push([{ id: 3, assignedTo: null }]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { assigneeId: null }),
      makeParams('3'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.assignedTo).toBeNull();
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('rejects assigneeId of wrong type', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([
      { id: 4, clientId: 10, number: 9, subject: 's', status: 'open', assignedTo: null, firstResponseAt: null },
    ]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { assigneeId: 'string-not-number' }),
      makeParams('4'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid assigneeId');
  });

  it('rejects assignee that is not a member of the same tenant', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([
      { id: 5, clientId: 10, number: 10, subject: 's', status: 'open', assignedTo: null, firstResponseAt: null },
    ]);
    selectQueue.push([]); // tenant membership lookup → empty
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { assigneeId: 55 }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Assignee is not a member of this client');
  });

  it('assigns a new tenant member and emits ticket_assigned notification', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([
      { id: 6, clientId: 10, number: 11, subject: 'help', status: 'open', assignedTo: null, firstResponseAt: null },
    ]);
    selectQueue.push([{ userId: 55 }]); // tenant membership confirmed
    updateReturnQueue.push([{ id: 6, assignedTo: 55 }]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { assigneeId: 55 }),
      makeParams('6'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.assignedTo).toBe(55);
    expect(createCrmNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        userId: 55,
        type: 'ticket_assigned',
        entityType: 'ticket',
        entityId: 6,
      }),
    );
  });

  it('does not fire ticket_assigned notification when self-assigning', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN); // user.id = '7'
    selectQueue.push([
      { id: 7, clientId: 10, number: 12, subject: 'self', status: 'open', assignedTo: null, firstResponseAt: null },
    ]);
    selectQueue.push([{ userId: 7 }]); // membership OK
    updateReturnQueue.push([{ id: 7, assignedTo: 7 }]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { assigneeId: 7 }),
      makeParams('7'),
    );
    expect(res.status).toBe(200);
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('accepts legacy assignedTo alias', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    selectQueue.push([
      { id: 8, clientId: 10, number: 13, subject: 's', status: 'open', assignedTo: null, firstResponseAt: null },
    ]);
    selectQueue.push([{ userId: 77 }]); // membership
    updateReturnQueue.push([{ id: 8, assignedTo: 77 }]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { assignedTo: 77 }),
      makeParams('8'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.assignedTo).toBe(77);
  });

  it('swallows notification errors (fire-and-forget)', async () => {
    authMock.mockResolvedValue(STAFF_ADMIN);
    createCrmNotificationMock.mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    selectQueue.push([
      { id: 9, clientId: 10, number: 14, subject: 's', status: 'open', assignedTo: 99, firstResponseAt: null },
    ]);
    updateReturnQueue.push([{ id: 9, status: 'in_progress' }]);
    const res = await ticketsRoute.PATCH(
      makeJsonRequest('http://x', 'PATCH', { status: 'in_progress' }),
      makeParams('9'),
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    errSpy.mockRestore();
  });
});

// ===========================================================================
// /api/portal/crm/contacts/[id]
// ===========================================================================

describe('GET /api/portal/crm/contacts/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await contactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue(null);
    const res = await contactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    const res = await contactsRoute.GET(new Request('http://x'), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when contact not found', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([]); // contact lookup empty
    const res = await contactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Contact not found');
  });

  it('returns 200 with merged contact + tags + recent activities + custom fields', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        companyId: 50,
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'a@x.test',
        phone: null,
        linkedinUrl: null,
        title: 'CTO',
        source: null,
        status: 'active',
        avatarUrl: null,
        address: null,
        notes: null,
        lastContactedAt: null,
        score: 99,
        ownerId: 7,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        companyName: 'Acme',
        companyDomain: 'acme.test',
      },
    ]);
    selectQueue.push([{ id: 800, name: 'VIP', color: 'gold' }]); // tags
    selectQueue.push([{ id: 9000, type: 'note', body: 'b' }]); // recent activities
    selectQueue.push([
      { fieldId: 1, fieldName: 'tier', fieldType: 'text', value: 'Gold' },
      { fieldId: 2, fieldName: 'nps', fieldType: 'number', value: '10' },
    ]); // custom field rows
    const res = await contactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.firstName).toBe('Alice');
    expect(body.data.companyName).toBe('Acme');
    expect(body.data.tags).toEqual([{ id: 800, name: 'VIP', color: 'gold' }]);
    expect(body.data.recentActivities).toHaveLength(1);
    expect(body.data.customFields[1]).toEqual({
      name: 'tier',
      type: 'text',
      value: 'Gold',
    });
    expect(body.data.customFields[2]).toEqual({
      name: 'nps',
      type: 'number',
      value: '10',
    });
  });

  it('returns 200 with empty tags/activities/customFields when none exist', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([
      {
        id: 1,
        clientId: 10,
        firstName: 'Bob',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    selectQueue.push([]); // tags
    selectQueue.push([]); // activities
    selectQueue.push([]); // custom fields
    const res = await contactsRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tags).toEqual([]);
    expect(body.data.recentActivities).toEqual([]);
    expect(body.data.customFields).toEqual({});
  });
});

describe('PUT /api/portal/crm/contacts/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', { firstName: 'A' }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue(null);
    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', { firstName: 'A' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', { firstName: 'A' }),
      makeParams('xx'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the contact does not belong to the client', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([]); // ownership lookup empty
    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', { firstName: 'A' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('updates all provided fields, trimming strings and coercing blanks to null', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([{ id: 1 }]); // ownership confirmed
    updateReturnQueue.push([{ id: 1, firstName: 'Alice' }]);

    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', {
        firstName: '  Alice  ',
        lastName: '',
        email: '  a@x.test  ',
        phone: '',
        linkedinUrl: '',
        title: '  CTO ',
        source: '',
        status: 'archived',
        companyId: 50,
        avatarUrl: '',
        address: '',
        notes: '  hi  ',
        lastContactedAt: '2026-01-02T00:00:00.000Z',
        ownerId: 8,
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch;
    expect(patch.firstName).toBe('Alice');
    expect(patch.lastName).toBeNull();
    expect(patch.email).toBe('a@x.test');
    expect(patch.phone).toBeNull();
    expect(patch.linkedinUrl).toBeNull();
    expect(patch.title).toBe('CTO');
    expect(patch.source).toBeNull();
    expect(patch.status).toBe('archived');
    expect(patch.companyId).toBe(50);
    expect(patch.avatarUrl).toBeNull();
    expect(patch.address).toBeNull();
    expect(patch.notes).toBe('hi');
    expect(patch.lastContactedAt).toBeInstanceOf(Date);
    expect(patch.ownerId).toBe(8);
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('coerces null lastContactedAt and companyId=0 to null', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 101 }, { id: 102 }]);
    updateReturnQueue.push([{ id: 1 }]);
    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', {
        lastContactedAt: null,
        companyId: 0,
        ownerId: 0,
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.lastContactedAt).toBeNull();
    expect(updateCalls[0].patch.companyId).toBeNull();
    expect(updateCalls[0].patch.ownerId).toBeNull();
  });

  it('replaces tag associations when tagIds array provided', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 101 }, { id: 102 }]);
    updateReturnQueue.push([{ id: 1 }]);
    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', { tagIds: [101, 102] }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    // One delete on crmContactTags, one insert on crmContactTags
    expect(deleteCalls.some((d) => d.table === 'crmContactTags')).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('crmContactTags');
    const inserted = insertCalls[0].values as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({ contactId: 1, tagId: 101 });
    expect(inserted[1]).toMatchObject({ contactId: 1, tagId: 102 });
  });

  it('clears all tags when tagIds is empty array', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    updateReturnQueue.push([{ id: 1 }]);
    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', { tagIds: [] }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls.some((d) => d.table === 'crmContactTags')).toBe(true);
    expect(insertCalls).toHaveLength(0);
  });

  it('does not touch tags when tagIds is not provided', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([{ id: 1 }]);
    updateReturnQueue.push([{ id: 1 }]);
    const res = await contactsRoute.PUT(
      makeJsonRequest('http://x', 'PUT', { firstName: 'A' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls.some((d) => d.table === 'crmContactTags')).toBe(false);
    expect(insertCalls).toHaveLength(0);
  });
});

describe('DELETE /api/portal/crm/contacts/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await contactsRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue(null);
    const res = await contactsRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    const res = await contactsRoute.DELETE(new Request('http://x'), makeParams('xx'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when contact is not owned by the client', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    deleteReturnQueue.push([]); // no rows returned by delete
    const res = await contactsRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Contact not found');
  });

  it('returns 200 with deleted row when delete succeeds', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
    deleteReturnQueue.push([{ id: 1, firstName: 'Alice' }]);
    const res = await contactsRoute.DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(deleteCalls.some((d) => d.table === 'crmContacts')).toBe(true);
  });
});
