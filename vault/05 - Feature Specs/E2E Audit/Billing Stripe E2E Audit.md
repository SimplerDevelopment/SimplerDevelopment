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
- [x] RESOLVED 2026-06-21 (verify-sweep): failed-payment dunning IS handled — invoice.payment_failed in app/api/stripe/webhook/route.ts emails the client a fix-card link + logs (lib/billing/dunning-emails.ts); Stripe Smart Retries do the retry. Covered by cov-u18 + email-events specs. The "silently lost" card was stale.
- [x] RESOLVED 2026-06-21 (verify-sweep): self-serve billing portal IS wired — app/api/portal/billing/customer-portal/route.ts (billingPortal.sessions.create + lazy Stripe-customer + graceful 502), surfaced at app/portal/settings/billing/page.tsx.
- [x] RESOLVED 2026-06-21 (verify-sweep): module subscription checkout implemented — app/api/portal/billing/modules/checkout/route.ts.

## Gaps Found

- [ ] Per-seat billing reconciler has zero automated test coverage — no test for countBillableSeats, buildDesiredItems, or recomputeClientSubscription; noted in domain-map planning notes
- [ ] Monthly AI credit re-grant: no dedicated cron worker — but invoice.paid (billing_reason=subscription_cycle) re-grants the monthly credit on renewal in app/api/stripe/webhook/route.ts `[verify-sweep 2026-06-21: re-grant happens on renewal webhook, not a cron]`
- [ ] GAP: Stripe Connect flow (BYOK is in progress — see Project Board → Validating → Per-Domain SaaS Billing & BYOK)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
