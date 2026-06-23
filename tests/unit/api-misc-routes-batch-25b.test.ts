// @vitest-environment node
/**
 * Batch 25b — unit tests for four small portal API route.ts files:
 *
 *   1. app/api/portal/invite/accept/route.ts              (POST)
 *   2. app/api/portal/approvals/[id]/approve/route.ts     (POST)
 *   3. app/api/portal/crm/tags/route.ts                   (GET, POST)
 *   4. app/api/portal/cards/[id]/watch/route.ts           (POST, DELETE)
 *
 * All I/O (auth, portal-client, drizzle db, bcryptjs, token-hash,
 * next/cache, mcp/approvals) is mocked.
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
const getPortalRoleMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
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

const hashMock = vi.fn(async (pw: string) => `HASHED(${pw})`);
vi.mock('bcryptjs', () => ({
  hash: (...args: unknown[]) => hashMock(...(args as [string, number])),
}));

const hashTokenMock = vi.fn((t: string) => `H(${t})`);
vi.mock('@/lib/security/token-hash', () => ({
  hashToken: (...args: unknown[]) => hashTokenMock(...(args as [string])),
}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const applyPendingChangeMock = vi.fn();
vi.mock('@/lib/mcp/approvals', () => ({
  applyPendingChange: (...args: unknown[]) => applyPendingChangeMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  gt: (a: unknown, b: unknown) => ({ op: 'gt', a, b }),
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
    users: wrap('users'),
    mcpPendingChanges: wrap('mcpPendingChanges'),
    crmTags: wrap('crmTags'),
    kanbanCards: wrap('kanbanCards'),
    kanbanCardWatchers: wrap('kanbanCardWatchers'),
    projects: wrap('projects'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  onConflict: 'none' | 'doNothing' | 'doUpdate';
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
        limit() {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materializedPromise!.then(onF, onR);
            },
          };
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

  function buildInsert(table: { __table: string }) {
    return {
      values(values: Record<string, unknown> | Record<string, unknown>[]) {
        const recorded: InsertCall = {
          table: table.__table,
          values,
          onConflict: 'none',
        };
        insertCalls.push(recorded);
        const rows = insertReturnQueue.shift() ?? [];
        const cloned = () => rows.map((r) => ({ ...r }));
        return {
          returning() {
            return Promise.resolve(cloned());
          },
          onConflictDoNothing() {
            recorded.onConflict = 'doNothing';
            return {
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
              returning() {
                return Promise.resolve(cloned());
              },
            };
          },
          onConflictDoUpdate(_arg: unknown) {
            recorded.onConflict = 'doUpdate';
            return {
              returning() {
                return Promise.resolve(cloned());
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
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

// ---- modules under test ---------------------------------------------------
const inviteAcceptRoute = await import('@/app/api/portal/invite/accept/route');
const approvalsApproveRoute = await import('@/app/api/portal/approvals/[id]/approve/route');
const crmTagsRoute = await import('@/app/api/portal/crm/tags/route');
const cardsWatchRoute = await import('@/app/api/portal/cards/[id]/watch/route');

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
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalRoleMock.mockReset();
  authorizePortalMock.mockReset();
  hashMock.mockClear();
  hashTokenMock.mockClear();
  revalidatePathMock.mockClear();
  applyPendingChangeMock.mockReset();
});

// ===========================================================================
// portal/invite/accept
// ===========================================================================

describe('POST /api/portal/invite/accept', () => {
  it('returns 400 when token is missing', async () => {
    const res = await inviteAcceptRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ password: 'longenough' }) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Token and password/);
  });

  it('returns 400 when password is missing', async () => {
    const res = await inviteAcceptRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ token: 'abc' }) }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when password shorter than 8 chars', async () => {
    const res = await inviteAcceptRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ token: 'abc', password: 'short' }) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least 8/);
  });

  it('returns 400 when no matching user for the invite token', async () => {
    selectQueue.push([]); // user lookup empty
    const res = await inviteAcceptRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ token: 'tok', password: 'longenough' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid or expired/);
    expect(hashTokenMock).toHaveBeenCalledWith('tok');
  });

  it('hashes the password, clears the token, and returns the user email on success', async () => {
    selectQueue.push([{ id: 42, email: 'newuser@example.com' }]);
    const res = await inviteAcceptRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ token: 'tok', password: 'longenough' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, email: 'newuser@example.com' });
    expect(hashMock).toHaveBeenCalledWith('longenough', 12);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('users');
    expect(updateCalls[0].patch.password).toBe('HASHED(longenough)');
    expect(updateCalls[0].patch.inviteToken).toBeNull();
    expect(updateCalls[0].patch.inviteExpiresAt).toBeNull();
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// portal/approvals/[id]/approve
// ===========================================================================

describe('POST /api/portal/approvals/[id]/approve', () => {
  it('returns 401 without a session', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401 }),
    });
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false, message: 'Client not found' }), { status: 404 }),
    });
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when role is member (not owner/admin)', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(
        JSON.stringify({ success: false, message: 'Permission denied. Your role (member) cannot manage team or billing settings.' }),
        { status: 403 },
      ),
    });
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/Permission denied|manage team or billing/i);
  });

  it('returns 404 when change not found for client', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    selectQueue.push([]); // change lookup empty
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when change is not pending', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    selectQueue.push([{ id: 5, status: 'applied', clientId: 33 }]);
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('applied');
  });

  it('approves a pending change, applies it, and returns success with note', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 5, status: 'pending', clientId: 33 }]);
    applyPendingChangeMock.mockResolvedValue({ ok: true, ref: 'thing-1' });
    updateReturnQueue.push([{ id: 5, status: 'applied', reviewNote: 'lgtm' }]);
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ note: 'lgtm' }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.change.status).toBe('applied');
    expect(body.data.result).toEqual({ ok: true, ref: 'thing-1' });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('mcpPendingChanges');
    expect(updateCalls[0].patch.status).toBe('applied');
    expect(updateCalls[0].patch.reviewerId).toBe(7);
    expect(updateCalls[0].patch.reviewNote).toBe('lgtm');
    expect(updateCalls[0].patch.reviewedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.appliedAt).toBeInstanceOf(Date);
    expect(applyPendingChangeMock).toHaveBeenCalledTimes(1);
  });

  it('marks the change as failed and returns 500 when applyPendingChange throws', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    selectQueue.push([{ id: 5, status: 'pending', clientId: 33 }]);
    applyPendingChangeMock.mockRejectedValue(new Error('database down'));
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ note: 'try anyway' }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/database down/);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.status).toBe('failed');
    expect(updateCalls[0].patch.errorMessage).toMatch(/database down/);
    expect(updateCalls[0].patch.reviewNote).toBe('try anyway');
  });

  it('coerces non-string note to null', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 5, status: 'pending', clientId: 33 }]);
    applyPendingChangeMock.mockResolvedValue({ ok: true });
    updateReturnQueue.push([{ id: 5, status: 'applied' }]);
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ note: 42 }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.reviewNote).toBe(null);
  });

  it('handles invalid JSON body by defaulting note to null', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 5, status: 'pending', clientId: 33 }]);
    applyPendingChangeMock.mockResolvedValue({ ok: true });
    updateReturnQueue.push([{ id: 5, status: 'applied' }]);
    const res = await approvalsApproveRoute.POST(
      makeReq('http://x', { method: 'POST', body: 'not-json' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.reviewNote).toBe(null);
  });
});

// ===========================================================================
// portal/crm/tags
// ===========================================================================

describe('GET /api/portal/crm/tags', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await crmTagsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await crmTagsRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns tags scoped to the portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 21 });
    selectQueue.push([
      { id: 1, clientId: 21, name: 'Hot', color: '#ff0000' },
      { id: 2, clientId: 21, name: 'Cold', color: '#00f' },
    ]);
    const res = await crmTagsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Hot');
  });
});

describe('POST /api/portal/crm/tags', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await crmTagsRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ name: 'X' }) }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await crmTagsRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ name: 'X' }) }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing or empty whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 21 });
    const res = await crmTagsRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ name: '   ' }) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/);
  });

  it('creates the tag with trimmed name and default color', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 21 });
    insertReturnQueue.push([
      { id: 7, clientId: 21, name: 'Hot', color: '#6366f1' },
    ]);
    const res = await crmTagsRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ name: '  Hot  ' }) }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(7);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('crmTags');
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.name).toBe('Hot'); // trimmed
    expect(values.clientId).toBe(21);
    expect(values.color).toBe('#6366f1');
  });

  it('uses provided color when supplied', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 21 });
    insertReturnQueue.push([{ id: 8, clientId: 21, name: 'VIP', color: '#abc123' }]);
    const res = await crmTagsRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ name: 'VIP', color: '#abc123' }),
      }),
    );
    expect(res.status).toBe(201);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.color).toBe('#abc123');
  });
});

// ===========================================================================
// portal/cards/[id]/watch
// ===========================================================================

describe('POST /api/portal/cards/[id]/watch', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await cardsWatchRoute.POST(
      makeReq('http://x', { method: 'POST' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([]); // card lookup empty
    const res = await cardsWatchRoute.POST(
      makeReq('http://x', { method: 'POST' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('admin role can watch a card without portal client check', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, projectId: 9 }]); // card exists
    const res = await cardsWatchRoute.POST(
      makeReq('http://x', { method: 'POST' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.watching).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('kanbanCardWatchers');
    expect(insertCalls[0].onConflict).toBe('doNothing');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.cardId).toBe(1);
    expect(v.userId).toBe(7);
  });

  it('employee role can watch without portal client check', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    selectQueue.push([{ id: 1, projectId: 9 }]);
    const res = await cardsWatchRoute.POST(
      makeReq('http://x', { method: 'POST' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
  });

  it('client role returns 404 when no portal client', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, projectId: 9 }]);
    getPortalClientMock.mockResolvedValue(null);
    const res = await cardsWatchRoute.POST(
      makeReq('http://x', { method: 'POST' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
    expect(insertCalls).toHaveLength(0);
  });

  it('client role returns 404 when project does not belong to client', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, projectId: 9 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // project lookup empty
    const res = await cardsWatchRoute.POST(
      makeReq('http://x', { method: 'POST' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('client role with matching project succeeds', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, projectId: 9 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 9, clientId: 33 }]); // project belongs to client
    const res = await cardsWatchRoute.POST(
      makeReq('http://x', { method: 'POST' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
  });
});

describe('DELETE /api/portal/cards/[id]/watch', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await cardsWatchRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([]); // card lookup empty
    const res = await cardsWatchRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('admin can unwatch and returns watching=false', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, projectId: 9 }]);
    const res = await cardsWatchRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.watching).toBe(false);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('kanbanCardWatchers');
  });

  it('client role with matching project can unwatch', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, projectId: 9 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 9, clientId: 33 }]); // project matches client
    const res = await cardsWatchRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
  });

  it('client role without matching project returns 404 and no delete', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, projectId: 9 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // project lookup empty
    const res = await cardsWatchRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls).toHaveLength(0);
  });
});
