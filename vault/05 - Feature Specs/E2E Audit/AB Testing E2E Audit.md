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

- [ ] Sequential / valid-peeking statistics — needs spec
- [ ] Sample-ratio mismatch (SRM) guardrail — needs spec
- [ ] Experiment on rendered CMS block via visual editor — needs spec
- [ ] Per-tenant variant assignment isolation — needs spec
- [ ] Dynamic variant add / remove: auto-letter, control-arm protected, min-2-variant guard, blocked while running — needs spec
- [ ] Traffic split rebalance ("Rebalance to even") normalises weights to floor(100/N) per arm — needs spec
- [ ] PATCH status → archived transitions experiment out of active state — needs spec
- [ ] cta_click goal metric with goal_selector: AbGoalTracker fires goal event on matching CSS selector click — needs spec
- [ ] form_submit goal metric with goal_selector: goal event fires on matching form submission — needs spec
- [ ] blockTreeOverride non-null swap: public post SSR serves variant block tree, not control content — needs spec
- [ ] New Experiment modal on /portal/experiments: picker supports both page and pitch deck target types — needs spec
- [ ] Significance badge: hourglass shown below MIN_SAMPLE_PER_ARM, green-check shown once both arms ≥ 100 views — needs spec
- [ ] Cross-tenant access guard: experiment belonging to another client returns 404 — needs spec

## Testing


## Blocked


## Passed

- [ ] AB experiment CRUD for entitled tenant ✓
- [ ] Post lifecycle experiment ✓
- [ ] Deck lifecycle experiment ✓
- [ ] Auto-scoped per tenant ✓
- [ ] ✓ verified 2026-06-20: experiment create + variants + results panel verified (test required publicAccess=true + correct slides route)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No sequential / valid-peeking stats — false-positive risk on early peeks — see [[Competitive Gap Analysis 2026-06]]
- [ ] No SRM guardrail — see [[Competitive Gap Analysis 2026-06]]
- [ ] Deck AB public render path not wired: applyAbToDeckSlides is implemented but not called on /sites/:domain/slides/:slug or /pitch-deck/:slug (domain map §Planning Notes) — no E2E possible until render integration is shipped
- [ ] OPEN: experiment-row UI is flaky under load (non-deterministic render timing)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
