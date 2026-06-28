/**
 * LinkedIn OAuth 2.0 (OpenID Connect) helpers — Phase A: personal-profile posting.
 *
 * Auth model: SimplerDevelopment owns ONE LinkedIn app ("Sign In with LinkedIn
 * using OpenID Connect" + "Share on LinkedIn"). A member authorizes it and we
 * post AS that member to their own profile via the `w_member_social` scope.
 * No tenant concept (unlike Microsoft/Azure). Organization/company-page posting
 * needs w_organization_social + Community Management API partner approval and is
 * out of scope here.
 *
 * Raw fetch (no SDK) — we only need authorize + token exchange + refresh + an
 * id_token decode. Mirrors lib/microsoft/oauth.ts.
 *
 * LinkedIn-specific gotchas baked in:
 *  - refresh_token is OPTIONAL: LinkedIn only issues refresh tokens to apps
 *    approved for them. Many apps get a ~60-day access token and NO refresh
 *    token. So exchangeCode tolerates a missing refresh_token, and refresh
 *    throws RefreshTokenInvalidError (→ user must re-authorize) when there is none.
 *  - The author URN for posting is `urn:li:person:<sub>`, where <sub> comes from
 *    the OIDC id_token.
 */

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

/** Scopes for identity (openid/profile) + posting (w_member_social). */
export const LINKEDIN_POST_SCOPES = ['openid', 'profile', 'w_member_social'] as const;

export interface LinkedinConnectionLike {
  accessToken: string;
  /** May be empty string when the app was not issued refresh tokens. */
  refreshToken: string;
  expiresAt: Date;
}

export interface LinkedinOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class RefreshTokenInvalidError extends Error {
  constructor(message = 'LinkedIn token expired and no refresh token is available — user must re-authorize') {
    super(message);
    this.name = 'RefreshTokenInvalidError';
  }
}

/** Read SD-owned credentials from env. */
export function getEnvLinkedinCredentials(redirectUri: string): LinkedinOAuthCredentials {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'LinkedIn OAuth env vars not configured (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET). ' +
        'Create an app at developer.linkedin.com with the "Sign In with LinkedIn using OpenID Connect" ' +
        'and "Share on LinkedIn" products.'
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** Build the authorize URL. The code arrives back at the redirect as a query param. */
export function buildAuthUrl(opts: {
  credentials: LinkedinOAuthCredentials;
  scopes: readonly string[];
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.credentials.clientId,
    redirect_uri: opts.credentials.redirectUri,
    scope: opts.scopes.join(' '),
    state: opts.state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  token_type: string;
  scope?: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  id_token?: string;
}

interface IdTokenClaims {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
}

/**
 * Decode the OIDC id_token without verifying its signature. Safe because it
 * arrived directly over TLS from www.linkedin.com — no intermediary could have
 * substituted it. We only need `sub` (→ the member URN) and `name`.
 */
function decodeIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed LinkedIn id_token (expected 3 segments)');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as IdTokenClaims;
}

export interface ExchangeResult {
  accessToken: string;
  /** Empty string when LinkedIn did not issue a refresh token. */
  refreshToken: string;
  expiresAt: Date;
  /** null when no refresh token / no expiry returned. */
  refreshTokenExpiresAt: Date | null;
  scopes: string[];
  /** `urn:li:person:<sub>` — the author we post as. */
  memberUrn: string;
  name: string;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(
  code: string,
  credentials: LinkedinOAuthCredentials,
): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: credentials.redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.id_token) {
    throw new Error('LinkedIn token exchange returned no id_token — the openid scope was not granted.');
  }
  const claims = decodeIdToken(json.id_token);
  if (!claims.sub) {
    throw new Error('LinkedIn id_token missing `sub` claim (cannot derive the member URN).');
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? '',
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    refreshTokenExpiresAt: json.refresh_token_expires_in
      ? new Date(Date.now() + json.refresh_token_expires_in * 1000)
      : null,
    scopes: json.scope ? json.scope.split(/\s+/).filter(Boolean) : [...LINKEDIN_POST_SCOPES],
    memberUrn: `urn:li:person:${claims.sub}`,
    name: claims.name ?? '',
  };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Refresh an expired access token. Only works if the app was approved for
 * refresh tokens AND a refresh token was stored. Otherwise throws
 * RefreshTokenInvalidError so the caller can prompt re-authorization.
 */
export async function refreshAccessToken(
  connection: LinkedinConnectionLike,
  credentials: LinkedinOAuthCredentials,
): Promise<RefreshResult> {
  if (!connection.refreshToken) {
    throw new RefreshTokenInvalidError();
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: connection.refreshToken,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (res.status === 400 || res.status === 401) {
    throw new RefreshTokenInvalidError(`Refresh failed (${res.status}): ${await res.text()}`);
  }
  if (!res.ok) {
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    // LinkedIn rotates refresh tokens; fall back to the existing one if absent.
    refreshToken: json.refresh_token ?? connection.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

const REFRESH_LEEWAY_MS = 60 * 1000;

/** Refresh if the token expires within 60s. Returns the (possibly) refreshed connection. */
export async function refreshIfExpired(
  connection: LinkedinConnectionLike,
  credentials: LinkedinOAuthCredentials,
): Promise<{ connection: LinkedinConnectionLike; refreshed: boolean }> {
  if (connection.expiresAt.getTime() - Date.now() > REFRESH_LEEWAY_MS) {
    return { connection, refreshed: false };
  }
  const refreshed = await refreshAccessToken(connection, credentials);
  return {
    connection: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    },
    refreshed: true,
  };
}

/**
 * LinkedIn exposes no programmatic delegated-token revoke endpoint. We mark the
 * row revoked locally and let the token expire. Kept to mirror the Google/
 * Microsoft `revoke()` shape so callers stay symmetric.
 */
export async function revoke(_connection: LinkedinConnectionLike): Promise<void> {
  // Intentional no-op. See comment.
}
