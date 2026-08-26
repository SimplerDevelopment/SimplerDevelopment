// @vitest-environment node
/**
 * Unit tests for lib/crm/enrichment-key.ts (AUTH79-019).
 *
 * `crm_enrichment_config.own_api_key` has no live caller yet — these accessors
 * exist so a future caller never reads/writes the raw column. `@/lib/db` is
 * mocked with an in-memory capture of the arguments passed to `select`/
 * `update`, so the test proves the round trip and the "never plaintext at
 * rest" property without touching a real database (per tests/CLAUDE.md's
 * layer-picking rule — a test that needs a real DB row belongs in
 * integration, not unit).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';

const TEST_KEY = randomBytes(32).toString('hex');

let selectResult: Array<{ ownApiKey: string | null }> = [];
const updateSetMock = vi.fn<(values: { ownApiKey: string }) => void>();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => selectResult,
      }),
    }),
    update: () => ({
      set: (values: { ownApiKey: string }) => {
        updateSetMock(values);
        return { where: async () => undefined };
      },
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  crmEnrichmentConfig: { clientId: '__clientId__', ownApiKey: '__ownApiKey__' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
}));

import { getOwnApiKey, setOwnApiKey } from '@/lib/crm/enrichment-key';
import { encryptApiKey } from '@/lib/crypto/api-key';

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
  selectResult = [];
  updateSetMock.mockClear();
});

describe('crm enrichment own-API-key accessors', () => {
  it('setOwnApiKey stores an AES-256-GCM blob, never the plaintext', async () => {
    const plaintext = 'apollo-live-key-abc123XYZ';

    await setOwnApiKey(42, plaintext);

    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const stored = updateSetMock.mock.calls[0][0].ownApiKey;
    expect(typeof stored).toBe('string');
    expect(stored).not.toBe(plaintext);
    expect(stored).not.toContain(plaintext);
  });

  it('getOwnApiKey decrypts the stored blob back to the original plaintext (round trip)', async () => {
    const plaintext = 'apollo-live-key-abc123XYZ';
    selectResult = [{ ownApiKey: encryptApiKey(plaintext) }];

    const result = await getOwnApiKey(42);

    expect(result).toBe(plaintext);
  });

  it('round-trips through setOwnApiKey -> getOwnApiKey using the actual encrypted blob written', async () => {
    const plaintext = 'apollo-enrichment-provider-key-999';

    await setOwnApiKey(7, plaintext);
    const encrypted = updateSetMock.mock.calls[0][0].ownApiKey;
    selectResult = [{ ownApiKey: encrypted }];

    expect(await getOwnApiKey(7)).toBe(plaintext);
  });

  it('getOwnApiKey returns null when no key is configured on the row', async () => {
    selectResult = [{ ownApiKey: null }];
    expect(await getOwnApiKey(42)).toBeNull();
  });

  it('getOwnApiKey returns null when no config row exists for the client', async () => {
    selectResult = [];
    expect(await getOwnApiKey(42)).toBeNull();
  });
});
