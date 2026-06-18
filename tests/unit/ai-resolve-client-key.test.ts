/**
 * Unit coverage for the BYOK resolver. Mocks the DB, the crypto helper, and
 * `getClientEntitlements` so the resolver's branches can be exercised
 * independently:
 *
 *   - byokEligible=true  + BYOK row present  → source:'byok'
 *   - byokEligible=true  + no row            → source:'platform'
 *   - byokEligible=false + BYOK row present  → source:'platform' (eligibility gate)
 *   - decrypt failure                        → source:'platform' (fail-safe)
 *   - DB lookup failure                      → source:'platform' (fail-safe)
 *   - entitlement check failure              → source:'platform' (fail-closed)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chain queries against drizzle. We support two branches per call site:
//   - `select().from(...).where(...)` for the BYOK lookup row
const mockWhere = vi.fn<(args: unknown) => Promise<unknown>>();
const mockUpdateSet = vi.fn<(args: unknown) => { where: (...a: unknown[]) => { catch: () => void } }>();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => mockWhere(args),
      }),
    }),
    update: () => ({
      set: (...args: unknown[]) => mockUpdateSet(args),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  clientApiKeys: {
    clientId: { name: 'client_id' },
    provider: { name: 'provider' },
    id: { name: 'id' },
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

const decryptSpy = vi.fn();
vi.mock('@/lib/crypto/api-key', () => ({
  decryptApiKey: (blob: string) => decryptSpy(blob),
}));

// Mock getClientEntitlements so we control byokEligible per-test.
const mockGetClientEntitlements = vi.fn();
vi.mock('@/lib/billing/entitlements', () => ({
  getClientEntitlements: (...args: unknown[]) => mockGetClientEntitlements(...args),
}));

import { resolveClientApiKey, _clearResolveCache } from '@/lib/ai/resolve-client-key';

describe('resolveClientApiKey', () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIG };
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform';
    process.env.OPENAI_API_KEY = 'sk-openai-platform';
    decryptSpy.mockReset();
    mockWhere.mockReset();
    mockUpdateSet.mockReset().mockReturnValue({ where: () => ({ catch: () => undefined }) });
    // Default: byokEligible=true (Scale tier) so existing BYOK-hit tests pass
    // without requiring every test to spell this out.
    mockGetClientEntitlements.mockResolvedValue({ byokEligible: true });
    _clearResolveCache();
  });

  afterEach(() => {
    process.env = { ...ORIG };
  });

  it('returns BYOK key when row exists and decrypt succeeds', async () => {
    mockWhere.mockResolvedValueOnce([
      {
        id: 1,
        clientId: 100,
        provider: 'anthropic',
        encryptedKey: 'ENC',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastUsedAt: null,
      },
    ]);
    decryptSpy.mockReturnValue('sk-ant-byok-decrypted');

    const result = await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });

    expect(result.key).toBe('sk-ant-byok-decrypted');
    expect(result.source).toBe('byok');
    expect(result.clientId).toBe(100);
    expect(result.provider).toBe('anthropic');
    expect(decryptSpy).toHaveBeenCalledWith('ENC');
  });

  it('falls through to platform key when no BYOK row exists', async () => {
    mockWhere.mockResolvedValueOnce([]);

    const result = await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });

    expect(result.key).toBe('sk-ant-platform');
    expect(result.source).toBe('platform');
    expect(decryptSpy).not.toHaveBeenCalled();
  });

  it('falls through to platform key on decrypt failure (with warning)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockWhere.mockResolvedValueOnce([
      {
        id: 1,
        clientId: 100,
        provider: 'anthropic',
        encryptedKey: 'BAD_BLOB',
        createdAt: new Date(),
        lastUsedAt: null,
      },
    ]);
    decryptSpy.mockImplementation(() => { throw new Error('Auth tag mismatch'); });

    const result = await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });

    expect(result.source).toBe('platform');
    expect(result.key).toBe('sk-ant-platform');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('routes embedding provider to OpenAI bucket', async () => {
    mockWhere.mockResolvedValueOnce([]);

    const result = await resolveClientApiKey({ clientId: 100, provider: 'embedding' });

    expect(result.key).toBe('sk-openai-platform');
    expect(result.source).toBe('platform');
  });

  it('throws when neither BYOK nor platform key is available', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockWhere.mockResolvedValueOnce([]);

    await expect(
      resolveClientApiKey({ clientId: 100, provider: 'anthropic' }),
    ).rejects.toThrow(/No BYOK row and no platform env var/);
  });

  it('caches results across calls within TTL', async () => {
    mockWhere.mockResolvedValueOnce([]);

    const a = await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });
    const b = await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });

    expect(a).toEqual(b);
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it('isolates cache by clientId and provider', async () => {
    mockWhere.mockResolvedValueOnce([]); // client 100 anthropic
    mockWhere.mockResolvedValueOnce([]); // client 200 anthropic
    mockWhere.mockResolvedValueOnce([]); // client 100 openai

    await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });
    await resolveClientApiKey({ clientId: 200, provider: 'anthropic' });
    await resolveClientApiKey({ clientId: 100, provider: 'openai' });

    expect(mockWhere).toHaveBeenCalledTimes(3);
  });

  it('falls through to platform key on DB lookup failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockWhere.mockRejectedValueOnce(new Error('DB down'));

    const result = await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });

    expect(result.source).toBe('platform');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // ── BYOK inversion: Scale-only eligibility gate ──────────────────────────

  it('returns platform key (ignores stored BYOK row) when client is NOT byokEligible', async () => {
    // Simulate a non-Scale client: entitlements say byokEligible=false.
    mockGetClientEntitlements.mockResolvedValueOnce({ byokEligible: false });
    // A BYOK row exists in the DB — but must NOT be used.
    mockWhere.mockResolvedValueOnce([
      {
        id: 1,
        clientId: 100,
        provider: 'anthropic',
        encryptedKey: 'ENC',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastUsedAt: null,
      },
    ]);

    const result = await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });

    expect(result.source).toBe('platform');
    expect(result.key).toBe('sk-ant-platform');
    // The DB lookup must have been skipped entirely (byokEligible=false means
    // we short-circuit to [] without querying). mockWhere should NOT have been
    // called because the resolver skips the query when not eligible.
    expect(decryptSpy).not.toHaveBeenCalled();
  });

  it('returns BYOK key (source:byok) when client IS byokEligible and a key row exists', async () => {
    // Explicit Scale-tier eligibility (also the default, but stated for clarity).
    mockGetClientEntitlements.mockResolvedValueOnce({ byokEligible: true });
    mockWhere.mockResolvedValueOnce([
      {
        id: 2,
        clientId: 200,
        provider: 'anthropic',
        encryptedKey: 'ENC2',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastUsedAt: null,
      },
    ]);
    decryptSpy.mockReturnValue('sk-ant-byok-scale');

    const result = await resolveClientApiKey({ clientId: 200, provider: 'anthropic' });

    expect(result.source).toBe('byok');
    expect(result.key).toBe('sk-ant-byok-scale');
    expect(decryptSpy).toHaveBeenCalledWith('ENC2');
  });

  it('falls through to platform key when entitlement check throws (fail-closed)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockGetClientEntitlements.mockRejectedValueOnce(new Error('billing DB down'));

    const result = await resolveClientApiKey({ clientId: 100, provider: 'anthropic' });

    expect(result.source).toBe('platform');
    expect(result.key).toBe('sk-ant-platform');
    // The warn log is expected — it's the fail-closed signal.
    expect(warnSpy).toHaveBeenCalled();
    // Must not have attempted the DB lookup (we never got past the eligibility check).
    expect(decryptSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
