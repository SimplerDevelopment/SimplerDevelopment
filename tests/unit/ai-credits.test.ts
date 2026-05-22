// @vitest-environment node
/**
 * Unit tests for lib/ai-credits.ts.
 *
 * The module is entirely DB-coupled (drizzle-orm), so the test file mocks
 * `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm`. The mock implements a
 * chainable query builder backed by an in-memory state that each test can
 * seed and read back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface MockState {
  aiCreditBalances: Array<Record<string, unknown>>;
  aiCreditLedger: Array<Record<string, unknown>>;
  aiCreditPackages: Array<Record<string, unknown>>;
  clientServices: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  /** Forced result for the grantMonthlyCredits subscription query (a join). */
  forcedActiveSubscriptions: Array<{ serviceId: number; credits: number | null; category: string }> | null;
  /** Forced result for the monthly-usage aggregate query. */
  forcedMonthlyUsage: number | null;
}

const state: MockState = {
  aiCreditBalances: [],
  aiCreditLedger: [],
  aiCreditPackages: [],
  clientServices: [],
  services: [],
  forcedActiveSubscriptions: null,
  forcedMonthlyUsage: null,
};

// ---------------------------------------------------------------------------
// Schema mock — each table is a Proxy that returns typed markers for columns.
// ---------------------------------------------------------------------------

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
    aiCreditBalances: wrap('aiCreditBalances'),
    aiCreditLedger: wrap('aiCreditLedger'),
    aiCreditPackages: wrap('aiCreditPackages'),
    clientServices: wrap('clientServices'),
    services: wrap('services'),
  };
});

// ---------------------------------------------------------------------------
// drizzle-orm mock — predicate builders return shape we can evaluate.
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {},
  ),
}));

// ---------------------------------------------------------------------------
// Predicate evaluator
// ---------------------------------------------------------------------------

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
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    case 'sql':
      // The source uses `sql\`...\`` only for SET expressions and the COALESCE
      // aggregate. We treat any sql fragment as "don't filter".
      return true;
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

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

