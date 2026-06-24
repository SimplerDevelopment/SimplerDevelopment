# Forms, Documents & Approvals API (Public, Token-Gated)

These endpoints power the public-facing side of surveys, proposals, contracts, and staged-change approvals. They are open to the internet — no platform API key is required — but each endpoint is gated by either a short URL **slug** (surveys) or a long, single-use **token** delivered to the recipient via email (proposals, contracts, approvals). Treat these tokens as bearer credentials: anyone who holds one can take the corresponding action.

For unauthenticated public-content endpoints (posts, media, A/B events) see [./public-content.md](./public-content.md). For the MCP approval workflow that mints approval tokens see [../mcp.md](../mcp.md).

---

## Surveys

Surveys are identified by a human-readable `slug` set in the portal. All survey endpoints share the prefix `/api/surveys/{slug}` and support CORS from any origin (required for survey embeds in sandboxed iframes).

---

### `GET /api/surveys/{slug}`

Fetch the survey definition for rendering.

- **Auth:** Public — no key required.
- **Rate limit:** 30 requests / 60 s per IP + slug combination (shared with POST).

**Path params**

| Name | Type | Description |
|---|---|---|
| `slug` | string | Slug of the survey as configured in the portal. |

**Query params**

| Name | Type | Description |
|---|---|---|
| `visitorId` | string | Optional stable visitor identifier used for A/B variant assignment. |

**Response**

```json
{
  "success": true,
  "data": {
    "id": 12,
    "title": "Customer Satisfaction Survey",
    "slug": "csat-q2",
    "fields": [...],
    "variantId": null,
    "variantName": null,
    "branding": { "primaryColor": "#6366f1", "logoUrl": "https://cdn.example.com/logo.png" },
    "cssVars": "--color-primary: #6366f1;"
  }
}
```

If the survey has A/B variants configured and a `visitorId` is supplied, `variantId` and `variantName` are set and `fields` reflects the assigned variant's field schema.

**Errors**

| Status | Condition |
|---|---|
| `403` | Survey is not active, has passed its closing date, or has reached its maximum response count. |
| `404` | No survey found with that slug. |
| `429` | Rate limit exceeded. |

---

### `POST /api/surveys/{slug}`

Submit a completed survey response.

- **Auth:** Public — no key required.
- **Rate limit:** Shared 30 req / 60 s per IP + slug with GET.

**Path params**

| Name | Type | Description |
|---|---|---|
| `slug` | string | Slug of the survey. |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `answers` | object | Yes | Map of field ID → answer value. Required fields are validated against the survey or variant schema. |
| `formName` | string | Yes | Identifies the submit source. Max 100 characters. |
| `email` | string | Cond. | Required when `survey.requireEmail` is true. Blocks duplicate submission when `allowMultiple=false`. |
| `name` | string | No | Respondent display name. |
| `source` | string | No | Attribution source label (e.g. `"email"`, `"embed"`). |
| `sourceId` | string | No | Attribution source identifier. |
| `variantId` | integer | No | A/B variant ID assigned by the GET call; stored with the response for results segmentation. |
| `sessionId` | string | No | If provided, marks any matching partial-response record as completed. |

```json
{
  "answers": { "q1": "Very satisfied", "q2": 5 },
  "formName": "embed-homepage",
  "email": "jane@example.com",
  "name": "Jane Smith",
  "sessionId": "sess-abc123"
}
```

**Side effects**

- Inserts a `surveyResponses` row and increments `surveys.responseCount` inside a database transaction.
- If `sessionId` is provided, marks the matching `surveyPartialResponses` record as completed.
- Emits a `survey.response_submitted` automation event.
- Fires any registered survey-response webhooks (asynchronously, does not block the response).
- **CRM auto-route:** if the survey's scoring configuration has `autoRouteToCrm.enabled` and the computed response score meets or exceeds `minScore` and the respondent supplied an email address, the respondent is upserted as a CRM contact via `upsertContactByEmail` and a CRM deal is created automatically.

**Response** (HTTP 201)

```json
{
  "success": true,
  "data": {
    "responseId": 4821,
    "thankYouTitle": "Thank you!",
    "thankYouMessage": "Your response has been recorded.",
    "redirectUrl": null,
    "certificateEnabled": true
  }
}
```

