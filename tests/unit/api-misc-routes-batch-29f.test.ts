// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 29f):
 *   - app/api/portal/cms/websites/[siteId]/categories/[id]/route.ts          (PUT, DELETE)
 *   - app/api/portal/cms/websites/[siteId]/code/route.ts                     (GET, PUT)
 *   - app/api/portal/cms/websites/[siteId]/content-types/[typeId]/code/route.ts (GET, PUT)
 *   - app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/route.ts (GET, POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (declared before importing route modules)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

// drizzle-orm — stub operators to plain objects (we don't introspect them)
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables so `table.col` and `eq(table.col, x)` are inert
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
    categories: wrap('categories'),
    clientWebsites: wrap('clientWebsites'),
    postTypes: wrap('postTypes'),
    customFields: wrap('customFields'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---- db mock with select-queue + capture for writes ----

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
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNextSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNextSelect());
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
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          onConflictDoNothing() {
            return Promise.resolve(undefined);
          },
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

// ---- modules under test (loaded AFTER mocks) ----

const categoriesIdRoute = await import('@/app/api/portal/cms/websites/[siteId]/categories/[id]/route');
const siteCodeRoute = await import('@/app/api/portal/cms/websites/[siteId]/code/route');
const typeCodeRoute = await import('@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/code/route');
const fieldsRoute = await import('@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/route');

// ---- helpers ----

function makeSiteIdParams(siteId: string, id: string) {
  return { params: Promise.resolve({ siteId, id }) };
}

function makeSiteIdOnlyParams(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

function makeTypeParams(siteId: string, typeId: string) {
  return { params: Promise.resolve({ siteId, typeId }) };
}

function makeJsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const STAFF_SESSION = { user: { id: '7', role: 'admin' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
});

// ===========================================================================
// categories/[id]/route.ts
// ===========================================================================

describe('PUT /api/portal/cms/websites/[siteId]/categories/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await categoriesIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/categories/2', 'PUT', { name: 'A' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await categoriesIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/categories/2', 'PUT', { name: 'A' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on slug conflict with different category', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 10 });
    selectQueue.push([{ id: 999 }]); // conflict row, different from category id 2
    const res = await categoriesIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/categories/2', 'PUT', { slug: 'taken' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/slug already exists/i);
  });

  it('allows slug conflict on the same category id (self)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 10 });
    selectQueue.push([{ id: 2 }]); // same id as target → not a real conflict
    updateReturnQueue.push([{ id: 2, name: 'Old', slug: 'mine' }]);
    const res = await categoriesIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/categories/2', 'PUT', { slug: 'mine' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.slug).toBe('mine');
  });

  it('returns 404 when update touches no rows', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 10 });
    // no slug → skip conflict check
    updateReturnQueue.push([]); // returning yields nothing
    const res = await categoriesIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/categories/2', 'PUT', { name: 'New' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/category not found/i);
  });

  it('updates only provided fields and trims them', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 10 });
    updateReturnQueue.push([{ id: 2, name: 'New', description: 'desc', color: '#fff' }]);
    const res = await categoriesIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/categories/2', 'PUT', {
        name: '  New  ',
        description: '  desc  ',
        color: '  #fff  ',
      }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({ name: 'New', description: 'desc', color: '#fff' });
    expect(updateCalls[0].patch).not.toHaveProperty('slug');
  });

  it('converts empty description/color to null', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 10 });
    updateReturnQueue.push([{ id: 2 }]);
    await categoriesIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/categories/2', 'PUT', {
        description: '',
        color: '',
      }),
      makeSiteIdParams('1', '2'),
    );
    expect(updateCalls[0].patch.description).toBeNull();
    expect(updateCalls[0].patch.color).toBeNull();
  });
});

