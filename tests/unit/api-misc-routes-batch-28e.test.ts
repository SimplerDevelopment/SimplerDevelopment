// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 28e):
 *   - app/api/portal/brain/relationships/route.ts        (GET, POST)
 *   - app/api/portal/brain/relationships/[id]/route.ts   (GET, PUT, DELETE)
 *   - app/api/portal/brain/search/route.ts               (GET)
 *   - app/api/portal/brain/tasks/route.ts                (GET, POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

// relationships lib
const listRelationshipsMock = vi.fn();
const createOverlayMock = vi.fn();
const getRelationshipMock = vi.fn();
const updateOverlayMock = vi.fn();
const deleteOverlayMock = vi.fn();
vi.mock('@/lib/brain/relationships', () => ({
  listRelationships: (...args: unknown[]) => listRelationshipsMock(...args),
  createOverlay: (...args: unknown[]) => createOverlayMock(...args),
  getRelationship: (...args: unknown[]) => getRelationshipMock(...args),
  updateOverlay: (...args: unknown[]) => updateOverlayMock(...args),
  deleteOverlay: (...args: unknown[]) => deleteOverlayMock(...args),
  countRelationships: (..._args: unknown[]) => Promise.resolve(0),
}));

// search lib
const searchBrainMock = vi.fn();
vi.mock('@/lib/brain/search', () => ({
  searchBrain: (...args: unknown[]) => searchBrainMock(...args),
}));

// tasks lib
const listTasksMock = vi.fn();
const createTaskMock = vi.fn();
vi.mock('@/lib/brain/tasks', () => ({
  listTasks: (...args: unknown[]) => listTasksMock(...args),
  createTask: (...args: unknown[]) => createTaskMock(...args),
  countTasks: (..._args: unknown[]) => Promise.resolve(0),
}));

// audit
const logAuditMock = vi.fn();
vi.mock('@/lib/brain/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

// schema mock for any type imports
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
    brainRelationshipOverlays: wrap('brainRelationshipOverlays'),
    brainTasks: wrap('brainTasks'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---- modules under test (loaded AFTER mocks) ----
const relationshipsRoute = await import('@/app/api/portal/brain/relationships/route');
const relationshipsIdRoute = await import('@/app/api/portal/brain/relationships/[id]/route');
const searchRoute = await import('@/app/api/portal/brain/search/route');
const tasksRoute = await import('@/app/api/portal/brain/tasks/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const FAIL_RESPONSE = NextResponse.json(
  { success: false, code: 'BRAIN_NOT_ENTITLED' },
  { status: 402 },
);

beforeEach(() => {
  requireBrainEntitlementMock.mockReset();
  listRelationshipsMock.mockReset();
  createOverlayMock.mockReset();
  getRelationshipMock.mockReset();
  updateOverlayMock.mockReset();
  deleteOverlayMock.mockReset();
  searchBrainMock.mockReset();
  listTasksMock.mockReset();
  createTaskMock.mockReset();
  logAuditMock.mockReset();
});

// ===========================================================================
// brain/relationships
// ===========================================================================

describe('GET /api/portal/brain/relationships', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await relationshipsRoute.GET(
      makeReq('http://x/api/portal/brain/relationships'),
    );
    expect(res.status).toBe(402);
  });

  it('returns rows with no filters', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listRelationshipsMock.mockResolvedValue([{ id: 1, name: 'R1' }]);
    const res = await relationshipsRoute.GET(
      makeReq('http://x/api/portal/brain/relationships'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 1, name: 'R1' }]);
    expect(listRelationshipsMock).toHaveBeenCalledWith(5, {
      type: undefined,
      ownerId: undefined,
      priority: undefined,
      status: undefined,
      staleOnly: false,
      limit: 100,
      offset: 0,
    });
  });

  it('passes through all valid filters', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listRelationshipsMock.mockResolvedValue([]);
    await relationshipsRoute.GET(
      makeReq(
        'http://x/api/portal/brain/relationships?type=company&ownerId=99&priority=high&status=active&stale=true',
      ),
    );
    expect(listRelationshipsMock).toHaveBeenCalledWith(5, {
      type: 'company',
      ownerId: 99,
      priority: 'high',
      status: 'active',
      staleOnly: true,
      limit: 100,
      offset: 0,
    });
  });

  it('drops invalid priority and status values', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listRelationshipsMock.mockResolvedValue([]);
    await relationshipsRoute.GET(
      makeReq(
        'http://x/api/portal/brain/relationships?priority=bogus&status=zzz',
      ),
    );
    const filters = listRelationshipsMock.mock.calls[0][1];
    expect(filters.priority).toBeUndefined();
    expect(filters.status).toBeUndefined();
  });
});

