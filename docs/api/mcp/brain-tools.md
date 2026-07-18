# MCP Tools — Company Brain (Knowledge)

Company Brain is your workspace's living knowledge system. These MCP tools let you search, read, and write every entity in the Brain — meetings, notes, tasks, decisions, topics, people, org units, glossary terms, playbooks, and versioned documents — all scoped to your tenant. They also expose a profile surface for reading and updating the authenticated user's own account fields.

For connection and authentication details, see [MCP Overview](./overview.md).

---

## Scopes

| Scope | What it grants |
|---|---|
| `brain:read` | All list / get / search operations |
| `brain:write` | Create, update, delete, and propose operations |
| `brain:approve` | Approve / reject AI review items; edit relationship overlays (sensitive — grant explicitly) |
| `profile:read` | Read the authenticated user's profile |
| `profile:write` | Update the authenticated user's profile |

---

## Profile

### `profile_get`

Return the authenticated user's name, email, and the linked client's public company fields.

- **Auth:** `profile:read`

**Tool call example:**
```json
{ "name": "profile_get", "arguments": {} }
```

**Response:**
```json
{
  "user": { "id": 42, "name": "Ada Lovelace", "email": "ada@example.com" },
  "client": {
    "id": 7,
    "company": "Example Co",
    "phone": "+1 555-0100",
    "website": "https://example.com",
    "address": "123 Main St",
    "emailPrefix": "example"
  }
}
```

---

### `profile_update`

Update the authenticated user's name / email and / or the linked client's company fields. All fields are optional; only provided fields are written. Email must be unique across all users.

- **Auth:** `profile:write`

| Input field | Type | Description |
|---|---|---|
| `name` | string (optional) | Display name |
| `email` | string (optional) | Must be a valid email and unique |
| `company` | string\|null (optional) | Company name |
| `phone` | string\|null (optional) | Phone number |
| `website` | string\|null (optional) | Website URL |
| `address` | string\|null (optional) | Address |
| `emailPrefix` | string\|null (optional) | Lowercase alphanumeric slug used for email routing |

**Tool call example:**
```json
{
  "name": "profile_update",
  "arguments": { "name": "Ada Lovelace", "company": "Example Co" }
}
```

**Response:**
```json
{ "success": true }
```

**Errors:**

| Condition | Response |
|---|---|
| Email already taken | `{ "error": "Email already in use" }` |
| Missing `profile:write` scope | `isError: true` — permission denied message |

---

## Search & Dashboard

### `brain_search`

Hybrid lexical + semantic search across the entire workspace: notes, meetings, CRM companies / contacts / deals, tasks, relationships, and pages. Returns ranked hits with snippets and absolute citation URLs.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `query` | string (1–500 chars) | Search query |
| `types` | string[] (optional) | Filter to entity types: `meeting`, `note`, `task`, `relationship`, `company`, `contact`, `deal`, `post` |
| `limit` | integer 1–50 (optional) | Max results (default 10) |

**Tool call example:**
```json
{
  "name": "brain_search",
  "arguments": { "query": "Q3 OKR kickoff", "types": ["meeting", "note"], "limit": 5 }
}
```

**Response:**
```json
{
  "hits": [
    {
      "type": "meeting",
      "id": 101,
      "title": "Q3 OKR Kickoff",
      "snippet": "…discussed revenue targets for Q3…",
      "score": 0.94,
      "url": "https://simplerdevelopment.com/portal/brain/communications/101"
    }
  ]
}
```

---

### `brain_dashboard_summary`

Return the command-center snapshot: meetings needing review, overdue / blocked / upcoming tasks, stale prospects, priority relationships, recent meetings, and entity counts (including `decisionsCount` and `topicsCount`).

- **Auth:** `brain:read`
- No input fields.

**Tool call example:**
```json
{ "name": "brain_dashboard_summary", "arguments": {} }
```

**Response:**
```json
{
  "counts": {
    "pendingMeetings": 3,
    "openTasks": 12,
    "decisionsCount": 47,
    "topicsCount": 28
  },
  "needsReviewMeetings": [...],
  "overdueTasksCount": 2
}
```

---

## Meetings

### `brain_list_meetings`

List meetings, optionally filtered by status. Returns full rows including transcripts (MCP callers receive transcripts by default).

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `draft`\|`processing`\|`needs_review`\|`approved` (optional) | Filter by status |
| `limit` | integer 1–200 (optional) | Max results |

---

### `brain_get_meeting`

Get a meeting with participants, transcript, AI summary, and the linked CRM record (if any).

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `meetingId` | integer | Meeting ID |

**Errors:** `Meeting not found.`

---

### `brain_create_meeting`

Create a meeting from pasted transcript text. Optionally link to a CRM company or deal at creation time.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `transcript` | string (1–200 000 chars) | Raw meeting notes or transcript |
| `title` | string (optional) | Meeting title |
| `meetingDate` | string (optional) | ISO timestamp |
| `participants` | `{name, email?}[]` (optional) | Participant list |
| `companyId` | integer (optional) | Link to CRM company (mutually exclusive with `dealId`) |
| `dealId` | integer (optional) | Link to CRM deal (mutually exclusive with `companyId`) |

**Tool call example:**
```json
{
  "name": "brain_create_meeting",
  "arguments": {
    "transcript": "Ada: Let's review the pipeline...",
    "title": "Pipeline Review",
    "meetingDate": "2026-06-04T14:00:00Z",
    "companyId": 55
  }
}
```

**Response (slim — transcript is never echoed back):**
```json
{
  "id": 201,
  "title": "Pipeline Review",
  "status": "processing",
  "source": "paste",
  "sourceRef": null,
  "createdAt": "2026-06-04T14:01:00.000Z"
}
```

**Errors:** `Company Brain is not enabled for this workspace.` | Error if `companyId` and `dealId` are both supplied.

---

### `brain_link_meeting`

Set or clear a meeting's CRM link (company or deal). Pass `null` to clear.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `meetingId` | integer | Meeting ID |
| `companyId` | integer\|null (optional) | CRM company to link |
| `dealId` | integer\|null (optional) | CRM deal to link |

---

## Tasks

### `brain_list_tasks`

List Brain tasks with optional filters.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `open`\|`in_progress`\|`blocked`\|`done` (optional) | |
| `ownerId` | integer (optional) | Filter by assignee |
| `meetingId` | integer (optional) | Tasks originating from a meeting |
| `needsReview` | boolean (optional) | |
| `limit` | integer 1–200 (optional) | |

---

### `brain_get_task`

Fetch a single Brain task by id.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `taskId` | integer | Task ID |

---

### `brain_create_task`

Create a Brain task directly (bypasses the review queue).

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `title` | string (1–500 chars) | Task title |
| `description` | string (optional) | |
| `priority` | `low`\|`medium`\|`high`\|`urgent` (optional) | |
| `dueDate` | string (optional) | ISO date |
| `ownerId` | integer (optional) | Assignee; must be visible to this tenant |

---

### `brain_propose_task`

