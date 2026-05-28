// @vitest-environment node
/**
 * Unit tests for lib/snapshots/export.ts.
 *
 * exportSite() is DB-coupled — it issues a sequence of select queries
 * against client_websites, posts, site_navigation, post_types, and
 * custom_fields. We mock @/lib/db with a chainable query builder backed by
 * an in-memory state, and route by table identity via @/lib/db/schema
 * markers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  clientWebsites: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  postTypes: Array<Record<string, unknown>>;
  customFields: Array<Record<string, unknown>>;
  siteNavigation: Array<Record<string, unknown>>;
}

const state: MockState = {
  clientWebsites: [],
  posts: [],
  postTypes: [],
  customFields: [],
  siteNavigation: [],
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
  return {
    clientWebsites: wrap('clientWebsites'),
    posts: wrap('posts'),
    postTypes: wrap('postTypes'),
    customFields: wrap('customFields'),
    siteNavigation: wrap('siteNavigation'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  asc: (a: unknown) => ({ op: 'asc', a }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    default:
      return true;
  }
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
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
      let out = rows.map((r) => ({ ...r }));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  return {
    db: {
      select() {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
          },
        };
      },
    },
  };
});

beforeEach(() => {
  state.clientWebsites.length = 0;
  state.posts.length = 0;
  state.postTypes.length = 0;
  state.customFields.length = 0;
  state.siteNavigation.length = 0;
});

async function importModule() {
  return await import('@/lib/snapshots/export');
}

function seedSite(over: Partial<Record<string, unknown>> = {}): void {
  state.clientWebsites.push({
    id: 1,
    name: 'My Site',
    description: 'desc',
    active: true,
    customLayout: false,
    publicAccess: true,
    customCss: '.x{}',
    customJs: 'var a=1;',
    ...over,
  });
}

// ---------------------------------------------------------------------------
// exportSite
// ---------------------------------------------------------------------------

describe('exportSite', () => {
  it('throws when the site does not exist', async () => {
    const { exportSite } = await importModule();
    await expect(exportSite(999)).rejects.toThrow(/site 999 not found/i);
  });

  it('returns the minimal site shell when there are no posts/nav/types', async () => {
    seedSite();
    const { exportSite } = await importModule();
    const payload = await exportSite(1);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.site.name).toBe('My Site');
    expect(payload.site.settings).toEqual({
      description: 'desc',
      active: true,
      customLayout: false,
      publicAccess: true,
    });
    expect(payload.site.customCode).toEqual({
      customCss: '.x{}',
      customJs: 'var a=1;',
    });
    expect(payload.posts).toEqual([]);
    expect(payload.navigation).toEqual([{ key: 'main', items: [] }]);
    expect(payload.postTypes).toEqual([]);
    expect(payload.blockTemplates).toEqual([]);
  });

  it('exports posts with parsed JSON content and full meta', async () => {
    seedSite();
    const blocks = { blocks: [{ type: 'heading', text: 'Hi' }], version: '1.0' };
    state.posts.push({
      id: 1,
      websiteId: 1,
      slug: 'hello',
      postType: 'page',
      title: 'Hello',
      published: true,
      content: JSON.stringify(blocks),
      excerpt: 'ex',
      coverImage: '/cover.jpg',
      seoTitle: 'SEO',
      seoDescription: 'SEO d',
      ogImage: '/og.jpg',
      noIndex: false,
      canonicalUrl: 'https://example.test/hello',
      customCss: '.p{}',
      customJs: 'console.log(1)',
    });
    const { exportSite } = await importModule();
    const payload = await exportSite(1);

    expect(payload.posts).toHaveLength(1);
    const p = payload.posts[0];
    expect(p.slug).toBe('hello');
    expect(p.type).toBe('page');
    expect(p.title).toBe('Hello');
    expect(p.status).toBe('published');
    expect(p.content).toEqual(blocks);
    expect(p.meta).toEqual({
      excerpt: 'ex',
      coverImage: '/cover.jpg',
      seoTitle: 'SEO',
      seoDescription: 'SEO d',
      ogImage: '/og.jpg',
      noIndex: false,
      canonicalUrl: 'https://example.test/hello',
      customCss: '.p{}',
      customJs: 'console.log(1)',
    });
  });

  it('marks unpublished posts as draft and keeps non-JSON content as a raw string', async () => {
    seedSite();
    state.posts.push({
      id: 2,
      websiteId: 1,
      slug: 'raw',
      postType: 'page',
      title: 'Raw',
      published: false,
      content: 'not-json{',
      excerpt: null,
      coverImage: null,
      seoTitle: null,
      seoDescription: null,
      ogImage: null,
      noIndex: false,
      canonicalUrl: null,
      customCss: null,
      customJs: null,
    });
    const { exportSite } = await importModule();
    const payload = await exportSite(1);

    expect(payload.posts).toHaveLength(1);
    expect(payload.posts[0].status).toBe('draft');
    expect(payload.posts[0].content).toBe('not-json{');
  });

  it('only exports posts belonging to the requested site', async () => {
    seedSite();
    state.clientWebsites.push({
      id: 2,
      name: 'Other',
      description: null,
      active: true,
      customLayout: false,
      publicAccess: true,
      customCss: null,
      customJs: null,
    });
    state.posts.push(
      {
        id: 1,
        websiteId: 1,
        slug: 'mine',
        postType: 'page',
        title: 'Mine',
        published: true,
        content: '{}',
        excerpt: null,
        coverImage: null,
        seoTitle: null,
        seoDescription: null,
        ogImage: null,
        noIndex: false,
        canonicalUrl: null,
        customCss: null,
        customJs: null,
      },
      {
        id: 2,
        websiteId: 2,
        slug: 'other',
        postType: 'page',
        title: 'Other',
        published: true,
        content: '{}',
        excerpt: null,
        coverImage: null,
        seoTitle: null,
        seoDescription: null,
        ogImage: null,
        noIndex: false,
        canonicalUrl: null,
        customCss: null,
        customJs: null,
      },
    );
    const { exportSite } = await importModule();
    const payload = await exportSite(1);
    expect(payload.posts).toHaveLength(1);
    expect(payload.posts[0].slug).toBe('mine');
  });

  it('exports navigation as a nested tree under the "main" key', async () => {
    seedSite();
    state.siteNavigation.push(
      {
        id: 10,
        websiteId: 1,
        parentId: null,
        label: 'Home',
        href: '/',
        sortOrder: 0,
        openInNewTab: false,
        isButton: false,
        description: null,
        icon: null,
        featuredImage: null,
        columnGroup: null,
      },
      {
        id: 11,
        websiteId: 1,
        parentId: null,
        label: 'Products',
        href: '/products',
        sortOrder: 1,
        openInNewTab: false,
        isButton: false,
        description: null,
        icon: null,
        featuredImage: null,
        columnGroup: null,
      },
      {
        id: 12,
        websiteId: 1,
        parentId: 11,
        label: 'Widgets',
        href: '/products/widgets',
        sortOrder: 0,
        openInNewTab: false,
        isButton: false,
        description: null,
        icon: null,
        featuredImage: null,
        columnGroup: null,
      },
    );
    const { exportSite } = await importModule();
    const payload = await exportSite(1);

    expect(payload.navigation).toHaveLength(1);
    const main = payload.navigation[0];
    expect(main.key).toBe('main');
    expect(main.items).toHaveLength(2);
    expect(main.items[0].label).toBe('Home');
    expect(main.items[1].label).toBe('Products');
    expect(main.items[1].children).toHaveLength(1);
    expect(main.items[1].children![0].label).toBe('Widgets');
  });

  it('excludes navigation rows belonging to other sites', async () => {
    seedSite();
    state.siteNavigation.push(
      {
        id: 10,
        websiteId: 1,
        parentId: null,
        label: 'Mine',
        href: '/',
        sortOrder: 0,
      },
      {
        id: 11,
        websiteId: 2,
        parentId: null,
        label: 'Theirs',
        href: '/',
        sortOrder: 0,
      },
    );
    const { exportSite } = await importModule();
    const payload = await exportSite(1);
    const items = payload.navigation[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Mine');
  });

  it('exports post types with their custom fields', async () => {
    seedSite();
    state.postTypes.push({
      id: 100,
      websiteId: 1,
      slug: 'recipe',
      name: 'Recipe',
      description: 'Cookable',
      icon: 'chef',
      active: true,
      template: 'tmpl-x',
      customCss: '.r{}',
      customJs: 'r();',
    });
    state.customFields.push(
      {
        id: 1,
        postTypeId: 100,
        slug: 'prep_time',
        name: 'Prep time',
        fieldType: 'number',
        options: null,
        required: true,
        defaultValue: '10',
        helpText: 'minutes',
        order: 1,
      },
      {
        id: 2,
        postTypeId: 100,
        slug: 'difficulty',
        name: 'Difficulty',
        fieldType: 'select',
        options: ['easy', 'medium', 'hard'],
        required: false,
        defaultValue: null,
        helpText: null,
        order: 2,
      },
    );
    const { exportSite } = await importModule();
    const payload = await exportSite(1);

    expect(payload.postTypes).toHaveLength(1);
    const pt = payload.postTypes![0];
    expect(pt.slug).toBe('recipe');
    expect(pt.name).toBe('Recipe');
    expect(pt.description).toBe('Cookable');
    expect(pt.icon).toBe('chef');
    expect(pt.active).toBe(true);
    expect(pt.template).toBe('tmpl-x');
    expect(pt.customCss).toBe('.r{}');
    expect(pt.customJs).toBe('r();');
    expect(pt.fields).toHaveLength(2);
    expect(pt.fields[0]).toEqual({
      slug: 'prep_time',
      name: 'Prep time',
      fieldType: 'number',
      options: null,
      required: true,
      defaultValue: '10',
      helpText: 'minutes',
      order: 1,
    });
    expect(pt.fields[1].options).toEqual(['easy', 'medium', 'hard']);
  });

  it('returns post types with empty fields when no custom fields exist', async () => {
    seedSite();
    state.postTypes.push({
      id: 200,
      websiteId: 1,
      slug: 'event',
      name: 'Event',
      description: null,
      icon: null,
      active: true,
      template: null,
      customCss: null,
      customJs: null,
    });
    const { exportSite } = await importModule();
    const payload = await exportSite(1);
    expect(payload.postTypes).toHaveLength(1);
    expect(payload.postTypes![0].fields).toEqual([]);
  });

  it('only exports post types scoped to the requested site', async () => {
    seedSite();
    state.postTypes.push(
      {
        id: 1,
        websiteId: 1,
        slug: 'mine',
        name: 'Mine',
        description: null,
        icon: null,
        active: true,
        template: null,
        customCss: null,
        customJs: null,
      },
      {
        id: 2,
        websiteId: 2,
        slug: 'theirs',
        name: 'Theirs',
        description: null,
        icon: null,
        active: true,
        template: null,
        customCss: null,
        customJs: null,
      },
    );
    const { exportSite } = await importModule();
    const payload = await exportSite(1);
    expect(payload.postTypes).toHaveLength(1);
    expect(payload.postTypes![0].slug).toBe('mine');
  });

  it('does not leak custom fields from a different post type', async () => {
    seedSite();
    state.postTypes.push({
      id: 100,
      websiteId: 1,
      slug: 'a',
      name: 'A',
      description: null,
      icon: null,
      active: true,
      template: null,
      customCss: null,
      customJs: null,
    });
    state.customFields.push(
      {
        id: 1,
        postTypeId: 100,
        slug: 'mine',
        name: 'Mine',
        fieldType: 'text',
        options: null,
        required: false,
        defaultValue: null,
        helpText: null,
        order: 1,
      },
      {
        id: 2,
        postTypeId: 999,
        slug: 'foreign',
        name: 'Foreign',
        fieldType: 'text',
        options: null,
        required: false,
        defaultValue: null,
        helpText: null,
        order: 1,
      },
    );
    const { exportSite } = await importModule();
    const payload = await exportSite(1);
    expect(payload.postTypes![0].fields).toHaveLength(1);
    expect(payload.postTypes![0].fields[0].slug).toBe('mine');
  });

  it('always emits an empty blockTemplates array for v1', async () => {
    seedSite();
    const { exportSite } = await importModule();
    const payload = await exportSite(1);
    expect(payload.blockTemplates).toEqual([]);
  });
});
