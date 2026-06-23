// @vitest-environment node
/**
 * Unit tests for lib/brain/review.ts.
 *
 * review.ts is heavily DB-bound (drizzle-orm). The test file mocks `@/lib/db`,
 * `@/lib/db/schema`, `drizzle-orm`, and `./audit`. The DB mock implements a
 * minimal chainable query builder backed by in-memory state, plus a
 * `db.transaction(fn)` shim that invokes the callback with the same `db` object
 * (so all `tx.select/insert/update` calls hit the same in-memory tables).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  brainAiReviewItems: Array<Record<string, unknown>>;
  brainMeetings: Array<Record<string, unknown>>;
  brainTasks: Array<Record<string, unknown>>;
  crmContacts: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  crmPipelines: Array<Record<string, unknown>>;
  crmPipelineStages: Array<Record<string, unknown>>;
  brainAuditLogs: Array<Record<string, unknown>>;
  auditCalls: Array<Record<string, unknown>>;
}

const state: MockState = {
  brainAiReviewItems: [],
  brainMeetings: [],
  brainTasks: [],
  crmContacts: [],
  crmCompanies: [],
  crmDeals: [],
  crmPipelines: [],
  crmPipelineStages: [],
  brainAuditLogs: [],
  auditCalls: [],
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
    brainAiReviewItems: wrap('brainAiReviewItems'),
    brainAuditLogs: wrap('brainAuditLogs'),
    brainMeetings: wrap('brainMeetings'),
    brainTasks: wrap('brainTasks'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
    crmPipelines: wrap('crmPipelines'),
    crmPipelineStages: wrap('crmPipelineStages'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; list?: unknown[]; args?: unknown[] };
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
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const list = (f.list ?? []) as unknown[];
      return list.includes(row[col.__col]);
    }
    default:
      return true;
  }
}

function projectRow(row: Record<string, unknown>, projection: Record<string, unknown> | null): Record<string, unknown> {
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

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let lim: number | null = null;

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => projectRow(r, projection));
      if (lim !== null) out = out.slice(0, lim);
      return Promise.resolve(out);
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
      orderBy() {
        return chain;
      },
      limit(n: number) {
        lim = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextId(), createdAt: new Date(), updatedAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning(projection?: Record<string, unknown>) {
            if (projection) {
              return Promise.resolve(inserted.map((r) => projectRow(r, projection)));
            }
            return Promise.resolve(inserted);
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) Object.assign(r, patch);
            return {
              returning(projection?: Record<string, unknown>) {
                if (projection) {
                  return Promise.resolve(rows.map((r) => projectRow(r, projection)));
                }
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
              },
            };
          },
        };
      },
    };
  }

  const db = {
    select(projection?: Record<string, unknown>) {
      return buildSelect(projection ?? null);
    },
    insert(table: { __table: string }) {
      return buildInsert(table);
    },
    update(table: { __table: string }) {
      return buildUpdate(table);
    },
    transaction(fn: (tx: unknown) => Promise<unknown>) {
      return fn(db);
    },
  };

  return { db };
});

beforeEach(() => {
  state.brainAiReviewItems.length = 0;
  state.brainMeetings.length = 0;
  state.brainTasks.length = 0;
  state.crmContacts.length = 0;
  state.crmCompanies.length = 0;
  state.crmDeals.length = 0;
  state.crmPipelines.length = 0;
  state.crmPipelineStages.length = 0;
  state.brainAuditLogs.length = 0;
  state.auditCalls.length = 0;
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/brain/review');
}

// ---------------------------------------------------------------------------
// listReviewItems
// ---------------------------------------------------------------------------

describe('listReviewItems', () => {
  it('returns [] when no review items exist for the client', async () => {
    const { listReviewItems } = await importModule();
    const rows = await listReviewItems(1);
    expect(rows).toEqual([]);
  });

  it('filters by clientId', async () => {
    state.brainAiReviewItems.push(
      { id: 1, clientId: 1, status: 'pending', sourceType: 'meeting', sourceId: 10 },
      { id: 2, clientId: 2, status: 'pending', sourceType: 'meeting', sourceId: 10 },
    );
    const { listReviewItems } = await importModule();
    const rows = await listReviewItems(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it('filters by single status string', async () => {
    state.brainAiReviewItems.push(
      { id: 1, clientId: 1, status: 'pending' },
      { id: 2, clientId: 1, status: 'approved' },
      { id: 3, clientId: 1, status: 'rejected' },
    );
    const { listReviewItems } = await importModule();
    const rows = await listReviewItems(1, { status: 'approved' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(2);
  });

  it('filters by single-element status array (treated as the single status)', async () => {
    state.brainAiReviewItems.push(
      { id: 1, clientId: 1, status: 'pending' },
      { id: 2, clientId: 1, status: 'approved' },
    );
    const { listReviewItems } = await importModule();
    const rows = await listReviewItems(1, { status: ['pending'] });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it('drops the status filter when given a multi-element array (current behavior)', async () => {
    state.brainAiReviewItems.push(
      { id: 1, clientId: 1, status: 'pending' },
      { id: 2, clientId: 1, status: 'approved' },
    );
    const { listReviewItems } = await importModule();
    const rows = await listReviewItems(1, { status: ['pending', 'approved'] });
    expect(rows).toHaveLength(2);
  });

  it('filters by sourceType', async () => {
    state.brainAiReviewItems.push(
      { id: 1, clientId: 1, status: 'pending', sourceType: 'meeting' },
      { id: 2, clientId: 1, status: 'pending', sourceType: 'note' },
    );
    const { listReviewItems } = await importModule();
    const rows = await listReviewItems(1, { sourceType: 'meeting' });
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceType).toBe('meeting');
  });

  it('filters by sourceId (including the falsy 0 case)', async () => {
    state.brainAiReviewItems.push(
      { id: 1, clientId: 1, sourceType: 'meeting', sourceId: 0 },
      { id: 2, clientId: 1, sourceType: 'meeting', sourceId: 5 },
    );
    const { listReviewItems } = await importModule();
    const zero = await listReviewItems(1, { sourceId: 0 });
    expect(zero).toHaveLength(1);
    expect(zero[0].id).toBe(1);
    const five = await listReviewItems(1, { sourceId: 5 });
    expect(five).toHaveLength(1);
    expect(five[0].id).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getReviewItem
// ---------------------------------------------------------------------------

describe('getReviewItem', () => {
  it('returns null when no row matches', async () => {
    const { getReviewItem } = await importModule();
    const row = await getReviewItem(1, 999);
    expect(row).toBeNull();
  });

  it('returns the row matching id + clientId', async () => {
    state.brainAiReviewItems.push(
      { id: 5, clientId: 1, status: 'pending', proposedType: 'task' },
      { id: 5, clientId: 2, status: 'pending', proposedType: 'task' },
    );
    const { getReviewItem } = await importModule();
    const row = await getReviewItem(1, 5);
    expect(row).not.toBeNull();
    expect(row!.clientId).toBe(1);
  });

  it('does not return items from a different client', async () => {
    state.brainAiReviewItems.push({ id: 5, clientId: 99, status: 'pending' });
    const { getReviewItem } = await importModule();
    const row = await getReviewItem(1, 5);
    expect(row).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// approveReviewItem
// ---------------------------------------------------------------------------

describe('approveReviewItem', () => {
  it('throws when the item does not exist', async () => {
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 9999, actorId: 2 }),
    ).rejects.toThrow(/not found/i);
  });

  it('is idempotent when re-approving an already-approved item', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'approved',
      proposedType: 'task',
      sourceType: 'meeting',
      sourceId: 50,
      resultEntityType: 'brain_task',
      resultEntityId: 777,
      proposedPayload: { title: 'Old' },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res.resultEntityType).toBe('brain_task');
    expect(res.resultEntityId).toBe(777);
    // No new task should have been created and no audit log written.
    expect(state.brainTasks).toHaveLength(0);
    expect(state.brainAuditLogs).toHaveLength(0);
  });

  it('approves a task proposal and inserts a brain_tasks row inheriting meeting links', async () => {
    state.brainMeetings.push({
      id: 50,
      clientId: 1,
      companyId: 200,
      dealId: 300,
    });
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'task',
      sourceType: 'meeting',
      sourceId: 50,
      proposedPayload: {
        title: 'Follow up with Acme',
        description: 'Send pricing doc.',
        priority: 'high',
        dueDate: '2026-02-01',
        complianceFlag: true,
      },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 7 });
    expect(res.resultEntityType).toBe('brain_task');
    expect(typeof res.resultEntityId).toBe('number');
    expect(state.brainTasks).toHaveLength(1);
    const t = state.brainTasks[0];
    expect(t.title).toBe('Follow up with Acme');
    expect(t.priority).toBe('high');
    expect(t.complianceFlag).toBe(true);
    expect(t.companyId).toBe(200);
    expect(t.dealId).toBe(300);
    expect(t.source).toBe('meeting');
    expect(t.createdByAi).toBe(true);
    expect(t.meetingId).toBe(50);
    expect(state.brainAuditLogs).toHaveLength(1);
    expect(state.brainAuditLogs[0].action).toBe('review_item.approved');
  });

  it('approves a task with no source meeting and sets source=ai_suggestion', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'task',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { title: 'Standalone task' },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res.resultEntityType).toBe('brain_task');
    const t = state.brainTasks[0];
    expect(t.source).toBe('ai_suggestion');
    expect(t.meetingId).toBeNull();
    expect(t.companyId).toBeNull();
    expect(t.dealId).toBeNull();
    expect(t.priority).toBe('medium'); // default
  });

  it('falls back to "Untitled task" when title is empty', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'task',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { title: '' },
    });
    const { approveReviewItem } = await importModule();
    await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(state.brainTasks[0].title).toBe('Untitled task');
  });

  it('uses editedPayload when provided and marks status=edited', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'task',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { title: 'Original' },
    });
    const { approveReviewItem } = await importModule();
    await approveReviewItem({
      clientId: 1,
      itemId: 1,
      actorId: 2,
      editedPayload: { title: 'Edited title', priority: 'low' },
    });
    expect(state.brainTasks[0].title).toBe('Edited title');
    expect(state.brainTasks[0].priority).toBe('low');
    const item = state.brainAiReviewItems[0];
    expect(item.status).toBe('edited');
    expect(state.brainAuditLogs[0].action).toBe('review_item.edited_and_approved');
  });

  it('crm_contact_classify: updates the contact and records the result', async () => {
    state.crmContacts.push({
      id: 11,
      clientId: 1,
      status: 'lead',
      seniority: null,
      department: null,
      title: null,
    });
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_contact_classify',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: {
        contactId: 11,
        proposedStatus: 'qualified',
        proposedSeniority: 'senior',
        proposedDepartment: 'eng',
        proposedTitle: 'Director',
      },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res.resultEntityType).toBe('crm_contact');
    expect(res.resultEntityId).toBe(11);
    const c = state.crmContacts[0];
    expect(c.status).toBe('qualified');
    expect(c.seniority).toBe('senior');
    expect(c.department).toBe('eng');
    expect(c.title).toBe('Director');
  });

  it('crm_contact_classify: throws when contactId is missing', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_contact_classify',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: {},
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/missing contactId/i);
  });

  it('crm_contact_classify: throws when contact is not in client workspace', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_contact_classify',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { contactId: 999, proposedStatus: 'qualified' },
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/not found/i);
  });

  it('crm_company_link: links the company to the source meeting', async () => {
    state.crmCompanies.push({ id: 50, clientId: 1, name: 'Acme' });
    state.brainMeetings.push({ id: 70, clientId: 1, companyId: null, dealId: null });
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_company_link',
      sourceType: 'meeting',
      sourceId: 70,
      proposedPayload: { companyId: 50 },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res.resultEntityType).toBe('crm_company');
    expect(res.resultEntityId).toBe(50);
    expect(state.brainMeetings[0].companyId).toBe(50);
  });

  it('crm_company_link: throws when companyId is missing', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_company_link',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: {},
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/missing companyId/i);
  });

  it('crm_company_link: throws when company is not in client workspace', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_company_link',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { companyId: 999 },
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/not found/i);
  });

  it('crm_company_create: creates the company and links to meeting source', async () => {
    state.brainMeetings.push({ id: 70, clientId: 1, companyId: null, dealId: null });
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_company_create',
      sourceType: 'meeting',
      sourceId: 70,
      proposedPayload: {
        name: 'NewCo',
        domain: 'newco.test',
        website: 'https://newco.test',
        industry: 'saas',
      },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res.resultEntityType).toBe('crm_company');
    expect(state.crmCompanies).toHaveLength(1);
    const c = state.crmCompanies[0];
    expect(c.name).toBe('NewCo');
    expect(c.domain).toBe('newco.test');
    expect(c.website).toBe('https://newco.test');
    expect(c.industry).toBe('saas');
    expect(state.brainMeetings[0].companyId).toBe(c.id);
  });

  it('crm_company_create: throws when name is missing', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_company_create',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: {},
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/missing name/i);
  });

  it('crm_deal_link: links the deal to the source meeting', async () => {
    state.crmDeals.push({ id: 60, clientId: 1, title: 'Big Deal' });
    state.brainMeetings.push({ id: 70, clientId: 1, dealId: null });
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_deal_link',
      sourceType: 'meeting',
      sourceId: 70,
      proposedPayload: { dealId: 60 },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res.resultEntityType).toBe('crm_deal');
    expect(res.resultEntityId).toBe(60);
    expect(state.brainMeetings[0].dealId).toBe(60);
  });

  it('crm_deal_link: throws when dealId is missing', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_deal_link',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: {},
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/missing dealId/i);
  });

  it('crm_deal_link: throws when deal is not in client workspace', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_deal_link',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { dealId: 999 },
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/not found/i);
  });

  it('crm_deal_create: creates a deal and links it to the source meeting', async () => {
    state.crmPipelines.push({ id: 1, clientId: 1, isDefault: true });
    state.crmPipelineStages.push({ id: 11, pipelineId: 1, sortOrder: 1 });
    state.brainMeetings.push({ id: 70, clientId: 1, dealId: null });
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_deal_create',
      sourceType: 'meeting',
      sourceId: 70,
      proposedPayload: {
        title: 'New Opp',
        value: 5000,
        currency: 'EUR',
        priority: 'high',
        expectedCloseDate: '2026-03-01',
        contactId: 5,
        companyId: 6,
      },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 9 });
    expect(res.resultEntityType).toBe('crm_deal');
    expect(state.crmDeals).toHaveLength(1);
    const d = state.crmDeals[0];
    expect(d.title).toBe('New Opp');
    expect(d.value).toBe(5000);
    expect(d.currency).toBe('EUR');
    expect(d.priority).toBe('high');
    expect(d.pipelineId).toBe(1);
    expect(d.stageId).toBe(11);
    expect(d.contactId).toBe(5);
    expect(d.companyId).toBe(6);
    expect(d.ownerId).toBe(9);
    expect(state.brainMeetings[0].dealId).toBe(d.id);
  });

  it('crm_deal_create: defaults currency to USD and value to null for non-positive numbers', async () => {
    state.crmPipelines.push({ id: 1, clientId: 1, isDefault: true });
    state.crmPipelineStages.push({ id: 11, pipelineId: 1, sortOrder: 1 });
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_deal_create',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { title: 'No-value deal', value: 0 },
    });
    const { approveReviewItem } = await importModule();
    await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    const d = state.crmDeals[0];
    expect(d.value).toBeNull();
    expect(d.currency).toBe('USD');
    expect(d.priority).toBe('medium'); // default
  });

  it('crm_deal_create: throws when title is missing', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_deal_create',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: {},
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/missing title/i);
  });

  it('crm_deal_create: throws when no pipeline is configured', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_deal_create',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { title: 'Needs pipeline' },
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/no CRM pipeline/i);
  });

  it('crm_deal_create: throws when pipeline has no stages', async () => {
    state.crmPipelines.push({ id: 1, clientId: 1, isDefault: true });
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'crm_deal_create',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { title: 'Stageless' },
    });
    const { approveReviewItem } = await importModule();
    await expect(
      approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 }),
    ).rejects.toThrow(/no stages/i);
  });

  it('approves "note" type without inserting a target row', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'note',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: { text: 'just an FYI' },
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res.resultEntityType).toBeNull();
    expect(res.resultEntityId).toBeNull();
    expect(state.brainTasks).toHaveLength(0);
    expect(state.brainAuditLogs).toHaveLength(1);
  });

  it('approves unknown proposed types with null result (default branch)', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'some_future_type',
      sourceType: 'other',
      sourceId: 0,
      proposedPayload: {},
    });
    const { approveReviewItem } = await importModule();
    const res = await approveReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res.resultEntityType).toBeNull();
    expect(res.resultEntityId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rejectReviewItem
// ---------------------------------------------------------------------------

describe('rejectReviewItem', () => {
  it('returns null when the item does not exist', async () => {
    const { rejectReviewItem } = await importModule();
    const res = await rejectReviewItem({ clientId: 1, itemId: 999, actorId: 2 });
    expect(res).toBeNull();
    expect(state.auditCalls).toHaveLength(0);
  });

  it('returns null when item belongs to a different client', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 99,
      status: 'pending',
      proposedType: 'task',
    });
    const { rejectReviewItem } = await importModule();
    const res = await rejectReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect(res).toBeNull();
  });

  it('marks item as rejected and writes an audit log with reason', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'task',
    });
    const { rejectReviewItem } = await importModule();
    const res = await rejectReviewItem({
      clientId: 1,
      itemId: 1,
      actorId: 2,
      reason: 'duplicate',
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe('rejected');
    expect(res!.reviewedBy).toBe(2);
    expect(state.brainAiReviewItems[0].status).toBe('rejected');
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].action).toBe('review_item.rejected');
    expect((state.auditCalls[0].metadata as { reason: string }).reason).toBe('duplicate');
  });

  it('writes a null reason when none is provided', async () => {
    state.brainAiReviewItems.push({
      id: 1,
      clientId: 1,
      status: 'pending',
      proposedType: 'task',
    });
    const { rejectReviewItem } = await importModule();
    await rejectReviewItem({ clientId: 1, itemId: 1, actorId: 2 });
    expect((state.auditCalls[0].metadata as { reason: string | null }).reason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pendingReviewCountForMeeting
// ---------------------------------------------------------------------------

describe('pendingReviewCountForMeeting', () => {
  it('returns 0 when no items match', async () => {
    const { pendingReviewCountForMeeting } = await importModule();
    expect(await pendingReviewCountForMeeting(1, 10)).toBe(0);
  });

  it('counts only pending items for the given client+meeting', async () => {
    state.brainAiReviewItems.push(
      { id: 1, clientId: 1, sourceType: 'meeting', sourceId: 10, status: 'pending' },
      { id: 2, clientId: 1, sourceType: 'meeting', sourceId: 10, status: 'pending' },
      { id: 3, clientId: 1, sourceType: 'meeting', sourceId: 10, status: 'approved' },
      { id: 4, clientId: 1, sourceType: 'meeting', sourceId: 11, status: 'pending' },
      { id: 5, clientId: 2, sourceType: 'meeting', sourceId: 10, status: 'pending' },
      { id: 6, clientId: 1, sourceType: 'note', sourceId: 10, status: 'pending' },
    );
    const { pendingReviewCountForMeeting } = await importModule();
    expect(await pendingReviewCountForMeeting(1, 10)).toBe(2);
  });
});
