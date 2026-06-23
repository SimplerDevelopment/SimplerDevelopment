// Unit tests for lib/plugins/jwt — focus on the verify contract.
//
// We use `signPluginJwtTestOnly` for fixtures so we don't need a real
// registered_app_signing_keys row. The DB-backed verify path is exercised by
// mocking `@/lib/db` with a chainable fake that returns either a registered
// app row or a signing-key row depending on the table being queried.
//
// DB-backed mint (`signPluginJwt`) round-trip is covered separately by the
// integration test suite — that path requires a real Postgres + KMS round-trip.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { sign as jwtSign } from 'jsonwebtoken';

// ─── Mock @/lib/db with a chainable fake ──────────────────────────────────
// Test code mutates these before each call. The mock inspects the table
// passed to .from() and returns the matching fixture.

type SigningKeyRow = {
  appId: number;
  kid: string;
  secretEncrypted: string;
  status: 'active' | 'retiring' | 'revoked';
};
type AppRow = { id: number; slug: string };

const fixtures: {
  apps: AppRow[];
  signingKeys: SigningKeyRow[];
} = { apps: [], signingKeys: [] };

// Recursively collect the leaf `{ kind:'eq', col, val }` predicates from a
// drizzle-shaped tree of `and(...)`-style nodes.
function collectEqs(
  node: unknown,
): Array<{ col: { __col?: string }; val: unknown }> {
  if (!node || typeof node !== 'object') return [];
  const n = node as { kind?: string; col?: unknown; val?: unknown; parts?: unknown[] };
  if (n.kind === 'eq') {
    return [{ col: (n.col ?? {}) as { __col?: string }, val: n.val }];
  }
  if (n.kind === 'and' && Array.isArray(n.parts)) {
    return n.parts.flatMap(collectEqs);
  }
  return [];
}

vi.mock('@/lib/db', () => {
  type Chain = {
    from: (t: unknown) => Chain;
    where: (w: unknown) => Chain;
    limit: (n: number) => Promise<unknown[]>;
    __rows: unknown[];
    __where: unknown;
  };
  const select = (_proj?: unknown): Chain => {
    const c: Chain = {
      __rows: [],
      __where: undefined,
      from(table: unknown) {
        const name = (table as { __name?: string })?.__name;
        if (name === 'registered_apps') c.__rows = fixtures.apps;
        else if (name === 'registered_app_signing_keys') c.__rows = fixtures.signingKeys;
        return c;
      },
      where(w: unknown) {
        c.__where = w;
        // Filter __rows by every eq predicate in the where tree. The
        // mocked schema columns expose __col matching the row property name
        // (e.g. 'id', 'slug', 'app_id', 'kid', 'status').
        const eqs = collectEqs(w);
        const propFor = (col?: string): string | null => {
          switch (col) {
            case 'id':
              return 'id';
            case 'slug':
              return 'slug';
            case 'app_id':
              return 'appId';
            case 'kid':
              return 'kid';
            case 'status':
              return 'status';
            default:
              return null;
          }
        };
        c.__rows = (c.__rows as Array<Record<string, unknown>>).filter((row) =>
          eqs.every(({ col, val }) => {
            const prop = propFor(col.__col);
            if (prop === null) return true;
            return row[prop] === val;
          }),
        );
        return c;
      },
      limit(_n: number) {
        return Promise.resolve(c.__rows);
      },
    };
    return c;
  };
  return { db: { select } };
});

// Schema mock — the real plugins schema imports from drizzle-orm/pg-core,
// which fails fast in pure-node test env without a database. We replace with
// stub markers identifying the table; the chainable mock above picks based on
// these markers.
vi.mock('@/lib/db/schema/plugins', () => ({
  registeredApps: {
    __name: 'registered_apps',
    id: { __col: 'id' },
    slug: { __col: 'slug' },
  },
  registeredAppSigningKeys: {
    __name: 'registered_app_signing_keys',
    appId: { __col: 'app_id' },
    kid: { __col: 'kid' },
    status: { __col: 'status' },
    secretEncrypted: { __col: 'secret_encrypted' },
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>(
    'drizzle-orm',
  );
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
    and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  };
});

// kms.decryptSecret is exercised in its own test file — here we stub so the
// stored `secretEncrypted` is just the plaintext secret. This keeps the JWT
// tests focused on verify-path branches.
vi.mock('@/lib/plugins/kms', () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string) => s,
}));

