// @vitest-environment node
/**
 * Batch 31d — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/experiments/[id]/results/route.ts  (GET)
 *  - app/api/portal/experiments/[id]/variants/route.ts (POST, PATCH)
 *  - app/api/portal/github/callback/route.ts           (GET)
 *  - app/api/portal/github/connect/route.ts            (GET)
 *
 * Strategy: heavy mocking — db.select() returns a queued result row set;
 * chain methods return a thenable that materializes on `await`. db.insert /
 * db.update are mocked to capture writes and emit the next queued return
 * rows. The ab/access helper and ab/stats helper are mocked so we can drive
 * the experiments routes without touching real auth/aggregation logic. The
 * github routes mock next/headers, lib/portal-client, and global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

const authorizeExperimentForUserMock = vi.fn();
vi.mock('@/lib/ab/access', () => ({
  authorizeExperimentForUser: (...args: unknown[]) =>
    authorizeExperimentForUserMock(...args),
}));

const twoProportionZTestMock = vi.fn();
vi.mock('@/lib/ab/stats', () => ({
  twoProportionZTest: (...args: unknown[]) => twoProportionZTestMock(...args),
}));

// drizzle-orm — inert operator factories
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
    abExperiments: wrap('abExperiments'),
    abVariants: wrap('abVariants'),
    abEvents: wrap('abEvents'),
    githubConnections: wrap('githubConnections'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock
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

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
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

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = updateReturnQueue.shift() ?? [];
            const cloned = rows.map((r) => ({ ...r }));
            updateCalls.push({
              table: table.__table,
              patch,
              filter,
              returnedRows: cloned,
            });
            return {
              returning() {
                return Promise.resolve(cloned);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(cloned).then(onF, onR);
              },
            };
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
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const resultsRoute = await import(
  '@/app/api/portal/experiments/[id]/results/route'
);
const variantsRoute = await import(
  '@/app/api/portal/experiments/[id]/variants/route'
);
const githubCallbackRoute = await import(
  '@/app/api/portal/github/callback/route'
);
const githubConnectRoute = await import(
  '@/app/api/portal/github/connect/route'
);

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

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function fakeHeaders(map: Record<string, string>) {
  return {
    get: (k: string) => map[k.toLowerCase()] ?? null,
  };
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  headersMock.mockReset();
  authorizeExperimentForUserMock.mockReset();
  twoProportionZTestMock.mockReset();
});

// ===========================================================================
// GET /api/portal/experiments/:id/results
// ===========================================================================

describe('GET /api/portal/experiments/:id/results', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await resultsRoute.GET(
      makeReq('http://x/api/portal/experiments/9/results'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('returns 404 when user cannot access the experiment', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue(null);
    const res = await resultsRoute.GET(
      makeReq('http://x/api/portal/experiments/9/results'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('returns 404 when experiment row does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    // 1st select: experiments → empty
    selectQueue.push([]);
    const res = await resultsRoute.GET(
      makeReq('http://x/api/portal/experiments/9/results'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('returns experiment, stats, and comparisons (control "a" vs "b")', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    // 1st select: experiments → [experiment row]
    selectQueue.push([{ id: 9, name: 'Hero test' }]);
    // 2nd select: variants → 2 variants
    selectQueue.push([
      { key: 'a', label: 'Control' },
      { key: 'b', label: 'Challenger' },
    ]);
    // 3rd select: aggregates by variant + kind
    selectQueue.push([
      { variantKey: 'a', kind: 'view', visitors: 100, total: 120 },
      { variantKey: 'a', kind: 'goal', visitors: 10, total: 10 },
      { variantKey: 'b', kind: 'view', visitors: 100, total: 130 },
      { variantKey: 'b', kind: 'goal', visitors: 25, total: 25 },
    ]);

    twoProportionZTestMock.mockReturnValue({ z: 2.7, p: 0.003, lift: 1.5 });

    const res = await resultsRoute.GET(
      makeReq('http://x/api/portal/experiments/9/results'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.experiment.id).toBe(9);
    expect(body.data.stats).toHaveLength(2);

    const aStat = body.data.stats.find((s: { key: string }) => s.key === 'a');
    const bStat = body.data.stats.find((s: { key: string }) => s.key === 'b');
    expect(aStat.views).toBe(100);
    expect(aStat.goals).toBe(10);
    expect(aStat.conversionRate).toBeCloseTo(0.1, 5);
    expect(bStat.views).toBe(100);
    expect(bStat.goals).toBe(25);
    expect(bStat.conversionRate).toBeCloseTo(0.25, 5);

    expect(body.data.comparisons).toHaveLength(1);
    const cmp = body.data.comparisons[0];
    expect(cmp.controlKey).toBe('a');
    expect(cmp.variantKey).toBe('b');
    expect(cmp.z).toBe(2.7);
    expect(cmp.p).toBe(0.003);
    expect(cmp.lift).toBe(1.5);
    expect(cmp.significant).toBe(true);
  });

  it('marks comparisons as not significant when p >= 0.05', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    selectQueue.push([{ id: 9, name: 'Test' }]);
    selectQueue.push([
      { key: 'a', label: 'Control' },
      { key: 'b', label: 'Challenger' },
    ]);
    selectQueue.push([
      { variantKey: 'a', kind: 'view', visitors: 50, total: 50 },
      { variantKey: 'b', kind: 'view', visitors: 50, total: 50 },
    ]);
    twoProportionZTestMock.mockReturnValue({ z: 0.5, p: 0.3, lift: 0 });

    const res = await resultsRoute.GET(
      makeReq('http://x/api/portal/experiments/9/results'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.comparisons[0].significant).toBe(false);
    // goals were not present → 0
    const aStat = body.data.stats.find((s: { key: string }) => s.key === 'a');
    expect(aStat.goals).toBe(0);
    expect(aStat.conversionRate).toBe(0);
  });

  it('handles a single-variant experiment (no comparisons)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    selectQueue.push([{ id: 9, name: 'Lonely' }]);
    selectQueue.push([{ key: 'a', label: 'Only one' }]);
    selectQueue.push([]); // no events

    const res = await resultsRoute.GET(
      makeReq('http://x/api/portal/experiments/9/results'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stats).toHaveLength(1);
    expect(body.data.comparisons).toEqual([]);
    expect(twoProportionZTestMock).not.toHaveBeenCalled();
  });

  it('falls back to first variant as control when no "a" exists', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    selectQueue.push([{ id: 9, name: 'No-A' }]);
    selectQueue.push([
      { key: 'c', label: 'C' },
      { key: 'b', label: 'B' },
    ]);
    selectQueue.push([]);
    twoProportionZTestMock.mockReturnValue({ z: 0, p: 1, lift: 0 });

    const res = await resultsRoute.GET(
      makeReq('http://x/api/portal/experiments/9/results'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // stats are sorted ascending → 'b' first → control = 'b'
    expect(body.data.stats[0].key).toBe('b');
    expect(body.data.stats[1].key).toBe('c');
    expect(body.data.comparisons).toHaveLength(1);
    expect(body.data.comparisons[0].controlKey).toBe('b');
    expect(body.data.comparisons[0].variantKey).toBe('c');
  });
});

// ===========================================================================
// POST /api/portal/experiments/:id/variants
// ===========================================================================

describe('POST /api/portal/experiments/:id/variants', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        key: 'b',
        label: 'B',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when authorize returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue(null);
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        key: 'b',
        label: 'B',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when JSON body is invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    const req = new Request('http://x/api/portal/experiments/9/variants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{',
    });
    const res = await variantsRoute.POST(req, {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('returns 400 when key fails the regex (uppercase rejected? lowered first)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    // ' ' is not in [a-z0-9_-] so it's invalid
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        key: 'bad key',
        label: 'B',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_key');
  });

  it('returns 400 when key is empty', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        label: 'B',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_key');
  });

  it('returns 400 when key is too long', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        key: 'abcdefghi', // 9 chars, max is 8
        label: 'B',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_key');
  });

  it('returns 400 when label is empty/whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        key: 'b',
        label: '   ',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('label_required');
  });

  it('returns 409 when the variant key already exists', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    selectQueue.push([{ id: 42 }]); // duplicate found
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        key: 'b',
        label: 'B variant',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('duplicate_key');
  });

  it('creates a variant (lowercases key, trims label, defaults blockTreeOverride to null)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    selectQueue.push([]); // no duplicate
    insertReturnQueue.push([
      { id: 1, experimentId: 9, key: 'b', label: 'B variant' },
    ]);
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        key: 'B',
        label: '  B variant  ',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('abVariants');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.experimentId).toBe(9);
    expect(inserted.key).toBe('b');
    expect(inserted.label).toBe('B variant');
    expect(inserted.blockTreeOverride).toBeNull();
  });

  it('creates a variant honoring blockTreeOverride payload', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    selectQueue.push([]); // no duplicate
    insertReturnQueue.push([{ id: 2 }]);
    const tree = [{ type: 'heading', text: 'hi' }];
    const res = await variantsRoute.POST(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'POST', {
        key: 'c',
        label: 'C',
        blockTreeOverride: tree,
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(insertCalls[0].values).toMatchObject({
      key: 'c',
      label: 'C',
      blockTreeOverride: tree,
    });
  });
});

// ===========================================================================
// PATCH /api/portal/experiments/:id/variants
// ===========================================================================

describe('PATCH /api/portal/experiments/:id/variants', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        key: 'b',
        label: 'New',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when authorize returns null', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue(null);
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        key: 'b',
        label: 'New',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid JSON', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    const req = new Request('http://x/api/portal/experiments/9/variants', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'bad{',
    });
    const res = await variantsRoute.PATCH(req, {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('returns 400 when key is missing/invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        label: 'X',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_key');
  });

  it('returns 400 when label is provided but only whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        key: 'b',
        label: '   ',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('label_required');
  });

  it('returns 400 when patch payload is empty (no label, no blockTreeOverride key)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        key: 'b',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('nothing_to_update');
  });

  it('returns 404 when the variant row does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    updateReturnQueue.push([]); // no row matched
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        key: 'b',
        label: 'Newer',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('updates the label of an existing variant', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    updateReturnQueue.push([{ id: 1, key: 'b', label: 'Newer' }]);
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        key: 'B', // mixed case → lowered
        label: '  Newer  ',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.label).toBe('Newer');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('abVariants');
    expect(updateCalls[0].patch).toEqual({ label: 'Newer' });
  });

  it('updates blockTreeOverride (null is preserved as null)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    updateReturnQueue.push([{ id: 1, key: 'b', blockTreeOverride: null }]);
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        key: 'b',
        blockTreeOverride: null,
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toEqual({ blockTreeOverride: null });
  });

  it('updates both label and blockTreeOverride at once', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({
      experimentId: 9,
      postId: 1,
      siteId: 2,
      clientId: 3,
    });
    updateReturnQueue.push([{ id: 1, key: 'b' }]);
    const tree = [{ type: 'p', text: 'x' }];
    const res = await variantsRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9/variants', 'PATCH', {
        key: 'b',
        label: 'L',
        blockTreeOverride: tree,
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toEqual({
      label: 'L',
      blockTreeOverride: tree,
    });
  });
});

// ===========================================================================
// GET /api/portal/github/callback
// ===========================================================================

describe('GET /api/portal/github/callback', () => {
  function setHeaders(host = 'localhost:3005', proto = 'http') {
    headersMock.mockReturnValue(
      fakeHeaders({ host, 'x-forwarded-proto': proto }),
    );
  }

  it('redirects to error when there is no session', async () => {
    setHeaders();
    authMock.mockResolvedValue(null);
    const res = await githubCallbackRoute.GET(
      makeReq('http://x/api/portal/github/callback?code=abc'),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost:3005/portal/websites?github=error',
    );
  });

  it('redirects to error when client cannot be resolved', async () => {
    setHeaders();
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await githubCallbackRoute.GET(
      makeReq('http://x/api/portal/github/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'http://localhost:3005/portal/websites?github=error',
    );
  });

  it('redirects to error when no code query param is present', async () => {
    setHeaders();
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await githubCallbackRoute.GET(
      makeReq('http://x/api/portal/github/callback'),
    );
    expect(res.headers.get('location')).toBe(
      'http://localhost:3005/portal/websites?github=error',
    );
  });

  it('redirects to error when GitHub token exchange returns no access_token', async () => {
    setHeaders();
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'bad_verification_code' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const res = await githubCallbackRoute.GET(
      makeReq('http://x/api/portal/github/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'http://localhost:3005/portal/websites?github=error',
    );
    fetchSpy.mockRestore();
  });

  it('redirects to error when GitHub user payload is missing id/login', async () => {
    setHeaders();
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'tok', scope: 'repo,read:user' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      );

    const res = await githubCallbackRoute.GET(
      makeReq('http://x/api/portal/github/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'http://localhost:3005/portal/websites?github=error',
    );
    fetchSpy.mockRestore();
  });

  it('redirects to error when fetch throws unexpectedly', async () => {
    setHeaders();
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network down'));
    const res = await githubCallbackRoute.GET(
      makeReq('http://x/api/portal/github/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'http://localhost:3005/portal/websites?github=error',
    );
    fetchSpy.mockRestore();
  });

  it('inserts a new github connection on first connect and redirects to connected', async () => {
    setHeaders('app.example.com', 'https');
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'tok', scope: 'repo,read:user' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 9001, login: 'octocat' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    selectQueue.push([]); // no existing connection → insert
    const res = await githubCallbackRoute.GET(
      makeReq('http://x/api/portal/github/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'https://app.example.com/portal/websites?github=connected',
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('githubConnections');
    expect(insertCalls[0].values).toMatchObject({
      userId: 7,
      githubUserId: 9001,
      githubUsername: 'octocat',
      accessToken: 'tok',
      scope: 'repo,read:user',
    });
    expect(updateCalls).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it('updates an existing github connection on reconnect', async () => {
    setHeaders();
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'newtok' }), // no scope field
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 9001, login: 'octocat' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    selectQueue.push([{ id: 50 }]); // existing connection
    updateReturnQueue.push([{ id: 50 }]);

    const res = await githubCallbackRoute.GET(
      makeReq('http://x/api/portal/github/callback?code=abc'),
    );
    expect(res.headers.get('location')).toBe(
      'http://localhost:3005/portal/websites?github=connected',
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('githubConnections');
    expect(updateCalls[0].patch).toMatchObject({
      githubUserId: 9001,
      githubUsername: 'octocat',
      accessToken: 'newtok',
      scope: null, // tokenData.scope was undefined
    });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(insertCalls).toHaveLength(0);
    fetchSpy.mockRestore();
  });
});

// ===========================================================================
// GET /api/portal/github/connect
// ===========================================================================

describe('GET /api/portal/github/connect', () => {
  function setHeaders(host = 'localhost:3005', proto = 'http') {
    headersMock.mockReturnValue(
      fakeHeaders({ host, 'x-forwarded-proto': proto }),
    );
  }

  const originalEnv = process.env.GITHUB_OAUTH_CLIENT_ID;

  beforeEach(() => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'client-abc';
  });

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await githubConnectRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await githubConnectRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 500 when GITHUB_OAUTH_CLIENT_ID is not configured', async () => {
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await githubConnectRoute.GET();
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/not configured/i);
    // restore for subsequent tests
    process.env.GITHUB_OAUTH_CLIENT_ID = 'client-abc';
  });

  it('redirects to github authorize URL with derived origin', async () => {
    setHeaders('app.example.com', 'https');
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });

    const res = await githubConnectRoute.GET();
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('https://github.com/login/oauth/authorize?')).toBe(
      true,
    );

    const u = new URL(loc);
    expect(u.searchParams.get('client_id')).toBe('client-abc');
    expect(u.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/api/portal/github/callback',
    );
    expect(u.searchParams.get('scope')).toBe('repo read:user');
    expect(u.searchParams.get('state')).toBe('7'); // userId as string
  });

  it('falls back to localhost host when no host header present', async () => {
    headersMock.mockReturnValue(fakeHeaders({}));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await githubConnectRoute.GET();
    const loc = res.headers.get('location') ?? '';
    expect(loc).toMatch(/redirect_uri=http%3A%2F%2Flocalhost%3A3005/);
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.GITHUB_OAUTH_CLIENT_ID;
    else process.env.GITHUB_OAUTH_CLIENT_ID = originalEnv;
  });
});