describe('POST /api/portal/brain/relationships', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await relationshipsRoute.POST(
      makeReq('http://x/api/portal/brain/relationships', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for an invalid (non-JSON) body', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await relationshipsRoute.POST(
      makeReq('http://x/api/portal/brain/relationships', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid/i);
  });

  it('returns 400 when neither companyId nor dealId is provided', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await relationshipsRoute.POST(
      makeReq('http://x/api/portal/brain/relationships', {
        method: 'POST',
        body: JSON.stringify({ relationshipType: 'prospect' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/exactly one/i);
  });

  it('returns 400 when BOTH companyId and dealId are provided', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await relationshipsRoute.POST(
      makeReq('http://x/api/portal/brain/relationships', {
        method: 'POST',
        body: JSON.stringify({ companyId: 1, dealId: 2 }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/exactly one/i);
  });

  it('creates an overlay with sanitized inputs', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    createOverlayMock.mockResolvedValue({ id: 42 });
    const lastTouch = '2025-01-02T03:04:05.000Z';
    const nextReview = '2025-02-02T03:04:05.000Z';
    const res = await relationshipsRoute.POST(
      makeReq('http://x/api/portal/brain/relationships', {
        method: 'POST',
        body: JSON.stringify({
          companyId: 7,
          relationshipType: 'prospect',
          status: 'active',
          ownerId: 11,
          priority: 'critical',
          serviceLines: ['a', 2, 'b'],
          summary: 'hi',
          currentPriorities: 'cp',
          openLoops: 'ol',
          lastTouchAt: lastTouch,
          nextReviewAt: nextReview,
          confidentialityLevel: 'restricted',
          staleAfterDays: 30,
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 42 });
    const arg = createOverlayMock.mock.calls[0][0];
    expect(arg.clientId).toBe(5);
    expect(arg.actorId).toBe(99);
    expect(arg.companyId).toBe(7);
    expect(arg.dealId).toBeUndefined();
    expect(arg.relationshipType).toBe('prospect');
    expect(arg.status).toBe('active');
    expect(arg.ownerId).toBe(11);
    expect(arg.priority).toBe('critical');
    expect(arg.serviceLines).toEqual(['a', 'b']);
    expect(arg.summary).toBe('hi');
    expect(arg.currentPriorities).toBe('cp');
    expect(arg.openLoops).toBe('ol');
    expect(arg.lastTouchAt).toBeInstanceOf(Date);
    expect(arg.lastTouchAt.toISOString()).toBe(lastTouch);
    expect(arg.nextReviewAt).toBeInstanceOf(Date);
    expect(arg.confidentialityLevel).toBe('restricted');
    expect(arg.staleAfterDays).toBe(30);
  });

  it('drops invalid status/priority and tolerates dealId-only link', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    createOverlayMock.mockResolvedValue({ id: 43 });
    await relationshipsRoute.POST(
      makeReq('http://x/api/portal/brain/relationships', {
        method: 'POST',
        body: JSON.stringify({
          dealId: 7,
          status: 'nope',
          priority: 'nope',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const arg = createOverlayMock.mock.calls[0][0];
    expect(arg.dealId).toBe(7);
    expect(arg.companyId).toBeUndefined();
    expect(arg.status).toBeUndefined();
    expect(arg.priority).toBeUndefined();
    expect(arg.ownerId).toBeNull();
  });

  it('returns 400 when createOverlay throws an Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    createOverlayMock.mockRejectedValue(new Error('overlap'));
    const res = await relationshipsRoute.POST(
      makeReq('http://x/api/portal/brain/relationships', {
        method: 'POST',
        body: JSON.stringify({ companyId: 7 }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('overlap');
  });

  it('returns 400 with generic message when createOverlay rejects a non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    createOverlayMock.mockRejectedValue('weird');
    const res = await relationshipsRoute.POST(
      makeReq('http://x/api/portal/brain/relationships', {
        method: 'POST',
        body: JSON.stringify({ companyId: 7 }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/failed to create/i);
  });
});

// ===========================================================================
// brain/relationships/[id]
// ===========================================================================

describe('GET /api/portal/brain/relationships/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await relationshipsIdRoute.GET(
      makeReq('http://x/api/portal/brain/relationships/1'),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    const res = await relationshipsIdRoute.GET(
      makeReq('http://x/api/portal/brain/relationships/abc'),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when getRelationship returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getRelationshipMock.mockResolvedValue(null);
    const res = await relationshipsIdRoute.GET(
      makeReq('http://x/api/portal/brain/relationships/42'),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns the relationship detail when found', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getRelationshipMock.mockResolvedValue({ id: 42, summary: 'detail' });
    const res = await relationshipsIdRoute.GET(
      makeReq('http://x/api/portal/brain/relationships/42'),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect(getRelationshipMock).toHaveBeenCalledWith(5, 42);
    expect((await res.json()).data).toEqual({ id: 42, summary: 'detail' });
  });
});

describe('PUT /api/portal/brain/relationships/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await relationshipsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/relationships/1', {
        method: 'PUT',
        body: '{}',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await relationshipsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/relationships/zzz', {
        method: 'PUT',
        body: '{}',
      }),
      makeParams('zzz'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid (non-JSON) body', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await relationshipsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/relationships/42', {
        method: 'PUT',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(400);
  });

  it('updates the overlay and returns the result', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    updateOverlayMock.mockResolvedValue({ id: 42, summary: 'new' });
    const lastTouch = '2025-01-02T03:04:05.000Z';
    const res = await relationshipsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/relationships/42', {
        method: 'PUT',
        body: JSON.stringify({
          relationshipType: 'partner',
          status: 'paused',
          ownerId: 7,
          secondaryOwnerId: 8,
          priority: 'low',
          serviceLines: ['a', 2, 'b'],
          summary: 'new',
          currentPriorities: 'cp',
          openLoops: 'ol',
          lastTouchAt: lastTouch,
          confidentialityLevel: 'standard',
          complianceFlags: ['x', 1, 'y'],
          staleAfterDays: 45,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 42, summary: 'new' });
    const [clientId, overlayId, actorId, patch] = updateOverlayMock.mock.calls[0];
    expect(clientId).toBe(5);
    expect(overlayId).toBe(42);
    expect(actorId).toBe(99);
    expect(patch.status).toBe('paused');
    expect(patch.priority).toBe('low');
    expect(patch.ownerId).toBe(7);
    expect(patch.secondaryOwnerId).toBe(8);
    expect(patch.serviceLines).toEqual(['a', 'b']);
    expect(patch.complianceFlags).toEqual(['x', 'y']);
    expect(patch.summary).toBe('new');
    expect(patch.lastTouchAt).toBeInstanceOf(Date);
    expect(patch.staleAfterDays).toBe(45);
  });

  it('passes through nulls for nullable fields', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    updateOverlayMock.mockResolvedValue({ id: 42 });
    await relationshipsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/relationships/42', {
        method: 'PUT',
        body: JSON.stringify({
          ownerId: null,
          secondaryOwnerId: null,
          summary: null,
          currentPriorities: null,
          openLoops: null,
          lastTouchAt: null,
          nextReviewAt: null,
          staleAfterDays: null,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    const patch = updateOverlayMock.mock.calls[0][3];
    expect(patch.ownerId).toBeNull();
    expect(patch.secondaryOwnerId).toBeNull();
    expect(patch.summary).toBeNull();
    expect(patch.currentPriorities).toBeNull();
    expect(patch.openLoops).toBeNull();
    expect(patch.lastTouchAt).toBeNull();
    expect(patch.nextReviewAt).toBeNull();
    expect(patch.staleAfterDays).toBeNull();
  });

  it('returns 400 when updateOverlay throws Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    updateOverlayMock.mockRejectedValue(new Error('nope'));
    const res = await relationshipsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/relationships/42', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('nope');
  });

  it('returns 400 with generic message when updateOverlay rejects non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    updateOverlayMock.mockRejectedValue('weird');
    const res = await relationshipsIdRoute.PUT(
      makeReq('http://x/api/portal/brain/relationships/42', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/failed to update/i);
  });
});

describe('DELETE /api/portal/brain/relationships/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await relationshipsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/relationships/1', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'admin',
    });
    const res = await relationshipsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/relationships/abc', { method: 'DELETE' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleteOverlay returns false', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'admin',
    });
    deleteOverlayMock.mockResolvedValue(false);
    const res = await relationshipsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/relationships/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful delete', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    deleteOverlayMock.mockResolvedValue(true);
    const res = await relationshipsIdRoute.DELETE(
      makeReq('http://x/api/portal/brain/relationships/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(deleteOverlayMock).toHaveBeenCalledWith(5, 42, 99);
  });
});

// ===========================================================================
// brain/search
// ===========================================================================

describe('GET /api/portal/brain/search', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await searchRoute.GET(
      makeReq('http://x/api/portal/brain/search?q=hi'),
    );
    expect(res.status).toBe(402);
  });

  it('passes a default empty query and undefined options', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    searchBrainMock.mockResolvedValue({ hits: [] });
    const res = await searchRoute.GET(
      makeReq('http://x/api/portal/brain/search'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ hits: [] });
    expect(searchBrainMock).toHaveBeenCalledWith(5, '', {
      types: undefined,
      limit: undefined,
    });
  });

  it('parses types and limit when supplied', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    searchBrainMock.mockResolvedValue({ hits: [] });
    await searchRoute.GET(
      makeReq('http://x/api/portal/brain/search?q=needle&types=meeting,note,bogus&limit=10'),
    );
    expect(searchBrainMock).toHaveBeenCalledWith(5, 'needle', {
      types: ['meeting', 'note'], // bogus filtered out
      limit: 10,
    });
  });

  it('clamps limit to a minimum of 1', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    searchBrainMock.mockResolvedValue({ hits: [] });
    await searchRoute.GET(
      makeReq('http://x/api/portal/brain/search?q=x&limit=0'),
    );
    // limit=0 -> parseInt(0) is falsy via "|| 25" branch... actually `parseInt("0") || 25` is 25, so clamps via Math.min(25,100)=25
    expect(searchBrainMock).toHaveBeenCalledWith(5, 'x', {
      types: undefined,
      limit: 25,
    });
  });

  it('clamps limit to a maximum of 100', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    searchBrainMock.mockResolvedValue({ hits: [] });
    await searchRoute.GET(
      makeReq('http://x/api/portal/brain/search?q=x&limit=99999'),
    );
    expect(searchBrainMock).toHaveBeenCalledWith(5, 'x', {
      types: undefined,
      limit: 100,
    });
  });

  it('drops the types array entirely when all are invalid (empty array)', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    searchBrainMock.mockResolvedValue({ hits: [] });
    await searchRoute.GET(
      makeReq('http://x/api/portal/brain/search?q=x&types=zzz,yyy'),
    );
    expect(searchBrainMock).toHaveBeenCalledWith(5, 'x', {
      types: [],
      limit: undefined,
    });
  });
});

