---
type: spec
domain: automations
status: proposed
date: 2026-06-25
sources:
  - lib/workflows/runtime.ts
  - lib/workflows/trigger.ts
  - lib/workflows/types.ts
  - lib/workflows/templates.ts
  - lib/automation/engine.ts
  - lib/automation/event-bus.ts
  - lib/db/schema/workflows.ts
  - lib/db/schema/brain.ts
  - app/api/cron/process-scheduled-automations/route.ts
  - app/api/cron/process-playbook-waits/route.ts
  - app/api/cron/process-journey-enrollments/route.ts
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

---

## Deep gap assessment (grounded in real code — 2026-06-25)

### What already exists

| Asset | Location | State |
|---|---|---|
| `workflows` table | `lib/db/schema/workflows.ts:20` | Shipped. `id`, `clientId`, `name`, `status`, `trigger` (JSON), `graph` (JSON). |
| `workflow_runs` table | `lib/db/schema/workflows.ts:34` | Shipped. `id`, `workflowId`, `clientId`, `triggeredBy`, `status` (`pending\|running\|completed\|failed`), `context` (JSON), `startedAt`, `completedAt`, `error`. |
| `workflow_step_logs` table | `lib/db/schema/workflows.ts:47` | Shipped. Append-only audit log: `id`, `runId`, `nodeId`, `action`, `status` (`success\|failed\|skipped`), `input`, `output`, `durationMs`, `occurredAt`. |
| `runWorkflow()` | `lib/workflows/runtime.ts:43` | Shipped. Inserts a `workflow_runs` row, DFS-walks the graph synchronously, inserts `workflow_step_logs` per node. |
| `enqueueWorkflowRunsForTrigger()` | `lib/workflows/trigger.ts:23` | Shipped but not wired to live events. Only called from the test-run endpoint. Fire-and-forget via `void runWorkflow(...)`. |
| Run-history API route | `app/api/portal/workflows/[id]/runs/route.ts` | Shipped (listed in domain map). Returns run list per workflow. |
| Automation Rules cron drain | `app/api/cron/process-scheduled-automations/route.ts` | Shipped. CAS-claim pattern, every minute. Model to replicate. |
| Playbook-waits cron drain | `app/api/cron/process-playbook-waits/route.ts` | Shipped. Drains `brain_playbook_run_steps` whose `waitUntil <= now()`. Second durable model. |
| Journey-enrollments cron drain | `app/api/cron/process-journey-enrollments/route.ts` | Shipped. CAS-claim + idempotency guard (`onConflictDoNothing`) on email step sends. Third model. |

### Real limitations in `lib/workflows/runtime.ts`

- **No retries.** `executeStep()` catches errors and marks the step `failed`, but the run continues (or halts) — there is no retry loop and no `nextRetryAt` pointer. A transient network error drops the step permanently. (Line 183-188.)
- **5 000 ms wait cap.** `DEFAULT_MAX_WAIT_MS = 5_000` (line 41). `wait` actions are capped to 5 seconds to prevent blocking the server thread. Journeys needing "wait 2 hours" cannot be expressed.
- **Fire-and-forget, no durability across restarts.** `enqueueWorkflowRunsForTrigger` calls `void runWorkflow(...)` (trigger.ts:51). A Vercel function timeout or deploy mid-run drops the run with no recovery path.
- **`send_email` is a stub.** `runtime.ts:321-327` returns `{ status: 'skipped', todo: 'send_email not yet wired' }`.
- **`add_to_list` is a stub.** `runtime.ts:330-335` returns `{ status: 'skipped', todo: 'add_to_list not yet wired' }`.
- **Condition evaluator always returns `true`.** `pickConditionResult()` (`runtime.ts:351-358`) reads an optional `context.conditions` override map, then defaults to `true`. No real field/expression evaluation against run context or CRM data.
- **No live trigger wiring.** `trigger.ts:29` has an explicit TODO: "wire into live CRM event stream — call sites for `contact.created`, `deal.stage_changed`, `form.submitted`". The Automation Rules engine (`lib/automation/engine.ts`) emits events via `emitEvent()` but does NOT call `enqueueWorkflowRunsForTrigger`.

### What the original "Proposed approach" section got wrong

The section proposes adding `workflow_runs` and `workflow_run_steps` tables (spec lines 52-55). **`workflow_runs` already exists** (`workflows.ts:34`). **The misnamed `workflow_run_steps` — what the spec intended — is `workflow_step_logs` already at `workflows.ts:47`.** However, `workflow_step_logs` is append-only and has no retry-state columns (`attemptCount`, `nextRetryAt`, `idempotencyKey`). A new separate **mutable queue table** is needed alongside it.

