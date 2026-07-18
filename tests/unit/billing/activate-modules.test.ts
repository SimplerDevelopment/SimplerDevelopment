// @vitest-environment node
/**
 * Unit tests for lib/billing/activate-modules.ts (OBQA-014).
 *
 * activateModuleSubscription wraps everything in db.transaction(cb): a
 * per-client pg_advisory_xact_lock, a per-serviceId select-then-update-or-
 * insert on clientServices, an optional clients update (stripeCustomerId /
 * trialUsedAt), and a guarded month-one grantMonthlyCredits call that only
 * fires once the transaction has resolved. Grant decision: a brand-new row
 * (insertedNew) always grants — no recency select fires; a reactivation
 * (existing row flipped to active) issues one recency select and grants only
 * when the newest creditsGrantedAt is null/older than 20 days. The tx itself
 * never stamps creditsGrantedAt — grantMonthlyCredits stamps on its own
 * success.
 *
 * We mock @/lib/db so db.transaction(cb) invokes cb with a tx stand-in whose
 * select/update/insert/execute calls are captured for assertions (same
 * select-queue idiom as tests/unit/ai-credits.test.ts, adapted for a single
 * shared transaction object), and mock @/lib/ai-credits so
 * grantMonthlyCredits never touches the real ledger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory state driving the tx mock
// ---------------------------------------------------------------------------

interface DbState {
  selectQueue: Array<Array<Record<string, unknown>>>;
  selectCallCount: number;
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  updates: Array<{ table: string; values: Record<string, unknown> }>;
  executeCalls: unknown[];
}

const dbState: DbState = {
  selectQueue: [],
  selectCallCount: 0,
  inserts: [],
  updates: [],
  executeCalls: [],
};

// Tracks the relative order of "transaction resolved" vs "grant called" so
// we can assert grantMonthlyCredits fires strictly after the tx commits.
const callOrder: string[] = [];

const dbTransactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    execute: (arg: unknown) => {
      dbState.executeCalls.push(arg);
      return Promise.resolve(undefined);
    },
    select: (_projection?: unknown) => {
      dbState.selectCallCount += 1;
      const rows = dbState.selectQueue.shift() ?? [];
      const chain: Record<string, unknown> = {};
      const passthrough = ['from', 'where', 'orderBy', 'limit'];
      for (const m of passthrough) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject);
      return chain;
    },
    update: (table: { __table: string }) => {
      let captured: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      chain.set = (v: Record<string, unknown>) => {
        captured = v;
        return chain;
      };
      chain.where = (_w: unknown) => {
        dbState.updates.push({ table: table.__table, values: captured });
        return Promise.resolve(undefined);
      };
      return chain;
    },
    insert: (table: { __table: string }) => ({
      values: (v: Record<string, unknown>) => {
        dbState.inserts.push({ table: table.__table, values: v });
        return Promise.resolve(undefined);
      },
    }),
  };

  const result = await cb(tx);
  callOrder.push('transaction:resolved');
  return result;
});

vi.mock('@/lib/db', () => ({
  db: { transaction: (cb: (tx: unknown) => Promise<unknown>) => dbTransactionMock(cb) },
}));

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
  return new Proxy(
    { clients: wrap('clients'), clientServices: wrap('clientServices') },
    {
      has: (t, p) =>
        p in t || !(p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'),
      get: (t, p) =>
        p in t
          ? (t as Record<string, unknown>)[p as string]
          : p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'
            ? undefined
            : wrap(p as string),
    },
  );
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ op: 'sql', strings, vals }),
}));

const grantMonthlyCreditsMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  grantMonthlyCredits: (...args: unknown[]) => grantMonthlyCreditsMock(...args),
}));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectCallCount = 0;
  dbState.inserts = [];
  dbState.updates = [];
  dbState.executeCalls = [];
  callOrder.length = 0;
  dbTransactionMock.mockClear();
  grantMonthlyCreditsMock.mockReset();
  grantMonthlyCreditsMock.mockImplementation(async (clientId: number) => {
    callOrder.push('grantMonthlyCredits:called');
    return { granted: 1000, newBalance: 1000, clientId };
  });
});

async function importModule() {
  return await import('@/lib/billing/activate-modules');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('activateModuleSubscription — empty input', () => {
  it('is a no-op when serviceIds is empty: no db calls, no grant', async () => {
    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 1,
      serviceIds: [],
      stripeSubscriptionId: null,
    });
    expect(result).toEqual({ newlyActivated: false, creditsGranted: false });
    expect(dbTransactionMock).not.toHaveBeenCalled();
    expect(grantMonthlyCreditsMock).not.toHaveBeenCalled();
  });

  it('is a no-op when clientId is falsy, even with serviceIds present', async () => {
    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 0,
      serviceIds: [10],
      stripeSubscriptionId: null,
    });
    expect(result).toEqual({ newlyActivated: false, creditsGranted: false });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});

describe('activateModuleSubscription — new clientServices row', () => {
  it('inserts a new active row and grants credits once when none existed', async () => {
    dbState.selectQueue.push([]); // existing-row check: no row for serviceId 10
    // insertedNew path: no recency select fires — nothing else queued.

    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 5,
      serviceIds: [10],
      stripeSubscriptionId: 'sub_abc',
    });

    expect(result).toEqual({ newlyActivated: true, creditsGranted: true });

    const insert = dbState.inserts.find((i) => i.table === 'clientServices');
    expect(insert).toBeDefined();
    expect(insert!.values).toMatchObject({
      clientId: 5,
      serviceId: 10,
      status: 'active',
      stripeSubscriptionId: 'sub_abc',
    });
    expect(insert!.values.startDate).toBeInstanceOf(Date);

    // Only the per-service existence select ran — insertedNew skips the
    // recency check entirely.
    expect(dbState.selectCallCount).toBe(1);
    // The tx never stamps creditsGrantedAt (grantMonthlyCredits stamps on
    // its own success).
    expect(dbState.updates.some((u) => 'creditsGrantedAt' in u.values)).toBe(false);

    // Advisory lock was taken exactly once for this activation.
    expect(dbState.executeCalls).toHaveLength(1);

    expect(grantMonthlyCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantMonthlyCreditsMock).toHaveBeenCalledWith(5);
  });

  it('grants for a fresh insert even when another module was granted recently (day-5 second-module case)', async () => {
    // A second module purchased 5 days after the first: the recent
    // creditsGrantedAt stamp on the other active row is irrelevant —
    // insertedNew ignores the 20-day window and never even runs the
    // recency select.
    dbState.selectQueue.push([]); // existence check for serviceId 70: no row

    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 12,
      serviceIds: [70],
      stripeSubscriptionId: 'sub_second_module',
    });

    expect(result).toEqual({ newlyActivated: true, creditsGranted: true });
    expect(dbState.selectCallCount).toBe(1); // no recency select consumed
    expect(grantMonthlyCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantMonthlyCreditsMock).toHaveBeenCalledWith(12);
  });
});

describe('activateModuleSubscription — existing non-active row', () => {
  it('flips an existing non-active row to active, counts as newly activated, grants', async () => {
    dbState.selectQueue.push([{ id: 55, status: 'cancelled' }]); // existence check
    dbState.selectQueue.push([]); // recency select: no prior grant

    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 6,
      serviceIds: [20],
      stripeSubscriptionId: 'sub_xyz',
    });

    expect(result).toEqual({ newlyActivated: true, creditsGranted: true });
    expect(dbState.inserts.filter((i) => i.table === 'clientServices')).toHaveLength(0);

    const statusUpdate = dbState.updates.find(
      (u) => u.table === 'clientServices' && u.values.status === 'active',
    );
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate!.values.stripeSubscriptionId).toBe('sub_xyz');

    // Reactivation path issued exactly one recency select on top of the
    // per-service existence check.
    expect(dbState.selectCallCount).toBe(2);

    expect(grantMonthlyCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantMonthlyCreditsMock).toHaveBeenCalledWith(6);
  });

  it('grants on reactivation when the newest grantedAt is older than 20 days', async () => {
    dbState.selectQueue.push([{ id: 56, status: 'cancelled' }]);
    dbState.selectQueue.push([{ grantedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000) }]);

    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 13,
      serviceIds: [21],
      stripeSubscriptionId: 'sub_stale_grant',
    });

    expect(result).toEqual({ newlyActivated: true, creditsGranted: true });
    expect(grantMonthlyCreditsMock).toHaveBeenCalledWith(13);
  });

  it('grants on reactivation when grantedAt is null (never granted)', async () => {
    dbState.selectQueue.push([{ id: 57, status: 'paused' }]);
    dbState.selectQueue.push([{ grantedAt: null }]);

    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 14,
      serviceIds: [22],
      stripeSubscriptionId: 'sub_never_granted',
    });

    expect(result).toEqual({ newlyActivated: true, creditsGranted: true });
    expect(grantMonthlyCreditsMock).toHaveBeenCalledWith(14);
  });
});

describe('activateModuleSubscription — replay / redelivery', () => {
  it('does not grant when the service is already active (webhook redelivery / re-verify)', async () => {
    dbState.selectQueue.push([{ id: 77, status: 'active' }]);

    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 7,
      serviceIds: [30],
      stripeSubscriptionId: 'sub_replay',
    });

    expect(result).toEqual({ newlyActivated: false, creditsGranted: false });
    // Nothing transitioned, so the recency-check select never fired — only
    // the existence check ran.
    expect(dbState.selectCallCount).toBe(1);
    expect(grantMonthlyCreditsMock).not.toHaveBeenCalled();

    // The (idempotent) status update is still reissued on every call.
    const statusUpdate = dbState.updates.find((u) => u.table === 'clientServices');
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate!.values.status).toBe('active');
  });
});

describe('activateModuleSubscription — cancel→resubscribe dedupe window', () => {
  it('does not grant when a reactivation lands within 20 days of the last grant', async () => {
    dbState.selectQueue.push([{ id: 88, status: 'cancelled' }]);
    dbState.selectQueue.push([{ grantedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }]);

    const { activateModuleSubscription } = await importModule();
    const result = await activateModuleSubscription({
      clientId: 8,
      serviceIds: [40],
      stripeSubscriptionId: 'sub_resub',
    });

    expect(result).toEqual({ newlyActivated: true, creditsGranted: false });
    expect(grantMonthlyCreditsMock).not.toHaveBeenCalled();

    // The status transition still happened.
    const statusUpdate = dbState.updates.find((u) => u.values.status === 'active');
    expect(statusUpdate).toBeDefined();
  });
});

describe('activateModuleSubscription — clients row update', () => {
  it('updates stripeCustomerId and trialUsedAt when provided', async () => {
    dbState.selectQueue.push([{ id: 99, status: 'active' }]); // no transition; keep focused

    const { activateModuleSubscription } = await importModule();
    await activateModuleSubscription({
      clientId: 9,
      serviceIds: [50],
      stripeSubscriptionId: 'sub_trial',
      stripeCustomerId: 'cus_123',
      markTrialUsed: true,
    });

    const clientsUpdate = dbState.updates.find((u) => u.table === 'clients');
    expect(clientsUpdate).toBeDefined();
    expect(clientsUpdate!.values.stripeCustomerId).toBe('cus_123');
    expect(clientsUpdate!.values.trialUsedAt).toBeInstanceOf(Date);
  });

  it('issues no clients update when neither stripeCustomerId nor markTrialUsed is set', async () => {
    dbState.selectQueue.push([{ id: 99, status: 'active' }]);

    const { activateModuleSubscription } = await importModule();
    await activateModuleSubscription({
      clientId: 10,
      serviceIds: [50],
      stripeSubscriptionId: 'sub_notrial',
    });

    expect(dbState.updates.filter((u) => u.table === 'clients')).toHaveLength(0);
  });
});

describe('activateModuleSubscription — grant timing', () => {
  it('calls grantMonthlyCredits only after the transaction has resolved', async () => {
    dbState.selectQueue.push([]); // no existing row → insertedNew, always grants

    const { activateModuleSubscription } = await importModule();
    await activateModuleSubscription({
      clientId: 11,
      serviceIds: [60],
      stripeSubscriptionId: 'sub_order',
    });

    expect(callOrder).toEqual(['transaction:resolved', 'grantMonthlyCredits:called']);
  });
});
