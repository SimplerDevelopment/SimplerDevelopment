---
kanban-plugin: board
type: spec
domain: pitch-decks-product-designer
status: active
date: 2026-06-17
sources:
  - lib/db/schema/productDesigner.ts
  - tests/e2e/product-designer-ui.spec.ts
  - tests/e2e/product-designer-api.spec.ts
---

## To Test

- [ ] Viewer analytics on shared deck (view count, time-on-slide)
- [ ] Access control on shared deck link (password / expiry)
- [ ] Draft/live approval gate for deck publish
- [ ] Deck as first-class block sharing brand + media assets

## Testing


## Blocked


## Passed

- [ ] Pitch decks render for entitled tenant ✓ (redirects to /portal/crm/proposals?tab=decks — Phase 2 MCP pass — screenshot audit-04-pitch-decks.png)
- [ ] Draft/live approval gate and brand-shared blocks ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No viewer analytics on shared deck links — see [[Competitive Gap Analysis 2026-06]]
- [ ] No access control (password/expiry) on shared deck links — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
