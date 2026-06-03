// @vitest-environment node
/**
 * Unit tests for lib/data/posts.ts (drizzle data-access).
 *
 * Strategy mirrors `actions-blog.test.ts`: mock `@/lib/db/schema`,
 * `@/lib/db`, and `drizzle-orm` with an in-memory store and a chainable
 * query builder that supports projection, where (eq/and/like/inArray),
 * orderBy, limit, offset, and `count(*)` aggregations via the `sql` tag.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  posts: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
  postCategories: Array<Record<string, unknown>>;
  postTags: Array<Record<string, unknown>>;
  clientWebsites: Array<Record<string, unknown>>;
}

const state: MockState = {
  posts: [],
  categories: [],
  tags: [],
  postCategories: [],
  postTags: [],
  clientWebsites: [],
};

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
    posts: wrap('posts'),
    categories: wrap('categories'),
    tags: wrap('tags'),
    postCategories: wrap('postCategories'),
    postTags: wrap('postTags'),
    clientWebsites: wrap('clientWebsites'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// Sentinel for the count(*) aggregation. The real code does:
//   sql<number>`count(*)::int`
// We tag any sql`` invocation with __countStar so the mock select() can
// detect it as a special aggregate projection.
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: Object.assign(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => ({ __countStar: true }),
    {
      // Drizzle exposes `sql` as a function. The data file only calls it as a tag.
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

function getCol(ref: unknown): { col: string; table: string } | null {
  const r = ref as { __col?: string; __table?: string } | undefined;
  if (!r?.__col || !r.__table) return null;
  return { col: r.__col, table: r.__table };
}

function readField(row: Record<string, unknown>, ref: unknown): unknown {
  const c = getCol(ref);
  if (!c) return undefined;
  return row[c.col];
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
      const left = readField(row, f.a);
      return left === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'like': {
      const left = readField(row, f.a);
      const pattern = String(f.b);
      // SQL LIKE: % -> .*  _ -> .
      const re = new RegExp(
        '^' +
          pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/%/g, '.*')
            .replace(/_/g, '.') +
          '$',
      );
      return typeof left === 'string' && re.test(left);
    }
    case 'inArray': {
      const left = readField(row, f.a);
      return (f.list ?? []).includes(left);
    }
    default:
      return true;
  }
}

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __countStar?: boolean } | undefined;
    if (r?.__countStar) {
      // handled at aggregate time; placeholder.
      out[alias] = undefined;
      continue;
    }
    const c = getCol(ref);
    out[alias] = c ? row[c.col] : undefined;
  }
  return out;
}

function isCountProjection(projection: Record<string, unknown> | null): string | null {
  if (!projection) return null;
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __countStar?: boolean } | undefined;
    if (r?.__countStar) return alias;
  }
  return null;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

function performInnerJoin(
  leftRows: Array<Record<string, unknown>>,
  leftTable: string,
  rightTable: string,
  joinFilter: unknown,
): Array<Record<string, unknown>> {
  const rightRows = tableArray(rightTable);
  const f = joinFilter as { op?: string; a?: unknown; b?: unknown } | undefined;
  if (!f || f.op !== 'eq') return [];
  const aCol = getCol(f.a);
  const bCol = getCol(f.b);
  if (!aCol || !bCol) return [];
  const leftIsA = aCol.table === leftTable;
  const leftColName = leftIsA ? aCol.col : bCol.col;
  const rightColName = leftIsA ? bCol.col : aCol.col;
  const out: Array<Record<string, unknown>> = [];
  for (const l of leftRows) {
    for (const r of rightRows) {
      if (l[leftColName] !== undefined && l[leftColName] === r[rightColName]) {
        out.push({ ...r, ...l });
      }
    }
  }
  return out;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let workingRows: Array<Record<string, unknown>> | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    let offset = 0;

    const runQuery = (): Promise<Array<Record<string, unknown>>> => {
      if (!activeTable) return Promise.resolve([]);
      const rows = (workingRows ?? tableArray(activeTable)).filter((r) =>
        evalPredicate(filter, r),
      );
      const countAlias = isCountProjection(projection);
      if (countAlias) {
        return Promise.resolve([{ [countAlias]: rows.length }]);
      }
      let out = rows.map((r) => projectRow(r, projection));
      if (offset) out = out.slice(offset);
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    };

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      innerJoin(table: { __table: string }, on: unknown) {
        if (!activeTable) return chain;
        const left = workingRows ?? tableArray(activeTable);
        workingRows = performInnerJoin(left, activeTable, table.__table, on);
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limit = n;
        return chain;
      },
      offset(n: number) {
        offset = n;
        return chain;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection ?? null);
      },
    },
  };
});

beforeEach(() => {
  state.posts.length = 0;
  state.categories.length = 0;
  state.tags.length = 0;
  state.postCategories.length = 0;
  state.postTags.length = 0;
  state.clientWebsites.length = 0;
});

async function importModule() {
  return await import('@/lib/data/posts');
}

function seedPost(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    slug: 'hello-world',
    title: 'Hello World',
    excerpt: 'An excerpt',
    content: '<p>hi</p>',
    coverImage: null,
    published: true,
    publishedAt: new Date('2026-01-15'),
    postType: 'blog',
    websiteId: 1,
    ...overrides,
  };
  state.posts.push(row);
  return row;
}

function seedCategory(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 100,
    name: 'Eng',
    slug: 'eng',
    description: null,
    color: '#000',
    websiteId: 1,
    ...overrides,
  };
  state.categories.push(row);
  return row;
}

function seedTag(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = { id: 200, name: 'TS', slug: 'ts', websiteId: 1, ...overrides };
  state.tags.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// listPosts
// ---------------------------------------------------------------------------

describe('listPosts', () => {
  it('returns empty data + zero total when no posts exist for the site', async () => {
    const { listPosts } = await importModule();
    const res = await listPosts(1);
    expect(res.data).toEqual([]);
    expect(res.pagination).toEqual({ limit: 20, offset: 0, total: 0 });
  });

  it('only returns published posts from the matching site', async () => {
    seedPost({ id: 1, slug: 'a', websiteId: 1, published: true });
    seedPost({ id: 2, slug: 'b', websiteId: 1, published: false });
    seedPost({ id: 3, slug: 'c', websiteId: 2, published: true });
    const { listPosts } = await importModule();
    const res = await listPosts(1);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].slug).toBe('a');
    expect(res.pagination.total).toBe(1);
  });

  it('clamps limit to 100 and defaults to 20', async () => {
    const { listPosts } = await importModule();
    const def = await listPosts(1);
    expect(def.pagination.limit).toBe(20);
    const huge = await listPosts(1, { limit: 5000 });
    expect(huge.pagination.limit).toBe(100);
    const custom = await listPosts(1, { limit: 7 });
    expect(custom.pagination.limit).toBe(7);
  });

  it('applies offset pagination', async () => {
    for (let i = 1; i <= 5; i++) {
      seedPost({ id: i, slug: `p${i}`, websiteId: 1 });
    }
    const { listPosts } = await importModule();
    const res = await listPosts(1, { limit: 2, offset: 2 });
    expect(res.data).toHaveLength(2);
    expect(res.pagination).toMatchObject({ limit: 2, offset: 2, total: 5 });
  });

  it('filters by postType', async () => {
    seedPost({ id: 1, slug: 'a', websiteId: 1, postType: 'blog' });
    seedPost({ id: 2, slug: 'b', websiteId: 1, postType: 'page' });
    const { listPosts } = await importModule();
    const res = await listPosts(1, { postType: 'page' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].slug).toBe('b');
  });

  it('filters by search (LIKE on title)', async () => {
    seedPost({ id: 1, slug: 'a', title: 'Hello World', websiteId: 1 });
    seedPost({ id: 2, slug: 'b', title: 'Goodbye', websiteId: 1 });
    seedPost({ id: 3, slug: 'c', title: 'Say Hello!', websiteId: 1 });
    const { listPosts } = await importModule();
    const res = await listPosts(1, { search: 'Hello' });
    expect(res.data.map((r) => r.slug).sort()).toEqual(['a', 'c']);
    expect(res.pagination.total).toBe(2);
  });

  it('filters by category slug, joining through postCategories', async () => {
    seedCategory({ id: 100, slug: 'eng', websiteId: 1 });
    seedCategory({ id: 101, slug: 'news', websiteId: 1 });
    seedPost({ id: 1, slug: 'a', websiteId: 1 });
    seedPost({ id: 2, slug: 'b', websiteId: 1 });
    seedPost({ id: 3, slug: 'c', websiteId: 1 });
    state.postCategories.push(
      { postId: 1, categoryId: 100 },
      { postId: 2, categoryId: 101 },
      { postId: 3, categoryId: 100 },
    );
    const { listPosts } = await importModule();
    const res = await listPosts(1, { category: 'eng' });
    expect(res.data.map((r) => r.slug).sort()).toEqual(['a', 'c']);
    expect(res.pagination.total).toBe(2);
  });

  it('returns early with empty data when category filter has no matches', async () => {
    seedCategory({ id: 100, slug: 'eng', websiteId: 1 });
    seedPost({ id: 1, slug: 'a', websiteId: 1 });
    // No postCategories rows -> empty filteredPostIds.
    const { listPosts } = await importModule();
    const res = await listPosts(1, { category: 'eng' });
    expect(res.data).toEqual([]);
    expect(res.pagination).toEqual({ limit: 20, offset: 0, total: 0 });
  });

  it('filters by tag slug, joining through postTags', async () => {
    seedTag({ id: 200, slug: 'ts', websiteId: 1 });
    seedPost({ id: 1, slug: 'a', websiteId: 1 });
    seedPost({ id: 2, slug: 'b', websiteId: 1 });
    state.postTags.push({ postId: 1, tagId: 200 });
    const { listPosts } = await importModule();
    const res = await listPosts(1, { tag: 'ts' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].slug).toBe('a');
  });

  it('intersects category + tag filters', async () => {
    seedCategory({ id: 100, slug: 'eng', websiteId: 1 });
    seedTag({ id: 200, slug: 'ts', websiteId: 1 });
    seedPost({ id: 1, slug: 'a', websiteId: 1 });
    seedPost({ id: 2, slug: 'b', websiteId: 1 });
    seedPost({ id: 3, slug: 'c', websiteId: 1 });
    state.postCategories.push(
      { postId: 1, categoryId: 100 },
      { postId: 2, categoryId: 100 },
    );
    state.postTags.push({ postId: 2, tagId: 200 }, { postId: 3, tagId: 200 });
    const { listPosts } = await importModule();
    const res = await listPosts(1, { category: 'eng', tag: 'ts' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].slug).toBe('b');
  });

  it('returns empty when intersection of category + tag is empty', async () => {
    seedCategory({ id: 100, slug: 'eng', websiteId: 1 });
    seedTag({ id: 200, slug: 'ts', websiteId: 1 });
    seedPost({ id: 1, slug: 'a', websiteId: 1 });
    state.postCategories.push({ postId: 1, categoryId: 100 });
    // Tag is linked to a different post id -> intersection empty.
    state.postTags.push({ postId: 999, tagId: 200 });
    const { listPosts } = await importModule();
    const res = await listPosts(1, { category: 'eng', tag: 'ts' });
    expect(res.data).toEqual([]);
    expect(res.pagination.total).toBe(0);
  });

  it('projects only the listing columns', async () => {
    seedPost({
      id: 1,
      slug: 'a',
      title: 'A title',
      postType: 'blog',
      excerpt: 'ex',
      coverImage: 'cover.png',
      publishedAt: new Date('2026-01-01'),
      content: '<p>should not appear</p>',
      websiteId: 1,
    });
    const { listPosts } = await importModule();
    const res = await listPosts(1);
    expect(res.data[0]).toEqual({
      id: 1,
      title: 'A title',
      slug: 'a',
      postType: 'blog',
      excerpt: 'ex',
      coverImage: 'cover.png',
      publishedAt: new Date('2026-01-01'),
    });
    expect(res.data[0]).not.toHaveProperty('content');
  });
});

// ---------------------------------------------------------------------------
// getPostBySlug
// ---------------------------------------------------------------------------

describe('getPostBySlug', () => {
  it('returns null when no post matches', async () => {
    const { getPostBySlug } = await importModule();
    expect(await getPostBySlug(1, 'missing')).toBeNull();
  });

  it('returns null for an unpublished post', async () => {
    seedPost({ id: 1, slug: 'draft', websiteId: 1, published: false });
    const { getPostBySlug } = await importModule();
    expect(await getPostBySlug(1, 'draft')).toBeNull();
  });

  it('returns null when the post belongs to a different site', async () => {
    seedPost({ id: 1, slug: 'a', websiteId: 2 });
    const { getPostBySlug } = await importModule();
    expect(await getPostBySlug(1, 'a')).toBeNull();
  });

  it('returns the post with empty categories/tags when no joins exist', async () => {
    seedPost({ id: 1, slug: 'a', title: 'A', websiteId: 1 });
    const { getPostBySlug } = await importModule();
    const res = await getPostBySlug(1, 'a');
    expect(res).not.toBeNull();
    expect(res!.slug).toBe('a');
    expect(res!.categories).toEqual([]);
    expect(res!.tags).toEqual([]);
  });

  it('hydrates categories and tags', async () => {
    seedPost({ id: 1, slug: 'a', websiteId: 1 });
    seedCategory({ id: 100, name: 'Eng', slug: 'eng', color: '#111' });
    seedCategory({ id: 101, name: 'News', slug: 'news', color: null });
    seedTag({ id: 200, name: 'TS', slug: 'ts' });
    seedTag({ id: 201, name: 'JS', slug: 'js' });
    state.postCategories.push(
      { postId: 1, categoryId: 100 },
      { postId: 1, categoryId: 101 },
    );
    state.postTags.push({ postId: 1, tagId: 200 }, { postId: 1, tagId: 201 });
    const { getPostBySlug } = await importModule();
    const res = await getPostBySlug(1, 'a');
    expect(res).not.toBeNull();
    expect(res!.categories).toHaveLength(2);
    expect(res!.categories.map((c: { slug: string }) => c.slug).sort()).toEqual([
      'eng',
      'news',
    ]);
    expect(res!.tags).toHaveLength(2);
    expect(res!.tags.map((t: { slug: string }) => t.slug).sort()).toEqual(['js', 'ts']);
  });
});

// ---------------------------------------------------------------------------
// verifySiteActive
// ---------------------------------------------------------------------------

describe('verifySiteActive', () => {
  it('returns null when the site does not exist', async () => {
    const { verifySiteActive } = await importModule();
    expect(await verifySiteActive(1)).toBeNull();
  });

  it('returns null when the site is inactive', async () => {
    state.clientWebsites.push({ id: 1, active: false });
    const { verifySiteActive } = await importModule();
    expect(await verifySiteActive(1)).toBeNull();
  });

  it('returns the site row when it is active', async () => {
    state.clientWebsites.push({ id: 1, active: true });
    const { verifySiteActive } = await importModule();
    const res = await verifySiteActive(1);
    expect(res).toEqual({ id: 1 });
  });

  it('does not match a different site id', async () => {
    state.clientWebsites.push({ id: 2, active: true });
    const { verifySiteActive } = await importModule();
    expect(await verifySiteActive(1)).toBeNull();
  });
});
