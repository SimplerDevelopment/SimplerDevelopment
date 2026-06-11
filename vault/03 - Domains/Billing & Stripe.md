---
type: domain-map
domain: billing
status: active
date: 2026-06-11
sources:
  - lib/billing/
  - lib/stripe/
  - lib/signup/service.ts
  - lib/onboarding/module-segments.ts
  - lib/db/schema/billing.ts
  - lib/db/schema/sites.ts
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
  - app/api/admin/portal/clients/[id]/billing/thresholds/route.ts
  - app/api/admin/portal/clients/[id]/billing-mode/route.ts
  - app/api/admin/portal/invoices/route.ts
  - app/api/admin/portal/subscriptions/route.ts
  - app/api/admin/portal/ai-credits/route.ts
  - app/api/admin/portal/mcp-usage/route.ts
  - app/portal/invoices/[id]/page.tsx
  - app/portal/settings/billing/plans/page.tsx
  - app/admin/clients/[id]/plan/page.tsx
  - components/portal/billing/UsageMeters.tsx
  - components/portal/onboarding/steps/StepChooseModules.tsx
  - components/portal/onboarding/steps/StepPayment.tsx
  - components/portal/onboarding/steps/StepModuleSetup.tsx
  - components/portal/onboarding/steps/StepUpsell.tsx
  - components/portal/onboarding/GetStartedChecklist.tsx
  - scripts/billing/001_domain_saas_billing.sql
  - scripts/billing/002_signup_funnel.sql
  - scripts/billing/sync-stripe-products.ts
---

# Domain: Billing & Stripe

## Purpose

Manages all money movement for the platform: AI credit grants and purchases, metered usage rollup to Stripe, invoice creation and payment, per-site Stripe Connect / BYOK commerce, and the MCP tools that let agents query billing state. Coverage floor: **70% lines/functions** on `lib/billing/**`.

## Key entry points

| File | Role |
|---|---|
| `lib/signup/service.ts` (177) | Self-serve account creation: `createAccount` (email+password), `verifyEmail` (token), `linkGoogleAccount` (OAuth same-email merge), `purgeUnverified` (7-day cleanup). Creates user + client with `billingMode='saas'` + `user_onboarding` row atomically. |
| `lib/onboarding/module-segments.ts` (185) | Segment registry keyed by domain key. v1 rich segments for websites, crm, email, brain, projects; generic "first 3 wins" fallback for the remaining 7 modules. Consumed by the wizard steps and the dashboard checklist. |
| `lib/billing/domain-catalog.ts` (435) | Single source of truth for 12 module SKUs + bundle: prices (seed defaults), per-meter included allowances + overage rates, `byokProviders`, `promotesTo` cross-promo links, `navHrefs`. Live price = `services.price` / Stripe Price object. |
| `lib/billing/entitlements.ts` (83) | `getClientEntitlements(clientId)`: resolves effective module set — `'agency'` billingMode bypasses gating; `'bundle'` category grants all; legacy `subscription` tier rows bypass; `brainTrialUntil` honored. Single resolution function; callers do not inspect `billingMode` directly. |
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
| `app/api/portal/billing/modules/route.ts` | GET | List all 12 module SKUs + bundle with subscription status for the active client |
| `app/api/portal/billing/modules/checkout/route.ts` | POST | Create Stripe Checkout session (`mode=subscription`). Accepts `slugs[]` — one line item per module slug, `trial_period_days: 14` (card required, $0 today). Trial granted only once per client via `clients.trial_used_at`. `metadata.type='module_subscription'`; webhook upserts one `clientServices` row per line item sharing the same `stripeSubscriptionId`. |
| `app/api/portal/billing/modules/add-item/route.ts` | POST | One-click prorated add of a module to an existing subscription, or bundle swap. Appends a line item to the live Stripe subscription at prorated price; joins any active trial. Used by the upsell wizard step and the plans page. |
| `app/api/portal/billing/modules/[id]/cancel/route.ts` | POST | Cancel a module subscription via Stripe |
| `app/api/portal/billing/usage/route.ts` | GET | Per-resource usage vs thresholds for the active client |
| `app/api/portal/billing/byok-status/route.ts` | GET | Which BYOK providers are configured; used by admin BYOK checklist |
| `app/api/portal/credits/route.ts` | GET | List purchasable credit packages and current balance |
| `app/api/portal/credits/purchase/route.ts` | POST | Initiate Stripe Checkout session for a credit bundle |
| `app/api/portal/credits/pay-as-you-go/route.ts` | POST | Toggle the pay-as-you-go flag on the client's balance |
| `app/api/portal/integrations/api-keys/route.ts` | GET / POST | List / create BYOK provider keys (anthropic \| openai \| resend \| dropbox_sign) — schema: `client_api_keys` in `lib/db/schema/billing.ts` |
| `app/api/portal/integrations/api-keys/[id]/route.ts` | PATCH / DELETE | Update / remove a BYOK key |
| `app/api/portal/invoices/[id]/checkout/route.ts` | POST | Create Stripe Checkout session for client to pay an invoice |

### Admin (internal)

