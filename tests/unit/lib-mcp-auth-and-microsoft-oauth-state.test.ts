// @vitest-environment node
/**
 * Unit coverage for two security-critical auth helpers:
 *   1. lib/mcp-auth.ts            — MCP bearer-token validation (sd_mcp_… + sd_oauth_…)
 *   2. lib/microsoft/oauth-state.ts — Signed/expiring OAuth state for the
 *      Microsoft (Teams) connect flow.
 *
 * Both surfaces enforce trust boundaries; the tests below explicitly probe
 * forgery / tamper / replay / expiry / scope failure modes, not just the
 * happy paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
//   Shared drizzle mocks for lib/mcp-auth.ts
//
//   mcp-auth calls:
//     db.select().from(<table>).where(<cond>).limit(1) → row[]
//     db.update(<table>).set(...).where(...).then(...).catch(...)  (fire-and-forget)
//
//   We model `select` with a FIFO of return values so a single call site can
//   chain its two SELECTs (token row, then client row) deterministically.
// ─────────────────────────────────────────────────────────────────────────────
const selectResults: unknown[][] = [];
const updateSpy = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            const next = selectResults.shift();
            return Promise.resolve(next ?? []);
          },
        }),
      }),
    }),
    update: (...args: unknown[]) => {
      updateSpy(...args);
      return {
        set: () => ({
          where: () => ({
            then: (cb: (v: unknown) => void) => {
              try {
                cb(undefined);
              } catch {
                /* swallow — fire-and-forget contract */
              }
              return { catch: (_cb: (e: unknown) => void) => undefined };
            },
          }),
        }),
      };
    },
  },
}));