describe('DELETE /api/portal/cms/websites/[siteId]/categories/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await categoriesIdRoute.DELETE(
      new Request('http://x/api/portal/cms/websites/1/categories/2', { method: 'DELETE' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await categoriesIdRoute.DELETE(
      new Request('http://x/api/portal/cms/websites/1/categories/2', { method: 'DELETE' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when delete returns no row', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 10 });
    deleteReturnQueue.push([]); // nothing deleted
    const res = await categoriesIdRoute.DELETE(
      new Request('http://x/api/portal/cms/websites/1/categories/2', { method: 'DELETE' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes and returns success', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 10 });
    deleteReturnQueue.push([{ id: 2 }]);
    const res = await categoriesIdRoute.DELETE(
      new Request('http://x/api/portal/cms/websites/1/categories/2', { method: 'DELETE' }),
      makeSiteIdParams('1', '2'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls.some((d) => d.table === 'categories')).toBe(true);
  });
});

// ===========================================================================
// code/route.ts (site-level)
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/code', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await siteCodeRoute.GET(
      new Request('http://x/api/portal/cms/websites/1/code'),
      makeSiteIdOnlyParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when no client', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await siteCodeRoute.GET(
      new Request('http://x/api/portal/cms/websites/1/code'),
      makeSiteIdOnlyParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when site lookup is empty', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // site not found
    const res = await siteCodeRoute.GET(
      new Request('http://x/api/portal/cms/websites/1/code'),
      makeSiteIdOnlyParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns the existing css/js for an owned site', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{
      id: 1, customCss: 'body{}', customJs: 'noop()',
      draftCustomCss: null, draftCustomJs: null,
      draftUpdatedAt: null, draftUpdatedBy: null,
    }]);
    const res = await siteCodeRoute.GET(
      new Request('http://x/api/portal/cms/websites/1/code'),
      makeSiteIdOnlyParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ customCss: 'body{}', customJs: 'noop()' });
    expect(body.data.hasDraft).toBe(false);
    expect(body.data.draftUpdatedBy).toBeNull();
  });

  it('coalesces null css/js to empty strings', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{
      id: 1, customCss: null, customJs: null,
      draftCustomCss: null, draftCustomJs: null,
      draftUpdatedAt: null, draftUpdatedBy: null,
    }]);
    const res = await siteCodeRoute.GET(
      new Request('http://x/api/portal/cms/websites/1/code'),
      makeSiteIdOnlyParams('1'),
    );
    const body = await res.json();
    expect(body.data.customCss).toBe('');
    expect(body.data.customJs).toBe('');
  });
});

describe('PUT /api/portal/cms/websites/[siteId]/code', () => {
  it('returns 401 when site verification fails', async () => {
    authMock.mockResolvedValue(null);
    const res = await siteCodeRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/code', 'PUT', { customCss: 'x' }),
      makeSiteIdOnlyParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('updates css/js when provided (stored in draft columns)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // verify
    updateReturnQueue.push([{
      customCss: '', customJs: '',
      draftCustomCss: 'body{}', draftCustomJs: 'noop()',
      draftUpdatedAt: new Date(), draftUpdatedBy: 7,
    }]);
    const res = await siteCodeRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/code', 'PUT', {
        customCss: 'body{}',
        customJs: 'noop()',
      }),
      makeSiteIdOnlyParams('1'),
    );
    expect(res.status).toBe(200);
    // Route writes to draft columns, not live columns
    expect(updateCalls[0].patch).toMatchObject({ draftCustomCss: 'body{}', draftCustomJs: 'noop()' });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.draftUpdatedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.draftUpdatedBy).toBe(7);
  });

  it('treats empty string as null for css/js (in draft columns)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]);
    updateReturnQueue.push([{
      customCss: null, customJs: null,
      draftCustomCss: null, draftCustomJs: null,
      draftUpdatedAt: new Date(), draftUpdatedBy: 7,
    }]);
    const res = await siteCodeRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/code', 'PUT', {
        customCss: '',
        customJs: '',
      }),
      makeSiteIdOnlyParams('1'),
    );
    expect(res.status).toBe(200);
    // Empty strings are stored as null in draft columns
    expect(updateCalls[0].patch.draftCustomCss).toBeNull();
    expect(updateCalls[0].patch.draftCustomJs).toBeNull();
    const body = await res.json();
    expect(body.data.customCss).toBe('');
    expect(body.data.customJs).toBe('');
  });

  it('omits fields from patch when not in body', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]);
    updateReturnQueue.push([{ customCss: 'kept', customJs: 'kept', draftCustomCss: null, draftCustomJs: null, draftUpdatedAt: new Date(), draftUpdatedBy: 7 }]);
    await siteCodeRoute.PUT(
      makeJsonRequest('http://x/api/portal/cms/websites/1/code', 'PUT', {}),
      makeSiteIdOnlyParams('1'),
    );
    const patch = updateCalls[0].patch;
    expect(patch).not.toHaveProperty('draftCustomCss');
    expect(patch).not.toHaveProperty('draftCustomJs');
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// content-types/[typeId]/code/route.ts
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/content-types/[typeId]/code', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await typeCodeRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when no portal client', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await typeCodeRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when site lookup is empty', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // site empty
    const res = await typeCodeRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when type lookup is empty', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([]); // type missing
    const res = await typeCodeRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns existing customCss/customJs', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5, customCss: 'css', customJs: 'js' }]); // type
    const res = await typeCodeRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ customCss: 'css', customJs: 'js' });
  });

  it('coalesces null type css/js to empty strings', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 5, customCss: null, customJs: null }]);
    const res = await typeCodeRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    const body = await res.json();
    expect(body.data).toEqual({ customCss: '', customJs: '' });
  });
});

