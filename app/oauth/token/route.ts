import { db } from '@/lib/db';
import { oauthClients, oauthAuthorizationCodes, oauthAccessTokens, oauthRefreshTokens } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
  generateAccessToken,
  generateRefreshFamilyId,
  generateRefreshToken,
  parseBasicAuthHeader,
  sha256,
  verifyClientSecret,
  verifyPkceS256,
} from '@/lib/oauth/server';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Short-lived access tokens (OAuth 2.1 / RFC 9700 BCP): a leaked bearer is only
// valid for an hour. Clients renew silently via the refresh_token grant below.
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
// Refresh tokens are long-lived but single-use (rotated on every redemption).
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days

function err(status: number, error: string, description?: string, headers?: Record<string, string>) {
  return Response.json({ error, error_description: description }, {
    status,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', ...(headers ?? {}) },
  });
}

/** RFC 6749 §5.2 — `invalid_client` on the token endpoint requires a 401 plus
 *  a `WWW-Authenticate: Basic` challenge when the client used Basic auth. */
function invalidClient(usedBasic: boolean, description: string) {
  return err(401, 'invalid_client', description, usedBasic ? { 'WWW-Authenticate': 'Basic realm="oauth"' } : undefined);
}

/** Issue an access-token + refresh-token pair and return the RFC 6749 §5.1
 *  response. The two tokens share a rotation `familyId` so reuse of a consumed
 *  refresh token can revoke the whole lineage. */
async function issueTokenPair(opts: {
  oauthClientId: number;
  userId: number;
  clientId: number;
  scopes: string[];
  resource: string | null;
  familyId: string;
}): Promise<Response> {
  const access = generateAccessToken();
  await db.insert(oauthAccessTokens).values({
    tokenHash: access.hash,
    tokenPreview: access.preview,
    oauthClientId: opts.oauthClientId,
    userId: opts.userId,
    clientId: opts.clientId,
    scopes: opts.scopes,
    resource: opts.resource,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
  });

  const refresh = generateRefreshToken();
  await db.insert(oauthRefreshTokens).values({
    tokenHash: refresh.hash,
    tokenPreview: refresh.preview,
    oauthClientId: opts.oauthClientId,
    userId: opts.userId,
    clientId: opts.clientId,
    scopes: opts.scopes,
    resource: opts.resource,
    familyId: opts.familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  return Response.json({
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh.token,
    scope: opts.scopes.join(' '),
  }, {
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  });
}

/** RFC 6749 §6 — Refreshing an Access Token. The presented refresh token is
 *  single-use: redeeming it sets `consumed_at` and issues a fresh pair carrying
 *  the same `family_id`. Presenting an already-consumed token (a replay — the
 *  hallmark of a stolen, then-rotated token) revokes the whole family. The
 *  audience (`resource`) and scopes are inherited from the stored token and
 *  cannot be broadened. */
async function handleRefreshGrant(
  oauthClient: typeof oauthClients.$inferSelect,
  rawRefresh: string,
): Promise<Response> {
  const hash = sha256(rawRefresh);
  const [stored] = await db
    .select()
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.tokenHash, hash))
    .limit(1);
  if (!stored) return err(400, 'invalid_grant', 'Refresh token is invalid');
  if (stored.oauthClientId !== oauthClient.id) {
    return err(400, 'invalid_grant', 'Refresh token was not issued to this client');
  }
  if (stored.revokedAt) return err(400, 'invalid_grant', 'Refresh token has been revoked');
  if (stored.expiresAt.getTime() < Date.now()) {
    return err(400, 'invalid_grant', 'Refresh token expired');
  }

  // Atomic single-use consume. Zero rows updated => the token was already
  // redeemed and rotated away; treat the replay as reuse and revoke the entire
  // lineage so a thief's stolen copy stops working too (OAuth 2.1 §4.3.1).
  const now = new Date();
  const consumed = await db
    .update(oauthRefreshTokens)
    .set({ consumedAt: now })
    // Also require revokedAt IS NULL: a concurrent family revocation between the
    // SELECT above and this UPDATE must lose the race, not silently rotate a
    // revoked token into a fresh pair.
    .where(and(
      eq(oauthRefreshTokens.id, stored.id),
      isNull(oauthRefreshTokens.consumedAt),
      isNull(oauthRefreshTokens.revokedAt),
    ))
    .returning({ id: oauthRefreshTokens.id });
  if (consumed.length === 0) {
    // Replay (or a concurrent revocation) detected. Revoke the whole refresh-token
    // family AND every co-issued access token for this lineage. oauthAccessTokens
    // carries no family_id, so scope by the (oauth client, user, tenant) the family
    // belongs to — otherwise a detected-stolen token's bearer stays valid for up to
    // ACCESS_TOKEN_TTL_SECONDS (~1h), defeating the OAuth 2.1 §4.3.1 reuse detection
    // this endpoint exists to provide.
    await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(oauthRefreshTokens.familyId, stored.familyId), isNull(oauthRefreshTokens.revokedAt)));
    await db
      .update(oauthAccessTokens)
      .set({ revokedAt: now })
      .where(and(
        eq(oauthAccessTokens.oauthClientId, stored.oauthClientId),
        eq(oauthAccessTokens.userId, stored.userId),
        eq(oauthAccessTokens.clientId, stored.clientId),
        isNull(oauthAccessTokens.revokedAt),
      ));
    return err(400, 'invalid_grant', 'Refresh token already used');
  }

  // ponytail: scope narrowing via the `scope` param isn't supported — inherit
  // the originally granted scopes. Add subset-validation here if a client needs
  // to down-scope a refresh.
  return issueTokenPair({
    oauthClientId: oauthClient.id,
    userId: stored.userId,
    clientId: stored.clientId,
    scopes: stored.scopes,
    resource: stored.resource ?? null,
    familyId: stored.familyId,
  });
}

