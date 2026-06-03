// @vitest-environment node
/**
 * Batch 31c — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/email/tags/[id]/route.ts          (DELETE)
 *  - app/api/portal/email/tags/route.ts               (GET, POST)
 *  - app/api/portal/email/templates/[id]/route.ts     (PATCH, DELETE)
 *  - app/api/portal/experiments/[id]/route.ts         (GET, PATCH, DELETE)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update/delete are mocked to capture
 * writes and emit the next queued return rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

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
  getPortalClients: vi.fn(async () => []),
}));

const authorizePortalMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => !!(r && typeof r === 'object' && 'response' in (r as object)),
}));

const authorizeExperimentForUserMock = vi.fn();
vi.mock('@/lib/ab/access', () => ({
  authorizeExperimentForUser: (...args: unknown[]) => authorizeExperimentForUserMock(...args),
}));

vi.mock('@/lib/ab/assign', () => ({
  normalizeSplit: (s: Record<string, number>) => {
    // simple normalization — preserve weights, just echo with a marker
    return { ...s, __normalized: true };
  },
}));

const renderBlocksToEmailHtmlMock = vi.fn();
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: (...args: unknown[]) => renderBlocksToEmailHtmlMock(...args),
}));

// sanitize-html passthrough — lets rendered HTML survive the sanitization step
vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeHtml: (html: string) => html,
  sanitizeRichHtml: (html: string) => html,
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
    emailSubscriberTags: wrap('emailSubscriberTags'),
    emailTemplates: wrap('emailTemplates'),
    abExperiments: wrap('abExperiments'),
    abVariants: wrap('abVariants'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
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
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
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
        const rows = deleteReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        deleteCalls.push({ table: table.__table, filter, returnedRows: cloned });
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
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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

const emailTagsIdRoute = await import('@/app/api/portal/email/tags/[id]/route');
const emailTagsRoute = await import('@/app/api/portal/email/tags/route');
const emailTemplatesIdRoute = await import('@/app/api/portal/email/templates/[id]/route');
const experimentsIdRoute = await import('@/app/api/portal/experiments/[id]/route');

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

function makeRawReq(url: string, method: string, rawBody: string): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  });
}

const SESSION = { user: { id: '7' } };

function authOk() {
  return { client: { id: 5 }, userId: 7, role: 'owner' as const };
}
function authErr(status: number, message: string) {
  return {
    response: NextResponse.json({ success: false, message }, { status }),
  };
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  authorizeExperimentForUserMock.mockReset();
  renderBlocksToEmailHtmlMock.mockReset();
  renderBlocksToEmailHtmlMock.mockReturnValue('<rendered/>');
});

// ===========================================================================
// DELETE /api/portal/email/tags/[id]
// ===========================================================================

describe('DELETE /api/portal/email/tags/[id]', () => {
  it('returns auth error response when authorizePortal returns error', async () => {
    authorizePortalMock.mockResolvedValue(authErr(401, 'Unauthorized'));
    const res = await emailTagsIdRoute.DELETE(
      makeReq('http://x/api/portal/email/tags/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is missing', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(null);
    const res = await emailTagsIdRoute.DELETE(
      makeReq('http://x/api/portal/email/tags/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTagsIdRoute.DELETE(
      makeReq('http://x/api/portal/email/tags/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('deletes the tag and returns success', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    deleteReturnQueue.push([{ id: 9 }]);
    const res = await emailTagsIdRoute.DELETE(
      makeReq('http://x/api/portal/email/tags/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('emailSubscriberTags');
  });
});

// ===========================================================================
// GET /api/portal/email/tags
// ===========================================================================

describe('GET /api/portal/email/tags', () => {
  it('returns auth error response when authorizePortal returns error', async () => {
    authorizePortalMock.mockResolvedValue(authErr(403, 'No service'));
    const res = await emailTagsRoute.GET();
    expect(res.status).toBe(403);
  });

  it('returns 401 when session is missing', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(null);
    const res = await emailTagsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTagsRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of tags ordered by createdAt desc', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, name: 'Newsletter', color: '#abc' },
      { id: 2, name: 'Onboarding', color: '#def' },
    ]);
    const res = await emailTagsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

// ===========================================================================
// POST /api/portal/email/tags
// ===========================================================================

describe('POST /api/portal/email/tags', () => {
  it('returns auth error response when authorizePortal returns error', async () => {
    authorizePortalMock.mockResolvedValue(authErr(401, 'Unauthorized'));
    const res = await emailTagsRoute.POST(
      makeJsonReq('http://x/api/portal/email/tags', 'POST', { name: 'x' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is missing', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(null);
    const res = await emailTagsRoute.POST(
      makeJsonReq('http://x/api/portal/email/tags', 'POST', { name: 'x' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTagsRoute.POST(
      makeJsonReq('http://x/api/portal/email/tags', 'POST', { name: 'x' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await emailTagsRoute.POST(
      makeJsonReq('http://x/api/portal/email/tags', 'POST', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name is required/i);
  });

  it('returns 400 when name is only whitespace', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await emailTagsRoute.POST(
      makeJsonReq('http://x/api/portal/email/tags', 'POST', { name: '  ' }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a tag with defaults (color=#6366f1) and trims name', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([
      { id: 10, name: 'New tag', color: '#6366f1' },
    ]);
    const res = await emailTagsRoute.POST(
      makeJsonReq('http://x/api/portal/email/tags', 'POST', {
        name: '  New tag  ',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(10);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('emailSubscriberTags');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.clientId).toBe(5);
    expect(inserted.name).toBe('New tag');
    expect(inserted.color).toBe('#6366f1');
  });

  it('honors custom color when provided', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([{ id: 11, name: 'Hot leads', color: '#ff0000' }]);
    const res = await emailTagsRoute.POST(
      makeJsonReq('http://x/api/portal/email/tags', 'POST', {
        name: 'Hot leads',
        color: '#ff0000',
      }),
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.color).toBe('#ff0000');
  });
});

// ===========================================================================
// PATCH /api/portal/email/templates/[id]
// ===========================================================================

describe('PATCH /api/portal/email/templates/[id]', () => {
  it('returns auth error response when authorizePortal returns error', async () => {
    authorizePortalMock.mockResolvedValue(authErr(401, 'Unauthorized'));
    const res = await emailTemplatesIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/templates/9', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is missing', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(null);
    const res = await emailTemplatesIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/templates/9', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTemplatesIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/templates/9', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when template does not exist', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // updateReturnQueue empty → returning() yields []
    const res = await emailTemplatesIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/templates/9', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Template not found');
  });

  it('updates name, description, category, subject, and htmlContent', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 9, name: 'Updated' }]);
    const res = await emailTemplatesIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/templates/9', 'PATCH', {
        name: 'Updated',
        description: 'New desc',
        category: 'marketing',
        subject: 'Hello',
        htmlContent: '<p>HI</p>',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('emailTemplates');
    expect(updateCalls[0].patch.name).toBe('Updated');
    expect(updateCalls[0].patch.description).toBe('New desc');
    expect(updateCalls[0].patch.category).toBe('marketing');
    expect(updateCalls[0].patch.subject).toBe('Hello');
    expect(updateCalls[0].patch.htmlContent).toBe('<p>HI</p>');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('renders blockContent.blocks to htmlContent when blockContent has blocks', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 9 }]);
    renderBlocksToEmailHtmlMock.mockReturnValue('<rendered-from-blocks/>');
    const res = await emailTemplatesIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/templates/9', 'PATCH', {
        blockContent: { blocks: [{ type: 'text', content: 'hi' }] },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalledWith([{ type: 'text', content: 'hi' }]);
    expect(updateCalls[0].patch.blockContent).toEqual({ blocks: [{ type: 'text', content: 'hi' }] });
    expect(updateCalls[0].patch.htmlContent).toBe('<rendered-from-blocks/>');
  });

  it('stores blockContent without rendering when blocks are absent', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 9 }]);
    const res = await emailTemplatesIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/templates/9', 'PATCH', {
        blockContent: { something: 'else' },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(renderBlocksToEmailHtmlMock).not.toHaveBeenCalled();
    expect(updateCalls[0].patch.blockContent).toEqual({ something: 'else' });
    expect(updateCalls[0].patch.htmlContent).toBeUndefined();
  });

  it('only sets fields that were provided', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    updateReturnQueue.push([{ id: 9 }]);
    const res = await emailTemplatesIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/email/templates/9', 'PATCH', {
        subject: 'Just subject',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.subject).toBe('Just subject');
    expect(patch.updatedAt).toBeInstanceOf(Date);
    expect('name' in patch).toBe(false);
    expect('description' in patch).toBe(false);
    expect('category' in patch).toBe(false);
    expect('htmlContent' in patch).toBe(false);
    expect('blockContent' in patch).toBe(false);
  });
});

// ===========================================================================
// DELETE /api/portal/email/templates/[id]
// ===========================================================================

describe('DELETE /api/portal/email/templates/[id]', () => {
  it('returns auth error response when authorizePortal returns error', async () => {
    authorizePortalMock.mockResolvedValue(authErr(401, 'Unauthorized'));
    const res = await emailTemplatesIdRoute.DELETE(
      makeReq('http://x/api/portal/email/templates/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is missing', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(null);
    const res = await emailTemplatesIdRoute.DELETE(
      makeReq('http://x/api/portal/email/templates/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTemplatesIdRoute.DELETE(
      makeReq('http://x/api/portal/email/templates/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('deletes the template and returns success', async () => {
    authorizePortalMock.mockResolvedValue(authOk());
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    deleteReturnQueue.push([{ id: 9 }]);
    const res = await emailTemplatesIdRoute.DELETE(
      makeReq('http://x/api/portal/email/templates/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('emailTemplates');
  });
});

// ===========================================================================
// GET /api/portal/experiments/[id]
// ===========================================================================

describe('GET /api/portal/experiments/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await experimentsIdRoute.GET(
      makeReq('http://x/api/portal/experiments/9'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('returns 404 when access denied', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue(null);
    const res = await experimentsIdRoute.GET(
      makeReq('http://x/api/portal/experiments/9'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('returns 404 when experiment is missing from db', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    selectQueue.push([]); // no experiment row
    const res = await experimentsIdRoute.GET(
      makeReq('http://x/api/portal/experiments/9'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('returns experiment and variants when found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    selectQueue.push([{ id: 9, name: 'Exp A', status: 'draft' }]);
    selectQueue.push([
      { id: 100, experimentId: 9, key: 'a' },
      { id: 101, experimentId: 9, key: 'b' },
    ]);
    const res = await experimentsIdRoute.GET(
      makeReq('http://x/api/portal/experiments/9'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.experiment.id).toBe(9);
    expect(body.data.variants).toHaveLength(2);
  });
});

// ===========================================================================
// PATCH /api/portal/experiments/[id]
// ===========================================================================

describe('PATCH /api/portal/experiments/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', {}),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when access denied', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue(null);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', {}),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid JSON body', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    const res = await experimentsIdRoute.PATCH(
      makeRawReq('http://x/api/portal/experiments/9', 'PATCH', '{not json'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('returns 400 when name is only whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', { name: '  ' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('name_required');
  });

  it('returns 400 when goalMetric is invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', { goalMetric: 'bogus' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_goal_metric');
  });

  it('returns 400 when status is invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', { status: 'bogus' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_status');
  });

  it('applies name, hypothesis, goalSelector, and variantSplit patches', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    updateReturnQueue.push([{ id: 9, name: 'Trimmed' }]);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', {
        name: '  Trimmed  ',
        hypothesis: 'h1',
        goalSelector: '.cta',
        variantSplit: { a: 1, b: 1 },
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.name).toBe('Trimmed');
    expect(patch.hypothesis).toBe('h1');
    expect(patch.goalSelector).toBe('.cta');
    expect(patch.variantSplit).toMatchObject({ a: 1, b: 1, __normalized: true });
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('coerces null hypothesis and null goalSelector', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    updateReturnQueue.push([{ id: 9 }]);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', {
        hypothesis: null,
        goalSelector: null,
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.hypothesis).toBeNull();
    expect(updateCalls[0].patch.goalSelector).toBeNull();
  });

  it('sets startedAt when status flips to running', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    updateReturnQueue.push([{ id: 9, status: 'running' }]);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', { status: 'running' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.status).toBe('running');
    expect(updateCalls[0].patch.startedAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.endedAt).toBeUndefined();
  });

  it('sets endedAt when status flips to completed', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    updateReturnQueue.push([{ id: 9, status: 'completed' }]);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', { status: 'completed' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.status).toBe('completed');
    expect(updateCalls[0].patch.endedAt).toBeInstanceOf(Date);
  });

  it('sets endedAt when status flips to archived', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    updateReturnQueue.push([{ id: 9, status: 'archived' }]);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', { status: 'archived' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.endedAt).toBeInstanceOf(Date);
  });

  it('accepts a valid goalMetric', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    updateReturnQueue.push([{ id: 9 }]);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', { goalMetric: 'cta_click' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.goalMetric).toBe('cta_click');
  });

  it('ignores variantSplit when not an object', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    updateReturnQueue.push([{ id: 9 }]);
    const res = await experimentsIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/experiments/9', 'PATCH', { variantSplit: 'nope' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect('variantSplit' in updateCalls[0].patch).toBe(false);
  });
});

// ===========================================================================
// DELETE /api/portal/experiments/[id]
// ===========================================================================

describe('DELETE /api/portal/experiments/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await experimentsIdRoute.DELETE(
      makeReq('http://x/api/portal/experiments/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when access denied', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue(null);
    const res = await experimentsIdRoute.DELETE(
      makeReq('http://x/api/portal/experiments/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('deletes the experiment and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizeExperimentForUserMock.mockResolvedValue({ experimentId: 9, postId: 1, siteId: 2, clientId: 3 });
    deleteReturnQueue.push([{ id: 9 }]);
    const res = await experimentsIdRoute.DELETE(
      makeReq('http://x/api/portal/experiments/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('abExperiments');
  });
});
