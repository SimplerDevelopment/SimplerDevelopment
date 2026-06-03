// @vitest-environment node
/**
 * Unit tests for two API routes:
 *
 *   1. GET + PUT app/api/portal/cms/websites/[siteId]/content-types/[typeId]/template/route.ts
 *      Loads / persists a per-content-type block template. Enforces a single
 *      post-content placeholder (dedupes duplicates, prepends one if missing,
 *      stamps required:true). GET returns `defaulted: true` when nothing is
 *      saved yet.
 *
 *   2. GET + POST app/api/portal/crm/companies/route.ts
 *      Lists companies (paginated, searchable, custom-field filtered) and
 *      creates new ones with optional auto-geocoding of `address`.
 *
 * All collaborators are mocked: auth, getPortalClient, db, drizzle helpers,
 * schema column refs, buildCustomFieldFilters, geocodeAddress.
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

const buildCustomFieldFiltersMock = vi.fn(() => [] as unknown[]);
vi.mock('@/lib/crm-custom-field-filter', () => ({
  buildCustomFieldFilters: (...args: unknown[]) => buildCustomFieldFiltersMock(...args),
}));

const geocodeAddressMock = vi.fn();
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: (...args: unknown[]) => geocodeAddressMock(...args),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return new Proxy({
    clientWebsites: wrap('clientWebsites'),
    postTypes: wrap('postTypes'),
    crmCompanies: wrap('crmCompanies'),
    crmContacts: wrap('crmContacts'),
    crmDeals: wrap('crmDeals'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const obj = {
        __sql: true,
        strings: Array.from(strings),
        values,
        as(alias: string) {
          return { ...obj, __alias: alias };
        },
      };
      return obj;
    },
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- per-test db state ----

const selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{ table: string; set: Record<string, unknown> }> = [];
const updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
const insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const executeCalls: unknown[] = [];
let executeShouldThrow = false;

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const chain: Record<string, unknown> = {
      from() {
        return chain;
      },
      where() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      offset() {
        return Promise.resolve(selectQueue.shift() ?? []);
      },
      limit() {
        // Some calls in companies GET chain .limit().offset(); we need to
        // return an object that has offset(). The template route uses
        // .limit(1) directly (Promise). Support both by returning a chain
        // that is also a thenable resolving to the next row batch.
        const limitChain: Record<string, unknown> = {
          offset() {
            return Promise.resolve(selectQueue.shift() ?? []);
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
          },
        };
        return limitChain;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function makeUpdate(table: { __table: string }) {
    return {
      set(values: Record<string, unknown>) {
        updateCalls.push({ table: table.__table, set: values });
        return {
          where() {
            return {
              returning() {
                return Promise.resolve(updateReturnQueue.shift() ?? []);
              },
            };
          },
        };
      },
    };
  }

  function makeInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown>) {
        insertCalls.push({ table: table.__table, values: vals });
        return {
          returning() {
            return Promise.resolve(insertReturnQueue.shift() ?? []);
          },
        };
      },
    };
  }

  function execute(...args: unknown[]) {
    executeCalls.push(args);
    if (executeShouldThrow) return Promise.reject(new Error('execute boom'));
    return Promise.resolve();
  }

  return {
    db: {
      select() {
        return makeSelectChain();
      },
      update(table: { __table: string }) {
        return makeUpdate(table);
      },
      insert(table: { __table: string }) {
        return makeInsert(table);
      },
      execute,
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const { GET: templateGET, PUT: templatePUT } = await import(
  '@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/template/route'
);
const { GET: companiesGET, POST: companiesPOST } = await import(
  '@/app/api/portal/crm/companies/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplateParams(siteId: string, typeId: string) {
  return { params: Promise.resolve({ siteId, typeId }) };
}

function makeJsonRequest(body: unknown, url = 'http://localhost/api/portal'): Request {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeNextRequest(qs = ''): { nextUrl: URL } {
  return { nextUrl: new URL('http://localhost/api/portal/crm/companies' + (qs ? '?' + qs : '')) };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  updateCalls.length = 0;
  updateReturnQueue.length = 0;
  insertCalls.length = 0;
  insertReturnQueue.length = 0;
  executeCalls.length = 0;
  executeShouldThrow = false;
  buildCustomFieldFiltersMock.mockReturnValue([]);
});

// ===========================================================================
// CMS content-types template route
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/content-types/[typeId]/template', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await templateGET(new Request('http://localhost'), makeTemplateParams('1', '2'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await templateGET(new Request('http://localhost'), makeTemplateParams('1', '2'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when site lookup is empty', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([]); // site lookup empty
    const res = await templateGET(new Request('http://localhost'), makeTemplateParams('1', '2'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when type lookup is empty', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]); // site found
    selectQueue.push([]); // type not found
    const res = await templateGET(new Request('http://localhost'), makeTemplateParams('1', '2'));
    expect(res.status).toBe(401);
  });

  it('returns a default template when type has no saved template', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 2, websiteId: 1, template: null }]); // type w/o template
    const res = await templateGET(new Request('http://localhost'), makeTemplateParams('1', '2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.defaulted).toBe(true);
    expect(body.data.template.version).toBe('1.0');
    expect(body.data.template.blocks).toHaveLength(1);
    expect(body.data.template.blocks[0].type).toBe('post-content');
    expect(body.data.template.blocks[0].required).toBe(true);
  });

  it('returns the saved template when it has a post-content block', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    const saved = {
      blocks: [
        { id: 'h', type: 'heading', order: 0 },
        { id: 'pc', type: 'post-content', order: 1, required: true },
      ],
      version: '1.2',
    };
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: JSON.stringify(saved) }]);
    const res = await templateGET(new Request('http://localhost'), makeTemplateParams('1', '2'));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.defaulted).toBe(false);
    expect(body.data.template.version).toBe('1.2');
    expect(body.data.template.blocks).toHaveLength(2);
  });

  it('back-fills a placeholder if the saved template has none', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    const saved = {
      blocks: [{ id: 'h', type: 'heading', order: 0 }],
      version: '1.0',
    };
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: JSON.stringify(saved) }]);
    const res = await templateGET(new Request('http://localhost'), makeTemplateParams('1', '2'));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.defaulted).toBe(false);
    expect(body.data.template.blocks).toHaveLength(2);
    expect(body.data.template.blocks[0].type).toBe('post-content');
    expect(body.data.template.blocks[0].required).toBe(true);
    // existing block re-ordered to position 1
    expect(body.data.template.blocks[1].order).toBe(1);
  });

  it('returns null template when stored JSON is malformed', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: '{not valid' }]);
    const res = await templateGET(new Request('http://localhost'), makeTemplateParams('1', '2'));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.template).toBeNull();
  });
});

describe('PUT /api/portal/cms/websites/[siteId]/content-types/[typeId]/template', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await templatePUT(makeJsonRequest({}), makeTemplateParams('1', '2'));
    expect(res.status).toBe(401);
  });

  it('prepends a placeholder when the input has none', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: null }]);
    updateReturnQueue.push([
      {
        id: 2,
        template: JSON.stringify({
          blocks: [{ id: 'pc', type: 'post-content', order: 0, required: true }],
          version: '1.0',
        }),
      },
    ]);
    const res = await templatePUT(
      makeJsonRequest({ template: { blocks: [{ id: 'h', type: 'heading' }], version: '1.0' } }),
      makeTemplateParams('1', '2'),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls).toHaveLength(1);
    const set = updateCalls[0].set as { template: string };
    const persisted = JSON.parse(set.template);
    expect(persisted.blocks[0].type).toBe('post-content');
    expect(persisted.blocks[0].required).toBe(true);
    // existing heading bumped from 0 → 1
    expect(persisted.blocks[1].order).toBe(1);
  });

  it('dedupes duplicate post-content blocks and keeps the first', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: null }]);
    updateReturnQueue.push([{ id: 2, template: null }]);
    const res = await templatePUT(
      makeJsonRequest({
        template: {
          blocks: [
            { id: 'pc1', type: 'post-content', order: 0 },
            { id: 'h', type: 'heading', order: 1 },
            { id: 'pc2', type: 'post-content', order: 2 },
          ],
        },
      }),
      makeTemplateParams('1', '2'),
    );
    expect(res.status).toBe(200);
    const persisted = JSON.parse((updateCalls[0].set as { template: string }).template);
    const placeholders = persisted.blocks.filter(
      (b: { type: string }) => b.type === 'post-content',
    );
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].id).toBe('pc1');
    expect(placeholders[0].required).toBe(true);
  });

  it('recurses into columns/sub-blocks when deduping', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: null }]);
    updateReturnQueue.push([{ id: 2, template: null }]);
    const res = await templatePUT(
      makeJsonRequest({
        template: {
          blocks: [
            { id: 'pc-outer', type: 'post-content', order: 0 },
            {
              id: 'section',
              type: 'section',
              order: 1,
              blocks: [{ id: 'pc-nested', type: 'post-content', order: 0 }],
            },
            {
              id: 'cols',
              type: 'columns',
              order: 2,
              columns: [{ blocks: [{ id: 'pc-col', type: 'post-content', order: 0 }] }],
            },
          ],
        },
      }),
      makeTemplateParams('1', '2'),
    );
    expect(res.status).toBe(200);
    const persisted = JSON.parse((updateCalls[0].set as { template: string }).template);
    function count(blocks: Array<{ type?: string; blocks?: unknown[]; columns?: Array<{ blocks?: unknown[] }> }>): number {
      let n = 0;
      for (const b of blocks) {
        if (b.type === 'post-content') n++;
        if (Array.isArray(b.blocks)) n += count(b.blocks as Array<{ type?: string }>);
        if (Array.isArray(b.columns))
          for (const c of b.columns) n += count((c.blocks ?? []) as Array<{ type?: string }>);
      }
      return n;
    }
    expect(count(persisted.blocks)).toBe(1);
  });

  it('handles empty / null template body by inserting a default placeholder', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: null }]);
    updateReturnQueue.push([{ id: 2, template: null }]);
    const res = await templatePUT(makeJsonRequest({ template: null }), makeTemplateParams('1', '2'));
    expect(res.status).toBe(200);
    const persisted = JSON.parse((updateCalls[0].set as { template: string }).template);
    expect(persisted.blocks).toHaveLength(1);
    expect(persisted.blocks[0].type).toBe('post-content');
    expect(persisted.version).toBe('1.0');
  });

  it('returns parsed updated template on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: null }]);
    const echoed = JSON.stringify({
      blocks: [{ id: 'pc', type: 'post-content', order: 0, required: true }],
      version: '2.0',
    });
    updateReturnQueue.push([{ id: 2, template: echoed }]);
    const res = await templatePUT(
      makeJsonRequest({ template: { blocks: [{ type: 'post-content' }], version: '2.0' } }),
      makeTemplateParams('1', '2'),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.defaulted).toBe(false);
    expect(body.data.template.version).toBe('2.0');
  });

  it('tolerates malformed JSON in the returning row', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1, template: null }]);
    updateReturnQueue.push([{ id: 2, template: '{garbled' }]);
    const res = await templatePUT(
      makeJsonRequest({ template: { blocks: [{ type: 'post-content' }] } }),
      makeTemplateParams('1', '2'),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.template).toBeNull();
  });
});

// ===========================================================================
// CRM companies route
// ===========================================================================

describe('GET /api/portal/crm/companies', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await companiesGET(makeNextRequest() as never);
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await companiesGET(makeNextRequest() as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('lists companies with pagination defaults', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ total: 0 }]); // count
    selectQueue.push([]); // companies
    const res = await companiesGET(makeNextRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(25);
    expect(body.data.total).toBe(0);
    expect(body.data.companies).toEqual([]);
  });

  it('honours search + page + limit query params', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ total: 3 }]);
    selectQueue.push([
      { id: 1, name: 'Acme', clientId: 7, contactCount: 2, totalDealValue: 1000 },
    ]);
    const res = await companiesGET(makeNextRequest('search=ac&page=2&limit=50') as never);
    const body = await res.json();
    expect(body.data.page).toBe(2);
    expect(body.data.limit).toBe(50);
    expect(body.data.total).toBe(3);
    expect(body.data.companies[0].name).toBe('Acme');
  });

  it('caps limit at 5000 and floors page at 1', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ total: 0 }]);
    selectQueue.push([]);
    const res = await companiesGET(makeNextRequest('limit=99999&page=0') as never);
    const body = await res.json();
    expect(body.data.limit).toBe(5000);
    expect(body.data.page).toBe(1);
  });

  it('invokes buildCustomFieldFilters and includes returned conditions', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    buildCustomFieldFiltersMock.mockReturnValueOnce([{ op: 'cf' }]);
    selectQueue.push([{ total: 0 }]);
    selectQueue.push([]);
    await companiesGET(makeNextRequest('cf_5=foo') as never);
    expect(buildCustomFieldFiltersMock).toHaveBeenCalledTimes(1);
    const args = buildCustomFieldFiltersMock.mock.calls[0];
    expect(args[2]).toBe('company');
  });
});

describe('POST /api/portal/crm/companies', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await companiesPOST(makeJsonRequest({ name: 'Acme' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await companiesPOST(makeJsonRequest({ name: 'Acme' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing or blank', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    const res = await companiesPOST(makeJsonRequest({ name: '   ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name is required/i);
  });

  it('creates a company without address and without geocoding', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    insertReturnQueue.push([{ id: 99, clientId: 7, name: 'Acme' }]);
    const res = await companiesPOST(makeJsonRequest({ name: 'Acme' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(geocodeAddressMock).not.toHaveBeenCalled();
    expect(executeCalls).toHaveLength(0);
  });

  it('auto-geocodes when address is provided and no explicit coords', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    geocodeAddressMock.mockResolvedValueOnce({ latitude: 40.1, longitude: -75.2 });
    insertReturnQueue.push([{ id: 100, clientId: 7, name: 'Acme' }]);
    const res = await companiesPOST(
      makeJsonRequest({ name: 'Acme', address: '100 Main St' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(geocodeAddressMock).toHaveBeenCalledWith('100 Main St');
    expect(body.data.latitude).toBe(40.1);
    expect(body.data.longitude).toBe(-75.2);
    // raw SQL execute writes the coords too
    expect(executeCalls).toHaveLength(1);
  });

  it('prefers explicit coordinates over geocoding', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    insertReturnQueue.push([{ id: 101, clientId: 7, name: 'Acme' }]);
    const res = await companiesPOST(
      makeJsonRequest({
        name: 'Acme',
        address: '100 Main St',
        latitude: 1.5,
        longitude: -2.5,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(geocodeAddressMock).not.toHaveBeenCalled();
    expect(body.data.latitude).toBe(1.5);
    expect(body.data.longitude).toBe(-2.5);
  });

  it('swallows geocode failures and still creates the company', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    geocodeAddressMock.mockRejectedValueOnce(new Error('network boom'));
    insertReturnQueue.push([{ id: 102, clientId: 7, name: 'Acme' }]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await companiesPOST(
      makeJsonRequest({ name: 'Acme', address: '100 Main St' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.latitude).toBeNull();
    expect(body.data.longitude).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('swallows execute() failures when persisting coordinates', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    insertReturnQueue.push([{ id: 103, clientId: 7, name: 'Acme' }]);
    executeShouldThrow = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await companiesPOST(
      makeJsonRequest({ name: 'Acme', latitude: 1, longitude: 2 }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.latitude).toBe(1);
    expect(body.data.longitude).toBe(2);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('parseCoordinate rejects garbage strings', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    insertReturnQueue.push([{ id: 104, clientId: 7, name: 'Acme' }]);
    const res = await companiesPOST(
      makeJsonRequest({ name: 'Acme', latitude: 'banana', longitude: 'apple' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.latitude).toBeNull();
    expect(body.data.longitude).toBeNull();
  });

  it('accepts numeric coordinate values directly', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    insertReturnQueue.push([{ id: 105, clientId: 7, name: 'Acme' }]);
    const res = await companiesPOST(
      makeJsonRequest({ name: 'Acme', latitude: 12, longitude: -34 }),
    );
    const body = await res.json();
    expect(body.data.latitude).toBe(12);
    expect(body.data.longitude).toBe(-34);
    // string conversion happened on the insert path
    const inserted = insertCalls[0].values as { latitude: string | null; longitude: string | null };
    expect(inserted.latitude).toBe('12');
    expect(inserted.longitude).toBe('-34');
  });
});
