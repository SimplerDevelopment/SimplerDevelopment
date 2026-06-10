---
type: domain-map
domain: automations
status: active
date: 2026-06-09
sources:
  - lib/automation/
  - lib/workflows/
  - lib/db/schema/workflows.ts
---

# Domain: Automations & Workflows

## Purpose

Two complementary engines let tenants automate work inside the platform:

1. **Automation Rules engine** (`lib/automation/`) — event-driven, one-shot rules: "when event X fires, if conditions pass, run a flat list of actions." Lightweight, fast, and already wired into live CRM, booking, survey, and email events via a fire-and-forget in-process event bus.

2. **Visual Workflow builder** (`lib/workflows/`) — a HighLevel-style node canvas: a graph of typed trigger / action / condition nodes that can branch, wait, and chain. The runtime is in-process and demo-grade (no durable queue, no retries). The canvas is live in the portal but the trigger wiring is a shim — only the `/api/portal/workflows/[id]/test-run` endpoint fires live runs today.

**Disambiguation — root `workflows/` directory:** The repo root contains no active `workflows/` directory. Any such directory would be frozen n8n JSON exports from a prior phase, not part of this domain.

---

## Key entry points

| File / Directory | Role |
|---|---|
| `lib/automation/index.ts` | Barrel — auto-initializes engine + survey notifications on import |
| `lib/automation/engine.ts` | Rule engine: event → condition eval → action dispatch; playbook bridge |
| `lib/automation/event-bus.ts` | In-process pub/sub; `emitEvent()` fire-and-forget; `AUTOMATION_EVENTS` catalogue |
| `lib/automation/schedule.ts` | Compute / validate / describe time-based triggers (daily/weekly/monthly/cron) |
| `lib/automation/nlp-parser.ts` | Claude-backed plain-English → structured trigger/condition/action JSON |
| `lib/automation/survey-notifications.ts` | Survey-specific automation handler registered on the event bus |
| `lib/automation/product-presets.ts` | Pre-authored rule presets per product scope |
| `lib/workflows/types.ts` | Discriminated-union types: `WorkflowTriggerConfig`, `WorkflowAction`, `WorkflowGraph` |
| `lib/workflows/runtime.ts` | In-process DFS graph walker; logs each step; `runWorkflow()` entry point |
| `lib/workflows/trigger.ts` | `enqueueWorkflowRunsForTrigger()` — finds matching active workflows and fires them (shim, not yet wired to live events) |
| `lib/workflows/templates.ts` | Five starter templates cloned into `workflows` rows on "New from template" |
| `lib/db/schema/brain.ts` | `automation_rules` + `automation_logs` tables (lines 59–101) |
| `lib/db/schema/workflows.ts` | `workflows` + `workflow_runs` + `workflow_step_logs` tables |
| `lib/db/schema/trigger-links.ts` | `trigger_links` + `trigger_link_clicks` tables |
| `lib/mcp/tools/automations.ts` | MCP tool registrar for automation rules CRUD + toggle |

---

## Data model

### Automation Rules (event-driven, one-shot)
Defined in `lib/db/schema/brain.ts` lines 59–101.

- **`automation_rules`** — per-tenant rules. Key columns: `trigger` (JSON `AutomationTrigger`), `conditions` (JSON array), `actions` (JSON `AutomationAction[]`), `enabled`, `source` (`nlp` | `settings` | `manual`), `productScope`, `schedule` (JSON `AutomationSchedule` — null = event-driven), `nextRunAt`, `executionCount`, `lastExecutedAt`.
- **`automation_logs`** — execution log per rule firing: `triggerEvent`, `triggerPayload`, `actionsExecuted`, `status` (`success` | `partial` | `failed`), `duration`, `errorMessage`.

### Visual Workflows (graph-based)
Defined in `lib/db/schema/workflows.ts`.

- **`workflows`** — the canvas definition: `trigger` (JSON `WorkflowTriggerConfig`), `graph` (JSON `WorkflowGraph` — nodes + edges), `status` (`draft` | `active` | `paused`), scoped to `clientId`.
- **`workflow_runs`** — one row per execution: `triggeredBy` (free-form string), `status` (`pending` | `running` | `completed` | `failed`), `context` (JSON), `startedAt`, `completedAt`, `error`.
- **`workflow_step_logs`** — one row per node executed in a run: `nodeId`, `action`, `status` (`success` | `failed` | `skipped`), `input`, `output`, `durationMs`.

### Trigger Links
Defined in `lib/db/schema/trigger-links.ts`.

- **`trigger_links`** — tracked shortlinks: globally-unique `slug` (used in `/go/<slug>`), `destinationUrl`, optional `contactFieldKey` (forward-looking hook to set a CRM contact field on click — not yet acted upon).
- **`trigger_link_clicks`** — click record per hit: `linkId`, `clientId` (denormalized), optional `contactId` (never populated today), `ip`, `userAgent`, `referer`.

---

## API surface

