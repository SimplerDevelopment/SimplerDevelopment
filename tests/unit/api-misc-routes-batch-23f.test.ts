// @vitest-environment node
/**
 * Batch 23f — unit tests for four small API route.ts files:
 *
 *   1. app/api/portal/billing/payment-methods/route.ts   (GET, DELETE)
 *   2. app/api/portal/default-portal/route.ts            (GET, POST)
 *   3. app/api/portal/projects/[id]/cards/route.ts       (GET)
 *   4. app/api/portal/approvals/[id]/reject/route.ts     (POST)
 *
 * All I/O (auth, portal-client, drizzle db) is mocked. The Drizzle `db` is a
 * hand-rolled stub with queued select returns and recorded update/delete
 * shapes.
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
const getPortalClientsMock = vi.fn();
const getPortalRoleMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalClients: (...args: unknown[]) => getPortalClientsMock(...args),
  getPortalRole: (...args: unknown[]) => getPortalRoleMock(...args),
}));

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn((result: unknown) => 'response' in (result as object));
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (result: unknown) => isAuthErrorMock(result),
}));

vi.mock('@/lib/mcp-auth', () => ({
  resolvePortalFromCurrentRequest: async () => null,
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
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
    paymentMethods: wrap('paymentMethods'),
    users: wrap('users'),
    kanbanCards: wrap('kanbanCards'),
    kanbanColumns: wrap('kanbanColumns'),
    projects: wrap('projects'),
    mcpPendingChanges: wrap('mcpPendingChanges'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

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
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
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
            const rows = updateReturnQueue.shift() ?? [];
            const cloned = rows.map((r) => ({ ...r }));
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: cloned });
            return {
              returning() {
                return Promise.resolve(cloned);
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

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return {
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
    },
  };
});

// ---- modules under test ---------------------------------------------------
const paymentMethodsRoute = await import('@/app/api/portal/billing/payment-methods/route');
const defaultPortalRoute = await import('@/app/api/portal/default-portal/route');
const projectCardsRoute = await import('@/app/api/portal/projects/[id]/cards/route');
const approvalsRejectRoute = await import('@/app/api/portal/approvals/[id]/reject/route');

// ---- helpers --------------------------------------------------------------
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalClientsMock.mockReset();
  getPortalRoleMock.mockReset();
  authorizePortalMock.mockReset();
});

// ===========================================================================
// payment-methods
// ===========================================================================

describe('GET /api/portal/billing/payment-methods', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await paymentMethodsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await paymentMethodsRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of payment methods for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, clientId: 33, last4: '4242' },
      { id: 2, clientId: 33, last4: '0001' },
    ]);
    const res = await paymentMethodsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].last4).toBe('4242');
  });
});

describe('DELETE /api/portal/billing/payment-methods', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE', body: '{}' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when no id is provided in body', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE', body: '{}' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Payment method ID required');
  });

  it('returns 400 when body is invalid JSON (empty body fallback)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // No body at all triggers catch -> id undefined
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when payment method not found for client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // method lookup empty
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE', body: JSON.stringify({ id: '7' }) }),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the matching payment method', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 7, clientId: 33, last4: '4242' }]);
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE', body: JSON.stringify({ id: '7' }) }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('paymentMethods');
  });
});

// ===========================================================================
// default-portal
// ===========================================================================

describe('GET /api/portal/default-portal', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await defaultPortalRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the user defaultClientId when present', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: 42 }]);
    const res = await defaultPortalRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ defaultClientId: 42 });
  });

  it('returns null defaultClientId when user has none', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([]); // no rows
    const res = await defaultPortalRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ defaultClientId: null });
  });
});

describe('POST /api/portal/default-portal', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await defaultPortalRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ clientId: 1 }) }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when clientId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await defaultPortalRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('clientId is required');
  });

  it('returns 400 when clientId is not a number', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await defaultPortalRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ clientId: 'abc' }) }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when user does not have access to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientsMock.mockResolvedValue([{ id: 99 }, { id: 100 }]);
    const res = await defaultPortalRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ clientId: 42 }) }),
    );
    expect(res.status).toBe(403);
  });

  it('updates the user and returns the new defaultClientId', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientsMock.mockResolvedValue([{ id: 42 }, { id: 99 }]);
    const res = await defaultPortalRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ clientId: 42 }) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, defaultClientId: 42 });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('users');
    expect(updateCalls[0].patch.defaultClientId).toBe(42);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// projects/[id]/cards
// ===========================================================================

describe('GET /api/portal/projects/[id]/cards', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await projectCardsRoute.GET(makeReq('http://x'), paramsFor('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the project does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([]); // project lookup empty
    const res = await projectCardsRoute.GET(makeReq('http://x'), paramsFor('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when client role lacks access to the project client', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, clientId: 99, projectKey: 'PROJ' }]); // project
    getPortalClientMock.mockResolvedValue({ id: 33 }); // different client
    const res = await projectCardsRoute.GET(makeReq('http://x'), paramsFor('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when client role and no portal client', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, clientId: 99, projectKey: 'PROJ' }]); // project
    getPortalClientMock.mockResolvedValue(null);
    const res = await projectCardsRoute.GET(makeReq('http://x'), paramsFor('1'));
    expect(res.status).toBe(404);
  });

  it('admin role sees cards with key composed from projectKey + number', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, clientId: 33, projectKey: 'ACME' }]); // project
    selectQueue.push([
      { id: 10, title: 'A', number: 1, columnIsDone: false },
      { id: 11, title: 'B', number: 2, columnIsDone: true },
    ]);
    const res = await projectCardsRoute.GET(makeReq('http://x'), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].key).toBe('ACME-1');
    expect(body.data[1].key).toBe('ACME-2');
  });

  it('returns null key when projectKey or number is missing', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    selectQueue.push([{ id: 1, clientId: 33, projectKey: null }]); // no project key
    selectQueue.push([{ id: 10, title: 'A', number: 1, columnIsDone: false }]);
    const res = await projectCardsRoute.GET(makeReq('http://x'), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].key).toBe(null);
  });

  it('client role with matching client gets the cards', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, clientId: 33, projectKey: 'PRJ' }]); // project
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 10, title: 'A', number: 5, columnIsDone: false }]);
    const res = await projectCardsRoute.GET(makeReq('http://x'), paramsFor('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].key).toBe('PRJ-5');
  });
});

// ===========================================================================
// approvals/[id]/reject
// ===========================================================================

describe('POST /api/portal/approvals/[id]/reject', () => {
  it('returns 401 without a session', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401 }),
    });
    const res = await approvalsRejectRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false, message: 'Client not found' }), { status: 404 }),
    });
    const res = await approvalsRejectRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when role is member', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(
        JSON.stringify({ success: false, message: 'Permission denied. Your role (member) cannot manage team or billing settings.' }),
        { status: 403 },
      ),
    });
    const res = await approvalsRejectRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when change not found for client', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    selectQueue.push([]); // change lookup empty
    const res = await approvalsRejectRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when change is not pending', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    selectQueue.push([{ id: 5, status: 'approved' }]);
    const res = await approvalsRejectRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('approved');
  });

  it('rejects a pending change with note and returns the updated row', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 5, status: 'pending' }]);
    updateReturnQueue.push([{ id: 5, status: 'rejected', reviewNote: 'no thanks' }]);
    const res = await approvalsRejectRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ note: 'no thanks' }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('rejected');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('mcpPendingChanges');
    expect(updateCalls[0].patch.status).toBe('rejected');
    expect(updateCalls[0].patch.reviewerId).toBe(7);
    expect(updateCalls[0].patch.reviewNote).toBe('no thanks');
    expect(updateCalls[0].patch.reviewedAt).toBeInstanceOf(Date);
  });

  it('handles invalid JSON body by defaulting note to null', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    selectQueue.push([{ id: 5, status: 'pending' }]);
    updateReturnQueue.push([{ id: 5, status: 'rejected' }]);
    const res = await approvalsRejectRoute.POST(
      makeReq('http://x', { method: 'POST', body: 'not-json' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.reviewNote).toBe(null);
  });

  it('coerces non-string note to null', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 5, status: 'pending' }]);
    updateReturnQueue.push([{ id: 5, status: 'rejected' }]);
    const res = await approvalsRejectRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ note: 123 }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.reviewNote).toBe(null);
  });
});
