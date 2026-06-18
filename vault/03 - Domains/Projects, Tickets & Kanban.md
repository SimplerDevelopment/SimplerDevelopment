---
type: domain-map
domain: projects-pm
status: active
date: 2026-06-10
sources:
  - lib/tickets/
  - lib/db/schema/pm.ts
  - lib/mcp/tools/services.ts
  - app/api/portal/projects/[id]/velocity/
  - app/portal/my-tasks/
  - app/portal/projects/automations/
  - components/portal/SuggestedProjectRequestForm.tsx
---

# Domain: Projects, Tickets & Kanban

## Purpose

Project management layer for portal clients. Covers the full lifecycle from
project creation through sprint planning, kanban board work, and support-ticket
handling. Also surfaces "Suggested Projects" — a catalogue of pre-defined
service packages clients can request. Data is always scoped to `clientId`; no
row is readable across tenants.

---

## Key entry points

| Area | Path |
|---|---|
| DB schema (all PM tables) | `lib/db/schema/pm.ts` |
| SLA helpers | `lib/tickets/sla.ts` |
| Sprint snapshot writer | `lib/portal/sprint-snapshots.ts` |
| PM notifications (inbox + email) | `lib/pm-notifications.ts` |
| Portal projects list & detail | `app/portal/projects/` |
| Portal ticket list / new / detail | `app/portal/tickets/` |
| Portal suggested-projects | `app/portal/suggested-projects/` |
| Portal my-tasks page | `app/portal/my-tasks/` |
| Portal project automations | `app/portal/projects/automations/` |
| Projects REST API | `app/api/portal/projects/[id]/` |
| Cards REST API | `app/api/portal/cards/[id]/` |
| Sprints REST API | `app/api/portal/sprints/[id]/` |
| Tickets REST API | `app/api/portal/tickets/[id]/` |
| Admin overlay (tickets + projects) | `app/api/admin/portal/tickets/`, `app/api/admin/portal/projects/` |
| Cron: column snapshots | `app/api/cron/pm-column-snapshots/` |
| Cron: card recurrences | `app/api/cron/pm-recurrences/` |
| Cron: ticket SLA breaches | `app/api/cron/ticket-sla-breaches/` |

---

## Data model

### Projects

Table `projects`. Tenant-scoped via `clientId`. Key fields: `name`, `projectKey`
(short slug), `status` (active / paused / completed / archived), `systemKind`
(null = user project; `'publishing'` = Publishing Command Center board — hidden
from the normal `/portal/projects` listing). Dates: `startDate`, `dueDate`.

Access control table `project_members` with roles: `owner`, `editor`,
`commenter`, `viewer`. Staff (admin / employee) have implicit owner-level access
and do not need a row here.

### Sprints

Table `sprints`. Belongs to a project. Statuses: `planning`, `active`,
`completed`. Ordered by `order` within a project. Sprint scope changes are
event-sourced into `sprint_scope_history` (actions: `sprint_started`, `added`,
`removed`, `completed`, `reopened`), which powers burndown and velocity charts
without retroactive point drift. Retrospectives stored in `sprint_retros` /
`sprint_retro_items`; action items can be promoted to kanban cards.

### Tasks / Cards

Table `kanban_cards`. Belongs to both a `projectId` and a `columnId`. Key fields:

- `cardType`: `task`, `story`, `epic`, `bug`, `spike`
- `priority`: `low`, `medium`, `high`, `urgent`
- `workflowState`: `todo`, `in_progress`, `in_review`, `done`, `canceled`
  (intentionally separate from column position — multiple columns can map to the
  same workflow state)
- `storyPoints`, `parentCardId` (for epic hierarchy), `sprintId` / `sprintOrder`
- `campaignId` / `scheduledFor` (Publishing Command Center integration)

Satellites: `kanban_card_labels` (M2M via `kanban_labels`),
`kanban_card_assignees`, `kanban_card_watchers`, `kanban_card_dependencies`
(blocker graph), `kanban_card_checklist_items`, `kanban_card_comments`,
`kanban_card_time_logs`, `kanban_card_files`, `kanban_card_activities` (audit
log), `kanban_card_artifacts` (polymorphic links to other platform resources),
`card_custom_field_values`.

Card templates in `card_templates` (client-scoped or project-scoped). Recurring
card generation via `card_recurrences` (cadence: `daily`, `weekly`, `monthly`),
fired by the `pm-recurrences` cron.

### Tickets

