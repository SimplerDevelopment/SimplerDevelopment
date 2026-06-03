// @vitest-environment node
/**
 * Unit tests for lib/brain/relationships.ts.
 *
 * The module is entirely DB-coupled (no exported pure helpers), so the test
 * file mocks `@/lib/db`, `@/lib/db/schema`, `drizzle-orm`, and `./audit`. The
 * mock implements a chainable query builder backed by an in-memory state that
 * each test can seed and then read back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Schema markers so the mock can route by table identity.
const TABLES = {
  brainRelationshipOverlays: { __table: 'brainRelationshipOverlays' },
  brainMeetings: { __table: 'brainMeetings' },
  brainTasks: { __table: 'brainTasks' },
  crmCompanies: { __table: 'crmCompanies' },
  crmContacts: { __table: 'crmContacts' },
  crmDeals: { __table: 'crmDeals' },
  brainAuditLogs: { __table: 'brainAuditLogs' },
};

interface MockState {
  brainRelationshipOverlays: Array<Record<string, unknown>>;
  brainMeetings: Array<Record<string, unknown>>;
  brainTasks: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmContacts: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  brainAuditLogs: Array<Record<string, unknown>>;
  /** Forced result for the grouped task-count query, when set. */
  forcedTaskCounts: Array<{ companyId: number | null; dealId: number | null; count: number }> | null;
  /** Forced result for the ILIKE suggestion queries, indexed by table. */
  forcedIlike: Partial<Record<'crmCompanies' | 'crmDeals', Array<Record<string, unknown>>>>;
  auditCalls: Array<Record<string, unknown>>;
}

const state: MockState = {
  brainRelationshipOverlays: [],
  brainMeetings: [],
  brainTasks: [],
  crmCompanies: [],
  crmContacts: [],
  crmDeals: [],
  brainAuditLogs: [],
  forcedTaskCounts: null,
  forcedIlike: {},
  auditCalls: [],
};

