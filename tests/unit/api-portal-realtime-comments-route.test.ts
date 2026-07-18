// @vitest-environment node
/**
 * Unit tests for GET / POST /api/portal/realtime/comments.
 *
 * The route handles document-comment list (GET) and create (POST), with
 * tenancy scoping via portalClient, reply-thread validation, root insert via
 * gen_random_uuid(), and mention notifications restricted to active tenant
 * members. Everything external (auth, db, schema, drizzle ops, portal client,
 * crm notifications) is mocked. No real network or DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (declared BEFORE the route import — Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const createCrmNotificationMock = vi.fn();
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: (...args: unknown[]) =>
    createCrmNotificationMock(...args),
}));

// ---- schema — proxy column refs so they round-trip through the DB mock ----
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
    documentComments: wrap('documentComments'),
    clientMembers: wrap('clientMembers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
    __sql: true,
    raw: strings.join('?'),
  }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

// ---- in-memory DB shape ----

interface MockState {
  documentComments: Array<Record<string, unknown>>;
  clientMembers: Array<Record<string, unknown>>;
}

const state: MockState = {
  documentComments: [],
  clientMembers: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    list?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return (f.list ?? []).includes(row[col.__col]);
    }
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

// gen_random_uuid sentinel; tests can override per-call
let genUuid = 'uuid-root-0001';
function takeUuid(): string {
  return genUuid;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, { __col?: string }>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy(_arg: unknown) {
        return runQuery();
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => ({ ...r }));
      if (projection) {
        out = out.map((r) => {
          const slim: Record<string, unknown> = {};
          for (const [alias, col] of Object.entries(projection)) {
            const key = col?.__col ?? alias;
            slim[alias] = r[key];
          }
          return slim;
        });
      }
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = {
            ...v,
            // Only auto-assign id when one wasn't provided (route passes uuid)
            id: v.id ?? nextId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, { __col?: string }>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection).from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      execute<T = unknown>(_q: unknown): Promise<T[]> {
        // Used for `select gen_random_uuid() as uuid`
        return Promise.resolve([{ uuid: takeUuid() } as T]);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { GET, POST } = await import(
  '@/app/api/portal/realtime/comments/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGet(url: string): Request {
  return new Request(url, { method: 'GET' });
}

function makePost(body: unknown): Request {
  return new Request('http://x/api/portal/realtime/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePostRaw(raw: string): Request {
  return new Request('http://x/api/portal/realtime/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
  });
}

beforeEach(() => {
  state.documentComments.length = 0;
  state.clientMembers.length = 0;
  idCounter = 1000;
  genUuid = 'uuid-root-0001';

  authMock.mockReset();
  getPortalClientMock.mockReset();
  createCrmNotificationMock.mockReset().mockResolvedValue(undefined);

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/realtime/comments', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityType=post&entityId=1'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityType=post&entityId=1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when entityType is missing', async () => {
    const res = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityId=1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Missing or invalid entityType\/entityId/);
  });

  it('returns 400 when entityType is invalid', async () => {
    const res = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityType=bogus&entityId=1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when entityId is missing', async () => {
    const res = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityType=post'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityType=post&entityId=1'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/No portal client/);
  });

  it('returns rows scoped to the portal client + entity (tenancy)', async () => {
    state.documentComments.push(
      { id: 'c1', clientId: 10, entityType: 'post', entityId: '1', body: 'hi' },
      { id: 'c2', clientId: 10, entityType: 'post', entityId: '1', body: 'yo' },
      // Different client — must NOT leak
      { id: 'c3', clientId: 99, entityType: 'post', entityId: '1', body: 'leak' },
      // Different entity
      { id: 'c4', clientId: 10, entityType: 'deck', entityId: '1', body: 'wrong type' },
    );

    const res = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityType=post&entityId=1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    const ids = body.data.map((r: { id: string }) => r.id).sort();
    expect(ids).toEqual(['c1', 'c2']);
  });

  it('accepts entityType=deck and entityType=email', async () => {
    state.documentComments.push(
      { id: 'd1', clientId: 10, entityType: 'deck', entityId: '5', body: 'd' },
      { id: 'e1', clientId: 10, entityType: 'email', entityId: '5', body: 'e' },
    );
    const deckRes = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityType=deck&entityId=5'),
    );
    const emailRes = await GET(
      makeGet('http://x/api/portal/realtime/comments?entityType=email&entityId=5'),
    );
    expect(deckRes.status).toBe(200);
    expect(emailRes.status).toBe(200);
    expect((await deckRes.json()).data).toHaveLength(1);
    expect((await emailRes.json()).data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST — auth / validation
// ---------------------------------------------------------------------------

describe('POST /api/portal/realtime/comments — auth + validation', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(
      makePost({ entityType: 'post', entityId: '1', body: 'hi' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(
      makePost({ entityType: 'post', entityId: '1', body: 'hi' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid JSON body', async () => {
    const res = await POST(makePostRaw('not json {{{'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid JSON');
  });

  it('returns 400 when entityType is missing', async () => {
    const res = await POST(makePost({ entityId: '1', body: 'hi' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Missing entityType or entityId/);
  });

  it('returns 400 when entityType is invalid', async () => {
    const res = await POST(
      makePost({ entityType: 'bogus', entityId: '1', body: 'hi' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when entityId is missing', async () => {
    const res = await POST(makePost({ entityType: 'post', body: 'hi' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is empty / whitespace only', async () => {
    const res = await POST(
      makePost({ entityType: 'post', entityId: '1', body: '   ' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Comment body required');
  });

  it('returns 403 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await POST(
      makePost({ entityType: 'post', entityId: '1', body: 'hi' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/No portal client/);
  });

  it('coerces numeric entityId to string', async () => {
    const res = await POST(
      makePost({ entityType: 'post', entityId: 42, body: 'hi' }),
    );
    expect(res.status).toBe(200);
    expect(state.documentComments[0].entityId).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// POST — root insert (no threadId)
// ---------------------------------------------------------------------------

describe('POST /api/portal/realtime/comments — root insert', () => {
  it('creates a root comment with id === threadId via gen_random_uuid', async () => {
    genUuid = 'uuid-fresh-root';
    const res = await POST(
      makePost({ entityType: 'post', entityId: '1', body: 'hello' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('uuid-fresh-root');
    expect(body.data.threadId).toBe('uuid-fresh-root');
    expect(body.data.parentId).toBeNull();
    expect(body.data.authorId).toBe(7);
    expect(body.data.body).toBe('hello');
    expect(body.data.clientId).toBe(10);
    expect(state.documentComments).toHaveLength(1);
  });

  it('persists optional anchor + mentionedUserIds on root insert', async () => {
    const anchor = { type: 'block', blockId: 'b-1' };
    const res = await POST(
      makePost({
        entityType: 'deck',
        entityId: '7',
        body: 'anchored',
        anchor,
        mentionedUserIds: [],
      }),
    );
    expect(res.status).toBe(200);
    const row = state.documentComments[0];
    expect(row.anchor).toEqual(anchor);
    expect(row.entityType).toBe('deck');
    expect(row.mentionedUserIds).toEqual([]);
  });

  it('trims the body before persisting', async () => {
    await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: '   hello world   ',
      }),
    );
    expect(state.documentComments[0].body).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// POST — reply path
// ---------------------------------------------------------------------------

describe('POST /api/portal/realtime/comments — reply', () => {
  it('returns 404 when threadId does not match an existing root', async () => {
    const res = await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: 'reply',
        threadId: 'no-such-thread',
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Thread not found');
  });

  it('returns 404 when threadId belongs to a different client (tenancy)', async () => {
    state.documentComments.push({
      id: 'root-1',
      clientId: 99, // different tenant
      entityType: 'post',
      entityId: '1',
      threadId: 'root-1',
      parentId: null,
      authorId: 1,
      body: 'cross-tenant',
    });
    const res = await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: 'reply',
        threadId: 'root-1',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('inserts a reply row when threadId matches in same client + entity', async () => {
    state.documentComments.push({
      id: 'root-1',
      clientId: 10,
      entityType: 'post',
      entityId: '1',
      threadId: 'root-1',
      parentId: null,
      authorId: 1,
      body: 'parent',
    });
    const res = await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: 'thanks',
        threadId: 'root-1',
        parentId: 'root-1',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.threadId).toBe('root-1');
    expect(body.data.parentId).toBe('root-1');
    expect(body.data.body).toBe('thanks');
    expect(state.documentComments).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// POST — mention notifications
// ---------------------------------------------------------------------------

describe('POST /api/portal/realtime/comments — mention notifications', () => {
  it('does not call notifications when no mentionedUserIds', async () => {
    await POST(makePost({ entityType: 'post', entityId: '1', body: 'hi' }));
    // microtask flush
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('skips the author from the mention set', async () => {
    state.clientMembers.push(
      { clientId: 10, userId: 7 }, // the author
    );
    await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: 'hi me',
        mentionedUserIds: [7], // self-mention only
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('notifies only tenant members (filters out non-members)', async () => {
    state.clientMembers.push(
      { clientId: 10, userId: 8 },
      { clientId: 10, userId: 9 },
      // userId 999 is NOT a member — must be excluded
    );
    await POST(
      makePost({
        entityType: 'post',
        entityId: '5',
        body: 'shoutout',
        mentionedUserIds: [8, 9, 999],
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(2);
    const recipients = createCrmNotificationMock.mock.calls
      .map((c) => (c[0] as { userId: number }).userId)
      .sort();
    expect(recipients).toEqual([8, 9]);
  });

  it('dedupes duplicate mentionedUserIds', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    await POST(
      makePost({
        entityType: 'post',
        entityId: '5',
        body: 'twice',
        mentionedUserIds: [8, 8, 8],
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('builds a "page" titlePrefix for entityType=post and coerces numeric entityId', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    await POST(
      makePost({
        entityType: 'post',
        entityId: '42',
        body: 'mention',
        mentionedUserIds: [8],
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        userId: 8,
        type: 'document_comment_mention',
        title: expect.stringContaining('page'),
        entityType: 'post',
        entityId: 42,
      }),
    );
  });

  it('uses "deck" titlePrefix for entityType=deck', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    await POST(
      makePost({
        entityType: 'deck',
        entityId: '7',
        body: 'mention',
        mentionedUserIds: [8],
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('deck'),
        entityType: 'deck',
        entityId: 7,
      }),
    );
  });

  it('uses "email" titlePrefix for entityType=email', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    await POST(
      makePost({
        entityType: 'email',
        entityId: '13',
        body: 'mention',
        mentionedUserIds: [8],
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('email'),
        entityType: 'email',
        entityId: 13,
      }),
    );
  });

  it('omits notif entityId when entityId is non-numeric (text)', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    await POST(
      makePost({
        entityType: 'post',
        entityId: 'slug-not-an-int',
        body: 'mention',
        mentionedUserIds: [8],
      }),
    );
    await new Promise((r) => setImmediate(r));
    const call = createCrmNotificationMock.mock.calls[0]![0] as {
      entityId?: number;
    };
    expect(call.entityId).toBeUndefined();
  });

  it('truncates the body snippet to 120 chars', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    const longBody = 'x'.repeat(300);
    await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: longBody,
        mentionedUserIds: [8],
      }),
    );
    await new Promise((r) => setImmediate(r));
    const call = createCrmNotificationMock.mock.calls[0]![0] as {
      body?: string;
    };
    expect(call.body).toHaveLength(120);
  });

  it('ignores non-finite / non-number ids in mentionedUserIds', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: 'mention',
        mentionedUserIds: [
          8,
          // these should all be filtered out:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'oops' as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          NaN as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Infinity as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          null as any,
        ],
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('swallows notifier errors so the comment insert still returns 200', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    createCrmNotificationMock.mockRejectedValueOnce(new Error('notif boom'));
    const res = await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: 'mention',
        mentionedUserIds: [8],
      }),
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    // notifier still attempted
    expect(createCrmNotificationMock).toHaveBeenCalled();
  });

  it('fires notifications on reply path too', async () => {
    state.clientMembers.push({ clientId: 10, userId: 8 });
    state.documentComments.push({
      id: 'root-1',
      clientId: 10,
      entityType: 'post',
      entityId: '1',
      threadId: 'root-1',
      parentId: null,
      authorId: 1,
      body: 'parent',
    });
    await POST(
      makePost({
        entityType: 'post',
        entityId: '1',
        body: 'reply with mention',
        threadId: 'root-1',
        mentionedUserIds: [8],
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
  });
});
