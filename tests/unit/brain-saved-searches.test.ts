// @vitest-environment node
/**
 * Unit tests for the scoping branches inside `listSavedSearches` from
 * lib/brain/saved-searches.ts. We're not running real SQL — we mock the
 * drizzle module with marker-returning `eq`/`isNull`/`or`/`and` plus a
 * fluent `db.select()` chain that captures the final `where()` argument.
 *
 * The CRUD writers (createSavedSearch, updateSavedSearch, deleteSavedSearch)
 * are DB-coupled in non-trivial ways and exercised at the integration layer.
 * Only the tenant-scope condition assembly is validated here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the conditions handed to `.where(and(...))` so each test can
// inspect them without running real SQL.
const captured: { whereArg: unknown } = { whereArg: null };

vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: (arg: unknown) => {
      captured.whereArg = arg;
      return chain;
    },
    orderBy: () => Promise.resolve([]),
    limit: () => Promise.resolve([]),
    returning: () => Promise.resolve([]),
  };
  return {
    db: {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
    },
  };
});

vi.mock('@/lib/db/schema', () => ({
  brainSavedSearches: {
    id: { __col: 'id' },
    clientId: { __col: 'clientId' },
    userId: { __col: 'userId' },
    sortOrder: { __col: 'sortOrder' },
    createdAt: { __col: 'createdAt' },
  },
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

// Marker-returning drizzle helpers so we can inspect the assembled tree.
vi.mock('drizzle-orm', async () => {
  return {
    eq: (col: { __col: string }, val: unknown) => ({ kind: 'eq', col: col.__col, val }),
    isNull: (col: { __col: string }) => ({ kind: 'isNull', col: col.__col }),
    or: (...parts: unknown[]) => ({ kind: 'or', parts }),
    and: (...parts: unknown[]) => ({ kind: 'and', parts }),
    asc: (col: { __col: string }) => ({ kind: 'asc', col: col.__col }),
    desc: (col: { __col: string }) => ({ kind: 'desc', col: col.__col }),
    sql: () => ({ kind: 'sql' }),
  };
});

const { listSavedSearches } = await import('@/lib/brain/saved-searches');

interface AndNode { kind: 'and'; parts: unknown[] }
interface OrNode { kind: 'or'; parts: unknown[] }
interface EqNode { kind: 'eq'; col: string; val: unknown }
interface IsNullNode { kind: 'isNull'; col: string }
type Node = AndNode | OrNode | EqNode | IsNullNode | unknown;

function partsOfAnd(node: unknown): unknown[] {
  expect(node).toMatchObject({ kind: 'and' });
  return (node as AndNode).parts;
}

function findEq(parts: unknown[], col: string): EqNode | undefined {
  return parts.find(
    (p): p is EqNode =>
      typeof p === 'object' && p !== null && (p as Node as { kind: string }).kind === 'eq' &&
      (p as EqNode).col === col,
  );
}

function findIsNull(parts: unknown[], col: string): IsNullNode | undefined {
  return parts.find(
    (p): p is IsNullNode =>
      typeof p === 'object' && p !== null && (p as Node as { kind: string }).kind === 'isNull' &&
      (p as IsNullNode).col === col,
  );
}

function findOr(parts: unknown[]): OrNode | undefined {
  return parts.find(
    (p): p is OrNode =>
      typeof p === 'object' && p !== null && (p as Node as { kind: string }).kind === 'or',
  );
}

describe('listSavedSearches scoping (tenant + user)', () => {
  beforeEach(() => {
    captured.whereArg = null;
  });

  it('always includes a clientId equality regardless of userId branch (tenancy invariant)', async () => {
    await listSavedSearches(101);
    const parts1 = partsOfAnd(captured.whereArg);
    expect(findEq(parts1, 'clientId')?.val).toBe(101);

    await listSavedSearches(202, { userId: null });
    const parts2 = partsOfAnd(captured.whereArg);
    expect(findEq(parts2, 'clientId')?.val).toBe(202);

    await listSavedSearches(303, { userId: 7 });
    const parts3 = partsOfAnd(captured.whereArg);
    expect(findEq(parts3, 'clientId')?.val).toBe(303);
  });

  it('userId omitted (admin/dev) → no userId predicate at all', async () => {
    await listSavedSearches(101);
    const parts = partsOfAnd(captured.whereArg);
    expect(findIsNull(parts, 'userId')).toBeUndefined();
    expect(findOr(parts)).toBeUndefined();
    // Only the tenancy condition should be present.
    expect(parts).toHaveLength(1);
  });

  it('userId === null → adds an isNull(userId) shared-only predicate', async () => {
    await listSavedSearches(101, { userId: null });
    const parts = partsOfAnd(captured.whereArg);
    expect(findIsNull(parts, 'userId')).toBeDefined();
    expect(findOr(parts)).toBeUndefined();
  });

  it('userId === number → adds an OR(userId=N, userId IS NULL) personal+shared scope', async () => {
    await listSavedSearches(101, { userId: 42 });
    const parts = partsOfAnd(captured.whereArg);
    const orNode = findOr(parts);
    expect(orNode).toBeDefined();

    const orParts = orNode!.parts;
    const eq = orParts.find(
      (p): p is EqNode =>
        typeof p === 'object' && p !== null &&
        (p as { kind: string }).kind === 'eq' && (p as EqNode).col === 'userId',
    );
    const nullCheck = orParts.find(
      (p): p is IsNullNode =>
        typeof p === 'object' && p !== null &&
        (p as { kind: string }).kind === 'isNull' && (p as IsNullNode).col === 'userId',
    );
    expect(eq?.val).toBe(42);
    expect(nullCheck).toBeDefined();
  });
});
