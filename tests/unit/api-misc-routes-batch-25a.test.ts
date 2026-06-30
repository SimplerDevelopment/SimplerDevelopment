// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 25a):
 *   - app/api/portal/crm/notifications/mark-all-read/route.ts  (POST, GET)
 *   - app/api/portal/integrations/microsoft/status/route.ts    (GET)
 *   - app/api/posts/calendar/route.ts                          (GET)
 *   - app/api/portal/checklist-items/[id]/route.ts             (PATCH, DELETE)
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

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', value: s }),
    },
  ),
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
    crmNotifications: wrap('crm_notifications'),
    microsoftTeamsUserConnections: wrap('microsoft_teams_user_connections'),
    posts: wrap('posts'),
    categories: wrap('categories'),
    postCategories: wrap('post_categories'),
    kanbanCards: wrap('kanban_cards'),
    kanbanCardChecklistItems: wrap('kanban_card_checklist_items'),
    projects: wrap('projects'),
    projectMembers: wrap('projectMembers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: thenable select / update / delete chains
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturningQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{
  table: string;
  setValues: Record<string, unknown>;
  whereArg: unknown;
  returning: boolean;
}> = [];
const deleteCalls: Array<{ table: string; whereArg: unknown }> = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

function shiftUpdateReturning(): Array<Record<string, unknown>> {
  return updateReturningQueue.shift() ?? [];
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
    const terminalChain = () => {
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
    chain.limit = terminalChain;
    chain.offset = terminalChain;
    chain.orderBy = terminalChain;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(tableRef: unknown) {
    const tableName =
      (tableRef as { __table?: string } | null | undefined)?.__table ?? 'unknown';
    let stagedValues: Record<string, unknown> = {};
    let stagedWhere: unknown = undefined;

    function makeReturning() {
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          updateCalls.push({
            table: tableName,
            setValues: stagedValues,
            whereArg: stagedWhere,
            returning: true,
          });
          return Promise.resolve(shiftUpdateReturning()).then(onF, onR);
        },
      };
    }

    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        stagedValues = v;
        return chain;
      },
      where(arg: unknown) {
        stagedWhere = arg;
        return {
          returning: (_cols?: unknown) => makeReturning(),
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            updateCalls.push({
              table: tableName,
              setValues: stagedValues,
              whereArg: stagedWhere,
              returning: false,
            });
            return Promise.resolve().then(onF, onR);
          },
        };
      },
    };
    return chain;
  }

  function buildDelete(tableRef: unknown) {
    const tableName =
      (tableRef as { __table?: string } | null | undefined)?.__table ?? 'unknown';
    return {
      where(arg: unknown) {
        deleteCalls.push({ table: tableName, whereArg: arg });
        return Promise.resolve();
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      update(tableRef: unknown) {
        return buildUpdate(tableRef);
      },
      delete(tableRef: unknown) {
        return buildDelete(tableRef);
      },
    },
  };
});

// ---- modules under test ----
const markAllReadRoute = await import(
  '@/app/api/portal/crm/notifications/mark-all-read/route'
);
const msStatusRoute = await import('@/app/api/portal/integrations/microsoft/status/route');
const postsCalendarRoute = await import('@/app/api/posts/calendar/route');
const checklistItemRoute = await import('@/app/api/portal/checklist-items/[id]/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  updateReturningQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
  getPortalClientMock.mockReset();
  logCardActivityMock.mockReset();
  logCardActivityMock.mockResolvedValue(undefined);
  // Clean env defaults for the MS status route
  delete process.env.MICROSOFT_TEAMS_CLIENT_ID;
  delete process.env.MICROSOFT_TEAMS_CLIENT_SECRET;
});

// ===========================================================================
// POST /api/portal/crm/notifications/mark-all-read
// ===========================================================================

