# MCP Tools — Email, Surveys, Pitch Decks & Automations

These MCP tools let you manage your email marketing (lists, subscribers, campaigns, templates, segments), build and publish surveys and intake forms, create and iterate on pitch decks and presentations, and define automation rules — all from any AI client connected to the SimplerDevelopment portal.

Authentication and connection setup are covered in [MCP Overview](./overview.md). Every tool call is scoped to your client account — you cannot read or write another tenant's data.

---

## Approval workflow

Many write tools in this area go through an **approval step** before they take effect. When a tool returns `approval.url`, share that URL with your team (or click it yourself) to approve or reject the pending change. **Approving a campaign draft does NOT send it** — approving only commits the draft to the database. Sending requires a separate, explicit call to `email_campaigns_send`.

When a write lands directly (no pending workflow), the response will not include a `pending: true` key — you'll get the created/updated row directly.

---

## Email

**Required service:** `email`

### `email_lists`

List all email marketing lists owned by your account.

- **Auth:** scope `email:read`
- **Input:** _(none)_

**Response**

```json
[
  {
    "id": 12,
    "clientId": 4,
    "name": "Newsletter Subscribers",
    "description": "Main newsletter list",
    "createdAt": "2025-11-01T10:00:00.000Z",
    "updatedAt": "2025-11-01T10:00:00.000Z"
  }
]
```

**Example**

```json
{ "tool": "email_lists" }
```

---

### `email_lists_create`

Create a new email list.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `name` | string (required) | List name. |
| `description` | string | Optional description. |

**Request body**

```json
{
  "name": "Q1 Prospects",
  "description": "Leads acquired in Q1 campaign"
}
```

**Response**

```json
{
  "id": 13,
  "clientId": 4,
  "name": "Q1 Prospects",
  "description": "Leads acquired in Q1 campaign",
  "createdAt": "2026-01-10T09:00:00.000Z",
  "updatedAt": "2026-01-10T09:00:00.000Z"
}
```

---

### `email_lists_update`

Rename a list or update its description.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | List ID. |
| `name` | string | New name. |
| `description` | string \| null | New description (pass `null` to clear). |

**Response:** Updated list row.

**Errors:** `{ "error": "List not found" }`

---

### `email_lists_delete`

Permanently delete a list and all its subscribers. Blocked if campaigns reference the list.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | List ID. |

**Response**

```json
{ "success": true, "id": 13 }
```

**Errors:** `{ "error": "Cannot delete: <db constraint message>" }`

---

### `email_subscribers_list`

List subscribers on a list, newest first.

- **Auth:** scope `email:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `listId` | number (required) | List to query. |
| `status` | `active` \| `unsubscribed` \| `bounced` \| `complained` | Filter by status. |
| `search` | string | Case-insensitive match on email or name. |
| `limit` | number (1–500, default 100) | Max rows to return. |

**Response**

```json
[
  {
    "id": 501,
    "listId": 12,
    "email": "jane@example.com",
    "name": "Jane Doe",
    "status": "active",
    "metadata": { "source": "webinar" },
    "subscribedAt": "2026-01-15T08:00:00.000Z",
    "unsubscribedAt": null
  }
]
```

**Errors:** `{ "error": "List not found" }`

---

### `email_subscribers_add`

Add a subscriber to a list. If the email already exists on that list, the existing row is updated instead of creating a duplicate. A fresh unsubscribe token is generated for new rows.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `listId` | number (required) | Target list. |
| `email` | string/email (required) | Subscriber email (normalized to lowercase). |
| `name` | string | Display name. |
| `metadata` | `Record<string, string>` | Arbitrary key-value pairs. |
| `status` | `active` \| `unsubscribed` \| `bounced` \| `complained` | Defaults to `active`. |

**Response:** The inserted or updated subscriber row.

**Errors:** `{ "error": "List not found" }`

---

### `email_subscribers_update`

Update a subscriber's name, status, or metadata.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Subscriber ID. |
| `name` | string \| null | Display name (pass `null` to clear). |
| `status` | `active` \| `unsubscribed` \| `bounced` \| `complained` | New status. Setting `unsubscribed` stamps `unsubscribedAt`. |
| `metadata` | `Record<string, string>` \| null | Replaces existing metadata (pass `null` to clear). |

**Response:** Updated subscriber row.

**Errors:** `{ "error": "Subscriber not found" }`

---

### `email_subscribers_remove`

Remove a subscriber. Default is a soft unsubscribe (status → `unsubscribed`). Pass `hardDelete: true` to permanently delete the row.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Subscriber ID. |
| `hardDelete` | boolean | If `true`, permanently deletes the row. Default `false`. |

**Response**

```json
{ "success": true, "id": 501, "mode": "soft" }
```

**Errors:** `{ "error": "Subscriber not found" }`

---

### `email_campaigns_list`

List campaigns, newest first. Returns the slim projection (no HTML body or block JSON) by default.

- **Auth:** scope `email:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `status` | string | Filter by status (e.g. `draft`, `scheduled`, `sent`). |
| `includeContent` | boolean | Include `htmlContent` + `blockContent`. Default `false` — these can be hundreds of KB per row. |

