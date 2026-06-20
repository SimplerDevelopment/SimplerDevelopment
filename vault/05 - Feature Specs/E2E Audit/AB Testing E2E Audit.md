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
- [ ] Dynamic variant add / remove: auto-letter, control-arm protected, min-2-variant guard, blocked while running
- [ ] Traffic split rebalance ("Rebalance to even") normalises weights to floor(100/N) per arm
- [ ] PATCH status → archived transitions experiment out of active state
- [ ] cta_click goal metric with goal_selector: AbGoalTracker fires goal event on matching CSS selector click
- [ ] form_submit goal metric with goal_selector: goal event fires on matching form submission
- [ ] blockTreeOverride non-null swap: public post SSR serves variant block tree, not control content
- [ ] New Experiment modal on /portal/experiments: picker supports both page and pitch deck target types
- [ ] Significance badge: hourglass shown below MIN_SAMPLE_PER_ARM, green-check shown once both arms ≥ 100 views
- [ ] Cross-tenant access guard: experiment belonging to another client returns 404

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
- [ ] Deck AB public render path not wired: applyAbToDeckSlides is implemented but not called on /sites/:domain/slides/:slug or /pitch-deck/:slug (domain map §Planning Notes) — no E2E possible until render integration is shipped


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
