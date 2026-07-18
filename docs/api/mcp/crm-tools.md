# MCP Tools — CRM, Services & Tickets

The CRM, Services, and Tickets tool groups let you manage your full customer lifecycle from within any MCP-capable agent: search contacts and companies, drive deals through pipelines, log activities, create proposals and contracts, request services from the agency, and manage support tickets. All tools operate on data scoped to your tenant — you cannot read or write another client's records.

**Authentication / overview:** See [./overview.md](./overview.md).

---

## Required scopes

| Scope | Grants |
|---|---|
| `crm:read` | All CRM list/get/search tools |
| `crm:write` | All CRM create/update/delete tools |
| `services:read` | Service catalog + service request list + suggested projects list |
| `services:write` | Submit service requests and suggested project requests |
| `tickets:read` | List / get support tickets |
| `tickets:write` | Create / reply / update / attach files to tickets |

---

## Approval vs. direct writes

Most CRM write tools apply changes immediately. A small subset — `proposals_create`, `proposals_update`, and `proposals_send` — route through the approval workflow when your MCP token is configured for staged changes. When a tool is staged rather than applied, the response includes `"pending": true` alongside a `pendingId` and `summary` field. The user must click the approval URL to confirm. All other tools in this document write directly.

---

## Contacts

### `crm_contacts_search`

Search CRM contacts by name or email.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `query` | `string` (optional) | Free-text search against `first_name`, `last_name`, `email` (ILIKE). Omit to list all. |
| `status` | `"active" \| "inactive" \| "lead" \| "customer"` (optional) | Filter by contact status. |
| `limit` | `number` 1–200 (optional, default `50`) | Max rows returned. |

- **Response:**

```json
[
  {
    "id": 12,
    "client_id": 3,
    "first_name": "Ada",
    "last_name": "Lovelace",
    "email": "ada@example.com",
    "phone": "+1-555-0100",
    "title": "CTO",
    "status": "customer",
    "score": 42,
    "created_at": "2026-01-15T10:00:00.000Z"
  }
]
```

- **Errors:** `{ "error": "<db error message>" }` on query failure.

```json
{
  "tool": "crm_contacts_search",
  "input": { "query": "Ada", "status": "customer", "limit": 10 }
}
```

---

### `crm_contacts_create`

Create a new CRM contact.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `firstName` | `string` (required) | First name. |
| `lastName` | `string` (optional) | Last name. |
| `email` | `string` email (optional) | |
| `phone` | `string` (optional) | |
| `linkedinUrl` | `string` URL (optional) | |
| `title` | `string` (optional) | Job title. |
| `companyId` | `number` (optional) | Link to a CRM company. |
| `status` | `"active" \| "inactive" \| "lead" \| "customer"` (optional, default `"active"`) | |
| `notes` | `string` (optional) | |

- **Response:** Full inserted contact row.

```json
{
  "id": 13,
  "clientId": 3,
  "firstName": "Grace",
  "lastName": "Hopper",
  "email": "grace@example.com",
  "status": "lead",
  "ownerId": 7,
  "createdAt": "2026-06-04T12:00:00.000Z"
}
```

- **Errors:** Validation error if `email` is not a valid email format.

```json
{
  "tool": "crm_contacts_create",
  "input": {
    "firstName": "Grace",
    "lastName": "Hopper",
    "email": "grace@example.com",
    "status": "lead"
  }
}
```

---

### `crm_contacts_update`

Update any mutable field on a CRM contact. Pass `null` to clear a nullable field.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | Contact ID. |
| `firstName` | `string` (optional) | |
| `lastName` | `string \| null` (optional) | |
| `email` | `string \| null` (optional) | |
| `phone` | `string \| null` (optional) | |
| `linkedinUrl` | `string \| null` (optional) | |
| `title` | `string \| null` (optional) | |
| `companyId` | `number \| null` (optional) | |
| `status` | `"active" \| "inactive" \| "lead" \| "customer"` (optional) | |
| `source` | `string \| null` (optional) | Lead source label. |
| `notes` | `string \| null` (optional) | |
| `score` | `number` (optional) | Lead score override. |
| `ownerId` | `number \| null` (optional) | Assigned user. |

- **Response:** Full updated contact row.
- **Errors:** `{ "error": "Contact not found" }` if `id` does not belong to your client.

```json
{
  "tool": "crm_contacts_update",
  "input": { "id": 13, "status": "customer", "score": 80 }
}
```

---

## Companies

### `crm_companies_search`

Search CRM companies by name or domain.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `query` | `string` (optional) | ILIKE search against `name` and `domain`. |
| `limit` | `number` (optional, default `50`) | Max rows. |

- **Response:** Array of company rows (all columns from `crm_companies` for your client).

```json
[
  {
    "id": 5,
    "client_id": 3,
    "name": "Acme Corp",
    "domain": "acme.com",
    "industry": "Manufacturing",
    "website": "https://acme.com",
    "created_at": "2026-02-01T00:00:00.000Z"
  }
]
```

- **Errors:** `{ "error": "<db error message>" }` on query failure.

