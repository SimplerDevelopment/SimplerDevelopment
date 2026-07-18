/**
 * Unit coverage for the brain entitlement helper.
 *
 * The DB-backed branch is exercised in integration; this spec focuses on the
 * pure-logic bypass branch (`BRAIN_ENTITLEMENT_BYPASS=1`, vitest detection)
 * since vitest itself sets `VITEST_POOL_ID`, the helper short-circuits before
 * touching the DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We don't use the mocks beyond ensuring db import doesn't blow up — the test
// runtime detection short-circuits before any query is issued.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: vi.fn(),
  isAuthError: (r: unknown) => typeof r === 'object' && r !== null && 'response' in r,
}));

import { isBrainEntitled, BRAIN_SERVICE_CATEGORY } from '@/lib/brain/entitlement';

describe('isBrainEntitled — bypass branches', () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIG };
  });

  it('returns true under vitest (VITEST_POOL_ID is set in the runtime)', async () => {
    // VITEST_POOL_ID is set by the runner — ensure the helper detects it.
    expect(process.env.VITEST_POOL_ID ?? process.env.VITEST).toBeDefined();
    await expect(isBrainEntitled(123)).resolves.toBe(true);
  });

  it('returns true when BRAIN_ENTITLEMENT_BYPASS=1 even if vitest is masked', async () => {
    delete process.env.VITEST_POOL_ID;
    delete process.env.VITEST;
    process.env.BRAIN_ENTITLEMENT_BYPASS = '1';
    await expect(isBrainEntitled(456)).resolves.toBe(true);
  });

  it('exposes the brain service category constant', () => {
    expect(BRAIN_SERVICE_CATEGORY).toBe('brain');
  });
});
