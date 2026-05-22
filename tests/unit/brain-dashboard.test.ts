// @vitest-environment node
/**
 * Unit tests for lib/brain/dashboard.ts.
 *
 * The module is a single read-only `getDashboardSummary` function that fans
 * out a handful of drizzle queries (via `db.select(...)`) plus two `db.execute`
 * raw-SQL aggregates, then stitches the results together. The test file mocks
 * `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm` so we can seed in-memory
 * fixtures and assert on the shape of the returned summary.
 */
import { describe, it, expect, beforeEach } from 'vitest';

interface MockState {
  brainMeetings: Array<Record<string, unknown>>;
  brainTasks: Array<Record<string, unknown>>;
  brainRelationshipOverlays: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  /** Forced result for the relationship overlay grouped task-count query. */
  forcedOverlayTaskCounts:
    | Array<{ companyId: number | null; dealId: number | null; cnt: number }>
    | null;
  /** Forced result for the brain_ai_review_items pending-per-meeting query. */
  forcedPendingReviewRows: Array<{ source_id: number; cnt: number }>;
  /** Forced result for the counts aggregate query. */
  forcedCountsRow: Array<{
    pending_review: number;
    open_tasks: number;
    ai_tasks: number;
    relationships: number;
  }>;
}

const state: MockState = {
  brainMeetings: [],
  brainTasks: [],
  brainRelationshipOverlays: [],
  crmCompanies: [],
  crmDeals: [],
  forcedOverlayTaskCounts: null,
  forcedPendingReviewRows: [],
  forcedCountsRow: [{ pending_review: 0, open_tasks: 0, ai_tasks: 0, relationships: 0 }],
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
  return {
    brainMeetings: wrap('brainMeetings'),
    brainTasks: wrap('brainTasks'),
    brainRelationshipOverlays: wrap('brainRelationshipOverlays'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  lt: (a: unknown, b: unknown) => ({ op: 'lt', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {},
  ),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    list?: unknown[];
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'lt': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const val = row[col.__col];
      if (val === null || val === undefined) return false;
      // Both sides are Date (overdue uses lt(brainTasks.dueDate, now)).
      const lhs = val instanceof Date ? val.getTime() : (val as number);
      const rhs = f.b instanceof Date ? (f.b as Date).getTime() : (f.b as number);
      return lhs < rhs;
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
      // Source uses sql`${col} IS NOT NULL` and sql`${col} >= ${nowIso}` for
      // the upcoming-tasks predicate, plus sql`false` placeholders. We can't
      // inspect the literal — treat sql fragments as "match" so the rest of
      // the AND still gates which rows come back. Tests for "upcoming" seed
      // rows that already satisfy these conditions.
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
    const r = ref as { __col?: string; op?: string } | undefined;
    if (r?.__col) out[alias] = row[r.__col];
    else out[alias] = undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    let grouped = false;

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      // Overlay-task-count grouped query: trigger when source called .groupBy
      // on brainTasks and the projection includes `cnt`.
      if (
        grouped &&
        activeTable === 'brainTasks' &&
        projection &&
        'cnt' in projection &&
        state.forcedOverlayTaskCounts
      ) {
        return Promise.resolve(
          state.forcedOverlayTaskCounts.map((r) => ({
            companyId: r.companyId,
            dealId: r.dealId,
            cnt: r.cnt,
          })),
        );
      }
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
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
      groupBy() {
        grouped = true;
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
      execute(query: { strings?: TemplateStringsArray }) {
        // Inspect the SQL template to route between the two raw queries:
        //  - pending review items per meeting (single FROM brain_ai_review_items)
        //  - counts aggregate (four nested SELECTs)
        const joined = (query?.strings ?? []).join(' ');
        if (joined.includes('brain_ai_review_items') && joined.includes('GROUP BY')) {
          return Promise.resolve(state.forcedPendingReviewRows);
        }
        if (joined.includes('AS pending_review')) {
          return Promise.resolve(state.forcedCountsRow);
        }
        return Promise.resolve([]);
      },
    },
  };
});

beforeEach(() => {
  state.brainMeetings.length = 0;
  state.brainTasks.length = 0;
  state.brainRelationshipOverlays.length = 0;
  state.crmCompanies.length = 0;
  state.crmDeals.length = 0;
  state.forcedOverlayTaskCounts = null;
  state.forcedPendingReviewRows = [];
  state.forcedCountsRow = [
    { pending_review: 0, open_tasks: 0, ai_tasks: 0, relationships: 0 },
  ];
});

async function importModule() {
  return await import('@/lib/brain/dashboard');
}

// ---------------------------------------------------------------------------
// getDashboardSummary — empty state
// ---------------------------------------------------------------------------

describe('getDashboardSummary — empty state', () => {
  it('returns a fully-zeroed summary when nothing exists for the client', async () => {
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res).toEqual({
      needsReviewMeetings: [],
      overdueTasks: [],
      blockedTasks: [],
      upcomingTasks: [],
      staleProspects: [],
      priorityRelationships: [],
      recentMeetings: [],
      counts: {
        pendingReviewItems: 0,
        openTasks: 0,
        aiCreatedTasks: 0,
        relationships: 0,
      },
    });
  });

  it('falls back to zero counts when the counts row is empty', async () => {
    state.forcedCountsRow = [];
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.counts).toEqual({
      pendingReviewItems: 0,
      openTasks: 0,
      aiCreatedTasks: 0,
      relationships: 0,
    });
  });

  it('propagates the counts aggregate row into counts.*', async () => {
    state.forcedCountsRow = [
      { pending_review: 3, open_tasks: 7, ai_tasks: 4, relationships: 5 },
    ];
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.counts).toEqual({
      pendingReviewItems: 3,
      openTasks: 7,
      aiCreatedTasks: 4,
      relationships: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// needs-review and recent meetings
// ---------------------------------------------------------------------------

describe('getDashboardSummary — meetings', () => {
  it('lists needs_review meetings with serialized dates and pending counts', async () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z');
    const meetingDate = new Date('2026-01-20T09:00:00.000Z');
    state.brainMeetings.push({
      id: 100,
      clientId: 1,
      title: 'Discovery call',
      status: 'needs_review',
      createdAt,
      meetingDate,
    });
    state.forcedPendingReviewRows = [{ source_id: 100, cnt: 4 }];
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.needsReviewMeetings).toEqual([
      {
        id: 100,
        title: 'Discovery call',
        createdAt: createdAt.toISOString(),
        meetingDate: meetingDate.toISOString(),
        pendingReviewItems: 4,
      },
    ]);
  });

  it('defaults pendingReviewItems to 0 when no count exists for that meeting', async () => {
    const createdAt = new Date('2026-02-01T00:00:00.000Z');
    state.brainMeetings.push({
      id: 200,
      clientId: 1,
      title: 'Untagged meeting',
      status: 'needs_review',
      createdAt,
      meetingDate: null,
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.needsReviewMeetings[0].pendingReviewItems).toBe(0);
    expect(res.needsReviewMeetings[0].meetingDate).toBeNull();
  });

  it('excludes other clients from needs-review and recent meetings', async () => {
    const createdAt = new Date('2026-03-01T00:00:00.000Z');
    state.brainMeetings.push(
      { id: 1, clientId: 1, title: 'Mine', status: 'needs_review', createdAt, meetingDate: null },
      { id: 2, clientId: 2, title: 'Theirs', status: 'needs_review', createdAt, meetingDate: null },
    );
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.needsReviewMeetings.map((m) => m.id)).toEqual([1]);
    expect(res.recentMeetings.map((m) => m.id)).toEqual([1]);
  });

  it('includes meetings of any status in recentMeetings with status passed through', async () => {
    const createdAt = new Date('2026-04-01T00:00:00.000Z');
    state.brainMeetings.push({
      id: 7,
      clientId: 1,
      title: 'Wrap-up',
      status: 'completed',
      createdAt,
      meetingDate: null,
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.recentMeetings).toEqual([
      { id: 7, title: 'Wrap-up', status: 'completed', createdAt: createdAt.toISOString() },
    ]);
    // needs-review pulls a different slice — should not include 'completed'.
    expect(res.needsReviewMeetings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tasks: overdue / blocked / upcoming
// ---------------------------------------------------------------------------

describe('getDashboardSummary — tasks', () => {
  it('returns overdue tasks whose due date is in the past', async () => {
    const past = new Date(Date.now() - 86400000);
    state.brainTasks.push({
      id: 1,
      clientId: 1,
      title: 'Late thing',
      status: 'open',
      priority: 'high',
      dueDate: past,
      createdByAi: false,
      meetingId: null,
      companyId: null,
      dealId: null,
      createdAt: new Date(),
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.overdueTasks).toHaveLength(1);
    expect(res.overdueTasks[0]).toMatchObject({
      id: 1,
      title: 'Late thing',
      status: 'open',
      priority: 'high',
      createdByAi: false,
      meetingId: null,
      companyId: null,
      dealId: null,
      linkedName: null,
    });
    expect(res.overdueTasks[0].dueDate).toBe(past.toISOString());
  });

  it('excludes done tasks and tasks with no due date from overdue', async () => {
    const past = new Date(Date.now() - 86400000);
    state.brainTasks.push(
      {
        id: 1,
        clientId: 1,
        title: 'Done already',
        status: 'done',
        priority: 'low',
        dueDate: past,
        createdByAi: false,
        meetingId: null,
        companyId: null,
        dealId: null,
        createdAt: new Date(),
      },
      {
        id: 2,
        clientId: 1,
        title: 'No due date',
        status: 'open',
        priority: 'low',
        dueDate: null,
        createdByAi: false,
        meetingId: null,
        companyId: null,
        dealId: null,
        createdAt: new Date(),
      },
    );
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.overdueTasks).toHaveLength(0);
  });

  it('returns blocked tasks', async () => {
    state.brainTasks.push({
      id: 11,
      clientId: 1,
      title: 'Stuck',
      status: 'blocked',
      priority: 'medium',
      dueDate: null,
      createdByAi: true,
      meetingId: 5,
      companyId: null,
      dealId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.blockedTasks).toHaveLength(1);
    expect(res.blockedTasks[0]).toMatchObject({
      id: 11,
      status: 'blocked',
      createdByAi: true,
      meetingId: 5,
      dueDate: null,
    });
  });

  it('resolves linkedName from company when companyId is set', async () => {
    const past = new Date(Date.now() - 86400000);
    state.crmCompanies.push({ id: 50, clientId: 1, name: 'Globex' });
    state.brainTasks.push({
      id: 1,
      clientId: 1,
      title: 'Follow up',
      status: 'open',
      priority: 'high',
      dueDate: past,
      createdByAi: false,
      meetingId: null,
      companyId: 50,
      dealId: null,
      createdAt: new Date(),
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.overdueTasks[0].linkedName).toBe('Globex');
  });

  it('resolves linkedName from deal title when dealId is set and no company', async () => {
    const past = new Date(Date.now() - 86400000);
    state.crmDeals.push({ id: 77, clientId: 1, title: 'Big Opportunity' });
    state.brainTasks.push({
      id: 1,
      clientId: 1,
      title: 'Send proposal',
      status: 'in_progress',
      priority: 'urgent',
      dueDate: past,
      createdByAi: false,
      meetingId: null,
      companyId: null,
      dealId: 77,
      createdAt: new Date(),
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.overdueTasks[0].linkedName).toBe('Big Opportunity');
  });

  it('returns null linkedName when company lookup misses', async () => {
    const past = new Date(Date.now() - 86400000);
    state.brainTasks.push({
      id: 1,
      clientId: 1,
      title: 'Orphan',
      status: 'open',
      priority: 'low',
      dueDate: past,
      createdByAi: false,
      meetingId: null,
      companyId: 999, // no matching company seeded
      dealId: null,
      createdAt: new Date(),
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.overdueTasks[0].linkedName).toBeNull();
  });

  it('returns upcoming tasks (status=open with a future due date)', async () => {
    const future = new Date(Date.now() + 5 * 86400000);
    state.brainTasks.push({
      id: 30,
      clientId: 1,
      title: 'Soon',
      status: 'open',
      priority: 'medium',
      dueDate: future,
      createdByAi: false,
      meetingId: null,
      companyId: null,
      dealId: null,
      createdAt: new Date(),
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.upcomingTasks).toHaveLength(1);
    expect(res.upcomingTasks[0].id).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Relationship overlays — stale prospects + priority
// ---------------------------------------------------------------------------

describe('getDashboardSummary — relationships', () => {
  it('decorates a company-backed overlay with name + open task count', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme Inc' });
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 10,
      dealId: null,
      status: 'active',
      relationshipType: 'partner',
      priority: 'high',
      lastTouchAt: null,
      nextReviewAt: null,
      staleAfterDays: null,
    });
    state.forcedOverlayTaskCounts = [{ companyId: 10, dealId: null, cnt: 3 }];
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.priorityRelationships).toHaveLength(1);
    expect(res.priorityRelationships[0]).toMatchObject({
      overlayId: 1,
      name: 'Acme Inc',
      underlying: 'company',
      type: 'partner',
      priority: 'high',
      openTaskCount: 3,
      staleAfterDays: null,
      daysSinceTouch: null,
    });
  });

  it('decorates a deal-backed overlay using the deal title as name', async () => {
    state.crmDeals.push({ id: 50, clientId: 1, title: 'Pilot Program' });
    state.brainRelationshipOverlays.push({
      id: 2,
      clientId: 1,
      companyId: null,
      dealId: 50,
      status: 'active',
      relationshipType: 'opportunity',
      priority: 'critical',
      lastTouchAt: null,
      nextReviewAt: null,
      staleAfterDays: null,
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.priorityRelationships).toHaveLength(1);
    expect(res.priorityRelationships[0]).toMatchObject({
      overlayId: 2,
      name: 'Pilot Program',
      underlying: 'deal',
      priority: 'critical',
    });
  });

  it('drops overlays whose underlying CRM row is missing', async () => {
    state.brainRelationshipOverlays.push({
      id: 3,
      clientId: 1,
      companyId: 999, // missing
      dealId: null,
      status: 'active',
      relationshipType: 'partner',
      priority: 'high',
      lastTouchAt: null,
      nextReviewAt: null,
      staleAfterDays: null,
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.priorityRelationships).toEqual([]);
    expect(res.staleProspects).toEqual([]);
  });

  it('drops overlays where neither companyId nor dealId is set', async () => {
    state.brainRelationshipOverlays.push({
      id: 4,
      clientId: 1,
      companyId: null,
      dealId: null,
      status: 'active',
      relationshipType: 'note',
      priority: 'critical',
      lastTouchAt: null,
      nextReviewAt: null,
      staleAfterDays: null,
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.priorityRelationships).toEqual([]);
  });

  it('classifies an overlay as stale when daysSinceTouch > staleAfterDays', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Stale Co' });
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 10,
      dealId: null,
      status: 'active',
      relationshipType: 'prospect',
      priority: 'medium', // not "high"/"critical" — so only stale, not priority
      lastTouchAt: tenDaysAgo,
      nextReviewAt: null,
      staleAfterDays: 5,
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.staleProspects).toHaveLength(1);
    expect(res.staleProspects[0].name).toBe('Stale Co');
    expect(res.staleProspects[0].daysSinceTouch).toBeGreaterThanOrEqual(10);
    expect(res.priorityRelationships).toEqual([]);
  });

  it('sorts stale prospects by daysSinceTouch desc and caps at 5', async () => {
    state.crmCompanies.push(
      { id: 1, clientId: 1, name: 'C1' },
      { id: 2, clientId: 1, name: 'C2' },
      { id: 3, clientId: 1, name: 'C3' },
      { id: 4, clientId: 1, name: 'C4' },
      { id: 5, clientId: 1, name: 'C5' },
      { id: 6, clientId: 1, name: 'C6' },
    );
    const day = 86400000;
    const mk = (id: number, companyId: number, age: number) => ({
      id,
      clientId: 1,
      companyId,
      dealId: null,
      status: 'active',
      relationshipType: 'prospect',
      priority: 'low',
      lastTouchAt: new Date(Date.now() - age * day),
      nextReviewAt: null,
      staleAfterDays: 1,
    });
    state.brainRelationshipOverlays.push(
      mk(11, 1, 30),
      mk(12, 2, 20),
      mk(13, 3, 10),
      mk(14, 4, 40),
      mk(15, 5, 5),
      mk(16, 6, 50),
    );
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.staleProspects).toHaveLength(5);
    // Order: 50, 40, 30, 20, 10
    expect(res.staleProspects.map((p) => p.name)).toEqual(['C6', 'C4', 'C1', 'C2', 'C3']);
  });

  it('caps priority relationships at 5 and orders critical > high', async () => {
    for (let i = 0; i < 6; i++) {
      state.crmCompanies.push({ id: 10 + i, clientId: 1, name: `H${i}` });
    }
    state.crmCompanies.push({ id: 100, clientId: 1, name: 'CRIT' });
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 100,
      dealId: null,
      status: 'active',
      relationshipType: 'partner',
      priority: 'critical',
      lastTouchAt: null,
      nextReviewAt: null,
      staleAfterDays: null,
    });
    for (let i = 0; i < 6; i++) {
      state.brainRelationshipOverlays.push({
        id: 100 + i,
        clientId: 1,
        companyId: 10 + i,
        dealId: null,
        status: 'active',
        relationshipType: 'partner',
        priority: 'high',
        lastTouchAt: null,
        nextReviewAt: null,
        staleAfterDays: null,
      });
    }
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.priorityRelationships).toHaveLength(5);
    expect(res.priorityRelationships[0].priority).toBe('critical');
    expect(res.priorityRelationships[0].name).toBe('CRIT');
  });

  it('excludes inactive overlays', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Archived' });
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 10,
      dealId: null,
      status: 'archived',
      relationshipType: 'partner',
      priority: 'critical',
      lastTouchAt: null,
      nextReviewAt: null,
      staleAfterDays: null,
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.priorityRelationships).toEqual([]);
  });

  it('serializes lastTouchAt and nextReviewAt to ISO strings', async () => {
    const lastTouch = new Date('2026-01-01T00:00:00.000Z');
    const nextReview = new Date('2026-02-01T00:00:00.000Z');
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 10,
      dealId: null,
      status: 'active',
      relationshipType: 'partner',
      priority: 'high',
      lastTouchAt: lastTouch,
      nextReviewAt: nextReview,
      staleAfterDays: null,
    });
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.priorityRelationships[0].lastTouchAt).toBe(lastTouch.toISOString());
    expect(res.priorityRelationships[0].nextReviewAt).toBe(nextReview.toISOString());
  });

  it('defaults openTaskCount to 0 when no grouped row matches the overlay', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    state.brainRelationshipOverlays.push({
      id: 1,
      clientId: 1,
      companyId: 10,
      dealId: null,
      status: 'active',
      relationshipType: 'partner',
      priority: 'high',
      lastTouchAt: null,
      nextReviewAt: null,
      staleAfterDays: null,
    });
    // Force the count query to return rows for a *different* overlay.
    state.forcedOverlayTaskCounts = [{ companyId: 999, dealId: null, cnt: 7 }];
    const { getDashboardSummary } = await importModule();
    const res = await getDashboardSummary(1);
    expect(res.priorityRelationships[0].openTaskCount).toBe(0);
  });
});