// ---------------------------------------------------------------------------
// db mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    let joined = false;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      innerJoin(_table: unknown, _on: unknown) {
        joined = true;
        return chain;
      },
      leftJoin(_table: unknown, _on: unknown) {
        joined = true;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return runOrChain();
      },
      orderBy() {
        return runOrChain();
      },
      limit(n: number) {
        limit = n;
        return chain;
      },
      offset(_n: number) {
        return chain;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    // After .where, callers may chain .limit/.orderBy OR await directly.
    function runOrChain() {
      return chain;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);

      // grantMonthlyCredits join — return forced subscriptions when this is the
      // joined query against clientServices.
      if (joined && activeTable === 'clientServices') {
        const rows = state.forcedActiveSubscriptions ?? [];
        return Promise.resolve(rows as unknown as Array<Record<string, unknown>>);
      }

      // getMonthlyUsage aggregate — projection is { total: sql`...` } with one
      // alias. Return the forced total wrapped as a single row.
      if (
        activeTable === 'aiCreditLedger' &&
        projection &&
        Object.keys(projection).length === 1 &&
        'total' in projection
      ) {
        return Promise.resolve([{ total: state.forcedMonthlyUsage }]);
      }

      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    let valuesArr: Array<Record<string, unknown>> = [];

    const insertChain: Record<string, unknown> = {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        valuesArr = Array.isArray(vals) ? vals : [vals];
        return insertChain;
      },
      onConflictDoNothing() {
        // Insert each row only if no row in the table already has the same
        // clientId (the only unique constraint we model here).
        for (const v of valuesArr) {
          const existing = tableArray(table.__table).find(
            (r) => r.clientId === v.clientId,
          );
          if (!existing) {
            tableArray(table.__table).push({
              ...v,
              id: nextId(),
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
        return Promise.resolve();
      },
      onConflictDoUpdate(opts: { target: unknown; set: Record<string, unknown> }) {
        // Upsert by clientId.
        for (const v of valuesArr) {
          const existing = tableArray(table.__table).find(
            (r) => r.clientId === v.clientId,
          );
          if (existing) {
            // Apply the SET patch — Date and primitive values pass through;
            // sql fragments of the form `${col} + ${n}` / `${col} - ${n}`
            // resolve to an arithmetic update on the existing column.
            for (const [k, val] of Object.entries(opts.set)) {
              const resolved = resolveSetValue(existing, k, val);
              existing[k] = resolved;
            }
          } else {
            tableArray(table.__table).push({
              ...v,
              id: nextId(),
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
        return Promise.resolve();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        // Plain insert — push and resolve.
        const inserted = valuesArr.map((v) => {
          const row = {
            ...v,
            id: nextId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        return Promise.resolve(inserted).then(onFulfilled, onRejected);
      },
    };
    return insertChain;
  }

  function buildUpdate(table: { __table: string }) {
    let patch: Record<string, unknown> = {};
    return {
      set(p: Record<string, unknown>) {
        patch = p;
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) =>
              evalPredicate(filter, r),
            );
            for (const r of rows) {
              for (const [k, val] of Object.entries(patch)) {
                r[k] = resolveSetValue(r, k, val);
              }
            }
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  // Resolves a SET-clause value. Plain values pass through; sql template
  // fragments that look like `${col} <op> ${n}` (op in +, -) compute the
  // arithmetic result from the existing row.
  function resolveSetValue(
    existing: Record<string, unknown>,
    columnKey: string,
    val: unknown,
  ): unknown {
    if (
      val &&
      typeof val === 'object' &&
      (val as { op?: string }).op === 'sql'
    ) {
      const sqlVal = val as { strings?: string[] | TemplateStringsArray; values?: unknown[] };
      const values = sqlVal.values ?? [];
      const strings = sqlVal.strings ?? [];
      // Expect 2 substitutions, 3 string slots: ['', ' + ', ''] or ['', ' - ', '']
      const opStr = (strings[1] ?? '').trim();
      const delta = values[1];
      if (typeof delta === 'number') {
        const current = (existing[columnKey] as number) ?? 0;
        if (opStr === '+') return current + delta;
        if (opStr === '-') return current - delta;
      }
    }
    return val;
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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  state.aiCreditBalances.length = 0;
  state.aiCreditLedger.length = 0;
  state.aiCreditPackages.length = 0;
  state.clientServices.length = 0;
  state.services.length = 0;
  state.forcedActiveSubscriptions = null;
  state.forcedMonthlyUsage = null;
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/ai-credits');
}

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

describe('getBalance', () => {
  it('returns existing balance when a row exists', async () => {
    state.aiCreditBalances.push({
      clientId: 1,
      balance: 500,
      monthlyGrant: 1000,
      payAsYouGo: true,
    });
    const { getBalance } = await importModule();
    const res = await getBalance(1);
    expect(res).toEqual({ balance: 500, monthlyGrant: 1000, payAsYouGo: true });
  });

  it('creates a zero-balance row when none exists and returns zeros', async () => {
    const { getBalance } = await importModule();
    const res = await getBalance(2);
    expect(res).toEqual({ balance: 0, monthlyGrant: 0, payAsYouGo: false });
    // The insert should have populated the table for clientId=2.
    expect(state.aiCreditBalances).toHaveLength(1);
    expect(state.aiCreditBalances[0]).toMatchObject({ clientId: 2, balance: 0 });
  });
});

// ---------------------------------------------------------------------------
// hasCredits
// ---------------------------------------------------------------------------

describe('hasCredits', () => {
  it('returns true when balance covers the estimated amount', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 5000, monthlyGrant: 0, payAsYouGo: false });
    const { hasCredits } = await importModule();
    expect(await hasCredits(1, 1000)).toBe(true);
  });

  it('returns false when balance is below the estimated amount', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 100, monthlyGrant: 0, payAsYouGo: false });
    const { hasCredits } = await importModule();
    expect(await hasCredits(1, 1000)).toBe(false);
  });

  it('returns true regardless of balance when pay-as-you-go is enabled', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 0, monthlyGrant: 0, payAsYouGo: true });
    const { hasCredits } = await importModule();
    expect(await hasCredits(1, 9_999_999)).toBe(true);
  });

  it('defaults the estimated amount to 1000', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 999, monthlyGrant: 0, payAsYouGo: false });
    const { hasCredits } = await importModule();
    expect(await hasCredits(1)).toBe(false);
    state.aiCreditBalances[0].balance = 1000;
    expect(await hasCredits(1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deductCredits
// ---------------------------------------------------------------------------

describe('deductCredits', () => {
  it('returns success with unchanged balance when amount <= 0', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 500, monthlyGrant: 0, payAsYouGo: false });
    const { deductCredits } = await importModule();
    const res = await deductCredits(1, 0, 'chat', 'ref-1');
    expect(res).toEqual({ success: true, newBalance: 500 });
    // No ledger entry written for no-op deductions.
    expect(state.aiCreditLedger).toHaveLength(0);
  });

  it('rejects when balance is insufficient and pay-as-you-go is off', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 100, monthlyGrant: 0, payAsYouGo: false });
    const { deductCredits } = await importModule();
    const res = await deductCredits(1, 500, 'chat', 'ref-1');
    expect(res.success).toBe(false);
    expect(res.newBalance).toBe(100);
    expect(res.error).toMatch(/insufficient/i);
    expect(state.aiCreditLedger).toHaveLength(0);
  });

  it('allows deduction beyond balance when pay-as-you-go is on', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 50, monthlyGrant: 0, payAsYouGo: true });
    const { deductCredits } = await importModule();
    const res = await deductCredits(1, 200, 'chat', 'ref-1');
    expect(res.success).toBe(true);
    expect(res.newBalance).toBe(-150);
    expect(state.aiCreditBalances[0].balance).toBe(-150);
    expect(state.aiCreditLedger).toHaveLength(1);
    expect(state.aiCreditLedger[0]).toMatchObject({
      clientId: 1,
      type: 'usage',
      amount: -200,
      balanceAfter: -150,
      serviceCategory: 'chat',
      referenceId: 'ref-1',
    });
  });

  it('deducts credits and writes a ledger entry with the default description', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 1000, monthlyGrant: 0, payAsYouGo: false });
    const { deductCredits } = await importModule();
    const res = await deductCredits(1, 300, 'completion', 'ref-xyz');
    expect(res).toEqual({ success: true, newBalance: 700 });
    expect(state.aiCreditBalances[0].balance).toBe(700);
    expect(state.aiCreditLedger[0]).toMatchObject({
      type: 'usage',
      amount: -300,
      balanceAfter: 700,
      description: 'AI usage: completion',
      serviceCategory: 'completion',
      referenceId: 'ref-xyz',
    });
  });

  it('uses a custom description when provided', async () => {
    state.aiCreditBalances.push({ clientId: 1, balance: 1000, monthlyGrant: 0, payAsYouGo: false });
    const { deductCredits } = await importModule();
    await deductCredits(1, 100, 'chat', 'ref-1', 'Custom note');
    expect(state.aiCreditLedger[0].description).toBe('Custom note');
  });
});

