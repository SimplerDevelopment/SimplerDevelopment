# API Index — SimplerDevelopment

> **Audience:** humans and AI agents integrating with the SimplerDevelopment platform.
> **Sibling docs:** [Architecture](./architecture-for-agents.md) · [AI Overview](./ai-overview.md) · [Repository Map](./repository-map.md) · [Tool Reference](./tool-reference.md) · [Workflow Reference](./workflow-reference.md) · [Glossary](./glossary.md) · [/llms.txt](/llms.txt)

---

## Overview

SimplerDevelopment exposes four distinct API surfaces. They are **not** interchangeable — each targets a different caller and uses a different auth model. Pick the right surface before building.

| Surface | Base path | Auth | Who it is for |
|---|---|---|---|
| **REST v1** | `/api/v1/sites/{siteId}/...` | `sd_live_` API key | Third-party headless renderers, agents fetching published content |
| **Public** | `/api/public/...` | None | Unauthenticated clients (booking widgets, live-chat, slug lookups) |
| **Portal internal** | `/api/portal/...` | Session cookie | Portal UI — not for third parties |
| **MCP** | `/api/mcp` | `sd_mcp_` or `sd_oauth_` | AI agents and tools (450-tool surface) |

---

## Which surface should I use?

```
Are you an AI agent or tool?          → MCP  (/api/mcp)
                                          See tool-reference.md

Are you building a headless renderer
or reading published content?         → REST v1  (/api/v1/sites/{siteId}/...)

Is your call unauthenticated
(booking widget, live-chat, slug)?    → Public  (/api/public/...)

Are you the portal UI itself?         → Portal internal  (/api/portal/...)
                                          (session cookie; not for third parties)
```

---

## Surface 1 — REST v1

**Purpose:** headless read surface for published site content. All routes are GET-only; no write operations are exposed.

### Base URL

```
https://{tenantDomain}/api/v1/sites/{siteId}
```

`tenantDomain` is either the portal subdomain (`yourcompany.simplerdevelopment.com`) or a custom domain. `siteId` is the UUID of the site.

### Authentication

Two equivalent methods — send exactly one:

| Method | Header | Value |
|---|---|---|
| Bearer token | `Authorization` | `Bearer sd_live_<key>` |
| API key header | `X-Api-Key` | `sd_live_<key>` |

Keys are managed in the portal and hashed with SHA-256 at rest (`lib/api-key-middleware.ts`). Keys are prefixed `sd_live_`.

**Exceptions:** `/branding`, `/config`, and `/navigation` accept unauthenticated calls (the API key is optional on those three endpoints). The `/blocks` endpoint also allows unauthenticated access.

### Rate limiting

- **Limit:** 60 requests / minute (sliding window), per API key + site combination.
- **Headers on 429:** `Retry-After` (seconds), `X-RateLimit-Limit`, `X-RateLimit-Remaining`.
- On success, `X-RateLimit-Remaining` is returned with each response.

### CORS

`Access-Control-Allow-Origin: *` — cross-origin requests are permitted from any origin.

### Response envelope

All responses use a consistent JSON envelope:

```json
{ "success": true, "data": { ... } }
{ "success": false, "message": "Human-readable error" }
```

HTTP status codes follow standard semantics (200, 400, 401, 404, 429).

### Endpoints (read-only)

| Tag | Path | Description |
|---|---|---|
| Content | `GET /sites/{siteId}/posts` | Paginated list of published posts; filter by postType, category, tag, keyword |
| Content | `GET /sites/{siteId}/posts/{slug}` | Single post by slug (full body, SEO fields, categories, tags) |
| Content | `GET /sites/{siteId}/pages` | Paginated list of published pages (postType = "page") |
| Content | `GET /sites/{siteId}/categories` | All categories, alphabetical |
| Content | `GET /sites/{siteId}/tags` | All tags, alphabetical |
| Media | `GET /sites/{siteId}/media` | Paginated media items; filter by MIME prefix |
| Blocks | `GET /sites/{siteId}/blocks` | Full block catalog (types, display names, input schemas) — auth optional |
| Commerce | `GET /sites/{siteId}/products` | Paginated products; filter by category, keyword, sort |
| Commerce | `GET /sites/{siteId}/products/{slug}` | Single product detail (images, options, variants, bulk pricing) |
| Commerce | `GET /sites/{siteId}/product-categories` | All active product categories with live product counts |
| Site Config | `GET /sites/{siteId}/branding` | Brand profile + CSS custom properties — auth optional |
| Site Config | `GET /sites/{siteId}/config` | Full site bundle (metadata, branding, CSS vars, nav, store status) — auth optional |
| Site Config | `GET /sites/{siteId}/navigation` | Navigation menu tree (nested) — auth optional |

### OpenAPI specification

Machine-readable spec: **`/openapi.yaml`** (OpenAPI 3.1, ~1590 lines). Covers the REST v1 surface only. Served statically from `public/openapi.yaml`.

---

## Surface 2 — Public (unauthenticated)

**Purpose:** client-facing endpoints that must work without authentication — embedded widgets, published-content lookups, visitor interactions.

### Base path

```
/api/public/...
```

### Auth

None. No key or cookie required.

### Endpoint categories

| Category | What |
|---|---|
| Booking | Availability checks, booking request submission |
| Gift certificates | Redemption lookups |
| Live-chat | Chat session initiation and messaging |
| Content by slug | Published posts/pages by slug (unauthenticated lookup) |
| A/B events | Impression/conversion recording for split tests |

