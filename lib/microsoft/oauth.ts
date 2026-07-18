import { scopesForSurfaces, type MicrosoftSurface } from '@/lib/microsoft/scopes';

/**
 * Microsoft Identity Platform (Azure AD / Entra ID) v2.0 OAuth helpers.
 *
 * Auth model: SimplerDevelopment owns one Azure AD multi-tenant app
 * registration. Any Microsoft 365 tenant's users can OAuth through it. Per-
 * tenant BYO-app credentials (matching the Google enterprise tier) is phase 3+.
 *
 * Why raw fetch instead of @azure/msal-node? PR 1 only needs token exchange +
 * refresh + ID-token decoding — three POSTs and a base64 split. MSAL adds a
 * cache layer, complex flows, and ~2MB of dependencies that we don't use.
 * The Graph SDK lands in PR 2 when we need to talk to /communications/...
 */

export interface MicrosoftConnectionLike {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface MicrosoftOAuthCredentials {
  clientId: string;
  clientSecret: string;
  /** Azure AD tenant for the OAuth endpoints — `'common'` for multi-tenant. */
  tenant: string;
  redirectUri: string;
}

export class RefreshTokenInvalidError extends Error {
  constructor(message = 'Refresh token is invalid or revoked — user must re-authorize') {
    super(message);
    this.name = 'RefreshTokenInvalidError';
  }
}

/**
 * Read SD-owned credentials from env. The Azure AD app must be registered as
 * `signInAudience: AzureADMultipleOrgs` (multi-tenant) so users from any M365
 * tenant can connect.
 */
export function getEnvMicrosoftCredentials(redirectUri: string): MicrosoftOAuthCredentials {
  const clientId = process.env.MICROSOFT_TEAMS_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_TEAMS_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_TEAMS_TENANT ?? 'common';
  if (!clientId || !clientSecret) {
    throw new Error(
      'Microsoft Teams OAuth env vars not configured (MICROSOFT_TEAMS_CLIENT_ID/SECRET). ' +
        'Optional: MICROSOFT_TEAMS_TENANT (defaults to "common" for multi-tenant).'
    );
  }
  return { clientId, clientSecret, tenant, redirectUri };
}

function authorityBase(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}`;
}

/**
 * Build the authorize URL. v2.0 endpoint. response_mode=query so the code
 * arrives as a query string (we read it via NextRequest.url).
 */
export function buildAuthUrl(opts: {
  credentials: MicrosoftOAuthCredentials;
  surfaces: readonly MicrosoftSurface[];
  state: string;
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.credentials.clientId,
    response_type: 'code',
    redirect_uri: opts.credentials.redirectUri,
    response_mode: 'query',
    scope: scopesForSurfaces(opts.surfaces).join(' '),
    state: opts.state,
    // prompt=consent always issues a fresh refresh token, even when re-
    // connecting. Mirrors the Google flow's prompt=consent.
    prompt: 'consent',
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
  });
  return `${authorityBase(opts.credentials.tenant)}/oauth2/v2.0/authorize?${params.toString()}`;
}

interface TokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
}

interface IdTokenClaims {
  oid?: string;
  tid?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
}

/**
 * Decode the JWT ID token without verifying its signature. Safe because we
 * received it directly over TLS from login.microsoftonline.com — no
 * intermediary could have substituted it. We only need its claims to extract
 * oid/tid/email, not to authenticate it independently.
 */
function decodeIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed ID token (expected 3 segments)');
  }
  const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payloadStr) as IdTokenClaims;
}

export interface ExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  microsoftAccountEmail: string;
  microsoftUserId: string;
  microsoftTenantId: string;
}

/**
 * Exchange an authorization code for tokens at the v2.0 endpoint.
 * Throws if the response is missing a refresh token (offline_access wasn't
 * granted) or if Microsoft returned an error. The caller should treat thrown
 * errors as 502s — most are transient.
 */
export async function exchangeCode(
  code: string,
  credentials: MicrosoftOAuthCredentials,
): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    redirect_uri: credentials.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(`${authorityBase(credentials.tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Microsoft token exchange failed (${res.status}): ${errBody}`);
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.refresh_token) {
    throw new Error(
      'Microsoft token exchange returned no refresh_token — offline_access scope was not granted. ' +
        'Verify the consent screen requested it and the user did not deny it.'
    );
  }
  if (!json.id_token) {
    throw new Error('Microsoft token exchange returned no id_token — openid scope was not granted.');
  }
  const claims = decodeIdToken(json.id_token);
  if (!claims.oid || !claims.tid) {
    throw new Error('Microsoft id_token missing oid/tid claims (cannot key the connection row).');
  }
  const email = claims.email ?? claims.preferred_username ?? claims.upn ?? '';
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scopes: json.scope.split(/\s+/).filter(Boolean),
    microsoftAccountEmail: email,
    microsoftUserId: claims.oid,
    microsoftTenantId: claims.tid,
  };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

/**
 * Refresh an expired access token. Microsoft rotates refresh tokens on
 * refresh — always persist the new refresh_token from the response. If the
 * response omits refresh_token, the old one is still valid (rare).
 */
export async function refreshAccessToken(
  connection: MicrosoftConnectionLike,
  credentials: MicrosoftOAuthCredentials,
): Promise<RefreshResult> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: connection.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`${authorityBase(credentials.tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (res.status === 400 || res.status === 401) {
    // Microsoft returns AADSTS70008 / AADSTS700082 etc. as 400 with an
    // error body. Treat all 400/401s on refresh as "user must re-auth."
    const errBody = await res.text();
    throw new RefreshTokenInvalidError(`Refresh failed (${res.status}): ${errBody}`);
  }
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Microsoft token refresh failed (${res.status}): ${errBody}`);
  }
  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? connection.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scopes: json.scope.split(/\s+/).filter(Boolean),
  };
}

const REFRESH_LEEWAY_MS = 60 * 1000;

/**
 * Refresh the connection if it expires within the next 60 seconds. Returns
 * the (possibly refreshed) connection. Caller should persist the new tokens
 * if the returned connection differs from the input.
 */
export async function refreshIfExpired(
  connection: MicrosoftConnectionLike,
  credentials: MicrosoftOAuthCredentials,
): Promise<{ connection: MicrosoftConnectionLike; refreshed: boolean }> {
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
 * Revoke the refresh token at the Microsoft endpoint. Best-effort — Microsoft
 * doesn't actually expose a public revoke endpoint for delegated grants in
 * the v2.0 endpoint; we mark the row revoked locally and let the token
 * expire naturally. (For app-level revocation users go to
 * https://account.microsoft.com/consent — there's no programmatic API.)
 *
 * Kept as a no-op function to mirror the Google `revoke()` shape so callers
 * can be written symmetrically.
 */
export async function revoke(_connection: MicrosoftConnectionLike): Promise<void> {
  // Intentional no-op. See comment.
}
