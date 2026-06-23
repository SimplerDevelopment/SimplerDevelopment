// @vitest-environment node
/**
 * Unit tests — batch 22d — covers four small route handlers:
 *   - app/api/contact/route.ts  (POST)
 *   - app/api/portal/default-website/route.ts  (GET, POST)
 *   - app/api/portal/oauth-tokens/route.ts  (GET, DELETE)
 *   - app/api/portal/chat/widgets/route.ts  (GET, POST)
 *
 * Each route gets its own describe block. We mock auth / db / portal-client
 * with the same chainable thenable pattern used by other batch tests so the
 * routes' Drizzle queries resolve to queued results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (declared before importing the routes under test)
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
  desc: (col: unknown) => ({ op: 'desc', col }),
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
    clients: wrap('clients'),
    clientWebsites: wrap('clientWebsites'),
    oauthAccessTokens: wrap('oauthAccessTokens'),
    oauthClients: wrap('oauthClients'),
    chatWidgets: wrap('chatWidgets'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---- db mock ----

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) materialized = Promise.resolve(shiftNext());
      return materialized;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    const terminal = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materialized!.then(onF, onR);
        },
      };
    };
    chain.orderBy = terminal;
    chain.limit = terminal;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
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
        const rows = insertReturnQueue.shift() ?? [];
        insertCalls.push({ table: table.__table, values: v, returnedRows: rows });
        const cloned = rows.map((r) => ({ ...r }));
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
// Routes under test (imported lazily after mocks)
// ---------------------------------------------------------------------------

const contactRoute = await import('@/app/api/contact/route');
const defaultWebsiteRoute = await import('@/app/api/portal/default-website/route');
const oauthTokensRoute = await import('@/app/api/portal/oauth-tokens/route');
const chatWidgetsRoute = await import('@/app/api/portal/chat/widgets/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonRequest(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7', name: 'User' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
});

// ===========================================================================
// /api/contact (POST)
// ===========================================================================

describe('POST /api/contact', () => {
  it('returns 200 silently when honeypot is filled', async () => {
    const res = await contactRoute.POST(
      makeJsonRequest('http://x/api/contact', {
        name: 'Bot',
        email: 'bot@x.com',
        message: 'spam spam spam spam',
        website: 'http://evil.example',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Message sent successfully' });
  });

  it('accepts a valid submission', async () => {
    const res = await contactRoute.POST(
      makeJsonRequest('http://x/api/contact', {
        name: 'Alice',
        email: 'alice@example.com',
        subject: 'Hello',
        message: 'I would like to learn more about your services.',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Message sent successfully');
  });

  it('returns 400 with validation details when email is invalid', async () => {
    const res = await contactRoute.POST(
      makeJsonRequest('http://x/api/contact', {
        name: 'Alice',
        email: 'not-an-email',
        message: 'A long enough message to pass.',
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid form data');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 400 when message is too short', async () => {
    const res = await contactRoute.POST(
      makeJsonRequest('http://x/api/contact', {
        name: 'Alice',
        email: 'alice@example.com',
        message: 'short',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is too short', async () => {
    const res = await contactRoute.POST(
      makeJsonRequest('http://x/api/contact', {
        name: 'A',
        email: 'alice@example.com',
        message: 'A long enough message to pass.',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 when request body is unparseable JSON', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badReq = new Request('http://x/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await contactRoute.POST(badReq as never);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to send message');
    errSpy.mockRestore();
  });
});

// ===========================================================================
// /api/portal/default-website (GET, POST)
// ===========================================================================

describe('GET /api/portal/default-website', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await defaultWebsiteRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await defaultWebsiteRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No client found');
  });

  it('returns websites and the current default id', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, defaultWebsiteId: 12 });
    selectQueue.push([
      { id: 12, name: 'Main', subdomain: 'main', domain: null },
      { id: 13, name: 'Alt', subdomain: 'alt', domain: 'alt.example' },
    ]);
    const res = await defaultWebsiteRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultWebsiteId).toBe(12);
    expect(body.websites).toHaveLength(2);
  });

  it('returns null defaultWebsiteId when client has none set', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, defaultWebsiteId: null });
    selectQueue.push([]);
    const res = await defaultWebsiteRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).defaultWebsiteId).toBeNull();
  });
});

describe('POST /api/portal/default-website', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await defaultWebsiteRoute.POST(
      makeJsonRequest('http://x/api/portal/default-website', { websiteId: 1 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when websiteId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await defaultWebsiteRoute.POST(
      makeJsonRequest('http://x/api/portal/default-website', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('websiteId is required');
  });

  it('returns 400 when websiteId is not a number', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await defaultWebsiteRoute.POST(
      makeJsonRequest('http://x/api/portal/default-website', { websiteId: 'abc' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await defaultWebsiteRoute.POST(
      makeJsonRequest('http://x/api/portal/default-website', { websiteId: 5 }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the site does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // site lookup -> none
    const res = await defaultWebsiteRoute.POST(
      makeJsonRequest('http://x/api/portal/default-website', { websiteId: 99 }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Website not found');
  });

  it('updates the client default website on success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 12 }]); // site lookup
    const res = await defaultWebsiteRoute.POST(
      makeJsonRequest('http://x/api/portal/default-website', { websiteId: 12 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, defaultWebsiteId: 12 });
    const upd = updateCalls.find((u) => u.table === 'clients');
    expect(upd).toBeTruthy();
    expect(upd!.patch.defaultWebsiteId).toBe(12);
    expect(upd!.patch.updatedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// /api/portal/oauth-tokens (GET, DELETE)
// ===========================================================================

describe('GET /api/portal/oauth-tokens', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await oauthTokensRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await oauthTokensRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await oauthTokensRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns rows with issuedToYou flagged for the caller', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 1,
        tokenPreview: 'abc',
        scopes: 'read',
        resource: 'mcp',
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date('2025-02-01'),
        userId: 7,
        clientName: 'Claude.ai',
        clientUri: 'https://claude.ai',
      },
      {
        id: 2,
        tokenPreview: 'def',
        scopes: 'read',
        resource: 'mcp',
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date('2025-01-01'),
        userId: 9,
        clientName: 'Other',
        clientUri: 'https://other',
      },
    ]);
    const res = await oauthTokensRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ id: 1, issuedToYou: true });
    expect(body.data[1]).toMatchObject({ id: 2, issuedToYou: false });
  });
});

describe('DELETE /api/portal/oauth-tokens', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await oauthTokensRoute.DELETE(
      new Request('http://x/api/portal/oauth-tokens?id=1', { method: 'DELETE' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await oauthTokensRoute.DELETE(
      new Request('http://x/api/portal/oauth-tokens?id=1', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when id is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await oauthTokensRoute.DELETE(
      new Request('http://x/api/portal/oauth-tokens', { method: 'DELETE' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('id required');
  });

  it('returns 400 when id is non-numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await oauthTokensRoute.DELETE(
      new Request('http://x/api/portal/oauth-tokens?id=abc', { method: 'DELETE' }),
    );
    expect(res.status).toBe(400);
  });

  it('revokes the token by setting revokedAt', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await oauthTokensRoute.DELETE(
      new Request('http://x/api/portal/oauth-tokens?id=42', { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const upd = updateCalls.find((u) => u.table === 'oauthAccessTokens');
    expect(upd).toBeTruthy();
    expect(upd!.patch.revokedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// /api/portal/chat/widgets (GET, POST)
// ===========================================================================

describe('GET /api/portal/chat/widgets', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await chatWidgetsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await chatWidgetsRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of widgets for the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, clientId: 33, siteId: 7, enabled: true },
      { id: 2, clientId: 33, siteId: 8, enabled: false },
    ]);
    const res = await chatWidgetsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

describe('POST /api/portal/chat/widgets', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await chatWidgetsRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/widgets', { siteId: 1 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await chatWidgetsRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/widgets', { siteId: 1 }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when siteId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await chatWidgetsRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/widgets', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('siteId is required');
  });

  it('returns 400 when siteId is non-numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await chatWidgetsRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/widgets', { siteId: 'abc' }),
    );
    expect(res.status).toBe(400);
  });

  it('handles unparseable JSON body by defaulting to empty object', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const badReq = new Request('http://x/api/portal/chat/widgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await chatWidgetsRoute.POST(badReq);
    // No siteId -> 400, not 500
    expect(res.status).toBe(400);
  });

  it('returns 404 when site does not belong to client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // site lookup -> none
    const res = await chatWidgetsRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/widgets', { siteId: 99 }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Site not found');
  });

  it('returns 409 when a widget already exists for the site', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 7 }]); // site lookup
    selectQueue.push([{ id: 1, siteId: 7 }]); // existing widget
    const res = await chatWidgetsRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/widgets', { siteId: 7 }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe('Widget already exists for this site');
  });

  it('creates a widget with defaults when only siteId provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 7 }]); // site lookup
    selectQueue.push([]); // existing widget -> none
    insertReturnQueue.push([
      { id: 100, clientId: 33, siteId: 7, enabled: true, position: 'bottom-right' },
    ]);
    const res = await chatWidgetsRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/widgets', { siteId: 7 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(100);
    const ins = insertCalls.find((c) => c.table === 'chatWidgets')!;
    const values = ins.values as Record<string, unknown>;
    expect(values).toMatchObject({
      clientId: 33,
      siteId: 7,
      enabled: true,
      greetingMessage: 'Hi there! How can we help?',
      position: 'bottom-right',
      primaryColor: '#0070f3',
      awayMessage: null,
      brainEnabled: false,
    });
  });

  it('honors caller-supplied widget fields', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 7 }]);
    selectQueue.push([]);
    insertReturnQueue.push([{ id: 101 }]);
    const res = await chatWidgetsRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/widgets', {
        siteId: 7,
        enabled: false,
        greetingMessage: 'Hello!',
        position: 'bottom-left',
        primaryColor: '#ff0000',
        awayMessage: 'Be right back',
      }),
    );
    expect(res.status).toBe(200);
    const ins = insertCalls.find((c) => c.table === 'chatWidgets')!;
    expect(ins.values).toMatchObject({
      enabled: false,
      greetingMessage: 'Hello!',
      position: 'bottom-left',
      primaryColor: '#ff0000',
      awayMessage: 'Be right back',
    });
  });
});
