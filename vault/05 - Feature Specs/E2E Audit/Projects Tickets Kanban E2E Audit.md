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

- [ ] SLA tracking on tickets — needs spec
- [x] RESOLVED 2026-06-22: CSAT on ticket close — csat_score/comment/submitted_at on support_tickets, POST /tickets/[id]/csat (resolved-gated), aggregate in /tickets/reports — 05cd5290
- [ ] Time log entry and reporting — needs spec
- [ ] Recurrence and template creation — needs spec
- [ ] Card templates standalone CRUD — POST/GET/DELETE /projects/[id]/card-templates and /card-templates/[id] outside the clone flow — needs spec
- [ ] Column create and delete — POST /projects/[id]/columns adds a new column; DELETE /projects/[id]/columns/[columnId] removes an empty one — needs spec
- [ ] Column reorder — POST /projects/[id]/columns/reorder persists display order — needs spec
- [ ] Project artifacts link/unlink — POST/DELETE /projects/[id]/artifacts attaches and removes an artifact, tenancy-scoped — needs spec
- [ ] Kanban card comments tenancy — a card comment created on tenant A is not visible when fetching from tenant B's session — needs spec

## Testing


## Blocked


## Passed

- [ ] Projects CRUD for entitled tenant ✓
- [ ] Tickets CRUD for entitled tenant ✓
- [ ] Assignees / watchers ✓
- [ ] Time logs, recurrences, templates, dependencies ✓ (base-tier, no paywall)
- [ ] ✓ verified 2026-06-20: card CRUD verified; publishing columns verified (seed bootstrap fix applied)
- [ ] ✓ verified 2026-06-20 — Burndown / velocity reporting (cov-u25.spec.ts)
- [ ] ✓ verified 2026-06-20 — Card recurrences CRUD — POST/GET/DELETE /projects/[id]/recurrences, cadence validation, column-must-belong-to-project guard (cov-u23.spec.ts)
- [ ] ✓ verified 2026-06-20 — Project velocity/CFD/cycle-time analytics — GET /projects/[id]/velocity, /cfd, /cycle-time return 200 and a valid data shape for a project with sprint history (cov-u22.spec.ts)
- [ ] ✓ verified 2026-06-20 — Project file attachments — POST/GET /projects/[id]/files scopes to tenant and rejects unauthenticated (cov-u23.spec.ts)
- [ ] ✓ verified 2026-06-20 — Ticket GET detail — GET /tickets/[id] returns the ticket with its message thread; cross-tenant ticket id returns 404 (cov-u24.spec.ts)

## Gaps Found

- [ ] No burndown / velocity reporting — see [[Competitive Gap Analysis 2026-06]]
- [x] RESOLVED: SLA tracking (shipped) + CSAT (2026-06-22, 05cd5290) on tickets — see [[Competitive Gap Analysis 2026-06]]
- [x] RESOLVED: "No project columns available for test" — seed now bootstraps a Publishing project + columns and wires admin client membership — `scripts/seed-admin-e2e.ts`
- [x] RESOLVED: "Publishing project not found after bootstrap" — same seed fix — `scripts/seed-admin-e2e.ts`


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
