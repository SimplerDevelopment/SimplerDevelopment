---
type: domain-map
domain: billing
status: active
date: 2026-06-10
sources:
  - lib/billing/
  - lib/stripe/
  - lib/db/schema/billing.ts
  - app/api/portal/credits/route.ts
  - app/api/portal/credits/purchase/route.ts
  - app/api/portal/credits/pay-as-you-go/route.ts
  - app/api/portal/integrations/api-keys/route.ts
  - app/api/portal/invoices/[id]/checkout/route.ts
  - app/api/admin/portal/invoices/route.ts
  - app/api/admin/portal/subscriptions/route.ts
  - app/api/admin/portal/ai-credits/route.ts
  - app/api/admin/portal/mcp-usage/route.ts
  - app/portal/invoices/[id]/page.tsx
---

# Domain: Billing & Stripe

## Purpose

Manages all money movement for the platform: AI credit grants and purchases, metered usage rollup to Stripe, invoice creation and payment, per-site Stripe Connect / BYOK commerce, and the MCP tools that let agents query billing state. Coverage floor: **70% lines/functions** on `lib/billing/**`.

## Key entry points

| File | Role |
|---|---|
| `lib/billing/usage-rollup.ts` | Core rollup logic: aggregate `usage_meter_events`, subtract included quota, push to Stripe via `action=set`, upsert audit row |
| `lib/billing/metered-items.ts` | CRUD helpers for `metered_subscription_items` (no Stripe calls — kept separate for DI mocking) |
| `lib/stripe/index.ts` | Lazy-singleton Stripe client + `reportUsage`, `createMeteredItemForSubscription`, `listSubscriptionItemsForClient` |
| `lib/stripe/site-stripe.ts` | Per-site Stripe resolver: Connect mode (platform key + application fee) vs BYOK (tenant's own key) |
| `lib/ai-credits.ts` | AI token credit ledger: `getBalance`, `hasCredits`, `deductCredits`, `grantMonthlyCredits`, `addPurchasedCredits`, `getLedger`, `getCreditPackages` |
| `app/api/stripe/webhook/route.ts` | Platform webhook handler (signature-verified): `checkout.session.completed` → invoice paid / service activation / credit purchase |
| `app/api/stripe/webhook/ecommerce/route.ts` | Commerce webhook (order payments, refunds) |
| `app/api/stripe/webhook/booking/route.ts` | Booking payment webhook |
| `app/api/cron/usage-rollup/route.ts` | Cron entry point wrapping `rollupClientPeriod` for all active clients |
| `app/api/cron/resend-usage-sync/route.ts` | Pulls Resend email-send counts into `usage_meter_events` before rollup |
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

`clients.stripeCustomerId` (in `lib/db/schema/sites.ts`) persists the Stripe customer id. `clients.plan` (`starter` / `pro` / `enterprise`) governs plan-gating entitlements.

## API surface

### Portal (client-facing)

| Route | Method | Purpose |
|---|---|---|
| `app/api/portal/settings/billing/route.ts` | GET | Return billing settings for the active client |
| `app/api/portal/billing/payment-methods/route.ts` | GET / DELETE | List / remove saved payment methods |
| `app/api/portal/credits/route.ts` | GET | List purchasable credit packages and current balance |
| `app/api/portal/credits/purchase/route.ts` | POST | Initiate Stripe Checkout session for a credit bundle |
| `app/api/portal/credits/pay-as-you-go/route.ts` | POST | Toggle the pay-as-you-go flag on the client's balance |
| `app/api/portal/integrations/api-keys/route.ts` | GET / POST | List / create BYOK provider keys (anthropic \| openai) — schema: `client_api_keys` in `lib/db/schema/billing.ts` |
| `app/api/portal/integrations/api-keys/[id]/route.ts` | PATCH / DELETE | Update / remove a BYOK key |
| `app/api/portal/invoices/[id]/checkout/route.ts` | POST | Create Stripe Checkout session for client to pay an invoice |

### Admin (internal)

| Route | Method | Purpose |
|---|---|---|
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
| `app/api/cron/usage-rollup/route.ts` | `45 4 * * *` | Roll up all active clients' usage to Stripe |

Auth: `x-vercel-cron: 1` header OR `Authorization: Bearer $CRON_SECRET`.

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
| `app/portal/invoices/[id]/page.tsx` | Client | Invoice detail and payment page |
| `app/admin/portal-invoices/` | Admin | Invoice list and create |
| `app/admin/portal-invoices/new/page.tsx` | Admin | New invoice form |
| `app/admin/ai-credits/page.tsx` | Admin | AI credit package management |
| `app/admin/subscriptions/page.tsx` | Admin | Subscription overview |
| `app/admin/clients/[id]/page.tsx` | Admin | Client detail including billing tab |

## Tests & gates

Coverage floor: **70% lines / functions / branches / statements** on `lib/billing/**` (see `tests/CI-GATES.md`). Active test files:

| File | What it covers |
|---|---|
| `tests/unit/billing-rollup.test.ts` | `rollupClientPeriod`: period validation, dry-run, billable math, Stripe failure handling, upsert idempotency |
| `tests/unit/billing-rollup-included-quantity.test.ts` | Edge cases for included-quantity subtraction |
| `tests/unit/billing-metered-items.test.ts` | CRUD helpers in `lib/billing/metered-items.ts` |
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

5. **Plan gating:** `clients.plan` (`starter` / `pro` / `enterprise`) in `lib/db/schema/sites.ts` controls feature entitlements. `clients.brainTrialUntil` grants temporary Brain access outside the paid tier.

6. **BYOK AI keys:** `client_api_keys.encryptedKey` is AES-256-GCM ciphertext from `lib/crypto/api-key.ts`. The raw key is never persisted. The `lib/stripe/site-stripe.ts` resolver applies the same BYOK pattern for per-site Stripe keys.

7. **Tenancy:** every table in `lib/db/schema/billing.ts` is scoped by `clientId`. Run `bun test:tenancy` after any data-access change.

## Planning notes

- The older `usage_meters` table (running totals, coarse category vocabulary) coexists with the newer `usage_meter_events` (append-only, fine-grained resources). Long-term the older table should be deprecated in favour of the events approach.
- BYOK AI key management (`client_api_keys`) was added as a pricing-pivot foundation — call-site telemetry for BYOK proxying is noted as future work in the schema comment.
- `lib/billing/` has a 70% coverage floor but the gate is advisory until coverage is healthy enough to enforce (see `tests/CI-GATES.md`).

## Related

[[Storefront & Commerce]], [[Agency, Onboarding & Branding]]
