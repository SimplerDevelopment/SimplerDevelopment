// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 28h):
 *   - app/api/portal/cards/[id]/dependencies/route.ts  (POST, DELETE)
 *   - app/api/portal/cards/[id]/files/route.ts         (POST)
 *   - app/api/portal/cards/[id]/labels/route.ts        (POST, DELETE)
 *   - app/api/portal/cards/[id]/move/route.ts          (PATCH)
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

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

// drizzle-orm — stub operators to plain objects (we don't introspect them)
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
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
    kanbanCardDependencies: wrap('kanbanCardDependencies'),
    kanbanCardFiles: wrap('kanbanCardFiles'),
    kanbanCardLabels: wrap('kanbanCardLabels'),
    kanbanLabels: wrap('kanbanLabels'),
    kanbanColumns: wrap('kanbanColumns'),
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
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- modules under test (loaded AFTER mocks) ----

const dependenciesRoute = await import('@/app/api/portal/cards/[id]/dependencies/route');
const filesRoute = await import('@/app/api/portal/cards/[id]/files/route');
const labelsRoute = await import('@/app/api/portal/cards/[id]/labels/route');
const moveRoute = await import('@/app/api/portal/cards/[id]/move/route');

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
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  logCardActivityMock.mockReset().mockResolvedValue(undefined);
  uploadToS3Mock.mockReset();
});

// ===========================================================================
// dependencies/route.ts
// ===========================================================================

describe('POST /api/portal/cards/[id]/dependencies', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when the card does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // authorize: no card
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-staff when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    getPortalClientMock.mockResolvedValue(null);
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-staff when project not owned by client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // project lookup returns nothing
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-staff when project is public (canEdit=false)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]); // project public
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when blockerCardId is not a number', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 'not-a-number' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid blockerCardId/i);
  });

  it('returns 400 when blockerCardId equals cardId (self-block)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when blocker is in a different project', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 2, projectId: 99, title: 'Other' }]); // blocker in another project
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/same project/i);
  });

  it('returns 400 when blocker does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // blocker not found
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when a reciprocal cycle would be created', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 2, projectId: 5, title: 'Blocker' }]); // blocker
    selectQueue.push([{ blockedCardId: 2, blockerCardId: 1 }]); // reciprocal exists
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/cycle/i);
  });

  it('inserts dependency and logs activity for admin', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 2, projectId: 5, title: 'Blocker' }]); // blocker same project
    selectQueue.push([]); // no reciprocal
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(insertCalls.some((c) => c.table === 'kanbanCardDependencies')).toBe(true);
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.dependency_added',
      { blockerCardId: 2, title: 'Blocker' },
    );
  });

  it('allows employee role (canEdit=true) to add dependency', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 2, projectId: 5, title: 'Blocker' }]); // blocker
    selectQueue.push([]); // no reciprocal
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });

  it('allows non-staff with private project to add dependency', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: true }]); // private project
    selectQueue.push([{ id: 2, projectId: 5, title: 'Blocker' }]); // blocker
    selectQueue.push([]); // no reciprocal
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await dependenciesRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/dependencies', 'POST', { blockerCardId: 2 }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/portal/cards/[id]/dependencies', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await dependenciesRoute.DELETE(
      new Request('http://x/api/portal/cards/1/dependencies?blockerCardId=2', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]);
    const res = await dependenciesRoute.DELETE(
      new Request('http://x/api/portal/cards/1/dependencies?blockerCardId=2', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-staff and project public', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]); // public
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await dependenciesRoute.DELETE(
      new Request('http://x/api/portal/cards/1/dependencies?blockerCardId=2', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when blockerCardId query param is missing/NaN', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    const res = await dependenciesRoute.DELETE(
      new Request('http://x/api/portal/cards/1/dependencies', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/blockerCardId required/i);
  });

  it('deletes dependency and logs activity', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    const res = await dependenciesRoute.DELETE(
      new Request('http://x/api/portal/cards/1/dependencies?blockerCardId=2', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls.some((d) => d.table === 'kanbanCardDependencies')).toBe(true);
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.dependency_removed',
      { blockerCardId: 2 },
    );
  });
});

// ===========================================================================
// files/route.ts
// ===========================================================================

function makeFileFormRequest(file: File | null): Request {
  const fd = new FormData();
  if (file) fd.append('file', file);
  return new Request('http://x/api/portal/cards/1/files', {
    method: 'POST',
    body: fd as unknown as BodyInit,
  });
}

