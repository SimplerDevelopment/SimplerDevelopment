---
title: "Building a Durable Automation Queue on Postgres"
slug: "durable-automation-queue-postgres"
description: "How we built event-driven automation rules and a durable workflow queue with retries, dead-letter, and a ReactFlow visual builder — all on Postgres, no extra broker."
date: "2026-06-27"
tags:
  - postgres
  - automation
  - workflow-engine
  - job-queue
  - backend
author: "SimplerDevelopment Team"
draft: true
---

When you run a multi-tenant agency SaaS, automation is not a nice-to-have — it is the difference between a client who says "the platform just handles that" and one who has to remember seventeen manual steps. We shipped two complementary automation engines inside the same product, and we did it without adding a dedicated message broker to the deployment topology. Here is how we thought about it and what the architecture looks like in practice.

## Why we kept jobs in Postgres

The obvious move for any job queue is to reach for Redis and BullMQ, or a managed queue service. We evaluated that path and landed elsewhere, for a concrete reason: our schema already lives in Postgres. Co-locating the queue table means we can enqueue a job in the **same database transaction** that creates the triggering record. There is no window between "the trigger exists" and "the job exists" because both happen atomically. A separate broker introduces a two-phase write: commit to the application database, then publish to the broker. If the application crashes between those two steps, the job is silently lost.

The tradeoff is real. A dedicated broker can handle orders of magnitude more throughput. For agency-SaaS volumes — dozens to low hundreds of concurrent tenant operations — Postgres is sufficient, and the operational simplicity of not running a second stateful service pays for itself every time you deploy or restore a database.

## Two automation layers in the same product

The platform ships two distinct automation mechanisms. They are complementary, not redundant. Layer 1 handles event-driven, one-shot operations. Layer 2 handles durable, multi-step workflows that need guaranteed execution, retries, and an audit trail.

### Layer 1 — Automation Rules (event-driven, one-shot)

An automation rule is a trigger → conditions → action sequence. Tenants create them through a natural-language bar in the portal UI: type "When a deal moves to Proposal Sent, create a Brain note and add a kanban card to the Client Delivery board" and the rule is parsed, validated, and stored.

The same rules are accessible programmatically via the `automations_*` MCP tools — `automations_create`, `automations_list`, `automations_update`, `automations_delete`, and `automations_toggle`. An AI agent connected to the portal can set up, inspect, and modify automation rules without any human clicking through the UI.

Trigger types span the entire platform: CRM deal stage changes, bookings created, surveys submitted, kanban cards moved, Brain notes tagged, and more. Conditions are evaluated synchronously against the event payload at trigger time, so there is no queue involved — if the conditions pass, the actions run inline. Actions are cross-domain mutations: create a Brain note, send an email, update a CRM record, move a kanban card.

Rules can also be scheduled rather than event-driven — a cron expression stored on the rule record fires the action sequence on a fixed cadence. Sub-panels in Brain, Email, Projects, and per-site contexts each surface the automation rules relevant to that domain, so tenants see the right rules in context rather than one undifferentiated global list.

### Layer 2 — Visual Workflow Builder (durable, multi-step)

The visual workflow builder is a ReactFlow node canvas editor where tenants assemble multi-step workflows visually. Each node is a typed step; directed edges define the execution graph. Think: "Send onboarding email → wait 3 days → if no booking, send follow-up → if booking confirmed, create Brain note."

Unlike Layer 1, these runs are **durable**. Every run is persisted to a Postgres queue table. A cron drainer polls on a per-minute cadence, picks up pending steps, advances them, and writes results back — all in Postgres.

The visual workflow builder shipped to the `dev` branch on 2026-06-25 and is pending staging migration before merge to `main`. It does not yet have dedicated MCP tools; for now it is a portal-only authoring experience. MCP tools for workflow runs (`workflow_run_start`, `workflow_run_get`, `workflow_run_list`) are a planned next step.

## The Postgres queue schema pattern

The durable queue table is the heart of Layer 2. The key columns:

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `clientId` | Tenant scope — queue records carry tenancy just like every other table |
| `status` | `pending \| running \| completed \| failed \| dead_letter` |
| `payload` | JSONB — the step's input data |
| `attempts` | Integer — how many times this step has been tried |
| `maxAttempts` | Per-step retry ceiling |
| `nextRunAt` | `timestamptz` — the drainer selects `WHERE status = 'pending' AND nextRunAt <= now()` |
| `lockedAt`, `lockedBy` | Optimistic lock columns to prevent double-execution if the drainer ever runs concurrently |
| `error` | Last error message — surfaced in the dead-letter UI |

One footgun worth calling out explicitly: use `timestamptz` (timezone-aware) for every scheduling column, never bare `timestamp`. A bare timestamp produces incorrect comparisons across timezone offsets — the drainer can fire late, fire early, or skip rows entirely depending on the server's locale. We make this a schema-level rule enforced in code review.

### The drainer loop

The drainer runs on a cron cadence (once per minute in the current implementation) and executes this loop:

