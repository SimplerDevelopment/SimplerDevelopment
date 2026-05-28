// @vitest-environment node
/**
 * Batch 36a — unit tests for 4 portal CMS routes.
 *
 * Routes covered:
 *  - app/api/portal/cms/websites/[siteId]/media/upload/route.ts (POST)
 *  - app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route.ts (GET, POST)
 *  - app/api/portal/cms/websites/[siteId]/posts/picker/route.ts (GET)
 *  - app/api/portal/cms/websites/[siteId]/posts/route.ts (GET, POST)
 *
 * Strategy: heavy mocking. All external deps (auth, db, drizzle, portal-client,
 * s3 upload, sharp, block-allowlist) are mocked. db.select() consumes results
 * from a per-test FIFO queue; db.insert() and db.update() return queued
 * returning() rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: () => ({ op: 'sql' }),
}));

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
  return {
    media: wrap('media'),
    posts: wrap('posts'),
    postRevisions: wrap('postRevisions'),
    postCategories: wrap('postCategories'),
    postTags: wrap('postTags'),
    clientWebsites: wrap('clientWebsites'),
  };
});

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveClientSiteMock = vi.fn();
const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

const sharpMetadataMock = vi.fn();
vi.mock('sharp', () => ({
  default: () => ({ metadata: sharpMetadataMock }),
}));

const assertBlocksAllowedForRoleMock = vi.fn();
class BlockGateError extends Error {
  constructor(public restrictedType: string) {
    super(`Block type '${restrictedType}' may only be authored by admin/editor staff.`);
  }
}
vi.mock('@/lib/security/block-allowlist', () => ({
  assertBlocksAllowedForRole: (...args: unknown[]) =>
    assertBlocksAllowedForRoleMock(...args),
  BlockGateError,
}));

// ---------------------------------------------------------------------------
// DB mock with select/insert/update queues
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturningQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturningQueue: Array<Array<Record<string, unknown>>> = [];
let insertCalls: Array<{ table: string; values: unknown }> = [];
let updateCalls: Array<{ table: string; set: unknown; where: unknown }> = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) materialized = Promise.resolve(shiftSelect());
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: unknown) {
        insertCalls.push({ table: table.__table, values: vals });
        const out: Record<string, unknown> = {
          returning() {
            return Promise.resolve(insertReturningQueue.shift() ?? []);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            // For inserts without .returning() (e.g. join tables)
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
        return out;
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    const state: { set: unknown; where: unknown } = { set: null, where: null };
    const chain: Record<string, unknown> = {
      set(v: unknown) {
        state.set = v;
        return chain;
      },
      where(w: unknown) {
        state.where = w;
        return chain;
      },
      returning() {
        updateCalls.push({ table: table.__table, set: state.set, where: state.where });
        return Promise.resolve(updateReturningQueue.shift() ?? []);
      },
    };
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test
// ---------------------------------------------------------------------------

const uploadRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/media/upload/route'
);
const UPLOAD_POST = uploadRoute.POST;

const revisionsRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route'
);
const REVISIONS_GET = revisionsRoute.GET;
const REVISIONS_POST = revisionsRoute.POST;

const pickerRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/posts/picker/route'
);
const PICKER_GET = pickerRoute.GET;

const postsRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/posts/route'
);
const POSTS_GET = postsRoute.GET;
const POSTS_POST = postsRoute.POST;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function siteParams(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

function siteAndPostParams(siteId: string, postId: string) {
  return { params: Promise.resolve({ siteId, postId }) };
}

beforeEach(() => {
  selectQueue = [];
  insertReturningQueue = [];
  updateReturningQueue = [];
  insertCalls = [];
  updateCalls = [];

  authMock.mockReset();
  resolveClientSiteMock.mockReset();
  getPortalClientMock.mockReset();
  uploadToS3Mock.mockReset();
  sharpMetadataMock.mockReset();
  assertBlocksAllowedForRoleMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7', email: 'u@example.com', role: 'admin' } });
  resolveClientSiteMock.mockResolvedValue({ id: 55, brandingProfileId: 99 });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  assertBlocksAllowedForRoleMock.mockReturnValue(undefined);
});

// ===========================================================================
// POST /api/portal/cms/websites/[siteId]/media/upload
// ===========================================================================

describe('POST /api/portal/cms/websites/[siteId]/media/upload', () => {
  function makeReq(form: FormData): Request {
    return new Request('http://x/api/portal/cms/websites/55/media/upload', {
      method: 'POST',
      body: form,
    });
  }

  function makeFile(
    name = 'pic.png',
    size = 16,
    type = 'image/png',
  ): File {
    return new File([new Uint8Array(size)], name, { type });
  }

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const form = new FormData();
    form.set('file', makeFile());
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const form = new FormData();
    form.set('file', makeFile());
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when no file field is provided', async () => {
    const form = new FormData();
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/No file provided/);
  });

  it('returns 400 when file exceeds MAX_FILE_SIZE', async () => {
    const huge = new Uint8Array(10 * 1024 * 1024 + 1); // 1 over 10MB default
    const form = new FormData();
    form.set('file', new File([huge], 'big.png', { type: 'image/png' }));
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/exceeds.*MB limit/);
  });

  it('uploads image and inserts media row with sharp-derived dimensions', async () => {
    uploadToS3Mock.mockResolvedValueOnce({
      url: '/api/media/proxy/media/u.png',
      storedFilename: 'u.png',
      mimeType: 'image/png',
      fileSize: 16,
    });
    sharpMetadataMock.mockResolvedValueOnce({ width: 200, height: 100 });
    insertReturningQueue.push([
      { id: 1, filename: 'pic.png', width: 200, height: 100 },
    ]);

    const form = new FormData();
    form.set('file', makeFile('pic.png', 16, 'image/png'));
    form.set('alt', 'a picture');
    form.set('caption', 'cap');
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(uploadToS3Mock).toHaveBeenCalled();
    expect(insertCalls).toHaveLength(1);
    const insertedValues = insertCalls[0].values as Record<string, unknown>;
    expect(insertedValues.alt).toBe('a picture');
    expect(insertedValues.caption).toBe('cap');
    expect(insertedValues.width).toBe(200);
    expect(insertedValues.height).toBe(100);
    expect(insertedValues.uploadedBy).toBe(7);
    expect(insertedValues.clientId).toBe(10);
    expect(insertedValues.websiteId).toBe(55);
    expect(insertedValues.brandingProfileId).toBe(99);
  });

  it('uploads non-image without calling sharp and stores null dimensions', async () => {
    uploadToS3Mock.mockResolvedValueOnce({
      url: '/u',
      storedFilename: 's',
      mimeType: 'application/pdf',
      fileSize: 32,
    });
    insertReturningQueue.push([{ id: 2 }]);

    const form = new FormData();
    form.set('file', makeFile('doc.pdf', 32, 'application/pdf'));
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(201);
    expect(sharpMetadataMock).not.toHaveBeenCalled();
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.width).toBeNull();
    expect(v.height).toBeNull();
    expect(v.alt).toBeNull();
    expect(v.caption).toBeNull();
  });

  it('swallows sharp metadata failures and keeps width/height null', async () => {
    uploadToS3Mock.mockResolvedValueOnce({
      url: '/u',
      storedFilename: 's',
      mimeType: 'image/png',
      fileSize: 16,
    });
    sharpMetadataMock.mockRejectedValueOnce(new Error('boom'));
    insertReturningQueue.push([{ id: 3 }]);

    const form = new FormData();
    form.set('file', makeFile('bad.png', 16, 'image/png'));
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.width).toBeNull();
    expect(v.height).toBeNull();
  });

  it('handles sharp returning partial metadata (no width/height keys)', async () => {
    uploadToS3Mock.mockResolvedValueOnce({
      url: '/u',
      storedFilename: 's',
      mimeType: 'image/png',
      fileSize: 16,
    });
    sharpMetadataMock.mockResolvedValueOnce({});
    insertReturningQueue.push([{ id: 4 }]);

    const form = new FormData();
    form.set('file', makeFile('x.png', 16, 'image/png'));
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.width).toBeNull();
    expect(v.height).toBeNull();
  });

  it('handles null clientId / brandingProfileId gracefully', async () => {
    resolveClientSiteMock.mockResolvedValueOnce({ id: 55, brandingProfileId: null });
    getPortalClientMock.mockResolvedValueOnce(null);
    uploadToS3Mock.mockResolvedValueOnce({
      url: '/u',
      storedFilename: 's',
      mimeType: 'application/pdf',
      fileSize: 4,
    });
    insertReturningQueue.push([{ id: 5 }]);

    const form = new FormData();
    form.set('file', makeFile('a.pdf', 4, 'application/pdf'));
    const res = await UPLOAD_POST(makeReq(form), siteParams('55'));
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.clientId).toBeNull();
    expect(v.brandingProfileId).toBeNull();
  });
});

// ===========================================================================
// GET /api/portal/cms/websites/[siteId]/posts/[postId]/revisions
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/posts/[postId]/revisions', () => {
  function makeReq(): Request {
    return new Request(
      'http://x/api/portal/cms/websites/55/posts/77/revisions',
      { method: 'GET' },
    );
  }

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await REVISIONS_GET(makeReq(), siteAndPostParams('55', '77'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site does not resolve', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await REVISIONS_GET(makeReq(), siteAndPostParams('55', '77'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when post does not belong to the site', async () => {
    selectQueue.push([]); // post lookup → []
    const res = await REVISIONS_GET(makeReq(), siteAndPostParams('55', '77'));
    expect(res.status).toBe(404);
  });

  it('returns list of revisions sorted desc when post is present', async () => {
    selectQueue.push([{ id: 77 }]); // post lookup
    selectQueue.push([
      { id: 3, title: 'v3', trigger: 'manual', createdAt: new Date('2030-01-03') },
      { id: 2, title: 'v2', trigger: 'auto', createdAt: new Date('2030-01-02') },
    ]);
    const res = await REVISIONS_GET(makeReq(), siteAndPostParams('55', '77'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(3);
  });
});

// ===========================================================================
// POST /api/portal/cms/websites/[siteId]/posts/[postId]/revisions
// ===========================================================================

describe('POST /api/portal/cms/websites/[siteId]/posts/[postId]/revisions', () => {
  function makeReq(body: unknown): Request {
    return new Request(
      'http://x/api/portal/cms/websites/55/posts/77/revisions',
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await REVISIONS_POST(makeReq({ revisionId: 1 }), siteAndPostParams('55', '77'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site does not resolve', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await REVISIONS_POST(makeReq({ revisionId: 1 }), siteAndPostParams('55', '77'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when revisionId missing from body', async () => {
    const res = await REVISIONS_POST(makeReq({}), siteAndPostParams('55', '77'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/revisionId/);
  });

  it('returns 404 when revision not found', async () => {
    selectQueue.push([]); // revision lookup → []
    const res = await REVISIONS_POST(makeReq({ revisionId: 999 }), siteAndPostParams('55', '77'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Revision not found/);
  });

  it('returns 404 when post not found for site (current post lookup empty)', async () => {
    selectQueue.push([{ id: 50, content: 'rev-c', title: 'rev-t' }]); // revision
    selectQueue.push([]); // currentPost → empty
    const res = await REVISIONS_POST(makeReq({ revisionId: 50 }), siteAndPostParams('55', '77'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Post not found/);
  });

  it('inserts current state as revision and reverts post to revision', async () => {
    selectQueue.push([{ id: 50, content: 'old-content', title: 'Old Title' }]); // revision
    selectQueue.push([
      { id: 77, content: 'current-content', title: 'Current Title' },
    ]); // currentPost
    updateReturningQueue.push([
      { id: 77, content: 'old-content', title: 'Old Title', updatedAt: new Date() },
    ]);

    const res = await REVISIONS_POST(makeReq({ revisionId: 50 }), siteAndPostParams('55', '77'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.content).toBe('old-content');
    expect(body.data.title).toBe('Old Title');

    // Insert: snapshot of current state with trigger='manual'
    expect(insertCalls).toHaveLength(1);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.postId).toBe(77);
    expect(inserted.content).toBe('current-content');
    expect(inserted.title).toBe('Current Title');
    expect(inserted.trigger).toBe('manual');
    expect(inserted.createdBy).toBe(7);

    // Update: posts set to revision content/title
    expect(updateCalls).toHaveLength(1);
    const upd = updateCalls[0].set as Record<string, unknown>;
    expect(upd.content).toBe('old-content');
    expect(upd.title).toBe('Old Title');
  });
});

// ===========================================================================
// GET /api/portal/cms/websites/[siteId]/posts/picker
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/posts/picker', () => {
  function makeReq(qs = ''): Request {
    return new Request(
      `http://x/api/portal/cms/websites/55/posts/picker${qs}`,
      { method: 'GET' },
    );
  }

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await PICKER_GET(makeReq(), siteParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site does not resolve', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await PICKER_GET(makeReq(), siteParams('55'));
    expect(res.status).toBe(404);
  });

  it('returns slim post list ordered by title', async () => {
    selectQueue.push([
      { id: 1, title: 'A', slug: 'a', postType: 'page' },
      { id: 2, title: 'B', slug: 'b', postType: 'post' },
    ]);
    const res = await PICKER_GET(makeReq(), siteParams('55'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].slug).toBe('a');
  });

  it('filters by postType when query param present', async () => {
    selectQueue.push([
      { id: 9, title: 'Faq', slug: 'faq', postType: 'faq' },
    ]);
    const res = await PICKER_GET(makeReq('?postType=faq'), siteParams('55'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      { id: 9, title: 'Faq', slug: 'faq', postType: 'faq' },
    ]);
  });

  it('returns empty array when no posts match', async () => {
    selectQueue.push([]);
    const res = await PICKER_GET(makeReq(), siteParams('55'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// GET /api/portal/cms/websites/[siteId]/posts
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/posts', () => {
  function makeReq(): Request {
    return new Request('http://x/api/portal/cms/websites/55/posts', {
      method: 'GET',
    });
  }

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POSTS_GET(makeReq(), siteParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site does not resolve', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await POSTS_GET(makeReq(), siteParams('55'));
    expect(res.status).toBe(404);
  });

  it('returns list of posts for the site', async () => {
    selectQueue.push([
      { id: 1, title: 'A', slug: 'a' },
      { id: 2, title: 'B', slug: 'b' },
    ]);
    const res = await POSTS_GET(makeReq(), siteParams('55'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('returns empty array when no posts exist', async () => {
    selectQueue.push([]);
    const res = await POSTS_GET(makeReq(), siteParams('55'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/cms/websites/[siteId]/posts
// ===========================================================================

describe('POST /api/portal/cms/websites/[siteId]/posts', () => {
  function makeReq(body: unknown): Request {
    return new Request('http://x/api/portal/cms/websites/55/posts', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POSTS_POST(makeReq({}), siteParams('55'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site does not resolve', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await POSTS_POST(makeReq({ title: 't', slug: 's', content: 'c' }), siteParams('55'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when title/slug/content missing', async () => {
    const r1 = await POSTS_POST(makeReq({ slug: 's', content: 'c' }), siteParams('55'));
    expect(r1.status).toBe(400);
    const r2 = await POSTS_POST(makeReq({ title: 't', content: 'c' }), siteParams('55'));
    expect(r2.status).toBe(400);
    const r3 = await POSTS_POST(makeReq({ title: 't', slug: 's' }), siteParams('55'));
    expect(r3.status).toBe(400);
  });

  it('returns 403 when restricted block type is used by non-privileged role', async () => {
    assertBlocksAllowedForRoleMock.mockImplementationOnce(() => {
      throw new BlockGateError('html-render');
    });
    const res = await POSTS_POST(
      makeReq({ title: 't', slug: 's', content: [{ type: 'html-render' }] }),
      siteParams('55'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/html-render/);
  });

  it('re-throws non-BlockGateError from gate check', async () => {
    assertBlocksAllowedForRoleMock.mockImplementationOnce(() => {
      throw new Error('unexpected');
    });
    await expect(
      POSTS_POST(
        makeReq({ title: 't', slug: 's', content: 'c' }),
        siteParams('55'),
      ),
    ).rejects.toThrow('unexpected');
  });

  it('returns 400 when slug already exists on site', async () => {
    selectQueue.push([{ id: 999 }]); // existing slug
    const res = await POSTS_POST(
      makeReq({ title: 't', slug: 'taken', content: 'c' }),
      siteParams('55'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/slug already exists/);
  });

  it('creates a new post with defaults when minimal body provided', async () => {
    selectQueue.push([]); // existing slug check → none
    insertReturningQueue.push([{ id: 42, title: 't', slug: 's' }]);

    const res = await POSTS_POST(
      makeReq({ title: 't', slug: 's', content: 'c' }),
      siteParams('55'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);

    // Should have inserted into posts only (no category/tag join inserts)
    const postInserts = insertCalls.filter((c) => c.table === 'posts');
    expect(postInserts).toHaveLength(1);
    const v = postInserts[0].values as Record<string, unknown>;
    expect(v.title).toBe('t');
    expect(v.slug).toBe('s');
    expect(v.postType).toBe('page');
    expect(v.published).toBe(false);
    expect(v.publishedAt).toBeNull();
    expect(v.noIndex).toBe(false);
    expect(v.websiteId).toBe(55);
    expect(insertCalls.filter((c) => c.table === 'postCategories')).toHaveLength(0);
    expect(insertCalls.filter((c) => c.table === 'postTags')).toHaveLength(0);
  });

  it('creates a published post with publishedAt set and links categories + tags', async () => {
    selectQueue.push([]); // existing slug check
    insertReturningQueue.push([{ id: 50 }]);

    const res = await POSTS_POST(
      makeReq({
        title: 'Hello',
        slug: 'hello',
        postType: 'post',
        excerpt: 'ex',
        content: 'body',
        coverImage: '/cover.png',
        published: true,
        categoryIds: [1, 2],
        tagIds: [10, 11, 12],
        seoTitle: 'SEO',
        seoDescription: 'D',
        ogImage: '/og.png',
        noIndex: true,
        canonicalUrl: 'https://x',
      }),
      siteParams('55'),
    );
    expect(res.status).toBe(200);

    const postInsert = insertCalls.find((c) => c.table === 'posts');
    expect(postInsert).toBeTruthy();
    const v = postInsert!.values as Record<string, unknown>;
    expect(v.postType).toBe('post');
    expect(v.published).toBe(true);
    expect(v.publishedAt).toBeInstanceOf(Date);
    expect(v.coverImage).toBe('/cover.png');
    expect(v.seoTitle).toBe('SEO');
    expect(v.noIndex).toBe(true);
    expect(v.canonicalUrl).toBe('https://x');

    const catInsert = insertCalls.find((c) => c.table === 'postCategories');
    expect(catInsert).toBeTruthy();
    expect(catInsert!.values).toEqual([
      { postId: 50, categoryId: 1 },
      { postId: 50, categoryId: 2 },
    ]);

    const tagInsert = insertCalls.find((c) => c.table === 'postTags');
    expect(tagInsert).toBeTruthy();
    expect(tagInsert!.values).toEqual([
      { postId: 50, tagId: 10 },
      { postId: 50, tagId: 11 },
      { postId: 50, tagId: 12 },
    ]);
  });
});