```json
{
  "tool": "crm_companies_search",
  "input": { "query": "Acme" }
}
```

---

### `crm_companies_create`

Create a new CRM company.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `name` | `string` (required) | Company name. |
| `domain` | `string` (optional) | e.g. `acme.com`. |
| `industry` | `string` (optional) | |
| `website` | `string` (optional) | |
| `phone` | `string` (optional) | |
| `notes` | `string` (optional) | |

- **Response:** Full inserted company row.

```json
{
  "tool": "crm_companies_create",
  "input": { "name": "Acme Corp", "domain": "acme.com", "industry": "Manufacturing" }
}
```

---

### `crm_companies_update`

Update any mutable field on a CRM company.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | Company ID. |
| `name` | `string` (optional) | |
| `domain` | `string \| null` (optional) | |
| `industry` | `string \| null` (optional) | |
| `size` | `string \| null` (optional) | e.g. `"11-50"`. |
| `phone` | `string \| null` (optional) | |
| `address` | `string \| null` (optional) | |
| `website` | `string \| null` (optional) | |
| `notes` | `string \| null` (optional) | |

- **Response:** Full updated company row.
- **Errors:** `{ "error": "Company not found" }`.

```json
{
  "tool": "crm_companies_update",
  "input": { "id": 5, "size": "51-200", "industry": "Technology" }
}
```

---

## Deals

### `crm_deals_list`

List deals across all pipelines, or scoped to one.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `pipelineId` | `number` (optional) | Limit to one pipeline. |
| `status` | `"open" \| "won" \| "lost"` (optional) | Filter by deal status. |

- **Response:** Array of deal rows ordered by `createdAt` descending.

```json
[
  {
    "id": 88,
    "clientId": 3,
    "title": "Enterprise plan upgrade",
    "pipelineId": 2,
    "stageId": 7,
    "value": 1200000,
    "status": "open",
    "expectedCloseDate": "2026-08-01T00:00:00.000Z"
  }
]
```

```json
{
  "tool": "crm_deals_list",
  "input": { "pipelineId": 2, "status": "open" }
}
```

---

### `crm_deals_get`

Fetch a single deal with joined display fields from its contact, company, and stage. Optionally include custom field values.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `dealId` | `number` (required) | Deal ID. |
| `includeCustomFields` | `boolean` (optional) | When `true`, attaches `customFields: { [fieldId]: { name, type, value } }` to the response. |

- **Response:**

```json
{
  "id": 88,
  "title": "Enterprise plan upgrade",
  "value": 1200000,
  "currency": "USD",
  "status": "open",
  "priority": "high",
  "stageName": "Proposal Sent",
  "stageColor": "#6366f1",
  "contactFirstName": "Ada",
  "contactLastName": "Lovelace",
  "contactEmail": "ada@example.com",
  "companyName": "Acme Corp",
  "customFields": {
    "14": { "name": "Contract value tier", "type": "select", "value": "Enterprise" }
  }
}
```

- **Errors:** `{ "error": "Deal not found" }`.

```json
{
  "tool": "crm_deals_get",
  "input": { "dealId": 88, "includeCustomFields": true }
}
```

---

### `crm_deals_create`

Create a new deal in a pipeline stage.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `title` | `string` (required) | Deal name. |
| `pipelineId` | `number` (required) | Pipeline the deal belongs to. |
| `stageId` | `number` (required) | Initial stage. Must belong to the given pipeline and your client. |
| `value` | `number` (optional) | Deal value **in cents**. |
| `contactId` | `number` (optional) | Associated contact. Must belong to your client. |
| `companyId` | `number` (optional) | Associated company. Must belong to your client. |
| `expectedCloseDate` | `string` ISO date (optional) | e.g. `"2026-09-30"`. |
| `notes` | `string` (optional) | |

- **Response:** Full inserted deal row.
- **Errors:** `{ "error": "Pipeline not found" }`, `{ "error": "Stage not found" }`, `{ "error": "Contact not found" }`, `{ "error": "Company not found" }` if any referenced ID does not belong to your client.

```json
{
  "tool": "crm_deals_create",
  "input": {
    "title": "Enterprise plan upgrade",
    "pipelineId": 2,
    "stageId": 7,
    "value": 1200000,
    "contactId": 12,
    "expectedCloseDate": "2026-08-01"
  }
}
```

---

### `crm_deals_update`

Update mutable fields on a deal. To change the stage or status, use `crm_deals_move_stage` instead.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | Deal ID. |
| `title` | `string` (optional) | |
| `value` | `number \| null` (optional) | Amount in cents. |
| `currency` | `string` (optional) | ISO 4217, e.g. `"USD"`. |
| `priority` | `"low" \| "medium" \| "high"` (optional) | |
| `contactId` | `number \| null` (optional) | |
| `companyId` | `number \| null` (optional) | |
| `expectedCloseDate` | `string \| null` (optional) | ISO date, or `null` to clear. |
| `notes` | `string \| null` (optional) | |
| `recurringValue` | `number \| null` (optional) | MRR/ARR amount in cents. |
| `billingCycle` | `"monthly" \| "quarterly" \| "annual" \| "one-time" \| null` (optional) | |
| `ownerId` | `number \| null` (optional) | Assigned user. Must be visible to your client. |

