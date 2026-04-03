# API Contract Changes: Email Block Editor

## Modified Endpoints

### POST /api/portal/email/campaigns

**Request body** -- add optional `blockContent`:

```json
{
  "name": "March Newsletter",
  "subject": "What's new in March",
  "previewText": "...",
  "fromName": "Acme",
  "fromEmail": "hello@acme.com",
  "replyTo": "support@acme.com",
  "listId": 1,
  "htmlContent": "<p>raw html</p>",
  "blockContent": {
    "blocks": [...],
    "pageSettings": {...},
    "version": 1
  }
}
```

- If `blockContent` is provided, server renders it to email HTML and stores both
- If `blockContent` is null/missing, `htmlContent` is used directly (backward compat)
- Validation: if `blockContent` is provided, `htmlContent` becomes optional (server generates it)

### PATCH /api/portal/email/campaigns/[id]

Same additions as POST. When `blockContent` is updated, `htmlContent` is re-rendered server-side.

### GET /api/portal/email/campaigns/[id]

**Response** -- add `blockContent`:

```json
{
  "success": true,
  "data": {
    "campaign": {
      "id": 1,
      "htmlContent": "...",
      "blockContent": { "blocks": [...], "version": 1 },
      ...
    }
  }
}
```

### POST /api/portal/email/templates

**Request body** -- add optional `blockContent`:

```json
{
  "name": "Welcome Email",
  "category": "welcome",
  "subject": "Welcome!",
  "htmlContent": "...",
  "blockContent": { "blocks": [...], "version": 1 }
}
```

### PATCH /api/portal/email/templates/[id]

Same `blockContent` addition.

### GET /api/portal/email/templates, GET /api/portal/email/templates/[id]

Include `blockContent` in response.

---

## New Endpoint

### POST /api/portal/email/render-preview

Renders block JSON to email HTML for live preview without saving.

**Request:**
```json
{
  "blockContent": { "blocks": [...], "version": 1 }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "html": "<!DOCTYPE html>..."
  }
}
```

Used by the editor for live preview. Lightweight -- no DB write.
