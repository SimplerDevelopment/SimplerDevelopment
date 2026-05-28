// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 23g):
 *   - app/api/google-fonts/route.ts                   (GET)
 *   - app/api/cron/process-embeddings/route.ts        (GET)
 *   - app/api/admin/email/lists/route.ts              (GET, POST)
 *   - app/api/email/unsubscribe/route.ts              (GET, POST)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  count: (col: unknown) => ({ op: 'count', col }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: [...strings],
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', value: s }),
    },
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
    emailLists: wrap('emailLists'),
    emailSubscribers: wrap('emailSubscribers'),
    emailCampaigns: wrap('emailCampaigns'),
  };
});

const drainQueueMock = vi.fn();
const getQueueStatsMock = vi.fn();
vi.mock('@/lib/brain/embedding-queue', () => ({
  drainQueue: (...args: unknown[]) => drainQueueMock(...args),
  getQueueStats: (...args: unknown[]) => getQueueStatsMock(...args),
}));

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown>;
  returned: Array<Record<string, unknown>>;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface ExecuteCall {
  query: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const executeCalls: ExecuteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
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

  function buildInsert(table: { __table: string }) {
    return {
      values(values: Record<string, unknown>) {
        const returned = insertReturnQueue.shift() ?? [{ id: 1, ...values }];
        insertCalls.push({ table: table.__table, values, returned });
        return {
          returning() {
            return Promise.resolve(returned);
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
            return Promise.resolve(undefined);
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      execute(query: unknown) {
        executeCalls.push({ query });
        return Promise.resolve(undefined);
      },
    },
  };
});

// ---- modules under test ----
const googleFontsRoute = await import('@/app/api/google-fonts/route');
const processEmbeddingsRoute = await import('@/app/api/cron/process-embeddings/route');
const adminEmailListsRoute = await import('@/app/api/admin/email/lists/route');
const unsubscribeRoute = await import('@/app/api/email/unsubscribe/route');

// ---- helpers ----
function makeNextReq(url: string): import('next/server').NextRequest {
  // google-fonts uses NextRequest; constructing a real one is heavy.
  // It only reads request.nextUrl.searchParams — shim that.
  const u = new URL(url);
  return {
    nextUrl: u,
  } as unknown as import('next/server').NextRequest;
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const STAFF_SESSION = { user: { id: '7', name: 'Bob', role: 'admin' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  executeCalls.length = 0;
  authMock.mockReset();
  drainQueueMock.mockReset();
  getQueueStatsMock.mockReset();
});

// ===========================================================================
// google-fonts
// ===========================================================================

describe('GET /api/google-fonts', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    // @ts-expect-error replace global fetch
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Reset module-level font cache between tests via fresh module import
    vi.resetModules();
  });

  it('returns 502 when the Google Fonts API call fails', async () => {
    // Re-import to get a fresh module-level cache
    vi.resetModules();
    const mod = await import('@/app/api/google-fonts/route');
    fetchMock.mockResolvedValue({ ok: false });
    const res = await mod.GET(makeNextReq('http://x/api/google-fonts'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns paginated fonts with default limit/offset', async () => {
    vi.resetModules();
    const mod = await import('@/app/api/google-fonts/route');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: Array.from({ length: 5 }, (_, i) => ({
          family: `Font ${i}`,
          category: 'sans-serif',
          variants: ['regular'],
          files: { regular: `https://font/${i}.ttf` },
        })),
      }),
    });
    const res = await mod.GET(makeNextReq('http://x/api/google-fonts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(5);
    expect(body.pagination).toEqual({ total: 5, offset: 0, limit: 30 });
    expect(body.data[0]).toEqual({
      family: 'Font 0',
      category: 'sans-serif',
      variants: ['regular'],
      files: { regular: 'https://font/0.ttf' },
    });
  });

  it('filters by search query and applies limit + offset', async () => {
    vi.resetModules();
    const mod = await import('@/app/api/google-fonts/route');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { family: 'Roboto', category: 'sans', variants: [], files: {} },
          { family: 'Roboto Slab', category: 'serif', variants: [], files: {} },
          { family: 'Open Sans', category: 'sans', variants: [], files: {} },
        ],
      }),
    });
    const res = await mod.GET(
      makeNextReq('http://x/api/google-fonts?search=roboto&limit=1&offset=1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ total: 2, offset: 1, limit: 1 });
    expect(body.data).toHaveLength(1);
    expect(body.data[0].family).toBe('Roboto Slab');
  });

  it('returns 500 when fetch throws', async () => {
    vi.resetModules();
    const mod = await import('@/app/api/google-fonts/route');
    fetchMock.mockRejectedValue(new Error('network down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await mod.GET(makeNextReq('http://x/api/google-fonts'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    errSpy.mockRestore();
  });
});

