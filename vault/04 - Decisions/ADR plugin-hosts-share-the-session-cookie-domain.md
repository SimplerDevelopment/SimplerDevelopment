---
type: adr
domain: security
status: accepted
date: 2026-08-05
sources:
  - lib/auth.ts — session cookie `domain` pin (~L126-142)
  - next.config.ts — PLUGIN_HOST_ORIGIN, default https://*.simplerdevelopment.com
  - lib/plugins/tenant-cookie.ts — the handoff cookie and its mitigations
  - lib/plugins/jwt.ts, callback-auth.ts — the callback trust model
---

# ADR: Plugin hosts share the session-cookie domain — accepted while plugins are first-party

## Status

Accepted, with a hard gate: **this must be resolved before any third-party
plugin ships.** Recorded 2026-08-05 while migrating the Plugins domain map into
code; the risk was described in that note and the mitigation was in the code,
but the *decision* had never been written down.

## Context

Two independent choices meet badly.

`lib/auth.ts` pins the session cookie's `domain` so a session works across
subdomains and on tenant custom domains. Without that pin a custom-domain
deploy has no session at all, so the pin is load-bearing.

`next.config.ts` puts plugin hosts at `PLUGIN_HOST_ORIGIN`, defaulting to
`https://*.simplerdevelopment.com` — the same registrable domain.

The consequence: the browser attaches the real `__Secure-authjs.session-token`
to **every request to a plugin host**, not just the scoped handoff cookie the
plugin protocol was designed around. `SameSite=lax` does not help, because
sibling subdomains are same-site. A plugin host that is compromised, or simply
malicious, can read a portal session directly — an account-takeover-class
exposure, not a scoping bug.

Every mitigation in `lib/plugins/` addresses the *handoff* cookie: short JWT
TTLs, `kid` rotation with active/retiring/revoked states, JTI replay dedup,
manifest scope-superset gating, per-tenant rate limits. None of them touch the
session cookie, because it is not part of the plugin protocol at all — it
arrives by virtue of the domain.

## Decision

**Accept the exposure while every plugin host is first-party**, and gate any
third-party plugin on removing it.

This is defensible today for one reason only: the sole plugin host is Content
Tools, which we build and operate. The trust boundary is not really being
crossed. It stops being defensible the moment a host we do not control is
serving on that domain.

The risk is now stated in `lib/plugins/tenant-cookie.ts` next to the handoff
cookie, so anyone reasoning about plugin auth meets it. This ADR carries the
part a comment cannot: that it was seen, weighed, and time-boxed rather than
missed.

## Options for closing it

Not decided here — whoever ships third-party plugins picks:

1. **Separate registrable domain for plugin hosts** (e.g. `*.sd-plugins.net`).
   Cleanest: the session cookie is then cross-site and never sent. Costs a
   domain, certs, and CSP/CORS updates.
2. **Drop the session-cookie domain pin** and solve custom-domain sessions
   another way. Directly conflicts with why the pin exists; likely breaks
   custom-domain deploys.
3. **Host-prefixed cookie without a domain pin**, with an explicit
   session-bridging step per custom domain. More moving parts, keeps one
   domain.

Option 1 is the obvious default and the others are listed so it is clear they
were considered.

## Consequences

- A third-party plugin cannot ship until this is closed. That is the point of
  recording it.
- Anyone auditing "is the plugin protocol safe?" will find a correct answer for
  the protocol and an incomplete one for the platform — the protocol is not
  where this lives.
- If plugins stay permanently first-party, this ADR should be superseded rather
  than quietly dropped: the exposure would still exist, just with an accepted
  and stated reason.

## Related

- [[ADR code-is-the-source-of-truth]]
