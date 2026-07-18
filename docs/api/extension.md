# Browser Extension API

These endpoints power the SimplerDevelopment browser extension. They let the extension save Brain notes, look up CRM records, create tasks, and run AI extraction — all scoped to the authenticated tenant. Authentication uses the same portal API key infrastructure as the MCP server, so the same credential works across both surfaces.

**Base URL:** `https://<your-portal-domain>/api/extension/v1`

---

## Authentication

Pass a portal API key or OAuth access token in the `Authorization` header on every request:

```
Authorization: Bearer sd_mcp_<your-key>
```

or, with an OAuth access token:

```
Authorization: Bearer sd_oauth_<your-token>
```

Both token prefixes are accepted by the underlying `resolvePortalFromRequest` resolver (the same function used by `/api/mcp`). All requests are tenant-scoped: the resolved key identifies the client and user; no additional tenant parameter is required or accepted.

See [authentication.md](./authentication.md) for how to generate a portal API key and [../mcp.md](../mcp.md) for the shared credential issuance flow.

**CORS:** All extension endpoints return permissive CORS headers (`Access-Control-Allow-Origin: *`) so the extension popup can call them directly from a browser extension origin. Preflight `OPTIONS` requests receive `204 No Content`.

---

## Response Envelope

Every endpoint returns JSON. All responses use the same two-field envelope:

**Success**

```json
{
  "success": true,
  "data": { ... }
}
```

**Error**

```json
{
  "success": false,
  "message": "A human-readable description of what went wrong."
}
```

---

## Common HTTP Status Codes

| Code | Meaning |
|---|---|
| `200 OK` | Request succeeded. |
| `201 Created` | A new record was created. |
| `204 No Content` | CORS preflight response (no body). |
| `400 Bad Request` | A required parameter was missing, malformed, or failed validation. |
| `401 Unauthorized` | The bearer token is missing, invalid, or not recognized. |
| `404 Not Found` | The requested resource does not exist. |
| `502 Bad Gateway` | An upstream AI call (extraction) failed. |

---

## Endpoints

### `POST /api/extension/v1/auth/test`

Identity probe. Call this once after the user pastes their API key to verify the credential and surface the authenticated user and tenant name in the extension popup header.

- **Auth:** Bearer token required.
- **Scopes:** None beyond a valid portal key.

**Request body:** None.

**Response**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 12,
      "name": "Jane Smith",
      "email": "jane@example.com"
    },
    "client": {
      "id": 7,
      "name": "Acme Corp"
    },
    "scopes": ["notes:write", "crm:read"]
  }
}
```

`scopes` is an array of permission strings derived from the resolved API key context. The extension uses these to show or hide UI features.

**curl example**

```bash
curl -X POST https://<your-portal-domain>/api/extension/v1/auth/test \
  -H "Authorization: Bearer sd_mcp_<your-key>"