/** RFC 6749 §4.1.3 (authorization_code) and §6 (refresh_token) token grants.
 *  - Public clients (`token_endpoint_auth_method = "none"`): PKCE only, no secret.
 *  - Confidential clients (`client_secret_basic` / `client_secret_post`):
 *    secret required; PKCE is accepted-but-not-required (still recommended).
 *  The authorization code and refresh tokens are single-use. */
export async function POST(req: Request) {
  // Throttle token requests per IP to blunt client-secret / code brute force.
  // 30/15min is generous for legitimate machine clients refreshing tokens.
  if (!(await checkRateLimit(`${getClientIp(req)}:oauth-token`, 30, 15 * 60 * 1000))) {
    return err(429, 'temporarily_unavailable', 'Too many token requests. Please try again later.');
  }

  // Token endpoint accepts application/x-www-form-urlencoded per spec.
  let form: URLSearchParams;
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    form = new URLSearchParams(await req.text());
  } else if (ct.includes('application/json')) {
    const j = await req.json().catch(() => ({}));
    form = new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v)]));
  } else {
    // Some clients send multipart or omit the header — fall back to FormData.
    try {
      const fd = (await req.formData()) as unknown as globalThis.FormData;
      form = new URLSearchParams();
      fd.forEach((v: FormDataEntryValue, k: string) => form.set(k, String(v)));
    } catch {
      return err(400, 'invalid_request', 'Unparseable body');
    }
  }

  const grantType = form.get('grant_type');
  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    return err(400, 'unsupported_grant_type', 'Only authorization_code and refresh_token are supported');
  }

  const code = form.get('code');
  const redirectUri = form.get('redirect_uri');
  const refreshToken = form.get('refresh_token');
  const resource = form.get('resource');

  // Client authentication: Basic header takes precedence over body params.
  const basic = parseBasicAuthHeader(req.headers.get('authorization'));
  const usedBasic = basic !== null;
  const clientIdParam = basic?.clientId ?? form.get('client_id');
  const clientSecretParam = basic?.clientSecret ?? form.get('client_secret');

  // Grant-specific required params — validated BEFORE the client lookup so a
  // missing param is a 400 invalid_request rather than a 401 on an unfound client.
  if (grantType === 'authorization_code') {
    if (!code || !clientIdParam || !redirectUri) {
      return err(400, 'invalid_request', 'code, client_id, and redirect_uri are required');
    }
  } else {
    if (!refreshToken || !clientIdParam) {
      return err(400, 'invalid_request', 'refresh_token and client_id are required');
    }
  }
  // RFC 6749 §2.3.1: a request MUST NOT include the client credentials in both
  // the Authorization header and the request body.
  if (basic && form.get('client_secret')) {
    return err(400, 'invalid_request', 'Client credentials must not be sent twice');
  }

  const [oauthClient] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientIdParam!)).limit(1);
  if (!oauthClient) return invalidClient(usedBasic, 'Unknown client_id');

  // --- Client authentication branch (shared by both grants) ---------------
  const authMethod = oauthClient.tokenEndpointAuthMethod;
  const isConfidential = authMethod === 'client_secret_basic' || authMethod === 'client_secret_post';

  if (isConfidential) {
    if (!oauthClient.clientSecretHash) {
      // Schema invariant: confidential clients must have a stored hash. Hitting
      // this means the row was tampered with — fail closed.
      return invalidClient(usedBasic, 'Client is not configured for secret authentication');
    }
    if (!clientSecretParam) {
      return invalidClient(usedBasic, 'client_secret is required for this client');
    }
    // Accept the secret via EITHER HTTP Basic or the request body, regardless of
    // which method the client recorded at registration. RFC 6749 §2.3 lets a
    // client present credentials by either mechanism; tying acceptance to the
    // single registered method breaks real-world MCP connectors (e.g. Claude
    // Desktop) that default to Basic even when the client was minted as
    // `client_secret_post`. The double-send guard above still forbids using both
    // at once, and the secret is verified below, so honoring either stays safe.
    if (!verifyClientSecret(clientSecretParam, oauthClient.clientSecretHash)) {
      return invalidClient(usedBasic, 'client_secret is incorrect');
    }
  } else if (clientSecretParam) {
    // A public/PKCE client sent a secret — reject loudly rather than silently
    // accept, so misconfigured callers fail fast.
    return invalidClient(usedBasic, 'This client is registered as public; do not send client_secret');
  }

  // --- refresh_token grant -------------------------------------------------
  if (grantType === 'refresh_token') {
    return handleRefreshGrant(oauthClient, refreshToken!);
  }

  // --- authorization_code grant -------------------------------------------
  const codeHash = sha256(code!);
  const [stored] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(and(eq(oauthAuthorizationCodes.codeHash, codeHash), isNull(oauthAuthorizationCodes.consumedAt)))
    .limit(1);
  if (!stored) return err(400, 'invalid_grant', 'Code is invalid, expired, or already used');

  if (stored.oauthClientId !== oauthClient.id) {
    return err(400, 'invalid_grant', 'Code was not issued to this client');
  }
  if (stored.expiresAt.getTime() < Date.now()) {
    return err(400, 'invalid_grant', 'Code expired');
  }
  if (stored.redirectUri !== redirectUri) {
    return err(400, 'invalid_grant', 'redirect_uri does not match the one used at /authorize');
  }

  // --- PKCE: required for public, optional for confidential ---------------
  const codeVerifier = form.get('code_verifier');
  if (!isConfidential) {
    if (!codeVerifier) return err(400, 'invalid_request', 'code_verifier is required (PKCE)');
    if (!stored.codeChallenge) return err(400, 'invalid_grant', 'Code has no challenge to verify against');
    if (!verifyPkceS256(codeVerifier, stored.codeChallenge)) {
      return err(400, 'invalid_grant', 'PKCE verification failed');
    }
  } else if (codeVerifier) {
    // Confidential client opted into PKCE at /authorize — honor it if the
    // challenge was stored, otherwise reject the mismatch.
    if (!stored.codeChallenge) return err(400, 'invalid_grant', 'No code_challenge was registered for this code');
    if (!verifyPkceS256(codeVerifier, stored.codeChallenge)) {
      return err(400, 'invalid_grant', 'PKCE verification failed');
    }
  }

  // Mark the code consumed BEFORE issuing the token, so a concurrent replay
  // hits the `consumed_at IS NULL` filter and fails.
  const consumed = await db
    .update(oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(oauthAuthorizationCodes.id, stored.id), isNull(oauthAuthorizationCodes.consumedAt)))
    .returning({ id: oauthAuthorizationCodes.id });
  if (consumed.length === 0) {
    return err(400, 'invalid_grant', 'Code already used');
  }

  return issueTokenPair({
    oauthClientId: oauthClient.id,
    userId: stored.userId,
    clientId: stored.clientId,
    scopes: stored.scopes,
    resource: resource ? String(resource) : stored.resource,
    familyId: generateRefreshFamilyId(),
  });
}
