// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 23b):
 *   - app/api/email/webhooks/route.ts                    (POST)
 *   - app/api/portal/crm/saved-views/[id]/route.ts       (PUT, DELETE)
 *   - app/api/portal/crm/scoring-rules/[id]/route.ts     (PUT, DELETE)
 *   - app/api/portal/sprints/[id]/route.ts               (PATCH, DELETE)
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
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
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
    emailCampaigns: wrap('emailCampaigns'),
    emailCampaignSends: wrap('emailCampaignSends'),
    crmSavedViews: wrap('crmSavedViews'),
    crmScoringRules: wrap('crmScoringRules'),
    sprints: wrap('sprints'),
    projects: wrap('projects'),
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
  returnedRows: Array<Record<string, unknown>>;
}
interface ExecuteCall {
  sql: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];
const executeCalls: ExecuteCall[] = [];

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
        const rows = deleteReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        deleteCalls.push({ table: table.__table, filter, returnedRows: cloned });
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
      execute(stmt: unknown) {
        executeCalls.push({ sql: stmt });
        return Promise.resolve(undefined);
      },
    },
  };
});

// ---- modules under test ----
const emailWebhooksRoute = await import('@/app/api/email/webhooks/route');
const savedViewsRoute = await import('@/app/api/portal/crm/saved-views/[id]/route');
const scoringRulesRoute = await import('@/app/api/portal/crm/scoring-rules/[id]/route');
const sprintsRoute = await import('@/app/api/portal/sprints/[id]/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit & { headers?: Record<string, string> }): Request {
  return new Request(url, init as RequestInit);
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const SESSION_CLIENT = { user: { id: '7', name: 'Bob' } };

const originalEnv = { ...process.env };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  executeCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  process.env = { ...originalEnv };
});

// ===========================================================================
// /api/email/webhooks
// ===========================================================================

