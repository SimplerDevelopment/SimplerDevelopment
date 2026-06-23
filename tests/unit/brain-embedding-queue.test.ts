// @vitest-environment node
/**
 * Unit tests for lib/brain/embedding-queue.ts.
 *
 * Mocks the DB layer (db.execute), the drizzle-orm sql tag/helpers, the
 * './embeddings' module (embedById is the worker callback), and silences the
 * console.warn calls in the catch branches.
 *
 * Covers enqueueEmbedding, enqueueEmbeddingsBulk, drainQueue (success +
 * failure + retry + empty pick + concurrency limits), and getQueueStats.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ExecCall {
  strings: readonly string[];
  values: unknown[];
  joined: string;
}

type ExecuteHandler = (call: ExecCall) => unknown;

const state: {
  execCalls: ExecCall[];
  // Handlers fire in order: each handler matches a call and returns rows.
  // When no handler matches, the default behaviour is to return [].
  executeHandlers: ExecuteHandler[];
  embedByIdCalls: Array<{ clientId: number; entityType: string; entityId: number }>;
  embedByIdImpl: (args: { clientId: number; entityType: string; entityId: number }) => Promise<unknown>;
  warnCalls: Array<unknown[]>;
} = {
  execCalls: [],
  executeHandlers: [],
  embedByIdCalls: [],
  embedByIdImpl: async () => ({ chunks: 1, tokens: 10 }),
  warnCalls: [],
};

// drizzle-orm: lightweight sql tag + helpers. We only need the template tag
// to capture strings/values, and `sql.join` to interleave value-fragments.
vi.mock('drizzle-orm', () => {
  function sqlTag(strings: TemplateStringsArray | string[], ...values: unknown[]) {
    const arr = Array.isArray(strings) ? strings : Array.from(strings as unknown as string[]);
    return { __sql: true, strings: arr, values };
  }
  (sqlTag as unknown as { raw: (s: string) => unknown }).raw = (s: string) => ({ __sqlRaw: s });
  (sqlTag as unknown as { join: (parts: unknown[], sep?: unknown) => unknown }).join = (parts: unknown[], sep?: unknown) => ({ __sqlJoin: true, parts, sep });
  return {
    sql: sqlTag,
    // The source imports eq/and/lt/or/asc but never invokes them — stub as
    // identity so the import succeeds either way.
    eq: (...args: unknown[]) => ({ __eq: args }),
    and: (...args: unknown[]) => ({ __and: args }),
    lt: (...args: unknown[]) => ({ __lt: args }),
    or: (...args: unknown[]) => ({ __or: args }),
    asc: (...args: unknown[]) => ({ __asc: args }),
  };
});

// Schema module is only used for the named import — provide a stub object.
vi.mock('@/lib/db/schema', () => ({
  brainEmbeddingJobs: { __table: 'brain_embedding_jobs' },
}));

vi.mock('@/lib/db', () => ({
  db: {
    async execute(query: { strings: string[]; values: unknown[] }) {
      const joined = (query?.strings ?? []).join(' ');
      const call: ExecCall = { strings: query?.strings ?? [], values: query?.values ?? [], joined };
      state.execCalls.push(call);
      for (const handler of state.executeHandlers) {
        const out = handler(call);
        if (out !== undefined) return out;
      }
      return [];
    },
  },
}));

// './embeddings' is the relative import path inside embedding-queue.ts.
vi.mock('@/lib/brain/embeddings', () => ({
  embedById: vi.fn(async (args: { clientId: number; entityType: string; entityId: number }) => {
    state.embedByIdCalls.push(args);
    return state.embedByIdImpl(args);
  }),
}));
// Cover the relative-resolution alias too.
vi.mock('./embeddings', () => ({
  embedById: vi.fn(async (args: { clientId: number; entityType: string; entityId: number }) => {
    state.embedByIdCalls.push(args);
    return state.embedByIdImpl(args);
  }),
}));

beforeEach(() => {
  state.execCalls.length = 0;
  state.executeHandlers.length = 0;
  state.embedByIdCalls.length = 0;
  state.embedByIdImpl = async () => ({ chunks: 1, tokens: 10 });
  state.warnCalls.length = 0;
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    state.warnCalls.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function importModule() {
  return await import('@/lib/brain/embedding-queue');
}

// ---------------------------------------------------------------------------
// enqueueEmbedding
// ---------------------------------------------------------------------------

describe('enqueueEmbedding', () => {
  it('issues one INSERT...ON CONFLICT and binds clientId/type/id', async () => {
    const { enqueueEmbedding } = await importModule();
    await enqueueEmbedding(7, 'note', 42);
    expect(state.execCalls).toHaveLength(1);
    const call = state.execCalls[0];
    expect(call.joined).toContain('INSERT INTO brain_embedding_jobs');
    expect(call.joined).toContain('ON CONFLICT');
    expect(call.values).toContain(7);
    expect(call.values).toContain('note');
    expect(call.values).toContain(42);
  });

  it('swallows db errors and warns rather than throwing', async () => {
    state.executeHandlers.push(() => {
      throw new Error('db down');
    });
    const { enqueueEmbedding } = await importModule();
    await expect(enqueueEmbedding(1, 'contact', 99)).resolves.toBeUndefined();
    expect(state.warnCalls).toHaveLength(1);
    expect(String(state.warnCalls[0][0])).toContain('enqueue failed');
  });

  it('supports multiple sequential calls without leaking state', async () => {
    const { enqueueEmbedding } = await importModule();
    await enqueueEmbedding(1, 'company', 1);
    await enqueueEmbedding(1, 'deal', 2);
    expect(state.execCalls).toHaveLength(2);
    expect(state.execCalls[1].values).toContain('deal');
  });
});

// ---------------------------------------------------------------------------
// enqueueEmbeddingsBulk
// ---------------------------------------------------------------------------

describe('enqueueEmbeddingsBulk', () => {
  it('no-ops on empty entries (zero db calls)', async () => {
    const { enqueueEmbeddingsBulk } = await importModule();
    await enqueueEmbeddingsBulk(1, []);
    expect(state.execCalls).toHaveLength(0);
  });

  it('issues one INSERT for a small batch, embedding all entries via sql.join', async () => {
    const { enqueueEmbeddingsBulk } = await importModule();
    await enqueueEmbeddingsBulk(5, [
      { entityType: 'note', entityId: 1 },
      { entityType: 'contact', entityId: 2 },
      { entityType: 'company', entityId: 3 },
    ]);
    expect(state.execCalls).toHaveLength(1);
    const call = state.execCalls[0];
    expect(call.joined).toContain('INSERT INTO brain_embedding_jobs');
    expect(call.joined).toContain('ON CONFLICT');
    // The bulk values fragment is a single sql.join object passed as a value.
    const joinFragments = call.values.filter(
      (v): v is { __sqlJoin: true; parts: unknown[] } =>
        typeof v === 'object' && v !== null && (v as { __sqlJoin?: boolean }).__sqlJoin === true,
    );
    expect(joinFragments).toHaveLength(1);
    expect(joinFragments[0].parts).toHaveLength(3);
  });

  it('chunks entries at 500 per statement', async () => {
    const { enqueueEmbeddingsBulk } = await importModule();
    const entries = Array.from({ length: 1234 }, (_, i) => ({
      entityType: 'note' as const,
      entityId: i + 1,
    }));
    await enqueueEmbeddingsBulk(99, entries);
    // ceil(1234 / 500) = 3 inserts.
    expect(state.execCalls).toHaveLength(3);
    const partCounts = state.execCalls.map((c) => {
      const j = c.values.find(
        (v): v is { parts: unknown[] } =>
          typeof v === 'object' && v !== null && (v as { __sqlJoin?: boolean }).__sqlJoin === true,
      );
      return j ? j.parts.length : 0;
    });
    expect(partCounts).toEqual([500, 500, 234]);
  });

  it('swallows per-chunk errors but keeps processing later chunks', async () => {
    let calls = 0;
    state.executeHandlers.push(() => {
      calls++;
      if (calls === 1) throw new Error('chunk 1 boom');
      return [];
    });
    const { enqueueEmbeddingsBulk } = await importModule();
    const entries = Array.from({ length: 800 }, (_, i) => ({
      entityType: 'note' as const,
      entityId: i + 1,
    }));
    await expect(enqueueEmbeddingsBulk(1, entries)).resolves.toBeUndefined();
    // Both chunks attempted.
    expect(state.execCalls).toHaveLength(2);
    expect(state.warnCalls).toHaveLength(1);
    expect(String(state.warnCalls[0][0])).toContain('bulk enqueue chunk failed');
  });
});

// ---------------------------------------------------------------------------
// drainQueue
// ---------------------------------------------------------------------------

describe('drainQueue', () => {
  it('returns zero-counts and skips inner loop when CTE picks no rows', async () => {
    // First call (the CTE UPDATE) returns []. No further calls happen.
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? [] : undefined));
    const { drainQueue } = await importModule();
    const res = await drainQueue();
    expect(res).toEqual({ picked: 0, succeeded: 0, failed: 0, errors: [] });
    expect(state.execCalls).toHaveLength(1);
    expect(state.embedByIdCalls).toHaveLength(0);
  });

  it('honors maxJobs and binds it into the CTE LIMIT', async () => {
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? [] : undefined));
    const { drainQueue } = await importModule();
    await drainQueue(7);
    const cteCall = state.execCalls.find((c) => c.joined.includes('WITH picked AS'));
    expect(cteCall).toBeDefined();
    expect(cteCall!.values).toContain(7);
    // MAX_ATTEMPTS=3 is bound in the same statement.
    expect(cteCall!.values).toContain(3);
  });

  it('uses default batch size of 25 when called with no args', async () => {
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? [] : undefined));
    const { drainQueue } = await importModule();
    await drainQueue();
    const cteCall = state.execCalls.find((c) => c.joined.includes('WITH picked AS'));
    expect(cteCall!.values).toContain(25);
  });

  it('processes each picked job, deletes on success, and reports succeeded count', async () => {
    const picked = [
      { id: 11, client_id: 1, entity_type: 'note', entity_id: 100, attempts: 0 },
      { id: 12, client_id: 1, entity_type: 'contact', entity_id: 200, attempts: 0 },
    ];
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? picked : undefined));
    const { drainQueue } = await importModule();
    const res = await drainQueue();
    expect(res.picked).toBe(2);
    expect(res.succeeded).toBe(2);
    expect(res.failed).toBe(0);
    expect(res.errors).toEqual([]);
    expect(state.embedByIdCalls).toEqual([
      { clientId: 1, entityType: 'note', entityId: 100 },
      { clientId: 1, entityType: 'contact', entityId: 200 },
    ]);
    // Two DELETEs (one per success).
    const deletes = state.execCalls.filter((c) => c.joined.includes('DELETE FROM brain_embedding_jobs'));
    expect(deletes).toHaveLength(2);
    expect(deletes[0].values).toContain(11);
    expect(deletes[1].values).toContain(12);
  });

  it('marks failures, increments attempts, captures error message, and skips DELETE', async () => {
    const picked = [
      { id: 21, client_id: 5, entity_type: 'deal', entity_id: 300, attempts: 1 },
      { id: 22, client_id: 5, entity_type: 'post', entity_id: 400, attempts: 0 },
    ];
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? picked : undefined));
    state.embedByIdImpl = async ({ entityId }) => {
      if (entityId === 300) throw new Error('openai 500');
      return { chunks: 1, tokens: 5 };
    };
    const { drainQueue } = await importModule();
    const res = await drainQueue();
    expect(res.picked).toBe(2);
    expect(res.succeeded).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.errors).toEqual([
      { entityType: 'deal', entityId: 300, error: 'openai 500' },
    ]);
    // One UPDATE...SET status='failed' (for id 21) + one DELETE (for id 22).
    const updates = state.execCalls.filter((c) =>
      c.joined.includes("status = 'failed'") && c.joined.includes('attempts + 1'),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toContain(21);
    expect(updates[0].values).toContain('openai 500');

    const deletes = state.execCalls.filter((c) => c.joined.includes('DELETE FROM brain_embedding_jobs'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0].values).toContain(22);
  });

  it('stringifies non-Error throws when recording last_error', async () => {
    const picked = [{ id: 30, client_id: 1, entity_type: 'note', entity_id: 1, attempts: 0 }];
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? picked : undefined));
    state.embedByIdImpl = async () => {
      // eslint-disable-next-line no-throw-literal
      throw 'string failure';
    };
    const { drainQueue } = await importModule();
    const res = await drainQueue();
    expect(res.failed).toBe(1);
    expect(res.errors[0]).toEqual({ entityType: 'note', entityId: 1, error: 'string failure' });
    const updates = state.execCalls.filter((c) =>
      c.joined.includes("status = 'failed'") && c.joined.includes('attempts + 1'),
    );
    expect(updates[0].values).toContain('string failure');
  });

  it('mixes successes and failures and returns accurate totals', async () => {
    const picked = [
      { id: 1, client_id: 1, entity_type: 'note', entity_id: 1, attempts: 0 },
      { id: 2, client_id: 1, entity_type: 'note', entity_id: 2, attempts: 0 },
      { id: 3, client_id: 1, entity_type: 'note', entity_id: 3, attempts: 1 },
      { id: 4, client_id: 1, entity_type: 'note', entity_id: 4, attempts: 0 },
    ];
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? picked : undefined));
    state.embedByIdImpl = async ({ entityId }) => {
      if (entityId === 2 || entityId === 3) throw new Error(`fail-${entityId}`);
      return { chunks: 1, tokens: 1 };
    };
    const { drainQueue } = await importModule();
    const res = await drainQueue();
    expect(res.picked).toBe(4);
    expect(res.succeeded).toBe(2);
    expect(res.failed).toBe(2);
    expect(res.errors.map((e) => e.entityId).sort()).toEqual([2, 3]);
  });

  it('preserves processing order matching the CTE result order', async () => {
    const picked = [
      { id: 1, client_id: 1, entity_type: 'note', entity_id: 10, attempts: 0 },
      { id: 2, client_id: 1, entity_type: 'note', entity_id: 20, attempts: 0 },
      { id: 3, client_id: 1, entity_type: 'note', entity_id: 30, attempts: 0 },
    ];
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? picked : undefined));
    const { drainQueue } = await importModule();
    await drainQueue();
    expect(state.embedByIdCalls.map((c) => c.entityId)).toEqual([10, 20, 30]);
  });

  it('the CTE filter clause includes pending OR retryable-failed predicates', async () => {
    state.executeHandlers.push((c) => (c.joined.includes('WITH picked AS') ? [] : undefined));
    const { drainQueue } = await importModule();
    await drainQueue();
    const cteCall = state.execCalls.find((c) => c.joined.includes('WITH picked AS'));
    expect(cteCall!.joined).toContain("status = 'pending'");
    expect(cteCall!.joined).toContain("status = 'failed'");
    expect(cteCall!.joined).toContain('FOR UPDATE SKIP LOCKED');
    expect(cteCall!.joined).toContain("status = 'processing'");
  });
});

// ---------------------------------------------------------------------------
// getQueueStats
// ---------------------------------------------------------------------------

describe('getQueueStats', () => {
  it('returns zeros when no rows exist', async () => {
    state.executeHandlers.push(() => []);
    const { getQueueStats } = await importModule();
    const stats = await getQueueStats();
    expect(stats).toEqual({ pending: 0, processing: 0, failed: 0, failedExhausted: 0 });
  });

  it('maps grouped rows into the stats struct', async () => {
    state.executeHandlers.push(() => [
      { status: 'pending', cnt: 5, exhausted: 0 },
      { status: 'processing', cnt: 2, exhausted: 0 },
      { status: 'failed', cnt: 4, exhausted: 1 },
    ]);
    const { getQueueStats } = await importModule();
    const stats = await getQueueStats();
    expect(stats).toEqual({ pending: 5, processing: 2, failed: 4, failedExhausted: 1 });
  });

  it('ignores unknown status values gracefully', async () => {
    state.executeHandlers.push(() => [
      { status: 'pending', cnt: 1, exhausted: 0 },
      { status: 'something-weird', cnt: 99, exhausted: 0 },
    ]);
    const { getQueueStats } = await importModule();
    const stats = await getQueueStats();
    expect(stats).toEqual({ pending: 1, processing: 0, failed: 0, failedExhausted: 0 });
  });

  it('binds MAX_ATTEMPTS into the FILTER clause', async () => {
    state.executeHandlers.push(() => []);
    const { getQueueStats } = await importModule();
    await getQueueStats();
    const call = state.execCalls.find((c) => c.joined.includes('FILTER'));
    expect(call).toBeDefined();
    expect(call!.values).toContain(3);
    expect(call!.joined).toContain('GROUP BY status');
  });

  it('handles only-failed-exhausted state correctly', async () => {
    state.executeHandlers.push(() => [
      { status: 'failed', cnt: 7, exhausted: 7 },
    ]);
    const { getQueueStats } = await importModule();
    const stats = await getQueueStats();
    expect(stats.failed).toBe(7);
    expect(stats.failedExhausted).toBe(7);
    expect(stats.pending).toBe(0);
  });
});
