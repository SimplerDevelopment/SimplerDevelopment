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

- [ ] Failed-payment dunning + automatic retry
- [ ] Customer self-serve billing portal (card/invoice/subscription management)
- [ ] Metered usage rollup and billing
- [ ] AI credit ledger
- [ ] Stripe Connect / BYOK flow

## Testing


## Blocked


## Passed

- [ ] Billing schema + Stripe test-mode setup ✓
- [ ] Metered usage rollup + AI credit ledger ✓
- [ ] Stripe Connect / BYOK in place ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No dunning: failed payments silently lost — active revenue leak — see [[Competitive Gap Analysis 2026-06]]
- [ ] No self-serve billing portal (billingPortal.sessions.create not wired) — active revenue leak — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
