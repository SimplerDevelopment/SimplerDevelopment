// @vitest-environment node
/**
 * Unit tests for lib/brain/classify-notes.ts.
 * All external collaborators (DB, Anthropic, BYOK resolver, AI usage ledger,
 * brain audit) are mocked. Pure helpers are exercised indirectly via classifyNotes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any dynamic import of the module under test
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

// Drizzle operator stubs — keep in sync with classify-crm test.
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// Schema proxy — any property access returns a column descriptor.
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
    { brainNotes: wrap('brainNotes') },
    {
      has: (_t, p) =>
        p === 'brainNotes' ||
        !(p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'),
      get: (_t, p) =>
        p === 'brainNotes'
          ? wrap('brainNotes')
          : p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'
          ? undefined
          : wrap(p as string),
    },
  );
});

// ---------------------------------------------------------------------------
// In-memory DB state
// ---------------------------------------------------------------------------
interface NoteRow {
  id: number;
  clientId: number;
  title: string;
  body: string;
  sourceUrl: string | null;
  source: string;
  deletedAt: null | Date;
}

const state: { brainNotes: NoteRow[] } = { brainNotes: [] };

function tableArray(name: string): NoteRow[] {
  if (name === 'brainNotes') return state.brainNotes;
  return [];
}

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
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const list = (f.list ?? []) as unknown[];
      return list.includes(row[col.__col]);
    }
    case 'isNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === null || row[col.__col] === undefined;
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
    const r = ref as { __col?: string } | undefined;
    out[alias] = r?.__col ? row[r.__col] : undefined;
  }
  return out;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;

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
      const rows = (tableArray(activeTable) as Array<Record<string, unknown>>).filter((r) =>
        evalPredicate(filter, r),
      );
      let out = rows.map((r) => projectRow(r, projection));
      if (limitVal !== null) out = out.slice(0, limitVal);
      return Promise.resolve(out);
    }

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
    },
  };
});

// ---------------------------------------------------------------------------
// Non-DB collaborators
// ---------------------------------------------------------------------------
const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (args: unknown) => resolveClientApiKeyMock(args),
}));

const recordAiUsageMock = vi.fn(async () => undefined);
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (args: unknown) => recordAiUsageMock(args),
}));

const logAuditMock = vi.fn(async () => undefined);
vi.mock('@/lib/brain/audit', () => ({
  logAudit: (args: unknown) => logAuditMock(args),
}));

// ---------------------------------------------------------------------------
// Module under test (dynamic import after all vi.mock hoisting completes)
// ---------------------------------------------------------------------------
const { classifyNotes } = await import('@/lib/brain/classify-notes');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
let _idSeq = 1;
function nextId(): number {
  return _idSeq++;
}

/** Build a minimal NoteRow and push it into state.brainNotes. */
function seedNote(overrides: Partial<NoteRow> = {}): NoteRow {
  const row: NoteRow = {
    id: nextId(),
    clientId: 1,
    title: 'Test note',
    body: 'Some body text',
    sourceUrl: null,
    source: 'manual',
    deletedAt: null,
    ...overrides,
  };
  state.brainNotes.push(row);
  return row;
}

