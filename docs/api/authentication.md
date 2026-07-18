# Authentication & Getting Started (REST v1)

The SimplerDevelopment REST API lets you read and write content on any site you manage — posts, pages, and more — from your own code, CI pipelines, or third-party integrations. Every request is scoped to a specific site, authenticated with an API key, and returns a consistent JSON envelope so error handling is uniform across all endpoints.

---

## Base URL

All v1 REST endpoints follow this pattern:

```
https://<your-portal-domain>/api/v1/sites/{siteId}/...
```

`siteId` is the numeric ID of the site you are working with, visible in the portal URL when you open a site's dashboard.

---

## Getting an API Key

API keys are generated inside the SimplerDevelopment portal under **Settings > API Keys** for each site. Every key:

- Begins with the prefix `sd_live_` followed by 64 hex characters (256 bits of entropy).
- Is scoped to exactly **one site** (`siteId`). A key issued for site 42 will be rejected on site 99.
- Has an optional expiry date set at creation time. Expired keys are automatically rejected.
- Tracks `lastUsedAt` on each successful request so you can audit usage in the portal.

Keep your key secret. Treat it like a password — do not commit it to source control.

---

## Authenticating Requests

Include your key in **one** of the following headers on every request. Both forms are equivalent; pick whichever fits your HTTP client.

### Option A — `Authorization: Bearer`

```
Authorization: Bearer sd_live_<your-key>
```

### Option B — `x-api-key`

```
x-api-key: sd_live_<your-key>
```

The middleware checks `Authorization` first. If the value starts with `Bearer sd_live_`, it strips the `Bearer ` prefix and uses the remainder. If `Authorization` is absent or does not match that prefix, it falls back to the `x-api-key` header. Any other format is treated as unauthenticated.

> **Unauthenticated requests:** If no valid key is present the middleware still forwards the request to the handler. Individual handlers may allow public access or return a 401 at their own discretion. The middleware itself only rejects a request when a key *is* present but fails validation.

---

## CORS

All `/api/v1/` responses include the following CORS headers, so browser-based clients can call the API directly:

| Header | Value |
|---|---|
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization, x-api-key` |

Preflight `OPTIONS` requests receive a `204 No Content` response with those headers and no body.

---

## Rate Limiting

Each API key is subject to a per-minute sliding-window rate limit. The default is **60 requests per minute**. A custom limit can be set per key in the portal.

When a request is allowed, the response does not include rate-limit headers. When the limit is exceeded:

- HTTP status `429 Too Many Requests` is returned.
- The body is `{ "success": false, "message": "Rate limit exceeded" }`.
- The following headers indicate when you may retry:

| Header | Description |
|---|---|
| `Retry-After` | Seconds until the current window resets (integer). |
| `X-RateLimit-Limit` | The maximum requests allowed per minute for this key. |
| `X-RateLimit-Remaining` | Always `0` on a 429 response. |

The window is 60 seconds and resets on a per-key basis. Requests that are rejected by the rate limiter do **not** count against the limit.

---

## Response Envelope

Every endpoint returns JSON. Successful responses always include `"success": true`; error responses always include `"success": false` and a human-readable `"message"`.

**Success**

```json
{
  "success": true,
  "data": { ... }
}
```

The shape of additional fields alongside `success` is endpoint-specific; refer to each endpoint's documentation.

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
| `204 No Content` | CORS preflight succeeded (no body). |
| `400 Bad Request` | A required parameter was missing or could not be parsed (e.g. non-numeric `siteId`). |
| `401 Unauthorized` | The API key provided does not exist, is not active, does not belong to the requested site, or has expired. |
| `404 Not Found` | The requested resource (site, post, etc.) does not exist or the site is not active. |
| `429 Too Many Requests` | Rate limit exceeded. See `Retry-After` header. |

---

## Quick-Start Example

The following `curl` call lists posts on site `42` using the `Authorization: Bearer` header form:

```bash
curl https://your-portal-domain/api/v1/sites/42/posts \
  -H "Authorization: Bearer sd_live_<your-key>"
```

Using the `x-api-key` header instead:

```bash
curl https://your-portal-domain/api/v1/sites/42/posts \
  -H "x-api-key: sd_live_<your-key>"
```

A successful response looks like:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 12,
    "limit": 20,
    "offset": 0
  }
}
```

A 401 from an invalid or mismatched key:

```json
{
  "success": false,
  "message": "Invalid API key"
}
```

A 429 when the rate limit is exceeded:

```json
{
  "success": false,
  "message": "Rate limit exceeded"
}
```

With response headers:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 37
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
```

---

## See Also

- [Posts API](./posts.md) — list, filter, and retrieve post content for a site.
