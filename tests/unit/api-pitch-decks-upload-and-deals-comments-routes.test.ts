// @vitest-environment node
/**
 * Unit tests for two unrelated portal routes packed into one file:
 *
 *  1. POST /api/portal/tools/pitch-decks/upload-html
 *     - Auth + portal-write authorization
 *     - HTML vs ZIP branching, mime + size + extension validation
 *     - Inserts media row(s) + pitchDecks row with a single html-embed slide
 *
 *  2. GET / POST / DELETE /api/portal/crm/deals/[id]/comments
 *     - Auth + tenant scoping
 *     - JSON + multipart comment creation with attachments
 *     - Author-only delete
 *     - Mention notifications restricted to tenant members
 *
 * Everything external (auth, db, drizzle, portal client, S3, mentions,
 * notifications, zip + s3 helpers, portal-auth) is mocked. No network, no DB.
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
  return {
    pitchDecks: wrap('pitchDecks'),
    media: wrap('media'),
    crmDeals: wrap('crmDeals'),
    crmDealComments: wrap('crmDealComments'),
    users: wrap('users'),
    clientMembers: wrap('clientMembers'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ===========================================================================
// Shared auth + portal-client mocks
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const authorizePortalMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    !!(r && typeof r === 'object' && 'response' in (r as object)),
}));

// ===========================================================================
// Upload-html helper mocks
// ===========================================================================

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
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
// CRM helpers
// ===========================================================================

const extractMentionsMock = vi.fn((_body: string): number[] => []);
vi.mock('@/lib/crm/extract-mentions', () => ({
  extractMentions: (b: string) => extractMentionsMock(b),
}));

const createCrmNotificationMock = vi.fn();
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: (...args: unknown[]) =>
    createCrmNotificationMock(...args),
}));

// ===========================================================================
// In-memory DB
// ===========================================================================

interface MockState {
  pitchDecks: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  crmDealComments: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  clientMembers: Array<Record<string, unknown>>;
}

const state: MockState = {
  pitchDecks: [],
  media: [],
  crmDeals: [],
  crmDealComments: [],
  users: [],
  clientMembers: [],
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

interface JoinSpec {
  table: string;
  on: unknown;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, { __col?: string; __table?: string }>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const joins: JoinSpec[] = [];
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      leftJoin(table: { __table: string }, on: unknown) {
        joins.push({ table: table.__table, on });
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
      const baseRows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      // Build joined view: namespaced row used only for projection lookups.
      const out: Array<Record<string, unknown>> = [];
      for (const baseRow of baseRows) {
        const joined: Record<string, Record<string, unknown>> = {
          [activeTable]: baseRow,
        };
        for (const j of joins) {
          const cond = j.on as { op?: string; a?: unknown; b?: unknown } | null;
          let match: Record<string, unknown> | undefined;
          if (cond && cond.op === 'eq') {
            const a = cond.a as { __col?: string; __table?: string };
            const b = cond.b as { __col?: string; __table?: string };
            // expect one side from base, one from join
            const isAFromJoin = a?.__table === j.table;
            const joinCol = isAFromJoin ? a.__col : b.__col;
            const baseCol = isAFromJoin ? b.__col : a.__col;
            if (joinCol && baseCol) {
              match = tableArray(j.table).find(
                (r) => r[joinCol] === baseRow[baseCol],
              );
            }
          }
          joined[j.table] = match ?? {};
        }

        if (projection) {
          const slim: Record<string, unknown> = {};
          for (const [alias, col] of Object.entries(projection)) {
            const tableName = col?.__table ?? activeTable;
            const key = col?.__col ?? alias;
            slim[alias] = joined[tableName]?.[key];
          }
          out.push(slim);
        } else {
          out.push({ ...baseRow });
        }
      }
      let final = out;
      if (limit !== null) final = final.slice(0, limit);
      return Promise.resolve(final);
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

  function buildDelete(table: { __table: string }) {
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      returning() {
        return runDelete();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runDelete().then(onFulfilled, onRejected);
      },
    };
    function runDelete(): Promise<Array<Record<string, unknown>>> {
      const rows = tableArray(table.__table);
      const removed: Array<Record<string, unknown>> = [];
      const remaining: Array<Record<string, unknown>> = [];
      for (const r of rows) {
        if (evalPredicate(filter, r)) removed.push({ ...r });
        else remaining.push(r);
      }
      rows.length = 0;
      rows.push(...remaining);
      return Promise.resolve(removed);
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ===========================================================================
// Modules under test
// ===========================================================================

const uploadHtml = await import(
  '@/app/api/portal/tools/pitch-decks/upload-html/route'
);
const UPLOAD_POST = uploadHtml.POST;

const dealsComments = await import(
  '@/app/api/portal/crm/deals/[id]/comments/route'
);
const COMMENTS_GET = dealsComments.GET;
const COMMENTS_POST = dealsComments.POST;
const COMMENTS_DELETE = dealsComments.DELETE;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  state.pitchDecks.length = 0;
  state.media.length = 0;
  state.crmDeals.length = 0;
  state.crmDealComments.length = 0;
  state.users.length = 0;
  state.clientMembers.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  uploadToS3Mock.mockReset();
  unpackAndUploadZipMock.mockReset();
  extractMentionsMock.mockReset().mockReturnValue([]);
  createCrmNotificationMock.mockReset().mockResolvedValue(undefined);

  authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  authorizePortalMock.mockResolvedValue({ ok: true });
});

// ===========================================================================
// POST /api/portal/tools/pitch-decks/upload-html
// ===========================================================================

function makeUploadReq(formData: FormData): Request {
  return new Request('http://x/api/portal/tools/pitch-decks/upload-html', {
    method: 'POST',
    body: formData,
  });
}

function makeBadFormDataReq(): Request {
  return new Request('http://x/api/portal/tools/pitch-decks/upload-html', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"not":"multipart"}',
  });
}

describe('POST /api/portal/tools/pitch-decks/upload-html — auth', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(401);
  });

  it('returns the authorizePortal error response when authorization fails', async () => {
    const denied = new Response(
      JSON.stringify({ success: false, message: 'forbidden' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    );
    authorizePortalMock.mockResolvedValueOnce({ response: denied });
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(403);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], 'a.html', { type: 'text/html' }));
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 when body is not multipart/form-data', async () => {
    const res = await UPLOAD_POST(makeBadFormDataReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/multipart\/form-data/);
  });

  it('returns 400 when file field missing', async () => {
    const fd = new FormData();
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('No file provided');
  });
});

describe('POST upload-html (pitch-decks) — validation', () => {
  it('rejects non-html / non-zip filename', async () => {
    const fd = new FormData();
    fd.append('file', new File(['data'], 'malware.exe', { type: 'text/html' }));
    const res = await UPLOAD_POST(makeUploadReq(fd));
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
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/MIME type/);
  });

  it('rejects html file exceeding 1MB', async () => {
    const big = 'x'.repeat(1_000_001);
    const fd = new FormData();
    fd.append('file', new File([big], 'big.html', { type: 'text/html' }));
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/exceeds/);
  });
});

describe('POST upload-html (pitch-decks) — happy path (single HTML)', () => {
  beforeEach(() => {
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'media/abc/deck.html',
      fileSize: 24,
      url: 'https://cdn.example/media/abc/deck.html',
    });
  });

  it('uploads, inserts media + pitchDecks, returns 201 with id/slug', async () => {
    const fd = new FormData();
    fd.append(
      'file',
      new File(['<html><body/></html>'], 'My Deck.html', {
        type: 'text/html',
      }),
    );
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.id).toBe('number');
    expect(body.data.slug.startsWith('my-deck-')).toBe(true);

    expect(uploadToS3Mock).toHaveBeenCalledWith(
      expect.any(Buffer),
      'My Deck.html',
      'text/html',
    );
    expect(state.media).toHaveLength(1);
    const m = state.media[0] as Record<string, unknown>;
    expect(m.filename).toBe('My Deck.html');
    expect(m.mimeType).toBe('text/html');
    expect(m.clientId).toBe(10);
    expect(m.uploadedBy).toBe(7);

    expect(state.pitchDecks).toHaveLength(1);
    const deck = state.pitchDecks[0] as Record<string, unknown>;
    expect(deck.clientId).toBe(10);
    expect(deck.title).toBe('My Deck');
    expect(deck.formatVersion).toBe(2);
    const slides = deck.slides as Array<{
      blocks: Array<{ type: string; url: string; filename: string; sandbox: string }>;
    }>;
    expect(slides).toHaveLength(1);
    expect(slides[0].blocks[0].type).toBe('html-embed');
    expect(slides[0].blocks[0].url).toBe(
      'https://cdn.example/media/abc/deck.html',
    );
    expect(slides[0].blocks[0].filename).toBe('My Deck.html');
    expect(slides[0].blocks[0].sandbox).toBe('scripts');
    const theme = deck.theme as { showSlideNumber: boolean };
    expect(theme.showSlideNumber).toBe(false);
  });

  it('falls back to "deck" slug when filename has no slug chars', async () => {
    const fd = new FormData();
    fd.append('file', new File(['<html/>'], '!!!.html', { type: 'text/html' }));
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.slug.startsWith('deck-')).toBe(true);
  });
});

describe('POST upload-html (pitch-decks) — happy path (zip)', () => {
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
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(201);
    expect(uploadToS3Mock).not.toHaveBeenCalled();

    expect(state.media).toHaveLength(2);
    expect((state.media[0] as Record<string, unknown>).filename).toBe(
      'index.html',
    );
    expect((state.media[1] as Record<string, unknown>).filename).toBe(
      'assets/app.js',
    );

    const deck = state.pitchDecks[0] as Record<string, unknown>;
    const slides = deck.slides as Array<{
      blocks: Array<{ url: string; filename: string }>;
    }>;
    expect(slides[0].blocks[0].url).toBe(
      'https://cdn.example/media/zid/index.html',
    );
    expect(slides[0].blocks[0].filename).toBe('index.html');
  });

  it('detects zip via mime when filename lacks .zip extension', async () => {
    const fd = new FormData();
    fd.append(
      'file',
      new File(['zip-bytes'], 'bundle', { type: 'application/zip' }),
    );
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(201);
    expect(unpackAndUploadZipMock).toHaveBeenCalledTimes(1);
  });

  it('translates HttpError from unzip helper to matching status', async () => {
    unpackAndUploadZipMock.mockRejectedValueOnce(
      new TestHttpError(413, 'Zip too large'),
    );
    const fd = new FormData();
    fd.append(
      'file',
      new File(['zip-bytes'], 'bundle.zip', { type: 'application/zip' }),
    );
    const res = await UPLOAD_POST(makeUploadReq(fd));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.message).toBe('Zip too large');
  });

  it('rethrows non-HttpError from unzip helper', async () => {
    unpackAndUploadZipMock.mockRejectedValueOnce(new Error('boom'));
    const fd = new FormData();
    fd.append(
      'file',
      new File(['zip-bytes'], 'bundle.zip', { type: 'application/zip' }),
    );
    await expect(UPLOAD_POST(makeUploadReq(fd))).rejects.toThrow(/boom/);
  });
});

// ===========================================================================
// /api/portal/crm/deals/[id]/comments
// ===========================================================================

function idParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeJsonReq(method: string, body: unknown): Request {
  return new Request('http://x/api/portal/crm/deals/5/comments', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeMultipartReq(formData: FormData): Request {
  return new Request('http://x/api/portal/crm/deals/5/comments', {
    method: 'POST',
    body: formData,
  });
}

function makeGetReq(): Request {
  return new Request('http://x/api/portal/crm/deals/5/comments', {
    method: 'GET',
  });
}

function seedDeal() {
  state.crmDeals.push({ id: 5, clientId: 10, title: 'Acme Deal' });
}

describe('GET /api/portal/crm/deals/[id]/comments', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await COMMENTS_GET(makeGetReq(), idParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await COMMENTS_GET(makeGetReq(), idParams('5'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await COMMENTS_GET(makeGetReq(), idParams('5'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when deal not found for this tenant', async () => {
    // No deal seeded.
    const res = await COMMENTS_GET(makeGetReq(), idParams('5'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Deal not found');
  });

  it('returns the comments joined with author name', async () => {
    seedDeal();
    state.users.push({ id: 7, name: 'Alice' });
    state.crmDealComments.push({
      id: 100,
      dealId: 5,
      authorId: 7,
      body: 'hello',
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await COMMENTS_GET(makeGetReq(), idParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].body).toBe('hello');
    expect(body.data[0].authorName).toBe('Alice');
  });
});

describe('POST /api/portal/crm/deals/[id]/comments', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await COMMENTS_POST(
      makeJsonReq('POST', { body: 'hi' }),
      idParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await COMMENTS_POST(
      makeJsonReq('POST', { body: 'hi' }),
      idParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when body empty and no attachments', async () => {
    seedDeal();
    const res = await COMMENTS_POST(
      makeJsonReq('POST', { body: '   ' }),
      idParams('5'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/);
  });

  it('inserts a JSON comment, trims body, returns 201 with author name', async () => {
    seedDeal();
    state.users.push({ id: 7, name: 'Alice' });
    const res = await COMMENTS_POST(
      makeJsonReq('POST', { body: '   trimmed body  ' }),
      idParams('5'),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.body).toBe('trimmed body');
    expect(body.data.authorName).toBe('Alice');
    expect(state.crmDealComments).toHaveLength(1);
    const c = state.crmDealComments[0] as Record<string, unknown>;
    expect(c.dealId).toBe(5);
    expect(c.authorId).toBe(7);
    expect(c.attachments).toEqual([]);
  });

  it('uploads multipart attachments and stores them on the comment', async () => {
    seedDeal();
    state.users.push({ id: 7, name: 'Alice' });
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'crm/deals/5/comments/x.png',
      fileSize: 4,
      url: 'https://cdn.example/x.png',
    });
    const fd = new FormData();
    fd.append('body', 'see attached');
    fd.append(
      'files',
      new File(['data'], 'shot.png', { type: 'image/png' }),
    );
    const res = await COMMENTS_POST(makeMultipartReq(fd), idParams('5'));
    expect(res.status).toBe(201);
    expect(uploadToS3Mock).toHaveBeenCalledTimes(1);
    const c = state.crmDealComments[0] as Record<string, unknown>;
    const atts = c.attachments as Array<{ url: string; filename: string }>;
    expect(atts).toHaveLength(1);
    expect(atts[0].filename).toBe('shot.png');
    expect(atts[0].url).toBe('https://cdn.example/x.png');
  });

  it('accepts a multipart comment with attachments and empty body', async () => {
    seedDeal();
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'crm/deals/5/comments/y.png',
      fileSize: 4,
      url: 'https://cdn.example/y.png',
    });
    const fd = new FormData();
    fd.append('body', '');
    fd.append(
      'files',
      new File(['data'], 'y.png', { type: 'image/png' }),
    );
    const res = await COMMENTS_POST(makeMultipartReq(fd), idParams('5'));
    expect(res.status).toBe(201);
  });

  it('notifies only mentioned users who are members of the same client', async () => {
    seedDeal();
    state.users.push({ id: 7, name: 'Alice' });
    state.clientMembers.push({ clientId: 10, userId: 8 });
    // userId 9 is mentioned but not a member — should be filtered out.
    extractMentionsMock.mockReturnValueOnce([8, 9, 7]); // 7 is self, filtered

    const res = await COMMENTS_POST(
      makeJsonReq('POST', { body: 'hey @alice @bob' }),
      idParams('5'),
    );
    expect(res.status).toBe(201);
    // Drain any microtasks from the fire-and-forget notification calls.
    await new Promise((r) => setTimeout(r, 0));
    expect(createCrmNotificationMock).toHaveBeenCalledTimes(1);
    expect(createCrmNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        userId: 8,
        type: 'mention',
        entityType: 'deal',
        entityId: 5,
      }),
    );
  });

  it('does not fan out notifications when there are no mentions', async () => {
    seedDeal();
    extractMentionsMock.mockReturnValueOnce([]);
    const res = await COMMENTS_POST(
      makeJsonReq('POST', { body: 'no mentions here' }),
      idParams('5'),
    );
    expect(res.status).toBe(201);
    expect(createCrmNotificationMock).not.toHaveBeenCalled();
  });

  it('survives a rejected notification (swallowed by .catch)', async () => {
    seedDeal();
    state.users.push({ id: 7, name: 'Alice' });
    state.clientMembers.push({ clientId: 10, userId: 8 });
    extractMentionsMock.mockReturnValueOnce([8]);
    createCrmNotificationMock.mockRejectedValueOnce(new Error('notify-fail'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await COMMENTS_POST(
      makeJsonReq('POST', { body: 'hey @bob' }),
      idParams('5'),
    );
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 0));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('DELETE /api/portal/crm/deals/[id]/comments', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await COMMENTS_DELETE(
      makeJsonReq('DELETE', { commentId: 1 }),
      idParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await COMMENTS_DELETE(
      makeJsonReq('DELETE', { commentId: 1 }),
      idParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when deal not in tenant', async () => {
    // No deal seeded.
    const res = await COMMENTS_DELETE(
      makeJsonReq('DELETE', { commentId: 1 }),
      idParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the comment is not owned by the user', async () => {
    seedDeal();
    state.crmDealComments.push({
      id: 200,
      dealId: 5,
      authorId: 99, // someone else
      body: 'x',
      attachments: [],
    });
    const res = await COMMENTS_DELETE(
      makeJsonReq('DELETE', { commentId: 200 }),
      idParams('5'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/not yours/);
    expect(state.crmDealComments).toHaveLength(1); // not deleted
  });

  it('deletes the comment when owned by the user and returns it', async () => {
    seedDeal();
    state.crmDealComments.push({
      id: 201,
      dealId: 5,
      authorId: 7,
      body: 'mine',
      attachments: [],
    });
    const res = await COMMENTS_DELETE(
      makeJsonReq('DELETE', { commentId: 201 }),
      idParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(201);
    expect(state.crmDealComments).toHaveLength(0);
  });
});
