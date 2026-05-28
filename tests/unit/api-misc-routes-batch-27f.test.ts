// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 27f):
 *   - app/api/portal/approvals/route.ts                  (GET — list + count)
 *   - app/api/portal/approvals/[id]/route.ts             (GET — single)
 *   - app/api/portal/approvals/bulk-approve/route.ts     (POST)
 *   - app/api/portal/approvals/bulk-reject/route.ts      (POST)
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

const applyPendingChangeMock = vi.fn();
vi.mock('@/lib/mcp/approvals', () => ({
  applyPendingChange: (...args: unknown[]) => applyPendingChangeMock(...args),
}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
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
  return {
    mcpPendingChanges: wrap('mcpPendingChanges'),
    portalApiKeys: wrap('portalApiKeys'),
    users: wrap('users'),
  };
});

// ---------------------------------------------------------------------------
// DB mock: select chain (thenable) + update chain
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{ table: string; values: Record<string, unknown>; where: unknown }> = [];

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

  function buildUpdate(tableObj: { __table?: string }) {
    let values: Record<string, unknown> = {};
    const u = {
      set(v: Record<string, unknown>) {
        values = v;
        return u;
      },
      where(cond: unknown) {
        updateCalls.push({ table: tableObj.__table ?? 'unknown', values, where: cond });
        return Promise.resolve();
      },
    };
    return u;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      update(table: { __table?: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---- modules under test ----
const approvalsRoute = await import('@/app/api/portal/approvals/route');
const approvalsIdRoute = await import('@/app/api/portal/approvals/[id]/route');
const bulkApproveRoute = await import('@/app/api/portal/approvals/bulk-approve/route');
const bulkRejectRoute = await import('@/app/api/portal/approvals/bulk-reject/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makePostReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7', name: 'Alice' } };

beforeEach(() => {
  selectQueue = [];
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalRoleMock.mockReset();
  applyPendingChangeMock.mockReset();
  revalidatePathMock.mockReset();
  vi.restoreAllMocks();
});

// ===========================================================================
// portal/approvals (GET)
// ===========================================================================

describe('GET /api/portal/approvals', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await approvalsRoute.GET(makeReq('http://x/api/portal/approvals'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session user has no id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await approvalsRoute.GET(makeReq('http://x/api/portal/approvals'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await approvalsRoute.GET(makeReq('http://x/api/portal/approvals'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns count only when count=true and default status pending', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    selectQueue.push([{ count: 3 }]);
    const res = await approvalsRoute.GET(
      makeReq('http://x/api/portal/approvals?count=true'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ count: 3 });
    // getPortalRole shouldn't be called in count mode
    expect(getPortalRoleMock).not.toHaveBeenCalled();
  });

  it('returns count for a custom status when count=true&status=applied', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    selectQueue.push([{ count: 7 }]);
    const res = await approvalsRoute.GET(
      makeReq('http://x/api/portal/approvals?count=true&status=applied'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.count).toBe(7);
  });

  it('returns rows + meta when not count mode', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 22 });
    selectQueue.push([
      {
        id: 1,
        entityType: 'page',
        entityId: '99',
        operation: 'update',
        summary: 'edit',
        status: 'pending',
        keyId: 5,
        keyName: 'key-1',
        submitterName: 'Bob',
        reviewerId: null,
        reviewedAt: null,
        reviewNote: null,
        appliedAt: null,
        errorMessage: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    getPortalRoleMock.mockResolvedValue('owner');
    const res = await approvalsRoute.GET(
      makeReq('http://x/api/portal/approvals?status=pending&entityType=page'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ role: 'owner', canManage: true });
  });

  it('sets canManage=false when role is viewer', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 22 });
    selectQueue.push([]);
    getPortalRoleMock.mockResolvedValue('viewer');
    const res = await approvalsRoute.GET(makeReq('http://x/api/portal/approvals'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta).toEqual({ role: 'viewer', canManage: false });
  });

  it('sets canManage=true when role is admin', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 22 });
    selectQueue.push([]);
    getPortalRoleMock.mockResolvedValue('admin');
    const res = await approvalsRoute.GET(makeReq('http://x/api/portal/approvals'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta).toEqual({ role: 'admin', canManage: true });
  });
});

// ===========================================================================
// portal/approvals/[id] (GET)
// ===========================================================================

describe('GET /api/portal/approvals/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await approvalsIdRoute.GET(makeReq('http://x/api/portal/approvals/5'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await approvalsIdRoute.GET(makeReq('http://x/api/portal/approvals/5'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when no row found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 3 });
    selectQueue.push([]); // no rows
    const res = await approvalsIdRoute.GET(makeReq('http://x/api/portal/approvals/77'), {
      params: Promise.resolve({ id: '77' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns the row joined with key + user when found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 3 });
    selectQueue.push([
      {
        change: { id: 77, clientId: 3, entityType: 'page', status: 'pending' },
        keyName: 'main-key',
        submitterName: 'Bob',
        submitterEmail: 'bob@example.com',
      },
    ]);
    const res = await approvalsIdRoute.GET(makeReq('http://x/api/portal/approvals/77'), {
      params: Promise.resolve({ id: '77' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.change.id).toBe(77);
    expect(body.data.keyName).toBe('main-key');
    expect(body.data.submitterEmail).toBe('bob@example.com');
  });
});

// ===========================================================================
// portal/approvals/bulk-approve (POST)
// ===========================================================================

describe('POST /api/portal/approvals/bulk-approve', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', { ids: [1] }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', { ids: [1] }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when role is viewer', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    getPortalRoleMock.mockResolvedValue('viewer');
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', { ids: [1] }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/owners and admins/i);
  });

  it('returns 400 when ids is empty or missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    getPortalRoleMock.mockResolvedValue('owner');
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', { ids: [] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Provide ids/);
  });

  it('returns 400 when ids exceeds MAX_BATCH (25)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    getPortalRoleMock.mockResolvedValue('owner');
    const ids = Array.from({ length: 26 }, (_, i) => i + 1);
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', { ids }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/exceeds limit/i);
  });

  it('handles malformed JSON body as empty ids -> 400', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    getPortalRoleMock.mockResolvedValue('owner');
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', '{not-json'),
    );
    expect(res.status).toBe(400);
  });

  it('applies pending changes, skips not-found and non-pending', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    getPortalRoleMock.mockResolvedValue('admin');
    // Two changes found, id=1 pending (apply OK), id=2 already applied (skipped).
    // id=3 will be "not found".
    selectQueue.push([
      { id: 1, clientId: 9, status: 'pending', payload: {} },
      { id: 2, clientId: 9, status: 'applied', payload: {} },
    ]);
    applyPendingChangeMock.mockResolvedValue(undefined);
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', {
        ids: [1, 2, 3],
        note: 'looks good',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(3);
    expect(body.data.applied).toBe(1);
    expect(body.data.failed).toBe(0);
    expect(body.data.skipped).toBe(2);
    const results = body.data.results as Array<{ id: number; status: string; error?: string }>;
    expect(results[0]).toEqual({ id: 1, status: 'applied' });
    expect(results[1]).toMatchObject({ id: 2, status: 'skipped' });
    expect(results[1].error).toMatch(/Status is applied/);
    expect(results[2]).toMatchObject({ id: 3, status: 'skipped', error: 'Not found' });
    // One update call for id=1 -> applied
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({
      status: 'applied',
      reviewerId: 7,
      reviewNote: 'looks good',
    });
  });

  it('marks an item as failed and updates with errorMessage when applyPendingChange throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectQueue.push([{ id: 1, clientId: 9, status: 'pending', payload: {} }]);
    applyPendingChangeMock.mockRejectedValue(new Error('boom'));
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', { ids: [1] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applied).toBe(0);
    expect(body.data.failed).toBe(1);
    expect(body.data.results[0]).toEqual({ id: 1, status: 'failed', error: 'boom' });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({
      status: 'failed',
      errorMessage: 'boom',
      reviewNote: null,
    });
  });

  it('filters non-number ids out (e.g. strings)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    getPortalRoleMock.mockResolvedValue('owner');
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', { ids: ['1', '2'] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Provide ids/);
  });

  it('still returns 200 even if revalidatePath throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectQueue.push([{ id: 1, clientId: 9, status: 'pending', payload: {} }]);
    applyPendingChangeMock.mockResolvedValue(undefined);
    revalidatePathMock.mockImplementation(() => {
      throw new Error('revalidate failed');
    });
    const res = await bulkApproveRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-approve', { ids: [1] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.applied).toBe(1);
  });
});

