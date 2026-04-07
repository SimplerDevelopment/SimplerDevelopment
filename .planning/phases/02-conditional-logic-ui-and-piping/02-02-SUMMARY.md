---
phase: 02-conditional-logic-ui-and-piping
plan: 02
subsystem: survey-builder-ui
tags: [conditional-logic, piping, survey-builder, ui, react]
dependency_graph:
  requires: [02-01]
  provides: [ConditionalLogicPanel component, SurveyBuilder conditional integration, piping token substitution in public form]
  affects: [components/admin/ConditionalLogicPanel.tsx, components/admin/SurveyBuilder.tsx, app/s/[slug]/page.tsx]
tech_stack:
  added: []
  patterns: [controlled-component rule state, union-type parsing, token-substitution rendering]
key_files:
  created:
    - components/admin/ConditionalLogicPanel.tsx
  modified:
    - components/admin/SurveyBuilder.tsx
    - app/s/[slug]/page.tsx
decisions:
  - "Always write compound shape { combinator: 'AND', rules: [...] } for new rules (D-05)"
  - "Field selector in ConditionalLogicPanel pre-filtered by parent to fields.indexOf(f) < fields.indexOf(field) (D-03)"
  - "Piping applied via React JSX — no dangerouslySetInnerHTML — XSS mitigated by React auto-escaping (T-02-05)"
  - "previewAnswers state cleared on field delete to prevent stale visibility evaluation (T-02-07)"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 3
---

# Phase 02 Plan 02: Conditional Logic UI and Piping Summary

## One-liner

ConditionalLogicPanel added to SurveyBuilder with 4 operators, multi-value input, badge/opacity indicators, and piping token substitution wired into the public survey form.

## What Was Built

1. **ConditionalLogicPanel.tsx (NEW)**: Visual rule builder for showIf conditions with 3 states (no condition, single rule, compound AND rules). Supports 4 operators — Is, Is not, Is one of, Is not one of (D-02). Multi-value input: checkboxes for choice-type fields (select/radio/checkbox), comma-separated text for free-text fields. Legacy showIf shape parsed on mount for backward compatibility. Always writes compound `{ combinator: 'AND', rules: [...] }` shape (D-05). Unlimited rules (D-06), each removable with remove_circle_outline icon. No OR toggle per D-05.

2. **SurveyBuilder.tsx (MODIFIED)**:
   - Imports and renders `<ConditionalLogicPanel>` after Required toggle in expanded field editor
   - `previewAnswers` state added; cleared on field delete (T-02-07 mitigation)
   - Field ID display in expanded editor header (`font-mono`) for piping token discovery
   - Piping hint paragraph below label input when `{...}` tokens detected (D-12)
   - Conditional badge: `visibility` Material Icon with tooltip showing rule count (D-04)
   - `opacity-60` on collapsed field row container for conditional fields (D-11)
   - `allFields` prop filters to fields before current field by index (D-03)

3. **app/s/[slug]/page.tsx (MODIFIED)**:
   - Added `resolvePiping` to import from `@/lib/survey-logic`
   - Applied to heading label (`<h3>`), question label (`<label>` text), and helpText `<p>`
   - All three call sites use JSX `{resolvePiping(...)}` — no dangerouslySetInnerHTML (T-02-05)

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create ConditionalLogicPanel component | d964b71b | components/admin/ConditionalLogicPanel.tsx |
| 2 | Wire ConditionalLogicPanel into SurveyBuilder + piping in public form | c79527d7 | components/admin/SurveyBuilder.tsx, app/s/[slug]/page.tsx |
| 3 | Human verification checkpoint | PENDING | — |

## Checkpoint Pending

Task 3 is a `checkpoint:human-verify` gate. Visual and functional verification of the complete conditional logic UI and piping system is required before this plan is marked complete.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Always write compound shape on new rules | Avoids branching in writer path; evaluator's backward-compat path handles old simple-shape data |
| Parent pre-filters allFields by index position | Cleanest separation: SurveyBuilder owns field ordering; panel has no access to full list |
| React JSX for piped output | Auto-escaping prevents XSS (T-02-05) — no additional sanitization needed |
| previewAnswers cleared on delete | Prevents stale conditions showing incorrect visibility state (T-02-07) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — ConditionalLogicPanel fully functional. Piping resolution wired at all three render points.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. XSS mitigation (T-02-05) and stale-condition mitigation (T-02-07) both implemented as planned.

## Self-Check

- [x] components/admin/ConditionalLogicPanel.tsx exists (302 lines)
- [x] ConditionalLogicPanel exports `export default function ConditionalLogicPanel`
- [x] ConditionalLogicPanel imports `ShowIfRule, ShowIfCondition` from `@/lib/db/schema`
- [x] ConditionalLogicPanel contains `combinator: 'AND'` (always compound shape)
- [x] ConditionalLogicPanel contains all 4 operators: Is, Is not, Is one of, Is not one of
- [x] ConditionalLogicPanel contains checkbox rendering for choice-type multi-value
- [x] ConditionalLogicPanel contains comma-split parsing for free-text multi-value
- [x] ConditionalLogicPanel contains `onChange({ showIf: undefined })` for clear-all
- [x] ConditionalLogicPanel contains no OR toggle
- [x] SurveyBuilder.tsx contains `import ConditionalLogicPanel`
- [x] SurveyBuilder.tsx contains `<ConditionalLogicPanel`
- [x] SurveyBuilder.tsx contains `previewAnswers` state
- [x] SurveyBuilder.tsx contains `delete next[id]` in deleteField
- [x] SurveyBuilder.tsx contains `opacity-60`
- [x] SurveyBuilder.tsx contains `visibility` Material Icon
- [x] SurveyBuilder.tsx contains `font-mono` for field ID
- [x] SurveyBuilder.tsx contains "Uses piping token"
- [x] SurveyBuilder.tsx contains `fields.indexOf(f) < fields.indexOf(field)`
- [x] app/s/[slug]/page.tsx imports `resolvePiping`
- [x] app/s/[slug]/page.tsx applies `resolvePiping` to heading label, question label, helpText
- [x] app/s/[slug]/page.tsx contains no `dangerouslySetInnerHTML` with piped values
- [x] Commits d964b71b and c79527d7 exist

## Self-Check: PASSED
