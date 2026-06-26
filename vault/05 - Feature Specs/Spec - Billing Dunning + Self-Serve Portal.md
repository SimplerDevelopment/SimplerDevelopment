---
type: spec
domain: billing-stripe
status: shipped
date: 2026-06-17
sources:
  - lib/db/schema/billing.ts
  - lib/billing/usage-rollup.ts
  - lib/billing/metered-items.ts
  - lib/stripe/index.ts
  - app/api/stripe/webhook/route.ts
  - app/api/portal/billing/payment-methods/route.ts
  - app/api/portal/settings/billing/route.ts
  - lib/mcp/tools/billing.ts
---

# Feature: Billing Dunning + Self-Serve Portal

> **STATUS: ALREADY SHIPPED (verified on `dev` 2026-06-17).** The competitive gap
> report flagged this as the #1 gap from a pre-`market-ready-makeover` snapshot. On
> `dev` (commit 4a5cd978, the GTM makeover) both halves are already implemented:
> - **Self-serve portal:** `app/api/portal/billing/customer-portal/route.ts`
>   (`billingPortal.sessions.create` + create-customer-if-missing) wired to a
>   "Manage billing" button in `app/portal/settings/billing/page.tsx`.
> - **Dunning:** `app/api/stripe/webhook/route.ts` handles `invoice.payment_failed`
>   (→ `sendPaymentFailedEmail`), `customer.subscription.updated` (suspend/reactivate
>   `clientServices` via `stripeSubscriptionId`), `customer.subscription.trial_will_end`,
>   `customer.subscription.deleted`, and `invoice.paid` (monthly-credit re-grant).
>   Emails live in `lib/billing/dunning-emails.ts`.
>
> Remaining (non-code / optional): (1) enable Stripe **Smart Retries** + create the
> **Customer Portal configuration** in the Stripe Dashboard (account-level, not API);
> (2) optional robustness — wrap `billingPortal.sessions.create` in the customer-portal
> route so a missing portal config returns a graceful message instead of a raw 500;
> (3) admin-side dunning-state visibility (no persisted dunning counters today — the
> webhook notifies + suspends but doesn't store attempt history).

## Overview

Two tightly related gaps, both wiring against existing Stripe infrastructure:
(1) **Failed-payment dunning** — automatic smart-retries and email notifications when a charge declines, so revenue is recovered rather than silently lost.
(2) **Customer self-serve billing portal** — a hosted Stripe portal session (`billingPortal.sessions.create`) where tenants can update payment methods, download invoices, and manage subscriptions without contacting support.
Audience: portal (per-tenant client UI) and admin (oversight). The gap report names this the single most urgent gap: "active revenue leak today."

Competitive context: **Stripe Billing** and **Orb** both ship dunning as a native feature. Gap #1 and #2 in [[Competitive Gap Analysis 2026-06]].

## Domain context

Read first: [[Billing & Stripe]]. Invariants:

- Stripe metered billing, AI credit ledger, and Stripe Connect / BYOK are already in place (`lib/billing/usage-rollup.ts`, `lib/billing/metered-items.ts`, `lib/stripe/index.ts`).
- The webhook receiver at `app/api/stripe/webhook/route.ts` already handles inbound Stripe events — dunning hooks (`invoice.payment_failed`, `invoice.payment_action_required`, `customer.subscription.deleted`) extend it.
- Tenancy: every billing object is keyed by `clientId`; see `lib/db/schema/billing.ts`.
- Never hand-edit `drizzle/*.sql`; schema changes go through `bun run db:generate`.

## Problem

When a tenant's payment method declines, SD has no retry logic and sends no notification. The subscription lapses silently. Tenants also cannot self-serve update a card or download an invoice — every such request is a support touch. These are the cheapest category of revenue protection: wiring, not new infrastructure.

## Goal

- Zero silent subscription lapses from recoverable declines within 90 days of ship.
- Tenants can access a hosted self-serve billing portal from the portal settings UI with zero support involvement.
- Admin can see dunning state (last attempt, next retry, emails sent) per client.

## Proposed approach

### Dunning (Effort: S)

1. Enable Stripe's built-in **Smart Retries** in the Stripe Dashboard (no code: Stripe retries up to 4× over 14 days using ML-optimized timing). This alone stops the silent lapse.
2. Handle `invoice.payment_failed` in `app/api/stripe/webhook/route.ts`: persist dunning state to `lib/db/schema/billing.ts` (new `dunningStatus`, `dunningAttempts`, `nextRetryAt` columns → `bun run db:generate`), then enqueue an email notification to the tenant via the existing email infrastructure.
3. Handle `invoice.payment_action_required` (3DS challenges): redirect tenant to Stripe's hosted invoice page for authentication.
4. On `customer.subscription.deleted` after exhausted retries: mark the client account suspended in the portal, notify admin.
5. Admin billing view: surface dunning state per client (attempts, next retry, status badge).

### Self-Serve Billing Portal (Effort: S)

1. Add a `POST /api/portal/billing/portal-session` route that calls `stripe.billingPortal.sessions.create({ customer: clientStripeId, return_url })` and returns the short-lived URL.
2. Render a "Manage Billing" button in `app/api/portal/settings/billing/route.ts` (portal settings page) that hits this endpoint and redirects. No new page needed — Stripe hosts the portal UI.
3. Gate the button on the client having a Stripe customer ID (existing field in `lib/db/schema/billing.ts`).

## Scope

In scope:
- Stripe Smart Retries (dashboard config) + webhook handlers for dunning lifecycle events.
- `dunningStatus` / `dunningAttempts` / `nextRetryAt` schema additions.
- Tenant email notifications on payment failure.
- Admin billing UI: dunning state surfaced per client.
- `POST /api/portal/billing/portal-session` route + "Manage Billing" button in portal settings.

Out of scope:
- Custom dunning email sequences / multi-step cadences (see [[Spec - Durable Automation Runtime]] for the engine that would power those).
- Annual billing / proration logic changes.
- Rebilling for agency resell (see [[Spec - White-Label SaaS Resell]]).

## Risks

- Stripe Smart Retries requires the subscription's `collection_method` to be `charge_automatically`. Verify all active subscriptions are configured correctly before enabling.
- `billingPortal.sessions.create` requires a Portal configuration created in the Stripe Dashboard (one-time setup). Configuration is not API-managed in the same call.
- Dunning emails must not fire for free-tier or manually-invoiced clients; filter by `clientStripeId` presence and `collection_method`.

## Effort

**S** (dunning webhook wiring + schema: ~1–2 days) + **S** (self-serve portal route + UI button: ~0.5 day). Combined: **S/M**.

## Open questions

- Which email template/sender to use for dunning notifications — existing Resend templates or a new transactional template?
- Should the portal settings page show invoice history inline (fetched from Stripe) or rely entirely on the hosted portal?
