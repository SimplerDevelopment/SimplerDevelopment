# MCP Tools — Projects, Sprints, Kanban & Team

The project management surface lets your AI agent create and manage projects, plan sprints, drive a full kanban workflow (columns, cards, labels, checklists, assignees, dependencies, comments, time logs, file attachments, and artifacts), and manage your team. All tools are scoped to your authenticated client — no tool can read or write another tenant's data.

**Authentication & scopes:** See [MCP Overview](./overview.md). Every tool is guarded by a scope. The required scope is listed for each tool below.

---

## Projects

### `projects_list`

List all projects for your account.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `status` | `"active" \| "paused" \| "completed" \| "archived"` | No | Filter by project status. Omit to return all. |

- **Example call:**

```json
{
  "tool": "projects_list",
  "arguments": { "status": "active" }
}
```

- **Example response:**

```json
[
  {
    "id": 12,
    "name": "Q3 Website Redesign",
    "description": "Full redesign of the marketing site",
    "status": "active",
    "dueDate": null,
    "clientId": 4,
    "createdBy": 7,
    "createdAt": "2026-05-01T10:00:00.000Z",
    "updatedAt": "2026-05-20T14:30:00.000Z"
  }
]
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "projects:read" }` | Missing `projects:read` scope |

---

### `projects_create`

Create a new project. Optionally clone columns, labels, and card templates from an existing project (cards are not copied).

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Project name (min 1 char) |
| `description` | string | No | Optional description |
| `cloneFromProjectId` | number | No | Project id to seed columns, labels, and templates from |

- **Example call:**

```json
{
  "tool": "projects_create",
  "arguments": {
    "name": "Q4 Campaign",
    "description": "Holiday campaign work",
    "cloneFromProjectId": 12
  }
}
```

- **Example response:**

```json
{
  "id": 15,
  "name": "Q4 Campaign",
  "description": "Holiday campaign work",
  "status": "active",
  "clientId": 4,
  "createdBy": 7,
  "createdAt": "2026-06-01T09:00:00.000Z",
  "updatedAt": "2026-06-01T09:00:00.000Z"
}
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "projects:write" }` | Missing scope |
| `{ error: "Source project not found in this account" }` | `cloneFromProjectId` does not belong to your client |

---

### `projects_update`

Update a project's name, description, status, or due date.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Project id |
| `name` | string | No | New name |
| `description` | string | No | New description |
| `status` | `"active" \| "paused" \| "completed" \| "archived"` | No | New status |
| `dueDate` | string | No | ISO date string (e.g. `"2026-09-30"`) |

- **Example call:**

```json
{
  "tool": "projects_update",
  "arguments": { "id": 12, "status": "completed", "dueDate": "2026-08-31" }
}
```

- **Example response:**

```json
{
  "id": 12,
  "name": "Q3 Website Redesign",
  "status": "completed",
  "dueDate": "2026-08-31T00:00:00.000Z",
  "updatedAt": "2026-06-04T08:00:00.000Z"
}
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Not found" }` | Project id not found or not owned by your client |

---

## Project Members

### `project_members_list`

List members and their roles for a project.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |

Roles are `owner`, `editor`, `commenter`, or `viewer`. Staff users (admin/employee) have implicit owner-equivalent access on every project regardless of membership rows.

- **Example call:**

```json
{ "tool": "project_members_list", "arguments": { "projectId": 12 } }
```

- **Example response:**

```json
[
  {
    "id": 3,
    "userId": 7,
    "role": "owner",
    "addedAt": "2026-05-01T10:00:00.000Z",
    "name": "Alice Smith",
    "email": "alice@example.com"
  }
]
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Project not found" }` | Project not found or not owned by your client |

---

### `project_members_set`

Add a user to a project or update their role if already a member. Idempotent. Caller must be a project owner.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `userId` | number | Yes | User id to add or update |
| `role` | `"owner" \| "editor" \| "commenter" \| "viewer"` | Yes | Role to assign |

- **Example call:**

```json
{
  "tool": "project_members_set",
  "arguments": { "projectId": 12, "userId": 9, "role": "editor" }
}
```

- **Example response:**

```json
{
  "id": 5,
  "projectId": 12,
  "userId": 9,
  "role": "editor",
  "addedBy": 7,
  "addedAt": "2026-06-04T08:00:00.000Z"
}
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Project not found" }` | Project not found |
| `{ error: "Only project owners can manage members" }` | Caller is not a project owner |
| `{ error: "Invalid role" }` | Role value not in allowed set |

