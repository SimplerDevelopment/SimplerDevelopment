---
type: spec
domain: billing
status: validating
date: 2026-06-10
sources:
  - lib/billing/domain-catalog.ts
  - lib/billing/entitlements.ts
  - lib/db/schema/billing.ts
  - scripts/billing/001_domain_saas_billing.sql
  - app/portal/settings/billing/page.tsx
  - app/admin/clients/[id]/plan/page.tsx
---

# Feature: Per-Domain SaaS Billing & BYOK

## Overview

Sell each of the platform's 12 feature domains as an individually purchasable SaaS module through the portal, with an "Everything" bundle at ~40% off. Supports three client billing modes — agency (legacy, no gating), saas (prepaid module subscriptions with metered overages), and byok (bring-your-own API keys, waiving metered-COGS modules). Implemented via admin-controlled `clients.billingMode`, a new domain catalog as the single source of truth for pricing/metering/BYOK metadata, and prepaid usage tracking with threshold alerts.

Audience: portal (client self-serve checkout + usage meters) + admin (mode/plan controls).

## Domain context

Read first: [[Billing & Stripe]]. Key invariants:
- Prices are data (`services.price` + Stripe Price object), not code — repricing requires no deploy.
- `hasServiceAccess` in `lib/billing/domain-catalog.ts` (435) already treats category `'bundle'` as all-access; this behavior is preserved.
- Tenancy: all access checks resolve via `clientId`; the `lib/active-client.ts` site-resolver pattern applies to portal routes.
- `scripts/billing/001_domain_saas_billing.sql` (45) was hand-applied — drizzle-kit generate was blocked by a pre-existing snapshot collision. Do not run `bun run db:generate` against this migration; it is already live.

## User stories

- As a portal client, I want to subscribe to only the modules I use so that I pay proportionally and can self-serve add/remove.
- As a portal client on a bundle, I want to see pooled token/credit usage in one place so that I know when I'm approaching limits.
- As a portal client, I want to receive proactive threshold alerts before I hit a hard limit so that service is never silently interrupted.
- As a portal client with own API keys, I want to connect them and have metered COGS waived so that I control vendor costs directly.
- As an admin, I want to switch a client between agency/saas/byok modes without losing their data so that I can handle legacy and new clients in one system.

## Requirements

### Must have

- 12 module SKUs seeded into the `services` catalog (slug `module-<key>`, category = domain key, monthly pricing as below) plus one bundle SKU.
- `clients.billing_mode` column (agency | saas | byok); `agency` = legacy default — zero behavior change for existing clients.
- `client_services.stripe_subscription_id` column to track per-module Stripe subscriptions.
- `usage_thresholds` table: per client+resource, `warn_at_pct` (default 80), `hard_limit_quantity`, `notify_portal` / `notify_email` flags.
- `usage_alert_events` table: deduplicated log, unique per `(client_id, resource, period, level)`.
- `lib/billing/entitlements.ts` (83) — `getClientEntitlements` honoring mode/bundle/trial.
- Portal pricing page at `app/portal/settings/billing/page.tsx` with Stripe Checkout in subscription mode; webhook activation on `metadata.type='module_subscription'`; cancellation on `customer.subscription.deleted`.
- Nav gating: locked items show upsell affordances for `saas` clients; `agency` clients see no gates.
- Usage-alerts cron at 05:15 UTC triggering portal notifications and emails at warning / exceeded / hard-limit levels.
- Admin threshold control API and plan-mode switcher at `app/admin/clients/[id]/plan/page.tsx`.
- BYOK expansion: Anthropic, OpenAI, Resend, Dropbox Sign key storage; metered COGS modules are waived when the relevant key is present.
- `RelatedModulesStrip` cross-promotion component driven by `promotesTo` links in the catalog.

### Nice to have

- Voice minutes and Replicate upscale metering.
- Monthly credit re-grant cron (currently grants happen only on activation/renewal webhook).
- Automatic cancellation of individual module Stripe subscriptions when a bundle is purchased (currently UI-guidance only).

## Technical design

### Pricing model

| Module | Slug | Monthly |
|---|---|---|
| Websites & CMS | `module-websites` | $29 |
| CRM & Sales | `module-crm` | $25 |
| Company Brain | `module-brain` | $49 |
| Email Marketing | `module-email` | $19 |
| Projects & Tickets | `module-projects` | $15 |
| Surveys | `module-surveys` | $12 |
| Bookings | `module-bookings` | $15 |
| Storefront | `module-storefront` | $29 |
| E-Sign | `module-esign` | $15 |
| Pitches & Proposals | `module-pitches` | $19 |
| Automations | `module-automations` | $19 |
| Publishing | `module-publishing` | $15 |
| **Bundle (SimplerDev Complete)** | `module-bundle-complete` | **$159** |

Bundle is category `'bundle'`, ~40% off the $261/mo sum. Includes 2M pooled AI tokens/mo.

### Metered overage rates

| Resource | Included | Overage | COGS source |
|---|---|---|---|
| AI tokens (brain) | 500k/mo | $1 / 100k | Anthropic/OpenAI — waived under BYOK |
| Email sends | 10k/mo | $1 / 1k | Resend — waived under BYOK |
| E-sign envelopes | 20/mo | $1.50 each | Dropbox Sign — waived under BYOK |
| Hosting bandwidth | 100 GB/mo | (Railway/Vercel) | settles via `usage_meter_events` → Stripe metered items |
| Hosting storage | 10 GB | — | same |
| Automation runs | 1k/mo | 1¢ / run | compute only |

