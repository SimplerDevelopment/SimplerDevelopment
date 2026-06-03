// @vitest-environment node
/**
 * Unit tests for lib/actions/client-sites.ts.
 *
 * The module is a thin Drizzle wrapper across clientWebsites / posts /
 * pitchDecks / siteNavigation / websiteDomains / postTypes. We mock
 * `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm` similarly to
 * `actions-blog.test.ts` — chainable query builder backed by in-memory state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  clientWebsites: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  postCategories: Array<Record<string, unknown>>;
  pitchDecks: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  siteNavigation: Array<Record<string, unknown>>;
  websiteDomains: Array<Record<string, unknown>>;
  postTypes: Array<Record<string, unknown>>;
}

const state: MockState = {
  clientWebsites: [],
  posts: [],
  categories: [],
  postCategories: [],
  pitchDecks: [],
  clients: [],
  siteNavigation: [],
  websiteDomains: [],
  postTypes: [],
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
  return new Proxy({
    clientWebsites: wrap('clientWebsites'),
    posts: wrap('posts'),
    categories: wrap('categories'),
    postCategories: wrap('postCategories'),
    pitchDecks: wrap('pitchDecks'),
    clients: wrap('clients'),
    siteNavigation: wrap('siteNavigation'),
    websiteDomains: wrap('websiteDomains'),
    postTypes: wrap('postTypes'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
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
    // If the projection value is itself a table proxy (no __col), return the row keyed by that table
    if (refRec.__isTable) {
      out[alias] = { ...row };
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
        // Keep two views: a flat-merged map for predicate evaluation, plus the
        // per-table sub-records so projections that ask for an entire table
        // (e.g. `{ site: clientWebsites }`) get the right shape.
        out.push({ ...r, ...l, __byTable: { [leftTable]: l, [rightTable]: r } });
      }
    }
  }
  return out;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let joined: Array<Record<string, unknown>> | null = null;
    let filter: unknown = null;
    let limit: number | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      innerJoin(table: { __table: string }, on: unknown) {
        if (!activeTable) return chain;
        const leftRows = joined ?? tableArray(activeTable);
        joined = performInnerJoin(leftRows, activeTable, table.__table, on);
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

    function projectJoinedRow(row: Record<string, unknown>): Record<string, unknown> {
      if (!projection) {
        const merged = { ...row };
        delete merged.__byTable;
        return merged;
      }
      const byTable = (row.__byTable as Record<string, Record<string, unknown>>) ?? {};
      const out: Record<string, unknown> = {};
      for (const [alias, ref] of Object.entries(projection)) {
        const refRec = ref as { __col?: string; __table?: string };
        if (refRec.__table && !refRec.__col) {
          out[alias] = byTable[refRec.__table] ? { ...byTable[refRec.__table] } : undefined;
          continue;
        }
        const c = getCol(ref);
        out[alias] = c ? row[c.col] : undefined;
      }
      return out;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows: Array<Record<string, unknown>>;
      if (joined) {
        rows = joined.filter((r) => evalPredicate(filter, r));
      } else {
        rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      }
      let out = joined ? rows.map(projectJoinedRow) : rows.map((r) => projectRow(r, projection));
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
    },
  };
});

beforeEach(() => {
  state.clientWebsites.length = 0;
  state.posts.length = 0;
  state.categories.length = 0;
  state.postCategories.length = 0;
  state.pitchDecks.length = 0;
  state.clients.length = 0;
  state.siteNavigation.length = 0;
  state.websiteDomains.length = 0;
  state.postTypes.length = 0;
});

async function importModule() {
  return await import('@/lib/actions/client-sites');
}

// Helpers ------------------------------------------------------------------

function seedSite(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    clientId: 10,
    domain: 'example.com',
    subdomain: null,
    active: true,
    ...overrides,
  };
  state.clientWebsites.push(row);
  return row;
}

function seedWebsiteDomain(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = { id: 1, websiteId: 1, domain: 'aux.example.com', ...overrides };
  state.websiteDomains.push(row);
  return row;
}

function seedPost(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    websiteId: 1,
    slug: 'home',
    title: 'Home',
    postType: 'page',
    published: true,
    publishedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
  state.posts.push(row);
  return row;
}

function seedPostType(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = { id: 1, websiteId: null, slug: 'solution', ...overrides };
  state.postTypes.push(row);
  return row;
}

function seedDeck(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = { id: 1, clientId: 10, slug: 'pitch', title: 'A Pitch', status: 'published', ...overrides };
  state.pitchDecks.push(row);
  return row;
}

function seedNav(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    websiteId: 1,
    label: 'Home',
    href: '/',
    parentId: null,
    sortOrder: 0,
    openInNewTab: false,
    isButton: false,
    description: null,
    icon: null,
    featuredImage: null,
    ...overrides,
  };
  state.siteNavigation.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// getClientWebsiteByDomain
// ---------------------------------------------------------------------------

describe('getClientWebsiteByDomain', () => {
  it('returns the site matching primary domain (active)', async () => {
    seedSite({ id: 1, domain: 'foo.com', active: true });
    const { getClientWebsiteByDomain } = await importModule();
    const res = await getClientWebsiteByDomain('foo.com');
    expect(res).toMatchObject({ id: 1, domain: 'foo.com' });
  });

  it('ignores inactive sites with matching primary domain', async () => {
    seedSite({ id: 1, domain: 'foo.com', active: false });
    const { getClientWebsiteByDomain } = await importModule();
    const res = await getClientWebsiteByDomain('foo.com');
    expect(res).toBeNull();
  });

  it('falls back to websiteDomains lookup', async () => {
    seedSite({ id: 7, domain: 'primary.com', active: true });
    seedWebsiteDomain({ websiteId: 7, domain: 'alias.com' });
    const { getClientWebsiteByDomain } = await importModule();
    const res = await getClientWebsiteByDomain('alias.com');
    expect(res).toMatchObject({ id: 7, domain: 'primary.com' });
  });

  it('skips alias lookup when joined site is inactive', async () => {
    seedSite({ id: 7, domain: 'primary.com', active: false });
    seedWebsiteDomain({ websiteId: 7, domain: 'alias.com' });
    const { getClientWebsiteByDomain } = await importModule();
    const res = await getClientWebsiteByDomain('alias.com');
    expect(res).toBeNull();
  });

  it('falls back to subdomain match on simplerdevelopment.com', async () => {
    seedSite({ id: 3, domain: 'sd-testing.simplerdevelopment.com', subdomain: 'sd-testing', active: true });
    // But ensure the primary-domain lookup misses by giving the row a non-matching domain.
    state.clientWebsites.length = 0;
    seedSite({ id: 3, domain: 'unrelated.com', subdomain: 'sd-testing', active: true });
    const { getClientWebsiteByDomain } = await importModule();
    const res = await getClientWebsiteByDomain('sd-testing.simplerdevelopment.com');
    expect(res).toMatchObject({ id: 3, subdomain: 'sd-testing' });
  });

  it('returns null when subdomain branch matches the regex but no row exists', async () => {
    const { getClientWebsiteByDomain } = await importModule();
    const res = await getClientWebsiteByDomain('missing.simplerdevelopment.com');
    expect(res).toBeNull();
  });

  it('returns null when no domain pattern matches at all', async () => {
    const { getClientWebsiteByDomain } = await importModule();
    const res = await getClientWebsiteByDomain('random.org');
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getClientPage
// ---------------------------------------------------------------------------

describe('getClientPage', () => {
  it('returns null when no matching page', async () => {
    const { getClientPage } = await importModule();
    const res = await getClientPage(1, 'nope');
    expect(res).toBeNull();
  });

  it('returns published page matching slug + websiteId by default', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'about', published: true });
    const { getClientPage } = await importModule();
    const res = await getClientPage(1, 'about');
    expect(res).toMatchObject({ slug: 'about' });
  });

  it('excludes unpublished by default', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'draft', published: false });
    const { getClientPage } = await importModule();
    const res = await getClientPage(1, 'draft');
    expect(res).toBeNull();
  });

  it('includes unpublished when preview=true', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'draft', published: false });
    const { getClientPage } = await importModule();
    const res = await getClientPage(1, 'draft', true);
    expect(res).toMatchObject({ slug: 'draft' });
  });

  it('does not return pages from a different websiteId', async () => {
    seedPost({ id: 1, websiteId: 2, slug: 'about', published: true });
    const { getClientPage } = await importModule();
    const res = await getClientPage(1, 'about');
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPostTypeForPost
// ---------------------------------------------------------------------------

describe('getPostTypeForPost', () => {
  it('returns null when postType arg is empty', async () => {
    const { getPostTypeForPost } = await importModule();
    expect(await getPostTypeForPost(1, '')).toBeNull();
  });

  it('returns null when no row matches', async () => {
    const { getPostTypeForPost } = await importModule();
    expect(await getPostTypeForPost(1, 'solution')).toBeNull();
  });

  it('returns a site-specific row when present', async () => {
    seedPostType({ id: 1, websiteId: 1, slug: 'solution' });
    const { getPostTypeForPost } = await importModule();
    const res = await getPostTypeForPost(1, 'solution');
    expect(res).toMatchObject({ id: 1, websiteId: 1, slug: 'solution' });
  });

  it('returns a built-in (websiteId null) row when no override exists', async () => {
    seedPostType({ id: 9, websiteId: null, slug: 'solution' });
    const { getPostTypeForPost } = await importModule();
    const res = await getPostTypeForPost(1, 'solution');
    expect(res).toMatchObject({ id: 9, slug: 'solution' });
  });
});

// ---------------------------------------------------------------------------
// getClientHomePage
// ---------------------------------------------------------------------------

describe('getClientHomePage', () => {
  it('returns the post with slug=home when present', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'home', postType: 'page', published: true });
    const { getClientHomePage } = await importModule();
    const res = await getClientHomePage(1);
    expect(res).toMatchObject({ slug: 'home' });
  });

  it('falls back to slug=index when no home exists', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'index', postType: 'page', published: true });
    const { getClientHomePage } = await importModule();
    const res = await getClientHomePage(1);
    expect(res).toMatchObject({ slug: 'index' });
  });

  it('falls back to first page when neither home nor index exists', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'something', postType: 'page', published: true });
    const { getClientHomePage } = await importModule();
    const res = await getClientHomePage(1);
    expect(res).toMatchObject({ slug: 'something' });
  });

  it('returns null when nothing matches', async () => {
    const { getClientHomePage } = await importModule();
    const res = await getClientHomePage(1);
    expect(res).toBeNull();
  });

  it('honors preview flag for unpublished fallback', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'somewhere', postType: 'page', published: false });
    const { getClientHomePage } = await importModule();
    expect(await getClientHomePage(1)).toBeNull();
    expect(await getClientHomePage(1, true)).toMatchObject({ slug: 'somewhere' });
  });
});

// ---------------------------------------------------------------------------
// getClientBlogPosts
// ---------------------------------------------------------------------------

describe('getClientBlogPosts', () => {
  it('returns [] when no blog posts exist for the site', async () => {
    const { getClientBlogPosts } = await importModule();
    const rows = await getClientBlogPosts(1);
    expect(rows).toEqual([]);
  });

  it('returns only published blog posts for the given website', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'a', postType: 'blog', published: true });
    seedPost({ id: 2, websiteId: 1, slug: 'b', postType: 'blog', published: false });
    seedPost({ id: 3, websiteId: 1, slug: 'c', postType: 'page', published: true });
    seedPost({ id: 4, websiteId: 2, slug: 'd', postType: 'blog', published: true });
    const { getClientBlogPosts } = await importModule();
    const rows = await getClientBlogPosts(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: 'a' });
  });
});

// ---------------------------------------------------------------------------
// getPitchDeckByDomainAndSlug
// ---------------------------------------------------------------------------

describe('getPitchDeckByDomainAndSlug', () => {
  it('returns null when the domain resolves to no site', async () => {
    const { getPitchDeckByDomainAndSlug } = await importModule();
    const res = await getPitchDeckByDomainAndSlug('nowhere.com', 'pitch');
    expect(res).toBeNull();
  });

  it('returns null when the site exists but no published deck matches', async () => {
    seedSite({ id: 1, clientId: 10, domain: 'site.com', active: true });
    const { getPitchDeckByDomainAndSlug } = await importModule();
    const res = await getPitchDeckByDomainAndSlug('site.com', 'pitch');
    expect(res).toBeNull();
  });

  it('returns the published deck for the matching client + slug', async () => {
    seedSite({ id: 1, clientId: 10, domain: 'site.com', active: true });
    seedDeck({ id: 5, clientId: 10, slug: 'pitch', status: 'published' });
    const { getPitchDeckByDomainAndSlug } = await importModule();
    const res = await getPitchDeckByDomainAndSlug('site.com', 'pitch');
    expect(res).toMatchObject({ id: 5, slug: 'pitch' });
  });

  it('excludes decks with non-published status', async () => {
    seedSite({ id: 1, clientId: 10, domain: 'site.com', active: true });
    seedDeck({ id: 5, clientId: 10, slug: 'pitch', status: 'draft' });
    const { getPitchDeckByDomainAndSlug } = await importModule();
    const res = await getPitchDeckByDomainAndSlug('site.com', 'pitch');
    expect(res).toBeNull();
  });

  it('excludes decks belonging to a different client', async () => {
    seedSite({ id: 1, clientId: 10, domain: 'site.com', active: true });
    seedDeck({ id: 5, clientId: 99, slug: 'pitch', status: 'published' });
    const { getPitchDeckByDomainAndSlug } = await importModule();
    const res = await getPitchDeckByDomainAndSlug('site.com', 'pitch');
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getClientPitchDecks
// ---------------------------------------------------------------------------

describe('getClientPitchDecks', () => {
  it('returns [] when domain matches no site', async () => {
    const { getClientPitchDecks } = await importModule();
    expect(await getClientPitchDecks('nowhere.com')).toEqual([]);
  });

  it('returns published decks for the resolved client (projected)', async () => {
    seedSite({ id: 1, clientId: 10, domain: 'site.com', active: true });
    seedDeck({ id: 5, clientId: 10, slug: 'a', title: 'A', status: 'published' });
    seedDeck({ id: 6, clientId: 10, slug: 'b', title: 'B', status: 'draft' });
    seedDeck({ id: 7, clientId: 99, slug: 'c', title: 'C', status: 'published' });
    const { getClientPitchDecks } = await importModule();
    const rows = await getClientPitchDecks('site.com');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: 5, title: 'A', slug: 'a' });
  });
});

// ---------------------------------------------------------------------------
// getClientSiteNav
// ---------------------------------------------------------------------------

describe('getClientSiteNav', () => {
  it('returns [] when no pages exist', async () => {
    const { getClientSiteNav } = await importModule();
    expect(await getClientSiteNav(1)).toEqual([]);
  });

  it('returns projected published pages for the site', async () => {
    seedPost({ id: 1, websiteId: 1, slug: 'about', title: 'About', postType: 'page', published: true });
    seedPost({ id: 2, websiteId: 1, slug: 'draft', title: 'Draft', postType: 'page', published: false });
    seedPost({ id: 3, websiteId: 1, slug: 'blog', title: 'Blog', postType: 'blog', published: true });
    seedPost({ id: 4, websiteId: 2, slug: 'about', title: 'OtherSite', postType: 'page', published: true });
    const { getClientSiteNav } = await importModule();
    const rows = await getClientSiteNav(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: 1, title: 'About', slug: 'about', postType: 'page' });
  });
});

// ---------------------------------------------------------------------------
// getClientSiteNavItems
// ---------------------------------------------------------------------------

describe('getClientSiteNavItems', () => {
  it('returns [] when no nav items exist for the site', async () => {
    const { getClientSiteNavItems } = await importModule();
    expect(await getClientSiteNavItems(1)).toEqual([]);
  });

  it('returns flat list when nav items have no parents', async () => {
    seedNav({ id: 1, websiteId: 1, label: 'Home', href: '/', parentId: null, sortOrder: 0 });
    seedNav({ id: 2, websiteId: 1, label: 'About', href: '/about', parentId: null, sortOrder: 1 });
    const { getClientSiteNavItems } = await importModule();
    const items = await getClientSiteNavItems(1);
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe('Home');
    expect(items[0].children).toEqual([]);
    expect(items[1].label).toBe('About');
  });

  it('builds a tree for parent/child nav rows', async () => {
    seedNav({ id: 1, websiteId: 1, label: 'Top', href: '/top', parentId: null, sortOrder: 0 });
    seedNav({ id: 2, websiteId: 1, label: 'Child', href: '/top/child', parentId: 1, sortOrder: 0 });
    seedNav({ id: 3, websiteId: 1, label: 'Grandchild', href: '/top/child/g', parentId: 2, sortOrder: 0 });
    const { getClientSiteNavItems } = await importModule();
    const items = await getClientSiteNavItems(1);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Top');
    expect(items[0].children).toHaveLength(1);
    expect(items[0].children![0].label).toBe('Child');
    expect(items[0].children![0].children).toHaveLength(1);
    expect(items[0].children![0].children![0].label).toBe('Grandchild');
  });

  it('excludes nav rows from other websites', async () => {
    seedNav({ id: 1, websiteId: 1, label: 'A', href: '/a', parentId: null });
    seedNav({ id: 2, websiteId: 2, label: 'B', href: '/b', parentId: null });
    const { getClientSiteNavItems } = await importModule();
    const items = await getClientSiteNavItems(1);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('A');
  });

  it('preserves all NavItem fields when projecting rows', async () => {
    seedNav({
      id: 1,
      websiteId: 1,
      label: 'Top',
      href: '/top',
      parentId: null,
      sortOrder: 5,
      openInNewTab: true,
      isButton: true,
      description: 'desc',
      icon: 'star',
      featuredImage: '/img.png',
    });
    const { getClientSiteNavItems } = await importModule();
    const items = await getClientSiteNavItems(1);
    expect(items[0]).toMatchObject({
      sortOrder: 5,
      openInNewTab: true,
      isButton: true,
      description: 'desc',
      icon: 'star',
      featuredImage: '/img.png',
    });
  });
});