vi.mock('@/lib/db/schema', () => {
  // Re-export each table with a Proxy so any column access (e.g. crmCompanies.name)
  // returns a typed marker the predicate builders can inspect.
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
    brainRelationshipOverlays: wrap('brainRelationshipOverlays'),
    brainMeetings: wrap('brainMeetings'),
    brainTasks: wrap('brainTasks'),
    crmCompanies: wrap('crmCompanies'),
    crmContacts: wrap('crmContacts'),
    crmDeals: wrap('crmDeals'),
    brainAuditLogs: wrap('brainAuditLogs'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {
      // template strings called as a function — drizzle exposes both forms.
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

// Predicate evaluator — walks the {op, …} tree the mocked drizzle-orm builds
// and returns a boolean for each candidate row. Only the operators this
// source file actually uses need to be supported.
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
    case 'sql':
      // The source uses `sql\`false\`` as an OR placeholder when an id list is empty,
      // and `sql\`${col} ILIKE ${q}\`` for fuzzy match. We can't simulate the literal,
      // so we treat any sql fragment as "don't filter" — tests use forcedIlike to
      // control what suggestCrmTargets returns.
      return true;
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

let idCounter = 1;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
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
      groupBy() {
        // Special-case the brainTasks grouped-count query so we can return the
        // forced fixture.
        if (activeTable === 'brainTasks' && state.forcedTaskCounts) {
          return Promise.resolve(state.forcedTaskCounts);
        }
        // Default: just run the predicate, return rows projected.
        return runQuery();
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
      // ILIKE override for suggestCrmTargets path.
      if (
        (activeTable === 'crmCompanies' || activeTable === 'crmDeals') &&
        state.forcedIlike[activeTable as 'crmCompanies' | 'crmDeals'] &&
        // Heuristic: ILIKE queries are the suggestion ones; they project specific cols.
        projection &&
        Object.keys(projection).length >= 2
      ) {
        const rows = state.forcedIlike[activeTable as 'crmCompanies' | 'crmDeals']!;
        let out = rows.map((r) => projectRow(r, projection));
        if (limit !== null) out = out.slice(0, limit);
        return Promise.resolve(out);
      }

      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

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
          returning() {
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
              returning() {
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

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const all = tableArray(table.__table);
        const matched: Array<Record<string, unknown>> = [];
        const remaining: Array<Record<string, unknown>> = [];
        for (const r of all) {
          if (evalPredicate(filter, r)) matched.push(r);
          else remaining.push(r);
        }
        all.length = 0;
        all.push(...remaining);
        return {
          returning() {
            return Promise.resolve(matched.map((r) => ({ id: r.id })));
          },
        };
      },
    };
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

beforeEach(() => {
  state.brainRelationshipOverlays.length = 0;
  state.brainMeetings.length = 0;
  state.brainTasks.length = 0;
  state.crmCompanies.length = 0;
  state.crmContacts.length = 0;
  state.crmDeals.length = 0;
  state.brainAuditLogs.length = 0;
  state.auditCalls.length = 0;
  state.forcedTaskCounts = null;
  state.forcedIlike = {};
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/brain/relationships');
}

// ---------------------------------------------------------------------------
// listRelationships
// ---------------------------------------------------------------------------

describe('listRelationships', () => {
  it('returns [] when no overlays exist for the client', async () => {
    const { listRelationships } = await importModule();
    const rows = await listRelationships(1);
    expect(rows).toEqual([]);
  });

  it('hydrates company overlay with the underlying company name', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme Inc', industry: 'tech', domain: 'acme.test' });
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 10,
      dealId: null,
      priority: 'high',
      status: 'active',
      relationshipType: 'partner',
      lastTouchAt: null,
      staleAfterDays: null,
    });
    const { listRelationships } = await importModule();
    const rows = await listRelationships(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].underlying).toEqual({ type: 'company', id: 10, name: 'Acme Inc' });
    expect(rows[0].openTaskCount).toBe(0);
    expect(rows[0].isStale).toBe(false);
  });

  it('hydrates deal overlay including secondaryName from the linked company', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme Inc' });
    state.crmDeals.push({ id: 99, clientId: 1, title: 'Q3 expansion', companyId: 10, value: 5000, status: 'open' });
    state.brainRelationshipOverlays.push({
      id: 2,
      clientId: 1,
      companyId: null,
      dealId: 99,
      priority: 'medium',
      status: 'active',
      relationshipType: 'opportunity',
      lastTouchAt: null,
      staleAfterDays: null,
    });
    const { listRelationships } = await importModule();
    const rows = await listRelationships(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].underlying).toEqual({
      type: 'deal',
      id: 99,
      name: 'Q3 expansion',
      secondaryName: 'Acme Inc',
    });
  });

  it('filters out overlays whose underlying CRM row is missing (dangling FK)', async () => {
    // Overlay references companyId=10, but no company row exists.
    state.brainRelationshipOverlays.push({
      id: 3,
      clientId: 1,
      companyId: 10,
      dealId: null,
      priority: 'low',
      status: 'active',
      lastTouchAt: null,
      staleAfterDays: null,
    });
    const { listRelationships } = await importModule();
    const rows = await listRelationships(1);
    expect(rows).toEqual([]);
  });

  it('marks rows stale when lastTouchAt + staleAfterDays has passed', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Stale Co' });
    state.brainRelationshipOverlays.push({
      id: 4,
      clientId: 1,
      companyId: 10,
      dealId: null,
      priority: 'high',
      status: 'active',
      lastTouchAt: tenDaysAgo,
      staleAfterDays: 5,
    });
    const { listRelationships } = await importModule();
    const rows = await listRelationships(1);
    expect(rows[0].isStale).toBe(true);
  });

  it('respects staleOnly filter — only returns stale rows', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Stale Co' }, { id: 11, clientId: 1, name: 'Fresh Co' });
    state.brainRelationshipOverlays.push(
      {
        id: 5,
        clientId: 1,
        companyId: 10,
        dealId: null,
        priority: 'high',
        status: 'active',
        lastTouchAt: tenDaysAgo,
        staleAfterDays: 5,
      },
      {
        id: 6,
        clientId: 1,
        companyId: 11,
        dealId: null,
        priority: 'medium',
        status: 'active',
        lastTouchAt: new Date(),
        staleAfterDays: 30,
      },
    );
    const { listRelationships } = await importModule();
    const rows = await listRelationships(1, { staleOnly: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].underlying.id).toBe(10);
  });

  it('attaches open task counts from the grouped-count query', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Busy Co' });
    state.brainRelationshipOverlays.push({
      id: 7,
      clientId: 1,
      companyId: 10,
      dealId: null,
      priority: 'high',
      status: 'active',
      lastTouchAt: null,
      staleAfterDays: null,
    });
    state.forcedTaskCounts = [{ companyId: 10, dealId: null, count: 4 }];
    const { listRelationships } = await importModule();
    const rows = await listRelationships(1);
    expect(rows[0].openTaskCount).toBe(4);
  });

  it('passes type/ownerId/priority/status options without crashing', async () => {
    const { listRelationships } = await importModule();
    const rows = await listRelationships(1, {
      type: 'partner',
      ownerId: 5,
      priority: 'high',
      status: 'active',
    });
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRelationship
// ---------------------------------------------------------------------------

describe('getRelationship', () => {
  it('returns null when overlay is missing', async () => {
    const { getRelationship } = await importModule();
    const res = await getRelationship(1, 999);
    expect(res).toBeNull();
  });

  it('returns null when overlay references a missing company', async () => {
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 50,
      dealId: null,
    });
    const { getRelationship } = await importModule();
    const res = await getRelationship(1, 1);
    expect(res).toBeNull();
  });

  it('hydrates a company-backed relationship with contacts/meetings/tasks', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme', industry: 'tech', domain: 'acme.test' });
    state.crmContacts.push({
      id: 20,
      clientId: 1,
      companyId: 10,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@acme.test',
      title: 'CTO',
    });
    state.brainMeetings.push({
      id: 30,
      clientId: 1,
      companyId: 10,
      dealId: null,
      title: 'Kickoff',
      meetingDate: new Date('2026-01-01'),
      status: 'scheduled',
      createdAt: new Date('2025-12-15'),
    });
    state.brainTasks.push({
      id: 40,
      clientId: 1,
      companyId: 10,
      dealId: null,
      title: 'Send NDA',
      status: 'open',
      priority: 'high',
      dueDate: null,
      createdByAi: false,
      createdAt: new Date(),
    });
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 10,
      dealId: null,
      priority: 'high',
      status: 'active',
    });

    const { getRelationship } = await importModule();
    const res = await getRelationship(1, 1);
    expect(res).not.toBeNull();
    expect(res!.underlying).toMatchObject({ type: 'company', id: 10, name: 'Acme', industry: 'tech', domain: 'acme.test' });
    expect(res!.contacts).toHaveLength(1);
    expect(res!.contacts[0].email).toBe('ada@acme.test');
    expect(res!.meetings).toHaveLength(1);
    expect(res!.tasks).toHaveLength(1);
  });

  it('hydrates a deal-backed relationship with secondaryName from the linked company', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    state.crmDeals.push({ id: 50, clientId: 1, title: 'Big Deal', companyId: 10, value: 9000, status: 'won' });
    state.brainRelationshipOverlays.push({
      id: 2,
      clientId: 1,
      companyId: null,
      dealId: 50,
      priority: 'medium',
      status: 'active',
    });
    const { getRelationship } = await importModule();
    const res = await getRelationship(1, 2);
    expect(res).not.toBeNull();
    expect(res!.underlying).toMatchObject({
      type: 'deal',
      id: 50,
      name: 'Big Deal',
      secondaryName: 'Acme',
      value: 9000,
      stage: 'won',
    });
  });

  it('returns null if a deal overlay points at a missing deal', async () => {
    state.brainRelationshipOverlays.push({
      id: 3,
      clientId: 1,
      companyId: null,
      dealId: 9999,
    });
    const { getRelationship } = await importModule();
    const res = await getRelationship(1, 3);
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createOverlay
// ---------------------------------------------------------------------------

describe('createOverlay', () => {
  it('throws when neither companyId nor dealId is provided', async () => {
    const { createOverlay } = await importModule();
    await expect(createOverlay({ clientId: 1, actorId: 2 })).rejects.toThrow(/exactly one/i);
  });

  it('throws when both companyId and dealId are provided', async () => {
    const { createOverlay } = await importModule();
    await expect(
      createOverlay({ clientId: 1, actorId: 2, companyId: 1, dealId: 2 }),
    ).rejects.toThrow(/exactly one/i);
  });

  it('throws when the company is not in the workspace', async () => {
    const { createOverlay } = await importModule();
    await expect(
      createOverlay({ clientId: 1, actorId: 2, companyId: 999 }),
    ).rejects.toThrow(/company not found/i);
  });

  it('throws when the deal is not in the workspace', async () => {
    const { createOverlay } = await importModule();
    await expect(
      createOverlay({ clientId: 1, actorId: 2, dealId: 999 }),
    ).rejects.toThrow(/deal not found/i);
  });

  it('creates a new overlay with sane defaults and logs an audit entry', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    const { createOverlay } = await importModule();
    const created = await createOverlay({ clientId: 1, actorId: 2, companyId: 10 });
    expect(created.companyId).toBe(10);
    expect(created.relationshipType).toBe('generic');
    expect(created.priority).toBe('medium');
    expect(created.status).toBe('active');
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0]).toMatchObject({
      action: 'relationship.created',
      entityType: 'brain_relationship_overlay',
    });
  });

  it('is idempotent — re-creating against the same target updates instead', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    state.brainRelationshipOverlays.push({
      id: 77,
      clientId: 1,
      companyId: 10,
      dealId: null,
      priority: 'low',
      status: 'active',
      relationshipType: 'generic',
    });
    const { createOverlay } = await importModule();
    const result = await createOverlay({
      clientId: 1,
      actorId: 2,
      companyId: 10,
      priority: 'high',
      summary: 'Promoted',
    });
    expect(result.id).toBe(77);
    expect(result.priority).toBe('high');
    expect(result.summary).toBe('Promoted');
    // audit log records the update path
    expect(state.auditCalls.some((a) => a.action === 'relationship.updated')).toBe(true);
  });

  it('creates against a deal when only dealId is supplied', async () => {
    state.crmDeals.push({ id: 50, clientId: 1, title: 'Pilot' });
    const { createOverlay } = await importModule();
    const created = await createOverlay({
      clientId: 1,
      actorId: 2,
      dealId: 50,
      relationshipType: 'pilot',
    });
    expect(created.dealId).toBe(50);
    expect(created.relationshipType).toBe('pilot');
  });
});

