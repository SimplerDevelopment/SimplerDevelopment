---
type: spec
domain: plugins
status: proposed
date: 2026-06-22
sources:
  - lib/db/schema/plugins.ts
  - lib/plugins/entitlement.ts
  - lib/plugins/callback-auth.ts
  - app/portal/apps/page.tsx
  - app/portal/apps/[appId]/[[...slug]]/page.tsx
  - lib/db/schema/billing.ts
---

# Feature: Plugins Ecosystem — Install/Uninstall + Marketplace

## Overview

Add an explicit per-tenant **install lifecycle** and a **marketplace browse**
surface on top of the existing plugin runtime + entitlement system. Today a
tenant simply *sees* every plugin it's entitled to; there's no notion of
choosing to install/uninstall one, and no place to discover installable plugins.

Closes the [[Plugins Extension E2E Audit]] gap (runtime + entitlement + consumer
view are shipped; install/uninstall + marketplace are not).

## Domain context

Read first: [[Plugins Extension E2E Audit]]. What already exists (verified 2026-06-22 on `dev`):

- **Registry:** `registered_apps` (slug, name, hostUrl, manifestUrl,
  defaultScopes, `billingServiceId`, `visibility` = global|allowlist|entitled,
  `allowedClientIds`, `status` = draft|active|disabled).
- **Access model (source of truth):** `lib/plugins/entitlement.ts` — a tenant
  can access an app when: visibility=global (all), allowlist (clientId in
  allowedClientIds), or entitled (an active `clientServices` row joins to
  `billingServiceId`). `lib/plugins/callback-auth.ts` enforces the same at the
  plugin runtime callback boundary.
- **Consumer view:** `app/portal/apps/page.tsx` lists the apps the active client
  is entitled to; `app/portal/apps/[appId]/[[...slug]]` proxies the plugin UI.
- **Runtime:** signing keys, callbacks audit, runs (work queue), jobs.
- Tenancy: keyed by `clientId`.

## Problem

"Entitled" and "installed" are conflated. Every entitled app is always shown +
active — a tenant can't curate which plugins are active for them, can't discover
plugins they *could* add, and there's no install action that (for paid plugins)
kicks off the billing/service grant. Uninstalling means an admin editing
`allowedClientIds` by hand.

## Goal

- A **marketplace** lists active plugins the tenant is *eligible* for but hasn't
  installed (with description, scopes it requests, and price if `billingServiceId`).
- **Install** is an explicit tenant (or admin-on-behalf) action that records the
  install and — for `entitled` apps — provisions the billing service.
- **Uninstall** deactivates the plugin for the tenant (and optionally cancels the
  service), without touching the publisher's registry config.
- The consumer view + runtime gate on **installed AND eligible**.

## Design

### New table — `registered_app_installs`

```
registered_app_installs
  id, clientId, appId (FK registered_apps),
  status: 'active' | 'uninstalled',
  installedBy (userId), installedAt, uninstalledAt?,
  UNIQUE (clientId, appId)
```

This separates **eligibility** (publisher config — visibility/allowlist/billing,
unchanged) from **installed-state** (tenant choice). It does NOT replace
`entitlement.ts`; it layers on top.

### Eligibility vs. installed (the key rule)

- **Eligible** = the existing `entitlement.ts` check (global / allowlist /
  entitled). Unchanged.
- **Active for tenant** = eligible **AND** an `active` install row.
- `global` apps may be treated as auto-installed (an install row created lazily)
  so they keep working without an explicit click — decide in Open Questions.

### Routes

- `GET /api/portal/apps/marketplace` — active apps the tenant is eligible for
  (per `entitlement.ts`) **minus** those with an active install. Returns name,
  icon, description, requested scopes, and price (resolve `billingServiceId`).
- `POST /api/portal/apps/[appId]/install` — eligibility-check; if the app is
  `entitled` and not yet entitled, kick off the billing/service grant (reuse the
  module-checkout / clientServices provision path); create/reactivate the install
  row. Tenant-scoped.
- `DELETE /api/portal/apps/[appId]/install` (uninstall) — mark the install
  `uninstalled`; optionally cancel the backing `clientServices` row for paid apps.
- Consumer view (`app/portal/apps/page.tsx`) + runtime gate (`callback-auth.ts`,
  `entitlement.ts` consumers) updated to require an `active` install in addition
  to eligibility.

### Admin-on-behalf

Admins can install/uninstall for a tenant (same endpoints behind the admin guard
or an `/api/admin/...` mirror), for white-label/managed accounts.

## Phasing

- **Phase 1 — install records + gating.** `registered_app_installs` + the
  install/uninstall endpoints (for global/allowlist apps, no billing) + update
  the consumer view/runtime to require an active install. Self-contained,
  fully local-buildable + testable.
- **Phase 2 — marketplace browse.** The `/marketplace` endpoint + a portal
  browse UI (eligible-not-installed, with scopes + price).
- **Phase 3 — paid install (entitled apps).** Wire install of an `entitled` app
  to the billing/service-grant flow (module checkout / clientServices), and
  uninstall to service cancellation. Touches billing — keep on the careful path.

## Key decisions (ADR-style)

- **Add an `registered_app_installs` table; do NOT overload `allowedClientIds`.**
  allowedClientIds is *publisher* allowlist config; install state is a *tenant*
  choice. Conflating them means a tenant uninstall would edit the publisher's
  config, and breaks `entitled`/`global` apps (which don't use the allowlist).
- **Eligibility stays in `entitlement.ts`** — install layers on top; the runtime
  gate becomes `isEligible() && hasActiveInstall()`.
- **Phase 1 excludes billing** so the lifecycle ships + is verifiable without the
  Stripe-gated path; paid install is Phase 3.

## Open questions (resolve before/while building)

1. **Global apps:** auto-install (lazy install row) so they keep working, or
   require an explicit install like the others? (Auto-install avoids a migration
   of behavior for existing global apps.)
2. **Uninstall + billing:** does uninstalling a paid (`entitled`) app cancel the
   `clientServices` subscription, or just hide it while billing continues until
   period end?
3. **Backfill:** create `active` install rows for all currently-entitled
   (clientId, appId) pairs at migration time, so nothing disappears from tenants'
   app lists on deploy.
4. **Who can install:** any tenant member, or admins/owners only (role gate)?

## Verification plan

- Phase 1: e2e — install an eligible app → it appears active + the runtime gate
  passes; uninstall → it's hidden + the runtime gate 403s; install a
  non-eligible app → 403; cross-tenant install/uninstall → 404; auth. Tenancy gate
  (new data-access table).
- Phase 2: e2e — marketplace lists eligible-not-installed apps and excludes
  installed ones.
- Phase 3: integration — installing an `entitled` app provisions the service
  (Stripe-stubbed, same posture as the billing tests).
- Backfill: a migration test asserting existing entitled pairs get active installs.