> Note: Public API endpoints are not covered by the OpenAPI spec at `/openapi.yaml`.

---

## Surface 3 — Portal internal

**Purpose:** powers the portal UI. Not intended for third-party consumption.

### Base path

```
/api/portal/...
```

### Auth

NextAuth v5 session cookie (`httpOnly`, 7-day maxAge with 1-day idle refresh). The `authorizePortal` middleware reads `clientId` from the session and applies the site-resolver (`lib/active-client.ts`). No API key is accepted on these routes.

### Route groups (~60)

The portal internal surface covers every operation available in the portal UI. Broad categories:

| Domain | Example routes |
|---|---|
| Sites & pages | `/api/portal/sites`, `/api/portal/posts` |
| Media | `/api/portal/media` |
| CMS / post types | `/api/portal/post-types`, `/api/portal/taxonomies` |
| Commerce | `/api/portal/products`, `/api/portal/orders`, `/api/portal/discounts`, `/api/portal/store-settings` |
| CRM | `/api/portal/contacts`, `/api/portal/companies`, `/api/portal/deals`, `/api/portal/pipelines` |
| Company Brain | `/api/portal/brain/*` (notes, tasks, meetings, documents, decisions, goals, playbooks, etc.) |
| Kanban | `/api/portal/kanban/*` (boards, cards, columns, sprints) |
| Email | `/api/portal/email/*` (campaigns, lists, segments, subscribers, templates) |
| Bookings | `/api/portal/booking-pages`, `/api/portal/bookings` |
| Branding | `/api/portal/branding` |
| Navigation | `/api/portal/nav` |
| Automations | `/api/portal/automations` |
| Surveys | `/api/portal/surveys` |
| Proposals | `/api/portal/proposals` |
| Contracts | `/api/portal/contracts` |
| Invoices | `/api/portal/invoices` |
| Tickets | `/api/portal/tickets` |
| Team | `/api/portal/team` |
| Auth / security | `/api/portal/profile`, `/api/portal/security` |
| OAuth clients | `/api/portal/oauth-clients` |
| Integrations | `/api/portal/integrations` |
| AI credits | `/api/portal/ai-credits` |
| Projects | `/api/portal/projects` |
| Hosting | `/api/portal/hosting` |
| Decks / presentations | `/api/portal/decks` |
| Block templates | `/api/portal/block-templates` |

> Portal internal routes are not covered by the OpenAPI spec.

---

## Surface 4 — MCP

**Purpose:** AI agent and tool access. 450 tools covering every portal domain. See **[Tool Reference](./tool-reference.md)** for the full tool catalogue.

### Endpoint

```
POST /api/mcp
```

MCP Streamable HTTP transport (not SSE). Implemented in `app/api/mcp/` and bootstrapped by `lib/mcp/server.ts`.

### Auth

| Credential type | Prefix | Source | Notes |
|---|---|---|---|
| Portal API key | `sd_mcp_` | Portal → Settings → API Keys | SHA-256 hashed in `portal_api_keys` table |
| OAuth 2.0 token | `sd_oauth_` | Auth-code flow (`lib/oauth/server.ts`) | RFC 8707 audience binding |

Send as `Authorization: Bearer <credential>`.

### Scope model

See [Tool Reference → Scopes](./tool-reference.md#scopes) for the full scope list. In brief: `*` wildcard grants all 450 tools; named scopes restrict to a domain (e.g. `brain:read`, `kanban:write`).

---

## Other notable routes

| Path | Purpose |
|---|---|
| `/api/stripe` | Stripe webhook receiver |
| `/api/webhooks/dropbox-sign` | Dropbox Sign (eSign) webhook |
| `/api/webhooks/easypost` | EasyPost (shipping) webhook |
| `/api/webhooks/printful` | Printful (print-on-demand) webhook |
| `/api/google-webhook` | Google Workspace change notifications |
| `/api/microsoft-webhook` | Microsoft / Outlook webhook |
| `/api/cron/` | Scheduled background jobs (internal) |
| `/api/health` | Health check (infrastructure) |
| `/api/extension/` | Browser extension endpoints |

---

## Auth model quick reference

| Surface | Mechanism | Implementation |
|---|---|---|
| REST v1 | `sd_live_` Bearer key or `X-Api-Key` header | `lib/api-key-middleware.ts` |
| Public | None | — |
| Portal internal | NextAuth v5 session cookie (`httpOnly`) | `lib/auth.ts` |
| MCP | `sd_mcp_` key or `sd_oauth_` token | `lib/mcp/server.ts`, `lib/oauth/server.ts` |

**NextAuth details:** JWT strategy, cookie domain `.simplerdevelopment.com` in production. Credential providers: username/password (bcryptjs, 10 rounds) + optional TOTP; Google OAuth. Brute-force protection: 10 attempts / 15 min per IP (`lib/security/rate-limit.ts`). Portal roles: `admin` / `editor`. MCP/API access is governed by key scopes, not portal roles.

---

## Known gaps

| Gap | Status |
|---|---|
| SDK / client library | **Missing** — no npm package, no generated SDK |
| API changelog | **Missing** — no versioned change history |
| OpenAPI coverage | Covers REST v1 only; Public and Portal surfaces are undocumented in the spec |
| MCP-specific rate limiting | Not documented or confirmed |
| Public OAuth developer console | `/api/portal/oauth-clients` exists server-side; no self-serve public UI |
| Webhook delivery guarantees | Project webhooks lack retry, signing-secret, and delivery log |
| Published API docs site | `docs/api/` reference exists locally but is not obviously published |