```

---

### `POST /api/extension/v1/notes`

Create a Brain note. This is the extension's primary "save this page" action. The note is recorded with `source: "extension"` for provenance tracking.

- **Auth:** Bearer token required.
- **Returns:** `201 Created` on success.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | Yes | Note title (1–255 chars). |
| `body` | `string` | No | Note content in plain text or markdown (max 50,000 chars). Defaults to empty string. |
| `tags` | `string[]` | No | Up to 50 tag strings. |
| `sourceUrl` | `string` | No | The page URL being saved (max 1,000 chars, must be a valid URL). |
| `contactId` | `number` | No | Link the note to a CRM contact by ID. |
| `companyId` | `number` | No | Link the note to a CRM company by ID. |
| `dealId` | `number` | No | Link the note to a CRM deal by ID. |
| `pinned` | `boolean` | No | Pin the note so it appears at the top of the Brain. |

```json
{
  "title": "Acme Corp — Q3 pricing page notes",
  "body": "Their enterprise tier starts at $999/mo. No public trial.",
  "tags": ["pricing", "acme", "enterprise"],
  "sourceUrl": "https://acme.com/pricing",
  "companyId": 41
}
```

**Response**

Returns the full created note record.

```json
{
  "success": true,
  "data": {
    "id": 2201,
    "clientId": 7,
    "title": "Acme Corp — Q3 pricing page notes",
    "body": "Their enterprise tier starts at $999/mo. No public trial.",
    "tags": ["pricing", "acme", "enterprise"],
    "sourceUrl": "https://acme.com/pricing",
    "companyId": 41,
    "pinned": false,
    "source": "extension",
    "createdAt": "2026-06-23T14:00:00.000Z"
  }
}
```

---

### `GET /api/extension/v1/notes/related`

Find Brain notes already saved for a given page URL. Returns two buckets: an exact URL match and notes for any page on the same domain. Powers the "you've already saved this" badge in the extension popup.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | Yes | The current page URL. Must be a valid URL. |
| `limit` | `number` | No | Maximum notes to return per bucket (1–20, default `10`). |

**Response**

```json
{
  "success": true,
  "data": {
    "exact": [
      {
        "id": 2201,
        "title": "Acme Corp — Q3 pricing page notes",
        "snippet": "Their enterprise tier starts at $999/mo.",
        "tags": ["pricing", "acme"],
        "sourceUrl": "https://acme.com/pricing",
        "createdAt": "2026-06-23T14:00:00.000Z"
      }
    ],
    "domain": [
      {
        "id": 2189,
        "title": "Acme Corp — team page",
        "snippet": "About 200 employees. Engineering team in Austin.",
        "tags": ["acme", "team"],
        "sourceUrl": "https://acme.com/about",
        "createdAt": "2026-06-20T10:11:00.000Z"
      }
    ]
  }
}
```

`exact` contains at most one item (the note whose `sourceUrl` matches the provided URL exactly). `domain` contains notes from other pages on the same origin, excluding the exact match. Both arrays are empty when no matching notes exist.

---

### `GET /api/extension/v1/search`

Unified search across Brain notes (semantic + lexical) and CRM contacts, companies, and deals (lexical ILIKE). Used by the extension's "find a record to attach this to" flow.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `q` | `string` | Yes | Search query string. |
| `limit` | `number` | No | Maximum results per bucket (1–20, default `8`). |

**Response**

```json
{
  "success": true,
  "data": {
    "notes": [
      {
        "id": 2201,
        "title": "Acme Corp — Q3 pricing page notes",
        "snippet": "Their enterprise tier starts at $999/mo.",
        "url": "https://acme.com/pricing"
      }
    ],
    "contacts": [
      {
        "id": 88,
        "firstName": "Sara",
        "lastName": "Lee",
        "email": "sara@acme.com",
        "title": "VP of Sales",
        "companyId": 41
      }
    ],
    "companies": [
      {
        "id": 41,
        "name": "Acme Corp",
        "domain": "acme.com",
        "industry": "Software",
        "logoUrl": "https://cdn.example.com/acme-logo.png"
      }
    ],
    "deals": [
      {
        "id": 305,
        "title": "Acme Corp — Enterprise Pilot",
        "status": "open",
        "value": "12000.00",
        "contactId": 88,
        "companyId": 41
      }
    ]
  }
}
```

Brain note search uses semantic embedding when available, falling back to lexical if the search service is unavailable. CRM results are ILIKE matches ordered by most recently updated.

---

### `GET /api/extension/v1/related-records`

Domain-matched CRM lookup. Given the current page URL, returns companies whose `domain` field matches the page host, along with their open deals and recent contacts. Powers the "On this site" suggestion panel in the extension popup so users can attach a capture to an existing deal in one click.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | Yes | The current page URL. Must be a valid URL. |

Domain matching is defensive: `www.` prefixes are stripped from both sides, scheme is ignored, and subdomain pages (e.g. `blog.acme.com`) match a root-domain company record (`acme.com`).

**Response**

```json
{
  "success": true,
  "data": {
    "host": "acme.com",
    "companies": [
      {
        "id": 41,
        "name": "Acme Corp",
        "domain": "acme.com",
        "industry": "Software",
        "logoUrl": "https://cdn.example.com/acme-logo.png"
      }
    ],
    "deals": [
      {
        "id": 305,
        "title": "Acme Corp — Enterprise Pilot",
        "status": "open",
        "value": "12000.00",
        "contactId": 88,
        "companyId": 41,
        "stage": "Proposal Sent"
      }
    ],
    "contacts": [
      {
        "id": 88,
        "firstName": "Sara",
        "lastName": "Lee",
        "email": "sara@acme.com",
        "title": "VP of Sales",
        "companyId": 41
      }
    ]
  }
}
```

When no company matches the host, `companies`, `deals`, and `contacts` are all empty arrays. `host` reflects the normalized hostname extracted from `url` (null if the URL had no host).

---

### `GET /api/extension/v1/tags`

Tag autocomplete. Returns the tenant's Brain tag inventory with per-tag note counts, optionally filtered by a case-insensitive prefix. Used by the extension popup's tag picker.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `prefix` | `string` | No | Case-insensitive prefix to filter tags (max 100 chars). When omitted, all tags are returned. |
| `limit` | `number` | No | Maximum tags to return (1–50, default `20`). |

**Response**

Results are ordered by note count (descending), then alphabetically.

```json
{
  "success": true,
  "data": {
    "items": [
      { "tag": "crm", "count": 14 },
      { "tag": "competitor", "count": 9 },
      { "tag": "pricing", "count": 7 }
    ]
  }
}
```

---

### `GET /api/extension/v1/tasks`

List the current user's Brain tasks for the extension popup. Defaults to open tasks only.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `status` | `"open" \| "all"` | No | Filter by task status (default `"open"`). |
| `limit` | `number` | No | Maximum tasks to return (1–50, default `20`). |

**Response**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 501,
        "title": "Follow up with Sara re: pilot",
        "dueAt": "2026-06-30T00:00:00.000Z",
        "status": "open",
        "sourceUrl": "https://acme.com/pricing",
        "contactId": null,
        "companyId": 41,
        "dealId": 305
      }
    ]
  }
}
```

