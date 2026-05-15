// Plugin tenancy JWT — sign + verify.
//
// One token, two directions. The portal mints a short-lived (60s default)
// HMAC-SHA256 JWT and forwards it to a registered plugin via `x-sd-tenant`.
// The plugin sends the SAME token back on callbacks as
// `Authorization: Bearer <jwt>`. Plugins never sign.
//
// Per-app rotated signing keys live in `registered_app_signing_keys`. The JWT
// header carries `kid`; verify looks the key up by (appId, kid). `active` and
// `retiring` keys verify; `revoked` keys do not. Mint always uses an `active`
// key. The raw HMAC secret is stored AES-GCM-encrypted via lib/plugins/kms.ts.
//
// Verification MUST (per .planning/plugin-registry-spec.md "JWT contract"):
//   - reject any algorithm other than HS256 (no `alg: none`, no asymmetric)
//   - reject if iss !== 'simplerdev-portal'
//   - reject if aud !== <expectedAud>
//   - reject if exp <= now
//   - reject if kid is missing from header
//   - reject if the signing key referenced by kid is revoked
//
// jti uniqueness / replay dedup is enforced separately at callback time by
// inserting into registered_app_callbacks_audit with UNIQUE(jti); this module
// only mints / verifies signatures.

import {
  decode as jwtDecode,
  sign as jwtSign,
  verify as jwtVerify,
  JsonWebTokenError,
  TokenExpiredError,
  type Algorithm,
  type Jwt,
  type JwtHeader,
  type JwtPayload,
} from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  registeredApps,
  registeredAppSigningKeys,
} from '@/lib/db/schema/plugins';
import { decryptSecret } from './kms';

export interface PluginJwtHeader {
  alg: 'HS256';
  typ: 'JWT';
  kid: string;
}

export interface PluginJwtClaims {
  iss: 'simplerdev-portal';
  aud: string; // app.slug
  sub: string; // userId stringified
  clientId: number;
  siteId: number | null;
  scopes: string[];
  jti: string;
  iat: number;
  exp: number;
}

export type VerifyFailure =
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'invalid-sig' }
  | { ok: false; reason: 'invalid-aud' }
  | { ok: false; reason: 'invalid-issuer' }
  | { ok: false; reason: 'malformed' }
  | { ok: false; reason: 'unknown-kid' }
  | { ok: false; reason: 'revoked-key' };

export type VerifySuccess = { ok: true; claims: PluginJwtClaims };

export const PLUGIN_JWT_ISSUER = 'simplerdev-portal' as const;
export const PLUGIN_JWT_ALG: Algorithm = 'HS256';
export const PLUGIN_JWT_DEFAULT_TTL_SECONDS = 60;

// ─── In-memory decrypted-secret cache ──────────────────────────────────────
// Decrypting on every callback is wasteful — the secret rarely changes and the
// callback surface is hot. Cache the plaintext keyed by (appId, kid) for 60s,
// matching the JWT TTL: a revocation will be picked up within one TTL window
// without needing a cross-process bus. Tests can clear via `__clearJwtCache`.

interface CacheEntry {
  secret: string;
  status: 'active' | 'retiring' | 'revoked';
  expiresAt: number;
}

const SECRET_CACHE = new Map<string, CacheEntry>();
const SECRET_CACHE_TTL_MS = 60_000;

function cacheKey(appId: number, kid: string): string {
  return `${appId}:${kid}`;
}

/** Test helper: reset the in-memory cache. */
export function __clearJwtCache(): void {
  SECRET_CACHE.clear();
}

// ─── Sign ──────────────────────────────────────────────────────────────────

/**
 * Mint a plugin tenancy JWT. Loads the active signing key for `appId` from the
 * DB, decrypts via KMS, and signs HS256 with `kid` in the header.
 *
 * Caller supplies the tenancy claims (aud, sub, clientId, siteId, scopes);
 * iss/iat/exp/jti are derived here.
 */
