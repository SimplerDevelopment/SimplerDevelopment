/**
 * Refuses state-changing requests to /api/portal/** that a browser tells us
 * did not originate from our own origin.
 *
 * ## Why this exists
 *
 * On the real production deploy the session cookie's `domain` is pinned to
 * `.simplerdevelopment.com` (lib/auth.ts), and tenant sites are served from
 * `<sub>.simplerdevelopment.com` (lib/sites/host-resolver.ts). Those are
 * SIBLINGS on one registrable domain, so:
 *
 *   - the browser attaches the session cookie to requests aimed at the app, and
 *   - `SameSite=Lax` withholds nothing, because Lax only restricts CROSS-SITE
 *     requests and siblings are same-SITE.
 *
 * Tenant sites also execute a free-form per-site `customJs` field, and
 * self-serve signup hands anyone a subdomain. So script on a tenant site could
 * fire authenticated writes at /api/portal/** riding the ambient session of any
 * staff, admin or other-client user who happened to be logged in and visiting.
 * `httpOnly` is irrelevant — the attack rides the cookie, it never reads it.
 * AUTH79-013.
 *
 * ## Why CORS does not already stop this
 *
 * Easy to assume it does. It does not. CORS governs whether the caller may READ
 * the response; the request is still SENT. A simple form POST needs no
 * preflight at all, and `fetch(..., { mode: 'no-cors' })` fires regardless. A
 * blind write is all this attack needs.
 *
 * ## The rule, and why each branch is what it is
 *
 * `Sec-Fetch-Site` is set by the browser itself and cannot be forged by page
 * script — that is the whole point of the `Sec-` prefix.
 *
 *   - absent      → ALLOW. Non-browser clients (the React Native app, curl,
 *                   server-to-server, older browsers) never send it. Rejecting
 *                   on absence would break every API consumer to stop an attack
 *                   that requires a browser to exist in the first place.
 *   - same-origin → ALLOW. This is the portal talking to itself.
 *   - same-site   → REJECT. Precisely the sibling-subdomain case above.
 *   - cross-site  → REJECT.
 *   - none        → REJECT. User-initiated navigation (typed URL, bookmark).
 *                   Legitimate for a GET, meaningless for a portal write.
 *
 * Read-only methods are untouched: this closes a write hole, and gating GETs
 * would break ordinary navigation for no security gain.
 */

/** Methods that can change state. HEAD/GET/OPTIONS deliberately absent. */
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface CrossSiteWriteInput {
  method: string;
  pathname: string;
  /** Raw `Sec-Fetch-Site` header, or null when the client did not send one. */
  secFetchSite: string | null;
  /**
   * True when the caller's Origin is one the dev CORS prelude already trusts.
   * In local dev the Expo web client runs on localhost:8081 and calls this
   * server on :3000, which is genuinely cross-site — so it must be allowed, or
   * mobile development breaks. That allowance is dev-only by construction:
   * middleware's isAllowedDevOrigin returns false when NODE_ENV==='production'.
   */
  isTrustedDevOrigin: boolean;
}

export function isCrossSiteWriteBlocked(input: CrossSiteWriteInput): boolean {
  if (!STATE_CHANGING.has(input.method.toUpperCase())) return false;
  if (!input.pathname.startsWith('/api/portal/')) return false;

  // No header → not a browser → not this attack. See the table above.
  if (!input.secFetchSite) return false;

  if (input.secFetchSite === 'same-origin') return false;

  // The one legitimate cross-site browser caller, and only outside production.
  if (input.isTrustedDevOrigin) return false;

  return true;
}
