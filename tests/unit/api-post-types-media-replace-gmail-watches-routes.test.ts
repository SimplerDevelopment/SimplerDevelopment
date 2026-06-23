// @vitest-environment node
/**
 * Unit tests for three unrelated API routes packed into one file:
 *
 *  1. GET / PUT / DELETE /api/post-types/[id]
 *     - id validation
 *     - GET happy path + 404
 *     - PUT happy path, validation error, 404, generic error
 *     - DELETE happy path + error
 *
 *  2. POST /api/portal/media/[id]/replace
 *     - auth gate
 *     - portal client lookup
 *     - id validation, media existence, multipart parsing
 *     - HTML branch (clean + asset import) vs binary branch
 *
 *  3. GET /api/cron/renew-gmail-watches
 *     - Vercel-cron header / bearer auth gate
 *     - filtering by gmail scope + expiration horizon
 *     - tenant credential lookup + revoked tenant skip
 *     - token refresh persistence
 *     - per-row failure isolation
 *
 * Everything external (auth, db, drizzle, schema, helpers) is mocked. No
 * network, no DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    postTypes: wrap('postTypes'),
    media: wrap('media'),
    mediaVersions: wrap('mediaVersions'),
    googleWorkspaceUserConnections: wrap('googleWorkspaceUserConnections'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
    __sql: true,
    raw: strings.join('?'),
  }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ===========================================================================
// Shared db mock — independent state per route via reset
// ===========================================================================

type DbHandlers = {
  selectHandler: (table: unknown) => unknown[] | Promise<unknown[]>;
  updateHandler: (table: unknown, values: Record<string, unknown>) => unknown[] | Promise<unknown[]>;
  deleteHandler: (table: unknown) => void | Promise<void>;
  insertHandler: (table: unknown, values: Record<string, unknown>) => void | Promise<void>;
};

const dbHandlers: DbHandlers = {
  selectHandler: () => [],
  updateHandler: () => [],
  deleteHandler: () => undefined,
  insertHandler: () => undefined,
};

vi.mock('@/lib/db', () => {
  const buildSelect = () => {
    let currentTable: unknown = null;
    const chain: Record<string, unknown> = {};
    chain.from = (table: unknown) => {
      currentTable = table;
      return chain;
    };
    chain.where = () => chain;
    chain.limit = async () => {
      const out = await dbHandlers.selectHandler(currentTable);
      return out;
    };
    // For cron route: select().from(...).where(...) is awaited directly
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      return Promise.resolve(dbHandlers.selectHandler(currentTable)).then(onFulfilled, onRejected);
    };
    return chain;
  };

  const buildUpdate = () => {
    let currentTable: unknown = null;
    let setValues: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    chain.set = (values: Record<string, unknown>) => {
      setValues = values;
      return chain;
    };
    chain.where = () => chain;
    chain.returning = async () => {
      const out = await dbHandlers.updateHandler(currentTable, setValues);
      return out;
    };
    // For cron: update(...).set(...).where(...) is awaited without .returning
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      return Promise.resolve(dbHandlers.updateHandler(currentTable, setValues)).then(
        onFulfilled,
        onRejected,
      );
    };
    return {
      ...chain,
      __setTable: (t: unknown) => {
        currentTable = t;
      },
    };
  };

  const db = {
    select: vi.fn(() => {
      const chain = buildSelect();
      return chain;
    }),
    update: vi.fn((table: unknown) => {
      const chain = buildUpdate();
      (chain as { __setTable: (t: unknown) => void }).__setTable(table);
      return chain;
    }),
    delete: vi.fn((table: unknown) => ({
      where: async () => {
        await dbHandlers.deleteHandler(table);
        return undefined;
      },
    })),
    insert: vi.fn((table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        await dbHandlers.insertHandler(table, values);
        return undefined;
      },
    })),
  };
  return { db };
});

function resetDbHandlers() {
  dbHandlers.selectHandler = () => [];
  dbHandlers.updateHandler = () => [];
  dbHandlers.deleteHandler = () => undefined;
  dbHandlers.insertHandler = () => undefined;
}

// ===========================================================================
// Shared auth / portal-client mocks
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// ===========================================================================
// /api/portal/media/[id]/replace dependency mocks
// ===========================================================================

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

const cleanEmbedHtmlMock = vi.fn((s: string) => `<clean>${s}</clean>`);
vi.mock('@/lib/html-embed-clean', () => ({
  cleanEmbedHtml: (s: string) => cleanEmbedHtmlMock(s),
}));

const importHtmlAssetsMock = vi.fn();
vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: (...args: unknown[]) => importHtmlAssetsMock(...args),
}));

// ===========================================================================
// /api/cron/renew-gmail-watches dependency mocks
// ===========================================================================

const refreshIfExpiredMock = vi.fn();
vi.mock('@/lib/google/oauth', () => ({
  refreshIfExpired: (...args: unknown[]) => refreshIfExpiredMock(...args),
}));

const startGmailWatchMock = vi.fn();
vi.mock('@/lib/google/gmail-watch', () => ({
  startGmailWatch: (...args: unknown[]) => startGmailWatchMock(...args),
}));

const getTenantWorkspaceCredentialsByClientIdMock = vi.fn();
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: (...args: unknown[]) =>
    getTenantWorkspaceCredentialsByClientIdMock(...args),
}));

// Mock cron-health so withCronHealth is a transparent passthrough — prevents
// the DB insert(..).values(..).onConflictDoUpdate TypeError and the extra
// db.update() call from recordSuccess() polluting updateSpy assertions.
vi.mock('@/lib/cron-health', () => ({
  withCronHealth: (
    _opts: unknown,
    handler: (req: Request) => Promise<Response>,
  ) => handler,
}));

// ===========================================================================
// /api/post-types/[id]
// ===========================================================================

describe('GET /api/post-types/[id]', () => {
  beforeEach(() => {
    resetDbHandlers();
    vi.clearAllMocks();
  });

  it('returns 400 for non-numeric id', async () => {
    const { GET } = await import('@/app/api/post-types/[id]/route');
    const req = new Request('http://x/api/post-types/abc');
    const res = await GET(req as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Invalid/);
  });

  it('returns 404 when post type not found', async () => {
    dbHandlers.selectHandler = () => [];
    const { GET } = await import('@/app/api/post-types/[id]/route');
    const res = await GET(new Request('http://x') as never, {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns the post type on happy path', async () => {
    dbHandlers.selectHandler = () => [{ id: 5, name: 'Blog', slug: 'blog' }];
    const { GET } = await import('@/app/api/post-types/[id]/route');
    const res = await GET(new Request('http://x') as never, {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ id: 5, name: 'Blog' });
  });

  it('returns 500 on DB error', async () => {
    dbHandlers.selectHandler = () => {
      throw new Error('boom');
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import('@/app/api/post-types/[id]/route');
    const res = await GET(new Request('http://x') as never, {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe('PUT /api/post-types/[id]', () => {
  beforeEach(() => {
    resetDbHandlers();
    vi.clearAllMocks();
  });

  it('returns 400 for non-numeric id', async () => {
    const { PUT } = await import('@/app/api/post-types/[id]/route');
    const req = new Request('http://x', { method: 'PUT', body: JSON.stringify({}) });
    const res = await PUT(req as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 on Zod validation error', async () => {
    const { PUT } = await import('@/app/api/post-types/[id]/route');
    // Provide an invalid type for name (number instead of string)
    const req = new Request('http://x', {
      method: 'PUT',
      body: JSON.stringify({ name: 123 }),
    });
    const res = await PUT(req as never, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation error');
    expect(json.issues).toBeDefined();
  });

  it('returns 404 when update returns no row', async () => {
    dbHandlers.updateHandler = () => [];
    const { PUT } = await import('@/app/api/post-types/[id]/route');
    const req = new Request('http://x', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const res = await PUT(req as never, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(404);
  });

  it('returns 200 with updated post type', async () => {
    dbHandlers.updateHandler = () => [{ id: 7, name: 'Updated', slug: 'updated' }];
    const { PUT } = await import('@/app/api/post-types/[id]/route');
    const req = new Request('http://x', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated', active: true }),
    });
    const res = await PUT(req as never, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ id: 7, name: 'Updated' });
  });

  it('returns 500 on generic error during update', async () => {
    dbHandlers.updateHandler = () => {
      throw new Error('db broken');
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { PUT } = await import('@/app/api/post-types/[id]/route');
    const req = new Request('http://x', {
      method: 'PUT',
      body: JSON.stringify({ name: 'X' }),
    });
    const res = await PUT(req as never, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe('DELETE /api/post-types/[id]', () => {
  beforeEach(() => {
    resetDbHandlers();
    vi.clearAllMocks();
  });

  it('returns 400 for invalid id', async () => {
    const { DELETE } = await import('@/app/api/post-types/[id]/route');
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: 'notnum' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 on successful delete', async () => {
    const { DELETE } = await import('@/app/api/post-types/[id]/route');
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/deleted/);
  });

  it('returns 500 when delete throws', async () => {
    dbHandlers.deleteHandler = () => {
      throw new Error('cant delete');
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { DELETE } = await import('@/app/api/post-types/[id]/route');
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

// ===========================================================================
// /api/portal/media/[id]/replace
// ===========================================================================

describe('POST /api/portal/media/[id]/replace', () => {
  beforeEach(() => {
    resetDbHandlers();
    vi.clearAllMocks();
    authMock.mockReset();
    getPortalClientMock.mockReset();
    uploadToS3Mock.mockReset();
    cleanEmbedHtmlMock.mockClear();
    importHtmlAssetsMock.mockReset();
  });

  function buildMultipartReq(parts: Array<{ name: string; value: string | Blob; filename?: string }>) {
    const form = new FormData();
    for (const p of parts) {
      if (typeof p.value === 'string') {
        form.append(p.name, p.value);
      } else {
        form.append(p.name, p.value, p.filename);
      }
    }
    return new Request('http://x/api/portal/media/1/replace', {
      method: 'POST',
      body: form,
    });
  }

  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const res = await POST(buildMultipartReq([{ name: 'file', value: new Blob(['x']), filename: 'a.bin' }]) as never, {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const res = await POST(buildMultipartReq([{ name: 'file', value: new Blob(['x']), filename: 'a.bin' }]) as never, {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for non-numeric id', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const res = await POST(buildMultipartReq([{ name: 'file', value: new Blob(['x']), filename: 'a.bin' }]) as never, {
      params: Promise.resolve({ id: 'NaN' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when media row not found for client', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    dbHandlers.selectHandler = () => [];
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const res = await POST(buildMultipartReq([{ name: 'file', value: new Blob(['x']), filename: 'a.bin' }]) as never, {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when body is not multipart', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    dbHandlers.selectHandler = () => [
      {
        id: 1,
        clientId: 7,
        filename: 'old.bin',
        storedFilename: 'stored-old.bin',
        mimeType: 'application/octet-stream',
        fileSize: 10,
        url: 'https://s3/old',
        uploadedBy: 1,
        version: 1,
        websiteId: null,
      },
    ];
    const req = new Request('http://x/api/portal/media/1/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-multipart',
    });
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const res = await POST(req as never, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when no file in form data', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    dbHandlers.selectHandler = () => [
      {
        id: 1,
        clientId: 7,
        filename: 'old.bin',
        storedFilename: 'stored-old.bin',
        mimeType: 'application/octet-stream',
        fileSize: 10,
        url: 'https://s3/old',
        uploadedBy: 1,
        version: 1,
        websiteId: null,
      },
    ];
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const res = await POST(buildMultipartReq([{ name: 'other', value: 'value' }]) as never, {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/No file/);
  });

  it('rejects HTML files exceeding the size cap', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    dbHandlers.selectHandler = () => [
      {
        id: 1,
        clientId: 7,
        filename: 'old.html',
        storedFilename: 'stored-old.html',
        mimeType: 'text/html',
        fileSize: 10,
        url: 'https://s3/old',
        uploadedBy: 1,
        version: 1,
        websiteId: null,
      },
    ];
    // Build a blob larger than 1_000_000 bytes
    const big = new Blob([new Uint8Array(1_000_001)], { type: 'text/html' });
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const res = await POST(buildMultipartReq([{ name: 'file', value: big, filename: 'huge.html' }]) as never, {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/exceeds/);
  });

  it('replaces a binary file successfully and snapshots prior version', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    dbHandlers.selectHandler = () => [
      {
        id: 1,
        clientId: 7,
        filename: 'old.bin',
        storedFilename: 'stored-old.bin',
        mimeType: 'application/octet-stream',
        fileSize: 10,
        url: 'https://s3/old',
        uploadedBy: 1,
        version: 3,
        websiteId: null,
      },
    ];
    let insertedSnapshot: Record<string, unknown> | null = null;
    dbHandlers.insertHandler = (_t, values) => {
      insertedSnapshot = values;
    };
    dbHandlers.updateHandler = () => [
      {
        id: 1,
        url: 'https://s3/new',
        filename: 'new.bin',
        fileSize: 99,
        version: 4,
      },
    ];
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'stored-new.bin',
      mimeType: 'application/octet-stream',
      fileSize: 99,
      url: 'https://s3/new',
    });
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' });
    const res = await POST(buildMultipartReq([{ name: 'file', value: blob, filename: 'new.bin' }]) as never, {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ id: 1, version: 4, url: 'https://s3/new' });
    expect(uploadToS3Mock).toHaveBeenCalledTimes(1);
    expect(cleanEmbedHtmlMock).not.toHaveBeenCalled();
    expect(insertedSnapshot).toMatchObject({ mediaId: 1, version: 3 });
  });

  it('cleans and rewrites HTML when websiteId is set', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    dbHandlers.selectHandler = () => [
      {
        id: 2,
        clientId: 7,
        filename: 'old.html',
        storedFilename: 'stored-old.html',
        mimeType: 'text/html',
        fileSize: 10,
        url: 'https://s3/old',
        uploadedBy: 1,
        version: 1,
        websiteId: 55,
      },
    ];
    importHtmlAssetsMock.mockResolvedValue({ html: '<final/>' });
    dbHandlers.updateHandler = () => [
      {
        id: 2,
        url: 'https://s3/new.html',
        filename: 'new.html',
        fileSize: 12,
        version: 2,
      },
    ];
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'stored-new.html',
      mimeType: 'text/html',
      fileSize: 12,
      url: 'https://s3/new.html',
    });
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const blob = new Blob(['<html></html>'], { type: 'text/html' });
    const res = await POST(
      buildMultipartReq([
        { name: 'file', value: blob, filename: 'new.html' },
        { name: 'sourceUrl', value: 'https://example.com/src' },
      ]) as never,
      { params: Promise.resolve({ id: '2' }) },
    );
    expect(res.status).toBe(200);
    expect(cleanEmbedHtmlMock).toHaveBeenCalledTimes(1);
    expect(importHtmlAssetsMock).toHaveBeenCalledTimes(1);
    expect(importHtmlAssetsMock.mock.calls[0][1]).toMatchObject({
      websiteId: 55,
      clientId: 7,
      uploadedBy: 42,
      baseUrl: 'https://example.com/src',
    });
    // uploadToS3 received the processed buffer
    const uploadedBuffer = uploadToS3Mock.mock.calls[0][0] as Buffer;
    expect(uploadedBuffer.toString('utf8')).toBe('<final/>');
  });

  it('detects HTML by extension when mime type is generic', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    dbHandlers.selectHandler = () => [
      {
        id: 3,
        clientId: 7,
        filename: 'old.html',
        storedFilename: 'stored-old.html',
        mimeType: 'text/html',
        fileSize: 10,
        url: 'https://s3/old',
        uploadedBy: 1,
        version: 1,
        websiteId: null,
      },
    ];
    dbHandlers.updateHandler = () => [
      { id: 3, url: 'https://s3/new', filename: 'page.htm', fileSize: 5, version: 2 },
    ];
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'stored-page.htm',
      mimeType: 'text/html',
      fileSize: 5,
      url: 'https://s3/new',
    });
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const blob = new Blob(['<p>hi</p>'], { type: 'application/octet-stream' });
    const res = await POST(
      buildMultipartReq([{ name: 'file', value: blob, filename: 'page.htm' }]) as never,
      { params: Promise.resolve({ id: '3' }) },
    );
    expect(res.status).toBe(200);
    expect(cleanEmbedHtmlMock).toHaveBeenCalledTimes(1);
    // No websiteId → importHtmlAssets not invoked
    expect(importHtmlAssetsMock).not.toHaveBeenCalled();
  });

  it('returns 500 envelope when upload throws unexpectedly', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue({ id: 7 });
    dbHandlers.selectHandler = () => [
      {
        id: 1,
        clientId: 7,
        filename: 'old.bin',
        storedFilename: 'stored-old.bin',
        mimeType: 'application/octet-stream',
        fileSize: 10,
        url: 'https://s3/old',
        uploadedBy: 1,
        version: 1,
        websiteId: null,
      },
    ];
    uploadToS3Mock.mockRejectedValue(new Error('s3 down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('@/app/api/portal/media/[id]/replace/route');
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    const res = await POST(
      buildMultipartReq([{ name: 'file', value: blob, filename: 'new.bin' }]) as never,
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toMatch(/s3 down/);
    errSpy.mockRestore();
  });
});

// ===========================================================================
// /api/cron/renew-gmail-watches
// ===========================================================================

describe('GET /api/cron/renew-gmail-watches', () => {
  const ORIGINAL_CRON = process.env.CRON_SECRET;

  beforeEach(() => {
    resetDbHandlers();
    vi.clearAllMocks();
    refreshIfExpiredMock.mockReset();
    startGmailWatchMock.mockReset();
    getTenantWorkspaceCredentialsByClientIdMock.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_CRON === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(new Request('http://x/api/cron/renew-gmail-watches'));
    expect(res.status).toBe(401);
  });

  it('rejects when bearer token does not match', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects when CRON_SECRET is unset and no Vercel header', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { authorization: 'Bearer anything' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the Vercel cron header with no candidates', async () => {
    process.env.CRON_SECRET = 'shh';
    dbHandlers.selectHandler = () => [];
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: true,
      examined: 0,
      candidates: 0,
      renewed: 0,
      failed: 0,
      skipped: 0,
    });
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    dbHandlers.selectHandler = () => [];
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('filters out connections without a gmail scope', async () => {
    process.env.CRON_SECRET = 'shh';
    dbHandlers.selectHandler = () => [
      {
        id: 10,
        clientId: 1,
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        gmailWatchExpiration: null,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
    ];
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.examined).toBe(1);
    expect(json.candidates).toBe(0);
    expect(startGmailWatchMock).not.toHaveBeenCalled();
  });

  it('skips connections whose gmailWatchExpiration is far in the future', async () => {
    process.env.CRON_SECRET = 'shh';
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    dbHandlers.selectHandler = () => [
      {
        id: 11,
        clientId: 1,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        gmailWatchExpiration: farFuture,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
    ];
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = await res.json();
    expect(json.candidates).toBe(0);
  });

  it('skips connections whose tenant credentials are missing', async () => {
    process.env.CRON_SECRET = 'shh';
    dbHandlers.selectHandler = () => [
      {
        id: 20,
        clientId: 2,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        gmailWatchExpiration: null,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
    ];
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = await res.json();
    expect(json.candidates).toBe(1);
    expect(json.skipped).toBe(1);
    expect(json.renewed).toBe(0);
    expect(startGmailWatchMock).not.toHaveBeenCalled();
  });

  it('skips connections whose tenant credentials are revoked', async () => {
    process.env.CRON_SECRET = 'shh';
    dbHandlers.selectHandler = () => [
      {
        id: 21,
        clientId: 2,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        gmailWatchExpiration: null,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
    ];
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'revoked',
      oauth: { clientId: 'x', clientSecret: 'y' },
      pubsubTopic: 'projects/p/topics/t',
    });
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    const json = await res.json();
    expect(json.skipped).toBe(1);
    expect(json.renewed).toBe(0);
    expect(startGmailWatchMock).not.toHaveBeenCalled();
  });

  it('renews an eligible connection and persists refreshed tokens', async () => {
    process.env.CRON_SECRET = 'shh';
    dbHandlers.selectHandler = () => [
      {
        id: 30,
        clientId: 3,
        scopes: ['https://www.googleapis.com/auth/gmail.modify'],
        gmailWatchExpiration: null,
        accessToken: 'old-at',
        refreshToken: 'old-rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
    ];
    const updateSpy = vi.fn();
    dbHandlers.updateHandler = (_t, values) => {
      updateSpy(values);
      return [];
    };
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'x', clientSecret: 'y' },
      pubsubTopic: 'projects/p/topics/gmail',
    });
    refreshIfExpiredMock.mockResolvedValue({
      refreshed: true,
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      expiresAt: new Date('2026-05-20T12:00:00Z'),
    });
    startGmailWatchMock.mockResolvedValue({
      historyId: '12345',
      expiration: new Date('2026-05-26T12:00:00Z'),
    });
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.renewed).toBe(1);
    expect(json.failed).toBe(0);
    expect(startGmailWatchMock).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toMatchObject({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      gmailHistoryId: '12345',
    });
  });

  it('keeps existing tokens when refreshIfExpired reports no refresh', async () => {
    process.env.CRON_SECRET = 'shh';
    dbHandlers.selectHandler = () => [
      {
        id: 31,
        clientId: 3,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        gmailWatchExpiration: null,
        accessToken: 'keep-at',
        refreshToken: 'keep-rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
    ];
    const updateSpy = vi.fn();
    dbHandlers.updateHandler = (_t, values) => {
      updateSpy(values);
      return [];
    };
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'x', clientSecret: 'y' },
      pubsubTopic: 'projects/p/topics/gmail',
    });
    refreshIfExpiredMock.mockResolvedValue({ refreshed: false });
    startGmailWatchMock.mockResolvedValue({
      historyId: '99',
      expiration: new Date('2026-05-26T12:00:00Z'),
    });
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSpy.mock.calls[0][0]).toMatchObject({
      accessToken: 'keep-at',
      refreshToken: 'keep-rt',
    });
  });

  it('isolates per-row failures and reports them in the envelope', async () => {
    process.env.CRON_SECRET = 'shh';
    dbHandlers.selectHandler = () => [
      {
        id: 40,
        clientId: 4,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        gmailWatchExpiration: null,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
      {
        id: 41,
        clientId: 4,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        gmailWatchExpiration: null,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: new Date('2026-05-19T12:00:00Z'),
      },
    ];
    getTenantWorkspaceCredentialsByClientIdMock.mockResolvedValue({
      status: 'active',
      oauth: { clientId: 'x', clientSecret: 'y' },
      pubsubTopic: 'projects/p/topics/gmail',
    });
    refreshIfExpiredMock.mockResolvedValue({ refreshed: false });
    startGmailWatchMock
      .mockRejectedValueOnce(new Error('boom-40'))
      .mockResolvedValueOnce({
        historyId: '200',
        expiration: new Date('2026-05-26T12:00:00Z'),
      });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import('@/app/api/cron/renew-gmail-watches/route');
    const res = await GET(
      new Request('http://x/api/cron/renew-gmail-watches', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.renewed).toBe(1);
    expect(json.failed).toBe(1);
    expect(json.failures).toEqual([{ connectionId: 40, reason: 'boom-40' }]);
    errSpy.mockRestore();
  });
});