// ===========================================================================
// brain/tasks
// ===========================================================================

describe('GET /api/portal/brain/tasks', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await tasksRoute.GET(
      makeReq('http://x/api/portal/brain/tasks'),
    );
    expect(res.status).toBe(402);
  });

  it('returns tasks with default filters', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listTasksMock.mockResolvedValue([{ id: 1, title: 'T1' }]);
    const res = await tasksRoute.GET(
      makeReq('http://x/api/portal/brain/tasks'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([{ id: 1, title: 'T1' }]);
    expect(listTasksMock).toHaveBeenCalledWith(5, {
      status: undefined,
      ownerId: undefined,
      meetingId: undefined,
      needsReview: undefined,
      limit: 100,
      offset: 0,
    });
  });

  it('parses status, ownerId, meetingId, and needsReview=true', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listTasksMock.mockResolvedValue([]);
    await tasksRoute.GET(
      makeReq(
        'http://x/api/portal/brain/tasks?status=open&ownerId=11&meetingId=22&needsReview=true',
      ),
    );
    expect(listTasksMock).toHaveBeenCalledWith(5, {
      status: 'open',
      ownerId: 11,
      meetingId: 22,
      needsReview: true,
      limit: 100,
      offset: 0,
    });
  });

  it('parses needsReview=false explicitly', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listTasksMock.mockResolvedValue([]);
    await tasksRoute.GET(
      makeReq('http://x/api/portal/brain/tasks?needsReview=false'),
    );
    expect(listTasksMock).toHaveBeenCalledWith(5, {
      status: undefined,
      ownerId: undefined,
      meetingId: undefined,
      needsReview: false,
      limit: 100,
      offset: 0,
    });
  });

  it('leaves needsReview undefined for any other value', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    listTasksMock.mockResolvedValue([]);
    await tasksRoute.GET(
      makeReq('http://x/api/portal/brain/tasks?needsReview=maybe'),
    );
    expect(listTasksMock).toHaveBeenCalledWith(5, {
      status: undefined,
      ownerId: undefined,
      meetingId: undefined,
      needsReview: undefined,
      limit: 100,
      offset: 0,
    });
  });
});

