// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 28b):
 *   - app/api/portal/brain/knowledge/[id]/fields/route.ts           (GET)
 *   - app/api/portal/brain/knowledge/[id]/fields/[fieldId]/route.ts (PATCH)
 *   - app/api/portal/brain/knowledge/[id]/history/route.ts          (GET)
 *   - app/api/portal/brain/knowledge/[id]/restore/route.ts          (POST)
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

const getNoteMock = vi.fn();
const restoreNoteMock = vi.fn();
vi.mock('@/lib/brain/notes', () => ({
  getNote: (...args: unknown[]) => getNoteMock(...args),
  restoreNote: (...args: unknown[]) => restoreNoteMock(...args),
}));

// drizzle-orm helpers — return opaque markers so equality is structural-only.
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
}));

// Schema mock — wraps tables as Proxies returning column placeholders.
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
    brainNotes: wrap('brainNotes'),
    brainCustomFields: wrap('brainCustomFields'),
    brainCustomFieldValues: wrap('brainCustomFieldValues'),
    brainAuditLogs: wrap('brainAuditLogs'),
  };
});

// DB mock — thenable chain backed by FIFO queues per operation.
type Row = Record<string, unknown>;
let selectQueue: Array<Row[]> = [];
let updateQueue: Array<Row[]> = [];
let insertQueue: Array<Row[]> = [];
const deleteCalls: Array<{ table: string }> = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Row[]> | null = null;
    const materialize = (): Promise<Row[]> => {
      if (!materialized) materialized = Promise.resolve(selectQueue.shift() ?? []);
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    const terminal = () => {
      materialize();
      const term: Record<string, unknown> = {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materialized!.then(onF, onR);
        },
        limit: () => term,
        offset: () => term,
        orderBy: () => term,
      };
      return term;
    };
    chain.limit = terminal;
    chain.offset = terminal;
    chain.orderBy = terminal;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate() {
    let materialized: Promise<Row[]> | null = null;
    const materialize = (): Promise<Row[]> => {
      if (!materialized) materialized = Promise.resolve(updateQueue.shift() ?? []);
      return materialized;
    };
    const chain: Record<string, unknown> = {
      set: () => chain,
      where: () => chain,
      returning: () => {
        materialize();
        return {
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return materialized!.then(onF, onR);
          },
        };
      },
    };
    return chain;
  }

  function buildInsert() {
    let materialized: Promise<Row[]> | null = null;
    const materialize = (): Promise<Row[]> => {
      if (!materialized) materialized = Promise.resolve(insertQueue.shift() ?? []);
      return materialized;
    };
    const chain: Record<string, unknown> = {
      values: () => chain,
      returning: () => {
        materialize();
        return {
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return materialized!.then(onF, onR);
          },
        };
      },
    };
    return chain;
  }

  function buildDelete(table: { __table?: string } | undefined) {
    deleteCalls.push({ table: table?.__table ?? 'unknown' });
    const chain: Record<string, unknown> = {
      where: () => Promise.resolve(),
    };
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      update() {
        return buildUpdate();
      },
      insert() {
        return buildInsert();
      },
      delete(table: { __table?: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---- modules under test (loaded AFTER mocks) ----
const fieldsRoute = await import('@/app/api/portal/brain/knowledge/[id]/fields/route');
const fieldRoute = await import('@/app/api/portal/brain/knowledge/[id]/fields/[fieldId]/route');
const historyRoute = await import('@/app/api/portal/brain/knowledge/[id]/history/route');
const restoreRoute = await import('@/app/api/portal/brain/knowledge/[id]/restore/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeIdParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function makeFieldParams(id: string, fieldId: string) {
  return { params: Promise.resolve({ id, fieldId }) };
}

const FAIL_RESPONSE = NextResponse.json(
  { success: false, code: 'BRAIN_NOT_ENTITLED' },
  { status: 402 },
);

beforeEach(() => {
  selectQueue = [];
  updateQueue = [];
  insertQueue = [];
  deleteCalls.length = 0;
  requireBrainEntitlementMock.mockReset();
  getNoteMock.mockReset();
  restoreNoteMock.mockReset();
});

// ===========================================================================
// GET /api/portal/brain/knowledge/[id]/fields
// ===========================================================================

describe('GET /api/portal/brain/knowledge/[id]/fields', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await fieldsRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/1/fields'),
      makeIdParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric note id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    const res = await fieldsRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/abc/fields'),
      makeIdParams('abc'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid note id/i);
  });

  it('returns 404 when the note does not belong to the client', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    // First select (tenant guard) returns no rows.
    selectQueue.push([]);
    const res = await fieldsRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/42/fields'),
      makeIdParams('42'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/not found/i);
  });

  it('returns items combining definitions with their current values', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    // Tenant guard: note exists.
    selectQueue.push([{ id: 42 }]);
    // Definitions (note-scoped).
    selectQueue.push([
      {
        id: 100,
        fieldName: 'priority',
        fieldLabel: 'Priority',
        fieldType: 'select',
        options: ['low', 'high'],
        required: true,
        category: 'workflow',
        sortOrder: 1,
        source: 'manual',
      },
      {
        id: 101,
        fieldName: 'owner',
        // fieldLabel is null — should fall back to fieldName.
        fieldLabel: null,
        fieldType: 'text',
        options: null,
        required: false,
        category: null,
        sortOrder: 2,
        source: 'auto',
      },
    ]);
    // Values for this note (only one matches def 100).
    selectQueue.push([
      { id: 9001, customFieldId: 100, value: 'high' },
    ]);

    const res = await fieldsRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/42/fields'),
      makeIdParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([
      {
        definition: {
          id: 100,
          fieldName: 'priority',
          fieldLabel: 'Priority',
          fieldType: 'select',
          options: ['low', 'high'],
          required: true,
          category: 'workflow',
          sortOrder: 1,
          source: 'manual',
        },
        value: 'high',
        valueId: 9001,
      },
      {
        definition: {
          id: 101,
          fieldName: 'owner',
          fieldLabel: 'owner', // fell back from fieldName
          fieldType: 'text',
          options: null,
          required: false,
          category: null,
          sortOrder: 2,
          source: 'auto',
        },
        value: null,
        valueId: null,
      },
    ]);
  });

  it('returns an empty items array when no definitions exist', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    selectQueue.push([{ id: 42 }]); // tenant guard ok
    selectQueue.push([]);           // no defs
    selectQueue.push([]);           // no values
    const res = await fieldsRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/42/fields'),
      makeIdParams('42'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.items).toEqual([]);
  });
});

