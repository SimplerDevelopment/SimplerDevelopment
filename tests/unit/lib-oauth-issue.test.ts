// @vitest-environment node
/**
 * Unit tests for the internal M2M token mint (`lib/oauth/issue.ts`).
 *
 * Security-critical: this mints single-tenant `sd_oauth_…` access tokens the
 * app hands to the agents sub-service. We assert it (a) binds the token to the
 * caller-supplied clientId/userId, (b) honours scopes + audience + TTL, (c)
 * issues NO refresh token, and (d) idempotently self-seeds the internal OAuth
 * client. `@/lib/db` is mocked with an in-memory capture; the real
 * `generateAccessToken` (crypto) runs so we exercise the true `sd_oauth_` shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- schema mock: every export stands in for a table object -----------------
vi.mock('@/lib/db/schema', () => ({
  oauthClients: { __table: 'oauthClients', clientId: { __col: 'clientId' }, id: { __col: 'id' } },
  oauthAccessTokens: { __table: 'oauthAccessTokens' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
}));

// --- db mock: capture every insert; resolve the client-id lookup ------------
const inserts: Array<{ table: string; values: unknown; onConflict: boolean }> = [];
let existingClientRow: Array<{ id: number }> = [{ id: 42 }];

vi.mock('@/lib/db', () => {
  const insert = (table: { __table: string }) => ({
    values: (values: unknown) => {
      const rec = { table: table.__table, values, onConflict: false };
      const thenable = {
        // awaited directly (access-token insert)
        then: (res: (v: unknown) => unknown) => { inserts.push(rec); return Promise.resolve().then(() => res(undefined)); },
        // chained for the client upsert
        onConflictDoNothing: () => {
          rec.onConflict = true;
          return Promise.resolve().then(() => { inserts.push(rec); });
        },
      };
      return thenable;
    },
  });
  const select = () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(existingClientRow),
      }),
    }),
  });
  return { db: { insert, select } };
});

// Re-import per test so the helper's process-lifetime client-id cache is fresh
// (otherwise only the first mint shows the idempotent client seed).
type IssueModule = typeof import('@/lib/oauth/issue');
let mintInternalAccessToken: IssueModule['mintInternalAccessToken'];
let INTERNAL_AGENTS_CLIENT_ID: IssueModule['INTERNAL_AGENTS_CLIENT_ID'];
let DEFAULT_INTERNAL_TTL_SECONDS: IssueModule['DEFAULT_INTERNAL_TTL_SECONDS'];

beforeEach(async () => {
  inserts.length = 0;
  existingClientRow = [{ id: 42 }];
  vi.resetModules();
  ({ mintInternalAccessToken, INTERNAL_AGENTS_CLIENT_ID, DEFAULT_INTERNAL_TTL_SECONDS } =
    await import('@/lib/oauth/issue'));
});

describe('mintInternalAccessToken', () => {
  it('mints an sd_oauth_ token bound to the given tenant + user, no refresh token', async () => {
    const before = Date.now();
    const { token, expiresAt } = await mintInternalAccessToken({
      clientId: 104,
      userId: 7,
      scopes: ['brain:read', 'brain:write'],
      resource: 'https://app.example.com/api/mcp',
    });

    expect(token.startsWith('sd_oauth_')).toBe(true);

    const tokenInsert = inserts.find((i) => i.table === 'oauthAccessTokens');
    expect(tokenInsert, 'an access-token row is inserted').toBeTruthy();
    const v = tokenInsert!.values as Record<string, unknown>;
    expect(v.clientId).toBe(104);
    expect(v.userId).toBe(7);
    expect(v.scopes).toEqual(['brain:read', 'brain:write']);
    expect(v.resource).toBe('https://app.example.com/api/mcp');
    // hash stored, never the raw token
    expect(typeof v.tokenHash).toBe('string');
    expect(v.tokenHash).not.toBe(token);

    // TTL defaults to ~30 min
    const ttlMs = (expiresAt.getTime() - before);
    expect(ttlMs).toBeGreaterThan((DEFAULT_INTERNAL_TTL_SECONDS - 5) * 1000);
    expect(ttlMs).toBeLessThan((DEFAULT_INTERNAL_TTL_SECONDS + 5) * 1000);

    // NO refresh token is ever written
    expect(inserts.some((i) => i.table === 'oauthRefreshTokens')).toBe(false);
  });

  it('idempotently self-seeds the internal agents oauth client (onConflictDoNothing)', async () => {
    await mintInternalAccessToken({ clientId: 1, userId: 1, scopes: [] });
    const clientUpsert = inserts.find((i) => i.table === 'oauthClients');
    expect(clientUpsert).toBeTruthy();
    expect(clientUpsert!.onConflict).toBe(true);
    const cv = clientUpsert!.values as Record<string, unknown>;
    expect(cv.clientId).toBe(INTERNAL_AGENTS_CLIENT_ID);
    expect(cv.tokenEndpointAuthMethod).toBe('none');
    expect(cv.redirectUris).toEqual([]);
    // null audience is allowed (unrestricted)
    const tok = inserts.find((i) => i.table === 'oauthAccessTokens')!.values as Record<string, unknown>;
    expect(tok.resource).toBeNull();
  });

  it('honours a custom TTL', async () => {
    const before = Date.now();
    const { expiresAt } = await mintInternalAccessToken({ clientId: 1, userId: 1, scopes: [], ttlSeconds: 90 });
    const ttlMs = expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThan(85 * 1000);
    expect(ttlMs).toBeLessThan(95 * 1000);
  });

  it('rejects non-integer clientId / userId (guards the tenant binding)', async () => {
    await expect(
      mintInternalAccessToken({ clientId: 1.5, userId: 1, scopes: [] }),
    ).rejects.toThrow();
    await expect(
      mintInternalAccessToken({ clientId: 1, userId: Number.NaN, scopes: [] }),
    ).rejects.toThrow();
  });
});
