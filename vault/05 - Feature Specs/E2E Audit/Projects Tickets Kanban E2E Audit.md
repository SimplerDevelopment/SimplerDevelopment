---
kanban-plugin: board
type: spec
domain: projects-tickets-kanban
status: active
date: 2026-06-17
sources:
  - lib/db/schema/pm.ts
  - tests/e2e/admin-portal-projects.spec.ts
  - tests/e2e/admin-portal-tickets.spec.ts
  - tests/e2e/pm-assignees-watchers.spec.ts
---

## To Test

- [ ] Burndown / velocity reporting
- [ ] SLA tracking on tickets
- [ ] CSAT on ticket close
- [ ] Time log entry and reporting
- [ ] Recurrence and template creation

## Testing


## Blocked


## Passed

- [ ] Projects CRUD for entitled tenant ✓
- [ ] Tickets CRUD for entitled tenant ✓
- [ ] Assignees / watchers ✓
- [ ] Time logs, recurrences, templates, dependencies ✓ (base-tier, no paywall)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] "No project columns available for test" error observed in Phase 1 — see [[Platform E2E Audit 2026-06-17]]
- [ ] "Publishing project not found after bootstrap" error observed in Phase 1 — see [[Platform E2E Audit 2026-06-17]]
- [ ] No burndown / velocity reporting — see [[Competitive Gap Analysis 2026-06]]
- [ ] No SLA / CSAT on tickets — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
