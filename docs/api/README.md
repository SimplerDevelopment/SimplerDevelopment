# SimplerDevelopment API — Developer Docs

SimplerDevelopment exposes three distinct API surfaces depending on who is calling and what they need. Pick the one that fits your use case and jump to the relevant reference pages below.

---

## The three API surfaces

### (a) REST v1 API — authenticated headless CMS / commerce

**Base URL:** `https://<your-portal-domain>/api/v1/sites/{siteId}/...`

**Credential:** `sd_live_` API key — issued per site under **Settings > API Keys** in the portal.

Use this surface when you are building a server-side integration, CI pipeline, or headless front end that needs to read or write content (posts, pages, blocks, media, products, bookings, site config) against a specific site you manage. Every request is site-scoped, rate-limited, and returns a consistent `{ success, data | message }` JSON envelope.

[Get started with authentication →](./authentication.md)

**Machine-readable spec:** an [OpenAPI 3.1 specification](/openapi.yaml) for this surface is served at `/openapi.yaml`. Import it into Postman, Insomnia, or an OpenAPI code generator to scaffold a typed client.

---

### (b) Public API — unauthenticated front-end endpoints

**Base URL:** `https://<your-portal-domain>/api/public/...`

**Credential:** None — these endpoints are intentionally open.

Use this surface from browser JavaScript (or any client where you cannot safely store a secret) for visitor-facing read operations: checking booking availability, submitting booking requests, sending a live-chat message, fetching published content by slug, and recording A/B test events. No API key is required, but each endpoint is scoped to a single site and returns the same JSON envelope as the REST v1 surface.

[Booking & Gift Certificates →](./booking.md) · [Live Chat →](./chat.md) · [Public Content & A/B Events →](./public-content.md)

---

### (c) MCP Server — AI agent API

**Base URL:** `POST https://simplerdevelopment.com/api/mcp`

**Credential:** `sd_mcp_` portal API key or `sd_oauth_` OAuth access token — both issued in the portal.

Use this surface from inside AI environments (Claude Code, Claude Desktop, or any MCP-compatible agent). The MCP server exposes every major portal capability — content authoring, CRM, projects, email campaigns, surveys, pitch decks, company brain, billing, and more — as strongly-typed MCP tools. Scopes are enforced per tool call. Write tools that affect live content go through an approval-link workflow so a human can review before anything publishes.

[MCP Server Overview →](./mcp/overview.md)

---

## Choose your API surface

| I want to… | Use |
|---|---|
| Read or write posts, pages, media, products from a server or CI pipeline | REST v1 |
| Pull published content into a static site generator at build time | REST v1 |
| Let a visitor book an appointment from a browser widget | Public API |
| Embed a live-chat widget on a site | Public API |
| Record a visitor A/B impression from client-side JavaScript | Public API |
| Drive the portal from Claude Code or another AI agent | MCP Server |
| Automate content drafts that a human approves before publishing | MCP Server |
| Query the Company Brain / knowledge base from an AI workflow | MCP Server |

---

## Table of contents

### REST v1 API

| Page | What it covers |
|---|---|
| [Authentication & Getting Started](./authentication.md) | API keys, request headers, rate limits, response envelope, status codes |
| [CMS Content API](./cms-content.md) | Posts, pages, categories, tags |
| [Media API](./media.md) | File uploads, media library management |
| [Blocks API](./blocks.md) | Block-level content read/write |
| [Commerce API](./commerce.md) | Products and product categories |
| [Site Configuration API](./site-config.md) | Branding, config settings, navigation |

### Public API

| Page | What it covers |
|---|---|
| [Booking & Gift Certificates API](./booking.md) | Public booking availability, requests, gift certificate redemption |
| [Live Chat API](./chat.md) | Visitor chat initiation and messaging |
| [Public Content & A/B Events API](./public-content.md) | Published content by slug, A/B event recording |

### MCP Server

| Page | What it covers |
|---|---|
| [MCP Server Overview](./mcp/overview.md) | Transport, credentials, scopes, approval workflow, connecting AI clients |
| [Content & Storefront Tools](./mcp/content-tools.md) | Posts, pages, block templates, media, products, orders |
| [CRM, Services & Tickets Tools](./mcp/crm-tools.md) | Contacts, companies, deals, pipelines, service catalogue, support tickets |
| [Email, Surveys, Pitch Decks & Automations Tools](./mcp/marketing-tools.md) | Email campaigns, survey builder, pitch decks, workflow automations |
| [Projects, Sprints, Kanban & Team Tools](./mcp/project-tools.md) | Projects, milestones, sprints, boards, cards, team members |
| [Company Brain Tools](./mcp/brain-tools.md) | Knowledge base entries, AI/RAG queries |
| [Bookings, Integrations, Hosting, Billing & AI Tools](./mcp/platform-tools.md) | Booking pages, connected integrations, domains, invoices, AI chat |

---

## Conventions

All three surfaces share the same JSON response envelope and error format. The canonical reference is [authentication.md](./authentication.md), but here is the short version.

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

**Common status codes**

| Code | Meaning |
|---|---|
| `200 OK` | Request succeeded. |
| `400 Bad Request` | Missing or unparseable parameter. |
| `401 Unauthorized` | Missing, invalid, expired, or site-mismatched credential. |
| `404 Not Found` | Resource or site does not exist / is not active. |
| `429 Too Many Requests` | Rate limit exceeded — check the `Retry-After` header. |

MCP error responses follow JSON-RPC 2.0 format (`{ "jsonrpc": "2.0", "error": { "code": ..., "message": "..." } }`). The `401` case is described in detail in the [MCP Server Overview](./mcp/overview.md).

For full details on rate limits, CORS headers, and the MCP approval-link workflow, see the linked reference pages above.
