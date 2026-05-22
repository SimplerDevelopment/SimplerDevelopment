// @vitest-environment node
/**
 * Unit tests for the small data-accessor helpers:
 *   - lib/data/navigation.ts  (getNavigation)
 *   - lib/data/site-config.ts (getSiteConfig)
 *
 * Both modules are thin Drizzle wrappers. We follow the chainable-builder
 * mocking pattern used in `actions-blog.test.ts` — `@/lib/db`, `@/lib/db/schema`,
 * and `drizzle-orm` are mocked with an in-memory store seeded per test.
 *
 * `getSiteConfig` additionally pulls in `@/lib/branding` and `@/lib/data/navigation`,
 * so those modules are mocked at the module boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  siteNavigation: Array<Record<string, unknown>>;
  clientWebsites: Array<Record<string, unknown>>;
  storeSettings: Array<Record<string, unknown>>;
  /** When set, the next `db.select(...)` call throws this error. */
  throwOnNextSelect: Error | null;
}

const state: MockState = {
  siteNavigation: [],
  clientWebsites: [],
  storeSettings: [],
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
  return {
    siteNavigation: wrap('siteNavigation'),
    clientWebsites: wrap('clientWebsites'),
    storeSettings: wrap('storeSettings'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
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

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    if (state.throwOnNextSelect) {
      const err = state.throwOnNextSelect;
      state.throwOnNextSelect = null;
      return {
        from() {
          throw err;
        },
      };
    }

    let activeTable: string | null = null;
    let filter: unknown = null;
    let orderRef: unknown = null;
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
      orderBy(arg: unknown) {
        orderRef = arg;
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
      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      // Honor asc(col) ordering when present.
      const ord = orderRef as { op?: string; a?: unknown } | null;
      if (ord && ord.op === 'asc') {
        const c = getCol(ord.a);
        if (c) {
          rows = [...rows].sort((a, b) => {
            const av = a[c.col] as number;
            const bv = b[c.col] as number;
            if (av === bv) return 0;
            return av < bv ? -1 : 1;
          });
        }
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
    },
  };
});

// Mocks for getSiteConfig dependencies. These remain inert for navigation tests.
const brandingMock = vi.fn(async (_id: number) => ({ primary: '#000' }));
const cssVarsMock = vi.fn((branding: unknown) => ({ '--primary': (branding as { primary: string }).primary }));
vi.mock('@/lib/branding', () => ({
  getBrandingByWebsiteId: (id: number) => brandingMock(id),
  brandingToCssVars: (b: unknown) => cssVarsMock(b),
}));

const getNavigationMock = vi.fn(async (_id: number) => [] as Array<Record<string, unknown>>);
vi.mock('@/lib/data/navigation', async (importOriginal) => {
  // Import the real module so its own internal mocked deps are still exercised
  // when `getNavigation` is called directly. For getSiteConfig we override the
  // export via the mock so tests can control what navigation it sees.
  const original = await importOriginal<typeof import('@/lib/data/navigation')>();
  return {
    ...original,
    getNavigation: (id: number) => getNavigationMock(id),
  };
});

beforeEach(() => {
  state.siteNavigation.length = 0;
  state.clientWebsites.length = 0;
  state.storeSettings.length = 0;
  state.throwOnNextSelect = null;
  brandingMock.mockReset();
  brandingMock.mockResolvedValue({ primary: '#000' } as unknown as never);
  cssVarsMock.mockReset();
  cssVarsMock.mockImplementation((b: unknown) => ({ '--primary': (b as { primary: string }).primary }));
  getNavigationMock.mockReset();
  getNavigationMock.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// getNavigation — exercise the REAL implementation via dynamic import. We must
// reach past the module-level mock above; vi.importActual gives us the genuine
// module so the function under test runs against our mocked db/schema.
// ---------------------------------------------------------------------------

async function importRealNavigation() {
  const mod = await vi.importActual<typeof import('@/lib/data/navigation')>(
    '@/lib/data/navigation',
  );
  return mod;
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
    columnGroup: null,
    ...overrides,
  };
  state.siteNavigation.push(row);
  return row;
}

describe('getNavigation', () => {
  it('returns [] when no rows match the site', async () => {
    seedNav({ id: 1, websiteId: 999 });
    const { getNavigation } = await importRealNavigation();
    const result = await getNavigation(1);
    expect(result).toEqual([]);
  });

  it('returns flat top-level nav items as roots', async () => {
    seedNav({ id: 1, websiteId: 5, label: 'Home', href: '/', sortOrder: 0 });
    seedNav({ id: 2, websiteId: 5, label: 'About', href: '/about', sortOrder: 1 });
    const { getNavigation } = await importRealNavigation();
    const result = await getNavigation(5);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Home');
    expect(result[0].children).toEqual([]);
    expect(result[1].label).toBe('About');
  });

  it('orders roots by sortOrder ascending', async () => {
    seedNav({ id: 1, websiteId: 5, label: 'B', sortOrder: 5 });
    seedNav({ id: 2, websiteId: 5, label: 'A', sortOrder: 1 });
    seedNav({ id: 3, websiteId: 5, label: 'C', sortOrder: 10 });
    const { getNavigation } = await importRealNavigation();
    const result = await getNavigation(5);
    expect(result.map((r) => r.label)).toEqual(['A', 'B', 'C']);
  });

  it('nests children under their parent when parentId resolves', async () => {
    seedNav({ id: 1, websiteId: 7, label: 'Parent', parentId: null, sortOrder: 0 });
    seedNav({ id: 2, websiteId: 7, label: 'Child 1', parentId: 1, sortOrder: 1 });
    seedNav({ id: 3, websiteId: 7, label: 'Child 2', parentId: 1, sortOrder: 2 });
    const { getNavigation } = await importRealNavigation();
    const result = await getNavigation(7);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Parent');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children.map((c) => c.label)).toEqual(['Child 1', 'Child 2']);
  });

  it('treats orphan children (unknown parentId) as roots', async () => {
    seedNav({ id: 10, websiteId: 9, label: 'Orphan', parentId: 999, sortOrder: 0 });
    const { getNavigation } = await importRealNavigation();
    const result = await getNavigation(9);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Orphan');
    expect(result[0].children).toEqual([]);
  });

  it('exposes the full projection (label/href/icon/etc.)', async () => {
    seedNav({
      id: 1,
      websiteId: 3,
      label: 'Docs',
      href: '/docs',
      openInNewTab: true,
      isButton: true,
      description: 'Documentation',
      icon: 'book',
      featuredImage: '/img.png',
      columnGroup: 2,
    });
    const { getNavigation } = await importRealNavigation();
    const [item] = await getNavigation(3);
    expect(item).toMatchObject({
      label: 'Docs',
      href: '/docs',
      openInNewTab: true,
      isButton: true,
      description: 'Documentation',
      icon: 'book',
      featuredImage: '/img.png',
      columnGroup: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// getSiteConfig
// ---------------------------------------------------------------------------

function seedSite(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    name: 'Site One',
    domain: 'one.example.com',
    subdomain: 'one',
    description: 'desc',
    customLayout: null,
    active: true,
    ...overrides,
  };
  state.clientWebsites.push(row);
  return row;
}

describe('getSiteConfig', () => {
  it('returns null when no active site matches the id', async () => {
    const { getSiteConfig } = await import('@/lib/data/site-config');
    const res = await getSiteConfig(42);
    expect(res).toBeNull();
  });

  it('returns null when matching site is inactive', async () => {
    seedSite({ id: 1, active: false });
    const { getSiteConfig } = await import('@/lib/data/site-config');
    const res = await getSiteConfig(1);
    expect(res).toBeNull();
  });

  it('composes site + branding + cssVars + navigation + storeEnabled=false by default', async () => {
    seedSite({ id: 1, name: 'Alpha', domain: 'a.example.com', subdomain: 'a' });
    brandingMock.mockResolvedValueOnce({ primary: '#abc' } as unknown as never);
    cssVarsMock.mockReturnValueOnce({ '--primary': '#abc' });
    getNavigationMock.mockResolvedValueOnce([
      { id: 1, label: 'Home', href: '/', children: [] } as unknown as never,
    ]);

    const { getSiteConfig } = await import('@/lib/data/site-config');
    const res = await getSiteConfig(1);
    expect(res).not.toBeNull();
    expect(res!.id).toBe(1);
    expect(res!.name).toBe('Alpha');
    expect(res!.branding).toEqual({ primary: '#abc' });
    expect(res!.cssVars).toEqual({ '--primary': '#abc' });
    expect(res!.navigation).toHaveLength(1);
    expect(res!.storeEnabled).toBe(false);

    expect(brandingMock).toHaveBeenCalledWith(1);
    expect(getNavigationMock).toHaveBeenCalledWith(1);
  });

  it('reports storeEnabled=true when an enabled store settings row exists', async () => {
    seedSite({ id: 2 });
    state.storeSettings.push({ websiteId: 2, enabled: true });
    const { getSiteConfig } = await import('@/lib/data/site-config');
    const res = await getSiteConfig(2);
    expect(res).not.toBeNull();
    expect(res!.storeEnabled).toBe(true);
  });

  it('reports storeEnabled=false when the store settings row exists but is disabled', async () => {
    seedSite({ id: 3 });
    state.storeSettings.push({ websiteId: 3, enabled: false });
    const { getSiteConfig } = await import('@/lib/data/site-config');
    const res = await getSiteConfig(3);
    expect(res).not.toBeNull();
    expect(res!.storeEnabled).toBe(false);
  });

  it('isolates store settings by websiteId (does not leak from other sites)', async () => {
    seedSite({ id: 4 });
    state.storeSettings.push({ websiteId: 999, enabled: true });
    const { getSiteConfig } = await import('@/lib/data/site-config');
    const res = await getSiteConfig(4);
    expect(res).not.toBeNull();
    expect(res!.storeEnabled).toBe(false);
  });
});
