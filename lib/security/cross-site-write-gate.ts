/**
 * Refuses state-changing requests to /api/** that a browser tells us did not
 * originate from our own origin (scope: see "Scope" below).
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
 *
 * ## Scope: all of /api, not just /api/portal (PUX-255)
 *
 * The first version only covered /api/portal/**. Every other cookie-
 * authenticated mutation (`/api/users` creates platform admins, `/api/posts`,
 * `/api/block-templates`, `/api/admin/**`) was still reachable from tenant
 * script, and a JSON route reading `request.json()` accepts a text/plain body —
 * a simple request, no preflight. So:
 *
 *   - /api/portal/** → refused as above, unconditionally (unchanged).
 *   - /api/auth/**   → left to NextAuth, whose POST endpoints carry their own
 *                      CSRF token.
 *   - rest of /api/** → refused when the request would RIDE the session: it
 *                      carries the session cookie and no Authorization header.
 *                      No cookie means no ambient authority to abuse (public
 *                      widget endpoints keep working cross-site); an
 *                      Authorization header can't be attached cross-origin
 *                      without a preflight, so its presence proves the caller
 *                      isn't a forged browser request (extension, API keys).
 *
 * The gate only sees requests arriving at the APP host. A tenant subdomain also
 * serves /api/**, where tenant script is same-origin and sails through every
 * branch above — middleware strips the session cookie on those hosts instead
 * (see stripSessionCookie and middleware's tenant branch).
 */

/**
 * The NextAuth session cookie: secure or plain name (lib/auth.ts), whole or
 * chunked into `.0`, `.1`… when the JWT outgrows one cookie.
 */
const SESSION_COOKIE_RX = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/;

function cookieName(pair: string): string {
  const eq = pair.indexOf('=');
  return (eq === -1 ? pair : pair.slice(0, eq)).trim();
}

/** Whether a raw `Cookie` header carries the NextAuth session cookie. */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some((pair) => SESSION_COOKIE_RX.test(cookieName(pair)));
}

/**
 * The `Cookie` header with every NextAuth session cookie removed, everything
 * else untouched. Empty string when nothing is left.
 */
export function stripSessionCookie(cookieHeader: string): string {
  return cookieHeader
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair && !SESSION_COOKIE_RX.test(cookieName(pair)))
    .join('; ');
}

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
  /** The request carries the NextAuth session cookie (see hasSessionCookie). */
  hasSessionCookie: boolean;
  /** The request carries an `Authorization` header. */
  hasAuthorization: boolean;
}

export function isCrossSiteWriteBlocked(input: CrossSiteWriteInput): boolean {
  if (!STATE_CHANGING.has(input.method.toUpperCase())) return false;
  if (!input.pathname.startsWith('/api/')) return false;

  // No header → not a browser → not this attack. See the table above.
  if (!input.secFetchSite) return false;

  if (input.secFetchSite === 'same-origin') return false;

  // The one legitimate cross-site browser caller, and only outside production.
  if (input.isTrustedDevOrigin) return false;

  if (input.pathname.startsWith('/api/portal/')) return true;
  if (input.pathname.startsWith('/api/auth/')) return false;
  return input.hasSessionCookie && !input.hasAuthorization;
}