```sql
SELECT id, payload, attempts, maxAttempts, clientId
FROM workflow_queue
WHERE status = 'pending'
  AND nextRunAt <= now()
ORDER BY nextRunAt
LIMIT 50
FOR UPDATE SKIP LOCKED;
```

`SELECT FOR UPDATE SKIP LOCKED` is the critical primitive. Without `SKIP LOCKED`, a second concurrent drainer instance trying to pick up the same batch would block, waiting for the first to release its locks. With `SKIP LOCKED`, the second instance silently skips rows that are already locked and works on uncontested rows instead. This is the difference between a scalable queue and a serialized bottleneck.

For each claimed row the drainer calls `executeStep(payload)`. On success it marks the row `completed`. On failure:

- If `attempts < maxAttempts`: update `status = 'pending'`, increment `attempts`, and set `nextRunAt = now() + baseDelay * 2^attempts` — exponential backoff, with a small random jitter to spread retry storms.
- If `attempts >= maxAttempts`: update `status = 'dead_letter'` and write the last error message to the `error` column.

The current drainer is single-threaded — one batch per minute, one Postgres connection. This is sufficient for current tenant load. Horizontal scaling would require partitioning the queue by `clientId` range and running one drainer shard per partition, using `lockedBy` to identify which shard owns which rows.

## Dead-letter needs a UI, not just a column

A dead-letter queue that silently accumulates failed runs is worse than no dead-letter queue at all — you get false confidence that your automation is running while a growing invisible backlog builds. We treat dead-letter as a first-class portal UI concern.

Every workflow run writes a history record. The portal's run history view shows the full execution trace: which steps completed, which failed, how many retry attempts each step consumed, and what error was recorded. Dead-lettered runs surface a **Retry** button. Clicking it resets `status` to `pending`, resets `attempts` to zero, and sets `nextRunAt` to now — the run re-enters the queue at the head of the line.

This retry affordance is the reason we store the error message on the row rather than only in logs. The portal user needs to see why a run died before deciding whether to retry.

## Trigger links — a lightweight alternative for one-step automation

Not every automation needs a multi-step workflow or even a conditional rule. Sometimes a client just needs: "Email me a link. When I click it, move the deal forward."

That is what trigger links handle. A trigger link is a tracked shortlink (`app/portal/automations/trigger-links/`) that, when visited, fires a single automation rule. The use case: send a client a proposal, include a trigger link, and when they open it the CRM deal advances to the next pipeline stage automatically — no webhook integration, no polling.

A forward-looking capability — bridging trigger links to automation rules via a `contactFieldKey` so the rule can act on the contact who clicked — is designed but not yet wired.

## Lessons from shipping a Postgres job queue

| Lesson | Detail |
|---|---|
| Enqueue in the same transaction as the trigger | Prevents the silent split-brain where the trigger record commits but the job never appears |
| Use `SKIP LOCKED`, not `FOR UPDATE` alone | `FOR UPDATE` blocks concurrent drainers; `SKIP LOCKED` skips — critical for any concurrency |
| `timestamptz` for all scheduling columns | Bare `timestamp` is a footgun across timezone offsets |
| Dead-letter needs a UI and a Retry button | Silent dead-letter queues become invisible backlogs |
| Monitor queue depth, not just drainer health | A drainer that runs but never shrinks the queue is a bug, not a metric to celebrate |

## What we are building next

**Horizontal drainer scaling.** Partition the queue by `clientId` range and run one drainer shard per partition. The `lockedBy` column is already in the schema for this purpose.

**BullMQ for fire-and-forget tasks.** The survey webhook dispatcher currently uses `setImmediate` — no retry, no delivery guarantee. A BullMQ upgrade is planned to bring retry semantics to that path without pulling the entire workflow queue into a broker.

**MCP tools for workflow runs.** `workflow_run_start`, `workflow_run_get`, and `workflow_run_list` are next on the roadmap. Once these exist, an AI agent can start a workflow run programmatically, poll its status, and surface the result to a user — the same pattern the `automations_*` tools use for Layer 1 today.

**Scheduled campaign dispatcher.** Email campaigns with `status = scheduled` currently have no automated cron dispatcher. This is a known gap — the schedule is stored, but nothing executes it.

---

Keeping automation state in Postgres rather than a separate broker is a deliberate bet on operational simplicity over raw throughput. For the scale we run at, the atomicity guarantees are worth more than the marginal throughput headroom. If that calculus changes, the `lockedBy` column and the `SKIP LOCKED` pattern already give us a path to horizontal scaling without re-architecting the schema.

**Start automating your agency workflows.** Create your first rule from the Automations panel in your portal, or use the `automations_create` MCP tool to wire up rules programmatically from your AI agent setup.

---

*See also: [MCP tool reference — automations](/docs/agents/tool-reference#automations_) · [Architecture for agents](/docs/agents/architecture-for-agents) · [Automations & Workflows domain map](/vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md)*