**Errors**

| Status | Condition |
|---|---|
| `400` | Missing or invalid fields, `formName` absent or too long, required answers missing, duplicate email when `allowMultiple=false`. |
| `403` | Survey is closed, inactive, past closing date, or at max responses. |
| `404` | No survey found with that slug. |
| `429` | Rate limit exceeded. |

---

### `GET /api/surveys/{slug}/partial`

Retrieve a previously saved partial (in-progress) response so a visitor can resume where they left off.

- **Auth:** Public — `sessionId` is the only credential.

**Query params**

| Name | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | Yes | The session identifier generated client-side when the visitor began filling in the form. Max 64 characters; alphanumeric, underscores, dots, and hyphens only. |

**Response**

Returns saved progress or `null` if no matching record exists or the record is already marked completed.

```json
{
  "success": true,
  "data": {
    "answers": { "q1": "Somewhat satisfied" },
    "lastPage": 2,
    "respondentEmail": "jane@example.com",
    "updatedAt": "2026-06-20T10:15:00.000Z"
  }
}
```

---

### `POST /api/surveys/{slug}/partial`

Upsert partial form progress so a visitor can resume later. Silently overwrites any previously saved progress for the same `sessionId`.

- **Auth:** Public — `sessionId` is the only credential.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | Yes | Client-generated session identifier (≤64 chars, `[A-Za-z0-9_.-]`). |
| `answers` | object | Yes | Partial answer map saved so far. |
| `lastPage` | integer | No | Current page index, for resuming multi-page surveys at the right position. |
| `respondentEmail` | string | No | Email collected so far, stored for pre-fill on resume. |
| `source` | string | No | Attribution source label. |
| `sourceId` | string | No | Attribution source identifier. |

**Response**

```json
{ "success": true }
```

**Errors**

| Status | Condition |
|---|---|
| `403` | Survey is not active. |
| `404` | No survey found with that slug. |

---

### `GET /api/surveys/{slug}/results`

Fetch publicly aggregated survey results. Only available when the portal has enabled `publishResults` for the survey.

- **Auth:** Public — gated by `survey.publishResults`. Returns 404 (not 403) when disabled to avoid confirming slug existence.

**Response**

Returns aggregate breakdowns per question (option counts, rating averages, text sample excerpts) and total response count. Individual responses are never included.

```json
{
  "success": true,
  "data": {
    "totalResponses": 142,
    "questions": [
      {
        "fieldId": "q1",
        "label": "Overall satisfaction",
        "type": "rating",
        "average": 4.3,
        "breakdown": { "5": 60, "4": 45, "3": 25, "2": 10, "1": 2 }
      }
    ]
  }
}
```

**Errors**

| Status | Condition |
|---|---|
| `404` | No survey found with that slug, or `publishResults` is disabled. |

---

### `GET /api/surveys/{slug}/certificate`

Generate and stream a branded PDF certificate of completion for a specific survey response.

- **Auth:** Public — gated by `survey.certificateEnabled`. Requires a valid `responseId` belonging to the survey.
- **Runtime:** Node (not Edge) — the PDF renderer requires Node.js Buffer and stream APIs.

**Query params**

| Name | Type | Required | Description |
|---|---|---|---|
| `responseId` | integer | Yes | ID of the survey response, returned by the submit endpoint. |

**Response**

Streams an `application/pdf` file as an inline attachment. The PDF is landscape LETTER size and includes the survey title, respondent name, completion date, and a unique Completion ID. Branding (primary color, logo, fonts) is sourced from the tenant's branding profile.

Response headers include `Cache-Control: private, no-store`.

**Errors**

| Status | Condition |
|---|---|
| `404` | Survey not found, `certificateEnabled=false`, or `responseId` does not belong to this survey. |

---

### `POST /api/surveys/{slug}/upload`

Upload a file as part of a survey response (for file-upload field types).

- **Auth:** Public — no key required.

> **Note:** Consult the route handler at `app/api/surveys/[slug]/upload/route.ts` for the current multipart field names and size limits, as these may vary by configuration.

---

## Proposals

Proposals are sent to recipients via a unique token embedded in an emailed link. The token (`clientToken`) is a 64-character hex string stored against the `crmProposals` record.

