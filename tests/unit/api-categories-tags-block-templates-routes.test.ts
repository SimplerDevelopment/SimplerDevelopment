// @vitest-environment node
/**
 * Unit tests for:
 *  - app/api/categories/[id]/route.ts (GET / PUT / DELETE)
 *  - app/api/tags/[id]/route.ts (GET / PUT / DELETE)
 *  - app/api/block-templates/route.ts (GET / POST)
 *
 * Strategy: mock drizzle-orm helpers, schema tables, and @/lib/db with a
 * queue-driven select() plus update/delete/insert builders. Handlers are
 * pure async — no auth, no other deps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---- mocks (declared before importing the routes) ----

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  desc: (col: unknown) => ({ op: 'desc', col }),
  ilike: (col: unknown, val: unknown) => ({ op: 'ilike', col, val }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
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
  return {
    categories: wrap('categories'),
    tags: wrap('tags'),
    blockTemplates: wrap('blockTemplates'),
  };
});

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
interface InsertCall {
  table: string;
  values: Record<string, unknown>;
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];
const insertCalls: InsertCall[] = [];
let nextSelectThrows: Error | null = null;
let nextUpdateThrows: Error | null = null;
let nextDeleteThrows: Error | null = null;
let nextInsertThrows: Error | null = null;

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
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
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy']) {
      chain[m] = () => chain;
    }
    chain.limit = () => {
      materialize();
      return {
        offset() {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materializedPromise!.then(onF, onR);
            },
          };
        },
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.offset = () => {
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
            return {
              returning() {
                if (nextUpdateThrows) {
                  const err = nextUpdateThrows;
                  nextUpdateThrows = null;
                  return Promise.reject(err);
                }
                const rows = updateReturnQueue.shift() ?? [];
                updateCalls.push({
                  table: table.__table,
                  patch,
                  filter,
                  returnedRows: rows,
                });
                return Promise.resolve(rows.map((r) => ({ ...r })));
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
        return {
          returning() {
            if (nextDeleteThrows) {
              const err = nextDeleteThrows;
              nextDeleteThrows = null;
              return Promise.reject(err);
            }
            const rows = deleteReturnQueue.shift() ?? [];
            deleteCalls.push({
              table: table.__table,
              filter,
              returnedRows: rows,
            });
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(values: Record<string, unknown>) {
        return {
          returning() {
            if (nextInsertThrows) {
              const err = nextInsertThrows;
              nextInsertThrows = null;
              return Promise.reject(err);
            }
            const rows = insertReturnQueue.shift() ?? [];
            insertCalls.push({
              table: table.__table,
              values,
              returnedRows: rows,
            });
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

// ---- modules under test (after mocks) ----

const categoriesRoute = await import('@/app/api/categories/[id]/route');
const tagsRoute = await import('@/app/api/tags/[id]/route');
const blockTemplatesListRoute = await import('@/app/api/block-templates/route');

// ---- helpers ----

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertReturnQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  insertCalls.length = 0;
  nextSelectThrows = null;
  nextUpdateThrows = null;
  nextDeleteThrows = null;
  nextInsertThrows = null;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// /api/categories/[id]
// ---------------------------------------------------------------------------

describe('GET /api/categories/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await categoriesRoute.GET(
      new NextRequest('http://x'),
      makeParams('not-a-number'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Invalid category ID' });
  });

  it('returns 404 when no category is found', async () => {
    selectQueue.push([]);
    const res = await categoriesRoute.GET(
      new NextRequest('http://x'),
      makeParams('99'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Category not found' });
  });

  it('returns 200 with the category', async () => {
    selectQueue.push([{ id: 1, name: 'News', slug: 'news' }]);
    const res = await categoriesRoute.GET(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 1, name: 'News', slug: 'news' });
  });

  it('returns 500 when select throws', async () => {
    nextSelectThrows = new Error('boom');
    const res = await categoriesRoute.GET(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: 'Failed to fetch category',
    });
  });
});

describe('PUT /api/categories/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await categoriesRoute.PUT(
      makeJsonRequest('http://x/api/categories/abc', 'PUT', { name: 'X' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid category ID');
  });

  it('returns 400 with zod validation error for an empty name', async () => {
    const res = await categoriesRoute.PUT(
      makeJsonRequest('http://x/api/categories/1', 'PUT', { name: '' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 404 when the category does not exist', async () => {
    updateReturnQueue.push([]);
    const res = await categoriesRoute.PUT(
      makeJsonRequest('http://x/api/categories/1', 'PUT', { name: 'Updated' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Category not found');
  });

  it('returns 200 with the updated category', async () => {
    updateReturnQueue.push([
      { id: 1, name: 'Updated', slug: 'updated', description: 'desc' },
    ]);
    const res = await categoriesRoute.PUT(
      makeJsonRequest('http://x/api/categories/1', 'PUT', {
        name: 'Updated',
        slug: 'updated',
        description: 'desc',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 1, name: 'Updated' });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('categories');
    expect(updateCalls[0].patch).toMatchObject({
      name: 'Updated',
      slug: 'updated',
      description: 'desc',
    });
  });

  it('returns 500 when the update throws (non-zod)', async () => {
    nextUpdateThrows = new Error('update kaboom');
    const res = await categoriesRoute.PUT(
      makeJsonRequest('http://x/api/categories/1', 'PUT', { name: 'X' }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: 'Failed to update category',
    });
  });
});

describe('DELETE /api/categories/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await categoriesRoute.DELETE(
      new NextRequest('http://x'),
      makeParams('NaN!'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid category ID');
  });

  it('returns 404 when the category does not exist', async () => {
    deleteReturnQueue.push([]);
    const res = await categoriesRoute.DELETE(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Category not found');
  });

  it('returns 200 and deletes the category', async () => {
    deleteReturnQueue.push([{ id: 1, name: 'Gone' }]);
    const res = await categoriesRoute.DELETE(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: 'Category deleted successfully',
    });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('categories');
  });

  it('returns 500 when the delete throws', async () => {
    nextDeleteThrows = new Error('delete boom');
    const res = await categoriesRoute.DELETE(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: 'Failed to delete category',
    });
  });
});

// ---------------------------------------------------------------------------
// /api/tags/[id]
// ---------------------------------------------------------------------------

describe('GET /api/tags/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await tagsRoute.GET(
      new NextRequest('http://x'),
      makeParams('xx'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Invalid tag ID' });
  });

  it('returns 404 when no tag is found', async () => {
    selectQueue.push([]);
    const res = await tagsRoute.GET(
      new NextRequest('http://x'),
      makeParams('99'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Tag not found');
  });

  it('returns 200 with the tag', async () => {
    selectQueue.push([{ id: 5, name: 'ai', slug: 'ai' }]);
    const res = await tagsRoute.GET(
      new NextRequest('http://x'),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: 5, name: 'ai' });
  });

  it('returns 500 when select throws', async () => {
    nextSelectThrows = new Error('boom');
    const res = await tagsRoute.GET(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to fetch tag');
  });
});

describe('PUT /api/tags/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await tagsRoute.PUT(
      makeJsonRequest('http://x/api/tags/abc', 'PUT', { name: 'X' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid tag ID');
  });

  it('returns 400 with zod validation error for an empty slug', async () => {
    const res = await tagsRoute.PUT(
      makeJsonRequest('http://x/api/tags/1', 'PUT', { slug: '' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 404 when the tag does not exist', async () => {
    updateReturnQueue.push([]);
    const res = await tagsRoute.PUT(
      makeJsonRequest('http://x/api/tags/1', 'PUT', { name: 'Updated' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Tag not found');
  });

  it('returns 200 with the updated tag', async () => {
    updateReturnQueue.push([{ id: 1, name: 'Updated', slug: 'updated' }]);
    const res = await tagsRoute.PUT(
      makeJsonRequest('http://x/api/tags/1', 'PUT', {
        name: 'Updated',
        slug: 'updated',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls[0].table).toBe('tags');
    expect(updateCalls[0].patch).toMatchObject({
      name: 'Updated',
      slug: 'updated',
    });
  });

  it('returns 500 when the update throws (non-zod)', async () => {
    nextUpdateThrows = new Error('update kaboom');
    const res = await tagsRoute.PUT(
      makeJsonRequest('http://x/api/tags/1', 'PUT', { name: 'X' }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to update tag');
  });
});

describe('DELETE /api/tags/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await tagsRoute.DELETE(
      new NextRequest('http://x'),
      makeParams('NaN!'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid tag ID');
  });

  it('returns 404 when the tag does not exist', async () => {
    deleteReturnQueue.push([]);
    const res = await tagsRoute.DELETE(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Tag not found');
  });

  it('returns 200 and deletes the tag', async () => {
    deleteReturnQueue.push([{ id: 1, name: 'gone' }]);
    const res = await tagsRoute.DELETE(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: 'Tag deleted successfully',
    });
    expect(deleteCalls[0].table).toBe('tags');
  });

  it('returns 500 when the delete throws', async () => {
    nextDeleteThrows = new Error('delete boom');
    const res = await tagsRoute.DELETE(
      new NextRequest('http://x'),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to delete tag');
  });
});

// ---------------------------------------------------------------------------
// /api/block-templates  (list + create)
// ---------------------------------------------------------------------------

describe('GET /api/block-templates', () => {
  it('returns 200 with no filters and default pagination', async () => {
    selectQueue.push([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    selectQueue.push([{ count: 2 }]);
    const req = new NextRequest('http://x/api/block-templates');
    const res = await blockTemplatesListRoute.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toEqual({ total: 2, limit: 50, offset: 0 });
  });

  it('returns 200 filtered by category', async () => {
    selectQueue.push([{ id: 3, name: 'C', category: 'hero' }]);
    selectQueue.push([{ count: 1 }]);
    const req = new NextRequest(
      'http://x/api/block-templates?category=hero',
    );
    const res = await blockTemplatesListRoute.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].category).toBe('hero');
  });

  it('returns 200 filtered by scope', async () => {
    selectQueue.push([{ id: 4, name: 'D', scope: 'global' }]);
    selectQueue.push([{ count: 1 }]);
    const req = new NextRequest(
      'http://x/api/block-templates?scope=global',
    );
    const res = await blockTemplatesListRoute.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].scope).toBe('global');
  });

  it('returns 200 filtered by search', async () => {
    selectQueue.push([{ id: 5, name: 'Hero block' }]);
    selectQueue.push([{ count: 1 }]);
    const req = new NextRequest(
      'http://x/api/block-templates?search=hero',
    );
    const res = await blockTemplatesListRoute.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].name).toBe('Hero block');
  });

  it('returns 200 with all filters combined and custom pagination', async () => {
    selectQueue.push([{ id: 6, name: 'X' }]);
    selectQueue.push([{ count: 42 }]);
    const req = new NextRequest(
      'http://x/api/block-templates?category=hero&scope=block&search=foo&limit=10&offset=20',
    );
    const res = await blockTemplatesListRoute.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ total: 42, limit: 10, offset: 20 });
  });

  it('returns 500 when select throws', async () => {
    nextSelectThrows = new Error('boom');
    const req = new NextRequest('http://x/api/block-templates');
    const res = await blockTemplatesListRoute.GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: 'Failed to fetch block templates',
    });
  });
});

describe('POST /api/block-templates', () => {
  it('returns 400 with validation error when name is missing', async () => {
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        slug: 'x',
        blocks: [{ type: 'heading' }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Validation error');
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 400 with validation error when blocks is empty', async () => {
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        name: 'X',
        slug: 'x',
        blocks: [],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation error');
  });

  it('returns 400 with validation error for invalid scope', async () => {
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        name: 'X',
        slug: 'x',
        scope: 'not-real',
        blocks: [{ type: 'heading' }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation error');
  });

  it('returns 409 when slug already exists', async () => {
    selectQueue.push([{ id: 1, slug: 'x' }]);
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        name: 'X',
        slug: 'x',
        blocks: [{ type: 'heading' }],
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('A template with this slug already exists');
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 201 and inserts the template on the happy path', async () => {
    selectQueue.push([]);
    insertReturnQueue.push([
      {
        id: 10,
        name: 'New',
        slug: 'new',
        category: 'custom',
        scope: 'block',
        blocks: [{ type: 'heading' }],
      },
    ]);
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        name: 'New',
        slug: 'new',
        blocks: [{ type: 'heading' }],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 10, name: 'New', slug: 'new' });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('blockTemplates');
    expect(insertCalls[0].values).toMatchObject({
      name: 'New',
      slug: 'new',
      category: 'custom',
      scope: 'block',
      description: null,
      thumbnail: null,
    });
    expect(insertCalls[0].values.tags).toEqual([]);
    expect(insertCalls[0].values.lockedFields).toEqual([]);
  });

  it('passes optional fields through (description, thumbnail, tags, lockedFields)', async () => {
    selectQueue.push([]);
    insertReturnQueue.push([{ id: 11 }]);
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        name: 'New',
        slug: 'new2',
        description: 'a thing',
        thumbnail: 'https://example.com/thumb.png',
        tags: ['hero', 'marketing'],
        lockedFields: ['title'],
        scope: 'section',
        category: 'marketing',
        blocks: [{ type: 'heading' }],
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({
      description: 'a thing',
      thumbnail: 'https://example.com/thumb.png',
      tags: ['hero', 'marketing'],
      lockedFields: ['title'],
      scope: 'section',
      category: 'marketing',
    });
  });

  it('accepts an empty-string thumbnail (literal "") via the zod union', async () => {
    selectQueue.push([]);
    insertReturnQueue.push([{ id: 12 }]);
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        name: 'New',
        slug: 'new3',
        thumbnail: '',
        blocks: [{ type: 'heading' }],
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values.thumbnail).toBe(null);
  });

  it('rejects a non-URL non-empty thumbnail with validation error', async () => {
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        name: 'New',
        slug: 'new4',
        thumbnail: 'not a url',
        blocks: [{ type: 'heading' }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation error');
  });

  it('returns 500 when the insert throws (non-zod)', async () => {
    selectQueue.push([]);
    nextInsertThrows = new Error('insert kaboom');
    const res = await blockTemplatesListRoute.POST(
      makeJsonRequest('http://x/api/block-templates', 'POST', {
        name: 'New',
        slug: 'new5',
        blocks: [{ type: 'heading' }],
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: 'Failed to create block template',
    });
  });
});
