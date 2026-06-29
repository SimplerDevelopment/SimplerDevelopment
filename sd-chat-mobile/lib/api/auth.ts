/**
 * SD Chat — auth token storage + sign-in flow
 *
 * Two sign-in paths are supported:
 *
 *   1. **Native credentials** (`signInWithCredentials`) — the default UX.
 *      POSTs `{ email, password }` to `/api/portal/auth/mobile-sign-in`,
 *      which validates against the portal's `users` table with the same
 *      bcrypt compare as the NextAuth credentials provider, auto-selects
 *      the user's primary client, and returns a 90-day `sd_mcp_…` token
 *      in the response body. No browser bounce.
 *
 *   2. **Browser bridge** (`signInWithBrowser`) — kept around for parity
 *      with the original Phase 2 flow. Opens `/portal/mobile-auth` in
 *      an in-app browser, the page mints a `portal_api_keys` row and
 *      redirects back to `sd-chat://callback?token=…`. Useful if we ever
 *      add SSO (Google/Apple/etc.) — those flows can only happen in a
 *      browser context.
 *
 * Token persists in `expo-secure-store` keyed `sd-chat:auth:token` (with
 * an in-memory fallback for web where SecureStore is unavailable).
 *
 * Sign-out: revokes the key against the portal (`DELETE /api/portal/api-keys?id=…`)
 * if we still have it, then clears local storage.
 */

import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { api, setAuthToken } from './client';
import { AuthError, type Session, type User } from './types';

const TOKEN_KEY = 'sd-chat:auth:token';
const SESSION_KEY = 'sd-chat:auth:session';
const MOBILE_AUTH_PATH = '/portal/mobile-auth';
const CALLBACK_URL = 'sd-chat://callback';

// On web, SecureStore is unavailable. Persist via localStorage so the session
// survives a page reload — without this the token lives only in memory and
// every refresh bounces the user back to /sign-in. We still keep an in-memory
// mirror as a last-resort fallback for environments where localStorage is
// blocked (private browsing on some browsers, server-side rendering, etc.).
let memoryToken: string | null = null;
let memorySession: string | null = null;

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

// ─── token storage ──────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const ls = webStorage();
    if (ls) {
      try {
        return ls.getItem(TOKEN_KEY) ?? memoryToken;
      } catch {
        return memoryToken;
      }
    }
    return memoryToken;
  }
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    memoryToken = token;
    const ls = webStorage();
    if (ls) {
      try {
        ls.setItem(TOKEN_KEY, token);
      } catch {
        // localStorage write rejected (quota / disabled) — memory fallback wins.
      }
    }
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
  setAuthToken(token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    memoryToken = null;
    memorySession = null;
    const ls = webStorage();
    if (ls) {
      try {
        ls.removeItem(TOKEN_KEY);
        ls.removeItem(SESSION_KEY);
      } catch {
        // ignore
      }
    }
  } else {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      // ignore
    }
  }
  setAuthToken(null);
}

// ─── cached session (user + client) ─────────────────────────────────────────

export async function persistSession(session: Session): Promise<void> {
  const json = JSON.stringify(session);
  if (Platform.OS === 'web') {
    memorySession = json;
    const ls = webStorage();
    if (ls) {
      try {
        ls.setItem(SESSION_KEY, json);
      } catch {
        // ignore
      }
    }
  } else {
    await SecureStore.setItemAsync(SESSION_KEY, json);
  }
}

