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

- [ ] Experiment on rendered CMS block via visual editor — needs spec

## Testing


## Blocked


## Passed

- [ ] AB experiment CRUD for entitled tenant ✓
- [ ] Post lifecycle experiment ✓
- [ ] Deck lifecycle experiment ✓
- [ ] Auto-scoped per tenant ✓
- [ ] ✓ verified 2026-06-20: experiment create + variants + results panel verified (test required publicAccess=true + correct slides route)
- [ ] ✓ verified 2026-06-20 — Per-tenant variant assignment isolation (cov-u38.spec.ts)
- [ ] ✓ verified 2026-06-20 — Dynamic variant add / remove: auto-letter, control-arm protected, min-2-variant guard, blocked while running (cov-u39.spec.ts)
- [ ] ✓ verified 2026-06-20 — Traffic split rebalance ("Rebalance to even") normalises weights to floor(100/N) per arm (cov-u39.spec.ts)
- [ ] ✓ verified 2026-06-20 — PATCH status → archived transitions experiment out of active state (cov-u39.spec.ts)
- [ ] ✓ verified 2026-06-20 — cta_click goal metric with goal_selector: AbGoalTracker fires goal event on matching CSS selector click (cov-u39.spec.ts)
- [ ] ✓ verified 2026-06-20 — form_submit goal metric with goal_selector: goal event fires on matching form submission (cov-u40.spec.ts) — parallel-safe: serial mode added 2026-06-20
- [ ] ✓ verified 2026-06-20 — blockTreeOverride non-null swap: public post SSR serves variant block tree, not control content (cov-u40.spec.ts) — parallel-safe: serial mode added 2026-06-20
- [ ] ✓ verified 2026-06-20 — New Experiment modal on /portal/experiments: picker supports both page and pitch deck target types (cov-u40.spec.ts) — parallel-safe: serial mode added 2026-06-20
- [ ] ✓ verified 2026-06-20 — Significance badge: hourglass shown below MIN_SAMPLE_PER_ARM, green-check shown once both arms ≥ 100 views (cov-u40.spec.ts) — parallel-safe: serial mode added 2026-06-20
- [ ] ✓ verified 2026-06-20 — Cross-tenant access guard: experiment belonging to another client returns 404 (cov-u41.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No sequential / valid-peeking stats — false-positive risk on early peeks — see [[Competitive Gap Analysis 2026-06]]
- [ ] No SRM guardrail — see [[Competitive Gap Analysis 2026-06]]
- [ ] Deck AB public render path not wired: applyAbToDeckSlides is implemented but not called on /sites/:domain/slides/:slug or /pitch-deck/:slug (domain map §Planning Notes) — no E2E possible until render integration is shipped
- [ ] OPEN: experiment-row UI is flaky under load (non-deterministic render timing)
- [ ] GAP (no implementation): Sequential / valid-peeking statistics — needs spec
- [ ] GAP (no implementation): Sample-ratio mismatch (SRM) guardrail — needs spec


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
