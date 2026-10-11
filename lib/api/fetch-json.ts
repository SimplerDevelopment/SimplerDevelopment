/**
 * Transport half of the async convention (see lib/hooks/useAsyncAction.ts).
 *
 * `fetchJson` throws `ApiError` on transport failure (network down,
 * non-2xx status, unparsable body) so callers never have to remember the
 * `res.ok` / try-catch dance — and can never silently swallow it. Envelope
 * handling (`{ success, data, message }`) stays at the call site, where the
 * domain error messages live:
 *
 *   const data = await fetchJson<Envelope>('/api/...');
 *   if (!data.success) throw new Error(data.message ?? 'Save failed');
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Network error. Please try again.', 0);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Request failed (${res.status}).`, res.status);
  }
  if (!res.ok) {
    const message = (json as { message?: unknown } | null)?.message;
    throw new ApiError(
      typeof message === 'string' && message ? message : `Request failed (${res.status}).`,
      res.status,
    );
  }
  return json as T;
}
