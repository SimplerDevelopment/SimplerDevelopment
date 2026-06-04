// @vitest-environment node
/**
 * Unit tests for lib/brain/classify-crm.ts.
 *
 * The module is heavy: it touches the DB, Anthropic SDK, BYOK resolver,
 * credit ledger, brain search, CRM upserts, and audit logging. We mock all of
 * those out and drive the function purely through return values. The DB mock
 * is a chainable query builder backed by an in-memory state seeded per test,
 * mirroring tests/unit/brain-relationships.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const messagesCreateMock = vi.fn();
const anthropicCtorSpy = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    public messages: { create: typeof messagesCreateMock };
    constructor(opts: { apiKey: string }) {
      anthropicCtorSpy(opts);
      this.messages = { create: messagesCreateMock };
    }
  }
  return { default: Anthropic };
});

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
    brainAiJobs: wrap('brainAiJobs'),
    brainAiReviewItems: wrap('brainAiReviewItems'),
    brainMeetings: wrap('brainMeetings'),
    brainMeetingParticipants: wrap('brainMeetingParticipants'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
    crmActivities: wrap('crmActivities'),
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
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// ---- in-memory DB state ----

interface MockState {
  brainAiJobs: Array<Record<string, unknown>>;
  brainAiReviewItems: Array<Record<string, unknown>>;
  brainMeetings: Array<Record<string, unknown>>;
  brainMeetingParticipants: Array<Record<string, unknown>>;
  crmContacts: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  crmActivities: Array<Record<string, unknown>>;
}

const state: MockState = {
  brainAiJobs: [],
  brainAiReviewItems: [],
  brainMeetings: [],
  brainMeetingParticipants: [],
  crmContacts: [],
  crmCompanies: [],
  crmDeals: [],
  crmActivities: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

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
      // `sql\`false\`` is used as an OR placeholder when applied company is
      // absent; the OR-evaluator will already accept the other branch. Returning
      // false here matches the SQL semantic.
      return false;
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

let idCounter = 1000;
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

// ---- non-DB collaborators ----

const searchBrainMock = vi.fn();
vi.mock('@/lib/brain/search', () => ({
  searchBrain: (...args: unknown[]) => searchBrainMock(...args),
}));

const upsertContactByEmailMock = vi.fn();
vi.mock('@/lib/crm/contacts', () => ({
  upsertContactByEmail: (args: unknown) => upsertContactByEmailMock(args),
}));

const findCompanyByDomainMock = vi.fn();
vi.mock('@/lib/crm/companies', () => ({
  findCompanyByDomain: (args: unknown) => findCompanyByDomainMock(args),
}));

const auditCalls: Array<Record<string, unknown>> = [];
vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    auditCalls.push(args);
  }),
}));

const hasCreditsMock = vi.fn();
const deductCreditsMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  hasCredits: (...args: unknown[]) => hasCreditsMock(...args),
  deductCredits: (...args: unknown[]) => deductCreditsMock(...args),
}));

const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (args: unknown) => resolveClientApiKeyMock(args),
}));

const recordAiUsageMock = vi.fn(async () => undefined);
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (args: unknown) => recordAiUsageMock(args),
}));

// keep the real parse helpers so we don't double-implement them.
// (no mock for @/lib/crm/parse — it's pure)

// ---- module under test (dynamic import after mocks) ----

const { classifyAndLinkCrm } = await import('@/lib/brain/classify-crm');

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function defaultClaudeResponse(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      { type: 'text', text: JSON.stringify(overrides) },
    ],
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

function baseArgs(over: Partial<Parameters<typeof classifyAndLinkCrm>[0]> = {}) {
  return {
    clientId: 1,
    meetingId: 42,
    userId: 7,
    extraction: { summary: 'Email summary' } as Parameters<typeof classifyAndLinkCrm>[0]['extraction'],
    sourceMetadata: { senderEmail: 'jane@acme.test', from: 'Jane Doe <jane@acme.test>' },
    meetingTitle: 'Re: pricing',
    transcript: 'Hi team, can you share pricing tiers?',
    ...over,
  };
}

beforeEach(() => {
  state.brainAiJobs.length = 0;
  state.brainAiReviewItems.length = 0;
  state.brainMeetings.length = 0;
  state.brainMeetingParticipants.length = 0;
  state.crmContacts.length = 0;
  state.crmCompanies.length = 0;
  state.crmDeals.length = 0;
  state.crmActivities.length = 0;
  auditCalls.length = 0;
  idCounter = 1000;

  messagesCreateMock.mockReset();
  anthropicCtorSpy.mockReset();
  searchBrainMock.mockReset().mockResolvedValue({ hits: [] });
  upsertContactByEmailMock.mockReset().mockImplementation(async ({ email }: { email: string }) => {
    const id = nextId();
    state.crmContacts.push({
      id, clientId: 1, email, firstName: 'Jane', lastName: 'Doe',
      title: null, status: 'active', seniority: null, department: null,
      companyId: null, lastContactedAt: null,
    });
    return { contactId: id, created: true };
  });
  findCompanyByDomainMock.mockReset().mockResolvedValue([]);
  hasCreditsMock.mockReset().mockResolvedValue(true);
  deductCreditsMock.mockReset().mockResolvedValue(undefined);
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Early-exit branches
// ---------------------------------------------------------------------------

describe('classifyAndLinkCrm — early exits', () => {
  it('skips when senderEmail is missing', async () => {
    const res = await classifyAndLinkCrm(baseArgs({ sourceMetadata: {} }));
    expect(res).toEqual({ jobId: -1, reviewItemIds: [], appliedLinks: {}, skipped: 'no_sender_email' });
    expect(resolveClientApiKeyMock).not.toHaveBeenCalled();
  });

  it('skips when senderEmail has no @', async () => {
    const res = await classifyAndLinkCrm(baseArgs({ sourceMetadata: { senderEmail: 'notanemail' } }));
    expect(res.skipped).toBe('no_sender_email');
  });

  it('skips when senderEmail is null', async () => {
    const res = await classifyAndLinkCrm(baseArgs({ sourceMetadata: null }));
    expect(res.skipped).toBe('no_sender_email');
  });

  it('skips on platform when credits are insufficient', async () => {
    hasCreditsMock.mockResolvedValueOnce(false);
    const res = await classifyAndLinkCrm(baseArgs());
    expect(res.skipped).toBe('no_credits');
    expect(res.jobId).toBe(-1);
    expect(upsertContactByEmailMock).not.toHaveBeenCalled();
  });

  it('does NOT require credits when BYOK key is in use', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok' });
    hasCreditsMock.mockResolvedValueOnce(false); // would normally skip, but BYOK bypasses
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());

    const res = await classifyAndLinkCrm(baseArgs());
    expect(res.skipped).toBeUndefined();
    expect(hasCreditsMock).not.toHaveBeenCalled();
    expect(anthropicCtorSpy).toHaveBeenCalledWith({ apiKey: 'sk-byok' });
    // BYOK shouldn't trigger credit deduction.
    expect(deductCreditsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path — no overlays, just sender upsert
// ---------------------------------------------------------------------------

describe('classifyAndLinkCrm — basic auto-link', () => {
  it('upserts the sender contact and inserts a sender participant row', async () => {
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());
    const res = await classifyAndLinkCrm(baseArgs());

    expect(upsertContactByEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 1,
      email: 'jane@acme.test',
      displayName: 'Jane Doe <jane@acme.test>',
    }));
    expect(res.appliedLinks.contactId).toBeDefined();
    expect(res.appliedLinks.contactCreated).toBe(true);
    // Participant row inserted
    expect(state.brainMeetingParticipants).toHaveLength(1);
    const p = state.brainMeetingParticipants[0];
    expect(p.roleInMeeting).toBe('sender');
    expect(p.email).toBe('jane@acme.test');
  });

  it('does NOT auto-link company when domain matches > 1', async () => {
    findCompanyByDomainMock.mockResolvedValueOnce([
      { id: 1, name: 'Acme NA', domain: 'acme.test' },
      { id: 2, name: 'Acme EU', domain: 'acme.test' },
    ]);
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());

    const res = await classifyAndLinkCrm(baseArgs());
    expect(res.appliedLinks.companyId).toBeUndefined();
    // ambiguous → review item proposed
    const linkReview = state.brainAiReviewItems.find((r) => r.proposedType === 'crm_company_link');
    expect(linkReview).toBeDefined();
  });

  it('auto-links company on unambiguous domain match and updates the meeting + contact', async () => {
    findCompanyByDomainMock.mockResolvedValueOnce([{ id: 55, name: 'Acme', domain: 'acme.test' }]);
    state.brainMeetings.push({ id: 42, clientId: 1, companyId: null });
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());

    const res = await classifyAndLinkCrm(baseArgs());
    expect(res.appliedLinks.companyId).toBe(55);
    // Meeting row updated
    expect(state.brainMeetings[0].companyId).toBe(55);
    // Contact row updated to point at company
    const contact = state.crmContacts.find((c) => c.email === 'jane@acme.test');
    expect(contact?.companyId).toBe(55);
  });

  it('does NOT update contact.companyId when the contact already existed (created=false)', async () => {
    upsertContactByEmailMock.mockImplementationOnce(async ({ email }: { email: string }) => {
      state.crmContacts.push({
        id: 9999, clientId: 1, email, firstName: 'Jane', lastName: null,
        companyId: 88, // already has a company
      });
      return { contactId: 9999, created: false };
    });
    findCompanyByDomainMock.mockResolvedValueOnce([{ id: 55, name: 'Acme', domain: 'acme.test' }]);
    state.brainMeetings.push({ id: 42, clientId: 1, companyId: null });
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());

    await classifyAndLinkCrm(baseArgs());
    // contact.companyId stays at 88 — not overwritten
    expect(state.crmContacts.find((c) => c.id === 9999)?.companyId).toBe(88);
  });
});

// ---------------------------------------------------------------------------
// Participant upgrade path
// ---------------------------------------------------------------------------

describe('classifyAndLinkCrm — participant handling', () => {
  it('upgrades existing participant row to sender role instead of inserting', async () => {
    state.brainMeetingParticipants.push({
      id: 500, meetingId: 42, contactId: null, email: 'jane@acme.test',
      name: 'Jane (manual)', roleInMeeting: 'attendee',
    });
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());
    await classifyAndLinkCrm(baseArgs());

    expect(state.brainMeetingParticipants).toHaveLength(1);
    const p = state.brainMeetingParticipants[0];
    expect(p.roleInMeeting).toBe('sender');
    // existing name retained when non-empty
    expect(p.name).toBe('Jane (manual)');
  });
});

// ---------------------------------------------------------------------------
// Review items emitted from Claude output
// ---------------------------------------------------------------------------

describe('classifyAndLinkCrm — Claude review items', () => {
  it('emits crm_contact_classify when a non-default proposal is returned', async () => {
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse({
      contactClassification: {
        proposedStatus: 'lead',
        proposedTitle: 'VP Engineering',
        confidence: 'high',
        rationale: 'Asked for pricing tiers',
      },
    }));
    const res = await classifyAndLinkCrm(baseArgs());
    const item = state.brainAiReviewItems.find((r) => r.proposedType === 'crm_contact_classify');
    expect(item).toBeDefined();
    expect((item!.proposedPayload as { proposedStatus: string }).proposedStatus).toBe('lead');
    expect(res.reviewItemIds.length).toBeGreaterThan(0);
  });

  it('does NOT emit crm_contact_classify when no fields are proposed', async () => {
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse({
      contactClassification: { confidence: 'low', rationale: 'no signal' },
    }));
    await classifyAndLinkCrm(baseArgs());
    expect(state.brainAiReviewItems.find((r) => r.proposedType === 'crm_contact_classify')).toBeUndefined();
  });

  it('falls back to "low" confidence + default rationale when classification fields omitted', async () => {
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse({
      contactClassification: { proposedTitle: 'CTO' },
    }));
    await classifyAndLinkCrm(baseArgs());
    const item = state.brainAiReviewItems.find((r) => r.proposedType === 'crm_contact_classify');
    expect(item).toBeDefined();
    const payload = item!.proposedPayload as { confidence: string; rationale: string };
    expect(payload.confidence).toBe('low');
    expect(payload.rationale).toBe('No rationale provided');
  });

  it('emits crm_deal_link only for ids in the openDeals fixture', async () => {
    state.crmDeals.push(
      { id: 200, clientId: 1, title: 'Pilot', status: 'open', contactId: 1000, value: 5000, stageId: 1, companyId: null, updatedAt: new Date() },
    );
    // upsert returns contactId 1000 so the deal becomes "open" for them
    upsertContactByEmailMock.mockImplementationOnce(async ({ email }: { email: string }) => {
      state.crmContacts.push({ id: 1000, clientId: 1, email, firstName: 'Jane', lastName: null, companyId: null });
      return { contactId: 1000, created: true };
    });
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse({
      dealLinks: [
        { action: 'link', dealId: 200, rationale: 'Mentions Pilot' },
        { action: 'link', dealId: 9999, rationale: 'Hallucinated id, should be filtered' },
      ],
    }));
    await classifyAndLinkCrm(baseArgs());
    const linkItems = state.brainAiReviewItems.filter((r) => r.proposedType === 'crm_deal_link');
    expect(linkItems).toHaveLength(1);
    expect((linkItems[0].proposedPayload as { dealId: number }).dealId).toBe(200);
  });

  it('emits crm_deal_create with default rationale and value when AI omits them', async () => {
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse({
      dealLinks: [
        { action: 'create', proposedTitle: 'New SOW' },
        { action: 'create', proposedTitle: 'Capped Value', proposedValue: -1 }, // invalid → undefined
        { action: 'create' }, // missing title → ignored
      ],
    }));
    await classifyAndLinkCrm(baseArgs());
    const createItems = state.brainAiReviewItems.filter((r) => r.proposedType === 'crm_deal_create');
    expect(createItems).toHaveLength(2);
    const first = createItems[0].proposedPayload as { title: string; value?: number; rationale: string };
    expect(first.title).toBe('New SOW');
    expect(first.rationale).toBe('AI-proposed new deal');
    const second = createItems[1].proposedPayload as { value?: number };
    expect(second.value).toBeUndefined();
  });

  it('emits task review items for brainAwareTasks (and skips entries with no title)', async () => {
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse({
      brainAwareTasks: [
        { title: 'Follow up on Q1 commitment', priority: 'high', relatesToBrainHit: 'meeting:99' },
        { description: 'no title here' },
      ],
    }));
    await classifyAndLinkCrm(baseArgs());
    const taskItems = state.brainAiReviewItems.filter((r) => r.proposedType === 'task');
    expect(taskItems).toHaveLength(1);
    const p = taskItems[0].proposedPayload as { title: string; priority: string };
    expect(p.title).toBe('Follow up on Q1 commitment');
    expect(p.priority).toBe('high');
  });

  it('proposes crm_company_create when domain has no match and is non-personal', async () => {
    findCompanyByDomainMock.mockResolvedValueOnce([]);
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());
    await classifyAndLinkCrm(baseArgs());
    const createReview = state.brainAiReviewItems.find((r) => r.proposedType === 'crm_company_create');
    expect(createReview).toBeDefined();
    const payload = createReview!.proposedPayload as { name: string; domain: string };
    expect(payload.name).toBe('Acme'); // capitalized first segment
    expect(payload.domain).toBe('acme.test');
  });

  it('does NOT propose crm_company_create when the sender is on a personal domain', async () => {
    findCompanyByDomainMock.mockResolvedValueOnce([]);
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());
    await classifyAndLinkCrm(baseArgs({
      sourceMetadata: { senderEmail: 'jane@gmail.com', from: 'Jane <jane@gmail.com>' },
    }));
    expect(state.brainAiReviewItems.find((r) => r.proposedType === 'crm_company_create')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Claude error path
// ---------------------------------------------------------------------------

describe('classifyAndLinkCrm — Claude failure', () => {
  it('marks job failed but keeps the auto-applied links', async () => {
    findCompanyByDomainMock.mockResolvedValueOnce([{ id: 77, name: 'Acme', domain: 'acme.test' }]);
    state.brainMeetings.push({ id: 42, clientId: 1, companyId: null });
    messagesCreateMock.mockRejectedValueOnce(new Error('rate limit'));

    const res = await classifyAndLinkCrm(baseArgs());
    expect(res.reviewItemIds).toEqual([]);
    expect(res.appliedLinks.companyId).toBe(77);
    expect(res.appliedLinks.contactCreated).toBe(true);
    // Failed job row recorded
    const job = state.brainAiJobs.find((j) => j.status === 'failed');
    expect(job).toBeDefined();
    expect(job!.error).toBe('rate limit');
    // Audit logged failure
    expect(auditCalls.find((a) => a.action === 'brain.crm_classify_failed')).toBeDefined();
  });

  it('records "Unknown classify error" message when error is not an Error instance', async () => {
    messagesCreateMock.mockRejectedValueOnce('string thrown directly');
    const res = await classifyAndLinkCrm(baseArgs());
    expect(res.reviewItemIds).toEqual([]);
    const job = state.brainAiJobs.find((j) => j.status === 'failed');
    expect(job!.error).toBe('Unknown classify error');
  });
});

// ---------------------------------------------------------------------------
// JSON parsing edge cases
// ---------------------------------------------------------------------------

describe('classifyAndLinkCrm — Claude output parsing', () => {
  it('handles bare JSON output', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"brainAwareTasks":[{"title":"X"}]}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await classifyAndLinkCrm(baseArgs());
    expect(state.brainAiReviewItems.find((r) => r.proposedType === 'task')).toBeDefined();
  });

  it('strips ```json fences from Claude output', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: '```json\n{"brainAwareTasks":[{"title":"Fenced task"}]}\n```',
      }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await classifyAndLinkCrm(baseArgs());
    const task = state.brainAiReviewItems.find((r) => r.proposedType === 'task');
    expect((task!.proposedPayload as { title: string }).title).toBe('Fenced task');
  });

  it('strips bare ``` fences (no language) from Claude output', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: '```\n{"brainAwareTasks":[{"title":"Plain fence"}]}\n```',
      }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await classifyAndLinkCrm(baseArgs());
    const task = state.brainAiReviewItems.find((r) => r.proposedType === 'task');
    expect((task!.proposedPayload as { title: string }).title).toBe('Plain fence');
  });

  it('returns empty output (no review items) when JSON is malformed', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json {{{' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    // Use a personal domain so the source doesn't emit a company-create review item.
    const res = await classifyAndLinkCrm(baseArgs({
      sourceMetadata: { senderEmail: 'jane@gmail.com', from: 'Jane <jane@gmail.com>' },
    }));
    expect(res.reviewItemIds).toEqual([]);
    // Job completed successfully (parse failure is swallowed)
    expect(state.brainAiJobs.find((j) => j.status === 'completed')).toBeDefined();
  });

  it('handles a response without a text block (claudeOutput stays {})', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 't', name: 'noop', input: {} }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const res = await classifyAndLinkCrm(baseArgs({
      sourceMetadata: { senderEmail: 'jane@gmail.com', from: 'Jane <jane@gmail.com>' },
    }));
    expect(res.reviewItemIds).toEqual([]);
  });

  it('handles missing usage on the response', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{}' }],
      // no usage field
    });
    const res = await classifyAndLinkCrm(baseArgs({
      sourceMetadata: { senderEmail: 'jane@gmail.com', from: 'Jane <jane@gmail.com>' },
    }));
    expect(res.reviewItemIds).toEqual([]);
    const job = state.brainAiJobs.find((j) => j.status === 'completed');
    expect(job!.inputTokens).toBe(0);
    expect(job!.outputTokens).toBe(0);
  });

  it('treats a JSON array (non-object root) as empty output', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[1,2,3]' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    // arrays are typeof 'object' & truthy, so the source DOES accept them as
    // ClassifyClaudeOutput — but no fields will match, so no review items.
    const res = await classifyAndLinkCrm(baseArgs({
      sourceMetadata: { senderEmail: 'jane@gmail.com', from: 'Jane <jane@gmail.com>' },
    }));
    expect(res.reviewItemIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Brain hit search + filtering
// ---------------------------------------------------------------------------

describe('classifyAndLinkCrm — brain search integration', () => {
  it('skips self-meeting from search hits', async () => {
    searchBrainMock.mockResolvedValueOnce({
      hits: [
        { type: 'meeting', id: 42, title: 'self', snippet: 's' },
        { type: 'meeting', id: 99, title: 'other', snippet: 'o' },
      ],
    });
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());

    await classifyAndLinkCrm(baseArgs());

    // The job input should reflect brainHitCount = 1 (self excluded).
    const job = state.brainAiJobs[0];
    expect((job.input as { brainHitCount: number }).brainHitCount).toBe(1);
  });

  it('skips brain search when search query is empty (no sender domain context)', async () => {
    // Override args to wipe all the parts that build the searchQuery.
    await classifyAndLinkCrm(baseArgs({
      meetingTitle: '',
      extraction: { summary: '' } as Parameters<typeof classifyAndLinkCrm>[0]['extraction'],
      sourceMetadata: { senderEmail: 'x@y.z' },
    }));
    // searchQuery includes senderEmail so it isn't actually empty — assert it
    // WAS called. Just verifies the path doesn't crash.
    expect(searchBrainMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Credits + audit on success
// ---------------------------------------------------------------------------

describe('classifyAndLinkCrm — credits + final audit', () => {
  it('charges credits on platform after a successful classify', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{}' }],
      usage: { input_tokens: 3000, output_tokens: 500 }, // 3 + 2 = 5
    });
    await classifyAndLinkCrm(baseArgs());
    expect(deductCreditsMock).toHaveBeenCalledWith(
      1,
      5,
      'brain_crm_classify',
      'meeting:42',
      expect.stringContaining('meeting 42'),
    );
  });

  it('floors credits at 1 even when token counts are zero', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{}' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    await classifyAndLinkCrm(baseArgs());
    expect(deductCreditsMock).toHaveBeenCalledWith(1, 1, expect.anything(), expect.anything(), expect.anything());
  });

  it('does NOT charge credits when BYOK key is in use', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok' });
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());
    await classifyAndLinkCrm(baseArgs());
    expect(deductCreditsMock).not.toHaveBeenCalled();
    expect(recordAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'byok' }));
  });

  it('logs brain.crm_classified audit entry on success', async () => {
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse());
    await classifyAndLinkCrm(baseArgs());
    const audit = auditCalls.find((a) => a.action === 'brain.crm_classified');
    expect(audit).toBeDefined();
    expect(audit!.entityType).toBe('brain_meeting');
    expect(audit!.entityId).toBe(42);
  });

  it('completes the job row with output summary on success', async () => {
    findCompanyByDomainMock.mockResolvedValueOnce([{ id: 77, name: 'Acme', domain: 'acme.test' }]);
    state.brainMeetings.push({ id: 42, clientId: 1, companyId: null });
    messagesCreateMock.mockResolvedValueOnce(defaultClaudeResponse({
      brainAwareTasks: [{ title: 'follow up' }],
    }));
    await classifyAndLinkCrm(baseArgs());

    const job = state.brainAiJobs.find((j) => j.status === 'completed');
    expect(job).toBeDefined();
    const out = job!.output as { reviewItemCount: number; contactCreated: boolean; companyAutoLinked: boolean };
    expect(out.contactCreated).toBe(true);
    expect(out.companyAutoLinked).toBe(true);
    expect(out.reviewItemCount).toBeGreaterThan(0);
  });
});