/** Build a minimal valid Claude text response; caller can override fields. */
function claudeClassification(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    source: 'industry-news',
    slateAreas: [],
    audiences: ['slate-admin'],
    contentType: 'reference',
    recency: 'evergreen',
    competitor: null,
    status: 'canonical',
    confidence: 0.9,
    reasoning: 'Clearly a reference article.',
    ...overrides,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(base) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

beforeEach(() => {
  state.brainNotes.length = 0;
  _idSeq = 1;

  messagesCreateMock.mockReset();
  anthropicCtorSpy.mockReset();
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  logAuditMock.mockReset().mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Early-exit branches
// ---------------------------------------------------------------------------
describe('classifyNotes — early exits', () => {
  it('throws when both noteIds and all are supplied', async () => {
    await expect(
      classifyNotes({ clientId: 1, noteIds: [1], all: true }),
    ).rejects.toThrow('mutually exclusive');
  });

  it('returns empty result when neither noteIds nor all is supplied', async () => {
    const result = await classifyNotes({ clientId: 1 });
    expect(result).toEqual({
      classifications: [],
      skipped: [],
      tokensUsed: 0,
      costUsd: 0,
    });
    expect(resolveClientApiKeyMock).not.toHaveBeenCalled();
  });

  it('returns empty result when noteIds is an empty array', async () => {
    const result = await classifyNotes({ clientId: 1, noteIds: [] });
    expect(result).toEqual({
      classifications: [],
      skipped: [],
      tokensUsed: 0,
      costUsd: 0,
    });
    expect(resolveClientApiKeyMock).not.toHaveBeenCalled();
  });

  it('returns empty result when all=true but no rows exist for tenant', async () => {
    const result = await classifyNotes({ clientId: 99, all: true });
    expect(result).toEqual({
      classifications: [],
      skipped: [],
      tokensUsed: 0,
      costUsd: 0,
    });
    expect(resolveClientApiKeyMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy-path: noteIds mode
// ---------------------------------------------------------------------------
describe('classifyNotes — noteIds mode', () => {
  it('classifies a single note and returns a NoteClassification', async () => {
    const note = seedNote({ title: 'Enrollment trends 2025' });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    const c = result.classifications[0];
    expect(c.noteId).toBe(note.id);
    expect(c.source).toBe('industry-news');
    expect(c.contentType).toBe('reference');
    expect(c.recency).toBe('evergreen');
    expect(c.status).toBe('canonical');
    expect(c.confidence).toBe(0.9);
    expect(c.competitor).toBeNull();
  });

  it('scopes DB query to clientId — does not return notes from another tenant', async () => {
    seedNote({ clientId: 2, id: 999 }); // different tenant
    const ownNote = seedNote({ clientId: 1 });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [999, ownNote.id] });

    // Only the tenant-matching note is returned from the DB mock.
    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].noteId).toBe(ownNote.id);
  });

  it('does not return soft-deleted notes', async () => {
    const deleted = seedNote({ deletedAt: new Date('2025-01-01') });

    const result = await classifyNotes({ clientId: 1, noteIds: [deleted.id] });

    expect(result.classifications).toHaveLength(0);
    expect(resolveClientApiKeyMock).not.toHaveBeenCalled();
  });

  it('classifies multiple notes in parallel (all succeed)', async () => {
    const n1 = seedNote({ title: 'Note A' });
    const n2 = seedNote({ title: 'Note B' });
    messagesCreateMock
      .mockResolvedValueOnce(claudeClassification({ source: 'slate-kb', contentType: 'how-to' }))
      .mockResolvedValueOnce(claudeClassification({ source: 'own-marketing', contentType: 'service-page' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [n1.id, n2.id] });

    expect(result.classifications).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
  });

  it('uses the resolved API key to construct the Anthropic client', async () => {
    const note = seedNote();
    resolveClientApiKeyMock.mockResolvedValue({ source: 'byok', key: 'sk-custom' });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(anthropicCtorSpy).toHaveBeenCalledWith({ apiKey: 'sk-custom' });
  });
});

// ---------------------------------------------------------------------------
// Happy-path: all mode
// ---------------------------------------------------------------------------
describe('classifyNotes — all mode', () => {
  it('classifies all active notes for the tenant', async () => {
    const n1 = seedNote({ title: 'Alpha' });
    const n2 = seedNote({ title: 'Beta' });
    // Deleted note — should be excluded.
    seedNote({ deletedAt: new Date('2025-01-01') });

    messagesCreateMock
      .mockResolvedValueOnce(claudeClassification())
      .mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, all: true });

    expect(result.classifications).toHaveLength(2);
    const ids = result.classifications.map((c) => c.noteId);
    expect(ids).toContain(n1.id);
    expect(ids).toContain(n2.id);
  });

  it('respects the limit option when all=true', async () => {
    for (let i = 0; i < 5; i++) seedNote();
    messagesCreateMock.mockResolvedValue(claudeClassification());

    const result = await classifyNotes({ clientId: 1, all: true, limit: 3 });

    // DB returns at most 3 rows (limit applied by the mock chain).
    expect(messagesCreateMock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.classifications.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Token accounting + cost calculation
// ---------------------------------------------------------------------------
describe('classifyNotes — token accounting', () => {
  it('accumulates input + output tokens and computes costUsd correctly', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce({ ...claudeClassification(), usage: { input_tokens: 1000, output_tokens: 200 } });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.tokensUsed).toBe(1200);
    // costUsd = 1000*(1/1M) + 200*(5/1M)
    expect(result.costUsd).toBeCloseTo(1000 / 1_000_000 + (200 * 5) / 1_000_000, 8);
  });

  it('includes cache_read and cache_creation tokens in tokensUsed', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce({
      ...claudeClassification(),
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 300, cache_creation_input_tokens: 200 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.tokensUsed).toBe(650); // 100+50+300+200
    // costUsd = 100*(1/1M) + 50*(5/1M) + 200*(1.25/1M) + 300*(0.1/1M)
    const expected = 100 / 1_000_000 + (50 * 5) / 1_000_000 + (200 * 1.25) / 1_000_000 + (300 * 0.1) / 1_000_000;
    expect(result.costUsd).toBeCloseTo(expected, 8);
  });

  it('handles zero-token usage gracefully', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce({ ...claudeClassification(), usage: {} });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.tokensUsed).toBe(0);
    expect(result.costUsd).toBe(0);
  });

  it('fires recordAiUsage with the correct source and token count', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce({ ...claudeClassification(), usage: { input_tokens: 400, output_tokens: 100 } });
    resolveClientApiKeyMock.mockResolvedValue({ source: 'platform', key: 'sk-test' });

    await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 1, source: 'platform', tokens: 500 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling / skip path
// ---------------------------------------------------------------------------
describe('classifyNotes — error handling', () => {
  it('skips a note when the AI call throws and still classifies the rest', async () => {
    const bad = seedNote({ title: 'Failing note' });
    const good = seedNote({ title: 'Good note' });

    messagesCreateMock
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [bad.id, good.id] });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].noteId).toBe(bad.id);
    expect(result.skipped[0].reason).toContain('rate limit exceeded');
    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].noteId).toBe(good.id);
  });

  it('skips a note when AI returns no text content block', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 't', name: 'noop', input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('no text content');
  });

  it('skips a note when AI returns malformed JSON', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all {{{' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].noteId).toBe(note.id);
  });

  it('skips a note when AI returns JSON with invalid enum values', async () => {
    const note = seedNote();
    const badJson = JSON.stringify({ source: 'INVALID_SOURCE', slateAreas: [], audiences: [], contentType: 'how-to', recency: 'evergreen', competitor: null, status: 'draft', confidence: 0.5 });
    messagesCreateMock.mockResolvedValueOnce({ content: [{ type: 'text', text: badJson }], usage: { input_tokens: 10, output_tokens: 10 } });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.skipped).toHaveLength(1);
  });

  it('truncates long error messages to 300 chars in the skipped reason', async () => {
    const note = seedNote();
    messagesCreateMock.mockRejectedValueOnce(new Error('x'.repeat(400)));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.skipped[0].reason.length).toBeLessThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// parseClassification / unfence — exercised indirectly via classifyNotes
// ---------------------------------------------------------------------------
describe('classifyNotes — parseClassification / unfence', () => {
  it('strips ```json fences from model output', async () => {
    const note = seedNote();
    const json = JSON.stringify({ source: 'slate-kb', slateAreas: ['queries'], audiences: ['slate-admin'], contentType: 'how-to', recency: 'evergreen', competitor: null, status: 'canonical', confidence: 0.85 });
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + json + '\n```' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].source).toBe('slate-kb');
  });

  it('strips bare ``` fences (no language tag) from model output', async () => {
    const note = seedNote();
    const json = JSON.stringify({ source: 'own-marketing', slateAreas: [], audiences: ['prospect-facing'], contentType: 'service-page', recency: 'current-12mo', competitor: null, status: 'draft', confidence: 0.75 });
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```\n' + json + '\n```' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].source).toBe('own-marketing');
  });

  it('extracts JSON when model wraps it in prose', async () => {
    const note = seedNote();
    const json = JSON.stringify({ source: 'research-brief', slateAreas: [], audiences: [], contentType: 'reference', recency: 'archive', competitor: null, status: 'stub', confidence: 0.4 });
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Here is my answer: ' + json + ' Hope that helps.' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].source).toBe('research-brief');
  });

  it('clamps competitor to null when source != competitor', async () => {
    const note = seedNote();
    // Model incorrectly returns a competitor slug with source=industry-news.
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ source: 'industry-news', slateAreas: [], audiences: [], contentType: 'news', recency: 'current-12mo', competitor: 'carnegie', status: 'draft', confidence: 0.6 }) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications[0].source).toBe('industry-news');
    // Clamped to null because source != 'competitor'.
    expect(result.classifications[0].competitor).toBeNull();
  });

  it('preserves competitor slug when source=competitor', async () => {
    const note = seedNote({ sourceUrl: 'https://carnegiehighered.com/blog' });
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ source: 'competitor', slateAreas: [], audiences: [], contentType: 'case-study', recency: 'current-12mo', competitor: 'carnegie', status: 'canonical', confidence: 0.92 }) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications[0].source).toBe('competitor');
    expect(result.classifications[0].competitor).toBe('carnegie');
  });
});

