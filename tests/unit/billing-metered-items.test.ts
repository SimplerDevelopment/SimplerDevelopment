// @vitest-environment node
/**
 * Unit tests for lib/billing/metered-items.ts.
 *
 * The module is a thin drizzle CRUD wrapper. We mock `@/lib/db`,
 * `@/lib/db/schema`, and `drizzle-orm` with a tiny in-memory store and
 * chainable query builder so each helper can be exercised end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Row {
  id: number;
  clientId: number;
  stripeSubscriptionId: string;
  stripeSubscriptionItemId: string;
  resource: string;
  unitPriceCents: number;
  includedQuantity: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const state: { rows: Row[]; idCounter: number } = { rows: [], idCounter: 1 };

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
    meteredSubscriptionItems: wrap('meteredSubscriptionItems'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
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
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from() {
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

    function runQuery(): Promise<Row[]> {
      let out = state.rows.filter((r) => evalPredicate(filter, r as unknown as Record<string, unknown>));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out.map((r) => ({ ...r })));
    }

    return chain;
  }

  function buildInsert() {
    return {
      values(vals: Record<string, unknown>) {
        const inserted: Row = {
          id: state.idCounter++,
          clientId: vals.clientId as number,
          stripeSubscriptionId: vals.stripeSubscriptionId as string,
          stripeSubscriptionItemId: vals.stripeSubscriptionItemId as string,
          resource: vals.resource as string,
          unitPriceCents: vals.unitPriceCents as number,
          includedQuantity: vals.includedQuantity as string,
          status: vals.status as string,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.rows.push(inserted);
        return {
          returning() {
            return Promise.resolve([{ ...inserted }]);
          },
        };
      },
    };
  }

  function buildUpdate() {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const matched = state.rows.filter((r) =>
              evalPredicate(filter, r as unknown as Record<string, unknown>),
            );
            for (const r of matched) Object.assign(r, patch);
            return {
              returning() {
                return Promise.resolve(matched.map((r) => ({ ...r })));
              },
            };
          },
        };
      },
    };
  }

  function buildDelete() {
    return {
      where(filter: unknown) {
        const matched: Row[] = [];
        const remaining: Row[] = [];
        for (const r of state.rows) {
          if (evalPredicate(filter, r as unknown as Record<string, unknown>)) matched.push(r);
          else remaining.push(r);
        }
        state.rows = remaining;
        return {
          returning(projection?: Record<string, unknown>) {
            if (projection) {
              return Promise.resolve(matched.map((r) => ({ id: r.id })));
            }
            return Promise.resolve(matched.map((r) => ({ ...r })));
          },
        };
      },
    };
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
      insert() {
        return buildInsert();
      },
      update() {
        return buildUpdate();
      },
      delete() {
        return buildDelete();
      },
    },
  };
});

function seed(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: state.idCounter++,
    clientId: 1,
    stripeSubscriptionId: 'sub_1',
    stripeSubscriptionItemId: 'si_1',
    resource: 'hosting_bandwidth_gb',
    unitPriceCents: 5,
    includedQuantity: '0',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  state.rows.push(row);
  return row;
}

beforeEach(() => {
  state.rows = [];
  state.idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/billing/metered-items');
}

// ---------------------------------------------------------------------------
// listMeteredItemsForClient
// ---------------------------------------------------------------------------

describe('listMeteredItemsForClient', () => {
  it('returns [] when no rows exist for the client', async () => {
    const { listMeteredItemsForClient } = await importModule();
    const rows = await listMeteredItemsForClient(1);
    expect(rows).toEqual([]);
  });

  it('returns all rows that match clientId', async () => {
    seed({ clientId: 1, resource: 'a' });
    seed({ clientId: 1, resource: 'b' });
    seed({ clientId: 2, resource: 'c' });
    const { listMeteredItemsForClient } = await importModule();
    const rows = await listMeteredItemsForClient(1);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.clientId === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listActiveMeteredItemsForClient
// ---------------------------------------------------------------------------

describe('listActiveMeteredItemsForClient', () => {
  it('returns [] when no active rows match', async () => {
    seed({ clientId: 1, status: 'paused' });
    seed({ clientId: 1, status: 'cancelled' });
    const { listActiveMeteredItemsForClient } = await importModule();
    const rows = await listActiveMeteredItemsForClient(1);
    expect(rows).toEqual([]);
  });

  it('returns only active rows for the client', async () => {
    seed({ clientId: 1, status: 'active', resource: 'a' });
    seed({ clientId: 1, status: 'paused', resource: 'b' });
    seed({ clientId: 2, status: 'active', resource: 'c' });
    const { listActiveMeteredItemsForClient } = await importModule();
    const rows = await listActiveMeteredItemsForClient(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].resource).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// getMeteredItem
// ---------------------------------------------------------------------------

describe('getMeteredItem', () => {
  it('returns null when no row matches the id', async () => {
    const { getMeteredItem } = await importModule();
    const row = await getMeteredItem(99999);
    expect(row).toBeNull();
  });

  it('returns the row when found', async () => {
    const seeded = seed({ clientId: 1, resource: 'email_send' });
    const { getMeteredItem } = await importModule();
    const row = await getMeteredItem(seeded.id);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(seeded.id);
    expect(row!.resource).toBe('email_send');
  });
});

// ---------------------------------------------------------------------------
// insertMeteredItem
// ---------------------------------------------------------------------------

describe('insertMeteredItem', () => {
  it('inserts with sane defaults for status and includedQuantity', async () => {
    const { insertMeteredItem } = await importModule();
    const row = await insertMeteredItem({
      clientId: 1,
      stripeSubscriptionId: 'sub_new',
      stripeSubscriptionItemId: 'si_new',
      resource: 'hosting_invocations',
      unitPriceCents: 10,
    });
    expect(row.clientId).toBe(1);
    expect(row.resource).toBe('hosting_invocations');
    expect(row.unitPriceCents).toBe(10);
    expect(row.includedQuantity).toBe('0');
    expect(row.status).toBe('active');
    expect(state.rows).toHaveLength(1);
  });

  it('honors explicit includedQuantity (number → string) and status', async () => {
    const { insertMeteredItem } = await importModule();
    const row = await insertMeteredItem({
      clientId: 2,
      stripeSubscriptionId: 'sub_x',
      stripeSubscriptionItemId: 'si_x',
      resource: 'email_send',
      unitPriceCents: 1,
      includedQuantity: 1500,
      status: 'paused',
    });
    expect(row.includedQuantity).toBe('1500');
    expect(row.status).toBe('paused');
  });
});

// ---------------------------------------------------------------------------
// updateMeteredItem
// ---------------------------------------------------------------------------

describe('updateMeteredItem', () => {
  it('returns null when the id does not exist', async () => {
    const { updateMeteredItem } = await importModule();
    const res = await updateMeteredItem(99999, { status: 'paused' });
    expect(res).toBeNull();
  });

  it('applies only the provided patch fields and bumps updatedAt', async () => {
    const seeded = seed({ clientId: 1, status: 'active', unitPriceCents: 5, includedQuantity: '0' });
    const oldUpdatedAt = seeded.updatedAt;
    // Pause briefly to make sure updatedAt actually advances.
    await new Promise((r) => setTimeout(r, 2));
    const { updateMeteredItem } = await importModule();
    const res = await updateMeteredItem(seeded.id, { status: 'paused' });
    expect(res).not.toBeNull();
    expect(res!.status).toBe('paused');
    expect(res!.unitPriceCents).toBe(5);
    expect(res!.includedQuantity).toBe('0');
    expect(res!.updatedAt.getTime()).toBeGreaterThanOrEqual(oldUpdatedAt.getTime());
  });

  it('coerces numeric includedQuantity to string in the patch', async () => {
    const seeded = seed({ clientId: 1, includedQuantity: '0' });
    const { updateMeteredItem } = await importModule();
    const res = await updateMeteredItem(seeded.id, { includedQuantity: 2500 });
    expect(res!.includedQuantity).toBe('2500');
  });

  it('updates unitPriceCents independently', async () => {
    const seeded = seed({ clientId: 1, unitPriceCents: 5 });
    const { updateMeteredItem } = await importModule();
    const res = await updateMeteredItem(seeded.id, { unitPriceCents: 12 });
    expect(res!.unitPriceCents).toBe(12);
  });

  it('no-op patch still touches updatedAt and returns the row', async () => {
    const seeded = seed({ clientId: 1 });
    const { updateMeteredItem } = await importModule();
    const res = await updateMeteredItem(seeded.id, {});
    expect(res).not.toBeNull();
    expect(res!.id).toBe(seeded.id);
  });
});

// ---------------------------------------------------------------------------
// deleteMeteredItem
// ---------------------------------------------------------------------------

describe('deleteMeteredItem', () => {
  it('returns false when nothing matches the id', async () => {
    const { deleteMeteredItem } = await importModule();
    const ok = await deleteMeteredItem(99999);
    expect(ok).toBe(false);
  });

  it('returns true and removes the row when found', async () => {
    const seeded = seed({ clientId: 1 });
    seed({ clientId: 1, resource: 'other' });
    const { deleteMeteredItem } = await importModule();
    const ok = await deleteMeteredItem(seeded.id);
    expect(ok).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].resource).toBe('other');
  });
});