// ===========================================================================
// PATCH /api/portal/brain/knowledge/[id]/fields/[fieldId]
// ===========================================================================

describe('PATCH /api/portal/brain/knowledge/[id]/fields/[fieldId]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: '{}',
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric note id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/abc/fields/2', {
        method: 'PATCH',
        body: '{}',
      }),
      makeFieldParams('abc', '2'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid id/i);
  });

  it('returns 400 for a non-numeric field id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/zzz', {
        method: 'PATCH',
        body: '{}',
      }),
      makeFieldParams('1', 'zzz'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the note does not belong to the client', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([]); // note tenant guard fails
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: 'x' }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/not found/i);
  });

  it('returns 404 when the field definition does not belong to the client', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]); // note ok
    selectQueue.push([]);          // def missing
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: 'x' }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/field not found/i);
  });

  it('returns 400 when body is not JSON', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]);          // note ok
    selectQueue.push([{ id: 2 }]);          // def ok
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid body/i);
  });

  it('clears the value (deletes the row) when body.value is null and a row exists', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]);                                  // note
    selectQueue.push([{ id: 2 }]);                                  // def
    selectQueue.push([{ id: 9001, customFieldId: 2, value: 'old' }]); // existing
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: null }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ value: null });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('brainCustomFieldValues');
  });

  it('returns null value (no delete) when body.value is null and no row exists', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]); // note
    selectQueue.push([{ id: 2 }]); // def
    selectQueue.push([]);          // no existing value row
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: null }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ value: null });
    expect(deleteCalls).toHaveLength(0);
  });

  it('returns 413 when the value exceeds the 50k cap', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]); // note
    selectQueue.push([{ id: 2 }]); // def
    const big = 'a'.repeat(50_001);
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: big }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).message).toMatch(/too large/i);
  });

  it('updates the existing value row and returns the updated row', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]); // note
    selectQueue.push([{ id: 2 }]); // def
    selectQueue.push([{ id: 9001, customFieldId: 2, value: 'old' }]); // existing
    updateQueue.push([{ id: 9001, value: 'new' }]);
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: 'new' }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ value: 'new', valueId: 9001 });
  });

  it('inserts a new value row when none existed', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]); // note
    selectQueue.push([{ id: 2 }]); // def
    selectQueue.push([]);          // no existing
    insertQueue.push([{ id: 9001, value: 'created' }]);
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: 'created' }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ value: 'created', valueId: 9001 });
  });

  it('coerces a non-string scalar value to a string', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]); // note
    selectQueue.push([{ id: 2 }]); // def
    selectQueue.push([]);          // no existing
    insertQueue.push([{ id: 9001, value: '42' }]);
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: 42 }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ value: '42', valueId: 9001 });
  });

  it('JSON-stringifies an object value', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    selectQueue.push([{ id: 1 }]); // note
    selectQueue.push([{ id: 2 }]); // def
    selectQueue.push([]);          // no existing
    insertQueue.push([{ id: 9002, value: '{"a":1}' }]);
    const res = await fieldRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1/fields/2', {
        method: 'PATCH',
        body: JSON.stringify({ value: { a: 1 } }),
        headers: { 'content-type': 'application/json' },
      }),
      makeFieldParams('1', '2'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.value).toBe('{"a":1}');
  });
});