---

### `GET /api/proposals/{token}`

Retrieve the proposal for display. Increments the view count and, on first view, flips the proposal's status from `sent` to `viewed`.

- **Auth:** Public — token is the credential.

**Path params**

| Name | Type | Description |
|---|---|---|
| `token` | string | 64-character hex token from the emailed link. |

**Side effects**

- Increments `viewCount` and sets `lastViewedAt` on every call.
- On the first view (status was `sent`): sets status to `viewed`, records `firstViewedAt`, and sends a `proposal_viewed` in-portal notification to the proposal's creator (or deal owner as a fallback). This notification fires asynchronously and does not block the response.

**Response**

```json
{
  "success": true,
  "data": {
    "id": 88,
    "title": "Website Redesign Proposal",
    "status": "viewed",
    "content": { },
    "expiresAt": "2026-07-31T00:00:00.000Z",
    "viewCount": 3,
    "contact": { "firstName": "Jane", "lastName": "Smith", "email": "jane@example.com" },
    "company": { "name": "Acme Corp" }
  }
}
```

**Errors**

| Status | Condition |
|---|---|
| `404` | Token not found or proposal is in `draft` status. |

---

### `POST /api/proposals/{token}`

Accept or decline a proposal.

- **Auth:** Public — token is the credential.

**Path params**

| Name | Type | Description |
|---|---|---|
| `token` | string | 64-character hex token from the emailed link. |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | `"accept"` \| `"decline"` | Yes | The decision. |
| `signatureName` | string | Cond. | Required when `action="accept"`. Printed name of the signer. |
| `signatureData` | string | Cond. | Required when `action="accept"`. Base64-encoded signature image or drawn signature data. |
| `reason` | string | No | Optional decline reason (only meaningful when `action="decline"`). |

**Side effects**

- `accept`: writes `status='accepted'`, `signatureName`, `signatureData`, `signedAt`, `signedIp`, and `acceptedAt` to the proposal record.
- `decline`: writes `status='declined'`, `declinedAt`, and `declineReason`.
- Both actions are permanent — a proposal that has been accepted or declined cannot be re-submitted.

**Response**

```json
{
  "success": true,
  "data": {
    "status": "accepted",
    "acceptedAt": "2026-06-23T14:30:00.000Z"
  }
}
```

**Errors**

| Status | Condition |
|---|---|
| `400` | Token not found, draft status, already accepted/declined, missing required signature fields, or proposal has expired (auto-marks as `expired`). |

---

## Contracts

Contracts support multiple signers. Each signer receives their own unique token. The token is stored against the `crmContractSigners` table.

---

### `GET /api/contracts/{token}`

Fetch the contract for a specific signer's review.

- **Auth:** Public — per-signer token is the credential.

**Path params**

| Name | Type | Description |
|---|---|---|
| `token` | string | 64-character hex token from the signer's emailed link. |

**Side effects**

- On first view: records `viewedAt` on the signer row and sets the signer's status to `viewed`.

**Response**

```json
{
  "success": true,
  "data": {
    "title": "Service Agreement",
    "summary": "This agreement covers...",
    "clauses": [...],
    "lineItems": [...],
    "fees": [...],
    "currency": "USD",
    "accentColor": "#6366f1",
    "logoUrl": "https://cdn.example.com/logo.png",
    "footerText": "Powered by SimplerDevelopment",
    "status": "sent",
    "companyName": "Acme Corp",
    "signer": {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "status": "viewed",
      "signedAt": null
    },
    "allSigners": [...]
  }
}
```

**Errors**

| Status | Condition |
|---|---|
| `404` | Token not found or contract is in `draft` status. |
| `410` | Contract's `validUntil` date has passed — the link is expired. |

---

### `POST /api/contracts/{token}`

Sign or decline a contract as the identified signer.

- **Auth:** Public — per-signer token is the credential.

**Path params**

| Name | Type | Description |
|---|---|---|
| `token` | string | 64-character hex token from the signer's emailed link. |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | `"sign"` \| `"decline"` | Yes | The decision. |
| `signatureName` | string | Cond. | Required when `action="sign"`. Printed name. |
| `signatureData` | string | Cond. | Required when `action="sign"`. Base64-encoded or drawn signature data. |
| `reason` | string | No | Optional decline reason. |

