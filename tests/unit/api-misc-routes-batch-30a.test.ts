// @vitest-environment node
/**
 * Batch 30a — unit tests for 4 portal/cms website tag + taxonomy term routes.
 *
 * Routes covered:
 *  - app/api/portal/cms/websites/[siteId]/tags/[id]/route.ts                                    (PUT, DELETE)
 *  - app/api/portal/cms/websites/[siteId]/tags/route.ts                                         (GET, POST)
 *  - app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/[termId]/route.ts       (PUT, DELETE)
 *  - app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/route.ts                (GET, POST)
 *
 * Strategy: mock @/lib/auth, @/lib/portal-client, drizzle-orm operators, the
 * schema tables, and @/lib/db with a queue-driven select() and write builders
 * that capture insert/update/delete calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
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

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables
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
    tags: wrap('tags'),
    clientWebsites: wrap('clientWebsites'),
    taxonomies: wrap('taxonomies'),
    taxonomyTerms: wrap('taxonomyTerms'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
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

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

function shiftNextSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNextSelect());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
      chain[m] = passthrough;
    }
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

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
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

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const tagsIdRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/tags/[id]/route'
);
const tagsListRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/tags/route'
);
const termsIdRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/[termId]/route'
);
const termsListRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/route'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
});

// ===========================================================================
// /api/portal/cms/websites/[siteId]/tags/[id]  (PUT, DELETE)
// ===========================================================================

describe('PUT /api/portal/cms/websites/[siteId]/tags/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await tagsIdRoute.PUT(
      makeReq('http://x/tags/1', { method: 'PUT', body: '{}' }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await tagsIdRoute.PUT(
      makeReq('http://x/tags/1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'x' }),
      }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 400 when slug conflicts with another tag', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    // conflict lookup returns a different tag
    selectQueue.push([{ id: 2 }]);
    const res = await tagsIdRoute.PUT(
      makeReq('http://x/tags/1', {
        method: 'PUT',
        body: JSON.stringify({ slug: 'taken' }),
      }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('A tag with this slug already exists');
    expect(updateCalls).toHaveLength(0);
  });

  it('allows update when the only matching slug is the same row', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    // conflict lookup returns the same tag id
    selectQueue.push([{ id: 1 }]);
    updateReturnQueue.push([{ id: 1, name: 'X', slug: 'same' }]);
    const res = await tagsIdRoute.PUT(
      makeReq('http://x/tags/1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'X', slug: 'same' }),
      }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 1, slug: 'same' });
  });

  it('returns 404 when the update affects no rows', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    // no slug supplied => no conflict lookup
    updateReturnQueue.push([]);
    const res = await tagsIdRoute.PUT(
      makeReq('http://x/tags/1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'X' }),
      }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Tag not found');
  });

  it('returns 200 with updated tag (no slug supplied skips conflict check)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    updateReturnQueue.push([{ id: 1, name: 'Renamed', slug: 'orig' }]);
    const res = await tagsIdRoute.PUT(
      makeReq('http://x/tags/1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: 1, name: 'Renamed' });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('tags');
    expect(updateCalls[0].patch).toMatchObject({ name: 'Renamed' });
  });
});

describe('DELETE /api/portal/cms/websites/[siteId]/tags/[id]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/tags/1', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/tags/1', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when no row was deleted', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    deleteReturnQueue.push([]);
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/tags/1', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Tag not found');
  });

  it('returns 200 and deletes the tag', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    deleteReturnQueue.push([{ id: 1, name: 'old' }]);
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/tags/1', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '10', id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, message: 'Tag deleted' });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('tags');
  });
});

// ===========================================================================
// /api/portal/cms/websites/[siteId]/tags  (GET, POST)
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/tags', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await tagsListRoute.GET(
      makeReq('http://x/tags'),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await tagsListRoute.GET(
      makeReq('http://x/tags'),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with the tags for the site', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    selectQueue.push([
      { id: 1, name: 'ai', slug: 'ai', websiteId: 99 },
      { id: 2, name: 'biz', slug: 'biz', websiteId: 99 },
    ]);
    const res = await tagsListRoute.GET(
      makeReq('http://x/tags'),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ name: 'ai' });
  });
});

describe('POST /api/portal/cms/websites/[siteId]/tags', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await tagsListRoute.POST(
      makeReq('http://x/tags', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await tagsListRoute.POST(
      makeReq('http://x/tags', {
        method: 'POST',
        body: JSON.stringify({ name: 'x', slug: 'x' }),
      }),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    const res = await tagsListRoute.POST(
      makeReq('http://x/tags', {
        method: 'POST',
        body: JSON.stringify({ slug: 'has-slug' }),
      }),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Name and slug are required');
  });

  it('returns 400 when slug is empty / whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    const res = await tagsListRoute.POST(
      makeReq('http://x/tags', {
        method: 'POST',
        body: JSON.stringify({ name: 'New', slug: '   ' }),
      }),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Name and slug are required');
  });

  it('returns 400 when slug already exists for this site', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    selectQueue.push([{ id: 5 }]); // existing slug
    const res = await tagsListRoute.POST(
      makeReq('http://x/tags', {
        method: 'POST',
        body: JSON.stringify({ name: 'New', slug: 'taken' }),
      }),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('A tag with this slug already exists');
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 201 with the inserted tag on the happy path', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 99 });
    selectQueue.push([]); // no slug conflict
    insertReturnQueue.push([
      { id: 10, name: 'New', slug: 'new', websiteId: 99 },
    ]);
    const res = await tagsListRoute.POST(
      makeReq('http://x/tags', {
        method: 'POST',
        body: JSON.stringify({ name: '  New  ', slug: '  new  ' }),
      }),
      { params: Promise.resolve({ siteId: '10' }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 10, name: 'New', slug: 'new' });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('tags');
    expect(insertCalls[0].values).toMatchObject({
      name: 'New',
      slug: 'new',
      websiteId: 99,
    });
  });
});

// ===========================================================================
// /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/[termId]
// (PUT, DELETE)
// ===========================================================================

describe('PUT /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/[termId]', () => {
  it('returns 404 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await termsIdRoute.PUT(
      makeReq('http://x/terms/3', { method: 'PUT', body: '{}' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await termsIdRoute.PUT(
      makeReq('http://x/terms/3', { method: 'PUT', body: '{}' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when site not found for client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // clientWebsites lookup empty
    const res = await termsIdRoute.PUT(
      makeReq('http://x/terms/3', { method: 'PUT', body: '{}' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when taxonomy not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([]); // taxonomy lookup empty
    const res = await termsIdRoute.PUT(
      makeReq('http://x/terms/3', { method: 'PUT', body: '{}' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when term not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([]); // term lookup empty
    const res = await termsIdRoute.PUT(
      makeReq('http://x/terms/3', { method: 'PUT', body: '{}' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and patches all fields on the happy path', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([
      {
        id: 3,
        taxonomyId: 20,
        name: 'old',
        slug: 'old',
        description: 'old-desc',
        color: '#000',
        parentId: null,
      },
    ]); // term
    updateReturnQueue.push([
      {
        id: 3,
        name: 'new',
        slug: 'new',
        description: 'new-desc',
        color: '#fff',
        parentId: 7,
      },
    ]);
    const res = await termsIdRoute.PUT(
      makeReq('http://x/terms/3', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'new',
          slug: 'new',
          description: 'new-desc',
          color: '#fff',
          parentId: 7,
        }),
      }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 3, name: 'new', slug: 'new' });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('taxonomyTerms');
    expect(updateCalls[0].patch).toMatchObject({
      name: 'new',
      slug: 'new',
      description: 'new-desc',
      color: '#fff',
      parentId: 7,
    });
  });

  it('keeps existing values when body omits keys; nullifies on empty string', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([
      {
        id: 3,
        taxonomyId: 20,
        name: 'keep-name',
        slug: 'keep-slug',
        description: 'keep-desc',
        color: '#aaa',
        parentId: 4,
      },
    ]);
    updateReturnQueue.push([{ id: 3 }]);
    // Body: undefined name/slug, empty-string description & color => nulled,
    // undefined parentId => keep existing
    const res = await termsIdRoute.PUT(
      makeReq('http://x/terms/3', {
        method: 'PUT',
        body: JSON.stringify({ description: '', color: '' }),
      }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({
      name: 'keep-name',
      slug: 'keep-slug',
      description: null,
      color: null,
      parentId: 4,
    });
  });
});

describe('DELETE /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms/[termId]', () => {
  it('returns 404 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await termsIdRoute.DELETE(
      makeReq('http://x/terms/3', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when verifyTermAccess cannot resolve the term', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([]); // term missing
    const res = await termsIdRoute.DELETE(
      makeReq('http://x/terms/3', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and deletes the term on the happy path', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([{ id: 3, taxonomyId: 20, name: 'x' }]); // term
    const res = await termsIdRoute.DELETE(
      makeReq('http://x/terms/3', { method: 'DELETE' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20', termId: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('taxonomyTerms');
  });
});

// ===========================================================================
// /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms  (GET, POST)
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms', () => {
  it('returns 404 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await termsListRoute.GET(
      makeReq('http://x/terms'),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await termsListRoute.GET(
      makeReq('http://x/terms'),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when site not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // site missing
    const res = await termsListRoute.GET(
      makeReq('http://x/terms'),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when taxonomy not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([]); // taxonomy missing
    const res = await termsListRoute.GET(
      makeReq('http://x/terms'),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with the terms list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([
      { id: 1, name: 'A', slug: 'a', taxonomyId: 20 },
      { id: 2, name: 'B', slug: 'b', taxonomyId: 20 },
    ]);
    const res = await termsListRoute.GET(
      makeReq('http://x/terms'),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ id: 1, name: 'A' });
  });

  it('accepts built-in global taxonomies (websiteId IS NULL branch)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, builtIn: true, websiteId: null }]); // global taxonomy
    selectQueue.push([{ id: 7, name: 'Global Term', taxonomyId: 20 }]);
    const res = await termsListRoute.GET(
      makeReq('http://x/terms'),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].name).toBe('Global Term');
  });
});

describe('POST /api/portal/cms/websites/[siteId]/taxonomies/[taxonomyId]/terms', () => {
  it('returns 404 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await termsListRoute.POST(
      makeReq('http://x/terms', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name or slug is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    const res = await termsListRoute.POST(
      makeReq('http://x/terms', {
        method: 'POST',
        body: JSON.stringify({ name: 'X' }), // missing slug
      }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Name and slug are required');
  });

  it('returns 409 when a term with the slug already exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([{ id: 5 }]); // existing term with slug
    const res = await termsListRoute.POST(
      makeReq('http://x/terms', {
        method: 'POST',
        body: JSON.stringify({ name: 'X', slug: 'taken' }),
      }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toBe('A term with this slug already exists');
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 201 with the inserted term on the happy path', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([]); // no slug conflict
    insertReturnQueue.push([
      {
        id: 11,
        taxonomyId: 20,
        name: 'New',
        slug: 'new',
        description: 'desc',
        color: '#abc',
        parentId: 4,
        sortOrder: 0,
      },
    ]);
    const res = await termsListRoute.POST(
      makeReq('http://x/terms', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New',
          slug: 'new',
          description: 'desc',
          color: '#abc',
          parentId: 4,
        }),
      }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 11, name: 'New', slug: 'new' });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('taxonomyTerms');
    expect(insertCalls[0].values).toMatchObject({
      taxonomyId: 20,
      name: 'New',
      slug: 'new',
      description: 'desc',
      color: '#abc',
      parentId: 4,
      sortOrder: 0,
    });
  });

  it('normalizes empty optional fields to null on insert', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 99 }]); // site
    selectQueue.push([{ id: 20, websiteId: 99 }]); // taxonomy
    selectQueue.push([]); // no conflict
    insertReturnQueue.push([{ id: 12, name: 'Plain', slug: 'plain' }]);
    const res = await termsListRoute.POST(
      makeReq('http://x/terms', {
        method: 'POST',
        body: JSON.stringify({ name: 'Plain', slug: 'plain' }),
      }),
      { params: Promise.resolve({ siteId: '10', taxonomyId: '20' }) },
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({
      taxonomyId: 20,
      name: 'Plain',
      slug: 'plain',
      description: null,
      color: null,
      parentId: null,
      sortOrder: 0,
    });
  });
});