`sourceUrl` and `contactId` are recovered from the task's description footer when present (they are stored there because the `brain_tasks` schema does not carry dedicated columns for them).

---

### `POST /api/extension/v1/tasks`

Create a Brain task from the extension (e.g. "follow up with this person tomorrow", quick-task popup). Recorded with `source: "extension"`.

- **Auth:** Bearer token required.
- **Returns:** `201 Created` on success.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | Yes | Task title (1–255 chars). |
| `body` | `string` | No | Task notes (max 5,000 chars). |
| `dueAt` | `string` | No | ISO 8601 due date/time string. |
| `sourceUrl` | `string` | No | The page URL associated with the task (max 1,000 chars). Stored in the task description footer. |
| `contactId` | `number` | No | Related CRM contact ID. Stored in the task description footer. |
| `companyId` | `number` | No | Related CRM company ID. |
| `dealId` | `number` | No | Related CRM deal ID. |
| `priority` | `"low" \| "normal" \| "high"` | No | Task priority. `"normal"` maps to `"medium"` internally. |

```json
{
  "title": "Follow up with Sara re: pilot pricing",
  "dueAt": "2026-06-30T09:00:00.000Z",
  "sourceUrl": "https://acme.com/pricing",
  "contactId": 88,
  "companyId": 41,
  "priority": "high"
}
```

**Response**

Returns the full created task record.

```json
{
  "success": true,
  "data": {
    "id": 501,
    "title": "Follow up with Sara re: pilot pricing",
    "status": "open",
    "priority": "high",
    "dueDate": "2026-06-30T09:00:00.000Z",
    "companyId": 41,
    "dealId": null,
    "createdAt": "2026-06-23T14:05:00.000Z"
  }
}
```

---

### `GET /api/extension/v1/crm/contacts`