| Route | Method(s) | Purpose |
|---|---|---|
| `app/api/portal/automations/route.ts` | GET, POST | List / create automation rules |
| `app/api/portal/automations/[id]/route.ts` | GET, PATCH, DELETE | Single rule CRUD |
| `app/api/portal/automations/logs/route.ts` | GET | Execution log query |
| `app/api/portal/automations/parse/route.ts` | POST | NLP parse: plain English → rule JSON |
| `app/api/portal/automations/preview-schedule/route.ts` | POST | Preview next N fire times for a schedule |
| `app/api/portal/workflows/route.ts` | GET, POST | List / create workflows |
| `app/api/portal/workflows/[id]/route.ts` | GET, PATCH, DELETE | Single workflow CRUD |
| `app/api/portal/workflows/[id]/runs/route.ts` | GET | Run history for a workflow |
| `app/api/portal/workflows/[id]/test-run/route.ts` | POST | Fire a workflow synchronously for testing |
| `app/api/portal/workflows/templates/route.ts` | GET | List starter templates |
| `app/api/portal/trigger-links/route.ts` | GET, POST | List / create trigger links |
| `app/api/portal/trigger-links/[id]/route.ts` | GET, PATCH, DELETE | Single trigger link CRUD |
| `app/go/[slug]/route.ts` | GET | Public redirect resolver — records click, 302s to destination |
| `app/api/cron/process-scheduled-automations/route.ts` | GET (cron) | Per-minute scan of `nextRunAt`; fires scheduled rules |
| `app/api/cron/failing-automations-notify/route.ts` | GET (cron) | Daily digest notifying of repeatedly-failing rules |
| `app/api/admin/portal/automations/route.ts` | GET | Admin-level view of rules across all tenants |
| `app/api/admin/portal/automations/logs/route.ts` | GET | Admin-level log view |

---

## MCP tools

Registered in `lib/mcp/tools/automations.ts` via `registerAutomationsTools()`. All tools are scope-guarded.

| Tool name | Scope | Purpose |
|---|---|---|
| `automations_list` | `automations:read` | List rules (filter by `enabled`, `productScope`) |
| `automations_toggle` | `automations:write` | Flip `enabled` flag only |
| `automations_create` | `automations:write` | Create a rule (trigger / conditions / actions JSON) |
| `automations_update` | `automations:write` | Update name, trigger, conditions, or actions |
| `automations_delete` | `automations:write` | Delete a rule (logs retained) |

No MCP tools exist for the visual workflow builder yet.

---

## UI surfaces

| Route | Surface |
|---|---|
| `app/portal/automations/page.tsx` | Main automations list (rules, NLP creation bar) |
| `app/portal/automations/trigger-links/page.tsx` | Trigger links list / create UI |
| `app/portal/automations/workflows/page.tsx` | Visual workflow list (templates, new workflow) |
| `app/portal/automations/workflows/[id]/page.tsx` | ReactFlow canvas editor for a single workflow |
| `app/portal/brain/automations/` | Brain-scoped automations sub-panel |
| `app/portal/email/automations/` | Email-scoped automations sub-panel |
| `app/portal/projects/automations/` | Projects-scoped automations sub-panel |
| `app/portal/websites/[siteId]/automations/` | Website-scoped automations sub-panel |
| `app/admin/automations/` | Internal admin panel for cross-tenant rule inspection |

---

## Tests & gates

| File | Layer | What it covers |
|---|---|---|
| `tests/unit/automationSchedule.test.ts` | unit | `computeNextRunAt` / `validateSchedule` / `describeSchedule` |
| `tests/unit/cron-scheduled-automations.test.ts` | unit | Scheduled-automation cron route handler |
| `tests/unit/cron-failing-automations-notify.test.ts` | unit | Failing-automations notify cron handler |
| `tests/unit/brain-automation-playbook-bridge.test.ts` | unit | `start_playbook` action in engine |
| `tests/unit/brain-event-bus-playbook-bridge.test.ts` | unit | Event-bus playbook auto-start handler |
| `tests/unit/workflows-runtime.test.ts` | unit | `runWorkflow` happy path |
| `tests/unit/workflows-runtime-branches.test.ts` | unit | Condition branch / DFS walk |
| `tests/unit/workflows-templates.test.ts` | unit | Template clone shape |
| `tests/unit/mcp-tools-automations.test.ts` | unit | MCP tool scope guards and handlers |
| `tests/integration/api/automation-engine.test.ts` | integration | Full engine event → rule → log cycle |
| `tests/integration/api/automations/rules.test.ts` | integration | CRUD API + tenancy isolation |
| `tests/integration/api/automations/logs.test.ts` | integration | Logs query |
| `tests/integration/api/automations/parse.test.ts` | integration | NLP parse endpoint |
| `tests/integration/api/portal/workflows/crud.test.ts` | integration | Workflow CRUD |
| `tests/integration/api/portal/workflows/runs.test.ts` | integration | Run history |
| `tests/integration/api/portal/workflows/templates.test.ts` | integration | Template list |
| `tests/integration/api/portal/workflows/test-run.test.ts` | integration | Synchronous test-run endpoint |
| `tests/e2e/portal-automations.spec.ts` | e2e | Portal automations UI smoke |
| `tests/e2e/portal-automations-services-hosting-mutations.spec.ts` | e2e | Mutation flows |
| `tests/e2e/trigger-links.spec.ts` | e2e | Trigger link create / click flow |
| `tests/e2e/admin-automations.spec.ts` | e2e | Admin panel smoke |

