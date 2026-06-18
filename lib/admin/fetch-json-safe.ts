/**
 * A fetch wrapper that never throws. Returns a discriminated union so callers
 * can branch on `ok` without try/catch.
 */
export async function fetchJsonSafe<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (networkErr) {
    return { ok: false, error: networkErr instanceof Error ? networkErr.message : 'Network error' };
  }

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
  }

  let data: T;
  try {
    const text = await res.text();
    if (!text) return { ok: false, error: 'Empty response body' };
    data = JSON.parse(text) as T;
  } catch {
    return { ok: false, error: 'Failed to parse response JSON' };
  }

  return { ok: true, data };
}
