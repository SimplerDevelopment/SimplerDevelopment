---
type: adr
domain: billing
status: accepted
date: 2026-07-09
sources:
  - lib/billing/activate-modules.ts
  - app/api/portal/billing/modules/verify-session/route.ts
  - app/api/portal/billing/modules/checkout/route.ts
  - app/api/stripe/webhook/route.ts
  - components/portal/onboarding/steps/StepPayment.tsx
  - app/portal/settings/billing/plans/page.tsx
---

# ADR: Verify-on-return module activation (webhook becomes the backstop)

## Status

Accepted — shipped for OBQA-014 on branch `fix/obqa-014-entitlement-race`.

## Context

Module checkout returned the buyer to a **static** `?checkout=success` URL while only the
`checkout.session.completed` webhook wrote `client_services` rows. The onboarding wizard
advanced on the URL param alone (plus a blind 1.8 s timer), so quick-setup inline actions
403'd until the webhook landed — and on local instances with no webhook forwarder, forever
(OBQA-014, reproduced 100%). Activation logic was also duplicated inline in two webhook
branches plus the Stripe-less bypass, `client_services` has **no unique index on
`(client_id, service_id)`**, and the webhook granted month-one credits unconditionally on
every (re)delivery.

## Decision

1. **Verify on return, webhook as backstop** (standard Stripe guidance): `success_url` now
   carries `session_id={CHECKOUT_SESSION_ID}`; the return surfaces (onboarding StepPayment,
   billing plans page) POST `/api/portal/billing/modules/verify-session`, which retrieves the
   session server-side (`expand: ['subscription']`) and activates immediately. Verify failures
   are non-blocking — the webhook still lands the purchase.
2. **One shared writer**: `activateModuleSubscription()` in `lib/billing/activate-modules.ts`
   is the single activation path for the webhook `module_subscription` branch and the verify
   route. It runs in a transaction holding `pg_advisory_xact_lock(74014, clientId)` — the two
   callers race *by design* now, and without a unique index a bare SELECT-then-INSERT would
   duplicate rows (double Stripe line items at the next reconcile, inflated credit grants).
   A unique index on `(client_id, service_id)` is the DB-enforced upgrade path once legacy
   rows are audited (`notes` column carries manual-grant rows).
3. **Live-subscription replay guard**: a Checkout Session stays `complete` forever, so the
   verify route additionally requires the *expanded subscription* status ∈ {active, trialing}.
   Without this, a cancelled subscriber could replay the `session_id` from browser history to
   restore paid modules for free (found by adversarial review — blocker).
4. **Credit grants keyed to activation transitions**: month-one credits grant when a service
   row is *newly inserted* (always) or *reactivated* outside a 20-day window (cancel→resubscribe
   dedupe, mirroring the `invoice.paid` guard). Replays/redeliveries transition nothing and
   never grant. No pre-stamping inside the transaction: `grantMonthlyCredits` stamps on its own
   success, so a grant that fails after commit self-heals at the next `invoice.paid` instead of
   being silently lost. The `invoice.paid` recency read also got `DESC NULLS LAST` — an
   unstamped admin-assigned row must not mask the latest real grant.

## Consequences

- Entitlements exist before the quick-setup screens render; local no-forwarder instances
  self-heal on return. `scripts/doctor.ts` now warns when `STRIPE_SECRET_KEY` is set without
  `STRIPE_WEBHOOK_SECRET`.
- The webhook's **legacy single-service** `checkout.session.completed` branch still has the old
  unguarded upsert + unconditional grant (pre-existing; verify-session can't cover those
  sessions — `metadata.type` differs). Follow-up candidate, noted on the OBQA-014 card.
- postgres-js pool is `max=1` per process: `grantMonthlyCredits` must stay **outside** the
  helper's transaction or the process deadlocks waiting for a second connection (verified
  empirically during adversarial review; concurrent transactions queue FIFO, no deadlock).

## Related

[[Billing & Stripe]] · [[ADR per-seat-pricing-computed-line-items]] · [[ADR paid-module-entitlement-vs-scope-gating]]