- **Response:** Full updated deal row.
- **Errors:** `{ "error": "Deal not found" }`, ownership errors for invalid foreign keys.

```json
{
  "tool": "crm_deals_update",
  "input": { "id": 88, "priority": "high", "value": 1500000 }
}
```

---

### `crm_deals_move_stage`

Move a deal to a different stage, or close it as won/lost.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | Deal ID. |
| `stageId` | `number` (optional) | New stage ID. Must belong to your client. |
| `status` | `"open" \| "won" \| "lost"` (optional) | Setting `won` or `lost` stamps `closedAt`. |

- **Response:** Updated deal row, or `{ "error": "Not found" }`.

```json
{
  "tool": "crm_deals_move_stage",
  "input": { "id": 88, "status": "won" }
}
```

---

### `crm_deals_delete`

Permanently delete a deal. Cascades to deal artifacts and comments.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `dealId` | `number` (required) | Deal ID to delete. |

- **Response:** `{ "id": 88, "deleted": true }`
- **Errors:** `{ "error": "Deal not found" }`.

```json
{
  "tool": "crm_deals_delete",
  "input": { "dealId": 88 }
}
```

---

## Deal Comments

### `crm_deal_comments_list`

List comments (with author name) on a deal. Comment bodies may include `@[name](userId)` mention tokens.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `dealId` | `number` (required) | Deal ID. |
| `limit` | `number` 1–200 (optional, default `50`) | |

- **Response:**

```json
[
  {
    "id": 201,
    "dealId": 88,
    "authorId": 7,
    "authorName": "Dan Coyle",
    "body": "Following up after call with @[Ada](12).",
    "attachments": [],
    "createdAt": "2026-06-01T09:00:00.000Z"
  }
]
```

- **Errors:** `{ "error": "Deal not found" }`.

---

### `crm_deal_comments_create`

Add a comment to a deal. Mention tokens (`@[name](userId)`) in `body` and/or explicit `mentionedUserIds` trigger in-app notifications to valid client members.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `dealId` | `number` (required) | |
| `body` | `string` (required) | Comment text. May include `@[name](userId)` mention tokens. |
| `mentionedUserIds` | `number[]` (optional) | Additional user IDs to notify, merged with any tokens parsed from `body`. |

- **Response:**

```json
{
  "id": 202,
  "dealId": 88,
  "authorId": 7,
  "createdAt": "2026-06-04T12:05:00.000Z"
}
```

- **Errors:** `{ "error": "Deal not found" }`, `{ "error": "body is required" }`.

```json
{
  "tool": "crm_deal_comments_create",
  "input": {
    "dealId": 88,
    "body": "Contract drafted, sending for review.",
    "mentionedUserIds": [9]
  }
}
```

---

### `crm_deal_comments_delete`

Delete one of your own comments on a deal. Cannot delete other users' comments.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `dealId` | `number` (required) | |
| `commentId` | `number` (required) | |

- **Response:** `{ "id": 202, "deleted": true }`
- **Errors:** `{ "error": "Deal not found" }`, `{ "error": "Comment not found or not yours" }`.

---

## Deal Artifacts

Artifacts are links connecting a deal to another platform object (website, email campaign, pitch deck, proposal, booking page, survey, or project). The link stores a display title and an optional pin flag; the underlying object is not modified.

Valid `artifactType` values: `"website"`, `"email_campaign"`, `"pitch_deck"`, `"proposal"`, `"booking"`, `"survey"`, `"project"`.

### `crm_deal_artifacts_list`

List every artifact linked to a deal.

- **Auth:** `crm:read`
- **Input:** `{ "dealId": number }`
- **Response:** Array of artifact link rows, ordered by pinned descending then `createdAt` descending.

```json
[
  {
    "id": 55,
    "dealId": 88,
    "artifactType": "proposal",
    "artifactId": 9,
    "displayTitle": "Enterprise Q3 Proposal",
    "pinned": true,
    "createdBy": 7,
    "createdAt": "2026-05-20T10:00:00.000Z"
  }
]
```

- **Errors:** `{ "error": "Deal not found" }`.

---

### `crm_deal_artifact_link`

Attach an artifact to a deal. The artifact must belong to your client.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `dealId` | `number` (required) | |
| `artifactType` | `string` (required) | One of the seven valid types above. |
| `artifactId` | `number` (required) | ID of the artifact within its own table. |
| `pinned` | `boolean` (optional, default `false`) | Pin to top of the list. |

- **Response:** Inserted artifact link row.
- **Errors:** `{ "error": "Deal not found" }`, `{ "error": "Artifact not found or not owned by this client" }`.

```json
{
  "tool": "crm_deal_artifact_link",
  "input": { "dealId": 88, "artifactType": "proposal", "artifactId": 9, "pinned": true }
}
```

---

### `crm_deal_artifact_toggle_pin`