// ---------------------------------------------------------------------------
// buildPrefillHints / extractDomain / competitorFromDomain — via noteId mode
// ---------------------------------------------------------------------------
describe('classifyNotes — URL-based prefill hints', () => {
  it('processes a note with a competitor domain URL without error', async () => {
    const note = seedNote({ sourceUrl: 'https://www.carnegiehighered.com/solutions' });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification({ source: 'competitor', competitor: 'carnegie', contentType: 'case-study' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    // Verify Anthropic was called with a user message referencing the hint
    const callArgs = messagesCreateMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userContent = callArgs.messages[0].content;
    expect(userContent).toContain('carnegie');
  });

  it('processes a note with a subdomain competitor URL (blog.carnegiehighered.com)', async () => {
    const note = seedNote({ sourceUrl: 'https://blog.carnegiehighered.com/article' });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification({ source: 'competitor', competitor: 'carnegie', contentType: 'news' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    const callArgs = messagesCreateMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    expect(callArgs.messages[0].content).toContain('carnegie');
  });

  it('processes a note with a technolutions URL (slate-kb hint)', async () => {
    const note = seedNote({
      sourceUrl: 'https://technolutions.com/docs/queries',
      source: 'document_import',
    });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification({ source: 'slate-kb', contentType: 'reference' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    const callArgs = messagesCreateMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    expect(callArgs.messages[0].content).toContain('slate-kb');
  });

  it('processes a note with a document_import source and non-technolutions URL (research-brief hint)', async () => {
    const note = seedNote({
      sourceUrl: 'https://eab.com/research/enrollment',
      source: 'document_import',
    });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification({ source: 'research-brief', contentType: 'reference' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    const callArgs = messagesCreateMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    expect(callArgs.messages[0].content).toContain('research-brief');
  });

  it('processes a note with null sourceUrl without crashing', async () => {
    const note = seedNote({ sourceUrl: null });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
  });

  it('handles a malformed URL in sourceUrl gracefully (falls back to no hint)', async () => {
    const note = seedNote({ sourceUrl: 'not-a-url' });
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------
describe('classifyNotes — audit logging', () => {
  it('fires logAudit once per classifyNotes call with correct action + metadata', async () => {
    const n1 = seedNote();
    const n2 = seedNote();
    messagesCreateMock
      .mockResolvedValueOnce(claudeClassification())
      .mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, noteIds: [n1.id, n2.id], actorId: 7 });

    expect(logAuditMock).toHaveBeenCalledTimes(1);
    const auditArg = logAuditMock.mock.calls[0][0] as {
      clientId: number;
      actorId: number | null;
      action: string;
      entityType: string;
      metadata: { count: number; skipped: number };
    };
    expect(auditArg.clientId).toBe(1);
    expect(auditArg.actorId).toBe(7);
    expect(auditArg.action).toBe('brain_notes.classify_batch');
    expect(auditArg.entityType).toBe('brain_notes');
    expect(auditArg.metadata.count).toBe(2);
    expect(auditArg.metadata.skipped).toBe(0);
  });

  it('sets actorId to null when not supplied (system/cron path)', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, noteIds: [note.id] });

    const auditArg = logAuditMock.mock.calls[0][0] as { actorId: null };
    expect(auditArg.actorId).toBeNull();
  });

  it('records mode=all in audit metadata when all=true', async () => {
    seedNote();
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, all: true });

    const auditArg = logAuditMock.mock.calls[0][0] as {
      metadata: { mode: string };
    };
    expect(auditArg.metadata.mode).toBe('all');
  });

  it('records mode=noteIds in audit metadata when noteIds supplied', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, noteIds: [note.id] });

    const auditArg = logAuditMock.mock.calls[0][0] as {
      metadata: { mode: string };
    };
    expect(auditArg.metadata.mode).toBe('noteIds');
  });

  it('records skipped count correctly in audit metadata', async () => {
    const failing = seedNote();
    messagesCreateMock.mockRejectedValueOnce(new Error('timeout'));

    await classifyNotes({ clientId: 1, noteIds: [failing.id] });

    const auditArg = logAuditMock.mock.calls[0][0] as {
      metadata: { count: number; skipped: number };
    };
    expect(auditArg.metadata.count).toBe(0);
    expect(auditArg.metadata.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pLimit concurrency — exercised via concurrency option
// ---------------------------------------------------------------------------
describe('classifyNotes — concurrency limiter', () => {
  it('respects concurrency=1 (sequential) without crashing or dropping results', async () => {
    const n1 = seedNote({ title: 'A' });
    const n2 = seedNote({ title: 'B' });
    const n3 = seedNote({ title: 'C' });
    messagesCreateMock
      .mockResolvedValueOnce(claudeClassification())
      .mockResolvedValueOnce(claudeClassification())
      .mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [n1.id, n2.id, n3.id], concurrency: 1 });

    expect(result.classifications).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
  });

  it('caps concurrency at MAX_CONCURRENCY=8 (no crash when 99 requested)', async () => {
    const note = seedNote();
    messagesCreateMock.mockResolvedValueOnce(claudeClassification());

    // Passes concurrency=99 — module clamps to 8 internally, should not throw.
    const result = await classifyNotes({ clientId: 1, noteIds: [note.id], concurrency: 99 });

    expect(result.classifications).toHaveLength(1);
  });
});