vi.mock('@/lib/db/schema', () => ({
  portalApiKeys: {
    id: { name: 'id' },
    keyHash: { name: 'key_hash' },
    active: { name: 'active' },
  },
  oauthAccessTokens: {
    id: { name: 'id' },
    tokenHash: { name: 'token_hash' },
  },
  clients: {
    id: { name: 'id' },
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}));

import {
  PORTAL_KEY_PREFIX,
  OAUTH_TOKEN_PREFIX,
  generatePortalApiKey,
  hashPortalApiKey,
  resolvePortalApiKey,
  resolveOAuthToken,
  resolvePortalFromRequest,
  hasScope,
} from '@/lib/mcp-auth';
import {
  signState as signMicrosoftState,
  verifyState as verifyMicrosoftState,
  StateInvalidError as MicrosoftStateInvalidError,
} from '@/lib/microsoft/oauth-state';
import { createHmac as nodeCreateHmac } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
//   MCP auth tests
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/mcp-auth', () => {
  beforeEach(() => {
    selectResults.length = 0;
    updateSpy.mockReset();
  });

  describe('generatePortalApiKey', () => {
    it('produces a key with the portal prefix, sha256 hash, and a short preview', () => {
      const { key, hash, preview } = generatePortalApiKey();
      expect(key.startsWith(PORTAL_KEY_PREFIX)).toBe(true);
      // sd_mcp_ + 64 hex chars = 7 + 64 = 71
      expect(key.length).toBe(PORTAL_KEY_PREFIX.length + 64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      // hash must be deterministic for the returned key
      expect(hash).toBe(hashPortalApiKey(key));
      // preview should mask the middle — first 12 + ellipsis + last 4
      expect(preview.startsWith(key.slice(0, 12))).toBe(true);
      expect(preview.endsWith(key.slice(-4))).toBe(true);
      expect(preview).toContain('…');
    });

    it('returns a different key on each call (entropy sanity)', () => {
      const a = generatePortalApiKey();
      const b = generatePortalApiKey();
      expect(a.key).not.toBe(b.key);
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe('hashPortalApiKey', () => {
    it('is deterministic for the same input', () => {
      expect(hashPortalApiKey('hello')).toBe(hashPortalApiKey('hello'));
    });
    it('differs for different inputs', () => {
      expect(hashPortalApiKey('a')).not.toBe(hashPortalApiKey('b'));
    });
  });

  describe('resolvePortalApiKey', () => {
    it('returns null for tokens missing the sd_mcp_ prefix (defense in depth)', async () => {
      const ctx = await resolvePortalApiKey('bearer-without-prefix');
      expect(ctx).toBeNull();
      // must not have hit the DB
      expect(selectResults).toEqual([]);
    });

    it('returns null when no key row matches the hash', async () => {
      selectResults.push([]); // no portal_api_keys row
      const ctx = await resolvePortalApiKey(`${PORTAL_KEY_PREFIX}deadbeef`);
      expect(ctx).toBeNull();
    });

    it('returns null when the key is revoked (revokedAt set)', async () => {
      selectResults.push([
        {
          id: 1,
          userId: 10,
          clientId: 100,
          scopes: ['*'],
          revokedAt: new Date('2026-01-01T00:00:00Z'),
          expiresAt: null,
        },
      ]);
      const ctx = await resolvePortalApiKey(`${PORTAL_KEY_PREFIX}revoked`);
      expect(ctx).toBeNull();
    });

    it('returns null when the key has expired', async () => {
      selectResults.push([
        {
          id: 2,
          userId: 10,
          clientId: 100,
          scopes: [],
          revokedAt: null,
          expiresAt: new Date(Date.now() - 60_000), // 1 min ago
        },
      ]);
      const ctx = await resolvePortalApiKey(`${PORTAL_KEY_PREFIX}expired`);
      expect(ctx).toBeNull();
    });

    it('returns null when the referenced client row is missing', async () => {
      selectResults.push([
        {
          id: 3,
          userId: 11,
          clientId: 999,
          scopes: ['projects:read'],
          revokedAt: null,
          expiresAt: null,
        },
      ]);
      selectResults.push([]); // clients lookup empty
      const ctx = await resolvePortalApiKey(`${PORTAL_KEY_PREFIX}noclient`);
      expect(ctx).toBeNull();
    });

    it('returns a valid context for an active key and updates lastUsedAt', async () => {
      const record = {
        id: 5,
        userId: 12,
        clientId: 200,
        scopes: ['projects:read', 'tickets:write'],
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      };
      const client = { id: 200, name: 'Acme' };
      selectResults.push([record]);
      selectResults.push([client]);

      const ctx = await resolvePortalApiKey(`${PORTAL_KEY_PREFIX}good`);

      expect(ctx).not.toBeNull();
      expect(ctx!.userId).toBe(12);
      expect(ctx!.client).toEqual(client);
      expect(ctx!.scopes).toEqual(['projects:read', 'tickets:write']);
      expect(ctx!.keyId).toBe(5);
      // fire-and-forget lastUsedAt write should have happened
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it('coerces null scopes to an empty array', async () => {
      const record = {
        id: 6,
        userId: 13,
        clientId: 201,
        scopes: null,
        revokedAt: null,
        expiresAt: null,
      };
      selectResults.push([record]);
      selectResults.push([{ id: 201, name: 'Beta' }]);

      const ctx = await resolvePortalApiKey(`${PORTAL_KEY_PREFIX}nullscopes`);
      expect(ctx!.scopes).toEqual([]);
    });
  });

  describe('resolveOAuthToken', () => {
    it('returns null for tokens missing the sd_oauth_ prefix', async () => {
      const ctx = await resolveOAuthToken('not-an-oauth-token');
      expect(ctx).toBeNull();
      expect(selectResults).toEqual([]);
    });

    it('returns null when no token row matches the hash', async () => {
      selectResults.push([]);
      const ctx = await resolveOAuthToken(`${OAUTH_TOKEN_PREFIX}missing`);
      expect(ctx).toBeNull();
    });

    it('returns null when the OAuth token is revoked', async () => {
      selectResults.push([
        {
          id: 7,
          userId: 14,
          clientId: 300,
          scopes: ['*'],
          revokedAt: new Date('2025-12-31T00:00:00Z'),
          expiresAt: null,
        },
      ]);
      const ctx = await resolveOAuthToken(`${OAUTH_TOKEN_PREFIX}revoked`);
      expect(ctx).toBeNull();
    });

    it('returns null when the OAuth token is expired', async () => {
      selectResults.push([
        {
          id: 8,
          userId: 14,
          clientId: 300,
          scopes: [],
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1_000),
        },
      ]);
      const ctx = await resolveOAuthToken(`${OAUTH_TOKEN_PREFIX}expired`);
      expect(ctx).toBeNull();
    });

    it('returns null when the referenced client row is missing', async () => {
      selectResults.push([
        {
          id: 9,
          userId: 15,
          clientId: 404,
          scopes: ['files:read'],
          revokedAt: null,
          expiresAt: null,
        },
      ]);
      selectResults.push([]);
      const ctx = await resolveOAuthToken(`${OAUTH_TOKEN_PREFIX}orphan`);
      expect(ctx).toBeNull();
    });

    it('returns a valid context for an active OAuth token and updates lastUsedAt', async () => {
      const record = {
        id: 10,
        userId: 16,
        clientId: 500,
        scopes: ['files:read', 'files:write'],
        revokedAt: null,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      };
      const client = { id: 500, name: 'Gamma' };
      selectResults.push([record]);
      selectResults.push([client]);

      const ctx = await resolveOAuthToken(`${OAUTH_TOKEN_PREFIX}good`);

      expect(ctx).not.toBeNull();
      expect(ctx!.userId).toBe(16);
      expect(ctx!.client).toEqual(client);
      expect(ctx!.scopes).toEqual(['files:read', 'files:write']);
      expect(ctx!.keyId).toBe(10);
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it('coerces null scopes to an empty array', async () => {
      selectResults.push([
        {
          id: 11,
          userId: 17,
          clientId: 501,
          scopes: null,
          revokedAt: null,
          expiresAt: null,
        },
      ]);
      selectResults.push([{ id: 501 }]);
      const ctx = await resolveOAuthToken(`${OAUTH_TOKEN_PREFIX}empty`);
      expect(ctx!.scopes).toEqual([]);
    });
  });

  describe('resolvePortalFromRequest', () => {
    function makeReq(headers: Record<string, string>): Request {
      return new Request('https://example.test/mcp', { headers });
    }

    it('returns null when the Authorization header is missing', async () => {
      const ctx = await resolvePortalFromRequest(makeReq({}));
      expect(ctx).toBeNull();
    });

    it('returns null when the header is not in Bearer form', async () => {
      const ctx = await resolvePortalFromRequest(
        makeReq({ authorization: 'Basic dXNlcjpwYXNz' })
      );
      expect(ctx).toBeNull();
    });

    it('dispatches sd_oauth_ tokens to the OAuth resolver', async () => {
      const record = {
        id: 20,
        userId: 30,
        clientId: 600,
        scopes: ['*'],
        revokedAt: null,
        expiresAt: null,
      };
      selectResults.push([record]);
      selectResults.push([{ id: 600 }]);

      const ctx = await resolvePortalFromRequest(
        makeReq({ authorization: `Bearer ${OAUTH_TOKEN_PREFIX}abc123` })
      );
      expect(ctx).not.toBeNull();
      expect(ctx!.keyId).toBe(20);
    });

    it('dispatches sd_mcp_ tokens to the portal key resolver', async () => {
      const record = {
        id: 21,
        userId: 31,
        clientId: 601,
        scopes: ['projects:read'],
        revokedAt: null,
        expiresAt: null,
      };
      selectResults.push([record]);
      selectResults.push([{ id: 601 }]);

      const ctx = await resolvePortalFromRequest(
        makeReq({ authorization: `Bearer ${PORTAL_KEY_PREFIX}xyz` })
      );
      expect(ctx).not.toBeNull();
      expect(ctx!.keyId).toBe(21);
    });

    it('accepts the capitalized Authorization header', async () => {
      // No DB rows pushed → portal resolver will return null (key not found),
      // but the important thing is the header was parsed.
      selectResults.push([]);
      const ctx = await resolvePortalFromRequest(
        makeReq({ Authorization: `Bearer ${PORTAL_KEY_PREFIX}whatever` })
      );
      expect(ctx).toBeNull();
    });

    it('trims whitespace around the bearer value', async () => {
      selectResults.push([]);
      const ctx = await resolvePortalFromRequest(
        makeReq({ authorization: `Bearer    ${PORTAL_KEY_PREFIX}trim   ` })
      );
      // We only assert it didn't throw and that prefix dispatch worked
      // (would have returned null because no row was found).
      expect(ctx).toBeNull();
    });
  });

  describe('hasScope', () => {
    it('grants everything when the wildcard "*" is present', () => {
      expect(hasScope(['*'], 'projects:read')).toBe(true);
      expect(hasScope(['*'], 'anything:write')).toBe(true);
    });

    it('grants an exact scope match', () => {
      expect(hasScope(['projects:read'], 'projects:read')).toBe(true);
    });

    it('grants a resource-level wildcard ("projects:*" satisfies "projects:read")', () => {
      expect(hasScope(['projects:*'], 'projects:read')).toBe(true);
      expect(hasScope(['projects:*'], 'projects:write')).toBe(true);
    });

    it('denies an unrelated scope', () => {
      expect(hasScope(['tickets:read'], 'projects:read')).toBe(false);
    });

    it('denies when granted list is empty', () => {
      expect(hasScope([], 'projects:read')).toBe(false);
    });

    it('does not cross-grant between resources', () => {
      // tickets:* should NOT satisfy projects:read
      expect(hasScope(['tickets:*'], 'projects:read')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//   Microsoft OAuth-state tests
//
//   Mirrors the google/oauth-state.test.ts coverage but typed against
//   MicrosoftSurface values ('identity' | 'transcripts').
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/microsoft/oauth-state', () => {
  const PREV_SECRET = process.env.OAUTH_STATE_SECRET;

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'a'.repeat(64);
    vi.useRealTimers();
  });

  afterEach(() => {
    process.env.OAUTH_STATE_SECRET = PREV_SECRET;
  });

  it('round-trips a typical payload', () => {
    const state = signMicrosoftState({
      clientId: 42,
      userId: 7,
      surfaces: ['identity', 'transcripts'],
    });
    const payload = verifyMicrosoftState(state);
    expect(payload.clientId).toBe(42);
    expect(payload.userId).toBe(7);
    expect(payload.surfaces).toEqual(['identity', 'transcripts']);
    expect(typeof payload.nonce).toBe('string');
    expect(payload.nonce.length).toBeGreaterThan(0);
    expect(payload.expiresAt).toBeGreaterThan(Date.now());
  });

  it('preserves returnTo when provided', () => {
    const state = signMicrosoftState({
      clientId: 1,
      userId: 1,
      surfaces: ['identity'],
      returnTo: '/portal/integrations/microsoft',
    });
    expect(verifyMicrosoftState(state).returnTo).toBe('/portal/integrations/microsoft');
  });

  it('omits returnTo when not provided', () => {
    const state = signMicrosoftState({ clientId: 1, userId: 1, surfaces: ['identity'] });
    expect(verifyMicrosoftState(state).returnTo).toBeUndefined();
  });

  it('produces different states for identical inputs (random nonce)', () => {
    const opts = { clientId: 1, userId: 1, surfaces: ['identity'] as const };
    const a = signMicrosoftState(opts);
    const b = signMicrosoftState(opts);
    expect(a).not.toBe(b);
    expect(verifyMicrosoftState(a).clientId).toBe(1);
    expect(verifyMicrosoftState(b).clientId).toBe(1);
  });

  it('rejects malformed state with no dot separator', () => {
    expect(() => verifyMicrosoftState('not-a-valid-state')).toThrowError(
      MicrosoftStateInvalidError
    );
    try {
      verifyMicrosoftState('not-a-valid-state');
    } catch (e) {
      expect((e as InstanceType<typeof MicrosoftStateInvalidError>).reason).toBe(
        'malformed'
      );
    }
  });

  it('rejects malformed state with too many dots', () => {
    try {
      verifyMicrosoftState('a.b.c');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MicrosoftStateInvalidError);
      expect((e as InstanceType<typeof MicrosoftStateInvalidError>).reason).toBe(
        'malformed'
      );
    }
  });

  it('rejects state signed with a different secret (forgery)', () => {
    const state = signMicrosoftState({ clientId: 1, userId: 1, surfaces: ['identity'] });
    process.env.OAUTH_STATE_SECRET = 'b'.repeat(64);
    try {
      verifyMicrosoftState(state);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as InstanceType<typeof MicrosoftStateInvalidError>).reason).toBe(
        'bad_signature'
      );
    }
  });

  it('rejects state with a tampered payload (clientId swap, same signature)', () => {
    const state = signMicrosoftState({ clientId: 1, userId: 1, surfaces: ['identity'] });
    const [, sig] = state.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        clientId: 999,
        userId: 1,
        surfaces: ['identity'],
        nonce: 'xx',
        expiresAt: Date.now() + 60_000,
      })
    ).toString('base64url');
    const tampered = `${forgedPayload}.${sig}`;
    try {
      verifyMicrosoftState(tampered);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as InstanceType<typeof MicrosoftStateInvalidError>).reason).toBe(
        'bad_signature'
      );
    }
  });

  it('rejects expired state (replay after TTL)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T00:00:00Z'));
    const state = signMicrosoftState({
      clientId: 1,
      userId: 1,
      surfaces: ['transcripts'],
    });
    // TTL is 10 min — jump 11
    vi.setSystemTime(new Date('2026-05-20T00:11:00Z'));
    try {
      verifyMicrosoftState(state);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as InstanceType<typeof MicrosoftStateInvalidError>).reason).toBe(
        'expired'
      );
    }
  });

  it('rejects state with a valid signature but non-JSON payload', () => {
    const badPayload = Buffer.from('not-json-just-text').toString('base64url');
    const sig = nodeCreateHmac(
      'sha256',
      Buffer.from(process.env.OAUTH_STATE_SECRET as string, 'utf8')
    )
      .update(badPayload)
      .digest()
      .toString('base64url');
    const state = `${badPayload}.${sig}`;
    try {
      verifyMicrosoftState(state);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as InstanceType<typeof MicrosoftStateInvalidError>).reason).toBe(
        'malformed'
      );
    }
  });

  it('rejects state whose payload has wrong field types', () => {
    // Validly signed JSON, but clientId is a string — fails the type guard.
    const badPayload = Buffer.from(
      JSON.stringify({
        clientId: 'not-a-number',
        userId: 1,
        surfaces: ['identity'],
        nonce: 'nn',
        expiresAt: Date.now() + 60_000,
      })
    ).toString('base64url');
    const sig = nodeCreateHmac(
      'sha256',
      Buffer.from(process.env.OAUTH_STATE_SECRET as string, 'utf8')
    )
      .update(badPayload)
      .digest()
      .toString('base64url');
    const state = `${badPayload}.${sig}`;
    try {
      verifyMicrosoftState(state);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as InstanceType<typeof MicrosoftStateInvalidError>).reason).toBe(
        'malformed'
      );
    }
  });

  it('rejects state whose payload is missing required fields', () => {
    const badPayload = Buffer.from(
      JSON.stringify({ clientId: 1, userId: 1 /* no surfaces/nonce/expiresAt */ })
    ).toString('base64url');
    const sig = nodeCreateHmac(
      'sha256',
      Buffer.from(process.env.OAUTH_STATE_SECRET as string, 'utf8')
    )
      .update(badPayload)
      .digest()
      .toString('base64url');
    const state = `${badPayload}.${sig}`;
    try {
      verifyMicrosoftState(state);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as InstanceType<typeof MicrosoftStateInvalidError>).reason).toBe(
        'malformed'
      );
    }
  });

  it('throws when OAUTH_STATE_SECRET is not set', () => {
    delete process.env.OAUTH_STATE_SECRET;
    expect(() =>
      signMicrosoftState({ clientId: 1, userId: 1, surfaces: ['identity'] })
    ).toThrow(/OAUTH_STATE_SECRET/);
  });

  it('throws when OAUTH_STATE_SECRET is too short', () => {
    process.env.OAUTH_STATE_SECRET = 'short';
    expect(() =>
      signMicrosoftState({ clientId: 1, userId: 1, surfaces: ['identity'] })
    ).toThrow(/at least 32 chars/);
  });

  it('StateInvalidError carries the reason and class identity', () => {
    const err = new MicrosoftStateInvalidError('expired');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MicrosoftStateInvalidError);
    expect(err.name).toBe('StateInvalidError');
    expect(err.reason).toBe('expired');
    expect(err.message).toContain('expired');
  });
});