describe('POST /api/email/webhooks', () => {
  it('returns 401 when RESEND_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await emailWebhooksRoute.POST(
      makeReq('http://x/api/email/webhooks', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when svix-signature header missing', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 's3cr3t';
    const res = await emailWebhooksRoute.POST(
      makeReq('http://x/api/email/webhooks', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns received:true for an event missing type/data', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 's3cr3t';
    const res = await emailWebhooksRoute.POST(
      makeReq('http://x/api/email/webhooks', {
        method: 'POST',
        headers: { 'svix-signature': 'sig', 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns received:true when no send row matches the email_id', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 's3cr3t';
    selectQueue.push([]); // send lookup empty
    const res = await emailWebhooksRoute.POST(
      makeReq('http://x/api/email/webhooks', {
        method: 'POST',
        headers: { 'svix-signature': 'sig', 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'email.opened', data: { email_id: 'em_1' } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(updateCalls).toHaveLength(0);
    expect(executeCalls).toHaveLength(0);
  });

  it('handles email.opened by updating openedAt and bumping total_opened', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 's3cr3t';
    selectQueue.push([{ id: 99, campaignId: 7 }]);
    updateReturnQueue.push([{ id: 99 }]);
    const res = await emailWebhooksRoute.POST(
      makeReq('http://x/api/email/webhooks', {
        method: 'POST',
        headers: { 'svix-signature': 'sig', 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'email.opened', data: { email_id: 'em_op' } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('emailCampaignSends');
    expect(updateCalls[0].patch.openedAt).toBeInstanceOf(Date);
    expect(executeCalls).toHaveLength(1);
  });

  it('handles email.clicked by updating clickedAt and bumping total_clicked', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 's3cr3t';
    selectQueue.push([{ id: 101, campaignId: 8 }]);
    updateReturnQueue.push([{ id: 101 }]);
    const res = await emailWebhooksRoute.POST(
      makeReq('http://x/api/email/webhooks', {
        method: 'POST',
        headers: { 'svix-signature': 'sig', 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'email.clicked', data: { email_id: 'em_cl' } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.clickedAt).toBeInstanceOf(Date);
    expect(executeCalls).toHaveLength(1);
  });

  it('handles email.bounced by updating bouncedAt and bumping total_bounced', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 's3cr3t';
    selectQueue.push([{ id: 102, campaignId: 9 }]);
    updateReturnQueue.push([{ id: 102 }]);
    const res = await emailWebhooksRoute.POST(
      makeReq('http://x/api/email/webhooks', {
        method: 'POST',
        headers: { 'svix-signature': 'sig', 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'em_bo' } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.bouncedAt).toBeInstanceOf(Date);
    expect(executeCalls).toHaveLength(1);
  });

  it('handles email.complained without an execute call', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 's3cr3t';
    selectQueue.push([{ id: 103, campaignId: 10 }]);
    updateReturnQueue.push([{ id: 103 }]);
    const res = await emailWebhooksRoute.POST(
      makeReq('http://x/api/email/webhooks', {
        method: 'POST',
        headers: { 'svix-signature': 'sig', 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'email.complained', data: { email_id: 'em_co' } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.complainedAt).toBeInstanceOf(Date);
    expect(executeCalls).toHaveLength(0);
  });
});

// ===========================================================================
// /api/portal/crm/saved-views/[id]
// ===========================================================================

describe('PUT /api/portal/crm/saved-views/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await savedViewsRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue(null);
    const res = await savedViewsRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await savedViewsRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: '{}' }),
      paramsFor('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body has no recognized fields', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await savedViewsRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: JSON.stringify({ other: 1 }) }),
      paramsFor('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('No fields to update');
  });

  it('returns 404 when no matching row is updated', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    updateReturnQueue.push([]);
    const res = await savedViewsRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: JSON.stringify({ name: 'New' }) }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('updates and trims name + passes through filters/isDefault/sortOrder', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    updateReturnQueue.push([{ id: 5, name: 'Trimmed', isDefault: true }]);
    const res = await savedViewsRoute.PUT(
      makeReq('http://x', {
        method: 'PUT',
        body: JSON.stringify({
          name: '  Trimmed  ',
          filters: { foo: 1 },
          isDefault: true,
          sortOrder: 2,
        }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].table).toBe('crmSavedViews');
    expect(updateCalls[0].patch).toEqual({
      name: 'Trimmed',
      filters: { foo: 1 },
      isDefault: true,
      sortOrder: 2,
    });
  });
});

describe('DELETE /api/portal/crm/saved-views/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await savedViewsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue(null);
    const res = await savedViewsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await savedViewsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('zz'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when nothing is deleted', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    deleteReturnQueue.push([]);
    const res = await savedViewsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns success with the deleted row', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    deleteReturnQueue.push([{ id: 5, name: 'Bye' }]);
    const res = await savedViewsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(5);
    expect(deleteCalls[0].table).toBe('crmSavedViews');
  });
});

// ===========================================================================
// /api/portal/crm/scoring-rules/[id]
// ===========================================================================

describe('PUT /api/portal/crm/scoring-rules/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await scoringRulesRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: '{}' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no client', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue(null);
    const res = await scoringRulesRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: '{}' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid id', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await scoringRulesRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: '{}' }),
      paramsFor('nope'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body provides no update fields', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await scoringRulesRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: JSON.stringify({}) }),
      paramsFor('5'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when nothing updated', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    updateReturnQueue.push([]);
    const res = await scoringRulesRoute.PUT(
      makeReq('http://x', {
        method: 'PUT',
        body: JSON.stringify({ enabled: false }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('trims eventType, normalizes empty description to null, returns updated row', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    updateReturnQueue.push([{ id: 5, eventType: 'open', points: 7, enabled: true }]);
    const res = await scoringRulesRoute.PUT(
      makeReq('http://x', {
        method: 'PUT',
        body: JSON.stringify({
          eventType: '  open  ',
          points: 7,
          description: '   ',
          enabled: true,
        }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.eventType).toBe('open');
    expect(patch.points).toBe(7);
    expect(patch.description).toBeNull();
    expect(patch.enabled).toBe(true);
    expect(updateCalls[0].table).toBe('crmScoringRules');
  });
});

describe('DELETE /api/portal/crm/scoring-rules/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await scoringRulesRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no client', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue(null);
    const res = await scoringRulesRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid id', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await scoringRulesRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('xx'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when nothing deleted', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    deleteReturnQueue.push([]);
    const res = await scoringRulesRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns the deleted row on success', async () => {
    authMock.mockResolvedValue(SESSION_CLIENT);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    deleteReturnQueue.push([{ id: 5, eventType: 'open' }]);
    const res = await scoringRulesRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(5);
    expect(deleteCalls[0].table).toBe('crmScoringRules');
  });
});

// ===========================================================================
// /api/portal/sprints/[id]
// ===========================================================================

describe('PATCH /api/portal/sprints/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await sprintsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when sprint not found', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([]); // sprint lookup
    const res = await sprintsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('admin updates sprint and converts date fields', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, projectId: 100 }]);
    updateReturnQueue.push([{ id: 1, name: 'S1', status: 'active' }]);
    const res = await sprintsRoute.PATCH(
      makeReq('http://x', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'S1',
          goal: 'go fast',
          startDate: '2026-01-01',
          endDate: null,
          status: 'active',
        }),
      }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.name).toBe('S1');
    expect(patch.goal).toBe('go fast');
    expect(patch.startDate).toBeInstanceOf(Date);
    expect(patch.endDate).toBeNull();
    expect(patch.status).toBe('active');
    expect(updateCalls[0].table).toBe('sprints');
  });

  it('client user gets 403 when their project is not private', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, projectId: 100 }]); // sprint
    selectQueue.push([{ id: 100, clientId: 33, isPrivate: false }]); // project
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await sprintsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
      paramsFor('1'),
    );
    expect(res.status).toBe(403);
  });

  it('client user gets 404 when project clientId mismatches', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, projectId: 100 }]);
    selectQueue.push([{ id: 100, clientId: 999, isPrivate: true }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await sprintsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 500 on unexpected throw', async () => {
    authMock.mockRejectedValue(new Error('boom'));
    const res = await sprintsRoute.PATCH(
      makeReq('http://x', { method: 'PATCH', body: '{}' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/portal/sprints/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await sprintsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when sprint not found', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([]);
    const res = await sprintsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(404);
  });

  it('admin deletes sprint and returns success', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, projectId: 100 }]);
    const res = await sprintsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteCalls[0].table).toBe('sprints');
  });

  it('returns 403 when client cannot edit', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    selectQueue.push([{ id: 1, projectId: 100 }]);
    selectQueue.push([{ id: 100, clientId: 33, isPrivate: false }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await sprintsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on unexpected throw', async () => {
    authMock.mockRejectedValue(new Error('boom'));
    const res = await sprintsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      paramsFor('1'),
    );
    expect(res.status).toBe(500);
  });
});
