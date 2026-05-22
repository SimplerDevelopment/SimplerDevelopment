// @vitest-environment node
/**
 * Batch 34f — unit tests for 4 route.ts files.
 *
 * Routes covered:
 *  - app/api/posts/[id]/schedule/route.ts                       (PATCH)
 *  - app/api/public/ab/event/route.ts                           (POST)
 *  - app/api/public/booking/[slug]/add-ons/route.ts             (GET)
 *  - app/api/public/booking/[slug]/route.ts                     (GET)
 *
 * Strategy: heavy mocking — db.select() materializes from a queue of
 * pre-staged result rows; chain methods are passthroughs that resolve
 * to the next queue entry on either await or terminal call (limit,
 * orderBy, innerJoin, etc.). db.insert/update/delete capture writes.
 * Branding helpers are stubbed so the public booking route is fully
 * deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const getBrandingByBookingPageSlugMock = vi.fn();
const brandingToCssVarsMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandingByBookingPageSlug: (...args: unknown[]) => getBrandingByBookingPageSlugMock(...args),
  brandingToCssVars: (...args: unknown[]) => brandingToCssVarsMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
}));

// schema — proxy tables, columns are objects.
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
  return {
    posts: wrap('posts'),
    abEvents: wrap('abEvents'),
    abExperiments: wrap('abExperiments'),
    bookingPages: wrap('bookingPages'),
    bookingPageMembers: wrap('bookingPageMembers'),
    bookingAddOns: wrap('bookingAddOns'),
    products: wrap('products'),
    productVariants: wrap('productVariants'),
    productImages: wrap('productImages'),
    users: wrap('users'),
  };
});

// ---------------------------------------------------------------------------
// db mock: select queue + insert/update/delete capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
interface DeleteCall {
  table: string;
  filter: unknown;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        return {
          returning() {
            return Promise.resolve([]);
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return {
          returning() {
            return Promise.resolve([]);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            const rows = updateReturnQueue.shift() ?? [];
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
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

  return {
    db: {
      select() {
        return buildSelect();
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const scheduleRoute = await import('@/app/api/posts/[id]/schedule/route');
const abEventRoute = await import('@/app/api/public/ab/event/route');
const addOnsRoute = await import('@/app/api/public/booking/[slug]/add-ons/route');
const bookingRoute = await import('@/app/api/public/booking/[slug]/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawReq(url: string, method: string, body: string): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  deleteCalls.length = 0;
  updateCalls.length = 0;
  getBrandingByBookingPageSlugMock.mockReset();
  brandingToCssVarsMock.mockReset();
  // Silence expected error logs
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

// ===========================================================================
// PATCH /api/posts/[id]/schedule
// ===========================================================================

describe('PATCH /api/posts/[id]/schedule', () => {
  it('schedules a post (publishedAt + published true)', async () => {
    const updated = {
      id: 42,
      publishedAt: new Date('2026-06-01T12:00:00.000Z'),
      published: true,
    };
    updateReturnQueue.push([updated]);

    const res = await scheduleRoute.PATCH(
      makeJsonReq('http://x/posts/42/schedule', 'PATCH', {
        publishedAt: '2026-06-01T12:00:00.000Z',
        published: true,
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('posts');
    expect(updateCalls[0].patch.publishedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.published).toBe(true);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('accepts null publishedAt (unscheduling)', async () => {
    updateReturnQueue.push([{ id: 7, publishedAt: null }]);

    const res = await scheduleRoute.PATCH(
      makeJsonReq('http://x/posts/7/schedule', 'PATCH', {
        publishedAt: null,
      }) as never,
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.publishedAt).toBeNull();
    // published not provided → not in patch
    expect('published' in updateCalls[0].patch).toBe(false);
  });

  it('omits published from patch when not provided', async () => {
    updateReturnQueue.push([{ id: 1 }]);
    const res = await scheduleRoute.PATCH(
      makeJsonReq('http://x/posts/1/schedule', 'PATCH', {
        publishedAt: '2026-07-01T00:00:00.000Z',
      }) as never,
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    expect('published' in updateCalls[0].patch).toBe(false);
  });

  it('includes published=false when explicitly provided', async () => {
    updateReturnQueue.push([{ id: 1 }]);
    const res = await scheduleRoute.PATCH(
      makeJsonReq('http://x/posts/1/schedule', 'PATCH', {
        publishedAt: null,
        published: false,
      }) as never,
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.published).toBe(false);
  });

  it('returns 404 when post not found', async () => {
    updateReturnQueue.push([]);
    const res = await scheduleRoute.PATCH(
      makeJsonReq('http://x/posts/999/schedule', 'PATCH', {
        publishedAt: '2026-06-01T12:00:00.000Z',
      }) as never,
      { params: Promise.resolve({ id: '999' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Post not found');
  });

  it('returns 400 on zod validation failure (bad datetime)', async () => {
    const res = await scheduleRoute.PATCH(
      makeJsonReq('http://x/posts/1/schedule', 'PATCH', {
        publishedAt: 'not-a-date',
      }) as never,
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 400 on zod validation failure (missing publishedAt)', async () => {
    const res = await scheduleRoute.PATCH(
      makeJsonReq('http://x/posts/1/schedule', 'PATCH', {}) as never,
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
  });

  it('returns 500 on unexpected error (invalid JSON body)', async () => {
    const res = await scheduleRoute.PATCH(
      makeRawReq('http://x/posts/1/schedule', 'PATCH', '{not json') as never,
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to schedule post');
  });
});

// ===========================================================================
// POST /api/public/ab/event
// ===========================================================================

describe('POST /api/public/ab/event', () => {
  const VALID_VISITOR = 'visitor-abcdef12';

  it('returns 400 on invalid JSON body', async () => {
    const res = await abEventRoute.POST(
      makeRawReq('http://x/ab/event', 'POST', '{not json'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('returns 400 when body is null', async () => {
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', null),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
  });

  it('returns 400 when experimentId is invalid (NaN)', async () => {
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 'abc',
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_experiment_id');
  });

  it('returns 400 when experimentId <= 0', async () => {
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 0,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_experiment_id');
  });

  it('returns 400 when variantKey is empty', async () => {
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: '',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_payload');
  });

  it('returns 400 when kind is not allowed', async () => {
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'click',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_payload');
  });

  it('returns 400 when visitorId fails regex (too short)', async () => {
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'A',
        visitorId: 'short',
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_visitor');
  });

  it('returns 404 when experiment does not exist', async () => {
    selectQueue.push([]); // experiment lookup empty
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 99,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('returns 409 when experiment status is draft', async () => {
    selectQueue.push([{ id: 1, status: 'draft' }]);
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('not_active');
  });

  it('returns 409 when experiment status is archived', async () => {
    selectQueue.push([{ id: 1, status: 'archived' }]);
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('not_active');
  });

  it('returns duplicated=true when an event already exists', async () => {
    selectQueue.push([{ id: 1, status: 'running' }]); // experiment lookup
    selectQueue.push([{ id: 99 }]); // existing event found

    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ duplicated: true });
    expect(insertCalls).toHaveLength(0);
  });

  it('records a new event when none exists (running)', async () => {
    selectQueue.push([{ id: 1, status: 'running' }]); // experiment
    selectQueue.push([]); // no existing event

    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ recorded: true });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('abEvents');
    expect(insertCalls[0].values).toEqual({
      experimentId: 1,
      variantKey: 'A',
      visitorId: VALID_VISITOR,
      kind: 'goal',
    });
  });

  it('accepts experiments with status=completed and records the event', async () => {
    selectQueue.push([{ id: 1, status: 'completed' }]);
    selectQueue.push([]); // no existing
    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'view',
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ recorded: true });
    expect(insertCalls[0].values).toMatchObject({ kind: 'view' });
  });

  it('truncates variantKey to 8 chars', async () => {
    selectQueue.push([{ id: 1, status: 'running' }]);
    selectQueue.push([]);

    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'variant-key-too-long',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(200);
    expect((insertCalls[0].values as Record<string, unknown>).variantKey).toBe('variant-');
  });

  it('coerces string experimentId to number', async () => {
    selectQueue.push([{ id: 1, status: 'running' }]);
    selectQueue.push([]);

    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: '5',
        variantKey: 'A',
        visitorId: VALID_VISITOR,
        kind: 'goal',
      }),
    );
    expect(res.status).toBe(200);
    expect((insertCalls[0].values as Record<string, unknown>).experimentId).toBe(5);
  });

  it('defaults kind to "goal" when missing-but-empty becomes invalid', async () => {
    // When kind is omitted entirely, payload.kind is undefined → defaults to 'goal'.
    selectQueue.push([{ id: 1, status: 'running' }]);
    selectQueue.push([]);

    const res = await abEventRoute.POST(
      makeJsonReq('http://x/ab/event', 'POST', {
        experimentId: 1,
        variantKey: 'A',
        visitorId: VALID_VISITOR,
      }),
    );
    expect(res.status).toBe(200);
    expect((insertCalls[0].values as Record<string, unknown>).kind).toBe('goal');
  });
});

// ===========================================================================
// GET /api/public/booking/[slug]/add-ons
// ===========================================================================

describe('GET /api/public/booking/[slug]/add-ons', () => {
  it('returns 404 when booking page not found / inactive', async () => {
    selectQueue.push([]); // bookingPages lookup
    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Booking page not found');
  });

  it('returns empty data array when add-ons disabled on page', async () => {
    selectQueue.push([{ id: 1, enableAddOns: false }]);
    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns custom add-ons when source=custom', async () => {
    selectQueue.push([{ id: 1, enableAddOns: true }]); // bookingPages
    selectQueue.push([
      {
        id: 10,
        source: 'custom',
        productId: null,
        variantId: null,
        name: 'Custom Add-on',
        description: 'extra',
        price: 1500,
        image: 'img.png',
        maxQuantity: 3,
      },
    ]); // bookingAddOns

    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      {
        id: 10,
        source: 'custom',
        name: 'Custom Add-on',
        description: 'extra',
        price: 1500,
        image: 'img.png',
        variantName: null,
        maxQuantity: 3,
      },
    ]);
  });

  it('resolves product-linked add-on with product fields + image', async () => {
    selectQueue.push([{ id: 1, enableAddOns: true }]); // bookingPages
    selectQueue.push([
      {
        id: 11,
        source: 'product',
        productId: 50,
        variantId: null,
        name: null,
        description: null,
        price: null,
        image: null,
        maxQuantity: 5,
      },
    ]); // bookingAddOns
    selectQueue.push([
      {
        id: 50,
        name: 'Widget',
        shortDescription: 'short',
        description: 'long',
        price: 999,
        status: 'active',
      },
    ]); // products
    selectQueue.push([{ url: 'product.jpg' }]); // productImages

    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      {
        id: 11,
        source: 'product',
        name: 'Widget',
        description: 'short', // shortDescription preferred
        price: 999,
        image: 'product.jpg',
        variantName: null,
        maxQuantity: 5,
      },
    ]);
  });

  it('falls back to long description when shortDescription is missing', async () => {
    selectQueue.push([{ id: 1, enableAddOns: true }]);
    selectQueue.push([
      {
        id: 11,
        source: 'product',
        productId: 50,
        variantId: null,
        maxQuantity: 5,
      },
    ]);
    selectQueue.push([
      {
        id: 50,
        name: 'Widget',
        shortDescription: null,
        description: 'long-desc',
        price: 999,
        status: 'active',
      },
    ]);
    selectQueue.push([]); // no images

    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].description).toBe('long-desc');
    expect(body.data[0].image).toBeNull();
  });

  it('uses variant price+name when variantId is set', async () => {
    selectQueue.push([{ id: 1, enableAddOns: true }]);
    selectQueue.push([
      {
        id: 11,
        source: 'product',
        productId: 50,
        variantId: 77,
        maxQuantity: 5,
      },
    ]);
    selectQueue.push([
      {
        id: 50,
        name: 'Widget',
        shortDescription: 'desc',
        description: 'long',
        price: 999,
        status: 'active',
      },
    ]);
    selectQueue.push([
      { id: 77, name: 'Large', price: 1499, active: true },
    ]);
    selectQueue.push([]); // no images

    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].price).toBe(1499);
    expect(body.data[0].variantName).toBe('Large');
  });

  it('falls back to product price when variant price is null', async () => {
    selectQueue.push([{ id: 1, enableAddOns: true }]);
    selectQueue.push([
      {
        id: 11,
        source: 'product',
        productId: 50,
        variantId: 77,
        maxQuantity: 5,
      },
    ]);
    selectQueue.push([
      {
        id: 50,
        name: 'Widget',
        shortDescription: 'desc',
        description: 'long',
        price: 999,
        status: 'active',
      },
    ]);
    selectQueue.push([
      { id: 77, name: 'Large', price: null, active: true },
    ]);
    selectQueue.push([]); // no images

    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].price).toBe(999);
    expect(body.data[0].variantName).toBe('Large');
  });

  it('filters out product-linked add-on when product is gone (returns null + filter)', async () => {
    selectQueue.push([{ id: 1, enableAddOns: true }]);
    selectQueue.push([
      {
        id: 11,
        source: 'product',
        productId: 50,
        variantId: null,
        maxQuantity: 5,
      },
    ]);
    selectQueue.push([]); // product lookup empty

    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 500 when the database throws', async () => {
    // Force the booking-page lookup to reject by using a queue that
    // exhausts and then putting a poison value via mocking select once.
    // Simpler approach: make selectQueue.shift throw on first call.
    const orig = selectQueue;
    selectQueue = new Proxy([], {
      get() {
        throw new Error('db boom');
      },
    }) as unknown as typeof selectQueue;

    const res = await addOnsRoute.GET(
      makeReq('http://x/booking/foo/add-ons'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Internal server error');

    selectQueue = orig;
  });
});

// ===========================================================================
// GET /api/public/booking/[slug]
// ===========================================================================

describe('GET /api/public/booking/[slug]', () => {
  it('returns 404 when booking page not found / inactive', async () => {
    selectQueue.push([]);
    const res = await bookingRoute.GET(
      makeReq('http://x/booking/foo'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Booking page not found');
  });

  it('returns merged branding from per-page styling (overrides everything)', async () => {
    selectQueue.push([
      {
        id: 1,
        title: 'Discovery Call',
        slug: 'foo',
        description: 'desc',
        duration: 30,
        timezone: 'America/New_York',
        availability: { mon: [] },
        questions: [],
        color: '#000',
        styling: {
          primaryColor: '#111111',
          secondaryColor: '#222222',
          accentColor: '#333333',
          backgroundColor: '#fefefe',
          textColor: '#101010',
          headingFont: 'Serif',
          bodyFont: 'Sans',
          hideLogo: true,
          hideTitle: true,
          borderRadius: '8px',
          buttonPrimaryBg: '#444',
          buttonPrimaryText: '#555',
          buttonBorderRadius: '4px',
        },
        maxAdvanceDays: 60,
        minNoticeMins: 60,
        price: 0,
        priceLabel: null,
        maxGuests: 1,
        enableAddOns: false,
        enableGiftCertificates: false,
        enableDiscountCodes: false,
        enableWaivers: false,
        requireWaiverBeforeBooking: false,
        waiverContent: null,
        checkinEnabled: false,
        allowStaffSelection: false,
        bookingType: 'one-on-one',
        groupCapacity: null,
      },
    ]);

    getBrandingByBookingPageSlugMock.mockResolvedValue({
      primaryColor: '#abcdef',
      secondaryColor: '#abcdef',
      accentColor: '#abcdef',
      backgroundColor: '#abcdef',
      textColor: '#abcdef',
      headingFont: 'IgnoredFont',
      bodyFont: 'IgnoredFont',
      logoUrl: 'logo.png',
      logoRectUrl: 'logo-rect.png',
      borderRadius: 'IGN',
      buttonStyle: { primaryBg: '#ign', primaryText: '#ign', borderRadius: 'IGN' },
    });
    brandingToCssVarsMock.mockReturnValue({ '--primary': '#abcdef' });

    const res = await bookingRoute.GET(
      makeReq('http://x/booking/foo'),
      { params: Promise.resolve({ slug: 'foo' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(body.data.styling).toBeUndefined(); // raw styling not leaked
    expect(body.data.hideTitle).toBe(true);
    expect(body.data.branding).toEqual({
      primaryColor: '#111111',
      secondaryColor: '#222222',
      accentColor: '#333333',
      backgroundColor: '#fefefe',
      textColor: '#101010',
      headingFont: 'Serif',
      bodyFont: 'Sans',
      logoUrl: '', // hideLogo=true
      borderRadius: '8px',
      buttonStyle: {
        primaryBg: '#444',
        primaryText: '#555',
        borderRadius: '4px',
      },
    });
    expect(body.data.cssVars).toEqual({ '--primary': '#abcdef' });
    expect(body.data.staffMembers).toEqual([]);
  });

  it('falls back to branding profile when styling fields are empty', async () => {
    selectQueue.push([
      {
        id: 2,
        title: 'Call',
        slug: 'bar',
        description: null,
        duration: 30,
        timezone: 'UTC',
        availability: {},
        questions: [],
        color: '#abc',
        styling: {},
        maxAdvanceDays: null,
        minNoticeMins: null,
        price: null,
        priceLabel: null,
        maxGuests: null,
        enableAddOns: false,
        enableGiftCertificates: false,
        enableDiscountCodes: false,
        enableWaivers: false,
        requireWaiverBeforeBooking: false,
        waiverContent: null,
        checkinEnabled: false,
        allowStaffSelection: false,
        bookingType: 'one-on-one',
        groupCapacity: null,
      },
    ]);
    getBrandingByBookingPageSlugMock.mockResolvedValue({
      primaryColor: '#b1',
      secondaryColor: '#b2',
      accentColor: '#b3',
      backgroundColor: '#b4',
      textColor: '#b5',
      headingFont: 'BrandHead',
      bodyFont: 'BrandBody',
      logoUrl: 'brand-logo.png',
      logoRectUrl: 'brand-rect.png',
      borderRadius: '12px',
      buttonStyle: { primaryBg: '#bb1', primaryText: '#bb2', borderRadius: '6px' },
    });
    brandingToCssVarsMock.mockReturnValue({ '--brand': '#b1' });

    const res = await bookingRoute.GET(
      makeReq('http://x/booking/bar'),
      { params: Promise.resolve({ slug: 'bar' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.branding.primaryColor).toBe('#b1');
    expect(body.data.branding.headingFont).toBe('BrandHead');
    expect(body.data.branding.logoUrl).toBe('brand-logo.png');
    expect(body.data.branding.buttonStyle).toEqual({
      primaryBg: '#bb1',
      primaryText: '#bb2',
      borderRadius: '6px',
    });
    expect(body.data.cssVars).toEqual({ '--brand': '#b1' });
    expect(body.data.hideTitle).toBe(false);
  });

  it('falls back to page.color then defaults when no branding + no styling', async () => {
    selectQueue.push([
      {
        id: 3,
        title: 'Call',
        slug: 'baz',
        description: null,
        duration: 30,
        timezone: 'UTC',
        availability: {},
        questions: [],
        color: '#deadbe',
        styling: null,
        maxAdvanceDays: null,
        minNoticeMins: null,
        price: null,
        priceLabel: null,
        maxGuests: null,
        enableAddOns: false,
        enableGiftCertificates: false,
        enableDiscountCodes: false,
        enableWaivers: false,
        requireWaiverBeforeBooking: false,
        waiverContent: null,
        checkinEnabled: false,
        allowStaffSelection: false,
        bookingType: 'one-on-one',
        groupCapacity: null,
      },
    ]);
    getBrandingByBookingPageSlugMock.mockResolvedValue(null);

    const res = await bookingRoute.GET(
      makeReq('http://x/booking/baz'),
      { params: Promise.resolve({ slug: 'baz' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.branding.primaryColor).toBe('#deadbe');
    expect(body.data.branding.secondaryColor).toBe('#1e40af');
    expect(body.data.branding.accentColor).toBe('#f59e0b');
    expect(body.data.branding.backgroundColor).toBe('#ffffff');
    expect(body.data.branding.textColor).toBe('#111827');
    expect(body.data.branding.headingFont).toBe('');
    expect(body.data.branding.bodyFont).toBe('');
    expect(body.data.branding.logoUrl).toBe('');
    expect(body.data.cssVars).toBeUndefined();
    expect(body.data.hideTitle).toBe(false);
  });

  it('uses ultimate default color when page.color is also empty', async () => {
    selectQueue.push([
      {
        id: 4,
        title: 'Call',
        slug: 'qux',
        styling: {},
        color: null,
        allowStaffSelection: false,
      },
    ]);
    getBrandingByBookingPageSlugMock.mockResolvedValue(null);

    const res = await bookingRoute.GET(
      makeReq('http://x/booking/qux'),
      { params: Promise.resolve({ slug: 'qux' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.branding.primaryColor).toBe('#2563eb');
  });

  it('uses logoRectUrl when logoUrl missing on branding', async () => {
    selectQueue.push([
      {
        id: 5,
        slug: 'r',
        styling: {},
        color: null,
        allowStaffSelection: false,
      },
    ]);
    getBrandingByBookingPageSlugMock.mockResolvedValue({
      primaryColor: '#1',
      logoUrl: '',
      logoRectUrl: 'rect.png',
      buttonStyle: {},
    });
    brandingToCssVarsMock.mockReturnValue({});

    const res = await bookingRoute.GET(
      makeReq('http://x/booking/r'),
      { params: Promise.resolve({ slug: 'r' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.branding.logoUrl).toBe('rect.png');
  });

  it('loads staff members when allowStaffSelection is true', async () => {
    selectQueue.push([
      {
        id: 9,
        slug: 'staffed',
        styling: {},
        color: null,
        allowStaffSelection: true,
      },
    ]);
    getBrandingByBookingPageSlugMock.mockResolvedValue(null);

    // staff member query (innerJoin → terminal where, awaited as array)
    selectQueue.push([
      { userId: 1, displayName: 'Alice', color: '#a', userName: 'alice@x' },
      { userId: 2, displayName: null, color: null, userName: 'Bob' },
    ]);

    const res = await bookingRoute.GET(
      makeReq('http://x/booking/staffed'),
      { params: Promise.resolve({ slug: 'staffed' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.allowStaffSelection).toBe(true);
    expect(body.data.staffMembers).toEqual([
      { userId: 1, name: 'Alice', color: '#a' },
      { userId: 2, name: 'Bob', color: null },
    ]);
  });
});
