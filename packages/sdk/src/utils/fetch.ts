import { SDKError, NotFoundError, UnauthorizedError, RateLimitError } from './errors';

export interface FetchOptions {
  baseUrl: string;
  siteId: number;
  apiKey?: string;
  customFetch: typeof globalThis.fetch;
}

export async function apiFetch<T>(
  opts: FetchOptions,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`/api/v1/sites/${opts.siteId}${path}`, opts.baseUrl);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {};
  if (opts.apiKey) {
    headers['x-api-key'] = opts.apiKey;
  }

  const response = await opts.customFetch(url.toString(), { headers });

  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 404) throw new NotFoundError(path);
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
    throw new RateLimitError(retryAfter);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new SDKError(
      body?.message || `Request failed with status ${response.status}`,
      response.status,
      body,
    );
  }

  return response.json();
}