describe('POST /api/portal/cards/[id]/files', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await filesRoute.POST(
      makeFileFormRequest(new File(['x'], 'a.txt', { type: 'text/plain' })),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // authorize: no card
    const res = await filesRoute.POST(
      makeFileFormRequest(new File(['x'], 'a.txt', { type: 'text/plain' })),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-staff when client lookup fails', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card found
    getPortalClientMock.mockResolvedValue(null);
    const res = await filesRoute.POST(
      makeFileFormRequest(new File(['x'], 'a.txt', { type: 'text/plain' })),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-staff when project does not belong to client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // project not for this client
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await filesRoute.POST(
      makeFileFormRequest(new File(['x'], 'a.txt', { type: 'text/plain' })),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when no file is provided', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    const res = await filesRoute.POST(
      makeFileFormRequest(null),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/no file/i);
  });

  it('returns 400 when file exceeds 20MB limit', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    // Build a real >20MB payload (21MB of zeros) so the route's file.size check trips.
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.bin', {
      type: 'application/octet-stream',
    });
    const res = await filesRoute.POST(
      makeFileFormRequest(big),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/20MB/);
  });

  it('uploads and returns the inserted record for staff', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin', name: 'Alice' } });
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    uploadToS3Mock.mockResolvedValue({
      url: 'https://s3/x.txt',
      storedFilename: 'x.txt',
      mimeType: 'text/plain',
      fileSize: 5,
    });
    insertReturnQueue.push([{ id: 99, cardId: 1, originalName: 'a.txt' }]);

    const res = await filesRoute.POST(
      makeFileFormRequest(new File(['hello'], 'a.txt', { type: 'text/plain' })),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(body.data.userName).toBe('Alice');
    expect(uploadToS3Mock).toHaveBeenCalled();
    expect(insertCalls.some((c) => c.table === 'kanbanCardFiles')).toBe(true);
  });

  it('falls back to userName=null when session.user.name missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    uploadToS3Mock.mockResolvedValue({
      url: 'https://s3/x.txt',
      storedFilename: 'x.txt',
      mimeType: 'text/plain',
      fileSize: 5,
    });
    insertReturnQueue.push([{ id: 99 }]);
    const res = await filesRoute.POST(
      makeFileFormRequest(new File(['hi'], 'a.txt', { type: 'text/plain' })),
      makeParams('1'),
    );
    const body = await res.json();
    expect(body.data.userName).toBeNull();
  });

  it('uploads for non-staff with valid client project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: true }]); // owned project
    getPortalClientMock.mockResolvedValue({ id: 33 });
    uploadToS3Mock.mockResolvedValue({
      url: 'https://s3/x.txt',
      storedFilename: 'x.txt',
      mimeType: 'text/plain',
      fileSize: 5,
    });
    insertReturnQueue.push([{ id: 99 }]);
    const res = await filesRoute.POST(
      makeFileFormRequest(new File(['hi'], 'a.txt', { type: 'text/plain' })),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });

  it('returns 500 on unexpected error during upload', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    uploadToS3Mock.mockRejectedValue(new Error('s3 down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await filesRoute.POST(
      makeFileFormRequest(new File(['hi'], 'a.txt', { type: 'text/plain' })),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Upload failed');
  });
});

// ===========================================================================
// labels/route.ts
// ===========================================================================

describe('POST /api/portal/cards/[id]/labels', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await labelsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/labels', 'POST', { labelId: 7 }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]);
    const res = await labelsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/labels', 'POST', { labelId: 7 }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-staff with no portal client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    getPortalClientMock.mockResolvedValue(null);
    const res = await labelsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/labels', 'POST', { labelId: 7 }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-staff with public project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]); // public
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await labelsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/labels', 'POST', { labelId: 7 }),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when labelId is not a number', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    const res = await labelsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/labels', 'POST', { labelId: 'abc' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/labelId required/i);
  });

  it('returns 400 when label does not belong to the same project', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 7, projectId: 99, name: 'Bug', color: '#f00' }]); // label in other project
    const res = await labelsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/labels', 'POST', { labelId: 7 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/not in this project/i);
  });

  it('returns 400 when label is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // no label
    const res = await labelsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/labels', 'POST', { labelId: 7 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('inserts label and logs activity', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 7, projectId: 5, name: 'Bug', color: '#f00' }]); // label
    const res = await labelsRoute.POST(
      makeJsonRequest('http://x/api/portal/cards/1/labels', 'POST', { labelId: 7 }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(insertCalls.some((c) => c.table === 'kanbanCardLabels')).toBe(true);
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.label_added',
      { labelId: 7, name: 'Bug', color: '#f00' },
    );
  });
});

