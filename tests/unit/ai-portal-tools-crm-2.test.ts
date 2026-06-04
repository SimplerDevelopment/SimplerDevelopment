// @vitest-environment node
// Part 2 of ai-portal-tools-crm tests — see ai-portal-tools-crm.test.ts for Part 1.
// Covers: create_crm_company, create_crm_deal, update_crm_deal, log_crm_activity,
// get_crm_proposals, create_crm_proposal, send_crm_proposal.
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
  crmProposals: Array<Record<string, unknown>>;
  nextId: Record<string, number>;
}

const state: MockState = {
  crmContacts: [],
  crmCompanies: [],
  crmDeals: [],
  crmActivities: [],
  crmPipelines: [],
  crmPipelineStages: [],
  crmProposals: [],
  nextId: {
    crmContacts: 1,
    crmCompanies: 1,
    crmDeals: 1,
    crmActivities: 1,
    crmPipelines: 1,
    crmPipelineStages: 1,
    crmProposals: 1,
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
      crmProposals: wrap('crmProposals'),
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
// Event bus + default pipeline mocks
// ---------------------------------------------------------------------------

const mockEmitEvent = vi.fn();
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: mockEmitEvent }));

const mockEnsureDefaultPipeline = vi.fn();
vi.mock('@/lib/crm/default-pipeline', () => ({
  ensureDefaultPipeline: mockEnsureDefaultPipeline,
}));

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
  state.crmProposals.length = 0;
  state.nextId = {
    crmContacts: 1,
    crmCompanies: 1,
    crmDeals: 1,
    crmActivities: 1,
    crmPipelines: 1,
    crmPipelineStages: 1,
    crmProposals: 1,
  };
  mockEmitEvent.mockReset();
  mockEnsureDefaultPipeline.mockReset();
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

function seedProposal(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.crmProposals++,
    clientId: 10,
    title: 'Proposal A',
    status: 'draft',
    contactId: null,
    companyId: null,
    dealId: null,
    summary: null,
    lineItems: [],
    fees: [],
    sections: [],
    currency: 'USD',
    clientToken: 'fixed-token-abc',
    validUntil: null,
    sentAt: null,
    viewCount: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: 1,
    ...overrides,
  };
  state.crmProposals.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// create_crm_company
// ---------------------------------------------------------------------------