Table `support_tickets`. Tenant-scoped via `clientId`; optionally linked to a
`projectId`. Status flow: `open` -> `in_progress` -> `waiting_on_customer` ->
`resolved` -> `closed`. SLA deadlines (`firstResponseDueAt`, `resolutionDueAt`)
are stamped at create time by `lib/tickets/sla.ts` using a priority-keyed policy
map. Thread messages in `ticket_messages`; staff-only notes via `isInternal`.

SLA policies (calendar hours, not business hours): urgent 2h/8h, high 4h/24h,
medium 12h/72h, low 24h/168h.

### Webhooks

Table `project_webhooks`: endpoint `url`, HMAC `secret`, `events` (jsonb array
of event name strings), `active` flag, `lastFiredAt`, `lastStatus` (HTTP
response code of the most recent delivery), `failureCount`. Project-scoped via
`projectId`.

Table `project_webhook_deliveries`: delivery log per fired event. Fields:
`webhookId`, `event` (event name), `status` (HTTP response code), `error`
(nullable text), `payload` (jsonb), `createdAt`. Used for the delivery history
panel in `components/portal/ProjectWebhooksPanel.tsx`.

### Team

Table `project_members` (per-project roles). Portal user membership in
`client_members` (from `lib/db/schema/sites.ts`). The `team.ts` MCP registrar
surfaces `team_list_members`, `team_invite`, `team_update_role`,
`team_remove_member`, `client_get`, `client_update` as cross-cutting tools not
strictly PM-specific.

---

## API surface

All routes under `app/api/portal/` return `{ success, data | error }`.

| Resource | Routes |
|---|---|
| Projects CRUD + members | `app/api/portal/projects/`, `app/api/portal/projects/[id]/`, `app/api/portal/projects/[id]/members/` |
| Cards (create/list) | `app/api/portal/projects/[id]/cards/` |
| Card mutations | `app/api/portal/cards/[id]/` and sub-routes: `move`, `labels`, `assignees`, `checklist`, `comments`, `time-logs`, `files`, `dependencies`, `artifacts`, `custom-fields`, `watch`, `unsubscribe` |
| Columns | `app/api/portal/projects/[id]/columns/`, `columns/[columnId]/`, `columns/reorder/` |
| Sprints | `app/api/portal/projects/[id]/sprints/`, `app/api/portal/sprints/[id]/`, sub-routes: `burndown`, `capacity`, `card-order`, `retro` |
| Labels | `app/api/portal/projects/[id]/labels/` |
| Goals | `app/api/portal/projects/[id]/goals/` |
| Custom fields | `app/api/portal/projects/[id]/custom-fields/` |
| Card templates | `app/api/portal/projects/[id]/card-templates/` |
| Recurrences | `app/api/portal/projects/[id]/recurrences/` |
| Saved views | `app/api/portal/projects/[id]/saved-views/` |
| Webhooks | `app/api/portal/projects/[id]/webhooks/`, `app/api/portal/project-webhooks/[id]/` |
| Files | `app/api/portal/projects/[id]/files/` |
| Artifacts | `app/api/portal/projects/[id]/artifacts/`, `artifacts/available/` |
| Reports: CFD | `app/api/portal/projects/[id]/cfd/` |
| Reports: cycle time | `app/api/portal/projects/[id]/cycle-time/` |
| Reports: velocity | `app/api/portal/projects/[id]/velocity/` |
| Tickets | `app/api/portal/tickets/`, `tickets/[id]/`, `tickets/[id]/messages/`, `tickets/[id]/assignees/` |
| Suggested projects | `app/api/portal/suggested-projects/`, `suggested-project-requests/` |
| Brain task promote | `app/api/portal/brain/tasks/[id]/promote-to-kanban/` |

---

## MCP tools

All tools are scoped; read tools require `projects:read` or `tickets:read`;
write tools require `projects:write` or `tickets:write`.

### `lib/mcp/tools/kanban.ts`

`kanban_list_board`, `kanban_create_column`, `kanban_update_column`,
`kanban_delete_column`, `kanban_create_card`, `kanban_move_card`,
`kanban_update_card`, `kanban_delete_card`, `kanban_labels_list`,
`kanban_labels_create`, `kanban_labels_update`, `kanban_labels_delete`,
`kanban_card_attach_label`, `kanban_card_detach_label`,
`kanban_checklist_list`, `kanban_checklist_add`, `kanban_checklist_update`,
`kanban_checklist_delete`, `kanban_card_assignees_list`, `kanban_card_assign`,
`kanban_card_unassign`, `kanban_card_dependencies_list`,
`kanban_card_add_blocker`, `kanban_card_remove_blocker`,
`kanban_card_list_comments`, `kanban_card_add_comment`,
`kanban_card_log_time`, `kanban_card_attach_file_from_url`,
`kanban_card_artifacts_list`, `kanban_card_artifact_link`,
`kanban_card_artifact_toggle_pin`, `kanban_card_artifact_unlink`,
`kanban_card_templates_list`, `kanban_card_templates_create`,
`kanban_card_templates_delete`, `kanban_propose_sprint`,
`kanban_recurrences_list`, `kanban_recurrences_create`,
`kanban_recurrences_delete`

