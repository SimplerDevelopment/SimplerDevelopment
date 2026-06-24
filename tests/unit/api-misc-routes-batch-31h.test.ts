// @vitest-environment node
/**
 * Batch 31h — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/media/upload/route.ts                  (POST)
 *  - app/api/portal/my-subdomain/route.ts                  (GET)
 *  - app/api/portal/posts/[id]/experiments/route.ts        (GET, POST)
 *  - app/api/portal/projects/[id]/columns/route.ts         (GET, POST)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy). db.insert is mocked to capture writes and emit the
 * next queued return rows.
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
const getPortalClientsMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalClients: (...args: unknown[]) => getPortalClientsMock(...args),
}));

// uploadToS3
const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

// sharp — mock as a callable that returns { metadata() }
const sharpMetadataMock = vi.fn();
vi.mock('sharp', () => ({
  default: (_buf: Buffer) => ({
    metadata: () => sharpMetadataMock(),
  }),
}));

// portal-auth: authorizePortal + isAuthError
const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn((r: unknown) =>
  Boolean(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>)),
);
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

// authorizePostForUser + normalizeSplit
const authorizePostForUserMock = vi.fn();
vi.mock('@/lib/ab/access', () => ({
  authorizePostForUser: (...args: unknown[]) => authorizePostForUserMock(...args),
}));

const normalizeSplitMock = vi.fn();
vi.mock('@/lib/ab/assign', () => ({
  normalizeSplit: (...args: unknown[]) => normalizeSplitMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
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
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables. Special-case columns referenced by orderBy so they
// look like ordinary column identifiers when forwarded.
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
    media: wrap('media'),
    clientWebsites: wrap('clientWebsites'),
    brandingProfiles: wrap('brandingProfiles'),
    users: wrap('users'),
    clients: wrap('clients'),
    abExperiments: wrap('abExperiments'),
    abVariants: wrap('abVariants'),
    projects: wrap('projects'),
    kanbanColumns: wrap('kanbanColumns'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];

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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const mediaUploadRoute = await import('@/app/api/portal/media/upload/route');
const mySubdomainRoute = await import('@/app/api/portal/my-subdomain/route');
const experimentsRoute = await import('@/app/api/portal/posts/[id]/experiments/route');
const columnsRoute = await import('@/app/api/portal/projects/[id]/columns/route');

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

// Build a fake FormData-bearing request. We bypass `new Request(.. body: fd)`
// because Node's polyfilled FormData isn't reliably accepted across runtimes;
// instead we craft a minimal object that exposes `formData()` directly.
function makeFormDataReq(entries: Record<string, unknown>) {
  const fd = {
    get(name: string) {
      return entries[name] ?? null;
    },
  };
  return {
    formData: async () => fd,
  } as unknown as Request;
}

const SESSION = { user: { id: '7' } };
const STAFF_SESSION = { user: { id: '7', role: 'admin' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalClientsMock.mockReset();
  uploadToS3Mock.mockReset();
  sharpMetadataMock.mockReset();
  authorizePortalMock.mockReset();
  authorizePostForUserMock.mockReset();
  normalizeSplitMock.mockReset();
});

// ===========================================================================
// POST /api/portal/media/upload
// ===========================================================================

describe('POST /api/portal/media/upload', () => {
  it('returns 401 when no session', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({}) as unknown as Request,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(
        JSON.stringify({ success: false, message: 'Client not found' }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      ),
    });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({}) as unknown as Request,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when no file is provided', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({}) as unknown as Request,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('No file provided');
  });

  // NOTE: MAX_FILE_SIZE and ALLOWED_TYPES are read at module load (top-level
  // constants in route.ts), so we can't toggle them per-test. The defaults
  // are: MAX_FILE_SIZE=10MB, ALLOWED_TYPES=[] (all types allowed). We test
  // the "exceeds" path by crafting a file larger than 10MB; the "type not
  // allowed" path is unreachable with the default empty allowlist, but the
  // gate is exercised in the happy-path tests below.

  it('returns 400 when file exceeds 10MB default size limit', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    // Build a Blob > 10MB without allocating a giant string — use a typed array.
    const huge = new Uint8Array(10 * 1024 * 1024 + 10); // 10MB + 10 bytes
    const big = new File([huge], 'big.txt', { type: 'text/plain' });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({ file: big }) as unknown as Request,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/exceeds/);
  });

  it('returns 400 when client has no websites', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    selectQueue.push([]); // firstSite lookup → none
    const file = new File(['hi'], 'a.txt', { type: 'text/plain' });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({ file }) as unknown as Request,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('No websites found');
  });

  it('inserts a media row and returns 201 (text file, no metadata, no brandingProfile)', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 88 }]); // firstSite
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'stored-a.txt',
      mimeType: 'text/plain',
      fileSize: 2,
      url: 'https://s3.example/a.txt',
    });
    insertReturnQueue.push([{ id: 99, filename: 'a.txt' }]);

    const file = new File(['hi'], 'a.txt', { type: 'text/plain' });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({ file, alt: 'alt text', caption: 'cap' }) as unknown as Request,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('media');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.filename).toBe('a.txt');
    expect(inserted.alt).toBe('alt text');
    expect(inserted.caption).toBe('cap');
    expect(inserted.clientId).toBe(5);
    expect(inserted.websiteId).toBe(88);
    expect(inserted.brandingProfileId).toBeNull();
    expect(inserted.uploadedBy).toBe(7);
    expect(inserted.width).toBeNull();
    expect(inserted.height).toBeNull();
  });

  it('extracts width/height from sharp metadata for images', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 88 }]);
    sharpMetadataMock.mockResolvedValue({ width: 640, height: 480 });
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'stored.png',
      mimeType: 'image/png',
      fileSize: 4,
      url: 'https://s3.example/p.png',
    });
    insertReturnQueue.push([{ id: 101 }]);

    const file = new File(['data'], 'p.png', { type: 'image/png' });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({ file }) as unknown as Request,
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.width).toBe(640);
    expect(inserted.height).toBe(480);
  });

  it('swallows sharp errors and inserts with null dimensions', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 88 }]);
    sharpMetadataMock.mockRejectedValue(new Error('bad pixels'));
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 'stored.png',
      mimeType: 'image/png',
      fileSize: 4,
      url: 'https://s3.example/p.png',
    });
    insertReturnQueue.push([{ id: 102 }]);

    const file = new File(['data'], 'p.png', { type: 'image/png' });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({ file }) as unknown as Request,
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.width).toBeNull();
    expect(inserted.height).toBeNull();
  });

  it('uses provided brandingProfileId when it belongs to the client', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 88 }]); // firstSite
    selectQueue.push([{ id: 17 }]); // brandingProfile lookup matches
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 's',
      mimeType: 'text/plain',
      fileSize: 1,
      url: 'u',
    });
    insertReturnQueue.push([{ id: 103 }]);

    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({ file, brandingProfileId: '17' }) as unknown as Request,
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.brandingProfileId).toBe(17);
  });

  it('ignores brandingProfileId when it does not belong to the client', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    selectQueue.push([{ id: 88 }]); // firstSite
    selectQueue.push([]); // brandingProfile lookup empty
    uploadToS3Mock.mockResolvedValue({
      storedFilename: 's',
      mimeType: 'text/plain',
      fileSize: 1,
      url: 'u',
    });
    insertReturnQueue.push([{ id: 104 }]);

    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    const res = await mediaUploadRoute.POST(
      makeFormDataReq({ file, brandingProfileId: '999' }) as unknown as Request,
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.brandingProfileId).toBeNull();
  });
});

// ===========================================================================
// GET /api/portal/my-subdomain
// ===========================================================================

describe('GET /api/portal/my-subdomain', () => {
  it('returns empty payload when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mySubdomainRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subdomain).toBeNull();
    expect(body.portals).toEqual([]);
    expect(body.needsChoice).toBe(false);
  });

  it('returns empty payload when user has no clients', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: null }]); // user row
    getPortalClientsMock.mockResolvedValue([]);
    const res = await mySubdomainRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subdomain).toBeNull();
    expect(body.portals).toEqual([]);
    expect(body.needsChoice).toBe(false);
  });

  it('returns single-client payload (no choice needed)', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: null }]); // user row
    getPortalClientsMock.mockResolvedValue([{ id: 5, company: 'Acme Co' }]);
    // For each client: client row, then subdomain lookups in getClientSubdomain.
    selectQueue.push([{ defaultWebsiteId: null }]); // clients row
    selectQueue.push([{ subdomain: 'acme' }]); // fallback subdomain lookup
    const res = await mySubdomainRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subdomain).toBe('acme');
    expect(body.portals).toHaveLength(1);
    expect(body.portals[0].clientId).toBe(5);
    expect(body.portals[0].company).toBe('Acme Co');
    expect(body.portals[0].subdomain).toBe('acme');
    expect(body.needsChoice).toBe(false);
  });

  it('prefers defaultWebsiteId when set on the client', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: null }]);
    getPortalClientsMock.mockResolvedValue([{ id: 5, company: 'Acme' }]);
    selectQueue.push([{ defaultWebsiteId: 42 }]); // clients row
    selectQueue.push([{ subdomain: 'preferred' }]); // default website subdomain lookup
    const res = await mySubdomainRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.portals[0].subdomain).toBe('preferred');
    expect(body.subdomain).toBe('preferred');
  });

  it('falls back to first website when defaultWebsiteId lookup returns no subdomain', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: null }]);
    getPortalClientsMock.mockResolvedValue([{ id: 5, company: 'Acme' }]);
    selectQueue.push([{ defaultWebsiteId: 42 }]); // client row
    selectQueue.push([{ subdomain: null }]); // default website missing subdomain
    selectQueue.push([{ subdomain: 'fallback' }]); // first-site fallback
    const res = await mySubdomainRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subdomain).toBe('fallback');
  });

  it('returns "Unnamed" when client has no company name', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: null }]);
    getPortalClientsMock.mockResolvedValue([{ id: 5, company: null }]);
    selectQueue.push([{ defaultWebsiteId: null }]);
    selectQueue.push([{ subdomain: 'sd' }]);
    const res = await mySubdomainRoute.GET();
    const body = await res.json();
    expect(body.portals[0].company).toBe('Unnamed');
  });

  it('returns multi-client payload with needsChoice=true when no default set', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: null }]);
    getPortalClientsMock.mockResolvedValue([
      { id: 5, company: 'Acme' },
      { id: 6, company: 'Beta' },
    ]);
    // client #1
    selectQueue.push([{ defaultWebsiteId: null }]);
    selectQueue.push([{ subdomain: 'acme' }]);
    // client #2
    selectQueue.push([{ defaultWebsiteId: null }]);
    selectQueue.push([{ subdomain: 'beta' }]);
    const res = await mySubdomainRoute.GET();
    const body = await res.json();
    expect(body.subdomain).toBeNull();
    expect(body.needsChoice).toBe(true);
    expect(body.portals).toHaveLength(2);
  });

  it('uses defaultClientId when set and matching a portal', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: 6 }]);
    getPortalClientsMock.mockResolvedValue([
      { id: 5, company: 'Acme' },
      { id: 6, company: 'Beta' },
    ]);
    selectQueue.push([{ defaultWebsiteId: null }]);
    selectQueue.push([{ subdomain: 'acme' }]);
    selectQueue.push([{ defaultWebsiteId: null }]);
    selectQueue.push([{ subdomain: 'beta' }]);
    const res = await mySubdomainRoute.GET();
    const body = await res.json();
    expect(body.subdomain).toBe('beta');
    expect(body.needsChoice).toBe(false);
    expect(body.defaultClientId).toBe(6);
  });

  it('falls through to needsChoice when defaultClientId does not match any portal', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([{ defaultClientId: 999 }]);
    getPortalClientsMock.mockResolvedValue([
      { id: 5, company: 'Acme' },
      { id: 6, company: 'Beta' },
    ]);
    selectQueue.push([{ defaultWebsiteId: null }]);
    selectQueue.push([{ subdomain: 'acme' }]);
    selectQueue.push([{ defaultWebsiteId: null }]);
    selectQueue.push([{ subdomain: 'beta' }]);
    const res = await mySubdomainRoute.GET();
    const body = await res.json();
    expect(body.needsChoice).toBe(true);
  });
});

// ===========================================================================
// GET /api/portal/posts/[id]/experiments
// ===========================================================================

describe('GET /api/portal/posts/[id]/experiments', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await experimentsRoute.GET(
      makeReq('http://x/api/portal/posts/9/experiments'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('returns 404 when user lacks access to the post', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue(null);
    const res = await experimentsRoute.GET(
      makeReq('http://x/api/portal/posts/9/experiments'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('returns list of experiments for the post', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue({ postId: 9, siteId: 1, clientId: 5 });
    selectQueue.push([
      { id: 1, postId: 9, name: 'Exp A', status: 'draft' },
      { id: 2, postId: 9, name: 'Exp B', status: 'running' },
    ]);
    const res = await experimentsRoute.GET(
      makeReq('http://x/api/portal/posts/9/experiments'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

// ===========================================================================
// POST /api/portal/posts/[id]/experiments
// ===========================================================================

describe('POST /api/portal/posts/[id]/experiments', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await experimentsRoute.POST(
      makeJsonReq('http://x/api/portal/posts/9/experiments', 'POST', { name: 'X' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when post access is denied', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue(null);
    const res = await experimentsRoute.POST(
      makeJsonReq('http://x/api/portal/posts/9/experiments', 'POST', { name: 'X' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid JSON body', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue({ postId: 9, siteId: 1, clientId: 5 });
    const req = new Request('http://x/api/portal/posts/9/experiments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    });
    const res = await experimentsRoute.POST(req, {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('returns 400 when name is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue({ postId: 9, siteId: 1, clientId: 5 });
    const res = await experimentsRoute.POST(
      makeJsonReq('http://x/api/portal/posts/9/experiments', 'POST', {}),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('name_required');
  });

  it('returns 400 when name is only whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue({ postId: 9, siteId: 1, clientId: 5 });
    const res = await experimentsRoute.POST(
      makeJsonReq('http://x/api/portal/posts/9/experiments', 'POST', { name: '   ' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('name_required');
  });

  it('returns 400 when goalMetric is invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue({ postId: 9, siteId: 1, clientId: 5 });
    const res = await experimentsRoute.POST(
      makeJsonReq('http://x/api/portal/posts/9/experiments', 'POST', {
        name: 'My Exp',
        goalMetric: 'video_play',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_goal_metric');
  });

  it('creates an experiment with default 50/50 split and seeds a+b variants', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue({ postId: 9, siteId: 1, clientId: 5 });
    insertReturnQueue.push([{ id: 77, postId: 9, name: 'My Exp', status: 'draft' }]);
    // variants insert returns nothing meaningful

    const res = await experimentsRoute.POST(
      makeJsonReq('http://x/api/portal/posts/9/experiments', 'POST', {
        name: 'My Exp',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(77);

    // Experiment insert
    expect(insertCalls[0].table).toBe('abExperiments');
    const expInsert = insertCalls[0].values as Record<string, unknown>;
    expect(expInsert.postId).toBe(9);
    expect(expInsert.name).toBe('My Exp');
    expect(expInsert.status).toBe('draft');
    expect(expInsert.goalMetric).toBe('page_view');
    expect(expInsert.goalSelector).toBeNull();
    expect(expInsert.hypothesis).toBeNull();
    expect(expInsert.variantSplit).toEqual({ a: 50, b: 50 });
    expect(expInsert.createdBy).toBe(7);

    // Variants insert
    expect(insertCalls[1].table).toBe('abVariants');
    const variants = insertCalls[1].values as Array<Record<string, unknown>>;
    expect(variants).toHaveLength(2);
    expect(variants[0].key).toBe('a');
    expect(variants[0].label).toBe('Control');
    expect(variants[0].blockTreeOverride).toBeNull();
    expect(variants[1].key).toBe('b');
    expect(variants[1].label).toBe('Variant B');
    // _i must NOT survive into the inserted row
    expect('_i' in variants[0]).toBe(false);
    expect('_i' in variants[1]).toBe(false);
  });

  it('honors a custom variantSplit by invoking normalizeSplit', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue({ postId: 9, siteId: 1, clientId: 5 });
    normalizeSplitMock.mockReturnValue({ a: 60, b: 30, c: 10 });
    insertReturnQueue.push([{ id: 78, postId: 9, name: 'Tri' }]);

    const res = await experimentsRoute.POST(
      makeJsonReq('http://x/api/portal/posts/9/experiments', 'POST', {
        name: 'Tri',
        variantSplit: { a: 6, b: 3, c: 1 },
        hypothesis: 'Three variants beat two',
        goalSelector: '#cta',
        goalMetric: 'cta_click',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(normalizeSplitMock).toHaveBeenCalledWith({ a: 6, b: 3, c: 1 });
    const expInsert = insertCalls[0].values as Record<string, unknown>;
    expect(expInsert.variantSplit).toEqual({ a: 60, b: 30, c: 10 });
    expect(expInsert.hypothesis).toBe('Three variants beat two');
    expect(expInsert.goalSelector).toBe('#cta');
    expect(expInsert.goalMetric).toBe('cta_click');

    const variants = insertCalls[1].values as Array<Record<string, unknown>>;
    expect(variants).toHaveLength(3);
    expect(variants.map((v) => v.key).sort()).toEqual(['a', 'b', 'c']);
    // First key 'a' → Control; others use uppercase key
    const labelByKey = Object.fromEntries(variants.map((v) => [v.key, v.label]));
    expect(labelByKey.a).toBe('Control');
    expect(labelByKey.b).toBe('Variant B');
    expect(labelByKey.c).toBe('Variant C');
  });

  it('falls back to default 50/50 split when variantSplit is an empty object', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePostForUserMock.mockResolvedValue({ postId: 9, siteId: 1, clientId: 5 });
    insertReturnQueue.push([{ id: 79 }]);
    const res = await experimentsRoute.POST(
      makeJsonReq('http://x/api/portal/posts/9/experiments', 'POST', {
        name: 'Empty Split',
        variantSplit: {},
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(normalizeSplitMock).not.toHaveBeenCalled();
    const expInsert = insertCalls[0].values as Record<string, unknown>;
    expect(expInsert.variantSplit).toEqual({ a: 50, b: 50 });
  });
});

// ===========================================================================
// GET /api/portal/projects/[id]/columns
// ===========================================================================

describe('GET /api/portal/projects/[id]/columns', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await columnsRoute.GET(
      makeReq('http://x/api/portal/projects/9/columns'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 403 when non-staff user has no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await columnsRoute.GET(
      makeReq('http://x/api/portal/projects/9/columns'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe('Forbidden');
  });

  it('returns 404 when non-staff user does not own the project', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // projects lookup → none
    const res = await columnsRoute.GET(
      makeReq('http://x/api/portal/projects/9/columns'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns columns when non-staff user owns the project', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5 }]); // project ownership confirmed
    selectQueue.push([
      { id: 1, projectId: 9, name: 'To Do', order: 0 },
      { id: 2, projectId: 9, name: 'Done', order: 1 },
    ]);
    const res = await columnsRoute.GET(
      makeReq('http://x/api/portal/projects/9/columns'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('staff bypasses ownership check', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 9, name: 'To Do', order: 0 }]);
    const res = await columnsRoute.GET(
      makeReq('http://x/api/portal/projects/9/columns'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    // No portal-client lookup invoked
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /api/portal/projects/[id]/columns
// ===========================================================================

describe('POST /api/portal/projects/[id]/columns', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await columnsRoute.POST(
      makeJsonReq('http://x/api/portal/projects/9/columns', 'POST', { name: 'X' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when non-staff user has no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await columnsRoute.POST(
      makeJsonReq('http://x/api/portal/projects/9/columns', 'POST', { name: 'X' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when non-staff user does not own the project', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // project lookup empty
    const res = await columnsRoute.POST(
      makeJsonReq('http://x/api/portal/projects/9/columns', 'POST', { name: 'X' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('appends a column at the end of the existing list', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    // No project ownership check for staff; just the existing-columns query.
    selectQueue.push([
      { id: 1, projectId: 9, order: 0 },
      { id: 2, projectId: 9, order: 1 },
    ]);
    insertReturnQueue.push([{ id: 3, projectId: 9, name: 'New', order: 2 }]);

    const res = await columnsRoute.POST(
      makeJsonReq('http://x/api/portal/projects/9/columns', 'POST', {
        name: 'New',
        color: '#abcdef',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(3);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.table).toBeUndefined();
    expect(insertCalls[0].table).toBe('kanbanColumns');
    expect(inserted.projectId).toBe(9);
    expect(inserted.name).toBe('New');
    expect(inserted.color).toBe('#abcdef');
    expect(inserted.order).toBe(2);
  });

  it('defaults color to null when omitted', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // no existing columns
    insertReturnQueue.push([{ id: 4, name: 'Solo' }]);
    const res = await columnsRoute.POST(
      makeJsonReq('http://x/api/portal/projects/9/columns', 'POST', { name: 'Solo' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.color).toBeNull();
    expect(inserted.order).toBe(0);
  });

  it('non-staff user with project ownership can create a column', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9, clientId: 5 }]); // ownership
    selectQueue.push([]); // existing columns
    insertReturnQueue.push([{ id: 5, name: 'OK' }]);
    const res = await columnsRoute.POST(
      makeJsonReq('http://x/api/portal/projects/9/columns', 'POST', { name: 'OK' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(5);
  });
});