**Response**

```json
[
  {
    "id": 88,
    "name": "March Newsletter",
    "subject": "What's new at Acme",
    "status": "draft",
    "listId": 12,
    "fromName": "Acme Team",
    "fromEmail": "hello@acme.com",
    "createdAt": "2026-03-01T10:00:00.000Z",
    "updatedAt": "2026-03-01T10:00:00.000Z"
  }
]
```

---

### `email_campaigns_create`

Create a draft email campaign tied to a list. Provide either `htmlContent` or `blocks` (rendered server-side to HTML). Campaign status starts as `draft`. Returns an `approval.url` for human review — **approval does not send the campaign**.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `name` | string (required) | Internal campaign name. |
| `subject` | string (required) | Email subject line. |
| `listId` | number (required) | Target list (must belong to your account). |
| `fromName` | string (required) | Sender display name. |
| `fromEmail` | string/email (required) | Sender address. |
| `replyTo` | string/email | Reply-to address. |
| `previewText` | string | Email preview snippet. |
| `htmlContent` | string | Pre-rendered HTML body. |
| `blocks` | array | Array of Block objects — rendered to HTML server-side. Provide this OR `htmlContent`, not both. |
| `includeContent` | boolean | Echo `htmlContent` + `blockContent` in the response. Default `false`. |

**Request body**

```json
{
  "name": "March Newsletter",
  "subject": "What's new this month",
  "listId": 12,
  "fromName": "Acme Team",
  "fromEmail": "hello@acme.com",
  "previewText": "Read our latest updates...",
  "htmlContent": "<p>Hello!</p>"
}
```

**Response**

```json
{
  "id": 88,
  "name": "March Newsletter",
  "subject": "What's new this month",
  "status": "draft",
  "listId": 12,
  "approval": {
    "url": "https://app.simplerdevelopment.com/approve/abc123",
    "expiresAt": "2026-03-08T10:00:00.000Z"
  }
}
```

**Errors:** `{ "error": "List not found" }`, `{ "error": "Provide htmlContent or non-empty blocks" }`

---

### `email_campaigns_update`

Update metadata or content of a **draft** campaign. Refuses campaigns in `sending`, `sent`, or `scheduled` state (unschedule first with `email_campaigns_schedule`).

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Campaign ID. |
| `name` | string | New internal name. |
| `subject` | string | New subject line. |
| `previewText` | string \| null | Preview text (pass `null` to clear). |
| `fromName` | string | Sender display name. |
| `fromEmail` | string/email | Sender address. |
| `replyTo` | string/email \| null | Reply-to address. |
| `listId` | number | Target list. |
| `htmlContent` | string | Replacement HTML body. |
| `blocks` | array | Block array — re-renders HTML if provided. |

**Response:** Updated campaign slim projection + `approval.url`.

**Errors:** `{ "error": "Campaign not found" }`, `{ "error": "Cannot edit — status is <status>" }`, `{ "error": "Target list not found" }`

---