Pin or unpin a deal artifact.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `dealId` | `number` (required) | |
| `artifactDbId` | `number` (required) | The `id` of the artifact link row (from `crm_deal_artifacts_list`). |
| `pinned` | `boolean` (required) | |

- **Response:** Updated artifact link row.
- **Errors:** `{ "error": "Deal not found" }`, `{ "error": "Artifact link not found" }`.

---

### `crm_deal_artifact_unlink`

Remove an artifact link from a deal. The underlying artifact is not deleted.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `dealId` | `number` (required) | |
| `artifactDbId` | `number` (required) | The `id` of the artifact link row. |

- **Response:** The deleted link row.
- **Errors:** `{ "error": "Deal not found" }`, `{ "error": "Artifact link not found" }`.

---

## Pipelines

### `crm_pipelines_list`

List all CRM pipelines and their stages for your client.

- **Auth:** `crm:read`
- **Input:** None.
- **Response:**

```json
{
  "pipelines": [
    { "id": 2, "clientId": 3, "name": "Sales", "isDefault": true }
  ],
  "stages": [
    { "id": 7, "pipelineId": 2, "name": "Proposal Sent", "color": "#6366f1", "sortOrder": 2, "probability": 60 }
  ]
}
```

---

### `crm_pipelines_create`

Create a new pipeline, optionally seeding it with an ordered list of stages.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `name` | `string` (required) | Pipeline name. |
| `isDefault` | `boolean` (optional) | Setting `true` clears the flag on any existing default pipeline. |
| `stages` | `{ name, color?, probability? }[]` (optional) | Initial stages in sort order. Default color is `#6366f1`; default probability is `0`. |

- **Response:** `{ "pipeline": {...}, "stages": [...] }`

```json
{
  "tool": "crm_pipelines_create",
  "input": {
    "name": "Enterprise Sales",
    "isDefault": false,
    "stages": [
      { "name": "Prospecting", "probability": 10 },
      { "name": "Proposal", "color": "#f59e0b", "probability": 50 },
      { "name": "Negotiation", "probability": 75 }
    ]
  }
}
```

---

### `crm_pipelines_update`

Rename a pipeline or toggle its default status.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | |
| `name` | `string` (optional) | |
| `isDefault` | `boolean` (optional) | |

- **Response:** Updated pipeline row.
- **Errors:** `{ "error": "Pipeline not found" }`.

---

### `crm_pipelines_add_stage`

Append a stage to a pipeline.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `pipelineId` | `number` (required) | |
| `name` | `string` (required) | Stage label. |
| `color` | `string` (optional, default `"#6366f1"`) | Hex color. |
| `probability` | `number` 0–100 (optional, default `0`) | Win probability percentage. |
| `sortOrder` | `number` (optional) | Defaults to appending after existing stages. |

- **Response:** Inserted stage row.
- **Errors:** `{ "error": "Pipeline not found" }`.

---

### `crm_pipelines_update_stage`

Rename, recolor, reorder, or update win-probability on a pipeline stage.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | Stage ID. |
| `name` | `string` (optional) | |
| `color` | `string` (optional) | |
| `probability` | `number` 0–100 (optional) | |
| `sortOrder` | `number` (optional) | |

- **Response:** Updated stage row.
- **Errors:** `{ "error": "Stage not found" }` if the stage does not belong to a pipeline owned by your client.

---

## Activities

### `crm_activities_list`

List logged activities (calls, emails, meetings, notes, tasks) filtered by contact, deal, or company.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `contactId` | `number` (optional) | Filter to activities for this contact. |
| `dealId` | `number` (optional) | Filter to activities for this deal. |
| `companyId` | `number` (optional) | Filter to activities for this company. |
| `type` | `"call" \| "email" \| "meeting" \| "note" \| "task"` (optional) | |
| `limit` | `number` 1–200 (optional, default `50`) | |

- **Response:** Array of activity rows ordered by `createdAt` descending.

```json
[
  {
    "id": 31,
    "clientId": 3,
    "type": "call",
    "title": "Intro call",
    "description": "Discussed pricing tiers.",
    "contactId": 12,
    "dealId": 88,
    "dueDate": null,
    "completedAt": "2026-05-28T15:30:00.000Z",
    "createdBy": 7
  }
]
```

---

### `crm_activities_create`

Log an activity against a contact, deal, or company. At least one of `contactId`, `dealId`, or `companyId` is required.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `type` | `"call" \| "email" \| "meeting" \| "note" \| "task"` (required) | |
| `title` | `string` (required) | Short label for the activity. |
| `description` | `string` (optional) | Longer notes. |
| `contactId` | `number` (optional) | |
| `dealId` | `number` (optional) | |
| `companyId` | `number` (optional) | |
| `dueDate` | `string` ISO datetime (optional) | For `task` type. |
| `completedAt` | `string` ISO datetime (optional) | Mark the activity as complete. |

- **Response:** Full inserted activity row.
- **Errors:** `{ "error": "Provide at least one of contactId, dealId, or companyId" }`.

```json
{
  "tool": "crm_activities_create",
  "input": {
    "type": "call",
    "title": "Q3 check-in",
    "dealId": 88,
    "completedAt": "2026-06-04T10:00:00.000Z"
  }
}
```

