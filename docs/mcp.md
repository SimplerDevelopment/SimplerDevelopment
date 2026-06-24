# MCP Server — Connect an AI Agent

The portal exposes a [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude (Desktop, Code, or the API) manage your portal programmatically — projects, tickets, CRM, content, media, and email.

---

## Option A — Claude.ai (one-click, recommended)

Claude.ai web has a custom-connector dialog that handles login and consent for you. No API key to copy and paste.

1. In Claude.ai → **Settings → Connectors → Browse connectors → Add custom connector**.
2. Name: **SimplerDevelopment**.
3. Remote MCP server URL: `https://www.simplerdevelopment.com/api/mcp`
4. Leave the OAuth fields blank — Claude registers itself automatically.
5. Click **Add**. You'll be redirected to your portal login (if not already signed in), then to a consent screen showing what Claude is asking for. Approve to finish.

Behind the scenes this uses OAuth 2.1 with PKCE. Tokens are scoped to whichever portal you choose on the consent screen and can be revoked at any time from [`/portal/settings/api-keys`](/portal/settings/api-keys).

---

## Option B — API key (Claude Code, scripts, headless)

Use this for non-interactive clients (Claude Code agents, custom scripts, CI). The OAuth flow above is easier for end users.

### 1. Generate an API key

1. Open [`/portal/settings/api-keys`](/portal/settings/api-keys).
2. Click **New key**, name it, choose scopes, generate.
3. Copy the `sd_mcp_…` value — it's shown *once*.

### 2. Endpoint

```http
POST https://www.simplerdevelopment.com/api/mcp
Authorization: Bearer sd_mcp_your_key_here
```

The server uses the MCP Streamable HTTP transport in stateless mode. It accepts GET, POST, and DELETE.

### 3. Claude Desktop config

Claude Desktop expects stdio-style MCP servers. Use `mcp-remote` as a bridge:

```json
{
  "mcpServers": {
    "simplerdevelopment": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.simplerdevelopment.com/api/mcp",
        "--header",
        "Authorization: Bearer sd_mcp_your_key_here"
      ]
    }
  }
}
```

### 4. Claude Code

```bash
claude mcp add --transport http simplerdevelopment \
  https://www.simplerdevelopment.com/api/mcp \
  --header "Authorization: Bearer sd_mcp_your_key_here"
```

---

## Available tools

The server exposes **446 tools across 28 domains**. Rather than listing every tool here, the reference pages below describe each domain in detail:

- [MCP overview](./api/mcp/overview.md) — transport, auth, scopes, approval workflow, `whoami`, `blocks://schema`
- [Brain tools](./api/mcp/brain-tools.md) — Company knowledge base: notes, meetings, people, documents, tasks, goals, initiatives, playbooks, org units, topics, glossary, decisions
- [CRM tools](./api/mcp/crm-tools.md) — Contacts, companies, deals, pipelines, activities, custom fields, saved views, scoring rules
- [Content tools](./api/mcp/content-tools.md) — CMS posts/pages/block templates/post types/taxonomies/media/nav/site settings; storefront products/orders/customers/discounts/reviews; brand profiles and messaging
- [Marketing tools](./api/mcp/marketing-tools.md) — Email campaigns, lists, subscribers, templates, segments; survey builder and responses; pitch decks; workflow automations
- [Platform tools](./api/mcp/platform-tools.md) — Bookings and booking pages; third-party integrations; hosting and domain status; billing and invoices; AI conversation history and credits; MCP approval links; live chat; notifications
- [Project tools](./api/mcp/project-tools.md) — Projects, sprints, kanban boards/columns/cards/labels/checklists/time logging, team members and roles, tickets

---

## Connecting a custom / non-Claude MCP client

If you are building your own agent or integrating a third-party MCP host, use the **OAuth 2.1 + PKCE** flow instead of a static API key. The portal is a fully compliant authorization server.

### Discovery

Fetch the server metadata at:

```
GET https://www.simplerdevelopment.com/.well-known/oauth-authorization-server
```

The response contains `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `jwks_uri`, and the supported `code_challenge_methods` (`S256`). The portal also publishes `/.well-known/oauth-protected-resource` for clients that follow the OAuth 2.0 Protected Resource metadata spec.

### Dynamic Client Registration

If your client does not have a pre-registered `client_id`, register it dynamically via the `registration_endpoint` returned above (RFC 7591). Supply `redirect_uris`, `client_name`, and the scopes your client will request. You'll receive a `client_id` (and optionally a `client_secret` for confidential clients) to use in subsequent flows.

### Authorization code flow with PKCE (S256)

1. **Generate a code verifier** — a cryptographically random string (43–128 chars, URL-safe base64).
2. **Derive the code challenge** — `BASE64URL(SHA-256(ASCII(code_verifier)))`.
3. **Redirect the user** to `authorization_endpoint` with:
   - `response_type=code`
   - `client_id=<your client id>`
   - `redirect_uri=<your callback>`
   - `scope=<space-separated scopes>`
   - `state=<random CSRF token>`
   - `code_challenge=<S256 challenge>`
   - `code_challenge_method=S256`
4. **Exchange the code** — POST to `token_endpoint` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, and `code_verifier`. Receive `access_token` (1-hour lifetime), `refresh_token`, and `expires_in`.
5. **Call the MCP server** — pass `Authorization: Bearer <access_token>` on every request.
6. **Rotate the refresh token** — when the access token expires, POST to `token_endpoint` with `grant_type=refresh_token` and `refresh_token`. Each rotation issues a new refresh token and invalidates the previous one.

Access tokens carry the scopes the user approved on the consent screen. Tokens can be revoked at any time from the portal's API key settings page.

See [authentication.md](./api/authentication.md) for static API key issuance, scope reference, and token lifecycle details.

---

## Scopes

Keys carry scopes like `projects:read`, `crm:*`, or `*` for full portal access. Tools check scopes before running — a key scoped to `projects:*` can't modify CRM data.

---

## CMS approval workflow

For AI agents editing live client content, set `require_cms_approval = true` on the API key. Instead of applying directly, covered tools stage the change into `mcp_pending_changes` and return `{ pending: true, pendingId, summary }`.

A staff user with `approvals:manage` scope reviews via the approvals tools:

```js
// List pending
approvals_list({ status: "pending" })

// Inspect with diff snapshot
approvals_get({ id: 42 })

// Apply or reject
approvals_approve({ id: 42, note: "looks good" })
approvals_reject({ id: 42, note: "wrong tone" })
```

Approval re-runs the original mutation with the stored payload. Writer keys (`require_cms_approval = true`) cannot self-approve — enforced by scope.

**Covered tools:** `posts_create/update/delete`, `decks_create/update/replace_slides/add_slide/delete`, `proposals_create/update/send`, `email_campaigns_create/update/delete/send`.

---

## Security

- Keys are hashed (SHA-256) at rest — the raw key is returned once at creation.
- All tools are scoped to the client that owns the key; no cross-tenant access.
- Revoke a key at any time from the settings page — takes effect immediately.
