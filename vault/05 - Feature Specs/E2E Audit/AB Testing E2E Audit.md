---
kanban-plugin: board
type: spec
domain: ab-testing
status: active
date: 2026-06-17
sources:
  - lib/db/schema/ab.ts
  - tests/e2e/ab-experiment.spec.ts
  - tests/e2e/ab-experiment-post-lifecycle.spec.ts
  - tests/e2e/ab-experiment-deck-lifecycle.spec.ts
---

## To Test

- [ ] Sequential / valid-peeking statistics
- [ ] Sample-ratio mismatch (SRM) guardrail
- [ ] Experiment on rendered CMS block via visual editor
- [ ] Per-tenant variant assignment isolation

## Testing


## Blocked


## Passed

- [ ] AB experiment CRUD for entitled tenant ✓
- [ ] Post lifecycle experiment ✓
- [ ] Deck lifecycle experiment ✓
- [ ] Auto-scoped per tenant ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No sequential / valid-peeking stats — false-positive risk on early peeks — see [[Competitive Gap Analysis 2026-06]]
- [ ] No SRM guardrail — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
