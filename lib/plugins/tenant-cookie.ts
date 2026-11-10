// Cookie scope for the plugin tenancy handoff cookies (sd-plugin-tenant and
// sd-plugin-tenant-slug). These deliberately pin the apex `Domain` so the
// browser sends them to the plugin host — a sibling subdomain (e.g.
// content-tools.simplerdevelopment.com). That cross-host reach is the whole
// point of the handoff. The secure/empty-domain handling mirrors lib/auth.ts so
// the cookie actually SETS in local dev (http localhost), previews, and
// self-host — not only on the production apex, where the old hard-coded
// `secure: true` + `domain: '.simplerdevelopment.com'` silently dropped it
// everywhere else (QAD-043).
//
// NOTE (PUX-258): the SESSION cookie no longer shares this domain. It is now
// host-only (`__Host-authjs.session-token`, no Domain — see lib/auth-cookies.ts
// and [[ADR session-cookie-is-host-scoped]]), so the browser no longer attaches
// the real session token to plugin-host requests. That CLOSES the
// account-takeover-class exposure this file used to carry. These handoff cookies
// are now the ONLY auth artifact still pinned to the shared apex.
//
// GATED FOLLOW-UP (must land before any third-party plugin): move plugin hosts
// to a separate registrable domain (e.g. `*.sdplugins.app`) and replace this
// domain-pinned handoff with a signed URL param / postMessage handshake — a
// cookie can't span two registrable domains. Content Tools (the sole current,
// first-party plugin) authenticates via the sd-plugin-tenant JWT, not the
// session cookie, so pinning only the handoff is acceptable in the meantime.

import { secureCookiesEnabled } from '@/lib/auth-cookies';


// The plugin handoff deliberately pins the apex on the real production deploy —
// it must reach the plugin-host sibling subdomain. The SESSION cookie dropped
// this pin in PUX-258 (it is host-only now); the handoff keeps it, which is why
// this no longer mirrors lib/auth.ts. Self-host override wins; previews/local
// stay host-only (undefined), since pinning a domain on *.vercel.app / localhost
// makes the browser reject the cookie outright.
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
