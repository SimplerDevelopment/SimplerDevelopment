---
phase: 01-foundation-and-schema
plan: 01
subsystem: survey
tags: [survey, bug-fix, transaction, shared-logic, immutability]
dependency_graph:
  requires: []
  provides: [lib/survey-logic.ts, db.transaction in survey submission, field ID guard]
  affects: [app/s/[slug]/page.tsx, app/api/surveys/[slug]/route.ts, components/admin/SurveyBuilder.tsx]
tech_stack:
  added: []
  patterns: [db.transaction for atomic INSERT+UPDATE, Pick<T> for narrow function signatures]
key_files:
  created:
    - simplerdevelopment2026/lib/survey-logic.ts
    - simplerdevelopment2026/lib/survey-logic.test.ts
    - simplerdevelopment2026/tests/unit/survey-builder-field-id.test.ts
  modified:
    - simplerdevelopment2026/app/s/[slug]/page.tsx
    - simplerdevelopment2026/app/api/surveys/[slug]/route.ts
    - simplerdevelopment2026/components/admin/SurveyBuilder.tsx
decisions:
  - "emitEvent kept outside db.transaction to prevent slow automation handlers from holding DB connection open"
  - "Pick<SurveyFieldDef, ...> used instead of full type to future-proof call sites"
  - "Field ID guard uses 'id' in patch check (presence, not value) so even same-value reassignment is blocked"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-05"
  tasks_completed: 2
  files_created: 3
  files_modified: 3
---

# Phase 01 Plan 01: Foundation and Schema Summary

## One-liner

Three foundational survey defects fixed: atomic transaction for response submission, shared pure-TS condition evaluator replacing duplicated inline logic, and field ID immutability guard with 13 passing unit tests.

## What Was Built

**FOUND-01 — Atomic response submission (`app/api/surveys/[slug]/route.ts`)**
Wrapped the INSERT into `surveyResponses` and the UPDATE to `surveys.responseCount` inside a single `db.transaction()` block. Before this fix, concurrent submissions could interleave the two statements and produce a desynchronized count. The `emitEvent()` call was explicitly left outside the transaction to avoid holding the DB connection open if an automation handler is slow. A `KNOWN LIMITATION` comment documents the residual maxResponses gate race (pre-transaction SELECT, not fixable without architectural changes).

**FOUND-02 — Shared condition evaluator (`lib/survey-logic.ts`)**
Created a pure TypeScript file (zero non-type imports) exporting `isFieldVisible`, `getConditionalOptions`, and the `AnswerMap` type. Both functions accept narrow `Pick<SurveyFieldDef, ...>` signatures for forward compatibility. The inline `isFieldVisible` in `app/s/[slug]/page.tsx` was replaced with a one-line delegation to the shared function, preserving the existing single-argument closure signature for callers. 10 unit tests in `lib/survey-logic.test.ts` cover all specified behavior cases.

**FOUND-03 — Field ID immutability guard (`components/admin/SurveyBuilder.tsx`)**
Added a runtime guard at the top of `updateField()` that checks `'id' in patch` and returns early (with a `console.error`) if the patch contains the `id` key. This prevents accidental or intentional ID reassignment that would corrupt analytics for historical responses. 3 unit tests in `tests/unit/survey-builder-field-id.test.ts` verify that label updates succeed, patches with a different ID are blocked, and patches with the same ID value are also blocked.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| emitEvent outside transaction | Slow automation handlers must not hold DB connection; event delivery is best-effort, not transactional |
| Pick<SurveyFieldDef, ...> not full type | Callers only need showIf/conditionalOptions/options shapes; narrow type prevents accidental coupling |
| 'id' in patch (presence check) | Blocks same-value reassignment too — intent is never to allow ID mutation regardless of value |
| KNOWN LIMITATION comment in route.ts | Transparent documentation of residual race; fix requires architectural change (see RESEARCH.md Pitfall 5) |

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

```
Test Files  2 passed (2)
     Tests  13 passed (13)
  Start at  17:49:26
  Duration  1.23s
```

- `lib/survey-logic.test.ts`: 10/10 passed (isFieldVisible x6, getConditionalOptions x4)
- `tests/unit/survey-builder-field-id.test.ts`: 3/3 passed (allow label update, block id change, block same-value id)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 (FOUND-02) | 7194ae82 | feat(01-01): create shared condition evaluator |
| Task 2 (FOUND-01, FOUND-03) | ed87a854 | feat(01-01): transaction wrap and field ID guard |

## Self-Check: PASSED
