// @vitest-environment node
/**
 * Batch 35a — unit tests for 4 misc route.ts files.
 *
 * Routes covered:
 *  - app/api/public/chat/start/route.ts                           (POST)
 *  - app/api/public/gift-certificates/validate/route.ts           (POST)
 *  - app/api/sites/[siteId]/navigation/route.ts                   (GET)
 *  - app/api/storefront/[siteId]/account/route.ts                 (GET, PATCH)
 *
 * Strategy: heavy mocking — db.select() returns per-call results via a shared
 * queue; db.insert/update return thenables that capture writes. External
 * integrations (chat token, chat realtime publish, customer-auth) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables, every property access returns a { __col, __table }.
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
    chatWidgets: wrap('chatWidgets'),
    chatConversations: wrap('chatConversations'),
    giftCertificates: wrap('giftCertificates'),
    clientWebsites: wrap('clientWebsites'),
    siteNavigation: wrap('siteNavigation'),
    siteBranding: wrap('siteBranding'),
    storeCustomers: wrap('storeCustomers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// Chat token issuance
const issueVisitorTokenMock = vi.fn();
vi.mock('@/lib/chat/token', () => ({
  issueVisitorToken: (...args: unknown[]) => issueVisitorTokenMock(...args),
}));

// Chat realtime publish
const publishConversationUpdateMock = vi.fn();
vi.mock('@/lib/chat/realtime', () => ({
  publishConversationUpdate: (...args: unknown[]) => publishConversationUpdateMock(...args),
}));

// Storefront customer-auth
const requireCustomerMock = vi.fn();
vi.mock('@/lib/storefront/customer-auth', () => ({
  requireCustomer: (...args: unknown[]) => requireCustomerMock(...args),
}));

// ---------------------------------------------------------------------------
// db mock: select-queue + insert/update capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const chatStartRoute = await import('@/app/api/public/chat/start/route');
const giftValidateRoute = await import('@/app/api/public/gift-certificates/validate/route');
const navigationRoute = await import('@/app/api/sites/[siteId]/navigation/route');
const accountRoute = await import('@/app/api/storefront/[siteId]/account/route');

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

function makeBadJsonReq(url: string, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  });
}

function makeRawReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  issueVisitorTokenMock.mockReset();
  publishConversationUpdateMock.mockReset();
  requireCustomerMock.mockReset();

  // Defaults
  issueVisitorTokenMock.mockReturnValue('etk_default');
  publishConversationUpdateMock.mockResolvedValue(undefined);
});

// ===========================================================================
// POST /api/public/chat/start
// ===========================================================================

describe('POST /api/public/chat/start', () => {
  it('returns 400 on invalid JSON body', async () => {
    const res = await chatStartRoute.POST(makeBadJsonReq('http://x/chat/start'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid JSON body');
  });

  it('returns 400 when widgetId is missing', async () => {
    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { visitorId: 'v1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('widgetId is required');
  });

  it('returns 400 when widgetId is non-numeric string', async () => {
    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { widgetId: 'abc', visitorId: 'v1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('widgetId is required');
  });

  it('returns 400 when widgetId is zero', async () => {
    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { widgetId: 0, visitorId: 'v1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('widgetId is required');
  });

  it('accepts numeric string widgetId via parseInt', async () => {
    selectQueue.push([{ id: 7, clientId: 5, enabled: true, greetingMessage: 'hi' }]); // widget
    selectQueue.push([]); // no existing convo
    insertReturnQueue.push([
      {
        id: 100,
        widgetId: 7,
        clientId: 5,
        visitorName: null,
        lastMessageAt: new Date(),
      },
    ]);
    issueVisitorTokenMock.mockReturnValue('etk_x');

    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { widgetId: '7', visitorId: 'v1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversationId).toBe(100);
  });

  it('returns 400 when visitorId is missing/empty', async () => {
    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { widgetId: 1, visitorId: '   ' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('visitorId is required');
  });

  it('returns 400 when visitorId is too long', async () => {
    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', {
        widgetId: 1,
        visitorId: 'a'.repeat(65),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('visitorId is required');
  });

  it('returns 404 when widget not found', async () => {
    selectQueue.push([]); // widget lookup empty
    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { widgetId: 1, visitorId: 'v1' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Widget not available');
  });

  it('returns 404 when widget exists but disabled', async () => {
    selectQueue.push([{ id: 1, clientId: 5, enabled: false }]);
    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { widgetId: 1, visitorId: 'v1' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Widget not available');
  });

  it('reuses existing open conversation; no insert', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        enabled: true,
        greetingMessage: 'g',
        primaryColor: '#000',
        position: 'right',
        awayMessage: 'a',
      },
    ]); // widget
    selectQueue.push([
      {
        id: 42,
        widgetId: 1,
        clientId: 5,
        visitorId: 'v1',
        visitorName: 'Alice',
        visitorEmail: 'a@a.com',
        status: 'open',
      },
    ]); // existing
    issueVisitorTokenMock.mockReturnValue('etk_42');

    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { widgetId: 1, visitorId: 'v1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conversationId).toBe(42);
    expect(body.data.ephemeralToken).toBe('etk_42');
    expect(body.data.greetingMessage).toBe('g');
    expect(body.data.primaryColor).toBe('#000');
    expect(body.data.position).toBe('right');
    expect(body.data.awayMessage).toBe('a');
    expect(insertCalls).toHaveLength(0);
    // No patch needed because both name + email already set
    expect(updateCalls).toHaveLength(0);
  });

  it('patches contact details on existing convo when newly provided', async () => {
    selectQueue.push([{ id: 1, clientId: 5, enabled: true }]); // widget
    selectQueue.push([
      {
        id: 42,
        widgetId: 1,
        clientId: 5,
        visitorId: 'v1',
        visitorName: null,
        visitorEmail: null,
        status: 'open',
      },
    ]); // existing

    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', {
        widgetId: 1,
        visitorId: 'v1',
        name: 'Bob',
        email: 'b@b.com',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('chatConversations');
    expect(updateCalls[0].patch.visitorName).toBe('Bob');
    expect(updateCalls[0].patch.visitorEmail).toBe('b@b.com');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('does NOT patch when neither name nor email needs updating', async () => {
    selectQueue.push([{ id: 1, clientId: 5, enabled: true }]);
    selectQueue.push([
      {
        id: 42,
        widgetId: 1,
        clientId: 5,
        visitorId: 'v1',
        visitorName: 'Already',
        visitorEmail: 'a@a.com',
        status: 'open',
      },
    ]);

    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', {
        widgetId: 1,
        visitorId: 'v1',
        name: 'Other',
        email: 'other@a.com',
      }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });

  it('creates new conversation when none exists and publishes update', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        enabled: true,
        greetingMessage: 'hi',
        primaryColor: '#0af',
        position: 'left',
        awayMessage: 'bye',
      },
    ]); // widget
    selectQueue.push([]); // no existing
    const createdAt = new Date('2030-01-01T00:00:00Z');
    insertReturnQueue.push([
      {
        id: 99,
        widgetId: 1,
        clientId: 5,
        visitorName: 'New',
        lastMessageAt: createdAt,
      },
    ]);
    issueVisitorTokenMock.mockReturnValue('etk_new');

    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', {
        widgetId: 1,
        visitorId: 'v1',
        name: 'New',
        email: 'n@n.com',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conversationId).toBe(99);
    expect(body.data.ephemeralToken).toBe('etk_new');

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('chatConversations');
    expect(insertCalls[0].values).toMatchObject({
      widgetId: 1,
      clientId: 5,
      visitorId: 'v1',
      visitorName: 'New',
      visitorEmail: 'n@n.com',
      status: 'open',
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(publishConversationUpdateMock).toHaveBeenCalledTimes(1);
    const [clientId, payload] = publishConversationUpdateMock.mock.calls[0];
    expect(clientId).toBe(5);
    expect(payload).toMatchObject({
      conversationId: 99,
      status: 'open',
      visitorName: 'New',
      kind: 'created',
    });
  });

  it('swallows publish errors (best-effort)', async () => {
    selectQueue.push([{ id: 1, clientId: 5, enabled: true }]);
    selectQueue.push([]);
    insertReturnQueue.push([
      { id: 1, widgetId: 1, clientId: 5, visitorName: null, lastMessageAt: new Date() },
    ]);
    publishConversationUpdateMock.mockRejectedValue(new Error('publish boom'));

    const res = await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', { widgetId: 1, visitorId: 'v1' }),
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    // Should not throw — completed normally
  });

  it('truncates long name/email to 255 chars on insert', async () => {
    selectQueue.push([{ id: 1, clientId: 5, enabled: true }]);
    selectQueue.push([]);
    insertReturnQueue.push([
      { id: 1, widgetId: 1, clientId: 5, visitorName: 'x', lastMessageAt: new Date() },
    ]);
    const longName = 'n'.repeat(300);
    const longEmail = 'e'.repeat(300);

    await chatStartRoute.POST(
      makeJsonReq('http://x/chat/start', 'POST', {
        widgetId: 1,
        visitorId: 'v1',
        name: longName,
        email: longEmail,
      }),
    );
    const vals = insertCalls[0].values as Record<string, unknown>;
    expect((vals.visitorName as string).length).toBe(255);
    expect((vals.visitorEmail as string).length).toBe(255);
  });
});

// ===========================================================================
// POST /api/public/gift-certificates/validate
// ===========================================================================

describe('POST /api/public/gift-certificates/validate', () => {
  it('returns 400 when code is missing', async () => {
    const res = await giftValidateRoute.POST(
      makeJsonReq('http://x/gc/validate', 'POST', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Gift certificate code is required');
  });

  it('returns 400 when cert not found or inactive', async () => {
    selectQueue.push([]);
    const res = await giftValidateRoute.POST(
      makeJsonReq('http://x/gc/validate', 'POST', { code: 'abc123' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid or inactive gift certificate');
  });

  it('returns 400 when cert is expired', async () => {
    selectQueue.push([
      {
        id: 1,
        code: 'ABC',
        initialAmount: 5000,
        remainingAmount: 5000,
        status: 'active',
        redeemableAt: 'booking',
        expiresAt: new Date(Date.now() - 60_000),
      },
    ]);
    const res = await giftValidateRoute.POST(
      makeJsonReq('http://x/gc/validate', 'POST', { code: 'abc' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('This gift certificate has expired');
  });

  it('returns 400 when cert is fully redeemed (remaining <= 0)', async () => {
    selectQueue.push([
      {
        id: 1,
        code: 'ABC',
        initialAmount: 5000,
        remainingAmount: 0,
        status: 'active',
        redeemableAt: 'booking',
        expiresAt: null,
      },
    ]);
    const res = await giftValidateRoute.POST(
      makeJsonReq('http://x/gc/validate', 'POST', { code: 'abc' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('This gift certificate has been fully redeemed');
  });

  it('returns valid cert details with default context=booking', async () => {
    selectQueue.push([
      {
        id: 1,
        code: 'ABC123',
        initialAmount: 10000,
        remainingAmount: 7500,
        status: 'active',
        redeemableAt: 'booking',
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const res = await giftValidateRoute.POST(
      makeJsonReq('http://x/gc/validate', 'POST', { code: 'abc123' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      code: 'ABC123',
      initialAmount: 10000,
      remainingAmount: 7500,
    });
  });

  it('honors context=store', async () => {
    selectQueue.push([
      {
        id: 2,
        code: 'STORE1',
        initialAmount: 2000,
        remainingAmount: 1500,
        status: 'active',
        redeemableAt: 'store',
        expiresAt: null,
      },
    ]);
    const res = await giftValidateRoute.POST(
      makeJsonReq('http://x/gc/validate', 'POST', { code: 'store1', context: 'store' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.code).toBe('STORE1');
  });

  it('returns 500 when db throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The route reads `code` from `await req.json()` first — make json() throw.
    const badReq = new Request('http://x/gc/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const res = await giftValidateRoute.POST(badReq);
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
    errSpy.mockRestore();
  });
});

// ===========================================================================
// GET /api/sites/[siteId]/navigation
// ===========================================================================

describe('GET /api/sites/[siteId]/navigation', () => {
  it('returns 404 when site not found or inactive', async () => {
    selectQueue.push([]); // site lookup empty
    const res = await navigationRoute.GET(makeRawReq('http://x/nav'), {
      params: Promise.resolve({ siteId: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns navigation tree + branding when present', async () => {
    selectQueue.push([{ id: 7, name: 'Cool Site' }]); // site
    selectQueue.push([
      { id: 10, websiteId: 7, parentId: null, label: 'Home', sortOrder: 1 },
      { id: 11, websiteId: 7, parentId: null, label: 'About', sortOrder: 2 },
      { id: 12, websiteId: 7, parentId: 11, label: 'Team', sortOrder: 1 },
      { id: 13, websiteId: 7, parentId: 11, label: 'Mission', sortOrder: 2 },
      { id: 14, websiteId: 7, parentId: 999, label: 'Orphan', sortOrder: 1 },
    ]); // nav items
    selectQueue.push([
      {
        id: 1,
        websiteId: 7,
        logoUrl: 'logo.png',
        primaryColor: '#f00',
        navTemplate: 'modern',
      },
    ]); // branding

    const res = await navigationRoute.GET(makeRawReq('http://x/nav'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=60/);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.siteName).toBe('Cool Site');
    expect(body.data.branding.logoUrl).toBe('logo.png');
    expect(body.data.branding.primaryColor).toBe('#f00');

    // Nested: 2 top-level. About has 2 children. Orphan with parentId=999 should
    // NOT appear in top-level or in any top-level's children.
    expect(body.data.navigation).toHaveLength(2);
    const home = body.data.navigation.find((n: { label: string }) => n.label === 'Home');
    const about = body.data.navigation.find((n: { label: string }) => n.label === 'About');
    expect(home.children).toEqual([]);
    expect(about.children).toHaveLength(2);
    expect(about.children.map((c: { label: string }) => c.label)).toEqual(['Team', 'Mission']);
  });

  it('returns default branding when no branding row exists', async () => {
    selectQueue.push([{ id: 7, name: 'Site' }]);
    selectQueue.push([]); // no nav
    selectQueue.push([]); // no branding

    const res = await navigationRoute.GET(makeRawReq('http://x/nav'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.navigation).toEqual([]);
    expect(body.data.branding).toEqual({
      logoUrl: '',
      primaryColor: '#2563eb',
      secondaryColor: '#1e40af',
      accentColor: '#f59e0b',
      backgroundColor: '#ffffff',
      textColor: '#111827',
      navTemplate: 'classic',
      navPosition: 'top',
      navBackground: '#ffffff',
      navTextColor: '#111827',
    });
  });
});

// ===========================================================================
// GET /api/storefront/[siteId]/account
// ===========================================================================

describe('GET /api/storefront/[siteId]/account', () => {
  function makeNextReq(url: string, init?: RequestInit): import('next/server').NextRequest {
    // The route only uses req for cookies/headers, which requireCustomer is
    // mocked away from. A plain Request cast is sufficient.
    return new Request(url, init) as unknown as import('next/server').NextRequest;
  }

  it('returns 401 when no customer session', async () => {
    requireCustomerMock.mockResolvedValue(null);
    const res = await accountRoute.GET(makeNextReq('http://x/account'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
    // Confirm requireCustomer received parsed siteId
    expect(requireCustomerMock).toHaveBeenCalledWith(expect.anything(), 7);
  });

  it('returns 404 when session valid but customer record missing', async () => {
    requireCustomerMock.mockResolvedValue({ customerId: 42, websiteId: 7 });
    selectQueue.push([]); // no customer
    const res = await accountRoute.GET(makeNextReq('http://x/account'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns sanitized customer payload on success', async () => {
    requireCustomerMock.mockResolvedValue({ customerId: 42, websiteId: 7 });
    const createdAt = new Date('2029-01-01T00:00:00Z');
    selectQueue.push([
      {
        id: 42,
        email: 'c@c.com',
        firstName: 'C',
        lastName: 'D',
        phone: '555',
        defaultShippingAddress: { city: 'A' },
        defaultBillingAddress: { city: 'B' },
        addressBook: [{ city: 'A' }],
        orderCount: 3,
        totalSpent: 9999,
        createdAt,
        passwordHash: 'SHOULD_NOT_LEAK',
      },
    ]);
    const res = await accountRoute.GET(makeNextReq('http://x/account'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
    expect(body.data.email).toBe('c@c.com');
    expect(body.data.orderCount).toBe(3);
    expect(body.data.totalSpent).toBe(9999);
    expect(body.data.passwordHash).toBeUndefined();
  });
});

describe('PATCH /api/storefront/[siteId]/account', () => {
  function makeNextReq(url: string, body: unknown): import('next/server').NextRequest {
    return new Request(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as import('next/server').NextRequest;
  }

  it('returns 401 when no session', async () => {
    requireCustomerMock.mockResolvedValue(null);
    const res = await accountRoute.PATCH(makeNextReq('http://x/account', {}), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(401);
  });

  it('updates only provided fields and returns sanitized result', async () => {
    requireCustomerMock.mockResolvedValue({ customerId: 42 });
    updateReturnQueue.push([
      {
        id: 42,
        email: 'c@c.com',
        firstName: 'NewFirst',
        lastName: 'NewLast',
        phone: '999',
        defaultShippingAddress: { city: 'X' },
        defaultBillingAddress: { city: 'Y' },
        addressBook: [{ city: 'X' }],
        passwordHash: 'NOPE',
      },
    ]);
    const res = await accountRoute.PATCH(
      makeNextReq('http://x/account', {
        firstName: 'NewFirst',
        lastName: 'NewLast',
        phone: '999',
        defaultShippingAddress: { city: 'X' },
        defaultBillingAddress: { city: 'Y' },
        addressBook: [{ city: 'X' }],
        // junk field should be ignored
        passwordHash: 'attempt',
      }),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.firstName).toBe('NewFirst');
    expect(body.data.passwordHash).toBeUndefined();

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('storeCustomers');
    const patch = updateCalls[0].patch;
    expect(patch.firstName).toBe('NewFirst');
    expect(patch.lastName).toBe('NewLast');
    expect(patch.phone).toBe('999');
    expect(patch.defaultShippingAddress).toEqual({ city: 'X' });
    expect(patch.defaultBillingAddress).toEqual({ city: 'Y' });
    expect(patch.addressBook).toEqual([{ city: 'X' }]);
    expect(patch.updatedAt).toBeInstanceOf(Date);
    expect(patch).not.toHaveProperty('passwordHash');
  });

  it('only applies fields that are defined (undefined skipped, null retained)', async () => {
    requireCustomerMock.mockResolvedValue({ customerId: 42 });
    updateReturnQueue.push([
      {
        id: 42,
        email: 'c@c.com',
        firstName: null,
        lastName: null,
        phone: null,
        defaultShippingAddress: null,
        defaultBillingAddress: null,
        addressBook: null,
      },
    ]);

    await accountRoute.PATCH(
      makeNextReq('http://x/account', {
        firstName: null, // explicit null IS applied (not undefined)
        // lastName omitted entirely — should be skipped
        phone: '',
      }),
      { params: Promise.resolve({ siteId: '7' }) },
    );

    const patch = updateCalls[0].patch;
    expect(patch.firstName).toBeNull();
    expect(patch.phone).toBe('');
    expect(patch).not.toHaveProperty('lastName');
    expect(patch).not.toHaveProperty('defaultShippingAddress');
    expect(patch).not.toHaveProperty('addressBook');
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });
});
