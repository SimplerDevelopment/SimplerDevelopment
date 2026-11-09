---
type: adr
domain: sites
status: accepted
date: 2026-11-09
sources:
  - middleware.ts
  - lib/sites/app-host.ts
  - lib/security/cross-site-write-gate.ts
  - components/blocks/render/SiteBlockRenderer.tsx
  - app/sites/[domain]/layout.tsx
  - lib/auth.ts
---

# ADR: Tenant-authored content is isolated from the app origin and the portal session

## Status
Accepted — 2026-11-09. Tracked as PUX-255 (Stage 0 containment). The structural
follow-up is PUX-258; related: AUTH79-013, PUX-256, PUX-257.

## Context
Tenant sites render **author-controlled active content**: per-site/type/post
`customJs`, tracking `customHeadHtml`/`customBodyHtml`, and inline CSS. Anyone
can become a tenant through self-serve signup, so that content is untrusted.

Two facts make "untrusted script somewhere in the product" a cross-tenant /
privilege problem rather than a tenant-local one:

1. **Tenant pages also render on the app origin.** The same renderer serves
   `www.simplerdevelopment.com/sites/<domain>/…`, the visual-editor iframe, and
   approval-link previews — all on the portal's own origin, which also hosts
   `/portal`, `/admin` and `/api`. Script that runs there runs as whoever is
   looking at the page (staff, another tenant), same-origin with the portal API.
2. **The session cookie is shared across the registrable domain.** It is pinned
   to `.simplerdevelopment.com` (`lib/auth.ts`), and tenant sites are siblings at
   `<sub>.simplerdevelopment.com`, which also serve `/api`. The browser attaches
   the session to those hosts, and `SameSite=Lax` does not help between siblings.

So the boundary that matters is not "can a tenant write script" (they can, by
design — `customJs` is a feature) but **"where does tenant script run, and what
authority is ambient there."** The fix is to make the app origin carry no tenant
active content, and tenant hosts carry no portal session.

## Decision
Four invariants, enforced in code rather than convention:

1. **Tenant hosts do not carry the portal session.** Middleware strips the
   session cookie from every request it forwards on a host that is inside the
   cookie's domain but is not an app host (`withoutPortalSession` in
   `middleware.ts`). Nothing served on a tenant host needs the portal session —
   `/portal` redirects to the app host, and the editor/preview load from the app
   host.
2. **The cross-site write gate covers all of `/api`.** `/api/portal` is refused
   on any non-same-origin browser write unconditionally; `/api/auth` is left to
   NextAuth's own CSRF token; every other `/api` write is refused when it would
   ride the session cookie and carries no `Authorization` header. (No cookie ⇒ no
   ambient authority; an `Authorization` header cannot be attached cross-origin
   without a preflight.)
3. **App hosts emit no tenant active content.** When the request Host is an app
   host (`isAppHostname`, `lib/sites/app-host.ts`), `SiteBlockRenderer` omits all
   `customJs` layers (public view *and* edit mode) and the `[domain]` layout
   loads no tracking config. Tenant JS/analytics run only on the tenant's own
   host.
4. **Tenant-authored CSS is never `dangerouslySetInnerHTML`.** It renders as
   `<style>{css}</style>` children, so a crafted value cannot terminate the tag
   and inject an element. React escapes the `</style` terminator in style
   children while leaving real CSS intact.

The app-host list lives in **one** place (`lib/sites/app-host.ts`), imported by
both middleware and the server components, because two copies would drift and the
drift would be a security regression.

## Alternatives considered
- **A host-only session cookie (`__Host-` prefix, no `Domain`).** This is the
  *structural* fix: a sibling subdomain can neither send nor set it, which closes
  both session riding and session fixation in one change, and removes the
  plugin-host token exposure. It is deferred to **PUX-258** because it forces a
  re-login for every user and requires moving the plugin handoff cookie off a
  domain-pinned scheme. The invariants above are kept as defence-in-depth even
  once it lands.
- **Serve tenant content only off a separate user-content domain.** The cleanest
  end state (tenant content never shares an origin with the portal at all), but a
  larger change — a new domain, a wildcard cert, and cross-origin editor/preview
  iframes over the existing postMessage protocol. A future step, not this one.
- **A strict CSP on `/sites`.** Worth adding as defence-in-depth, but it does not
  replace the origin/session isolation above: the app ships inline scripts, so a
  CSP permissive enough to run the app would not block the content that matters.

## Consequences
- On a tenant subdomain a logged-in session is no longer recognised: a private
  site needs its preview code/token there, and session-based `?_preview=true` /
  deck `?preview=1` do not work on tenant hosts. `www/sites/…` still honours the
  session.
- Tenant custom JS and analytics no longer run in the visual-editor iframe or
  approval previews (they run on the tenant's own host, which is where analytics
  belong anyway).
- Any new surface that renders tenant block content, or any new tenant-authored
  field emitted into the page, must respect invariants 3–4; any new
  cookie-authenticated `/api` route is already covered by invariant 2.
- This is **containment, not the whole fix.** It does not by itself stop a tenant
  subdomain from *planting* a session (fixation — PUX-258), does not fix the
  block-author gate being a no-op on string content (PUX-256), and does not fix
  session-only preview of other tenants' drafts (PUX-257).
