// @vitest-environment node
/**
 * Unit tests for lib/brain/embeddings.ts.
 *
 * Mocks the DB layer (db.execute / db.transaction), the resolve-client-key +
 * audit modules, the embedding-extractors dynamic import, and global fetch
 * (for the OpenAI embeddings endpoint). Tests cover chunkMarkdown (pure),
 * embedText, embedEntity, embedManyEntities, removeEmbeddings, embedById, and
 * searchSemantic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ExecCall {
  kind: 'execute' | 'tx-execute';
  strings: readonly string[];
  values: unknown[];
}

const state: {
  execCalls: ExecCall[];
  txCalls: number;
  searchRows: Array<Record<string, unknown>>;
  extractorImpl: ((clientId: number, type: string, id: number) => Promise<{ text: string; found: boolean }>) | null;
  recordAiUsageCalls: Array<Record<string, unknown>>;
  resolveClientKeyImpl: ((opts: Record<string, unknown>) => Promise<{ key: string; source: 'byok' | 'platform' }>) | null;
} = {
  execCalls: [],
  txCalls: 0,
  searchRows: [],
  extractorImpl: null,
  recordAiUsageCalls: [],
  resolveClientKeyImpl: null,
};

vi.mock('drizzle-orm', () => {
  function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
    return { __sql: true, strings: Array.from(strings), values };
  }
  // sql.raw — just wraps a string so we can detect raw IN-lists in tests.
  (sqlTag as unknown as { raw: (s: string) => unknown }).raw = (s: string) => ({ __sqlRaw: s });
  return { sql: sqlTag };
});

vi.mock('@/lib/db', () => {
  return {
    db: {
      async execute(query: { strings: string[]; values: unknown[] }) {
        state.execCalls.push({ kind: 'execute', strings: query.strings, values: query.values });
        // For the SELECT in searchSemantic, return seeded rows.
        const joined = query.strings.join(' ');
        if (joined.includes('FROM brain_embeddings') && joined.includes('SELECT')) {
          return state.searchRows;
        }
        return [];
      },
      async transaction(fn: (tx: { execute: (q: { strings: string[]; values: unknown[] }) => Promise<unknown> }) => Promise<unknown>) {
        state.txCalls++;
        const tx = {
          async execute(query: { strings: string[]; values: unknown[] }) {
            state.execCalls.push({ kind: 'tx-execute', strings: query.strings, values: query.values });
            return [];
          },
        };
        return fn(tx);
      },
    },
  };
});

vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: vi.fn(async (opts: Record<string, unknown>) => {
    if (state.resolveClientKeyImpl) return state.resolveClientKeyImpl(opts);
    return { key: 'sk-byok-test', source: 'byok' as const };
  }),
}));

vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: vi.fn(async (args: Record<string, unknown>) => {
    state.recordAiUsageCalls.push(args);
  }),
}));

vi.mock('@/lib/brain/embedding-extractors', () => ({
  extractContentForEntity: vi.fn(async (clientId: number, type: string, id: number) => {
    if (state.extractorImpl) return state.extractorImpl(clientId, type, id);
    return { text: '', found: false };
  }),
}));

// We mock the relative path used inside embeddings.ts's dynamic imports
// (`await import('./embedding-extractors')`). Vitest resolves it relative to
// the source file, so this absolute alias also needs covering.
vi.mock('./embedding-extractors', () => ({
  extractContentForEntity: vi.fn(async (clientId: number, type: string, id: number) => {
    if (state.extractorImpl) return state.extractorImpl(clientId, type, id);
    return { text: '', found: false };
  }),
}));

// Helper to install a fake fetch returning a configurable OpenAI response.
function installFetchMock(opts: {
  vectors?: number[][];
  totalTokens?: number;
  ok?: boolean;
  status?: number;
  bodyText?: string;
  throwError?: boolean;
} = {}) {
  const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
    if (opts.throwError) throw new Error('network down');
    const body = JSON.parse((init.body as string) || '{}') as { input: string[] };
    if (opts.ok === false) {
      return {
        ok: false,
        status: opts.status ?? 500,
        async text() { return opts.bodyText ?? 'boom'; },
        async json() { return {}; },
      } as unknown as Response;
    }
    const vectors = opts.vectors ?? body.input.map(() => [0.1, 0.2, 0.3]);
    const data = body.input.map((_text, idx) => ({ embedding: vectors[idx], index: idx }));
    const totalTokens = opts.totalTokens ?? body.input.reduce((s, t) => s + Math.ceil(t.length / 4), 0);
    return {
      ok: true,
      status: 200,
      async text() { return ''; },
      async json() {
        return { data, usage: { prompt_tokens: totalTokens, total_tokens: totalTokens } };
      },
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

beforeEach(() => {
  state.execCalls.length = 0;
  state.txCalls = 0;
  state.searchRows = [];
  state.extractorImpl = null;
  state.recordAiUsageCalls.length = 0;
  state.resolveClientKeyImpl = null;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function importModule() {
  return await import('@/lib/brain/embeddings');
}

// ---------------------------------------------------------------------------
// chunkMarkdown (pure function)
// ---------------------------------------------------------------------------

describe('chunkMarkdown', () => {
  it('returns [] for empty / whitespace-only input', async () => {
    const { chunkMarkdown } = await importModule();
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('   \n\n\t ')).toEqual([]);
  });

  it('returns single chunk for short text under target', async () => {
    const { chunkMarkdown } = await importModule();
    const out = chunkMarkdown('Hello world');
    expect(out).toEqual(['Hello world']);
  });

  it('splits long text on H2 headings', async () => {
    const { chunkMarkdown } = await importModule();
    // Build text well above TARGET_CHARS (2000) so the section-split path activates.
    const big = 'x'.repeat(800);
    const md = `## Section A\n\n${big}\n\n## Section B\n\n${big}\n\n## Section C\n\n${big}`;
    const out = chunkMarkdown(md);
    expect(out.length).toBeGreaterThanOrEqual(2);
    // Every chunk should start with the heading marker for at least one of them.
    expect(out.some((c) => c.startsWith('## Section'))).toBe(true);
  });

  it('splits oversize sections by paragraphs with overlap', async () => {
    const { chunkMarkdown } = await importModule();
    // One section well over TARGET_CHARS (2000) made of many distinct paragraphs.
    const paragraph = 'sentence. '.repeat(40); // ~400 chars
    const md = `## Big\n\n${Array(10).fill(paragraph).join('\n\n')}`;
    const out = chunkMarkdown(md);
    expect(out.length).toBeGreaterThan(1);
    // No chunk should be empty.
    for (const c of out) expect(c.length).toBeGreaterThan(0);
  });

  it('hard-splits monster paragraphs that exceed TARGET_CHARS', async () => {
    const { chunkMarkdown } = await importModule();
    // Paragraph way over TARGET_CHARS with newline-separable lines inside.
    const line = 'a'.repeat(500);
    const monsterParagraph = Array(8).fill(line).join('\n');
    const md = `## Mono\n\n${monsterParagraph}`;
    const out = chunkMarkdown(md);
    expect(out.length).toBeGreaterThan(1);
  });

  it('hard-windows a single line that is itself larger than maxChars', async () => {
    const { chunkMarkdown } = await importModule();
    // One newline-less paragraph way over TARGET_CHARS.
    const oneLine = 'q'.repeat(5000);
    const out = chunkMarkdown(`## H\n\n${oneLine}`);
    expect(out.length).toBeGreaterThan(1);
    // No chunk should exceed HARD_MAX_CHARS (28000).
    for (const c of out) expect(c.length).toBeLessThanOrEqual(28000);
  });

  it('falls through HARD_MAX safety net for very long single chunks', async () => {
    const { chunkMarkdown } = await importModule();
    // Force an enormous single-section input with no paragraph breaks.
    const oneLine = 'r'.repeat(35000); // > HARD_MAX_CHARS (28000)
    const out = chunkMarkdown(oneLine);
    // Should have been hard-windowed.
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(28000);
  });
});

// ---------------------------------------------------------------------------
// embedText
// ---------------------------------------------------------------------------

describe('embedText', () => {
  it('throws for unimplemented providers', async () => {
    const { embedText } = await importModule();
    await expect(embedText(['hi'], { provider: 'voyage' })).rejects.toThrow(/not yet implemented/);
    await expect(embedText(['hi'], { provider: 'cohere' })).rejects.toThrow(/not yet implemented/);
  });

  it('throws when no clientId and OPENAI_API_KEY is unset', async () => {
    const { embedText } = await importModule();
    await expect(embedText(['hi'])).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('uses env key path when no clientId is supplied', async () => {
    process.env.OPENAI_API_KEY = 'sk-env-test';
    const fetchFn = installFetchMock({ vectors: [[1, 2, 3]], totalTokens: 12 });
    const { embedText } = await importModule();
    const out = await embedText(['hello']);
    expect(out).toHaveLength(1);
    expect(out[0].vector).toEqual([1, 2, 3]);
    expect(out[0].tokens).toBe(12);
    const callInit = fetchFn.mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>).Authorization).toBe('Bearer sk-env-test');
    // recordAiUsage should NOT have been called for env-key path (no clientId).
    expect(state.recordAiUsageCalls).toHaveLength(0);
  });

  it('uses BYOK resolution and records usage when clientId is supplied', async () => {
    const fetchFn = installFetchMock({ vectors: [[0.5, 0.5]], totalTokens: 8 });
    state.resolveClientKeyImpl = async () => ({ key: 'sk-byok', source: 'byok' });
    const { embedText } = await importModule();
    const out = await embedText(['ping'], { clientId: 42 });
    expect(out).toHaveLength(1);
    const callInit = fetchFn.mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>).Authorization).toBe('Bearer sk-byok');
    expect(state.recordAiUsageCalls).toHaveLength(1);
    expect(state.recordAiUsageCalls[0]).toMatchObject({ clientId: 42, source: 'byok', tokens: 8 });
  });

  it('throws when OpenAI returns non-ok status', async () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    installFetchMock({ ok: false, status: 429, bodyText: 'rate limited' });
    const { embedText } = await importModule();
    await expect(embedText(['oops'])).rejects.toThrow(/429.*rate limited/);
  });

  it('distributes tokens across inputs proportionally to char length', async () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    installFetchMock({
      vectors: [[1], [2]],
      totalTokens: 100,
    });
    const { embedText } = await importModule();
    // Input lengths: 10 and 30 → totalChars=40 → 100 * (10/40)=25, 100 * (30/40)=75.
    const out = await embedText(['x'.repeat(10), 'y'.repeat(30)]);
    expect(out[0].tokens).toBe(25);
    expect(out[1].tokens).toBe(75);
  });

  it('batches inputs at 100 per request', async () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    const fetchFn = installFetchMock();
    const { embedText } = await importModule();
    const inputs = Array.from({ length: 150 }, (_, i) => `item-${i}`);
    const out = await embedText(inputs);
    expect(out).toHaveLength(150);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns empty array for empty input list (zero fetch calls)', async () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    const fetchFn = installFetchMock();
    const { embedText } = await importModule();
    const out = await embedText([]);
    expect(out).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// embedEntity
// ---------------------------------------------------------------------------

describe('embedEntity', () => {
  it('returns {chunks:0, tokens:0} and runs a DELETE when content is empty', async () => {
    const { embedEntity } = await importModule();
    const res = await embedEntity({
      clientId: 1, entityType: 'note', entityId: 5, content: '   ',
    });
    expect(res).toEqual({ chunks: 0, tokens: 0 });
    // One execute call: the DELETE.
    expect(state.execCalls).toHaveLength(1);
    expect(state.execCalls[0].kind).toBe('execute');
    expect(state.execCalls[0].values).toContain('note');
    expect(state.execCalls[0].values).toContain(5);
  });

  it('chunks content, calls embedText, and writes one insert per chunk via transaction', async () => {
    // No explicit vectors → fetch mock returns default [0.1,0.2,0.3] per input,
    // which auto-scales to whatever chunk count the markdown produces.
    installFetchMock();
    const { embedEntity } = await importModule();
    // Two-section markdown that should produce 2 chunks.
    const big = 'p'.repeat(2200);
    const content = `## A\n\n${big}\n\n## B\n\n${big}`;
    const res = await embedEntity({
      clientId: 7,
      entityType: 'note',
      entityId: 100,
      content,
    });
    expect(res.chunks).toBeGreaterThanOrEqual(2);
    expect(state.txCalls).toBe(1);
    // tx executed: 1 DELETE + N INSERTs.
    const txExecs = state.execCalls.filter((c) => c.kind === 'tx-execute');
    expect(txExecs.length).toBeGreaterThanOrEqual(2);
    expect(res.tokens).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// embedManyEntities
// ---------------------------------------------------------------------------

describe('embedManyEntities', () => {
  it('short-circuits on empty id list', async () => {
    const { embedManyEntities } = await importModule();
    const res = await embedManyEntities({
      clientId: 1, entityType: 'contact', entityIds: [],
    });
    expect(res).toEqual({ entities: 0, chunks: 0, tokens: 0, skipped: 0 });
    expect(state.execCalls).toHaveLength(0);
  });

  it('counts missing entities as skipped and deletes their orphan vectors', async () => {
    state.extractorImpl = async (_c, _t, id) => {
      if (id === 1) return { text: '', found: false };
      if (id === 2) return { text: '', found: false };
      return { text: '', found: false };
    };
    const { embedManyEntities } = await importModule();
    const res = await embedManyEntities({
      clientId: 1, entityType: 'contact', entityIds: [1, 2],
    });
    expect(res.skipped).toBe(2);
    expect(res.entities).toBe(0);
    // Two execute deletes (one per missing entity, via removeEmbeddings).
    const deletes = state.execCalls.filter((c) => c.kind === 'execute');
    expect(deletes.length).toBeGreaterThanOrEqual(2);
  });

  it('skips entities whose content is empty after trim', async () => {
    state.extractorImpl = async () => ({ text: '   ', found: true });
    const { embedManyEntities } = await importModule();
    const res = await embedManyEntities({
      clientId: 1, entityType: 'contact', entityIds: [10],
    });
    expect(res.skipped).toBe(1);
    expect(res.entities).toBe(0);
  });

  it('embeds non-empty entities and reports counts', async () => {
    state.extractorImpl = async (_c, _t, id) => ({ text: `content for ${id}`, found: true });
    installFetchMock();
    const { embedManyEntities } = await importModule();
    const res = await embedManyEntities({
      clientId: 9, entityType: 'company', entityIds: [1, 2, 3],
    });
    expect(res.entities).toBe(3);
    expect(res.chunks).toBeGreaterThanOrEqual(3);
    expect(res.skipped).toBe(0);
    expect(state.txCalls).toBe(1);
  });

  it('returns zero-chunks result when all entities skipped (no transaction)', async () => {
    state.extractorImpl = async () => ({ text: '', found: false });
    const { embedManyEntities } = await importModule();
    const res = await embedManyEntities({
      clientId: 1, entityType: 'deal', entityIds: [11, 12],
    });
    expect(res.chunks).toBe(0);
    expect(state.txCalls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// removeEmbeddings
// ---------------------------------------------------------------------------

describe('removeEmbeddings', () => {
  it('runs a single DELETE against brain_embeddings with the right binds', async () => {
    const { removeEmbeddings } = await importModule();
    await removeEmbeddings('post', 314);
    expect(state.execCalls).toHaveLength(1);
    expect(state.execCalls[0].kind).toBe('execute');
    expect(state.execCalls[0].values).toContain('post');
    expect(state.execCalls[0].values).toContain(314);
  });
});

// ---------------------------------------------------------------------------
// embedById
// ---------------------------------------------------------------------------

describe('embedById', () => {
  it('returns null and cleans up orphan vectors when the entity is missing', async () => {
    state.extractorImpl = async () => ({ text: '', found: false });
    const { embedById } = await importModule();
    const res = await embedById({ clientId: 1, entityType: 'note', entityId: 5 });
    expect(res).toBeNull();
    // removeEmbeddings DELETE happened.
    expect(state.execCalls.some((c) => c.kind === 'execute')).toBe(true);
  });

  it('returns {chunks:0,tokens:0} and clears chunks when entity has only whitespace', async () => {
    state.extractorImpl = async () => ({ text: '\n  \t  ', found: true });
    const { embedById } = await importModule();
    const res = await embedById({ clientId: 1, entityType: 'deal', entityId: 9 });
    expect(res).toEqual({ chunks: 0, tokens: 0 });
  });

  it('delegates to embedEntity for non-empty content', async () => {
    state.extractorImpl = async () => ({ text: 'real content here', found: true });
    installFetchMock();
    const { embedById } = await importModule();
    const res = await embedById({ clientId: 1, entityType: 'note', entityId: 50 });
    expect(res).not.toBeNull();
    expect(res!.chunks).toBe(1);
    expect(state.txCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// searchSemantic
// ---------------------------------------------------------------------------

describe('searchSemantic', () => {
  it('returns [] when caller filters out every entity type', async () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    installFetchMock();
    const { searchSemantic } = await importModule();
    const res = await searchSemantic({
      clientId: 1,
      query: 'find me',
      // Pass a type the validator will strip — all results filtered out.
      entityTypes: ['not-a-real-type' as unknown as 'note'],
    });
    expect(res).toEqual([]);
  });

  it('embeds the query then queries pgvector and maps rows', async () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    installFetchMock({ vectors: [[0.1, 0.2]] });
    state.searchRows = [
      { entity_type: 'note', entity_id: 1, chunk_index: 0, content: 'hello', similarity: '0.92' },
      { entity_type: 'company', entity_id: 7, chunk_index: 2, content: 'world', similarity: 0.81 },
    ];
    const { searchSemantic } = await importModule();
    const res = await searchSemantic({ clientId: 1, query: 'q' });
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({
      entityType: 'note',
      entityId: 1,
      chunkIndex: 0,
      content: 'hello',
      similarity: 0.92,
    });
    expect(res[1].similarity).toBe(0.81);
  });

  it('clamps k between 1 and 200', async () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    installFetchMock({ vectors: [[0.1]] });
    state.searchRows = [];
    const { searchSemantic } = await importModule();
    // k below floor — gets clamped to 1.
    await searchSemantic({ clientId: 1, query: 'q', k: 0 });
    // k above ceiling — gets clamped to 200.
    await searchSemantic({ clientId: 1, query: 'q', k: 9999 });
    // Confirm two SELECT executes occurred against brain_embeddings.
    const selects = state.execCalls.filter(
      (c) => c.kind === 'execute' && c.strings.join(' ').includes('FROM brain_embeddings'),
    );
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it('filters provided entityTypes against the allowed list', async () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    installFetchMock({ vectors: [[0.1]] });
    state.searchRows = [];
    const { searchSemantic } = await importModule();
    const res = await searchSemantic({
      clientId: 1,
      query: 'q',
      entityTypes: ['note', 'meeting'],
    });
    expect(res).toEqual([]);
    // Validate a SELECT did run (types intersected with allowed, non-empty).
    const selects = state.execCalls.filter(
      (c) => c.kind === 'execute' && c.strings.join(' ').includes('FROM brain_embeddings'),
    );
    expect(selects.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ALL_ENTITY_TYPES constant
// ---------------------------------------------------------------------------

describe('ALL_ENTITY_TYPES', () => {
  it('lists exactly the 8 supported entity types', async () => {
    const { ALL_ENTITY_TYPES } = await importModule();
    expect(ALL_ENTITY_TYPES).toEqual([
      'note', 'meeting', 'relationship', 'task',
      'company', 'contact', 'deal', 'post',
    ]);
  });
});
