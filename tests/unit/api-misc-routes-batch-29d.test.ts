// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 29d):
 *   - app/api/portal/cards/[id]/unsubscribe/route.ts        (GET)
 *   - app/api/portal/cards/route.ts                         (POST)
 *   - app/api/portal/chat/conversations/route.ts            (GET)
 *   - app/api/portal/chat/conversations/[id]/route.ts       (GET, PATCH)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (declared before importing route modules)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const logCardActivityMock = vi.fn();
vi.mock('@/lib/pm-activity', () => ({
  logCardActivity: (...args: unknown[]) => logCardActivityMock(...args),
}));

const unwatchMock = vi.fn();
const verifyUnsubscribeMock = vi.fn();
vi.mock('@/lib/pm-notifications', () => ({
  unwatch: (...args: unknown[]) => unwatchMock(...args),
  verifyUnsubscribe: (...args: unknown[]) => verifyUnsubscribeMock(...args),
}));

const publishConversationUpdateMock = vi.fn();
vi.mock('@/lib/chat/realtime', () => ({
  publishConversationUpdate: (...args: unknown[]) => publishConversationUpdateMock(...args),
}));

// drizzle-orm — stub operators to plain objects (we don't introspect them)
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (col: unknown) => ({ op: 'asc', col }),
  desc: (col: unknown) => ({ op: 'desc', col }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
}));

// schema — proxy tables so `table.col` and `eq(table.col, x)` are inert
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === '$inferInsert') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    kanbanCards: wrap('kanbanCards'),
    kanbanColumns: wrap('kanbanColumns'),
    projects: wrap('projects'),
    chatConversations: wrap('chatConversations'),
    chatMessages: wrap('chatMessages'),
  };
});

// ---- db mock with select-queue + capture for writes ----

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNextSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNextSelect());
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'offset']) {
      chain[m] = passthrough;
    }
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        offset: () => ({
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return materializedPromise!.then(onF, onR);
          },
        }),
      };
    };
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
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: rows });
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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
          onConflictDoNothing() {
            return Promise.resolve(undefined);
          },
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
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

// ---- modules under test (loaded AFTER mocks) ----

const unsubscribeRoute = await import('@/app/api/portal/cards/[id]/unsubscribe/route');
const cardsRoute = await import('@/app/api/portal/cards/route');
const conversationsRoute = await import('@/app/api/portal/chat/conversations/route');
const conversationByIdRoute = await import('@/app/api/portal/chat/conversations/[id]/route');

// ---- helpers ----

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const STAFF_SESSION = { user: { id: '7', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '8', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '12', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  insertReturnQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  logCardActivityMock.mockReset().mockResolvedValue(undefined);
  unwatchMock.mockReset().mockResolvedValue(undefined);
  verifyUnsubscribeMock.mockReset();
  publishConversationUpdateMock.mockReset().mockResolvedValue(undefined);
});

// ===========================================================================
// unsubscribe/route.ts (GET)
// ===========================================================================