// IMPORTANT: dynamic import AFTER mocks are registered so the module under
// test picks up the stubs.
process.env.VITEST = 'true';
const {
  signPluginJwtTestOnly,
  verifyPluginJwt,
  PLUGIN_JWT_ISSUER,
  __clearJwtCache,
} = await import('@/lib/plugins/jwt');

// ─── Fixture helpers ───────────────────────────────────────────────────────

const APP_SLUG = 'content-tools';
const APP_ID = 42;
const KID = 'k1';
const SECRET = randomBytes(32).toString('base64');

function baseClaims(overrides: Record<string, unknown> = {}) {
  return {
    aud: APP_SLUG,
    sub: '7',
    clientId: 103,
    siteId: null as number | null,
    scopes: ['content:research:read', 'content:research:write'],
    ...overrides,
  };
}

beforeEach(() => {
  fixtures.apps = [{ id: APP_ID, slug: APP_SLUG }];
  fixtures.signingKeys = [
    { appId: APP_ID, kid: KID, secretEncrypted: SECRET, status: 'active' },
  ];
  __clearJwtCache();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('verifyPluginJwt — happy path', () => {
  it('round-trips a freshly-signed token', async () => {
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.iss).toBe(PLUGIN_JWT_ISSUER);
      expect(result.claims.aud).toBe(APP_SLUG);
      expect(result.claims.sub).toBe('7');
      expect(result.claims.clientId).toBe(103);
      expect(result.claims.siteId).toBeNull();
      expect(result.claims.scopes).toEqual([
        'content:research:read',
        'content:research:write',
      ]);
      expect(typeof result.claims.jti).toBe('string');
      expect(result.claims.jti.length).toBeGreaterThan(0);
      expect(result.claims.exp).toBeGreaterThan(result.claims.iat);
    }
  });

  it('accepts a token signed with a retiring key', async () => {
    fixtures.signingKeys[0].status = 'retiring';
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(true);
  });
});

