import { db } from '@/lib/db';
import { oauthClients, oauthAuthorizationCodes, oauthAccessTokens } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
  generateAccessToken,
  parseBasicAuthHeader,
  sha256,
  verifyClientSecret,
  verifyPkceS256,
} from '@/lib/oauth/server';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year — public clients without refresh tokens.

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

/** RFC 6749 §4.1.3 — Access Token Request (authorization_code grant).
 *  - Public clients (`token_endpoint_auth_method = "none"`): PKCE only, no secret.
 *  - Confidential clients (`client_secret_basic` / `client_secret_post`):
 *    secret required; PKCE is accepted-but-not-required (still recommended).
 *  The authorization code is single-use; consuming it sets `consumed_at` so a
 *  replay returns invalid_grant. */
export async function POST(req: Request) {
  // Throttle token requests per IP to blunt client-secret / code brute force.
  // 30/15min is generous for legitimate machine clients refreshing tokens.
  if (!checkRateLimit(`${getClientIp(req)}:oauth-token`, 30, 15 * 60 * 1000)) {
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
  if (grantType !== 'authorization_code') {
    return err(400, 'unsupported_grant_type', 'Only authorization_code is supported');
  }

  const code = form.get('code');
  const redirectUri = form.get('redirect_uri');
  const resource = form.get('resource');

  // Client authentication: Basic header takes precedence over body params.
  const basic = parseBasicAuthHeader(req.headers.get('authorization'));
  const usedBasic = basic !== null;
  const clientIdParam = basic?.clientId ?? form.get('client_id');
  const clientSecretParam = basic?.clientSecret ?? form.get('client_secret');

  if (!code || !clientIdParam || !redirectUri) {
    return err(400, 'invalid_request', 'code, client_id, and redirect_uri are required');
  }
  // RFC 6749 §2.3.1: a request MUST NOT include the client credentials in both
  // the Authorization header and the request body.
  if (basic && form.get('client_secret')) {
    return err(400, 'invalid_request', 'Client credentials must not be sent twice');
  }

  const [oauthClient] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientIdParam)).limit(1);
  if (!oauthClient) return invalidClient(usedBasic, 'Unknown client_id');

  // --- Client authentication branch ---------------------------------------
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

  // --- Authorization code lookup ------------------------------------------
  const codeHash = sha256(code);
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

  const { token, hash, preview } = generateAccessToken();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  await db.insert(oauthAccessTokens).values({
    tokenHash: hash,
    tokenPreview: preview,
    oauthClientId: oauthClient.id,
    userId: stored.userId,
    clientId: stored.clientId,
    scopes: stored.scopes,
    resource: resource ? String(resource) : stored.resource,
    expiresAt,
  });

  return Response.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: stored.scopes.join(' '),
  }, {
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  });
}