// ===========================================================================
// cron/process-embeddings
// ===========================================================================

describe('GET /api/cron/process-embeddings', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('returns 401 without cron header or bearer secret', async () => {
    process.env.CRON_SECRET = 'topsecret';
    const res = await processEmbeddingsRoute.GET(makeReq('http://x/api/cron/process-embeddings'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when CRON_SECRET unset and no vercel header', async () => {
    delete process.env.CRON_SECRET;
    const res = await processEmbeddingsRoute.GET(
      makeReq('http://x/api/cron/process-embeddings', {
        headers: { authorization: 'Bearer anything' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 with mismatched bearer secret', async () => {
    process.env.CRON_SECRET = 'topsecret';
    const res = await processEmbeddingsRoute.GET(
      makeReq('http://x/api/cron/process-embeddings', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('drains the queue when authorized via x-vercel-cron header', async () => {
    drainQueueMock.mockResolvedValue({ processed: 5, failed: 1 });
    getQueueStatsMock.mockResolvedValue({ pending: 0, failed: 1 });
    const res = await processEmbeddingsRoute.GET(
      makeReq('http://x/api/cron/process-embeddings', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.batchSize).toBe(25);
    expect(body.data.drained).toEqual({ processed: 5, failed: 1 });
    expect(body.data.queue).toEqual({ pending: 0, failed: 1 });
    expect(typeof body.data.durationMs).toBe('number');
    expect(drainQueueMock).toHaveBeenCalledWith(25);
  });

  it('honors ?batch= and clamps to a max of 100', async () => {
    drainQueueMock.mockResolvedValue({ processed: 0, failed: 0 });
    getQueueStatsMock.mockResolvedValue({ pending: 0, failed: 0 });
    const res = await processEmbeddingsRoute.GET(
      makeReq('http://x/api/cron/process-embeddings?batch=500', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(drainQueueMock).toHaveBeenCalledWith(100);
  });

  it('clamps ?batch=0 to a minimum of 1', async () => {
    drainQueueMock.mockResolvedValue({ processed: 0, failed: 0 });
    getQueueStatsMock.mockResolvedValue({ pending: 0, failed: 0 });
    const res = await processEmbeddingsRoute.GET(
      makeReq('http://x/api/cron/process-embeddings?batch=0', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(drainQueueMock).toHaveBeenCalledWith(1);
  });

  it('falls back to default batch size when ?batch is non-numeric', async () => {
    drainQueueMock.mockResolvedValue({ processed: 0, failed: 0 });
    getQueueStatsMock.mockResolvedValue({ pending: 0, failed: 0 });
    process.env.CRON_SECRET = 'topsecret';
    const res = await processEmbeddingsRoute.GET(
      makeReq('http://x/api/cron/process-embeddings?batch=banana', {
        headers: { authorization: 'Bearer topsecret' },
      }),
    );
    expect(res.status).toBe(200);
    // parseInt('banana') is NaN -> defaults to 25
    expect(drainQueueMock).toHaveBeenCalledWith(25);
  });
});

// ===========================================================================
// admin/email/lists
// ===========================================================================

describe('GET /api/admin/email/lists', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await adminEmailListsRoute.GET(makeReq('http://x/api/admin/email/lists'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff role', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    const res = await adminEmailListsRoute.GET(makeReq('http://x/api/admin/email/lists'));
    expect(res.status).toBe(401);
  });

  it('returns lists for staff (admin)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([
      { id: 1, name: 'Newsletter', description: 'n/a', clientId: 33, createdAt: '2025-01-01', subscriberCount: 12 },
    ]);
    const res = await adminEmailListsRoute.GET(makeReq('http://x/api/admin/email/lists'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Newsletter');
  });

  it('returns lists for staff (employee)', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    selectQueue.push([]);
    const res = await adminEmailListsRoute.GET(
      makeReq('http://x/api/admin/email/lists?clientId=99'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe('POST /api/admin/email/lists', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await adminEmailListsRoute.POST(
      makeReq('http://x/api/admin/email/lists', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing or empty', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await adminEmailListsRoute.POST(
      makeReq('http://x/api/admin/email/lists', {
        method: 'POST',
        body: JSON.stringify({ name: '   ' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name/i);
  });

  it('creates a list with trimmed values and 201 status', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    insertReturnQueue.push([
      { id: 5, name: 'My List', description: 'My desc', clientId: 33, createdBy: 7 },
    ]);
    const res = await adminEmailListsRoute.POST(
      makeReq('http://x/api/admin/email/lists', {
        method: 'POST',
        body: JSON.stringify({
          name: '  My List  ',
          description: '  My desc  ',
          clientId: '33',
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(5);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('emailLists');
    expect(insertCalls[0].values).toEqual({
      name: 'My List',
      description: 'My desc',
      clientId: 33,
      createdBy: 7,
    });
  });

  it('creates a list with null description and null clientId', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    insertReturnQueue.push([{ id: 6, name: 'List' }]);
    const res = await adminEmailListsRoute.POST(
      makeReq('http://x/api/admin/email/lists', {
        method: 'POST',
        body: JSON.stringify({ name: 'List' }),
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toEqual({
      name: 'List',
      description: null,
      clientId: null,
      createdBy: 7,
    });
  });
});

// ===========================================================================
// email/unsubscribe
// ===========================================================================

describe('GET /api/email/unsubscribe', () => {
  const originalBase = process.env.NEXTAUTH_URL;

  afterEach(() => {
    process.env.NEXTAUTH_URL = originalBase;
  });

  it('returns 400 when token query param is missing', async () => {
    const res = await unsubscribeRoute.GET(makeReq('http://x/api/email/unsubscribe'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Missing unsubscribe token');
  });

  it('returns 404 when subscriber not found', async () => {
    selectQueue.push([]);
    const res = await unsubscribeRoute.GET(
      makeReq('http://x/api/email/unsubscribe?token=abc'),
    );
    expect(res.status).toBe(404);
  });

  it('updates subscriber + campaigns and redirects to /unsubscribed', async () => {
    process.env.NEXTAUTH_URL = 'https://example.com';
    selectQueue.push([{ id: 42, status: 'active' }]);
    const res = await unsubscribeRoute.GET(
      makeReq('http://x/api/email/unsubscribe?token=abc'),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://example.com/unsubscribed');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('emailSubscribers');
    expect(updateCalls[0].patch.status).toBe('unsubscribed');
    expect(updateCalls[0].patch.unsubscribedAt).toBeInstanceOf(Date);
    expect(executeCalls).toHaveLength(1);
  });

  it('redirects without re-updating when subscriber is already unsubscribed', async () => {
    delete process.env.NEXTAUTH_URL;
    selectQueue.push([{ id: 99, status: 'unsubscribed' }]);
    const res = await unsubscribeRoute.GET(
      makeReq('http://x/api/email/unsubscribe?token=xyz'),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/unsubscribed');
    expect(updateCalls).toHaveLength(0);
    expect(executeCalls).toHaveLength(0);
  });
});

describe('POST /api/email/unsubscribe (one-click RFC 8058)', () => {
  it('returns 400 when token query param is missing', async () => {
    const res = await unsubscribeRoute.POST(
      makeReq('http://x/api/email/unsubscribe', { method: 'POST' }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Missing token');
  });

  it('returns 404 when subscriber lookup is empty', async () => {
    selectQueue.push([]);
    const res = await unsubscribeRoute.POST(
      makeReq('http://x/api/email/unsubscribe?token=abc', { method: 'POST' }),
    );
    expect(res.status).toBe(404);
  });

  it('updates subscriber and returns 200', async () => {
    selectQueue.push([{ id: 12, status: 'active' }]);
    const res = await unsubscribeRoute.POST(
      makeReq('http://x/api/email/unsubscribe?token=abc', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('emailSubscribers');
    expect(updateCalls[0].patch.status).toBe('unsubscribed');
  });

  it('returns 200 with no update when already unsubscribed', async () => {
    selectQueue.push([{ id: 12, status: 'unsubscribed' }]);
    const res = await unsubscribeRoute.POST(
      makeReq('http://x/api/email/unsubscribe?token=abc', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });
});
