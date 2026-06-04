// @vitest-environment node
/**
 * Unit tests for lib/actions/blog.ts.
 *
 * The module is a thin Drizzle wrapper over the `posts`/`categories`/`tags` and
 * the two link tables. We mock `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm`
 * the same way `brain-relationships.test.ts` does — chainable query builder
 * backed by in-memory state that each test seeds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface JoinedRow {
  /** post id (FK source) */
  postId: number;
  /** joined target id (categoryId or tagId) */
  joinId: number;
}

interface MockState {
  posts: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
  postCategories: Array<JoinedRow & Record<string, unknown>>;
  postTags: Array<JoinedRow & Record<string, unknown>>;
  /** When set, the next `db.select(...)` call throws this error. */
  throwOnNextSelect: Error | null;
}

const state: MockState = {
  posts: [],
  categories: [],
  tags: [],
  postCategories: [],
  postTags: [],
  throwOnNextSelect: null,
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
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

function getCol(ref: unknown): { col: string; table: string } | null {
  const r = ref as { __col?: string; __table?: string } | undefined;
  if (!r?.__col || !r.__table) return null;
  return { col: r.__col, table: r.__table };
}

function readField(row: Record<string, unknown>, ref: unknown): unknown {
  const c = getCol(ref);
  if (!c) return undefined;
  // For joined rows we store joined-row data under flat keys; but for posts/categories/tags,
  // direct property name lookup works since seed rows are populated with the same keys.
  return row[c.col];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const left = readField(row, f.a);
      return left === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'isNull': {
      const left = readField(row, f.a);
      return left === null || left === undefined;
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
    const c = getCol(ref);
    out[alias] = c ? row[c.col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

/**
 * Inner-join two tables on the supplied condition. For this source file the
 * joins are always equality between a join-row FK and a parent-row id.
 */
function performInnerJoin(
  leftRows: Array<Record<string, unknown>>,
  leftTable: string,
  rightTable: string,
  joinFilter: unknown,
): Array<{ left: Record<string, unknown>; right: Record<string, unknown>; merged: Record<string, unknown> }> {
  const rightRows = tableArray(rightTable);
  const f = joinFilter as { op?: string; a?: unknown; b?: unknown } | undefined;
  if (!f || f.op !== 'eq') return [];
  const aCol = getCol(f.a);
  const bCol = getCol(f.b);
  if (!aCol || !bCol) return [];
  // Decide which side is the left/right column.
  const leftIsA = aCol.table === leftTable;
  const leftColName = leftIsA ? aCol.col : bCol.col;
  const rightColName = leftIsA ? bCol.col : aCol.col;
  const out: Array<{ left: Record<string, unknown>; right: Record<string, unknown>; merged: Record<string, unknown> }> = [];
  for (const l of leftRows) {
    for (const r of rightRows) {
      if (l[leftColName] !== undefined && l[leftColName] === r[rightColName]) {
        // Flat-merge so the predicate evaluator can read either side's columns.
        out.push({ left: l, right: r, merged: { ...r, ...l } });
      }
    }
  }
  return out;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    if (state.throwOnNextSelect) {
      const err = state.throwOnNextSelect;
      state.throwOnNextSelect = null;
      // Defer the throw until a chain method actually awaits.
      return {
        from() {
          throw err;
        },
      };
    }

    let activeTable: string | null = null;
    let joined: Array<{ left: Record<string, unknown>; right: Record<string, unknown>; merged: Record<string, unknown> }> | null = null;
    let filter: unknown = null;
    let limit: number | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      innerJoin(table: { __table: string }, on: unknown) {
        if (!activeTable) return chain;
        if (!joined) {
          joined = performInnerJoin(tableArray(activeTable), activeTable, table.__table, on);
        } else {
          // Chained join: re-run against the merged set as the new left.
          const leftRows = joined.map((j) => j.merged);
          joined = performInnerJoin(leftRows, activeTable, table.__table, on);
        }
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
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows: Array<Record<string, unknown>>;
      if (joined) {
        rows = joined.map((j) => j.merged).filter((r) => evalPredicate(filter, r));
      } else {
        rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      }
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
      selectDistinct(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
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
  state.throwOnNextSelect = null;
});

async function importModule() {
  return await import('@/lib/actions/blog');
}

// Helpers to seed coherent fixture data.
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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-10'),
    postType: 'blog',
    websiteId: null,
    ...overrides,
  };
  state.posts.push(row);
  return row;
}

function seedCategory(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 100,
    name: 'Engineering',
    slug: 'engineering',
    description: 'Eng posts',
    color: '#abc',
    ...overrides,
  };
  state.categories.push(row);
  return row;
}

function seedTag(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = { id: 200, name: 'TypeScript', slug: 'typescript', ...overrides };
  state.tags.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// getAllBlogPosts
// ---------------------------------------------------------------------------

describe('getAllBlogPosts', () => {
  it('returns [] when no posts exist', async () => {
    const { getAllBlogPosts } = await importModule();
    const rows = await getAllBlogPosts();
    expect(rows).toEqual([]);
  });

  it('returns only published global blog posts (websiteId null)', async () => {
    seedPost({ id: 1, slug: 'a', published: true, postType: 'blog', websiteId: null });
    seedPost({ id: 2, slug: 'b', published: false, postType: 'blog', websiteId: null });
    seedPost({ id: 3, slug: 'c', published: true, postType: 'page', websiteId: null });
    seedPost({ id: 4, slug: 'd', published: true, postType: 'blog', websiteId: 7 });
    const { getAllBlogPosts } = await importModule();
    const rows = await getAllBlogPosts();
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe('a');
    expect(rows[0].tags).toEqual([]);
    expect(rows[0].category).toBeUndefined();
  });

  it('hydrates each post with its category and tags', async () => {
    seedPost({ id: 1, slug: 'a' });
    seedCategory({ id: 100, name: 'Eng', slug: 'eng', color: '#111' });
    seedTag({ id: 200, name: 'TS', slug: 'ts' });
    seedTag({ id: 201, name: 'JS', slug: 'js' });
    state.postCategories.push({ postId: 1, categoryId: 100 });
    state.postTags.push({ postId: 1, tagId: 200 }, { postId: 1, tagId: 201 });

    const { getAllBlogPosts } = await importModule();
    const rows = await getAllBlogPosts();
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toMatchObject({ id: 100, name: 'Eng', slug: 'eng', color: '#111' });
    expect(rows[0].tags).toHaveLength(2);
    expect(rows[0].tags.map((t) => t.slug).sort()).toEqual(['js', 'ts']);
  });

  it('returns [] and swallows the error when the DB throws', async () => {
    state.throwOnNextSelect = new Error('db down');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAllBlogPosts } = await importModule();
    const rows = await getAllBlogPosts();
    expect(rows).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getBlogPostBySlug
// ---------------------------------------------------------------------------

describe('getBlogPostBySlug', () => {
  it('returns null when the post is missing', async () => {
    const { getBlogPostBySlug } = await importModule();
    const res = await getBlogPostBySlug('nope');
    expect(res).toBeNull();
  });

  it('returns null when matching post is unpublished', async () => {
    seedPost({ id: 1, slug: 'draft', published: false });
    const { getBlogPostBySlug } = await importModule();
    const res = await getBlogPostBySlug('draft');
    expect(res).toBeNull();
  });

  it('returns null when matching post belongs to a tenant (websiteId set)', async () => {
    seedPost({ id: 1, slug: 'tenant-post', websiteId: 42 });
    const { getBlogPostBySlug } = await importModule();
    const res = await getBlogPostBySlug('tenant-post');
    expect(res).toBeNull();
  });

  it('returns null when matching post is the wrong postType', async () => {
    seedPost({ id: 1, slug: 'page-not-blog', postType: 'page' });
    const { getBlogPostBySlug } = await importModule();
    const res = await getBlogPostBySlug('page-not-blog');
    expect(res).toBeNull();
  });

  it('hydrates the post with category and tags', async () => {
    seedPost({ id: 1, slug: 'hello' });
    seedCategory({ id: 100, name: 'Eng', slug: 'eng', color: null });
    seedTag({ id: 200, name: 'TS', slug: 'ts' });
    state.postCategories.push({ postId: 1, categoryId: 100 });
    state.postTags.push({ postId: 1, tagId: 200 });

    const { getBlogPostBySlug } = await importModule();
    const res = await getBlogPostBySlug('hello');
    expect(res).not.toBeNull();
    expect(res!.slug).toBe('hello');
    expect(res!.category).toMatchObject({ id: 100, slug: 'eng' });
    expect(res!.tags).toHaveLength(1);
    expect(res!.tags[0].slug).toBe('ts');
  });

  it('returns category=undefined when the post has no category mapping', async () => {
    seedPost({ id: 1, slug: 'orphan' });
    const { getBlogPostBySlug } = await importModule();
    const res = await getBlogPostBySlug('orphan');
    expect(res).not.toBeNull();
    expect(res!.category).toBeUndefined();
    expect(res!.tags).toEqual([]);
  });

  it('returns null and swallows DB errors', async () => {
    state.throwOnNextSelect = new Error('db down');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getBlogPostBySlug } = await importModule();
    const res = await getBlogPostBySlug('hello');
    expect(res).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getBlogPostsByCategory
// ---------------------------------------------------------------------------

describe('getBlogPostsByCategory', () => {
  it('returns [] when the category does not exist', async () => {
    const { getBlogPostsByCategory } = await importModule();
    const rows = await getBlogPostsByCategory('missing');
    expect(rows).toEqual([]);
  });

  it('returns [] when no posts are linked to the category', async () => {
    seedCategory({ id: 100, slug: 'eng' });
    const { getBlogPostsByCategory } = await importModule();
    const rows = await getBlogPostsByCategory('eng');
    expect(rows).toEqual([]);
  });

  it('returns posts in the category with tags hydrated', async () => {
    seedCategory({ id: 100, name: 'Eng', slug: 'eng', color: '#222' });
    seedPost({ id: 1, slug: 'a' });
    seedPost({ id: 2, slug: 'b' });
    seedPost({ id: 3, slug: 'c', published: false }); // filtered out
    seedTag({ id: 200, name: 'TS', slug: 'ts' });
    state.postCategories.push(
      { postId: 1, categoryId: 100 },
      { postId: 2, categoryId: 100 },
      { postId: 3, categoryId: 100 },
    );
    state.postTags.push({ postId: 1, tagId: 200 });

    const { getBlogPostsByCategory } = await importModule();
    const rows = await getBlogPostsByCategory('eng');
    expect(rows).toHaveLength(2);
    const post1 = rows.find((r) => r.slug === 'a')!;
    expect(post1.category).toMatchObject({ id: 100, slug: 'eng', color: '#222' });
    expect(post1.tags).toEqual([{ id: 200, name: 'TS', slug: 'ts' }]);
    const post2 = rows.find((r) => r.slug === 'b')!;
    expect(post2.tags).toEqual([]);
  });

  it('excludes posts from other tenants / wrong postType', async () => {
    seedCategory({ id: 100, slug: 'eng' });
    seedPost({ id: 1, slug: 'tenant', websiteId: 5 });
    seedPost({ id: 2, slug: 'page', postType: 'page' });
    state.postCategories.push({ postId: 1, categoryId: 100 }, { postId: 2, categoryId: 100 });
    const { getBlogPostsByCategory } = await importModule();
    const rows = await getBlogPostsByCategory('eng');
    expect(rows).toEqual([]);
  });

  it('returns [] and swallows DB errors', async () => {
    state.throwOnNextSelect = new Error('db down');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getBlogPostsByCategory } = await importModule();
    const rows = await getBlogPostsByCategory('eng');
    expect(rows).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getAllCategories
// ---------------------------------------------------------------------------

describe('getAllCategories', () => {
  it('returns [] when no categories exist', async () => {
    const { getAllCategories } = await importModule();
    const rows = await getAllCategories();
    expect(rows).toEqual([]);
  });

  it('projects all category columns', async () => {
    seedCategory({ id: 1, name: 'A', slug: 'a', description: 'desc a', color: '#aaa' });
    seedCategory({ id: 2, name: 'B', slug: 'b', description: null, color: null });
    // The query is a 3-way join (categories → postCategories → posts) filtered to
    // published global blog posts. Seed one post per category so the join matches.
    seedPost({ id: 10, slug: 'post-a', published: true, postType: 'blog', websiteId: null });
    seedPost({ id: 20, slug: 'post-b', published: true, postType: 'blog', websiteId: null });
    state.postCategories.push({ postId: 10, categoryId: 1 }, { postId: 20, categoryId: 2 });
    const { getAllCategories } = await importModule();
    const rows = await getAllCategories();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 1, slug: 'a', description: 'desc a' });
    expect(rows[1]).toMatchObject({ id: 2, slug: 'b', description: null });
  });

  it('returns [] and swallows DB errors', async () => {
    state.throwOnNextSelect = new Error('db down');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAllCategories } = await importModule();
    const rows = await getAllCategories();
    expect(rows).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getCategoryBySlug
// ---------------------------------------------------------------------------

describe('getCategoryBySlug', () => {
  it('returns null when no category matches', async () => {
    const { getCategoryBySlug } = await importModule();
    const res = await getCategoryBySlug('missing');
    expect(res).toBeNull();
  });

  it('returns the category projection when one matches', async () => {
    seedCategory({ id: 7, name: 'Design', slug: 'design', description: 'd', color: '#7' });
    const { getCategoryBySlug } = await importModule();
    const res = await getCategoryBySlug('design');
    expect(res).toEqual({ id: 7, name: 'Design', slug: 'design', description: 'd', color: '#7' });
  });

  it('returns null and swallows DB errors', async () => {
    state.throwOnNextSelect = new Error('db down');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getCategoryBySlug } = await importModule();
    const res = await getCategoryBySlug('design');
    expect(res).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getFeaturedBlogPosts
// ---------------------------------------------------------------------------

describe('getFeaturedBlogPosts', () => {
  it('returns [] when there are no posts', async () => {
    const { getFeaturedBlogPosts } = await importModule();
    const rows = await getFeaturedBlogPosts();
    expect(rows).toEqual([]);
  });

  it('returns at most the first 3 published global posts', async () => {
    for (let i = 1; i <= 5; i++) {
      seedPost({ id: i, slug: `p${i}`, title: `Post ${i}` });
    }
    const { getFeaturedBlogPosts } = await importModule();
    const rows = await getFeaturedBlogPosts();
    expect(rows).toHaveLength(3);
  });

  it('returns fewer than 3 when fewer than 3 are available', async () => {
    seedPost({ id: 1, slug: 'only' });
    const { getFeaturedBlogPosts } = await importModule();
    const rows = await getFeaturedBlogPosts();
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe('only');
  });
});