Stage a suggested task in the AI review queue for a human to approve, edit, or reject. Prefer this over `brain_create_task` when acting on AI analysis.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `title` | string (1–500 chars) | |
| `description` | string (optional) | |
| `priority` | `low`\|`medium`\|`high`\|`urgent` (optional) | |
| `dueDate` | string (optional) | ISO date |
| `complianceFlag` | boolean (optional) | |
| `sourceMeetingId` | integer (optional) | Attach to a meeting's review queue |

---

### `brain_update_task`

Patch task fields (title, description, status, priority, due date, owner, blocked reason).

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `taskId` | integer | Task ID |
| `title` | string (optional) | |
| `description` | string\|null (optional) | |
| `status` | `open`\|`in_progress`\|`blocked`\|`done` (optional) | |
| `priority` | `low`\|`medium`\|`high`\|`urgent` (optional) | |
| `dueDate` | string\|null (optional) | ISO date |
| `ownerId` | integer\|null (optional) | |
| `blockedReason` | string\|null (optional) | |

---

## AI Review Queue

### `brain_list_review_items`

List items in the AI proposal queue.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `pending`\|`approved`\|`rejected`\|`edited` (optional) | Defaults to `pending` |
| `sourceId` | integer (optional) | Filter to a specific meeting |

---

### `brain_get_review_item`

Get a single AI proposal by id, including the full proposed payload.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `itemId` | integer | Review item ID |

---

### `brain_approve_review_item`

Approve a pending AI proposal. For `task` proposals this materializes a brain task row. Optionally patch the payload before approving. **Audited.**

- **Auth:** `brain:approve`

| Input field | Type | Description |
|---|---|---|
| `itemId` | integer | Review item ID |
| `editedPayload` | object (optional) | Overrides for the proposed payload |

---

### `brain_reject_review_item`

Reject a pending AI proposal. **Audited.**

- **Auth:** `brain:approve`

| Input field | Type | Description |
|---|---|---|
| `itemId` | integer | Review item ID |
| `reason` | string (max 500, optional) | Rejection reason |

---

### `brain_review_items_suggest_reviewer`

Score active Brain people for who should review an AI proposal based on expertise, org-unit context, past approval history, and current workload. Persists the top candidate (score ≥ 3) on the review item. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `reviewItemId` | integer | Review item ID |

**Response:**
```json
{
  "reviewItemId": 88,
  "suggestedPersonId": 14,
  "score": 4,
  "reason": "Matched 2 expertise tags; low workload"
}
```

---

### `brain_review_items_list_for_reviewer`

List review items where `suggested_reviewer_person_id` matches the given `brain_people.id`. Capped at 50 rows.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `personId` | integer | Brain person ID |
| `status` | `pending`\|`approved`\|`rejected`\|`edited` (optional) | Defaults to `pending` |

---

## Relationships

### `brain_list_relationships`

List relationship overlays with optional filters.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `type` | string (optional) | Relationship type label |
| `ownerId` | integer (optional) | Owner user ID |
| `priority` | `low`\|`medium`\|`high`\|`critical` (optional) | |
| `status` | `active`\|`paused`\|`archived` (optional) | |
| `staleOnly` | boolean (optional) | Only relationships past their `nextReviewAt` |

---

### `brain_get_relationship`

Get a relationship overlay by id with linked CRM record, contacts, recent meetings, and open tasks.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `overlayId` | integer | Overlay ID |

---

### `brain_create_relationship`

Start tracking a CRM company or deal as a Brain relationship. Idempotent.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `companyId` | integer (optional) | Exactly one of `companyId` or `dealId` required |
| `dealId` | integer (optional) | |
| `relationshipType` | string (optional) | |
| `priority` | `low`\|`medium`\|`high`\|`critical` (optional) | |
| `summary` | string (optional) | |
| `currentPriorities` | string (optional) | |
| `openLoops` | string (optional) | |
| `nextReviewAt` | string (optional) | ISO timestamp |
| `staleAfterDays` | integer (optional) | Days before considered stale |

---

### `brain_update_relationship`

Edit a Brain relationship overlay. **Audited.**

- **Auth:** `brain:approve`

| Input field | Type | Description |
|---|---|---|
| `overlayId` | integer | Overlay ID |
| `priority` | `low`\|`medium`\|`high`\|`critical` (optional) | |
| `status` | `active`\|`paused`\|`archived` (optional) | |
| `summary` | string\|null (optional) | |
| `currentPriorities` | string\|null (optional) | |
| `openLoops` | string\|null (optional) | |
| `nextReviewAt` | string\|null (optional) | ISO timestamp |
| `staleAfterDays` | integer\|null (optional) | |

---

## Knowledge Notes

### `brain_list_notes`

List / search knowledge notes. Slim by default (400-char body preview + length). Use `sourceUrl` / `sourceUrlStartsWith` to deduplicate before crawling. Paginated via `{ items, total, limit, offset }`.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `search` | string (optional) | ILIKE on title and body |
| `tag` | string (optional) | Match a single tag |
| `sourceUrl` | string (optional) | Exact URL match for dedup |
| `sourceUrlStartsWith` | string (optional) | Prefix URL match — e.g. entire docs site |
| `relationshipOverlayId` | integer (optional) | |
| `companyId` | integer (optional) | |
| `dealId` | integer (optional) | |
| `contactId` | integer (optional) | |
| `meetingId` | integer (optional) | |
| `pinnedOnly` | boolean (optional) | |
| `trashed` | boolean (optional) | When `true`, return only soft-deleted notes |
| `limit` | integer 1–200 (optional) | Default 50 |
| `offset` | integer (optional) | |

---

### `brain_get_note`

Fetch a single note with its full body.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `noteId` | integer | Note ID |

---

### `brain_create_note`

Save a knowledge note. Primary write surface for AI-driven web ingestion — pass `source: "crawl"` and `sourceUrl` when ingesting from the web. Body is markdown, capped at 50 KB.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `title` | string (1–255 chars) | |
| `body` | string (max 50 000 chars, optional) | Markdown |
| `tags` | string[] (optional) | |
| `sourceUrl` | string URL (optional) | Provenance URL |
| `source` | `manual`\|`ai_review`\|`document_import`\|`crawl` (optional) | |
| `confidentialityLevel` | `standard`\|`restricted`\|`confidential` (optional) | |
| `pinned` | boolean (optional) | |
| `relationshipOverlayId` | integer (optional) | |
| `companyId` | integer (optional) | |
| `dealId` | integer (optional) | |
| `contactId` | integer (optional) | |
| `meetingId` | integer (optional) | |

---

### `brain_upsert_note_by_url`

Idempotent crawl primitive: update an existing note for `sourceUrl` if found, otherwise create it. Returns `{ note, created: boolean }`. Prefer this over `brain_create_note` when ingesting web pages.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `sourceUrl` | string URL | Key for the upsert |
| `title` | string (1–255 chars) | |
| `body` | string (max 50 000 chars) | |
| `tags` | string[] (optional) | |
| `confidentialityLevel` | `standard`\|`restricted`\|`confidential` (optional) | |
| `relationshipOverlayId` | integer (optional) | |
| `companyId` | integer (optional) | |
| `dealId` | integer (optional) | |