Run gate: `scripts/test.sh --layer=integration --no-coverage` covers tenancy + API contracts. After any `automation_rules` or `workflows` data-access change, also run `bun test:tenancy`.

---

## Cross-domain dependencies

- **Brain / Company Brain** — `engine.ts` bridges to `lib/brain/playbook-runs.ts` via the `start_playbook` action. Event-bus playbook auto-start also lives in `engine.ts`. `automationRules` and `automationLogs` tables are co-located in `lib/db/schema/brain.ts` (historical co-location, not a merge).
- **CRM** — CRM mutations emit `crm.contact.created`, `crm.deal.updated`, `crm.deal.won`, etc. into the event bus. The workflow trigger kind `deal.stage_changed` is the canonical CRM hook for the visual builder.
- **Email & Campaigns** — `email.campaign.sent`, `email.subscriber.added`, `email.subscriber.unsubscribed` events are catalogued. The `send_email` action kind in the visual builder is stubbed (`status: skipped`) pending wiring to `lib/email/sender`.
- **Surveys** — `survey.response_submitted` event fires from `lib/automation/survey-notifications.ts`. The `add_to_list` action kind is similarly stubbed.
- **Bookings** — booking lifecycle events (`booking.created`, `booking.guest_booked`, etc.) are in `AUTOMATION_EVENTS`.
- **Plugins** — `run_plugin_script` action in `engine.ts` dispatches to the plugin runner (`lib/plugins/`) after entitlement check.

---

## Invariants & gotchas

- **Two separate engines, two separate tables.** `automation_rules` (in `brain.ts`) powers the live event-driven path. `workflows` (in `workflows.ts`) powers the visual canvas. They coexist and do not yet talk to each other — the shim comment in `lib/workflows/trigger.ts` is explicit about this.
- **Visual workflow runtime is demo-grade.** No retry logic, no durable queue, no parallelism beyond DFS fan-out within a single process call. The `maxWaitMs` cap (default 5s) prevents the `wait` action from blocking a real server thread. Do not wire high-volume or latency-sensitive flows through it yet.
- **Trigger links are not yet wired to automation.** `contactFieldKey` column and `contactId` on clicks are stored but never acted upon. The automation bridge described in `trigger-links.ts` is explicitly forward-looking.
- **`automation_rules.schedule` null = event-driven; non-null = cron-driven.** The per-minute cron (`process-scheduled-automations`) skips rules with `schedule IS NULL`; the event-driven engine path skips rules with `schedule IS NOT NULL`. The two paths are mutually exclusive per rule.
- **NLP parser uses the tenant's Claude API key** (resolved via `lib/ai/resolve-client-key.ts`) and bills AI usage via `lib/ai/audit.ts`.
- **Event bus is in-process and fire-and-forget.** A serverless cold-start that does not import `lib/automation/index.ts` will not have the engine registered. The barrel auto-initializes on import; any API route that needs to trigger automations must import from `lib/automation`.
- **Tenancy is enforced at every layer.** Rule queries always filter `eq(automationRules.clientId, clientId)`. The workflow runtime stamps `clientId` into every `workflowRuns` row. The `/go/<slug>` resolver is the only global-namespace path — slug uniqueness is enforced by `UNIQUE` constraint.

---

## Planning notes

- Visual workflow trigger wiring (contact.created, deal.stage_changed, schedule cron) is marked TODO in `lib/workflows/trigger.ts`. When implementing, call `enqueueWorkflowRunsForTrigger` from the same call sites that already call `emitEvent`.
- `send_email` and `add_to_list` action kinds in the visual builder are stubbed. Wire to `lib/email/sender` and `lib/email/` list subscribers respectively.
- Trigger link → automation bridge: populate `contactId` on `trigger_link_clicks` and act on `contactFieldKey` via a post-click automation event (e.g. `trigger_link.clicked`).
- Multi-instance dedup for playbook auto-starts is in-memory only (`recentAutoStarts` set in `engine.ts`). A note in the code flags Redis SET as the upgrade path if multi-instance deployment bites this.
- `automation_rules` partial index for failed logs is declared in raw SQL only (Drizzle does not support partial indexes via schema API) — track this if the logs table grows large.

---

## Related

[[CRM]] | [[Email & Campaigns]] | [[Surveys]] | [[Company Brain & AI]] | [[Bookings & Services]]
