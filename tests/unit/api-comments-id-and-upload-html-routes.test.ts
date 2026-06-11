// @vitest-environment node
/**
 * Unit tests for two unrelated portal routes packed into one file:
 *
 *  1. PATCH / DELETE /api/portal/realtime/comments/[id]
 *     - Author-only body / anchor edits
 *     - Resolve / unresolve applied to thread root (any tenant member)
 *     - Author-only delete; root delete cascades the thread
 *
 *  2. POST /api/portal/cms/websites/[siteId]/posts/upload-html
 *     - Role gate (admin / editor / employee)
 *     - HTML vs ZIP branching, mime + size validation
 *     - Slug collision -> numeric suffix
 *     - Inserts media rows + posts row with an html-embed block
 *
 * Everything external (auth, db, drizzle, portal client, S3, html helpers,
 * zip unpacker) is mocked. No network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Shared schema + drizzle mocks
// ===========================================================================

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
    posts: wrap('posts'),
    media: wrap('media'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('@/lib/db/schema/collab', () => ({}));

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

// ===========================================================================
// Shared auth + portal-client mocks
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

// ===========================================================================
// Upload-html dependency mocks
// ===========================================================================

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

const cleanEmbedHtmlMock = vi.fn((s: string) => s);
vi.mock('@/lib/html-embed-clean', () => ({
  cleanEmbedHtml: (s: string) => cleanEmbedHtmlMock(s),
}));

const importHtmlAssetsMock = vi.fn();
vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: (...args: unknown[]) => importHtmlAssetsMock(...args),
}));

const unpackAndUploadZipMock = vi.fn();
class TestHttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, msg: string) {
    super(msg);
    this.statusCode = statusCode;
  }
}
vi.mock('@/lib/html-zip-upload', () => ({
  unpackAndUploadZip: (...args: unknown[]) => unpackAndUploadZipMock(...args),
  isHttpError: (err: unknown): boolean => err instanceof TestHttpError,
  MAX_ZIP_TOTAL_BYTES: 50 * 1024 * 1024,
}));

// ===========================================================================
// In-memory DB
// ===========================================================================

interface MockState {
  documentComments: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
}

const state: MockState = {
  documentComments: [],
  posts: [],
  media: [],
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
            id: v.id ?? nextId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        const result: Record<string, unknown> = {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(
              onFulfilled,
              onRejected,
            );
          },
        };
        return result;
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setValues: Record<string, unknown> = {};
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      set(vals: Record<string, unknown>) {
        setValues = vals;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      returning() {
        const rows = tableArray(table.__table);
        const updated: Record<string, unknown>[] = [];
        for (const r of rows) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setValues);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated);
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const rows = tableArray(table.__table);
        const updated: Record<string, unknown>[] = [];
        for (const r of rows) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setValues);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildDelete(table: { __table: string }) {
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      where(arg: unknown) {
        filter = arg;
        return runDelete();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runDelete().then(onFulfilled, onRejected);
      },
    };
    function runDelete(): Promise<unknown[]> {
      const rows = tableArray(table.__table);
      const remaining = rows.filter((r) => !evalPredicate(filter, r));
      const removed = rows.length - remaining.length;
      rows.length = 0;
      rows.push(...remaining);
      return Promise.resolve([{ removed }]);
    }
    return chain;
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ===========================================================================
// Modules under test
// ===========================================================================

const commentsId = await import(
  '@/app/api/portal/realtime/comments/[id]/route'
);
const PATCH = commentsId.PATCH;
const DELETE = commentsId.DELETE;

const uploadHtml = await import(
  '@/app/api/portal/cms/websites/[siteId]/posts/upload-html/route'
);
const POST = uploadHtml.POST;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  state.documentComments.length = 0;
  state.posts.length = 0;
  state.media.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
  uploadToS3Mock.mockReset();
  cleanEmbedHtmlMock.mockReset().mockImplementation((s: string) => s);
  importHtmlAssetsMock.mockReset();
  unpackAndUploadZipMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  resolveClientSiteMock.mockResolvedValue({ id: 55 });
});

// ===========================================================================
// PATCH /api/portal/realtime/comments/[id]
// ===========================================================================

function patchParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makePatch(body: unknown): Request {
  return new Request('http://x/api/portal/realtime/comments/c1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRaw(raw: string): Request {
  return new Request('http://x/api/portal/realtime/comments/c1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: raw,
  });
}

describe('PATCH /api/portal/realtime/comments/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await PATCH(makePatch({ body: 'hi' }), patchParams('c1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await PATCH(makePatch({ body: 'hi' }), patchParams('c1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await PATCH(makePatch({ body: 'hi' }), patchParams('c1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when comment row does not exist for this tenant', async () => {
    // No row inserted.
    const res = await PATCH(makePatch({ body: 'hi' }), patchParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when row belongs to another tenant', async () => {
    state.documentComments.push({
      id: 'c1',
      clientId: 99,
      authorId: 7,
      threadId: 'c1',
      parentId: null,
      body: 'x',
    });
    const res = await PATCH(makePatch({ body: 'hi' }), patchParams('c1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid JSON', async () => {
    state.documentComments.push({
      id: 'c1',
      clientId: 10,
      authorId: 7,
      threadId: 'c1',
      parentId: null,
      body: 'x',
    });
    const res = await PATCH(makePatchRaw('not json {{{'), patchParams('c1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid JSON');
  });

  it('returns 403 when non-author tries to edit body', async () => {
    state.documentComments.push({
      id: 'c1',
      clientId: 10,
      authorId: 99, // not us (we are 7)
      threadId: 'c1',
      parentId: null,
      body: 'x',
    });
    const res = await PATCH(makePatch({ body: 'mine now' }), patchParams('c1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/author may edit/);
  });

  it('returns 400 when author submits empty/whitespace body', async () => {
    state.documentComments.push({
      id: 'c1',
      clientId: 10,
      authorId: 7,
      threadId: 'c1',
      parentId: null,
      body: 'x',
    });
    const res = await PATCH(makePatch({ body: '   ' }), patchParams('c1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Comment body required');
  });

  it('returns 403 when non-author tries to move anchor', async () => {
    state.documentComments.push({
      id: 'c1',
      clientId: 10,
      authorId: 99,
      threadId: 'c1',
      parentId: null,
      body: 'x',
    });
    const res = await PATCH(
      makePatch({ anchor: { type: 'block', blockId: 'b' } }),
      patchParams('c1'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/author may move anchor/);
  });

  it('updates body + anchor + mentionedUserIds for the author (trimmed)', async () => {
    state.documentComments.push({
      id: 'c1',
      clientId: 10,
      authorId: 7,
      threadId: 'c1',
      parentId: null,
      body: 'old',
    });
    const res = await PATCH(
      makePatch({
        body: '   new body   ',
        anchor: { type: 'block', blockId: 'b-2' },
        mentionedUserIds: [4],
      }),
      patchParams('c1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.body).toBe('new body');
    expect(body.data.anchor).toEqual({ type: 'block', blockId: 'b-2' });
    expect(body.data.mentionedUserIds).toEqual([4]);
  });

  it('returns the row unchanged when only updatedAt would change (no-op patch)', async () => {
    state.documentComments.push({
      id: 'c1',
      clientId: 10,
      authorId: 7,
      threadId: 'c1',
      parentId: null,
      body: 'still here',
    });
    const res = await PATCH(makePatch({}), patchParams('c1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.body).toBe('still here');
  });

  it('resolve=true applies to the thread root (any tenant member, not just author)', async () => {
    // Root row, authored by someone else
    state.documentComments.push({
      id: 'root-1',
      clientId: 10,
      authorId: 99,
      threadId: 'root-1',
      parentId: null,
      body: 'root',
      resolvedAt: null,
      resolvedBy: null,
    });
    // Reply row owned by current user
    state.documentComments.push({
      id: 'reply-1',
      clientId: 10,
      authorId: 7,
      threadId: 'root-1',
      parentId: 'root-1',
      body: 'reply',
    });
    const res = await PATCH(
      makePatch({ resolved: true }),
      patchParams('reply-1'),
    );
    expect(res.status).toBe(200);
    const root = state.documentComments.find((r) => r.id === 'root-1') as
      | Record<string, unknown>
      | undefined;
    expect(root?.resolvedAt).toBeInstanceOf(Date);
    expect(root?.resolvedBy).toBe(7);
  });

  it('resolve=false clears resolvedAt/resolvedBy on the root', async () => {
    state.documentComments.push({
      id: 'root-1',
      clientId: 10,
      authorId: 7,
      threadId: 'root-1',
      parentId: null,
      body: 'root',
      resolvedAt: new Date(),
      resolvedBy: 7,
    });
    const res = await PATCH(
      makePatch({ resolved: false }),
      patchParams('root-1'),
    );
    expect(res.status).toBe(200);
    const root = state.documentComments[0];
    expect(root.resolvedAt).toBeNull();
    expect(root.resolvedBy).toBeNull();
  });

  it('resolve + body in the same call applies body to self and resolution to root', async () => {
    state.documentComments.push({
      id: 'root-1',
      clientId: 10,
      authorId: 7,
      threadId: 'root-1',
      parentId: null,
      body: 'root',
      resolvedAt: null,
      resolvedBy: null,
    });
    state.documentComments.push({
      id: 'reply-1',
      clientId: 10,
      authorId: 7,
      threadId: 'root-1',
      parentId: 'root-1',
      body: 'reply old',
    });
    const res = await PATCH(
      makePatch({ resolved: true, body: 'reply new' }),
      patchParams('reply-1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // returned row is the self update
    expect(body.data.body).toBe('reply new');
    const root = state.documentComments.find((r) => r.id === 'root-1');
    expect((root as Record<string, unknown>).resolvedBy).toBe(7);
  });
});

// ===========================================================================
// DELETE /api/portal/realtime/comments/[id]
// ===========================================================================

function makeDel(): Request {
  return new Request('http://x/api/portal/realtime/comments/c1', {
    method: 'DELETE',
  });
}

describe('DELETE /api/portal/realtime/comments/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE(makeDel(), patchParams('c1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await DELETE(makeDel(), patchParams('c1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when comment not found for tenant', async () => {
    const res = await DELETE(makeDel(), patchParams('nope'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-author tries to delete', async () => {
    state.documentComments.push({
      id: 'c1',
      clientId: 10,
      authorId: 99,
      threadId: 'c1',
      parentId: null,
      body: 'x',
    });
    const res = await DELETE(makeDel(), patchParams('c1'));
    expect(res.status).toBe(403);
  });

  it('deletes the entire thread when deleting the root (parentId === null)', async () => {
    state.documentComments.push(
      {
        id: 'root-1',
        clientId: 10,
        authorId: 7,
        threadId: 'root-1',
        parentId: null,
        body: 'root',
      },
      {
        id: 'reply-1',
        clientId: 10,
        authorId: 5,
        threadId: 'root-1',
        parentId: 'root-1',
        body: 'reply',
      },
      {
        id: 'reply-2',
        clientId: 10,
        authorId: 5,
        threadId: 'root-1',
        parentId: 'root-1',
        body: 'reply 2',
      },
      // Unrelated thread should NOT be touched
      {
        id: 'other-root',
        clientId: 10,
        authorId: 7,
        threadId: 'other-root',
        parentId: null,
        body: 'other',
      },
    );
    const res = await DELETE(makeDel(), patchParams('root-1'));
    expect(res.status).toBe(200);
    expect(state.documentComments.map((r) => r.id)).toEqual(['other-root']);
  });

  it('deletes just the reply row when deleting a reply (parentId set)', async () => {
    state.documentComments.push(
      {
        id: 'root-1',
        clientId: 10,
        authorId: 7,
        threadId: 'root-1',
        parentId: null,
        body: 'root',
      },
      {
        id: 'reply-1',
        clientId: 10,
        authorId: 7,
        threadId: 'root-1',
        parentId: 'root-1',
        body: 'reply',
      },
    );
    const res = await DELETE(makeDel(), patchParams('reply-1'));
    expect(res.status).toBe(200);
    expect(state.documentComments.map((r) => r.id).sort()).toEqual(['root-1']);
  });
});

// ===========================================================================
// POST /api/portal/cms/websites/[siteId]/posts/upload-html
// ===========================================================================

function siteParams(siteId: string): { params: Promise<{ siteId: string }> } {
  return { params: Promise.resolve({ siteId }) };
}

function makeUploadReq(formData: FormData): Request {
  return new Request('http://x/api/portal/cms/websites/55/posts/upload-html', {
    method: 'POST',
    body: formData,
  });
}

function makeBadFormDataReq(): Request {
  return new Request('http://x/api/portal/cms/websites/55/posts/upload-html', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"not":"multipart"}',
  });
}

describe('POST /api/portal/cms/websites/[siteId]/posts/upload-html — auth + role', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: { role: 'admin' } });
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not admin/editor/employee', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'viewer' } });
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Site not found');
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 when body is not multipart/form-data', async () => {
    const res = await POST(makeBadFormDataReq(), siteParams('55'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/multipart\/form-data/);
  });

  it('returns 400 when file field missing', async () => {
    const fd = new FormData();
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('No file provided');
  });
});

describe('POST upload-html — validation', () => {
  it('rejects non-html / non-zip filenames', async () => {
    const fd = new FormData();
    fd.append('file', new File(['data'], 'malware.exe', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/\.html, \.htm, \.xhtml, or \.zip/);
  });

  it('rejects html-like name with disallowed reported mime', async () => {
    const fd = new FormData();
    fd.append(
      'file',
      new File(['<html/>'], 'a.html', { type: 'application/pdf' }),
    );
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/MIME type/);
  });

  it('rejects html file exceeding 1MB', async () => {
    const big = 'x'.repeat(1_000_001);
    const fd = new FormData();
    fd.append('file', new File([big], 'big.html', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/exceeds/);
  });
});

describe('POST upload-html — happy path (single HTML)', () => {
  beforeEach(() => {
    cleanEmbedHtmlMock.mockImplementation((s: string) => s.replace('<dirty>', ''));
    importHtmlAssetsMock.mockResolvedValue({ html: '<html>clean</html>' });
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'media/abc/clean.html',
      fileSize: 24,
      url: 'https://cdn.example/media/abc/clean.html',
    });
  });

  it('uploads to S3, inserts media + posts rows, returns 201 with id/slug/websiteId', async () => {
    const fd = new FormData();
    fd.append(
      'file',
      new File(['<html><dirty><body/></html>'], 'My Page.html', {
        type: 'text/html',
      }),
    );
    fd.append('sourceUrl', 'https://orig.example/page');

    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.websiteId).toBe(55);
    expect(typeof body.data.id).toBe('number');
    expect(body.data.slug).toBe('my-page');

    // Validate cleanEmbedHtml + importHtmlAssets received the right args
    expect(cleanEmbedHtmlMock).toHaveBeenCalledTimes(1);
    expect(importHtmlAssetsMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        websiteId: 55,
        clientId: 10,
        uploadedBy: 7,
        baseUrl: 'https://orig.example/page',
      }),
    );

    // Media row was inserted
    expect(state.media).toHaveLength(1);
    const m = state.media[0] as Record<string, unknown>;
    expect(m.filename).toBe('My Page.html');
    expect(m.mimeType).toBe('text/html');
    expect(m.websiteId).toBe(55);

    // Post row content includes an html-embed block
    expect(state.posts).toHaveLength(1);
    const p = state.posts[0] as Record<string, unknown>;
    const parsed = JSON.parse(p.content as string);
    expect(parsed.blocks[0].type).toBe('html-embed');
    expect(parsed.blocks[0].url).toBe('https://cdn.example/media/abc/clean.html');
    expect(parsed.blocks[0].filename).toBe('My Page.html');
    expect(parsed.blocks[0].sandbox).toBe('scripts');
  });

  it('appends a numeric suffix when the base slug is already taken', async () => {
    state.posts.push({ id: 1, slug: 'my-page', websiteId: 55 });
    state.posts.push({ id: 2, slug: 'my-page-2', websiteId: 55 });

    const fd = new FormData();
    fd.append(
      'file',
      new File(['<html/>'], 'My Page.html', { type: 'text/html' }),
    );
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.slug).toBe('my-page-3');
  });

  it('falls back to "page" slug when filename has no usable characters', async () => {
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], '!!!.html', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.slug).toBe('page');
  });

  it('produces empty-string slug fallback "page" when filename slugifies to nothing', async () => {
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], '____.html', { type: 'text/html' }));
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.slug).toBe('page');
  });
});

describe('POST upload-html — happy path (zip)', () => {
  beforeEach(() => {
    unpackAndUploadZipMock.mockResolvedValue({
      entries: [
        {
          relativePath: 'index.html',
          mimeType: 'text/html',
          upload: {
            storedFilename: 'media/zid/index.html',
            fileSize: 42,
            url: 'https://cdn.example/media/zid/index.html',
          },
        },
        {
          relativePath: 'assets/app.js',
          mimeType: 'application/javascript',
          upload: {
            storedFilename: 'media/zid/assets/app.js',
            fileSize: 10,
            url: 'https://cdn.example/media/zid/assets/app.js',
          },
        },
      ],
      index: {
        relativePath: 'index.html',
        upload: {
          url: 'https://cdn.example/media/zid/index.html',
        },
      },
    });
  });

  it('unpacks zip, inserts one media row per entry, points block at the index url', async () => {
    const fd = new FormData();
    fd.append(
      'file',
      new File(['zip-bytes'], 'bundle.zip', { type: 'application/zip' }),
    );
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(201);

    // Did NOT call the single-html prep
    expect(cleanEmbedHtmlMock).not.toHaveBeenCalled();
    expect(importHtmlAssetsMock).not.toHaveBeenCalled();
    expect(uploadToS3Mock).not.toHaveBeenCalled();

    expect(state.media).toHaveLength(2);
    expect((state.media[0] as Record<string, unknown>).filename).toBe('index.html');
    expect((state.media[1] as Record<string, unknown>).filename).toBe('assets/app.js');

    const p = state.posts[0] as Record<string, unknown>;
    const parsed = JSON.parse(p.content as string);
    expect(parsed.blocks[0].url).toBe('https://cdn.example/media/zid/index.html');
    expect(parsed.blocks[0].filename).toBe('index.html');
  });

  it('detects zip via mime type even with a non-.zip filename', async () => {
    const fd = new FormData();
    fd.append(
      'file',
      new File(['zip-bytes'], 'bundle', { type: 'application/zip' }),
    );
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    // mime='application/zip' makes isZip=true, so the file isn't rejected by extension.
    // isHtml is false, so we go down the zip branch.
    expect(res.status).toBe(201);
    expect(unpackAndUploadZipMock).toHaveBeenCalledTimes(1);
  });

  it('translates HttpError from the unzip helper into matching status + message', async () => {
    unpackAndUploadZipMock.mockRejectedValueOnce(
      new TestHttpError(413, 'Zip too large after extraction'),
    );
    const fd = new FormData();
    fd.append(
      'file',
      new File(['zip-bytes'], 'bundle.zip', { type: 'application/zip' }),
    );
    const res = await POST(makeUploadReq(fd), siteParams('55'));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.message).toBe('Zip too large after extraction');
  });

  it('rethrows non-HttpError from the unzip helper', async () => {
    unpackAndUploadZipMock.mockRejectedValueOnce(new Error('boom'));
    const fd = new FormData();
    fd.append(
      'file',
      new File(['zip-bytes'], 'bundle.zip', { type: 'application/zip' }),
    );
    await expect(POST(makeUploadReq(fd), siteParams('55'))).rejects.toThrow(
      /boom/,
    );
  });
});
