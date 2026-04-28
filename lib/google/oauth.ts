import { google, type Auth } from 'googleapis';
import { scopesForSurfaces, type GoogleSurface } from '@/lib/google/scopes';

/**
 * Minimal connection shape this module reads. Both googleWorkspaceClientConnections
 * and googleWorkspaceUserConnections (from lib/db/schema.ts) satisfy this — the helper
 * stays parametric so it can serve all current and future Google connection tables.
 */
export interface GoogleConnectionLike {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export class RefreshTokenInvalidError extends Error {
  constructor(message = 'Refresh token is invalid or revoked — user must re-authorize') {
    super(message);
    this.name = 'RefreshTokenInvalidError';
  }
}

function getOAuth2Client(): Auth.OAuth2Client {
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_WORKSPACE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google Workspace OAuth env vars not configured (GOOGLE_WORKSPACE_CLIENT_ID/SECRET/REDIRECT_URI)'
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Build the authorize URL. Always sets access_type=offline + prompt=consent so a refresh
 * token is issued on every authorization, even when re-authorizing an existing user.
 * include_granted_scopes=true lets the same Google account add more scopes incrementally
 * without invalidating the existing refresh token.
 */
export function buildAuthUrl(opts: {
  surfaces: readonly GoogleSurface[];
  state: string;
  loginHint?: string;
}): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: scopesForSurfaces(opts.surfaces),
    state: opts.state,
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
  });
}

export interface ExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  googleAccountEmail: string;
  googleAccountId: string;
}

export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token received — re-run consent with prompt=consent. ' +
      'This usually means the user previously authorized this app and Google returned an access token only.'
    );
  }
  if (!tokens.access_token || !tokens.expiry_date) {
    throw new Error('Google token exchange returned incomplete tokens (missing access_token or expiry_date)');
  }

  oauth2.setCredentials(tokens);
  const userinfo = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get();
  const email = userinfo.data.email;
  const id = userinfo.data.id;
  if (!email || !id) {
    throw new Error('Google userinfo did not return email or sub claim');
  }

  const scopeStr = typeof tokens.scope === 'string' ? tokens.scope : '';
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date),
    scopes: scopeStr.split(' ').filter(Boolean),
    googleAccountEmail: email,
    googleAccountId: String(id),
  };
}

export interface RefreshResult {
  refreshed: boolean;
  accessToken: string;
  /**
   * Optional. Google rotates refresh tokens occasionally but not on every refresh.
   * Caller MUST persist this only when present — never overwrite an existing refresh
   * token with undefined.
   */
  refreshToken?: string;
  expiresAt: Date;
}

export async function refreshIfExpired(connection: GoogleConnectionLike): Promise<RefreshResult> {
  const now = Date.now();
  const skewMs = 60_000;
  if (connection.expiresAt.getTime() > now + skewMs) {
    return {
      refreshed: false,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: connection.expiresAt,
    };
  }

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.expiresAt.getTime(),
  });

  try {
    const { credentials } = await oauth2.refreshAccessToken();
    if (!credentials.access_token || !credentials.expiry_date) {
      throw new Error('Refresh response missing access_token or expiry_date');
    }
    return {
      refreshed: true,
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token ?? undefined,
      expiresAt: new Date(credentials.expiry_date),
    };
  } catch (err: unknown) {
    const errorCode = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    if (errorCode === 'invalid_grant') {
      throw new RefreshTokenInvalidError();
    }
    throw err;
  }
}

export interface RevokeResult {
  revoked: true;
  alreadyRevoked?: boolean;
}

export async function revoke(refreshOrAccessToken: string): Promise<RevokeResult> {
  const oauth2 = getOAuth2Client();
  try {
    await oauth2.revokeToken(refreshOrAccessToken);
    return { revoked: true };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const errorCode = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    if (status === 400 && errorCode === 'invalid_token') {
      return { revoked: true, alreadyRevoked: true };
    }
    throw err;
  }
}
