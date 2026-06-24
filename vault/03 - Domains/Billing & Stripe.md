---
type: domain-map
domain: billing
status: active
date: 2026-06-24
sources:
  - lib/billing/
  - lib/ai/plan-gate.ts
  - lib/ai/resolve-client-key.ts
  - lib/stripe/
  - lib/signup/service.ts
  - lib/onboarding/module-segments.ts
  - lib/db/schema/billing.ts
  - lib/db/schema/sites.ts
  - lib/admin/auth.ts
  - lib/admin/fetch-json-safe.ts
  - app/api/auth/signup/route.ts
  - app/api/auth/verify-email/route.ts
  - app/api/portal/credits/route.ts
  - app/api/portal/credits/purchase/route.ts
  - app/api/portal/credits/pay-as-you-go/route.ts
  - app/api/portal/integrations/api-keys/route.ts
  - app/api/portal/invoices/[id]/checkout/route.ts
  - app/api/portal/billing/modules/route.ts
  - app/api/portal/billing/modules/checkout/route.ts
  - app/api/portal/billing/modules/add-item/route.ts
  - app/api/portal/billing/modules/[id]/cancel/route.ts
  - app/api/portal/billing/usage/route.ts
  - app/api/portal/billing/byok-status/route.ts
  - app/api/portal/invite/accept/route.ts
  - app/api/portal/team/[memberId]/route.ts
  - app/api/admin/portal/clients/[id]/billing/route.ts
  - app/api/admin/portal/clients/[id]/billing/thresholds/route.ts
  - app/api/admin/portal/clients/[id]/billing-mode/route.ts
  - app/api/admin/portal/invoices/route.ts
  - app/api/admin/portal/subscriptions/route.ts
  - app/api/admin/portal/ai-credits/route.ts
  - app/api/admin/portal/mcp-usage/route.ts
  - app/portal/invoices/[id]/page.tsx
  - app/portal/settings/billing/plans/page.tsx
  - app/admin/clients/[id]/plan/page.tsx
  - app/admin/layout.tsx
  - app/admin/error.tsx
  - components/admin/AdminShellClient.tsx
  - components/admin/ClientBillingSummary.tsx
  - components/portal/billing/UsageMeters.tsx
  - components/portal/onboarding/steps/StepChooseModules.tsx
  - components/portal/onboarding/steps/StepPayment.tsx
  - components/portal/onboarding/steps/StepModuleSetup.tsx
  - components/portal/onboarding/steps/StepUpsell.tsx
  - components/portal/onboarding/GetStartedChecklist.tsx
  - scripts/billing/001_domain_saas_billing.sql
  - scripts/billing/002_signup_funnel.sql
  - scripts/billing/sync-stripe-products.ts
  - scripts/billing/create-seat-product.ts
  - scripts/migrations/admin-billing-overrides.sql
---

# Domain: Billing & Stripe

## Purpose

Manages all money movement for the platform: AI credit grants and purchases, metered usage rollup to Stripe, invoice creation and payment, per-site Stripe Connect / BYOK commerce, and the MCP tools that let agents query billing state. Coverage floor: **70% lines/functions** on `lib/billing/**`.

## Key entry points

