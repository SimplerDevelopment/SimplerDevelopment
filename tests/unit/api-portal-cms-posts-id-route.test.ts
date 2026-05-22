// @vitest-environment node
/**
 * Unit tests for app/api/portal/cms/websites/[siteId]/posts/[postId]/route.ts
 *
 * GET    — load a post by id scoped to a resolved client site, with category
 *          and tag id arrays.
 * PUT    — partial update; slug uniqueness; revision snapshot; category/tag
 *          syncing; client-site revalidation; block-allowlist gating.
 * DELETE — scoped delete by id.
 *
 * Everything below the route is mocked: auth, resolveClientSite, the @/lib/db
 * fluent builder (select / update / delete / insert), drizzle helpers,
 * revalidation, and the block-allowlist guard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

const revalidateClientSiteMock = vi.fn();
const clientSiteUrlMock = vi.fn();
vi.mock('@/lib/revalidate-client-site', () => ({
  revalidateClientSite: (...args: unknown[]) => revalidateClientSiteMock(...args),
  clientSiteUrl: (...args: unknown[]) => clientSiteUrlMock(...args),
}));

class FakeBlockGateError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BlockGateError';
  }
}
const assertBlocksAllowedForRoleMock = vi.fn();
vi.mock('@/lib/security/block-allowlist', () => ({
  assertBlocksAllowedForRole: (...args: unknown[]) =>
    assertBlocksAllowedForRoleMock(...args),
  BlockGateError: FakeBlockGateError,
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return {
    posts: wrap('posts'),
    postCategories: wrap('postCategories'),
    postTags: wrap('postTags'),
    postRevisions: wrap('postRevisions'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
}));

// ---- in-memory state ----

interface State {
  posts: Array<Record<string, unknown>>;
  postCategories: Array<Record<string, unknown>>;
  postTags: Array<Record<string, unknown>>;
  postRevisions: Array<Record<string, unknown>>;
  nextId: number;
}

const state: State = {
  posts: [],
  postCategories: [],
  postTags: [],
  postRevisions: [],
  nextId: 1000,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'posts':
      return state.posts;
    case 'postCategories':
      return state.postCategories;
    case 'postTags':
      return state.postTags;
    case 'postRevisions':
      return state.postRevisions;
    default:
      return [];
  }
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitN: number | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        limitN = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      if (limitN != null) rows = rows.slice(0, limitN);

      if (projection) {
        return Promise.resolve(
          rows.map((r) => {
            const projected: Record<string, unknown> = {};
            for (const [outKey, ref] of Object.entries(projection)) {
              const colRef = ref as { __col?: string } | undefined;
              if (colRef?.__col) {
                projected[outKey] = r[colRef.__col] ?? null;
              } else {
                projected[outKey] = null;
              }
            }
            return projected;
          }),
        );
      }
      return Promise.resolve(rows.map((r) => ({ ...r })));
    }

    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) =>
              evalPredicate(filter, r),
            );
            for (const r of rows) Object.assign(r, patch);
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
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
        const arr = tableArray(table.__table);
        const matched = arr.filter((r) => evalPredicate(filter, r));
        const remaining = arr.filter((r) => !evalPredicate(filter, r));
        arr.length = 0;
        arr.push(...remaining);
        return Promise.resolve(matched);
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
        const arr = tableArray(table.__table);
        const list = Array.isArray(rows) ? rows : [rows];
        for (const r of list) {
          arr.push({ id: state.nextId++, ...r });
        }
        return Promise.resolve();
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
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
// Module under test
// ---------------------------------------------------------------------------

const { GET, PUT, DELETE } = await import(
  '@/app/api/portal/cms/websites/[siteId]/posts/[postId]/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(siteId: string, postId: string) {
  return { params: Promise.resolve({ siteId, postId }) };
}

function makeRequest(body: unknown): Request {
  return new Request('http://x/api/portal/cms/websites/1/posts/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function defaultPost(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    websiteId: 50,
    title: 'Hello',
    slug: 'hello',
    postType: 'post',
    excerpt: 'ex',
    content: [{ type: 'p', children: [{ text: 'Hi' }] }],
    coverImage: null,
    published: false,
    publishedAt: null,
    seoTitle: null,
    seoDescription: null,
    ogImage: null,
    noIndex: false,
    canonicalUrl: null,
    customCss: null,
    customJs: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

beforeEach(() => {
  state.posts.length = 0;
  state.postCategories.length = 0;
  state.postTags.length = 0;
  state.postRevisions.length = 0;
  state.nextId = 1000;

  authMock.mockReset();
  resolveClientSiteMock.mockReset();
  revalidateClientSiteMock.mockReset();
  clientSiteUrlMock.mockReset();
  assertBlocksAllowedForRoleMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
  resolveClientSiteMock.mockResolvedValue({
    id: 50,
    subdomain: 'acme',
    domain: null,
  });
  clientSiteUrlMock.mockReturnValue('https://acme.test');
  revalidateClientSiteMock.mockResolvedValue(undefined);
  assertBlocksAllowedForRoleMock.mockReturnValue(undefined);
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/cms/websites/[siteId]/posts/[postId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when the post does not exist for the site', async () => {
    const res = await GET(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when post exists but is owned by a different site', async () => {
    state.posts.push(defaultPost({ id: 1, websiteId: 999 }));
    const res = await GET(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with post + categoryIds + tagIds on success', async () => {
    state.posts.push(defaultPost());
    state.postCategories.push({ postId: 1, categoryId: 11 });
    state.postCategories.push({ postId: 1, categoryId: 12 });
    state.postTags.push({ postId: 1, tagId: 21 });

    const res = await GET(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe('Hello');
    expect(body.data.categoryIds).toEqual([11, 12]);
    expect(body.data.tagIds).toEqual([21]);
  });

  it('returns empty categoryIds / tagIds when none exist', async () => {
    state.posts.push(defaultPost());
    const res = await GET(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.categoryIds).toEqual([]);
    expect(body.data.tagIds).toEqual([]);
  });

  it('passes parsed numeric user id and siteId to resolveClientSite', async () => {
    state.posts.push(defaultPost());
    await GET(new Request('http://x'), makeParams('1', '1'));
    expect(resolveClientSiteMock).toHaveBeenCalledWith(7, 1);
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/portal/cms/websites/[siteId]/posts/[postId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await PUT(makeRequest({ title: 'X' }), makeParams('1', '1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client site not resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await PUT(makeRequest({ title: 'X' }), makeParams('1', '1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when block-allowlist throws BlockGateError', async () => {
    state.posts.push(defaultPost());
    assertBlocksAllowedForRoleMock.mockImplementationOnce(() => {
      throw new FakeBlockGateError('raw-html not allowed');
    });
    const res = await PUT(
      makeRequest({ content: [{ type: 'raw-html' }] }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('raw-html not allowed');
  });

  it('re-throws non-BlockGateError errors from block-allowlist', async () => {
    state.posts.push(defaultPost());
    assertBlocksAllowedForRoleMock.mockImplementationOnce(() => {
      throw new Error('something else');
    });
    await expect(
      PUT(
        makeRequest({ content: [{ type: 'p' }] }),
        makeParams('1', '1'),
      ),
    ).rejects.toThrow('something else');
  });

  it('returns 400 when slug already exists on a different post', async () => {
    state.posts.push(defaultPost({ id: 1, slug: 'hello' }));
    state.posts.push(defaultPost({ id: 2, slug: 'taken', websiteId: 50 }));
    const res = await PUT(
      makeRequest({ slug: 'taken' }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/slug already exists/i);
  });

  it('allows slug update when slug is owned by the same post', async () => {
    state.posts.push(defaultPost({ id: 1, slug: 'hello' }));
    const res = await PUT(
      makeRequest({ slug: 'hello' }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 when no post matches id+site', async () => {
    // post exists but for a different site → update returns []
    state.posts.push(defaultPost({ id: 1, websiteId: 999 }));
    const res = await PUT(
      makeRequest({ title: 'New' }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(404);
  });

  it('updates partial fields and returns success', async () => {
    state.posts.push(defaultPost());
    const res = await PUT(
      makeRequest({
        title: 'Renamed',
        excerpt: 'fresh',
        seoTitle: 'SEO',
      }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Renamed');
    expect(body.data.excerpt).toBe('fresh');
    expect(body.data.seoTitle).toBe('SEO');
  });

  it('coerces empty strings to null for optional text fields', async () => {
    state.posts.push(defaultPost({ excerpt: 'old' }));
    const res = await PUT(
      makeRequest({
        excerpt: '',
        coverImage: '',
        seoTitle: '',
        seoDescription: '',
        ogImage: '',
        canonicalUrl: '',
        customCss: '',
        customJs: '',
      }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.excerpt).toBeNull();
    expect(body.data.coverImage).toBeNull();
    expect(body.data.seoTitle).toBeNull();
    expect(body.data.seoDescription).toBeNull();
    expect(body.data.ogImage).toBeNull();
    expect(body.data.canonicalUrl).toBeNull();
    expect(body.data.customCss).toBeNull();
    expect(body.data.customJs).toBeNull();
  });

  it('sets publishedAt when published toggles to true', async () => {
    state.posts.push(defaultPost({ published: false, publishedAt: null }));
    const res = await PUT(
      makeRequest({ published: true }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.published).toBe(true);
    expect(body.data.publishedAt).not.toBeNull();
  });

  it('nulls publishedAt when published toggles to false', async () => {
    state.posts.push(
      defaultPost({ published: true, publishedAt: new Date('2026-01-01') }),
    );
    const res = await PUT(
      makeRequest({ published: false }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.published).toBe(false);
    expect(body.data.publishedAt).toBeNull();
  });

  it('creates a revision snapshot when content is updated', async () => {
    state.posts.push(defaultPost());
    const newContent = [{ type: 'p', children: [{ text: 'new!' }] }];
    const res = await PUT(
      makeRequest({ content: newContent }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(200);
    expect(state.postRevisions).toHaveLength(1);
    expect(state.postRevisions[0].postId).toBe(1);
    expect(state.postRevisions[0].trigger).toBe('manual');
    expect(state.postRevisions[0].createdBy).toBe(7);
  });

  it('uses publish trigger when published and not autosave', async () => {
    state.posts.push(defaultPost());
    const newContent = [{ type: 'p' }];
    await PUT(
      makeRequest({ content: newContent, published: true }),
      makeParams('1', '1'),
    );
    expect(state.postRevisions).toHaveLength(1);
    expect(state.postRevisions[0].trigger).toBe('publish');
  });

  it('honors autosave revisionTrigger even when published', async () => {
    state.posts.push(defaultPost());
    const newContent = [{ type: 'p' }];
    await PUT(
      makeRequest({
        content: newContent,
        published: true,
        revisionTrigger: 'autosave',
      }),
      makeParams('1', '1'),
    );
    expect(state.postRevisions[0].trigger).toBe('autosave');
  });

  it('does not create a revision when content is omitted', async () => {
    state.posts.push(defaultPost());
    await PUT(makeRequest({ title: 'Renamed' }), makeParams('1', '1'));
    expect(state.postRevisions).toHaveLength(0);
  });

  it('syncs categories when categoryIds is provided', async () => {
    state.posts.push(defaultPost());
    state.postCategories.push({ postId: 1, categoryId: 99 });
    const res = await PUT(
      makeRequest({ categoryIds: [1, 2, 3] }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(200);
    expect(state.postCategories.map((c) => c.categoryId).sort()).toEqual([1, 2, 3]);
  });

  it('clears categories when categoryIds is empty array', async () => {
    state.posts.push(defaultPost());
    state.postCategories.push({ postId: 1, categoryId: 99 });
    await PUT(
      makeRequest({ categoryIds: [] }),
      makeParams('1', '1'),
    );
    expect(state.postCategories).toHaveLength(0);
  });

  it('syncs tags when tagIds is provided', async () => {
    state.posts.push(defaultPost());
    state.postTags.push({ postId: 1, tagId: 99 });
    await PUT(
      makeRequest({ tagIds: [5, 6] }),
      makeParams('1', '1'),
    );
    expect(state.postTags.map((t) => t.tagId).sort()).toEqual([5, 6]);
  });

  it('clears tags when tagIds is empty array', async () => {
    state.posts.push(defaultPost());
    state.postTags.push({ postId: 1, tagId: 99 });
    await PUT(
      makeRequest({ tagIds: [] }),
      makeParams('1', '1'),
    );
    expect(state.postTags).toHaveLength(0);
  });

  it('triggers revalidation when site URL is available', async () => {
    state.posts.push(defaultPost({ slug: 'my-post' }));
    clientSiteUrlMock.mockReturnValueOnce('https://acme.test');
    await PUT(
      makeRequest({ title: 'Renamed' }),
      makeParams('1', '1'),
    );
    expect(revalidateClientSiteMock).toHaveBeenCalledWith('https://acme.test', [
      '/blog/my-post',
      '/p/my-post',
    ]);
  });

  it('skips revalidation when client site URL is null', async () => {
    state.posts.push(defaultPost());
    clientSiteUrlMock.mockReturnValueOnce(null);
    await PUT(
      makeRequest({ title: 'Renamed' }),
      makeParams('1', '1'),
    );
    expect(revalidateClientSiteMock).not.toHaveBeenCalled();
  });

  it('swallows revalidation errors (fire-and-forget)', async () => {
    state.posts.push(defaultPost());
    revalidateClientSiteMock.mockRejectedValueOnce(new Error('revalidate boom'));
    const res = await PUT(
      makeRequest({ title: 'Renamed' }),
      makeParams('1', '1'),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/portal/cms/websites/[siteId]/posts/[postId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the client site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(404);
  });

  it('successfully deletes a scoped post', async () => {
    state.posts.push(defaultPost());
    state.posts.push(defaultPost({ id: 2, slug: 'other' }));
    const res = await DELETE(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0].id).toBe(2);
  });

  it('returns success even when no post matches (no row-count guard)', async () => {
    const res = await DELETE(new Request('http://x'), makeParams('1', '1'));
    expect(res.status).toBe(200);
  });
});
