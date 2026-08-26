// @vitest-environment node
/**
 * Unit tests for lib/crm/enrichment-key.ts (AUTH79-019).
 *
 * `crm_enrichment_config.own_api_key` has no live caller yet — these accessors
 * exist so a future caller never reads/writes the raw column. `@/lib/db` is
 * mocked with an in-memory capture of the arguments passed to `select`/
 * `insert`, so the test proves the round trip and the "never plaintext at
 * rest" property without touching a real database (per tests/CLAUDE.md's
 * layer-picking rule — a test that needs a real DB row belongs in
 * integration, not unit).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';

const TEST_KEY = randomBytes(32).toString('hex');

let selectResult: Array<{ ownApiKey: string | null }> = [];
// What the mocked `.returning()` call resolves to — models the row(s) the
// upsert affected. Tests set this to `[]` to simulate the "affected zero
// rows" failure mode setOwnApiKey must not resolve silently through.
let returningResult: Array<{ clientId: number }> = [{ clientId: 0 }];
const insertValuesMock = vi.fn<(values: { clientId: number; ownApiKey: string }) => void>();
const onConflictDoUpdateMock = vi.fn<(config: unknown) => void>();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => selectResult,
      }),
    }),
    insert: () => ({
      values: (values: { clientId: number; ownApiKey: string }) => {
        insertValuesMock(values);
        return {
          onConflictDoUpdate: (config: unknown) => {
            onConflictDoUpdateMock(config);
            return {
              returning: async () => returningResult,
            };
          },
        };
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
  returningResult = [{ clientId: 0 }];
  insertValuesMock.mockClear();
  onConflictDoUpdateMock.mockClear();
});

describe('crm enrichment own-API-key accessors', () => {
  it('setOwnApiKey upserts an AES-256-GCM blob, never the plaintext', async () => {
    const plaintext = 'apollo-live-key-abc123XYZ';

    await setOwnApiKey(42, plaintext);

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    const stored = insertValuesMock.mock.calls[0][0].ownApiKey;
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
    const encrypted = insertValuesMock.mock.calls[0][0].ownApiKey;
    selectResult = [{ ownApiKey: encrypted }];

    expect(await getOwnApiKey(7)).toBe(plaintext);
  });

  it('setOwnApiKey against a clientId with no config row still persists the key (upsert, not update)', async () => {
    // No pre-existing row for this client — simulated by the mocked insert
    // path always being taken; there is no separate "row exists" branch to
    // simulate because the whole point of the upsert is that it doesn't
    // matter. Assert the write still happens rather than silently no-op'ing.
    const plaintext = 'a-brand-new-clients-key';

    await setOwnApiKey(999, plaintext);

    expect(insertValuesMock).toHaveBeenCalledWith({ clientId: 999, ownApiKey: expect.any(String) });
  });

  it('setOwnApiKey throws instead of resolving silently when the upsert affects zero rows', async () => {
    returningResult = [];

    await expect(setOwnApiKey(999, 'some-key')).rejects.toThrow(/affected no rows/);
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
