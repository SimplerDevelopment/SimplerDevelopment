---
type: adr
domain: security
status: accepted
date: 2026-11-10
sources:
  - lib/auth.ts
  - lib/auth-cookies.ts
  - app/api/portal/sign-out/route.ts
  - lib/security/cross-site-write-gate.ts
  - middleware.ts
---

# ADR: The portal session cookie is host-scoped (`__Host-`) by default

## Status
Accepted — 2026-11-10. PUX-258 — the structural fix deferred from PUX-255
(Stage 0 containment). Related: AUTH79-013, and
[[ADR plugin-hosts-share-the-session-cookie-domain]].

## Context
PUX-255 **contained** cross-subdomain session abuse: middleware strips the
portal session on tenant hosts, and the cross-site write gate covers all of
`/api`. But it left the cookie itself apex-pinned — in production the session
cookie was `__Secure-authjs.session-token` with `Domain=.simplerdevelopment.com`
— and a `Domain`-pinned cookie is a sibling-subdomain cookie. That shape keeps
two problems open that stripping-on-read cannot close:

1. **A sibling subdomain can still *set* the cookie.** Stripping handles the
   session *riding* to a tenant host; it does nothing about a tenant host
   *planting* one on the shared apex (fixation), because the plant happens in the
   browser, before any request this app sees.
2. **The session still reaches first-party plugin hosts.** The browser attaches
   the apex-pinned session to every `*.simplerdevelopment.com` request, including
   the Content Tools plugin host — the exposure recorded in
   [[ADR plugin-hosts-share-the-session-cookie-domain]], accepted only while
   plugins are first-party.

PUX-255 named this as "containment, not the whole fix."

## Decision
Default the session cookie to **`__Host-authjs.session-token` with no `Domain`**.
The `__Host-` prefix is browser-enforced — it requires `Secure` and `Path=/` and
**forbids a `Domain` attribute** — so the cookie is locked to the exact host that
set it. A sibling subdomain can neither send it nor set it; both riding and
fixation are closed at the cookie, not patched at each reader.

The name/scheme decision lives in **one** place, `sessionCookieName` in
`lib/auth-cookies.ts` (beside `secureCookiesEnabled`), because this family of
cookie conditions has drifted across copies before (QAD-047):

- insecure builds (dev / test / CI-over-http) → bare `authjs.session-token`;
- secure + a pinned `Domain` → `__Secure-…` (a `Domain` and `__Host-` cannot
  coexist);
- secure + host-only (the default, including the operator's production) →
  `__Host-…`.

**Self-hosters keep the old behaviour as an explicit opt-in.** Setting
`AUTH_COOKIE_DOMAIN` to an apex restores the `Domain`-pinned `__Secure-` scheme
for anyone who genuinely needs one session across several subdomains.

PUX-255's cookie-strip and widened write gate stay in place as defence-in-depth.

## Why this is safe now (it would not have been before PUX-255)
Post-PUX-255 the portal is effectively **single-origin on the app host**: a
tenant subdomain's `/portal` is 308-redirected to the canonical app host
(`middleware.ts`), and the session is stripped on tenant hosts. So the session
only ever needs to work on the app host — which is exactly `__Host-`'s scope. The
login-time hop to a `*.simplerdevelopment.com` subdomain now just bounces through
that 308 back to the app host, where the host-only cookie lives.

White-label **portal custom domains** are a *foreign* registrable domain the
`.simplerdevelopment.com` pin never reached anyway (a browser rejects a
`Domain=.simplerdevelopment.com` cookie set from `portal.example.com`). A
host-only cookie is what actually works there, so `__Host-` *fixes* that case
rather than breaking it.

## Alternatives considered
- **A separate registrable domain for plugin hosts** (the plugin ADR's option 1).
  Orthogonal and still worth doing — it is what finally moves the *handoff* cookie
  off the shared domain. `__Host-` on the session is the cheaper half that removes
  the session exposure now without a new domain or cert.
- **A token-only (cookieless) session.** Far larger, and unnecessary: the problem
  was the cookie's *scope*, not that it is a cookie.

## Consequences
- **One-time forced re-login for every user.** The cookie name changes, so
  existing sessions are orphaned (ignored, then re-issued on next login). Accepted
  and expected.
- **The session no longer reaches plugin hosts.** Content Tools authenticates via
  the `sd-plugin-tenant` handoff JWT, not the session cookie, so this closes the
  session-exposure half of
  [[ADR plugin-hosts-share-the-session-cookie-domain]]. That ADR's remaining
  concern is now just the handoff cookie itself.
- **Still apex-pinned, as follow-ups:** the plugin handoff cookie
  (`sd-plugin-tenant`, the only apex-pinned auth artifact left) and
  `sd-active-client` (an httpOnly client id). Neither carries the session; both
  are separate cards.
- **Rollback is an env var, not a deploy.** Setting
  `AUTH_COOKIE_DOMAIN=.simplerdevelopment.com` in production reverts to the
  `__Secure-`+`Domain` scheme instantly (it costs a second re-login). A code
  revert works too, since Vercel deploys from `main`.
- Any new surface that reads the session cookie name as a literal must accept the
  `__Host-` prefix — the shared detectors in `lib/security/cross-site-write-gate.ts`
  and `lib/sites/edge-cache-policy.ts` already do.

## Related
- [[ADR tenant-content-isolated-from-app-origin]] (PUX-255 — the containment)
- [[ADR plugin-hosts-share-the-session-cookie-domain]]
- [[ADR code-is-the-source-of-truth]]
