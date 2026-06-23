// @vitest-environment node
/**
 * Unit tests for lib/ai/meeting-processor.ts.
 *
 * The module is DB- and Anthropic-coupled. We mock @/lib/db, drizzle-orm,
 * @anthropic-ai/sdk, and every non-pure collaborator. The DB mock is a
 * chainable query builder backed by an in-memory state seeded per test,
 * matching the patterns in tests/unit/brain-classify-crm.test.ts and
 * tests/unit/brain-relationships.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Anthropic SDK mock
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

// ---------------------------------------------------------------------------
// Schema mock — Proxy wrappers so column access returns a typed marker
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
  return new Proxy({
    brainAiJobs: wrap('brainAiJobs'),
    brainAiReviewItems: wrap('brainAiReviewItems'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// drizzle-orm mock
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// In-memory DB state
// ---------------------------------------------------------------------------

interface MockState {
  brainAiJobs: Array<Record<string, unknown>>;
  brainAiReviewItems: Array<Record<string, unknown>>;
}

const state: MockState = {
  brainAiJobs: [],
  brainAiReviewItems: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

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
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/db', () => {
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
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  return {
    db: {
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
// Collaborator mocks
// ---------------------------------------------------------------------------

const setMeetingAiSummaryMock = vi.fn(async () => undefined);
const updateMeetingStatusMock = vi.fn(async () => undefined);
vi.mock('@/lib/brain/meetings', () => ({
  setMeetingAiSummary: (...args: unknown[]) => setMeetingAiSummaryMock(...args),
  updateMeetingStatus: (...args: unknown[]) => updateMeetingStatusMock(...args),
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

// ---------------------------------------------------------------------------
// Module under test (dynamic import after mocks)
// ---------------------------------------------------------------------------

const { processMeetingTranscript } = await import('@/lib/ai/meeting-processor');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultExtraction(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'Quarterly planning kickoff. Team agreed on roadmap.',
    decisions: [{ title: 'Ship v2 in Q3' }],
    commitments: [{ who: 'Ada', what: 'Send proposal', when: '2026-06-01' }],
    tasks: [
      {
        title: 'Send proposal',
        description: 'Draft of the v2 SOW',
        ownerHint: 'Ada',
        ownerEmail: 'ada@acme.test',
        dueDate: '2026-06-01',
        priority: 'high',
        complianceFlag: false,
      },
    ],
    missingContext: ['Who is "Bob" mentioned at line 142?'],
    relationshipUpdates: [{ field: 'priority', value: 'high', rationale: 'Active deal' }],
    complianceWarnings: [{ message: 'Discusses tax ID', severity: 'high' }],
    ...overrides,
  };
}

function claudeResponse(payload: unknown, usage = { input_tokens: 1500, output_tokens: 800 }) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    content: [{ type: 'text', text }],
    usage,
  };
}

function baseArgs(over: Record<string, unknown> = {}) {
  return {
    clientId: 1,
    meetingId: 42,
    userId: 7,
    transcript: 'A: Let us ship Q3.\nB: Agreed.',
    meetingTitle: 'Q3 Planning',
    meetingDate: new Date('2026-05-19T12:00:00Z'),
    participants: [{ name: 'Ada', email: 'ada@acme.test' }, { name: 'Bob' }],
    ...over,
  };
}

beforeEach(() => {
  state.brainAiJobs.length = 0;
  state.brainAiReviewItems.length = 0;
  auditCalls.length = 0;
  idCounter = 1000;

  messagesCreateMock.mockReset();
  anthropicCtorSpy.mockReset();
  setMeetingAiSummaryMock.mockReset().mockResolvedValue(undefined);
  updateMeetingStatusMock.mockReset().mockResolvedValue(undefined);
  hasCreditsMock.mockReset().mockResolvedValue(true);
  deductCreditsMock.mockReset().mockResolvedValue(undefined);
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('processMeetingTranscript — happy path', () => {
  it('runs the full pipeline and returns jobId + reviewItemIds + extraction', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse(defaultExtraction()));

    const res = await processMeetingTranscript(baseArgs());

    expect(res.jobId).toBeGreaterThan(0);
    expect(res.reviewItemIds.length).toBeGreaterThan(0);
    expect(res.extraction.summary).toContain('Quarterly');
    // job started as running, then completed
    const job = state.brainAiJobs.find((j) => j.id === res.jobId);
    expect(job).toBeDefined();
    expect(job!.status).toBe('completed');
    expect(job!.creditsCharged).toBeGreaterThan(0);
    // status transitions
    expect(updateMeetingStatusMock).toHaveBeenCalledWith(1, 42, 'processing');
    expect(updateMeetingStatusMock).toHaveBeenCalledWith(1, 42, 'needs_review');
    // summary persisted
    expect(setMeetingAiSummaryMock).toHaveBeenCalledWith(1, 42, expect.stringContaining('Quarterly'));
    // audit logged
    expect(auditCalls.find((a) => a.action === 'meeting.processed')).toBeDefined();
  });

  it('materializes review items for each extraction category', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse(defaultExtraction()));

    await processMeetingTranscript(baseArgs());

    const byType = (t: string) => state.brainAiReviewItems.filter((r) => r.proposedType === t);
    expect(byType('task')).toHaveLength(1);
    expect(byType('decision')).toHaveLength(1);
    expect(byType('commitment')).toHaveLength(1);
    expect(byType('relationship_update')).toHaveLength(1);
    expect(byType('compliance_warning')).toHaveLength(1);
    // every row has clientId + sourceType=meeting + sourceId=42 + pending
    for (const row of state.brainAiReviewItems) {
      expect(row.clientId).toBe(1);
      expect(row.sourceType).toBe('meeting');
      expect(row.sourceId).toBe(42);
      expect(row.status).toBe('pending');
    }
  });

  it('passes through participant + meeting metadata to the Claude prompt', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse(defaultExtraction()));

    await processMeetingTranscript(baseArgs());

    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    const call = messagesCreateMock.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-4-5');
    expect(call.max_tokens).toBe(4096);
    const userText = call.messages[0].content as string;
    expect(userText).toContain('Q3 Planning');
    expect(userText).toContain('Ada');
    expect(userText).toContain('ada@acme.test');
    expect(userText).toContain('Bob');
    // no email after Bob
    expect(userText).toMatch(/  - Bob\n/);
    expect(userText).toContain('2026-05-19');
  });

  it('emits truncation notice when transcript exceeds 60k chars', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse(defaultExtraction()));

    const longTranscript = 'x'.repeat(60_001);
    await processMeetingTranscript(baseArgs({ transcript: longTranscript }));

    const userText = messagesCreateMock.mock.calls[0][0].messages[0].content as string;
    expect(userText).toContain('Transcript was truncated');
    // job.input.truncated true
    const job = state.brainAiJobs[0];
    expect((job.input as { truncated: boolean }).truncated).toBe(true);
  });

  it('omits the participants section when none are provided', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse(defaultExtraction()));

    await processMeetingTranscript(baseArgs({ participants: [] }));

    const userText = messagesCreateMock.mock.calls[0][0].messages[0].content as string;
    expect(userText).not.toContain('Participants:');
  });

  it('omits meeting date line when meetingDate is null', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse(defaultExtraction()));

    await processMeetingTranscript(baseArgs({ meetingDate: null }));

    const userText = messagesCreateMock.mock.calls[0][0].messages[0].content as string;
    expect(userText).not.toContain('Meeting date:');
  });

  it('skips review-item insert when extraction has empty arrays', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse({
      summary: 'Nothing actionable.',
      decisions: [],
      commitments: [],
      tasks: [],
      missingContext: [],
      relationshipUpdates: [],
      complianceWarnings: [],
    }));

    const res = await processMeetingTranscript(baseArgs());

    expect(res.reviewItemIds).toEqual([]);
    expect(state.brainAiReviewItems).toHaveLength(0);
    // still completes successfully
    const job = state.brainAiJobs[0];
    expect(job.status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Credits + BYOK
// ---------------------------------------------------------------------------

describe('processMeetingTranscript — credits', () => {
  it('rejects with insufficient-credits error and marks job failed on platform', async () => {
    hasCreditsMock.mockResolvedValueOnce(false);

    await expect(processMeetingTranscript(baseArgs())).rejects.toThrow(/Insufficient AI credits/);

    // Job exists and is failed
    const job = state.brainAiJobs[0];
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/Insufficient AI credits/);
    // Meeting reset back to draft
    expect(updateMeetingStatusMock).toHaveBeenLastCalledWith(1, 42, 'draft');
    // Anthropic never called
    expect(messagesCreateMock).not.toHaveBeenCalled();
    // Audit recorded the failure
    const audit = auditCalls.find((a) => a.action === 'meeting.process_failed');
    expect(audit).toBeDefined();
    expect((audit!.metadata as { reason: string }).reason).toBe('insufficient_credits');
  });

  it('BYOK bypasses the credit check and does not deduct credits', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok' });
    messagesCreateMock.mockResolvedValueOnce(claudeResponse(defaultExtraction()));

    await processMeetingTranscript(baseArgs());

    expect(hasCreditsMock).not.toHaveBeenCalled();
    expect(deductCreditsMock).not.toHaveBeenCalled();
    expect(anthropicCtorSpy).toHaveBeenCalledWith({ apiKey: 'sk-byok' });
    // Usage still recorded
    expect(recordAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'byok' }));
  });

  it('charges credits based on actual token usage on platform', async () => {
    // 4000 input → 4 credits ; 1000 output → 4 credits ; total = 8
    messagesCreateMock.mockResolvedValueOnce(
      claudeResponse(defaultExtraction(), { input_tokens: 4000, output_tokens: 1000 }),
    );

    await processMeetingTranscript(baseArgs());

    expect(deductCreditsMock).toHaveBeenCalledWith(
      1,
      8,
      'brain_meeting_processing',
      'meeting:42',
      expect.stringContaining('Processed meeting 42'),
    );
  });

  it('floors credits at 1 when token usage is zero', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      claudeResponse(defaultExtraction(), { input_tokens: 0, output_tokens: 0 }),
    );

    await processMeetingTranscript(baseArgs());

    expect(deductCreditsMock).toHaveBeenCalledWith(1, 1, expect.anything(), expect.anything(), expect.anything());
  });

  it('handles a response with no usage field — treats tokens as 0', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(defaultExtraction()) }],
      // no usage
    });

    await processMeetingTranscript(baseArgs());

    const job = state.brainAiJobs[0];
    expect(job.inputTokens).toBe(0);
    expect(job.outputTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Anthropic failure path
// ---------------------------------------------------------------------------

describe('processMeetingTranscript — failures', () => {
  it('marks job failed and rethrows when Anthropic call rejects', async () => {
    messagesCreateMock.mockRejectedValueOnce(new Error('rate limit hit'));

    await expect(processMeetingTranscript(baseArgs())).rejects.toThrow(/rate limit hit/);

    const job = state.brainAiJobs[0];
    expect(job.status).toBe('failed');
    expect(job.error).toBe('rate limit hit');
    expect(updateMeetingStatusMock).toHaveBeenLastCalledWith(1, 42, 'draft');
    const audit = auditCalls.find((a) => a.action === 'meeting.process_failed');
    expect(audit).toBeDefined();
  });

  it('records "Unknown AI processing error" when a non-Error value is thrown', async () => {
    messagesCreateMock.mockRejectedValueOnce('string thrown directly');

    await expect(processMeetingTranscript(baseArgs())).rejects.toBe('string thrown directly');

    const job = state.brainAiJobs[0];
    expect(job.status).toBe('failed');
    expect(job.error).toBe('Unknown AI processing error');
  });

  it('throws when Claude response has no text block', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 't', name: 'noop', input: {} }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await expect(processMeetingTranscript(baseArgs())).rejects.toThrow(/no text content/);

    const job = state.brainAiJobs[0];
    expect(job.status).toBe('failed');
  });

  it('throws when JSON parse fails', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse('not json {{{'));

    await expect(processMeetingTranscript(baseArgs())).rejects.toThrow(/non-JSON output/);

    const job = state.brainAiJobs[0];
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/non-JSON output/);
  });

  it('throws when AI returns a non-object root (e.g. null)', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse('null'));

    await expect(processMeetingTranscript(baseArgs())).rejects.toThrow(/not an object/);
  });
});

// ---------------------------------------------------------------------------
// JSON parsing edge cases
// ---------------------------------------------------------------------------

describe('processMeetingTranscript — extraction parsing', () => {
  it('strips ```json fences from Claude output', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: '```json\n' + JSON.stringify(defaultExtraction()) + '\n```',
      }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const res = await processMeetingTranscript(baseArgs());
    expect(res.extraction.summary).toContain('Quarterly');
  });

  it('strips bare ``` fences (no language) from Claude output', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: '```\n' + JSON.stringify(defaultExtraction()) + '\n```',
      }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const res = await processMeetingTranscript(baseArgs());
    expect(res.extraction.summary).toContain('Quarterly');
  });

  it('coerces non-array fields into empty arrays and missing summary into ""', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse({
      // summary absent
      decisions: 'not an array',
      commitments: null,
      tasks: { not: 'an array' },
      missingContext: undefined,
      relationshipUpdates: 42,
      complianceWarnings: false,
    }));

    const res = await processMeetingTranscript(baseArgs());
    expect(res.extraction.summary).toBe('');
    expect(res.extraction.decisions).toEqual([]);
    expect(res.extraction.commitments).toEqual([]);
    expect(res.extraction.tasks).toEqual([]);
    expect(res.extraction.missingContext).toEqual([]);
    expect(res.extraction.relationshipUpdates).toEqual([]);
    expect(res.extraction.complianceWarnings).toEqual([]);
    // no review items inserted
    expect(state.brainAiReviewItems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Anthropic constructor receives the resolved key
// ---------------------------------------------------------------------------

describe('processMeetingTranscript — API key resolution', () => {
  it('instantiates Anthropic with the platform key by default', async () => {
    messagesCreateMock.mockResolvedValueOnce(claudeResponse(defaultExtraction()));

    await processMeetingTranscript(baseArgs());

    expect(anthropicCtorSpy).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    expect(resolveClientApiKeyMock).toHaveBeenCalledWith({ clientId: 1, provider: 'anthropic' });
  });
});