---

## Proposals

Proposals route through the approval workflow — `proposals_create`, `proposals_update`, and `proposals_send` may return `{ "pending": true, "pendingId": "...", "summary": "..." }` instead of the final row when staged changes are enabled on your token.

### `proposals_list`

List proposals (quotes, estimates, SOWs). Filter by status or linked deal.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `status` | `"draft" \| "sent" \| "viewed" \| "accepted" \| "declined" \| "expired"` (optional) | |
| `dealId` | `number` (optional) | |
| `limit` | `number` 1–200 (optional, default `50`) | |

- **Response:**

```json
[
  {
    "id": 9,
    "title": "Enterprise Q3 Proposal",
    "status": "sent",
    "contactId": 12,
    "dealId": 88,
    "sentAt": "2026-05-20T09:00:00.000Z",
    "viewCount": 3,
    "validUntil": "2026-07-01T00:00:00.000Z"
  }
]
```

---

### `proposals_get`

Fetch a proposal with its full sections, line items, fees, and signature status.

- **Auth:** `crm:read`
- **Input:** `{ "id": number }`
- **Response:** Full proposal row (includes `sections`, `lineItems`, `fees`, `clientToken`, `accentColor`, etc.).
- **Errors:** `{ "error": "Proposal not found" }`.

---

### `proposals_create`

Create a new proposal. Starts in `draft` status. Use `proposals_send` to transition it.

- **Auth:** `crm:write`
- **Approval:** May be staged (see note above).
- **Input:**

| Field | Type | Description |
|---|---|---|
| `title` | `string` (required) | |
| `summary` | `string` (optional) | Executive summary text. |
| `contactId` | `number` (optional) | |
| `companyId` | `number` (optional) | |
| `dealId` | `number` (optional) | |
| `sections` | `ProposalSection[]` (optional) | `{ id, type: "text"\|"heading"\|"image"\|"divider"\|"pricing"\|"terms"\|"signature", title?, content?, imageUrl? }` |
| `lineItems` | `ProposalLineItem[]` (optional) | `{ id, description, quantity, unitPrice (cents), optional? }` |
| `fees` | `ProposalFee[]` (optional) | `{ label, type: "flat"\|"percent", amount }` |
| `currency` | `string` (optional, default `"USD"`) | |
| `validUntil` | `string` ISO date (optional) | |
| `accentColor` | `string` (optional, default `"#2563eb"`) | |
| `logoUrl` | `string` (optional) | |
| `coverImageUrl` | `string` (optional) | |
| `footerText` | `string` (optional) | |

- **Response (applied):** Full inserted proposal row.
- **Response (staged):** `{ "pending": true, "pendingId": "abc123", "summary": "Create proposal \"Enterprise Q3\"", "status": "pending" }`

```json
{
  "tool": "proposals_create",
  "input": {
    "title": "Enterprise Q3 Proposal",
    "dealId": 88,
    "lineItems": [
      { "id": "li1", "description": "Platform license", "quantity": 1, "unitPrice": 1200000 }
    ],
    "validUntil": "2026-07-01"
  }
}
```

---

### `proposals_update`

Update any field on a proposal. Use `status` to record `"accepted"` or `"declined"` outcomes — this stamps `acceptedAt`/`declinedAt` automatically.

- **Auth:** `crm:write`
- **Approval:** May be staged.
- **Input:** `id` (required) + any subset of the fields from `proposals_create`, plus:

| Field | Type | Description |
|---|---|---|
| `status` | `"draft" \| "sent" \| "viewed" \| "accepted" \| "declined" \| "expired"` (optional) | |
| `declineReason` | `string \| null` (optional) | |

- **Response (applied):** Full updated proposal row.
- **Errors:** `{ "error": "Proposal not found" }`.

---

### `proposals_send`

Transition a proposal from `draft` to `sent`. Stamps `sentAt`. Does **not** send an email — use the portal UI for delivery or share the proposal URL manually.

- **Auth:** `crm:write`
- **Approval:** May be staged.
- **Input:** `{ "id": number }`
- **Response (applied):** Updated proposal row with `status: "sent"`.
- **Errors:** `{ "error": "Proposal not found" }`, `{ "error": "Cannot send — current status is <status>" }` if not in `draft`.

```json
{
  "tool": "proposals_send",
  "input": { "id": 9 }
}
```

---

## Contracts

### `contracts_list`

List contracts / agreements. Filter by status or linked proposal.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `status` | `"draft" \| "sent" \| "partially_signed" \| "fully_executed" \| "voided" \| "expired"` (optional) | |
| `proposalId` | `number` (optional) | |
| `limit` | `number` 1–200 (optional, default `50`) | |

- **Response:**

```json
[
  {
    "id": 3,
    "title": "Master Services Agreement",
    "status": "partially_signed",
    "proposalId": 9,
    "dealId": 88,
    "sentAt": "2026-06-01T08:00:00.000Z",
    "fullyExecutedAt": null,
    "validUntil": "2026-12-31T00:00:00.000Z"
  }
]
```