### `email_campaigns_schedule`

Mark a draft campaign as scheduled for a future send. Sets `status` → `scheduled` and records `scheduledAt`. Pass `unschedule: true` to revert to `draft`. **Does not dispatch the campaign** — a scheduler or explicit `email_campaigns_send` call is still required.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Campaign ID. |
| `scheduledAt` | string (ISO datetime) | Required unless `unschedule: true`. Must be in the future. |
| `unschedule` | boolean | Pass `true` to revert a scheduled campaign back to `draft`. |

**Errors:** `{ "error": "scheduledAt must be in the future" }`, `{ "error": "Cannot schedule — current status is <status>" }`, `{ "error": "Cannot unschedule — current status is <status>" }`

---

### `email_campaigns_send`

Dispatch a draft or scheduled campaign to every active subscriber on its list. Skips subscribers who have already received it (resume-safe). This call is **synchronous** — large lists will block the MCP call. Always run `dryRun: true` first to verify target counts.

> **Important:** Sending requires the separate `email:send` scope, which should be granted explicitly and sparingly in addition to `email:write`.

- **Auth:** scope `email:send`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Campaign ID. |
| `dryRun` | boolean | If `true`, returns target counts without sending anything. |

**Dry-run response**

```json
{
  "dryRun": true,
  "campaignId": 88,
  "listId": 12,
  "totalActive": 1200,
  "alreadySent": 0,
  "willSend": 1200
}
```

**Live send response:** send-result object from `executeCampaignSend`.

**Errors:** `{ "error": "Campaign not found" }`, `{ "error": "Campaign is already <status>" }` (status is `sent` or `sending`)

---

### `email_campaigns_fork`

Duplicate a campaign into a new draft, linked to the original via `parentCampaignId`. Send counts, status, and schedule metadata are not carried over — only editable content. Returns the new campaign ID and an `approval.url`.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Source campaign to fork. |
| `nameSuffix` | string | Appended to the forked campaign's name. Default `" (fork)"`. |

**Response**

```json
{
  "id": 91,
  "name": "March Newsletter (fork)",
  "status": "draft",
  "parentCampaignId": 88,
  "approval": { "url": "https://app.simplerdevelopment.com/approve/def456" }
}
```

**Errors:** `{ "error": "Source campaign not found" }`

---

### `email_campaigns_delete`

Permanently delete a campaign. Blocked if the campaign is in `sent` or `sending` status.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Campaign ID. |

**Response:** `{ "success": true, "id": 88 }` or a pending approval object.

**Errors:** `{ "error": "Campaign not found" }`, `{ "error": "Cannot delete a campaign in status <status>" }` (status is `sent` or `sending`)

---

### `email_templates_list`

