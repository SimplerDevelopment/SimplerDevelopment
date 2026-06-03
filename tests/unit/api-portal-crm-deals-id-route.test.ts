// @vitest-environment node
/**
 * Unit tests for app/api/portal/crm/deals/[id]/route.ts
 *
 * The route touches: auth, getPortalClient, the crmDeals / crmContacts /
 * crmCompanies / crmPipelineStages / crmCustomFields / crmCustomFieldValues
 * tables (read + write), and helpers: emitEvent, createCrmNotification,
 * notifyAllClientUsers, and assertions from lib/security/assert-owned.
 * Everything external is mocked. Drizzle column refs are wrapped as
 * Proxy markers and the db mock walks chained calls to return whatever the
 * test queued via state mutation helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock collaborators (declared BEFORE the route import — Vitest hoists vi.mock)
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

const createCrmNotificationMock = vi.fn();
const notifyAllClientUsersMock = vi.fn();
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: (...args: unknown[]) => createCrmNotificationMock(...args),
  notifyAllClientUsers: (...args: unknown[]) => notifyAllClientUsersMock(...args),
}));

const assertStageInClientMock = vi.fn();
const assertPipelineInClientMock = vi.fn();
const assertContactInClientMock = vi.fn();
const assertCompanyInClientMock = vi.fn();
const assertUserVisibleToClientMock = vi.fn();

class OwnershipErrorMock extends Error {
  constructor(public field: string, public id: number | string) {
    super(`Forbidden: ${field}=${id} not in active client.`);
  }
}

vi.mock('@/lib/security/assert-owned', () => ({
  assertStageInClient: (...args: unknown[]) => assertStageInClientMock(...args),
  assertPipelineInClient: (...args: unknown[]) => assertPipelineInClientMock(...args),
  assertContactInClient: (...args: unknown[]) => assertContactInClientMock(...args),
  assertCompanyInClient: (...args: unknown[]) => assertCompanyInClientMock(...args),
  assertUserVisibleToClient: (...args: unknown[]) => assertUserVisibleToClientMock(...args),
  OwnershipError: OwnershipErrorMock,
}));

// ---- schema — wrap so column refs round-trip through our DB mock ----

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    crmDeals: wrap('crmDeals'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmPipelineStages: wrap('crmPipelineStages'),
    crmCustomFields: wrap('crmCustomFields'),
    crmCustomFieldValues: wrap('crmCustomFieldValues'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- DB mock — programmable per-test ---------------------------------------
// Tests stage rows via the `db` proxy below. The select path walks join
// chains and ignores them; it ultimately returns whatever was queued via
// `selectQueue.push(...)`. Updates and deletes return queued rows. Inserts
// are not exercised by this route.

const selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateQueue: Array<Array<Record<string, unknown>>> = [];
const deleteQueue: Array<Array<Record<string, unknown>>> = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    const chain: Record<string, unknown> = {
      from() {
        return chain;
      },
      leftJoin() {
        return chain;
      },
      where(_arg: unknown) {
        // Awaitable directly (no .limit on these queries).
        return Promise.resolve(selectQueue.shift() ?? []);
      },
      limit() {
        return Promise.resolve(selectQueue.shift() ?? []);
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildUpdate() {
    return {
      set() {
        return {
          where() {
            return {
              returning() {
                return Promise.resolve(updateQueue.shift() ?? []);
              },
            };
          },
        };
      },
    };
  }

  function buildDelete() {
    return {
      where() {
        return {
          returning() {
            return Promise.resolve(deleteQueue.shift() ?? []);
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
          },
        };
      },
      update() {
        return buildUpdate();
      },
      delete() {
        return buildDelete();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const { GET, PUT, DELETE } = await import('@/app/api/portal/crm/deals/[id]/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/portal/crm/deals/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function defaultDealRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 10,
    pipelineId: 100,
    stageId: 200,
    contactId: 300,
    companyId: 400,
    title: 'Big Deal',
    value: '1000',
    currency: 'USD',
    status: 'open',
    priority: 'medium',
    expectedCloseDate: null,
    closedAt: null,
    notes: 'notes',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    contactFirstName: 'Jane',
    contactLastName: 'Doe',
    contactEmail: 'jane@example.com',
    companyName: 'Acme',
    stageName: 'Prospecting',
    stageColor: '#abc',
    ownerId: 7,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  updateQueue.length = 0;
  deleteQueue.length = 0;
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/crm/deals/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 for a non-numeric id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await GET(new Request('http://x'), makeParams('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when the deal is not found', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    // First select (deal) → empty
    selectQueue.push([]);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Deal not found');
  });

  it('returns the deal with merged custom fields on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    // 1st select: deal row
    selectQueue.push([defaultDealRow()]);
    // 2nd select: custom field rows
    selectQueue.push([
      { fieldId: 11, fieldName: 'industry', fieldType: 'text', value: 'saas' },
      { fieldId: 12, fieldName: 'tier', fieldType: 'select', value: 'gold' },
      { fieldId: 13, fieldName: 'orphan', fieldType: 'text', value: null },
    ]);

    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe('Big Deal');
    expect(body.data.customFields[11]).toEqual({ name: 'industry', type: 'text', value: 'saas' });
    expect(body.data.customFields[12]).toEqual({ name: 'tier', type: 'select', value: 'gold' });
    expect(body.data.customFields[13]).toEqual({ name: 'orphan', type: 'text', value: null });
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/portal/crm/deals/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await PUT(makeRequest({ title: 'x' }), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await PUT(makeRequest({ title: 'x' }), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the existing deal is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    // existing-deal select → empty
    selectQueue.push([]);
    const res = await PUT(makeRequest({ title: 'x' }), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Deal not found');
  });

  it('returns 403 when an FK assertion throws OwnershipError', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]); // existing
    assertStageInClientMock.mockRejectedValueOnce(new OwnershipErrorMock('stageId', 999));
    const res = await PUT(makeRequest({ stageId: 999 }), makeParams('1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/stageId=999/);
  });

  it('rethrows non-OwnershipError errors from FK assertions', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    assertPipelineInClientMock.mockRejectedValueOnce(new Error('db down'));
    await expect(PUT(makeRequest({ pipelineId: 5 }), makeParams('1'))).rejects.toThrow('db down');
  });

  it('updates a deal and emits crm.deal.updated for a plain edit', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]); // existing
    updateQueue.push([
      { id: 1, title: 'New Title', value: '500', status: 'open', stageId: 200, contactId: 300, ownerId: 7 },
    ]);

    const res = await PUT(
      makeRequest({
        title: '  New Title  ',
        value: '500',
        currency: 'USD',
        priority: 'high',
        contactId: 300,
        companyId: 400,
        expectedCloseDate: '2026-01-01',
        notes: '  hi  ',
        sortOrder: 3,
        recurringValue: '99',
        billingCycle: 'monthly',
      }),
      makeParams('1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(emitEventMock).toHaveBeenCalledWith(
      'crm.deal.updated',
      10,
      42,
      expect.objectContaining({ id: 1, title: 'New Title' }),
    );
    expect(notifyAllClientUsersMock).not.toHaveBeenCalled();
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('handles status=won — sets closedAt and emits crm.deal.won', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'X', value: '1', status: 'won', stageId: null, contactId: null, ownerId: 7 }]);

    const res = await PUT(makeRequest({ status: 'won' }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(emitEventMock).toHaveBeenCalledWith('crm.deal.won', 10, 42, expect.any(Object));
  });

  it('handles status=lost — emits crm.deal.lost', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'X', value: '1', status: 'lost', stageId: null, contactId: null, ownerId: 7 }]);

    const res = await PUT(makeRequest({ status: 'lost' }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(emitEventMock).toHaveBeenCalledWith('crm.deal.lost', 10, 42, expect.any(Object));
  });

  it('handles status=open — clears closedAt and emits updated', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'X', value: '1', status: 'open', stageId: null, contactId: null, ownerId: 7 }]);

    const res = await PUT(makeRequest({ status: 'open' }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(emitEventMock).toHaveBeenCalledWith('crm.deal.updated', 10, 42, expect.any(Object));
  });

  it('notifies all client users when stage changes (with looked-up stage name)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]); // existing
    updateQueue.push([{ id: 1, title: 'New Stage Deal', value: '1', status: 'open', stageId: 999, contactId: null, ownerId: 7 }]);
    // stage-name lookup
    selectQueue.push([{ name: 'Negotiation' }]);

    const res = await PUT(makeRequest({ stageId: 999 }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(notifyAllClientUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        excludeUserId: 42,
        type: 'deal_stage_changed',
        title: expect.stringContaining("'Negotiation'"),
        entityType: 'deal',
        entityId: 1,
      }),
    );
  });

  it('falls back to "Unknown" stage name when stage lookup is empty', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'Deal', value: '1', status: 'open', stageId: 999, contactId: null, ownerId: 7 }]);
    selectQueue.push([]); // stage lookup empty

    await PUT(makeRequest({ stageId: 999 }), makeParams('1'));
    expect(notifyAllClientUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("'Unknown'") }),
    );
  });

  it('notifies new owner when ownerId changes to a different user', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]); // previous owner = 7
    updateQueue.push([{ id: 1, title: 'Assigned Deal', value: '1', status: 'open', stageId: null, contactId: null, ownerId: 88 }]);

    const res = await PUT(makeRequest({ ownerId: 88 }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(createCrmNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        userId: 88,
        type: 'deal_assigned',
        entityType: 'deal',
        entityId: 1,
      }),
    );
  });

  it('does not notify when new owner equals the actor', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'Self Assign', value: '1', status: 'open', stageId: null, contactId: null, ownerId: 42 }]);

    await PUT(makeRequest({ ownerId: 42 }), makeParams('1'));
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('does not notify when owner did not change', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'Same Owner', value: '1', status: 'open', stageId: null, contactId: null, ownerId: 7 }]);

    await PUT(makeRequest({ ownerId: 7 }), makeParams('1'));
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('does not notify when ownerId resolves to null (deassignment)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'Deassign', value: '1', status: 'open', stageId: null, contactId: null, ownerId: null }]);

    await PUT(makeRequest({ ownerId: 0 }), makeParams('1'));
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('calls every assert helper when their FK fields are supplied', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'All FKs', value: '1', status: 'open', stageId: 200, contactId: 300, ownerId: 7 }]);

    await PUT(
      makeRequest({
        stageId: 200,
        pipelineId: 100,
        contactId: 300,
        companyId: 400,
        ownerId: 7,
      }),
      makeParams('1'),
    );

    expect(assertStageInClientMock).toHaveBeenCalledWith(200, 10);
    expect(assertPipelineInClientMock).toHaveBeenCalledWith(100, 10);
    expect(assertContactInClientMock).toHaveBeenCalledWith(300, 10);
    expect(assertCompanyInClientMock).toHaveBeenCalledWith(400, 10);
    expect(assertUserVisibleToClientMock).toHaveBeenCalledWith(7, 10);
  });

  it('skips assertStageInClient when stageId is null (intentional clear)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    selectQueue.push([{ id: 1, ownerId: 7 }]);
    updateQueue.push([{ id: 1, title: 'Null Stage', value: '1', status: 'open', stageId: null, contactId: null, ownerId: 7 }]);

    await PUT(makeRequest({ stageId: null, pipelineId: null }), makeParams('1'));
    expect(assertStageInClientMock).not.toHaveBeenCalled();
    expect(assertPipelineInClientMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/portal/crm/deals/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await DELETE(new Request('http://x'), makeParams('xyz'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when there is nothing to delete', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    deleteQueue.push([]);
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Deal not found');
  });

  it('deletes the deal and returns it on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    deleteQueue.push([{ id: 1, title: 'Bye' }]);
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe('Bye');
  });
});
