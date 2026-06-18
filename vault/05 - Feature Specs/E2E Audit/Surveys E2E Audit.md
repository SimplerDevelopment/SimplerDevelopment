---
kanban-plugin: board
type: spec
domain: surveys
status: active
date: 2026-06-17
sources:
  - lib/db/schema/surveys.ts
---

## To Test

- [ ] In-form payment field (Stripe)
- [ ] In-form e-signature field
- [ ] Route-to-CRM on submit
- [ ] Scoring + conditional logic
- [ ] A/B variant assignment on survey
- [ ] Post-submit sequence trigger

## Testing


## Blocked


## Passed

- [ ] Survey CRUD for entitled tenant ✓
- [ ] Native CRM routing, scoring, A/B ✓ (no Zapier hop required)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No in-form payment field — see [[Competitive Gap Analysis 2026-06]]
- [ ] No in-form e-signature field — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
