// @vitest-environment node
/**
 * Unit tests for app/api/portal/cards/[id]/route.ts (GET / PATCH / DELETE).
 *
 * Strategy: db.select() is mocked with a queue of result rows. Each
 * chain call (.from / .leftJoin / .innerJoin / .where / .orderBy / .limit)
 * returns a thenable that resolves to the next queued result. The route's
 * SQL is queue-order-deterministic so we can line up rows by test setup.
 *
 * db.update() and db.delete() are mocked to capture writes without needing
 * a SQL engine. db.insert() captures insert payloads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks (must be declared before importing the route) ----

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
  filterUserIdsVisibleToClient: (...args: unknown[]) => filterUserIdsVisibleToClientMock(...args),
}));

// drizzle-orm — stub operators to plain objects (we don't introspect them)
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
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
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    kanbanCards: wrap('kanbanCards'),
    kanbanCardComments: wrap('kanbanCardComments'),
    kanbanCardTimeLogs: wrap('kanbanCardTimeLogs'),
    kanbanCardFiles: wrap('kanbanCardFiles'),
    kanbanCardLabels: wrap('kanbanCardLabels'),
    kanbanLabels: wrap('kanbanLabels'),
    kanbanCardActivities: wrap('kanbanCardActivities'),
    kanbanCardChecklistItems: wrap('kanbanCardChecklistItems'),
    kanbanCardAssignees: wrap('kanbanCardAssignees'),
    kanbanCardWatchers: wrap('kanbanCardWatchers'),
    kanbanCardDependencies: wrap('kanbanCardDependencies'),
    kanbanColumns: wrap('kanbanColumns'),
    users: wrap('users'),
    projects: wrap('projects'),
  };
});

// ---- db mock with select-queue + capture for writes ----

interface DeleteCall {
  table: string;
  filter: unknown;
}
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
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let resolved = false;
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNext());
        resolved = true;
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    // Each chain method just returns chain — we materialize on await/then.
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.limit = () => {
      // limit is the common terminal; eagerly materialize so await works
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
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

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return Promise.resolve(undefined);
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        return {
          onConflictDoNothing() {
            return Promise.resolve(undefined);
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- module under test (after mocks) ----

const { GET, PATCH, DELETE } = await import('@/app/api/portal/cards/[id]/route');

// ---- helpers ----

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(body: unknown): Request {
  return new Request('http://x/api/portal/cards/1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const STAFF_SESSION = { user: { id: '7', role: 'admin' } };
const CLIENT_SESSION = { user: { id: '12', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  logCardActivityMock.mockReset().mockResolvedValue(undefined);
  filterUserIdsVisibleToClientMock.mockReset().mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/cards/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no card exists', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    // authorizeCard does one select.from.where.limit → []
    selectQueue.push([]); // card lookup empty
    const res = await GET(new Request('http://x'), makeParams('99'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 200 with full payload for staff (admin) including timeLogs', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const card = { id: 1, projectId: 5, number: 42, title: 'Hello', dueDate: null };
    // Queue mirrors handler order
    selectQueue.push([card]); // authorizeCard: card
    selectQueue.push([{ id: 100, body: 'first comment', userId: 7, userName: 'Alice' }]); // comments
    selectQueue.push([{ id: 200, minutes: 30, userId: 7, userName: 'Alice' }]); // timeLogs (staff)
    selectQueue.push([{ id: 300, originalName: 'f.png', userId: 7 }]); // files
    selectQueue.push([{ id: 400, name: 'bug', color: '#f00' }]); // labels
    selectQueue.push([{ id: 500, type: 'card.commented' }]); // activities
    selectQueue.push([{ projectKey: 'PROJ' }]); // project key lookup
    selectQueue.push([{ id: 600, text: 'todo', order: 1 }]); // checklist
    selectQueue.push([{ id: 7, name: 'Alice', email: 'a@x.com' }]); // assignees
    selectQueue.push([{ userId: 7 }]); // watcherRows
    selectQueue.push([{ id: 11, title: 'Blocker', number: 9, columnIsDone: false }]); // blockers
    selectQueue.push([]); // blocking
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.card.key).toBe('PROJ-42');
    expect(body.data.card.projectKey).toBe('PROJ');
    expect(body.data.timeLogs).toHaveLength(1);
    expect(body.data.comments).toHaveLength(1);
    expect(body.data.files).toHaveLength(1);
    expect(body.data.labels).toHaveLength(1);
    expect(body.data.activities).toHaveLength(1);
    expect(body.data.checklist).toHaveLength(1);
    expect(body.data.assignees).toHaveLength(1);
    expect(body.data.watcherIds).toEqual([7]);
    expect(body.data.watching).toBe(true);
    expect(body.data.blockers[0].key).toBe('PROJ-9');
    expect(body.data.blocking).toEqual([]);
  });

  it('returns empty timeLogs for non-staff client and watching=false when not in watchers', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const card = { id: 1, projectId: 5, number: null, dueDate: null };
    // authorizeCard: card → project → returns { canEdit: project.isPrivate }
    selectQueue.push([card]);
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: true }]); // project ownership
    // Continue with GET reads:
    selectQueue.push([{ id: 100, body: 'c1', userId: 12 }]); // comments
    // timeLogs is SKIPPED for non-staff (no DB call) → DO NOT push
    selectQueue.push([{ id: 300, originalName: 'f.png' }]); // files
    selectQueue.push([{ id: 400, name: 'bug' }]); // labels
    selectQueue.push([{ id: 500, type: 'x' }]); // activities
    selectQueue.push([{ projectKey: 'P' }]); // project key
    selectQueue.push([]); // checklist
    selectQueue.push([]); // assignees
    selectQueue.push([{ userId: 999 }]); // watcherRows (different user)
    selectQueue.push([]); // blockers
    selectQueue.push([]); // blocking
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.timeLogs).toEqual([]);
    expect(body.data.watching).toBe(false);
    expect(body.data.card.key).toBeNull(); // number is null
  });

  it('returns 404 for non-staff when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card found
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-staff when project does not belong to the client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, projectId: 5 }]); // card found
    selectQueue.push([]); // project not in client
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 500 on unexpected error inside GET', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    // Make the first select throw by emptying queue & forcing the second
    // call to crash through a thrown override.
    authMock.mockImplementationOnce(() => {
      throw new Error('auth blew up');
    });
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Internal server error');
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe('PATCH /api/portal/cards/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(makeJsonRequest({}), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when card not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // authorizeCard: no card
    const res = await PATCH(makeJsonRequest({ title: 'New' }), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-staff and project is public (canEdit=false)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]); // project public
    const res = await PATCH(makeJsonRequest({ title: 'X' }), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('updates a card title and logs title_changed', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'Old', description: 'Desc', priority: 'low', dueDate: null, sprintId: null }]); // authorize
    updateReturnQueue.push([{ id: 1, title: 'New Title', description: 'Desc', priority: 'low', dueDate: null, sprintId: null }]);
    const res = await PATCH(makeJsonRequest({ title: 'New Title' }), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe('New Title');
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.title_changed',
      { from: 'Old', to: 'New Title' },
    );
    // Update was called with title and updatedAt
    expect(updateCalls[0].patch).toMatchObject({ title: 'New Title' });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('returns 404 when the underlying update returns no rows', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'Old' }]); // authorize
    updateReturnQueue.push([]); // update returns []
    const res = await PATCH(makeJsonRequest({ title: 'X' }), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('logs description_changed when description changes', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'T', description: 'A', priority: null, dueDate: null, sprintId: null }]);
    updateReturnQueue.push([{ id: 1, title: 'T', description: 'B', priority: null, dueDate: null, sprintId: null }]);
    await PATCH(makeJsonRequest({ description: 'B' }), makeParams('1'));
    expect(logCardActivityMock).toHaveBeenCalledWith(1, 7, 'card.description_changed', {});
  });

  it('logs priority_changed when priority changes', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'T', description: null, priority: 'low', dueDate: null, sprintId: null }]);
    updateReturnQueue.push([{ id: 1, title: 'T', description: null, priority: 'high', dueDate: null, sprintId: null }]);
    await PATCH(makeJsonRequest({ priority: 'high' }), makeParams('1'));
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.priority_changed',
      { from: 'low', to: 'high' },
    );
  });

  it('logs due_date_changed when dueDate changes (string ↔ null)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'T', description: null, priority: null, dueDate: null, sprintId: null }]);
    updateReturnQueue.push([{ id: 1, title: 'T', description: null, priority: null, dueDate: new Date('2026-06-01T00:00:00Z'), sprintId: null }]);
    await PATCH(makeJsonRequest({ dueDate: '2026-06-01T00:00:00Z' }), makeParams('1'));
    const call = logCardActivityMock.mock.calls.find((c) => c[2] === 'card.due_date_changed');
    expect(call).toBeDefined();
    expect(call![3]).toMatchObject({ from: null, to: '2026-06-01T00:00:00.000Z' });
  });

  it('does NOT log due_date_changed when same dueDate is passed', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const sameDate = new Date('2026-06-01T00:00:00Z');
    selectQueue.push([{ id: 1, projectId: 5, title: 'T', dueDate: sameDate, description: null, priority: null, sprintId: null }]);
    updateReturnQueue.push([{ id: 1, title: 'T', dueDate: sameDate, description: null, priority: null, sprintId: null }]);
    await PATCH(makeJsonRequest({ dueDate: '2026-06-01T00:00:00Z' }), makeParams('1'));
    const call = logCardActivityMock.mock.calls.find((c) => c[2] === 'card.due_date_changed');
    expect(call).toBeUndefined();
  });

  it('logs sprint_changed when sprintId changes', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'T', description: null, priority: null, dueDate: null, sprintId: 1 }]);
    updateReturnQueue.push([{ id: 1, title: 'T', description: null, priority: null, dueDate: null, sprintId: 2 }]);
    await PATCH(makeJsonRequest({ sprintId: 2 }), makeParams('1'));
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.sprint_changed',
      { from: 1, to: 2 },
    );
  });

  it('sets sprintId to null when body.sprintId is null', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'T', sprintId: 5 }]);
    updateReturnQueue.push([{ id: 1, sprintId: null }]);
    await PATCH(makeJsonRequest({ sprintId: null }), makeParams('1'));
    expect(updateCalls[0].patch).toMatchObject({ sprintId: null });
  });

  it('assigns a user (staff path): inserts assignee + watcher, logs assignee_added', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'T', description: null, priority: null, dueDate: null, sprintId: null }]); // authorize
    updateReturnQueue.push([{ id: 1, title: 'T' }]); // card update
    // replaceCardAssignees:
    selectQueue.push([]); // current assignees (empty)
    selectQueue.push([{ name: 'Alice' }]); // user name lookup
    const res = await PATCH(makeJsonRequest({ assignedTo: 42 }), makeParams('1'));
    expect(res.status).toBe(200);
    // 2 inserts: kanbanCardAssignees + kanbanCardWatchers
    const inserts = insertCalls.map((c) => c.table);
    expect(inserts).toContain('kanbanCardAssignees');
    expect(inserts).toContain('kanbanCardWatchers');
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.assignee_added',
      { userId: 42, name: 'Alice' },
    );
  });

  it('unassigns: deletes assignee and logs assignee_removed when assignedTo is null', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, title: 'T' }]); // authorize
    updateReturnQueue.push([{ id: 1, title: 'T' }]); // card update
    selectQueue.push([{ userId: 99 }]); // current assignees
    selectQueue.push([{ name: 'Bob' }]); // user lookup for log
    await PATCH(makeJsonRequest({ assignedTo: null }), makeParams('1'));
    expect(deleteCalls.some((d) => d.table === 'kanbanCardAssignees')).toBe(true);
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.assignee_removed',
      { userId: 99, name: 'Bob' },
    );
  });

  it('non-staff client: drops foreign user ids during assignment (mass-assign defense)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValueOnce({ id: 33 }); // authorize call
    selectQueue.push([{ id: 1, projectId: 5, title: 'T' }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: true }]); // project
    updateReturnQueue.push([{ id: 1, title: 'T' }]); // card update
    getPortalClientMock.mockResolvedValueOnce({ id: 33 }); // assignment path
    filterUserIdsVisibleToClientMock.mockResolvedValueOnce([]); // user 999 NOT in client
    selectQueue.push([]); // current assignees
    // No removals/adds since next becomes null and current is empty
    const res = await PATCH(makeJsonRequest({ assignedTo: 999 }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(filterUserIdsVisibleToClientMock).toHaveBeenCalledWith([999], 33);
    // No assignee insert (next was filtered to null)
    expect(insertCalls.filter((c) => c.table === 'kanbanCardAssignees')).toHaveLength(0);
  });

  it('non-staff client: returns 403 when assignment cannot resolve client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValueOnce({ id: 33 }); // authorize ok
    selectQueue.push([{ id: 1, projectId: 5, title: 'T' }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: true }]); // project private
    updateReturnQueue.push([{ id: 1, title: 'T' }]); // card update happens before assignedTo branch
    getPortalClientMock.mockResolvedValueOnce(null); // assignment path: no client
    const res = await PATCH(makeJsonRequest({ assignedTo: 50 }), makeParams('1'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/portal/cards/[id]', () => {
  it('returns 401 with no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when card not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // authorize: no card
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-staff and project is public', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]); // public project
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('deletes the card and returns success for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // authorize
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(deleteCalls.some((d) => d.table === 'kanbanCards')).toBe(true);
  });

  it('deletes the card for non-staff when project is private (canEdit=true)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: true }]); // private project
    const res = await DELETE(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
  });
});