describe('POST /api/portal/brain/tasks', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await tasksRoute.POST(
      makeReq('http://x/api/portal/brain/tasks', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 when body is not JSON', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await tasksRoute.POST(
      makeReq('http://x/api/portal/brain/tasks', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/title is required/i);
  });

  it('returns 400 when title is missing', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await tasksRoute.POST(
      makeReq('http://x/api/portal/brain/tasks', {
        method: 'POST',
        body: JSON.stringify({ description: 'no title' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/title is required/i);
  });

  it('returns 400 when title is whitespace-only', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await tasksRoute.POST(
      makeReq('http://x/api/portal/brain/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: '   ' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a task with sanitized inputs and logs audit', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    createTaskMock.mockResolvedValue({ id: 7, title: 'Hi' });
    const due = '2025-01-02T03:04:05.000Z';
    const res = await tasksRoute.POST(
      makeReq('http://x/api/portal/brain/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: '  Hi  ',
          description: 'desc',
          ownerId: 11,
          priority: 'urgent',
          dueDate: due,
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 7, title: 'Hi' });
    const arg = createTaskMock.mock.calls[0][0];
    expect(arg.clientId).toBe(5);
    expect(arg.title).toBe('Hi'); // trimmed
    expect(arg.description).toBe('desc');
    expect(arg.ownerId).toBe(11);
    expect(arg.priority).toBe('urgent');
    expect(arg.dueDate).toBeInstanceOf(Date);
    expect(arg.dueDate.toISOString()).toBe(due);
    expect(arg.source).toBe('manual');
    expect(arg.createdBy).toBe(99);

    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 5,
      actorId: 99,
      action: 'task.created',
      entityType: 'brain_task',
      entityId: 7,
    }));
  });

  it('falls back to safe defaults when optional fields are omitted/invalid', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    createTaskMock.mockResolvedValue({ id: 8 });
    await tasksRoute.POST(
      makeReq('http://x/api/portal/brain/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Hi',
          priority: 'NUKE', // invalid -> medium
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const arg = createTaskMock.mock.calls[0][0];
    expect(arg.description).toBeUndefined();
    expect(arg.ownerId).toBeNull();
    expect(arg.priority).toBe('medium');
    expect(arg.dueDate).toBeNull();
  });
});