describe('GET /api/portal/cards/[id]/unsubscribe', () => {
  it('returns 400 HTML when cardId is NaN', async () => {
    const res = await unsubscribeRoute.GET(
      new Request('http://x/api/portal/cards/foo/unsubscribe?u=5&t=tok'),
      makeParams('foo'),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/);
    const text = await res.text();
    expect(text).toMatch(/Invalid unsubscribe link/);
  });

  it('returns 400 HTML when userId query param is missing', async () => {
    const res = await unsubscribeRoute.GET(
      new Request('http://x/api/portal/cards/1/unsubscribe?t=tok'),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 HTML when token is missing', async () => {
    const res = await unsubscribeRoute.GET(
      new Request('http://x/api/portal/cards/1/unsubscribe?u=5'),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 HTML when verifyUnsubscribe rejects token', async () => {
    verifyUnsubscribeMock.mockReturnValue(false);
    const res = await unsubscribeRoute.GET(
      new Request('http://x/api/portal/cards/1/unsubscribe?u=5&t=bad-token'),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
    expect(verifyUnsubscribeMock).toHaveBeenCalledWith(1, 5, 'bad-token');
    const text = await res.text();
    expect(text).toMatch(/invalid or has expired/);
  });

  it('returns 200 HTML and calls unwatch when token verifies', async () => {
    verifyUnsubscribeMock.mockReturnValue(true);
    const res = await unsubscribeRoute.GET(
      new Request('http://x/api/portal/cards/9/unsubscribe?u=42&t=valid-tok'),
      makeParams('9'),
    );
    expect(res.status).toBe(200);
    expect(unwatchMock).toHaveBeenCalledWith(9, 42);
    const text = await res.text();
    expect(text).toMatch(/unsubscribed/i);
  });
});

// ===========================================================================
// cards/route.ts (POST)
// ===========================================================================

describe('POST /api/portal/cards', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 1, title: 't' }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 400 when columnId is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { title: 't' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/columnId and title/i);
  });

  it('returns 400 when title is empty/whitespace', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 1, title: '   ' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when column is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // column lookup empty
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 999, title: 'Hi' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Column not found');
  });

  it('returns 403 for non-staff when client lookup fails', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // column found
    getPortalClientMock.mockResolvedValue(null);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 1, title: 'Hi' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-staff when project not owned by client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // column
    selectQueue.push([]); // project not owned by client
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 1, title: 'Hi' }),
    );
    expect(res.status).toBe(403);
  });

  it('inserts a card with default priority "medium" when not provided and logs activity', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // column
    selectQueue.push([{ id: 10 }, { id: 11 }]); // existing cards (length=2 -> order=2)
    selectQueue.push([{ max: 3 }]); // max number in project
    insertReturnQueue.push([{ id: 50, columnId: 1, projectId: 5, number: 4, title: 'New' }]);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 1, title: ' New ' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(50);
    expect(insertCalls.length).toBe(1);
    const insert = insertCalls[0];
    expect(insert.table).toBe('kanbanCards');
    expect((insert.values as Record<string, unknown>).title).toBe('New');
    expect((insert.values as Record<string, unknown>).priority).toBe('medium');
    expect((insert.values as Record<string, unknown>).number).toBe(4);
    expect((insert.values as Record<string, unknown>).order).toBe(2);
    expect((insert.values as Record<string, unknown>).description).toBeNull();
    expect((insert.values as Record<string, unknown>).dueDate).toBeNull();
    expect((insert.values as Record<string, unknown>).createdBy).toBe(7);
    expect(logCardActivityMock).toHaveBeenCalledWith(50, 7, 'card.created', { title: 'New' });
  });

  it('uses nextNumber=1 when max is null (first card in project)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // column
    selectQueue.push([]); // no existing cards
    selectQueue.push([{ max: null }]); // no cards in project
    insertReturnQueue.push([{ id: 50, number: 1 }]);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 1, title: 'First' }),
    );
    expect(res.status).toBe(200);
    expect((insertCalls[0].values as Record<string, unknown>).number).toBe(1);
    expect((insertCalls[0].values as Record<string, unknown>).order).toBe(0);
  });

  it('parses provided description, priority, and dueDate', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // column
    selectQueue.push([]); // existing cards
    selectQueue.push([{ max: 0 }]); // max
    insertReturnQueue.push([{ id: 51, title: 'X' }]);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', {
        columnId: 1,
        title: 'X',
        description: 'desc',
        priority: 'high',
        dueDate: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(res.status).toBe(200);
    const vals = insertCalls[0].values as Record<string, unknown>;
    expect(vals.description).toBe('desc');
    expect(vals.priority).toBe('high');
    expect(vals.dueDate).toBeInstanceOf(Date);
  });

  it('allows employee role to create card without portal client lookup', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // column
    selectQueue.push([]); // existing cards
    selectQueue.push([{ max: 0 }]); // max
    insertReturnQueue.push([{ id: 52, title: 'E' }]);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 1, title: 'E' }),
    );
    expect(res.status).toBe(200);
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });

  it('allows non-staff when client owns the project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // column
    selectQueue.push([{ id: 5, clientId: 33 }]); // project owned by client
    selectQueue.push([]); // existing cards
    selectQueue.push([{ max: 0 }]); // max
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 53, title: 'C' }]);
    const res = await cardsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards', 'POST', { columnId: 1, title: 'C' }),
    );
    expect(res.status).toBe(200);
    expect((insertCalls[0].values as Record<string, unknown>).createdBy).toBe(12);
  });
});

// ===========================================================================
// chat/conversations/route.ts (GET)
// ===========================================================================

