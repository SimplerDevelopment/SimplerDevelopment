/**
 * The approval-mode write gate (PUX-067) — the single choke point that makes a
 * draft preview read-only.
 *
 * Lives apart from `approval-mode.ts` because `middleware.ts` runs on the edge
 * and cannot import that module (next/headers, node:crypto, the DB client). This
 * file has no imports at all beyond the shared cookie name, so it is safe in both
 * runtimes — and, unlike logic buried inside middleware, it can be unit-tested.
 *
 * Default-deny is the whole point: a write path added six months from now is
 * blocked without anyone remembering this file exists. Forgetting to shim an
 * endpoint breaks a preview; forgetting to gate one would write real data.
 */

/** Methods that cannot mutate. Everything else counts as a write. */
export const APPROVAL_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Paths allowed to receive a write while an approval cookie is present.
 *
 * Only two kinds belong here:
 *   - the decision endpoint, the one write a reviewer is *meant* to make
 *   - endpoints whose handler returns a synthetic success so the reviewer's UI
 *     completes (survey submit, booking confirm, …) WITHOUT touching the DB
 *
 * Adding a path is a security decision: that handler MUST short-circuit on
 * approval mode before any write. Keep this list short and reviewed.
 */
export const APPROVAL_SHIMMED_PATHS: readonly string[] = [
  '/api/approve/decision',
  // Survey submit — returns the thank-you screen without writing a response
  // (PUX-068). Matched exactly: a `:param` is ONE segment, so sibling writes
  // like /api/surveys/:slug/upload and /certificate stay blocked.
  '/api/surveys/:slug',
  // Background partial-save as the reviewer types — no-ops.
  '/api/surveys/:slug/partial',
  // Booking submit — returns the confirmation screen without creating a booking,
  // hold, Stripe intent, calendar event, or any email (PUX-070).
  '/api/public/booking/:slug/book',
  // Read-only POSTs. These validate a code and return a price; they contain no
  // db.insert/update/delete, so they satisfy the "must not write" contract
  // trivially and are allowed to run for real — a reviewer testing a discount
  // code should see the true answer, not a fabricated one.
  '/api/public/booking/:slug/validate-discount',
  '/api/public/gift-certificates/validate',
];

/**
 * Segment-exact match, with `:param` matching exactly one segment.
 *
 * Deliberately not a prefix match: `/api/surveys` as a prefix would also open
 * `/api/surveys/x/upload` and `/api/surveys/x/certificate`, neither of which has
 * a shim. Widening this matcher widens the hole.
 */
function matchesShim(pattern: string, pathname: string): boolean {
  const p = pattern.split('/');
  const a = pathname.split('/');
  if (p.length !== a.length) return false;
  return p.every((seg, i) => (seg.startsWith(':') ? a[i].length > 0 : seg === a[i]));
}

export interface ApprovalWriteGateInput {
  method: string;
  pathname: string;
  hasApprovalCookie: boolean;
}

/**
 * Whether this request must be refused because the caller is a reviewer in
 * approval mode.
 *
 * Only the cookie's PRESENCE is considered — the edge cannot reach the database
 * to verify a signature or re-read the approval row. That is deliberate and
 * safe: this gate only ever *removes* capability, so a forged cookie buys an
 * attacker nothing except having their own writes blocked. Real authorization
 * lives in `resolveApprovalContext`, which does hit the DB.
 */
export function isApprovalWriteBlocked(input: ApprovalWriteGateInput): boolean {
  if (!input.hasApprovalCookie) return false;
  if (APPROVAL_SAFE_METHODS.has(input.method.toUpperCase())) return false;
  return !APPROVAL_SHIMMED_PATHS.some((p) => matchesShim(p, input.pathname));
}