| Route | Method | Purpose |
|---|---|---|
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
| `app/portal/settings/billing/plans/page.tsx` | Client | Pricing page: 12 module cards + bundle upsell + Stripe Checkout button; usage meters section |
| `components/portal/billing/UsageMeters.tsx` | Client | Per-resource usage bars pulling from `usage_thresholds` + `usage_alert_events` |
| `app/portal/invoices/[id]/page.tsx` | Client | Invoice detail and payment page |
| `app/admin/clients/[id]/plan/page.tsx` | Admin | Mode switcher (agency / saas / byok), BYOK key checklist, threshold configuration |
| `app/admin/portal-invoices/` | Admin | Invoice list and create |
| `app/admin/portal-invoices/new/page.tsx` | Admin | New invoice form |
| `app/admin/ai-credits/page.tsx` | Admin | AI credit package management |
| `app/admin/subscriptions/page.tsx` | Admin | Subscription overview |
| `app/admin/clients/[id]/page.tsx` | Admin | Client detail including billing tab |
| `components/portal/onboarding/steps/StepChooseModules.tsx` | Client (wizard) | Cart-style module picker; bundle auto-suggest when cart total >= bundle price |
| `components/portal/onboarding/steps/StepPayment.tsx` | Client (wizard) | Stripe Checkout session launch for multi-line-item subscription |
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

1. **Webhook idempotency (platform):** `checkout.session.completed` — credit purchases return early after `addPurchasedCredits`; invoice updates are by `invoiceId` (idempotent `db.update`); service activations use upsert on `(clientId, serviceId)`. Signature verification uses the raw request body (`req.text()`) — do not wrap in JSON middleware upstream.

2. **Rollup idempotency:** `usage_billing_periods` has a unique index on `(clientId, period, resource)`. The rollup upserts with `onConflictDoUpdate` and uses `action='set'` (not `'increment'`) when calling `POST /v1/subscription_items/{id}/usage_records` — running the same period twice does not double-bill.

3. **Stripe SDK usage records API:** SDK v20+ removed `subscriptionItems.createUsageRecord`. The codebase uses `stripe.rawRequest('POST', '/v1/subscription_items/.../usage_records', ...)` for legacy metered Prices (see `lib/stripe/index.ts` line 50 comment). Migration to the Meter Events API is deferred.

4. **Audit rows with `stripeUsageRecordId=null`:** indicate a failed Stripe push. The next cron run retries by re-computing and re-pushing the same period with `action='set'`.

5. **Plan gating:** `clients.plan` (`starter` / `pro` / `enterprise`) in `lib/db/schema/sites.ts` controls feature entitlements. `clients.brainTrialUntil` grants temporary Brain access outside the paid tier. `clients.billing_mode` is independent of `plan` — both axes coexist.

6. **BYOK AI keys:** `client_api_keys.encryptedKey` is AES-256-GCM ciphertext from `lib/crypto/api-key.ts`. The raw key is never persisted. The `lib/stripe/site-stripe.ts` resolver applies the same BYOK pattern for per-site Stripe keys. BYOK providers now include `anthropic`, `openai`, `resend`, and `dropbox_sign`.

7. **BYOK meter waiver scope:** Only meters whose COGS lands on the client's own keys are waived — AI tokens, email sends, e-sign envelopes. Platform infra (hosting bandwidth/storage, automation compute) is never waived. See `lib/billing/domain-catalog.ts` `byokProviders` field.

8. **Tenancy:** every table in `lib/db/schema/billing.ts` is scoped by `clientId`. `usage_thresholds` and `usage_alert_events` are new `clientId`-keyed tables. Run `bun test:tenancy` after any data-access change.

9. **Test-infra gotcha — schema-only columns:** The integration test template heals schema-only columns via `drizzle-kit push` in `tests/helpers/test-db.ts` (317 lines). After the `billing_mode` column was added via hand-applied SQL (not through drizzle-kit generate), the template was missing the column, causing 313 cascading integration test failures. The fix was raising the `drizzle-kit push` timeout from 180 s to 600 s in `tests/helpers/test-db.ts` so the push completes before the first test runs. After any hand-applied migration, verify the test template heals correctly before running integration tests.

## Planning notes

- The older `usage_meters` table (running totals, coarse category vocabulary) coexists with the newer `usage_meter_events` (append-only, fine-grained resources). Long-term the older table should be deprecated in favour of the events approach.
- BYOK AI key management (`client_api_keys`) was added as a pricing-pivot foundation — call-site telemetry for BYOK proxying is noted as future work in the schema comment.
- `lib/billing/` has a 70% coverage floor but the gate is advisory until coverage is healthy enough to enforce (see `tests/CI-GATES.md`).
- **Follow-ups from Per-Domain SaaS Billing & BYOK (commit 3357d619):** (1) `scripts/billing/sync-stripe-products.ts` replaces the earlier manual step — run it per environment; (2) `scripts/seed-domain-modules.ts` must be run on staging after hand-applying `scripts/billing/001_domain_saas_billing.sql`; (3) deep API-level enforcement in `saas` mode is not yet wired (nav/layout gating only); (4) voice minutes and Replicate upscales are not yet metered; (5) monthly credit re-grant cron is missing (grants happen on activation/renewal webhook only). See [[Per-Domain SaaS Billing & BYOK]] spec for full follow-up list.
- **Self-Serve Signup Funnel & Module Onboarding (commits e2faf943 + 8566e8ed):** shipped; status: validating. Remaining: staging deploy, `sync-stripe-products.ts` per environment, test-card checkout, Google OAuth callback URL + env vars. `scripts/billing/002_signup_funnel.sql` must be hand-applied. `users.google_id` unique constraint lives only in that SQL file — see [[ADR schema-constraints-hand-sql-only]]. See [[Self-Serve Signup Funnel & Module Onboarding]] for full validation checklist.

## Related

[[Storefront & Commerce]], [[Agency, Onboarding & Branding]]
