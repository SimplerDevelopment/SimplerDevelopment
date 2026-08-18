---
type: spec
domain: automations
status: proposed
date: 2026-06-17
sources:
  - lib/workflows/runtime.ts
  - lib/workflows/trigger.ts
  - lib/workflows/types.ts
  - lib/workflows/templates.ts
  - lib/automation/event-bus.ts
  - lib/db/schema/workflows.ts
  - app/api/cron/process-scheduled-automations/route.ts
  - app/api/cron/failing-automations-notify/route.ts
  - app/api/portal/workflows/route.ts
---

# Feature: Durable Automation Runtime

## Overview

Harden the current fire-and-forget workflow runtime into a **durable, retrying, branching journey engine** — one that survives process restarts, retries failed steps with backoff, supports conditional branching and loops, and exposes an observable run log per tenant. The gap report states the current runtime is "demo-grade, no durable queue, no retries." This is the load-bearing primitive that enables agency resell and closes the most-cited competitor gap (Zapier / n8n / GoHighLevel).

Competitive context: **Zapier**, **n8n**, and **GoHighLevel** all provide durable, observable automation runtimes with branching and retries as baseline. Gap #3 in [[Competitive Gap Analysis 2026-06]].

## Domain context

Read first: [[Automations & Workflows]]. Invariants:

- The event bus (`lib/automation/event-bus.ts`) and in-process runtime (`lib/workflows/runtime.ts`, `lib/workflows/trigger.ts`) already exist.
- `lib/db/schema/workflows.ts` holds the workflow definition schema — run-state persistence extends it.
- Cron at `app/api/cron/process-scheduled-automations/route.ts` already ticks; `app/api/cron/failing-automations-notify/route.ts` confirms failure visibility exists at a primitive level.
- Plain-English → rule parser is already native. Tracked trigger-links as a workflow entry point are already built.
- Tenancy: all workflow and run rows must be keyed by `clientId`; no cross-tenant run data.

## Problem

The current runtime executes steps in-process and in-memory. A step failure, deploy, or server restart drops the run with no retry, no recovery, and no observable state. There is no branching (`if contact.tag == X → branch A else branch B`), no loop construct (wait-until / for-each), and no way to inspect or replay a failed run. Tenants building multi-step onboarding or sales journeys cannot rely on it.

## Goal

- Every workflow run is persisted to the database at step granularity; a process restart resumes from the last committed step.
- Failed steps retry with configurable exponential backoff (default: 3 attempts, 1m / 5m / 30m).
- Conditional branches and loop constructs are supported in the step graph.
- Tenants can inspect run history, step status, and error messages in the portal.
- The engine is the single shared runtime powering all automation surfaces (email journeys, CRM triggers, booking follow-ups, plugin hooks).

## Proposed approach

### Run persistence layer (schema extension)

Add `workflow_runs` and `workflow_run_steps` tables to `lib/db/schema/workflows.ts`:
- `workflow_runs`: `id`, `clientId`, `workflowId`, `status` (pending / running / completed / failed / cancelled), `triggeredAt`, `completedAt`, `context` (JSONB trigger payload).
- `workflow_run_steps`: `id`, `runId`, `stepId`, `status`, `attemptCount`, `lastAttemptAt`, `nextRetryAt`, `result` (JSONB), `error`.

Generate migration: `bun run db:generate && bun run db:migrate`.

### Step executor loop

Refactor `lib/workflows/runtime.ts` from an async call chain to a **step-by-step executor loop**:
1. On trigger, insert a `workflow_run` row and the first `workflow_run_step`.
2. The cron at `app/api/cron/process-scheduled-automations/route.ts` polls `workflow_run_steps` where `status = pending AND nextRetryAt <= now()`.
3. For each step: execute action, on success mark complete + insert next step(s) (supporting fan-out for parallel branches); on failure increment `attemptCount`, set `nextRetryAt` with backoff, mark `failed` after max attempts.
4. The run itself is marked `completed` or `failed` when no more pending steps remain.

### Branching and loops

Extend the step graph types in `lib/workflows/types.ts`:
- **Condition node**: evaluates a predicate against the run `context` (e.g. CRM field, tag, prior step output), resolves to one of N outgoing branch step IDs.
- **Wait/delay node**: inserts a step with `nextRetryAt = now() + delay` — no new infrastructure, reuses the retry scan.
- **For-each node**: expands a list payload into N parallel child runs (fan-out pattern).

### Observability

