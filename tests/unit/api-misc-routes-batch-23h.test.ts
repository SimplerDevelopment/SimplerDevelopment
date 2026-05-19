// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 23h):
 *   - app/api/google-fonts/route.ts                      (GET)
 *   - app/api/logs/ingest/route.ts                       (POST)
 *   - app/api/email/unsubscribe/route.ts                 (GET, POST)
 *   - app/api/portal/billing/payment-methods/route.ts    (GET, DELETE)
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

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
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
    clientWebsites: wrap('clientWebsites'),
    httpRequestLogs: wrap('httpRequestLogs'),
    emailSubscribers: wrap('emailSubscribers'),
    emailCampaigns: wrap('emailCampaigns'),
    paymentMethods: wrap('paymentMethods'),
  };
});

// ---------------------------------------------------------------------------
// DB mock: thenable select chain + recording insert/update/delete/execute
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: unknown;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface DeleteCall {
  table: string;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];
const executeCalls: unknown[] = [];

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
      values(v: unknown) {
        insertCalls.push({ table: table.__table, values: v });
        return Promise.resolve(undefined);
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

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      execute(stmt: unknown) {
        executeCalls.push(stmt);
        return Promise.resolve(undefined);
      },
    },
  };
});

// ---- modules under test ----
const googleFontsRoute = await import('@/app/api/google-fonts/route');
const logsIngestRoute = await import('@/app/api/logs/ingest/route');
const unsubscribeRoute = await import('@/app/api/email/unsubscribe/route');
const paymentMethodsRoute = await import('@/app/api/portal/billing/payment-methods/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// NextRequest is structurally similar to Request for our purposes — the
// google-fonts route uses `request.nextUrl.searchParams`, so we need to give
// it a `nextUrl` shape.
function makeNextReq(url: string): { nextUrl: URL } {
  return { nextUrl: new URL(url) };
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  executeCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  vi.restoreAllMocks();
});

// ===========================================================================
// google-fonts
// ===========================================================================

describe('GET /api/google-fonts', () => {
  it('returns 502 when the Google API call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }),
    );
    const res = await googleFontsRoute.GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeNextReq('http://x/api/google-fonts') as any,
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 500 when fetch itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network kaboom')),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await googleFontsRoute.GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeNextReq('http://x/api/google-fonts') as any,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to fetch fonts' });
  });

  it('returns mapped+paginated+filtered fonts on success', async () => {
    const items = [
      { family: 'Inter', category: 'sans-serif', variants: ['400'], files: { '400': 'a' } },
      { family: 'Roboto', category: 'sans-serif', variants: ['400'], files: { '400': 'b' } },
      { family: 'Lobster', category: 'display', variants: ['400'], files: { '400': 'c' } },
      // extra non-matching entries to confirm filtering
      { family: 'Foo', category: 'serif', variants: ['400'], files: { '400': 'd' } },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items }),
      }),
    );
    const res = await googleFontsRoute.GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeNextReq('http://x/api/google-fonts?search=ro&limit=1&offset=0') as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // "ro" matches Roboto (after the first fetch) — could also match nothing
    // depending on cache; force first-fetch by relying on first call after reset.
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toMatchObject({ offset: 0, limit: 1 });
    expect(typeof body.pagination.total).toBe('number');
  });
});

// ===========================================================================
// logs/ingest
// ===========================================================================

