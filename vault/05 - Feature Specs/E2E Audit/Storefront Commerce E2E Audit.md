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


## Testing


## Blocked


## Passed

- [ ] Storefront product catalog renders for entitled tenant ✓
- [ ] ✓ verified 2026-06-20: product-designer /designs POST+GET lifecycle — sd_design_session cookie minted, productDesigns table written, GET returns session-scoped design list
- [ ] ✓ verified 2026-06-20 — PUT /store/orders/:id updates order status (pending → processing → shipped → delivered) (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /store/orders/:id/note adds internal note to an order (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /store/orders/:id/rates fetches EasyPost live shipping rate quotes for an order (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /store/orders/:id/label purchases EasyPost shipping label and stores label URL + cost (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /store/orders/:id/printful/submit sends order to Printful and records printfulOrderId (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Store BYOK Stripe config: PUT /store/stripe persists encrypted secret key; GET returns masked key and mode (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Tenant isolation: store products and orders of site A are not accessible via portal session scoped to site B (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public storefront customer register → login → JWT session flow (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public storefront cart: add item → update quantity → remove item → cart total reflects correctly (storefront-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Public storefront discount validate: valid code reduces cart total; expired/invalid code returns error (storefront-coverage.spec.ts)
- [x] RESOLVED: product-review moderation + customer-messages staff reply covered via MCP — gap-storefront-coverage.spec.ts

## Gaps Found

- [ ] Storefront checkout golden-path E2E not yet written — see [[Project Board]]
- [ ] No abandoned-cart recovery — see [[Competitive Gap Analysis 2026-06]]
- [ ] No automatic tax calculation — see [[Competitive Gap Analysis 2026-06]]
- [ ] No wallet checkout (Apple Pay / Google Pay) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No E2E coverage for public storefront routes (cart, checkout, customer auth, account) — all existing specs test portal management API only
- [ ] EasyPost label purchase and Printful submit flows have no integration or E2E tests despite being wired routes
- [ ] Magamommy autonomous pipeline (lib/magamommy/) has zero unit/integration/E2E coverage — noted in lib/magamommy/README.md
- [x] RESOLVED: product-designer /designs POST required sessionId in body and wrote legacy designs table — now mints sd_design_session cookie + writes productDesigns table — `app/api/storefront/[siteId]/designs/route.ts`
- [ ] GAP (no implementation): Portal product review moderation: list pending reviews → approve one → reject one — MCP-only (store_reviews_list/moderate in lib/storefront/mcp-sdk-adapter.ts); no portal REST route exists
- [ ] GAP (no implementation): Portal customer messages: list messages → post staff reply → status transitions to replied — MCP-only for staff; only customer-facing storefront routes exist (app/api/storefront/[siteId]/account/support/)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
