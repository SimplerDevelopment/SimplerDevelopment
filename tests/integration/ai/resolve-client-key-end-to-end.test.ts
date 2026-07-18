/**
 * End-to-end coverage for `resolveClientApiKey` against the real test DB.
 *
 * Companion to `tests/unit/ai-resolve-client-key.test.ts` (which mocks DB +
 * crypto). Here we exercise the full pipeline:
 *
 *   1. Encrypt a real key → write a `client_api_keys` row → resolve →
 *      assert decrypted plaintext matches input AND `lastUsedAt` is bumped
 *      on the row (telemetry side-effect).
 *   2. A separate client (no rows) falls back to the platform env var.
 *   3. A DB lookup failure falls through to platform without throwing.
 *
 * The resolver caches results for 60s in-process; we call `_clearResolveCache`
 * between tests so each scenario sees the seeded DB state, not a stale entry.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';

// ENCRYPTION_KEY must be set before importing the crypto helper since the
// helper reads it lazily but per-call. We pin it for the whole spec so all
// encrypt/decrypt pairs share an envelope.
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  }
});

import { encryptApiKey } from '@/lib/crypto/api-key';
import { resolveClientApiKey, _clearResolveCache } from '@/lib/ai/resolve-client-key';
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

const ANTHROPIC_BYOK = `sk-ant-api03-${'Z'.repeat(86)}ZZ`;

async function seedKey(clientId: number, provider: 'anthropic' | 'openai', plaintext: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_api_keys (
      client_id, provider, encrypted_key, label
    ) VALUES (
      ${clientId}, ${provider}, ${encryptApiKey(plaintext)}, 'integration-test'
    ) RETURNING id
  `;
  return row;
}

/** Wait for a side-effect that the resolver does NOT await (e.g. lastUsedAt
 *  bump fires-and-forgets). Polls the predicate up to ~2s. */
async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  { timeoutMs = 2_000, intervalMs = 25 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await fn();
  }
  return last;
}

describe('resolveClientApiKey (end-to-end against real DB) @byok @ai', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  const ORIG_ENV = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY };

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('byok-resolver-a'),
      sessionForNewClientUser('byok-resolver-b'),
    ]);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-fallback';
    process.env.OPENAI_API_KEY = 'sk-openai-platform-fallback';
    _clearResolveCache();
  });

  it('returns BYOK source + decrypted plaintext for client A', async () => {
    await seedKey(A.client.id, 'anthropic', ANTHROPIC_BYOK);

    const result = await resolveClientApiKey({ clientId: A.client.id, provider: 'anthropic' });

    expect(result.source).toBe('byok');
    expect(result.key).toBe(ANTHROPIC_BYOK);
    expect(result.clientId).toBe(A.client.id);
    expect(result.provider).toBe('anthropic');
  });

  it('bumps lastUsedAt on the row after resolution', async () => {
    const seeded = await seedKey(A.client.id, 'anthropic', ANTHROPIC_BYOK);

    const sql = getTestSql();
    const [pre] = await sql<{ last_used_at: Date | null }[]>`
      SELECT last_used_at FROM ${sql(TEST_SCHEMA)}.client_api_keys WHERE id = ${seeded.id}
    `;
    expect(pre.last_used_at).toBeNull();

    await resolveClientApiKey({ clientId: A.client.id, provider: 'anthropic' });

    // The bump is fire-and-forget inside the resolver. Poll until it lands.
    const post = await waitFor(
      () => sql<{ last_used_at: Date | null }[]>`
        SELECT last_used_at FROM ${sql(TEST_SCHEMA)}.client_api_keys WHERE id = ${seeded.id}
      `,
      (rows) => rows[0]?.last_used_at !== null,
    );
    expect(post[0].last_used_at).not.toBeNull();
    expect(post[0].last_used_at!.getTime()).toBeGreaterThan(0);
  });

  it("client B with no BYOK rows falls back to platform env var", async () => {
    // A has a key, B has none — A is irrelevant here but proves the
    // tenancy filter actually filters.
    await seedKey(A.client.id, 'anthropic', ANTHROPIC_BYOK);

    const result = await resolveClientApiKey({ clientId: B.client.id, provider: 'anthropic' });

    expect(result.source).toBe('platform');
    expect(result.key).toBe('sk-ant-platform-fallback');
    expect(result.clientId).toBe(B.client.id);
  });

  it('falls through to platform key when the DB lookup throws', async () => {
    // Force a real SELECT failure by renaming the table the resolver queries
    // for the duration of the test. Per-worker schema means no other suite
    // can race; we always rename back in `finally`.
    const sql = getTestSql();
    await sql.unsafe(
      `ALTER TABLE "${TEST_SCHEMA}"."client_api_keys" RENAME TO "client_api_keys_tmp_renamed"`,
    );
    const warn = console.warn;
    console.warn = () => undefined; // silence the expected log line

    try {
      _clearResolveCache(); // bypass any cache hit from prior tests
      const result = await resolveClientApiKey({ clientId: B.client.id, provider: 'anthropic' });
      expect(result.source).toBe('platform');
      expect(result.key).toBe('sk-ant-platform-fallback');
    } finally {
      console.warn = warn;
      await sql.unsafe(
        `ALTER TABLE "${TEST_SCHEMA}"."client_api_keys_tmp_renamed" RENAME TO "client_api_keys"`,
      );
    }
  });

  afterAll(() => {
    // Restore env after the suite — we pinned ANTHROPIC/OPENAI_API_KEY to a
    // recognisable fallback string, but those vars persist across the worker
    // so leaving them set would taint sibling specs.
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const) {
      const v = ORIG_ENV[k];
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });
});