// ===========================================================================
// GET /api/portal/brain/knowledge/[id]/history
// ===========================================================================

describe('GET /api/portal/brain/knowledge/[id]/history', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await historyRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/1/history'),
      makeIdParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric note id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    const res = await historyRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/abc/history'),
      makeIdParams('abc'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid note id/i);
  });

  it('returns 404 when the note is not found for the tenant', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getNoteMock.mockResolvedValue(null);
    const res = await historyRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/42/history'),
      makeIdParams('42'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/not found/i);
    expect(getNoteMock).toHaveBeenCalledWith(5, 42);
  });

  it('returns audit log rows for the note', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getNoteMock.mockResolvedValue({ id: 42, title: 'A' });
    selectQueue.push([
      { id: 1, action: 'updated', entityId: 42 },
      { id: 2, action: 'created', entityId: 42 },
    ]);
    const res = await historyRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/42/history'),
      makeIdParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([
      { id: 1, action: 'updated', entityId: 42 },
      { id: 2, action: 'created', entityId: 42 },
    ]);
  });

  it('returns an empty array when no audit rows exist', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getNoteMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]);
    const res = await historyRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/42/history'),
      makeIdParams('42'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.items).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/brain/knowledge/[id]/restore
// ===========================================================================

describe('POST /api/portal/brain/knowledge/[id]/restore', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await restoreRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/1/restore', { method: 'POST' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 for a non-numeric note id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await restoreRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/zzz/restore', { method: 'POST' }),
      makeIdParams('zzz'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid note id/i);
  });

  it('returns 404 when restoreNote returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 9,
      role: 'write',
    });
    restoreNoteMock.mockResolvedValue(null);
    const res = await restoreRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/42/restore', { method: 'POST' }),
      makeIdParams('42'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/not found/i);
    expect(restoreNoteMock).toHaveBeenCalledWith(5, 42, 9);
  });

  it('returns the fresh getNote result on success', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 9,
      role: 'write',
    });
    restoreNoteMock.mockResolvedValue({ id: 42, title: 'restored' });
    getNoteMock.mockResolvedValue({ id: 42, title: 'restored-fresh' });
    const res = await restoreRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/42/restore', { method: 'POST' }),
      makeIdParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 42, title: 'restored-fresh' });
  });

  it('falls back to the restored payload when getNote returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 9,
      role: 'write',
    });
    restoreNoteMock.mockResolvedValue({ id: 42, title: 'restored' });
    getNoteMock.mockResolvedValue(null);
    const res = await restoreRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/42/restore', { method: 'POST' }),
      makeIdParams('42'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: 42, title: 'restored' });
  });
});