// ---------------------------------------------------------------------------
// grantMonthlyCredits
// ---------------------------------------------------------------------------

describe('grantMonthlyCredits', () => {
  it('returns zero grant when client has no active subscriptions', async () => {
    state.forcedActiveSubscriptions = [];
    state.aiCreditBalances.push({ clientId: 1, balance: 200, monthlyGrant: 0, payAsYouGo: false });
    const { grantMonthlyCredits } = await importModule();
    const res = await grantMonthlyCredits(1);
    expect(res).toEqual({ granted: 0, newBalance: 200 });
    // No ledger entry created.
    expect(state.aiCreditLedger).toHaveLength(0);
  });

  it('grants the sum of included credits, upserts balance, and writes a ledger row', async () => {
    state.forcedActiveSubscriptions = [
      { serviceId: 1, credits: 1000, category: 'chat' },
      { serviceId: 2, credits: 500, category: 'image' },
      { serviceId: 3, credits: null, category: 'misc' },
    ];
    state.aiCreditBalances.push({ clientId: 1, balance: 200, monthlyGrant: 0, payAsYouGo: false });
    state.clientServices.push(
      { clientId: 1, serviceId: 1, status: 'active', creditsGrantedAt: null },
      { clientId: 1, serviceId: 2, status: 'active', creditsGrantedAt: null },
    );
    const { grantMonthlyCredits } = await importModule();
    const res = await grantMonthlyCredits(1);
    expect(res.granted).toBe(1500);
    expect(res.newBalance).toBe(1700);
    expect(state.aiCreditBalances[0].balance).toBe(1700);
    expect(state.aiCreditBalances[0].monthlyGrant).toBe(1500);
    const grantEntry = state.aiCreditLedger.find((r) => r.type === 'grant');
    expect(grantEntry).toMatchObject({
      type: 'grant',
      amount: 1500,
      balanceAfter: 1700,
      serviceCategory: 'system',
    });
    expect(String(grantEntry!.description)).toContain('chat');
    expect(String(grantEntry!.description)).toContain('image');
    // creditsGrantedAt should have been stamped on the active clientServices rows.
    for (const cs of state.clientServices) {
      expect(cs.creditsGrantedAt).toBeInstanceOf(Date);
    }
  });

  it('inserts a balance row when one does not yet exist', async () => {
    state.forcedActiveSubscriptions = [{ serviceId: 1, credits: 750, category: 'chat' }];
    const { grantMonthlyCredits } = await importModule();
    const res = await grantMonthlyCredits(42);
    // getBalance auto-creates a zero row before the grant runs, so the upsert
    // path applies the increment.
    expect(res.granted).toBe(750);
    expect(res.newBalance).toBe(750);
    const balance = state.aiCreditBalances.find((b) => b.clientId === 42);
    expect(balance).toBeDefined();
    expect(balance!.balance).toBe(750);
  });
});