export async function signPluginJwt(
  appId: number,
  claims: Omit<PluginJwtClaims, 'iss' | 'iat' | 'exp' | 'jti'>,
  opts?: { ttlSeconds?: number; now?: number },
): Promise<string> {
  const now = opts?.now ?? Date.now();
  const ttl = opts?.ttlSeconds ?? PLUGIN_JWT_DEFAULT_TTL_SECONDS;
  const iat = Math.floor(now / 1000);
  const exp = iat + ttl;
  const jti = randomUUID();

  const rows = await db
    .select()
    .from(registeredAppSigningKeys)
    .where(
      and(
        eq(registeredAppSigningKeys.appId, appId),
        eq(registeredAppSigningKeys.status, 'active'),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(
      `signPluginJwt: no active signing key for appId=${appId}`,
    );
  }
  const secret = decryptSecret(row.secretEncrypted);
  // Refresh cache with the freshly-decrypted plaintext so a subsequent verify
  // on the same kid hits memory.
  SECRET_CACHE.set(cacheKey(appId, row.kid), {
    secret,
    status: 'active',
    expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
  });

  const payload: PluginJwtClaims = {
    iss: PLUGIN_JWT_ISSUER,
    aud: claims.aud,
    sub: claims.sub,
    clientId: claims.clientId,
    siteId: claims.siteId,
    scopes: claims.scopes,
    jti,
    iat,
    exp,
  };

  // We pass `iat` inside the payload; jsonwebtoken preserves a caller-
  // provided `iat`. (noTimestamp is NOT used here: noTimestamp deletes iat
  // from the payload entirely, which would break the verifier's shape check.)
  return jwtSign(payload, secret, {
    algorithm: PLUGIN_JWT_ALG,
    header: { alg: PLUGIN_JWT_ALG, typ: 'JWT', kid: row.kid },
  });
}

// ─── Verify ────────────────────────────────────────────────────────────────

interface DecodedHeader {
  alg?: string;
  kid?: string;
}

function decodeHeader(token: string): DecodedHeader | null {
  // jsonwebtoken.decode({ complete: true }) returns header + payload but
  // does NOT verify the signature — safe for kid extraction.
  const decoded = jwtDecode(token, { complete: true }) as Jwt | null;
  if (!decoded || typeof decoded !== 'object') return null;
  const header = decoded.header as JwtHeader | undefined;
  if (!header) return null;
  return { alg: header.alg, kid: header.kid };
}

async function loadSigningKey(
  appId: number,
  kid: string,
): Promise<{ secret: string; status: 'active' | 'retiring' | 'revoked' } | null> {
  const cacheK = cacheKey(appId, kid);
  const cached = SECRET_CACHE.get(cacheK);
  if (cached && cached.expiresAt > Date.now()) {
    return { secret: cached.secret, status: cached.status };
  }
  const rows = await db
    .select()
    .from(registeredAppSigningKeys)
    .where(
      and(
        eq(registeredAppSigningKeys.appId, appId),
        eq(registeredAppSigningKeys.kid, kid),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const status = row.status as 'active' | 'retiring' | 'revoked';
  let secret: string;
  try {
    secret = decryptSecret(row.secretEncrypted);
  } catch {
    // Treat undecryptable rows as missing — never throw out of verify.
    return null;
  }
  SECRET_CACHE.set(cacheK, {
    secret,
    status,
    expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
  });
  return { secret, status };
}

async function resolveAppIdBySlug(slug: string): Promise<number | null> {
  const rows = await db
    .select({ id: registeredApps.id })
    .from(registeredApps)
    .where(eq(registeredApps.slug, slug))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Verify a plugin tenancy JWT. The verifier must always know which app it
 * thinks it's talking to (`expectedAud`); we never trust the `aud` claim
 * alone — we use it to look up the app + the matching signing key.
 *
 * Returns a tagged-union — callers MUST narrow on `ok` before reading `claims`.
 */
export async function verifyPluginJwt(
  token: string,
  expectedAud: string,
  _opts?: { now?: number },
): Promise<VerifySuccess | VerifyFailure> {
  // 1. Decode header to read kid + alg. We do NOT trust this — re-checked by
  //    jwt.verify below — but we need kid to look up the secret.
  let header: DecodedHeader | null;
  try {
    header = decodeHeader(token);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!header) return { ok: false, reason: 'malformed' };
  // Defence-in-depth: reject obvious shenanigans before we even hit the DB.
  // jwt.verify will also reject these because we pass algorithms:['HS256'].
  if (!header.alg || header.alg.toLowerCase() === 'none') {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'HS256') {
    return { ok: false, reason: 'invalid-sig' };
  }
  if (!header.kid || typeof header.kid !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  // 2. Resolve appId from expectedAud (the slug). This is the verifier's
  //    intent — if the app doesn't exist, the token is unusable for us.
  const appId = await resolveAppIdBySlug(expectedAud);
  if (appId === null) return { ok: false, reason: 'invalid-aud' };

  // 3. Load the signing key for (appId, kid).
  const key = await loadSigningKey(appId, header.kid);
  if (!key) return { ok: false, reason: 'unknown-kid' };
  if (key.status === 'revoked') return { ok: false, reason: 'revoked-key' };

  // 4. Verify signature + expiry + issuer + audience in one shot. Force HS256.
  let payload: JwtPayload | string;
  try {
    payload = jwtVerify(token, key.secret, {
      algorithms: [PLUGIN_JWT_ALG],
      issuer: PLUGIN_JWT_ISSUER,
      audience: expectedAud,
      // jsonwebtoken's `clock*` options take seconds; we let it use Date.now
      // by default. Tests that need a pinned `now` set it via `opts.now` for
      // signPluginJwt and let exp be 60s in the future, so default clock is
      // fine.
    }) as JwtPayload | string;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return { ok: false, reason: 'expired' };
    }
    if (err instanceof JsonWebTokenError) {
      const msg = err.message ?? '';
      if (msg.includes('audience')) return { ok: false, reason: 'invalid-aud' };
      if (msg.includes('issuer')) return { ok: false, reason: 'invalid-issuer' };
      if (msg.includes('jwt malformed') || msg.includes('invalid token')) {
        return { ok: false, reason: 'malformed' };
      }
      // Default JsonWebTokenError on bad signature / wrong algorithm.
      return { ok: false, reason: 'invalid-sig' };
    }
    return { ok: false, reason: 'malformed' };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'malformed' };
  }

  // 5. Final shape check. Everything below is a defensive narrow — the
  //    in-the-wild surface here is small (we sign these ourselves) but we
  //    can't read JSON and trust it.
  const claims = payload as JwtPayload;
  if (
    claims.iss !== PLUGIN_JWT_ISSUER ||
    typeof claims.aud !== 'string' ||
    typeof claims.sub !== 'string' ||
    typeof (claims as Record<string, unknown>).clientId !== 'number' ||
    !Array.isArray((claims as Record<string, unknown>).scopes) ||
    typeof claims.jti !== 'string' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const siteIdRaw = (claims as Record<string, unknown>).siteId;
  if (siteIdRaw !== null && typeof siteIdRaw !== 'number') {
    return { ok: false, reason: 'malformed' };
  }

  const out: PluginJwtClaims = {
    iss: PLUGIN_JWT_ISSUER,
    aud: claims.aud,
    sub: claims.sub,
    clientId: (claims as Record<string, unknown>).clientId as number,
    siteId: siteIdRaw as number | null,
    scopes: ((claims as Record<string, unknown>).scopes as unknown[]).map(
      String,
    ),
    jti: claims.jti,
    iat: claims.iat,
    exp: claims.exp,
  };
  return { ok: true, claims: out };
}

// ─── Test-only helper ──────────────────────────────────────────────────────
//
// Lets unit + integration tests mint a token against an inline secret without
// having to seed a registered_app_signing_keys row. Guarded so it CANNOT run
// in production (would throw). Verify uses the regular code path against a
// mocked DB.

const TEST_ONLY_ENABLED =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST === '1' ||
  !!process.env.VITEST_POOL_ID;

export async function signPluginJwtTestOnly(
  secret: string,
  kid: string,
  claims: Omit<PluginJwtClaims, 'iss' | 'iat' | 'exp' | 'jti'>,
  opts?: { ttlSeconds?: number; now?: number },
): Promise<string> {
  if (!TEST_ONLY_ENABLED) {
    throw new Error(
      'signPluginJwtTestOnly is only usable when NODE_ENV=test or VITEST is set',
    );
  }
  const now = opts?.now ?? Date.now();
  const ttl = opts?.ttlSeconds ?? PLUGIN_JWT_DEFAULT_TTL_SECONDS;
  const iat = Math.floor(now / 1000);
  const exp = iat + ttl;
  const jti = randomUUID();
  const payload: PluginJwtClaims = {
    iss: PLUGIN_JWT_ISSUER,
    aud: claims.aud,
    sub: claims.sub,
    clientId: claims.clientId,
    siteId: claims.siteId,
    scopes: claims.scopes,
    jti,
    iat,
    exp,
  };
  return jwtSign(payload, secret, {
    algorithm: PLUGIN_JWT_ALG,
    header: { alg: PLUGIN_JWT_ALG, typ: 'JWT', kid },
  });
}
