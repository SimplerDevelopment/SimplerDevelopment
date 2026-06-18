---
type: adr
domain: billing
status: accepted
date: 2026-06-17
sources:
  - lib/billing/seats.ts
  - lib/billing/entitlements.ts
  - lib/billing/recompute-subscription.ts
  - lib/admin/auth.ts
  - lib/admin/fetch-json-safe.ts
  - lib/db/schema/sites.ts
  - app/api/admin/portal/clients/[id]/billing/route.ts
  - app/admin/clients/[id]/plan/page.tsx
  - app/admin/layout.tsx
  - app/admin/error.tsx
  - components/admin/ClientBillingSummary.tsx
  - components/admin/AdminShellClient.tsx
  - scripts/migrations/admin-billing-overrides.sql
---

# ADR: Admin billing overrides, comp coupon, and RSC auth shell

## Status

Accepted — shipped across commits `5e16d37b` (C1+C2 overrides), `3d56ba3f` (C7 auth shell), `543d5f70` (C9 AdminNav delete), `97ab20f5` (C3 admin billing API), `b5b8ba0b` (C4 Billing & Plan UI), `dc7f3769` (C5+C6 category maps + client-detail summary), `5c678848` (C8 resilience) on branch `feat/market-ready-makeover`. Staging validation still pending.

Partially extends [[ADR per-seat-pricing-computed-line-items]] — the same reconciler (`recomputeClientSubscription`) now also manages the comp coupon, but the volume-discount mechanism (computed `price_data` line items) is unchanged.

## Context

The ~5-week market-ready makeover rewrote the client portal and billing model: à-la-carte per-domain modules, volume discount baked into computed Stripe `price_data` line items, per-seat pricing via `lib/billing/seats.ts`, and `billingMode` axis on `clients`. The admin panel (`app/admin/**`) was not updated in parallel. After the makeover:

- Admin had no way to see which modules a client subscribed to, what their MRR was, or what their seat count was.
- Admin had no way to grant comp discounts, override seat counts, or grant BYOK eligibility (all three being common sales/support operations).
- `app/admin/layout.tsx` was a client component — unauthenticated requests received the full admin shell before any server-side auth check, requiring a client round-trip to bounce.
- `app/admin/clients/[id]/plan/page.tsx` was a thin mode-switcher, not a management surface.
- There was no global error boundary for the admin panel — a single 500 produced an infinite spinner.
- `components/admin/AdminNav.tsx` was dead code after the sidebar consolidation.

This ADR records the 10 design decisions made in the spec interview (2026-06-16) that together constitute the Admin Billing Parity feature (v1). See [[Admin Billing Parity — Full Management]] for the full spec.

## Decisions

### 1. Operational visibility is the spine; security and cleanup are folded in opportunistically

The primary driver is that admin staff cannot currently see or manage a client's billing state in the new model. Security hardening (RSC auth shell) and dead-code cleanup (AdminNav) are cheap enough to ship in the same window, but they are not the reason for the feature. Cosmetic/design refresh of the admin panel and blanket fetch-error hardening of all ~20 admin pages are explicitly deferred.

### 2. Full management scope — not read-only

Admin can manage a client's à-la-carte plan, seats, and comps equivalently to the portal self-serve surface. Read-only was considered and rejected: the immediate operational need is to support sales conversations and resolve billing disputes without requiring a client to self-serve.

### 3. Single-writer architecture — reuse `recomputeClientSubscription`

Every admin write path (add/remove module, set bundle, set seats, set comp, set BYOK override) follows the same pattern: mutate `clientServices` / `clients` → call `recomputeClientSubscription` from `lib/billing/recompute-subscription.ts` (253) → return updated state. Admin is a rich UI over existing billing logic; it must never duplicate Stripe-mutation logic.

This is the same invariant as [[ADR per-seat-pricing-computed-line-items]] and [[ADR per-domain-billing-rides-services-catalog]]: one reconciler, one place where Stripe state is written.

### 4. Seat override: nullable column wins over derived count

Add `clients.billable_seats_override` (nullable integer). When non-null, `countBillableSeats` in `lib/billing/seats.ts` (58) returns the override directly instead of deriving from accepted-member counts. When null, behavior is unchanged — the system continues to derive the count from accepted invites.