---

### `brain_update_note`

Patch fields on an existing note. Pass `null` for nullable fields to clear them.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `noteId` | integer | Note ID |
| `title` | string (1–255, optional) | |
| `body` | string (max 50 000, optional) | |
| `tags` | string[] (optional) | |
| `sourceUrl` | string\|null (optional) | |
| `confidentialityLevel` | `standard`\|`restricted`\|`confidential` (optional) | |
| `pinned` | boolean (optional) | |
| `relationshipOverlayId` | integer\|null (optional) | |
| `companyId` | integer\|null (optional) | |
| `dealId` | integer\|null (optional) | |
| `contactId` | integer\|null (optional) | |
| `meetingId` | integer\|null (optional) | |

---

### `brain_delete_note`

Two-stage delete. Default (`force: false`) soft-deletes — note moves to trash and can be restored. If the note is already trashed, this hard-deletes it. Pass `force: true` to hard-delete immediately. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `noteId` | integer | Note ID |
| `force` | boolean (optional) | Skip soft-delete stage |

**Response:**
```json
{ "id": 55, "deleted": "soft" }
```

---

### `brain_restore_note`

Restore a soft-deleted note back to the active list.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `noteId` | integer | Note ID |

---

### `brain_bulk_update_notes`

Apply a bulk operation to up to 500 notes at once. Cross-tenant IDs are silently skipped.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `ids` | integer[] (1–500) | Note IDs |
| `op` | discriminated union | Operation: `soft_delete`, `restore`, `hard_delete`, `add_tags`, `remove_tags`, or `replace_tag_prefix` |

**Op shapes:**
```json
{ "kind": "add_tags", "tags": ["competitor", "q3"] }
{ "kind": "replace_tag_prefix", "from": "old-prefix", "to": "new-prefix" }
```

**Response:**
```json
{ "updated": 48, "skipped": 2 }
```

---

### `brain_classify_notes`

Run the LLM classifier to assign BRAIN-1 taxonomy facets (source / slate-area / audience / content-type / recency / competitor / status). Default `dryRun: true` — returns counts and a 5-row sample without writing anything. Set `dryRun: false` to get the full per-note output to feed into `brain_apply_classifications`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `noteIds` | integer[] (max 500, optional) | Explicit note list; provide this OR `all` |
| `all` | boolean (optional) | Classify all notes for the tenant |
| `limit` | integer 1–500 (optional) | Cap when using `all` |
| `concurrency` | integer 1–8 (optional) | LLM concurrency |
| `dryRun` | boolean (default `true`) | `true` = counts + sample only |

---

### `brain_apply_classifications`

Persist classifier output from `brain_classify_notes`: writes the note status enum and attaches matching reserved taxonomy topics. Rows below `minConfidence` (default 0.7) are routed to the AI review queue unless `routeBelowMinToReview: false`. Idempotent.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `classifications` | classification[] (1–500) | Output from `brain_classify_notes` with `dryRun: false` |
| `minConfidence` | float 0–1 (optional) | Default 0.7 |
| `routeBelowMinToReview` | boolean (optional) | Default `true` |

**Response:**
```json
{
  "notesUpdated": 45,
  "topicsAttached": 120,
  "attachmentsExisted": 3,
  "routedToReview": 2,
  "skippedTotal": 1,
  "skipped": [{ "noteId": 99, "reason": "below_min_confidence" }]
}
```

---

### `brain_list_note_history`

Audit log for a single note: created, updated, soft_deleted, restored, hard_deleted, etc.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `noteId` | integer | Note ID |
| `limit` | integer 1–200 (optional) | Default 50 |
| `includeDiff` | boolean (optional) | When `true`, include the full metadata blob |

---

## Saved Searches

### `brain_list_saved_searches`

List sidebar-pinned filter sets.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `scope` | `mine`\|`shared`\|`all` (optional) | Default `all` |
| `includeFilters` | boolean (optional) | Inline the filters JSON |

---

### `brain_get_saved_search`

Fetch a saved search by id, including the full filters JSON.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Saved search ID |

---

### `brain_create_saved_search`

Pin a knowledge filter set to the sidebar.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `name` | string (1–150 chars) | Display name |
| `filters` | object | `{ search?, tagPrefix?, tags?, pinnedOnly?, trashed?, sort?, order? }` |
| `icon` | string (max 50, optional) | Icon identifier |
| `sortOrder` | number (optional) | |
| `scope` | `personal`\|`shared` (optional) | Default `personal` |

---

### `brain_update_saved_search`

Patch fields on a saved search. Pass `scope` to move between personal and shared.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Saved search ID |
| `name` | string (optional) | |
| `filters` | object (optional) | Same shape as create |
| `icon` | string (optional) | |
| `sortOrder` | number (optional) | |
| `scope` | `personal`\|`shared` (optional) | |

---

### `brain_delete_saved_search`

Remove a saved-search pin from the sidebar.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Saved search ID |

---

## Note Templates

### `brain_list_note_templates`

List reusable note templates. Slim by default (no body). Pass `includeBody: true` to inline bodies.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `trigger` | `manual`\|`daily`\|`meeting`\|`slash` (optional) | |
| `enabled` | boolean (optional) | |
| `includeBody` | boolean (optional) | |

---

### `brain_get_note_template`

Fetch a template by id, including the full markdown body.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Template ID |

---

### `brain_create_note_template`

Define a reusable note template. Body is markdown and supports `{{variables}}`. Returns an error if a template with this name already exists for the tenant.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `name` | string (1–150 chars) | Must be unique per tenant |
| `body` | string | Markdown body |
| `trigger` | `manual`\|`daily`\|`meeting`\|`slash` (optional) | |
| `variables` | string[] (optional) | Named variable slots in the template |
| `defaultTags` | string[] (optional) | Auto-applied to notes created from this template |
| `enabled` | boolean (optional) | |

---

### `brain_update_note_template`

Patch any field on a template.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Template ID |
| `name` | string (optional) | |
| `body` | string (optional) | |
| `trigger` | `manual`\|`daily`\|`meeting`\|`slash` (optional) | |
| `variables` | string[]\|null (optional) | |
| `defaultTags` | string[]\|null (optional) | |
| `enabled` | boolean (optional) | |

---

### `brain_delete_note_template`

Permanently delete a template. Existing notes created from it are unaffected.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Template ID |

---

### `brain_create_note_from_template`

Apply a template (resolving `{{today}}`, `{{userName}}`, etc.) and create a new note.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `templateId` | integer | Template ID |
| `titleOverride` | string (max 255, optional) | Override the default title |

**Response (slim):**
```json
{ "id": 301, "title": "Daily Standup 2026-06-04", "bodyLength": 420, "tags": ["standup"], "updatedAt": "..." }
```