Flat modules (no marginal COGS): CRM, Projects, Surveys, Bookings, Publishing. Storefront revenue captured via Stripe Connect platform fee.

### Database changes

Migration already applied: `scripts/billing/001_domain_saas_billing.sql` (45). Schema module in `lib/db/schema/billing.ts`.

New / changed structures:
- `clients.billing_mode` — `'agency' | 'saas' | 'byok'`; default `'agency'`
- `client_services.stripe_subscription_id` — nullable text
- `usage_thresholds` — `(id, client_id, resource, warn_at_pct, hard_limit_quantity, notify_portal, notify_email, created_at, updated_at)`
- `usage_alert_events` — `(id, client_id, resource, period, level, fired_at)`; unique on `(client_id, resource, period, level)`

Do not re-run `bun run db:generate` against this migration. Future schema changes in this domain should be authored in `lib/db/schema/billing.ts` then migrated normally.

### Catalog source of truth

`lib/billing/domain-catalog.ts` (435) — single source for module SKUs, meter definitions, BYOK provider keys, cross-promo `promotesTo` relationships, and nav-gating hrefs. All entitlement checks, overage calculations, and strip renders derive from this file, not from hardcoded values.

### API changes

- Portal: Stripe Checkout session creation at `app/portal/settings/billing/page.tsx` (subscription mode). Webhook handler differentiates `metadata.type='module_subscription'` for activation; `customer.subscription.deleted` for cancellation.
- Admin: plan-mode switcher and threshold CRUD at `app/admin/clients/[id]/plan/page.tsx`. Switching to BYOK surfaces a missing-keys checklist.
- Cron: usage-alerts job at `/api/cron/usage-alerts` (not yet scaffolded — nearest existing crons: `app/api/cron/usage-rollup/`, `app/api/cron/resend-usage-sync/`). Scheduled 05:15 UTC.
- Entitlements: `lib/billing/entitlements.ts` (83) — `getClientEntitlements(clientId)` returns the active module set honoring mode, bundle, and trial overrides.

### Portal / Admin UI

- `app/portal/settings/billing/page.tsx` — pricing page with module cards, bundle upsell, Stripe Checkout button; usage meters section.
- `app/admin/clients/[id]/plan/page.tsx` — mode switcher (agency / saas / byok), BYOK key inputs with missing-keys checklist, threshold configuration.
- `components/portal/billing/UsageMeters.tsx` — not yet created; will render per-resource usage bars pulling from `usage_thresholds` + `usage_alert_events`.
- `RelatedModulesStrip` — cross-promotion component; surfaces `catalog.promotesTo` links on CRM, Email, Brain, Surveys, and Projects dashboards.
- Nav gating: locked items include upsell affordance for `saas` mode; `agency` bypass is unconditional.

### MCP exposure

No new MCP tools required for initial ship. Future: a `billing_get_entitlements` tool may be useful if Brain needs to gate tool calls by module access.

## Scaffolds to use

- `simplerdev-feature-scaffold` is not needed — API routes are being hand-rolled given billing's security sensitivity (see architecture invariants).
- `simplerdev-ui-scaffold` is appropriate for the `UsageMeters` component and `RelatedModulesStrip` once the data shape is settled.

## Validation plan

Per [[Gate Picking]]:
- **Unit:** entitlements logic in `lib/billing/entitlements.ts` — mode/bundle/trial matrix; overage calculation for each meter type.
- **Integration:** Stripe webhook handler (module activation + cancellation flows); `usage_thresholds` CRUD; alert deduplication on `usage_alert_events` unique constraint.
- **Tenancy:** `bun test:tenancy` — `usage_thresholds` and `usage_alert_events` are `clientId`-keyed; verify no cross-tenant leakage.
- **E2E:** `bun test:critical` — portal billing page loads; module subscription checkout initiates; admin plan-mode switch persists.
- **Manual:** BYOK key checklist renders correctly on mode switch to `byok`; cron fires alerts at correct thresholds in staging.

## Open questions / follow-ups

1. **Stripe Products/Prices not yet created.** The 12 module SKUs and bundle must be created in Stripe and their `stripePriceId` values pasted into the matching `services` rows before self-serve checkout is functional.
2. **Deep per-API enforcement in `saas` mode is not yet wired.** Current gates are nav/layout only; runtime API-level enforcement (reject requests when a module is not subscribed) is a follow-up.
3. **Voice minutes and Replicate upscales are not metered.** These COGS vectors are real but not yet tracked in `usage_thresholds`.
4. **Monthly credit re-grant cron is missing.** Credits are granted on activation/renewal webhook only; a recurring monthly re-grant job still needs to be scheduled.
5. **Bundle purchase does not auto-cancel individual module Stripe subscriptions.** Clients must cancel redundant subscriptions manually; UI provides guidance only.
6. **Hand-apply SQL + seed on staging.** Run `scripts/billing/001_domain_saas_billing.sql` on staging (already applied to prod), then run `scripts/seed-domain-modules.ts` to populate the 12 module + bundle `services` rows before testing checkout.
7. **Pre-existing tenancy test noise.** 9 failures in the tenancy suite (`bun test:tenancy`) are env/pre-existing: `oauth_clients` table exposes a camelCase/snake_case mismatch unrelated to this feature. Do not conflate with billing-domain tenancy regressions; track separately.