// ===========================================================================
// portal/approvals/bulk-reject (POST)
// ===========================================================================

describe('POST /api/portal/approvals/bulk-reject', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', { ids: [1] }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', { ids: [1] }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when role is viewer', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    getPortalRoleMock.mockResolvedValue('viewer');
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', { ids: [1] }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when ids is empty', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    getPortalRoleMock.mockResolvedValue('owner');
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', { ids: [] }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids exceeds MAX_BATCH', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    getPortalRoleMock.mockResolvedValue('owner');
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', { ids }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/exceeds limit/i);
  });

  it('handles malformed JSON as empty ids -> 400', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    getPortalRoleMock.mockResolvedValue('owner');
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', '{not-json'),
    );
    expect(res.status).toBe(400);
  });

  it('rejects pending changes and skips non-pending / not-found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    getPortalRoleMock.mockResolvedValue('admin');
    selectQueue.push([
      { id: 1, status: 'pending' },
      { id: 2, status: 'applied' },
    ]);
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', {
        ids: [1, 2, 3],
        note: 'no thanks',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(3);
    expect(body.data.rejected).toBe(1);
    expect(body.data.skipped).toBe(2);
    const results = body.data.results as Array<{ id: number; status: string; error?: string }>;
    expect(results[0]).toEqual({ id: 1, status: 'rejected' });
    expect(results[1]).toMatchObject({ id: 2, status: 'skipped' });
    expect(results[2]).toMatchObject({ id: 3, status: 'skipped', error: 'Not found' });
    // One bulk update call when toReject has entries
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({
      status: 'rejected',
      reviewerId: 7,
      reviewNote: 'no thanks',
    });
  });

  it('skips the bulk update when no items are eligible', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    getPortalRoleMock.mockResolvedValue('owner');
    // All not-found or non-pending -> nothing to reject
    selectQueue.push([{ id: 2, status: 'rejected' }]);
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', { ids: [2, 3] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rejected).toBe(0);
    expect(body.data.skipped).toBe(2);
    // No update should be issued
    expect(updateCalls).toHaveLength(0);
  });

  it('uses note=null when no note provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 12 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectQueue.push([{ id: 1, status: 'pending' }]);
    const res = await bulkRejectRoute.POST(
      makePostReq('http://x/api/portal/approvals/bulk-reject', { ids: [1] }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({ reviewNote: null });
  });
});
