// @vitest-environment node
/**
 * Unit tests for shipping zone / shipping rate routes (batch 34c).
 *
 * Routes under test:
 *   1. app/api/portal/websites/[siteId]/store/shipping/route.ts
 *        - GET   list zones (with rates)
 *        - POST  create zone
 *   2. app/api/portal/websites/[siteId]/store/shipping/[zoneId]/route.ts
 *        - PUT     update zone
 *        - DELETE  delete zone
 *   3. app/api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/route.ts
 *        - GET    list rates for a zone
 *        - POST   create rate
 *   4. app/api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/[rateId]/route.ts
 *        - PUT     update rate
 *        - DELETE  delete rate
 *
 * Everything underneath the routes is mocked: auth, resolveClientSite, the
 * @/lib/db fluent builder (select / insert / update / delete), schema column
 * refs, drizzle helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) => {
    const target: Record<string, unknown> = {
      __table: name,
      __isTable: true,
      $inferSelect: {},
    };
    return new Proxy(target, {
      get(t: Record<string, unknown>, prop: string) {
        if (prop === '__table') return name;
        if (prop === '__isTable') return true;
        if (prop === '$inferSelect') return t.$inferSelect;
        if (prop === 'then') return undefined;
        if (typeof prop === 'symbol') return undefined;
        return { __col: prop, __table: name };
      },
    });
  };
  return {
    shippingZones: wrap('shippingZones'),
    shippingRates: wrap('shippingRates'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {
      join: (parts: unknown[], sep: unknown) => ({
        __sqlJoin: true,
        parts,
        sep,
      }),
    },
  ),
}));

// ---- in-memory state ----

interface State {
  shippingZones: Array<Record<string, unknown>>;
  shippingRates: Array<Record<string, unknown>>;
  nextZoneId: number;
  nextRateId: number;
}

const state: State = {
  shippingZones: [],
  shippingRates: [],
  nextZoneId: 1,
  nextRateId: 1,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'shippingZones':
      return state.shippingZones;
    case 'shippingRates':
      return state.shippingRates;
    default:
      return [];
  }
}

function collectSqlIds(filter: unknown): unknown[] {
  const ids: unknown[] = [];
  const visit = (v: unknown) => {
    if (v == null) return;
    if (typeof v !== 'object') {
      ids.push(v);
      return;
    }
    if ((v as { __sqlJoin?: boolean }).__sqlJoin) {
      const parts = (v as { parts?: unknown[] }).parts ?? [];
      for (const p of parts) visit(p);
    } else if ((v as { __sql?: boolean }).__sql) {
      const inner = (v as { values?: unknown[] }).values ?? [];
      for (const p of inner) visit(p);
    } else if ((v as { __col?: string }).__col) {
      // column reference — ignore here
    } else {
      ids.push(v);
    }
  };
  const root = filter as { values?: unknown[] } | undefined;
  for (const v of root?.values ?? []) visit(v);
  return ids;
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    __sql?: boolean;
  };
  if (f.__sql) {
    const ids = collectSqlIds(filter);
    if (ids.length === 0) return true;
    if ('zoneId' in row) return ids.includes(row.zoneId);
    return true;
  }
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect(_projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) =>
        evalPredicate(filter, r),
      );
      if (typeof limitVal === 'number') rows = rows.slice(0, limitVal);
      return Promise.resolve(rows.map((r) => ({ ...r })));
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limitVal = n;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: unknown) {
        const arr = tableArray(table.__table);
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const v of list) {
          const row: Record<string, unknown> = {
            ...(v as Record<string, unknown>),
          };
          if (table.__table === 'shippingZones') {
            row.id = state.nextZoneId++;
            row.createdAt = new Date('2026-03-01T00:00:00Z');
            row.updatedAt = new Date('2026-03-01T00:00:00Z');
          } else if (table.__table === 'shippingRates') {
            row.id = state.nextRateId++;
            row.createdAt = new Date('2026-03-01T00:00:00Z');
            row.updatedAt = new Date('2026-03-01T00:00:00Z');
          }
          arr.push(row);
          inserted.push(row);
        }
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setData: Record<string, unknown> = {};
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      set(data: Record<string, unknown>) {
        setData = data;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      returning() {
        const arr = tableArray(table.__table);
        const updated: Array<Record<string, unknown>> = [];
        for (const r of arr) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setData);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated);
      },
    };
    return chain;
  }

  function buildDelete(table: { __table: string }) {
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        const arr = tableArray(table.__table);
        for (let i = arr.length - 1; i >= 0; i--) {
          if (evalPredicate(filter, arr[i])) arr.splice(i, 1);
        }
        return Promise.resolve(undefined).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
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
// Modules under test
// ---------------------------------------------------------------------------

const shippingListMod = await import(
  '@/app/api/portal/websites/[siteId]/store/shipping/route'
);
const zoneMod = await import(
  '@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/route'
);
const ratesListMod = await import(
  '@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/route'
);
const rateMod = await import(
  '@/app/api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/[rateId]/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(method: string, url: string, body?: unknown): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

function siteCtx(siteId = '1') {
  return { params: Promise.resolve({ siteId }) };
}

function zoneCtx(siteId = '1', zoneId = '1') {
  return { params: Promise.resolve({ siteId, zoneId }) };
}

function rateCtx(siteId = '1', zoneId = '1', rateId = '1') {
  return { params: Promise.resolve({ siteId, zoneId, rateId }) };
}

beforeEach(() => {
  state.shippingZones.length = 0;
  state.shippingRates.length = 0;
  state.nextZoneId = 1;
  state.nextRateId = 1;

  authMock.mockReset();
  resolveClientSiteMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  resolveClientSiteMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// /api/portal/websites/[siteId]/store/shipping
// ---------------------------------------------------------------------------

describe('GET /api/portal/websites/[siteId]/store/shipping', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await shippingListMod.GET(
      makeReq('GET', 'http://x/shipping'),
      siteCtx(),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await shippingListMod.GET(
      makeReq('GET', 'http://x/shipping'),
      siteCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await shippingListMod.GET(
      makeReq('GET', 'http://x/shipping'),
      siteCtx(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns empty list when no zones exist', async () => {
    const res = await shippingListMod.GET(
      makeReq('GET', 'http://x/shipping'),
      siteCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns zones scoped to website with their rates attached', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Domestic',
      countries: ['US'],
      states: ['CA'],
      active: true,
      createdAt: new Date('2026-02-01'),
    });
    state.shippingZones.push({
      id: 2,
      websiteId: 10,
      name: 'Intl',
      countries: ['CA'],
      states: [],
      active: true,
      createdAt: new Date('2026-02-02'),
    });
    // Different website — should be excluded
    state.shippingZones.push({
      id: 3,
      websiteId: 999,
      name: 'Other site',
      countries: [],
      states: [],
      active: true,
      createdAt: new Date('2026-02-03'),
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 1,
      name: 'Standard',
      rateType: 'flat',
      price: 500,
      createdAt: new Date('2026-02-01'),
    });
    state.shippingRates.push({
      id: 2,
      zoneId: 1,
      name: 'Express',
      rateType: 'flat',
      price: 1500,
      createdAt: new Date('2026-02-02'),
    });
    state.shippingRates.push({
      id: 3,
      zoneId: 2,
      name: 'Intl Std',
      rateType: 'flat',
      price: 2500,
      createdAt: new Date('2026-02-01'),
    });

    const res = await shippingListMod.GET(
      makeReq('GET', 'http://x/shipping'),
      siteCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    const z1 = body.data.find((z: { id: number }) => z.id === 1);
    const z2 = body.data.find((z: { id: number }) => z.id === 2);
    expect(z1.rates).toHaveLength(2);
    expect(z2.rates).toHaveLength(1);
    expect(z2.rates[0].name).toBe('Intl Std');
  });

  it('returns zones with empty rates array when no rates exist', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Only zone',
      countries: [],
      states: [],
      active: true,
      createdAt: new Date('2026-02-01'),
    });
    const res = await shippingListMod.GET(
      makeReq('GET', 'http://x/shipping'),
      siteCtx(),
    );
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].rates).toEqual([]);
  });
});

describe('POST /api/portal/websites/[siteId]/store/shipping', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await shippingListMod.POST(
      makeReq('POST', 'http://x/shipping', { name: 'Z' }),
      siteCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await shippingListMod.POST(
      makeReq('POST', 'http://x/shipping', { name: 'Z' }),
      siteCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await shippingListMod.POST(
      makeReq('POST', 'http://x/shipping', { name: 'Z' }),
      siteCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    const res = await shippingListMod.POST(
      makeReq('POST', 'http://x/shipping', {}),
      siteCtx(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('name is required');
  });

  it('creates a zone with defaults when only name is provided', async () => {
    const res = await shippingListMod.POST(
      makeReq('POST', 'http://x/shipping', { name: 'New Zone' }),
      siteCtx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.websiteId).toBe(10);
    expect(body.data.name).toBe('New Zone');
    expect(body.data.countries).toEqual([]);
    expect(body.data.states).toEqual([]);
    expect(body.data.active).toBe(true);
    expect(body.data.rates).toEqual([]);
  });

  it('persists provided countries, states, and active=false', async () => {
    const res = await shippingListMod.POST(
      makeReq('POST', 'http://x/shipping', {
        name: 'EU',
        countries: ['DE', 'FR'],
        states: ['BY'],
        active: false,
      }),
      siteCtx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.countries).toEqual(['DE', 'FR']);
    expect(body.data.states).toEqual(['BY']);
    expect(body.data.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /api/portal/websites/[siteId]/store/shipping/[zoneId]
// ---------------------------------------------------------------------------

describe('PUT /api/portal/websites/[siteId]/store/shipping/[zoneId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await zoneMod.PUT(
      makeReq('PUT', 'http://x/zone', { name: 'X' }),
      zoneCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await zoneMod.PUT(
      makeReq('PUT', 'http://x/zone', { name: 'X' }),
      zoneCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await zoneMod.PUT(
      makeReq('PUT', 'http://x/zone', { name: 'X' }),
      zoneCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when zone does not belong to website', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 999,
      name: 'Other',
      countries: [],
      states: [],
      active: true,
    });
    const res = await zoneMod.PUT(
      makeReq('PUT', 'http://x/zone', { name: 'X' }),
      zoneCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('updates supplied fields and leaves others intact', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Original',
      countries: ['US'],
      states: ['CA'],
      active: true,
    });
    const res = await zoneMod.PUT(
      makeReq('PUT', 'http://x/zone', {
        name: 'Renamed',
        countries: ['US', 'CA'],
        states: ['NY'],
        active: false,
      }),
      zoneCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Renamed');
    expect(body.data.countries).toEqual(['US', 'CA']);
    expect(body.data.states).toEqual(['NY']);
    expect(body.data.active).toBe(false);
    expect(typeof body.data.updatedAt).toBe('string');
    expect(new Date(body.data.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('handles empty body (only updatedAt set)', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Keep',
      countries: ['US'],
      states: [],
      active: true,
    });
    const res = await zoneMod.PUT(
      makeReq('PUT', 'http://x/zone', {}),
      zoneCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Keep');
    expect(body.data.countries).toEqual(['US']);
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/shipping/[zoneId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await zoneMod.DELETE(
      makeReq('DELETE', 'http://x/zone'),
      zoneCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await zoneMod.DELETE(
      makeReq('DELETE', 'http://x/zone'),
      zoneCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await zoneMod.DELETE(
      makeReq('DELETE', 'http://x/zone'),
      zoneCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when zone does not belong to website', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 999,
      name: 'Other',
      countries: [],
      states: [],
      active: true,
    });
    const res = await zoneMod.DELETE(
      makeReq('DELETE', 'http://x/zone'),
      zoneCtx(),
    );
    expect(res.status).toBe(404);
    expect(state.shippingZones).toHaveLength(1);
  });

  it('deletes a zone that belongs to the website', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Bye',
      countries: [],
      states: [],
      active: true,
    });
    const res = await zoneMod.DELETE(
      makeReq('DELETE', 'http://x/zone'),
      zoneCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Shipping zone deleted');
    expect(state.shippingZones).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// /api/portal/websites/[siteId]/store/shipping/[zoneId]/rates
// ---------------------------------------------------------------------------

describe('GET /api/portal/websites/[siteId]/store/shipping/[zoneId]/rates', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await ratesListMod.GET(
      makeReq('GET', 'http://x/rates'),
      zoneCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await ratesListMod.GET(
      makeReq('GET', 'http://x/rates'),
      zoneCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await ratesListMod.GET(
      makeReq('GET', 'http://x/rates'),
      zoneCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when zone does not belong to website', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 999,
      name: 'Other site zone',
      countries: [],
      states: [],
      active: true,
    });
    const res = await ratesListMod.GET(
      makeReq('GET', 'http://x/rates'),
      zoneCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns rates scoped to the zone in createdAt order', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingZones.push({
      id: 2,
      websiteId: 10,
      name: 'Z2',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 1,
      name: 'A',
      rateType: 'flat',
      price: 100,
      createdAt: new Date('2026-02-01'),
    });
    state.shippingRates.push({
      id: 2,
      zoneId: 1,
      name: 'B',
      rateType: 'flat',
      price: 200,
      createdAt: new Date('2026-02-02'),
    });
    state.shippingRates.push({
      id: 3,
      zoneId: 2,
      name: 'OtherZone',
      rateType: 'flat',
      price: 999,
      createdAt: new Date('2026-02-03'),
    });

    const res = await ratesListMod.GET(
      makeReq('GET', 'http://x/rates'),
      zoneCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data.map((r: { name: string }) => r.name)).toEqual(['A', 'B']);
  });

  it('returns empty list when zone has no rates', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Empty',
      countries: [],
      states: [],
      active: true,
    });
    const res = await ratesListMod.GET(
      makeReq('GET', 'http://x/rates'),
      zoneCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe('POST /api/portal/websites/[siteId]/store/shipping/[zoneId]/rates', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await ratesListMod.POST(
      makeReq('POST', 'http://x/rates', { name: 'R' }),
      zoneCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await ratesListMod.POST(
      makeReq('POST', 'http://x/rates', { name: 'R' }),
      zoneCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await ratesListMod.POST(
      makeReq('POST', 'http://x/rates', { name: 'R' }),
      zoneCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when zone does not belong to website', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 999,
      name: 'Other',
      countries: [],
      states: [],
      active: true,
    });
    const res = await ratesListMod.POST(
      makeReq('POST', 'http://x/rates', { name: 'R' }),
      zoneCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    const res = await ratesListMod.POST(
      makeReq('POST', 'http://x/rates', {}),
      zoneCtx(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('name is required');
  });

  it('creates a rate with defaults when only name is provided', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    const res = await ratesListMod.POST(
      makeReq('POST', 'http://x/rates', { name: 'Standard' }),
      zoneCtx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.zoneId).toBe(1);
    expect(body.data.name).toBe('Standard');
    expect(body.data.rateType).toBe('flat');
    expect(body.data.price).toBe(0);
    expect(body.data.weightTiers).toBeNull();
    expect(body.data.freeAbove).toBeNull();
    expect(body.data.minDeliveryDays).toBeNull();
    expect(body.data.maxDeliveryDays).toBeNull();
    expect(body.data.active).toBe(true);
  });

  it('coerces numeric strings and persists weightTiers/active=false', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    const res = await ratesListMod.POST(
      makeReq('POST', 'http://x/rates', {
        name: 'Tiered',
        rateType: 'weight',
        price: '1500',
        weightTiers: [{ maxWeight: 100, price: 100 }],
        freeAbove: '5000',
        minDeliveryDays: '2',
        maxDeliveryDays: '5',
        active: false,
      }),
      zoneCtx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.rateType).toBe('weight');
    expect(body.data.price).toBe(1500);
    expect(body.data.weightTiers).toEqual([{ maxWeight: 100, price: 100 }]);
    expect(body.data.freeAbove).toBe(5000);
    expect(body.data.minDeliveryDays).toBe(2);
    expect(body.data.maxDeliveryDays).toBe(5);
    expect(body.data.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/[rateId]
// ---------------------------------------------------------------------------

describe('PUT /api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/[rateId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', { name: 'X' }),
      rateCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', { name: 'X' }),
      rateCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', { name: 'X' }),
      rateCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when zone does not belong to website', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 999,
      name: 'Other',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 1,
      name: 'R',
      rateType: 'flat',
      price: 1,
      active: true,
    });
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', { name: 'X' }),
      rateCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when rate does not exist within the zone', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    // No rates
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', { name: 'X' }),
      rateCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when rate belongs to a different zone', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 99,
      name: 'WrongZone',
      rateType: 'flat',
      price: 1,
      active: true,
    });
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', { name: 'X' }),
      rateCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('updates all supplied fields and coerces numbers', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 1,
      name: 'Original',
      rateType: 'flat',
      price: 100,
      weightTiers: null,
      freeAbove: null,
      minDeliveryDays: null,
      maxDeliveryDays: null,
      active: true,
    });
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', {
        name: 'Renamed',
        rateType: 'weight',
        price: '999',
        weightTiers: [{ maxWeight: 50, price: 200 }],
        freeAbove: '10000',
        minDeliveryDays: '1',
        maxDeliveryDays: '3',
        active: false,
      }),
      rateCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Renamed');
    expect(body.data.rateType).toBe('weight');
    expect(body.data.price).toBe(999);
    expect(body.data.weightTiers).toEqual([{ maxWeight: 50, price: 200 }]);
    expect(body.data.freeAbove).toBe(10000);
    expect(body.data.minDeliveryDays).toBe(1);
    expect(body.data.maxDeliveryDays).toBe(3);
    expect(body.data.active).toBe(false);
  });

  it('handles null values for nullable numeric fields', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 1,
      name: 'R',
      rateType: 'flat',
      price: 100,
      freeAbove: 5000,
      minDeliveryDays: 2,
      maxDeliveryDays: 5,
      active: true,
    });
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', {
        freeAbove: null,
        minDeliveryDays: null,
        maxDeliveryDays: null,
      }),
      rateCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.freeAbove).toBeNull();
    expect(body.data.minDeliveryDays).toBeNull();
    expect(body.data.maxDeliveryDays).toBeNull();
  });

  it('handles an empty body — leaves the row unchanged', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 1,
      name: 'Untouched',
      rateType: 'flat',
      price: 250,
      active: true,
    });
    const res = await rateMod.PUT(
      makeReq('PUT', 'http://x/rate', {}),
      rateCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Untouched');
    expect(body.data.price).toBe(250);
  });
});

describe('DELETE /api/portal/websites/[siteId]/store/shipping/[zoneId]/rates/[rateId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await rateMod.DELETE(
      makeReq('DELETE', 'http://x/rate'),
      rateCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await rateMod.DELETE(
      makeReq('DELETE', 'http://x/rate'),
      rateCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await rateMod.DELETE(
      makeReq('DELETE', 'http://x/rate'),
      rateCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when zone does not belong to website', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 999,
      name: 'Other',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 1,
      name: 'R',
      rateType: 'flat',
      price: 1,
      active: true,
    });
    const res = await rateMod.DELETE(
      makeReq('DELETE', 'http://x/rate'),
      rateCtx(),
    );
    expect(res.status).toBe(404);
    expect(state.shippingRates).toHaveLength(1);
  });

  it('returns 404 when rate does not exist within the zone', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    const res = await rateMod.DELETE(
      makeReq('DELETE', 'http://x/rate'),
      rateCtx(),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the rate when zone and rate both match', async () => {
    state.shippingZones.push({
      id: 1,
      websiteId: 10,
      name: 'Z',
      countries: [],
      states: [],
      active: true,
    });
    state.shippingRates.push({
      id: 1,
      zoneId: 1,
      name: 'Bye',
      rateType: 'flat',
      price: 100,
      active: true,
    });
    state.shippingRates.push({
      id: 2,
      zoneId: 1,
      name: 'Stay',
      rateType: 'flat',
      price: 200,
      active: true,
    });
    const res = await rateMod.DELETE(
      makeReq('DELETE', 'http://x/rate'),
      rateCtx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Shipping rate deleted');
    expect(state.shippingRates).toHaveLength(1);
    expect(state.shippingRates[0].name).toBe('Stay');
  });
});
