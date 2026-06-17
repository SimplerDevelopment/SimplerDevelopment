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


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
