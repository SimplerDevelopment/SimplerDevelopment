/**
 * Domain normalization helper for the custom-domain attach flow.
 *
 * Operators paste domains into the portal in many shapes:
 *   "https://example.com/", "HTTP://Example.COM", "  example.com  "
 * The DB column + Vercel API both want the canonical bare host:
 *   "example.com"
 *
 * Order matters: we MUST lower-case BEFORE running the scheme regex so
 * that upper-case schemes ("HTTPS://...") don't slip through unchanged
 * because the case-sensitive regex didn't match. The previous bug here
 * was the inverse order, which let inputs like "HTTPS://Example.COM/"
 * land in the DB with the scheme intact.
 *
 * This is a string-shape transform only — it does NOT validate that the
 * result is a real public domain. Callers that need that should layer
 * `isPlausibleDomain` from `lib/agency/dns-verify` on top.
 */
export function normalizeCustomDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}
