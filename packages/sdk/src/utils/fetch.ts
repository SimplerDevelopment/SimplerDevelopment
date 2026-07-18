import { SDKError, NotFoundError, UnauthorizedError, RateLimitError } from './errors';
import type { RequestOptions } from '../types';

export interface FetchOptions {
  baseUrl: string;
  siteId: number;
  apiKey?: string;
  customFetch: typeof globalThis.fetch;
  /** Client-level request defaults, overridden per call. */
  defaults?: RequestOptions;
}

/**
 * Fetch init extended with the Next.js `next` field. Declared structurally so the
 * SDK stays framework-agnostic — outside Next.js the extra key is simply ignored.
 *
 * `cache` is redeclared here rather than inherited: this package compiles with
 * `lib: ES2020` (no DOM), so the ambient `RequestInit` comes from @types/node's
 * undici-flavored globals, which omit `cache`. Adding `DOM` to `lib` instead
 * collides with those same Node globals (duplicate Headers/AbortController/URL).
 */
type NextFetchInit = RequestInit & {
  cache?: RequestOptions['cache'];
  next?: { revalidate?: number | false; tags?: string[] };
};

const DEFAULT_RETRY_AFTER = 60;

/**
 * `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110 §10.2.3).
 * The previous `parseInt` produced NaN for the date form, which surfaced as
 * "Retry after NaNs" and broke any backoff arithmetic downstream.
 */
export function parseRetryAfter(value: string | null): number {
  if (!value) return DEFAULT_RETRY_AFTER;

  const trimmed = value.trim();

  // Delta-seconds. Reject the partial-number parses `parseInt` would accept
  // ("60abc" -> 60) so a malformed header falls through to the date branch.
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  const at = Date.parse(trimmed);
  if (!Number.isNaN(at)) return Math.max(0, Math.ceil((at - Date.now()) / 1000));

  return DEFAULT_RETRY_AFTER;
}

function buildInit(opts: FetchOptions, request?: RequestOptions): NextFetchInit {
  const merged: RequestOptions = { ...opts.defaults, ...request };

  const headers: Record<string, string> = { ...merged.headers };
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey;

  const init: NextFetchInit = { headers };
  if (merged.cache) init.cache = merged.cache;
  if (merged.signal) init.signal = merged.signal;

  // `next` is only meaningful to the Next.js fetch shim; omit it entirely when
  // unset so plain fetch implementations see a clean init object.
  const next: { revalidate?: number | false; tags?: string[] } = {};
  if (merged.revalidate !== undefined) next.revalidate = merged.revalidate;
  if (merged.tags?.length) next.tags = merged.tags;
  if (Object.keys(next).length > 0) init.next = next;

  return init;
}

export async function apiFetch<T>(
  opts: FetchOptions,
  path: string,
  params?: Record<string, string | number | undefined>,
  request?: RequestOptions,
): Promise<T> {
  const url = new URL(`/api/v1/sites/${opts.siteId}${path}`, opts.baseUrl);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await opts.customFetch(url.toString(), buildInit(opts, request));

  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 404) throw new NotFoundError(path);
  if (response.status === 429) {
    throw new RateLimitError(parseRetryAfter(response.headers.get('Retry-After')));
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new SDKError(
      body?.message || `Request failed with status ${response.status}`,
      response.status,
      body,
    );
  }

  // A 2xx with an unparseable body is a server contract violation, not a
  // caller error — surface it as an SDKError rather than a raw SyntaxError.
  try {
    return (await response.json()) as T;
  } catch {
    throw new SDKError('Malformed JSON in response body', response.status);
  }
}
