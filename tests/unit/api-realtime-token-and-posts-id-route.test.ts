// @vitest-environment node
/**
 * Unit tests for two route files:
 *   - app/api/realtime/token/route.ts   (POST issues a Yjs JWT)
 *   - app/api/posts/[id]/route.ts       (GET / PUT / DELETE on a single post)
 *
 * Both routes hit auth + drizzle, so we share the auth + db mocks across
 * both describe() blocks. The DB mock is a tiny query-shape spy: each test
 * primes a queue of `__nextSelectResults` and `__nextReturning` so the
 * order in which the route runs `db.select(...).from(...).where(...).limit()`
 * or `db.update(...).set(...).where(...).returning()` (etc) consumes the
 * primed values FIFO.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks — declared BEFORE any route import (vi.mock is hoisted)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const getPortalClientsMock = vi.fn();
const getPortalRoleMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalClients: (...args: unknown[]) => getPortalClientsMock(...args),
  getPortalRole: (...args: unknown[]) => getPortalRoleMock(...args),
}));

const jwtSignMock = vi.fn(() => 'signed.jwt.token');
vi.mock('jsonwebtoken', () => ({
  default: { sign: (...args: unknown[]) => jwtSignMock(...args) },
  sign: (...args: unknown[]) => jwtSignMock(...args),
}));

// drizzle-orm — pass through opaque markers; the DB mock ignores them.
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — every table is a tiny proxy so route code may freely read column refs.
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    posts: wrap('posts'),
    pitchDecks: wrap('pitchDecks'),
    emailCampaigns: wrap('emailCampaigns'),
    clientWebsites: wrap('clientWebsites'),
    users: wrap('users'),
    postCategories: wrap('postCategories'),
    postTags: wrap('postTags'),
    postCustomFieldValues: wrap('postCustomFieldValues'),
    customFields: wrap('customFields'),
    postTypes: wrap('postTypes'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// In-memory result queues for select / returning. Tests `push()` what they
// expect the next chain-terminating call to resolve to.
const selectQueue: Array<Array<Record<string, unknown>>> = [];
const returningQueue: Array<Array<Record<string, unknown>>> = [];
let deleteCalls = 0;
let insertCalls: Array<{ table: string; values: unknown }> = [];

function nextSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function nextReturning(): Array<Record<string, unknown>> {
  return returningQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function selectChain() {
    const chain: Record<string, unknown> = {
      from() {
        return chain;
      },
      leftJoin() {
        return chain;
      },
      innerJoin() {
        return chain;
      },
      where() {
        return chain;
      },
      limit() {
        return Promise.resolve(nextSelect());
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(nextSelect()).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function updateChain() {
    return {
      set() {
        return {
          where() {
            return {
              returning() {
                return Promise.resolve(nextReturning());
              },
            };
          },
        };
      },
    };
  }

  function deleteChain() {
    return {
      where() {
        deleteCalls += 1;
        // Lazy: only consume the queue when the caller actually awaits the
        // promise OR calls .returning(). If both are used we share the value.
        let cached: Array<Record<string, unknown>> | undefined;
        const consume = () => {
          if (cached === undefined) cached = nextReturning();
          return cached;
        };
        const thenable = {
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(consume()).then(onFulfilled, onRejected);
          },
          returning() {
            return Promise.resolve(consume());
          },
        };
        return thenable;
      },
    };
  }

  function insertChain(tableRef: { __table?: string }) {
    return {
      values(vals: unknown) {
        insertCalls.push({ table: tableRef?.__table ?? 'unknown', values: vals });
        return Promise.resolve(undefined);
      },
    };
  }

  return {
    db: {
      select() {
        return selectChain();
      },
      update() {
        return updateChain();
      },
      delete() {
        return deleteChain();
      },
      insert(tableRef: { __table?: string }) {
        return insertChain(tableRef);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Per-test reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalClientsMock.mockReset();
  getPortalRoleMock.mockReset();
  jwtSignMock.mockClear();
  jwtSignMock.mockReturnValue('signed.jwt.token');
  selectQueue.length = 0;
  returningQueue.length = 0;
  deleteCalls = 0;
  insertCalls = [];
  process.env.REALTIME_JWT_SECRET = 'test-secret';
  delete process.env.NEXT_PUBLIC_REALTIME_URL;
});

// ===========================================================================
//  describe — POST /api/realtime/token
// ===========================================================================

describe('POST /api/realtime/token', () => {
  function makeReq(body: unknown): Request {
    return new Request('http://localhost/api/realtime/token', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '1' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 500 when REALTIME_JWT_SECRET is missing', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    delete process.env.REALTIME_JWT_SECRET;
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '1' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain('REALTIME_JWT_SECRET');
  });

  it('returns 400 on malformed JSON body', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    const { POST } = await import('@/app/api/realtime/token/route');
    const req = new Request('http://localhost/api/realtime/token', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid JSON body');
  });

  it('returns 400 for invalid entityType', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'banana', entityId: '1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid entityType');
  });

  it('returns 400 when entityId is missing', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Missing entityId');
  });

  it('returns 400 when entityId is an empty string', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when entityId is non-numeric (NaN parse)', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: 'abc' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found or access denied');
  });

  it('returns 404 when post does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    // posts lookup → empty
    selectQueue.push([]);
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '42' }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when post has null clientId', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ postId: 42, websiteId: 9, clientId: null }]);
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '42' }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when user has no access to post clientId', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ postId: 42, websiteId: 9, clientId: 5 }]);
    getPortalClientMock.mockResolvedValue(null);
    getPortalClientsMock.mockResolvedValue([{ id: 99 }]);
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '42' }));
    expect(res.status).toBe(404);
  });

  it('issues a JWT for a post the user can access (active-client fast path, write scope)', async () => {
    authMock.mockResolvedValue({
      user: { id: '7', name: 'Session Name', image: 'https://img/x.png' },
    });
    selectQueue.push([{ postId: 42, websiteId: 9, clientId: 5 }]); // posts join
    selectQueue.push([{ id: 7, name: 'Db Name' }]); // users lookup
    getPortalClientMock.mockResolvedValue({ id: 5 }); // active-client fast path
    getPortalRoleMock.mockResolvedValue('admin');
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '42' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('signed.jwt.token');
    expect(body.data.docKey).toBe('post:42');
    expect(body.data.scope).toBe('write');
    expect(body.data.wsUrl).toBe('ws://localhost:3030');
    expect(body.data.expiresAt).toBeGreaterThan(Date.now());
    // jwt payload assertions
    expect(jwtSignMock).toHaveBeenCalledTimes(1);
    const [payload, secret] = jwtSignMock.mock.calls[0] as [Record<string, unknown>, string];
    expect(secret).toBe('test-secret');
    expect(payload.sub).toBe('7');
    expect(payload.name).toBe('Db Name');
    expect(payload.clientId).toBe(5);
    expect(payload.docKey).toBe('post:42');
    expect(payload.scope).toBe('write');
    expect(payload.avatar).toBe('https://img/x.png');
    expect(typeof payload.color).toBe('string');
    expect((payload.color as string).startsWith('#')).toBe(true);
  });

  it('issues a read-scope token when role is viewer', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ postId: 42, websiteId: 9, clientId: 5 }]);
    selectQueue.push([{ id: 7, name: null }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getPortalRoleMock.mockResolvedValue('viewer');
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '42' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.scope).toBe('read');
    const [payload] = jwtSignMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.name).toBe('User'); // fallback when db + session name absent
  });

  it('falls back to getPortalClients list when active-client does not match', async () => {
    authMock.mockResolvedValue({ user: { id: '7', name: 'Sess' } });
    selectQueue.push([{ postId: 42, websiteId: 9, clientId: 5 }]);
    selectQueue.push([{ id: 7, name: 'Db Name' }]);
    getPortalClientMock.mockResolvedValue({ id: 999 }); // mismatch
    getPortalClientsMock.mockResolvedValue([{ id: 5 }, { id: 7 }]);
    getPortalRoleMock.mockResolvedValue('member');
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '42' }));
    expect(res.status).toBe(200);
  });

  it('respects NEXT_PUBLIC_REALTIME_URL override', async () => {
    process.env.NEXT_PUBLIC_REALTIME_URL = 'wss://realtime.example.com';
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ postId: 42, websiteId: 9, clientId: 5 }]);
    selectQueue.push([{ id: 7, name: 'X' }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    getPortalRoleMock.mockResolvedValue('owner');
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: '42' }));
    const body = await res.json();
    expect(body.data.wsUrl).toBe('wss://realtime.example.com');
  });

  it('resolves a deck entity via pitchDecks', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ clientId: 11 }]); // pitchDecks lookup
    selectQueue.push([{ id: 7, name: 'Db Name' }]);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    getPortalRoleMock.mockResolvedValue('admin');
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'deck', entityId: '100' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.docKey).toBe('deck:100');
  });

  it('returns 404 when deck does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([]); // empty deck
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'deck', entityId: '100' }));
    expect(res.status).toBe(404);
  });

  it('resolves an email entity via emailCampaigns', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ clientId: 22 }]); // campaign lookup
    selectQueue.push([{ id: 7, name: 'X' }]);
    getPortalClientMock.mockResolvedValue({ id: 22 });
    getPortalRoleMock.mockResolvedValue('admin');
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'email', entityId: '55' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.docKey).toBe('email:55');
  });

  it('returns 404 when email campaign has null clientId', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ clientId: null }]);
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'email', entityId: '55' }));
    expect(res.status).toBe(404);
  });

  it('handles numeric entityId on the wire', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ postId: 1, websiteId: 2, clientId: 3 }]);
    selectQueue.push([{ id: 7, name: 'X' }]);
    getPortalClientMock.mockResolvedValue({ id: 3 });
    getPortalRoleMock.mockResolvedValue('member');
    const { POST } = await import('@/app/api/realtime/token/route');
    const res = await POST(makeReq({ entityType: 'post', entityId: 1 }));
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
//  describe — GET / PUT / DELETE /api/posts/[id]
// ===========================================================================

describe('GET/PUT/DELETE /api/posts/[id]', () => {
  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }
  function makeRequest(method: string, body?: unknown) {
    return {
      json: async () => body ?? {},
      method,
    } as unknown as import('next/server').NextRequest;
  }

  // --- gate -------------------------------------------------------------
  it('GET returns 401 with no session', async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/posts/[id]/route');
    const res = await GET(makeRequest('GET'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('GET returns 403 when role is not admin/editor', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'viewer' } });
    const { GET } = await import('@/app/api/posts/[id]/route');
    const res = await GET(makeRequest('GET'), makeParams('1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  // --- GET --------------------------------------------------------------
  it('GET returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { GET } = await import('@/app/api/posts/[id]/route');
    const res = await GET(makeRequest('GET'), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid post ID');
  });

  it('GET returns 404 when post not found', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    selectQueue.push([]);
    const { GET } = await import('@/app/api/posts/[id]/route');
    const res = await GET(makeRequest('GET'), makeParams('99'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Post not found');
  });

  it('GET returns the post when found', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'editor' } });
    selectQueue.push([{ id: 7, title: 'Hello', slug: 'hello' }]);
    const { GET } = await import('@/app/api/posts/[id]/route');
    const res = await GET(makeRequest('GET'), makeParams('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Hello');
  });

  // --- PUT --------------------------------------------------------------
  it('PUT returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(makeRequest('PUT', {}), makeParams('xyz'));
    expect(res.status).toBe(400);
  });

  it('PUT returns 400 with details on Zod validation failure', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { PUT } = await import('@/app/api/posts/[id]/route');
    // title must be min(1) when present
    const res = await PUT(makeRequest('PUT', { title: '' }), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('PUT returns 404 when update touches no rows', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([]); // .returning() resolves empty
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(makeRequest('PUT', { title: 'New' }), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Post not found');
  });

  it('PUT updates simple fields without touching join tables', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([
      { id: 1, title: 'New title', slug: 'new', postType: 'post' },
    ]);
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(
      makeRequest('PUT', { title: 'New title' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('New title');
    // no category / tag inserts when not supplied
    expect(insertCalls.length).toBe(0);
  });

  it('PUT replaces category + tag joins when supplied', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([{ id: 1, postType: 'post' }]); // update returning
    // .delete().where() then insert — no further selects needed unless customFields
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(
      makeRequest('PUT', { categoryIds: [10, 11], tagIds: [20] }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toBeGreaterThanOrEqual(2); // categories + tags
    // 2 inserts: postCategories + postTags
    expect(insertCalls.length).toBe(2);
    const tables = insertCalls.map((c) => c.table).sort();
    expect(tables).toContain('postCategories');
    expect(tables).toContain('postTags');
  });

  it('PUT clears tag joins when tagIds is empty array (no insert)', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([{ id: 1, postType: 'post' }]);
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(
      makeRequest('PUT', { tagIds: [] }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toBeGreaterThanOrEqual(1);
    expect(insertCalls.length).toBe(0); // empty list means delete-only
  });

  it('PUT writes customFields when post type + field defs exist', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([{ id: 1, postType: 'article' }]); // update returning
    // After the delete, the route does TWO selects:
    //   1) postTypes lookup
    //   2) customFields by postTypeId
    selectQueue.push([{ id: 200, slug: 'article' }]);
    selectQueue.push([
      { id: 301, slug: 'subtitle', postTypeId: 200 },
      { id: 302, slug: 'cta', postTypeId: 200 },
    ]);
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(
      makeRequest('PUT', {
        customFields: { subtitle: 'Hi', cta: 'Click', unknown: 'skip me' },
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const cfInserts = insertCalls.filter((c) => c.table === 'postCustomFieldValues');
    expect(cfInserts.length).toBe(1);
    const inserted = cfInserts[0].values as Array<{ customFieldId: number; value: string }>;
    // unknown slug filtered out; subtitle + cta kept
    expect(inserted.length).toBe(2);
    const ids = inserted.map((v) => v.customFieldId).sort();
    expect(ids).toEqual([301, 302]);
  });

  it('PUT customFields={} skips post-type lookup entirely', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([{ id: 1, postType: 'article' }]);
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(
      makeRequest('PUT', { customFields: {} }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    // delete happens for clearing custom field values, but no postTypes select
    expect(insertCalls.filter((c) => c.table === 'postCustomFieldValues').length).toBe(0);
  });

  it('PUT customFields does nothing when post type lookup misses', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([{ id: 1, postType: 'missing' }]);
    selectQueue.push([]); // postTypes lookup returns nothing
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(
      makeRequest('PUT', { customFields: { subtitle: 'Hi' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(insertCalls.filter((c) => c.table === 'postCustomFieldValues').length).toBe(0);
  });

  it('PUT accepts ISO publishedAt and coerces to Date', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([{ id: 1, postType: 'post' }]);
    const { PUT } = await import('@/app/api/posts/[id]/route');
    const res = await PUT(
      makeRequest('PUT', { publishedAt: '2026-01-01T00:00:00.000Z' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });

  it('PUT returns 500 on unexpected error', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { PUT } = await import('@/app/api/posts/[id]/route');
    // Force request.json() to throw
    const req = {
      json: async () => {
        throw new Error('boom');
      },
    } as unknown as import('next/server').NextRequest;
    const res = await PUT(req, makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to update post');
  });

  // --- DELETE -----------------------------------------------------------
  it('DELETE returns 401 with no session', async () => {
    authMock.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/posts/[id]/route');
    const res = await DELETE(makeRequest('DELETE'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('DELETE returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    const { DELETE } = await import('@/app/api/posts/[id]/route');
    const res = await DELETE(makeRequest('DELETE'), makeParams('not-a-number'));
    expect(res.status).toBe(400);
  });

  it('DELETE returns 404 when no row is deleted', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([]); // .returning() resolves empty
    const { DELETE } = await import('@/app/api/posts/[id]/route');
    const res = await DELETE(makeRequest('DELETE'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Post not found');
  });

  it('DELETE returns success when a row is removed', async () => {
    authMock.mockResolvedValue({ user: { id: '1', role: 'admin' } });
    returningQueue.push([{ id: 1, title: 'Bye' }]);
    const { DELETE } = await import('@/app/api/posts/[id]/route');
    const res = await DELETE(makeRequest('DELETE'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/deleted/i);
  });
});
