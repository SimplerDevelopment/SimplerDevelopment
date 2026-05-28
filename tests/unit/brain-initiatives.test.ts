// @vitest-environment node
/**
 * Unit tests for lib/brain/initiatives — the pure-logic edges:
 *   - slugifyInitiativeName: normalization + fallbacks
 *   - updateInitiative: refuses any status change (must go through close/reopen)
 *   - closeInitiative: requires reason or lessonsLearned + valid outcome
 *   - reopenInitiative: only valid from terminal statuses (completed / cancelled)
 *
 * The DB layer is stubbed — these tests guard the contract, not the SQL.
 * Correlated-subquery `goalCount` correctness lives in the integration spec
 * (real Postgres needed to catch the ${table.col} Drizzle bug).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- DB mock ---------------------------------------------------------------
// Drizzle's fluent builders are chainable thenables — every `.select().from()...`
// resolves to whatever rows the test wants. We hold a per-test "rows" array and
// thread it through the chain.
type ChainResult = unknown[];
const state: {
  selectRows: ChainResult;
  updateRows: ChainResult;
  insertRows: ChainResult;
  txFn: ((tx: unknown) => Promise<unknown>) | null;
  auditCalls: Array<Record<string, unknown>>;
} = {
  selectRows: [],
  updateRows: [],
  insertRows: [],
  txFn: null,
  auditCalls: [],
};

function makeChain(rowsRef: () => ChainResult) {
  const node: Record<string, unknown> = {};
  const methods = [
    'select', 'from', 'where', 'orderBy', 'limit', 'offset',
    'innerJoin', 'leftJoin', 'set', 'values', 'returning',
    'onConflictDoNothing', 'onConflictDoUpdate',
  ];
  for (const m of methods) node[m] = vi.fn(() => node);
  // Thenable — `await chain` resolves to rowsRef().
  (node as { then: (cb: (v: ChainResult) => unknown) => Promise<unknown> }).then =
    (cb) => Promise.resolve(cb(rowsRef()));
  return node;
}

vi.mock('@/lib/db', () => {
  const selectChain = () => makeChain(() => state.selectRows);
  const updateChain = () => makeChain(() => state.updateRows);
  const insertChain = () => makeChain(() => state.insertRows);
  const deleteChain = () => makeChain(() => []);
  const db = {
    select: vi.fn(() => selectChain()),
    update: vi.fn(() => updateChain()),
    insert: vi.fn(() => insertChain()),
    delete: vi.fn(() => deleteChain()),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      state.txFn = fn;
      const tx = {
        select: vi.fn(() => selectChain()),
        update: vi.fn(() => updateChain()),
        insert: vi.fn(() => insertChain()),
        delete: vi.fn(() => deleteChain()),
      };
      return fn(tx);
    }),
  };
  return { db };
});

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

// Import AFTER mocks register.
import {
  slugifyInitiativeName,
  updateInitiative,
  closeInitiative,
  reopenInitiative,
} from '@/lib/brain/initiatives';

beforeEach(() => {
  state.selectRows = [];
  state.updateRows = [];
  state.insertRows = [];
  state.auditCalls = [];
  state.txFn = null;
});

describe('slugifyInitiativeName', () => {
  it('lowercases + dasherizes ASCII names', () => {
    expect(slugifyInitiativeName('Q3 Product Launch')).toBe('q3-product-launch');
  });

  it('collapses runs of non-alphanumerics to a single dash', () => {
    expect(slugifyInitiativeName('  Foo!!  --  Bar??  ')).toBe('foo-bar');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyInitiativeName('---hello---')).toBe('hello');
  });

  it('caps the result at 140 characters', () => {
    const long = 'a'.repeat(500);
    expect(slugifyInitiativeName(long).length).toBeLessThanOrEqual(140);
  });

  it('falls back to "initiative" when the name has no alphanumerics', () => {
    expect(slugifyInitiativeName('!!!')).toBe('initiative');
    expect(slugifyInitiativeName('')).toBe('initiative');
  });

  it('strips combining diacritics', () => {
    expect(slugifyInitiativeName('Café Olé')).toBe('cafe-ole');
  });
});

describe('updateInitiative — status changes are forbidden via this path', () => {
  it('throws when patch.status is present, regardless of value', async () => {
    await expect(
      updateInitiative(1, null, 99, { status: 'completed' }),
    ).rejects.toThrow(/closeInitiative or reopenInitiative/);
    await expect(
      updateInitiative(1, null, 99, { status: 'active' }),
    ).rejects.toThrow(/closeInitiative or reopenInitiative/);
  });

  it('returns null when the patch targets a row this client does not own', async () => {
    state.updateRows = []; // RETURNING with no rows
    const res = await updateInitiative(1, null, 99, { name: 'x' });
    expect(res).toBeNull();
  });
});

describe('closeInitiative — input guards', () => {
  it('throws when outcome is not "completed" or "cancelled"', async () => {
    await expect(
      // @ts-expect-error — feeding an invalid outcome on purpose
      closeInitiative(1, null, 99, { outcome: 'paused' }),
    ).rejects.toThrow(/outcome must be/);
  });

  it('throws when neither reason nor lessonsLearned is provided', async () => {
    await expect(
      closeInitiative(1, null, 99, { outcome: 'completed' }),
    ).rejects.toThrow(/reason or lessonsLearned/);
  });

  it('throws when both reason and lessonsLearned are blank whitespace', async () => {
    await expect(
      closeInitiative(1, null, 99, { outcome: 'cancelled', reason: '   ', lessonsLearned: '\t\n' }),
    ).rejects.toThrow(/reason or lessonsLearned/);
  });

  it('does not throw when only reason is provided (no note created)', async () => {
    // tx is entered; the lock-select returns no row, so the path returns null
    // — but the input validation passed.
    state.selectRows = [];
    const out = await closeInitiative(1, null, 99, { outcome: 'cancelled', reason: 'deleted' });
    expect(out).toBeNull();
  });
});

describe('reopenInitiative — only valid from terminal statuses', () => {
  it('returns null when no row matches (initiative not found)', async () => {
    state.selectRows = [];
    const out = await reopenInitiative(1, null, 99);
    expect(out).toBeNull();
  });

  it('throws when the current status is "planned"', async () => {
    state.selectRows = [{ id: 99, status: 'planned' }];
    await expect(reopenInitiative(1, null, 99)).rejects.toThrow(/non-terminal status/);
  });

  it('throws when the current status is "active"', async () => {
    state.selectRows = [{ id: 99, status: 'active' }];
    await expect(reopenInitiative(1, null, 99)).rejects.toThrow(/non-terminal status/);
  });

  it('throws when the current status is "paused"', async () => {
    state.selectRows = [{ id: 99, status: 'paused' }];
    await expect(reopenInitiative(1, null, 99)).rejects.toThrow(/non-terminal status/);
  });

  it('proceeds when the current status is "completed"', async () => {
    state.selectRows = [{ id: 99, status: 'completed' }];
    state.updateRows = [{ id: 99, status: 'active' }];
    const out = await reopenInitiative(1, null, 99);
    expect(out).toEqual({ id: 99, status: 'active' });
  });

  it('proceeds when the current status is "cancelled"', async () => {
    state.selectRows = [{ id: 99, status: 'cancelled' }];
    state.updateRows = [{ id: 99, status: 'active' }];
    const out = await reopenInitiative(1, null, 99);
    expect(out).toEqual({ id: 99, status: 'active' });
  });
});