---

## Durable queue design (Postgres-backed, cron-drainer)

### Decision: cron-drainer on Vercel, not a dedicated worker

The platform already runs 26+ cron routes under `app/api/cron/` using `withCronHealth`. The established drainer pattern (CAS-claim via `nextRunAt`-bump before processing, per-row error isolation, `CRON_SECRET` auth) works correctly on serverless Vercel functions with no long-lived process assumption. Introducing a Railway worker service would be a new infra dependency with no existing precedent in this repo. The cron-drainer approach is chosen:

- **`process-workflow-runs` cron** — a new route at `app/api/cron/process-workflow-runs/route.ts`, suggested schedule every minute (`* * * * *`), matching `process-scheduled-automations`.
- The 5-second wait cap is removed: `wait` steps are implemented by setting `nextRetryAt = now() + ms` on the queue row and returning immediately. The cron picks them up when due — no blocking.

### Schema delta (add to `lib/db/schema/workflows.ts`)

Add one new table: `workflow_run_steps` — the **mutable step queue**. Keep `workflow_step_logs` as the **append-only audit log** (unchanged).

```typescript
// Mutable queue — one row per node per run. Updated on each attempt.
export const workflowRunSteps = pgTable('workflow_run_steps', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),                          // matches WorkflowNode.id in graph JSON
  action: text('action').notNull(),                           // WorkflowAction.kind
  // 'pending' | 'running' | 'completed' | 'failed' | 'dead_letter'
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  nextRetryAt: timestamp('next_retry_at'),                    // null = ready immediately
  idempotencyKey: text('idempotency_key'),                    // set for send_email; format: 'runId:nodeId'
  input: json('input').$type<WorkflowStepInput>(),
  result: json('result').$type<WorkflowStepOutput>(),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

Add a partial index for the cron scan (raw SQL, same pattern as `automation_rules_next_run_at_idx`):
```sql
CREATE INDEX workflow_run_steps_pending_idx
  ON workflow_run_steps (client_id, next_retry_at)
  WHERE status IN ('pending', 'failed') AND next_retry_at IS NOT NULL;