describe('GET /api/portal/chat/conversations', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns the conversation list for the client', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, clientId: 33, status: 'open' },
      { id: 2, clientId: 33, status: 'closed' },
    ]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it('accepts status=open filter', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations?status=open'),
    );
    expect(res.status).toBe(200);
  });

  it('accepts status=assigned filter', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations?status=assigned'),
    );
    expect(res.status).toBe(200);
  });

  it('accepts status=closed filter', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations?status=closed'),
    );
    expect(res.status).toBe(200);
  });

  it('ignores invalid status values', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations?status=garbage'),
    );
    expect(res.status).toBe(200);
  });

  it('handles assignee=me filter', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations?assignee=me'),
    );
    expect(res.status).toBe(200);
  });

  it('handles assignee=<numeric userId> filter', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations?assignee=42'),
    );
    expect(res.status).toBe(200);
  });

  it('ignores non-numeric/non-me assignee values', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations?assignee=garbage'),
    );
    expect(res.status).toBe(200);
  });

  it('clamps limit/offset within bounds (huge values)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await conversationsRoute.GET(
      new Request('http://x/api/portal/chat/conversations?limit=99999&offset=-5'),
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// chat/conversations/[id]/route.ts (GET, PATCH)
// ===========================================================================

describe('GET /api/portal/chat/conversations/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await conversationByIdRoute.GET(
      new Request('http://x/api/portal/chat/conversations/1'),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await conversationByIdRoute.GET(
      new Request('http://x/api/portal/chat/conversations/1'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when conversation not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // conversation lookup empty
    const res = await conversationByIdRoute.GET(
      new Request('http://x/api/portal/chat/conversations/1'),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Conversation not found');
  });

  it('returns conversation and messages on success', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open' }]); // conversation
    selectQueue.push([
      { id: 100, conversationId: 1, body: 'hi' },
      { id: 101, conversationId: 1, body: 'there' },
    ]); // messages
    const res = await conversationByIdRoute.GET(
      new Request('http://x/api/portal/chat/conversations/1'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversation.id).toBe(1);
    expect(body.data.messages.length).toBe(2);
  });
});

describe('PATCH /api/portal/chat/conversations/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'close' }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'close' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when conversation not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // conversation lookup empty
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'close' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for unknown action', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open', assignedUserId: null }]); // conversation
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'nope' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Unknown action');
  });

  it('returns 400 when body is not valid JSON (action becomes undefined)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open' }]); // conversation
    const req = new Request('http://x/api/portal/chat/conversations/1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await conversationByIdRoute.PATCH(req, makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('handles assign-self action and publishes update', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open', assignedUserId: null }]); // conversation
    updateReturnQueue.push([
      {
        id: 1,
        status: 'assigned',
        assignedUserId: 7,
        visitorName: 'Bob',
        lastMessageAt: new Date('2026-01-01'),
      },
    ]);
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'assign-self' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('assigned');
    expect(body.data.assignedUserId).toBe(7);
    expect(updateCalls[0].patch).toMatchObject({ assignedUserId: 7, status: 'assigned' });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(publishConversationUpdateMock).toHaveBeenCalledWith(
      33,
      expect.objectContaining({
        conversationId: 1,
        status: 'assigned',
        kind: 'updated',
      }),
    );
  });

  it('handles unassign action', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'assigned', assignedUserId: 5 }]); // conversation
    updateReturnQueue.push([
      { id: 1, status: 'open', assignedUserId: null, visitorName: 'X', lastMessageAt: null },
    ]);
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'unassign' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({ assignedUserId: null, status: 'open' });
  });

  it('handles close action and sets closedAt', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open' }]); // conversation
    updateReturnQueue.push([{ id: 1, status: 'closed', assignedUserId: null }]);
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'close' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.status).toBe('closed');
    expect(updateCalls[0].patch.closedAt).toBeInstanceOf(Date);
  });

  it('handles reopen action -> "assigned" when conversation has assignee', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'closed', assignedUserId: 9 }]); // conversation
    updateReturnQueue.push([{ id: 1, status: 'assigned', assignedUserId: 9 }]);
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'reopen' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.status).toBe('assigned');
    expect(updateCalls[0].patch.closedAt).toBeNull();
  });

  it('handles reopen action -> "open" when conversation has no assignee', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'closed', assignedUserId: null }]); // conversation
    updateReturnQueue.push([{ id: 1, status: 'open', assignedUserId: null }]);
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'reopen' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.status).toBe('open');
  });

  it('does not throw when publishConversationUpdate rejects', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open' }]); // conversation
    updateReturnQueue.push([{ id: 1, status: 'closed', assignedUserId: null }]);
    publishConversationUpdateMock.mockRejectedValueOnce(new Error('boom'));
    const res = await conversationByIdRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/conversations/1', 'PATCH', { action: 'close' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });
});
