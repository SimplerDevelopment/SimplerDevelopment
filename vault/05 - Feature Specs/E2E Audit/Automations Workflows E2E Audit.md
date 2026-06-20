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

- [ ] Durable retry on workflow step failure
- [ ] Branching / conditional logic in workflow
- [ ] Loop / iteration step
- [ ] enqueueWorkflowRunsForTrigger wired to live CRM events
- [ ] send_email / add_to_list action kinds
- [ ] Plain-English rule parser → workflow creation
- [ ] Visual workflow CRUD: list, create blank, GET by id, DELETE
- [ ] Visual workflow status transitions: draft → active → paused via PATCH
- [ ] Visual workflow test-run endpoint returns completed status and step logs
- [ ] Visual workflow run history: GET /workflows/[id]/runs returns runs array
- [ ] Visual workflow templates: GET /workflows/templates returns template list; POST with templateId clones graph
- [ ] Schedule preview: POST /automations/preview-schedule returns description + nextRunAt for valid schedule
- [ ] GET /automations/[id] fetches single rule by id; 404 for unknown id
- [ ] Scope-gated action denial: rule without required scope produces scope_denied log entry, not action execution

## Testing


## Blocked


## Passed

- [ ] Workflow CRUD for entitled tenant ✓
- [ ] Trigger-links as workflow entry points ✓
- [ ] Plain-English→rule parser ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Runtime is fire-and-forget: no durable queue, no retries, no branching — table-stakes gap — see [[Competitive Gap Analysis 2026-06]]
- [ ] enqueueWorkflowRunsForTrigger not wired to live CRM events — see [[Project Board]]
- [ ] send_email / add_to_list action kinds not implemented — see [[Project Board]]
- [ ] Trigger-link click → automation bridge not wired: contactFieldKey stored but never acted on; no trigger_link.clicked event emitted — see trigger-links.ts schema comment
- [ ] Visual workflow builder has zero e2e spec coverage despite having live API routes (list/create/patch/delete/test-run/runs/templates)


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
