# MCP Server — AI Agent API Overview

The SimplerDevelopment portal exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets any MCP-compatible AI client — Claude Code, Claude Desktop, a custom agent — drive your portal programmatically. You can create and publish content, manage projects and CRM records, send campaigns, and more, all from inside your AI environment of choice.

**Authentication reminder:** See [authentication.md](../authentication.md) for how to issue portal API keys and OAuth tokens. This page covers the transport layer, credential types, scopes, and the approval workflow.

---

## Base URL

```
POST https://simplerdevelopment.com/api/mcp
```

The endpoint accepts [Streamable HTTP](https://modelcontextprotocol.io/docs/concepts/transports) (stateless JSON-response mode). Each request is independent — there is no persistent session.

| Method | Behaviour |
|--------|-----------|
| `POST` | Send a JSON-RPC MCP request (including client-to-server notifications such as `notifications/cancelled`). |
| `GET` | Returns `405 Method Not Allowed` — SSE streaming is not supported on this endpoint. |

---

## Authentication

Every request must carry a `Bearer` token in the `Authorization` header. Two token formats are accepted:

| Credential type | Prefix | Where to get it |
|-----------------|--------|-----------------|
| **Portal API key** | `sd_mcp_` | Portal → Settings → API Keys |
| **OAuth access token** | `sd_oauth_` | OAuth authorization code flow (see `/.well-known/oauth-protected-resource`) |

```
Authorization: Bearer sd_mcp_<64 hex chars>
```

Both credential types resolve to the same `PortalMcpContext` (your user identity, your client/company, and your granted scopes). Usage is tracked on every call (`lastUsedAt` is updated automatically).

If the token is missing, invalid, revoked, or expired, the server returns:

```json
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="simplerdevelopment-mcp", resource_metadata="https://simplerdevelopment.com/.well-known/oauth-protected-resource"

{"jsonrpc":"2.0","error":{"code":-32001,"message":"Unauthorized"}}
```

---

## Scopes

Scopes follow the pattern `resource:action`. A key's scope list is fixed at issuance; the server enforces it per tool call. Attempting to call a tool your key's scopes do not cover silently omits that tool from the registry (the server never registers it), so `tools/list` only shows tools you can actually use.

**Wildcard forms:**

| Granted scope | Grants access to |
|---------------|-----------------|
| `*` | Everything |
| `projects:*` | All `projects:read` and `projects:write` tools |
| `projects:read` | Read-only tools in the projects domain |

**Available scopes by domain:**

| Domain | Read scope | Write scope | Notes |
|--------|-----------|-------------|-------|
| Projects | `projects:read` | `projects:write` | |
| Kanban / boards | `projects:read` | `projects:write` | Shares projects scopes |
| Tickets | `tickets:read` | `tickets:write` | |
| CRM | `crm:read` | `crm:write` | |
| CMS / content | `sites:read` | `sites:write` | Posts, pages, block templates |
| Media | `media:read` | `media:write` | |
| Email campaigns | `email:read` | `email:write` / `email:send` | `email:send` required to trigger sends |
| Pitch decks | `decks:read` | `decks:write` | |
| Surveys | `surveys:read` | `surveys:write` | |
| Bookings | `bookings:read` | `bookings:write` | |
| Billing | `billing:read` | — | No write scope exposed |
| Services | `services:read` | `services:write` | |
| Integrations | `integrations:read` | `integrations:write` | |
| Automations | `automations:read` | `automations:write` | |
| Hosting | `hosting:read` | — | |
| Team | `team:read` | `team:write` | |
| Profile | `profile:read` | `profile:write` | |
| AI / Brain | `ai:read` | `brain:write` | |
| Meta / whoami | _(unscoped)_ | — | Always available |

---

## Approval workflow

Many write tools in the MCP server **do not mutate immediately**. Instead they create a draft and return an approval URL. A human reviewer must open that URL and click Approve before the change is published.

This is intentional — it keeps AI-authored content from going live without human sign-off.

### How it works

1. Your agent calls a write tool (e.g. `posts_create`).
2. The tool creates a draft record, mints a 64-hex-char token, stores it in `mcp_approval_links`, and returns an `approval` envelope in the response.
3. You (or your client) open the URL: `https://simplerdevelopment.com/approve/<token>`.
4. The public page shows a preview. The reviewer clicks **Approve** or **Reject** — no portal login required.
5. On approval, the entity is published (or the staged mutation is applied).

**Two link types exist:**

| `linkType` | When used | On approve |
|------------|-----------|------------|
| `entity` | The draft row already exists. | Publishes the entity. |
| `pending_change` | The write was staged, not yet applied (keys with `require_cms_approval`). | Applies the staged mutation. |

**Approval envelope shape** (returned inside tool responses):

```json
{
  "approval": {
    "url": "https://simplerdevelopment.com/approve/a3f8...c1d2",
    "previewUrl": "https://simplerdevelopment.com/approve/a3f8...c1d2",
    "token": "a3f8...c1d2",
    "status": "pending",
    "expiresAt": "2026-06-18T08:37:00.000Z"
  }
}
```

Approval links expire after **14 days** by default. After expiry the link is marked `expired` and the author must call the corresponding `*_update` tool to remint a fresh link.

**Approvable entity types:** `post`, `pitch_deck`, `email_campaign`, `block_template`, `survey`, `booking_page`.

---

## Telemetry and token budget

Every tool call records latency and token cost via `lib/mcp/telemetry.ts`. Tool responses are intentionally compact — write tools echo `{ id, slug, status }`, not the full row. Heavy fields (e.g. `blocks`, `html`, `body`) are opt-in via an `include` flag where supported. This keeps context windows manageable for agents processing many results.

---

## Connecting an AI client

### Claude Desktop / Claude Code

Add this to your `claude_desktop_config.json` or Claude Code MCP config:

```json
{
  "mcpServers": {
    "simplerdevelopment": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://simplerdevelopment.com/api/mcp"],
      "env": {
        "MCP_BEARER_TOKEN": "sd_mcp_<your key here>"
      }
    }
  }
}
```

`mcp-remote` handles the POST-only transport automatically (it detects the `405` on `GET` and switches to POST-only mode).

### Custom agent (direct HTTP)

```bash
curl -X POST https://simplerdevelopment.com/api/mcp \
  -H "Authorization: Bearer sd_mcp_<your key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## `whoami` tool

**Always available — no scope required.**

Returns your authenticated user ID, client/company context, and the scopes your current credential grants.

**Tool call:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "whoami",
    "arguments": {}
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"userId\":42,\"client\":{\"id\":7,\"company\":\"Acme Corp\"},\"scopes\":[\"projects:*\",\"crm:read\",\"sites:write\"]}"
    }]
  }
}
```

---

## `blocks://schema` resource

**Always available — no scope required.**

An MCP resource (not a tool) that returns the full block-type reference in Markdown. Agents should read this before calling `posts_create` or `posts_update` to author valid `blocks` arrays.

**Resource URI:** `blocks://schema`

**Fetch via:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": { "uri": "blocks://schema" }
}
```

---

## Tool domains

The server registers tools from 24 per-domain registrars. Each domain has its own reference page:

| Domain | Tools cover | Reference |
|--------|-------------|-----------|
| Meta | `whoami`, `blocks://schema` resource | This page |
| Projects | Projects CRUD, milestones | [projects-tools.md](./projects-tools.md) |
| Kanban | Boards, columns, cards | [kanban-tools.md](./kanban-tools.md) |
| Sprints | Sprint planning, velocity | [sprints-tools.md](./sprints-tools.md) |
| Tickets | Support/task tickets | [tickets-tools.md](./tickets-tools.md) |
| CRM | Contacts, companies, deals, pipelines | [crm-tools.md](./crm-tools.md) |
| CMS | Posts, pages, block templates, media | [cms-tools.md](./cms-tools.md) |
| Email | Campaigns, lists, sends | [email-tools.md](./email-tools.md) |
| Pitch Decks | Deck create/update/publish | [pitch-decks-tools.md](./pitch-decks-tools.md) |
| Surveys | Survey builder, responses | [surveys-tools.md](./surveys-tools.md) |
| Bookings | Booking pages, availability, appointments | [bookings-tools.md](./bookings-tools.md) |
| Profile | Portal user profile | [profile-tools.md](./profile-tools.md) |
| Integrations | Connected third-party services | [integrations-tools.md](./integrations-tools.md) |
| Billing | Invoices, subscriptions (read-only) | [billing-tools.md](./billing-tools.md) |
| Services | Agency service catalogue | [services-tools.md](./services-tools.md) |
| AI | AI chat, content generation | [ai-tools.md](./ai-tools.md) |
| Automations | Workflow automations | [automations-tools.md](./automations-tools.md) |
| Hosting | Domains, deploy status | [hosting-tools.md](./hosting-tools.md) |
| Team | Team members, roles | [team-tools.md](./team-tools.md) |
| Branding | Brand profiles, assets | [branding-tools.md](./branding-tools.md) |
| Storefront | Products, orders | [storefront-tools.md](./storefront-tools.md) |
| Brain | Company knowledge base (AI/RAG) | [brain-tools.md](./brain-tools.md) |
| Post Types | Custom post type definitions | [post-types-tools.md](./post-types-tools.md) |
| Approvals | Pending-change approval management | [approvals-tools.md](./approvals-tools.md) |