---

## CRM (via Brain)

### `brain_list_companies`

List CRM companies. Use `brain_search` for semantic matching; use this for structured field filters.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `search` | string (optional) | ILIKE on name and domain |
| `industry` | string (optional) | |
| `limit` | integer 1–200 (optional) | |

---

### `brain_get_company`

Get a CRM company with its linked contacts and open deals.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `companyId` | integer | Company ID |

---

### `brain_list_contacts`

List CRM contacts with optional filters.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `search` | string (optional) | ILIKE on first name, last name, email |
| `companyId` | integer (optional) | |
| `status` | string (optional) | |
| `limit` | integer 1–200 (optional) | |

---

### `brain_get_contact`

Get a CRM contact with their linked company and open deals.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `contactId` | integer | Contact ID |

---

### `brain_list_deals`

List CRM deals with optional filters.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `open`\|`won`\|`lost` (optional) | |
| `priority` | `low`\|`medium`\|`high` (optional) | |
| `stageId` | integer (optional) | |
| `companyId` | integer (optional) | |
| `limit` | integer 1–200 (optional) | |

---

### `brain_get_deal`

Get a CRM deal with its linked company, primary contact, and stage info.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `dealId` | integer | Deal ID |

---

### `brain_list_posts`

List website posts / pages owned by this tenant. Slim response (no body JSON). Use `brain_get_post` for the full block content.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `websiteId` | integer (optional) | |
| `published` | boolean (optional) | |
| `postType` | string (optional) | |
| `limit` | integer 1–200 (optional) | |

---

### `brain_get_post`

Get a post including its full block JSON (`posts.content`). Validates tenancy via the website ownership.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `postId` | integer | Post ID |

---

## Initiatives

### `brain_initiatives_list`

List initiatives. Slim by default — returns `{ id, name, slug, status, priority, ownerId, targetDate, goalCount }` per row. Heavy text fields are opt-in via `include`.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `planned`\|`active`\|`paused`\|`completed`\|`cancelled` (optional) | |
| `ownerId` | integer (optional) | |
| `priority` | `low`\|`medium`\|`high`\|`critical` (optional) | |
| `hasOpenGoals` | boolean (optional) | |
| `targetDateBefore` | string (optional) | ISO date |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | `["description"]`\|`["lessonsLearned"]` (optional) | Opt into heavy text fields |

---

### `brain_initiatives_get`

Get one initiative by id with optional goals and linked entities.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Initiative ID |
| `includeGoals` | boolean (optional) | Inline ordered goals |
| `includeLinks` | boolean (optional) | Inline linked entity rows + byType counts |
| `include` | string[] (optional) | `"description"`, `"lessonsLearned"` |

---

### `brain_initiatives_links`