```

### Claim / lease semantics

The cron drainer replicates the `process-scheduled-automations` CAS pattern:

1. `SELECT` up to 100 `workflow_run_steps` rows where `status IN ('pending')` AND (`nextRetryAt IS NULL` OR `nextRetryAt <= now()`), ordered by `nextRetryAt ASC NULLS FIRST`.
2. For each row, issue a CAS `UPDATE … SET status = 'running', updatedAt = now() WHERE id = $id AND status = 'pending' AND (nextRetryAt IS NULL OR nextRetryAt <= now())`. Zero rows returned = skip (another worker claimed it).
3. Execute the action.
4. On success: `UPDATE … SET status = 'completed', result = $result`. Then look up the graph edges from this `nodeId` and `INSERT` downstream nodes as new `pending` `workflow_run_steps` rows. Mark the parent `workflow_runs` row `completed` when no pending/failed/running steps remain.
5. On failure (exception OR `status: 'failed'` action result): increment `attemptCount`, set `nextRetryAt` per backoff schedule, set `status = 'failed'`. After max attempts: set `status = 'dead_letter'`, mark parent run `failed`.

### Status transitions

```
pending → running (CAS claim by cron)
running → completed (action succeeded)
running → failed (action errored, attempts remain)
failed  → running (CAS claim by cron when nextRetryAt <= now())
failed  → dead_letter (attemptCount >= maxAttempts)
dead_letter: terminal — no further retries
```

The parent `workflow_runs.status` mirrors aggregate child state: `pending` → `running` (first step claimed) → `completed` (all steps done) | `failed` (any step dead-lettered).

### Retry policy and backoff

- **Max attempts:** 3 (platform-wide default, non-configurable in Phase 1).
- **Backoff schedule:** attempt 1 → `nextRetryAt = now() + 1 min`; attempt 2 → `+5 min`; attempt 3 → `+30 min`. After attempt 3: `dead_letter`.
- **Dead-letter handling:** `workflow_runs.error` records the final error message. The existing `failing-automations-notify` daily digest cron can be extended (or a separate daily digest added) to surface dead-lettered runs to the tenant. Portal run-history UI (Phase 4) shows `dead_letter` status with the error message and attempt log.

### Idempotency for `send_email`

`send_email` must not double-send on retry. Idempotency key: `'wf:{runId}:{nodeId}'` stored in `workflow_run_steps.idempotencyKey`. Before sending, check `workflow_step_logs` for a prior `success` entry with matching `runId + nodeId` — if found, skip the send and return the prior result. This is the same `onConflictDoNothing` pattern as `process-journey-enrollments/executeEmailStep()`. If using Resend, pass the idempotency key as `headers['Idempotency-Key']` to prevent duplicate sends at the provider level too.

### Run creation flow (replaces fire-and-forget in `enqueueWorkflowRunsForTrigger`)

1. Insert `workflow_runs` row (`status = 'pending'`).
2. Find the trigger node in `wf.graph.nodes`.
3. Insert one `workflow_run_steps` row per node immediately downstream of the trigger (`status = 'pending'`, `nextRetryAt = null`).
4. Return `matchedWorkflowIds` — the cron drainer picks up the steps within the next tick.
5. Remove the `void runWorkflow(...)` fire-and-forget call; `runWorkflow()` becomes an internal function called only by the cron drainer.

---

## Execution model on serverless (removing the 5s cap)

| Step type | Current | After this spec |
|---|---|---|
| `wait` | `setTimeout(ms)` capped at 5 000 ms | Set `nextRetryAt = now() + ms` on the queue row, mark step `pending`, return. Cron picks it up when due. No thread blocking. |
| `send_email` | Synchronous stub | Cron executes it with idempotency guard; retries on transient failure. |
| `add_to_list` | Synchronous stub | Cron executes it; idempotency via `onConflictDoNothing` on subscriber insert. |
| `condition` | Always-true stub | Cron evaluates real expression against run context (see Phase 3). |
| `create_task` | Synchronous, live | No change — already works. Cron executes it with retry on DB error. |
| `webhook` | Synchronous | Cron executes with 10 000 ms timeout (same as `engine.ts` `fire_webhook`). Retry on non-2xx. |

The `DEFAULT_MAX_WAIT_MS = 5_000` constant in `runtime.ts` becomes dead code once the cron drainer owns execution. It should be removed in Phase 2.

The cron function itself runs under Vercel's 60-second hobby / 300-second pro function timeout. Each tick processes up to 100 steps; any single step that takes more than ~40 seconds is treated as a timeout failure and retried on the next tick (CAS: the `running` row is never updated to `completed`, so it stays `running` until a stuck-run recovery pass re-queues it — see Stuck-run recovery below).

### Stuck-run recovery

Runs stuck in `status = 'running'` for more than 10 minutes are treated as orphaned (crashed worker). The same `process-workflow-runs` cron can include a second pass: reset steps with `status = 'running'` and `updatedAt < now() - 10 min` back to `status = 'pending'` (incrementing `attemptCount` on each reset, so orphaned runs still consume their retry budget).

---

## Phased implementation plan

### Phase 0 — Schema delta (prerequisite, low risk)

1. Add `workflowRunSteps` table to `lib/db/schema/workflows.ts` (shape above).
2. `bun run db:generate && bun run db:migrate`.
3. Gate: `bun run typecheck` + `scripts/test.sh --layer=integration --no-coverage` (existing workflow CRUD tests must still pass).
4. Gate: `bun test:tenancy` (new table has `clientId`; tenancy tests must pass).

### Phase 1 — Trigger wiring + unimplemented action kinds

Wire `enqueueWorkflowRunsForTrigger` to live events and implement the two stubbed actions.

**1a. Trigger wiring.** In `lib/automation/engine.ts`, after `processEvent` fires `runRule`, also call `enqueueWorkflowRunsForTrigger(event.clientId, { kind: event.event as WorkflowTriggerConfig['kind'] }, event.payload)` for the subset of events that match canonical workflow trigger kinds (`contact.created`, `deal.stage_changed`, `form.submitted`). The mapping: `crm.contact.created` → `{ kind: 'contact.created' }`, `crm.deal.updated` with a stage change → `{ kind: 'deal.stage_changed', stageId }`. `trigger.ts`'s `triggerMatches()` already handles the loose matching. Note: `enqueueWorkflowRunsForTrigger` must NOT be fire-and-forget after Phase 2 — it should insert `workflow_run_steps` rows and return (no `runWorkflow` call).

**1b. `send_email`.** Replace the stub at `runtime.ts:321-327` with a call to `lib/email/sender` using the workflow's tenant `clientId` (resolved from `context.clientId`). Template resolution: `action.templateId` looks up an email template row; `action.to === 'contact'` resolves the contact email from run context. Check `workflow_step_logs` for a prior `success` on this `runId + nodeId` before sending (idempotency).

**1c. `add_to_list`.** Replace the stub at `runtime.ts:330-335` with `db.insert(emailListSubscribers).values(...).onConflictDoNothing()`. Resolve subscriber from run context `contactEmail` field.

Gate: `scripts/test.sh --layer=unit --no-coverage` (`tests/unit/workflows-runtime.test.ts`). Add unit tests for `send_email` (mock sender) and `add_to_list` (mock DB). `bun run typecheck`.

### Phase 2 — Cron drainer + retry (core durable work)

**2a.** Refactor `runWorkflow()` and `enqueueWorkflowRunsForTrigger()` to insert `workflow_run_steps` rows instead of synchronously walking the graph.

**2b.** Create `app/api/cron/process-workflow-runs/route.ts` following the `process-scheduled-automations` pattern:
- CAS-claim up to 100 pending steps.
- Execute each step (call the same action dispatch logic from the refactored runtime).
- On success: mark step `completed`, enqueue downstream steps, check if run is complete.
- On failure: increment `attemptCount`, set `nextRetryAt` per backoff, move to `failed` or `dead_letter`.
- Stuck-run pass: reset orphaned `running` steps.
- Register in `vercel.json` at `* * * * *` (every minute).

**2c.** Remove `DEFAULT_MAX_WAIT_MS` / `setTimeout` from `runtime.ts`. `wait` steps become `nextRetryAt` pointer updates.

Gate: `scripts/test.sh --layer=unit --no-coverage` (`tests/unit/workflows-runtime.test.ts`, `tests/unit/workflows-runtime-branches.test.ts`). Add unit test for the new cron drainer route. `bun test:tenancy`. `bun run typecheck`.

### Phase 3 — Real condition evaluator

Replace `pickConditionResult()` (always-true stub at `runtime.ts:351-358`) with a real predicate evaluator. The expression format should match the `AutomationCondition` model already used in `lib/automation/engine.ts` (`evaluateCondition()` at line 59). The run context (`workflow_runs.context`) carries the trigger payload; the evaluator walks `expression` as a dotted field path (e.g. `contact.tag`, `deal.amount`) against that context.

Gate: `scripts/test.sh --layer=unit --no-coverage` (`tests/unit/workflows-runtime-branches.test.ts`). Extend with real expression cases. `bun run typecheck`.

### Phase 4 — Observability UI

Extend the portal run-history panel (`app/portal/automations/workflows/[id]/page.tsx`) to show:
- Run list with `status` badge, `startedAt`, `completedAt`, `error` (links to `GET /api/portal/workflows/[id]/runs`).
- Per-run step drill-down from `workflow_run_steps`: `nodeId`, `action`, `status`, `attemptCount`, `error`, `nextRetryAt`, `result`.
- Dead-lettered runs surface a "Retry" button (POST to a new `/api/portal/workflows/runs/[runId]/retry` route that resets dead-letter steps to `pending`).

Gate: `scripts/test.sh --layer=e2e --tag=@critical --no-coverage` (`tests/e2e/portal-automations.spec.ts` — extend with run-history smoke). `bun run typecheck`.

---

## Migration and cut-over

- No hybrid state: the cut-over from synchronous `runWorkflow` to cron-drainer is a single PR (Phase 2). After merge, all new runs are queue-backed. In-flight runs from the old path (runs in `status = 'running'` with no `workflow_run_steps`) will be detected by the stuck-run recovery pass and treated as orphaned — they will transition to `failed` within one cron tick. Given current call volume (test-run endpoint only), this is a clean cut with no active in-flight runs to worry about.
- Feature flag not required (visual workflow builder is already behind a portal feature gate and not yet marketed).

## Verification summary (gates per phase)

| Phase | Gate command(s) |
|---|---|
| 0 — schema | `bun run typecheck` + `scripts/test.sh --layer=integration --no-coverage` + `bun test:tenancy` |
| 1 — wiring + stubs | `scripts/test.sh --layer=unit --no-coverage` (runtime tests) + `bun run typecheck` |
| 2 — cron drainer | `scripts/test.sh --layer=unit --no-coverage` + `bun test:tenancy` + `bun run typecheck` |
| 3 — condition eval | `scripts/test.sh --layer=unit --no-coverage` (branches test) + `bun run typecheck` |
| 4 — observability UI | `scripts/test.sh --layer=e2e --tag=@critical --no-coverage` + `bun run typecheck` |
