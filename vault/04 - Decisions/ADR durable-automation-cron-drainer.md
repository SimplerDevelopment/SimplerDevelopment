---
type: adr
domain: automations
status: accepted
date: 2026-06-25
sources:
  - lib/db/schema/workflows.ts
  - app/api/cron/process-workflow-runs/route.ts
  - lib/workflows/trigger.ts
  - lib/workflows/runtime.ts
  - app/api/portal/workflows/runs/[runId]/route.ts
  - app/api/portal/workflows/runs/[runId]/retry/route.ts
  - vercel.json
---

# ADR: Durable Visual-Workflow Runtime — Cron-Polled Postgres Queue over Dedicated Worker

## Status

Accepted — shipped on `dev` branch 2026-06-25 (Phases 0-4). Pending before main-merge: `bun test:tenancy`, e2e gate, migration applied to staging/prod.

## Context

The visual workflow runtime (`lib/workflows/runtime.ts`) was in-process and fire-and-forget before this change. `runWorkflow()` walked the graph DFS in a single server function call with no persistence of intermediate state, no retry on transient failures, and no observability after the call returned. The trigger wiring (`lib/workflows/trigger.ts`) was a stub that did not wire to live CRM or form events. Two action kinds (`send_email`, `add_to_list`) were no-op stubs that always returned `status: skipped`. Conditions used an always-true evaluator.

The result was a visually complete canvas with no production-grade runtime behind it. The platform's stated value proposition includes durable automation — a failure mid-graph should retry, not silently disappear.

The deployment is Vercel serverless. A per-minute cron (`app/api/cron/process-scheduled-automations/route.ts`) already exists via `vercel.json` and uses the established `withCronHealth` helper pattern. No persistent Node process is available outside the Yjs realtime sidecar (Railway), which is unrelated to automations.

## Decision

**Implement a Postgres-queue-based durable runtime drained by a per-minute Vercel cron, following the existing cron + `withCronHealth` pattern. Do not introduce a dedicated worker process (BullMQ, Railway cron service, etc.).**

The five phases shipped together:

**Phase 0 — Queue table.** Added `workflowRunSteps` to `lib/db/schema/workflows.ts` (82). Key columns: `workflowRunId`, `nodeId`, `clientId`, `status` (`pending` | `running` | `completed` | `failed` | `dead_letter`), `attempts`, `nextRetryAt`, `claimedAt`, `claimedBy` (UUID per cron instance). Composite index on `(clientId, status, nextRetryAt)` for efficient poll queries.

**Phase 1 — Live triggers and real action implementations.** `lib/workflows/trigger.ts` `enqueueWorkflowRunsForTrigger()` is now called from live event sites: `crm.contact.created`, `crm.deal.updated` stage-change, `form.submitted`. `send_email` calls Resend with per-step idempotency (step ID as idempotency key). `add_to_list` performs an idempotent subscriber insert (conflict-do-nothing on composite unique key).

**Phase 2 — Cron drainer.** `app/api/cron/process-workflow-runs/route.ts` (371) runs every minute via `vercel.json`. It claims pending steps via CAS update (`UPDATE … SET status='running', claimedAt=now(), claimedBy=<uuid> WHERE status='pending' AND nextRetryAt <= now()`), executes each step's action, and on failure applies exponential backoff: attempt 1 → retry after 1 min; attempt 2 → 5 min; attempt 3 → 30 min; attempt 4+ → `dead_letter`. Stuck-run recovery: any step with `status='running'` and `claimedAt < now() - 10 min` is reset to `pending` so it can be re-claimed. The synchronous `runWorkflow()` is preserved exclusively for the `/[id]/test-run` endpoint.

**Phase 3 — Real condition evaluator.** `evaluateWorkflowExpression()` in `lib/workflows/runtime.ts` (571) replaces the always-true stub. Supports dotted-path field resolution from run context (`crm.contact.email`, `deal.stage`, etc.) and comparison operators (`=`, `!=`, `>`, `<`, `>=`, `<=`, `contains`). Unresolvable paths evaluate to `false`.

**Phase 4 — Observability UI.** `GET /api/portal/workflows/runs/[runId]` (63 lines) returns step detail. `POST /api/portal/workflows/runs/[runId]/retry` resets a `dead_letter` step to `pending`, clearing `claimedAt` and `claimedBy`. Portal run-history drill-down shows step statuses and surfaces a Retry button for dead-lettered steps.

## Consequences

- Workflow action failures are now recoverable: any transient error (Resend API timeout, DB contention) retries automatically up to three times before dead-lettering.
- A portal operator can inspect step-level state and manually retry dead-lettered steps without code changes.
- The cron runs every minute: maximum pipeline latency from trigger to first action execution is ~60 seconds. Multi-step pipelines add one minute of latency per step. This is acceptable for the current use cases (CRM enrichment, list enrollment).
- The `runWorkflow()` synchronous path is retained and tested; it is the correct path for `/[id]/test-run` where immediate feedback matters. Live trigger flows must go through the queue — calling `runWorkflow()` directly on a live trigger event would reintroduce the fire-and-forget regression.
- `workflow_run_steps` migration must be applied to staging/prod before main-merge. `bun run db:generate` + `bun run db:migrate` — verify `DATABASE_URL` points at the target environment before running.
- CAS claim prevents double-execution across concurrent cron invocations (Vercel may overlap minute-cron calls under load). The `claimedBy` UUID allows future debugging of which instance claimed a given step.

## Alternatives considered

| Option | Rejected because |
|---|---|
| BullMQ + Redis | Requires a persistent Redis instance (TCP, not serverless-correct) and a long-lived worker process — new infrastructure with no existing operational pattern in the repo |
| Railway cron service (separate Node process) | Additional Railway service to provision, monitor, and scale; adds cross-service network dependency; no benefit over a Vercel cron when processing volume is low |
| Vercel Queue (beta) | Vendor-specific; not available in all regions; the existing cron pattern is already proven and avoids new primitives |
| Extend the automation_rules event-bus path | The event bus is fire-and-forget and in-process; adding durability there would require the same queue + cron infrastructure and would blur the boundary between the one-shot rule engine and the graph-based workflow builder |
| Keep synchronous `runWorkflow()` as the live trigger path | No retry, no observability, no persistence of intermediate step state; a transient failure silently drops the entire run |

## Related

- Domain map: [[Automations & Workflows]]
- Spec: [[Spec - Durable Automation Runtime]]
- Sibling cron: `app/api/cron/process-scheduled-automations/route.ts` (the automation-rules scheduled cron — same `withCronHealth` pattern)
- Implementation: `lib/db/schema/workflows.ts` (82), `app/api/cron/process-workflow-runs/route.ts` (371), `lib/workflows/runtime.ts` (571)