---

### `project_members_remove`

Remove a user from a project. Refuses to remove the last owner.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `userId` | number | Yes | User id to remove |

- **Example call:**

```json
{ "tool": "project_members_remove", "arguments": { "projectId": 12, "userId": 9 } }
```

- **Example response:**

```json
{ "ok": true }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Project not found" }` | Project not found |
| `{ error: "Only project owners can manage members" }` | Caller is not a project owner |
| `{ error: "Member not found" }` | User is not a project member |
| `{ error: "Cannot remove the sole owner; promote another member first" }` | Last owner guard |

---

## My Tasks

### `my_tasks_list`

List kanban cards assigned to the authenticated user across all of your client's projects.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `openOnly` | boolean | No | Exclude cards in done columns. Defaults to `true`. |

- **Example call:**

```json
{ "tool": "my_tasks_list", "arguments": { "openOnly": true } }
```

- **Example response:**

```json
[
  {
    "id": 88,
    "number": 14,
    "title": "Write landing page copy",
    "priority": "high",
    "dueDate": "2026-06-15T00:00:00.000Z",
    "projectId": 12,
    "projectName": "Q3 Website Redesign",
    "projectKey": "WEB",
    "columnId": 3,
    "columnName": "In Progress",
    "columnIsDone": false
  }
]
```

---

## Project Artifacts

Artifacts are polymorphic links from a project to other platform objects (websites, email campaigns, pitch decks, proposals, booking pages, surveys, posts, and brain notes).

### `projects_artifacts_list`

List all artifacts linked to a project.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |

- **Example call:**

```json
{ "tool": "projects_artifacts_list", "arguments": { "projectId": 12 } }
```

- **Example response:**

```json
[
  {
    "id": 2,
    "projectId": 12,
    "artifactType": "website",
    "artifactId": 5,
    "displayTitle": "Marketing Site",
    "pinned": true,
    "createdBy": 7,
    "createdAt": "2026-06-01T10:00:00.000Z"
  }
]
```

---

### `projects_artifact_link`

Attach an artifact to a project. Supported `artifactType` values: `website`, `email_campaign`, `pitch_deck`, `proposal`, `booking`, `survey`, `post`, `brain_note`.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `artifactType` | string | Yes | One of the supported artifact type values above |
| `artifactId` | number | Yes | Id of the artifact to link |
| `pinned` | boolean | No | Pin the artifact to the top of the list |

- **Example call:**

```json
{
  "tool": "projects_artifact_link",
  "arguments": { "projectId": 12, "artifactType": "pitch_deck", "artifactId": 3, "pinned": false }
}
```

- **Example response:**

```json
{
  "id": 4,
  "projectId": 12,
  "artifactType": "pitch_deck",
  "artifactId": 3,
  "displayTitle": "Q3 Investor Deck",
  "pinned": false,
  "createdBy": 7,
  "createdAt": "2026-06-04T09:00:00.000Z"
}
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Project not found" }` | Project not found or wrong client |
| `{ error: "Artifact not found or not owned by this client" }` | Artifact doesn't exist or belongs to another client |

---

### `projects_artifact_toggle_pin`

