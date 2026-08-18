---
type: adr
domain: billing
status: accepted
date: 2026-06-13
sources:
  - lib/billing/domain-catalog.ts
  - lib/billing/entitlements.ts
  - app/api/stripe/webhook/route.ts
  - app/api/portal/services/nav/route.ts
  - scripts/create-tier-stripe-products.ts
  - scripts/seed-tiers.ts
  - scripts/seed-pricing-tiers.ts
---

# ADR: Pricing tiers are first-class Stripe products (one product/price per tier)

## Status

Partially superseded — 2026-06-14 by [[ADR alacarte-volume-discount-replaces-tiers]]. The tier Stripe products/prices and their `services` rows remain valid for existing tier subscribers; entitlement resolution is unchanged. What was removed: the tier selection UI in onboarding and on the plans page. The tier data model (`TIERS`, `getTierByCategory()`) and the load-bearing entitlement contract below are still active for legacy clients.

## Context

The onboarding wizard's "Pick your tools" step presents three headline tiers — Starter ($19/seat/mo), Growth ($59), Scale ($119) — defined in `lib/billing/domain-catalog.ts` (562) as `TIERS` with slugs `plan-starter` / `plan-growth` / `plan-scale`.

A QA pass found the tier cards' checkout was non-functional: clicking "Choose Growth" POSTed `plan-growth` to `/api/portal/billing/modules/checkout`, which returned 400 because no `services` row existed for that slug and `TIERS` had no `stripePriceId`. The à-la-carte `FEATURE_DOMAINS` and the all-in bundle already had real Stripe price IDs and worked; tiers did not.

The open question was: how should a tier — one advertised price that grants many module domains — map to Stripe?

## Decision

Each tier is its own Stripe Product with a single monthly recurring Price. It is represented in the `services` table as a row where `slug === category === plan-{key}` (e.g. `plan-growth`). Checkout creates a single-line-item subscription against that one tier price, using the existing `/api/portal/billing/modules/checkout` route with no code changes.

## Consequences

- New scripts required before go-live (Stripe credentials, not code changes):
  1. `scripts/create-tier-stripe-products.ts` — creates or reuses (via `lookup_key`) 3 Stripe Products + Prices, refuses live keys, prints the 3 IDs to paste into the `TIERS` entries in `lib/billing/domain-catalog.ts` (562).
  2. `scripts/seed-tiers.ts` — seeds the `plan-*` rows into `services` from the catalog (`category = slug`), backfilling `stripePriceId`.
- `app/api/portal/services/nav/route.ts` (69) now excludes `plan-*` categories so tier service rows do not appear as à-la-carte "request a service" nav items.
- `scripts/seed-pricing-tiers.ts` is superseded — it seeds different slugs (`tier-starter`) at different prices ($99) from an older pricing model. Do not run it for the current tiers.
- The entitlement resolver, webhook, and checkout route required **no code changes** — the tier service row is handled generically by the existing paths (see load-bearing contract below).
- Verified without Stripe credentials: a simulated active `plan-growth` `clientServices` row unlocked exactly Growth's 8 domains in the portal sidebar while non-Growth domains stayed locked.

### Load-bearing contract

`getClientEntitlements` in `lib/billing/entitlements.ts` (101), around lines 82–85, grants a tier's entire curated domain set (and `byokEligible` for Scale) from a single active `clientServices` row by calling `getTierByCategory(category)` + `tierDomainKeys(tier)` when the joined `services.category` equals a tier slug.

The Stripe webhook `app/api/stripe/webhook/route.ts` (426), in the `module_subscription` branch (~lines 296–356), upserts the `clientServices` row generically for any `serviceId` in checkout session metadata. A tier service ID flows through this path with no special handling — it already works.

## Alternatives considered

- **Map a tier to the set of its module price IDs (multi-line subscription).** Rejected. The tier's advertised price is a discounted bundle — Growth is $59 but its 8 constituent modules sum to ~$183. Reconstructing the tier from module prices would massively overcharge. Tiers need their own price.
- **Reuse the all-in bundle price.** Rejected. The bundle is $159 and grants every domain; tiers are $19/$59/$119 with curated domain subsets. They are different SKUs.

## Related

- Domain map: [[Billing & Stripe]]
- Related ADRs: [[ADR per-domain-billing-rides-services-catalog]] · [[ADR byok-inversion-scale-only]]
- Supersedes (data only): `scripts/seed-pricing-tiers.ts` (old slug/price model)