describe('POST /api/portal/crm/notifications/mark-all-read', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await markAllReadRoute.POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await markAllReadRoute.POST();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await markAllReadRoute.POST();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('marks all unread notifications as read and returns the count', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    updateReturningQueue.push([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const res = await markAllReadRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(3);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('crm_notifications');
    expect(updateCalls[0].setValues.read).toBe(true);
    expect(updateCalls[0].returning).toBe(true);
  });

  it('returns 0 when there are no unread notifications', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    updateReturningQueue.push([]);

    const res = await markAllReadRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updated).toBe(0);
  });

  it('parses user id from session string and uses it for the client lookup', async () => {
    authMock.mockResolvedValue({ user: { id: '99' } });
    getPortalClientMock.mockResolvedValue({ id: 1 });
    updateReturningQueue.push([]);
    const res = await markAllReadRoute.POST();
    expect(res.status).toBe(200);
    expect(getPortalClientMock).toHaveBeenCalledWith(99);
  });
});

// ===========================================================================
// GET /api/portal/crm/notifications/mark-all-read
// ===========================================================================

describe('GET /api/portal/crm/notifications/mark-all-read', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await markAllReadRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await markAllReadRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the unread count from the first row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ count: 7 }]);
    const res = await markAllReadRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.unreadCount).toBe(7);
  });

  it('defaults unreadCount to 0 when the query returns no rows', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]);
    const res = await markAllReadRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.unreadCount).toBe(0);
  });
});

// ===========================================================================
// GET /api/portal/integrations/microsoft/status
// ===========================================================================

describe('GET /api/portal/integrations/microsoft/status', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await msStatusRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await msStatusRoute.GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/No client/);
  });

  it('reports configured=false when env vars are absent and connection=null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]);
    const res = await msStatusRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.configured).toBe(false);
    expect(body.data.connection).toBeNull();
  });

  it('reports configured=true and the active connection row when present', async () => {
    process.env.MICROSOFT_TEAMS_CLIENT_ID = 'cid';
    process.env.MICROSOFT_TEAMS_CLIENT_SECRET = 'csecret';
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    const conn = {
      microsoftAccountEmail: 'a@b.com',
      microsoftTenantId: 'tenant-1',
      scopes: ['offline_access'],
      expiresAt: new Date('2026-06-01'),
      lastSyncAt: new Date('2026-05-01'),
      createdAt: new Date('2026-04-01'),
      subscriptionId: 'sub_1',
      subscriptionExpiration: new Date('2026-07-01'),
    };
    selectQueue.push([conn]);
    const res = await msStatusRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.configured).toBe(true);
    expect(body.data.connection.microsoftAccountEmail).toBe('a@b.com');
    expect(body.data.connection.subscriptionId).toBe('sub_1');
  });

  it('reports configured=false when only one of the two env vars is set', async () => {
    process.env.MICROSOFT_TEAMS_CLIENT_ID = 'cid';
    // CLIENT_SECRET intentionally missing
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 1 });
    selectQueue.push([]);
    const res = await msStatusRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.configured).toBe(false);
  });
});

// ===========================================================================
// GET /api/posts/calendar
// ===========================================================================

