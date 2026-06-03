// @vitest-environment node
/**
 * Batch 31b — unit tests for 4 portal email route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/email/render-preview/route.ts        (POST)
 *  - app/api/portal/email/segments/[id]/route.ts         (PATCH, DELETE)
 *  - app/api/portal/email/segments/route.ts              (GET, POST)
 *  - app/api/portal/email/subscribers/route.ts           (POST, PUT, DELETE)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update/delete are mocked to capture
 * writes and emit the next queued return rows. authorizePortal + isAuthError
 * are mocked so service-subscription gating doesn't reach into the database.
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

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn((r: unknown) =>
  Boolean(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>)),
);
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

const renderBlocksToEmailHtmlMock = vi.fn();
const buildCampaignHtmlMock = vi.fn();
const generateUnsubscribeTokenMock = vi.fn();
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: (...args: unknown[]) => renderBlocksToEmailHtmlMock(...args),
  buildCampaignHtml: (...args: unknown[]) => buildCampaignHtmlMock(...args),
  generateUnsubscribeToken: (...args: unknown[]) => generateUnsubscribeTokenMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables
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
    emailSegments: wrap('emailSegments'),
    emailLists: wrap('emailLists'),
    emailSubscribers: wrap('emailSubscribers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  onConflictDoNothing?: boolean;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface DeleteCall {
  table: string;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

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
            const rows = updateReturnQueue.shift() ?? [];
            const cloned = rows.map((r) => ({ ...r }));
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: cloned });
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
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return {
          returning() {
            return Promise.resolve([]);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        const call: InsertCall = { table: table.__table, values: v };
        insertCalls.push(call);
        const rows = insertReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        const tail = {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
          },
        };
        return {
          ...tail,
          onConflictDoNothing() {
            call.onConflictDoNothing = true;
            return tail;
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

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const renderPreviewRoute = await import('@/app/api/portal/email/render-preview/route');
const segmentsIdRoute = await import('@/app/api/portal/email/segments/[id]/route');
const segmentsRoute = await import('@/app/api/portal/email/segments/route');
const subscribersRoute = await import('@/app/api/portal/email/subscribers/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// NextRequest-like: render-preview route reads req.json()
function makeNextJsonReq(url: string, body: unknown) {
  const r = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r as unknown as import('next/server').NextRequest;
}

import { NextResponse } from 'next/server';

const SESSION = { user: { id: '7' } };

function setOk(client = { id: 5 }) {
  // authorizePortal returns a success ({ client, userId, role }) — NOT a `response` envelope
  authorizePortalMock.mockResolvedValue({ client, userId: 7, role: 'owner' });
  authMock.mockResolvedValue(SESSION);
  getPortalClientMock.mockResolvedValue(client);
}

function setAuthFail(status = 401) {
  const response = NextResponse.json({ success: false, message: 'Unauthorized' }, { status });
  authorizePortalMock.mockResolvedValue({ response });
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  renderBlocksToEmailHtmlMock.mockReset();
  buildCampaignHtmlMock.mockReset();
  generateUnsubscribeTokenMock.mockReset();
});

// ===========================================================================
// POST /api/portal/email/render-preview
// ===========================================================================

describe('POST /api/portal/email/render-preview', () => {
  it('returns auth error when authorizePortal blocks the request', async () => {
    setAuthFail(403);
    const res = await renderPreviewRoute.POST(
      makeNextJsonReq('http://x/api/portal/email/render-preview', { blockContent: { blocks: [] } }),
    );
    expect(res.status).toBe(403);
    expect(renderBlocksToEmailHtmlMock).not.toHaveBeenCalled();
    expect(buildCampaignHtmlMock).not.toHaveBeenCalled();
  });

  it('returns 400 when blockContent.blocks is missing', async () => {
    setOk();
    const res = await renderPreviewRoute.POST(
      makeNextJsonReq('http://x/api/portal/email/render-preview', { blockContent: {} }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/blocks is required/i);
  });

  it('returns 400 when blockContent itself is missing', async () => {
    setOk();
    const res = await renderPreviewRoute.POST(
      makeNextJsonReq('http://x/api/portal/email/render-preview', {}),
    );
    expect(res.status).toBe(400);
  });

  it('renders blocks, builds campaign html, and returns success', async () => {
    setOk();
    renderBlocksToEmailHtmlMock.mockReturnValue('<p>inner</p>');
    buildCampaignHtmlMock.mockReturnValue('<html><body><p>inner</p></body></html>');

    const blocks = [{ type: 'text', content: 'hi' }];
    const previewText = 'preview snippet';
    const res = await renderPreviewRoute.POST(
      makeNextJsonReq('http://x/api/portal/email/render-preview', {
        blockContent: { blocks, previewText },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.html).toBe('<html><body><p>inner</p></body></html>');
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalledWith(blocks);
    expect(buildCampaignHtmlMock).toHaveBeenCalledWith('<p>inner</p>', '#', previewText);
  });

  it('forwards undefined previewText when not provided', async () => {
    setOk();
    renderBlocksToEmailHtmlMock.mockReturnValue('inner');
    buildCampaignHtmlMock.mockReturnValue('full');
    const res = await renderPreviewRoute.POST(
      makeNextJsonReq('http://x/api/portal/email/render-preview', {
        blockContent: { blocks: [{}] },
      }),
    );
    expect(res.status).toBe(200);
    expect(buildCampaignHtmlMock).toHaveBeenCalledWith('inner', '#', undefined);
  });
});

// ===========================================================================
// PATCH /api/portal/email/segments/[id]
// ===========================================================================

describe('PATCH /api/portal/email/segments/[id]', () => {
  it('returns auth error from authorizePortal', async () => {
    setAuthFail(401);
    const res = await segmentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/segments/4', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when no session even if authorizePortal passes', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(null);
    const res = await segmentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/segments/4', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await segmentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/segments/4', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when no matching segment was updated', async () => {
    setOk();
    // updateReturnQueue empty → returning() yields []
    const res = await segmentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/segments/4', 'PATCH', { name: 'New' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/segment not found/i);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('emailSegments');
    expect(updateCalls[0].patch.name).toBe('New');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('updates only fields that are provided (name)', async () => {
    setOk();
    updateReturnQueue.push([{ id: 4, name: 'Renamed', clientId: 5 }]);
    const res = await segmentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/segments/4', 'PATCH', { name: 'Renamed' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(4);
    const patch = updateCalls[0].patch;
    expect(patch.name).toBe('Renamed');
    expect(patch).not.toHaveProperty('description');
    expect(patch).not.toHaveProperty('rules');
    expect(patch).not.toHaveProperty('matchType');
  });

  it('updates all fields when all are provided (and accepts null/empty)', async () => {
    setOk();
    updateReturnQueue.push([{ id: 4 }]);
    const res = await segmentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/segments/4', 'PATCH', {
        name: 'Seg',
        description: null,
        rules: [{ field: 'email', op: 'contains', value: '@x' }],
        matchType: 'any',
      }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.name).toBe('Seg');
    expect(patch.description).toBeNull();
    expect(patch.rules).toEqual([{ field: 'email', op: 'contains', value: '@x' }]);
    expect(patch.matchType).toBe('any');
  });
});

// ===========================================================================
// DELETE /api/portal/email/segments/[id]
// ===========================================================================

describe('DELETE /api/portal/email/segments/[id]', () => {
  it('returns auth error from authorizePortal', async () => {
    setAuthFail(403);
    const res = await segmentsIdRoute.DELETE(
      makeReq('http://x/api/portal/email/segments/4', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(null);
    const res = await segmentsIdRoute.DELETE(
      makeReq('http://x/api/portal/email/segments/4', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await segmentsIdRoute.DELETE(
      makeReq('http://x/api/portal/email/segments/4', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(404);
  });

  it('deletes the segment and returns success', async () => {
    setOk();
    const res = await segmentsIdRoute.DELETE(
      makeReq('http://x/api/portal/email/segments/4', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '4' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('emailSegments');
  });
});

// ===========================================================================
// GET /api/portal/email/segments
// ===========================================================================

describe('GET /api/portal/email/segments', () => {
  it('returns auth error from authorizePortal', async () => {
    setAuthFail(403);
    const res = await segmentsRoute.GET();
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(null);
    const res = await segmentsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await segmentsRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of segments for the client', async () => {
    setOk();
    selectQueue.push([
      { id: 1, name: 'Active' },
      { id: 2, name: 'Churned' },
    ]);
    const res = await segmentsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Active');
  });

  it('returns an empty array when no segments exist', async () => {
    setOk();
    selectQueue.push([]);
    const res = await segmentsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/email/segments
// ===========================================================================

describe('POST /api/portal/email/segments', () => {
  it('returns auth error from authorizePortal', async () => {
    setAuthFail(401);
    const res = await segmentsRoute.POST(
      makeJsonReq('http://x/api/portal/email/segments', 'POST', { name: 'x' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when no session', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(null);
    const res = await segmentsRoute.POST(
      makeJsonReq('http://x/api/portal/email/segments', 'POST', { name: 'x' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await segmentsRoute.POST(
      makeJsonReq('http://x/api/portal/email/segments', 'POST', { name: 'x' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    setOk();
    const res = await segmentsRoute.POST(
      makeJsonReq('http://x/api/portal/email/segments', 'POST', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name is required/i);
  });

  it('returns 400 when name is whitespace only', async () => {
    setOk();
    const res = await segmentsRoute.POST(
      makeJsonReq('http://x/api/portal/email/segments', 'POST', { name: '   ' }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a segment with defaults (rules=[], matchType=all, description=null)', async () => {
    setOk();
    insertReturnQueue.push([{ id: 11, name: 'New seg', clientId: 5 }]);
    const res = await segmentsRoute.POST(
      makeJsonReq('http://x/api/portal/email/segments', 'POST', { name: '  New seg  ' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(11);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('emailSegments');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.clientId).toBe(5);
    expect(v.name).toBe('New seg');
    expect(v.description).toBeNull();
    expect(v.rules).toEqual([]);
    expect(v.matchType).toBe('all');
  });

  it('creates a segment honoring all fields', async () => {
    setOk();
    insertReturnQueue.push([{ id: 12 }]);
    const res = await segmentsRoute.POST(
      makeJsonReq('http://x/api/portal/email/segments', 'POST', {
        name: 'Seg',
        description: '  some desc  ',
        rules: [{ field: 'tag', op: 'eq', value: 'vip' }],
        matchType: 'any',
      }),
    );
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.description).toBe('some desc');
    expect(v.rules).toEqual([{ field: 'tag', op: 'eq', value: 'vip' }]);
    expect(v.matchType).toBe('any');
  });

  it('treats empty description string as null', async () => {
    setOk();
    insertReturnQueue.push([{ id: 13 }]);
    const res = await segmentsRoute.POST(
      makeJsonReq('http://x/api/portal/email/segments', 'POST', {
        name: 'X',
        description: '   ',
      }),
    );
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.description).toBeNull();
  });
});

// ===========================================================================
// POST /api/portal/email/subscribers (single subscribe)
// ===========================================================================

describe('POST /api/portal/email/subscribers', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await subscribersRoute.POST(
      makeJsonReq('http://x/api/portal/email/subscribers', 'POST', {
        listId: 1,
        email: 'a@b.com',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await subscribersRoute.POST(
      makeJsonReq('http://x/api/portal/email/subscribers', 'POST', {
        listId: 1,
        email: 'a@b.com',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when listId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await subscribersRoute.POST(
      makeJsonReq('http://x/api/portal/email/subscribers', 'POST', { email: 'a@b.com' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/listId and email required/i);
  });

  it('returns 400 when email is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await subscribersRoute.POST(
      makeJsonReq('http://x/api/portal/email/subscribers', 'POST', { listId: 1, email: '   ' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when list does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // ownsList query → empty
    const res = await subscribersRoute.POST(
      makeJsonReq('http://x/api/portal/email/subscribers', 'POST', {
        listId: 1,
        email: 'a@b.com',
      }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/List not found/);
  });

  it('returns 409 when subscriber already exists for this list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // ownsList → owns
    selectQueue.push([{ id: 99 }]); // existing subscriber
    const res = await subscribersRoute.POST(
      makeJsonReq('http://x/api/portal/email/subscribers', 'POST', {
        listId: 1,
        email: 'a@b.com',
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already subscribed/i);
  });

  it('creates a new subscriber and lowercases email + trims name', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // ownsList → owns
    selectQueue.push([]); // no existing
    insertReturnQueue.push([{ id: 100, email: 'a@b.com', name: 'Alice', listId: 1 }]);
    generateUnsubscribeTokenMock.mockReturnValue('UNSUB-TOK');

    const res = await subscribersRoute.POST(
      makeJsonReq('http://x/api/portal/email/subscribers', 'POST', {
        listId: 1,
        email: '  A@B.com ',
        name: '  Alice  ',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(100);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('emailSubscribers');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.listId).toBe(1);
    expect(v.email).toBe('a@b.com');
    expect(v.name).toBe('Alice');
    expect(v.unsubscribeToken).toBe('UNSUB-TOK');
  });

  it('accepts subscriber without a name (name becomes null)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]);
    selectQueue.push([]);
    insertReturnQueue.push([{ id: 101 }]);
    generateUnsubscribeTokenMock.mockReturnValue('TOK2');
    const res = await subscribersRoute.POST(
      makeJsonReq('http://x/api/portal/email/subscribers', 'POST', {
        listId: '7',
        email: 'noName@x.com',
      }),
    );
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.listId).toBe(7);
    expect(v.email).toBe('noname@x.com');
    expect(v.name).toBeNull();
  });
});

// ===========================================================================
// PUT /api/portal/email/subscribers (bulk import)
// ===========================================================================

describe('PUT /api/portal/email/subscribers', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await subscribersRoute.PUT(
      makeJsonReq('http://x/api/portal/email/subscribers', 'PUT', {
        listId: 1,
        subscribers: [],
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when listId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await subscribersRoute.PUT(
      makeJsonReq('http://x/api/portal/email/subscribers', 'PUT', { subscribers: [] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/listId and subscribers required/i);
  });

  it('returns 400 when subscribers is not an array', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await subscribersRoute.PUT(
      makeJsonReq('http://x/api/portal/email/subscribers', 'PUT', {
        listId: 1,
        subscribers: 'nope',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when client does not own the list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // ownsList → empty
    const res = await subscribersRoute.PUT(
      makeJsonReq('http://x/api/portal/email/subscribers', 'PUT', {
        listId: 1,
        subscribers: [{ email: 'a@b.com' }],
      }),
    );
    expect(res.status).toBe(404);
  });

  it('filters out invalid emails and imports the rest', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // ownsList → owns
    // 3 valid rows expected to insert
    insertReturnQueue.push([{ id: 1 }, { id: 2 }, { id: 3 }]);
    generateUnsubscribeTokenMock
      .mockReturnValueOnce('t1')
      .mockReturnValueOnce('t2')
      .mockReturnValueOnce('t3');

    const res = await subscribersRoute.PUT(
      makeJsonReq('http://x/api/portal/email/subscribers', 'PUT', {
        listId: 1,
        subscribers: [
          { email: 'A@b.com', name: '  A ' },
          { email: 'bad-no-at' }, // filtered
          { email: 'c@d.com' },
          { email: '' }, // filtered
          { email: 'e@f.com', name: 'E' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.imported).toBe(3);
    expect(body.data.total).toBe(3);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].onConflictDoNothing).toBe(true);
    const rows = insertCalls[0].values as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows[0].email).toBe('a@b.com');
    expect(rows[0].name).toBe('A');
    expect(rows[0].listId).toBe(1);
    expect(rows[0].unsubscribeToken).toBe('t1');
    expect(rows[1].email).toBe('c@d.com');
    expect(rows[1].name).toBeNull();
    expect(rows[2].email).toBe('e@f.com');
  });

  it('imports 0 rows when all emails are invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]);
    insertReturnQueue.push([]);
    const res = await subscribersRoute.PUT(
      makeJsonReq('http://x/api/portal/email/subscribers', 'PUT', {
        listId: 1,
        subscribers: [{ email: 'no-at' }, { email: '' }],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(0);
    expect(body.data.total).toBe(0);
  });
});

// ===========================================================================
// DELETE /api/portal/email/subscribers?id=
// ===========================================================================

describe('DELETE /api/portal/email/subscribers', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await subscribersRoute.DELETE(
      makeReq('http://x/api/portal/email/subscribers?id=9', { method: 'DELETE' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when id query param is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await subscribersRoute.DELETE(
      makeReq('http://x/api/portal/email/subscribers', { method: 'DELETE' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/id required/);
  });

  it('returns 404 when subscriber does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // lookup subscriber → empty
    const res = await subscribersRoute.DELETE(
      makeReq('http://x/api/portal/email/subscribers?id=9', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when subscriber exists but client does not own that list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ listId: 42 }]); // subscriber lookup
    selectQueue.push([]); // ownsList → empty
    const res = await subscribersRoute.DELETE(
      makeReq('http://x/api/portal/email/subscribers?id=9', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the subscriber and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ listId: 42 }]); // subscriber lookup
    selectQueue.push([{ id: 42 }]); // ownsList → owns
    const res = await subscribersRoute.DELETE(
      makeReq('http://x/api/portal/email/subscribers?id=9', { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('emailSubscribers');
  });
});
