---
type: adr
domain: billing
status: accepted
date: 2026-06-14
sources:
  - lib/billing/domain-catalog.ts
  - app/api/portal/billing/modules/checkout/route.ts
  - app/api/portal/billing/modules/add-item/route.ts
  - components/portal/onboarding/steps/StepChooseModules.tsx
  - components/portal/onboarding/steps/StepPayment.tsx
  - app/portal/settings/billing/plans/page.tsx
  - components/portal/billing/TierPlans.tsx
---

# ADR: À-la-carte module pricing + volume discounts replace the public 3-tier UI

## Status

Accepted — shipped in commit `23a46fb2` on branch `feat/market-ready-makeover`.

Partially supersedes [[ADR byok-inversion-scale-only]] (see BYOK section below).
Partially supersedes [[ADR tiers-are-first-class-stripe-products]] (tier UI surfaces removed; tier data model retained for existing subscribers — see Consequences).

**Mechanism note (2026-06-14):** The volume-discount POLICY defined here (4→10% / 8→20% / 12→30%) is unchanged and remains in force. The Stripe MECHANISM has changed: the percent_off coupon approach (`volume-10` / `volume-20` / `volume-30`) was replaced by explicit computed `price_data` line items in the per-seat pricing commit. `scripts/billing/create-volume-coupons.ts` was deleted; existing coupons in Stripe environments are inert. The discount is now baked into each module's `price_data.unit_amount` at checkout and reconciliation time via `discountedModuleCents()` in `lib/billing/domain-catalog.ts` (697). See [[ADR per-seat-pricing-computed-line-items]].

## Context

The platform previously advertised three headline tiers to new sign-ups: Starter ($19/seat/mo), Growth ($59), and Scale ($119). The tier cards were the primary conversion surface in onboarding (`components/portal/onboarding/steps/StepChooseModules.tsx` (374)) and on the in-app plans page (`app/portal/settings/billing/plans/page.tsx` (587)).

Two problems motivated the change:

1. **Conversion friction.** A forced tier choice early in onboarding asked new clients to predict which curated module bundle fit them before they had used the product. Clients who later wanted a module outside their tier had no obvious upgrade path except to contact support.

2. **Revenue ceiling.** A client on the $119 Scale tier with 8 active modules paid less per module than a client who hand-picked those 8 modules à la carte, capping ARPU. Pure à la carte removes the ceiling: a client who wants 10 modules pays for 10 modules.

The 12-module catalog sums to $261/mo at individual module prices. The existing "SimplerDev Complete" bundle at $159/mo flat (~39% off) already provided a compelling all-in option. Between "one module" and "all 12," the tier model created an awkward middle ground.

## Decision

Drop the public tier selection UI and replace it with pure à-la-carte module picking plus a volume discount ladder that rewards breadth:

| Module count | Discount |
|---|---|
| 4 – 7 | 10% off the entire module subscription |
| 8 – 11 | 20% off |
| 12+ | 30% off |

Discount is applied server-side as a Stripe coupon (`percent_off`, `duration: forever`) attached to the client's module subscription. Coupon IDs are deterministic: `volume-10`, `volume-20`, `volume-30`. The coupon is attached at checkout and re-synced whenever the module count crosses a threshold.

**Key implementation points:**

