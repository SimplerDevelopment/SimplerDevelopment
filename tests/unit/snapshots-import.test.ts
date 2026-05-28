// @vitest-environment node
/**
 * Unit tests for lib/snapshots/import.ts.
 *
 * The module wraps every write in `db.transaction`. The mock implements a
 * chainable query builder backed by in-memory arrays so each test can seed
 * data, run the importer, and then inspect the resulting rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SnapshotPayload } from '@/lib/snapshots/types';

// ---------------------------------------------------------------------------
// Mock state — shared across the db and schema mocks below.
// ---------------------------------------------------------------------------

interface MockState {
  clientWebsites: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  postTypes: Array<Record<string, unknown>>;
  customFields: Array<Record<string, unknown>>;
  siteNavigation: Array<Record<string, unknown>>;
  blockTemplates: Array<Record<string, unknown>>;
}

const state: MockState = {
  clientWebsites: [],
  posts: [],
  postTypes: [],
  customFields: [],
  siteNavigation: [],
  blockTemplates: [],
};

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

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
  return {
    clientWebsites: wrap('clientWebsites'),
    posts: wrap('posts'),
    postTypes: wrap('postTypes'),
    customFields: wrap('customFields'),
    siteNavigation: wrap('siteNavigation'),
    blockTemplates: wrap('blockTemplates'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    list?: unknown[];
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const list = (f.list ?? []) as unknown[];
      return list.includes(row[col.__col]);
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
    const r = ref as { __col?: string } | undefined;
    out[alias] = r?.__col ? row[r.__col] : undefined;
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
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextId(), createdAt: new Date(), updatedAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning(projection?: Record<string, unknown>) {
            const out = projection
              ? inserted.map((r) => projectRow(r, projection))
              : inserted.map((r) => ({ ...r }));
            return Promise.resolve(out);
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) Object.assign(r, patch);
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const all = tableArray(table.__table);
        const matched: Array<Record<string, unknown>> = [];
        const remaining: Array<Record<string, unknown>> = [];
        for (const r of all) {
          if (evalPredicate(filter, r)) matched.push(r);
          else remaining.push(r);
        }
        all.length = 0;
        all.push(...remaining);
        return Promise.resolve(matched.map((r) => ({ id: r.id })));
      },
    };
  }

  const db: Record<string, unknown> = {
    select(projection?: Record<string, unknown>) {
      return buildSelect(projection ?? null);
    },
    insert(table: { __table: string }) {
      return buildInsert(table);
    },
    update(table: { __table: string }) {
      return buildUpdate(table);
    },
    delete(table: { __table: string }) {
      return buildDelete(table);
    },
    transaction(fn: (tx: unknown) => Promise<unknown>) {
      return fn(db);
    },
  };

  return { db };
});

beforeEach(() => {
  state.clientWebsites.length = 0;
  state.posts.length = 0;
  state.postTypes.length = 0;
  state.customFields.length = 0;
  state.siteNavigation.length = 0;
  state.blockTemplates.length = 0;
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/snapshots/import');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function minimalPayload(overrides: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {
    schemaVersion: 1,
    site: {
      name: 'Source Site',
      settings: {},
      customCode: null,
    },
    posts: [],
    navigation: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Argument validation
// ---------------------------------------------------------------------------

describe('importSnapshot - argument validation', () => {
  it('throws when neither siteId nor createNewSite is supplied', async () => {
    const { importSnapshot } = await importModule();
    await expect(importSnapshot(minimalPayload(), 1)).rejects.toThrow(
      /must specify either/i,
    );
  });

  it('throws when both siteId and createNewSite are supplied', async () => {
    const { importSnapshot } = await importModule();
    await expect(
      importSnapshot(minimalPayload(), 1, { siteId: 5, createNewSite: true }),
    ).rejects.toThrow(/mutually exclusive/i);
  });

  it('throws on unsupported schemaVersion', async () => {
    const { importSnapshot } = await importModule();
    const bad = { ...minimalPayload(), schemaVersion: 2 } as unknown as SnapshotPayload;
    await expect(importSnapshot(bad, 1, { createNewSite: true })).rejects.toThrow(
      /unsupported schemaVersion/i,
    );
  });
});

// ---------------------------------------------------------------------------
// createNewSite branch
// ---------------------------------------------------------------------------

describe('importSnapshot - createNewSite', () => {
  it('creates a fresh client_websites row using payload site name', async () => {
    const { importSnapshot } = await importModule();
    const res = await importSnapshot(
      minimalPayload({
        site: { name: 'My Site', settings: { description: 'desc' } },
      }),
      42,
      { createNewSite: true },
    );
    expect(res.siteId).toBeGreaterThan(0);
    expect(state.clientWebsites).toHaveLength(1);
    const created = state.clientWebsites[0];
    expect(created.clientId).toBe(42);
    expect(created.name).toBe('My Site');
    expect(created.description).toBe('desc');
    expect(created.publicAccess).toBe(false);
    expect(created.deploymentStatus).toBe('pending');
  });

  it('honors newSiteName override (with whitespace trimmed)', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(minimalPayload(), 1, {
      createNewSite: true,
      newSiteName: '  Overridden  ',
    });
    expect(state.clientWebsites[0].name).toBe('Overridden');
  });

  it('falls back to "Imported Site" when both names are empty', async () => {
    const { importSnapshot } = await importModule();
    const payload = minimalPayload();
    payload.site.name = '';
    await importSnapshot(payload, 1, { createNewSite: true });
    expect(state.clientWebsites[0].name).toBe('Imported Site');
  });

  it('persists customCss/customJs from payload customCode', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        site: {
          name: 'X',
          settings: {},
          customCode: { customCss: '.a{}', customJs: 'console.log(1)' },
        },
      }),
      1,
      { createNewSite: true },
    );
    expect(state.clientWebsites[0].customCss).toBe('.a{}');
    expect(state.clientWebsites[0].customJs).toBe('console.log(1)');
  });

  it('applies settings defaults — active=true, customLayout=false', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(minimalPayload(), 1, { createNewSite: true });
    expect(state.clientWebsites[0].active).toBe(true);
    expect(state.clientWebsites[0].customLayout).toBe(false);
  });

  it('respects explicit settings.active=false and customLayout=true', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        site: { name: 'X', settings: { active: false, customLayout: true } },
      }),
      1,
      { createNewSite: true },
    );
    expect(state.clientWebsites[0].active).toBe(false);
    expect(state.clientWebsites[0].customLayout).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// siteId branch
// ---------------------------------------------------------------------------

describe('importSnapshot - existing siteId', () => {
  it('throws when the target site does not exist', async () => {
    const { importSnapshot } = await importModule();
    await expect(
      importSnapshot(minimalPayload(), 1, { siteId: 999 }),
    ).rejects.toThrow(/does not belong/i);
  });

  it('throws when target site belongs to another client', async () => {
    state.clientWebsites.push({ id: 5, clientId: 99, name: 'Foreign' });
    const { importSnapshot } = await importModule();
    await expect(
      importSnapshot(minimalPayload(), 1, { siteId: 5 }),
    ).rejects.toThrow(/does not belong/i);
  });

  it('reuses target site and updates customCode when payload supplies it', async () => {
    state.clientWebsites.push({
      id: 5,
      clientId: 1,
      name: 'Mine',
      customCss: null,
      customJs: null,
    });
    const { importSnapshot } = await importModule();
    const res = await importSnapshot(
      minimalPayload({
        site: {
          name: 'X',
          settings: {},
          customCode: { customCss: '.b{}', customJs: 'foo()' },
        },
      }),
      1,
      { siteId: 5 },
    );
    expect(res.siteId).toBe(5);
    const row = state.clientWebsites.find((r) => r.id === 5)!;
    expect(row.customCss).toBe('.b{}');
    expect(row.customJs).toBe('foo()');
  });

  it('skips customCode update when payload omits it', async () => {
    state.clientWebsites.push({
      id: 5,
      clientId: 1,
      name: 'Mine',
      customCss: 'original',
      customJs: 'orig()',
    });
    const { importSnapshot } = await importModule();
    await importSnapshot(minimalPayload(), 1, { siteId: 5 });
    const row = state.clientWebsites.find((r) => r.id === 5)!;
    expect(row.customCss).toBe('original');
    expect(row.customJs).toBe('orig()');
  });
});

// ---------------------------------------------------------------------------
// Post types
// ---------------------------------------------------------------------------

describe('importSnapshot - post types', () => {
  it('creates new post types and their custom fields', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        postTypes: [
          {
            slug: 'recipe',
            name: 'Recipe',
            description: 'A recipe',
            icon: 'restaurant',
            fields: [
              {
                slug: 'servings',
                name: 'Servings',
                fieldType: 'number',
                required: true,
                order: 1,
              },
              {
                slug: 'cuisine',
                name: 'Cuisine',
                fieldType: 'select',
                options: ['italian', 'thai'],
                defaultValue: 'italian',
                helpText: 'Pick one',
              },
            ],
          },
        ],
      }),
      1,
      { createNewSite: true },
    );
    expect(state.postTypes).toHaveLength(1);
    expect(state.postTypes[0].slug).toBe('recipe');
    expect(state.postTypes[0].icon).toBe('restaurant');
    expect(state.customFields).toHaveLength(2);
    const servings = state.customFields.find((f) => f.slug === 'servings');
    expect(servings?.required).toBe(true);
    expect(servings?.order).toBe(1);
  });

  it('skips post types that already exist with the same slug on the target site', async () => {
    state.clientWebsites.push({ id: 5, clientId: 1, name: 'Existing' });
    state.postTypes.push({ id: 100, slug: 'page', websiteId: 5, name: 'Page' });
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        postTypes: [
          {
            slug: 'page',
            name: 'Page (incoming)',
            fields: [{ slug: 'hero', name: 'Hero', fieldType: 'text' }],
          },
        ],
      }),
      1,
      { siteId: 5 },
    );
    // Only the pre-existing row; no new insert, no fields.
    expect(state.postTypes).toHaveLength(1);
    expect(state.customFields).toHaveLength(0);
  });

  it('applies default icon=article and active=true when omitted', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        postTypes: [{ slug: 'blog', name: 'Blog', fields: [] }],
      }),
      1,
      { createNewSite: true },
    );
    expect(state.postTypes[0].icon).toBe('article');
    expect(state.postTypes[0].active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

describe('importSnapshot - posts', () => {
  it('inserts posts and reports postsCreated count', async () => {
    const { importSnapshot } = await importModule();
    const res = await importSnapshot(
      minimalPayload({
        posts: [
          {
            slug: 'home',
            type: 'page',
            title: 'Home',
            status: 'published',
            content: { blocks: [], version: '1.0' },
          },
          {
            slug: 'about',
            type: 'page',
            title: 'About',
            status: 'draft',
            content: '<p>About</p>',
          },
        ],
      }),
      1,
      { createNewSite: true },
    );
    expect(res.postsCreated).toBe(2);
    expect(state.posts).toHaveLength(2);
    const home = state.posts.find((p) => p.slug === 'home')!;
    expect(home.published).toBe(true);
    expect(home.publishedAt).toBeInstanceOf(Date);
    expect(typeof home.content).toBe('string');
    expect(JSON.parse(home.content as string)).toEqual({ blocks: [], version: '1.0' });
    const about = state.posts.find((p) => p.slug === 'about')!;
    expect(about.published).toBe(false);
    expect(about.publishedAt).toBeNull();
    expect(about.content).toBe('<p>About</p>');
  });

  it('uniquifies slug collisions and records them in conflicts[]', async () => {
    state.clientWebsites.push({ id: 5, clientId: 1, name: 'Mine' });
    state.posts.push({ id: 1, slug: 'home', websiteId: 5 });
    const { importSnapshot } = await importModule();
    const res = await importSnapshot(
      minimalPayload({
        posts: [
          {
            slug: 'home',
            type: 'page',
            title: 'Home',
            status: 'draft',
            content: '',
          },
        ],
      }),
      1,
      { siteId: 5 },
    );
    expect(res.conflicts).toEqual(['post slug "home" → "home-imported-1"']);
    const inserted = state.posts.find((p) => p.slug === 'home-imported-1');
    expect(inserted).toBeDefined();
  });

  it('uniquifies multiple consecutive collisions within a single payload', async () => {
    state.clientWebsites.push({ id: 5, clientId: 1, name: 'Mine' });
    state.posts.push({ id: 1, slug: 'home', websiteId: 5 });
    const { importSnapshot } = await importModule();
    const res = await importSnapshot(
      minimalPayload({
        posts: [
          { slug: 'home', type: 'page', title: 'H1', status: 'draft', content: '' },
          { slug: 'home', type: 'page', title: 'H2', status: 'draft', content: '' },
        ],
      }),
      1,
      { siteId: 5 },
    );
    expect(res.conflicts).toHaveLength(2);
    expect(res.conflicts[0]).toMatch(/home-imported-1/);
    expect(res.conflicts[1]).toMatch(/home-imported-2/);
  });

  it('propagates SEO + meta fields to the inserted post row', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        posts: [
          {
            slug: 'p',
            type: 'page',
            title: 'P',
            status: 'published',
            content: '',
            meta: {
              excerpt: 'short',
              coverImage: '/c.png',
              seoTitle: 'SEO',
              seoDescription: 'SEO desc',
              ogImage: '/og.png',
              noIndex: true,
              canonicalUrl: 'https://x.test/p',
              customCss: '.q{}',
              customJs: 'q()',
            },
          },
        ],
      }),
      1,
      { createNewSite: true },
    );
    const row = state.posts[0];
    expect(row.excerpt).toBe('short');
    expect(row.coverImage).toBe('/c.png');
    expect(row.seoTitle).toBe('SEO');
    expect(row.seoDescription).toBe('SEO desc');
    expect(row.ogImage).toBe('/og.png');
    expect(row.noIndex).toBe(true);
    expect(row.canonicalUrl).toBe('https://x.test/p');
    expect(row.customCss).toBe('.q{}');
    expect(row.customJs).toBe('q()');
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('importSnapshot - navigation', () => {
  it('inserts top-level nav entries against the new site', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        navigation: [
          {
            key: 'main',
            items: [
              { label: 'Home', href: '/' },
              { label: 'About', href: '/about', sortOrder: 1, isButton: true },
            ],
          },
        ],
      }),
      1,
      { createNewSite: true },
    );
    expect(state.siteNavigation).toHaveLength(2);
    const home = state.siteNavigation.find((n) => n.label === 'Home')!;
    expect(home.parentId).toBeNull();
    expect(home.sortOrder).toBe(0); // falls back to index when sortOrder omitted
    expect(home.isButton).toBe(false);
    const about = state.siteNavigation.find((n) => n.label === 'About')!;
    expect(about.sortOrder).toBe(1);
    expect(about.isButton).toBe(true);
  });

  it('recursively inserts nested children with parentId set', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        navigation: [
          {
            key: 'main',
            items: [
              {
                label: 'Parent',
                href: '/p',
                children: [
                  { label: 'Child A', href: '/p/a' },
                  { label: 'Child B', href: '/p/b' },
                ],
              },
            ],
          },
        ],
      }),
      1,
      { createNewSite: true },
    );
    expect(state.siteNavigation).toHaveLength(3);
    const parent = state.siteNavigation.find((n) => n.label === 'Parent')!;
    const children = state.siteNavigation.filter(
      (n) => n.parentId === parent.id,
    );
    expect(children).toHaveLength(2);
  });

  it('wipes existing nav for in-place import before inserting new entries', async () => {
    state.clientWebsites.push({ id: 5, clientId: 1, name: 'Mine' });
    state.siteNavigation.push(
      { id: 1, websiteId: 5, label: 'Old', href: '/old', parentId: null },
      { id: 2, websiteId: 99, label: 'OtherSite', href: '/x', parentId: null },
    );
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        navigation: [
          { key: 'main', items: [{ label: 'New', href: '/new' }] },
        ],
      }),
      1,
      { siteId: 5 },
    );
    // The OtherSite row is preserved; "Old" is gone; "New" is inserted.
    const forSite5 = state.siteNavigation.filter((n) => n.websiteId === 5);
    expect(forSite5).toHaveLength(1);
    expect(forSite5[0].label).toBe('New');
    expect(state.siteNavigation.some((n) => n.label === 'OtherSite')).toBe(true);
  });

  it('falls back to the first menu when no key="main" exists', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        navigation: [
          { key: 'footer', items: [{ label: 'Foo', href: '/foo' }] },
        ],
      }),
      1,
      { createNewSite: true },
    );
    expect(state.siteNavigation).toHaveLength(1);
    expect(state.siteNavigation[0].label).toBe('Foo');
  });

  it('does nothing when the main menu is empty', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        navigation: [{ key: 'main', items: [] }],
      }),
      1,
      { createNewSite: true },
    );
    expect(state.siteNavigation).toHaveLength(0);
  });

  it('applies nav entry defaults (openInNewTab=false, icon/description=null)', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        navigation: [
          { key: 'main', items: [{ label: 'L', href: '/l' }] },
        ],
      }),
      1,
      { createNewSite: true },
    );
    const row = state.siteNavigation[0];
    expect(row.openInNewTab).toBe(false);
    expect(row.description).toBeNull();
    expect(row.icon).toBeNull();
    expect(row.featuredImage).toBeNull();
    expect(row.columnGroup).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Block templates
// ---------------------------------------------------------------------------

describe('importSnapshot - block templates', () => {
  it('inserts new block templates with sane defaults', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        blockTemplates: [
          { slug: 'hero-a', name: 'Hero A', content: { blocks: [] } },
        ],
      }),
      1,
      { createNewSite: true },
    );
    expect(state.blockTemplates).toHaveLength(1);
    const row = state.blockTemplates[0];
    expect(row.slug).toBe('hero-a');
    expect(row.category).toBe('custom');
    expect(row.scope).toBe('block');
    expect(row.tags).toEqual([]);
  });

  it('silently skips block templates whose slug already exists globally', async () => {
    state.blockTemplates.push({
      id: 1,
      slug: 'hero-a',
      name: 'Existing Hero',
      blocks: { blocks: ['old'] },
    });
    const { importSnapshot } = await importModule();
    const res = await importSnapshot(
      minimalPayload({
        blockTemplates: [
          { slug: 'hero-a', name: 'New Hero', content: { blocks: ['new'] } },
          { slug: 'fresh', name: 'Fresh', content: {} },
        ],
      }),
      1,
      { createNewSite: true },
    );
    // The pre-existing one was not overwritten, and "fresh" was added.
    expect(state.blockTemplates).toHaveLength(2);
    const heroA = state.blockTemplates.find((t) => t.slug === 'hero-a');
    expect(heroA?.name).toBe('Existing Hero');
    expect(state.blockTemplates.some((t) => t.slug === 'fresh')).toBe(true);
    // No conflict is reported for templates (silent skip).
    expect(res.conflicts).toEqual([]);
  });

  it('honors explicit category/scope/tags', async () => {
    const { importSnapshot } = await importModule();
    await importSnapshot(
      minimalPayload({
        blockTemplates: [
          {
            slug: 't',
            name: 'T',
            content: {},
            category: 'marketing',
            scope: 'section',
            tags: ['hero', 'landing'],
          },
        ],
      }),
      1,
      { createNewSite: true },
    );
    const row = state.blockTemplates[0];
    expect(row.category).toBe('marketing');
    expect(row.scope).toBe('section');
    expect(row.tags).toEqual(['hero', 'landing']);
  });
});

// ---------------------------------------------------------------------------
// End-to-end shape
// ---------------------------------------------------------------------------

describe('importSnapshot - result shape', () => {
  it('returns siteId/postsCreated/conflicts on a happy-path full import', async () => {
    const { importSnapshot } = await importModule();
    const res = await importSnapshot(
      minimalPayload({
        posts: [
          { slug: 'home', type: 'page', title: 'H', status: 'draft', content: '' },
        ],
        navigation: [
          { key: 'main', items: [{ label: 'L', href: '/' }] },
        ],
        blockTemplates: [{ slug: 's', name: 'S', content: {} }],
        postTypes: [{ slug: 'page', name: 'Page', fields: [] }],
      }),
      1,
      { createNewSite: true },
    );
    expect(res.siteId).toBeGreaterThan(0);
    expect(res.postsCreated).toBe(1);
    expect(res.conflicts).toEqual([]);
  });
});
