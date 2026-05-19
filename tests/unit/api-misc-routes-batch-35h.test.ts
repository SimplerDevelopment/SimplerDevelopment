// @vitest-environment node
/**
 * Batch 35h — unit tests for 4 public website route.ts files.
 *
 * Routes covered:
 *  - app/api/public/websites/[siteId]/media/route.ts            (GET)
 *  - app/api/public/websites/[siteId]/posts/route.ts            (GET)
 *  - app/api/public/websites/[siteId]/posts/[slug]/route.ts     (GET)
 *  - app/api/public/websites/[siteId]/tags/route.ts             (GET)
 *
 * Strategy: heavy mocking — db.select() returns a per-call result via a
 * shared queue. drizzle-orm operators are inert. schema tables are proxies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

// drizzle-orm operators — inert markers
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    { raw: (s: string) => ({ __sql_raw: true, s }) },
  ),
}));

// schema — proxy tables; every property access returns a { __col, __table }.
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
    categories: wrap('categories'),
    tags: wrap('tags'),
    postCategories: wrap('postCategories'),
    postTags: wrap('postTags'),
    clientWebsites: wrap('clientWebsites'),
  };
});

// ---------------------------------------------------------------------------
// db mock: select-queue
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];

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
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const mediaRoute = await import('@/app/api/public/websites/[siteId]/media/route');
const postsRoute = await import('@/app/api/public/websites/[siteId]/posts/route');
const postSlugRoute = await import('@/app/api/public/websites/[siteId]/posts/[slug]/route');
const tagsRoute = await import('@/app/api/public/websites/[siteId]/tags/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeReq(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  selectQueue = [];
});

// ===========================================================================
// GET /api/public/websites/[siteId]/media
// ===========================================================================

describe('GET /api/public/websites/[siteId]/media', () => {
  it('returns 404 when site lookup is empty', async () => {
    selectQueue.push([]); // site
    const res = await mediaRoute.GET(makeReq('http://x/media'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Not found');
  });

  it('returns media list + pagination when site exists (defaults)', async () => {
    selectQueue.push([{ id: 7 }]); // site
    const rows = [
      {
        id: 1,
        filename: 'a.png',
        mimeType: 'image/png',
        url: 'https://x/a.png',
        thumbnailUrl: null,
        alt: null,
        caption: null,
        width: 100,
        height: 100,
      },
      {
        id: 2,
        filename: 'b.jpg',
        mimeType: 'image/jpeg',
        url: 'https://x/b.jpg',
        thumbnailUrl: 'https://x/b-thumb.jpg',
        alt: 'B',
        caption: 'cap',
        width: 200,
        height: 150,
      },
    ];
    selectQueue.push(rows); // data
    selectQueue.push([{ count: 2 }]); // count

    const res = await mediaRoute.GET(makeReq('http://x/media'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].filename).toBe('a.png');
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 2 });
  });

  it('respects limit/offset query params (capped at 100)', async () => {
    selectQueue.push([{ id: 7 }]);
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);

    const res = await mediaRoute.GET(
      makeReq('http://x/media?limit=500&offset=40'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.limit).toBe(100); // capped
    expect(body.pagination.offset).toBe(40);
    expect(body.pagination.total).toBe(0);
  });

  it('accepts mimeType filter (non-"all" branch)', async () => {
    selectQueue.push([{ id: 7 }]);
    selectQueue.push([
      {
        id: 9,
        filename: 'pic.png',
        mimeType: 'image/png',
        url: 'u',
        thumbnailUrl: null,
        alt: null,
        caption: null,
        width: 1,
        height: 1,
      },
    ]);
    selectQueue.push([{ count: 1 }]);

    const res = await mediaRoute.GET(
      makeReq('http://x/media?mimeType=image'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });

  it('ignores mimeType=all (no filter added)', async () => {
    selectQueue.push([{ id: 7 }]);
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);

    const res = await mediaRoute.GET(
      makeReq('http://x/media?mimeType=all'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ===========================================================================
// GET /api/public/websites/[siteId]/posts
// ===========================================================================

describe('GET /api/public/websites/[siteId]/posts', () => {
  it('returns 404 when site lookup is empty', async () => {
    selectQueue.push([]);
    const res = await postsRoute.GET(makeReq('http://x/posts'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns posts + pagination when site exists (defaults)', async () => {
    selectQueue.push([{ id: 7 }]); // site
    const rows = [
      {
        id: 11,
        title: 'Hello',
        slug: 'hello',
        postType: 'post',
        excerpt: 'ex',
        coverImage: null,
        publishedAt: new Date('2030-01-01T00:00:00Z'),
      },
    ];
    selectQueue.push(rows); // data
    selectQueue.push([{ count: 1 }]); // count

    const res = await postsRoute.GET(makeReq('http://x/posts'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Hello');
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
  });

  it('respects postType, search, limit, offset (limit capped at 100)', async () => {
    selectQueue.push([{ id: 7 }]);
    selectQueue.push([]); // data
    selectQueue.push([{ count: 0 }]);

    const res = await postsRoute.GET(
      makeReq('http://x/posts?postType=page&search=foo&limit=999&offset=5'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.limit).toBe(100); // capped
    expect(body.pagination.offset).toBe(5);
  });

  it('filters by category — empty match short-circuits to []', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([]); // category postIds — none

    const res = await postsRoute.GET(
      makeReq('http://x/posts?category=news'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 0 });
  });

  it('filters by category — proceeds with matching post IDs', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([{ postId: 100 }, { postId: 101 }]); // category postIds
    selectQueue.push([
      {
        id: 100,
        title: 'A',
        slug: 'a',
        postType: 'post',
        excerpt: '',
        coverImage: null,
        publishedAt: new Date('2030-01-01T00:00:00Z'),
      },
    ]); // data
    selectQueue.push([{ count: 1 }]); // count

    const res = await postsRoute.GET(
      makeReq('http://x/posts?category=news'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(100);
  });

  it('filters by tag alone (intersects with empty category filter set)', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([{ postId: 200 }]); // tag postIds
    selectQueue.push([
      {
        id: 200,
        title: 'B',
        slug: 'b',
        postType: 'post',
        excerpt: '',
        coverImage: null,
        publishedAt: new Date('2030-01-01T00:00:00Z'),
      },
    ]); // data
    selectQueue.push([{ count: 1 }]); // count

    const res = await postsRoute.GET(
      makeReq('http://x/posts?tag=howto'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data[0].id).toBe(200);
  });

  it('filters by both category + tag — intersection', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([{ postId: 1 }, { postId: 2 }, { postId: 3 }]); // category postIds
    selectQueue.push([{ postId: 2 }, { postId: 3 }, { postId: 4 }]); // tag postIds
    selectQueue.push([
      {
        id: 2,
        title: 'C',
        slug: 'c',
        postType: 'post',
        excerpt: '',
        coverImage: null,
        publishedAt: null,
      },
      {
        id: 3,
        title: 'D',
        slug: 'd',
        postType: 'post',
        excerpt: '',
        coverImage: null,
        publishedAt: null,
      },
    ]); // data
    selectQueue.push([{ count: 2 }]); // count

    const res = await postsRoute.GET(
      makeReq('http://x/posts?category=news&tag=howto'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((d: { id: number }) => d.id).sort()).toEqual([2, 3]);
  });

  it('filters by both category + tag — empty intersection short-circuits', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([{ postId: 1 }]); // category postIds
    selectQueue.push([{ postId: 2 }]); // tag postIds — no overlap

    const res = await postsRoute.GET(
      makeReq('http://x/posts?category=news&tag=howto'),
      { params: Promise.resolve({ siteId: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });
});

// ===========================================================================
// GET /api/public/websites/[siteId]/posts/[slug]
// ===========================================================================

describe('GET /api/public/websites/[siteId]/posts/[slug]', () => {
  it('returns 404 when site lookup is empty', async () => {
    selectQueue.push([]); // site
    const res = await postSlugRoute.GET(makeReq('http://x/posts/hello'), {
      params: Promise.resolve({ siteId: '7', slug: 'hello' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when post not found for site', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([]); // post
    const res = await postSlugRoute.GET(makeReq('http://x/posts/hello'), {
      params: Promise.resolve({ siteId: '7', slug: 'hello' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns post with categories + tags arrays', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([
      {
        id: 42,
        websiteId: 7,
        slug: 'hello',
        title: 'Hello World',
        content: 'body',
        published: true,
      },
    ]); // post
    selectQueue.push([
      { id: 1, name: 'News', slug: 'news', color: '#ff0' },
    ]); // cats
    selectQueue.push([
      { id: 11, name: 'How-to', slug: 'howto' },
    ]); // tags

    const res = await postSlugRoute.GET(makeReq('http://x/posts/hello'), {
      params: Promise.resolve({ siteId: '7', slug: 'hello' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
    expect(body.data.title).toBe('Hello World');
    expect(body.data.categories).toEqual([
      { id: 1, name: 'News', slug: 'news', color: '#ff0' },
    ]);
    expect(body.data.tags).toEqual([
      { id: 11, name: 'How-to', slug: 'howto' },
    ]);
  });

  it('returns post with empty arrays when no categories/tags joined', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([
      {
        id: 50,
        websiteId: 7,
        slug: 'lonely',
        title: 'Lonely',
        content: '',
        published: true,
      },
    ]); // post
    selectQueue.push([]); // cats empty
    selectQueue.push([]); // tags empty

    const res = await postSlugRoute.GET(makeReq('http://x/posts/lonely'), {
      params: Promise.resolve({ siteId: '7', slug: 'lonely' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.categories).toEqual([]);
    expect(body.data.tags).toEqual([]);
  });
});

// ===========================================================================
// GET /api/public/websites/[siteId]/tags
// ===========================================================================

describe('GET /api/public/websites/[siteId]/tags', () => {
  it('returns 404 when site lookup is empty', async () => {
    selectQueue.push([]); // site
    const res = await tagsRoute.GET(makeReq('http://x/tags'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns tag list when site exists', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([
      { id: 1, name: 'Alpha', slug: 'alpha' },
      { id: 2, name: 'Beta', slug: 'beta' },
    ]); // tags

    const res = await tagsRoute.GET(makeReq('http://x/tags'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Alpha');
  });

  it('returns empty array when no tags exist for site', async () => {
    selectQueue.push([{ id: 7 }]); // site
    selectQueue.push([]); // tags

    const res = await tagsRoute.GET(makeReq('http://x/tags'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