| File | Role |
|---|---|
| `lib/signup/service.ts` (177) | Self-serve account creation: `createAccount` (email+password), `verifyEmail` (token), `linkGoogleAccount` (OAuth same-email merge), `purgeUnverified` (7-day cleanup). Creates user + client with `billingMode='saas'` + `user_onboarding` row atomically. |
| `lib/onboarding/module-segments.ts` (185) | Segment registry keyed by domain key. v1 rich segments for websites, crm, email, brain, projects; generic "first 3 wins" fallback for the remaining 7 modules. Consumed by the wizard steps and the dashboard checklist. |
| `lib/billing/domain-catalog.ts` (697) | Single source of truth for 12 module SKUs + bundle + volume discount ladder. Exports `VOLUME_TIERS` (thresholds: 4→10%, 8→20%, 12→30%), `volumeTierFor(count)`, `nextVolumeTier(count)`, `applyVolumeDiscount(subtotal, count)`. Also exports `SEAT_PRICE_CAP_CENTS` (3000), `INCLUDED_SEATS` (1), `SEAT_SKU`, `computeAccountBilling()`, `discountedModuleCents()` — these drive per-seat billing; the volume discount is now baked into computed line items, not a Stripe coupon. Also retains `TIERS` (Starter/Growth/Scale, `plan-*` slugs) and `getTierByCategory()` for existing tier-subscriber entitlement resolution; per-meter included allowances + overage rates; `byokProviders`; `promotesTo` cross-promo links; `navHrefs`. Live price = `services.price` / Stripe Price object. |
| `lib/billing/seats.ts` (58) | `countBillableSeats(clientId)`: when `billable_seats_override` is non-null on the client row, returns that value directly; otherwise derives owner + count of members whose invite token has been cleared (accepted state). Invited-but-not-accepted users are excluded. Also exports `deriveBillableSeats(clientId)` for read-only display of the raw derived count. |
| `lib/billing/subscription-items.ts` (97) | `buildDesiredItems()`: pure function mapping module subscriptions to Stripe `price_data` line items. Each module is priced at its post-volume-discount amount; an "Additional seats" line is appended at `min(M, $30) × (seats − 1)` when extra seats exist. Returns line items ready for reconciliation — no Stripe calls. |
| `lib/billing/recompute-subscription.ts` (253) | `recomputeClientSubscription()`: the single writer that reconciles a client's live Stripe subscription items against the desired set from `buildDesiredItems()`, keyed by Stripe Product id. Adds missing items, updates changed amounts, removes obsolete items. When `comp_discount_percent` is non-null on the client row, applies or updates a `comp-<percent>` Stripe `percent_off` coupon on the customer before recomputing line items; when null, clears the coupon. This is the **one sanctioned coupon** — distinct from the volume-discount which lives in computed `price_data` line items. The two coexist without collision: the coupon is customer-level; the volume discount is line-item-level. `syncSeatBillingSafe()`: best-effort wrapper that calls the reconciler and swallows errors (used on member accept/remove paths where billing failure must not block the UX action). |
| `lib/billing/entitlements.ts` (108) | `getClientEntitlements(clientId)`: resolves effective module set — `'agency'` billingMode bypasses gating; `'bundle'` grants all; legacy `subscription` rows bypass; a `plan-*` tier grants its curated domain set; `brainTrialUntil` honored. Also exposes `byokEligible` computed as `derivedByok || byokEligibleOverride ?? false` — the `byokEligibleOverride` column on `clients` is the admin/sales BYOK grant switch; **the single source of truth for the BYOK gate**; see [[ADR byok-inversion-scale-only]] and [[ADR admin-billing-overrides-comp-coupon]]. Single resolution function; callers do not inspect `billingMode` directly. Note: new self-serve clients subscribe à la carte and do not acquire a tier row; `byokEligible` is false for them until they acquire a bundle, legacy subscription, or an admin BYOK override. BYOK for new clients is contact-sales only. |
| `lib/ai/plan-gate.ts` (128) | `checkAiPlanGate`: AI plan-level gate. Currently always returns `{ allowed: true }` — every paid tier (Starter / Growth / Scale) has platform AI access. Retained as an extension point. Previously blocked Starter with `starter_requires_byok`; that logic was removed in the BYOK inversion (commit `8669039b`). |
| `lib/ai/resolve-client-key.ts` (199) | `resolveClientKey`: determines which AI key to use for a given client. Uses a stored BYOK key only when `byokEligible` is true. Falls back to the platform key otherwise (and on entitlement-check errors — fails closed). Enforces the inference layer of the three-layer BYOK gate. |
| `lib/billing/usage-alerts.ts` (488) | Threshold evaluation: compares `usage_meter_events` aggregates against `usage_thresholds`; deduplicates via `usage_alert_events` unique index; dispatches portal notifications and emails at warn / exceeded / hard-limit levels. |
| `lib/billing/usage-rollup.ts` | Core rollup logic: aggregate `usage_meter_events`, subtract included quota, push to Stripe via `action=set`, upsert audit row |
| `lib/billing/metered-items.ts` | CRUD helpers for `metered_subscription_items` (no Stripe calls — kept separate for DI mocking) |
| `lib/stripe/index.ts` | Lazy-singleton Stripe client + `reportUsage`, `createMeteredItemForSubscription`, `listSubscriptionItemsForClient` |
| `lib/stripe/site-stripe.ts` | Per-site Stripe resolver: Connect mode (platform key + application fee) vs BYOK (tenant's own key) |
| `lib/ai-credits.ts` | AI token credit ledger: `getBalance`, `hasCredits`, `deductCredits`, `grantMonthlyCredits`, `addPurchasedCredits`, `getLedger`, `getCreditPackages` |
| `app/api/stripe/webhook/route.ts` | Platform webhook handler (signature-verified): `checkout.session.completed` → invoice paid / service activation / credit purchase. New branch: `metadata.type='module_subscription'` activates module; `customer.subscription.deleted` cancels it. |
| `app/api/stripe/webhook/ecommerce/route.ts` | Commerce webhook (order payments, refunds) |
| `app/api/stripe/webhook/booking/route.ts` | Booking payment webhook |
| `app/api/cron/usage-rollup/route.ts` | Cron entry point wrapping `rollupClientPeriod` for all active clients |
| `app/api/cron/resend-usage-sync/route.ts` | Pulls Resend email-send counts into `usage_meter_events` before rollup |
| `app/api/cron/usage-alerts/route.ts` | Usage-alerts cron (05:15 UTC); calls `lib/billing/usage-alerts.ts` across all active clients |
| `lib/mcp/tools/billing.ts` | MCP tool registrar (`billing:read` scope) |

## Data model

All tables are in `lib/db/schema/billing.ts` (import barrel: `@/lib/db/schema`).

| Table | Key columns | Purpose |
|---|---|---|
| `ai_credit_ledger` | `clientId`, `type` (grant/usage/purchase/refund/expiry), `amount`, `balanceAfter` | Append-only event log for AI token credits |
| `ai_credit_balances` | `clientId` (PK), `balance`, `monthlyGrant`, `payAsYouGo` | Cached running balance; updated on every ledger write |
| `ai_credit_packages` | `tokens`, `price`, `stripePriceId` | Purchasable credit bundles wired to Stripe Prices |
| `usage_meters` | `clientId`, `category`, `period` (YYYY-MM), `usage`, `included`, `overageRate` | Older aggregated usage counters (running totals by category) |
| `usage_meter_events` | `clientId`, `resource`, `period`, `amount`, `source` | Append-only events from Resend / Vercel / Railway; summed by rollup |
| `metered_subscription_items` | `clientId`, `stripeSubscriptionId`, `stripeSubscriptionItemId`, `resource`, `unitPriceCents`, `includedQuantity`, `status` | Maps internal resource counters to Stripe Subscription Items |
| `usage_billing_periods` | `clientId`, `period`, `resource` (unique together), `billableQuantity`, `stripeUsageRecordId` | Audit row per rollup run; `stripeUsageRecordId=null` flags retry-needed |
| `invoices` | `clientId`, `status`, `stripePaymentIntentId`, `stripeCheckoutSessionId`, `total` | Agency invoices; index on `(clientId, status, createdAt)` |
| `invoice_items` | `invoiceId`, `unitPrice`, `total`, `serviceId` | Line items for each invoice |
| `client_api_keys` | `clientId`, `provider` (anthropic/openai), `encryptedKey` (AES-256-GCM) | BYOK AI keys; raw key NEVER stored. Managed via `app/api/portal/integrations/api-keys/` routes. |

New columns and tables added in `scripts/billing/001_domain_saas_billing.sql` (hand-applied — drizzle-kit generate was blocked by pre-existing meta snapshot collision; do not re-run `bun run db:generate` against this migration):

| Location | Change | Notes |
|---|---|---|
| `lib/db/schema/sites.ts` — `clients` | `billing_mode` column: `'agency' \| 'saas' \| 'byok'`, default `'agency'` | `'agency'` = legacy bypass; zero behavior change for existing clients |
| `lib/db/schema/billing.ts` — `client_services` | `stripe_subscription_id` column: nullable text | Tracks per-module Stripe Subscription ID |
| `lib/db/schema/billing.ts` — `usage_thresholds` | New table: `(id, client_id, resource, warn_at_pct, hard_limit_quantity, notify_portal, notify_email, created_at, updated_at)` | Per-client per-resource alert thresholds |
| `lib/db/schema/billing.ts` — `usage_alert_events` | New table: `(id, client_id, resource, period, level, fired_at)`; unique on `(client_id, resource, period, level)` | Deduplication log for alert dispatch |

Admin billing override columns added in `scripts/migrations/admin-billing-overrides.sql` (13 lines — hand-applied; `bun run db:generate` was blocked by meta-snapshot drift at the time of implementation; see [[ADR admin-billing-overrides-comp-coupon]]):

| Location | Change | Notes |
|---|---|---|
| `lib/db/schema/sites.ts` (461) — `clients` | `billable_seats_override` column: `integer`, nullable | When non-null, `countBillableSeats` returns this value directly instead of deriving from accepted-member count. Admin/sales seat grant. |
| `lib/db/schema/sites.ts` (461) — `clients` | `comp_discount_percent` column: `integer`, nullable, 0–100 | When non-null, `recomputeClientSubscription` applies a `comp-<percent>` Stripe `percent_off` coupon on the customer. The one sanctioned coupon mechanism — distinct from volume-discount line items. |
| `lib/db/schema/sites.ts` (461) — `clients` | `byok_eligible_override` column: `boolean`, nullable | OR'd with derived `byokEligible` in `getClientEntitlements`. Admin/sales switch for the BYOK contact-sales flow. |

`clients.stripeCustomerId` (in `lib/db/schema/sites.ts`) persists the Stripe customer id. `clients.plan` (`starter` / `pro` / `enterprise`) governs plan-gating entitlements. `clients.billing_mode` is independent of `plan` — the two axes coexist.

## API surface

### Public auth (signup funnel)

| Route | Method | Purpose |
|---|---|---|
| `app/api/auth/signup/route.ts` | POST | Create account (email+password or Google OAuth path). Delegates to `lib/signup/service.ts`; sends Resend verification email. Returns session token on success. |
| `app/api/auth/verify-email/route.ts` | GET | Consume a magic-link token and mark the user verified; redirects into the onboarding wizard. |

### Portal (client-facing)

| Route | Method | Purpose |
|---|---|---|
| `app/api/portal/settings/billing/route.ts` | GET | Return billing settings for the active client |
| `app/api/portal/billing/payment-methods/route.ts` | GET / DELETE | List / remove saved payment methods |
| `app/api/portal/billing/modules/route.ts` (153) | GET | List all 12 module SKUs + bundle with subscription status for the active client. Response now includes a `seats` breakdown: `{ billable, included, extra, capCents }`. |
| `app/api/portal/billing/modules/checkout/route.ts` (215) | POST | Create Stripe Checkout session (`mode=subscription`). Accepts `slugs[]` — builds `price_data` line items: one per module at its post-volume-discount price, plus an "Additional seats" line at `min(M,$30) × extra seats` when extra seats exist. `trial_period_days: 14` (card required, $0 today). Trial granted only once per client via `clients.trial_used_at`. `metadata.type='module_subscription'`; webhook upserts one `clientServices` row per line item. Coupon mechanism removed — volume discount is now baked into the per-module line item price. |
| `app/api/portal/billing/modules/add-item/route.ts` (128) | POST | One-click prorated add of a module to an existing subscription, or bundle swap. Updates the DB then calls `recomputeClientSubscription()` to reconcile Stripe items via computed `price_data` line items (volume discount baked in; coupon sync removed). Used by the upsell wizard step and the plans page. Canonical path for adding a module to an existing subscription (Checkout is the fallback for a client's first purchase). |
| `app/api/portal/billing/modules/[id]/cancel/route.ts` | POST | Cancel a module subscription via Stripe |
| `app/api/portal/billing/usage/route.ts` | GET | Per-resource usage vs thresholds for the active client |
| `app/api/portal/billing/byok-status/route.ts` | GET | Which BYOK providers are configured; used by admin BYOK checklist |
| `app/api/portal/invite/accept/route.ts` (71) | POST | Accepts a team invitation (clears invite token). Calls `syncSeatBillingSafe()` after accepting so the new seat is reflected in the next Stripe reconciliation. |
| `app/api/portal/team/[memberId]/route.ts` (114) | DELETE | Removes a team member. Calls `syncSeatBillingSafe()` after removal so the freed seat is removed from billing. |
| `app/api/portal/credits/route.ts` | GET | List purchasable credit packages and current balance |
| `app/api/portal/credits/purchase/route.ts` | POST | Initiate Stripe Checkout session for a credit bundle |
| `app/api/portal/credits/pay-as-you-go/route.ts` | POST | Toggle the pay-as-you-go flag on the client's balance |
| `app/api/portal/integrations/api-keys/route.ts` (155) | GET / POST | List / create BYOK provider keys (anthropic \| openai \| resend \| dropbox_sign) — schema: `client_api_keys` in `lib/db/schema/billing.ts`. POST returns 403 for non-`byokEligible` clients attempting to store an `anthropic` or `openai` key (storage layer of the three-layer BYOK gate). `resend` and `dropbox_sign` keys are NOT gated by `byokEligible`. |
| `app/api/portal/integrations/api-keys/[id]/route.ts` | PATCH / DELETE | Update / remove a BYOK key |
| `app/api/portal/invoices/[id]/checkout/route.ts` | POST | Create Stripe Checkout session for client to pay an invoice |

### Admin (internal)

| Route | Method | Purpose |
|---|---|---|
| `app/api/admin/portal/clients/[id]/billing/route.ts` (288) | GET / POST | **Admin billing management.** GET returns a full read-model: active modules, seats (derived + override), volume-discount tier, comp %, BYOK override, MRR breakdown. POST accepts `action` discriminated union: `set-seats` / `set-comp` / `set-byok` / `add-module` / `remove-module` / `set-bundle` / (mode is handled by the separate billing-mode route). Every action mutates `clientServices` / `clients` then calls `recomputeClientSubscription` — no bespoke Stripe item juggling. All actions gated by `requireStaffSession()` from `lib/admin/auth.ts`. |
| `app/api/admin/portal/clients/[id]/billing-mode/route.ts` | GET / PATCH | Read / switch a client's `billing_mode` (agency / saas / byok); surfaces BYOK key checklist |
| `app/api/admin/portal/clients/[id]/billing/thresholds/route.ts` | GET / POST / PATCH / DELETE | CRUD for `usage_thresholds` per client |
| `app/api/admin/portal/clients/[id]/billing/usage/route.ts` | GET | Per-client metered usage view |
| `app/api/admin/portal/clients/[id]/billing/metered-items/route.ts` | GET / POST | List / create metered subscription items |
| `app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route.ts` | PATCH / DELETE | Update / remove a metered item |
| `app/api/admin/portal/invoices/route.ts` | GET / POST | List / create agency invoices |
| `app/api/admin/portal/invoices/[id]/route.ts` | GET / PATCH | Fetch / update a single invoice |
| `app/api/admin/portal/subscriptions/route.ts` | GET / POST | List / create client subscriptions |
| `app/api/admin/portal/subscriptions/[id]/cancel/route.ts` | POST | Cancel a subscription |
| `app/api/admin/portal/subscriptions/[id]/change-plan/route.ts` | POST | Change a subscription's plan |
| `app/api/admin/portal/subscriptions/[id]/invoices/route.ts` | GET | List invoices for a subscription |
| `app/api/admin/portal/subscriptions/[id]/refund/route.ts` | POST | Refund a subscription charge |
| `app/api/admin/portal/ai-credits/route.ts` | GET | Manage AI credit packages |
| `app/api/admin/portal/mcp-usage/route.ts` | GET | MCP tool call usage analytics / cost overview |

### Stripe webhooks

| Route | Event(s) | Notes |
|---|---|---|
| `app/api/stripe/webhook/route.ts` | `checkout.session.completed` | Invoice paid, service activation, credit purchase. Verified via `stripe.webhooks.constructEvent` + `STRIPE_WEBHOOK_SECRET` |
| `app/api/stripe/webhook/ecommerce/route.ts` | Order/refund events | Routed through `lib/stripe/site-stripe.ts` per-site resolver |
| `app/api/stripe/webhook/booking/route.ts` | Booking payment events | Same resolver pattern |

**Webhook idempotency:** The main webhook dispatches on `session.metadata.type`; invoice updates use `db.update` by id (safe to re-run); service activations use upsert on `(clientId, serviceId)`.

### Cron jobs (vercel.json)

| Path | Schedule | Purpose |
|---|---|---|
| `app/api/cron/mcp-rollup/route.ts` | `0 4 * * *` | Roll up `mcp_tool_calls` into `mcp_tool_call_daily_rollups` (schema in `lib/db/schema/tools.ts`); runs first, before the usage crons |
| `app/api/cron/resend-usage-sync/route.ts` | `15 4 * * *` | Pull Resend email-send counts into `usage_meter_events` |
| `app/api/cron/usage-alerts/route.ts` | `15 5 * * *` | Evaluate `usage_thresholds` for all active clients; deduplicate via `usage_alert_events`; dispatch portal notifications and email alerts at warn / exceeded / hard-limit levels |
| `app/api/cron/usage-rollup/route.ts` | `45 4 * * *` | Roll up all active clients' usage to Stripe |
| `app/api/cron/purge-unverified/route.ts` | `30 5 * * *` (05:30 UTC) | Delete user + client rows created by the signup funnel that remain unverified after 7 days. Calls `lib/signup/service.ts` `purgeUnverified`. |

Auth: `x-vercel-cron: 1` header OR `Authorization: Bearer $CRON_SECRET`.

### Scripts (per-environment provisioning)

| Script | Purpose |
|---|---|
| `scripts/billing/sync-stripe-products.ts` (94) | Creates or updates Stripe Products and Prices for every module SKU. Looks up existing objects by `metadata.moduleSlug` — idempotent and safe to re-run. Canonical source for catalog IDs; the values seeded in `services.stripePriceId` rows are live-mode defaults only. **Must be run per environment** (local / staging / production) after initial deploy or after adding a new module. |
| `scripts/billing/create-seat-product.ts` (52) | Provisions the single "Additional seats" Stripe Product and records the product id. **Go-live dependency** — until this is run and `SEAT_SKU.stripeProductId` is populated in `lib/billing/domain-catalog.ts`, the seat line item is omitted from subscriptions (modules still bill at their discounted per-module price). Run once per Stripe environment: `bunx tsx scripts/billing/create-seat-product.ts` with `STRIPE_SECRET_KEY` set, then paste the returned product id into `SEAT_SKU.stripeProductId`. |
| `scripts/billing/002_signup_funnel.sql` | Hand-apply migration for signup funnel schema additions (see Data model section). `users.google_id` unique constraint is in this file only — not in Drizzle schema; see [[ADR schema-constraints-hand-sql-only]]. |

## MCP tools

Registered in `lib/mcp/tools/billing.ts` via `registerBillingTools(server, ctx)`. All tools require scope `billing:read`.

| Tool | Description |
|---|---|
| `invoices_list` | List invoices for the active client, optional `status` filter |
| `invoices_get` | Fetch a single invoice with its line items |
| `ai_credits_balance` | Current balance, monthly grant, pay-as-you-go flag |
| `ai_credits_ledger` | Recent ledger entries, optional `type` filter |

## UI surfaces

| Path | Audience | Description |
|---|---|---|
| `app/portal/settings/billing/page.tsx` | Client | Billing settings, plan info, payment methods |
| `app/portal/settings/billing/plans/page.tsx` (635) | Client | Pricing page: 12 module cards + bundle upsell + Stripe Checkout button; volume-discount progress strip; Team seats card (shows current seat count and per-seat cost); BYOK contact-sales card (mailto:info@danielpcoyle.com); usage meters section. Repeat-subscribes route through `add-item` (Checkout fallback for first purchase only) so all modules share one subscription and the reconciler re-syncs computed line items. |
| `components/portal/billing/UsageMeters.tsx` | Client | Per-resource usage bars pulling from `usage_thresholds` + `usage_alert_events` |
| `app/portal/invoices/[id]/page.tsx` | Client | Invoice detail and payment page |
| `app/admin/clients/[id]/plan/page.tsx` (723) | Admin | **"Billing & Plan" full management surface.** Active modules list (name, slug, status, cost); seat panel (derived count vs. override, per-seat charge, override input); volume-discount tier + dollar amount; comp % (set/clear); bundle swap action; BYOK override toggle; MRR breakdown via `computeAccountBilling`. All management controls wire to `app/api/admin/portal/clients/[id]/billing/route.ts`. |
| `components/admin/ClientBillingSummary.tsx` (153) | Admin | Read-only billing summary (active modules, seat count, volume-discount %, comp %, MRR) mounted in the client-detail billing tab (`app/admin/clients/[id]/page.tsx`). Deep-links to the plan page for management. |
| `app/admin/layout.tsx` (49) | Admin | RSC server component auth shell. Gates on `requireStaffSession()` from `lib/admin/auth.ts`; redirects unauthenticated requests server-side. Renders `components/admin/AdminShellClient.tsx` (49) as client chrome. Mirrors the `PortalShell` pattern. |
| `app/admin/error.tsx` (53) | Admin | Global Next.js error boundary for all admin routes. Friendly retry UI — no infinite spinner. |
| `app/admin/portal-invoices/` | Admin | Invoice list and create |
| `app/admin/portal-invoices/new/page.tsx` | Admin | New invoice form |
| `app/admin/ai-credits/page.tsx` | Admin | AI credit package management |
| `app/admin/subscriptions/page.tsx` | Admin | Subscription overview |
| `app/admin/clients/[id]/page.tsx` | Admin | Client detail including billing tab |
| `components/portal/onboarding/steps/StepChooseModules.tsx` (378) | Client (wizard) | Cart-style à-la-carte module picker; volume-discount progress strip; seat note (shows per-seat cost at current module selection); bundle auto-suggest when cart total >= bundle price; BYOK contact-sales card. Tier selection UI removed. |
| `components/portal/onboarding/steps/StepPayment.tsx` (227) | Client (wizard) | Stripe Checkout session launch for multi-line-item subscription; displays volume discount applied at current module count. |
| `components/portal/onboarding/steps/StepModuleSetup.tsx` | Client (wizard) | Product-specific onboarding steps from `lib/onboarding/module-segments.ts` |
| `components/portal/onboarding/steps/StepUpsell.tsx` | Client (wizard) | Up to 3 `promotesTo` upsells; one-click add via `add-item` route; bundle-gap nudge |
| `components/portal/onboarding/GetStartedChecklist.tsx` (202) | Client (dashboard) | Persistent checklist surfacing module segments; updates as modules are purchased post-signup |

## Tests & gates

Coverage floor: **70% lines / functions / branches / statements** on `lib/billing/**` (see `tests/CI-GATES.md`). Active test files:

| File | What it covers |
|---|---|
| `tests/unit/billing-rollup.test.ts` | `rollupClientPeriod`: period validation, dry-run, billable math, Stripe failure handling, upsert idempotency |
| `tests/unit/billing-rollup-included-quantity.test.ts` | Edge cases for included-quantity subtraction |
| `tests/unit/billing-metered-items.test.ts` | CRUD helpers in `lib/billing/metered-items.ts` |
| `tests/unit/billing/usage-alerts.test.ts` | `lib/billing/usage-alerts.ts`: threshold evaluation, deduplication, alert level dispatch |
| `tests/unit/mcp-tools-billing.test.ts` | Tool registration, scope guards, query logic for all four tools |
| `tests/unit/ai-credits.test.ts` | Credit ledger functions in `lib/ai-credits.ts` |
| `tests/unit/api-stripe-webhook-ecommerce-route.test.ts` | Ecommerce webhook |
| `tests/unit/api-stripe-webhook-booking-route.test.ts` | Booking webhook |
| `tests/unit/stripe/site-stripe.test.ts` | Site Stripe resolver (Connect vs BYOK) |
| `tests/unit/ai-resolve-client-key.test.ts` | `lib/ai/resolve-client-key.ts`: inference-layer BYOK gate — `byokEligible` flag controls key selection; fails closed on entitlement error |
| `tests/unit/ai-plan-gate.test.ts` | `lib/ai/plan-gate.ts`: always-allowed pass-through post BYOK inversion; the old `starter_requires_byok` path is gone |

Run: `scripts/test.sh --layer=unit --no-coverage` (fast) or with coverage to verify the 70% floor.

## Cross-domain dependencies

- `lib/db/schema/sites.ts` — `clients` table (`stripeCustomerId`, `plan`, `brainTrialUntil`), `clientServices`
- `lib/db/schema/pm.ts` — `projects` (invoices may reference a project)
- `lib/db/schema/sites.ts` — `services` (invoice line items may reference a service)
- `lib/ai-credits.ts` — imported by `lib/ai/` and `lib/brain/` to gate token consumption
- `lib/crypto/api-key.ts` — AES-256-GCM encryption for BYOK keys in `client_api_keys`; 90% coverage floor on `lib/crypto/`
- `lib/cron-health.ts` — `withCronHealth` wrapper on cron routes for health telemetry
- `lib/admin/dashboard-cache.ts` — `revalidateAdminDashboard()` called after invoice-paid events

## Invariants & gotchas

1. **Scope/auth gating ≠ entitlement gating — both are required on paid-module writes (2026-06-24).** Scope (`hasScope` / `requireScope`) verifies key/role permission. Entitlement (`requireService(clientId, category)` for MCP; `authorizePortal({ requireService })` / `hasServiceAccess` for REST) verifies an active subscription. Either gate alone is insufficient; a client without a subscription could otherwise mutate paid-module data. The canonical REST helper for store routes is `resolveStoreSite` in `lib/portal-auth.ts` (168), which wraps `resolveClientSite` + `hasServiceAccess('store')`. Three deliberately ungated routes (`store/stripe/test`, `store/stripe-connect/*`, `store/easypost/test`) are asserted on an allow-list in `tests/unit/paid-module-entitlement-guard.test.ts` (85). MCP store write tools gate via `requireStore()` in `lib/storefront/mcp-sdk-adapter.ts` (947). See [[ADR paid-module-entitlement-vs-scope-gating]].

2. **Webhook idempotency (platform):** `checkout.session.completed` — credit purchases return early after `addPurchasedCredits`; invoice updates are by `invoiceId` (idempotent `db.update`); service activations use upsert on `(clientId, serviceId)`. Signature verification uses the raw request body (`req.text()`) — do not wrap in JSON middleware upstream.

2. **Rollup idempotency:** `usage_billing_periods` has a unique index on `(clientId, period, resource)`. The rollup upserts with `onConflictDoUpdate` and uses `action='set'` (not `'increment'`) when calling `POST /v1/subscription_items/{id}/usage_records` — running the same period twice does not double-bill.

3. **Stripe SDK usage records API:** SDK v20+ removed `subscriptionItems.createUsageRecord`. The codebase uses `stripe.rawRequest('POST', '/v1/subscription_items/.../usage_records', ...)` for legacy metered Prices (see `lib/stripe/index.ts` line 50 comment). Migration to the Meter Events API is deferred.

4. **Audit rows with `stripeUsageRecordId=null`:** indicate a failed Stripe push. The next cron run retries by re-computing and re-pushing the same period with `action='set'`.

5. **Plan gating:** `clients.plan` (`starter` / `pro` / `enterprise`) in `lib/db/schema/sites.ts` controls feature entitlements. `clients.brainTrialUntil` grants temporary Brain access outside the paid tier. `clients.billing_mode` is independent of `plan` — both axes coexist.

6. **BYOK AI keys — contact-sales (not self-serve):** With the tier UI removed, BYOK is no longer a self-serve price point. New clients see a "Contact sales" card (mailto:info@danielpcoyle.com) in place of any BYOK toggle or upgrade prompt — on both the onboarding wizard (`StepChooseModules.tsx`) and the plans page. This supersedes the earlier Scale-only self-serve model from [[ADR byok-inversion-scale-only]]; see [[ADR alacarte-volume-discount-replaces-tiers]] for the full decision.

   The three-layer code enforcement is unchanged (only the self-serve UI path changed):
   - **Storage** (`app/api/portal/integrations/api-keys/route.ts` (155) POST): returns 403 for non-`byokEligible` clients on `anthropic`/`openai` providers. `resend`/`dropbox_sign` are not gated.
   - **Inference** (`lib/ai/resolve-client-key.ts` (199)): only uses a stored BYOK key while the client is `byokEligible`. Falls back to the platform key on downgrade or entitlement-check error (fails closed).
   - **UI** (`app/portal/integrations/api-keys/page.tsx` (372)): hides the add/edit form for non-`byokEligible` clients.

   `byokEligible` is still true for agency-mode, bundle, and legacy subscription clients. New à-la-carte module subscribers are not `byokEligible` unless they hold a bundle subscription or an agency override.

   `client_api_keys.encryptedKey` is AES-256-GCM ciphertext from `lib/crypto/api-key.ts`. The raw key is never persisted. The `lib/stripe/site-stripe.ts` resolver applies the same BYOK pattern for per-site Stripe keys. BYOK providers include `anthropic`, `openai`, `resend`, and `dropbox_sign`.

7. **BYOK meter waiver scope:** Only meters whose COGS lands on the client's own keys are waived — AI tokens, email sends, e-sign envelopes. Platform infra (hosting bandwidth/storage, automation compute) is never waived. See `lib/billing/domain-catalog.ts` `byokProviders` field.

8. **Tenancy:** every table in `lib/db/schema/billing.ts` is scoped by `clientId`. `usage_thresholds` and `usage_alert_events` are new `clientId`-keyed tables. Run `bun test:tenancy` after any data-access change.

9. **Test-infra gotcha — schema-only columns:** The integration test template heals schema-only columns via `drizzle-kit push` in `tests/helpers/test-db.ts` (317 lines). After the `billing_mode` column was added via hand-applied SQL (not through drizzle-kit generate), the template was missing the column, causing 313 cascading integration test failures. The fix was raising the `drizzle-kit push` timeout from 180 s to 600 s in `tests/helpers/test-db.ts` so the push completes before the first test runs. After any hand-applied migration, verify the test template heals correctly before running integration tests.

## Planning notes

- The older `usage_meters` table (running totals, coarse category vocabulary) coexists with the newer `usage_meter_events` (append-only, fine-grained resources). Long-term the older table should be deprecated in favour of the events approach.
- BYOK AI key management (`client_api_keys`) was added as a pricing-pivot foundation — call-site telemetry for BYOK proxying is noted as future work in the schema comment.
- `lib/billing/` has a 70% coverage floor but the gate is advisory until coverage is healthy enough to enforce (see `tests/CI-GATES.md`).
- **Follow-ups from Per-Domain SaaS Billing & BYOK (commit 3357d619):** (1) `scripts/billing/sync-stripe-products.ts` replaces the earlier manual step — run it per environment; (2) `scripts/seed-domain-modules.ts` must be run on staging after hand-applying `scripts/billing/001_domain_saas_billing.sql`; (3) deep API-level enforcement in `saas` mode is not yet wired (nav/layout gating only); (4) voice minutes and Replicate upscales are not yet metered; (5) monthly credit re-grant cron is missing (grants happen on activation/renewal webhook only). See [[Per-Domain SaaS Billing & BYOK]] spec for full follow-up list.
- **Self-Serve Signup Funnel & Module Onboarding (commits e2faf943 + 8566e8ed):** shipped; status: validating. Remaining: staging deploy, `sync-stripe-products.ts` per environment, test-card checkout, Google OAuth callback URL + env vars. `scripts/billing/002_signup_funnel.sql` must be hand-applied. `users.google_id` unique constraint lives only in that SQL file — see [[ADR schema-constraints-hand-sql-only]]. See [[Self-Serve Signup Funnel & Module Onboarding]] for full validation checklist.
- **BYOK inversion (commit 8669039b):** shipped; subsequently partially superseded. See entry below. Unit coverage exists for the inference layer (`tests/unit/ai-resolve-client-key.test.ts`) and plan gate (`tests/unit/ai-plan-gate.test.ts`). See [[ADR byok-inversion-scale-only]].
- **À-la-carte + volume discounts (commit 23a46fb2):** shipped; status: active. Tier selection UI replaced with à-la-carte module picking + volume-discount progress strip. BYOK moved to contact-sales. The volume-discount coupon mechanism from this commit was subsequently superseded by computed `price_data` line items in the per-seat commit (see below); the coupon provisioning script (create-volume-coupons.ts) was deleted. The old TierPlans tier-selection component (117 LOC) was dead after this pivot and has now been deleted (ponytail sweep). See [[ADR alacarte-volume-discount-replaces-tiers]].
- **Per-seat pricing + computed line items:** shipped; status: validating. Monthly total = M + (seats − 1) × min(M, $30) where M = post-volume-discount module subtotal and seats = owner + accepted members. Volume discount thresholds/percentages unchanged (4→10%, 8→20%, 12→30%) but now applied via computed `price_data` line items, not a Stripe coupon. `recomputeClientSubscription()` is the single reconciliation writer. Go-live dependency: run `bunx tsx scripts/billing/create-seat-product.ts` and paste the product id into `SEAT_SKU.stripeProductId` in `lib/billing/domain-catalog.ts` (697). Until then the seat line is omitted; modules still bill. Staging (Stripe test-mode) verification required on all Stripe-write paths. Test gaps: no automated test for seat count, reconciler, or seat-line item generation. See [[ADR per-seat-pricing-computed-line-items]].
- **Admin Billing Parity — Full Management (commits 5e16d37b, 3d56ba3f, 543d5f70, 97ab20f5, b5b8ba0b, dc7f3769, 5c678848):** code-complete; status: validating (staging validation + manual Stripe test-mode verification pending). 9 cards (C1–C9). Key additions: three nullable `clients` override columns (`billable_seats_override`, `comp_discount_percent`, `byok_eligible_override`) via `scripts/migrations/admin-billing-overrides.sql`; `app/api/admin/portal/clients/[id]/billing/route.ts` (288) as the unified admin billing API; `app/admin/clients/[id]/plan/page.tsx` (723) expanded to the full "Billing & Plan" management surface; `components/admin/ClientBillingSummary.tsx` (153) for the client-detail read tab; RSC auth shell on `app/admin/layout.tsx` (49) + `lib/admin/auth.ts` (14); `app/admin/error.tsx` (53) global error boundary; `lib/admin/fetch-json-safe.ts` (30) helper. The dead AdminNav component was deleted (C9). Pending: `/admin/login` smoke-test; override/comp/module POST paths in Stripe TEST mode; `bun test:tenancy`; hand-apply migration to staging and prod. See [[Admin Billing Parity — Full Management]] spec and [[ADR admin-billing-overrides-comp-coupon]].

## Related

[[Storefront & Commerce]], [[Agency, Onboarding & Branding]]

ADRs: [[ADR admin-billing-overrides-comp-coupon]] · [[ADR per-seat-pricing-computed-line-items]] · [[ADR alacarte-volume-discount-replaces-tiers]] · [[ADR byok-inversion-scale-only]] · [[ADR tiers-are-first-class-stripe-products]] · [[ADR per-domain-billing-rides-services-catalog]] · [[ADR paid-module-entitlement-vs-scope-gating]]