describe('PUT /api/portal/cms/websites/[siteId]/content-types/[typeId]/code', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await typeCodeRoute.PUT(
      makeJsonRequest('http://x/', 'PUT', { customCss: 'x' }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('writes provided css/js and coalesces empty strings to null', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    updateReturnQueue.push([{ customCss: null, customJs: 'noop()' }]);
    const res = await typeCodeRoute.PUT(
      makeJsonRequest('http://x/', 'PUT', { customCss: '', customJs: 'noop()' }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.customCss).toBeNull();
    expect(updateCalls[0].patch.customJs).toBe('noop()');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].table).toBe('postTypes');
    const body = await res.json();
    expect(body.data).toEqual({ customCss: '', customJs: 'noop()' });
  });

  it('skips fields when not provided', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 5 }]);
    updateReturnQueue.push([{ customCss: 'old', customJs: 'old' }]);
    await typeCodeRoute.PUT(
      makeJsonRequest('http://x/', 'PUT', {}),
      makeTypeParams('1', '5'),
    );
    const patch = updateCalls[0].patch;
    expect(patch).not.toHaveProperty('customCss');
    expect(patch).not.toHaveProperty('customJs');
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// content-types/[typeId]/fields/route.ts
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/content-types/[typeId]/fields', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await fieldsRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when site not owned', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // site
    const res = await fieldsRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns fields ordered by `order`', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    selectQueue.push([
      { id: 100, name: 'Title', slug: 'title', fieldType: 'text', order: 0 },
      { id: 101, name: 'Body', slug: 'body', fieldType: 'textarea', order: 1 },
    ]); // fields
    const res = await fieldsRoute.GET(
      new Request('http://x/'),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].slug).toBe('title');
  });
});

describe('POST /api/portal/cms/websites/[siteId]/content-types/[typeId]/fields', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', { name: 'X', slug: 'x', fieldType: 'text' }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when type cannot be resolved', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([]); // type missing
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', { name: 'X', slug: 'x', fieldType: 'text' }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on validation error (missing name)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', { slug: 'x', fieldType: 'text' }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation error');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 400 when fieldType is not in the enum', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', { name: 'X', slug: 'x', fieldType: 'nope' }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(400);
  });

  it('rejects parentId belonging to a different content type', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    selectQueue.push([{ id: 99, postTypeId: 999, fieldType: 'group' }]); // parent in another type
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', {
        parentId: 99,
        name: 'Child',
        slug: 'child',
        fieldType: 'text',
      }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/not a field on this content type/i);
  });

  it('rejects parentId pointing to a non-repeater/group field', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    selectQueue.push([{ id: 99, postTypeId: 5, fieldType: 'text' }]); // parent same type but wrong type
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', {
        parentId: 99,
        name: 'Child',
        slug: 'child',
        fieldType: 'text',
      }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/repeater or group/i);
  });

  it('returns 400 when parent does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    selectQueue.push([]); // parent missing
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', {
        parentId: 99,
        name: 'Child',
        slug: 'child',
        fieldType: 'text',
      }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(400);
  });

  it('creates a top-level field and returns 201', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    insertReturnQueue.push([
      { id: 200, name: 'Title', slug: 'title', fieldType: 'text', postTypeId: 5 },
    ]);
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', {
        name: 'Title',
        slug: 'title',
        fieldType: 'text',
        required: true,
        order: 0,
        helpText: 'Help',
        defaultValue: 'def',
        options: ['a', 'b'],
      }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(200);
    expect(insertCalls.some((c) => c.table === 'customFields')).toBe(true);
    const inserted = insertCalls.find((c) => c.table === 'customFields')!.values as Record<string, unknown>;
    expect(inserted.postTypeId).toBe(5);
    expect(inserted.parentId).toBeNull();
    expect(inserted.required).toBe(true);
    expect(inserted.options).toEqual(['a', 'b']);
  });

  it('creates a sub-field under a repeater parent', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 5 }]); // type
    selectQueue.push([{ id: 99, postTypeId: 5, fieldType: 'repeater' }]); // parent OK
    insertReturnQueue.push([{ id: 201, name: 'Child', parentId: 99 }]);
    const res = await fieldsRoute.POST(
      makeJsonRequest('http://x/', 'POST', {
        parentId: 99,
        name: 'Child',
        slug: 'child',
        fieldType: 'text',
      }),
      makeTypeParams('1', '5'),
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls.find((c) => c.table === 'customFields')!.values as Record<string, unknown>;
    expect(inserted.parentId).toBe(99);
  });
});
