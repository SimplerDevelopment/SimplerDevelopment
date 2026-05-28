// @vitest-environment node
/**
 * Unit tests for app/api/portal/crm/contacts/merge/route.ts
 *
 * POST /api/portal/crm/contacts/merge — merges secondary contact into primary.
 *  - Auth + portal-client guards
 *  - Body validation (primaryId/secondaryId required, must differ)
 *  - Verifies both contacts exist and belong to the same client
 *  - Inside a transaction: reassigns activities/deals, dedupes tags + custom
 *    field values, fills missing fields on primary from secondary, deletes
 *    the secondary row.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return {
    crmContacts: wrap('crmContacts'),
    crmActivities: wrap('crmActivities'),
    crmDeals: wrap('crmDeals'),
    crmContactTags: wrap('crmContactTags'),
    crmCustomFieldValues: wrap('crmCustomFieldValues'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
}));

// ---------------------------------------------------------------------------
// In-memory state + fluent DB mock
// ---------------------------------------------------------------------------

interface State {
  contacts: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
  deals: Array<Record<string, unknown>>;
  contactTags: Array<Record<string, unknown>>;
  customFieldValues: Array<Record<string, unknown>>;
  transactionThrow: Error | null;
}

const state: State = {
  contacts: [],
  activities: [],
  deals: [],
  contactTags: [],
  customFieldValues: [],
  transactionThrow: null,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'crmContacts':
      return state.contacts;
    case 'crmActivities':
      return state.activities;
    case 'crmDeals':
      return state.deals;
    case 'crmContactTags':
      return state.contactTags;
    case 'crmCustomFieldValues':
      return state.customFieldValues;
    default:
      return [];
  }
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
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
    default:
      return true;
  }
}

function makeDbLike() {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;

    function project(row: Record<string, unknown>) {
      if (!projection) return { ...row };
      const out: Record<string, unknown> = {};
      for (const [outKey, ref] of Object.entries(projection)) {
        const colRef = ref as { __col?: string } | undefined;
        out[outKey] = colRef?.__col ? row[colRef.__col] ?? null : null;
      }
      return out;
    }

    function run(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      return Promise.resolve(rows.map(project));
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return run().then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    let setVals: Record<string, unknown> = {};
    let filter: unknown = null;

    function run(): Promise<Array<Record<string, unknown>>> {
      const arr = tableArray(table.__table);
      const updated: Array<Record<string, unknown>> = [];
      for (const r of arr) {
        if (evalPredicate(filter, r)) {
          Object.assign(r, setVals);
          updated.push(r);
        }
      }
      return Promise.resolve(updated);
    }

    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        setVals = v;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      returning() {
        return run().then((rows) => rows.map((r) => ({ ...r })));
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return run().then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: unknown) {
        const arr = tableArray(table.__table);
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const v of list) {
          const row = { ...(v as Record<string, unknown>) };
          arr.push(row);
          inserted.push(row);
        }
        return Promise.resolve(inserted);
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        const arr = tableArray(table.__table);
        const removed: Array<Record<string, unknown>> = [];
        for (let i = arr.length - 1; i >= 0; i--) {
          if (evalPredicate(filter, arr[i])) {
            removed.push(arr.splice(i, 1)[0]);
          }
        }
        return Promise.resolve(removed).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  return {
    select(projection?: Record<string, unknown>) {
      return buildSelect(projection);
    },
    update(table: { __table: string }) {
      return buildUpdate(table);
    },
    insert(table: { __table: string }) {
      return buildInsert(table);
    },
    delete(table: { __table: string }) {
      return buildDelete(table);
    },
  };
}

vi.mock('@/lib/db', () => {
  const tx = makeDbLike();
  return {
    db: {
      ...tx,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        if (state.transactionThrow) {
          throw state.transactionThrow;
        }
        return fn(makeDbLike());
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { POST } = await import('@/app/api/portal/crm/contacts/merge/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(body: unknown): Request {
  return new Request('http://x/api/portal/crm/contacts/merge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function seedContact(overrides: Record<string, unknown>): void {
  state.contacts.push({
    id: 0,
    clientId: 10,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    title: null,
    source: null,
    avatarUrl: null,
    address: null,
    notes: null,
    companyId: null,
    ownerId: null,
    ...overrides,
  });
}

beforeEach(() => {
  state.contacts.length = 0;
  state.activities.length = 0;
  state.deals.length = 0;
  state.contactTags.length = 0;
  state.customFieldValues.length = 0;
  state.transactionThrow = null;

  authMock.mockReset();
  getPortalClientMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/portal/crm/contacts/merge', () => {
  // -- Auth / client guards ------------------------------------------------

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('passes the parsed userId (int) to getPortalClient', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(getPortalClientMock).toHaveBeenCalledWith(42);
  });

  // -- Body validation -----------------------------------------------------

  it('returns 400 when primaryId is missing', async () => {
    const res = await POST(makePost({ secondaryId: 2 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('primaryId and secondaryId are required');
  });

  it('returns 400 when secondaryId is missing', async () => {
    const res = await POST(makePost({ primaryId: 1 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when primaryId === secondaryId', async () => {
    const res = await POST(makePost({ primaryId: 1, secondaryId: 1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('primaryId and secondaryId must be different');
  });

  // -- Contact existence ---------------------------------------------------

  it('returns 404 when primary contact does not exist', async () => {
    seedContact({ id: 2 });
    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('One or both contacts not found');
  });

  it('returns 404 when secondary contact does not exist', async () => {
    seedContact({ id: 1 });
    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when primary belongs to another client', async () => {
    seedContact({ id: 1, clientId: 999 });
    seedContact({ id: 2 });
    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when secondary belongs to another client', async () => {
    seedContact({ id: 1 });
    seedContact({ id: 2, clientId: 999 });
    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(404);
  });

  // -- Merge transaction behavior -----------------------------------------

  it('reassigns activities from secondary to primary', async () => {
    seedContact({ id: 1, firstName: 'A' });
    seedContact({ id: 2, firstName: 'B' });
    state.activities.push({ id: 100, contactId: 2 });
    state.activities.push({ id: 101, contactId: 2 });
    state.activities.push({ id: 102, contactId: 99 });

    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(200);
    expect(state.activities.find((a) => a.id === 100)?.contactId).toBe(1);
    expect(state.activities.find((a) => a.id === 101)?.contactId).toBe(1);
    expect(state.activities.find((a) => a.id === 102)?.contactId).toBe(99);
  });

  it('reassigns deals from secondary to primary', async () => {
    seedContact({ id: 1, firstName: 'A' });
    seedContact({ id: 2, firstName: 'B' });
    state.deals.push({ id: 200, contactId: 2 });
    state.deals.push({ id: 201, contactId: 99 });

    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(200);
    expect(state.deals.find((d) => d.id === 200)?.contactId).toBe(1);
    expect(state.deals.find((d) => d.id === 201)?.contactId).toBe(99);
  });

  it('moves new tags to primary and skips duplicates, then strips secondary tags', async () => {
    seedContact({ id: 1, firstName: 'A' });
    seedContact({ id: 2, firstName: 'B' });
    state.contactTags.push({ contactId: 1, tagId: 500 });
    state.contactTags.push({ contactId: 2, tagId: 500 }); // duplicate
    state.contactTags.push({ contactId: 2, tagId: 600 }); // new

    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(200);

    const primaryTagIds = state.contactTags
      .filter((t) => t.contactId === 1)
      .map((t) => t.tagId)
      .sort();
    expect(primaryTagIds).toEqual([500, 600]);
    // secondary's tag rows are gone
    expect(state.contactTags.filter((t) => t.contactId === 2)).toHaveLength(0);
  });

  it('handles secondary with no tags (no inserts, no deletes needed)', async () => {
    seedContact({ id: 1, firstName: 'A' });
    seedContact({ id: 2, firstName: 'B' });
    state.contactTags.push({ contactId: 1, tagId: 500 });

    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(200);
    expect(state.contactTags).toHaveLength(1);
    expect(state.contactTags[0]).toMatchObject({ contactId: 1, tagId: 500 });
  });

  it('moves custom field values that primary lacks, skips conflicts, then strips secondary CFVs', async () => {
    seedContact({ id: 1, firstName: 'A' });
    seedContact({ id: 2, firstName: 'B' });
    // primary has CF 10 already
    state.customFieldValues.push({
      customFieldId: 10,
      entityId: 1,
      entityType: 'contact',
      value: 'primary-keeps',
    });
    // secondary has CF 10 (conflict — skipped) and CF 20 (new — moved)
    state.customFieldValues.push({
      customFieldId: 10,
      entityId: 2,
      entityType: 'contact',
      value: 'secondary-loses',
    });
    state.customFieldValues.push({
      customFieldId: 20,
      entityId: 2,
      entityType: 'contact',
      value: 'secondary-wins',
    });

    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(200);

    const primaryCfvs = state.customFieldValues.filter(
      (c) => c.entityId === 1 && c.entityType === 'contact',
    );
    // primary should now have CF 10 (original) + CF 20 (moved)
    const byField: Record<string, unknown> = {};
    for (const c of primaryCfvs) byField[String(c.customFieldId)] = c.value;
    expect(byField['10']).toBe('primary-keeps');
    expect(byField['20']).toBe('secondary-wins');
    // secondary's CFVs are gone
    expect(
      state.customFieldValues.filter(
        (c) => c.entityId === 2 && c.entityType === 'contact',
      ),
    ).toHaveLength(0);
  });

  it('fills missing fields on primary from secondary, leaves populated fields alone', async () => {
    seedContact({
      id: 1,
      firstName: 'Alice',
      email: 'primary@x.test', // kept
      phone: null, // filled
      title: null, // filled
      lastName: 'Existing', // kept
      source: null, // filled
      avatarUrl: null, // filled
      address: null, // filled
      notes: 'has notes', // kept
      companyId: null, // filled
      ownerId: 7, // kept
    });
    seedContact({
      id: 2,
      firstName: 'Bob',
      email: 'secondary@x.test',
      phone: '555-1212',
      title: 'CTO',
      lastName: 'Smith',
      source: 'web',
      avatarUrl: 'https://x/avatar.png',
      address: '1 Main St',
      notes: 'other notes',
      companyId: 50,
      ownerId: 99,
    });

    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: 1,
      email: 'primary@x.test',
      phone: '555-1212',
      title: 'CTO',
      lastName: 'Existing',
      source: 'web',
      avatarUrl: 'https://x/avatar.png',
      address: '1 Main St',
      notes: 'has notes',
      companyId: 50,
      ownerId: 7,
    });
  });

  it('deletes the secondary contact after merge', async () => {
    seedContact({ id: 1, firstName: 'A' });
    seedContact({ id: 2, firstName: 'B' });

    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(200);
    expect(state.contacts.find((c) => c.id === 2)).toBeUndefined();
    expect(state.contacts.find((c) => c.id === 1)).toBeDefined();
  });

  it('returns 200 with the merged primary in the response body', async () => {
    seedContact({ id: 1, firstName: 'Alice' });
    seedContact({ id: 2, firstName: 'Bob', email: 'b@x.test' });

    const res = await POST(makePost({ primaryId: 1, secondaryId: 2 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.email).toBe('b@x.test');
    // updatedAt was set during merge
    expect(body.data.updatedAt).toBeDefined();
  });

  it('propagates transaction errors', async () => {
    seedContact({ id: 1, firstName: 'A' });
    seedContact({ id: 2, firstName: 'B' });
    state.transactionThrow = new Error('tx blew up');

    await expect(
      POST(makePost({ primaryId: 1, secondaryId: 2 })),
    ).rejects.toThrow('tx blew up');
  });
});
