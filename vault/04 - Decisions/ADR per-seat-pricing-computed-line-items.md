---
type: adr
domain: billing
status: accepted
date: 2026-06-14
sources:
  - lib/billing/domain-catalog.ts
  - lib/billing/seats.ts
  - lib/billing/subscription-items.ts
  - lib/billing/recompute-subscription.ts
  - app/api/portal/billing/modules/checkout/route.ts
  - app/api/portal/billing/modules/add-item/route.ts
  - app/api/portal/billing/modules/route.ts
  - app/api/portal/invite/accept/route.ts
  - app/api/portal/team/[memberId]/route.ts
  - app/portal/settings/billing/plans/page.tsx
  - components/portal/onboarding/steps/StepChooseModules.tsx
  - scripts/billing/create-seat-product.ts
---

# ADR: Per-seat pricing on top of à-la-carte modules + computed line items replace volume coupons

## Status

Accepted — shipped in commit `feat(billing): per-seat pricing on top of à-la-carte modules` on branch `feat/market-ready-makeover`.

Partially supersedes [[ADR alacarte-volume-discount-replaces-tiers]] — the volume-discount POLICY (thresholds and percentages) is unchanged, but the Stripe MECHANISM changes from a `percent_off` coupon to computed `price_data` line items. `scripts/billing/create-volume-coupons.ts` deleted.

## Context

Two billing gaps existed after the à-la-carte + volume-discount commit (`23a46fb2`):

1. **No seat billing.** A client with 10 accepted team members paid the same module subscription as a solo client. The platform had no way to recover margin on multi-seat accounts; adding team members was free regardless of plan size.

2. **Coupon fragility.** The volume-discount mechanism relied on Stripe coupons (`volume-10` / `volume-20` / `volume-30`) that must be provisioned separately per environment. A missing coupon silently dropped the discount to zero with no error surfaced — a go-live dependency that was easy to miss. Coupons also cannot be embedded in `price_data` line items, making them incompatible with explicit per-line pricing needed for the seat calculation.

Per-seat billing also required knowing the discounted module subtotal M before computing the seat charge, which in turn required the discount to be an explicit value in code rather than a Stripe-side percentage applied after the fact.

## Decision

### Seat billing formula

```
monthly_total = M + (seats − 1) × min(M, $30)
```

Where:
- `M` = post-volume-discount module subtotal in dollars (sum of discounted per-module prices). For bundle clients, M = the flat bundle price.
- `seats` = `countBillableSeats(clientId)` = owner + members whose invite token has been cleared (accepted). Invited-but-not-accepted members do not count.
- `INCLUDED_SEATS = 1` — the owner's seat is always included at no extra charge.
- `SEAT_PRICE_CAP_CENTS = 3000` — each additional seat costs at most $30/mo regardless of how large M grows.
- The seat cap prevents disproportionate charges on large-module, small-team accounts.

### Computed `price_data` line items replace coupons

The volume discount is now applied in code via `discountedModuleCents(modulePrice, count)` in `lib/billing/domain-catalog.ts` (697), not by a Stripe coupon. Each module is sent as an explicit `price_data` line item with its post-discount unit amount. An "Additional seats" line item is appended at `min(M, $30) × (seats − 1)` when extra seats exist.

This approach:
- Eliminates the per-environment coupon provisioning step.
- Makes the discount visible on the Stripe invoice without coupon post-processing.
- Enables the seat charge to reference the computed M value directly.
- Removes a silent failure mode (missing coupon → silently no discount).

### New files

| File | Role |
|---|---|
| `lib/billing/seats.ts` (39) | `countBillableSeats(clientId)`: counts owner + accepted members. |
| `lib/billing/subscription-items.ts` (97) | `buildDesiredItems()`: pure function → array of Stripe `price_data` line items (modules + optional seat line). No Stripe calls; testable in isolation. |
| `lib/billing/recompute-subscription.ts` (198) | `recomputeClientSubscription()`: single Stripe-write reconciler keyed by Stripe Product id. `syncSeatBillingSafe()`: best-effort wrapper for use on member lifecycle paths where billing failure must not block UX. |
| `scripts/billing/create-seat-product.ts` (52) | One-time provisioner for the "Additional seats" Stripe Product. Run once per environment; paste the returned product id into `SEAT_SKU.stripeProductId`. |

### Changed routes