// ---------------------------------------------------------------------------
// addPurchasedCredits
// ---------------------------------------------------------------------------

describe('addPurchasedCredits', () => {
  it('increments the existing balance and records the purchase in the ledger', async () => {
    state.aiCreditBalances.push({
      clientId: 1,
      balance: 100,
      monthlyGrant: 0,
      payAsYouGo: false,
    });
    const { addPurchasedCredits } = await importModule();
    const newBalance = await addPurchasedCredits(1, 5000, 'pi_abc', 'Pro Pack');
    expect(newBalance).toBe(5100);
    expect(state.aiCreditBalances[0].balance).toBe(5100);
    const purchase = state.aiCreditLedger.find((r) => r.type === 'purchase');
    expect(purchase).toMatchObject({
      clientId: 1,
      type: 'purchase',
      amount: 5000,
      balanceAfter: 5100,
      description: 'Purchased: Pro Pack',
      serviceCategory: 'system',
      referenceId: 'pi_abc',
    });
  });

  it('creates a balance row on first purchase', async () => {
    const { addPurchasedCredits } = await importModule();
    const newBalance = await addPurchasedCredits(7, 1000, 'pi_first', 'Starter');
    // getBalance auto-creates a zero row; the upsert then adds the purchase.
    expect(newBalance).toBe(1000);
    const balance = state.aiCreditBalances.find((b) => b.clientId === 7);
    expect(balance!.balance).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// setPayAsYouGo
// ---------------------------------------------------------------------------

describe('setPayAsYouGo', () => {
  it('flips payAsYouGo on an existing balance row', async () => {
    state.aiCreditBalances.push({
      clientId: 1,
      balance: 100,
      monthlyGrant: 0,
      payAsYouGo: false,
    });
    const { setPayAsYouGo } = await importModule();
    await setPayAsYouGo(1, true);
    expect(state.aiCreditBalances[0].payAsYouGo).toBe(true);
  });

  it('inserts a new row with the requested payAsYouGo flag when none exists', async () => {
    const { setPayAsYouGo } = await importModule();
    await setPayAsYouGo(99, true);
    const row = state.aiCreditBalances.find((b) => b.clientId === 99);
    expect(row).toBeDefined();
    expect(row!.payAsYouGo).toBe(true);
    expect(row!.balance).toBe(0);
  });

  it('can disable pay-as-you-go on an existing row', async () => {
    state.aiCreditBalances.push({
      clientId: 1,
      balance: 0,
      monthlyGrant: 0,
      payAsYouGo: true,
    });
    const { setPayAsYouGo } = await importModule();
    await setPayAsYouGo(1, false);
    expect(state.aiCreditBalances[0].payAsYouGo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLedger
// ---------------------------------------------------------------------------

describe('getLedger', () => {
  it('returns ledger rows scoped to the client', async () => {
    state.aiCreditLedger.push(
      { id: 1, clientId: 1, type: 'usage', amount: -100 },
      { id: 2, clientId: 1, type: 'grant', amount: 500 },
      { id: 3, clientId: 2, type: 'usage', amount: -200 },
    );
    const { getLedger } = await importModule();
    const rows = await getLedger(1);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect((r as { clientId: number }).clientId).toBe(1);
  });

  it('honors a custom limit', async () => {
    for (let i = 0; i < 5; i++) {
      state.aiCreditLedger.push({ id: i, clientId: 1, type: 'usage', amount: -1 });
    }
    const { getLedger } = await importModule();
    const rows = await getLedger(1, { limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it('accepts an offset argument without error', async () => {
    state.aiCreditLedger.push({ id: 1, clientId: 1, type: 'usage', amount: -1 });
    const { getLedger } = await importModule();
    const rows = await getLedger(1, { limit: 5, offset: 10 });
    // Offset is handled by the DB in production; our mock just resolves the
    // limited row set. We assert the call did not throw and returned an array.
    expect(Array.isArray(rows)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getCreditPackages
// ---------------------------------------------------------------------------

describe('getCreditPackages', () => {
  it('returns only active packages', async () => {
    state.aiCreditPackages.push(
      { id: 1, name: 'Starter', tokens: 1000, active: true },
      { id: 2, name: 'Pro', tokens: 5000, active: true },
      { id: 3, name: 'Retired', tokens: 100, active: false },
    );
    const { getCreditPackages } = await importModule();
    const rows = await getCreditPackages();
    expect(rows).toHaveLength(2);
    for (const r of rows) expect((r as { active: boolean }).active).toBe(true);
  });

  it('returns an empty array when nothing matches', async () => {
    const { getCreditPackages } = await importModule();
    const rows = await getCreditPackages();
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMonthlyUsage
// ---------------------------------------------------------------------------

describe('getMonthlyUsage', () => {
  it('returns the forced aggregate total when present', async () => {
    state.forcedMonthlyUsage = 1234;
    const { getMonthlyUsage } = await importModule();
    const total = await getMonthlyUsage(1);
    expect(total).toBe(1234);
  });

  it('returns 0 when the aggregate row has no total', async () => {
    state.forcedMonthlyUsage = null;
    const { getMonthlyUsage } = await importModule();
    const total = await getMonthlyUsage(1);
    expect(total).toBe(0);
  });

  it('coerces string totals to numbers', async () => {
    // Some Postgres drivers return SUM as a string — verify Number() coercion.
    state.forcedMonthlyUsage = '5678' as unknown as number;
    const { getMonthlyUsage } = await importModule();
    const total = await getMonthlyUsage(1);
    expect(total).toBe(5678);
  });
});
