import { NextResponse } from 'next/server';

/**
 * Parse a positive-integer route segment. Returns either `{ value }` with the
 * parsed integer or `{ error }` with a 400 JSON response ready to be returned
 * directly from a route handler.
 *
 * Centralised so the same guard wraps every dynamic-id route. Reject:
 *   - the literal string "undefined" or "null" (UI passed `undefined` into URL)
 *   - empty / whitespace
 *   - non-integer strings ("abc")
 *   - zero or negative integers
 *   - values that parse but produce `NaN` (e.g. `"1.5"` rounds, but we want strict)
 *
 * NOTE: `parseInt('1.5', 10)` returns `1`, not NaN. We use `Number.isInteger`
 * after explicit `Number()` so float-shaped strings are rejected.
 */
export function parseIntParam(
  raw: string | undefined | null,
  label: string,
):
  | { ok: true; value: number }
  | { ok: false; response: ReturnType<typeof NextResponse.json> } {
  if (raw === null || raw === undefined || raw === '' || raw === 'undefined' || raw === 'null') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: `invalid ${label}` },
        { status: 400 },
      ),
    };
  }

  // Reject anything that isn't a pure positive integer literal.
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: `invalid ${label}` },
        { status: 400 },
      ),
    };
  }

  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: `invalid ${label}` },
        { status: 400 },
      ),
    };
  }

  return { ok: true, value: n };
}

/** Shorthand specifically for `[siteId]` route segments. */
export function parseSiteIdParam(raw: string | undefined | null) {
  return parseIntParam(raw, 'siteId');
}
