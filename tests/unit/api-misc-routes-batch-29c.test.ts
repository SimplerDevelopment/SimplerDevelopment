// @vitest-environment node
/**
 * Unit tests for four portal kanban-card routes (batch 29c):
 *
 *   1. app/api/portal/cards/[id]/artifacts/available/route.ts          (GET)
 *      Lists candidate artifacts of various types belonging to the
 *      card's client. Staff/employee bypass tenant check; others must
 *      own the project's client.
 *
 *   2. app/api/portal/cards/[id]/files/[fileId]/route.ts               (PATCH / DELETE)
 *      Update commentId on a file row, or hard-delete a file row +
 *      its S3 object. Authz: staff/employee, or client owning the
 *      project. DELETE requires non-staff to also be the uploader.
 *
 *   3. app/api/portal/cards/[id]/time-logs/route.ts                    (POST)
 *      Inserts a time-log row. Staff/employee only.
 *
 *   4. app/api/portal/cards/[id]/time-logs/[logId]/route.ts            (DELETE)
 *      Deletes a time-log row. Staff/employee only.
 *
 * Strategy: db.select() is queue-driven through a chainable thenable;
 * db.insert/update/delete capture payloads and return queued rows. All
 * external modules (auth, portal-client, s3 delete, drizzle ops) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// mocks (top-level — vi.mock is hoisted)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const deleteFromS3Mock = vi.fn();
vi.mock('@/lib/s3/delete', () => ({
  deleteFromS3: (...args: unknown[]) => deleteFromS3Mock(...args),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
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
          if (prop === 'then') return undefined;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    kanbanCards: wrap('kanbanCards'),
    kanbanCardFiles: wrap('kanbanCardFiles'),
    kanbanCardTimeLogs: wrap('kanbanCardTimeLogs'),
    projects: wrap('projects'),
    clientWebsites: wrap('clientWebsites'),
    emailCampaigns: wrap('emailCampaigns'),
    pitchDecks: wrap('pitchDecks'),
    crmProposals: wrap('crmProposals'),
    bookingPages: wrap('bookingPages'),
    surveys: wrap('surveys'),
    posts: wrap('posts'),
    brainNotes: wrap('brainNotes'),
    projectMembers: wrap('projectMembers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
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
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNextSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = () => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNextSelect());
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.limit = () => {
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
            updateCalls.push({ table: table.__table, patch, filter });
            return Promise.resolve(undefined);
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
        const rows = insertReturnQueue.shift() ?? [];
        insertCalls.push({ table: table.__table, values: v, returnedRows: rows });
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  return {
    db: {
      select: () => buildSelect(),
      update: (table: { __table: string }) => buildUpdate(table),
      delete: (table: { __table: string }) => buildDelete(table),
      insert: (table: { __table: string }) => buildInsert(table),
    },
  };
});

// ---------------------------------------------------------------------------
// imports under test (after mocks)
// ---------------------------------------------------------------------------

const availableRoute = await import('@/app/api/portal/cards/[id]/artifacts/available/route');
const filesIdRoute = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
const timeLogsRoute = await import('@/app/api/portal/cards/[id]/time-logs/route');
const timeLogsIdRoute = await import('@/app/api/portal/cards/[id]/time-logs/[logId]/route');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const STAFF_SESSION = { user: { id: '7', role: 'admin', name: 'Admin Person' } };
const EMPLOYEE_SESSION = { user: { id: '8', role: 'employee', name: 'Employee Person' } };
const CLIENT_SESSION = { user: { id: '12', role: 'client', name: 'Client Person' } };

function makeParams<T>(p: T) {
  return { params: Promise.resolve(p) };
}

function makeJsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('http://x/api/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeNextRequest(url: string) {
  // The available route uses NextRequest.nextUrl.searchParams.
  // A plain Request with NextRequest's lazy URL parsing works because
  // Next constructs NextRequest from a Request; but to keep things simple
  // we import NextRequest directly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextRequest } = require('next/server') as typeof import('next/server');
  return new NextRequest(url);
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  deleteFromS3Mock.mockReset().mockResolvedValue(undefined);
});

// ===========================================================================
// 1) GET /api/portal/cards/[id]/artifacts/available
// ===========================================================================

describe('GET /api/portal/cards/[id]/artifacts/available', () => {
  const { GET } = availableRoute;

  it('returns 400 when the id is not numeric', async () => {
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/abc/artifacts/available'),
      makeParams({ id: 'abc' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the card does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // card lookup empty
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Card not found');
  });

  it('returns 404 when the project does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // project missing
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Project not found');
  });

  it('returns 403 when a non-staff client has no portal client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33 }]); // project
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when the client does not match project tenant', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 99 }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns all artifact types for staff (no type filter)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33 }]); // project
    // Promise.all queues 7 fetches in arbitrary order. Provide a unique
    // row per type so we can assert the final mix.
    selectQueue.push([{ id: 10, title: 'Site A' }]);          // websites
    selectQueue.push([{ id: 20, title: 'Camp A' }]);          // emailCampaigns
    selectQueue.push([{ id: 30, title: 'Deck A' }]);          // pitchDecks
    selectQueue.push([{ id: 40, title: 'Prop A' }]);          // proposals
    selectQueue.push([{ id: 50, title: 'Book A' }]);          // bookings
    selectQueue.push([{ id: 60, title: 'Surv A' }]);          // surveys
    selectQueue.push([{ id: 70, title: 'Proj A' }]);          // projects
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(7);
    const types = body.data.map((r: { type: string }) => r.type).sort();
    expect(types).toEqual(
      ['website', 'email_campaign', 'pitch_deck', 'proposal', 'booking', 'survey', 'project'].sort(),
    );
    // Staff bypass: getPortalClient never called
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });

  it('falls back to "Untitled" for rows whose title field is null', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    // One typed row per fetch; all titles null
    for (let i = 0; i < 7; i++) {
      selectQueue.push([{ id: i + 1, title: null }]);
    }
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const row of body.data) {
      expect(row.title).toBe('Untitled');
    }
  });

  it('filters by the requested artifact type (skip non-matching fetches)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33 }]); // project
    // Only the website fetch hits the DB because type=website
    selectQueue.push([{ id: 10, title: 'Just Sites' }]);
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available?type=website'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ type: 'website', id: 10, title: 'Just Sites' }]);
  });

  it('returns 200 for a matching client (non-staff happy path)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // Filter by survey so we only need one fetch
    selectQueue.push([{ id: 60, title: 'Owned Survey' }]);
    const res = await GET(
      makeNextRequest('http://x/api/portal/cards/1/artifacts/available?type=survey'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ type: 'survey', id: 60, title: 'Owned Survey' }]);
  });
});

// ===========================================================================
// 2) PATCH/DELETE /api/portal/cards/[id]/files/[fileId]
// ===========================================================================

describe('PATCH /api/portal/cards/[id]/files/[fileId]', () => {
  const { PATCH } = filesIdRoute;

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(
      makeJsonRequest({ commentId: 5 }, 'PATCH'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card does not exist (authorize fails)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // card lookup empty
    const res = await PATCH(
      makeJsonRequest({ commentId: 5 }, 'PATCH'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when non-staff portal client lookup returns null', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    getPortalClientMock.mockResolvedValue(null);
    const res = await PATCH(
      makeJsonRequest({ commentId: 5 }, 'PATCH'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when non-staff client does not own the project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // project ownership query returns nothing
    const res = await PATCH(
      makeJsonRequest({ commentId: 5 }, 'PATCH'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the file does not belong to the card', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card lookup
    // file lookup returns a row but with mismatched cardId
    selectQueue.push([{ cardId: 999 }]);
    const res = await PATCH(
      makeJsonRequest({ commentId: 5 }, 'PATCH'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the file does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // file lookup empty
    const res = await PATCH(
      makeJsonRequest({ commentId: 5 }, 'PATCH'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('updates the file commentId for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ cardId: 1 }]); // file belongs to this card
    const res = await PATCH(
      makeJsonRequest({ commentId: 42 }, 'PATCH'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('kanbanCardFiles');
    expect(updateCalls[0].patch).toEqual({ commentId: 42 });
  });

  it('updates the file commentId for a client owning the project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]); // project ownership ok
    selectQueue.push([{ cardId: 1 }]); // file ownership ok
    const res = await PATCH(
      makeJsonRequest({ commentId: null }, 'PATCH'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toEqual({ commentId: null });
  });
});

describe('DELETE /api/portal/cards/[id]/files/[fileId]', () => {
  const { DELETE } = filesIdRoute;

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the card cannot be authorized', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // no card
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when file not found for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // file lookup empty
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('deletes file from S3 and DB for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 2, cardId: 1, userId: 7, storedFilename: 'abc.png' }]); // file
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(deleteFromS3Mock).toHaveBeenCalledWith('abc.png');
    expect(deleteCalls.some((d) => d.table === 'kanbanCardFiles')).toBe(true);
  });

  it('non-staff client cannot delete a file they did not upload (404)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]); // project ownership ok
    selectQueue.push([]); // file lookup empty because uploader filter excludes them
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(404);
    expect(deleteFromS3Mock).not.toHaveBeenCalled();
  });

  it('non-staff client CAN delete their own uploaded file', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]); // project ownership ok
    selectQueue.push([{ id: 2, cardId: 1, userId: 12, storedFilename: 'mine.pdf' }]);
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(200);
    expect(deleteFromS3Mock).toHaveBeenCalledWith('mine.pdf');
  });

  it('returns 500 when S3 deletion throws', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 2, cardId: 1, userId: 7, storedFilename: 'fail.png' }]);
    deleteFromS3Mock.mockRejectedValueOnce(new Error('s3 boom'));
    // Suppress console.error noise for this test
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', fileId: '2' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Delete failed');
    errSpy.mockRestore();
  });
});

// ===========================================================================
// 3) POST /api/portal/cards/[id]/time-logs
// ===========================================================================

describe('POST /api/portal/cards/[id]/time-logs', () => {
  const { POST } = timeLogsRoute;

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeJsonRequest({ minutes: 5 }), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await POST(makeJsonRequest({ minutes: 5 }), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-staff (client) callers', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await POST(makeJsonRequest({ minutes: 30 }), makeParams({ id: '1' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Forbidden');
  });

  it('returns 400 when minutes is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await POST(makeJsonRequest({}), makeParams({ id: '1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('minutes must be > 0');
  });

  it('returns 400 when minutes is zero', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await POST(makeJsonRequest({ minutes: 0 }), makeParams({ id: '1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when minutes is negative', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await POST(makeJsonRequest({ minutes: -10 }), makeParams({ id: '1' }));
    expect(res.status).toBe(400);
  });

  it('inserts a time-log for an admin and returns userName from session', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    insertReturnQueue.push([
      { id: 100, cardId: 1, userId: 7, minutes: 30, note: 'Did the thing' },
    ]);
    const res = await POST(
      makeJsonRequest({ minutes: 30, note: 'Did the thing' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: 100,
      cardId: 1,
      userId: 7,
      minutes: 30,
      note: 'Did the thing',
      userName: 'Admin Person',
    });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('kanbanCardTimeLogs');
    expect(insertCalls[0].values).toMatchObject({
      cardId: 1,
      userId: 7,
      minutes: 30,
      note: 'Did the thing',
    });
  });

  it('inserts a time-log for an employee with no note (note coerced to null)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    insertReturnQueue.push([
      { id: 101, cardId: 1, userId: 8, minutes: 15, note: null },
    ]);
    const res = await POST(
      makeJsonRequest({ minutes: 15 }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.userName).toBe('Employee Person');
    expect(insertCalls[0].values).toMatchObject({
      cardId: 1,
      userId: 8,
      minutes: 15,
      note: null,
    });
  });

  it('returns null userName when session has no name', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    insertReturnQueue.push([
      { id: 102, cardId: 1, userId: 7, minutes: 5, note: null },
    ]);
    const res = await POST(
      makeJsonRequest({ minutes: 5 }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.userName).toBeNull();
  });
});

// ===========================================================================
// 4) DELETE /api/portal/cards/[id]/time-logs/[logId]
// ===========================================================================

describe('DELETE /api/portal/cards/[id]/time-logs/[logId]', () => {
  const { DELETE } = timeLogsIdRoute;

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', logId: '99' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', logId: '99' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for a client role', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', logId: '99' }),
    );
    expect(res.status).toBe(403);
  });

  it('deletes the time-log for admin', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', logId: '99' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('kanbanCardTimeLogs');
  });

  it('deletes the time-log for employee', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    const res = await DELETE(
      makeJsonRequest({}, 'DELETE'),
      makeParams({ id: '1', logId: '42' }),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
  });
});