List reusable email templates (your account's templates plus global agency templates).

- **Auth:** scope `email:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `category` | `welcome` \| `newsletter` \| `promotion` \| `transactional` \| `custom` | Filter by template category. |

**Response**

```json
[
  {
    "id": 5,
    "name": "Welcome Email",
    "description": "Sent to new subscribers",
    "category": "welcome",
    "subject": "Welcome aboard!",
    "thumbnailUrl": null,
    "isGlobal": true,
    "usageCount": 42,
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
]
```

---

### `email_templates_create`

Save a reusable email template. Provide `htmlContent` or `blocks`.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `name` | string (required) | Template name. |
| `category` | `welcome` \| `newsletter` \| `promotion` \| `transactional` \| `custom` | Defaults to `custom`. |
| `subject` | string | Default subject line. |
| `description` | string | Short description. |
| `htmlContent` | string | HTML body. |
| `blocks` | array | Block array (rendered to HTML). Provide this OR `htmlContent`. |

**Response:** Template row (id, name, category, subject, description, thumbnailUrl, isGlobal, usageCount, createdAt, updatedAt).

**Errors:** `{ "error": "Provide htmlContent or non-empty blocks" }`

---

### `email_segments_list`

List rule-based subscriber segment definitions.

- **Auth:** scope `email:read`
- **Input:** _(none)_

**Response**

```json
[
  {
    "id": 3,
    "name": "High-engagement",
    "description": null,
    "matchType": "all",
    "rules": [{ "field": "openRate", "operator": "gt", "value": "0.5" }],
    "updatedAt": "2026-02-01T00:00:00.000Z"
  }
]
```

---

### `email_segments_create`

Define a subscriber segment by filter rules.

- **Auth:** scope `email:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `name` | string (required) | Segment name. |
| `description` | string | Optional description. |
| `matchType` | `all` \| `any` | `all` = AND all rules; `any` = OR. Defaults to `all`. |
| `rules` | array (required) | Each rule: `{ field: string, operator: string, value: string }`. |

**Request body**

```json
{
  "name": "Openers only",
  "matchType": "all",
  "rules": [
    { "field": "openRate", "operator": "gt", "value": "0" }
  ]
}
```

**Response:** New segment row.

---

### `email_analytics_get`

Return lifetime campaign performance aggregates for this client's email programme: campaigns sent, total recipients, opens, clicks, bounces, unsubscribes, open rate, click rate, and list count. Totals are across **all sent campaigns** (not date-windowed); the optional `days` parameter is accepted for forward-compatibility but has no effect.

- **Auth:** scope `email:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `days` | number | No | Accepted for forward-compatibility; currently unused — totals are lifetime. |

**Response:**

```json
{
  "totalCampaigns": 12,
  "totalSent": 14800,
  "totalOpened": 5920,
  "totalClicked": 1184,
  "totalBounced": 74,
  "totalUnsubscribed": 30,
  "openRate": "40.0",
  "clickRate": "8.0",
  "totalLists": 3
}
```

> `openRate` and `clickRate` are percentage strings with one decimal place (e.g. `"40.0"` = 40%).

---

## Surveys

**Required service:** `surveys`

### `surveys_list`

List surveys (forms, intake questionnaires, feedback polls), newest-first.

- **Auth:** scope `surveys:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `status` | `draft` \| `active` \| `closed` | Filter by status. |
| `limit` | number (1–200, default 50) | Max rows to return. |

**Response**

```json
[
  {
    "id": 7,
    "title": "Client Intake Form",
    "slug": "client-intake-form-l3x9k",
    "description": null,
    "status": "active",
    "responseCount": 34,
    "closesAt": null,
    "createdAt": "2026-01-05T00:00:00.000Z",
    "updatedAt": "2026-02-10T00:00:00.000Z"
  }
]
```

---

### `surveys_get`

Fetch a survey's full definition including all fields, pages, settings, and scoring config.

- **Auth:** scope `surveys:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Survey ID. |

**Response:** Full survey row (all columns).

**Errors:** `{ "error": "Survey not found" }`

---

### `surveys_list_responses`

List submitted responses for a survey. Answers are a JSON object keyed by field ID.

- **Auth:** scope `surveys:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `surveyId` | number (required) | Survey to query. |
| `since` | string (ISO date) | Return responses submitted after this timestamp. |
| `limit` | number (1–500, default 100) | Max rows. |

**Response**

```json
[
  {
    "id": 201,
    "surveyId": 7,
    "answers": { "field_1": "Jane Doe", "field_2": "jane@example.com" },
    "createdAt": "2026-03-12T14:22:00.000Z"
  }
]
```

**Errors:** `{ "error": "Survey not found" }`

---

### `surveys_create`

Create a new survey. Survey starts in `draft` status — activate it with `surveys_update`. Returns an `approval.url` you can share; approving in the portal flips `status` → `active` so the public `/s/<slug>` route accepts responses.

- **Auth:** scope `surveys:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `title` | string (required) | Survey title. |
| `description` | string | Intro text shown to respondents. |
| `fields` | array | `SurveyFieldDef[]` — see below. |
| `thankYouTitle` | string | Heading shown after submit. |
| `thankYouMessage` | string | Body text shown after submit. |
| `requireEmail` | boolean | Require respondents to provide an email. Default `false`. |
| `allowMultiple` | boolean | Allow the same person to respond more than once. Default `true`. |

**SurveyFieldDef shape** (each field in the `fields` array):

```json
{
  "id": "field_1",
  "type": "text",
  "label": "Full name",
  "required": true,
  "order": 1
}
```

Supported `type` values: `text`, `textarea`, `email`, `phone`, `select`, `radio`, `checkbox`, `toggle`, `date`, `rating`, `number`, `url`, `heading`, `slider`.

**Response**

```json
{
  "id": 8,
  "title": "New Client Intake",
  "slug": "new-client-intake-m4y2z",
  "status": "draft",
  "approval": {
    "url": "https://app.simplerdevelopment.com/approve/ghi789"
  }
}
```

---

### `surveys_update`

Update any combination of survey fields. Only pass what you want to change — unspecified fields are left as-is. Mints a fresh `approval.url` on every call.

- **Auth:** scope `surveys:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Survey ID. |
| `title` | string | New title. |
| `description` | string \| null | New description. |
| `status` | `draft` \| `active` \| `closed` | Change status directly (e.g. `"active"` to publish). |
| `fields` | array | Full replacement `SurveyFieldDef[]`. |
| `thankYouTitle` | string | Thank-you heading. |
| `thankYouMessage` | string | Thank-you body. |
| `closesAt` | string (ISO) \| null | Auto-close deadline (pass `null` to remove). |
| `maxResponses` | number \| null | Response cap (pass `null` to remove). |
| `brandingProfileId` | number \| null | Apply a branding profile. |
| `styling` | object | `SurveyStyling` — `{ primaryColor?, backgroundColor?, textColor?, headingFont?, bodyFont?, borderRadius?, showLogo?, hideTitle? }`. |
| `color` | string | Legacy single-color hex override. Prefer `styling.primaryColor`. |
| `pages` | array | Per-page metadata: `[{ title?, description? }]`. Page boundaries are inferred from `type: "page_break"` fields. |
| `publishResults` | boolean | Make aggregate results publicly visible. |
| `certificateEnabled` | boolean | Issue a completion certificate. |
| `consentField` | string \| null | Field ID that gates submission via an explicit consent checkbox. |
| `notifyOnResponse` | boolean | Notify account on each new response. |
| `notifyDigest` | `off` \| `daily` \| `weekly` | Response digest emails. |
| `scoringConfig` | object | `SurveyScoringConfig` — `{ autoRouteToCrm?: { enabled, minScore, pipelineId, stageId, dealTitleTemplate? } }`. |
| `recommendation` | object | `SurveyRecommendationConfig` — `{ offerings[], questions[], overrides[], hybrid?, alwaysAlsoOfferingKey?, bookUrl?, narrativeTemplate? }`. |
| `linkedType` | `email_campaign` \| `crm_deal` \| `crm_proposal` \| `booking_page` \| `website` \| `pitch_deck` \| null | Link to another artifact. |
| `linkedId` | number \| null | ID of the linked artifact. |
| `redirectUrl` | string \| null | Send respondents to this URL after submit (overrides the thank-you screen). |

**Response:** Updated survey row + fresh `approval.url`.

**Errors:** `{ "error": "Survey not found" }`

---

### `surveys_fork`

Duplicate a survey into a new draft row linked to the original via `parentSurveyId`. Copies fields, branding, styling, scoring, recommendation config, and thank-you copy. Status resets to `draft` and `responseCount` resets to 0. The fork gets its own slug and approval URL — the original is untouched.

- **Auth:** scope `surveys:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Source survey to fork. |
| `titleSuffix` | string | Appended to the cloned title. Default `" (fork)"`. |

**Response**

```json
{
  "id": 9,
  "title": "Client Intake (fork)",
  "slug": "client-intake-form-fork-n5a1b",
  "status": "draft",
  "parentSurveyId": 7,
  "approval": { "url": "https://app.simplerdevelopment.com/approve/jkl012" }
}
```

**Errors:** `{ "error": "Source survey not found" }`

---

## Pitch Decks

**Required service:** `pitch-decks`

Slides use a **draft/live system**. Write operations (`decks_replace_slides`, `decks_add_slide`, `decks_upload_html`) stage changes into `slide.draft`. The public renderer keeps showing the previous live slides until you call `decks_publish_slide` or `decks_publish_all`.

### `decks_list`

List pitch decks (presentations, slideshows, sales decks), newest-first.

- **Auth:** scope `decks:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `status` | `draft` \| `published` \| `archived` | Filter by status. |
| `limit` | number (1–200, default 50) | Max rows. |

**Response**

```json
[
  {
    "id": 3,
    "title": "Q1 Sales Deck",
    "slug": "q1-sales-deck-p7r2m",
    "description": null,
    "status": "published",
    "formatVersion": 2,
    "brandingProfileId": 1,
    "createdAt": "2026-01-20T00:00:00.000Z",
    "updatedAt": "2026-02-14T00:00:00.000Z"
  }
]
```

---

### `decks_get`

Fetch a deck's full definition including slides, theme, and all metadata.

- **Auth:** scope `decks:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Deck ID. |

**Response:** Full deck row (all columns including `slides` array).

**Errors:** `{ "error": "Deck not found" }`

---

### `decks_create`

Create a new empty pitch deck. The deck inherits the client's default branding profile automatically — do not pass `theme` unless you specifically want to override brand colors. Follow immediately with `decks_replace_slides` or `decks_add_slide`. Returns an `approval.url`.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `title` | string (required) | Deck title. |
| `description` | string | Optional description. |
| `sourceUrl` | string (URL) | Reference site URL for branding inspiration. |
| `brandingProfileId` | number | Override the auto-resolved default branding profile. |
| `theme` | object | Override specific theme tokens: `{ primaryColor?, accentColor?, backgroundColor?, textColor?, headingFont?, bodyFont?, logo? }`. |
| `includeSlides` | boolean | Echo `slides` in the response. Default `false`. |

**Response**

```json
{
  "id": 4,
  "title": "Investor Deck 2026",
  "slug": "investor-deck-2026-q8s3n",
  "status": "draft",
  "formatVersion": 2,
  "approval": {
    "url": "https://app.simplerdevelopment.com/approve/mno345"
  }
}
```

**Errors:** `{ "error": "Branding profile not found for this client" }`

---

### `decks_update`

Update deck metadata or theme. For slide content use `decks_replace_slides` or `decks_add_slide`.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Deck ID. |
| `title` | string | New title. |
| `description` | string | New description. |
| `status` | `draft` \| `published` \| `archived` | New status. |
| `slug` | string | New URL slug. |
| `theme` | object | Partial theme override (merged with existing). |
| `includeSlides` | boolean | Echo slides in response. Default `false`. |

**Response:** Updated deck slim projection + `approval.url`.

**Errors:** `{ "error": "Deck not found" }`

---

### `decks_replace_slides`

Replace the entire slide array with a new list. Changes land in slide drafts — the public renderer continues showing current live slides until you publish. Existing slides matched by `id` get their draft updated; new IDs become `pendingCreate` drafts; slides missing from the incoming list become `pendingDelete` tombstones.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Deck ID. |
| `slides` | array (required) | Full new slide list (see shape below). |
| `includeSlides` | boolean | Echo slides in response. Default `false`. |

**Slide shape:**

```json
{
  "id": "slide-abc",
  "label": "Problem",
  "blocks": [ /* Block objects — see blocks://schema */ ],
  "notes": "Speaker notes here",
  "customCss": ".hero { background: #1e1e2e; }",
  "pageSettings": { "backgroundColor": "#1e1e2e" }
}
```

**Response:** Deck slim projection (no slides by default).

**Errors:** `{ "error": "Deck not found" }`

---

### `decks_add_slide`

Append a single slide to the end of a deck. The new slide lands in draft (`pendingCreate: true`) until published.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `deckId` | number (required) | Target deck. |
| `label` | string (required) | Slide name shown in sidebar (e.g. "Cover", "Problem"). |
| `blocks` | array (required) | Block objects. |
| `notes` | string | Speaker notes. |
| `pageSettings` | object | Page-level settings (e.g. `backgroundColor`, `padding`). |
| `customCss` | string | Per-slide CSS scoped to this slide. |
| `id` | string | Explicit slide ID; auto-generated if omitted. |
| `includeSlides` | boolean | Echo the full slides array in response. Default `false`. |

**Response:** Deck slim projection.

**Errors:** `{ "error": "Deck not found" }`

---

### `decks_publish_slide`

Promote a single slide's draft to live. If `draft.pendingDelete: true` the slide is removed; otherwise `draft.blocks/customCss/pageSettings/notes` are copied to the live fields and `draft` is cleared.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `deckId` | number (required) | Deck ID. |
| `slideId` | string (required) | Slide ID to publish. |

**Response:** Deck slim projection.

**Errors:** `{ "error": "Deck not found" }`, `{ "error": "Slide not found" }`

---

### `decks_publish_all`

Publish all draft slides on a deck in one call. Removes `pendingDelete` tombstones, materializes `pendingCreate` slides, and merges regular update drafts into live fields.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `deckId` | number (required) | Deck ID. |

**Response:** Deck slim projection.

**Errors:** `{ "error": "Deck not found" }`

---

### `decks_fork`

Duplicate a deck into a new draft, linked to the original via `parentDeckId`. Copies slides, theme, and metadata. Status resets to `draft`.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Source deck to fork. |
| `titleSuffix` | string | Appended to the forked deck's title. Default `" (fork)"`. |

**Response**

```json
{
  "id": 5,
  "title": "Investor Deck 2026 (fork)",
  "slug": "investor-deck-2026-fork-r9t4p",
  "status": "draft",
  "parentDeckId": 4,
  "approval": { "url": "https://app.simplerdevelopment.com/approve/pqr678" }
}
```

**Errors:** `{ "error": "Source deck not found" }`

---

### `decks_upload_html`

Upload a single HTML file (base64-encoded) as a single-slide pitch deck wrapping an `html-embed` block. The slide counter is suppressed for full-bleed presentation. Max 1 MB decoded. The slide lands in draft (`pendingCreate`); call `decks_publish_slide` or `decks_publish_all` to make it live.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `filename` | string (required) | Must end in `.html`, `.htm`, or `.xhtml`. |
| `contentBase64` | string (required) | Base64-encoded HTML. Decoded size must be ≤ 1 MB. |
| `title` | string | Deck title override; defaults to the filename without extension. |

**Errors:** `{ "error": "Invalid base64 content" }`, `{ "error": "File exceeds 1000000 bytes" }`, `{ "error": "Empty file" }`

---

### `decks_upload_html_zip`

Upload a zip bundle (base64-encoded) containing `index.html` plus supporting assets as a single-slide pitch deck. All files are uploaded to a shared S3 prefix; relative asset references from `index.html` resolve through the media proxy. Max 50 MB uncompressed, 200 files, 10 MB per file. The slide lands in draft.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `filename` | string (required) | Must end in `.zip`. |
| `contentBase64` | string (required) | Base64-encoded zip. Decoded size must be ≤ 50 MB. |
| `title` | string | Deck title override; defaults to the zip filename. |

**Response**

```json
{
  "id": 6,
  "title": "Product Demo",
  "slug": "product-demo-s1u5q",
  "status": "draft",
  "bundleFileCount": 12,
  "bundlePrefix": "media/abc123/",
  "url": "https://cdn.simplerdevelopment.com/media/abc123/index.html",
  "approval": { "url": "https://app.simplerdevelopment.com/approve/stu901" }
}
```

**Errors:** `{ "error": "Invalid base64 content" }`, `{ "error": "Zip exceeds <max> bytes" }`, `{ "error": "Empty zip" }`

---

### `decks_delete`

Permanently delete a deck and all its versions.

- **Auth:** scope `decks:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Deck ID. |

**Response:** `{ "success": true, "id": 4 }` or a pending approval object.

**Errors:** `{ "error": "Deck not found" }`

---

### `deck_analytics_get`

Return viewer analytics for a single pitch deck: total view events, unique viewer sessions, and per-slide view counts with average dwell time. The deck must belong to the authenticated client.

- **Auth:** scope `decks:read`

**Input fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `deckId` | number | Yes | ID of the pitch deck to analyse. |

**Response:**

```json
{
  "deckId": 4,
  "title": "Investor Deck 2026",
  "totalEvents": 312,
  "uniqueSessions": 47,
  "perSlide": [
    { "slideIndex": 0, "views": 47, "avgDwellMs": 8200 },
    { "slideIndex": 1, "views": 43, "avgDwellMs": 14500 },
    { "slideIndex": 2, "views": 38, "avgDwellMs": null }
  ]
}
```

> `avgDwellMs` is `null` when no dwell-time data has been recorded for that slide yet. `totalEvents` counts all view events (a single session viewing the same slide twice counts twice); `uniqueSessions` counts distinct session IDs.

**Errors:**

| Condition | Response |
|---|---|
| Deck not found or wrong tenant | `{ "error": "Deck not found" }` |

---

## Automations

### `automations_list`

List all automation rules for your account, including trigger, conditions, and actions.

- **Auth:** scope `automations:read`

**Input**

| Field | Type | Description |
|---|---|---|
| `enabled` | boolean | Filter to only enabled or disabled rules. |
| `productScope` | string | Filter by product scope (e.g. `"email"`, `"crm"`). |

**Response**

```json
[
  {
    "id": 10,
    "name": "Tag CRM contact on survey submit",
    "description": null,
    "trigger": { "event": "survey.response.created", "surveyId": 7 },
    "conditions": [],
    "actions": [{ "tool": "crm_contacts_update", "params": { "tags": ["intake-complete"] } }],
    "enabled": true,
    "productScope": "crm",
    "source": "manual",
    "updatedAt": "2026-03-01T00:00:00.000Z"
  }
]
```

---

### `automations_create`

Define a new automation rule. Rules start enabled.

- **Auth:** scope `automations:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `name` | string (required) | Rule name. |
| `description` | string | Optional description. |
| `trigger` | object (required) | `{ event: string, ...metadata }` — e.g. `{ "event": "email.campaign.sent", "campaignId": 88 }`. |
| `conditions` | array | Filter conditions: `[{ field, operator, value }]`. Empty = always run. |
| `actions` | array (required) | Action list: `[{ tool: string, params: object }]`. |
| `enabled` | boolean | Defaults to `true`. |
| `productScope` | string | Grouping label (e.g. `"email"`, `"crm"`). |
| `source` | `nlp` \| `settings` \| `manual` | Defaults to `"manual"`. |

**Request body**

```json
{
  "name": "Subscribe on booking",
  "trigger": { "event": "booking.created" },
  "conditions": [],
  "actions": [
    { "tool": "email_subscribers_add", "params": { "listId": 12 } }
  ]
}
```

**Response:** Full automation rule row.

---

### `automations_update`

Update name, description, trigger, conditions, actions, or productScope on an existing rule. Use `automations_toggle` to change only the `enabled` flag.

- **Auth:** scope `automations:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Rule ID. |
| `name` | string | New name. |
| `description` | string \| null | New description. |
| `trigger` | object | Replacement trigger blob. |
| `conditions` | array | Replacement conditions array. |
| `actions` | array | Replacement actions array. |
| `productScope` | string \| null | New product scope. |

**Response:** Updated automation rule row.

**Errors:** `{ "error": "Rule not found" }`

---

### `automations_toggle`

Flip the `enabled` flag on a rule without touching trigger, conditions, or actions.

- **Auth:** scope `automations:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Rule ID. |
| `enabled` | boolean (required) | `true` to enable, `false` to disable. |

**Response:** Updated automation rule row.

**Errors:** `{ "error": "Rule not found" }`

---

### `automations_delete`

Permanently delete an automation rule. Execution logs are retained.

- **Auth:** scope `automations:write`

**Input**

| Field | Type | Description |
|---|---|---|
| `id` | number (required) | Rule ID. |

**Response**

```json
{ "success": true, "id": 10 }
```

**Errors:** `{ "error": "Rule not found" }`
