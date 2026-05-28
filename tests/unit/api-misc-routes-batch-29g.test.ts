// @vitest-environment node
/**
 * Unit tests for four portal CMS API routes (batch 29g):
 *
 *  1. PUT/DELETE app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/[fieldId]/route.ts
 *  2. PUT/DELETE app/api/portal/cms/websites/[siteId]/content-types/[typeId]/route.ts
 *  3. GET/POST  app/api/portal/cms/websites/[siteId]/content-types/route.ts
 *  4. GET/PATCH/DELETE app/api/portal/cms/websites/[siteId]/email-templates/[templateId]/route.ts
 *
 * Every collaborator is mocked: auth, getPortalClient, resolveClientSite, db,
 * drizzle helpers, schema column refs, renderBlocksToEmailHtml.
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
const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

const renderBlocksToEmailHtmlMock = vi.fn(() => '<html>rendered</html>');
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: (...args: unknown[]) => renderBlocksToEmailHtmlMock(...args),
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
  return {
    clientWebsites: wrap('clientWebsites'),
    postTypes: wrap('postTypes'),
    customFields: wrap('customFields'),
    websiteEmailTemplates: wrap('websiteEmailTemplates'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// ---- per-test db state ----

const selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{ table: string; set: Record<string, unknown> }> = [];
const updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
const insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: Array<{ table: string }> = [];

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
        // For the list-types route, orderBy completes a select (no .limit()).
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

  function makeDelete(table: { __table: string }) {
    deleteCalls.push({ table: table.__table });
    return {
      where() {
        return Promise.resolve();
      },
    };
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
      delete(table: { __table: string }) {
        return makeDelete(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const { PUT: fieldPUT, DELETE: fieldDELETE } = await import(
  '@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/[fieldId]/route'
);
const { PUT: typePUT, DELETE: typeDELETE } = await import(
  '@/app/api/portal/cms/websites/[siteId]/content-types/[typeId]/route'
);
const { GET: typesGET, POST: typesPOST } = await import(
  '@/app/api/portal/cms/websites/[siteId]/content-types/route'
);
const { GET: templateGET, PATCH: templatePATCH, DELETE: templateDELETE } = await import(
  '@/app/api/portal/cms/websites/[siteId]/email-templates/[templateId]/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fieldParams(siteId: string, typeId: string, fieldId: string) {
  return { params: Promise.resolve({ siteId, typeId, fieldId }) };
}
function typeParams(siteId: string, typeId: string) {
  return { params: Promise.resolve({ siteId, typeId }) };
}
function siteParams(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}
function templateParams(siteId: string, templateId: string) {
  return { params: Promise.resolve({ siteId, templateId }) };
}

function jsonReq(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/portal', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue.length = 0;
  updateCalls.length = 0;
  updateReturnQueue.length = 0;
  insertCalls.length = 0;
  insertReturnQueue.length = 0;
  deleteCalls.length = 0;
  renderBlocksToEmailHtmlMock.mockReturnValue('<html>rendered</html>');
});

// ===========================================================================
// content-types/[typeId]/fields/[fieldId] — PUT + DELETE
// ===========================================================================

describe('PUT /api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/[fieldId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await fieldPUT(jsonReq({ name: 'X' }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await fieldPUT(jsonReq({ name: 'X' }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when site lookup is empty', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([]); // site empty
    const res = await fieldPUT(jsonReq({ name: 'X' }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when type lookup is empty', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([]); // type empty
    const res = await fieldPUT(jsonReq({ name: 'X' }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when field lookup is empty', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([]); // field empty
    const res = await fieldPUT(jsonReq({ name: 'X' }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on zod validation failure', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([{ id: 3, postTypeId: 2 }]);
    const res = await fieldPUT(
      jsonReq({ fieldType: 'not-a-real-type' }, 'PUT'),
      fieldParams('1', '2', '3'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation error');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('rethrows non-Zod parse errors', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([{ id: 3, postTypeId: 2 }]);
    // build a request whose .json() throws a non-Zod error
    const badReq = {
      json: () => Promise.reject(new Error('boom')),
    } as unknown as Request;
    await expect(fieldPUT(badReq, fieldParams('1', '2', '3'))).rejects.toThrow('boom');
  });

  it('returns 400 when reparenting to a field on a different content type', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([{ id: 3, postTypeId: 2 }]);
    // parent lookup → wrong postTypeId
    selectQueue.push([{ id: 99, postTypeId: 999, fieldType: 'repeater' }]);
    const res = await fieldPUT(jsonReq({ parentId: 99 }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/not a field on this content type/i);
  });

  it('returns 400 when reparent target is not a container', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([{ id: 3, postTypeId: 2 }]);
    selectQueue.push([{ id: 99, postTypeId: 2, fieldType: 'text' }]);
    const res = await fieldPUT(jsonReq({ parentId: 99 }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/repeater or group/i);
  });

  it('returns 400 when reparent target row is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([{ id: 3, postTypeId: 2 }]);
    selectQueue.push([]); // parent lookup empty
    const res = await fieldPUT(jsonReq({ parentId: 99 }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(400);
  });

  it('updates the field with only the supplied fields', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([{ id: 3, postTypeId: 2 }]);
    updateReturnQueue.push([{ id: 3, name: 'Renamed' }]);
    const res = await fieldPUT(
      jsonReq(
        {
          name: 'Renamed',
          slug: 'renamed',
          fieldType: 'text',
          options: ['a', 'b'],
          required: true,
          defaultValue: 'd',
          helpText: 'h',
          order: 5,
        },
        'PUT',
      ),
      fieldParams('1', '2', '3'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Renamed');
    expect(updateCalls).toHaveLength(1);
    const set = updateCalls[0].set;
    expect(set.name).toBe('Renamed');
    expect(set.slug).toBe('renamed');
    expect(set.fieldType).toBe('text');
    expect(set.options).toEqual(['a', 'b']);
    expect(set.required).toBe(true);
    expect(set.defaultValue).toBe('d');
    expect(set.helpText).toBe('h');
    expect(set.order).toBe(5);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it('updates parentId when reparent target is a valid container', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([{ id: 3, postTypeId: 2 }]);
    selectQueue.push([{ id: 99, postTypeId: 2, fieldType: 'group' }]);
    updateReturnQueue.push([{ id: 3, parentId: 99 }]);
    const res = await fieldPUT(jsonReq({ parentId: 99 }, 'PUT'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(200);
    expect(updateCalls[0].set.parentId).toBe(99);
  });
});

describe('DELETE /api/portal/cms/websites/[siteId]/content-types/[typeId]/fields/[fieldId]', () => {
  it('returns 401 when access verification fails', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await fieldDELETE(new Request('http://localhost'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(401);
  });

  it('deletes the field and returns success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    selectQueue.push([{ id: 3, postTypeId: 2 }]);
    const res = await fieldDELETE(new Request('http://localhost'), fieldParams('1', '2', '3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('customFields');
  });
});

// ===========================================================================
// content-types/[typeId] — PUT + DELETE
// ===========================================================================

describe('PUT /api/portal/cms/websites/[siteId]/content-types/[typeId]', () => {
  it('returns 404 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await typePUT(jsonReq({ name: 'X' }, 'PUT'), typeParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await typePUT(jsonReq({ name: 'X' }, 'PUT'), typeParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when site is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([]); // site empty
    const res = await typePUT(jsonReq({ name: 'X' }, 'PUT'), typeParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when type is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([]); // type empty
    const res = await typePUT(jsonReq({ name: 'X' }, 'PUT'), typeParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('falls back to existing values when body fields are absent', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([
      { id: 2, websiteId: 1, name: 'Old', slug: 'old', description: 'desc', icon: 'i', active: true },
    ]);
    updateReturnQueue.push([{ id: 2, name: 'Old' }]);
    const res = await typePUT(jsonReq({}, 'PUT'), typeParams('1', '2'));
    expect(res.status).toBe(200);
    const set = updateCalls[0].set;
    expect(set.name).toBe('Old');
    expect(set.slug).toBe('old');
    expect(set.description).toBe('desc');
    expect(set.icon).toBe('i');
    expect(set.active).toBe(true);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it('updates with new body values when provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([
      { id: 2, websiteId: 1, name: 'Old', slug: 'old', description: null, icon: 'i', active: false },
    ]);
    updateReturnQueue.push([{ id: 2, name: 'New' }]);
    const res = await typePUT(
      jsonReq({ name: 'New', slug: 'new', description: 'd', icon: 'star', active: true }, 'PUT'),
      typeParams('1', '2'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('New');
    const set = updateCalls[0].set;
    expect(set.name).toBe('New');
    expect(set.slug).toBe('new');
    expect(set.description).toBe('d');
    expect(set.icon).toBe('star');
    expect(set.active).toBe(true);
  });

  it('coerces empty-string description to null', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([
      { id: 2, websiteId: 1, name: 'n', slug: 's', description: 'prev', icon: 'i', active: true },
    ]);
    updateReturnQueue.push([{ id: 2 }]);
    const res = await typePUT(jsonReq({ description: '' }, 'PUT'), typeParams('1', '2'));
    expect(res.status).toBe(200);
    expect(updateCalls[0].set.description).toBeNull();
  });
});

describe('DELETE /api/portal/cms/websites/[siteId]/content-types/[typeId]', () => {
  it('returns 404 when type access fails', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await typeDELETE(new Request('http://localhost'), typeParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('deletes the type and returns success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([{ id: 2, websiteId: 1 }]);
    const res = await typeDELETE(new Request('http://localhost'), typeParams('1', '2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls.some((c) => c.table === 'postTypes')).toBe(true);
  });
});

// ===========================================================================
// content-types — GET + POST
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/content-types', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await typesGET(new Request('http://localhost'), siteParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await typesGET(new Request('http://localhost'), siteParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when site is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([]);
    const res = await typesGET(new Request('http://localhost'), siteParams('1'));
    expect(res.status).toBe(401);
  });

  it('lists site + global types', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([
      { id: 2, name: 'Blog', websiteId: 1 },
      { id: 3, name: 'Page', websiteId: null },
    ]);
    const res = await typesGET(new Request('http://localhost'), siteParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

describe('POST /api/portal/cms/websites/[siteId]/content-types', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await typesPOST(jsonReq({ name: 'X', slug: 'x' }), siteParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name or slug is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    const res = await typesPOST(jsonReq({ name: 'X' }), siteParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name and slug/i);
  });

  it('returns 409 when slug already exists', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([{ id: 99 }]); // existing
    const res = await typesPOST(jsonReq({ name: 'X', slug: 'x' }), siteParams('1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toMatch(/already exists/i);
  });

  it('creates a new content type with defaults applied', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]); // site
    selectQueue.push([]); // no existing
    insertReturnQueue.push([
      { id: 100, name: 'X', slug: 'x', websiteId: 1, icon: 'article', active: true },
    ]);
    const res = await typesPOST(jsonReq({ name: 'X', slug: 'x' }), siteParams('1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(100);
    expect(insertCalls).toHaveLength(1);
    const vals = insertCalls[0].values;
    expect(vals.name).toBe('X');
    expect(vals.slug).toBe('x');
    expect(vals.description).toBeNull();
    expect(vals.icon).toBe('article');
    expect(vals.active).toBe(true);
    expect(vals.websiteId).toBe(1);
  });

  it('uses supplied description and icon when provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 7 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([]);
    insertReturnQueue.push([{ id: 101 }]);
    await typesPOST(
      jsonReq({ name: 'X', slug: 'x', description: 'desc', icon: 'star' }),
      siteParams('1'),
    );
    const vals = insertCalls[0].values;
    expect(vals.description).toBe('desc');
    expect(vals.icon).toBe('star');
  });
});

// ===========================================================================
// email-templates/[templateId] — GET + PATCH + DELETE
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/email-templates/[templateId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await templateGET(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await templateGET(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when template row is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    selectQueue.push([]); // template empty
    const res = await templateGET(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Template not found');
  });

  it('returns the template payload on success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    selectQueue.push([{ id: 2, name: 'Welcome', websiteId: 1 }]);
    const res = await templateGET(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Welcome');
  });
});

describe('PATCH /api/portal/cms/websites/[siteId]/email-templates/[templateId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await templatePATCH(jsonReq({ name: 'A' }, 'PATCH'), templateParams('1', '2'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await templatePATCH(jsonReq({ name: 'A' }, 'PATCH'), templateParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when update returns nothing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    updateReturnQueue.push([]); // no row
    const res = await templatePATCH(jsonReq({ name: 'A' }, 'PATCH'), templateParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('applies scalar field updates', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    updateReturnQueue.push([{ id: 2, name: 'New' }]);
    const res = await templatePATCH(
      jsonReq(
        {
          name: 'New',
          subject: 'Hi',
          description: 'd',
          enabled: false,
          brandingProfileId: 9,
        },
        'PATCH',
      ),
      templateParams('1', '2'),
    );
    expect(res.status).toBe(200);
    const set = updateCalls[0].set;
    expect(set.name).toBe('New');
    expect(set.subject).toBe('Hi');
    expect(set.description).toBe('d');
    expect(set.enabled).toBe(false);
    expect(set.brandingProfileId).toBe(9);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it('renders htmlContent from blockContent.blocks', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    updateReturnQueue.push([{ id: 2 }]);
    renderBlocksToEmailHtmlMock.mockReturnValueOnce('<rendered/>');
    const res = await templatePATCH(
      jsonReq({ blockContent: { blocks: [{ type: 'p' }] } }, 'PATCH'),
      templateParams('1', '2'),
    );
    expect(res.status).toBe(200);
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalledWith([{ type: 'p' }]);
    expect(updateCalls[0].set.htmlContent).toBe('<rendered/>');
    expect(updateCalls[0].set.blockContent).toEqual({ blocks: [{ type: 'p' }] });
  });

  it('stores blockContent without rendering when blocks is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    updateReturnQueue.push([{ id: 2 }]);
    const res = await templatePATCH(
      jsonReq({ blockContent: { schema: 'x' } }, 'PATCH'),
      templateParams('1', '2'),
    );
    expect(res.status).toBe(200);
    expect(renderBlocksToEmailHtmlMock).not.toHaveBeenCalled();
    expect(updateCalls[0].set.blockContent).toEqual({ schema: 'x' });
    expect(updateCalls[0].set.htmlContent).toBeUndefined();
  });

  it('stores htmlContent directly when blockContent is not provided', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    updateReturnQueue.push([{ id: 2 }]);
    await templatePATCH(
      jsonReq({ htmlContent: '<html>raw</html>' }, 'PATCH'),
      templateParams('1', '2'),
    );
    expect(renderBlocksToEmailHtmlMock).not.toHaveBeenCalled();
    expect(updateCalls[0].set.htmlContent).toBe('<html>raw</html>');
  });
});

describe('DELETE /api/portal/cms/websites/[siteId]/email-templates/[templateId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await templateDELETE(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await templateDELETE(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when template row is missing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    selectQueue.push([]); // template empty
    const res = await templateDELETE(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when the template is required', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    selectQueue.push([{ isRequired: true }]);
    const res = await templateDELETE(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/cannot delete/i);
  });

  it('deletes a non-required template and returns success', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    resolveClientSiteMock.mockResolvedValueOnce({ id: 1 });
    selectQueue.push([{ isRequired: false }]);
    const res = await templateDELETE(new Request('http://localhost'), templateParams('1', '2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls.some((c) => c.table === 'websiteEmailTemplates')).toBe(true);
  });
});
