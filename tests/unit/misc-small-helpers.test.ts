// @vitest-environment node
/**
 * Unit tests for four small helper modules:
 *   - lib/api-keys.ts
 *   - lib/actions/pages.ts
 *   - lib/active-client.ts
 *   - lib/client-website-middleware.ts (docs-only smoke)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared DB mock state for api-keys + actions/pages (drizzle wrappers).
// ---------------------------------------------------------------------------

interface DbState {
  apiKeys: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
  /** Captured update payload for assertion. */
  lastUpdateSet: Record<string, unknown> | null;
  /** When set, the next `db.select(...)` chain throws this error from .from(). */
  throwOnNextSelect: Error | null;
  /** When set, the next `db.update(...)` chain rejects with this error from .where(). */
  rejectOnNextUpdate: Error | null;
}

const dbState: DbState = {
  apiKeys: [],
  posts: [],
  lastUpdateSet: null,
  throwOnNextSelect: null,
  rejectOnNextUpdate: null,
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
    apiKeys: wrap('apiKeys'),
    posts: wrap('posts'),
    // Other tables in case anything transitive looks them up.
    categories: wrap('categories'),
    tags: wrap('tags'),
    postCategories: wrap('postCategories'),
    postTags: wrap('postTags'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
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
    case 'isNull': {
      const left = readField(row, f.a);
      return left === null || left === undefined;
    }
    default:
      return true;
  }
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (dbState as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    if (dbState.throwOnNextSelect) {
      const err = dbState.throwOnNextSelect;
      dbState.throwOnNextSelect = null;
      return {
        from() {
          throw err;
        },
      };
    }

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
      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      rows = rows.map((r) => ({ ...r }));
      if (limit !== null) rows = rows.slice(0, limit);
      return Promise.resolve(rows);
    }

    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    let setPayload: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      set(payload: Record<string, unknown>) {
        setPayload = payload;
        dbState.lastUpdateSet = payload;
        return chain;
      },
      where(_filter: unknown) {
        // Apply to in-memory store (best effort) and resolve.
        const rows = tableArray(table.__table);
        for (const r of rows) Object.assign(r, setPayload);
        if (dbState.rejectOnNextUpdate) {
          const err = dbState.rejectOnNextUpdate;
          dbState.rejectOnNextUpdate = null;
          return Promise.reject(err);
        }
        return Promise.resolve();
      },
    };
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// next/headers mock for active-client.ts.
const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const v = cookieStore.get(name);
      return v === undefined ? undefined : { value: v };
    },
  }),
}));

beforeEach(() => {
  dbState.apiKeys.length = 0;
  dbState.posts.length = 0;
  dbState.lastUpdateSet = null;
  dbState.throwOnNextSelect = null;
  dbState.rejectOnNextUpdate = null;
  cookieStore.clear();
});

// ===========================================================================
// lib/api-keys.ts
// ===========================================================================