export async function getCachedSession(): Promise<Session | null> {
  try {
    let raw: string | null;
    if (Platform.OS === 'web') {
      const ls = webStorage();
      raw = ls ? ls.getItem(SESSION_KEY) ?? memorySession : memorySession;
    } else {
      raw = await SecureStore.getItemAsync(SESSION_KEY);
    }
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

// ─── boot hydration ─────────────────────────────────────────────────────────

/**
 * Read the token from storage and prime the API client. Call once on app
 * launch (from `_layout.tsx`). Returns whether a token was found.
 */
export async function hydrateAuth(): Promise<boolean> {
  const t = await getToken();
  if (t) {
    setAuthToken(t);
    return true;
  }
  return false;
}

// ─── sign-in / sign-out ─────────────────────────────────────────────────────

interface CallbackParams {
  token: string;
  user: User;
  client: { id: number; company: string; subdomain: string | null } | null;
  expiresAt: string | null;
}

function parseCallback(url: string): CallbackParams {
  const parsed = new URL(url);
  const errorCode = parsed.searchParams.get('error');
  if (errorCode) {
    throw new AuthError('invalid_token', `Portal returned error: ${errorCode}`);
  }

  const token = parsed.searchParams.get('token');
  if (!token) {
    throw new AuthError('missing_token', 'Portal callback did not include a token');
  }

  const userIdRaw = parsed.searchParams.get('user_id');
  const userEmail = parsed.searchParams.get('user_email') ?? '';
  const userName = parsed.searchParams.get('user_name') ?? '';
  const userRole = parsed.searchParams.get('user_role') ?? 'editor';
  const clientIdRaw = parsed.searchParams.get('client_id');
  const clientName = parsed.searchParams.get('client_name') ?? '';
  const expiresAt = parsed.searchParams.get('expires_at');

  if (!userIdRaw) {
    throw new AuthError('invalid_token', 'Portal callback missing user_id');
  }

  return {
    token,
    user: {
      id: parseInt(userIdRaw, 10),
      email: userEmail,
      name: userName,
      role: userRole,
    },
    client: clientIdRaw
      ? {
          id: parseInt(clientIdRaw, 10),
          company: clientName,
          subdomain: null,
        }
      : null,
    expiresAt,
  };
}

/**
 * POST email + password to the portal's native credentials endpoint
 * (`/api/portal/auth/mobile-sign-in`), persist the returned `sd_mcp_…`
 * token + session, and return the parsed session.
 *
 * Bypasses the browser bounce + workspace picker — the portal auto-selects
 * the caller's primary client (owned > member).
 *
 * Throws `AuthError('invalid_token')` for 401 (wrong credentials),
 * `AuthError('unknown')` for 403 (no workspace assigned),
 * `AuthError('network')` for transport errors.
 */
export async function signInWithCredentials({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<Session> {
  const url = `${api.baseUrl}/api/portal/auth/mobile-sign-in`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new AuthError(
      'network',
      err instanceof Error ? err.message : 'Network error',
    );
  }

  let body: {
    success?: boolean;
    error?: string;
    message?: string;
    data?: {
      token: string;
      expiresAt: string;
      user: User;
      client: {
        id: number;
        company: string;
        subdomain: string | null;
        role?: string;
      } | null;
    };
  } = {};
  try {
    body = await res.json();
  } catch {
    throw new AuthError('unknown', `Invalid JSON response (${res.status})`);
  }

  if (!res.ok || !body.success || !body.data) {
    const message = body.message ?? body.error ?? `Sign-in failed (${res.status})`;
    if (res.status === 401) throw new AuthError('invalid_token', message);
    if (res.status === 403) throw new AuthError('unknown', message);
    throw new AuthError('unknown', message);
  }

  const { token, user, client, expiresAt } = body.data;
  await setToken(token);

  const session: Session = {
    user,
    client: client
      ? { id: client.id, company: client.company, subdomain: client.subdomain ?? null }
      : null,
    expiresAt,
  };
  await persistSession(session);
  return session;
}

/**
 * Opens the portal's `/portal/mobile-auth` page in an in-app browser,
 * captures the `sd-chat://callback?...` redirect, stores the token, and
 * returns the parsed session.
 *
 * Kept for SSO/forgot-password fall-back cases; the default UX is
 * `signInWithCredentials` above.
 *
 * Throws `AuthError('cancelled')` if the user dismisses the browser,
 * `AuthError('network')` for transport errors, and `AuthError('invalid_token')`
 * if the callback URL is malformed or the portal returned an error code.
 */
export async function signInWithBrowser(): Promise<Session> {
  const startUrl = `${api.baseUrl}${MOBILE_AUTH_PATH}`;

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(startUrl, CALLBACK_URL);
  } catch (err) {
    throw new AuthError(
      'network',
      err instanceof Error ? err.message : 'Failed to open browser',
    );
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new AuthError('cancelled', 'Sign-in was cancelled');
  }

  if (result.type !== 'success' || !result.url) {
    throw new AuthError('unknown', `Unexpected browser result: ${result.type}`);
  }

  const parsed = parseCallback(result.url);
  await setToken(parsed.token);

  const session: Session = {
    user: parsed.user,
    client: parsed.client,
    expiresAt: parsed.expiresAt,
  };
  await persistSession(session);

  return session;
}

/**
 * Fetch a fresh session from the portal (`/api/portal/me`) using the stored
 * Bearer token. Used at app launch to validate the cached token + refresh
 * user info; returns `null` if the token is missing or rejected.
 */
export async function fetchSession(): Promise<Session | null> {
  const t = await getToken();
  if (!t) return null;
  setAuthToken(t);

  const res = await api.get<{
    user: User;
    client: { id: number; company: string; subdomain: string | null } | null;
  }>('/api/portal/me');

  if (!res.success) {
    if (res.status === 401) {
      // Server rejected our token — wipe so we re-auth next time.
      await clearToken();
    }
    return null;
  }

  const cached = await getCachedSession();
  const session: Session = {
    user: res.data.user,
    client: res.data.client,
    expiresAt: cached?.expiresAt ?? null,
  };
  await persistSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  // Best-effort portal-side revoke. We don't know the api-key id from the
  // token alone (only the hash is stored server-side), so for now we just
  // clear locally. Phase 3 follow-up: have the callback also include the
  // key id, and DELETE /api/portal/api-keys?id=<id>.
  await clearToken();
}
