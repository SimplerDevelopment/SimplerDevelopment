// @vitest-environment node
/**
 * Unit tests for four API routes (batch 27b):
 *   - app/api/admin/portal/suggested-projects/[id]/route.ts  (PATCH, DELETE)
 *   - app/api/admin/portal/websites/[id]/route.ts            (GET, PATCH, DELETE)
 *   - app/api/branding/[websiteId]/route.ts                  (GET)
 *   - app/api/categories/route.ts                            (GET, POST)
 *
 * Strategy: mock @/lib/auth, drizzle-orm helpers, @/lib/db/schema, @/lib/db,
 * and @/lib/branding so handlers run in isolation. Admin routes gate on a
 * requireStaff() helper (session.user.role === 'admin' | 'employee').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    suggestedProjects: wrap('suggestedProjects'),
    clientWebsites: wrap('clientWebsites'),
    categories: wrap('categories'),
    storeSettings: wrap('storeSettings'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: thenable select + update/delete/insert builders w/ result queues
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];

const updateCalls: Array<{
  table: string;
  set: Record<string, unknown>;
  where: unknown;
}> = [];
const deleteCalls: Array<{ table: string; where: unknown }> = [];
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> =
  [];

let nextSelectThrows: Error | null = null;
let nextInsertThrows: Error | null = null;

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null =
      null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        if (nextSelectThrows) {
          const err = nextSelectThrows;
          nextSelectThrows = null;
          materializedPromise = Promise.reject(err);
        } else {
          materializedPromise = Promise.resolve(selectQueue.shift() ?? []);
        }
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'rightJoin',
      'where',
      'groupBy',
      'orderBy',
      '$dynamic',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      set(values: Record<string, unknown>) {
        return {
          where(w: unknown) {
            updateCalls.push({ table: tableName, set: values, where: w });
            return {
              returning() {
                const rows = updateReturnQueue.shift() ?? [];
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
            };
          },
        };
      },
    };
  }

  function buildDelete(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      where(w: unknown) {
        deleteCalls.push({ table: tableName, where: w });
        const rows = deleteReturnQueue.shift() ?? [];
        const result: Record<string, unknown> & PromiseLike<unknown> = {
          rowCount: rows.length,
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve({ rowCount: rows.length }).then(onF, onR);
          },
          returning() {
            return Promise.resolve(rows);
          },
        } as Record<string, unknown> & PromiseLike<unknown>;
        return result;
      },
    };
  }

  function buildInsert(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      values(values: Record<string, unknown>) {
        insertCalls.push({ table: tableName, values });
        return {
          returning() {
            if (nextInsertThrows) {
              const err = nextInsertThrows;
              nextInsertThrows = null;
              return Promise.reject(err);
            }
            const rows = insertReturnQueue.shift() ?? [];
            return Promise.resolve(rows.map((r) => ({ ...r })));
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
      update(table: { __table?: string } | undefined) {
        return buildUpdate(table);
      },
      delete(table: { __table?: string } | undefined) {
        return buildDelete(table);
      },
      insert(table: { __table?: string } | undefined) {
        return buildInsert(table);
      },
    },
  };
});

// Mock the branding lib for the public /api/branding/[websiteId] route.
const getBrandingByWebsiteIdMock = vi.fn();
const brandingToCssVarsMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandingByWebsiteId: (id: number) => getBrandingByWebsiteIdMock(id),
  brandingToCssVars: (b: unknown) => brandingToCssVarsMock(b),
}));

// ---------------------------------------------------------------------------
// Modules under test (after mocks)
// ---------------------------------------------------------------------------

const suggestedProjectsRoute = await import(
  '@/app/api/admin/portal/suggested-projects/[id]/route'
);
const websitesRoute = await import('@/app/api/admin/portal/websites/[id]/route');
const brandingRoute = await import('@/app/api/branding/[websiteId]/route');
const categoriesRoute = await import('@/app/api/categories/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams<K extends string>(p: Record<K, string>) {
  return { params: Promise.resolve(p) };
}

const ADMIN_SESSION = { user: { id: '1', name: 'Admin', role: 'admin' } };
const EMPLOYEE_SESSION = {
  user: { id: '2', name: 'Employee', role: 'employee' },
};
const CLIENT_SESSION = { user: { id: '3', name: 'Client', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertReturnQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  insertCalls.length = 0;
  nextSelectThrows = null;
  nextInsertThrows = null;
  authMock.mockReset();
  getBrandingByWebsiteIdMock.mockReset();
  brandingToCssVarsMock.mockReset();
});

// ===========================================================================
// /api/admin/portal/suggested-projects/[id]  (PATCH, DELETE)
// ===========================================================================

describe('PATCH /api/admin/portal/suggested-projects/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await suggestedProjectsRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', { title: 'X' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await suggestedProjectsRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', {}),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff roles', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await suggestedProjectsRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', {}),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is undefined', async () => {
    authMock.mockResolvedValue({ user: { id: '99' } });
    const res = await suggestedProjectsRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', {}),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no row is updated', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturnQueue.push([]);
    const res = await suggestedProjectsRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', { title: 'New' }),
      makeParams({ id: '42' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Not found' });
  });

  it('updates a suggested project for an admin and returns the row', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturnQueue.push([
      { id: 7, title: 'Updated', description: 'Desc', active: true },
    ]);
    const res = await suggestedProjectsRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', {
        title: 'Updated',
        description: 'Desc',
        category: 'web',
        estimatedPrice: '1000',
        estimatedTimeline: '2 weeks',
        features: ['a', 'b'],
        icon: 'rocket',
        active: true,
        clientId: 5,
        order: 1,
        surveyFields: [{ name: 'q1' }],
      }),
      makeParams({ id: '7' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(7);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('suggestedProjects');
    // All provided fields should be in the set payload + updatedAt.
    expect(updateCalls[0].set).toMatchObject({
      title: 'Updated',
      description: 'Desc',
      category: 'web',
      estimatedPrice: '1000',
      estimatedTimeline: '2 weeks',
      features: ['a', 'b'],
      icon: 'rocket',
      active: true,
      clientId: 5,
      order: 1,
      surveyFields: [{ name: 'q1' }],
    });
    expect(updateCalls[0].set.updatedAt).toBeInstanceOf(Date);
  });

  it('omits fields that are not in the body (partial update)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    updateReturnQueue.push([{ id: 9, title: 'Only Title' }]);
    const res = await suggestedProjectsRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', { title: 'Only Title' }),
      makeParams({ id: '9' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].set).toEqual(
      expect.objectContaining({ title: 'Only Title' }),
    );
    expect(updateCalls[0].set).not.toHaveProperty('description');
    expect(updateCalls[0].set).not.toHaveProperty('icon');
  });
});

describe('DELETE /api/admin/portal/suggested-projects/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await suggestedProjectsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff roles', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await suggestedProjectsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('deletes the row for an admin', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await suggestedProjectsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      makeParams({ id: '11' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('suggestedProjects');
  });

  it('deletes the row for an employee', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    const res = await suggestedProjectsRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      makeParams({ id: '12' }),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
  });
});

// ===========================================================================
// /api/admin/portal/websites/[id]  (GET, PATCH, DELETE)
// ===========================================================================

describe('GET /api/admin/portal/websites/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await websitesRoute.GET(
      makeReq('http://x'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff roles', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await websitesRoute.GET(
      makeReq('http://x'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site is not found', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]);
    const res = await websitesRoute.GET(
      makeReq('http://x'),
      makeParams({ id: '404' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Not found' });
  });

  it('returns site data for admin', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      { id: 3, name: 'Acme', domain: 'acme.test', active: true },
    ]);
    // second select: loadStoreSettings → no row
    selectQueue.push([]);
    const res = await websitesRoute.GET(
      makeReq('http://x'),
      makeParams({ id: '3' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      id: 3,
      name: 'Acme',
      domain: 'acme.test',
      active: true,
      storeSettings: {
        stripeByokAllowed: false,
        stripeMode: 'connect',
        stripeSecretKeyConfigured: false,
        stripeOnboardingComplete: false,
        hasStoreSettingsRow: false,
      },
    });
  });

  it('returns site data for employee', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 4, name: 'Beta' }]);
    // second select: loadStoreSettings → no row
    selectQueue.push([]);
    const res = await websitesRoute.GET(
      makeReq('http://x'),
      makeParams({ id: '4' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Beta');
  });
});

describe('PATCH /api/admin/portal/websites/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await websitesRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', { name: 'X' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff roles', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await websitesRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', { name: 'X' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no row is updated', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturnQueue.push([]);
    const res = await websitesRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', { name: 'X' }),
      makeParams({ id: '99' }),
    );
    expect(res.status).toBe(404);
  });

  it('updates name/domain/description/active for an admin', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturnQueue.push([
      {
        id: 1,
        name: 'New',
        domain: 'new.test',
        description: 'desc',
        active: false,
      },
    ]);
    const res = await websitesRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', {
        name: 'New',
        domain: 'new.test',
        description: 'desc',
        active: false,
      }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('clientWebsites');
    expect(updateCalls[0].set).toMatchObject({
      name: 'New',
      domain: 'new.test',
      description: 'desc',
      active: false,
    });
    expect(updateCalls[0].set.updatedAt).toBeInstanceOf(Date);
  });

  it('coerces empty string domain/description to null', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    updateReturnQueue.push([{ id: 2, name: 'N', domain: null, description: null }]);
    await websitesRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', {
        name: 'N',
        domain: '',
        description: '',
      }),
      makeParams({ id: '2' }),
    );
    expect(updateCalls[0].set.domain).toBeNull();
    expect(updateCalls[0].set.description).toBeNull();
  });

  it('omits fields not present in the body', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturnQueue.push([{ id: 3, name: 'Only Name' }]);
    await websitesRoute.PATCH(
      makeJsonReq('http://x', 'PATCH', { name: 'Only Name' }),
      makeParams({ id: '3' }),
    );
    expect(updateCalls[0].set).toEqual(
      expect.objectContaining({ name: 'Only Name' }),
    );
    expect(updateCalls[0].set).not.toHaveProperty('domain');
    expect(updateCalls[0].set).not.toHaveProperty('description');
    expect(updateCalls[0].set).not.toHaveProperty('active');
  });
});

describe('DELETE /api/admin/portal/websites/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await websitesRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff roles', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await websitesRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('deletes the row for an admin', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await websitesRoute.DELETE(
      makeReq('http://x', { method: 'DELETE' }),
      makeParams({ id: '15' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('clientWebsites');
  });
});

// ===========================================================================
// /api/branding/[websiteId]  (GET)
// ===========================================================================

describe('GET /api/branding/[websiteId]', () => {
  it('returns 400 when websiteId is not a number', async () => {
    const res = await brandingRoute.GET(
      makeReq('http://x') as never,
      makeParams({ websiteId: 'not-a-number' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Invalid websiteId' });
    expect(getBrandingByWebsiteIdMock).not.toHaveBeenCalled();
  });

  it('returns branding + cssVars on success', async () => {
    const branding = { primaryColor: '#fff', secondaryColor: '#000' };
    const cssVars = { '--brand-primary': '#fff', '--brand-secondary': '#000' };
    getBrandingByWebsiteIdMock.mockResolvedValue(branding);
    brandingToCssVarsMock.mockReturnValue(cssVars);

    const res = await brandingRoute.GET(
      makeReq('http://x') as never,
      makeParams({ websiteId: '7' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: branding, cssVars });
    expect(getBrandingByWebsiteIdMock).toHaveBeenCalledWith(7);
    expect(brandingToCssVarsMock).toHaveBeenCalledWith(branding);
  });

  it('returns 500 when the branding loader throws', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    getBrandingByWebsiteIdMock.mockRejectedValue(new Error('boom'));
    const res = await brandingRoute.GET(
      makeReq('http://x') as never,
      makeParams({ websiteId: '1' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to load branding' });
    consoleSpy.mockRestore();
  });
});

// ===========================================================================
// /api/categories  (GET, POST)
// ===========================================================================

describe('GET /api/categories', () => {
  it('returns categories list on success', async () => {
    selectQueue.push([
      { id: 1, name: 'A', slug: 'a' },
      { id: 2, name: 'B', slug: 'b' },
    ]);
    const res = await categoriesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].slug).toBe('a');
  });

  it('returns an empty list when there are no rows', async () => {
    selectQueue.push([]);
    const res = await categoriesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 500 when the db throws', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    nextSelectThrows = new Error('db down');
    const res = await categoriesRoute.GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: 'Failed to fetch categories',
    });
    consoleSpy.mockRestore();
  });
});

describe('POST /api/categories', () => {
  it('creates a category and returns 201', async () => {
    insertReturnQueue.push([
      { id: 1, name: 'Web', slug: 'web', description: 'desc' },
    ]);
    const res = await categoriesRoute.POST(
      makeJsonReq('http://x/api/categories', 'POST', {
        name: 'Web',
        slug: 'web',
        description: 'desc',
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 1, name: 'Web', slug: 'web' });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('categories');
    expect(insertCalls[0].values).toEqual({
      name: 'Web',
      slug: 'web',
      description: 'desc',
    });
  });

  it('creates a category without optional description', async () => {
    insertReturnQueue.push([{ id: 2, name: 'Mobile', slug: 'mobile' }]);
    const res = await categoriesRoute.POST(
      makeJsonReq('http://x/api/categories', 'POST', {
        name: 'Mobile',
        slug: 'mobile',
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toEqual({ name: 'Mobile', slug: 'mobile' });
  });

  it('returns 400 with validation details when name is missing', async () => {
    const res = await categoriesRoute.POST(
      makeJsonReq('http://x/api/categories', 'POST', {
        slug: 'web',
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 400 with validation details when slug is missing', async () => {
    const res = await categoriesRoute.POST(
      makeJsonReq('http://x/api/categories', 'POST', {
        name: 'Web',
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when name is an empty string', async () => {
    const res = await categoriesRoute.POST(
      makeJsonReq('http://x/api/categories', 'POST', {
        name: '',
        slug: 'web',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 when the insert throws', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    nextInsertThrows = new Error('insert failed');
    const res = await categoriesRoute.POST(
      makeJsonReq('http://x/api/categories', 'POST', {
        name: 'Web',
        slug: 'web',
      }) as never,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: 'Failed to create category',
    });
    consoleSpy.mockRestore();
  });
});
