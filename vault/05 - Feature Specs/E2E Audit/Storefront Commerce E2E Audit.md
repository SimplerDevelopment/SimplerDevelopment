---
kanban-plugin: board
type: spec
domain: storefront-commerce
status: active
date: 2026-06-17
sources:
  - lib/db/schema/store.ts
  - lib/db/schema/catalog.ts
---

## To Test

- [ ] Storefront checkout golden-path (add to cart → payment → confirmation)
- [ ] Abandoned-cart recovery email trigger
- [ ] Automatic tax calculation
- [ ] Wallet checkout (Apple Pay / Google Pay)
- [ ] Printful POD order pipeline
- [ ] PUT /store/orders/:id updates order status (pending → processing → shipped → delivered)
- [ ] POST /store/orders/:id/note adds internal note to an order
- [ ] GET /store/orders/:id/rates fetches EasyPost live shipping rate quotes for an order
- [ ] POST /store/orders/:id/label purchases EasyPost shipping label and stores label URL + cost
- [ ] POST /store/orders/:id/printful/submit sends order to Printful and records printfulOrderId
- [ ] Public storefront customer register → login → JWT session flow
- [ ] Public storefront cart: add item → update quantity → remove item → cart total reflects correctly
- [ ] Public storefront discount validate: valid code reduces cart total; expired/invalid code returns error
- [ ] Public storefront account order history returns orders belonging to authenticated customer only
- [ ] Portal product review moderation: list pending reviews → approve one → reject one
- [ ] Portal customer messages: list messages → post staff reply → status transitions to replied
- [ ] Store BYOK Stripe config: PUT /store/stripe persists encrypted secret key; GET returns masked key and mode
- [ ] Tenant isolation: store products and orders of site A are not accessible via portal session scoped to site B

## Testing


## Blocked


## Passed

- [ ] Storefront product catalog renders for entitled tenant ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Storefront checkout golden-path E2E not yet written — see [[Project Board]]
- [ ] No abandoned-cart recovery — see [[Competitive Gap Analysis 2026-06]]
- [ ] No automatic tax calculation — see [[Competitive Gap Analysis 2026-06]]
- [ ] No wallet checkout (Apple Pay / Google Pay) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No E2E coverage for public storefront routes (cart, checkout, customer auth, account) — all existing specs test portal management API only
- [ ] EasyPost label purchase and Printful submit flows have no integration or E2E tests despite being wired routes
- [ ] `store_product_reviews` and `store_customer_messages` tables have no E2E tests despite MCP tools and portal routes existing
- [ ] Magamommy autonomous pipeline (lib/magamommy/) has zero unit/integration/E2E coverage — noted in lib/magamommy/README.md


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