describe('DELETE /api/portal/cards/[id]/labels', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await labelsRoute.DELETE(
      new Request('http://x/api/portal/cards/1/labels?labelId=7', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]);
    const res = await labelsRoute.DELETE(
      new Request('http://x/api/portal/cards/1/labels?labelId=7', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-staff with public project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33, isPrivate: false }]); // public
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await labelsRoute.DELETE(
      new Request('http://x/api/portal/cards/1/labels?labelId=7', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when labelId query param is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    const res = await labelsRoute.DELETE(
      new Request('http://x/api/portal/cards/1/labels', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('deletes and logs label_removed when label is found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 7, projectId: 5, name: 'Bug' }]); // label exists
    const res = await labelsRoute.DELETE(
      new Request('http://x/api/portal/cards/1/labels?labelId=7', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls.some((d) => d.table === 'kanbanCardLabels')).toBe(true);
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.label_removed',
      { labelId: 7, name: 'Bug' },
    );
  });

  it('deletes without logging when label record is gone', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // label not found
    const res = await labelsRoute.DELETE(
      new Request('http://x/api/portal/cards/1/labels?labelId=7', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls.some((d) => d.table === 'kanbanCardLabels')).toBe(true);
    expect(logCardActivityMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// move/route.ts
// ===========================================================================

describe('PATCH /api/portal/cards/[id]/move', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 2, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when card not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // card lookup
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 2, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Card not found');
  });

  it('returns 400 when destination column is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, columnId: 10 }]); // card
    selectQueue.push([]); // dest col not found
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 99, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when destination column belongs to a different project', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, columnId: 10 }]); // card
    selectQueue.push([{ id: 99, projectId: 88 }]); // cross-project col
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 99, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/not in this project/i);
  });

  it('returns 403 for non-staff when client lookup fails', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, columnId: 10 }]); // card
    selectQueue.push([{ id: 11, projectId: 5 }]); // dest col same project
    getPortalClientMock.mockResolvedValue(null);
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 11, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-staff when project not owned by client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, columnId: 10 }]); // card
    selectQueue.push([{ id: 11, projectId: 5 }]); // dest col
    selectQueue.push([]); // project lookup empty
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 11, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(403);
  });

  it('moves card across columns and logs column_changed for staff', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, columnId: 10 }]); // card original
    selectQueue.push([{ id: 11, projectId: 5 }]); // dest col same project
    updateReturnQueue.push([{ id: 1, columnId: 11, order: 1 }]);
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 11, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.columnId).toBe(11);
    expect(logCardActivityMock).toHaveBeenCalledWith(
      1,
      7,
      'card.column_changed',
      { from: 10, to: 11 },
    );
    expect(updateCalls[0].patch).toMatchObject({ columnId: 11, order: 1 });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('does not log column_changed when reorder within the same column', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, columnId: 10 }]); // card original col 10
    selectQueue.push([{ id: 10, projectId: 5 }]); // dest col same as before
    updateReturnQueue.push([{ id: 1, columnId: 10, order: 5 }]);
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 10, order: 5 }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const colChange = logCardActivityMock.mock.calls.find((c) => c[2] === 'card.column_changed');
    expect(colChange).toBeUndefined();
  });

  it('allows non-staff with owned private project to move', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, columnId: 10 }]); // card
    selectQueue.push([{ id: 11, projectId: 5 }]); // dest col
    selectQueue.push([{ id: 5, clientId: 33 }]); // project owned by client
    getPortalClientMock.mockResolvedValue({ id: 33 });
    updateReturnQueue.push([{ id: 1, columnId: 11 }]);
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 11, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });

  it('allows employee role to move (no client lookup)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 1, projectId: 5, columnId: 10 }]); // card
    selectQueue.push([{ id: 11, projectId: 5 }]); // dest col
    updateReturnQueue.push([{ id: 1, columnId: 11 }]);
    const res = await moveRoute.PATCH(
      makeJsonRequest('http://x/api/portal/cards/1/move', 'PATCH', { columnId: 11, order: 1 }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });
});
