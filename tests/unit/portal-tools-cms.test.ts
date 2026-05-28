// @vitest-environment node
/**
 * Unit tests for lib/ai/portal-tools/cms.ts.
 *
 * The module is a thin Drizzle wrapper exposing AI-tool handlers that read/
 * write CMS state (websites, posts, categories, tags, media, hosted sites,
 * post revisions). We mock `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm`
 * with a chainable thenable proxy backed by in-memory state — same pattern
 * as `actions-client-sites.test.ts`, extended to cover insert().values()
 * .returning() and update().set().where().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  clientWebsites: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  postRevisions: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
  hostedSites: Array<Record<string, unknown>>;
  nextId: Record<string, number>;
}

const state: MockState = {
  clientWebsites: [],
  posts: [],
  postRevisions: [],
  categories: [],
  tags: [],
  media: [],
  hostedSites: [],
  nextId: {
    clientWebsites: 1,
    posts: 1,
    postRevisions: 1,
    categories: 1,
    tags: 1,
    media: 1,
    hostedSites: 1,
  },
};

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName, __isTable: true },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '__isTable') return true;
          if (prop === '__col') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    clientWebsites: wrap('clientWebsites'),
    posts: wrap('posts'),
    postRevisions: wrap('postRevisions'),
    categories: wrap('categories'),
    tags: wrap('tags'),
    media: wrap('media'),
    hostedSites: wrap('hostedSites'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
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
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const left = readField(row, f.a);
      return left === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
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
    const refRec = ref as { __col?: string; __table?: string; __isTable?: boolean };
    if (refRec.__isTable) {
      out[alias] = { ...row };
      continue;
    }
    if ((refRec as { op?: string }).op === 'sql') {
      // Treat sql-tagged projections as count(*) — return number of rows
      // is handled at the query level; here we just emit 0 to keep shape.
      out[alias] = undefined;
      continue;
    }
    const c = getCol(ref);
    out[alias] = c ? row[c.col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
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
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));

      // Detect a sql-tagged count(*) projection — handle by emitting a single
      // row { count: <total> } as Drizzle does.
      if (projection) {
        const projEntries = Object.entries(projection);
        const isCountQuery =
          projEntries.length === 1 &&
          (projEntries[0][1] as { op?: string }).op === 'sql';
        if (isCountQuery) {
          const alias = projEntries[0][0];
          return Promise.resolve([{ [alias]: rows.length }]);
        }
      }

      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const row of rows) {
          const arr = tableArray(table.__table);
          const idx = (state.nextId as Record<string, number>)[table.__table] ?? 1;
          const newRow = { id: idx, ...row };
          (state.nextId as Record<string, number>)[table.__table] = idx + 1;
          arr.push(newRow);
          inserted.push(newRow);
        }
        return {
          returning() {
            return Promise.resolve(inserted);
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setPayload: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      set(payload: Record<string, unknown>) {
        setPayload = payload;
        return chain;
      },
      where(filter: unknown) {
        const arr = tableArray(table.__table);
        for (const row of arr) {
          if (evalPredicate(filter, row)) {
            Object.assign(row, setPayload);
          }
        }
        return Promise.resolve(undefined);
      },
    };
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

beforeEach(() => {
  state.clientWebsites.length = 0;
  state.posts.length = 0;
  state.postRevisions.length = 0;
  state.categories.length = 0;
  state.tags.length = 0;
  state.media.length = 0;
  state.hostedSites.length = 0;
  state.nextId = {
    clientWebsites: 1,
    posts: 1,
    postRevisions: 1,
    categories: 1,
    tags: 1,
    media: 1,
    hostedSites: 1,
  };
});

async function importModule() {
  return await import('@/lib/ai/portal-tools/cms');
}

// Helpers ------------------------------------------------------------------

function seedSite(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    clientId: 10,
    name: 'My Site',
    domain: 'example.com',
    subdomain: null,
    description: 'desc',
    deploymentStatus: 'live',
    vercelDomain: 'example.vercel.app',
    ...overrides,
  };
  state.clientWebsites.push(row);
  return row;
}

function seedPost(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    websiteId: 1,
    title: 'Hello',
    slug: 'hello',
    postType: 'page',
    content: '[]',
    excerpt: null,
    published: false,
    publishedAt: null,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
  state.posts.push(row);
  return row;
}

function seedCategory(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = { id: 1, websiteId: 1, name: 'News', slug: 'news', description: 'desc', ...overrides };
  state.categories.push(row);
  return row;
}

function seedTag(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = { id: 1, websiteId: 1, name: 'Tag', slug: 'tag', ...overrides };
  state.tags.push(row);
  return row;
}

function seedMedia(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    websiteId: 1,
    filename: 'foo.png',
    mimeType: 'image/png',
    fileSize: 1024,
    url: 'https://cdn.example.com/foo.png',
    alt: 'foo',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
  state.media.push(row);
  return row;
}

function seedHostedSite(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    clientId: 10,
    name: 'Host',
    customDomain: 'host.example.com',
    railwayDomain: 'host.up.railway.app',
    status: 'active',
    plan: 'pro',
    renewalDate: new Date('2026-12-01'),
    dnsInstructions: 'CNAME ...',
    ...overrides,
  };
  state.hostedSites.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// cmsTools schema
// ---------------------------------------------------------------------------

describe('cmsTools schema', () => {
  it('exposes 14 tools with stable names', async () => {
    const { cmsTools } = await importModule();
    const names = cmsTools.map((t) => t.name).sort();
    expect(names).toEqual([
      'create_website_category',
      'create_website_page',
      'create_website_tag',
      'get_my_hosted_sites',
      'get_my_websites',
      'get_page_content',
      'get_website_categories',
      'get_website_media',
      'get_website_pages',
      'get_website_tags',
      'publish_page',
      'update_block_by_id',
      'update_page_blocks',
      'update_page_metadata',
    ]);
  });

  it('every tool has a non-empty description and an input_schema', async () => {
    const { cmsTools } = await importModule();
    for (const t of cmsTools) {
      expect(typeof t.description).toBe('string');
      expect((t.description as string).length).toBeGreaterThan(0);
      expect(t.input_schema.type).toBe('object');
    }
  });

  it('cmsHandlers exposes a handler per tool name', async () => {
    const { cmsTools, cmsHandlers } = await importModule();
    for (const t of cmsTools) {
      expect(typeof cmsHandlers[t.name]).toBe('function');
      expect(cmsHandlers[t.name].length).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// get_my_websites
// ---------------------------------------------------------------------------

describe('get_my_websites', () => {
  it('returns [] when client has no sites', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_my_websites({}, 10, 1);
    expect(res).toEqual([]);
  });

  it('returns sites with page counts (0 when no posts)', async () => {
    seedSite({ id: 1, clientId: 10, name: 'A' });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_my_websites({}, 10, 1)) as Array<Record<string, unknown>>;
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe(1);
    expect(res[0].name).toBe('A');
    expect(res[0].pageCount).toBe(0);
  });

  it('counts pages per website correctly', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedSite({ id: 2, clientId: 10 });
    seedPost({ id: 1, websiteId: 1 });
    seedPost({ id: 2, websiteId: 1 });
    seedPost({ id: 3, websiteId: 2 });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_my_websites({}, 10, 1)) as Array<Record<string, unknown>>;
    const byId = Object.fromEntries(res.map((r) => [r.id, r.pageCount]));
    expect(byId[1]).toBe(2);
    expect(byId[2]).toBe(1);
  });

  it('does not return sites owned by other clients', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedSite({ id: 2, clientId: 99 });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_my_websites({}, 10, 1)) as Array<Record<string, unknown>>;
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// get_website_pages
// ---------------------------------------------------------------------------

describe('get_website_pages', () => {
  it('returns error when website not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_website_pages({ website_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Website not found' });
  });

  it('returns error when website belongs to another client', async () => {
    seedSite({ id: 1, clientId: 99 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_website_pages({ website_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Website not found' });
  });

  it('returns the projected page list for the site', async () => {
    seedSite({ id: 1, clientId: 10, name: 'My Site' });
    seedPost({ id: 1, websiteId: 1, title: 'A', slug: 'a' });
    seedPost({ id: 2, websiteId: 1, title: 'B', slug: 'b' });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_website_pages({ website_id: 1 }, 10, 1)) as {
      website: string;
      pages: Array<Record<string, unknown>>;
    };
    expect(res.website).toBe('My Site');
    expect(res.pages).toHaveLength(2);
    expect(res.pages[0]).toMatchObject({ title: 'A', slug: 'a' });
  });
});

// ---------------------------------------------------------------------------
// get_website_categories
// ---------------------------------------------------------------------------

describe('get_website_categories', () => {
  it('returns error when website not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_website_categories({ website_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Website not found' });
  });

  it('returns categories for the website only', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedCategory({ id: 1, websiteId: 1, name: 'A' });
    seedCategory({ id: 2, websiteId: 2, name: 'B' });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_website_categories({ website_id: 1 }, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: 1, name: 'A' });
  });
});

// ---------------------------------------------------------------------------
// get_website_tags
// ---------------------------------------------------------------------------

describe('get_website_tags', () => {
  it('returns error when website not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_website_tags({ website_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Website not found' });
  });

  it('returns tags for the website only', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedTag({ id: 1, websiteId: 1, name: 'red' });
    seedTag({ id: 2, websiteId: 2, name: 'blue' });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_website_tags({ website_id: 1 }, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ name: 'red' });
  });
});

// ---------------------------------------------------------------------------
// get_website_media
// ---------------------------------------------------------------------------

describe('get_website_media', () => {
  it('returns error when website not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_website_media({ website_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Website not found' });
  });

  it('returns projected media for the website', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedMedia({ id: 1, websiteId: 1, filename: 'a.png' });
    seedMedia({ id: 2, websiteId: 2, filename: 'b.png' });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_website_media({ website_id: 1 }, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ filename: 'a.png' });
  });
});

// ---------------------------------------------------------------------------
// get_my_hosted_sites
// ---------------------------------------------------------------------------

describe('get_my_hosted_sites', () => {
  it('returns [] when client has no hosted sites', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_my_hosted_sites({}, 10, 1);
    expect(res).toEqual([]);
  });

  it('returns hosted sites for the client only', async () => {
    seedHostedSite({ id: 1, clientId: 10, name: 'mine' });
    seedHostedSite({ id: 2, clientId: 99, name: 'theirs' });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_my_hosted_sites({}, 10, 1)) as Array<Record<string, unknown>>;
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ name: 'mine', plan: 'pro' });
  });
});

// ---------------------------------------------------------------------------
// create_website_page
// ---------------------------------------------------------------------------

describe('create_website_page', () => {
  it('returns error when website not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.create_website_page(
      { website_id: 1, title: 'X', slug: 'x', post_type: 'page' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Website not found' });
  });

  it('creates a draft page when published is omitted', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.create_website_page(
      { website_id: 1, title: 'Hello', slug: 'hello', post_type: 'page' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(res.postId).toBeDefined();
    expect((res.message as string).includes('as draft')).toBe(true);
    const post = state.posts.find((p) => p.id === res.postId)!;
    expect(post.title).toBe('Hello');
    expect(post.published).toBe(false);
    expect(post.publishedAt).toBeNull();
    expect(post.content).toBe('[]');
    expect(post.excerpt).toBeNull();
  });

  it('publishes immediately when published=true and sets publishedAt', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.create_website_page(
      {
        website_id: 1,
        title: 'Hi',
        slug: 'hi',
        post_type: 'blog',
        excerpt: 'sum',
        published: true,
      },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect((res.message as string).includes('and published')).toBe(true);
    const post = state.posts.find((p) => p.id === res.postId)!;
    expect(post.published).toBe(true);
    expect(post.publishedAt).toBeInstanceOf(Date);
    expect(post.excerpt).toBe('sum');
    expect(post.postType).toBe('blog');
  });

  it('falls back to post_type=page when not supplied', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.create_website_page(
      { website_id: 1, title: 'T', slug: 't' },
      10,
      1,
    )) as Record<string, unknown>;
    const post = state.posts.find((p) => p.id === res.postId)!;
    expect(post.postType).toBe('page');
  });

  it('stores valid blocks JSON', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    const blocks = JSON.stringify([{ id: 'b1', type: 'heading', text: 'Hi' }]);
    const res = (await cmsHandlers.create_website_page(
      { website_id: 1, title: 'T', slug: 't', post_type: 'page', blocks },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const post = state.posts.find((p) => p.id === res.postId)!;
    expect(JSON.parse(post.content as string)).toEqual([
      { id: 'b1', type: 'heading', text: 'Hi' },
    ]);
  });

  it('returns error when blocks is invalid JSON', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.create_website_page(
      { website_id: 1, title: 'T', slug: 't', post_type: 'page', blocks: '{not json' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Invalid JSON in blocks' });
  });

  it('returns error when blocks is not an array', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.create_website_page(
      { website_id: 1, title: 'T', slug: 't', post_type: 'page', blocks: '{"a":1}' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'blocks must be a JSON array' });
  });
});

// ---------------------------------------------------------------------------
// publish_page
// ---------------------------------------------------------------------------

describe('publish_page', () => {
  it('returns error when post does not exist', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.publish_page({ post_id: 1, published: true }, 10, 1);
    expect(res).toEqual({ error: 'Page not found' });
  });

  it('returns error when post has no websiteId', async () => {
    seedPost({ id: 1, websiteId: null });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.publish_page({ post_id: 1, published: true }, 10, 1);
    expect(res).toEqual({ error: 'Page not found' });
  });

  it('returns error when page does not belong to the caller client', async () => {
    seedSite({ id: 1, clientId: 99 });
    seedPost({ id: 1, websiteId: 1, title: 'P' });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.publish_page({ post_id: 1, published: true }, 10, 1);
    expect(res).toEqual({ error: 'Page does not belong to your website' });
  });

  it('publishes a draft page', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1, title: 'Draft', published: false, publishedAt: null });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.publish_page({ post_id: 1, published: true }, 10, 1)) as Record<
      string,
      unknown
    >;
    expect(res.success).toBe(true);
    expect((res.message as string).includes('published')).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    expect(post.published).toBe(true);
    expect(post.publishedAt).toBeInstanceOf(Date);
  });

  it('unpublishes a published page and nulls publishedAt', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1, title: 'Live', published: true, publishedAt: new Date() });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.publish_page({ post_id: 1, published: false }, 10, 1)) as Record<
      string,
      unknown
    >;
    expect(res.success).toBe(true);
    expect((res.message as string).includes('unpublished')).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    expect(post.published).toBe(false);
    expect(post.publishedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// create_website_category
// ---------------------------------------------------------------------------

describe('create_website_category', () => {
  it('returns error when website not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.create_website_category(
      { website_id: 1, name: 'N', slug: 'n' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Website not found' });
  });

  it('inserts a category and returns the new id', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.create_website_category(
      { website_id: 1, name: 'News', slug: 'news', description: 'about news' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(res.categoryId).toBeDefined();
    expect(state.categories).toHaveLength(1);
    expect(state.categories[0]).toMatchObject({
      name: 'News',
      slug: 'news',
      description: 'about news',
      websiteId: 1,
    });
  });

  it('defaults description to null when omitted', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    await cmsHandlers.create_website_category({ website_id: 1, name: 'X', slug: 'x' }, 10, 1);
    expect(state.categories[0].description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// create_website_tag
// ---------------------------------------------------------------------------

describe('create_website_tag', () => {
  it('returns error when website not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.create_website_tag(
      { website_id: 1, name: 'T', slug: 't' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Website not found' });
  });

  it('inserts a tag and returns the new id', async () => {
    seedSite({ id: 1, clientId: 10 });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.create_website_tag(
      { website_id: 1, name: 'Tag', slug: 'tag' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(res.tagId).toBeDefined();
    expect(state.tags).toHaveLength(1);
    expect(state.tags[0]).toMatchObject({ name: 'Tag', slug: 'tag', websiteId: 1 });
  });
});

// ---------------------------------------------------------------------------
// get_page_content
// ---------------------------------------------------------------------------

describe('get_page_content', () => {
  it('returns error when post does not exist', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_page_content({ post_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Page not found' });
  });

  it('returns error when post has no websiteId', async () => {
    seedPost({ id: 1, websiteId: null });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_page_content({ post_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Page not found' });
  });

  it('returns error when page does not belong to caller', async () => {
    seedSite({ id: 1, clientId: 99, name: 'theirs' });
    seedPost({ id: 1, websiteId: 1 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.get_page_content({ post_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Page does not belong to your website' });
  });

  it('returns the parsed blocks payload', async () => {
    seedSite({ id: 1, clientId: 10, name: 'Mine' });
    seedPost({
      id: 1,
      websiteId: 1,
      title: 'P',
      slug: 'p',
      postType: 'page',
      published: true,
      content: JSON.stringify([{ id: 'b1', type: 'heading' }]),
    });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_page_content({ post_id: 1 }, 10, 1)) as Record<string, unknown>;
    expect(res).toMatchObject({
      postId: 1,
      title: 'P',
      slug: 'p',
      postType: 'page',
      published: true,
      website: 'Mine',
    });
    expect(res.blocks).toEqual([{ id: 'b1', type: 'heading' }]);
  });

  it('returns blocks=[] when content is not valid JSON', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1, content: 'not-json' });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_page_content({ post_id: 1 }, 10, 1)) as Record<string, unknown>;
    expect(res.blocks).toEqual([]);
  });

  it('returns the raw content when it is already an object (not string)', async () => {
    seedSite({ id: 1, clientId: 10 });
    const arr = [{ id: 'b2', type: 'text' }];
    seedPost({ id: 1, websiteId: 1, content: arr as unknown as string });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.get_page_content({ post_id: 1 }, 10, 1)) as Record<string, unknown>;
    expect(res.blocks).toEqual(arr);
  });
});

// ---------------------------------------------------------------------------
// update_page_blocks
// ---------------------------------------------------------------------------

describe('update_page_blocks', () => {
  it('returns error when post not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_page_blocks({ post_id: 1, blocks: '[]' }, 10, 1);
    expect(res).toEqual({ error: 'Page not found' });
  });

  it('returns error when post belongs to another client', async () => {
    seedSite({ id: 1, clientId: 99 });
    seedPost({ id: 1, websiteId: 1 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_page_blocks({ post_id: 1, blocks: '[]' }, 10, 1);
    expect(res).toEqual({ error: 'Page does not belong to your website' });
  });

  it('returns error when blocks is invalid JSON', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_page_blocks({ post_id: 1, blocks: '{nope' }, 10, 1);
    expect(res).toEqual({ error: 'Invalid JSON in blocks' });
  });

  it('returns error when blocks JSON is not an array', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_page_blocks(
      { post_id: 1, blocks: '{"a":1}' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'blocks must be a JSON array' });
  });

  it('saves a revision and replaces the page content', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1, title: 'P', content: '["old"]' });
    const newBlocks = [{ id: 'h1', type: 'heading' }, { id: 't1', type: 'text' }];
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.update_page_blocks(
      { post_id: 1, blocks: JSON.stringify(newBlocks) },
      10,
      55,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect((res.message as string).includes('2 blocks saved')).toBe(true);
    // revision saved with previous content
    expect(state.postRevisions).toHaveLength(1);
    expect(state.postRevisions[0]).toMatchObject({
      postId: 1,
      content: '["old"]',
      title: 'P',
      trigger: 'manual',
      createdBy: 55,
    });
    // page content replaced
    const post = state.posts.find((p) => p.id === 1)!;
    expect(JSON.parse(post.content as string)).toEqual(newBlocks);
  });
});

// ---------------------------------------------------------------------------
// update_block_by_id
// ---------------------------------------------------------------------------

describe('update_block_by_id', () => {
  it('returns error when post not found', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'b1', updates: '{}' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Page not found' });
  });

  it('returns error when page belongs to another client', async () => {
    seedSite({ id: 1, clientId: 99 });
    seedPost({ id: 1, websiteId: 1 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'b1', updates: '{}' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Page does not belong to your website' });
  });

  it('returns error when updates is invalid JSON', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'b1', updates: '{not' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Invalid JSON in updates' });
  });

  it('returns error when existing page content cannot be parsed', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1, content: 'invalid-json' });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'b1', updates: '{}' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Could not parse existing page content' });
  });

  it('returns error when block ID is not found', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1, content: JSON.stringify([{ id: 'other' }]) });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'missing', updates: '{}' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Block with ID "missing" not found on this page' });
  });

  it('merges updates into a top-level block', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({
      id: 1,
      websiteId: 1,
      title: 'P',
      content: JSON.stringify([
        { id: 'b1', type: 'heading', text: 'Old' },
        { id: 'b2', type: 'text', text: 'Keep me' },
      ]),
    });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'b1', updates: JSON.stringify({ text: 'New', subtitle: 'sub' }) },
      10,
      7,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    const blocks = JSON.parse(post.content as string);
    expect(blocks[0]).toMatchObject({ id: 'b1', type: 'heading', text: 'New', subtitle: 'sub' });
    expect(blocks[1]).toMatchObject({ id: 'b2', text: 'Keep me' });
    // revision saved
    expect(state.postRevisions).toHaveLength(1);
    expect(state.postRevisions[0]).toMatchObject({ postId: 1, createdBy: 7, trigger: 'manual' });
  });

  it('finds a block inside section.blocks', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({
      id: 1,
      websiteId: 1,
      content: JSON.stringify([
        { id: 'sec', type: 'section', blocks: [{ id: 'nested', text: 'old' }] },
      ]),
    });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'nested', updates: JSON.stringify({ text: 'NEW' }) },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    const blocks = JSON.parse(post.content as string);
    expect(blocks[0].blocks[0]).toMatchObject({ id: 'nested', text: 'NEW' });
  });

  it('finds a block inside columns[].blocks', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({
      id: 1,
      websiteId: 1,
      content: JSON.stringify([
        {
          id: 'col-wrapper',
          columns: [
            { blocks: [{ id: 'in-col', text: 'old' }] },
            { blocks: [{ id: 'other', text: 'keep' }] },
          ],
        },
      ]),
    });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'in-col', updates: JSON.stringify({ text: 'changed' }) },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    const blocks = JSON.parse(post.content as string);
    expect(blocks[0].columns[0].blocks[0]).toMatchObject({ id: 'in-col', text: 'changed' });
    expect(blocks[0].columns[1].blocks[0]).toMatchObject({ id: 'other', text: 'keep' });
  });

  it('finds a block inside tabs[].blocks', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({
      id: 1,
      websiteId: 1,
      content: JSON.stringify([
        {
          id: 'tabs-wrapper',
          tabs: [
            { blocks: [{ id: 'in-tab', text: 'before' }] },
            { blocks: [{ id: 'other', text: 'keep' }] },
          ],
        },
      ]),
    });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'in-tab', updates: JSON.stringify({ text: 'after' }) },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    const blocks = JSON.parse(post.content as string);
    expect(blocks[0].tabs[0].blocks[0]).toMatchObject({ id: 'in-tab', text: 'after' });
  });

  it('handles content that is already an object (not string)', async () => {
    seedSite({ id: 1, clientId: 10 });
    const arr = [{ id: 'b1', text: 'old' }];
    seedPost({ id: 1, websiteId: 1, content: arr as unknown as string });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.update_block_by_id(
      { post_id: 1, block_id: 'b1', updates: JSON.stringify({ text: 'new' }) },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    const blocks = JSON.parse(post.content as string);
    expect(blocks[0]).toMatchObject({ id: 'b1', text: 'new' });
  });
});

// ---------------------------------------------------------------------------
// update_page_metadata
// ---------------------------------------------------------------------------

describe('update_page_metadata', () => {
  it('returns error when post does not exist', async () => {
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_page_metadata({ post_id: 1, title: 'X' }, 10, 1);
    expect(res).toEqual({ error: 'Page not found' });
  });

  it('returns error when post belongs to another client', async () => {
    seedSite({ id: 1, clientId: 99 });
    seedPost({ id: 1, websiteId: 1 });
    const { cmsHandlers } = await importModule();
    const res = await cmsHandlers.update_page_metadata({ post_id: 1, title: 'X' }, 10, 1);
    expect(res).toEqual({ error: 'Page does not belong to your website' });
  });

  it('updates only the fields supplied', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({
      id: 1,
      websiteId: 1,
      title: 'Old Title',
      slug: 'old',
      excerpt: 'old exc',
      postType: 'page',
    });
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.update_page_metadata(
      { post_id: 1, title: 'New Title' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    expect(post.title).toBe('New Title');
    expect(post.slug).toBe('old');
    expect(post.excerpt).toBe('old exc');
    expect(post.postType).toBe('page');
  });

  it('updates slug, excerpt, and postType when provided', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({
      id: 1,
      websiteId: 1,
      title: 'T',
      slug: 'old',
      excerpt: null,
      postType: 'page',
    });
    const { cmsHandlers } = await importModule();
    await cmsHandlers.update_page_metadata(
      { post_id: 1, slug: 'new-slug', excerpt: 'sum', post_type: 'blog' },
      10,
      1,
    );
    const post = state.posts.find((p) => p.id === 1)!;
    expect(post.slug).toBe('new-slug');
    expect(post.excerpt).toBe('sum');
    expect(post.postType).toBe('blog');
  });

  it('no-ops field updates when only post_id is passed (still touches updatedAt)', async () => {
    seedSite({ id: 1, clientId: 10 });
    seedPost({ id: 1, websiteId: 1, title: 'Same' });
    const before = state.posts[0].updatedAt;
    const { cmsHandlers } = await importModule();
    const res = (await cmsHandlers.update_page_metadata({ post_id: 1 }, 10, 1)) as Record<
      string,
      unknown
    >;
    expect(res.success).toBe(true);
    const post = state.posts.find((p) => p.id === 1)!;
    expect(post.title).toBe('Same');
    // updatedAt should be a Date and not stale
    expect(post.updatedAt).toBeInstanceOf(Date);
    expect((post.updatedAt as Date).getTime()).toBeGreaterThanOrEqual((before as Date).getTime());
  });
});
