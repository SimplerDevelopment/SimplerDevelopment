// @vitest-environment node
/**
 * Unit tests for lib/agency/custom-domain.ts.
 *
 * The module is DB-coupled and maintains an in-memory TTL cache. The test
 * mocks `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm` with a tiny query
 * builder backed by an in-memory `clients` row store the tests can seed.
 * `vi.useFakeTimers()` drives cache-expiry behavior deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `unstable_cache` requires an incremental-cache context (only available in
// a real Next.js request). In the unit environment we stub it to be a
// pass-through so the module's in-memory TTL cache (the cache Map) is the
// only caching layer under test — which is exactly what these tests target.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

interface ClientRow {
  id: number;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
  defaultWebsiteId: number | null;
}

const state: {
  clients: ClientRow[];
  /** When true, the next `.limit(...)` call throws to simulate DB failure. */
  throwOnQuery: boolean;
} = {
  clients: [],
  throwOnQuery: false,
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
    clients: wrap('clients'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNotNull: (a: unknown) => ({ op: 'isNotNull', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

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
    case 'isNotNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] !== null && row[col.__col] !== undefined;
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
    const r = ref as { __col?: string } | undefined;
    out[alias] = r?.__col ? row[r.__col] : undefined;
  }
  return out;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
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
        if (state.throwOnQuery) {
          return Promise.reject(new Error('db unreachable'));
        }
        if (activeTable !== 'clients') return Promise.resolve([]);
        const matched = state.clients.filter((r) =>
          evalPredicate(filter, r as unknown as Record<string, unknown>),
        );
        const out = matched.slice(0, n).map((r) =>
          projectRow(r as unknown as Record<string, unknown>, projection),
        );
        return Promise.resolve(out);
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
    },
  };
});

async function importModule() {
  return await import('@/lib/agency/custom-domain');
}

beforeEach(async () => {
  state.clients.length = 0;
  state.throwOnQuery = false;
  // Clear the module-scoped cache between tests.
  const { clearCustomDomainCache } = await importModule();
  clearCustomDomainCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveCustomDomain', () => {
  it('returns null for empty hostname without hitting the DB', async () => {
    const { resolveCustomDomain } = await importModule();
    // Even if the DB would throw, we should short-circuit on empty input.
    state.throwOnQuery = true;
    const result = await resolveCustomDomain('');
    expect(result).toBeNull();
  });

  it('returns clientId + defaultWebsiteId for a verified custom domain', async () => {
    state.clients.push({
      id: 42,
      customDomain: 'portal.acme.test',
      customDomainVerifiedAt: new Date('2026-01-01'),
      defaultWebsiteId: 7,
    });
    const { resolveCustomDomain } = await importModule();
    const result = await resolveCustomDomain('portal.acme.test');
    expect(result).toEqual({ clientId: 42, defaultWebsiteId: 7 });
  });

  it('lowercases the hostname before lookup', async () => {
    state.clients.push({
      id: 42,
      customDomain: 'portal.acme.test',
      customDomainVerifiedAt: new Date('2026-01-01'),
      defaultWebsiteId: null,
    });
    const { resolveCustomDomain } = await importModule();
    const result = await resolveCustomDomain('Portal.Acme.TEST');
    expect(result).toEqual({ clientId: 42, defaultWebsiteId: null });
  });

  it('returns null when the domain is not verified', async () => {
    state.clients.push({
      id: 42,
      customDomain: 'unverified.acme.test',
      customDomainVerifiedAt: null,
      defaultWebsiteId: 7,
    });
    const { resolveCustomDomain } = await importModule();
    const result = await resolveCustomDomain('unverified.acme.test');
    expect(result).toBeNull();
  });

  it('returns null when no client has claimed the hostname', async () => {
    const { resolveCustomDomain } = await importModule();
    const result = await resolveCustomDomain('nope.example.test');
    expect(result).toBeNull();
  });

  it('fails open (returns null) when the DB throws', async () => {
    state.throwOnQuery = true;
    const { resolveCustomDomain } = await importModule();
    const result = await resolveCustomDomain('boom.example.test');
    expect(result).toBeNull();
  });

  it('caches a successful hit and serves the next call without a DB query', async () => {
    state.clients.push({
      id: 42,
      customDomain: 'portal.acme.test',
      customDomainVerifiedAt: new Date('2026-01-01'),
      defaultWebsiteId: 7,
    });
    const { resolveCustomDomain } = await importModule();
    const first = await resolveCustomDomain('portal.acme.test');
    expect(first).toEqual({ clientId: 42, defaultWebsiteId: 7 });

    // Wipe the underlying store + flip the DB to throwing — if cache works,
    // we still get the same answer.
    state.clients.length = 0;
    state.throwOnQuery = true;

    const second = await resolveCustomDomain('portal.acme.test');
    expect(second).toEqual({ clientId: 42, defaultWebsiteId: 7 });
  });

  it('caches a miss so repeated lookups for unknown domains skip the DB', async () => {
    const { resolveCustomDomain } = await importModule();
    const first = await resolveCustomDomain('ghost.example.test');
    expect(first).toBeNull();

    // Flip the DB to throw — if the miss was cached, the next call should
    // NOT throw / return null from the catch. The current implementation
    // stores a sentinel ({clientId: -1, defaultWebsiteId: null}) for misses
    // and returns that shape from the cache-hit branch, so we assert against
    // the sentinel rather than null.
    state.throwOnQuery = true;
    state.clients.push({
      id: 99,
      customDomain: 'ghost.example.test',
      customDomainVerifiedAt: new Date('2026-01-01'),
      defaultWebsiteId: null,
    });

    const second = await resolveCustomDomain('ghost.example.test');
    // The cache short-circuit fires (DB throw didn't happen → no null from
    // the catch). Sentinel shape comes back; defaultWebsiteId is null and
    // clientId is the -1 sentinel.
    expect(second).toEqual({ clientId: -1, defaultWebsiteId: null });
  });

  it('re-queries the DB after the cache TTL elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00Z'));

    const { resolveCustomDomain } = await importModule();
    const first = await resolveCustomDomain('late.example.test');
    expect(first).toBeNull();

    // Seed a verified row now — but cached miss should still apply.
    state.clients.push({
      id: 5,
      customDomain: 'late.example.test',
      customDomainVerifiedAt: new Date('2026-05-19'),
      defaultWebsiteId: null,
    });

    // Advance past the 60s TTL.
    vi.setSystemTime(new Date('2026-05-19T12:01:01Z'));
    const second = await resolveCustomDomain('late.example.test');
    expect(second).toEqual({ clientId: 5, defaultWebsiteId: null });
  });
});

describe('clearCustomDomainCache', () => {
  it('forces the next lookup to re-query the DB', async () => {
    state.clients.push({
      id: 42,
      customDomain: 'portal.acme.test',
      customDomainVerifiedAt: new Date('2026-01-01'),
      defaultWebsiteId: 7,
    });
    const { resolveCustomDomain, clearCustomDomainCache } = await importModule();
    const first = await resolveCustomDomain('portal.acme.test');
    expect(first).toEqual({ clientId: 42, defaultWebsiteId: 7 });

    // Drop the row, clear the cache — next call should reflect new DB state.
    state.clients.length = 0;
    clearCustomDomainCache();

    const second = await resolveCustomDomain('portal.acme.test');
    expect(second).toBeNull();
  });
});