### `lib/mcp/tools/sprints.ts`

`sprints_list`, `sprints_create`, `sprints_update`, `sprints_delete`

### `lib/mcp/tools/projects.ts`

`projects_list`, `projects_create`, `projects_update`,
`project_members_list`, `project_members_set`, `project_members_remove`,
`my_tasks_list`, `projects_artifacts_list`, `projects_artifact_link`,
`projects_artifact_toggle_pin`, `projects_artifact_unlink`,
`projects_propose_artifact_link`

### `lib/mcp/tools/tickets.ts`

`tickets_list`, `tickets_get`, `tickets_create`, `tickets_reply`,
`tickets_update`, `tickets_attach_file_from_url`

### `lib/mcp/tools/team.ts`

`team_list_members`, `team_invite`, `team_update_role`, `team_remove_member`,
`client_get`, `client_update`

### `lib/mcp/tools/services.ts` (PM-relevant)

`suggested_projects_list` (`services:read`), `suggested_project_requests_create`
(`services:write`). These tools surface the suggested-projects catalogue and
intake pathway; they use `services:*` scopes, not `projects:*`.

---

## UI surfaces

| Component | Path |
|---|---|
| Kanban board (drag-and-drop) | `components/portal/KanbanBoard.tsx` |
| Card detail drawer (sectioned) | `components/portal/card-detail/CardDetailModal.tsx` |
| Card detail sections | `components/portal/card-detail/_sections/` (Activity, Artifacts, Checklist, Children, Comments, CustomFields, Dependencies, Description, Files, Header, Labels, Sidebar, TimeLogs, Watchers) |
| Sprint planning panel | `components/portal/SprintPlanning.tsx` |
| Sprint retro panel | `components/portal/SprintRetroPanel.tsx` |
| Backlog tab | `components/portal/BacklogTab.tsx` |
| Project roadmap tab | `components/portal/ProjectRoadmapTab.tsx` |
| Project reports tab | `components/portal/ProjectReportsTab.tsx` |
| Project members tab | `components/portal/ProjectMembersTab.tsx` |
| Project goals panel | `components/portal/ProjectGoalsPanel.tsx` |
| Project custom fields panel | `components/portal/ProjectCustomFieldsPanel.tsx` |
| Project artifacts tab | `components/portal/ProjectArtifactsTab.tsx` |
| Recurrences panel | `components/portal/ProjectRecurrencesPanel.tsx` |
| Webhooks panel | `components/portal/ProjectWebhooksPanel.tsx` |
| Ticket filters | `components/portal/TicketIndexFilters.tsx` |
| Ticket reply form | `components/portal/TicketReplyForm.tsx` |
| Ticket SLA badge | `components/portal/TicketSlaBadge.tsx` |
| Ticket status control | `components/portal/TicketStatusControl.tsx` |
| Suggested projects modal | `components/portal/SuggestedProjectsModal.tsx` |
| Suggested project request form | `components/portal/SuggestedProjectRequestForm.tsx` |
| My tasks dashboard widget | `components/portal/dashboard/widgets/MyTasksWidget.tsx` |
| Active projects metric widget | `components/portal/dashboard/widgets/MetricActiveProjectsWidget.tsx` |

---

## Tests & gates