describe('create_crm_company', () => {
  it('creates a company and returns companyId', async () => {
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.create_crm_company(
      { name: 'NewCo', domain: 'newco.com', industry: 'Finance' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(typeof res.companyId).toBe('number');
    expect(state.crmCompanies).toHaveLength(1);
    expect(state.crmCompanies[0]).toMatchObject({
      name: 'NewCo',
      domain: 'newco.com',
      industry: 'Finance',
      clientId: 10,
    });
  });

  it('defaults optional fields to null when omitted', async () => {
    const { crmHandlers } = await importModule();
    await crmHandlers.create_crm_company({ name: 'Minimal' }, 10, 1);
    expect(state.crmCompanies[0].domain).toBeNull();
    expect(state.crmCompanies[0].notes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// create_crm_deal
// ---------------------------------------------------------------------------

describe('create_crm_deal', () => {
  it('creates a deal using explicit pipeline and stage', async () => {
    seedPipeline({ id: 1, clientId: 10 });
    seedStage({ id: 1, pipelineId: 1 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.create_crm_deal(
      { title: 'A Deal', value: 100, pipeline_id: 1, stage_id: 1 },
      10,
      5,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(typeof res.dealId).toBe('number');
    const deal = state.crmDeals.find((d) => d.id === res.dealId)!;
    expect(deal.title).toBe('A Deal');
    expect(deal.value).toBe(10000); // 100 dollars → 10000 cents
    expect(deal.status).toBe('open');
  });

  it('falls back to ensureDefaultPipeline when pipeline_id is omitted', async () => {
    seedStage({ id: 1, pipelineId: 99 });
    mockEnsureDefaultPipeline.mockResolvedValue({ id: 99 });
    const { crmHandlers } = await importModule();
    await crmHandlers.create_crm_deal({ title: 'Auto Pipeline Deal' }, 10, 1);
    expect(mockEnsureDefaultPipeline).toHaveBeenCalledWith(10);
  });

  it('returns error when pipeline has no stages', async () => {
    mockEnsureDefaultPipeline.mockResolvedValue({ id: 99 });
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.create_crm_deal({ title: 'No Stages' }, 10, 1);
    expect((res as Record<string, unknown>).error).toContain('no stages');
  });

  it('emits crm.deal.created event on success', async () => {
    seedPipeline({ id: 1, clientId: 10 });
    seedStage({ id: 1, pipelineId: 1 });
    const { crmHandlers } = await importModule();
    await crmHandlers.create_crm_deal(
      { title: 'Event Deal', pipeline_id: 1, stage_id: 1 },
      10,
      3,
    );
    expect(mockEmitEvent).toHaveBeenCalledWith(
      'crm.deal.created',
      10,
      3,
      expect.objectContaining({ title: 'Event Deal' }),
    );
  });

  it('defaults priority to medium when not provided', async () => {
    seedPipeline({ id: 1, clientId: 10 });
    seedStage({ id: 1, pipelineId: 1 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.create_crm_deal(
      { title: 'Default Priority', pipeline_id: 1, stage_id: 1 },
      10,
      1,
    )) as Record<string, unknown>;
    const deal = state.crmDeals.find((d) => d.id === res.dealId)!;
    expect(deal.priority).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// update_crm_deal
// ---------------------------------------------------------------------------

describe('update_crm_deal', () => {
  it('returns error when deal not found', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.update_crm_deal({ deal_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Deal not found' });
  });

  it('returns error when deal belongs to another client', async () => {
    seedDeal({ id: 1, clientId: 99 });
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.update_crm_deal({ deal_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Deal not found' });
  });

  it('updates title and value', async () => {
    seedDeal({ id: 1, clientId: 10, title: 'Old', value: 1000 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.update_crm_deal(
      { deal_id: 1, title: 'New', value: 50 },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    const deal = state.crmDeals.find((d) => d.id === 1)!;
    expect(deal.title).toBe('New');
    expect(deal.value).toBe(5000); // 50 dollars → 5000 cents
  });

  it('sets closedAt when status is won and emits won event', async () => {
    seedDeal({ id: 1, clientId: 10 });
    const { crmHandlers } = await importModule();
    await crmHandlers.update_crm_deal({ deal_id: 1, status: 'won' }, 10, 2);
    const deal = state.crmDeals.find((d) => d.id === 1)!;
    expect(deal.status).toBe('won');
    expect(deal.closedAt).toBeInstanceOf(Date);
    expect(mockEmitEvent).toHaveBeenCalledWith(
      'crm.deal.won',
      10,
      2,
      expect.objectContaining({ id: 1 }),
    );
  });

  it('sets closedAt when status is lost and emits lost event', async () => {
    seedDeal({ id: 1, clientId: 10 });
    const { crmHandlers } = await importModule();
    await crmHandlers.update_crm_deal({ deal_id: 1, status: 'lost' }, 10, 2);
    const deal = state.crmDeals.find((d) => d.id === 1)!;
    expect(deal.closedAt).toBeInstanceOf(Date);
    expect(mockEmitEvent).toHaveBeenCalledWith('crm.deal.lost', 10, 2, expect.any(Object));
  });

  it('emits updated event for non-terminal status changes', async () => {
    seedDeal({ id: 1, clientId: 10 });
    const { crmHandlers } = await importModule();
    await crmHandlers.update_crm_deal({ deal_id: 1, title: 'Renamed' }, 10, 2);
    expect(mockEmitEvent).toHaveBeenCalledWith('crm.deal.updated', 10, 2, expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// log_crm_activity
// ---------------------------------------------------------------------------

describe('log_crm_activity', () => {
  it('creates an activity and returns activityId', async () => {
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.log_crm_activity(
      { type: 'call', title: 'Intro call', description: 'Nice chat' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(typeof res.activityId).toBe('number');
    expect(state.crmActivities).toHaveLength(1);
    expect(state.crmActivities[0]).toMatchObject({ type: 'call', title: 'Intro call', clientId: 10 });
  });

  it('updates lastContactedAt on the contact when contact_id is provided', async () => {
    seedContact({ id: 1, clientId: 10, lastContactedAt: null });
    const { crmHandlers } = await importModule();
    await crmHandlers.log_crm_activity(
      { type: 'email', title: 'Sent email', contact_id: 1 },
      10,
      1,
    );
    const contact = state.crmContacts.find((c) => c.id === 1)!;
    expect(contact.lastContactedAt).toBeInstanceOf(Date);
  });

  it('does not touch contacts when contact_id is omitted', async () => {
    seedContact({ id: 1, clientId: 10, lastContactedAt: null });
    const { crmHandlers } = await importModule();
    await crmHandlers.log_crm_activity({ type: 'note', title: 'General note' }, 10, 1);
    expect(state.crmContacts[0].lastContactedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// get_crm_proposals
// ---------------------------------------------------------------------------

describe('get_crm_proposals', () => {
  it('returns empty array when no proposals', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.get_crm_proposals({}, 10, 1);
    expect(Array.isArray(res)).toBe(true);
    expect((res as unknown[]).length).toBe(0);
  });

  it('returns proposals scoped to clientId', async () => {
    seedProposal({ id: 1, clientId: 10, title: 'My Proposal' });
    seedProposal({ id: 2, clientId: 99, title: 'Other' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_proposals({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('My Proposal');
  });

  it('each proposal result has a contactName property', async () => {
    seedProposal({ id: 1, clientId: 10 });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.get_crm_proposals({}, 10, 1)) as Array<
      Record<string, unknown>
    >;
    expect('contactName' in res[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// create_crm_proposal
// ---------------------------------------------------------------------------

describe('create_crm_proposal', () => {
  it('creates a draft proposal and returns proposalId', async () => {
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.create_crm_proposal(
      { title: 'New Proposal', summary: 'We can help' },
      10,
      5,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(typeof res.proposalId).toBe('number');
    expect(state.crmProposals).toHaveLength(1);
    expect(state.crmProposals[0]).toMatchObject({
      title: 'New Proposal',
      status: 'draft',
      clientId: 10,
      summary: 'We can help',
    });
  });

  it('returns error when line_items is not valid JSON', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.create_crm_proposal(
      { title: 'Bad', line_items: '{not json' },
      10,
      1,
    );
    expect(res).toEqual({ error: 'Invalid line_items JSON' });
  });

  it('parses valid line_items JSON', async () => {
    const items = [{ description: 'Dev', qty: 1, unitPrice: 50000 }];
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.create_crm_proposal(
      { title: 'With Items', line_items: JSON.stringify(items) },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(state.crmProposals[0].lineItems).toEqual(items);
  });
});

// ---------------------------------------------------------------------------
// send_crm_proposal
// ---------------------------------------------------------------------------

describe('send_crm_proposal', () => {
  it('returns error when proposal not found', async () => {
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.send_crm_proposal({ proposal_id: 999 }, 10, 1);
    expect(res).toEqual({ error: 'Proposal not found' });
  });

  it('returns error when proposal belongs to another client', async () => {
    seedProposal({ id: 1, clientId: 99 });
    const { crmHandlers } = await importModule();
    const res = await crmHandlers.send_crm_proposal({ proposal_id: 1 }, 10, 1);
    expect(res).toEqual({ error: 'Proposal not found' });
  });

  it('returns error when proposal status is not draft or sent', async () => {
    seedProposal({ id: 1, clientId: 10, status: 'accepted' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.send_crm_proposal({ proposal_id: 1 }, 10, 1)) as Record<
      string,
      unknown
    >;
    expect(res.error).toContain('accepted');
  });

  it('marks a draft proposal as sent and returns proposal URL', async () => {
    seedProposal({ id: 1, clientId: 10, status: 'draft', clientToken: 'tok123' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.send_crm_proposal({ proposal_id: 1 }, 10, 1)) as Record<
      string,
      unknown
    >;
    expect(res.success).toBe(true);
    expect(res.proposalUrl).toBe('/proposal/tok123');
    const proposal = state.crmProposals.find((p) => p.id === 1)!;
    expect(proposal.status).toBe('sent');
    expect(proposal.sentAt).toBeInstanceOf(Date);
  });

  it('allows re-sending an already-sent proposal', async () => {
    seedProposal({ id: 1, clientId: 10, status: 'sent', clientToken: 'tok456' });
    const { crmHandlers } = await importModule();
    const res = (await crmHandlers.send_crm_proposal({ proposal_id: 1 }, 10, 1)) as Record<
      string,
      unknown
    >;
    expect(res.success).toBe(true);
    expect(res.proposalUrl).toBe('/proposal/tok456');
  });
});
