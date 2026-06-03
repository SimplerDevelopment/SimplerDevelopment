// @vitest-environment node
/**
 * Unit tests for four API routes (batch 27e):
 *   - app/api/media/upload/route.ts                                       (POST)
 *   - app/api/portal/agency/custom-domain/verify/route.ts                 (POST)
 *   - app/api/portal/ai/conversations/[id]/route.ts                       (GET)
 *   - app/api/portal/ai/conversations/route.ts                            (GET)
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
const getPortalRoleMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalRole: (...args: unknown[]) => getPortalRoleMock(...args),
}));

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

const verifyDomainOwnershipMock = vi.fn();
vi.mock('@/lib/agency/dns-verify', () => ({
  verifyDomainOwnership: (...args: unknown[]) => verifyDomainOwnershipMock(...args),
}));

const clearCustomDomainCacheMock = vi.fn();
vi.mock('@/lib/agency/custom-domain', () => ({
  clearCustomDomainCache: () => clearCustomDomainCacheMock(),
}));

// sharp mock — returns metadata extracted from buffer; allow per-test override
const sharpMetadataMock = vi.fn();
vi.mock('sharp', () => ({
  default: (_buf: Buffer) => ({
    metadata: () => sharpMetadataMock(),
  }),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  count: () => ({ op: 'count' }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'raw', s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
    media: wrap('media'),
    clients: wrap('clients'),
    customDomainHistory: wrap('customDomainHistory'),
    aiConversations: wrap('aiConversations'),
    aiMessages: wrap('aiMessages'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock — select / insert / update chains, all thenable
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertQueue: Array<Array<Record<string, unknown>>> = [];
let updateQueue: Array<Array<Record<string, unknown>>> = [];

const insertCalls: Array<{ table: string; values: unknown }> = [];
const updateSetCalls: Array<{ table: string; values: Record<string, unknown>; where: unknown }> =
  [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function shiftInsert(): Array<Record<string, unknown>> {
  return insertQueue.shift() ?? [];
}
function shiftUpdate(): Array<Record<string, unknown>> {
  return updateQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftSelect());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit() {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materializedPromise!.then(onF, onR);
            },
          };
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildInsert(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      values(values: unknown) {
        insertCalls.push({ table: tableName, values });
        let materialized: Array<Record<string, unknown>> | null = null;
        const getRows = () => {
          if (materialized === null) materialized = shiftInsert();
          return materialized;
        };
        const inner: Record<string, unknown> = {};
        inner.onConflictDoNothing = () => Promise.resolve(getRows());
        inner.onConflictDoUpdate = () => Promise.resolve(getRows());
        inner.returning = () => Promise.resolve(getRows());
        inner.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve(getRows()).then(onF, onR);
        return inner;
      },
    };
  }

  function buildUpdate(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    let pendingValues: Record<string, unknown> = {};
    return {
      set(values: Record<string, unknown>) {
        pendingValues = values;
        return {
          where(w: unknown) {
            updateSetCalls.push({ table: tableName, values: pendingValues, where: w });
            const rows = shiftUpdate();
            const ret = {
              returning: () => Promise.resolve(rows),
              then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
                Promise.resolve(rows).then(onF, onR),
            };
            return ret;
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
      insert(table: { __table?: string } | undefined) {
        return buildInsert(table);
      },
      update(table: { __table?: string } | undefined) {
        return buildUpdate(table);
      },
    },
  };
});

// ---- modules under test ----
const mediaUploadRoute = await import('@/app/api/media/upload/route');
const domainVerifyRoute = await import('@/app/api/portal/agency/custom-domain/verify/route');
const aiConvByIdRoute = await import('@/app/api/portal/ai/conversations/[id]/route');
const aiConvListRoute = await import('@/app/api/portal/ai/conversations/route');

// ---- helpers ----
function makeFormDataRequest(form: FormData): Request {
  // Use built-in Request with FormData body
  return new Request('http://x/api/media/upload', {
    method: 'POST',
    body: form,
  });
}

const ADMIN_SESSION = { user: { id: '7', name: 'Adam', role: 'admin' } };

beforeEach(() => {
  selectQueue = [];
  insertQueue = [];
  updateQueue = [];
  insertCalls.length = 0;
  updateSetCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalRoleMock.mockReset();
  uploadToS3Mock.mockReset();
  verifyDomainOwnershipMock.mockReset();
  clearCustomDomainCacheMock.mockReset();
  sharpMetadataMock.mockReset();
  // reset env that the route module reads at top-level
  delete process.env.ALLOWED_FILE_TYPES;
});

// ===========================================================================
// POST /api/media/upload
// ===========================================================================

describe('POST /api/media/upload', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const fd = new FormData();
    const res = await mediaUploadRoute.POST(makeFormDataRequest(fd) as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Unauthorized/);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const fd = new FormData();
    const res = await mediaUploadRoute.POST(makeFormDataRequest(fd) as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 when portal client is missing', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const fd = new FormData();
    const res = await mediaUploadRoute.POST(makeFormDataRequest(fd) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/No portal client found/);
  });

  it('returns 400 when no file is provided', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    const fd = new FormData();
    const res = await mediaUploadRoute.POST(makeFormDataRequest(fd) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No file provided/);
  });

  it('uploads, extracts dimensions for images, and inserts media row', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'stored-pic.png',
      mimeType: 'image/png',
      fileSize: 1234,
      url: 'https://cdn/pic.png',
    });
    sharpMetadataMock.mockResolvedValue({ width: 800, height: 600 });
    insertQueue.push([
      {
        id: 42,
        filename: 'pic.png',
        storedFilename: 'stored-pic.png',
        url: 'https://cdn/pic.png',
        width: 800,
        height: 600,
        clientId: 11,
      },
    ]);

    const fd = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' });
    fd.append('file', file);
    fd.append('alt', 'a pic');
    fd.append('caption', 'caption text');

    const res = await mediaUploadRoute.POST(makeFormDataRequest(fd) as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
    expect(uploadToS3Mock).toHaveBeenCalledTimes(1);
    const insertedMedia = insertCalls.find(c => c.table === 'media')!;
    const v = insertedMedia.values as Record<string, unknown>;
    expect(v.filename).toBe('pic.png');
    expect(v.width).toBe(800);
    expect(v.height).toBe(600);
    expect(v.alt).toBe('a pic');
    expect(v.caption).toBe('caption text');
    expect(v.clientId).toBe(11);
    expect(v.uploadedBy).toBe(7);
  });

  it('continues without dimensions if sharp throws', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'stored.jpg',
      mimeType: 'image/jpeg',
      fileSize: 100,
      url: 'https://cdn/x.jpg',
    });
    sharpMetadataMock.mockRejectedValue(new Error('bad image'));
    insertQueue.push([{ id: 50 }]);

    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([1])], 'x.jpg', { type: 'image/jpeg' }));
    const res = await mediaUploadRoute.POST(makeFormDataRequest(fd) as never);
    expect(res.status).toBe(201);
    const insertedMedia = insertCalls.find(c => c.table === 'media')!;
    const v = insertedMedia.values as Record<string, unknown>;
    expect(v.width).toBeNull();
    expect(v.height).toBeNull();
  });

  it('does not call sharp for non-image files (PDF)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'doc.pdf',
      mimeType: 'application/pdf',
      fileSize: 200,
      url: 'https://cdn/doc.pdf',
    });
    insertQueue.push([{ id: 99 }]);

    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' }));
    const res = await mediaUploadRoute.POST(makeFormDataRequest(fd) as never);
    expect(res.status).toBe(201);
    expect(sharpMetadataMock).not.toHaveBeenCalled();
    const insertedMedia = insertCalls.find(c => c.table === 'media')!;
    const v = insertedMedia.values as Record<string, unknown>;
    expect(v.width).toBeNull();
    expect(v.height).toBeNull();
    expect(v.alt).toBeNull();
    expect(v.caption).toBeNull();
  });

  it('returns 500 when upload throws', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    uploadToS3Mock.mockRejectedValue(new Error('s3 down'));

    const fd = new FormData();
    fd.append('file', new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' }));
    const res = await mediaUploadRoute.POST(makeFormDataRequest(fd) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Upload failed/);
  });
});

// ===========================================================================
// POST /api/portal/agency/custom-domain/verify
// ===========================================================================

describe('POST /api/portal/agency/custom-domain/verify', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Unauthorized/);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Client not found/);
  });

  it('returns 403 when role is not owner/admin', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    getPortalRoleMock.mockResolvedValue('member');
    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Owner or admin role required/);
  });

  it('returns 400 when no domain pending verification', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectQueue.push([]); // no row
    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No custom domain pending/);
  });

  it('returns 400 when row exists but no token/domain', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    getPortalRoleMock.mockResolvedValue('admin');
    selectQueue.push([{ customDomain: null, token: null, verifiedAt: null }]);
    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(400);
  });

  it('returns 422 when DNS verification fails', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectQueue.push([
      { customDomain: 'example.com', token: 'tok-abc', verifiedAt: null },
    ]);
    verifyDomainOwnershipMock.mockResolvedValue(false);
    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/TXT record not found/);
    expect(body.data.verificationRecord.host).toBe('_simplerdev.example.com');
    expect(body.data.verificationRecord.type).toBe('TXT');
    expect(body.data.verificationRecord.value).toBe('tok-abc');
  });

  it('verifies, stamps verifiedAt, inserts history, and clears cache on first success', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectQueue.push([
      { customDomain: 'example.com', token: 'tok-abc', verifiedAt: null },
    ]);
    verifyDomainOwnershipMock.mockResolvedValue(true);
    updateQueue.push([{ id: 11 }]);
    insertQueue.push([{ id: 1 }]);

    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.customDomain).toBe('example.com');
    expect(body.data.verifiedAt).toBeDefined();

    // verify update was called on clients table with verifiedAt + updatedAt
    expect(updateSetCalls).toHaveLength(1);
    const upd = updateSetCalls[0];
    expect(upd.table).toBe('clients');
    expect(upd.values.customDomainVerifiedAt).toBeInstanceOf(Date);
    expect(upd.values.updatedAt).toBeInstanceOf(Date);

    // history insert
    const hist = insertCalls.find(c => c.table === 'customDomainHistory')!;
    expect(hist).toBeDefined();
    const hv = hist.values as Record<string, unknown>;
    expect(hv.clientId).toBe(11);
    expect(hv.domain).toBe('example.com');
    expect(hv.action).toBe('verified');
    expect(hv.byUserId).toBe(7);

    expect(clearCustomDomainCacheMock).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when already verified (no update/insert/cache-clear)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    getPortalRoleMock.mockResolvedValue('admin');
    const existingVerifiedAt = new Date('2026-01-01T00:00:00Z');
    selectQueue.push([
      { customDomain: 'example.com', token: 'tok-abc', verifiedAt: existingVerifiedAt },
    ]);
    verifyDomainOwnershipMock.mockResolvedValue(true);

    const res = await domainVerifyRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.customDomain).toBe('example.com');
    expect(new Date(body.data.verifiedAt).toISOString()).toBe(existingVerifiedAt.toISOString());
    expect(updateSetCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
    expect(clearCustomDomainCacheMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/portal/ai/conversations/[id]
// ===========================================================================

describe('GET /api/portal/ai/conversations/[id]', () => {
  const buildArgs = (id = '5') => ({
    params: Promise.resolve({ id }),
  });

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await aiConvByIdRoute.GET(new Request('http://x'), buildArgs());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await aiConvByIdRoute.GET(new Request('http://x'), buildArgs());
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await aiConvByIdRoute.GET(new Request('http://x'), buildArgs());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Not found/);
  });

  it('returns 404 when conversation does not exist', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    selectQueue.push([]); // conversation lookup
    const res = await aiConvByIdRoute.GET(new Request('http://x'), buildArgs('99'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Not found/);
  });

  it('returns 404 when conversation belongs to another client', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    selectQueue.push([{ id: 5, clientId: 999, title: 'other' }]);
    const res = await aiConvByIdRoute.GET(new Request('http://x'), buildArgs('5'));
    expect(res.status).toBe(404);
  });

  it('returns conversation and messages on success', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    selectQueue.push([{ id: 5, clientId: 11, title: 'My convo' }]);
    selectQueue.push([
      { id: 100, conversationId: 5, role: 'user', content: 'hi' },
      { id: 101, conversationId: 5, role: 'assistant', content: 'hello' },
    ]);
    const res = await aiConvByIdRoute.GET(new Request('http://x'), buildArgs('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversation.id).toBe(5);
    expect(body.data.conversation.title).toBe('My convo');
    expect(body.data.messages).toHaveLength(2);
    expect(body.data.messages[0].content).toBe('hi');
  });

  it('returns 500 on unexpected error', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockRejectedValue(new Error('boom'));
    const res = await aiConvByIdRoute.GET(new Request('http://x'), buildArgs('5'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Internal server error/);
  });
});

// ===========================================================================
// GET /api/portal/ai/conversations
// ===========================================================================

describe('GET /api/portal/ai/conversations', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await aiConvListRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await aiConvListRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await aiConvListRoute.GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Not found/);
  });

  it('returns conversations list for client', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    selectQueue.push([
      { id: 1, clientId: 11, title: 'A', updatedAt: new Date('2026-05-01') },
      { id: 2, clientId: 11, title: 'B', updatedAt: new Date('2026-04-01') },
    ]);
    const res = await aiConvListRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].title).toBe('A');
  });

  it('returns empty list when none exist', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 11 });
    selectQueue.push([]);
    const res = await aiConvListRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 500 on unexpected error', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockRejectedValue(new Error('db down'));
    const res = await aiConvListRoute.GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Internal server error/);
  });
});
