/**
 * Integration coverage for `recordAiUsage` — verifies the BYOK / platform
 * resolution path emits a `usage_meter_events` row with the correct
 * resource / source / amount.
 *
 * No real LLM calls are made — the test simulates "AI call resolved with N
 * tokens" by passing the token count directly into `recordAiUsage`. That is
 * exactly how production call sites use the helper (call → measure → emit).
 *
 * Schema columns exercised (lib/db/schema/billing.ts → usageMeterEvents):
 *   client_id, resource='ai_tokens', period='YYYY-MM',
 *   amount (numeric stored as string), source ('byok' | 'platform').
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  }
});

import { encryptApiKey } from '@/lib/crypto/api-key';
import { resolveClientApiKey, _clearResolveCache } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

const ANTHROPIC_BYOK = `sk-ant-api03-${'Q'.repeat(86)}QQ`;

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('recordAiUsage @byok @ai @audit', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  const ORIG_ENV = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('byok-audit-a'),
      sessionForNewClientUser('byok-audit-b'),
    ]);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-for-audit';
    _clearResolveCache();
  });

  it('after a BYOK resolve + recordAiUsage, persists ai_tokens / byok / amount', async () => {
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_api_keys (client_id, provider, encrypted_key, label)
      VALUES (${A.client.id}, 'anthropic', ${encryptApiKey(ANTHROPIC_BYOK)}, 'audit-test')
    `;

    const resolved = await resolveClientApiKey({ clientId: A.client.id, provider: 'anthropic' });
    expect(resolved.source).toBe('byok');
    expect(resolved.key).toBe(ANTHROPIC_BYOK);

    // Simulated AI call result: 1234 tokens consumed.
    const TOKENS = 1234;
    await recordAiUsage({ clientId: A.client.id, source: resolved.source, tokens: TOKENS });

    const rows = await sql<{
      client_id: number;
      resource: string;
      period: string;
      amount: string;
      source: string;
    }[]>`
      SELECT client_id, resource, period, amount, source
      FROM ${sql(TEST_SCHEMA)}.usage_meter_events
      WHERE client_id = ${A.client.id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].client_id).toBe(A.client.id);
    expect(rows[0].resource).toBe('ai_tokens');
    expect(rows[0].source).toBe('byok');
    expect(rows[0].period).toBe(currentPeriod());
    // numeric column comes back as a string per node-postgres semantics.
    expect(Number(rows[0].amount)).toBe(TOKENS);
  });

  it("a platform-source AI call writes source='platform'", async () => {
    // Client B has no BYOK row, so resolver picks the env var.
    const resolved = await resolveClientApiKey({ clientId: B.client.id, provider: 'anthropic' });
    expect(resolved.source).toBe('platform');

    await recordAiUsage({ clientId: B.client.id, source: resolved.source, tokens: 42 });

    const sql = getTestSql();
    const rows = await sql<{ source: string; amount: string; resource: string }[]>`
      SELECT source, amount, resource
      FROM ${sql(TEST_SCHEMA)}.usage_meter_events
      WHERE client_id = ${B.client.id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe('platform');
    expect(rows[0].resource).toBe('ai_tokens');
    expect(Number(rows[0].amount)).toBe(42);
  });

  it('honours an explicit period override', async () => {
    await recordAiUsage({
      clientId: A.client.id,
      source: 'platform',
      tokens: 7,
      period: '2024-01',
    });
    const sql = getTestSql();
    const [row] = await sql<{ period: string }[]>`
      SELECT period FROM ${sql(TEST_SCHEMA)}.usage_meter_events WHERE client_id = ${A.client.id}
    `;
    expect(row.period).toBe('2024-01');
  });

  afterAll(() => {
    // Restore env vars so sibling specs that import the resolver don't see
    // our test fallback string in the platform branch.
    if (ORIG_ENV.ANTHROPIC_API_KEY === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = ORIG_ENV.ANTHROPIC_API_KEY;
    }
  });
});