List polymorphic entities linked to an initiative (tasks, notes, meetings, decisions, topics, CRM deals/companies).

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Initiative ID |
| `entityType` | `task`\|`note`\|`meeting`\|`decision`\|`topic`\|`crm_deal`\|`crm_company` (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |

---

### `brain_initiatives_create`

Create a multi-quarter initiative. Echo: `{ id, slug, status }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `name` | string (1–255 chars) | |
| `description` | string\|null (optional) | |
| `status` | `planned`\|`active`\|`paused`\|`completed`\|`cancelled` (optional) | |
| `priority` | `low`\|`medium`\|`high`\|`critical` (optional) | |
| `ownerId` | integer\|null (optional) | |
| `sponsorId` | integer\|null (optional) | |
| `startDate` | string\|null (optional) | ISO date |
| `targetDate` | string\|null (optional) | ISO date |
| `confidentialityLevel` | `standard`\|`restricted`\|`confidential` (optional) | |

---

### `brain_initiatives_update`

Patch fields on an initiative. Status changes are rejected — use `brain_initiatives_close` or `brain_initiatives_reopen` instead.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Initiative ID |
| `patch` | object | `name`, `description`, `priority`, `ownerId`, `sponsorId`, `startDate`, `targetDate`, `confidentialityLevel` |

---

### `brain_initiatives_close`

Terminal status transition — outcome must be `completed` or `cancelled`. Requires at least one of `reason` / `lessonsLearned`. When `lessonsLearned` is provided, a pinned brain note is auto-created.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Initiative ID |
| `outcome` | `completed`\|`cancelled` | |
| `reason` | string (max 2000, optional) | |
| `lessonsLearned` | string (max 50 000, optional) | Auto-creates a linked pinned note |

---

### `brain_initiatives_reopen`

Reopen a previously closed initiative — only from `completed` or `cancelled`. Sets status to `active`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Initiative ID |

---

### `brain_initiatives_link`

Attach a polymorphic entity to an initiative. Idempotent.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `initiativeId` | integer | |
| `entityType` | enum | `task`, `note`, `meeting`, `decision`, `topic`, `crm_deal`, `crm_company`, `person`, `org_unit`, `glossary_term` |
| `entityId` | integer | |
| `note` | string\|null (optional) | |
| `pinned` | boolean (optional) | |

---

### `brain_initiatives_unlink`

Remove a polymorphic link from an initiative.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `initiativeId` | integer | |
| `entityType` | enum | Same values as `brain_initiatives_link` |
| `entityId` | integer | |

---

## Goals

### `brain_goals_list`

List goals. Slim by default; opt into `"description"` and `"lastProgressNote"` via `include`.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `initiativeId` | integer (optional) | |
| `status` | `open`\|`on_track`\|`at_risk`\|`off_track`\|`achieved`\|`missed` (optional) | |
| `ownerId` | integer (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | string[] (optional) | `"description"`, `"lastProgressNote"` |

---

### `brain_goals_get`

Get one goal by id with a slim parent-initiative reference.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Goal ID |
| `include` | string[] (optional) | `"description"`, `"lastProgressNote"` |

---

### `brain_goals_create`

Create a goal under an existing initiative.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `initiativeId` | integer | Parent initiative |
| `title` | string (1–255 chars) | |
| `description` | string\|null (optional) | |
| `ownerId` | integer\|null (optional) | |
| `unit` | string (max 30)\|null (optional) | Metric unit (e.g. `"ARR $"`, `"%"`) |
| `targetMetric` | integer\|null (optional) | |
| `currentMetric` | integer\|null (optional) | |
| `targetDate` | string\|null (optional) | ISO date |
| `sortOrder` | integer (optional) | |
| `status` | `open`\|`on_track`\|`at_risk`\|`off_track`\|`achieved`\|`missed` (optional) | |

---

### `brain_goals_update`

Patch fields on a goal (including status).

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Goal ID |
| `patch` | object | Same fields as create minus `initiativeId` |

---

### `brain_goals_checkin`

Drop a progress check-in: updates `currentMetric`, `lastProgressNote`, `lastCheckedInAt`. When status is omitted but `currentMetric` is provided, the auto-classifier picks the new status.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Goal ID |
| `currentMetric` | integer (optional) | |
| `note` | string (max 10 000)\|null (optional) | Progress note |
| `status` | `open`\|`on_track`\|`at_risk`\|`off_track`\|`achieved`\|`missed` (optional) | |

---

### `brain_goals_delete`

Hard-delete a goal.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Goal ID |

---

## Decisions

Decisions are **immutable history** — rationale and decision text cannot be edited in place. Use `brain_decisions_supersede` to create a successor and atomically link it.

### `brain_decisions_list`

List decisions with optional filters. Slim by default; opt into heavy text fields via `include`. Paginated via `{ items, total, limit, offset }`.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `proposed`\|`accepted`\|`superseded`\|`rejected` (optional) | |
| `reversibility` | `one_way`\|`two_way` (optional) | |
| `decisionMakerId` | integer (optional) | |
| `dateFrom` | string (optional) | ISO — `decidedAt >= this` |
| `dateTo` | string (optional) | ISO — `decidedAt <= this` |
| `supersededOnly` | boolean (optional) | |
| `topicId` | integer (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | string[] (optional) | `"context"`, `"rationale"`, `"decision"`, `"alternatives"` |

---

### `brain_decisions_get`

Fetch a decision by id with its supersedes chain (ancestors + descendants). Heavy text fields are opt-in.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Decision ID |
| `include` | string[] (optional) | `"context"`, `"rationale"`, `"decision"`, `"alternatives"` |

---

### `brain_decisions_create`

Create a new accepted decision. Echo is slim — full prose lives in the input but is not echoed back. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `title` | string (1–255 chars) | |
| `decision` | string | The decision text (required) |
| `rationale` | string | Why this decision was made (required) |
| `context` | string\|null (optional) | Background |
| `alternativesConsidered` | string\|null (optional) | |
| `reversibility` | `one_way`\|`two_way` (optional) | |
| `decidedAt` | string (optional) | ISO timestamp; defaults to now |
| `decisionMakerId` | integer\|null (optional) | |
| `anchors` | object (optional) | `{ meetingId?, noteId?, companyId?, dealId? }` |
| `confidentialityLevel` | `standard`\|`restricted`\|`confidential` (optional) | |

---

### `brain_decisions_update`

Patch mutable fields on a decision (title, context, decisionMakerId, anchors, confidentialityLevel, alternativesConsidered). Attempts to mutate `decision`, `rationale`, or `reversibility` return `{ error: "use_supersede" }`. **Audited.**

- **Auth:** `brain:write`

---

### `brain_decisions_supersede`

Atomically create a successor decision and link it back to the old one (`old.status → "superseded"`). Use when you need to change rationale, decision text, or reversibility. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `oldId` | integer | Decision to supersede |
| `title` | string | |
| `decision` | string | New decision text |
| `rationale` | string | |
| Plus all optional fields from `brain_decisions_create` | | |

**Response:**
```json
{
  "previous": { "id": 10, "status": "superseded" },
  "current": { "id": 11, "status": "accepted", "decidedAt": "2026-06-04T..." }
}
```

---

### `brain_decisions_reject`

Soft-reject a decision by transitioning status to `rejected`. Idempotent. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Decision ID |
| `reason` | string (max 500, optional) | |

---

## Topics

### `brain_topics_list`

Flat list of every topic in path order. Pass `tagPrefix` to scope to a subtree; `includeEntityCounts` to add per-row count.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `tagPrefix` | string (optional) | Path prefix filter |
| `includeEntityCounts` | boolean (optional) | |

---

### `brain_topics_tree`

Nested topic taxonomy tree with per-node `childCount` and `entityCount`. Descriptions are opt-in.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `includeDescriptions` | boolean (optional) | |

---

### `brain_topics_get`

Fetch a topic by id with its breadcrumb (root → immediate parent).

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Topic ID |
| `includeDescription` | boolean (optional) | |

---

### `brain_topics_entities`

List entities attached to a topic (notes, meetings, tasks, decisions, relationship overlays, initiatives, people). Paginated; limit capped at 100.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Topic ID |
| `entityType` | `note`\|`meeting`\|`task`\|`decision`\|`relationship_overlay`\|`initiative`\|`person` (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |

---

### `brain_topics_create`

Create a topic. Slug and path auto-derive from name; collisions get a `-2`, `-3` suffix. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `name` | string (1–150 chars) | |
| `parentId` | integer\|null (optional) | |
| `description` | string\|null (optional) | |
| `color` | string (optional) | |
| `icon` | string (optional) | |
| `sortOrder` | integer (optional) | |
| `derivedFromTag` | string (optional) | Tag slug this topic was derived from |

---

### `brain_topics_update`

Patch a topic. Rename does NOT change slug (stable URLs). Use `brain_topics_move` to reparent. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Topic ID |
| `patch` | object | `name`, `description`, `color`, `icon`, `sortOrder` |

---

### `brain_topics_move`

Move a topic under a new parent, recomputing the materialized path for the entire subtree atomically. Pass `newParentId: null` to promote to root. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Topic ID |
| `newParentId` | integer\|null | Target parent; `null` = root |

---

### `brain_topics_merge`

Fold `sourceId` into `targetId`: reattach entity links (skipping duplicates), reparent source's children under target, then delete source. Refuses to merge into a descendant. **Audited.**

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `sourceId` | integer | |
| `targetId` | integer | |

---

### `brain_topics_delete`

Delete a topic. Refuses if it has children. Refuses if entities are attached unless `force: true`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Topic ID |
| `force` | boolean (optional) | Drop attached entity join rows before deleting |

---

### `brain_topics_attach`

Bulk-attach one or more topics to a single entity. Idempotent; cross-tenant topic IDs are silently dropped.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `targetEntityType` | `note`\|`meeting`\|`task`\|`decision`\|`relationship_overlay`\|`initiative`\|`person` | |
| `targetEntityId` | integer | |
| `topicIds` | integer[] (1–50) | |

---

### `brain_topics_detach`

Bulk-detach one or more topics from a single entity. Missing rows are a no-op.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `targetEntityType` | same enum as attach | |
| `targetEntityId` | integer | |
| `topicIds` | integer[] (1–50) | |

---

### `brain_topics_import_from_tags`

Walk every `brain_notes.tags` string, split hierarchical `a/b/c` tags into a topic tree, find-or-create each segment, and attach notes to the leaf topic. `dryRun: true` returns the report without writing. Idempotent.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `tagPrefix` | string (optional) | Scope to one branch |
| `dryRun` | boolean (optional) | Default `false` |

---

## People

### `brain_people_list`

List internal people (employees / advisors / contractors). Slim by default; opt into `"notes"` and `"profileUrls"` via `include`.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `active`\|`inactive`\|`departed` (optional) | |
| `orgUnitId` | integer (optional) | |
| `expertiseTagId` | integer (optional) | |
| `managerId` | integer (optional) | |
| `search` | string (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | `["notes"]`\|`["profileUrls"]` (optional) | |

---

### `brain_people_get`

Fetch a person with manager, direct reports, org-unit memberships, and expertise tags.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Person ID |
| `include` | string[] (optional) | `"notes"`, `"profileUrls"` |

---

### `brain_who_knows`

Resolve a free-text query to expertise tags, then rank people by matched-tag count, level bonus, and primary-org-unit bonus. Use this for "who should I talk to about X" queries.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `query` | string (1–200 chars) | |
| `limit` | integer 1–25 (optional) | |

**Tool call example:**
```json
{ "name": "brain_who_knows", "arguments": { "query": "Postgres query optimization", "limit": 5 } }
```

---

### `brain_people_create`

Add an internal person. Echo: `{ id, status }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `fullName` | string (1–200 chars) | |
| `email` | string\|null (optional) | |
| `userId` | integer\|null (optional) | Link to a portal user account |
| `managerId` | integer\|null (optional) | |
| `title` | string\|null (optional) | Job title |
| `startDate` | string\|null (optional) | ISO date |
| `endDate` | string\|null (optional) | ISO date |
| `status` | `active`\|`inactive`\|`departed` (optional) | |
| `notes` | string\|null (optional) | Free-form notes |
| `profileUrls` | `{label, url}[]` (optional) | LinkedIn etc. |

---

### `brain_people_update`

Patch fields on a person. Manager change is cycle-guarded — assigning a descendant returns `{ error: "manager_cycle" }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Person ID |
| `patch` | object | Same fields as create minus `userId` |

---

### `brain_people_delete`

Delete a person. Cascades org-unit memberships and expertise junctions; direct reports chains are nulled out.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Person ID |

---

### `brain_people_attach_expertise`

Attach an expertise tag to a person with an optional proficiency level (1–4). Idempotent — updates level if the row already exists.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `personId` | integer | |
| `expertiseTagId` | integer | |
| `level` | integer 1–4\|null (optional) | Proficiency level |

---

### `brain_people_detach_expertise`

Remove an expertise tag from a person.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `personId` | integer | |
| `expertiseTagId` | integer | |

---

## Expertise Tags

### `brain_expertise_tags_list`

List per-tenant expertise tags. `peopleCount` is always populated. Slim by default.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `search` | string (optional) | ILIKE on name and description |
| `source` | `manual`\|`ai_suggested` (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | `["description"]` (optional) | |

---

### `brain_expertise_tags_create`

Create a per-tenant expertise tag. Slug auto-derived; collisions suffixed `-2`, `-3`. Echo: `{ id, slug }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `name` | string (1–100 chars) | |
| `description` | string\|null (optional) | |
| `source` | `manual`\|`ai_suggested` (optional) | |

---

### `brain_expertise_tags_update`

Patch name or description on an expertise tag. Slug stays stable.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Tag ID |
| `patch` | object | `{ name?, description? }` |

---

### `brain_expertise_tags_delete`

Delete an expertise tag. Refuses by default if any person still holds it — pass `force: true` to cascade-detach. Returns `{ error: "in_use", peopleAttached }` on conflict.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Tag ID |
| `force` | boolean (optional) | |

---

### `brain_expertise_tags_merge`

Re-attach every person–expertise row from `sourceTagId` to `targetTagId`, then delete the source tag.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `sourceTagId` | integer | |
| `targetTagId` | integer | |

---

## Org Units

### `brain_org_units_list`

Flat list of org units ordered by path. `memberCount` always populated. Descriptions are opt-in.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `include` | `["descriptions"]` (optional) | |

---

### `brain_org_units_tree`

Nested org-unit tree with per-node `childCount` and `memberCount`.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `include` | `["descriptions"]` (optional) | |

---

### `brain_org_units_get`

Fetch an org unit with its ancestor chain and members.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Org unit ID |

---

### `brain_org_units_create`

Create a hierarchical org unit. Slug auto-derived; path computed from parent. Echo: `{ id, slug, path }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `name` | string (1–150 chars) | |
| `parentId` | integer\|null (optional) | |
| `description` | string\|null (optional) | |
| `leadPersonId` | integer\|null (optional) | |
| `color` | string (optional) | |
| `icon` | string (optional) | |
| `sortOrder` | integer (optional) | |

---

### `brain_org_units_update`

Patch fields on an org unit. Slug and path stay stable on rename. Use `brain_org_units_move` to reparent.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Org unit ID |
| `patch` | object | `name`, `description`, `leadPersonId`, `color`, `icon`, `sortOrder` |

---

### `brain_org_units_move`

Re-parent an org unit, rewriting the path prefix for the unit and all descendants. Cycle-guarded.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Org unit ID |
| `newParentId` | integer\|null | `null` = promote to root |

---

### `brain_org_units_merge`

Re-parent source's children under target, re-attach source's members to target (dedup-safe), then delete source.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `sourceId` | integer | |
| `targetId` | integer | |

---

### `brain_org_units_delete`

Delete an org unit. Refuses by default if it has members or children — pass `force: true` to cascade. Returns `{ error: "in_use", memberCount, childCount }` on conflict.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Org unit ID |
| `force` | boolean (optional) | |

---

### `brain_org_units_add_member`

Attach a person to an org unit. Idempotent — re-attaching updates `primary` and `roleInUnit`. Marking `primary: true` flips other memberships to `primary: false`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `orgUnitId` | integer | |
| `personId` | integer | |
| `primary` | boolean (optional) | |
| `roleInUnit` | string\|null (optional) | Role label within this unit |

---

### `brain_org_units_remove_member`

Detach a person from an org unit.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `orgUnitId` | integer | |
| `personId` | integer | |

---

### `brain_org_units_set_primary`

Mark an org unit as the primary membership for a person. Flips all other memberships to `primary: false`. Requires the membership to already exist.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `personId` | integer | |
| `orgUnitId` | integer | |

---

## Glossary

### `brain_glossary_list`

List tenant glossary terms (acronyms, codenames, jargon). Slim by default; opt into `"definition"` and `"aliases"` via `include`. Limit capped at 100.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `active`\|`deprecated` (optional) | |
| `category` | string (optional) | |
| `search` | string (optional) | Substring on term, aliases, and definition |
| `ownerId` | integer (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | `["definition"]`\|`["aliases"]` (optional) | |

---

### `brain_glossary_get`

Fetch a single term with its "see also" related terms.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Term ID |
| `include` | string[] (optional) | `"definition"`, `"aliases"` |

---

### `brain_glossary_lookup`

Scored lookup against active glossary terms — returns ranked matches (exact term → exact alias → prefix → substring → definition). **Use before answering any question that may contain tenant-specific acronyms.** Limit capped at 25.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `query` | string (1–200 chars) | |
| `limit` | integer 1–25 (optional) | Default 10 |

**Tool call example:**
```json
{ "name": "brain_glossary_lookup", "arguments": { "query": "OKR", "limit": 3 } }
```

---

### `brain_glossary_create`

Add a new glossary term. Slug auto-derived from `term`. Echo: `{ id, slug }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `term` | string (1–200 chars) | |
| `definition` | string | Full definition |
| `shortDefinition` | string (max 500, optional) | One-liner |
| `aliases` | string[] (optional) | |
| `status` | `active`\|`deprecated` (optional) | |
| `category` | string (max 100, optional) | |
| `ownerId` | integer (optional) | |
| `relatedTermIds` | integer[] (optional) | |
| `source` | `manual`\|`ai_suggested` (optional) | |

---

### `brain_glossary_update`

Patch any field on a glossary term except slug. Echo: `{ id, updatedFields }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Term ID |
| `patch` | object | `term`, `definition`, `shortDefinition`, `aliases`, `status`, `category`, `ownerId`, `relatedTermIds` |

---

### `brain_glossary_delete`

Hard-delete a term. Also prunes this ID from every other term's `relatedTermIds` list.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Term ID |

**Response:**
```json
{ "id": 22, "deleted": true, "prunedRelatedTermFromCount": 3 }
```

---

### `brain_glossary_bulk_import`

Insert or update up to 200 terms in one call. Upsert keyed on slug (auto-derived from `term`) per tenant. Echo: `{ created, updated, errors }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `terms` | object[] (1–200) | Each: `{ term, definition, shortDefinition?, aliases?, category? }` |

---

## Playbooks

### `brain_playbooks_list`

List multi-step playbooks. Slim by default — returns `{ id, name, slug, status, category, triggerKind, ownerId, stepCount, activeRunCount }`. Opt into `"description"`, `"triggerConfig"`, `"defaultTopicIds"` via `include`.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `draft`\|`active`\|`archived` or array (optional) | |
| `category` | string (optional) | |
| `triggerKind` | `manual`\|`event`\|`scheduled` or array (optional) | |
| `ownerId` | integer (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | string[] (optional) | |

---

### `brain_playbooks_get`

Get one playbook with its ordered steps. Heavy fields (`description`, step `config` / `condition` blobs) are opt-in.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Playbook ID |
| `include` | string[] (optional) | `"description"`, `"stepConfigs"` |

---

### `brain_playbooks_create`

Create a new playbook (always starts in `draft`). Use `brain_playbooks_add_step` to attach steps, then `brain_playbooks_activate` to make it runnable.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `name` | string (1–200 chars) | |
| `description` | string\|null (optional) | |
| `triggerKind` | `manual`\|`event`\|`scheduled` (optional) | |
| `triggerConfig` | object\|null (optional) | `{ event?, filters?, cron? }` |
| `category` | string\|null (optional) | |
| `ownerId` | integer\|null (optional) | |
| `defaultTopicIds` | integer[] (optional) | Auto-attach to runs |

---

### `brain_playbooks_update`

Patch fields on a playbook definition. Status changes are rejected — use `brain_playbooks_activate` or `brain_playbooks_archive` instead.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Playbook ID |
| `patch` | object | `name`, `description`, `category`, `ownerId`, `triggerKind`, `triggerConfig`, `defaultTopicIds` |

---

### `brain_playbooks_activate`

Flip status from `draft` to `active`. Refuses if the playbook has zero steps or the step graph fails DAG validation (cycles, missing refs, no entry point). Returns `{ error: "dag_invalid", errors: string[] }` on failure.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Playbook ID |

---

### `brain_playbooks_archive`

Archive an active playbook (no new runs can be started).

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Playbook ID |

---

### `brain_playbooks_delete`

Permanently delete a playbook. Refuses if there are any active or paused runs.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Playbook ID |

---

### `brain_playbooks_add_step`

Add a step to a playbook (only on `draft` playbooks).

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `playbookId` | integer | |
| `key` | string | Unique step key within the playbook |
| `name` | string | Display name |
| `kind` | `task`\|`note`\|`meeting`\|`decision`\|`review_item`\|`wait`\|`branch` | |
| `nextStepKeys` | string[] (optional) | Keys of following steps |
| `config` | object (optional) | Step-kind-specific configuration |
| `condition` | `{ field, op, value? }`\|null (optional) | Branch condition |
| `description` | string (optional) | |
| `sortOrder` | integer (optional) | |

---

### `brain_playbooks_update_step`

Patch fields on a step.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `stepId` | integer | Step ID |
| `patch` | object | Same optional fields as `add_step` |

---

### `brain_playbooks_remove_step`

Remove a step from a playbook.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `stepId` | integer | Step ID |

---

### `brain_playbooks_reorder_steps`

Reorder steps within a playbook by providing the full ordered list of step IDs.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `playbookId` | integer | |
| `stepIds` | integer[] | Full ordered list of step IDs |

---

## Playbook Runs

### `brain_playbook_runs_list`

List runs. Slim row default. Filter by status and/or playbookId. Limit capped at 100.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | `pending`\|`active`\|`paused`\|`completed`\|`aborted`\|`failed` or array (optional) | |
| `playbookId` | integer (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |

---

### `brain_playbook_runs_get`

Get one run with `{ run, playbook (slim), steps, links }`. Heavy JSON columns are opt-in.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Run ID |
| `include` | `["context"]`\|`["triggerPayload"]` (optional) | |

---

### `brain_playbook_runs_active_for_entity`

List active and paused runs anchored to a given entity via playbook links.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `entityType` | `initiative`\|`person`\|`crm_company`\|`crm_deal`\|`meeting`\|`decision` | |
| `entityId` | integer | |

---

### `brain_playbook_runs_start`

Start a playbook run.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `playbookId` | integer | Must be `active` |
| `label` | string (optional) | Human-readable run label |
| `context` | object (optional) | Seed data for the run |
| `triggerPayload` | object (optional) | |
| `linkedEntities` | `{entityType, entityId}[]` (optional) | Anchor the run to entities |

---

### `brain_playbook_runs_advance`

Advance a run to the next step (or complete it if no further steps). Triggers recursive spawn chaining when explicit step completion is used.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `runId` | integer | Run ID |

---

### `brain_playbook_run_steps_complete`

Mark a specific run step as completed, providing an optional result entity reference.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `runId` | integer | Run ID |
| `stepId` | integer | Step ID |
| `resultEntityType` | string (optional) | Entity type of the result |
| `resultEntityId` | integer (optional) | Entity ID of the result |

---

### `brain_playbook_run_steps_skip`

Skip a specific run step with a reason.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `runId` | integer | Run ID |
| `stepId` | integer | Step ID |
| `reason` | string (optional) | |

---

### `brain_playbook_runs_abort`

Abort a run.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `runId` | integer | Run ID |
| `reason` | string (optional) | |

---

## Documents

Documents are versioned SOPs, policies, and required-reads. The lifecycle is: create → edit draft → publish → (archive / unarchive). Acknowledgments are the compliance record.

### `brain_documents_list`

List versioned documents. Slim by default. Pass `include: ["body"]` to hydrate each row with the current published version's body (heavy). Limit capped at 100.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `status` | document status enum (optional) | |
| `category` | document category enum (optional) | |
| `ownerId` | integer (optional) | |
| `search` | string (max 500, optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | `["body"]` (optional) | |

---

### `brain_documents_get`

Fetch a single document with version list and links. `includeBody: true` attaches current published + draft version full rows; `includeAllVersions: true` attaches every version row.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Document ID |
| `includeBody` | boolean (optional) | |
| `includeAllVersions` | boolean (optional) | |

---

### `brain_document_versions_list`

List a document's versions newest-first. Slim by default; opt into `"body"`, `"changeNotes"`, `"summary"` via `include`. Limit capped at 100.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |
| `include` | string[] (optional) | `"body"`, `"changeNotes"`, `"summary"` |

---

### `brain_document_versions_get`

Fetch one specific document version. Full markdown `body` ships by default. Optional `"changeNotes"` and `"summary"` via `include`.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `versionId` | integer | Version ID |
| `include` | string[] (optional) | `"changeNotes"`, `"summary"` |

---

### `brain_documents_create`

Create a new document seeded with an empty v1 draft. Echo: `{ id, slug, status, version1Id }`. Follow up with `brain_document_versions_edit_draft`, then `brain_documents_publish`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `title` | string (1–255 chars) | |
| `category` | document category enum (optional) | |
| `ownerId` | integer\|null (optional) | |
| `confidentialityLevel` | `standard`\|`restricted`\|`confidential` (optional) | |
| `defaultTopicIds` | integer[] (optional) | Auto-link topics on creation |
| `sourceNoteId` | integer\|null (optional) | Note this document was promoted from |

---

### `brain_documents_update`

Patch document-level metadata (title, category, ownerId, confidentialityLevel, defaultTopicIds). Status changes return `{ error: "use_publish_or_archive" }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Document ID |
| `patch` | object | `title`, `category`, `ownerId`, `confidentialityLevel`, `defaultTopicIds` |

---

### `brain_document_versions_edit_draft`

Patch the document's draft body / summary / changeNotes. If no draft exists (last action was a publish), creates a new draft seeded from the latest version body. Refuses if the document is archived.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |
| `patch` | object | `{ body?, summary?, changeNotes? }` |

**Response:**
```json
{ "documentId": 5, "versionId": 18, "versionNumber": 3, "isDraft": true }
```

---

### `brain_documents_publish`

Flip the current draft to a published version. Refuses if no draft exists or if the draft body is empty — returns `{ error: "empty_draft_body" }` in that case.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Document ID |

---

### `brain_documents_archive`

Soft-archive a document — sets status to `archived`. Document remains in the database.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Document ID |
| `reason` | string (max 2000, optional) | Archive reason |

---

### `brain_documents_unarchive`

Reverse archive — restores status to `published` (if a published version exists) or `draft` otherwise.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Document ID |

---

### `brain_documents_delete`

Hard-delete a document and (via FK cascade) every version, required-read, link, and acknowledgment. Refuses by default if any acknowledgments exist — returns `{ error: "document_has_acks", ackCount }`. Pass `force: true` to cascade.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `id` | integer | Document ID |
| `force` | boolean (optional) | |

---

### `brain_documents_promote_from_note`

Create a new document seeded from an existing brain note — the note's body becomes the v1 draft body. Echo: `{ documentId, slug, version1Id }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `noteId` | integer | Source note ID |
| `title` | string (optional) | Defaults to note title |
| `category` | document category enum (optional) | |

---

### `brain_documents_link`

Attach a polymorphic entity (topic, initiative, decision, meeting, glossary_term, person) to a document. Idempotent.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |
| `entityType` | `topic`\|`initiative`\|`decision`\|`meeting`\|`glossary_term`\|`person` | |
| `entityId` | integer | |
| `note` | string\|null (optional) | |

---

### `brain_documents_unlink`

Remove a polymorphic link from a document.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |
| `entityType` | same enum as `brain_documents_link` | |
| `entityId` | integer | |

---

## Document Required Reads & Compliance

### `brain_document_required_reads_list_for_document`

Who is required to read this document? Returns rows with `targetType`, `targetId`, `targetName`, `pinnedVersionId`, `dueAt`, `assignedAt`. Limit capped at 100.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |
| `targetType` | `person`\|`org_unit` (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |

---

### `brain_document_required_reads_list_for_person`

What does this person have to read? Returns direct required-read assignments with acknowledgment status. `status` filter: `open`, `acknowledged`, `all` (default).

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `personId` | integer | |
| `status` | `open`\|`acknowledged`\|`all` (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |

---

### `brain_document_acknowledgments_list_for_document`

Audit trail of every (version, person, acknowledgedAt) recorded against a document.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |
| `versionId` | integer (optional) | |
| `personId` | integer (optional) | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |

---

### `brain_document_acknowledgments_list_for_person`

Every document a person has acknowledged, newest first.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `personId` | integer | |
| `limit` | integer 1–100 (optional) | |
| `offset` | integer (optional) | |

---

### `brain_document_compliance_report`

The canonical "who has read this, who hasn't" view. Expands org-unit required-reads to active member person IDs, partitions the assigned universe into `acknowledged / pending / overdue`, and returns full ID arrays plus a summary count rollup.

- **Auth:** `brain:read`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |

**Response:**
```json
{
  "documentId": 5,
  "currentPublishedVersionId": 18,
  "acknowledged": [14, 22],
  "pending": [33],
  "overdue": [41],
  "counts": { "acknowledged": 2, "pending": 1, "overdue": 1, "total": 4 }
}
```

---

### `brain_document_required_reads_assign`

Make a person or org unit required to read a document. Idempotent on `(documentId, targetType, targetId)`. When `targetType: "org_unit"` and `expandOrgUnit: true`, fans out to one row per active member (current snapshot). Echo: `{ assigned, alreadyAssigned, expandedTo? }`.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |
| `targetType` | `person`\|`org_unit` | |
| `targetId` | integer | |
| `pinnedVersionId` | integer\|null (optional) | Pin to a specific version |
| `dueAt` | string\|null (optional) | ISO timestamp |
| `expandOrgUnit` | boolean (optional) | Fan out to active org-unit members |

---

### `brain_document_required_reads_remove`

Delete a required-read row. Refuses by default if any acknowledgments reference it — returns `{ error: "has_acks" }`. Pass `force: true` to unlink (acks survive but lose their pointer).

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `requiredReadId` | integer | Required-read row ID |
| `force` | boolean (optional) | |

---

### `brain_documents_acknowledge`

Record a `(documentId, versionId, personId)` acknowledgment. Idempotent. If `requiredReadId` is omitted, auto-links to a matching person-target required-read when one exists.

- **Auth:** `brain:write`

| Input field | Type | Description |
|---|---|---|
| `documentId` | integer | |
| `versionId` | integer | |
| `personId` | integer | |
| `acknowledgmentNote` | string (max 10 000)\|null (optional) | |
| `requiredReadId` | integer\|null (optional) | |

**Response:**
```json
{
  "ackId": 77,
  "documentId": 5,
  "versionId": 18,
  "personId": 14,
  "acknowledgedAt": "2026-06-04T09:00:00.000Z"
}
```