---

### `contracts_get`

Fetch a contract with all signer records.

- **Auth:** `crm:read`
- **Input:** `{ "id": number }`
- **Response:**

```json
{
  "contract": { "id": 3, "title": "MSA", "status": "partially_signed", "clauses": [...] },
  "signers": [
    { "id": 1, "contractId": 3, "name": "Ada Lovelace", "email": "ada@example.com", "role": "signer", "order": 0, "signedAt": null }
  ]
}
```

- **Errors:** `{ "error": "Contract not found" }`.

---

### `contracts_create`

Create a contract with clauses and signers. Each signer receives a unique signing token. Starts in `draft`.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `title` | `string` (required) | |
| `summary` | `string` (optional) | |
| `proposalId` | `number` (optional) | |
| `dealId` | `number` (optional) | |
| `contactId` | `number` (optional) | |
| `companyId` | `number` (optional) | |
| `clauses` | `ContractClause[]` (optional) | `{ id, title, content, required }` |
| `lineItems` | `ProposalLineItem[]` (optional) | Same shape as proposals. |
| `fees` | `ProposalFee[]` (optional) | |
| `currency` | `string` (optional, default `"USD"`) | |
| `validUntil` | `string` ISO date (optional) | |
| `signers` | `{ name, email, role?, order? }[]` (optional) | `role` is `"signer"`, `"witness"`, or `"approver"`; defaults to `"signer"`. |
| `accentColor` | `string` (optional, default `"#2563eb"`) | |
| `logoUrl` | `string` (optional) | |
| `footerText` | `string` (optional) | |

- **Response:**

```json
{
  "contract": { "id": 3, "title": "MSA", "status": "draft", ... },
  "signers": [
    { "id": 1, "contractId": 3, "name": "Ada Lovelace", "email": "ada@example.com", "role": "signer", "order": 0 }
  ]
}
```

```json
{
  "tool": "contracts_create",
  "input": {
    "title": "Master Services Agreement",
    "dealId": 88,
    "signers": [
      { "name": "Ada Lovelace", "email": "ada@example.com", "role": "signer" }
    ]
  }
}
```

---

### `contracts_void`

Mark a contract as voided. Stamps `voidedAt`. Cannot be undone via MCP. Cannot void a fully-executed contract.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | |
| `reason` | `string` (optional) | Reason stored on the contract record. |

- **Response:** Updated contract row with `status: "voided"`.
- **Errors:** `{ "error": "Contract not found" }`, `{ "error": "Already voided" }`, `{ "error": "Cannot void — already fully executed" }`.

```json
{
  "tool": "contracts_void",
  "input": { "id": 3, "reason": "Replaced by updated MSA" }
}
```

---

## Custom Fields

Custom fields extend contacts, companies, or deals with tenant-defined data columns.

### `crm_custom_fields_list`

List custom field definitions.

- **Auth:** `crm:read`
- **Input:** `{ "entityType": "contact" | "company" | "deal" }` (optional)
- **Response:** Array of field definitions ordered by `sortOrder`.

```json
[
  {
    "id": 14,
    "clientId": 3,
    "entityType": "deal",
    "fieldName": "Contract value tier",
    "fieldType": "select",
    "options": ["SMB", "Mid-Market", "Enterprise"],
    "required": false,
    "filterable": true,
    "sortOrder": 0
  }
]
```

---

### `crm_custom_fields_create`

Define a new custom field on contacts, companies, or deals.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `entityType` | `"contact" \| "company" \| "deal"` (required) | |
| `fieldName` | `string` (required) | Display label. |
| `fieldType` | `"text" \| "number" \| "date" \| "select" \| "multiselect" \| "url" \| "email" \| "phone" \| "boolean"` (required) | |
| `options` | `string[]` (optional) | Required for `select` / `multiselect` types. |
| `required` | `boolean` (optional, default `false`) | |
| `filterable` | `boolean` (optional, default `false`) | |
| `sortOrder` | `number` (optional, default `0`) | |

- **Response:** Inserted field definition row.

```json
{
  "tool": "crm_custom_fields_create",
  "input": {
    "entityType": "deal",
    "fieldName": "Contract value tier",
    "fieldType": "select",
    "options": ["SMB", "Mid-Market", "Enterprise"],
    "filterable": true
  }
}
```

---

### `crm_custom_fields_update`

Rename, reorder, toggle required/filterable, or update options on an existing custom field.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | Field definition ID. |
| `fieldName` | `string` (optional) | |
| `options` | `string[] \| null` (optional) | |
| `required` | `boolean` (optional) | |
| `filterable` | `boolean` (optional) | |
| `sortOrder` | `number` (optional) | |

- **Response:** Updated field definition row.
- **Errors:** `{ "error": "Custom field not found" }`, `{ "error": "No fields to update" }` if no fields were provided.

---

### `crm_custom_fields_delete`

Delete a custom field definition. All stored values for this field are cascaded.

- **Auth:** `crm:write`
- **Input:** `{ "id": number }`
- **Response:** The deleted field definition row.
- **Errors:** `{ "error": "Custom field not found" }`.