- `lib/billing/domain-catalog.ts` (617) defines `VOLUME_TIERS` (the threshold/percent table), `volumeTierFor(count)`, `nextVolumeTier(count)`, and `applyVolumeDiscount(subtotal, count)`.
- `app/api/portal/billing/modules/checkout/route.ts` (211) attaches the coupon by module count at checkout session creation. If the coupon does not exist in Stripe yet, checkout falls back silently to full price (no error surfaced to the client).
- `app/api/portal/billing/modules/add-item/route.ts` (175) re-syncs the subscription's coupon after each module add, and clears it on a bundle swap (the bundle carries its own embedded discount).
- Coupons must be provisioned before any deployed environment can apply discounts: `bunx tsx scripts/billing/create-volume-coupons.ts` (65) with `STRIPE_SECRET_KEY` set. This is a **go-live dependency** — discount does not apply until coupons exist; checkout does not error if they are missing.
- The plans page (`app/portal/settings/billing/plans/page.tsx` (587)) and both onboarding steps (`StepChooseModules.tsx` (374), `StepPayment.tsx` (227)) now render a volume-discount progress strip showing the client's current tier and next threshold.
- Repeat-subscribes on the plans page now route through `add-item` (with a Checkout fallback for a client's first purchase), so all modules share ONE subscription and the coupon re-syncs correctly across additions.

**Bundle retained:** "SimplerDev Complete" ($159/mo flat, grants all 12 domains) is kept as a one-click select-all. It is not volume-discounted — its flat price already embeds a ~39% discount vs the $261 sum of parts. Volume coupons are cleared on a bundle swap to avoid double-discounting.

**BYOK is now contact-sales.** With tiers removed, the former Scale-only BYOK unlock has no tier anchor. BYOK ("bring your own AI key") is no longer a self-serve price point. Both the onboarding wizard and the plans page now render a "Contact sales" card (mailto:info@danielpcoyle.com) in place of the BYOK toggle/upgrade prompt. This supersedes the BYOK-inversion ADR's conclusion that BYOK was a Scale-tier unlock — the tier concept no longer exists in the self-serve UI. The three-layer enforcement in code (storage gate, inference gate, UI gate) remains intact; `byokEligible` still resolves correctly for existing agency-mode, bundle, and legacy subscription clients. See [[ADR byok-inversion-scale-only]].

## Consequences

**What becomes easier:**
- Clients subscribe to exactly the modules they want; no tier forces over- or under-buying.
- ARPU grows with breadth: a 10-module client pays more under à la carte + 20% off than they would under any single tier.
- Volume discount thresholds are reachable across the full catalog (4/8/12 map cleanly onto the 12-module catalog), and "all 12 with discount" ($261 × 0.70 = $183) remains above the bundle price ($159), preserving the bundle upsell.
- The plans page and onboarding wizard are simpler — no tier-selection step.

**New invariants / constraints:**
- Stripe coupons `volume-10`, `volume-20`, `volume-30` must exist in every deployed Stripe environment (test and live) before discounts apply. Run `bunx tsx scripts/billing/create-volume-coupons.ts` per environment.
- `add-item` is now the canonical path for adding a module to an existing subscription. Checkout is used for a client's very first module purchase only.
- A bundle swap clears the volume coupon on the subscription; the bundle's flat price must not be combined with a percentage coupon.

**What does NOT change (backward-compat):**
- `TIERS` array and `getTierByCategory()` remain in `lib/billing/domain-catalog.ts` (617) for existing tier subscribers — entitlement resolution for `plan-starter` / `plan-growth` / `plan-scale` `clientServices` rows is unchanged.
- `components/portal/billing/TierPlans.tsx` (117) is now unused dead code. It was not removed (no risk, no urgency), but should be deleted in a future cleanup pass.
- `ADR tiers-are-first-class-stripe-products` is partially superseded: the tier Stripe products/prices and their `services` rows remain valid for any client who subscribed under the old model. The tier UI surfaces (onboarding card picker, plans-page tier columns) are what was removed.
- BYOK enforcement layers (storage, inference, UI) in code are unchanged. The behavioral change is limited to self-serve UI — the contact-sales path replaces the upgrade-to-Scale prompt for new clients.

**Test gap carried forward:**
- No automated test asserts the coupon attachment logic in checkout or add-item routes.
- No automated test asserts the `nextVolumeTier` progress-strip rendering.

## Alternatives considered

- **Flat bundle only (remove à-la-carte entirely).** Rejected. Clients with narrow needs ($159 is a high ask for one module) would churn rather than pay for a bundle they do not use. À-la-carte entry + volume incentive scales better across client sizes.
- **Keep tiers, add volume discounts on top.** Rejected. Stacking two discount models (tier + volume) creates overlap confusion ("am I a Growth client or a 6-module client?"). The tier model also required a separate tier Stripe product per tier (per [[ADR tiers-are-first-class-stripe-products]]), adding provisioning overhead.
- **Dynamic single line-item (priced at the discounted sum).** Rejected. Updating a single subscription line item price on every module add creates custom Price objects or price overrides in Stripe, which are not reusable and break standard Stripe reporting. Stripe coupons are the idiomatic mechanism for subscription-wide percentage discounts.
- **Keep BYOK as a paid add-on module.** Considered but rejected. BYOK is infrastructure-level access, not a user-visible feature module with its own onboarding segment. Moving it to contact-sales lets pricing and provisioning be handled per-client rather than self-serve, which is appropriate given key validation complexity.

## Related

- Domain map: [[Billing & Stripe]]
- Related ADRs: [[ADR byok-inversion-scale-only]] (partially superseded — BYOK moves to contact-sales) · [[ADR tiers-are-first-class-stripe-products]] (partially superseded — tier UI removed, data retained) · [[ADR per-domain-billing-rides-services-catalog]]
- Commit: `23a46fb2` (branch `feat/market-ready-makeover`)
