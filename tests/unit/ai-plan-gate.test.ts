/**
 * Unit coverage for the AI plan-gate. Mocks DB queries to drive the three
 * tiers (Starter / Growth / Scale) plus the BYOK presence check, then asserts
 * the verdict matches the brief (post "BYOK inversion"):
 *
 *   - Starter without BYOK → allowed (platform AI; BYOK is Scale-only option)
 *   - Starter with BYOK    → allowed
 *   - Growth, Scale        → allowed regardless
 *   - Unknown tier         → allowed (legacy fallthrough)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each chain in plan-gate.ts is `db.select().from(...).innerJoin(...).where(...)`
// for the tier query, then `db.select().from(...).where(...).limit(...)` for
// the BYOK presence check. We mock with sequential responses queued via a
// FIFO array; the three test scenarios consume them in order.
const queue: unknown[][] = [];

function pushQueue(...rows: unknown[][]) {
  queue.push(...rows);
}

function nextResult(): unknown[] {
  return queue.shift() ?? [];
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(nextResult()),
        }),
        where: () => ({
          limit: () => Promise.resolve(nextResult()),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  clientServices: { clientId: {}, serviceId: {}, status: {} },
  services: { id: {}, slug: {}, usageLimits: {}, category: {} },
  clientApiKeys: { clientId: {}, provider: {}, id: {} },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

import { checkAiPlanGate, getClientTier } from '@/lib/ai/plan-gate';

describe('checkAiPlanGate', () => {
  beforeEach(() => {
    queue.length = 0;
  });

  it('allows Starter tier without BYOK (platform AI covers all paid tiers)', async () => {
    pushQueue(
      // tier query
      [{ slug: 'tier-starter', usageLimits: { tier: 'starter' } }],
      // hasAnyByok
      [],
    );

    const verdict = await checkAiPlanGate({ clientId: 1, provider: 'anthropic' });
    expect(verdict.allowed).toBe(true);
    expect(verdict.tier).toBe('starter');
    // Post-inversion: no blocking reason is ever set
    expect(verdict.reason).toBeUndefined();
    expect(verdict.message).toBeUndefined();
  });

  it('allows Starter tier when BYOK key for the provider exists', async () => {
    pushQueue(
      [{ slug: 'tier-starter', usageLimits: { tier: 'starter' } }],
      [{ id: 1 }], // has any
    );

    const verdict = await checkAiPlanGate({ clientId: 1, provider: 'anthropic' });
    expect(verdict.allowed).toBe(true);
    expect(verdict.tier).toBe('starter');
    expect(verdict.hasAnyByok).toBe(true);
  });

  it('allows Growth tier even without BYOK', async () => {
    pushQueue(
      [{ slug: 'tier-growth', usageLimits: { tier: 'growth' } }],
      [], // hasAnyByok
    );

    const verdict = await checkAiPlanGate({ clientId: 1, provider: 'anthropic' });
    expect(verdict.allowed).toBe(true);
    expect(verdict.tier).toBe('growth');
  });

  it('allows Scale tier even without BYOK', async () => {
    pushQueue(
      [{ slug: 'tier-scale', usageLimits: { tier: 'scale' } }],
      [],
    );

    const verdict = await checkAiPlanGate({ clientId: 1, provider: 'anthropic' });
    expect(verdict.allowed).toBe(true);
    expect(verdict.tier).toBe('scale');
  });

  it('allows clients with no tier row (legacy fallthrough)', async () => {
    pushQueue(
      [], // no tier rows
      [], // hasAnyByok
    );

    const verdict = await checkAiPlanGate({ clientId: 1, provider: 'anthropic' });
    expect(verdict.allowed).toBe(true);
    expect(verdict.tier).toBe('unknown');
  });

  it('picks the highest tier when a client subscribes to multiple', async () => {
    pushQueue(
      [
        { slug: 'tier-starter', usageLimits: { tier: 'starter' } },
        { slug: 'tier-scale', usageLimits: { tier: 'scale' } },
      ],
      [], // hasAnyByok
    );

    const verdict = await checkAiPlanGate({ clientId: 1, provider: 'anthropic' });
    expect(verdict.tier).toBe('scale');
    expect(verdict.allowed).toBe(true);
  });
});

describe('getClientTier', () => {
  beforeEach(() => {
    queue.length = 0;
  });

  it('returns "unknown" for a client with no subscription rows', async () => {
    pushQueue([]);
    expect(await getClientTier(999)).toBe('unknown');
  });

  it('reads tier from usageLimits.tier when present', async () => {
    pushQueue([{ slug: 'tier-growth', usageLimits: { tier: 'growth' } }]);
    expect(await getClientTier(1)).toBe('growth');
  });

  it('falls back to slug parsing when usageLimits.tier is missing', async () => {
    pushQueue([{ slug: 'tier-starter', usageLimits: {} }]);
    expect(await getClientTier(1)).toBe('starter');
  });
});
