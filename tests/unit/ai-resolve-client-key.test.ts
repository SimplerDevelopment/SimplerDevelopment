/**
 * Unit coverage for the BYOK resolver. Mocks the DB and the crypto helper so
 * the resolver's three branches (BYOK hit, BYOK miss, decrypt failure) can be
 * exercised independently.
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
}));

const decryptSpy = vi.fn();
vi.mock('@/lib/crypto/api-key', () => ({
  decryptApiKey: (blob: string) => decryptSpy(blob),
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
});
