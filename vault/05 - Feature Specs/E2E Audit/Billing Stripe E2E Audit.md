---
kanban-plugin: board
type: spec
domain: billing-stripe
status: active
date: 2026-06-17
sources:
  - lib/db/schema/billing.ts
---

## To Test

- [ ] Add module to existing subscription — POST /billing/modules/add-item adds SKU to live subscription and returns updated module list — needs spec
- [ ] Cancel module subscription — POST /billing/modules/[id]/cancel marks module inactive and returns 200 — needs spec
- [ ] Admin billing management: set-seats override, comp discount, BYOK override toggle via POST /admin/portal/clients/[id]/billing — needs spec
- [ ] Admin billing-mode switch — PATCH /admin/portal/clients/[id]/billing-mode cycles agency→saas→byok and rejects client role — needs spec
- [ ] Usage thresholds CRUD — GET/POST/PATCH/DELETE /admin/portal/clients/[id]/billing/thresholds; assert warn_at_pct and hard_limit_quantity round-trip correctly — needs spec
- [ ] AI credit purchase via Stripe — POST /credits/purchase returns Stripe Checkout URL (sk_test guard) — needs spec
- [ ] Pay-as-you-go toggle — POST /credits/pay-as-you-go flips flag and is reflected in GET /credits — needs spec
- [ ] BYOK key storage gate — POST /integrations/api-keys with anthropic provider returns 403 for non-byokEligible client — needs spec
- [ ] Volume discount tier reflected in /billing/modules response — seats breakdown includes billable/extra/capCents fields — needs spec
- [ ] Admin subscription cancel/change-plan/refund — POST /admin/portal/subscriptions/[id]/cancel, change-plan, refund each return 200 and reject client role with 401 — needs spec

## Testing


## Blocked


## Passed

- [ ] Billing schema + Stripe test-mode setup ✓
- [ ] Metered usage rollup + AI credit ledger ✓
- [ ] Stripe Connect / BYOK in place ✓
- [ ] ✓ verified 2026-06-20 — Metered usage rollup and billing (usage-rollup-admin.spec.ts)
- [ ] ✓ verified 2026-06-20 — AI credit ledger (portal-credits.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/admin/portal/subscriptions/:id/refund validates invoiceId required and 404 on unknown subscription (cov-u19.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/admin/portal/clients/:id/billing/usage returns liveTotals, dryRun, history structure (cov-u19.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/admin/portal/clients/:id/billing/metered-items lists metered items for a client (cov-u19.spec.ts)
- [ ] ✓ verified 2026-06-20 — PATCH /api/admin/portal/clients/:id/billing/metered-items/:itemId updates local metered item fields (cov-u19.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/admin/portal/subscriptions — admin can list all client subscriptions (cov-u20.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/admin/portal/subscriptions — admin can create a client subscription (cov-u20.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/admin/portal/subscriptions/[id]/cancel — admin cancel subscription returns 409 when no Stripe subscription is linked (cov-u20.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/admin/portal/subscriptions/[id]/invoices — admin can list invoices for a subscription (cov-u20.spec.ts)
- [x] RESOLVED (partial): Stripe webhook signature-validation (400) + 405 guard paths covered — gap-billing-coverage.spec.ts (success branch needs real Stripe)

## Gaps Found

- [ ] No dunning: failed payments silently lost — active revenue leak — see [[Competitive Gap Analysis 2026-06]]
- [ ] No self-serve billing portal (billingPortal.sessions.create not wired) — active revenue leak — see [[Competitive Gap Analysis 2026-06]]
- [ ] Per-seat billing reconciler has zero automated test coverage — no test for countBillableSeats, buildDesiredItems, or recomputeClientSubscription; noted in domain-map planning notes
- [ ] Monthly AI credit re-grant cron is missing — credits granted on activation/renewal webhook only; no scheduled re-grant worker exists (noted in domain-map planning notes)
- [ ] GAP (no implementation): Failed-payment dunning + automatic retry
- [ ] GAP (no implementation): Customer self-serve billing portal (card/invoice/subscription management)
- [ ] GAP (no implementation): Stripe Connect / BYOK flow
- [ ] GAP (no implementation): Module subscription checkout — POST /billing/modules/checkout creates Stripe Checkout session with correct price_data line items (no real Stripe call; guard on sk_test key)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