Search CRM contacts. ILIKE autocomplete for the extension's "attach to contact" flow.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `search` | `string` | No | ILIKE filter on first name, last name, and email. When omitted, returns the most recently updated contacts. |
| `limit` | `number` | No | Maximum results (1–50, default `20`). |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": 88,
      "firstName": "Sara",
      "lastName": "Lee",
      "email": "sara@acme.com",
      "title": "VP of Sales",
      "companyId": 41,
      "companyName": "Acme Corp"
    }
  ]
}
```

---

### `POST /api/extension/v1/crm/contacts`

Create (or upsert) a CRM contact. When `email` is provided, the contact is upserted by email — if a contact with that email already exists, it is returned and enriched with any newly supplied `phone`, `title`, or `companyId` (only when those fields are currently null on the existing record). Without `email`, at least one of `firstName` or `lastName` is required.

- **Auth:** Bearer token required.
- **Returns:** `201 Created` in all cases (including when an existing contact is returned after upsert).

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | Conditional | Contact email address. Required unless `firstName` or `lastName` is supplied. Triggers upsert-by-email. |
| `firstName` | `string` | Conditional | First name (max 100 chars). Required unless `email` is supplied. |
| `lastName` | `string` | No | Last name (max 100 chars). |
| `phone` | `string` | No | Phone number (max 50 chars). |
| `title` | `string` | No | Job title (max 150 chars). |
| `companyId` | `number` | No | Link to a CRM company by ID. |
| `displayName` | `string` | No | Overrides the display name derived from `firstName`/`lastName` (max 255 chars). |
| `source` | `string` | No | Provenance string (max 100 chars). Defaults to `"extension"`. |

```json
{
  "email": "sara@acme.com",
  "firstName": "Sara",
  "lastName": "Lee",
  "title": "VP of Sales",
  "companyId": 41
}
```

**Response**

Returns the full contact record (new or existing).

```json
{
  "success": true,
  "data": {
    "id": 88,
    "clientId": 7,
    "firstName": "Sara",
    "lastName": "Lee",
    "email": "sara@acme.com",
    "phone": null,
    "title": "VP of Sales",
    "companyId": 41,
    "source": "extension",
    "createdAt": "2026-06-23T14:10:00.000Z"
  }
}
```

---

### `GET /api/extension/v1/crm/companies`

Search CRM companies. ILIKE autocomplete on company name and domain.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `search` | `string` | No | ILIKE filter on `name` and `domain`. When omitted, returns the most recently updated companies. |
| `limit` | `number` | No | Maximum results (1–50, default `20`). |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": 41,
      "name": "Acme Corp",
      "domain": "acme.com",
      "industry": "Software",
      "logoUrl": "https://cdn.example.com/acme-logo.png"
    }
  ]
}
```

---

### `POST /api/extension/v1/crm/companies`

Create a CRM company. If `domain` is supplied and a company record already exists for that domain on the tenant, the existing record is returned with `_existing: true` instead of creating a duplicate. When an `address` is provided, geocoding is attempted best-effort (failures do not block creation).

- **Auth:** Bearer token required.
- **Returns:** `201 Created` in all cases (including when an existing company is returned).

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Company name (1–255 chars). |
| `domain` | `string` | No | Company domain (max 255 chars). Used for deduplication — if a match exists, the existing record is returned. |
| `industry` | `string` | No | Industry label (max 100 chars). |
| `size` | `string` | No | Company size label (max 50 chars, e.g. `"51-200"`). |
| `phone` | `string` | No | Main phone number (max 50 chars). |
| `address` | `string` | No | Street address (max 2,000 chars). Geocoded to `latitude`/`longitude` if supplied. |
| `website` | `string` | No | Website URL (max 500 chars). |
| `logoUrl` | `string` | No | Logo image URL (max 1,000 chars). |

```json
{
  "name": "Acme Corp",
  "domain": "acme.com",
  "industry": "Software",
  "website": "https://acme.com"
}
```

**Response**

Returns the full company record. `_existing: true` is appended when a domain-deduplication match was found.

```json
{
  "success": true,
  "data": {
    "id": 41,
    "clientId": 7,
    "name": "Acme Corp",
    "domain": "acme.com",
    "industry": "Software",
    "size": null,
    "phone": null,
    "address": null,
    "website": "https://acme.com",
    "logoUrl": null,
    "latitude": null,
    "longitude": null,
    "createdAt": "2026-05-10T09:00:00.000Z",
    "_existing": true
  }
}
```

---

### `GET /api/extension/v1/crm/deals`

