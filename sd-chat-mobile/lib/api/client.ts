/**
 * SD Chat — API client
 *
 * Thin fetch wrapper around the SimplerDevelopment portal API.
 * - Reads the bearer token via `getAuthToken()` (set by `lib/api/auth.ts`)
 *   and injects `Authorization: Bearer <token>` on every request.
 * - On `401` the optional `onUnauthorized` handler is invoked so the auth
 *   layer can clear the stored token and bounce the user to sign-in.
 * - Returns the portal's `{ success, data | error }` envelope verbatim so
 *   callers can branch on `res.success` without re-shaping.
 */

const DEFAULT_BASE_URL = 'https://staging.simplerdevelopment.com';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.length > 0
    ? process.env.EXPO_PUBLIC_API_URL
    : DEFAULT_BASE_URL;

let authToken: string | null = null;
let unauthorizedHandler: ((info: { url: string; method: string }) => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Register a callback invoked whenever the API returns 401. Used by the auth
 * layer to clear the stored token + redirect to sign-in. Wired in
 * `lib/auth/AuthContext.tsx`.
 */
export function setUnauthorizedHandler(handler: ((info: { url: string; method: string }) => void) | null) {
  unauthorizedHandler = handler;
}

export type ApiEnvelope<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      status?: number;
      /** Stable machine-readable error code from the portal — e.g.
       *  `BRAIN_NOT_ENTITLED`. Lets screens branch on the error variant
       *  instead of regex-matching the message. */
      code?: string;
      /** Service category required to unlock this endpoint — paired with
       *  `code === 'BRAIN_NOT_ENTITLED'` (or future SKUs). */
      requiresService?: string;
      /** Portal URL to send the user to for a CTA on the upsell screen. */
      upsellUrl?: string;
    };

/**
 * Error thrown by the typed query/mutation hooks when an API envelope is
 * `success: false`. Preserves the structured fields the screens need to
 * render entitlement upsells, credits-required banners, etc.
 */
export class ApiError extends Error {
  status?: number;
  code?: string;
  requiresService?: string;
  upsellUrl?: string;

  constructor(envelope: Extract<ApiEnvelope<unknown>, { success: false }>) {
    super(envelope.error);
    this.name = 'ApiError';
    this.status = envelope.status;
    this.code = envelope.code;
    this.requiresService = envelope.requiresService;
    this.upsellUrl = envelope.upsellUrl;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }

  if (res.status === 401) {
    const method = (init.method ?? 'GET').toUpperCase();
    // eslint-disable-next-line no-console
    console.warn(`[api] 401 from ${method} ${url} — triggering sign-out bounce`);
    // Fire the global handler (clears token + redirects to /(auth)/sign-in).
    // We still return the envelope so the caller can react locally too.
    if (unauthorizedHandler) {
      try {
        unauthorizedHandler({ url, method });
      } catch {
        /* swallow */
      }
    }
    return { success: false, error: 'Unauthorized', status: 401 };
  }

  let json: ApiEnvelope<T>;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    return {
      success: false,
      error: `Invalid JSON response (${res.status})`,
      status: res.status,
    };
  }

  // Portal sometimes returns `{ success: false, message: ... }` (e.g. the
  // realtime token route or the entitlement envelopes). Normalize to `error`
  // and preserve the structured fields (`code`, `requiresService`,
  // `upsellUrl`) so screens can render dedicated upsell UI.
  if (!json.success) {
    const ext = json as {
      message?: string;
      error?: string;
      code?: string;
      requiresService?: string;
      upsellUrl?: string;
    };
    return {
      success: false,
      error: ext.error ?? ext.message ?? `Request failed (${res.status})`,
      status: res.status,
      code: ext.code,
      requiresService: ext.requiresService,
      upsellUrl: ext.upsellUrl,
    };
  }

  return json;
}

export const api = {
  baseUrl: BASE_URL,
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body == null ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body == null ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body == null ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