describe('GET /api/posts/calendar', () => {
  it('returns 400 when start or end query params are missing', async () => {
    const res = await postsCalendarRoute.GET(
      makeReq('http://x/api/posts/calendar') as unknown as Parameters<typeof postsCalendarRoute.GET>[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/start and end/);
  });

  it('returns 400 when only start is provided', async () => {
    const res = await postsCalendarRoute.GET(
      makeReq('http://x/api/posts/calendar?start=2026-01-01') as unknown as Parameters<typeof postsCalendarRoute.GET>[0],
    );
    expect(res.status).toBe(400);
  });

  it('returns posts in range with derived status (published/scheduled/draft)', async () => {
    const past = new Date('2026-01-01').toISOString();
    const future = new Date('2099-01-01').toISOString();
    const created = new Date('2026-01-02').toISOString();

    selectQueue.push([
      {
        id: 1,
        title: 'Live post',
        slug: 'live',
        postType: 'post',
        published: true,
        publishedAt: past,
        createdAt: created,
        coverImage: null,
        excerpt: 'x',
        websiteId: 5,
      },
      {
        id: 2,
        title: 'Future post',
        slug: 'soon',
        postType: 'post',
        published: false,
        publishedAt: future,
        createdAt: created,
        coverImage: null,
        excerpt: 'y',
        websiteId: 5,
      },
      {
        id: 3,
        title: 'Draft post',
        slug: 'drafty',
        postType: 'post',
        published: false,
        publishedAt: null,
        createdAt: created,
        coverImage: null,
        excerpt: 'z',
        websiteId: 5,
      },
    ]);

    const res = await postsCalendarRoute.GET(
      makeReq(
        'http://x/api/posts/calendar?start=2026-01-01&end=2099-12-31',
      ) as unknown as Parameters<typeof postsCalendarRoute.GET>[0],
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);
    expect(body.data[0].status).toBe('published');
    expect(body.data[1].status).toBe('scheduled');
    expect(body.data[2].status).toBe('draft');
    // date prefers publishedAt then createdAt
    expect(body.data[0].date).toBe(past);
    expect(body.data[2].date).toBe(created);
  });

  it('accepts and uses a websiteId filter', async () => {
    selectQueue.push([]);
    const res = await postsCalendarRoute.GET(
      makeReq(
        'http://x/api/posts/calendar?start=2026-01-01&end=2026-12-31&websiteId=12',
      ) as unknown as Parameters<typeof postsCalendarRoute.GET>[0],
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 500 when the DB throws', async () => {
    // Force the select chain to reject by stuffing a rejecting thenable.
    // Easier: make `db.select` throw via the auth path? Here the route has no
    // auth — instead, monkey-patch URL parsing by passing an unusable URL.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Pass a non-URL string by constructing a Request with a malformed URL.
    // Request constructor itself accepts most strings, but the route only fails
    // if internal DB errors. We simulate by leaving selectQueue empty AND making
    // orderBy reject. To keep it simple: push a rejecting thenable factory.
    selectQueue.push([
      // Reading this triggers the post.map path, which is fine. Instead, force
      // an error by passing an undefined-string start that becomes NaN date and
      // letting the route succeed. So skip this 500 simulation in favor of
      // exercising the catch via a thrown error from db.select.
    ]);
    // Override db.select for this one call to throw:
    const dbModule = (await import('@/lib/db')) as unknown as { db: { select: () => unknown } };
    const orig = dbModule.db.select;
    dbModule.db.select = () => {
      throw new Error('boom');
    };
    try {
      const res = await postsCalendarRoute.GET(
        makeReq(
          'http://x/api/posts/calendar?start=2026-01-01&end=2026-12-31',
        ) as unknown as Parameters<typeof postsCalendarRoute.GET>[0],
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/Failed to fetch calendar/);
    } finally {
      dbModule.db.select = orig;
      errSpy.mockRestore();
    }
  });
});

// ===========================================================================
// PATCH /api/portal/checklist-items/[id]
// ===========================================================================

function paramsP(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/portal/checklist-items/[id]', () => {
  function req(body: unknown) {
    return new Request('http://x/api/portal/checklist-items/1', {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await checklistItemRoute.PATCH(req({ text: 'a' }), paramsP('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the checklist item does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([]); // item lookup miss
    const res = await checklistItemRoute.PATCH(req({ text: 'a' }), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when the card the item belongs to does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, cardId: 99, text: 'old', completed: false }]);
    selectQueue.push([]); // card lookup miss
    const res = await checklistItemRoute.PATCH(req({ text: 'a' }), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('admin can edit and updates text + completed (logs activity)', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, cardId: 50, text: 'old', completed: false }]);
    selectQueue.push([{ id: 50, projectId: 200 }]);
    updateReturningQueue.push([
      { id: 1, cardId: 50, text: 'new text', completed: true },
    ]);

    const res = await checklistItemRoute.PATCH(
      req({ text: 'new text', completed: true }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.text).toBe('new text');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('kanban_card_checklist_items');
    expect(updateCalls[0].setValues.text).toBe('new text');
    expect(updateCalls[0].setValues.completed).toBe(true);
    expect(updateCalls[0].setValues.completedBy).toBe(7);

    // Activity logged because completed flipped false -> true
    expect(logCardActivityMock).toHaveBeenCalledTimes(1);
    expect(logCardActivityMock.mock.calls[0][2]).toBe('card.checklist_item_completed');
  });

  it('logs uncompleted activity when toggling completed -> false', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, cardId: 50, text: 'old', completed: true }]);
    selectQueue.push([{ id: 50, projectId: 200 }]);
    updateReturningQueue.push([{ id: 1, completed: false }]);

    const res = await checklistItemRoute.PATCH(
      req({ completed: false }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    expect(logCardActivityMock).toHaveBeenCalledTimes(1);
    expect(logCardActivityMock.mock.calls[0][2]).toBe(
      'card.checklist_item_uncompleted',
    );
  });

  it('does NOT log activity when completed value is unchanged', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, cardId: 50, text: 'old', completed: false }]);
    selectQueue.push([{ id: 50, projectId: 200 }]);
    updateReturningQueue.push([{ id: 1, text: 'new', completed: false }]);

    const res = await checklistItemRoute.PATCH(
      req({ text: 'new', completed: false }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    expect(logCardActivityMock).not.toHaveBeenCalled();
  });

  it('portal client user with a non-private project gets 403', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } }); // no role -> portal
    selectQueue.push([{ id: 1, cardId: 50, text: 'old', completed: false }]);
    selectQueue.push([{ id: 50, projectId: 200 }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 200, clientId: 33, isPrivate: false }]); // project lookup

    const res = await checklistItemRoute.PATCH(req({ text: 'x' }), paramsP('1'));
    expect(res.status).toBe(403);
  });

  it('portal client user with no matching client gets 404', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ id: 1, cardId: 50, text: 'old', completed: false }]);
    selectQueue.push([{ id: 50, projectId: 200 }]);
    getPortalClientMock.mockResolvedValue(null);
    const res = await checklistItemRoute.PATCH(req({ text: 'x' }), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('portal client with a private project they own can edit', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ id: 1, cardId: 50, text: 'old', completed: false }]);
    selectQueue.push([{ id: 50, projectId: 200 }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 200, clientId: 33, isPrivate: true }]);
    selectQueue.push([{ role: 'editor' }]); // projectMembers (canUserEditProject)
    updateReturningQueue.push([{ id: 1, text: 'edited' }]);

    const res = await checklistItemRoute.PATCH(
      req({ text: 'edited' }),
      paramsP('1'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
  });
});