---

### `crm_custom_field_values_get`

Read custom field values (joined with their definitions) for a specific entity.

- **Auth:** `crm:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `entityType` | `"contact" \| "company" \| "deal"` (required) | |
| `entityId` | `number` (required) | |

- **Response:**

```json
[
  {
    "id": 77,
    "customFieldId": 14,
    "entityId": 88,
    "entityType": "deal",
    "value": "Enterprise",
    "fieldName": "Contract value tier",
    "fieldType": "select",
    "options": ["SMB", "Mid-Market", "Enterprise"],
    "required": false
  }
]
```

- **Errors:** `{ "error": "Entity not found" }` if the entity does not belong to your client.

---

### `crm_custom_field_values_set`

Upsert custom field values on an entity. Pass field IDs (as string keys) mapped to their values. Pass `null` or `""` to clear a field.

- **Auth:** `crm:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `entityType` | `"contact" \| "company" \| "deal"` (required) | |
| `entityId` | `number` (required) | |
| `values` | `Record<string, string \| number \| boolean \| null>` (required) | Keys are field IDs as strings. |

- **Response:** Array of upserted value rows. Field IDs not belonging to your client are silently skipped.
- **Errors:** `{ "error": "Entity not found" }`.

```json
{
  "tool": "crm_custom_field_values_set",
  "input": {
    "entityType": "deal",
    "entityId": 88,
    "values": { "14": "Enterprise" }
  }
}
```

---

## Saved Views

### `crm_saved_views_list`

List saved filter/view configurations for contacts, companies, or deals.

- **Auth:** `crm:read`
- **Input:** `{ "entityType": "contact" | "company" | "deal" }` (optional)
- **Response:** Array of saved view rows ordered by `sortOrder`.

```json
[
  {
    "id": 4,
    "clientId": 3,
    "entityType": "contact",
    "name": "Hot leads this month",
    "filters": { "status": "lead", "score_gte": 70 },
    "sortOrder": 0
  }
]
```

---

## Scoring Rules

### `crm_scoring_rules_list`

List lead-scoring rules (events that award points to contacts or deals).

- **Auth:** `crm:read`
- **Input:** None.
- **Response:** Array of scoring rule rows ordered by `points` descending.

```json
[
  {
    "id": 1,
    "clientId": 3,
    "name": "Opened email",
    "eventType": "email_open",
    "points": 5,
    "active": true
  }
]
```

---

## Services

### `service_catalog_list`

List active services the agency offers. Use this to look up valid `serviceId` values before calling `service_requests_create`.

- **Auth:** `services:read`
- **Input:** None.
- **Response:**

```json
[
  {
    "id": 1,
    "name": "SEO Audit",
    "slug": "seo-audit",
    "description": "Full technical and content SEO audit.",
    "category": "marketing",
    "price": 149900,
    "billingCycle": "one-time",
    "active": true
  }
]
```

---

### `service_requests_list`

List service requests you have submitted to the agency.

- **Auth:** `services:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `status` | `"pending" \| "reviewed" \| "approved" \| "rejected"` (optional) | |

- **Response:**

```json
[
  {
    "id": 7,
    "serviceId": 1,
    "status": "pending",
    "message": "Please prioritize the blog section.",
    "answers": { "target_keyword": "agency software" },
    "createdAt": "2026-06-04T10:00:00.000Z"
  }
]
```

---

### `service_requests_create`

Submit a service request to the agency. The agency reviews and sets status to `approved` or `rejected`.

- **Auth:** `services:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `serviceId` | `number` (required) | ID from `service_catalog_list`. Must be active. |
| `message` | `string` (optional) | Free-form message to the agency. |
| `answers` | `Record<string, any>` (optional) | Answers to the service's survey fields. |

- **Response:** Full inserted service request row with `status: "pending"`.
- **Errors:** `{ "error": "Service not found or inactive" }`.

```json
{
  "tool": "service_requests_create",
  "input": {
    "serviceId": 1,
    "message": "Prioritize the blog section.",
    "answers": { "target_keyword": "agency software" }
  }
}
```

---

### `suggested_projects_list`

List suggested project templates the agency offers (e.g. "Build a mobile app", "Add a blog").

- **Auth:** `services:read`
- **Input:** `{ "category": string }` (optional)
- **Response:**

```json
[
  {
    "id": 3,
    "title": "Add a Blog",
    "description": "CMS-powered blog with categories and tags.",
    "category": "content",
    "estimatedPrice": 200000,
    "estimatedTimeline": "2 weeks",
    "features": ["Blog listing", "Post detail", "Categories"],
    "icon": "article"
  }
]
```

---

### `suggested_project_requests_create`

Request one of the agency's suggested project templates. The agency reviews and may convert it to a real project.

