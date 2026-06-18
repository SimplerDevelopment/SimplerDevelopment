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


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
