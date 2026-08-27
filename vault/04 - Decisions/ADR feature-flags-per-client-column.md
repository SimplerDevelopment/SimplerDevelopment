---
type: adr
domain: platform
status: accepted
date: 2026-08-27
sources:
  - lib/feature-flags.ts
  - lib/db/schema/sites.ts
  - lib/portal-auth.ts
  - lib/portal-nav.ts
  - lib/mcp/types.ts
  - app/admin/feature-flags/
  - scripts/doctor.ts
---

# ADR: Feature flags are a jsonb column on `clients` plus a code-defined registry

## Status
Accepted — 2026-08-27. Tracked on the master board as PUX-135.

## Context
We need to ship a feature to hand-picked tenants and test it in production before GA (first candidate: the PUX-134 portal redesign). Nothing in the repo did this:

- **Billing entitlements** (`lib/billing/entitlements.ts`, `requiredDomain`, `authorizePortal({ requireService })`) are *paid* gating, and `billingMode='agency'` bypasses them entirely — they cannot hide a beta from an agency client. Faking a `services` row per beta would pollute the Stripe catalog.
- **The plugin allowlist** (`registeredApps.visibility` + `allowedClientIds`) is exactly the right shape but scoped to remote plugins.
- **One boolean column per switch** (`cdnCacheEnabled`, `aiChatRequiresApproval`, `whiteLabelEnabled`) works but costs a migration per flag — the wrong cadence for test-in-prod.
- **Env rollout switches** (`AUTH_ROLE_ENFORCE`, `AUTH_SCOPE_ENFORCE`) are global and need a redeploy; the `cdnCacheEnabled` comment already records why a DB flag beats an env var here.

## Decision
Two halves, deliberately split:

1. **Which flags exist is code.** `lib/feature-flags.ts` holds `FLAGS = { key: { since, defaultOn } }`. A flag is scaffolding for a feature in flight, not configuration; it lives and dies with the code it gates. The admin UI renders from this registry, so an unknown flag can never be set.
2. **Which clients have a flag is data.** `clients.feature_flags` is a jsonb `string[]`, toggled by staff at `/admin/feature-flags`. It flips instantly with no redeploy.

Semantics chosen with the operator (grill-me, 2026-08-27):

- **Per client, never per user.** Every gated surface — `authorizePortal`, `PortalShell`, `PortalMcpContext.client`, the site resolver — already holds the full `clients` row, so `hasFlag()` is a sync array lookup with zero extra queries. Per-user would add a second read on every portal request and make "what does this client see" non-deterministic.
- **No "staff always on" rule.** Staff dogfood by flagging client 104 (SimplerDevelopment) and using impersonation, so impersonation shows exactly what the customer sees.
- **Boolean + `defaultOn` only.** `defaultOn: true` is the GA switch (column ignored). No percentage rollout — we have tens of tenants and pick them by hand. No opt-out, no variant values.
- **Denial:** API routes return 403 `{ success:false, error:'feature_not_enabled', flag }` (same shape as the `requireService` denial); MCP tools return the twin envelope via `flagDenied()`; portal pages call `notFound()`; nav items with `requiredFlag` are *removed*, not locked — a beta should not advertise itself with a lock icon. 404-for-secrecy on the API was rejected because this repo is public: every route is already visible.
- **DB is the only source of truth.** No `FEATURE_FLAGS_FORCE` env override, even for previews — a flag that "works on preview" would mask a client that is not actually flagged.
- **Lifecycle is nagged, not enforced.** Each entry carries `since`; `scripts/doctor.ts` warns at session start on flags older than 60 days or already `defaultOn`. A CI failure on an aged-out flag was rejected — a red check on an unrelated PR is the kind of gate that trains people to reach for `--no-verify`.

## Rejected
- **External flag services** (Vercel Flags SDK, LaunchDarkly, PostHog, Railway flags): a dependency and a network hop per request to do what one column does.
- **A separate `feature_flags` table** with `enabledBy/enabledAt`: auditable, but a join or second query on every portal request. Add it when someone needs to know *who* enabled a flag.

## Consequences
- Adding a flag is a one-line registry edit; targeting is a checkbox. Removing a flag is a code deletion plus `UPDATE clients SET feature_flags = feature_flags - 'key'`.
- **Release hazard:** `authorizePortal` does a bare `db.select()` on `clients`, so the column must exist on metro *before* the code that reads it merges — `drizzle/9026_client_feature_flags_manual.sql` is hand-applied first (the 2026-07-11 outage class).
- `app/sites/**` is not wired yet; `hasFlag(client, key)` works anywhere the client row is loaded, so a site-facing beta needs no new mechanism.
