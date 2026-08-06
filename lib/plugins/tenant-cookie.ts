// Cookie scope for the plugin tenancy handoff cookies (sd-plugin-tenant and
// sd-plugin-tenant-slug). Mirrors the session-cookie resolution in lib/auth.ts
// (USE_SECURE_COOKIES + AUTH_COOKIE_DOMAIN) so the handoff cookie actually SETS
// in local dev (http localhost), previews, and self-host — not only on the
// production apex, where the old hard-coded `secure: true` +
// `domain: '.simplerdevelopment.com'` silently dropped it everywhere else
// (QAD-043).
//
// Plugins currently share the portal's registrable domain, so the plugin cookie
// deliberately uses the SAME domain/secure resolution as the session cookie.
// When plugin hosts move to a separate registrable domain (QAD-043 follow-up,
// gated on shipping any third-party plugin — see the GATED FOLLOW-UP note
// below), this handoff must move off a domain-pinned cookie entirely (a cookie
// can't span two registrable domains).
//
// UNMITIGATED risk this file does NOT fix: because the plugin host is a
// sibling subdomain of the apex (e.g. content-tools.simplerdevelopment.com)
// and the real NextAuth session cookie is pinned to `.simplerdevelopment.com`
// (lib/auth.ts), the browser also attaches `__Secure-authjs.session-token` —
// not just this handoff cookie — to every request to the plugin host.
// SameSite=lax does not help: sibling subdomains are same-site. A compromised
// plugin server can read the real session token (account-takeover class).
// Accepted short-term only because the sole current plugin (Content Tools) is
// first-party. GATED FOLLOW-UP (must land before any third-party plugin): move
// plugin hosts to a separate registrable domain (e.g. `*.sdplugins.app`) so
// the session cookie is cross-site and never sent, and replace this
// domain-pinned handoff with a signed URL param / postMessage handshake.

// Mirror of lib/auth.ts USE_SECURE_COOKIES — insecure only in local/e2e dev.
function secureCookiesEnabled(): boolean {
  return process.env.AUTH_INSECURE_COOKIES !== '1' && process.env.NODE_ENV === 'production';
}

// Mirror of lib/auth.ts session-cookie `domain`: self-host override, else pin
// the apex ONLY on the real production deploy; previews/local stay host-only
// (undefined) since pinning a domain on *.vercel.app / localhost makes the
// browser reject the cookie outright.
function sharedCookieDomain(): string | undefined {
  // Treat an empty/whitespace AUTH_COOKIE_DOMAIN as unset — a bare
  // `AUTH_COOKIE_DOMAIN=` in a .env would otherwise pin `domain` to '' and the
  // browser would reject every plugin cookie.
  const explicit = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicit) return explicit;
  return process.env.VERCEL_ENV === 'production' ? '.simplerdevelopment.com' : undefined;
}

export function pluginTenantCookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: secureCookiesEnabled(),
    sameSite: 'lax' as const,
    domain: sharedCookieDomain(),
    path: '/',
    maxAge: 600,
  };
}
