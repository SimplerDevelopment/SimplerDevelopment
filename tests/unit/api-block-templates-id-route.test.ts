// @vitest-environment node
/**
 * Unit tests for app/api/block-templates/[id]/route.ts (GET / PUT / DELETE).
 *
 * Strategy:
 *  - drizzle-orm `eq` is stubbed to a plain marker object.
 *  - @/lib/db/schema tables are proxied so `blockTemplates.id` etc. return
 *    inert column markers.
 *  - @/lib/db is mocked with a queue-based select() (each chain materializes
 *    to the next queued row-array) plus update/delete builders that capture
 *    writes. Handlers are pure async — no auth, no other deps.
 *
 * Coverage covers: GET 400 invalid id, 404 not-found, 200 non-global,
 * 200 global with usageCount, 500 on throw; PUT 400 invalid id, 400 zod,
 * 404 not-found, 200 non-blocks update (no version bump), 200 blocks
 * update (version bump), 500 on throw; DELETE 400 invalid id, 409 with
 * usages, 200 success, 500 on throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---- mocks (declared before importing the route) ----

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
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
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    blockTemplates: wrap('blockTemplates'),
    blockTemplateUsages: wrap('blockTemplateUsages'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
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
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];
let nextSelectThrows: Error | null = null;
let nextUpdateThrows: Error | null = null;
let nextDeleteThrows: Error | null = null;

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
        if (nextDeleteThrows) {
          const err = nextDeleteThrows;
          nextDeleteThrows = null;
          return Promise.reject(err);
        }
        deleteCalls.push({ table: table.__table, filter });
        return Promise.resolve(undefined);
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
    },
  };
});

// ---- module under test (after mocks) ----

const { GET, PUT, DELETE } = await import('@/app/api/block-templates/[id]/route');

// ---- helpers ----

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/block-templates/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  nextSelectThrows = null;
  nextUpdateThrows = null;
  nextDeleteThrows = null;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/block-templates/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await GET(new NextRequest('http://x'), makeParams('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Invalid template ID' });
  });

  it('returns 404 when no template is found', async () => {
    selectQueue.push([]); // template lookup empty
    const res = await GET(new NextRequest('http://x'), makeParams('99'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Template not found' });
  });

  it('returns 200 with usageCount=0 for a non-global template', async () => {
    selectQueue.push([
      { id: 1, name: 'Hero', scope: 'block', version: 3 },
    ]);
    const res = await GET(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: 1,
      name: 'Hero',
      scope: 'block',
      version: 3,
      usageCount: 0,
    });
  });

  it('returns 200 with usageCount derived from usages length for global scope', async () => {
    selectQueue.push([
      { id: 7, name: 'Global Card', scope: 'global', version: 1 },
    ]);
    selectQueue.push([
      { id: 100, templateId: 7 },
      { id: 101, templateId: 7 },
      { id: 102, templateId: 7 },
    ]);
    const res = await GET(new NextRequest('http://x'), makeParams('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.usageCount).toBe(3);
    expect(body.data.scope).toBe('global');
  });

  it('returns 500 when the DB select throws', async () => {
    nextSelectThrows = new Error('db is dead');
    const res = await GET(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: 'Failed to fetch block template',
    });
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/block-templates/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await PUT(makePutRequest({ name: 'X' }), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid template ID');
  });

  it('returns 400 with zod validation error for an invalid scope', async () => {
    const res = await PUT(
      makePutRequest({ scope: 'not-a-real-scope' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Validation error');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('returns 400 with zod validation error when blocks is empty array', async () => {
    const res = await PUT(makePutRequest({ blocks: [] }), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation error');
  });

  it('returns 404 when the template does not exist', async () => {
    selectQueue.push([]); // existing lookup empty
    const res = await PUT(makePutRequest({ name: 'New' }), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Template not found');
  });

  it('updates non-blocks fields WITHOUT bumping version', async () => {
    selectQueue.push([{ id: 1, name: 'Old', version: 5 }]);
    updateReturnQueue.push([{ id: 1, name: 'Renamed', version: 5 }]);
    const res = await PUT(
      makePutRequest({ name: 'Renamed', description: 'desc' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 1, name: 'Renamed', version: 5 });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('blockTemplates');
    expect(updateCalls[0].patch).toMatchObject({
      name: 'Renamed',
      description: 'desc',
    });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.version).toBeUndefined();
  });

  it('bumps version by 1 when blocks are included in the patch', async () => {
    selectQueue.push([{ id: 1, name: 'X', version: 4 }]);
    updateReturnQueue.push([{ id: 1, name: 'X', version: 5 }]);
    const newBlocks = [{ type: 'heading', props: { text: 'hi' } }];
    const res = await PUT(
      makePutRequest({ blocks: newBlocks }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.version).toBe(5);
    expect(updateCalls[0].patch.blocks).toEqual(newBlocks);
  });

  it('accepts thumbnail empty string (literal "") via the zod union', async () => {
    selectQueue.push([{ id: 1, version: 1 }]);
    updateReturnQueue.push([{ id: 1, thumbnail: '' }]);
    const res = await PUT(makePutRequest({ thumbnail: '' }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.thumbnail).toBe('');
  });

  it('rejects an invalid (non-URL, non-empty) thumbnail', async () => {
    const res = await PUT(
      makePutRequest({ thumbnail: 'not a url' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation error');
  });

  it('returns 500 when the DB update throws (non-zod)', async () => {
    selectQueue.push([{ id: 1, version: 1 }]);
    nextUpdateThrows = new Error('update kaboom');
    const res = await PUT(makePutRequest({ name: 'X' }), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: 'Failed to update block template',
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/block-templates/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await DELETE(new NextRequest('http://x'), makeParams('NaN!'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid template ID');
  });

  it('returns 409 when the template still has usages', async () => {
    selectQueue.push([
      { id: 10, templateId: 1 },
      { id: 11, templateId: 1 },
    ]);
    const res = await DELETE(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Cannot delete: template is used in 2 post/);
    // No delete should have been issued
    expect(deleteCalls).toHaveLength(0);
  });

  it('returns 200 and deletes the template when there are no usages', async () => {
    selectQueue.push([]); // no usages
    const res = await DELETE(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, message: 'Template deleted' });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('blockTemplates');
  });

  it('returns 500 when the usage-count select throws', async () => {
    nextSelectThrows = new Error('select boom');
    const res = await DELETE(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: 'Failed to delete block template',
    });
  });

  it('returns 500 when the delete itself throws after a clean usage check', async () => {
    selectQueue.push([]); // no usages
    nextDeleteThrows = new Error('delete boom');
    const res = await DELETE(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to delete block template');
  });
});