Pin or unpin a linked project artifact.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `artifactDbId` | number | Yes | The `id` of the `project_artifacts` link row (not the artifact's own id) |
| `pinned` | boolean | Yes | New pinned state |

---

### `projects_artifact_unlink`

Remove an artifact link from a project. The underlying artifact is not deleted.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `artifactDbId` | number | Yes | The `id` of the `project_artifacts` link row |

- **Example response:**

```json
{ "id": 4, "projectId": 12, "artifactType": "pitch_deck" }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Artifact link not found" }` | Link row id not found on this project |

---

### `projects_propose_artifact_link`

Stage a suggested project-to-artifact link as a pending AI review item instead of writing it directly. The suggestion lands in the brain review queue for a human to approve, edit, or reject. Prefer this tool over `projects_artifact_link` when the suggestion came from automated analysis the user hasn't explicitly authorized.

- **Scope:** `projects:write` + `brain:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `artifactType` | string | Yes | Artifact type (same enum as `projects_artifact_link`) |
| `artifactId` | number | Yes | Artifact id |
| `pinned` | boolean | No | Whether to pin if approved |
| `rationale` | string | No | Explanation for the reviewer |

- **Example response:**

```json
{
  "id": 9,
  "clientId": 4,
  "proposedType": "project_artifact_link",
  "status": "pending",
  "proposedPayload": {
    "projectId": 12,
    "artifactType": "survey",
    "artifactId": 7,
    "pinned": false,
    "rationale": "Survey collects feedback for this project's launch."
  }
}
```

---

## Sprints

### `sprints_list`

List sprints on a project.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `status` | `"planning" \| "active" \| "completed"` | No | Filter by sprint status |

- **Example call:**

```json
{ "tool": "sprints_list", "arguments": { "projectId": 12, "status": "active" } }
```

- **Example response:**

```json
[
  {
    "id": 6,
    "projectId": 12,
    "name": "Sprint 4",
    "goal": "Ship the new nav and hero",
    "startDate": "2026-06-02T00:00:00.000Z",
    "endDate": "2026-06-13T00:00:00.000Z",
    "status": "active",
    "order": 3
  }
]
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Project not found" }` | Project not found or wrong client |

---

### `sprints_create`

Add a sprint to a project. Appends to the end unless `order` is specified.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `name` | string | Yes | Sprint name |
| `goal` | string | No | Sprint goal statement |
| `startDate` | string | No | ISO date |
| `endDate` | string | No | ISO date |
| `status` | `"planning" \| "active" \| "completed"` | No | Defaults to `"planning"` |
| `order` | number | No | Sort position; defaults to end |

- **Example call:**

```json
{
  "tool": "sprints_create",
  "arguments": {
    "projectId": 12,
    "name": "Sprint 5",
    "goal": "Implement contact form and booking flow",
    "startDate": "2026-06-16",
    "endDate": "2026-06-27"
  }
}
```

- **Example response:**

```json
{
  "id": 7,
  "projectId": 12,
  "name": "Sprint 5",
  "goal": "Implement contact form and booking flow",
  "startDate": "2026-06-16T00:00:00.000Z",
  "endDate": "2026-06-27T00:00:00.000Z",
  "status": "planning",
  "order": 4
}
```

---

### `sprints_update`

Update a sprint's name, goal, dates, status, or order.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Sprint id |
| `name` | string | No | New name |
| `goal` | string \| null | No | New goal; pass `null` to clear |
| `startDate` | string \| null | No | ISO date; pass `null` to clear |
| `endDate` | string \| null | No | ISO date; pass `null` to clear |
| `status` | `"planning" \| "active" \| "completed"` | No | New status |
| `order` | number | No | New sort position |

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Sprint not found" }` | Sprint id not found or not owned by your client |

---

### `sprints_delete`

Permanently delete a sprint. Cards currently assigned to the sprint have their `sprintId` cleared (they return to the sprint dock) rather than being deleted.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Sprint id |

- **Example response:**

```json
{ "deleted": true, "id": 7 }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Sprint not found" }` | Sprint not found or wrong client |

---

## Kanban Board & Columns

### `kanban_list_board`

Get all columns and cards for a project. Card responses use a slim projection (description is excluded from the board view; fetch it when opening a card's detail drawer).

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |

- **Example call:**

```json
{ "tool": "kanban_list_board", "arguments": { "projectId": 12 } }
```

- **Example response:**

```json
{
  "columns": [
    { "id": 1, "projectId": 12, "name": "Backlog", "color": null, "order": 0, "isDone": false, "wipLimit": null },
    { "id": 2, "projectId": 12, "name": "In Progress", "color": "#3b82f6", "order": 1, "isDone": false, "wipLimit": 3 },
    { "id": 3, "projectId": 12, "name": "Done", "color": null, "order": 2, "isDone": true, "wipLimit": null }
  ],
  "cards": [
    {
      "id": 88,
      "columnId": 2,
      "projectId": 12,
      "number": 14,
      "title": "Write landing page copy",
      "dueDate": "2026-06-15T00:00:00.000Z",
      "priority": "high",
      "order": 0,
      "sprintId": 6,
      "storyPoints": 3,
      "cardType": "story",
      "workflowState": "in_progress"
    }
  ]
}
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Project not found" }` | Project not found or wrong client |

---

### `kanban_create_column`

Add a column to a project's kanban board.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `name` | string | Yes | Column name |
| `color` | string | No | Hex color like `#3b82f6` |
| `order` | number | No | Sort position; defaults to end of board |

- **Example response:**

```json
{ "id": 4, "projectId": 12, "name": "Review", "color": "#f59e0b", "order": 2, "isDone": false, "wipLimit": null }
```

---

### `kanban_update_column`

Rename, recolor, or reorder a column.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Column id |
| `name` | string | No | New name |
| `color` | string \| null | No | New hex color; `null` to clear |
| `order` | number | No | New sort position |

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Column not found" }` | Column not found |
| `{ error: "Permission denied" }` | Column belongs to a project not owned by your client |

---

### `kanban_delete_column`

Permanently delete a column and every card inside it (cascade).

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Column id |

- **Example response:**

```json
{ "success": true, "id": 4 }
```

---

## Kanban Cards

### `kanban_create_card`

Add a card to a kanban column. Supports agile fields, sprint assignment, hierarchy, and card templates.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `columnId` | number | Yes | Column id the card starts in |
| `title` | string | No* | Card title. Required unless `fromTemplateId` supplies a `titlePattern` |
| `description` | string | No | Card body/description |
| `priority` | `"low" \| "medium" \| "high" \| "urgent"` | No | Defaults to `"medium"` |
| `dueDate` | string | No | ISO date string |
| `sprintId` | number \| null | No | Sprint to assign the card to on creation; omit or `null` to leave in the sprint dock |
| `storyPoints` | integer \| null | No | Story point estimate |
| `cardType` | `"task" \| "story" \| "epic" \| "bug" \| "spike"` | No | Defaults to `"task"` |
| `parentCardId` | number \| null | No | Parent card for hierarchy (e.g. story under epic); must belong to the same project |
| `workflowState` | `"todo" \| "in_progress" \| "in_review" \| "done" \| "canceled"` | No | Defaults to `"todo"` |
| `fromTemplateId` | number | No | Seed fields + checklist + labels from a card template; explicit args override template values |

If a column has a WIP limit set and moving there would exceed it, the call is rejected.

- **Example call:**

```json
{
  "tool": "kanban_create_card",
  "arguments": {
    "projectId": 12,
    "columnId": 1,
    "title": "Set up analytics tracking",
    "priority": "medium",
    "cardType": "task",
    "storyPoints": 2,
    "sprintId": 6
  }
}
```

- **Example response:**

```json
{
  "id": 90,
  "projectId": 12,
  "columnId": 1,
  "number": 16,
  "title": "Set up analytics tracking",
  "priority": "medium",
  "cardType": "task",
  "storyPoints": 2,
  "sprintId": 6,
  "workflowState": "todo",
  "dueDate": null,
  "createdBy": 7,
  "createdAt": "2026-06-04T09:00:00.000Z"
}
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "..." }` | Ownership assertion failure (project/column mismatch) |
| `{ error: "Sprint not found in this project" }` | `sprintId` belongs to a different project |
| `{ error: "Parent card not found in this project" }` | `parentCardId` belongs to a different project |
| `{ error: "title is required (or pass fromTemplateId with a titlePattern)" }` | No title and no template |
| `{ error: "...", code: "wip_limit", limit: N, currentCount: N }` | Column WIP limit exceeded |
| `{ error: "Template not available" }` | `fromTemplateId` not found or wrong client |

---

### `kanban_update_card`

Update card fields. Use `kanban_move_card` to change the column or position.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Card id |
| `title` | string | No | New title |
| `description` | string \| null | No | New description; `null` to clear |
| `priority` | `"low" \| "medium" \| "high" \| "urgent"` | No | New priority |
| `dueDate` | string \| null | No | ISO date; `null` to clear |
| `assignedTo` | number \| null | No | User id to set as the single assignee; `null` to clear all assignees |
| `sprintId` | number \| null | No | Sprint id to assign; `null` to remove from sprint (returns to dock) |
| `storyPoints` | integer \| null | No | New story point estimate |
| `cardType` | `"task" \| "story" \| "epic" \| "bug" \| "spike"` | No | New card type |
| `parentCardId` | number \| null | No | New parent card |
| `workflowState` | `"todo" \| "in_progress" \| "in_review" \| "done" \| "canceled"` | No | New workflow state |

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Card not found" }` | Card id not found |
| `{ error: "Permission denied" }` | Card belongs to a project not owned by your client |
| `{ error: "Sprint not found in this project" }` | `sprintId` doesn't belong to this card's project |

---

### `kanban_move_card`

Move a card to a different column and/or position. Respects WIP limits on the destination column.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `columnId` | number | Yes | Target column id |
| `order` | number | No | Position within the column; defaults to 0 |

- **Example call:**

```json
{ "tool": "kanban_move_card", "arguments": { "cardId": 88, "columnId": 3, "order": 0 } }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Card not found" }` | Card id not found |
| `{ error: "Permission denied" }` | Project not owned by your client |
| `{ error: "...", code: "wip_limit", limit: N, currentCount: N }` | Destination WIP limit exceeded |

---

### `kanban_delete_card`

Permanently delete a kanban card.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Card id |

- **Example response:**

```json
{ "success": true, "id": 88 }
```

---

## Kanban Labels

### `kanban_labels_list`

List all labels defined on a project.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |

- **Example response:**

```json
[
  { "id": 1, "projectId": 12, "name": "bug", "color": "#ef4444" },
  { "id": 2, "projectId": 12, "name": "design", "color": "#6366f1" }
]
```

---

### `kanban_labels_create`

Create a label on a project. Color must be a 6-digit hex; defaults to indigo (`#6366f1`).

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `name` | string | Yes | Label name (max 50 chars) |
| `color` | string | No | Hex color; defaults to `#6366f1` |

---

### `kanban_labels_update`

Rename or recolor a label.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Label id |
| `name` | string | No | New name (max 50 chars) |
| `color` | string | No | New hex color |

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Label not found" }` | Label not found or belongs to another client's project |

---

### `kanban_labels_delete`

Delete a label. Removes it from all cards automatically.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Label id |

- **Example response:**

```json
{ "deleted": true, "id": 1 }
```

---

### `kanban_card_attach_label`

Add a project label to a card.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `labelId` | number | Yes | Label id (must belong to the same project as the card) |

- **Example response:**

```json
{ "attached": true }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Card not found" }` | Card not found or wrong client |
| `{ error: "Label not in this project" }` | Label belongs to a different project |

---

### `kanban_card_detach_label`

Remove a label from a card.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `labelId` | number | Yes | Label id |

- **Example response:**

```json
{ "detached": true }
```

---

## Kanban Checklists

### `kanban_checklist_list`

List checklist items for a card.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |

- **Example response:**

```json
[
  { "id": 1, "cardId": 88, "text": "Write copy", "completed": false, "completedAt": null, "order": 0 },
  { "id": 2, "cardId": 88, "text": "Get approval", "completed": true, "completedAt": "2026-06-03T14:00:00.000Z", "order": 1 }
]
```

---

### `kanban_checklist_add`

Append a checklist item to a card.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `text` | string | Yes | Item text (max 500 chars) |

---

### `kanban_checklist_update`

Rename, toggle complete, or reorder a checklist item.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Checklist item id |
| `text` | string | No | New text (max 500 chars) |
| `completed` | boolean | No | Mark complete or incomplete |
| `order` | number | No | New sort position |

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Checklist item not found" }` | Item not found or belongs to another client's card |

---

### `kanban_checklist_delete`

Permanently remove a checklist item.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Checklist item id |

- **Example response:**

```json
{ "deleted": true, "id": 1 }
```

---

## Kanban Assignees

### `kanban_card_assignees_list`

Return all users assigned to a card.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |

- **Example response:**

```json
[
  { "id": 7, "name": "Alice Smith", "email": "alice@example.com" }
]
```

---

### `kanban_card_assign`

Add a user as a card assignee. Also automatically adds them as a watcher.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `userId` | number | Yes | User id to assign |

- **Example response:**

```json
{ "assigned": true }
```

---

### `kanban_card_unassign`

Remove a user from a card.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `userId` | number | Yes | User id to remove |

- **Example response:**

```json
{ "unassigned": true }
```

---

## Kanban Dependencies

### `kanban_card_dependencies_list`

Return the blockers (cards blocking this one) and blocking (cards this one blocks) for a card.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |

- **Example response:**

```json
{
  "blockers": [{ "id": 75, "number": 8, "title": "Set up CI pipeline" }],
  "blocking": []
}
```

---

### `kanban_card_add_blocker`

Mark this card as blocked by another card in the same project.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | The card being blocked |
| `blockerCardId` | number | Yes | The card doing the blocking |

- **Example response:**

```json
{ "added": true }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "A card cannot block itself" }` | Self-reference |
| `{ error: "Blocker must be in the same project" }` | Cross-project dependency not allowed |
| `{ error: "Reciprocal dependency would create a cycle" }` | Direct cycle detected |

---

### `kanban_card_remove_blocker`

Remove a blocker dependency from a card.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `blockerCardId` | number | Yes | Blocker card id to remove |

- **Example response:**

```json
{ "removed": true }
```

---

## Kanban Comments & Time Logs

### `kanban_card_list_comments`

List comments on a kanban card.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |

- **Example response:**

```json
[
  {
    "id": 5,
    "cardId": 88,
    "userId": 7,
    "body": "Copy is ready for review @9",
    "mentions": [9],
    "createdAt": "2026-06-03T15:00:00.000Z"
  }
]
```

---

### `kanban_card_add_comment`

Add a comment to a kanban card. Supports `@mentions` as an array of user ids.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `body` | string | Yes | Comment text |
| `mentions` | number[] | No | Array of user ids mentioned |

---

### `kanban_card_log_time`

Log minutes worked on a card.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `minutes` | integer | Yes | Minutes worked (min 1) |
| `note` | string | No | Optional note about the work |
| `loggedAt` | string | No | ISO datetime; defaults to now |

- **Example response:**

```json
{
  "id": 3,
  "cardId": 88,
  "userId": 7,
  "minutes": 90,
  "note": "Initial draft",
  "loggedAt": "2026-06-04T09:00:00.000Z"
}
```

---

## Kanban File Attachments

### `kanban_card_attach_file_from_url`

Download a remote file (HTTP/HTTPS, 25 MB maximum) and attach it to a kanban card. The file is stored in S3 using the same pipeline as media uploads.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `url` | string | Yes | Public HTTP or HTTPS URL of the file to download |
| `filename` | string | No | Override filename; defaults to the URL basename |

- **Example call:**

```json
{
  "tool": "kanban_card_attach_file_from_url",
  "arguments": {
    "cardId": 88,
    "url": "https://example.com/brief.pdf",
    "filename": "project-brief.pdf"
  }
}
```

- **Example response:**

```json
{
  "id": 2,
  "cardId": 88,
  "originalName": "project-brief.pdf",
  "mimeType": "application/pdf",
  "fileSize": 204800,
  "url": "https://cdn.example.com/uploads/abc123-project-brief.pdf"
}
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "URL rejected: ..." }` | SSRF guard blocked the URL |
| `{ error: "Refusing to follow redirects on remote upload (SSRF guard)." }` | Redirect on the remote URL |
| `{ error: "Fetch failed: ..." }` | Network error fetching the URL |
| `{ error: "Fetch returned N" }` | Remote server returned a non-2xx status |
| `{ error: "File too large (N bytes)." }` | File exceeds 25 MB |

---

## Kanban Card Artifacts

Card artifacts link platform objects to individual cards (same types as project artifacts plus `project`, but not `brain_note`).

Supported `artifactType` values: `website`, `email_campaign`, `pitch_deck`, `proposal`, `booking`, `survey`, `project`, `post`.

### `kanban_card_artifacts_list`

List all artifacts linked to a card.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |

---

### `kanban_card_artifact_link`

Attach an artifact to a kanban card.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `artifactType` | string | Yes | Artifact type (see list above) |
| `artifactId` | number | Yes | Artifact id |
| `pinned` | boolean | No | Pin to the top |

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Card not found" }` | Card not found or wrong client |
| `{ error: "Artifact not found or not owned by this client" }` | Artifact doesn't exist or belongs to another client |

---

### `kanban_card_artifact_toggle_pin`

Update the pinned flag on a linked card artifact.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `artifactDbId` | number | Yes | `id` of the `kanban_card_artifacts` link row |
| `pinned` | boolean | Yes | New pinned state |

---

### `kanban_card_artifact_unlink`

Remove an artifact link from a card. The underlying artifact is not deleted.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `cardId` | number | Yes | Card id |
| `artifactDbId` | number | Yes | `id` of the link row |

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Artifact link not found" }` | Link row not found on this card |

---

## Card Templates

### `kanban_card_templates_list`

List card templates available to a project — both project-scoped and client-wide templates.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |

- **Example response:**

```json
[
  {
    "id": 1,
    "clientId": 4,
    "projectId": null,
    "name": "Standard Bug Report",
    "description": "Use for all bug tickets",
    "payload": {
      "titlePattern": "Bug: ",
      "cardType": "bug",
      "priority": "high",
      "checklist": [
        { "text": "Reproduce the issue", "order": 0 },
        { "text": "Identify root cause", "order": 1 }
      ]
    }
  }
]
```

---

### `kanban_card_templates_create`

Create a reusable card template. Set `clientWide: true` to make it available across every project in your account.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project context for ownership; ignored if `clientWide` is true |
| `name` | string | Yes | Template name (max 100 chars) |
| `description` | string | No | Template description (max 5000 chars) |
| `clientWide` | boolean | No | Make available to all projects |
| `payload` | object | Yes | Template fields (see below) |

**`payload` fields:**

| Field | Type | Description |
|---|---|---|
| `titlePattern` | string | Default title; `{{date}}` is replaced with the creation date in recurring tasks |
| `description` | string | Default card description |
| `cardType` | `"task" \| "story" \| "epic" \| "bug" \| "spike"` | Default card type |
| `priority` | `"low" \| "medium" \| "high" \| "urgent"` | Default priority |
| `storyPoints` | integer | Default story point estimate |
| `workflowState` | `"todo" \| "in_progress" \| "in_review" \| "done" \| "canceled"` | Default workflow state |
| `labelIds` | number[] | Label ids to attach on creation |
| `checklist` | `{ text: string, order?: number }[]` | Default checklist items |

---

### `kanban_card_templates_delete`

Permanently delete a card template. This action is irreversible.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Template id |

- **Example response:**

```json
{ "ok": true }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Template not found" }` | Template not found or belongs to another client |

---

## Sprint Planner

### `kanban_propose_sprint`

Generate a greedy sprint-packing proposal for a project's backlog. This is a read-only planning tool — commit the chosen assignments by calling `kanban_update_card` with the target `sprintId` for each recommended card.

The planner packs cards from the prioritized backlog (`sprintId = null`, ordered by `sprintOrder` then `order`) up to the point cap, respecting unfinished blockers, and returns four buckets: `recommended`, `skipped`, `blocked`, and `unsized`.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `targetPoints` | integer \| null | No | Hard point cap. If `null`, defaults to 1.1× recent average velocity |
| `velocityWindow` | integer | No | Number of recent completed sprints to average for the velocity baseline. Default 6, min 1, max 20 |
| `requireCardIds` | number[] | No | Card ids already pinned for the sprint; these bypass capacity and blocker gates |

- **Example call:**

```json
{
  "tool": "kanban_propose_sprint",
  "arguments": {
    "projectId": 12,
    "targetPoints": 20,
    "velocityWindow": 4,
    "requireCardIds": [88]
  }
}
```

- **Example response:**

```json
{
  "recommended": [
    { "id": 88, "number": 14, "title": "Write landing page copy", "storyPoints": 3 },
    { "id": 91, "number": 17, "title": "Implement booking form", "storyPoints": 5 }
  ],
  "skipped": [],
  "blocked": [{ "id": 92, "number": 18, "title": "Deploy to staging", "blockerCardIds": [91] }],
  "unsized": [{ "id": 93, "number": 19, "title": "Team retro doc" }],
  "velocityBaseline": 18,
  "velocityWindowSprints": 4,
  "backlogTotal": 10
}
```

---

## Recurring Tasks

### `kanban_recurrences_list`

List card recurrence rules for a project — both active and paused — sorted by next fire time.

- **Scope:** `projects:read`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |

---

### `kanban_recurrences_create`

Configure a recurring card-creation rule. `{{date}}` in `titlePattern` is replaced with the firing date (`YYYY-MM-DD`) at each run. You must supply either `templateId` or `titlePattern`.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | number | Yes | Project id |
| `columnId` | number | Yes | Column where new cards are created |
| `cadence` | `"daily" \| "weekly" \| "monthly"` | Yes | Recurrence frequency |
| `dayOfWeek` | integer | No | 0 (Sun) – 6 (Sat); used when `cadence` is `"weekly"` |
| `dayOfMonth` | integer | No | 1 – 28; used when `cadence` is `"monthly"` |
| `hourUtc` | integer | No | Hour (UTC, 0–23) to fire; defaults to 9 |
| `templateId` | number | No | Card template to apply on each fire |
| `titlePattern` | string | No | Card title pattern (can include `{{date}}`); required if `templateId` not provided |
| `description` | string | No | Default card description (max 5000 chars) |

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Either templateId or titlePattern is required" }` | Neither supplied |

---

### `kanban_recurrences_delete`

Permanently delete a recurring task rule. Future card generation stops immediately.

- **Scope:** `projects:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | number | Yes | Recurrence rule id |

- **Example response:**

```json
{ "ok": true }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Recurrence not found" }` | Rule not found or belongs to another client |

---

## Team & Client

### `team_list_members`

List users with access to this client account. Returns each user's name, email, and role.

- **Scope:** `team:read`
- **Inputs:** None

- **Example call:**

```json
{ "tool": "team_list_members", "arguments": {} }
```

- **Example response:**

```json
[
  {
    "memberId": 1,
    "role": "owner",
    "userId": 7,
    "name": "Alice Smith",
    "email": "alice@example.com",
    "joinedAt": "2026-01-15T10:00:00.000Z"
  }
]
```

---

### `team_invite`

Invite a user to this client by email. If the email is unknown, a new user account is created with a generated temporary password (returned once in the response — store it and deliver it to the user). If the email already exists, the user is linked as a member without a password change. Only the account owner can invite members.

- **Scope:** `team:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | New user's display name |
| `email` | string | Yes | Email address to invite |

New members are always given the `member` role; use `team_update_role` to promote them.

- **Example call:**

```json
{
  "tool": "team_invite",
  "arguments": { "name": "Bob Jones", "email": "bob@example.com" }
}
```

- **Example response (new user):**

```json
{
  "member": { "id": 6, "clientId": 4, "userId": 11, "role": "member" },
  "user": { "id": 11, "name": "Bob Jones", "email": "bob@example.com" },
  "isNewUser": true,
  "tempPassword": "a3f2b9c1d7e0"
}
```

- **Example response (existing user):**

```json
{
  "member": { "id": 6, "clientId": 4, "userId": 11, "role": "member" },
  "user": { "id": 11, "name": "Bob Jones", "email": "bob@example.com" },
  "isNewUser": false,
  "tempPassword": null
}
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Only the account owner can invite members" }` | Caller is not the account owner |
| `{ error: "User is already a team member" }` | Email already linked to this client |

---

### `team_update_role`

Change a team member's client role.

- **Scope:** `team:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `memberId` | number | Yes | The `client_members.id` (from `team_list_members`) |
| `role` | `"owner" \| "admin" \| "member" \| "viewer"` | Yes | New role |

Note: there is no server-side guard preventing you from demoting the last owner. Be careful.

- **Example response:**

```json
{ "id": 1, "clientId": 4, "userId": 7, "role": "admin" }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Member not found" }` | `memberId` not found on this client |

---

### `team_remove_member`

Remove a user's access to this client account. Does not delete the user account itself.

- **Scope:** `team:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `memberId` | number | Yes | The `client_members.id` to remove |

- **Example response:**

```json
{ "success": true, "memberId": 6 }
```

- **Errors:**

| Code | Message |
|---|---|
| `{ error: "Member not found" }` | `memberId` not found on this client |

---

### `client_get`

Return the full client record (company name, phone, website, address, email prefix, notes).

- **Scope:** `team:read`
- **Inputs:** None

- **Example response:**

```json
{
  "id": 4,
  "company": "Acme Corp",
  "phone": "+1-555-0100",
  "website": "https://acme.example.com",
  "address": "123 Main St, Springfield",
  "notes": "VIP client",
  "emailPrefix": "acme"
}
```

---

### `client_update`

Update the authenticated client's profile. You cannot change email or Stripe customer id via MCP.

- **Scope:** `team:write`
- **Inputs:**

| Name | Type | Required | Description |
|---|---|---|---|
| `company` | string \| null | No | Company name |
| `phone` | string \| null | No | Phone number |
| `website` | string \| null | No | Public website URL |
| `address` | string \| null | No | Mailing address |
| `notes` | string \| null | No | Internal notes |
