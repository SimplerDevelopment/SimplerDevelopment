// @vitest-environment node
/**
 * Unit tests for four kanban-card API routes (batch 28g):
 *   - app/api/portal/cards/[id]/assignees/route.ts          (GET, POST, DELETE)
 *   - app/api/portal/cards/[id]/checklist/route.ts          (GET, POST)
 *   - app/api/portal/cards/[id]/comments/route.ts           (POST)
 *   - app/api/portal/cards/[id]/comments/[commentId]/route  (DELETE)
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

const logCardActivityMock = vi.fn();
vi.mock('@/lib/pm-activity', () => ({
  logCardActivity: (...args: unknown[]) => logCardActivityMock(...args),
}));

const filterUserIdsVisibleToClientMock = vi.fn();
vi.mock('@/lib/security/assert-owned', () => ({
  filterUserIdsVisibleToClient: (...args: unknown[]) =>
    filterUserIdsVisibleToClientMock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    { raw: (s: string) => ({ op: 'raw', s }) },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
    kanbanCards: wrap('kanbanCards'),
    kanbanCardAssignees: wrap('kanbanCardAssignees'),
    kanbanCardWatchers: wrap('kanbanCardWatchers'),
    kanbanCardChecklistItems: wrap('kanbanCardChecklistItems'),
    kanbanCardComments: wrap('kanbanCardComments'),
    kanbanCardFiles: wrap('kanbanCardFiles'),
    projects: wrap('projects'),
    users: wrap('users'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock — supports select / insert / update / delete chains, all thenable
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertQueue: Array<Array<Record<string, unknown>>> = [];
let updateQueue: Array<Array<Record<string, unknown>>> = [];
let deleteQueue: Array<Array<Record<string, unknown>>> = [];

const insertCalls: Array<{ table: string; values: unknown }> = [];
const updateSetCalls: Array<{ table: string; values: Record<string, unknown>; where: unknown }> = [];
const deleteCalls: Array<{ table: string; where: unknown }> = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function shiftInsert(): Array<Record<string, unknown>> {
  return insertQueue.shift() ?? [];
}
function shiftUpdate(): Array<Record<string, unknown>> {
  return updateQueue.shift() ?? [];
}
function shiftDelete(): Array<Record<string, unknown>> {
  return deleteQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftSelect());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    const terminal = () => {
      materialize();
      const term: Record<string, unknown> = {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit: () => term,
        offset: () => term,
      };
      return term;
    };
    chain.limit = terminal;
    chain.offset = terminal;
    chain.orderBy = terminal;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildInsert(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      values(values: unknown) {
        insertCalls.push({ table: tableName, values });
        let materialized: Array<Record<string, unknown>> | null = null;
        const getRows = () => {
          if (materialized === null) materialized = shiftInsert();
          return materialized;
        };
        const inner: Record<string, unknown> = {};
        inner.onConflictDoNothing = () => Promise.resolve(getRows());
        inner.onConflictDoUpdate = () => Promise.resolve(getRows());
        inner.returning = () => Promise.resolve(getRows());
        inner.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve(getRows()).then(onF, onR);
        return inner;
      },
    };
  }

  function buildUpdate(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    let pendingValues: Record<string, unknown> = {};
    return {
      set(values: Record<string, unknown>) {
        pendingValues = values;
        return {
          where(w: unknown) {
            updateSetCalls.push({ table: tableName, values: pendingValues, where: w });
            const rows = shiftUpdate();
            return {
              returning: () => Promise.resolve(rows),
              then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
                Promise.resolve(rows).then(onF, onR),
            };
          },
        };
      },
    };
  }

  function buildDelete(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      where(w: unknown) {
        deleteCalls.push({ table: tableName, where: w });
        const rows = shiftDelete();
        return {
          then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
            Promise.resolve(rows).then(onF, onR),
        };
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      insert(table: { __table?: string } | undefined) {
        return buildInsert(table);
      },
      update(table: { __table?: string } | undefined) {
        return buildUpdate(table);
      },
      delete(table: { __table?: string } | undefined) {
        return buildDelete(table);
      },
    },
  };
});

// ---- modules under test (loaded AFTER mocks) ----
const assigneesRoute = await import('@/app/api/portal/cards/[id]/assignees/route');
const checklistRoute = await import('@/app/api/portal/cards/[id]/checklist/route');
const commentsRoute = await import('@/app/api/portal/cards/[id]/comments/route');
const commentByIdRoute = await import(
  '@/app/api/portal/cards/[id]/comments/[commentId]/route'
);

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeJsonReq(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function makeCommentParams(id: string, commentId: string) {
  return { params: Promise.resolve({ id, commentId }) };
}

const ADMIN_SESSION = { user: { id: '7', name: 'Adam', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '8', name: 'Eve', role: 'employee' } };
const EDITOR_SESSION = { user: { id: '10', name: 'Ed', role: 'editor' } };
const CLIENT_SESSION = { user: { id: '9', name: 'Carl', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  insertQueue = [];
  updateQueue = [];
  deleteQueue = [];
  insertCalls.length = 0;
  updateSetCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  logCardActivityMock.mockReset();
  filterUserIdsVisibleToClientMock.mockReset();
});

// ===========================================================================
// /api/portal/cards/[id]/assignees
// ===========================================================================

describe('/api/portal/cards/[id]/assignees', () => {
  describe('GET', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await assigneesRoute.GET(makeReq('http://x/a'), makeParams('1'));
      expect(res.status).toBe(401);
    });

    it('returns 401 when session has no user id', async () => {
      authMock.mockResolvedValue({ user: {} });
      const res = await assigneesRoute.GET(makeReq('http://x/a'), makeParams('1'));
      expect(res.status).toBe(401);
    });

    it('returns 404 when the card does not exist', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]); // card lookup -> none
      const res = await assigneesRoute.GET(makeReq('http://x/a'), makeParams('42'));
      expect(res.status).toBe(404);
    });

    it('returns 404 for a client when they have no portal client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]); // card
      getPortalClientMock.mockResolvedValue(null);
      const res = await assigneesRoute.GET(makeReq('http://x/a'), makeParams('42'));
      expect(res.status).toBe(404);
    });

    it('returns 404 for a client when project does not belong to client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]); // card
      getPortalClientMock.mockResolvedValue({ id: 5 });
      selectQueue.push([]); // project lookup -> none
      const res = await assigneesRoute.GET(makeReq('http://x/a'), makeParams('42'));
      expect(res.status).toBe(404);
    });

    it('returns the list of assignees for admin', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]); // card
      selectQueue.push([
        { id: 1, name: 'Alice', email: 'a@x' },
        { id: 2, name: 'Bob', email: 'b@x' },
      ]); // assignees
      const res = await assigneesRoute.GET(makeReq('http://x/a'), makeParams('42'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].name).toBe('Alice');
    });

    it('returns assignees for a client when they own the project', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]); // card
      getPortalClientMock.mockResolvedValue({ id: 5 });
      selectQueue.push([{ id: 7, clientId: 5, isPrivate: true }]); // project
      selectQueue.push([{ id: 1, name: 'Alice', email: 'a@x' }]); // assignees
      const res = await assigneesRoute.GET(makeReq('http://x/a'), makeParams('42'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
    });
  });

  describe('POST', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await assigneesRoute.POST(
        makeJsonReq('http://x/a', { userId: 5 }),
        makeParams('42'),
      );
      expect(res.status).toBe(401);
    });

    it('returns 404 when card missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]);
      const res = await assigneesRoute.POST(
        makeJsonReq('http://x/a', { userId: 5 }),
        makeParams('42'),
      );
      expect(res.status).toBe(404);
    });

    it('returns 403 for client when project is NOT private', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]); // card
      getPortalClientMock.mockResolvedValue({ id: 5 });
      selectQueue.push([{ id: 7, clientId: 5, isPrivate: false }]); // project
      const res = await assigneesRoute.POST(
        makeJsonReq('http://x/a', { userId: 5 }),
        makeParams('42'),
      );
      expect(res.status).toBe(403);
    });

    it('returns 400 when userId is not a number', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      const res = await assigneesRoute.POST(
        makeJsonReq('http://x/a', { userId: 'nope' }),
        makeParams('42'),
      );
      expect(res.status).toBe(400);
    });

    it('inserts assignee + watcher and logs activity', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]); // card
      insertQueue.push([]); // assignee
      insertQueue.push([]); // watcher
      selectQueue.push([{ name: 'Alice' }]); // user name lookup
      const res = await assigneesRoute.POST(
        makeJsonReq('http://x/a', { userId: 9 }),
        makeParams('42'),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      expect(insertCalls.find((c) => c.table === 'kanbanCardAssignees')).toBeDefined();
      expect(insertCalls.find((c) => c.table === 'kanbanCardWatchers')).toBeDefined();
      const assigneeInsert = insertCalls.find((c) => c.table === 'kanbanCardAssignees')!;
      expect((assigneeInsert.values as Record<string, unknown>).userId).toBe(9);
      expect((assigneeInsert.values as Record<string, unknown>).cardId).toBe(42);

      expect(logCardActivityMock).toHaveBeenCalledWith(
        42,
        7,
        'card.assignee_added',
        { userId: 9, name: 'Alice' },
      );
    });

    it('passes name=null to activity log when user lookup is empty', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      insertQueue.push([]);
      insertQueue.push([]);
      selectQueue.push([]); // user not found
      const res = await assigneesRoute.POST(
        makeJsonReq('http://x/a', { userId: 9 }),
        makeParams('42'),
      );
      expect(res.status).toBe(200);
      expect(logCardActivityMock).toHaveBeenCalledWith(
        42,
        8,
        'card.assignee_added',
        { userId: 9, name: null },
      );
    });
  });

  describe('DELETE', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await assigneesRoute.DELETE(
        makeReq('http://x/a?userId=9', { method: 'DELETE' }),
        makeParams('42'),
      );
      expect(res.status).toBe(401);
    });

    it('returns 404 when card missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]);
      const res = await assigneesRoute.DELETE(
        makeReq('http://x/a?userId=9', { method: 'DELETE' }),
        makeParams('42'),
      );
      expect(res.status).toBe(404);
    });

    it('returns 403 for client when project is not private', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      getPortalClientMock.mockResolvedValue({ id: 5 });
      selectQueue.push([{ id: 7, clientId: 5, isPrivate: false }]);
      const res = await assigneesRoute.DELETE(
        makeReq('http://x/a?userId=9', { method: 'DELETE' }),
        makeParams('42'),
      );
      expect(res.status).toBe(403);
    });

    it('returns 400 when userId query param is missing/NaN', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      const res = await assigneesRoute.DELETE(
        makeReq('http://x/a', { method: 'DELETE' }),
        makeParams('42'),
      );
      expect(res.status).toBe(400);
    });

    it('deletes the assignee row and logs activity', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      deleteQueue.push([]); // delete
      selectQueue.push([{ name: 'Bob' }]); // user lookup
      const res = await assigneesRoute.DELETE(
        makeReq('http://x/a?userId=9', { method: 'DELETE' }),
        makeParams('42'),
      );
      expect(res.status).toBe(200);
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].table).toBe('kanbanCardAssignees');
      expect(logCardActivityMock).toHaveBeenCalledWith(
        42,
        7,
        'card.assignee_removed',
        { userId: 9, name: 'Bob' },
      );
    });
  });
});

// ===========================================================================
// /api/portal/cards/[id]/checklist
// ===========================================================================

describe('/api/portal/cards/[id]/checklist', () => {
  describe('GET', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await checklistRoute.GET(makeReq('http://x/c'), makeParams('42'));
      expect(res.status).toBe(401);
    });

    it('returns 404 when card missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]);
      const res = await checklistRoute.GET(makeReq('http://x/c'), makeParams('42'));
      expect(res.status).toBe(404);
    });

    it('returns checklist items for admin', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]); // card
      selectQueue.push([
        { id: 1, text: 'A', completed: false, order: 0 },
        { id: 2, text: 'B', completed: true, order: 1 },
      ]); // items
      const res = await checklistRoute.GET(makeReq('http://x/c'), makeParams('42'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('returns 404 for client without portal client', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      getPortalClientMock.mockResolvedValue(null);
      const res = await checklistRoute.GET(makeReq('http://x/c'), makeParams('42'));
      expect(res.status).toBe(404);
    });
  });

  describe('POST', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await checklistRoute.POST(
        makeJsonReq('http://x/c', { text: 'hi' }),
        makeParams('42'),
      );
      expect(res.status).toBe(401);
    });

    it('returns 404 when card missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]);
      const res = await checklistRoute.POST(
        makeJsonReq('http://x/c', { text: 'hi' }),
        makeParams('42'),
      );
      expect(res.status).toBe(404);
    });

    it('returns 403 for client when project is NOT private', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      getPortalClientMock.mockResolvedValue({ id: 5 });
      selectQueue.push([{ id: 7, clientId: 5, isPrivate: false }]);
      const res = await checklistRoute.POST(
        makeJsonReq('http://x/c', { text: 'hi' }),
        makeParams('42'),
      );
      expect(res.status).toBe(403);
    });

    it('returns 400 when text is missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      const res = await checklistRoute.POST(
        makeJsonReq('http://x/c', {}),
        makeParams('42'),
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when text is whitespace only', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      const res = await checklistRoute.POST(
        makeJsonReq('http://x/c', { text: '   ' }),
        makeParams('42'),
      );
      expect(res.status).toBe(400);
    });

    it('inserts a new item using max+1 ordering and trims/slices the text', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]); // card
      selectQueue.push([{ max: 4 }]); // max(order) = 4 -> new order = 5
      const longText = '  ' + 'a'.repeat(600) + '  ';
      insertQueue.push([
        { id: 100, text: 'a'.repeat(500), order: 5, completed: false },
      ]); // insert returning
      const res = await checklistRoute.POST(
        makeJsonReq('http://x/c', { text: longText }),
        makeParams('42'),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(100);
      const insert = insertCalls.find((c) => c.table === 'kanbanCardChecklistItems')!;
      const v = insert.values as Record<string, unknown>;
      expect(v.cardId).toBe(42);
      expect(v.order).toBe(5);
      expect(v.createdBy).toBe(7);
      expect((v.text as string).length).toBe(500); // sliced
      expect(logCardActivityMock).toHaveBeenCalledWith(
        42,
        7,
        'card.checklist_item_added',
        { itemId: 100, text: 'a'.repeat(500) },
      );
    });

    it('uses order=0 when there are no existing items (max=null)', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, projectId: 7 }]);
      selectQueue.push([{ max: null }]); // -1 + 1 = 0
      insertQueue.push([{ id: 200, text: 'hello', order: 0 }]);
      const res = await checklistRoute.POST(
        makeJsonReq('http://x/c', { text: 'hello' }),
        makeParams('42'),
      );
      expect(res.status).toBe(201);
      const insert = insertCalls.find((c) => c.table === 'kanbanCardChecklistItems')!;
      expect((insert.values as Record<string, unknown>).order).toBe(0);
    });
  });
});

// ===========================================================================
// /api/portal/cards/[id]/comments (POST)
// ===========================================================================

describe('POST /api/portal/cards/[id]/comments', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: 'hi' }),
      makeParams('42'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card missing', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]); // card lookup
    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: 'hi' }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for client without portal client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]);
    getPortalClientMock.mockResolvedValue(null);
    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: 'hi' }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for client when project not owned by client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // project not found
    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: 'hi' }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when body is empty AND no fileIds', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]);
    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: '   ' }),
      makeParams('42'),
    );
    expect(res.status).toBe(400);
  });

  it('inserts a comment with staff mentions passed through unfiltered', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]); // card
    insertQueue.push([{ id: 500, cardId: 42, body: 'hello', userId: 7, mentions: [11, 22] }]); // comment

    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: 'hello', mentions: [11, 22, 'bad'] }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(500);
    expect(body.data.userName).toBe('Adam');

    const insert = insertCalls.find((c) => c.table === 'kanbanCardComments')!;
    const v = insert.values as Record<string, unknown>;
    expect(v.cardId).toBe(42);
    expect(v.userId).toBe(7);
    expect(v.body).toBe('hello');
    // staff: numeric mentions kept, non-finite ('bad' -> NaN) stripped
    expect(v.mentions).toEqual([11, 22]);
    expect(filterUserIdsVisibleToClientMock).not.toHaveBeenCalled();
    expect(logCardActivityMock).toHaveBeenCalledWith(42, 7, 'card.commented', { commentId: 500 });
  });

  it('filters mentions through assert-owned for non-staff (client) callers', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 7, clientId: 5 }]); // project ok
    filterUserIdsVisibleToClientMock.mockResolvedValue([11]); // only 11 visible
    insertQueue.push([{ id: 501, cardId: 42, body: 'hey', mentions: [11] }]);

    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: 'hey', mentions: [11, 22] }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect(filterUserIdsVisibleToClientMock).toHaveBeenCalledWith([11, 22], 5);
    const insert = insertCalls.find((c) => c.table === 'kanbanCardComments')!;
    expect((insert.values as Record<string, unknown>).mentions).toEqual([11]);
  });

  it('client with no portal client yields safeMentions=[] (still inserts)', async () => {
    // Auth passes as client, card belongs to project that belongs to a real client.
    // But during the mentions phase, the second getPortalClient call returns null
    // (e.g. race / membership change). Route should still insert with empty mentions.
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]); // card
    getPortalClientMock.mockResolvedValueOnce({ id: 5 }); // auth path
    selectQueue.push([{ id: 7, clientId: 5 }]); // project ok
    getPortalClientMock.mockResolvedValueOnce(null); // mentions path
    insertQueue.push([{ id: 502, cardId: 42, body: 'hi', mentions: [] }]);

    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: 'hi', mentions: [11] }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const insert = insertCalls.find((c) => c.table === 'kanbanCardComments')!;
    expect((insert.values as Record<string, unknown>).mentions).toEqual([]);
    expect(filterUserIdsVisibleToClientMock).not.toHaveBeenCalled();
  });

  it('re-parents fileIds that already belong to this card', async () => {
    authMock.mockResolvedValue(EDITOR_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]); // card
    // editor isn't admin/employee -> takes client path
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 7, clientId: 5 }]); // project ok
    insertQueue.push([{ id: 503, cardId: 42, body: '', mentions: [] }]); // comment
    updateQueue.push([]); // re-parent files

    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: '', fileIds: [101, 102] }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0].table).toBe('kanbanCardFiles');
    expect((updateSetCalls[0].values as Record<string, unknown>).commentId).toBe(503);
  });

  it('treats editor role as staff for mentions (no filtering)', async () => {
    authMock.mockResolvedValue(EDITOR_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 7, clientId: 5 }]); // project ok
    insertQueue.push([{ id: 504, cardId: 42, body: 'hi', mentions: [33] }]);

    const res = await commentsRoute.POST(
      makeJsonReq('http://x/c', { body: 'hi', mentions: [33] }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect(filterUserIdsVisibleToClientMock).not.toHaveBeenCalled();
    const insert = insertCalls.find((c) => c.table === 'kanbanCardComments')!;
    expect((insert.values as Record<string, unknown>).mentions).toEqual([33]);
  });
});

// ===========================================================================
// /api/portal/cards/[id]/comments/[commentId] (DELETE)
// ===========================================================================

describe('DELETE /api/portal/cards/[id]/comments/[commentId]', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await commentByIdRoute.DELETE(
      makeReq('http://x/c/1', { method: 'DELETE' }),
      makeCommentParams('42', '1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card does not exist', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]); // card lookup -> none
    const res = await commentByIdRoute.DELETE(
      makeReq('http://x/c/1', { method: 'DELETE' }),
      makeCommentParams('42', '1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for client without portal client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]);
    getPortalClientMock.mockResolvedValue(null);
    const res = await commentByIdRoute.DELETE(
      makeReq('http://x/c/1', { method: 'DELETE' }),
      makeCommentParams('42', '1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for client when project not in their tenancy', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // no project
    const res = await commentByIdRoute.DELETE(
      makeReq('http://x/c/1', { method: 'DELETE' }),
      makeCommentParams('42', '1'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the comment for staff (admin)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]); // card
    deleteQueue.push([]); // delete

    const res = await commentByIdRoute.DELETE(
      makeReq('http://x/c/1', { method: 'DELETE' }),
      makeCommentParams('42', '1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('kanbanCardComments');
    // staff delete: where is and(eq(id), eq(cardId)) only (no userId clause)
    const where = deleteCalls[0].where as { op: string; args: unknown[] };
    expect(where.op).toBe('and');
    expect(where.args).toHaveLength(2);
  });

  it('deletes the comment for employee (also staff)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]);
    deleteQueue.push([]);
    const res = await commentByIdRoute.DELETE(
      makeReq('http://x/c/1', { method: 'DELETE' }),
      makeCommentParams('42', '1'),
    );
    expect(res.status).toBe(200);
    const where = deleteCalls[0].where as { op: string; args: unknown[] };
    expect(where.args).toHaveLength(2);
  });

  it('adds an author-only clause for non-staff (client) callers', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 42, projectId: 7 }]);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 7, clientId: 5 }]); // project ok
    deleteQueue.push([]); // delete
    const res = await commentByIdRoute.DELETE(
      makeReq('http://x/c/1', { method: 'DELETE' }),
      makeCommentParams('42', '1'),
    );
    expect(res.status).toBe(200);
    // non-staff: and(eq(id), eq(cardId), eq(userId))
    const where = deleteCalls[0].where as { op: string; args: unknown[] };
    expect(where.op).toBe('and');
    expect(where.args).toHaveLength(3);
  });
});
