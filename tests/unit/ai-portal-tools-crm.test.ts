// @vitest-environment node
/**
 * Unit tests for lib/ai/portal-tools/crm.ts — Part 1 of 2.
 *
 * Covers: crmTools schema, get_crm_contacts, get_crm_contact_detail,
 * get_crm_companies, get_crm_deals, get_crm_pipelines, get_crm_activities,
 * create_crm_contact, update_crm_contact.
 *
 * See ai-portal-tools-crm-2.test.ts for the remaining handlers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface MockState {
  crmContacts: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  crmActivities: Array<Record<string, unknown>>;
  crmPipelines: Array<Record<string, unknown>>;
  crmPipelineStages: Array<Record<string, unknown>>;
  nextId: Record<string, number>;
}

const state: MockState = {
  crmContacts: [],
  crmCompanies: [],
  crmDeals: [],
  crmActivities: [],
  crmPipelines: [],
  crmPipelineStages: [],
  nextId: {
    crmContacts: 1,
    crmCompanies: 1,
    crmDeals: 1,
    crmActivities: 1,
    crmPipelines: 1,
    crmPipelineStages: 1,
  },
};

// ---------------------------------------------------------------------------
// Schema mock — thin proxy returning column references
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName, __isTable: true },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '__isTable') return true;
          if (prop === '__col') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy(
    {
      crmContacts: wrap('crmContacts'),
      crmCompanies: wrap('crmCompanies'),
      crmDeals: wrap('crmDeals'),
      crmActivities: wrap('crmActivities'),
      crmPipelines: wrap('crmPipelines'),
      crmPipelineStages: wrap('crmPipelineStages'),
    },
    {
      has: (t, p) =>
        p in t ||
        !(
          p === 'then' ||
          p === '__esModule' ||
          p === 'default' ||
          typeof p !== 'string'
        ),
      get: (t, p) =>
        p in t
          ? t[p as keyof typeof t]
          : p === 'then' ||
              p === '__esModule' ||
              p === 'default' ||
              typeof p !== 'string'
            ? undefined
            : wrap(p as string),
    },
  );
});

// ---------------------------------------------------------------------------
// drizzle-orm mock
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---------------------------------------------------------------------------
// Event bus mock
// ---------------------------------------------------------------------------

const mockEmitEvent = vi.fn();
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: mockEmitEvent }));

// ---------------------------------------------------------------------------
// Predicate engine (mirrors portal-tools-cms.test.ts)
// ---------------------------------------------------------------------------

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
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    list?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const left = readField(row, f.a);
      return left === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const left = readField(row, f.a);
      return (f.list ?? []).includes(left);
    }
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
    const refRec = ref as { __col?: string; __table?: string; __isTable?: boolean };
    if (refRec.__isTable) {
      out[alias] = { ...row };
      continue;
    }
    if ((refRec as { op?: string }).op === 'sql') {
      out[alias] = undefined;
      continue;
    }
    const c = getCol(ref);
    out[alias] = c ? row[c.col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;
    let joinedTable: string | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      leftJoin(table: { __table: string }) {
        joinedTable = table.__table;
        return chain;
      },
      innerJoin(table: { __table: string }) {
        joinedTable = table.__table;
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
        limitVal = n;
        return runQuery();
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));

      // Merge in leftJoin columns when projection references them
      const enriched: Array<Record<string, unknown>> = joinedTable
        ? rows.map((r) => {
            const joined = tableArray(joinedTable!).find((jr) =>
              evalPredicate(filter, { ...r, ...jr }),
            );
            return { ...r, ...(joined ?? {}) };
          })
        : rows;

      let out = enriched.map((r) => projectRow(r, projection));
      if (limitVal !== null) out = out.slice(0, limitVal);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const row of rows) {
          const arr = tableArray(table.__table);
          const idx =
            (state.nextId as Record<string, number>)[table.__table] ?? 1;
          const newRow = { id: idx, ...row };
          (state.nextId as Record<string, number>)[table.__table] = idx + 1;
          arr.push(newRow);
          inserted.push(newRow);
        }
        return {
          returning() {
            return Promise.resolve(inserted);
          },
          onConflictDoNothing() {
            return {
              returning() {
                return Promise.resolve(inserted);
              },
              then(
                onFulfilled: (v: unknown) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                return Promise.resolve(inserted).then(onFulfilled, onRejected);
              },
            };
          },
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setPayload: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      set(payload: Record<string, unknown>) {
        setPayload = payload;
        return chain;
      },
      where(f: unknown) {
        const arr = tableArray(table.__table);
        for (const row of arr) {
          if (evalPredicate(f, row)) {
            Object.assign(row, setPayload);
          }
        }
        return Promise.resolve(undefined);
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
// beforeEach — wipe state
// ---------------------------------------------------------------------------

beforeEach(() => {
  state.crmContacts.length = 0;
  state.crmCompanies.length = 0;
  state.crmDeals.length = 0;
  state.crmActivities.length = 0;
  state.crmPipelines.length = 0;
  state.crmPipelineStages.length = 0;
  state.nextId = {
    crmContacts: 1,
    crmCompanies: 1,
    crmDeals: 1,
    crmActivities: 1,
    crmPipelines: 1,
    crmPipelineStages: 1,
  };
  mockEmitEvent.mockReset();
});

async function importModule() {
  return await import('@/lib/ai/portal-tools/crm');
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedContact(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmContacts++,
    clientId: 10,
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: null,
    title: null,
    status: 'lead',
    source: null,
    score: 0,
    companyId: null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    lastContactedAt: null,
    ownerId: null,
    ...overrides,
  };
  state.crmContacts.push(row);
  return row;
}

function seedCompany(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmCompanies++,
    clientId: 10,
    name: 'Acme Inc',
    domain: 'acme.com',
    industry: 'Tech',
    size: '11-50',
    phone: null,
    notes: null,
    ...overrides,
  };
  state.crmCompanies.push(row);
  return row;
}

function seedPipeline(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmPipelines++,
    clientId: 10,
    name: 'Default Pipeline',
    isDefault: true,
    ...overrides,
  };
  state.crmPipelines.push(row);
  return row;
}

function seedStage(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmPipelineStages++,
    pipelineId: 1,
    name: 'New',
    sortOrder: 1,
    ...overrides,
  };
  state.crmPipelineStages.push(row);
  return row;
}

function seedDeal(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmDeals++,
    clientId: 10,
    title: 'Big Deal',
    value: 50000,
    pipelineId: 1,
    stageId: 1,
    contactId: null,
    companyId: null,
    priority: 'medium',
    status: 'open',
    expectedCloseDate: null,
    notes: null,
    ownerId: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    closedAt: null,
    ...overrides,
  };
  state.crmDeals.push(row);
  return row;
}

function seedActivity(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmActivities++,
    clientId: 10,
    type: 'call',
    title: 'Follow-up call',
    description: null,
    contactId: null,
    dealId: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
  state.crmActivities.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// crmTools schema
// ---------------------------------------------------------------------------

describe('crmTools schema', () => {
  it('exposes 15 tools with stable names', async () => {
    const { crmTools } = await importModule();
    const names = crmTools.map((t) => t.name).sort();
    expect(names).toEqual([
      'create_crm_company',
      'create_crm_contact',
      'create_crm_deal',
      'create_crm_proposal',
      'get_crm_activities',
      'get_crm_companies',
      'get_crm_contact_detail',
      'get_crm_contacts',
      'get_crm_deals',
      'get_crm_pipelines',
      'get_crm_proposals',
      'log_crm_activity',
      'send_crm_proposal',
      'update_crm_contact',
      'update_crm_deal',
    ]);
  });

  it('every tool has a non-empty description and an object input_schema', async () => {
    const { crmTools } = await importModule();
    for (const t of crmTools) {
      expect(typeof t.description).toBe('string');
      expect((t.description as string).length).toBeGreaterThan(0);
      expect(t.input_schema.type).toBe('object');
    }
  });

  it('crmHandlers exposes exactly one handler per tool name, each with arity 3', async () => {
    const { crmTools, crmHandlers } = await importModule();
    for (const t of crmTools) {
      expect(typeof crmHandlers[t.name], `handler for ${t.name}`).toBe('function');
      expect(crmHandlers[t.name].length, `arity of ${t.name}`).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// get_crm_contacts
// ---------------------------------------------------------------------------

describe('get_crm_contacts', () => {
  it('returns empty list when client has no contacts', async () => {
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_contacts({}, 10, 1)) as {
      contacts: unknown[];
      total: number;
    };
    expect(res.contacts).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('does not return contacts owned by other clients', async () => {
    seedContact({ id: 1, clientId: 10, firstName: 'Mine' });
    seedContact({ id: 2, clientId: 99, firstName: 'Theirs' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_contacts({}, 10, 1)) as {
      contacts: Array<Record<string, unknown>>;
    };
    expect(res.contacts).toHaveLength(1);
    expect(res.contacts[0].firstName).toBe('Mine');
  });

  it('returns contacts scoped to clientId', async () => {
    seedContact({ id: 1, clientId: 10, firstName: 'Alice' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_contacts({}, 10, 1)) as {
      contacts: Array<Record<string, unknown>>;
    };
    expect(res.contacts).toHaveLength(1);
    expect(res.contacts[0].firstName).toBe('Alice');
  });

  it('respects limit parameter capped at 100', async () => {
    for (let i = 0; i < 5; i++) seedContact({ clientId: 10 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_contacts({ limit: 2 }, 10, 1)) as {
      contacts: Array<Record<string, unknown>>;
    };
    expect(res.contacts).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// get_crm_contact_detail
// ---------------------------------------------------------------------------

describe('get_crm_contact_detail', () => {
  it('returns error when contact not found', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.get_crm_contact_detail({ contact_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Contact not found' });
  });

  it('returns error when contact belongs to another client', async () => {
    seedContact({ id: 1, clientId: 99 });
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.get_crm_contact_detail({ contact_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Contact not found' });
  });

  it('returns contact with activities and deals arrays', async () => {
    seedContact({ id: 1, clientId: 10, firstName: 'Bob' });
    seedActivity({ id: 1, clientId: 10, contactId: 1 });
    seedDeal({ id: 1, clientId: 10, contactId: 1 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_contact_detail({ contact_id: 1 }, 10, 1)) as {
      contact: Record<string, unknown>;
      activities: unknown[];
      deals: unknown[];
    };
    expect(res.contact.firstName).toBe('Bob');
    expect(Array.isArray(res.activities)).toBe(true);
    expect(Array.isArray(res.deals)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// get_crm_companies
// ---------------------------------------------------------------------------

describe('get_crm_companies', () => {
  it('returns empty array when no companies', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.get_crm_companies({}, 10, 1);
    expect(res).toEqual([]);
  });

  it('returns companies for the client only', async () => {
    seedCompany({ id: 1, clientId: 10, name: 'Mine' });
    seedCompany({ id: 2, clientId: 99, name: 'Theirs' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_companies({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Mine');
  });
});

// ---------------------------------------------------------------------------
// get_crm_deals
// ---------------------------------------------------------------------------

describe('get_crm_deals', () => {
  it('returns empty array when no deals', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.get_crm_deals({}, 10, 1);
    expect(Array.isArray(res)).toBe(true);
    expect((res as unknown[]).length).toBe(0);
  });

  it('returns deals scoped to clientId', async () => {
    seedDeal({ id: 1, clientId: 10, title: 'My Deal' });
    seedDeal({ id: 2, clientId: 99, title: 'Other Deal' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_deals({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('My Deal');
  });

  it('each deal result has a contactName property', async () => {
    seedDeal({ id: 1, clientId: 10 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_deals({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect('contactName' in res[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// get_crm_pipelines
// ---------------------------------------------------------------------------

describe('get_crm_pipelines', () => {
  it('returns empty array when no pipelines', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.get_crm_pipelines({}, 10, 1);
    expect(res).toEqual([]);
  });

  it('returns pipelines with stages array', async () => {
    seedPipeline({ id: 1, clientId: 10, name: 'Sales' });
    seedStage({ id: 1, pipelineId: 1, name: 'Lead', sortOrder: 1 });
    seedStage({ id: 2, pipelineId: 1, name: 'Qualified', sortOrder: 2 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_pipelines({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Sales');
    expect(Array.isArray(res[0].stages)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// get_crm_activities
// ---------------------------------------------------------------------------

describe('get_crm_activities', () => {
  it('returns empty array when no activities', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.get_crm_activities({}, 10, 1);
    expect(res).toEqual([]);
  });

  it('returns activities scoped to clientId', async () => {
    seedActivity({ id: 1, clientId: 10, title: 'Call A' });
    seedActivity({ id: 2, clientId: 99, title: 'Call B' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_activities({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('Call A');
  });

  it('respects limit parameter (capped at 50)', async () => {
    for (let i = 0; i < 5; i++) seedActivity({ clientId: 10 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_activities({ limit: 2 }, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// create_crm_contact
// ---------------------------------------------------------------------------

describe('create_crm_contact', () => {
  it('creates a contact and returns contactId', async () => {
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.create_crm_contact(
      { first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com' },
      10,
      5,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(typeof res.contactId).toBe('number');
    expect(state.crmContacts).toHaveLength(1);
    expect(state.crmContacts[0].firstName).toBe('Jane');
    expect(state.crmContacts[0].email).toBe('jane@example.com');
    expect(state.crmContacts[0].clientId).toBe(10);
  });

  it('defaults status to "lead" when not provided', async () => {
    const { crmHandlers } = await importModule();
    await crmHandlers.create_crm_contact({ first_name: 'Bob' }, 10, 1);
    expect(state.crmContacts[0].status).toBe('lead');
  });

  it('uses null ownerId when userId is 0 (automation context)', async () => {
    const { crmHandlers } = await importModule();
    await crmHandlers.create_crm_contact({ first_name: 'Sys' }, 10, 0);
    expect(state.crmContacts[0].ownerId).toBeNull();
  });

  it('uses real userId when userId > 0', async () => {
    const { crmHandlers } = await importModule();
    await crmHandlers.create_crm_contact({ first_name: 'Real' }, 10, 7);
    expect(state.crmContacts[0].ownerId).toBe(7);
  });

  it('emits crm.contact.created event', async () => {
    const { crmHandlers } = await importModule();
    await crmHandlers.create_crm_contact({ first_name: 'Eve' }, 10, 3);
    expect(mockEmitEvent).toHaveBeenCalledWith(
      'crm.contact.created',
      10,
      3,
      expect.objectContaining({ id: expect.any(Number) }),
    );
  });
});

// ---------------------------------------------------------------------------
// update_crm_contact
// ---------------------------------------------------------------------------

describe('update_crm_contact', () => {
  it('returns error when contact not found', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.update_crm_contact({ contact_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Contact not found' });
  });

  it('returns error when contact belongs to another client', async () => {
    seedContact({ id: 1, clientId: 99 });
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.update_crm_contact({ contact_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Contact not found' });
  });

  it('updates only the supplied fields', async () => {
    seedContact({ id: 1, clientId: 10, firstName: 'Old', email: 'old@example.com' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.update_crm_contact(
      { contact_id: 1, first_name: 'New' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const row = state.crmContacts.find((c) => c.id === 1)!;
    expect(row.firstName).toBe('New');
    expect(row.email).toBe('old@example.com');
  });

  it('updates status, email, and notes when provided', async () => {
    seedContact({ id: 1, clientId: 10 });
    const { crmHandlers } = await importModule();
    await crmHandlers.update_crm_contact(
      { contact_id: 1, status: 'customer', email: 'new@example.com', notes: 'VIP' },
      10,
      1,
    );
    const row = state.crmContacts.find((c) => c.id === 1)!;
    expect(row.status).toBe('customer');
    expect(row.email).toBe('new@example.com');
    expect(row.notes).toBe('VIP');
  });
});
