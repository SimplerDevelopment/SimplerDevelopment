/**
 * Integration coverage for `checkAiPlanGate` against real `services` /
 * `client_services` / `client_api_keys` rows. Mirrors the verdict matrix from
 * `tests/unit/ai-plan-gate.test.ts` but exercises the live SQL rather than
 * mock chains.
 *
 *   tier=starter, no BYOK key  → blocked, message names "Starter tier"
 *   tier=starter, with BYOK    → allowed
 *   tier=growth, no BYOK       → allowed
 *   tier=scale,  no BYOK       → allowed
 *
 * Schema knobs we drive (lib/db/schema/sites.ts):
 *   services.category    = 'subscription'
 *   services.slug        = 'tier-{starter|growth|scale}'
 *   services.usageLimits = { tier: '<label>' } (canonical lowercase label)
 *   client_services.status = 'active'
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  }
});

import { encryptApiKey } from '@/lib/crypto/api-key';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

type Tier = 'starter' | 'growth' | 'scale';

async function seedTier(clientId: number, tier: Tier): Promise<void> {
  const sql = getTestSql();
  // Slugs must be unique across the whole test schema; suffix with the
  // clientId so concurrent tests never collide on `services_slug_unique`.
  const slug = `tier-${tier}-${clientId}-${Math.floor(Math.random() * 1e9)}`;
  const [svc] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (
      name, slug, category, price, billing_cycle, usage_limits, active
    ) VALUES (
      ${`Tier ${tier}`}, ${slug}, 'subscription', 0, 'monthly',
      ${sql.json({ tier })}, true
    ) RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${clientId}, ${svc.id}, 'active')
  `;
}

async function seedByok(clientId: number, provider: 'anthropic' | 'openai', plaintext: string): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_api_keys (client_id, provider, encrypted_key, label)
    VALUES (${clientId}, ${provider}, ${encryptApiKey(plaintext)}, 'plan-gate-test')
  `;
}

describe('checkAiPlanGate @byok @ai @plan-gate', () => {
  let ctx: TenantCtx;

  beforeEach(async () => {
    ctx = await sessionForNewClientUser('plan-gate');
  });

  it('Starter tier without BYOK → blocked with the documented message', async () => {
    await seedTier(ctx.client.id, 'starter');

    const verdict = await checkAiPlanGate({ clientId: ctx.client.id, provider: 'anthropic' });

    expect(verdict.allowed).toBe(false);
    expect(verdict.tier).toBe('starter');
    expect(verdict.reason).toBe('starter_requires_byok');
    expect(verdict.message).toMatch(/AI is unavailable on Starter tier/);
    expect(verdict.hasAnyByok).toBe(false);
  });

  it('Starter tier WITH a matching BYOK key → allowed', async () => {
    await seedTier(ctx.client.id, 'starter');
    await seedByok(ctx.client.id, 'anthropic', `sk-ant-api03-${'P'.repeat(86)}PP`);

    const verdict = await checkAiPlanGate({ clientId: ctx.client.id, provider: 'anthropic' });

    expect(verdict.allowed).toBe(true);
    expect(verdict.tier).toBe('starter');
    expect(verdict.hasAnyByok).toBe(true);
    expect(verdict.reason).toBeUndefined();
  });

  it('Growth tier without BYOK → allowed', async () => {
    await seedTier(ctx.client.id, 'growth');

    const verdict = await checkAiPlanGate({ clientId: ctx.client.id, provider: 'anthropic' });

    expect(verdict.allowed).toBe(true);
    expect(verdict.tier).toBe('growth');
    expect(verdict.hasAnyByok).toBe(false);
  });

  it('Scale tier without BYOK → allowed', async () => {
    await seedTier(ctx.client.id, 'scale');

    const verdict = await checkAiPlanGate({ clientId: ctx.client.id, provider: 'anthropic' });

    expect(verdict.allowed).toBe(true);
    expect(verdict.tier).toBe('scale');
    expect(verdict.hasAnyByok).toBe(false);
  });

  it('Starter on OpenAI without BYOK → blocked with provider-specific copy', async () => {
    await seedTier(ctx.client.id, 'starter');
    // Even though an Anthropic BYOK exists, OpenAI requests still fail —
    // the gate is per-provider.
    await seedByok(ctx.client.id, 'anthropic', `sk-ant-api03-${'X'.repeat(86)}XX`);

    const verdict = await checkAiPlanGate({ clientId: ctx.client.id, provider: 'openai' });

    expect(verdict.allowed).toBe(false);
    expect(verdict.tier).toBe('starter');
    expect(verdict.reason).toBe('starter_requires_byok');
    expect(verdict.message).toMatch(/OpenAI/);
    expect(verdict.hasAnyByok).toBe(true); // anthropic key present
  });
});