Add `GET /api/portal/workflows/[id]/runs` and `GET /api/portal/workflows/runs/[runId]` routes returning run + step detail. Portal UI: run history list with status badges + per-step drill-down showing action type, attempt count, error message, and duration.

### Action kinds (existing + new)

The existing action kinds (`send_email`, `add_to_list`, `crm_update`) must be refactored to return a serializable result stored in `workflow_run_steps.result` rather than mutating state silently. New action kinds can be added as the runtime is stable.

## Scope

In scope:
- Persistent run + step tables, cron-driven executor, exponential backoff.
- Conditional branch and wait/delay node types.
- For-each (parallel child runs) node type.
- Portal run-history UI + step drill-down.
- Refactor existing action kinds to return serializable results.

Out of scope:
- Visual drag-and-drop workflow builder (the existing builder drives this; the runtime change is backend-only and compatible).
- External trigger webhooks / inbound HTTP triggers (see future public webhook spec).
- ML-powered send-time optimization (see [[Spec - Predictive Scoring Layer]]).
- Agency resell / entitlement gating of automation tiers (see [[Spec - White-Label SaaS Resell]]).

## Risks

- Migrating in-flight runs from the current in-memory model to persistent rows must be a clean cut; no hybrid state. Schedule during a low-traffic window or add a feature flag disabling the old path.
- The cron polling model introduces up to one cron-tick of latency per step (typically ~1 min). For near-real-time journeys, a supplementary in-process notification (e.g. pg LISTEN/NOTIFY or a simple in-memory queue drained on the same tick) can reduce latency without adding a new queue dependency.
- For-each fan-out on large lists (e.g. 10k subscribers) must be rate-limited to avoid row explosion; cap initial implementation at a configurable maximum (e.g. 500 child runs per trigger).
- `bun test:tenancy` is mandatory after schema additions — run rows must not be cross-tenant readable.

## Effort

**L** (~3–5 engineer-weeks: schema + executor refactor + branch types + portal UI + migration + tests).

## Open questions

- Queue backend: start with cron-polled DB rows (zero new infra, matches the existing ~26 crons model) or introduce a lightweight queue (BullMQ / pg-boss) for sub-minute latency on the first version?
- Max retry attempts and backoff curve — configurable per workflow definition or platform-wide defaults only?
- Should for-each fan-out create child `workflow_runs` (full observability) or inline steps in the parent run (simpler schema)?

---

## Verified against dev (2026-06-17)

**Verdict: PARTIAL (nuanced) — re-scope to visual workflow canvas + retries; do not greenfield the whole runtime.**

### What is already durable (not in scope)

Two separate automation engines are already DB-persisted and durable:

- **Brain Playbooks engine** (`lib/db/schema/workflows.ts` and related): playbook runs are persisted to DB; the `app/api/cron/process-scheduled-automations/route.ts` cron drains wait-step runs using a `nextRunAt` cursor. This engine is not fire-and-forget.
- **Automation Rules engine**: CAS-claimed scheduled runs with real condition operators. Not demo-grade.

### What is genuinely demo-grade (the real gap)

The **visual workflow canvas** runtime (`lib/workflows/runtime.ts`):

- No retries or backoff — a step failure drops the run silently (all three engines share this gap).
- The condition evaluator is a stub that defaults to `true` regardless of branch logic.
- `send_email` and `add_to_list` action kinds are stubbed and emit `status: 'skipped'` — no actual email is sent, no list is updated.
- No live trigger wiring: only the test-run endpoint calls the runtime; CRM events do not enqueue runs via the visual canvas path (the `enqueueWorkflowRunsForTrigger` integration is absent — this is the open backlog card on the Project Board).
- No loop constructs (for-each, wait-until).
- No stuck-run recovery (runs that error mid-step have no resume path).

### Narrowed scope

Re-scope this spec from "greenfield durable runtime" to:

1. Wire `enqueueWorkflowRunsForTrigger` to live CRM/automation events so the visual canvas receives real triggers.
2. Implement `send_email` and `add_to_list` action kinds (currently stubbed).
3. Add exponential-backoff retry to the step executor (applies to all three engines — shared fix).
4. Replace the stub condition evaluator with real predicate logic against run context.
5. Add stuck-run recovery (runs stalled > N minutes get retried or marked failed with a notification).
6. Portal run-history UI + step drill-down (observability — still greenfield across all engines).

Items 1 and 2 are low-effort wiring. Items 3–6 are the original spec's core work. The schema additions (`workflow_runs`, `workflow_run_steps`) remain in scope for the visual canvas path specifically.

Effort estimate remains **L** but the greenfield surface is smaller than originally stated.
