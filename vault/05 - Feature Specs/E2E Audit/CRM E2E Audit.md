---
kanban-plugin: board
type: spec
domain: crm
status: active
date: 2026-06-17
sources:
  - lib/db/schema/crm.ts
  - tests/e2e/admin-crm.spec.ts
---

## To Test

- [ ] Two-way email sync with Gmail/Outlook
- [ ] Sequences / email cadences from CRM
- [ ] AI deal assistant (scoring, next-best-action)
- [ ] Signed → onboarded lifecycle flow end-to-end

## Testing


## Blocked


## Passed

- [ ] CRM dashboard renders for entitled tenant ✓ (Phase 2 MCP pass — screenshot audit-03-crm.png)
- [ ] Contact / deal CRUD for entitled tenant ✓
- [ ] Native e-sign + proposals as lifecycle objects ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No two-way email sync — sequences/cadences missing (most-used CRM surface) — see [[Competitive Gap Analysis 2026-06]]
- [ ] No AI deal assistant / forecasting — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
