/**
 * The single source of truth for "does this deployment use Secure cookies?"
 *
 * This expression previously existed in three places — lib/auth.ts,
 * lib/plugins/tenant-cookie.ts and app/api/portal/sign-out/route.ts — each
 * carrying a comment saying it MUST mirror the others. That is the shape of a
 * bug waiting to happen, and it already happened once: a bare
 * `NODE_ENV === 'production'` check in the sign-out route diverged under the
 * e2e combo and left the real session cookie intact, so sign-out silently
 * no-op'd (QAD-047). Import this instead of restating the condition.
 */

/**
 * `AUTH_INSECURE_COOKIES=1` drops the `Secure` flag and the `__Secure-` name
 * prefix. It exists for a production BUILD served over plain HTTP — the
 * Critical-e2e CI job runs `bun start` on http://localhost:3000, and
 * self-hosters may terminate TLS upstream. Without it the browser rejects the
 * `__Secure-`-prefixed cookie on an insecure origin, which surfaced as a 500 on
 * the credentials callback and cascaded ~1000 e2e specs (QAD-047).
 *
 * The hazard the flag carried: nothing stopped it being copy-pasted into a real
 * HTTPS production environment — cloning a CI env-var set is the obvious way in
 * — which would silently ship the session cookie over plaintext HTTP, i.e. a
 * MITM/downgrade path to session theft. httpOnly stays true either way, so this
 * was never XSS exposure, but it was a real transport exposure.
 *
 * So the flag is now honoured everywhere EXCEPT a real production deploy, where
 * it is ignored and loudly logged. `VERCEL_ENV === 'production'` is the signal:
 * Vercel sets it only on the production deployment (previews get 'preview'), and
 * it is absent in CI and self-host, so neither legitimate use of the flag
 * regresses. AUTH79-018.
 */
export function secureCookiesEnabled(): boolean {
  // Non-production builds (dev, test) never use Secure cookies — localhost is
  // http and the browser would reject them.
  if (process.env.NODE_ENV !== 'production') return false;

  if (process.env.AUTH_INSECURE_COOKIES !== '1') return true;

  if (process.env.VERCEL_ENV === 'production') {
    warnIgnoredOnProd();
    return true; // refuse the escape hatch on a real production deploy
  }

  return false;
}

/**
 * The NextAuth session cookie name for the active cookie scheme (PUX-258).
 *
 * - Insecure builds (dev/test/CI-over-http) use the bare `authjs.session-token`.
 * - Secure + a pinned Domain (a self-hoster set AUTH_COOKIE_DOMAIN to share one
 *   session across subdomains) uses `__Secure-` — the `__Host-` prefix forbids a
 *   Domain attribute, so it can't coexist with a pin.
 * - Secure + host-only (the default, including the operator's own production)
 *   uses `__Host-`: the browser refuses to send it to, or set it from, any other
 *   host, which closes cross-subdomain session riding (PUX-255) and fixation.
 */
export function sessionCookieName(secure: boolean, cookieDomain: string | undefined): string {
  if (!secure) return 'authjs.session-token'; // pragma: allowlist secret (cookie name, not a secret)
  return cookieDomain
    ? '__Secure-authjs.session-token' // pragma: allowlist secret (cookie name, not a secret)
    : '__Host-authjs.session-token'; // pragma: allowlist secret (cookie name, not a secret)
}

let warned = false;
function warnIgnoredOnProd(): void {
  if (warned) return;
  warned = true;
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'auth.insecure_cookies_ignored',
      message:
        'AUTH_INSECURE_COOKIES=1 is set on a production deploy (VERCEL_ENV=production) and is being IGNORED. Secure cookies stay enabled. Remove this variable — it belongs to CI/self-host-over-HTTP only.',
    }),
  );
}

/** Test-only: reset the warn-once latch so each case can assert the log. */
export function __resetSecureCookieWarning(): void {
  warned = false;
}
