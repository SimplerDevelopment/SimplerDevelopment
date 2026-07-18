/**
 * Unit tests for lib/ai/prompt-registry.ts — resolvePrompt + getPromptVersionBody.
 *
 * No real DB. @/lib/db is mocked with a chainable builder. Because vi.mock factories
 * are hoisted before any top-level variable initializations, the mock factory cannot
 * reference outer `let` variables directly. Instead we expose a global `__dbState`
 * object (plain property assignment, not declaration) that the factory closes over
 * through the global scope — this survives hoisting. Tests mutate `__dbState` to
 * control rows and throw behavior per-case.
 *
 * @critical
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisting-safe shared state ─────────────────────────────────────────────────
// Assigned on the global object so the vi.mock factory (which is hoisted to the
// very top of the compiled module) can read it without a TDZ error.
// Tests mutate these fields directly.
(globalThis as Record<string, unknown>).__dbState = {
  rows: [] as Array<{ body: string }>,
  shouldThrow: false,
};

// Expose a typed alias for use in test bodies.
const dbState = (globalThis as Record<string, unknown>).__dbState as {
  rows: Array<{ body: string }>;
  shouldThrow: boolean;
};

// ── Mock @/lib/db ──────────────────────────────────────────────────────────────
// The factory is hoisted — it MUST NOT reference any let/const declared above.
// It reads __dbState via globalThis which is always available.
vi.mock('@/lib/db', () => {
  const state = (globalThis as Record<string, unknown>).__dbState as {
    rows: Array<{ body: string }>;
    shouldThrow: boolean;
  };
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => {
      if (state.shouldThrow) return Promise.reject(new Error('DB unavailable'));
      return Promise.resolve([...state.rows]);
    }),
  };
  // Make every method return the chain (re-apply after `select` since
  // mockReturnThis works relative to the mock fn itself).
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return { db: chain };
});

// Mock the schema tables — just passed through to drizzle (also mocked).
vi.mock('@/lib/db/schema', () => ({
  promptRegistry: Symbol('promptRegistry'),
  promptVersions: Symbol('promptVersions'),
}));

// Mock drizzle-orm's `eq` — only used as an argument to where(); ignored.
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => Symbol('eq-condition')),
  and: vi.fn(() => Symbol('and-condition')),
}));

// ── Module under test ──────────────────────────────────────────────────────────
import { resolvePrompt, getPromptVersionBody, clearPromptCache } from '@/lib/ai/prompt-registry';

// Grab the mocked db so we can spy on call counts.
import { db } from '@/lib/db';
const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function resetState() {
  dbState.rows = [];
  dbState.shouldThrow = false;
  vi.clearAllMocks();
  // Re-wire chain returns after clearAllMocks clears implementations.
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.innerJoin.mockReturnValue(mockDb);
  mockDb.where.mockReturnValue(mockDb);
  mockDb.limit.mockImplementation(() => {
    if (dbState.shouldThrow) return Promise.reject(new Error('DB unavailable'));
    return Promise.resolve([...dbState.rows]);
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('prompt-registry — resolvePrompt @critical', () => {
  beforeEach(() => {
    resetState();
    clearPromptCache();
    delete process.env.PROMPT_REGISTRY_ENABLED;
  });

  afterEach(() => {
    delete process.env.PROMPT_REGISTRY_ENABLED;
  });

  // ── 1. Flag OFF ────────────────────────────────────────────────────────────
  it('returns fallback and never queries DB when flag is unset', async () => {
    const result = await resolvePrompt('my-prompt', 'FALLBACK');
    expect(result).toBe('FALLBACK');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns fallback and never queries DB when flag is "0"', async () => {
    vi.stubEnv('PROMPT_REGISTRY_ENABLED', '0');
    const result = await resolvePrompt('my-prompt', 'FALLBACK');
    expect(result).toBe('FALLBACK');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // ── 2. Flag ON + DB returns a row ─────────────────────────────────────────
  it('returns the active version body when DB has a matching row', async () => {
    vi.stubEnv('PROMPT_REGISTRY_ENABLED', '1');
    dbState.rows = [{ body: 'ACTIVE BODY' }];

    const result = await resolvePrompt('my-prompt', 'FALLBACK');
    expect(result).toBe('ACTIVE BODY');
  });

  // ── 3. Flag ON + DB returns empty array ───────────────────────────────────
  it('returns fallback when DB has no active version (empty rows)', async () => {
    vi.stubEnv('PROMPT_REGISTRY_ENABLED', '1');
    dbState.rows = [];

    const result = await resolvePrompt('my-prompt', 'FALLBACK');
    expect(result).toBe('FALLBACK');
  });

  // ── 4. Flag ON + DB throws ────────────────────────────────────────────────
  it('returns fallback and does not propagate when DB throws', async () => {
    vi.stubEnv('PROMPT_REGISTRY_ENABLED', '1');
    dbState.shouldThrow = true;

    await expect(resolvePrompt('my-prompt', 'FALLBACK')).resolves.toBe('FALLBACK');
  });

  // ── 5. Caching ─────────────────────────────────────────────────────────────
  it('queries DB only once within TTL; re-queries after clearPromptCache()', async () => {
    vi.stubEnv('PROMPT_REGISTRY_ENABLED', '1');
    dbState.rows = [{ body: 'CACHED BODY' }];

    // First call — hits DB.
    const first = await resolvePrompt('cache-test', 'FALLBACK');
    expect(first).toBe('CACHED BODY');
    expect(mockDb.select).toHaveBeenCalledTimes(1);

    // Second call within TTL — served from cache, no extra DB query.
    const second = await resolvePrompt('cache-test', 'FALLBACK');
    expect(second).toBe('CACHED BODY');
    expect(mockDb.select).toHaveBeenCalledTimes(1);

    // After cache clear the third call must re-query.
    clearPromptCache();
    dbState.rows = [{ body: 'REFRESHED BODY' }];
    const third = await resolvePrompt('cache-test', 'FALLBACK');
    expect(third).toBe('REFRESHED BODY');
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it('cache is per-key — separate keys each get their own DB query', async () => {
    vi.stubEnv('PROMPT_REGISTRY_ENABLED', '1');
    dbState.rows = [{ body: 'BODY A' }];
    await resolvePrompt('key-a', 'FB');

    dbState.rows = [{ body: 'BODY B' }];
    const b = await resolvePrompt('key-b', 'FB');

    expect(b).toBe('BODY B');
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });
});

describe('prompt-registry — getPromptVersionBody @critical', () => {
  beforeEach(() => {
    resetState();
  });

  it('returns the body when a row exists for the given versionId', async () => {
    dbState.rows = [{ body: 'VERSION BODY' }];
    const result = await getPromptVersionBody(42);
    expect(result).toBe('VERSION BODY');
  });

  it('returns null when no row is found for the given versionId', async () => {
    dbState.rows = [];
    const result = await getPromptVersionBody(99);
    expect(result).toBeNull();
  });
});