describe('api-keys :: generateApiKey', () => {
  it('returns a key prefixed with sd_live_ and 64 hex chars', async () => {
    const { generateApiKey } = await import('@/lib/api-keys');
    const key = generateApiKey();
    expect(key.startsWith('sd_live_')).toBe(true);
    expect(key.slice('sd_live_'.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different value on each call', async () => {
    const { generateApiKey } = await import('@/lib/api-keys');
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});

describe('api-keys :: validateApiKey', () => {
  it('returns null when no record matches', async () => {
    const { validateApiKey } = await import('@/lib/api-keys');
    const res = await validateApiKey('sd_live_missing', 1);
    expect(res).toBeNull();
  });

  it('returns the record when key + siteId + active match and not expired', async () => {
    dbState.apiKeys.push({
      id: 11,
      key: 'sd_live_abc',
      websiteId: 5,
      active: true,
      expiresAt: null,
      lastUsedAt: null,
    });
    const { validateApiKey } = await import('@/lib/api-keys');
    const res = await validateApiKey('sd_live_abc', 5);
    expect(res).not.toBeNull();
    expect(res!.id).toBe(11);
    // wait a microtask so the fire-and-forget update can land
    await Promise.resolve();
    await Promise.resolve();
    expect(dbState.lastUpdateSet).not.toBeNull();
    expect(dbState.lastUpdateSet!.lastUsedAt).toBeInstanceOf(Date);
  });

  it('returns null when expiry is in the past', async () => {
    dbState.apiKeys.push({
      id: 22,
      key: 'sd_live_old',
      websiteId: 5,
      active: true,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const { validateApiKey } = await import('@/lib/api-keys');
    const res = await validateApiKey('sd_live_old', 5);
    expect(res).toBeNull();
  });

  it('returns the record when expiry is in the future', async () => {
    dbState.apiKeys.push({
      id: 33,
      key: 'sd_live_future',
      websiteId: 5,
      active: true,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { validateApiKey } = await import('@/lib/api-keys');
    const res = await validateApiKey('sd_live_future', 5);
    expect(res).not.toBeNull();
    expect(res!.id).toBe(33);
  });

  it('swallows fire-and-forget update rejection without throwing', async () => {
    dbState.apiKeys.push({
      id: 44,
      key: 'sd_live_swallow',
      websiteId: 5,
      active: true,
      expiresAt: null,
    });
    dbState.rejectOnNextUpdate = new Error('update boom');
    const { validateApiKey } = await import('@/lib/api-keys');
    const res = await validateApiKey('sd_live_swallow', 5);
    expect(res).not.toBeNull();
    // Allow the promise chain to settle so the `.catch(() => {})` runs.
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('api-keys :: checkRateLimit / resetRateLimit', () => {
  beforeEach(async () => {
    const { resetRateLimit } = await import('@/lib/api-keys');
    resetRateLimit();
  });

  it('allows the first request and reports remaining = limit - 1', async () => {
    const { checkRateLimit } = await import('@/lib/api-keys');
    const r = checkRateLimit(101, 5);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.resetAt).toBeInstanceOf(Date);
  });

  it('decrements remaining on subsequent calls within the window', async () => {
    const { checkRateLimit } = await import('@/lib/api-keys');
    checkRateLimit(102, 3);
    const r2 = checkRateLimit(102, 3);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
    const r3 = checkRateLimit(102, 3);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('marks allowed=false once limit is exceeded', async () => {
    const { checkRateLimit } = await import('@/lib/api-keys');
    checkRateLimit(103, 2);
    checkRateLimit(103, 2);
    const r3 = checkRateLimit(103, 2);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('opens a new window once resetAt has passed', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
      const { checkRateLimit } = await import('@/lib/api-keys');
      checkRateLimit(104, 1);
      checkRateLimit(104, 1); // exceeds
      // advance past 60s window
      vi.setSystemTime(new Date('2026-05-01T00:02:00Z'));
      const r = checkRateLimit(104, 1);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resetRateLimit(keyId) clears just that key', async () => {
    const { checkRateLimit, resetRateLimit } = await import('@/lib/api-keys');
    checkRateLimit(201, 1);
    checkRateLimit(201, 1); // exhausted
    resetRateLimit(201);
    const r = checkRateLimit(201, 1);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it('resetRateLimit() with no arg clears every key', async () => {
    const { checkRateLimit, resetRateLimit } = await import('@/lib/api-keys');
    checkRateLimit(301, 1);
    checkRateLimit(301, 1); // exhausted
    checkRateLimit(302, 1);
    checkRateLimit(302, 1); // exhausted
    resetRateLimit();
    expect(checkRateLimit(301, 1).allowed).toBe(true);
    expect(checkRateLimit(302, 1).allowed).toBe(true);
  });
});

// ===========================================================================
// lib/actions/pages.ts
// ===========================================================================

describe('actions/pages :: getPageBySlug', () => {
  it('returns null when no page exists', async () => {
    const mod = await import('@/lib/actions/pages');
    const res = await mod.getPageBySlug('missing');
    expect(res).toBeNull();
  });

  it('returns the published global page when one matches', async () => {
    dbState.posts.push({
      id: 1,
      slug: 'about',
      published: true,
      postType: 'page',
      websiteId: null,
      title: 'About',
    });
    const mod = await import('@/lib/actions/pages');
    const res = await mod.getPageBySlug('about');
    expect(res).not.toBeNull();
    expect(res!.slug).toBe('about');
  });

  it('returns null when the matching page is unpublished', async () => {
    dbState.posts.push({
      id: 2,
      slug: 'draft',
      published: false,
      postType: 'page',
      websiteId: null,
    });
    const mod = await import('@/lib/actions/pages');
    expect(await mod.getPageBySlug('draft')).toBeNull();
  });

  it('returns null when the matching row is a blog post not a page', async () => {
    dbState.posts.push({
      id: 3,
      slug: 'hello',
      published: true,
      postType: 'blog',
      websiteId: null,
    });
    const mod = await import('@/lib/actions/pages');
    expect(await mod.getPageBySlug('hello')).toBeNull();
  });

  it('returns null when the matching page belongs to a tenant (websiteId set)', async () => {
    dbState.posts.push({
      id: 4,
      slug: 'tenant-page',
      published: true,
      postType: 'page',
      websiteId: 9,
    });
    const mod = await import('@/lib/actions/pages');
    expect(await mod.getPageBySlug('tenant-page')).toBeNull();
  });

  it('swallows DB errors and returns null', async () => {
    dbState.throwOnNextSelect = new Error('db down');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await import('@/lib/actions/pages');
    expect(await mod.getPageBySlug('about')).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('actions/pages :: getAllPages', () => {
  it('returns [] when no pages exist', async () => {
    const mod = await import('@/lib/actions/pages');
    expect(await mod.getAllPages()).toEqual([]);
  });

  it('returns only published global pages', async () => {
    dbState.posts.push(
      { id: 1, slug: 'a', published: true, postType: 'page', websiteId: null },
      { id: 2, slug: 'b', published: false, postType: 'page', websiteId: null }, // unpublished
      { id: 3, slug: 'c', published: true, postType: 'blog', websiteId: null }, // not page
      { id: 4, slug: 'd', published: true, postType: 'page', websiteId: 9 }, // tenant
      { id: 5, slug: 'e', published: true, postType: 'page', websiteId: null },
    );
    const mod = await import('@/lib/actions/pages');
    const rows = await mod.getAllPages();
    expect(rows.map((r) => r.slug).sort()).toEqual(['a', 'e']);
  });

  it('swallows DB errors and returns []', async () => {
    dbState.throwOnNextSelect = new Error('db down');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await import('@/lib/actions/pages');
    expect(await mod.getAllPages()).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ===========================================================================
// lib/active-client.ts
// ===========================================================================

describe('active-client :: getActiveClientId', () => {
  it('returns null when cookie is absent', async () => {
    const { getActiveClientId } = await import('@/lib/active-client');
    expect(await getActiveClientId()).toBeNull();
  });

  it('returns the parsed numeric id when cookie is set', async () => {
    cookieStore.set('sd-active-client', '42');
    const { getActiveClientId } = await import('@/lib/active-client');
    expect(await getActiveClientId()).toBe(42);
  });

  it('returns NaN-safe parseInt result for non-numeric cookie value', async () => {
    cookieStore.set('sd-active-client', 'abc');
    const { getActiveClientId } = await import('@/lib/active-client');
    const res = await getActiveClientId();
    expect(Number.isNaN(res)).toBe(true);
  });
});

describe('active-client :: parseActiveClientId', () => {
  it('returns null for a null header', async () => {
    const { parseActiveClientId } = await import('@/lib/active-client');
    expect(parseActiveClientId(null)).toBeNull();
  });

  it('returns null when the cookie is absent from the header', async () => {
    const { parseActiveClientId } = await import('@/lib/active-client');
    expect(parseActiveClientId('foo=bar; baz=qux')).toBeNull();
  });

  it('parses the numeric id when present at the head of the header', async () => {
    const { parseActiveClientId } = await import('@/lib/active-client');
    expect(parseActiveClientId('sd-active-client=7; other=1')).toBe(7);
  });

  it('parses the numeric id when present mid-header', async () => {
    const { parseActiveClientId } = await import('@/lib/active-client');
    expect(parseActiveClientId('foo=bar; sd-active-client=123; baz=qux')).toBe(123);
  });

  it('returns null when value is non-numeric', async () => {
    const { parseActiveClientId } = await import('@/lib/active-client');
    expect(parseActiveClientId('sd-active-client=abc')).toBeNull();
  });

  it('exposes COOKIE_NAME constant', async () => {
    const mod = await import('@/lib/active-client');
    expect(mod.COOKIE_NAME).toBe('sd-active-client');
  });
});

// ===========================================================================
// lib/client-website-middleware.ts (documentation-only module)
// ===========================================================================

describe('client-website-middleware (docs module)', () => {
  it('imports cleanly and exposes no runtime API', async () => {
    const mod = await import('@/lib/client-website-middleware');
    // Module is doc-only — it should be an empty namespace object.
    expect(typeof mod).toBe('object');
    expect(Object.keys(mod)).toEqual([]);
  });
});