// ===========================================================================
// DELETE /api/portal/checklist-items/[id]
// ===========================================================================

describe('DELETE /api/portal/checklist-items/[id]', () => {
  function req() {
    return new Request('http://x/api/portal/checklist-items/1', {
      method: 'DELETE',
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await checklistItemRoute.DELETE(req(), paramsP('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the item is missing', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([]); // item lookup miss
    const res = await checklistItemRoute.DELETE(req(), paramsP('1'));
    expect(res.status).toBe(404);
  });

  it('admin can delete the item and logs activity', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, cardId: 50, text: 'doomed', completed: false }]);
    selectQueue.push([{ id: 50, projectId: 200 }]);

    const res = await checklistItemRoute.DELETE(req(), paramsP('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('kanban_card_checklist_items');
    expect(logCardActivityMock).toHaveBeenCalledTimes(1);
    expect(logCardActivityMock.mock.calls[0][2]).toBe(
      'card.checklist_item_removed',
    );
  });

  it('portal user with a non-private project gets 403', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    selectQueue.push([{ id: 1, cardId: 50, text: 'x', completed: false }]);
    selectQueue.push([{ id: 50, projectId: 200 }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 200, clientId: 33, isPrivate: false }]);
    const res = await checklistItemRoute.DELETE(req(), paramsP('1'));
    expect(res.status).toBe(403);
    expect(deleteCalls).toHaveLength(0);
  });
});