// ---------------------------------------------------------------------------
// updateOverlay
// ---------------------------------------------------------------------------

describe('updateOverlay', () => {
  it('throws when the overlay does not exist', async () => {
    const { updateOverlay } = await importModule();
    await expect(updateOverlay(1, 999, 2, { priority: 'high' })).rejects.toThrow(/not found/i);
  });

  it('applies only the provided patch fields and logs the changed-fields audit', async () => {
    state.brainRelationshipOverlays.push({
      id: 10,
      clientId: 1,
      companyId: 5,
      dealId: null,
      priority: 'low',
      status: 'active',
      summary: 'old',
      relationshipType: 'generic',
      serviceLines: [],
      complianceFlags: [],
    });
    const { updateOverlay } = await importModule();
    const updated = await updateOverlay(1, 10, 2, {
      priority: 'high',
      summary: 'new',
      serviceLines: ['design'],
    });
    expect(updated.priority).toBe('high');
    expect(updated.summary).toBe('new');
    expect(updated.serviceLines).toEqual(['design']);
    const audit = state.auditCalls.find((a) => a.action === 'relationship.updated');
    expect(audit).toBeDefined();
    const meta = audit!.metadata as { changedFields: string[] };
    expect(meta.changedFields).toEqual(expect.arrayContaining(['priority', 'summary', 'serviceLines']));
    expect(meta.changedFields).not.toContain('updatedAt');
  });

  it('records an empty changedFields list when patch carries no fields', async () => {
    state.brainRelationshipOverlays.push({
      id: 11,
      clientId: 1,
      companyId: 5,
      dealId: null,
      priority: 'low',
      status: 'active',
    });
    const { updateOverlay } = await importModule();
    await updateOverlay(1, 11, 2, {});
    const audit = state.auditCalls.find((a) => a.action === 'relationship.updated');
    expect(audit).toBeDefined();
    expect((audit!.metadata as { changedFields: string[] }).changedFields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteOverlay
// ---------------------------------------------------------------------------

describe('deleteOverlay', () => {
  it('returns false when there is nothing to delete', async () => {
    const { deleteOverlay } = await importModule();
    const ok = await deleteOverlay(1, 999, 2);
    expect(ok).toBe(false);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('deletes the overlay and writes an audit entry', async () => {
    state.brainRelationshipOverlays.push({
      id: 20,
      clientId: 1,
      companyId: 5,
      dealId: null,
    });
    const { deleteOverlay } = await importModule();
    const ok = await deleteOverlay(1, 20, 2);
    expect(ok).toBe(true);
    expect(state.brainRelationshipOverlays).toHaveLength(0);
    expect(state.auditCalls[0]).toMatchObject({
      action: 'relationship.deleted',
      entityType: 'brain_relationship_overlay',
      entityId: 20,
    });
  });
});

// ---------------------------------------------------------------------------
// suggestCrmTargets
// ---------------------------------------------------------------------------

describe('suggestCrmTargets', () => {
  it('returns empty arrays when nothing matches', async () => {
    state.forcedIlike = { crmCompanies: [], crmDeals: [] };
    const { suggestCrmTargets } = await importModule();
    const res = await suggestCrmTargets(1, 'acme');
    expect(res.companies).toEqual([]);
    expect(res.deals).toEqual([]);
  });

  it('marks companies/deals that already have a Brain overlay', async () => {
    state.forcedIlike = {
      crmCompanies: [
        { id: 1, name: 'Acme', industry: 'tech' },
        { id: 2, name: 'Beta', industry: null },
      ],
      crmDeals: [
        { id: 100, title: 'Pilot', companyId: 1 },
        { id: 101, title: 'Renewal', companyId: null },
      ],
    };
    // Existing overlays — company 1 has one, deal 101 has one.
    state.brainRelationshipOverlays.push(
      { clientId: 1, companyId: 1, dealId: null },
      { clientId: 1, companyId: null, dealId: 101 },
    );
    // Map company 1 → "Acme" for deal secondary names.
    state.crmCompanies.push({ id: 1, clientId: 1, name: 'Acme' });

    const { suggestCrmTargets } = await importModule();
    const res = await suggestCrmTargets(1, 'a');

    expect(res.companies).toEqual([
      { id: 1, name: 'Acme', industry: 'tech', hasOverlay: true },
      { id: 2, name: 'Beta', industry: null, hasOverlay: false },
    ]);
    expect(res.deals).toEqual([
      { id: 100, title: 'Pilot', companyName: 'Acme', hasOverlay: false },
      { id: 101, title: 'Renewal', companyName: null, hasOverlay: true },
    ]);
  });

  it('escapes ILIKE metacharacters in the query', async () => {
    // Just exercise the path with metacharacters present — the mock can't see
    // the actual SQL string, but the call should not throw and should return
    // the forced rows.
    state.forcedIlike = { crmCompanies: [{ id: 5, name: '50%_Off Co', industry: null }], crmDeals: [] };
    const { suggestCrmTargets } = await importModule();
    const res = await suggestCrmTargets(1, '50%_off');
    expect(res.companies[0].name).toBe('50%_Off Co');
  });

  it('honors the custom limit argument', async () => {
    state.forcedIlike = {
      crmCompanies: [
        { id: 1, name: 'A', industry: null },
        { id: 2, name: 'B', industry: null },
        { id: 3, name: 'C', industry: null },
      ],
      crmDeals: [],
    };
    const { suggestCrmTargets } = await importModule();
    const res = await suggestCrmTargets(1, 'x', 2);
    expect(res.companies).toHaveLength(2);
  });
});
