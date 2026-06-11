// @vitest-environment node
/**
 * Batch 31e — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/google/callback/route.ts                       (GET)
 *  - app/api/portal/hosting/[id]/route.ts                          (GET)
 *  - app/api/portal/integrations/api-keys/[id]/route.ts            (PATCH, DELETE)
 *  - app/api/portal/integrations/google/connect/route.ts           (GET)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update/delete are mocked to capture
 * writes and emit the next queued return rows.
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
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

// google-website-oauth (createOAuth2Client)
const getTokenMock = vi.fn();
const createOAuth2ClientMock = vi.fn(() => ({
  getToken: (...a: unknown[]) => getTokenMock(...a),
}));
vi.mock('@/lib/google-website-oauth', () => ({
  createOAuth2Client: (uri: string) => createOAuth2ClientMock(uri),
}));

// google libs for the connect route
const buildAuthUrlMock = vi.fn();
vi.mock('@/lib/google/oauth', () => ({
  buildAuthUrl: (opts: unknown) => buildAuthUrlMock(opts),
}));

const signStateMock = vi.fn();
vi.mock('@/lib/google/oauth-state', () => ({
  signState: (opts: unknown) => signStateMock(opts),
}));

const getTenantWorkspaceCredentialsByClientIdMock = vi.fn();
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: (...a: unknown[]) =>
    getTenantWorkspaceCredentialsByClientIdMock(...a),
}));

// drizzle-orm operators — inert objects
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
    googleWebsiteTokens: wrap('googleWebsiteTokens'),
    clientWebsites: wrap('clientWebsites'),
    hostedSites: wrap('hostedSites'),
    clientApiKeys: wrap('clientApiKeys'),
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
                return Promise.resolve(cloned).then(onF, onR);
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
            return Promise.resolve(cloned).then(onF, onR);
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

const googleCallbackRoute = await import('@/app/api/portal/google/callback/route');
const hostingIdRoute = await import('@/app/api/portal/hosting/[id]/route');
const apiKeysIdRoute = await import(
  '@/app/api/portal/integrations/api-keys/[id]/route'
);
const googleConnectRoute = await import(
  '@/app/api/portal/integrations/google/connect/route'
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

// NextRequest-shaped helper for googleConnectRoute (uses req.url)
function makeNextReq(url: string) {
  return { url } as unknown as import('next/server').NextRequest;
}

// Headers object compatible with the route's expectations
function makeHeadersList(map: Record<string, string>) {
  return {
    get(key: string): string | null {
      const v = map[key.toLowerCase()] ?? map[key];
      return v === undefined ? null : v;
    },
  };
}

const SESSION = { user: { id: '7', email: 'user@example.com' } };

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
  headersMock.mockReset();
  getTokenMock.mockReset();
  createOAuth2ClientMock.mockClear();
  buildAuthUrlMock.mockReset();
  signStateMock.mockReset();
  getTenantWorkspaceCredentialsByClientIdMock.mockReset();
});

// ===========================================================================
// GET /api/portal/google/callback
// ===========================================================================

describe('GET /api/portal/google/callback', () => {
  it('redirects to /portal/dashboard when no session', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(null);
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback?code=x&state=1'),
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get('location')).toBe('https://example.com/portal/dashboard');
  });

  it('redirects to /portal/dashboard when client cannot be resolved', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback?code=x&state=1'),
    );
    expect(res.headers.get('location')).toBe('https://example.com/portal/dashboard');
  });

  it('redirects to dashboard?google=error when code or state missing', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback'),
    );
    expect(res.headers.get('location')).toBe(
      'https://example.com/portal/dashboard?google=error',
    );
  });

  it('redirects to dashboard?google=error when site is not owned by client', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // no site found
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback?code=auth&state=42'),
    );
    expect(res.headers.get('location')).toBe(
      'https://example.com/portal/dashboard?google=error',
    );
  });

  it('redirects to settings?google=error when tokens missing access_token', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 42, clientId: 5 }]); // site lookup
    getTokenMock.mockResolvedValue({
      tokens: { access_token: null, refresh_token: 'r' },
    });
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback?code=auth&state=42'),
    );
    expect(res.headers.get('location')).toBe(
      'https://example.com/portal/websites/42/settings?google=error',
    );
  });

  it('redirects to settings?google=error when tokens missing refresh_token', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 42, clientId: 5 }]);
    getTokenMock.mockResolvedValue({
      tokens: { access_token: 'a', refresh_token: null },
    });
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback?code=auth&state=42'),
    );
    expect(res.headers.get('location')).toBe(
      'https://example.com/portal/websites/42/settings?google=error',
    );
  });

  it('inserts tokens when none exist and redirects to settings?google=connected', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 42, clientId: 5 }]); // site lookup
    selectQueue.push([]); // existing tokens lookup — none
    getTokenMock.mockResolvedValue({
      tokens: {
        access_token: 'a-tok',
        refresh_token: 'r-tok',
        expiry_date: Date.now() + 3600 * 1000,
        scope: 'a b',
      },
    });
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback?code=auth&state=42'),
    );
    expect(res.headers.get('location')).toBe(
      'https://example.com/portal/websites/42/settings?google=connected',
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('googleWebsiteTokens');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.websiteId).toBe(42);
    expect(inserted.accessToken).toBe('a-tok');
    expect(inserted.refreshToken).toBe('r-tok');
    expect(inserted.expiresAt).toBeInstanceOf(Date);
  });

  it('updates tokens when they already exist', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 42, clientId: 5 }]); // site
    selectQueue.push([{ id: 99 }]); // existing token row
    getTokenMock.mockResolvedValue({
      tokens: {
        access_token: 'a-tok',
        refresh_token: 'r-tok',
        expiry_date: 0, // falsy — exercises the Date.now() fallback
      },
    });
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback?code=auth&state=42'),
    );
    expect(res.headers.get('location')).toBe(
      'https://example.com/portal/websites/42/settings?google=connected',
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('googleWebsiteTokens');
    expect(updateCalls[0].patch.accessToken).toBe('a-tok');
    expect(updateCalls[0].patch.refreshToken).toBe('r-tok');
    expect(insertCalls).toHaveLength(0);
  });

  it('catches token exchange errors and redirects to settings?google=error', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'example.com' }));
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 42, clientId: 5 }]);
    getTokenMock.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await googleCallbackRoute.GET(
      makeReq('https://example.com/api/portal/google/callback?code=auth&state=42'),
    );
    expect(res.headers.get('location')).toBe(
      'https://example.com/portal/websites/42/settings?google=error',
    );
    errSpy.mockRestore();
  });

  it('uses http when host is localhost', async () => {
    headersMock.mockResolvedValue(makeHeadersList({ host: 'localhost:3000' }));
    authMock.mockResolvedValue(null);
    const res = await googleCallbackRoute.GET(
      makeReq('http://localhost:3000/api/portal/google/callback?code=x&state=1'),
    );
    expect(res.headers.get('location')).toBe('http://localhost:3000/portal/dashboard');
  });
});

// ===========================================================================
// GET /api/portal/hosting/[id]
// ===========================================================================

describe('GET /api/portal/hosting/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await hostingIdRoute.GET(makeReq('http://x/api/portal/hosting/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await hostingIdRoute.GET(makeReq('http://x/api/portal/hosting/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when site is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await hostingIdRoute.GET(makeReq('http://x/api/portal/hosting/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns the site when found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5, name: 'My site' }]);
    const res = await hostingIdRoute.GET(makeReq('http://x/api/portal/hosting/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(body.data.name).toBe('My site');
  });
});

// ===========================================================================
// PATCH /api/portal/integrations/api-keys/[id]
// ===========================================================================

describe('PATCH /api/portal/integrations/api-keys/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/9', 'PATCH', {
        label: 'x',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/9', 'PATCH', {
        label: 'x',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when id is NaN', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/abc', 'PATCH', {
        label: 'x',
      }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid id');
  });

  it('returns 400 when nothing to update (no label key)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/9', 'PATCH', {}),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Nothing to update.');
  });

  it('returns 400 when body is invalid JSON', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // Use a Request whose json() will throw (no body present)
    const req = new Request('http://x/api/portal/integrations/api-keys/9', {
      method: 'PATCH',
    });
    const res = await apiKeysIdRoute.PATCH(req, {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when key not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // updateReturnQueue empty → returning() yields []
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/9', 'PATCH', {
        label: 'foo',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Key not found');
  });

  it('updates the label (trims and slices to 100 chars)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([
      { id: 9, provider: 'openai', label: 'My Key' },
    ]);
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/9', 'PATCH', {
        label: '   My Key   ',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('clientApiKeys');
    expect(updateCalls[0].patch.label).toBe('My Key');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('clears the label to null when an empty string is sent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([
      { id: 9, provider: 'openai', label: null },
    ]);
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/9', 'PATCH', {
        label: '   ',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.label).toBeNull();
  });

  it('clears the label to null when explicit null is sent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 9, provider: 'openai', label: null }]);
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/9', 'PATCH', {
        label: null,
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.label).toBeNull();
  });

  it('returns 400 when label is non-string non-null (treated as undefined)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await apiKeysIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/integrations/api-keys/9', 'PATCH', {
        label: 42,
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Nothing to update.');
  });
});

// ===========================================================================
// DELETE /api/portal/integrations/api-keys/[id]
// ===========================================================================

describe('DELETE /api/portal/integrations/api-keys/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysIdRoute.DELETE(
      makeReq('http://x/api/portal/integrations/api-keys/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysIdRoute.DELETE(
      makeReq('http://x/api/portal/integrations/api-keys/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when id is NaN', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await apiKeysIdRoute.DELETE(
      makeReq('http://x/api/portal/integrations/api-keys/abc', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid id');
  });

  it('returns 404 when key does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // deleteReturnQueue empty → returning() yields []
    const res = await apiKeysIdRoute.DELETE(
      makeReq('http://x/api/portal/integrations/api-keys/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Key not found');
  });

  it('deletes the key and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    deleteReturnQueue.push([{ id: 9 }]);
    const res = await apiKeysIdRoute.DELETE(
      makeReq('http://x/api/portal/integrations/api-keys/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('clientApiKeys');
  });
});

// ===========================================================================
// GET /api/portal/integrations/google/connect
// ===========================================================================

describe('GET /api/portal/integrations/google/connect', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await googleConnectRoute.GET(
      makeNextReq('https://x.com/api/portal/integrations/google/connect'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await googleConnectRoute.GET(
      makeNextReq('https://x.com/api/portal/integrations/google/connect'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No client for this user');
  });

  it('returns 409 workspace_not_provisioned when tenant credentials are missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue(null);
    const res = await googleConnectRoute.GET(
      makeNextReq('https://x.com/api/portal/integrations/google/connect'),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('workspace_not_provisioned');
  });

  it('returns 409 workspace_not_ready when tenant status is not active/configured', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'pending',
      oauth: {
        clientId: 'g-client',
        clientSecret: 'g-secret',
        redirectUri: 'https://stored/cb',
      },
    });
    const res = await googleConnectRoute.GET(
      makeNextReq('https://x.com/api/portal/integrations/google/connect'),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('workspace_not_ready');
    expect(body.status).toBe('pending');
  });

  it('redirects to Google with default (all) surfaces when none requested', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'active',
      oauth: {
        clientId: 'g-client',
        clientSecret: 'g-secret',
        redirectUri: 'https://stored/cb',
      },
    });
    signStateMock.mockReturnValue('signed-state');
    buildAuthUrlMock.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=signed-state');

    const res = await googleConnectRoute.GET(
      makeNextReq('https://x.com/api/portal/integrations/google/connect'),
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get('location')).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?state=signed-state',
    );
    expect(signStateMock).toHaveBeenCalledTimes(1);
    const signArg = signStateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(signArg.clientId).toBe(5);
    expect(signArg.userId).toBe(7);
    expect(signArg.surfaces).toEqual([
      'identity',
      'gmail',
      'calendar',
      'drive',
      'contacts',
    ]);
    expect(signArg.returnTo).toBeUndefined();

    expect(buildAuthUrlMock).toHaveBeenCalledTimes(1);
    const buildArg = buildAuthUrlMock.mock.calls[0][0] as Record<string, unknown>;
    expect(buildArg.state).toBe('signed-state');
    expect(buildArg.loginHint).toBe('user@example.com');
    const creds = buildArg.credentials as Record<string, unknown>;
    expect(creds.clientId).toBe('g-client');
    expect(creds.clientSecret).toBe('g-secret');
    expect(creds.redirectUri).toBe(
      'https://x.com/api/portal/integrations/google/callback',
    );
  });

  it('parses comma-separated surfaces, drops unknown, and prepends identity', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'configured',
      oauth: {
        clientId: 'g-client',
        clientSecret: 'g-secret',
        redirectUri: 'https://stored/cb',
      },
    });
    signStateMock.mockReturnValue('s');
    buildAuthUrlMock.mockReturnValue('https://google/auth');

    await googleConnectRoute.GET(
      makeNextReq(
        'https://x.com/api/portal/integrations/google/connect?surfaces=gmail,bogus,calendar&returnTo=/portal/inbox',
      ),
    );
    const signArg = signStateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(signArg.surfaces).toEqual(['identity', 'gmail', 'calendar']);
    expect(signArg.returnTo).toBe('/portal/inbox');
  });

  it('falls back to all surfaces when all requested are invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'active',
      oauth: {
        clientId: 'g-client',
        clientSecret: 'g-secret',
        redirectUri: 'https://stored/cb',
      },
    });
    signStateMock.mockReturnValue('s');
    buildAuthUrlMock.mockReturnValue('https://google/auth');

    await googleConnectRoute.GET(
      makeNextReq(
        'https://x.com/api/portal/integrations/google/connect?surfaces=bogus,unknown',
      ),
    );
    const signArg = signStateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(signArg.surfaces).toEqual([
      'identity',
      'gmail',
      'calendar',
      'drive',
      'contacts',
    ]);
  });

  it('keeps identity-first ordering when identity is explicitly listed last', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'active',
      oauth: {
        clientId: 'g-client',
        clientSecret: 'g-secret',
        redirectUri: 'https://stored/cb',
      },
    });
    signStateMock.mockReturnValue('s');
    buildAuthUrlMock.mockReturnValue('https://google/auth');

    await googleConnectRoute.GET(
      makeNextReq(
        'https://x.com/api/portal/integrations/google/connect?surfaces=gmail,identity',
      ),
    );
    const signArg = signStateMock.mock.calls[0][0] as Record<string, unknown>;
    // identity is already present — should NOT be unshifted again
    expect(signArg.surfaces).toEqual(['gmail', 'identity']);
  });
});