List CRM deals for the extension's "attach to deal" dropdown. Defaults to open deals only.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `status` | `"open" \| "all"` | No | Filter by deal status. `"open"` (default) returns only deals where `status = 'open'`; `"all"` returns every deal regardless of status. |
| `limit` | `number` | No | Maximum results (1–50, default `25`). |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "id": 305,
      "title": "Acme Corp — Enterprise Pilot",
      "status": "open",
      "value": "12000.00",
      "contactId": 88,
      "companyId": 41,
      "stage": "Proposal Sent",
      "companyName": "Acme Corp"
    }
  ]
}
```

Note: `POST /api/extension/v1/crm/deals` does not exist — deal creation is not exposed on the extension surface. Use the portal or MCP server for that.

---

### `POST /api/extension/v1/extract`

AI-powered page extraction. The extension sends the page URL, title, and plain-text content; the server returns a structured payload (summary, tags, named entities, a suggested Brain note, and server-resolved related records). Powered by Claude Haiku. This call is AI-bound and may take several seconds; the endpoint has a 60-second server timeout.

- **Auth:** Bearer token required.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | Yes | The current page URL (max 2,000 chars, must be a valid URL). |
| `title` | `string` | Yes | The page `<title>` (1–500 chars). |
| `text` | `string` | Yes | Plain-text content of the page body (max 200,000 chars; truncated to ~12,000 chars before the model sees it). |
| `html` | `string` | No | Raw page HTML (max 500,000 chars). Accepted but currently unused; plumbed for future use. |

```json
{
  "url": "https://acme.com/blog/q3-product-update",
  "title": "Q3 Product Update — Acme Corp Blog",
  "text": "We shipped three major features this quarter: ..."
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "summary": "Acme Corp's Q3 product update announces three new features targeting enterprise workflows.",
    "tags": ["product-update", "acme", "enterprise", "q3"],
    "entities": {
      "people": [
        { "name": "Jane Doe", "title": "CTO", "company": "Acme Corp" }
      ],
      "companies": [
        { "name": "Acme Corp", "domain": "acme.com" }
      ]
    },
    "suggestedNote": {
      "title": "Acme Corp Q3 product update",
      "body": "- Launched three enterprise features\n- CTO Jane Doe led the announcement\n- Focus on workflow automation",
      "tags": ["product-update", "acme", "enterprise"]
    },
    "relatedRecords": {
      "contacts": [
        {
          "id": 88,
          "firstName": "Sara",
          "lastName": "Lee",
          "email": "sara@acme.com",
          "title": "VP of Sales",
          "companyId": 41
        }
      ],
      "companies": [
        {
          "id": 41,
          "name": "Acme Corp",
          "domain": "acme.com",
          "industry": "Software"
        }
      ],
      "notes": [
        {
          "id": 2189,
          "title": "Acme Corp — team page",
          "snippet": "About 200 employees. Engineering team in Austin.",
          "url": "https://acme.com/about"
        }
      ]
    }
  }
}
```

`relatedRecords` are resolved server-side against the tenant's CRM and Brain using the entities the model identified; the model is never given existing record IDs to prevent hallucination.

**Errors**

| Status | Message | Cause |
|---|---|---|
| `400` | `Invalid input: …` | A required field is missing or fails validation. |
| `502` | `AI extraction failed` | The underlying model call or parse failed. |

---

### `GET /api/extension/v1/activity/recent`

Recent extension-originated activity. Returns Brain notes and CRM contacts that were created via the extension within the last N days. Used by the extension popup's "what did I just save?" panel.

> **Note:** CRM companies are always returned as an empty array (`companies: []`). The `crm_companies` table does not currently carry a `source` column, so extension-created companies cannot be distinguished from portal-created ones. The key is present in the response for shape stability; it will be populated once the column is added.

- **Auth:** Bearer token required.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `limit` | `number` | No | Maximum items per bucket (1–50, default `10`). |
| `days` | `number` | No | Look-back window in days (1–90, default `14`). |

**Response**

```json
{
  "success": true,
  "data": {
    "notes": [
      {
        "id": 2201,
        "title": "Acme Corp — Q3 pricing page notes",
        "snippet": "Their enterprise tier starts at $999/mo.",
        "sourceUrl": "https://acme.com/pricing",
        "createdAt": "2026-06-23T14:00:00.000Z"
      }
    ],
    "contacts": [
      {
        "id": 88,
        "firstName": "Sara",
        "lastName": "Lee",
        "email": "sara@acme.com",
        "createdAt": "2026-06-23T14:10:00.000Z"
      }
    ],
    "companies": []
  }
}
```

---

## See Also

- [authentication.md](./authentication.md) — API key generation and portal auth.
- [../mcp.md](../mcp.md) — MCP server that shares the same credential infrastructure.
- [chat.md](./chat.md) — Live chat public API.
