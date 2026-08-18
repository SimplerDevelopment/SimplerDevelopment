---
type: spec
domain: projects-pm
status: proposed
date: 2026-07-03
sku: PUX-010
sources:
  - lib/db/schema/pm.ts
  - components/portal/ProjectGoalsPanel.tsx
  - app/api/portal/projects/[id]/goals/
  - lib/ai/
---

# Feature: AI-Driven Project Goal Tracking

## Overview

Project Goals (`project_goals`, rendered by `components/portal/ProjectGoalsPanel.tsx`) are **manual today** — a user hand-enters progress. The [[Projects, Tickets & Kanban]] domain map already flags "Goal progress is manual-only; auto-derivation from card states is a follow-up." This spec replaces manual progress with a two-tier model: a deterministic **auto-derived** base and an optional **AI** layer on top.

## Problem

Manual goal progress rots — users set a number once and never update it, so goals become stale and untrustworthy. The data to compute real progress (linked cards, sprint burndown, story points, activity) already exists in the Kanban system but isn't connected to goals.

## Proposed approach

### Tier 1 — Auto-derived progress (deterministic, ships first)
Link a goal to a set of cards and/or sprints, then compute progress from their state instead of a manual field:
- % of linked cards in a done `workflowState`, or
- completed story points / total, or
- sprint burndown for a sprint-scoped goal.
Schema: a link table (`project_goal_cards` or reuse the artifact-link pattern) or a query filter (label/saved-view) defining a goal's card set. Keep a `manualOverride` column so a user can still pin a value when the heuristic doesn't fit; auto-derived is the default display when no override is set. Recompute on card-state-change events (see Phase 4 of [[Spec - Unified Automations Hub]] — the same Kanban events power this).

### Tier 2 — AI layer (optional, tie into Company Brain)
On top of the deterministic number, an AI pass (`lib/ai/`, billed via the AI credit ledger):
- **Status summary**: draft a short narrative of goal health from recent card activity + comments.
- **At-risk detection**: flag goals that are behind pace (due date vs. progress vs. velocity) and surface a "goal health" indicator + nudge.
- **Goal suggestion**: propose goals from project context (open initiatives, card themes).

### Automation hook
"Goal at risk" and "goal completed" become emitted events on the shared automation bus (per [[Spec - Unified Automations Hub]]), so tenants can automate on them (notify, create a card, start a playbook).

## Scope

In scope: goal↔card/sprint linkage; auto-derived progress with manual override; AI status summary + at-risk flag; goal-lifecycle events on the automation bus.
Out of scope: full OKR cascade / weighting; cross-project portfolio rollups; predictive completion-date ML.

## Open questions
- Linkage model: explicit goal↔card links vs. a saved-view/label query defining the card set? (Explicit is simpler to reason about; query is less maintenance.)
- Does the AI summary run on a schedule (cron) or on-demand (button)? On-demand first to control credit spend.
- Billing: AI passes consume credits — gate behind `checkAiPlanGate` / `hasCredits` like the NLP automation parser.

## Risks
- **Tenancy**: goals, cards, and AI audit rows all `clientId`-scoped; run `bun test:tenancy` after the schema change.
- **Credit cost**: the AI tier must be opt-in / rate-limited; never auto-run per goal on every render.
- Manual-override coexistence: never silently overwrite a user's pinned value with an auto-derived one.

## Effort
**M–L**: Tier 1 is M (schema link + derive query + panel UI + recompute wiring); Tier 2 is M (AI prompts + credit gating + health UI). Ship Tier 1 first — it delivers most of the value without AI spend.

## Related
[[Projects, Tickets & Kanban]] | [[Spec - Unified Automations Hub]] | [[Company Brain & AI]]
