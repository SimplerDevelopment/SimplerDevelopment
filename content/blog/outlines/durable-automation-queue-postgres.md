# Outline: A Durable Automation Queue on Postgres

---

## Meta

**SEO title:** Building a Durable Automation Queue on Postgres
**Meta description:** How we built event-driven automation rules and a durable workflow queue with retries, dead-letter, and a ReactFlow visual builder — all on Postgres, no extra broker.
**URL slug:** `durable-automation-queue-postgres`
**Target audience:** Backend engineers designing job queues without adding Redis/BullMQ; SaaS engineers evaluating Postgres-backed workflow engines.
**Primary keywords:** Postgres job queue, durable automation, workflow engine
**Secondary keywords:** dead-letter queue, exponential backoff, event-driven automation, ReactFlow visual builder

---

## Outline

### H2: Why we kept jobs in Postgres

- Adding a dedicated message broker (Redis, RabbitMQ) introduces a second stateful service to deploy, monitor, and back up.
- Our schema already lives in Postgres; co-locating the queue table means atomically enqueuing a job in the same transaction that creates the triggering record — no two-phase-commit footgun.
- Tradeoff acknowledged: a dedicated broker is better at very high throughput; Postgres is acceptable for agency-SaaS volumes.

### H2: Two automation layers in the same product

The platform ships two distinct automation mechanisms. They are complementary, not redundant.

#### H3: Layer 1 — Automation Rules (event-driven, one-shot)

- **What:** Trigger → conditions → action sequences. Created via a natural-language bar in the portal UI or via the `automations_*` MCP tools.
- **MCP tools:** `automations_create`, `automations_list`, `automations_update`, `automations_delete`, `automations_toggle`.
- **Trigger types:** domain events (CRM deal stage change, booking created, survey submitted, kanban card moved, etc.).
- **Condition evaluation:** runs synchronously against the event payload at trigger time.
- **Actions:** cross-domain mutations — create a Brain note, move a kanban card, send an email, update a CRM record.
- **Scheduling:** rules can be scheduled rather than event-driven (cron expression stored in the rule record).
- **Sub-panels:** Automation rules appear in Brain, Email, Projects, and per-site contexts — each domain surfaces the rules relevant to it.

#### H3: Layer 2 — Visual Workflow Builder (durable, multi-step)

- **What:** ReactFlow node canvas editor where tenants assemble multi-step workflows visually. Each node is a typed step; edges define the execution graph.
- **Routes:** `app/portal/automations/workflows/` (list + templates), `app/portal/automations/workflows/[id]/` (canvas editor).
- **Durable queue backing:** workflow runs are persisted to a Postgres queue table. The drainer polls on a cron cadence and advances runs step by step.
- **Retries:** exponential-backoff retry policy on failed steps.
- **Dead-letter:** steps that exhaust retries land in a dead-letter partition.
- **Run history:** each run writes a history record; the portal UI exposes a "Retry" button against dead-lettered runs.
- **Current status (as of 2026-06-27):** shipped to the `dev` branch on 2026-06-25; pending staging migration before merge to `main`. No MCP tools exist yet for the visual workflow builder.
- **Known limit:** the cron drainer is single-threaded — one batch per minute. This is sufficient for current load but would need horizontal scaling for high-volume tenants.

### H2: The Postgres queue schema pattern

#### H3: The core queue table shape

Key columns on a durable-queue table (generic pattern used in the codebase):

- `id` — primary key
- `clientId` — tenant scope (tenancy invariant applies to queue records too)
- `status` — `pending | running | completed | failed | dead_letter`
- `payload` — JSONB, the step's input data
- `attempts` — integer, how many times this step has been tried
- `maxAttempts` — per-step retry ceiling
- `nextRunAt` — `timestamptz`; the drainer selects `WHERE status = 'pending' AND nextRunAt <= now()`
- `lockedAt`, `lockedBy` — optimistic lock columns to prevent double-execution in future multi-threaded scenarios
- `error` — last error message, for the dead-letter UI