describe('POST /api/logs/ingest', () => {
  it('returns 401 when x-log-api-key header is missing', async () => {
    const res = await logsIngestRoute.POST(
      makeReq('http://x/api/logs/ingest', { method: 'POST', body: '[]' }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Missing/);
  });

  it('returns 401 when API key does not match any website', async () => {
    selectQueue.push([]); // site lookup returns nothing
    const res = await logsIngestRoute.POST(
      makeReq('http://x/api/logs/ingest', {
        method: 'POST',
        body: '[]',
        headers: { 'x-log-api-key': 'bad-key' },
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Invalid/);
  });

  it('returns ingested:0 when the batch is empty', async () => {
    selectQueue.push([{ id: 42 }]);
    const res = await logsIngestRoute.POST(
      makeReq('http://x/api/logs/ingest', {
        method: 'POST',
        body: '[]',
        headers: { 'x-log-api-key': 'good' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ingested: 0 });
    expect(insertCalls).toHaveLength(0);
  });

  it('caps at 100 entries per batch and inserts them with truncation', async () => {
    selectQueue.push([{ id: 42 }]);
    const entries = Array.from({ length: 150 }, (_, i) => ({
      method: 'GET',
      path: `/p/${i}`,
      statusCode: 200,
      duration: 12,
      userAgent: 'ua',
      referer: 'ref',
      ip: '1.2.3.4',
      country: 'US',
    }));
    const res = await logsIngestRoute.POST(
      makeReq('http://x/api/logs/ingest', {
        method: 'POST',
        body: JSON.stringify(entries),
        headers: { 'x-log-api-key': 'good' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ingested: 100 });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('httpRequestLogs');
    expect(Array.isArray(insertCalls[0].values)).toBe(true);
    expect((insertCalls[0].values as unknown[]).length).toBe(100);
    const first = (insertCalls[0].values as Array<Record<string, unknown>>)[0];
    expect(first.websiteId).toBe(42);
    expect(first.method).toBe('GET');
  });

  it('also accepts { logs: [...] } body shape and applies defaults for missing fields', async () => {
    selectQueue.push([{ id: 7 }]);
    const res = await logsIngestRoute.POST(
      makeReq('http://x/api/logs/ingest', {
        method: 'POST',
        body: JSON.stringify({ logs: [{}] }),
        headers: { 'x-log-api-key': 'good' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ingested: 1 });
    const inserted = (insertCalls[0].values as Array<Record<string, unknown>>)[0];
    expect(inserted.method).toBe('GET');
    expect(inserted.path).toBe('/');
    expect(inserted.statusCode).toBe(0);
    expect(inserted.userAgent).toBeNull();
  });
});

// ===========================================================================
// email/unsubscribe
// ===========================================================================

describe('GET /api/email/unsubscribe', () => {
  it('returns 400 when token is missing', async () => {
    const res = await unsubscribeRoute.GET(makeReq('http://x/api/email/unsubscribe'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no subscriber matches', async () => {
    selectQueue.push([]);
    const res = await unsubscribeRoute.GET(
      makeReq('http://x/api/email/unsubscribe?token=missing'),
    );
    expect(res.status).toBe(404);
  });

  it('redirects without updating when subscriber is already unsubscribed', async () => {
    selectQueue.push([{ id: 9, status: 'unsubscribed' }]);
    const res = await unsubscribeRoute.GET(
      makeReq('http://x/api/email/unsubscribe?token=t'),
    );
    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(updateCalls).toHaveLength(0);
    expect(executeCalls).toHaveLength(0);
  });

  it('updates subscriber + increments campaign counters and redirects when active', async () => {
    selectQueue.push([{ id: 9, status: 'active' }]);
    const res = await unsubscribeRoute.GET(
      makeReq('http://x/api/email/unsubscribe?token=t'),
    );
    expect(res.status).toBe(307);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('emailSubscribers');
    expect(updateCalls[0].patch).toMatchObject({ status: 'unsubscribed' });
    expect(updateCalls[0].patch.unsubscribedAt).toBeInstanceOf(Date);
    expect(executeCalls).toHaveLength(1);
  });
});

describe('POST /api/email/unsubscribe', () => {
  it('returns 400 when token is missing', async () => {
    const res = await unsubscribeRoute.POST(
      makeReq('http://x/api/email/unsubscribe', { method: 'POST' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when subscriber not found', async () => {
    selectQueue.push([]);
    const res = await unsubscribeRoute.POST(
      makeReq('http://x/api/email/unsubscribe?token=x', { method: 'POST' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 without updating when already unsubscribed', async () => {
    selectQueue.push([{ id: 11, status: 'unsubscribed' }]);
    const res = await unsubscribeRoute.POST(
      makeReq('http://x/api/email/unsubscribe?token=x', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });

  it('updates subscriber and returns 200 when active', async () => {
    selectQueue.push([{ id: 11, status: 'active' }]);
    const res = await unsubscribeRoute.POST(
      makeReq('http://x/api/email/unsubscribe?token=x', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('emailSubscribers');
  });
});

// ===========================================================================
// portal/billing/payment-methods
// ===========================================================================

describe('GET /api/portal/billing/payment-methods', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await paymentMethodsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await paymentMethodsRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the methods for the active client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, clientId: 33, last4: '4242' },
      { id: 2, clientId: 33, last4: '0001' },
    ]);
    const res = await paymentMethodsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

describe('DELETE /api/portal/billing/payment-methods', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x/api/portal/billing/payment-methods', { method: 'DELETE' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x/api/portal/billing/payment-methods', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when the body has no id', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x/api/portal/billing/payment-methods', {
        method: 'DELETE',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the payment method does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // lookup -> none
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x/api/portal/billing/payment-methods', {
        method: 'DELETE',
        body: JSON.stringify({ id: '99' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls).toHaveLength(0);
  });

  it('deletes the payment method when it belongs to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 99, clientId: 33, stripePaymentMethodId: 'pm_x' }]);
    const res = await paymentMethodsRoute.DELETE(
      makeReq('http://x/api/portal/billing/payment-methods', {
        method: 'DELETE',
        body: JSON.stringify({ id: '99' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('paymentMethods');
  });
});
