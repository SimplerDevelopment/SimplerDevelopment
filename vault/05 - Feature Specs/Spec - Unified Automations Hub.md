---
type: spec
domain: automations
status: proposed
date: 2026-07-03
sku: PUX-007
sources:
  - lib/automation/engine.ts
  - lib/automation/event-bus.ts
  - lib/pm-activity.ts
  - lib/workflows/trigger.ts
  - lib/db/schema/brain.ts
  - lib/db/schema/pm.ts
  - app/portal/projects/automations/
  - components/portal/ProductAutomationSettings.tsx
---

# Feature: Unified Automations Hub (Project Automations)

## Overview

Project Automations today is a **74-line wrapper** (`app/portal/projects/automations/page.tsx`) around the shared `ProductAutomationSettings` component: five hardcoded on/off presets, **all five firing the same action** (`create_support_ticket`). Only **3 of ~24** Kanban activity types reach the automation event bus, and one preset trigger (`project.status.changed`) is **dead code** — never emitted, so toggling it does nothing.

Meanwhile the *general* automation stack is mature: an event bus (`lib/automation/event-bus.ts`), a scope-gated action dispatcher (`lib/automation/engine.ts`), a durable workflow runtime + cron drainer with retries/dead-letter (`lib/workflows/`, shipped 2026-06-25 — see [[Automations & Workflows]] and [[Spec - Durable Automation Runtime]]), and an NLP rule parser. Email was already folded into the shared builder; **projects was left behind**.

This spec makes Project Automations a **project-scoped surface over the one shared engine** — not a parallel system.

## Principle (decided)

**One engine, many surfaces.** Confirmed direction: a single platform-wide **`/portal/automations` hub** that every surface (projects, CRM, email) deep-links into, pre-scoped to its own triggers/actions. Project automation = the general engine + Kanban events on the shared bus + a project-native trigger/action palette. Cross-domain automations ("deal won → spawn onboarding project + seed cards"; "card moved to Done → update the CRM deal") fall out for free once both sides share the bus.

## Problem (verified current state)

- `/portal/projects/automations` exposes no custom trigger, no condition editor, no multi-action chaining, no run history — just 5 toggles that all create a ticket.
- `lib/pm-activity.ts` bridges only `task.created`, `task.assigned`, `task.completed` into `emitEvent`; the other ~21 `CardActivityType`s never reach the bus.
- `project.status.changed` is in the registry + used by a preset but never emitted.
- The engine already supports `move_project_card` / `create_project_card` / `update_project_card` / `add_card_comment` / `fire_webhook` / `start_playbook`, but none are reachable from the projects UI.
- `card_recurrences` (recurring cards) is a separate system with its own cron/tools, invisible to the automations page.

## Proposed approach — phased

### Phase 1 — Emit the missing events (backend, low-risk, high-leverage)
Bridge real Kanban/project lifecycle into `emitEvent` at the existing choke point (`lib/pm-activity.ts`): card moved-to-column (any column), assigned/unassigned, label added, priority changed, comment added, checklist item / all-complete, blocked/unblocked, dependency added, card created-in-column. Fix the dead `project.status.changed` (emit from the project update route). Add time-based triggers (due-soon / overdue / stale-N-days) via the existing scheduled-automations cron scanning `kanban_cards`. Add sprint started/completed from the sprint routes. Each new event = one `emitEvent(...)` at a site that already mutates + one registry entry in `AUTOMATION_EVENTS`.

### Phase 2 — Expose real actions
Surface the project-native actions already in `HANDLERS` (move/create/update card, assign, add label, add comment) plus the engine bridges (`fire_webhook`, `start_playbook`) in the builder's action palette — replacing the ticket-only presets. Dispatch + scope-gating already exist (`isActionAllowed` in `engine.ts`); this is mostly preset/UI wiring. Every new action bridge must have a matching entry in `AUTOMATION_ACTION_SCOPES` or `tests/unit/automation-action-scope-completeness.test.ts` fails (by design).

### Phase 3 — The unified hub (the UX decision)
Reframe the existing (currently Brain-scoped) rule builder into a neutral platform-wide **`/portal/automations`** hub: project-scoped trigger picker, condition editor (the AND engine exists — just expose it), multi-action chaining, and a run-history view (the `automation_logs` API already exists — render it). `/portal/projects/automations` becomes a deep-link into the hub pre-filtered to project triggers/actions. Do the same for CRM and email so the hub is the single builder for all surfaces.

### Phase 4 — Tie into general + visual workflows
Wire Kanban triggers into `enqueueWorkflowRunsForTrigger` (`lib/workflows/trigger.ts`) so multi-step project *journeys* (branch/delay/loop) can use the durable visual canvas, with an "open in workflow builder" escape hatch. Surface `card_recurrences` in the same hub UI as a "recurring card" automation type so the two systems stop being invisible to each other.

### Phase 5 — Polish
Condition OR / grouping (currently AND-only, flat array), a shared preset/template library (kill the per-surface hardcoded preset arrays), per-tenant timezone for due-date triggers (scheduler is UTC-only today).

## Scope

In scope: emit Kanban/project events; expose real project actions; the unified `/portal/automations` hub with project deep-link + run history; workflow-canvas trigger wiring; recurrences surfaced in-hub.

Out of scope (separate cards): the visual builder canvas redesign; external inbound webhooks; ML send-time optimization; agency resell / entitlement tiering.

## Risks & invariants
- **Scope gate is load-bearing** — every action dispatch runs `isActionAllowed(rule.scopes, action.tool)` before execution (`engine.ts`). New actions need matching scope entries or the completeness test fails.
- **Tenancy** — all rules/logs keyed by `clientId`; run `bun test:tenancy` after any `automation_rules` / `workflows` / `pm.ts` data-access change.
- **Event bus is in-process + fire-and-forget** — any route emitting new Kanban events must import from `lib/automation` so the engine is registered on that serverless instance.
- **Two engines still coexist** (`automation_rules` event-driven vs `workflows` visual canvas) — Phase 4 bridges them; do not merge their tables.

## Effort
**XL**, phased. P1+P2 are S/S (wiring on an already-durable engine); P3 is M–L (hub UI + per-surface deep-links); P4 is M; P5 is M. Ship P1+P2 first for immediate value.

## Related
[[Automations & Workflows]] | [[Spec - Durable Automation Runtime]] | [[Projects, Tickets & Kanban]] | [[CRM]]