describe('verifyPluginJwt — rejections', () => {
  it('rejects an expired token', async () => {
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims(), {
      now: Date.now() - 120_000, // 2 minutes ago
      ttlSeconds: 60,
    });
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token with a tampered payload byte', async () => {
    // Flip a bit in the signature segment — guarantees the JWT is still a
    // structurally valid 3-segment token with a parseable JSON payload, but
    // the HMAC no longer matches the header+payload. That's the exact
    // condition we want to assert produces `invalid-sig`.
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const [headerB64, payloadB64, sigB64] = token.split('.');
    const sigBuf = Buffer.from(sigB64, 'base64url');
    sigBuf[0] ^= 0x01;
    const tampered = [headerB64, payloadB64, sigBuf.toString('base64url')].join(
      '.',
    );
    const result = await verifyPluginJwt(tampered, APP_SLUG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-sig');
  });

  it('rejects when the audience does not match', async () => {
    const token = await signPluginJwtTestOnly(
      SECRET,
      KID,
      baseClaims({ aud: 'some-other-app' }),
    );
    // Resolver looks up by expectedAud — point it at our known slug so the
    // verify-stage audience check (not the resolver) fires.
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-aud');
  });

  it('rejects when the issuer is wrong', async () => {
    // Build a token by hand with the wrong iss; the testOnly helper hard-codes
    // 'simplerdev-portal' so we sign manually here.
    const now = Math.floor(Date.now() / 1000);
    const token = jwtSign(
      {
        iss: 'malicious-issuer',
        aud: APP_SLUG,
        sub: '7',
        clientId: 103,
        siteId: null,
        scopes: ['content:research:read'],
        jti: randomUUID(),
        iat: now,
        exp: now + 60,
      },
      SECRET,
      {
        algorithm: 'HS256',
        header: { alg: 'HS256', typ: 'JWT', kid: KID },
        noTimestamp: true,
      },
    );
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-issuer');
  });

  it('rejects when the header is missing `kid`', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwtSign(
      {
        iss: PLUGIN_JWT_ISSUER,
        aud: APP_SLUG,
        sub: '7',
        clientId: 103,
        siteId: null,
        scopes: [],
        jti: randomUUID(),
        iat: now,
        exp: now + 60,
      },
      SECRET,
      {
        algorithm: 'HS256',
        // header without kid
        header: { alg: 'HS256', typ: 'JWT' },
        noTimestamp: true,
      },
    );
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects an `alg: none` token', async () => {
    // Hand-craft an unsigned JWT — header.alg=none, empty signature segment.
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: PLUGIN_JWT_ISSUER,
        aud: APP_SLUG,
        sub: '7',
        clientId: 103,
        siteId: null,
        scopes: [],
        jti: randomUUID(),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    ).toString('base64url');
    const token = `${header}.${payload}.`;
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(false);
    // Must NOT be ok with reason 'expired' or anything implying success-ish.
    if (!result.ok) {
      expect(['malformed', 'invalid-sig']).toContain(result.reason);
    }
  });

  it('rejects an HS256-only verifier against an RS256-claiming header', async () => {
    // We can't easily produce a real RS256 token without keys, but we can
    // forge a header that claims alg=RS256 atop an otherwise-valid HS256
    // body — the verifier MUST reject based on alg mismatch before signature
    // verification.
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: PLUGIN_JWT_ISSUER,
        aud: APP_SLUG,
        sub: '7',
        clientId: 103,
        siteId: null,
        scopes: [],
        jti: randomUUID(),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    ).toString('base64url');
    const token = `${header}.${payload}.AAAA`;
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['invalid-sig', 'malformed']).toContain(result.reason);
    }
  });

  it('rejects garbage strings as malformed', async () => {
    const r1 = await verifyPluginJwt('not-a-jwt-at-all', APP_SLUG);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe('malformed');

    const r2 = await verifyPluginJwt('aaaa.bbbb.cccc', APP_SLUG);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      // Could be malformed (bad b64) or invalid-sig (decodes but doesn't
      // verify) — both are acceptable rejections for random junk.
      expect(['malformed', 'invalid-sig', 'unknown-kid']).toContain(r2.reason);
    }
  });

  it('rejects when the signing key is revoked', async () => {
    fixtures.signingKeys[0].status = 'revoked';
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('revoked-key');
  });

  it('rejects when the kid is unknown to the app', async () => {
    const token = await signPluginJwtTestOnly(
      SECRET,
      'unknown-kid',
      baseClaims(),
    );
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unknown-kid');
  });

  it('rejects when the app slug does not exist', async () => {
    fixtures.apps = []; // no rows
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-aud');
  });
});

describe('signPluginJwtTestOnly — claim shape', () => {
  it('encodes the expected fields including a fresh jti each call', async () => {
    const a = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const b = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    expect(a).not.toBe(b);
    // jti changes; both tokens otherwise have identical headers/claim shape.
    const ra = await verifyPluginJwt(a, APP_SLUG);
    const rb = await verifyPluginJwt(b, APP_SLUG);
    expect(ra.ok && rb.ok).toBe(true);
    if (ra.ok && rb.ok) {
      expect(ra.claims.jti).not.toBe(rb.claims.jti);
    }
  });

  it('honours a caller-supplied ttlSeconds', async () => {
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims(), {
      ttlSeconds: 300,
    });
    const result = await verifyPluginJwt(token, APP_SLUG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.exp - result.claims.iat).toBe(300);
    }
  });
});