- `app/api/portal/billing/modules/checkout/route.ts` (215): builds `price_data` line items via `buildDesiredItems()`; coupon attachment removed.
- `app/api/portal/billing/modules/add-item/route.ts` (128): updates DB then calls `recomputeClientSubscription()` instead of manually managing line items and coupon sync.
- `app/api/portal/billing/modules/route.ts` (153) GET: response extended with `seats: { billable, included, extra, capCents }` breakdown.
- `app/api/portal/invite/accept/route.ts` (71): calls `syncSeatBillingSafe()` after accepting an invite.
- `app/api/portal/team/[memberId]/route.ts` (114) DELETE: calls `syncSeatBillingSafe()` after removing a member.

### Display

- `app/portal/settings/billing/plans/page.tsx` (635): Team seats card shows current seat count and per-seat cost.
- `components/portal/onboarding/steps/StepChooseModules.tsx` (378): seat note shows per-seat cost at the current module selection.

### Go-live dependency

Run `bunx tsx scripts/billing/create-seat-product.ts` with `STRIPE_SECRET_KEY` set, then paste the returned Stripe Product id into `SEAT_SKU.stripeProductId` in `lib/billing/domain-catalog.ts`. Until this is done, `buildDesiredItems()` omits the seat line and clients are not charged for extra seats. Module billing at the computed (discounted) prices is unaffected.

All Stripe-write paths require staging (Stripe test-mode) verification before live deployment.

## Alternatives considered

### Grossed-up seat price on a coupon

Apply the seat charge by increasing the subscription total via a percentage or fixed-amount coupon rather than a discrete line item. Rejected: Stripe coupons apply to the entire subscription, not to a computed subset of it; they cannot represent a fixed per-seat charge that scales with the seat count. The result would require a custom coupon per account per seat-count change — not idiomatic and not maintainable at scale.

### Flat per-seat price independent of module count

Charge a fixed $N/seat regardless of M. Rejected: this penalizes small-module accounts (a client with one $19 module paying $30/extra seat overpays) and gives away margin on large-module accounts (a client with $200 of modules paying $30/seat underpays relative to their platform value). `min(M, $30)` scales the seat price proportionally up to the cap.

### Seat as a separate Stripe subscription

Manage seat billing on a separate subscription from module billing. Rejected: two subscriptions per client doubles the reconciliation surface, complicates proration, and makes invoice presentation confusing. The single-subscription reconciler (`recomputeClientSubscription`) keyed by Stripe Product id handles all line items in one place.

### Count invited (not yet accepted) members

Include pending-invite members in the seat count so clients cannot delay billing by leaving invites open. Rejected by product decision: billing begins when the seat is used — accepted membership is the appropriate threshold. Pending invites expire; charging for them before acceptance creates chargeback risk.

## Consequences

**What becomes easier:**
- Multi-seat accounts generate incremental margin proportional to their module investment.
- The volume-discount mechanism is fully code-side — no per-environment Stripe coupon provisioning.
- Reconciliation is a single idempotent writer (`recomputeClientSubscription`) keyed by Stripe Product id; safe to call multiple times.
- Member accept and remove events automatically trigger billing reconciliation via `syncSeatBillingSafe()`.

**New invariants / constraints:**
- `SEAT_SKU.stripeProductId` in `lib/billing/domain-catalog.ts` must be populated before the seat line appears on any subscription. Verify this is set in every deployed environment.
- `buildDesiredItems()` is the single definition of what the desired subscription looks like. Any new line-item type must be added here; do not manually construct Stripe items outside this function.
- `recomputeClientSubscription()` reconciles by Stripe Product id. If the same product appears in two desired items, the behavior is undefined — each product must be unique in `buildDesiredItems()`.
- Stripe coupons `volume-10` / `volume-20` / `volume-30` still exist in environments where they were provisioned. They are inert (no subscription should reference them after this commit), but they are not harmful if left in place.

**Test gaps (carried forward):**
- No automated test for `countBillableSeats` with mixed accepted/pending invite states.
- No automated test for `buildDesiredItems` covering the seat-line computation.
- No automated test for `recomputeClientSubscription` (add/update/remove reconciliation).
- Staging verification of all Stripe-write paths is a required manual gate before live deployment.

## Related

- Domain map: [[Billing & Stripe]]
- Supersedes (mechanism only): [[ADR alacarte-volume-discount-replaces-tiers]] — discount policy unchanged, coupon mechanism replaced by computed line items
- Related ADRs: [[ADR per-domain-billing-rides-services-catalog]] · [[ADR byok-inversion-scale-only]]
