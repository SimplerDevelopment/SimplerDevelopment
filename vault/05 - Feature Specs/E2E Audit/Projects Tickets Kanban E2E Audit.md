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

- [ ] Burndown / velocity reporting — needs spec
- [ ] SLA tracking on tickets — needs spec
- [ ] CSAT on ticket close — needs spec
- [ ] Time log entry and reporting — needs spec
- [ ] Recurrence and template creation — needs spec
- [ ] Card recurrences CRUD — POST/GET/DELETE /projects/[id]/recurrences, cadence validation, column-must-belong-to-project guard — needs spec
- [ ] Card templates standalone CRUD — POST/GET/DELETE /projects/[id]/card-templates and /card-templates/[id] outside the clone flow — needs spec
- [ ] Column create and delete — POST /projects/[id]/columns adds a new column; DELETE /projects/[id]/columns/[columnId] removes an empty one — needs spec
- [ ] Column reorder — POST /projects/[id]/columns/reorder persists display order — needs spec
- [ ] Project velocity/CFD/cycle-time analytics — GET /projects/[id]/velocity, /cfd, /cycle-time return 200 and a valid data shape for a project with sprint history — needs spec
- [ ] Project file attachments — POST/GET /projects/[id]/files scopes to tenant and rejects unauthenticated — needs spec
- [ ] Project artifacts link/unlink — POST/DELETE /projects/[id]/artifacts attaches and removes an artifact, tenancy-scoped — needs spec
- [ ] Ticket GET detail — GET /tickets/[id] returns the ticket with its message thread; cross-tenant ticket id returns 404 — needs spec
- [ ] Kanban card comments tenancy — a card comment created on tenant A is not visible when fetching from tenant B's session — needs spec

## Testing


## Blocked


## Passed

- [ ] Projects CRUD for entitled tenant ✓
- [ ] Tickets CRUD for entitled tenant ✓
- [ ] Assignees / watchers ✓
- [ ] Time logs, recurrences, templates, dependencies ✓ (base-tier, no paywall)
- [ ] ✓ verified 2026-06-20: card CRUD verified; publishing columns verified (seed bootstrap fix applied)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No burndown / velocity reporting — see [[Competitive Gap Analysis 2026-06]]
- [ ] No SLA / CSAT on tickets — see [[Competitive Gap Analysis 2026-06]]
- [x] RESOLVED: "No project columns available for test" — seed now bootstraps a Publishing project + columns and wires admin client membership — `scripts/seed-admin-e2e.ts`
- [x] RESOLVED: "Publishing project not found after bootstrap" — same seed fix — `scripts/seed-admin-e2e.ts`


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