Note: always use `timestamptz` (not bare `timestamp`) for scheduling columns — bare `timestamp` produces incorrect comparisons across timezone offsets.

#### H3: The drainer loop

```
cron (one batch per minute)
  → SELECT FOR UPDATE SKIP LOCKED WHERE status='pending' AND nextRunAt <= now() LIMIT N
  → for each row: executeStep(payload)
      success → UPDATE status='completed'
      failure, attempts < maxAttempts → UPDATE status='pending', nextRunAt = exponential_delay(attempts), attempts++
      failure, attempts >= maxAttempts → UPDATE status='dead_letter', error = last_error
```

- `SELECT FOR UPDATE SKIP LOCKED` is the key primitive: rows locked by one drainer instance are skipped by any concurrent runner, preventing double-execution.
- Current implementation is single-threaded. Horizontal scaling would require distributed locking or partitioned queues.

### H2: Trigger links — a lightweight alternative for one-step automation

- `app/portal/automations/trigger-links/` — tracked shortlinks that fire an automation on click.
- Each trigger link is a URL that, when visited, executes a single automation rule.
- Use case: email a client a link that, on click, moves their deal to the next pipeline stage.
- Forward-looking: the contactFieldKey bridge between trigger links and automation rules is not yet wired (flagged as an open item).

### H2: Lessons from shipping a Postgres job queue

| Lesson | Detail |
|---|---|
| Enqueue in the same transaction as the trigger | Prevents the "job enqueued, trigger record rolled back" split-brain |
| Use `SKIP LOCKED`, not `FOR UPDATE` alone | `FOR UPDATE` blocks; `SKIP LOCKED` skips — critical for concurrent drainers |
| `timestamptz` for all scheduling columns | Bare `timestamp` is a footgun across timezone offsets |
| Dead-letter needs a UI + retry button | Silent dead-letter queues become invisible backlogs |
| Monitor queue depth, not just drainer health | A drainer that runs but never shrinks the queue is a bug, not a win |

### H2: What we'd pull in next

- **Horizontal drainer scaling:** partition the queue by `clientId` range and run one drainer shard per partition.
- **BullMQ upgrade for fire-and-forget tasks:** the survey webhook dispatcher currently uses `setImmediate` — a BullMQ upgrade is planned for Phase 4 to add retry and delivery guarantees.
- **MCP tools for workflow runs:** `workflow_run_start`, `workflow_run_get`, `workflow_run_list` — not yet built.
- **Scheduled campaign dispatcher:** email campaigns with `status=scheduled` have no automated cron dispatcher yet — a known gap.

---

## Key code / concepts to show

- `SELECT FOR UPDATE SKIP LOCKED` snippet for the drainer poll
- Queue table column sketch with `status`, `nextRunAt`, `attempts`, `maxAttempts`
- Exponential backoff formula: `baseDelay * 2^attempts` (with jitter, describe the concept)
- `automations_create` MCP tool call example — creating a rule via AI agent
- Retry-button flow in the run history UI (describe the user-facing affordance)

---

## Internal links

- `/docs/agents/tool-reference#automations_` — MCP tools for automation rules
- `/docs/agents/architecture-for-agents` — extension points section (Automations/Workflows)
- Feature inventory: Automations & Workflows (`vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` §14)

---

## CTA

**Primary:** "Start automating your agency workflows — create your first rule from the Automations panel in the portal."
**Secondary:** Link to MCP `automations_create` tool documentation for agent-driven rule creation.

---

## Screenshot / GIF requirements

1. GIF: ReactFlow canvas editor — adding a node, connecting edges, viewing run history (dev branch preview; label as preview).
2. Screenshot: Automation rules list with NLP creation bar.
3. Diagram: Queue state machine — `pending → running → completed / failed → dead_letter → retry`.
4. Screenshot: Dead-letter run with "Retry" button in run history panel.
5. Do not include fabricated throughput numbers.
