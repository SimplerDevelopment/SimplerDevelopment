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
const completeObjectMock = vi.fn();

vi.mock('@/lib/ai/llm', () => ({
  complete: vi.fn(),
  completeObject: (...args: unknown[]) => completeObjectMock(...args),
  streamComplete: vi.fn(),
}));

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

/** Build a minimal valid seam completeObject response; caller can override fields. */
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
    object: base,
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  };
}

beforeEach(() => {
  state.brainNotes.length = 0;
  _idSeq = 1;

  completeObjectMock.mockReset();
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
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

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
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

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
    completeObjectMock
      .mockResolvedValueOnce(claudeClassification({ source: 'slate-kb', contentType: 'how-to' }))
      .mockResolvedValueOnce(claudeClassification({ source: 'own-marketing', contentType: 'service-page' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [n1.id, n2.id] });

    expect(result.classifications).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(completeObjectMock).toHaveBeenCalledTimes(2);
  });

  it('passes the task tag and clientId to the seam on each call', async () => {
    const note = seedNote();
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(completeObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'classifyNotes', clientId: 1 }),
    );
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

    completeObjectMock
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
    completeObjectMock.mockResolvedValue(claudeClassification());

    const result = await classifyNotes({ clientId: 1, all: true, limit: 3 });

    // DB returns at most 3 rows (limit applied by the mock chain).
    expect(completeObjectMock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.classifications.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Token accounting + cost calculation
// ---------------------------------------------------------------------------
describe('classifyNotes — token accounting', () => {
  it('accumulates input + output tokens and computes costUsd correctly', async () => {
    const note = seedNote();
    completeObjectMock.mockResolvedValueOnce({
      ...claudeClassification(),
      usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.tokensUsed).toBe(1200);
    // costUsd = 1000*(3/1M) + 200*(15/1M) — per classify-notes.ts rate constants
    expect(result.costUsd).toBeCloseTo((1000 * 3) / 1_000_000 + (200 * 15) / 1_000_000, 8);
  });

  it('accumulates tokens across multiple notes', async () => {
    const n1 = seedNote();
    const n2 = seedNote();
    completeObjectMock
      .mockResolvedValueOnce({ ...claudeClassification(), usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } })
      .mockResolvedValueOnce({ ...claudeClassification(), usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 } });

    const result = await classifyNotes({ clientId: 1, noteIds: [n1.id, n2.id] });

    expect(result.tokensUsed).toBe(450); // (100+50) + (200+100)
  });

  it('handles zero-token usage gracefully', async () => {
    const note = seedNote();
    completeObjectMock.mockResolvedValueOnce({
      ...claudeClassification(),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.tokensUsed).toBe(0);
    expect(result.costUsd).toBe(0);
  });

  it('fires recordAiUsage with the correct token count', async () => {
    const note = seedNote();
    completeObjectMock.mockResolvedValueOnce({
      ...claudeClassification(),
      usage: { inputTokens: 400, outputTokens: 100, totalTokens: 500 },
    });

    await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 1, tokens: 500 }),
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

    completeObjectMock
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [bad.id, good.id] });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].noteId).toBe(bad.id);
    expect(result.skipped[0].reason).toContain('rate limit exceeded');
    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].noteId).toBe(good.id);
  });

  it('skips a note when the seam throws (e.g. schema validation failure)', async () => {
    // completeObject uses generateObject which throws on parse/validation failure.
    const note = seedNote();
    completeObjectMock.mockRejectedValueOnce(new Error('no text content block returned'));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('no text content');
  });

  it('skips a note when seam throws a JSON parse error', async () => {
    const note = seedNote();
    completeObjectMock.mockRejectedValueOnce(new Error('JSON parse error'));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].noteId).toBe(note.id);
  });

  it('skips a note when seam throws a Zod validation error (invalid enum)', async () => {
    // generateObject with a strict Zod schema throws on invalid enum values.
    const note = seedNote();
    completeObjectMock.mockRejectedValueOnce(new Error('Zod validation: invalid enum value for source'));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.skipped).toHaveLength(1);
  });

  it('truncates long error messages to 300 chars in the skipped reason', async () => {
    const note = seedNote();
    completeObjectMock.mockRejectedValueOnce(new Error('x'.repeat(400)));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.skipped[0].reason.length).toBeLessThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// parseClassification / unfence — exercised indirectly via classifyNotes
// ---------------------------------------------------------------------------
describe('classifyNotes — competitor clamping invariant', () => {
  // The fence-stripping / JSON-extraction logic now lives inside the AI SDK's
  // generateObject. These tests focus on what the source code itself does with
  // the parsed object: the "competitor only when source=competitor" invariant.

  it('classifies a note and returns a NoteClassification with all seam-returned fields', async () => {
    const note = seedNote();
    completeObjectMock.mockResolvedValueOnce(
      claudeClassification({ source: 'slate-kb', slateAreas: ['queries'], audiences: ['slate-admin'], contentType: 'how-to', confidence: 0.85 }),
    );

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].source).toBe('slate-kb');
  });

  it('clamps competitor to null when source != competitor', async () => {
    const note = seedNote();
    // Seam returns an object with competitor set but source != 'competitor'.
    completeObjectMock.mockResolvedValueOnce({
      object: { source: 'industry-news', slateAreas: [], audiences: [], contentType: 'news', recency: 'current-12mo', competitor: 'carnegie', status: 'draft', confidence: 0.6 },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    });

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications[0].source).toBe('industry-news');
    // Clamped to null because source != 'competitor'.
    expect(result.classifications[0].competitor).toBeNull();
  });

  it('preserves competitor slug when source=competitor', async () => {
    const note = seedNote({ sourceUrl: 'https://carnegiehighered.com/blog' });
    completeObjectMock.mockResolvedValueOnce({
      object: { source: 'competitor', slateAreas: [], audiences: [], contentType: 'case-study', recency: 'current-12mo', competitor: 'carnegie', status: 'canonical', confidence: 0.92 },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
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
  it('passes a hint containing "carnegie" for a competitor domain URL', async () => {
    const note = seedNote({ sourceUrl: 'https://www.carnegiehighered.com/solutions' });
    completeObjectMock.mockResolvedValueOnce(claudeClassification({ source: 'competitor', competitor: 'carnegie', contentType: 'case-study' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    // Verify the seam was called with a prompt referencing the hint.
    const callArgs = completeObjectMock.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain('carnegie');
  });

  it('passes a hint containing "carnegie" for a subdomain competitor URL', async () => {
    const note = seedNote({ sourceUrl: 'https://blog.carnegiehighered.com/article' });
    completeObjectMock.mockResolvedValueOnce(claudeClassification({ source: 'competitor', competitor: 'carnegie', contentType: 'news' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    const callArgs = completeObjectMock.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain('carnegie');
  });

  it('passes a "slate-kb" hint for a technolutions URL', async () => {
    const note = seedNote({
      sourceUrl: 'https://technolutions.com/docs/queries',
      source: 'document_import',
    });
    completeObjectMock.mockResolvedValueOnce(claudeClassification({ source: 'slate-kb', contentType: 'reference' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    const callArgs = completeObjectMock.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain('slate-kb');
  });

  it('passes a "research-brief" hint for document_import with non-technolutions URL', async () => {
    const note = seedNote({
      sourceUrl: 'https://eab.com/research/enrollment',
      source: 'document_import',
    });
    completeObjectMock.mockResolvedValueOnce(claudeClassification({ source: 'research-brief', contentType: 'reference' }));

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
    const callArgs = completeObjectMock.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain('research-brief');
  });

  it('processes a note with null sourceUrl without crashing', async () => {
    const note = seedNote({ sourceUrl: null });
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [note.id] });

    expect(result.classifications).toHaveLength(1);
  });

  it('handles a malformed URL in sourceUrl gracefully (falls back to no hint)', async () => {
    const note = seedNote({ sourceUrl: 'not-a-url' });
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

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
    completeObjectMock
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
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, noteIds: [note.id] });

    const auditArg = logAuditMock.mock.calls[0][0] as { actorId: null };
    expect(auditArg.actorId).toBeNull();
  });

  it('records mode=all in audit metadata when all=true', async () => {
    seedNote();
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, all: true });

    const auditArg = logAuditMock.mock.calls[0][0] as {
      metadata: { mode: string };
    };
    expect(auditArg.metadata.mode).toBe('all');
  });

  it('records mode=noteIds in audit metadata when noteIds supplied', async () => {
    const note = seedNote();
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

    await classifyNotes({ clientId: 1, noteIds: [note.id] });

    const auditArg = logAuditMock.mock.calls[0][0] as {
      metadata: { mode: string };
    };
    expect(auditArg.metadata.mode).toBe('noteIds');
  });

  it('records skipped count correctly in audit metadata', async () => {
    const failing = seedNote();
    completeObjectMock.mockRejectedValueOnce(new Error('timeout'));

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
    completeObjectMock
      .mockResolvedValueOnce(claudeClassification())
      .mockResolvedValueOnce(claudeClassification())
      .mockResolvedValueOnce(claudeClassification());

    const result = await classifyNotes({ clientId: 1, noteIds: [n1.id, n2.id, n3.id], concurrency: 1 });

    expect(result.classifications).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
  });

  it('caps concurrency at MAX_CONCURRENCY=8 (no crash when 99 requested)', async () => {
    const note = seedNote();
    completeObjectMock.mockResolvedValueOnce(claudeClassification());

    // Passes concurrency=99 — module clamps to 8 internally, should not throw.
    const result = await classifyNotes({ clientId: 1, noteIds: [note.id], concurrency: 99 });

    expect(result.classifications).toHaveLength(1);
  });
});
