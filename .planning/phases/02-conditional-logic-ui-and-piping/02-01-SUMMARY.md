---
phase: 02-conditional-logic-ui-and-piping
plan: 01
subsystem: survey-logic
tags: [tdd, types, evaluator, piping, conditional-logic]
dependency_graph:
  requires: []
  provides: [ShowIfRule, ShowIfCondition types, compound AND evaluator, resolvePiping function]
  affects: [lib/survey-logic.ts, lib/db/schema.ts, components/admin/SurveyBuilder.tsx]
tech_stack:
  added: []
  patterns: [type-guard discriminator, compound-condition evaluation, token substitution]
key_files:
  created: []
  modified:
    - lib/db/schema.ts
    - lib/survey-logic.ts
    - lib/survey-logic.test.ts
    - components/admin/SurveyBuilder.tsx
decisions:
  - "isLegacyRule type guard checks 'fieldId' in AND absence of 'combinator' to discriminate union members"
  - "evaluateRule treats undefined/null as truthy for not_equals operator (absence = not equal to anything)"
  - "resolvePiping returns empty string for unanswered tokens per D-10 decision"
  - "resolvePiping uses regex {([^}]+)} for token matching per D-08 format"
metrics:
  duration: "3 minutes"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 4
---

# Phase 02 Plan 01: Conditional Logic Types and Evaluator Summary

## One-liner

Compound AND condition types (ShowIfRule, ShowIfCondition) added to schema with updated isFieldVisible evaluator supporting equals/not_equals operators and new resolvePiping function for {fieldId} token substitution.

## What Was Built

Extended the survey logic foundation with:

1. **New types in lib/db/schema.ts**: `ShowIfRule` (fieldId + operator + values) and `ShowIfCondition` (combinator: 'AND' + rules array). `SurveyFieldDef.showIf` updated to union type accepting both legacy shape and `ShowIfCondition`.

2. **Updated lib/survey-logic.ts**: `isLegacyRule` type guard for union discrimination, `evaluateRule` for typed operator evaluation, updated `isFieldVisible` handling both shapes via `rules.every()`, and new `resolvePiping` export replacing `{fieldId}` tokens with answer values.

3. **SurveyBuilder.tsx**: Imports `ShowIfRule, ShowIfCondition` from schema and mirrors the updated `showIf` union type on `SurveyField`.

4. **23 tests passing**: 10 original tests (all backward-compat) + 7 compound condition tests + 6 piping resolver tests.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define types and write failing tests (RED) | 08883bbf | lib/db/schema.ts, components/admin/SurveyBuilder.tsx, lib/survey-logic.test.ts |
| 2 | Implement evaluator and resolvePiping (GREEN) | 8bd6c498 | lib/survey-logic.ts |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| isLegacyRule checks both 'fieldId' in AND 'combinator' not in | Satisfies T-02-01 threat: prevents shape confusion even if future shapes add fieldId property |
| undefined/null treated as truthy for not_equals | Absence of answer means "not equal to any value" — logically correct for conditional show |
| Empty string for unanswered piping tokens | D-10 locked decision: blank rendering is less jarring than showing raw {fieldId} token |
| No fields parameter on resolvePiping | Only answers map needed for substitution; field metadata not required |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The XSS mitigation (T-02-04) is handled by React JSX auto-escaping at the call site.

## Self-Check

- [x] lib/db/schema.ts contains `export interface ShowIfRule`
- [x] lib/db/schema.ts contains `export interface ShowIfCondition`
- [x] lib/db/schema.ts SurveyFieldDef.showIf contains `| ShowIfCondition`
- [x] components/admin/SurveyBuilder.tsx imports `ShowIfRule, ShowIfCondition`
- [x] lib/survey-logic.ts exports `resolvePiping`
- [x] lib/survey-logic.ts contains `rules.every(r => evaluateRule(r, answers))`
- [x] 23 tests pass (10 existing + 13 new)
- [x] Commits 08883bbf and 8bd6c498 exist

## Self-Check: PASSED
