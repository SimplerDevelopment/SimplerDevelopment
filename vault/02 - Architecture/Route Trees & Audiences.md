---
type: architecture
domain: platform
status: active
date: 2026-06-09
sources:
  - middleware.ts
  - app/admin/CLAUDE.md
  - app/portal/CLAUDE.md
  - CLAUDE.md
  - app/api/portal/tickets/route.ts
  - app/api/portal/clients/route.ts
---

# Route Trees & Audiences

Every feature must answer one question first: **which audience does it serve?** The codebase is split into three distinct route trees, one per audience. Mixing logic between trees is a hard architectural violation.

## The three audiences

### 1. `app/admin/**` — Internal global panel

Our staff UI. Routes here are **not scoped to a single tenant** — they operate across all clients.

- Auth guard: individual RSC pages call `requireStaffSession()` (checks `role === 'admin' || role === 'employee'`). There is **no centralized middleware guard** for this subtree; every new RSC page must add `requireStaffSession()` itself.
- API routes live under `app/api/admin/**`. Two sub-namespaces:
  - `app/api/admin/portal/**` — cross-tenant views of portal data
  - `app/api/admin/<feature>` — platform-level (dashboard, agentic-os, billing, system-health)
- No `clientId` scoping on queries; admin routes read across all tenants intentionally.
- Chrome: `components/admin/AdminSidebar`.

### 2. `app/portal/**` — Per-tenant client UI

The authenticated workspace each client company logs into.

- Every server component and route handler must resolve the active tenant through `lib/active-client.ts` + site-resolver middleware. **Never derive `clientId` from a URL param** — always from the session + resolver.
- Most CRUD lives at `app/portal/websites/[siteId]/<resource>/`. Top-level routes (`crm/`, `brain/`, `inbox/`, etc.) are cross-site tenant data (scoped to the client, not a single site).
- API routes live under `app/api/portal/**` and must return the `{ success, data | error }` envelope — see [[API Envelope & Route Patterns]].
- Chrome: `PortalLayoutClient.tsx` + `PortalShell.tsx` in `components/portal/`.

### 3. `app/sites/**` and `app/s/**` — Per-tenant public-facing sites

What a tenant's end-customers see.

- `app/sites/[domain]/[[...slug]]` — the primary public renderer. URL path is `sites/{domain}/{...slug}`.
- `app/s/[slug]/**` — short-link / survey response renderer (standalone public flow).
- These routes render block-based content from the `posts` table. They are **not authenticated** by default (public web traffic).
- Custom domains rewrite to `app/sites/[domain]` transparently via middleware (see below).

## Where `app/api/**` and `app/book/**` fit

- `app/api/**` — all API routes. Sub-namespaced by audience: `app/api/portal/**`, `app/api/admin/**`, `app/api/public/**`. Routes under `app/api/portal/**` are tenant-scoped and require session auth; routes under `app/api/public/**` are unauthenticated.
- `app/book/**` — public booking/scheduling pages. No portal auth required. Accessible on both the main app domain and client subdomains (the middleware explicitly bypasses subdomain-portal-redirect for `/book` paths).

## Middleware guards by tree

`middleware.ts` runs on every request and routes traffic at the edge:

1. **Dev CORS prelude** — stamps `Access-Control-Allow-Origin` for `/api/*` requests from `localhost` (Expo mobile client during local dev).
2. **Non-app hostname** (custom domain or `*.simplerdevelopment.com` subdomain):
   - `/portal` paths on a subdomain → `308` redirect to canonical app URL.
   - `/book` on a subdomain → passthrough (no rewrite).
   - Custom domain registered as a white-label portal → rewrite to `/portal` tree with `x-agency-client-id` header.
   - Everything else → rewrite to `app/sites/[domain]/...` with `x-site-pathname` + `x-site-domain` headers.
3. **App hostname** — runs standard NextAuth `auth()` middleware. Plugin routes at `/portal/apps/<slug>/*` are intercepted first for JWT-minted iframe proxy.

The admin subtree has **no middleware-level guard**. Auth is enforced per-page with `requireStaffSession()`.

## Decision rule for new features

```
Which audience?
  ├─ Our internal staff only  →  app/admin/**  +  app/api/admin/**
  ├─ An authenticated client  →  app/portal/**  +  app/api/portal/**
  └─ A public visitor         →  app/sites/**  or  app/s/**  or  app/api/public/**
```

Use `simplerdev-feature-scaffold` to generate the correct API route + schema + e2e scaffold for a new resource. Do not hand-roll the lockstep.

## Related notes

- [[Auth & Roles]] — session types, roles, `requireStaffSession()` implementation
- [[Tenancy & Site Resolution]] — how `clientId`/`siteId` is resolved per-request