**Side effects**

- `sign`: writes `status='signed'`, `signatureName`, `signatureData`, `signedAt`, and `signedIp` on the signer row. After signing, re-checks all signers: if every signer is `signed`, marks the contract `status='fully_executed'` with `fullyExecutedAt=now` and emits a `proposal.accepted` automation event. If some signers remain, sets the contract to `partially_signed`.
- `decline`: sets the signer to `status='declined'` with `declinedAt` and `declineReason`. The contract's own status is not changed on a single-signer decline.
- A signer that has already signed or declined cannot re-submit.

**Response**

```json
{
  "success": true,
  "data": {
    "fullyExecuted": false
  }
}
```

**Errors**

| Status | Condition |
|---|---|
| `400` | Token not found, contract is `draft` or `voided`, signer already signed/declined, or required signature fields missing. |
| `410` | Contract's `validUntil` date has passed. |

---

## Approvals

The approval endpoint is the public surface of the MCP approval workflow. When an MCP tool proposes a destructive or sensitive write (creating a post, publishing a deck, activating a survey, etc.), the platform mints a short-lived approval token and emails a review link to a designated reviewer. This endpoint is what that link calls. For the full MCP approval architecture see [../mcp.md](../mcp.md).

Approval tokens are looked up via `lookupApprovalLink(token)` and are tenancy-scoped: a token minted for one client cannot be used to approve actions on another.

---

### `GET /api/approve/{token}`

Check the current status of an approval link.

- **Auth:** Public — token is the credential.

**Path params**

| Name | Type | Description |
|---|---|---|
| `token` | string | Approval token from the emailed review link. |

**Response**

```json
{
  "success": true,
  "data": {
    "token": "...",
    "linkType": "pending_change",
    "entityType": "post",
    "entityId": 42,
    "pendingChangeId": 17,
    "status": "pending",
    "summary": "Publish post \"Q3 Roadmap Update\"",
    "reviewerName": null,
    "reviewedAt": null,
    "expiresAt": "2026-06-30T00:00:00.000Z",
    "createdAt": "2026-06-23T09:00:00.000Z"
  }
}
```

---

### `POST /api/approve/{token}`

Approve or reject the staged change. The link must be in `pending` status.

- **Auth:** Public — token is the credential.

**Path params**

| Name | Type | Description |
|---|---|---|
| `token` | string | Approval token from the emailed review link. |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | `"approve"` \| `"reject"` | Yes | The reviewer's decision. |
| `reviewerName` | string | Yes | Display name of the reviewer (stored on the link for audit purposes). |
| `reviewerEmail` | string | No | Email of the reviewer. |
| `reviewNote` | string | No | Optional note recorded alongside the decision. |

**Side effects on `approve`**

The side effect varies by `linkType` / `entityType`. The write is applied **before** the decision is recorded — if the side effect throws (e.g. the change is stale or already applied), a `409` is returned and the link stays `pending` so the reviewer can retry.

| Entity type | What happens |
|---|---|
| `pending_change` | Applies the staged MCP pending change via `applyPendingChange`, then marks the change `approved` with `appliedAt`. |
| `post` | Sets `posts.published=true` and `publishedAt=now`; revalidates the public site layout cache. |
| `pitch_deck` | Promotes all draft slides and sets the deck `status='published'`. |
| `email_campaign` | Records the approval; the actual send is a separate action in the portal. |
| `survey` | Flips `status='active'` if not already active. |
| `booking_page` | Flips `active=true` if not already active. |
| `block_template` | Applies any draft overlay to the live template row (or deletes it if `draft.pendingDelete`), then increments `version`. |

On `reject`, only the review decision is recorded — no entity changes are made.

**Response**

```json
{
  "success": true,
  "data": {
    "token": "...",
    "status": "approved",
    "reviewerName": "Dan Coyle",
    "reviewedAt": "2026-06-23T14:45:00.000Z"
  }
}
```

**Errors**

| Status | Condition |
|---|---|
| `400` | Token not found, link is not `pending` (already reviewed or expired), or `reviewerName` missing. |
| `409` | The staged change is stale or has already been applied (approval side effect conflict). The link remains `pending` and the reviewer may retry. |
