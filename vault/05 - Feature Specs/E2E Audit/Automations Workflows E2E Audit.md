---
kanban-plugin: board
type: spec
domain: automations-workflows
status: active
date: 2026-06-17
sources:
  - lib/db/schema/workflows.ts
  - lib/db/schema/trigger-links.ts
  - tests/e2e/admin-automations.spec.ts
---

## To Test

- [ ] Branching / conditional logic in workflow — needs spec (BUG: executeStep() reads action from node.data.kind which is undefined for condition nodes, causing NOT NULL constraint failure in workflow_step_logs insert; runs always fail with 'Failed query' error)

## Testing


## Blocked


## Passed

- [ ] Workflow CRUD for entitled tenant ✓
- [ ] Trigger-links as workflow entry points ✓
- [ ] Plain-English→rule parser ✓
- [ ] ✓ verified 2026-06-20 — send_email / add_to_list action kinds (spec: cov-u27.spec.ts)
- [ ] ✓ verified 2026-06-20 — Plain-English rule parser → workflow creation (spec: cov-u27.spec.ts)
- [ ] ✓ verified 2026-06-20 — Visual workflow CRUD: list, create blank, GET by id, DELETE (spec: cov-u27.spec.ts)
- [ ] ✓ verified 2026-06-20 — Visual workflow status transitions: draft → active → paused via PATCH (spec: cov-u27.spec.ts)
- [ ] ✓ verified 2026-06-20 — Visual workflow test-run endpoint returns completed status and step logs (spec: cov-u28.spec.ts)
- [ ] ✓ verified 2026-06-20 — Visual workflow run history: GET /workflows/[id]/runs returns runs array (spec: cov-u28.spec.ts)
- [ ] ✓ verified 2026-06-20 — Visual workflow templates: GET /workflows/templates returns template list; POST with templateId clones graph (spec: cov-u28.spec.ts)
- [ ] ✓ verified 2026-06-20 — Schedule preview: POST /automations/preview-schedule returns description + nextRunAt for valid schedule (spec: cov-u28.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Runtime is fire-and-forget: no durable queue, no retries, no branching — table-stakes gap — see [[Competitive Gap Analysis 2026-06]]
- [ ] enqueueWorkflowRunsForTrigger not wired to live CRM events — see [[Project Board]]
- [ ] send_email / add_to_list action kinds not implemented — see [[Project Board]]
- [ ] Trigger-link click → automation bridge not wired: contactFieldKey stored but never acted on; no trigger_link.clicked event emitted — see trigger-links.ts schema comment
- [ ] Visual workflow builder has zero e2e spec coverage despite having live API routes (list/create/patch/delete/test-run/runs/templates)
- [ ] GAP (no implementation): Durable retry on workflow step failure
- [ ] GAP (no implementation): Loop / iteration step
- [ ] GAP (no implementation): enqueueWorkflowRunsForTrigger wired to live CRM events
- [ ] GAP (no implementation): GET /automations/[id] fetches single rule by id; 404 for unknown id
- [ ] GAP (no implementation): Scope-gated action denial: rule without required scope produces scope_denied log entry, not action execution


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