- **Auth:** `services:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `suggestedProjectId` | `number` (required) | ID from `suggested_projects_list`. Must be active. |
| `message` | `string` (optional) | |
| `answers` | `Record<string, any>` (optional) | |

- **Response:** Full inserted suggested project request row with `status: "pending"`.
- **Errors:** `{ "error": "Suggested project not found or inactive" }`.

```json
{
  "tool": "suggested_project_requests_create",
  "input": { "suggestedProjectId": 3, "message": "Need this live by end of Q3." }
}
```

---

## Support Tickets

### `tickets_list`

List support tickets for your account.

- **Auth:** `tickets:read`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `status` | `"open" \| "in_progress" \| "waiting" \| "resolved" \| "closed"` (optional) | |
| `limit` | `number` 1–200 (optional, default `50`) | |

- **Response:** Array of full ticket rows ordered by `createdAt` descending.

```json
[
  {
    "id": 42,
    "clientId": 3,
    "number": 12,
    "subject": "DNS not propagating",
    "status": "open",
    "priority": "high",
    "category": "domain",
    "createdAt": "2026-06-03T14:00:00.000Z"
  }
]
```

---

### `tickets_get`

Fetch a support ticket and its full public message thread. Internal messages are excluded.

- **Auth:** `tickets:read`
- **Input:** `{ "id": number }`
- **Response:**

```json
{
  "ticket": { "id": 42, "subject": "DNS not propagating", "status": "open", "priority": "high" },
  "messages": [
    {
      "id": 100,
      "ticketId": 42,
      "authorId": 7,
      "body": "The domain was updated 48 hours ago and still shows the old A record.",
      "attachments": [],
      "createdAt": "2026-06-03T14:05:00.000Z"
    }
  ]
}
```

- **Errors:** `{ "error": "Ticket not found" }`.

---

### `tickets_create`

Open a new support ticket. The first message in the thread is provided as `body`.

- **Auth:** `tickets:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `subject` | `string` (required) | Ticket subject line. |
| `body` | `string` (required) | First message body. |
| `priority` | `"low" \| "medium" \| "high" \| "urgent"` (optional, default `"medium"`) | |
| `category` | `"general" \| "billing" \| "technical" \| "domain" \| "hosting"` (optional, default `"general"`) | |

- **Response:** Inserted ticket row (the message row is not echoed; use `tickets_get` to retrieve it).

```json
{
  "tool": "tickets_create",
  "input": {
    "subject": "DNS not propagating",
    "body": "Domain was updated 48 hours ago — still showing old A record.",
    "priority": "high",
    "category": "domain"
  }
}
```

---

### `tickets_reply`

Append a message to an existing ticket.

- **Auth:** `tickets:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | Ticket ID. |
| `body` | `string` (required) | Message text. |

- **Response:** Inserted message row.
- **Errors:** `{ "error": "Ticket not found" }`.

```json
{
  "tool": "tickets_reply",
  "input": { "id": 42, "body": "Update: still seeing the old record as of 9am." }
}
```

---

### `tickets_update`

Change ticket status, priority, category, subject, or assignee. Setting `status` to `"resolved"` stamps `resolvedAt`.

- **Auth:** `tickets:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `id` | `number` (required) | |
| `status` | `"open" \| "in_progress" \| "waiting" \| "resolved" \| "closed"` (optional) | |
| `priority` | `"low" \| "medium" \| "high" \| "urgent"` (optional) | |
| `category` | `"general" \| "billing" \| "technical" \| "domain" \| "hosting"` (optional) | |
| `subject` | `string` (optional) | |
| `assignedTo` | `number \| null` (optional) | User ID; pass `null` to unassign. |

- **Response:** Updated ticket row.
- **Errors:** `{ "error": "Ticket not found" }`.

```json
{
  "tool": "tickets_update",
  "input": { "id": 42, "status": "resolved" }
}
```

---

### `tickets_attach_file_from_url`

Download a remote file (max 25 MB), upload it to S3, and post a new ticket message with the file attached. Redirects are refused (SSRF guard).

- **Auth:** `tickets:write`
- **Input:**

| Field | Type | Description |
|---|---|---|
| `ticketId` | `number` (required) | |
| `url` | `string` URL (required) | Remote `http`/`https` URL. Must pass SSRF safety checks; redirects are not followed. |
| `body` | `string` (optional) | Message body to accompany the file. Defaults to `"Attached: <filename>"`. |
| `filename` | `string` (optional) | Override filename; defaults to URL basename. |

- **Response:** Inserted message row with `attachments: [{ url, filename, mimeType, fileSize }]`.
- **Errors:**
  - `{ "error": "Ticket not found" }`
  - `{ "error": "URL rejected: <reason>" }` — SSRF guard blocked the URL.
  - `{ "error": "Refusing to follow redirects on remote upload (SSRF guard)." }`
  - `{ "error": "Fetch failed: <message>" }` — network-level exception (DNS failure, timeout, etc.).
  - `{ "error": "Fetch returned <status>" }` — remote server returned a non-2xx status.
  - `{ "error": "File too large (<bytes> bytes)." }` — exceeds 25 MB cap.

```json
{
  "tool": "tickets_attach_file_from_url",
  "input": {
    "ticketId": 42,
    "url": "https://storage.example.com/screenshots/dns-record.png",
    "body": "Screenshot of current DNS record showing the issue."
  }
}
```
