// @vitest-environment node
/**
 * Batch 25d — unit tests for 4 small portal kanban / project route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/projects/[id]/sprints/route.ts            (GET / POST)
 *  - app/api/portal/projects/[id]/labels/route.ts             (GET / POST)
 *  - app/api/portal/projects/[id]/files/route.ts              (GET)
 *  - app/api/portal/projects/[id]/columns/reorder/route.ts    (PATCH)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await`. db.insert/update
 * are mocked to capture writes and return queued rows.
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

const isPortalStaffMock = vi.fn();
vi.mock('@/lib/portal', () => ({
  isPortalStaff: () => isPortalStaffMock(),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: Object.assign((..._args: unknown[]) => ({ op: 'sql' }), {
    raw: (s: string) => ({ op: 'raw', s }),
  }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables.
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
    sprints: wrap('sprints'),
    kanbanCards: wrap('kanbanCards'),
    kanbanColumns: wrap('kanbanColumns'),
    kanbanLabels: wrap('kanbanLabels'),
    kanbanCardFiles: wrap('kanbanCardFiles'),
    projects: wrap('projects'),
    projectMembers: wrap('projectMembers'),
    users: wrap('users'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---- db mock with select-queue + write capture --------------------------------

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
            updateCalls.push({ table: table.__table, patch, filter });
            return Promise.resolve(undefined);
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
          returning(_proj?: unknown) {
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

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const sprintsRoute = await import('@/app/api/portal/projects/[id]/sprints/route');
const labelsRoute = await import('@/app/api/portal/projects/[id]/labels/route');
const filesRoute = await import('@/app/api/portal/projects/[id]/files/route');
const reorderRoute = await import('@/app/api/portal/projects/[id]/columns/reorder/route');

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const STAFF_SESSION = { user: { id: '7', role: 'admin' } };
const CLIENT_SESSION = { user: { id: '8', role: 'client' } };

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  isPortalStaffMock.mockReset();
});

// ===========================================================================
// GET / POST /api/portal/projects/[id]/sprints
// ===========================================================================

describe('GET /api/portal/projects/[id]/sprints', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await sprintsRoute.GET(new Request('http://x'), params('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when staff cannot find the project', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([]); // project lookup empty
    const res = await sprintsRoute.GET(new Request('http://x'), params('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when non-staff has no portal client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    isPortalStaffMock.mockResolvedValue(false);
    getPortalClientMock.mockResolvedValue(null);
    const res = await sprintsRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with sprints + backlog cards grouped by sprintId', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([{ id: 5, name: 'P', clientId: 33, isPrivate: false }]); // project
    selectQueue.push([{ id: 1, name: 'Sprint 1', order: 0 }, { id: 2, name: 'Sprint 2', order: 1 }]); // sprints
    selectQueue.push([
      { id: 10, title: 'A', sprintId: 1, columnId: 100, columnName: 'Todo', columnIsDone: false, sprintOrder: 0, order: 0 },
      { id: 11, title: 'B', sprintId: null, columnId: 100, columnName: 'Todo', columnIsDone: false, sprintOrder: 0, order: 1 },
      { id: 12, title: 'C', sprintId: 2, columnId: 100, columnName: 'Todo', columnIsDone: false, sprintOrder: 0, order: 2 },
    ]); // cards
    const res = await sprintsRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sprints).toHaveLength(2);
    expect(body.data.sprints[0].cards).toHaveLength(1);
    expect(body.data.sprints[0].cards[0].id).toBe(10);
    expect(body.data.backlog).toHaveLength(1);
    expect(body.data.backlog[0].id).toBe(11);
  });

  it('returns 500 when a downstream throws', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await sprintsRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe('POST /api/portal/projects/[id]/sprints', () => {
  function reqBody(body: unknown): Request {
    return new Request('http://x/api/portal/projects/5/sprints', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await sprintsRoute.POST(reqBody({ name: 'S' }), params('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not authorized (staff lookup empty)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([]); // staff project lookup
    const res = await sprintsRoute.POST(reqBody({ name: 'S' }), params('5'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-staff client cannot edit public project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    // First call inside authorizeProject (isStaff=false branch)
    isPortalStaffMock
      .mockResolvedValueOnce(false) // inside authorizeProject
      .mockResolvedValueOnce(false); // again after authorize, in POST main flow
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // project authorize lookup → public project
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]);
    const res = await sprintsRoute.POST(reqBody({ name: 'S' }), params('5'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: true }]); // staff project lookup
    const res = await sprintsRoute.POST(reqBody({ name: '  ' }), params('5'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name is required/);
  });

  it('creates sprint and returns the inserted row with order based on existing count', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    isPortalStaffMock.mockResolvedValue(true);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: true }]); // project
    selectQueue.push([{ id: 1 }, { id: 2 }]); // existing sprints (length=2 → order=2)
    insertReturnQueue.push([
      { id: 99, name: 'Sprint 3', projectId: 5, status: 'planning', order: 2 },
    ]);
    const res = await sprintsRoute.POST(
      reqBody({ name: 'Sprint 3', goal: 'g', startDate: '2026-01-01', endDate: '2026-01-15' }),
      params('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(99);
    expect(body.data.cards).toEqual([]);
    expect(insertCalls).toHaveLength(1);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.projectId).toBe(5);
    expect(v.name).toBe('Sprint 3');
    expect(v.goal).toBe('g');
    expect(v.order).toBe(2);
    expect(v.status).toBe('planning');
    expect(v.startDate).toBeInstanceOf(Date);
    expect(v.endDate).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// GET / POST /api/portal/projects/[id]/labels
// ===========================================================================

describe('GET /api/portal/projects/[id]/labels', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await labelsRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // project empty
    const res = await labelsRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when client mismatch', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 5, clientId: 99, isPrivate: false }]); // project owned by 99
    getPortalClientMock.mockResolvedValue({ id: 33 }); // session client is 33 → mismatch
    const res = await labelsRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with rows for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]); // project
    selectQueue.push([{ id: 1, name: 'bug', color: '#ff0000' }]); // labels
    const res = await labelsRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ id: 1, name: 'bug', color: '#ff0000' }]);
  });
});

describe('POST /api/portal/projects/[id]/labels', () => {
  function reqBody(body: unknown): Request {
    return new Request('http://x/api/portal/projects/5/labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await labelsRoute.POST(reqBody({ name: 'x' }), params('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // empty project
    const res = await labelsRoute.POST(reqBody({ name: 'x' }), params('5'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when client cannot edit public project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]); // public project
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await labelsRoute.POST(reqBody({ name: 'x' }), params('5'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when name missing/blank', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]);
    const res = await labelsRoute.POST(reqBody({ name: '   ' }), params('5'));
    expect(res.status).toBe(400);
  });

  it('creates a label with valid color and returns 201', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]);
    insertReturnQueue.push([{ id: 22, projectId: 5, name: 'bug', color: '#abcdef' }]);
    const res = await labelsRoute.POST(reqBody({ name: '  bug  ', color: '#abcdef' }), params('5'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(22);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.name).toBe('bug'); // trimmed
    expect(v.color).toBe('#abcdef');
  });

  it('falls back to default color when invalid', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]);
    insertReturnQueue.push([{ id: 23, projectId: 5, name: 'feat', color: '#6366f1' }]);
    const res = await labelsRoute.POST(reqBody({ name: 'feat', color: 'not-a-color' }), params('5'));
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.color).toBe('#6366f1');
  });

  it('truncates names longer than 50 chars', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]);
    insertReturnQueue.push([{ id: 24 }]);
    const longName = 'a'.repeat(80);
    const res = await labelsRoute.POST(reqBody({ name: longName }), params('5'));
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect((v.name as string).length).toBe(50);
  });
});

// ===========================================================================
// GET /api/portal/projects/[id]/files
// ===========================================================================

describe('GET /api/portal/projects/[id]/files', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await filesRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when non-staff has no portal client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    selectQueue.push([{ id: 5, clientId: 99 }]); // project found, but client null → 404
    const res = await filesRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when non-staff client does not own the project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // project lookup empty
    const res = await filesRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with files for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    // Route does Promise.all([auth(), db.select(project)]) so project is always
    // fetched first, then files are fetched after the auth/staff check.
    selectQueue.push([{ id: 5, clientId: 99 }]); // project (consumed by parallel fetch)
    selectQueue.push([
      { id: 1, originalName: 'a.png', mimeType: 'image/png', fileSize: 100, url: 'http://f/a.png', commentId: null, userId: 7, createdAt: new Date('2026-01-01'), userName: 'Dan', cardId: 10, cardTitle: 'Card A' },
    ]); // files
    const res = await filesRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].originalName).toBe('a.png');
  });

  it('returns 200 with files when non-staff client owns the project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]); // project lookup ok
    selectQueue.push([]); // files empty
    const res = await filesRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 500 when downstream throws', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    // Simulate db.select throwing by forcing auth to a session that triggers
    // the staff branch, then having the files select reject. Easiest path:
    // make authMock throw inside try.
    authMock.mockReset();
    authMock.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await filesRoute.GET(new Request('http://x'), params('5'));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

// ===========================================================================
// PATCH /api/portal/projects/[id]/columns/reorder
// ===========================================================================

describe('PATCH /api/portal/projects/[id]/columns/reorder', () => {
  function reqBody(body: unknown): Request {
    return new Request('http://x/api/portal/projects/5/columns/reorder', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await reorderRoute.PATCH(reqBody({ columnIds: [1, 2, 3] }), params('5'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when non-staff has no portal client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await reorderRoute.PATCH(reqBody({ columnIds: [1, 2, 3] }), params('5'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when non-staff client does not own the project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // project lookup empty
    const res = await reorderRoute.PATCH(reqBody({ columnIds: [1, 2, 3] }), params('5'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when columnIds not an array', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await reorderRoute.PATCH(reqBody({ columnIds: 'nope' }), params('5'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/columnIds array required/);
  });

  it('updates each column with its new order (staff)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await reorderRoute.PATCH(reqBody({ columnIds: [10, 11, 12] }), params('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[0].table).toBe('kanbanColumns');
    expect(updateCalls[0].patch.order).toBe(0);
    expect(updateCalls[1].patch.order).toBe(1);
    expect(updateCalls[2].patch.order).toBe(2);
  });

  it('updates each column when non-staff client owns project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]); // project lookup ok
    const res = await reorderRoute.PATCH(reqBody({ columnIds: [20, 21] }), params('5'));
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(2);
  });
});