| Layer | Files |
|---|---|
| Unit — sprint charts | `tests/unit/sprint-charts.test.ts` |
| Unit — sprint planner | `tests/unit/sprint-planner.test.ts` |
| Unit — MCP kanban tools | `tests/unit/mcp-tools-kanban.test.ts`, `tests/unit/mcp-tools-kanban-coverage.test.ts` |
| Unit — MCP sprints tools | `tests/unit/mcp-tools-sprints.test.ts` |
| Unit — MCP projects tools | `tests/unit/mcp-tools-projects.test.ts` |
| Unit — MCP tickets tools | `tests/unit/mcp-tools-tickets.test.ts` |
| Unit — project permissions | `tests/unit/project-permissions.test.ts` |
| Unit — my tasks collect | `tests/unit/portal-my-tasks-collect.test.ts`, `tests/unit/myTasksCollect.test.ts` |
| Unit — component tests | `tests/unit/components-kanban-board.test.tsx`, `tests/unit/components-sprint-planning.test.tsx`, `tests/unit/components-portal-project-*.test.tsx`, `tests/unit/project-reports-tab-coverage.test.tsx` |
| Unit — ticket API routes | `tests/unit/api-tickets-id-and-crm-contacts-id-routes.test.ts` |
| E2E — full PM suite | `tests/e2e/pm-cards-core.spec.ts`, `pm-kanban-ui.spec.ts`, `pm-sprints.spec.ts`, `pm-labels.spec.ts`, `pm-column-controls.spec.ts`, `pm-assignees-watchers.spec.ts`, `pm-checklist.spec.ts`, `pm-dependencies.spec.ts`, `pm-move-card.spec.ts`, `pm-webhooks.spec.ts`, `pm-my-tasks.spec.ts` |
| E2E — portal projects | `tests/e2e/portal-projects.spec.ts`, `portal-projects-role-flows.spec.ts`, `portal-project-webhooks.spec.ts` |
| E2E — tickets | `tests/e2e/portal-tickets.spec.ts`, `admin-portal-tickets.spec.ts`, `qa-portal-b-dashboard-inbox-tickets.spec.ts` |
| E2E — admin overlay | `tests/e2e/admin-portal-projects.spec.ts` |
| E2E — suggested projects | `tests/e2e/portal-suggested-projects.spec.ts` |

No dedicated tenancy tag for PM tables at time of writing; run
`bun test:tenancy` after any data-access change to `pm.ts` tables anyway.

---

## Cross-domain dependencies

- **CRM** (`lib/db/schema/crm.ts`): `kanban_card_artifacts` and
  `project_artifacts` use the same `artifactType` vocabulary as
  `crm_deal_artifacts`. Card/project artifact links can reference CRM entities
  (proposals, contracts, deals). The kanban MCP tool file imports CRM tables
  for artifact resolution.
- **CMS / Publishing**: cards on `systemKind='publishing'` projects carry
  `campaignId` and `scheduledFor` fields that mirror onto `posts.scheduledFor`
  and `email_campaigns.scheduledAt`. The Publishing Command Center board is a
  system-managed project surfaced under a separate portal route.
- **Company Brain**: `app/api/portal/brain/tasks/[id]/promote-to-kanban/`
  converts a Brain task to a kanban card. The `projects_propose_artifact_link`
  MCP tool requires both `projects:write` and `brain:write` scopes.
- **Agency / Onboarding**: `suggested_projects` + `suggested_project_requests`
  are the intake pathway for new project requests from clients — feeds into the
  agency billing / approval flow.
- **Notifications / Email**: `lib/pm-notifications.ts` writes both in-app
  `notifications` rows and triggers emails for card assignments, mentions, due
  dates, and ticket replies.

---

## Invariants & gotchas

- `systemKind` projects are hidden from `GET /api/portal/projects` and must be
  accessed by feature-specific routes (e.g. Publishing Command Center).
- `workflowState` and column position are intentionally decoupled. Do not
  derive workflow state from column order.
- `sprint_scope_history` is the source of truth for burndown/velocity — never
  backfill it manually.
- `column_daily_snapshots` is written by the `pm-column-snapshots` cron once
  per project per day; the unique index makes re-runs idempotent.
- SLA timestamps are stamped at ticket creation and not recomputed on priority
  change. If priority changes, the deadlines are stale — a planned follow-up.
- `projectMembers` only stores non-staff users. Admin / employee accounts have
  implicit full access and will not appear in membership queries.
- Drizzle correlated-subquery footgun: use hardcoded `table.column` strings in
  `sql\`\`` outer references; `${table.col}` emits unqualified names (see
  `lib/db/CLAUDE.md`).
- After any change to `pm.ts` tables: run `bun test:tenancy`.

---

## Planning notes

- SLA engine is calendar-hours only; business-hours math and per-tenant SLA
  overrides are noted as TODOs in `lib/tickets/sla.ts`.
- Goal progress (`project_goals`) is manual-only; auto-derivation from card
  states is a follow-up.
- `parentCardId` on `kanban_cards` has no FK constraint declared (circular
  self-reference limitation); referential integrity is enforced in application
  code only.
- The `kanban_card_dependencies` table supports a full blocker graph; no cycle
  detection is implemented at the DB layer.

---

## Related

- [[CRM]]
- [[Agency, Onboarding & Branding]]
- [[Company Brain & AI]]
- [[CMS & Blocks]]