`deriveBillableSeats` is exposed as a separate read-only function so the "Billing & Plan" UI can display both the raw derived count and the current override side-by-side.

Flat override was chosen over a per-client additive delta: a delta requires tracking the base and the adjustment separately, making the displayed "billed seats" harder to reason about. A flat override is unambiguous: you set it to the number you want billed, period.

### 5. Comp via `comp-<percent>` Stripe `percent_off` coupon — the ONE sanctioned coupon

Full comp for agency clients already exists via `billingMode='agency'`. For partial comp, add `clients.comp_discount_percent` (nullable integer, 0–100). When non-null, `recomputeClientSubscription` applies a Stripe `percent_off` coupon named `comp-<percent>` (e.g. `comp-25`, `comp-100`) at the Stripe customer level before reconciling line items. When null, the coupon is removed.

This is the **only sanctioned coupon mechanism** in the codebase. The volume-discount mechanism (from [[ADR per-seat-pricing-computed-line-items]]) uses computed `price_data` line item amounts, not a Stripe coupon. The two mechanisms are distinct Stripe concepts and coexist without collision:
- The comp coupon is customer-level (`stripe.customers.update({ coupon: ... })`), applied after all line item totals are computed.
- The volume discount is line-item-level (each module's `price_data.unit_amount` is already discounted before it reaches Stripe).

Per-module comp (free a specific module while billing others at full rate) and flat negotiated-price overrides are deferred to v2.

The previous `volume-10` / `volume-20` / `volume-30` coupons, deleted in [[ADR per-seat-pricing-computed-line-items]], are inert. The new `comp-<percent>` coupon is a separate, narrower-scoped mechanism.

### 6. BYOK override: nullable bool OR'd into derived eligibility

Add `clients.byok_eligible_override` (nullable boolean). `getClientEntitlements` in `lib/billing/entitlements.ts` (108) computes `byokEligible = derivedByok || byokEligibleOverride ?? false`. This is the admin/sales grant switch for the BYOK contact-sales flow established in [[ADR byok-inversion-scale-only]]: a client that does not hold a bundle or legacy subscription can be granted BYOK eligibility by admin override without changing their billing mode.

### 7. UI placement: expand plan page; billing tab becomes read-only summary

`app/admin/clients/[id]/plan/page.tsx` (723) becomes the full "Billing & Plan" management surface (active modules, seat panel, comp %, bundle swap, BYOK toggle, MRR breakdown). The client-detail billing tab at `app/admin/clients/[id]/page.tsx` (1326) mounts a new `components/admin/ClientBillingSummary.tsx` (153) that shows a read-only summary and deep-links to the plan page for management.

This keeps the management surface at a dedicated URL and avoids embedding a complex stateful form inside the tabbed client-detail page.

### 8. RSC admin auth shell mirrors PortalShell

`app/admin/layout.tsx` (49) converted from a client component to an RSC server component. It calls `requireStaffSession()` from `lib/admin/auth.ts` (14) and redirects unauthenticated requests to `/admin/login` before any client code is sent. The existing admin chrome moves into `components/admin/AdminShellClient.tsx` (49) with `"use client"` — mirroring the `app/portal/PortalShell.tsx` split pattern. This eliminates the unauthenticated-request → client shell → redirect round-trip.

Middleware stamps `x-pathname` on request headers so the login page can construct a post-login redirect target without accessing `headers()` in a client component.

### 9. Targeted resilience, not blanket sweep

A global `app/admin/error.tsx` (53) Next.js error boundary covers all admin routes. `lib/admin/fetch-json-safe.ts` (30) is a throw-safe fetch + typed JSON parse helper applied to the pages touched in this feature plus the 2–3 worst-offender pages (dashboard, portal-service-requests). All other admin pages are left unchanged — a blanket sweep of ~20 pages is explicitly deferred.

### 10. Migration: hand-applied SQL due to meta-snapshot drift

`bun run db:generate` was blocked by a pre-existing Drizzle meta-snapshot drift at implementation time. The three new `clients` nullable columns ship via `scripts/migrations/admin-billing-overrides.sql` (13 lines) — a hand-authored additive migration. The Drizzle schema in `lib/db/schema/sites.ts` (461) reflects the columns; Drizzle's migration history does not.

This is the same pattern as `scripts/billing/001_domain_saas_billing.sql` documented in [[ADR schema-constraints-hand-sql-only]]. The migration must be hand-applied to staging and production before the override features are active.

## Alternatives considered

### Per-module comp instead of a flat percent

Apply comp at the module line-item level so individual modules can be discounted differently. Rejected for v1: the Stripe `price_data` mechanism means each module's unit amount is already computed in code — per-module override is achievable, but it requires a more complex data model (a `client_module_overrides` table keyed by `(clientId, slug)`) and more UI surface. Deferred to v2 alongside flat negotiated-price override.

### Stripe customer balance / credits instead of percent_off coupon

Credit the client's Stripe balance rather than applying a coupon. Rejected: a balance credit is consumed by the next invoice and is not recurring — staff would need to re-apply it monthly. A `percent_off` coupon is persistent on the customer and survives recomputation.

### Separate admin Stripe-write layer

Create a new reconciler variant for admin that bypasses the portal reconciler. Rejected: duplicating Stripe-write logic is the root cause of the prior admin inconsistency. Reusing `recomputeClientSubscription` is the invariant.

### Admin-managed separate Stripe subscription per client

Let admin create and manage a separate subscription for comp/override pricing. Rejected: multiple subscriptions per client was already rejected in [[ADR per-seat-pricing-computed-line-items]] for the same reasons — doubled reconciliation surface, complicated proration, confusing invoice presentation.

## Consequences

**What becomes easier:**
- Admin staff can grant partial comp, seat overrides, and BYOK eligibility to any client without requiring the client to self-serve or an engineer to run a DB update.
- Override fields ripple automatically through the portal: `byokEligible` in the portal reflects the admin override; seat counts in the portal billing page reflect the seat override; comp % is visible as a discount on the Stripe invoice preview.
- Unauthenticated admin requests are bounced server-side before any client shell is sent — no client round-trip needed.
- A 500 on any admin page shows a friendly retry UI instead of an infinite spinner.

**New invariants / constraints:**
- `comp-<percent>` is the only sanctioned Stripe coupon in the platform. Any future coupon mechanism must be reviewed against this invariant to avoid collision.
- `recomputeClientSubscription` is now responsible for both line-item reconciliation and comp coupon apply/clear. The order of operations (apply coupon, then reconcile line items) must be preserved.
- `scripts/migrations/admin-billing-overrides.sql` must be hand-applied to staging and production. Until applied, the three override columns do not exist and the admin billing API will fail on any write that touches them.
- The test-infra gotcha from `billing_mode` applies here: after hand-applying the migration, verify the integration test template heals correctly via `drizzle-kit push` before running integration tests.

**Pending (staging validation):**
- `/admin/login` smoke-test on the dev server confirming the RSC redirect works.
- Override, comp, and module POST paths verified in Stripe TEST mode on staging.
- `bun test:tenancy` run after the new `clientId`-keyed override fields are applied to staging schema.
- Hand-apply `scripts/migrations/admin-billing-overrides.sql` to staging and production.

**Test gaps (carried forward):**
- No automated test for seat override short-circuit in `countBillableSeats`.
- No automated test for comp coupon apply/clear in `recomputeClientSubscription`.
- No automated test for `byokEligibleOverride` OR in `getClientEntitlements`.
- Integration tests for the C3 API routes are not yet written.

## Related

- Spec: [[Admin Billing Parity — Full Management]]
- Domain map: [[Billing & Stripe]]
- Extends: [[ADR per-seat-pricing-computed-line-items]] (same reconciler, now also manages comp coupon)
- Prior coupon decision: [[ADR alacarte-volume-discount-replaces-tiers]] (volume-discount coupon replaced by computed line items; the new comp coupon is a separate, narrower mechanism)
- BYOK eligibility: [[ADR byok-inversion-scale-only]]
- Hand-SQL pattern: [[ADR schema-constraints-hand-sql-only]]
- Single reconciler invariant: [[ADR per-domain-billing-rides-services-catalog]]
