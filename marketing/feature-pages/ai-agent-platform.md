# Feature Landing Page Spec — AI Agent Platform (MCP Server)

---

## SEO Block

- **Title (≤60 chars):** 450-Tool MCP Server for Agency SaaS
- **Meta description (≤155 chars):** Connect Claude or any MCP-compatible AI client to every domain of your portal — CRM, email, projects, bookings, brain, store — via 450 scoped tools.
- **Slug:** `/features/ai-agent-platform`
- **Primary keyword:** MCP server for agency software
- **Secondary keywords:** Model Context Protocol tools, AI agent API integration, OAuth 2.1 MCP authentication, scoped AI tool access, AI-driven CRM automation

---

## Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SimplerDevelopment AI Agent Platform",
  "applicationCategory": "DeveloperApplication",
  "featureList": [
    "450 MCP tools across all portal domains",
    "OAuth 2.1 authorization with PKCE",
    "~50 named scopes for least-privilege access",
    "Human-in-the-loop approval links for live content changes",
    "4 MCP resources including blocks schema and brand profile",
    "3 guided MCP prompts for common workflows",
    "REST v1 API with OpenAPI 3.1 spec",
    "Registry-locked tool count with pre-push test gate"
  ],
  "offers": {
    "@type": "Offer",
    "description": "Included with platform; per-tenant API key provisioning"
  }
}
```

```json
{
  "@context": "https://schema.org",
  "@type": "APIReference",
  "name": "SimplerDevelopment MCP API",
  "documentation": "/docs/agents/tool-reference",
  "programmingLanguage": "HTTP",
  "targetPlatform": "MCP Streamable HTTP"
}
```

Additional applicable type: `FAQPage` (see FAQs section below).

---

## Hero

**Headline:** Every Corner of Your Agency Platform, Accessible to Any AI Agent

**Subhead:** A single MCP endpoint with 450 tools — covering CRM, email, projects, bookings, content, store, Company Brain, and more — so AI agents can read, write, and act across your entire portal with fine-grained OAuth 2.1 scope control and human-in-the-loop approval for live changes.

---

## Problem

AI tools that assist with agency work — drafting content, updating CRM records, managing projects, sending emails — each need to connect to separate systems. Developers wire integrations by hand, manage separate API credentials for each tool, and have no consistent model for what an AI agent is allowed to do versus what requires a human to review.

---

## Solution

SimplerDevelopment exposes every portal domain as a single Model Context Protocol (MCP) endpoint at `POST /api/mcp`. An AI client — such as Claude.ai, Claude Desktop, or a custom agent — connects once via OAuth 2.1 and gets access to up to 450 tools covering the full platform surface. Scopes limit which tools a given client can call. Live-content write operations (publishing, sending, deleting) produce a human-reviewable approval link before they take effect. The tool count is registry-locked by a test that runs on every push.

---

## Key Benefits

1. **450 tools, one endpoint.** Every platform domain — Company Brain (156 tools), kanban (39), CRM (34), store (28), email (20), pitch decks (13), surveys (7), bookings (9), and more — is reachable from a single `POST /api/mcp` call. Agents do not need separate integrations per domain.
2. **OAuth 2.1 with named scopes.** Approximately 50 named scopes (`brain:read`, `crm:write`, `email:send`, `approvals:manage`, etc.) enforce least-privilege access. A wildcard `*` scope grants all tools. Tokens are issued via a standard auth-code flow with PKCE (RFC 7636) and RFC 8707 audience binding.
3. **Human-in-the-loop by design.** Most live-content write tools — publishing a page, sending a campaign, deleting a record — do not take effect immediately. Instead, the tool returns an `approvalUrl` that a human must click to confirm. Draft and metadata operations mutate immediately without a review step.
4. **4 MCP resources for zero-cost context.** AI clients can attach structured data to their context without a tool call: `blocks://schema` (the full block catalog with input schemas), `brand://default` (the active tenant's brand profile), `catalog://services` (the published service catalog), and `portal://capabilities` (what tools and scopes the current key can access).
5. **3 built-in guided prompts.** `draft-page` walks an agent through drafting and publishing a new site page. `triage-tickets` categorizes open support tickets and suggests responses. `weekly-digest` generates a progress summary across active projects and initiatives.

---

## How It Works

1. **Generate an API key or connect via OAuth.** Portal API keys (prefix `sd_mcp_`) are created in Settings → API Keys. For programmatic agent access, go through the standard OAuth 2.1 auth-code flow at `app/oauth/authorize/` to obtain a scoped `sd_oauth_` token.
2. **Configure the MCP client.** Point any MCP-compatible client at `POST /api/mcp` with `Authorization: Bearer <key-or-token>`. The `whoami` unscoped tool confirms the identity and active client context.
3. **Call tools with scope-appropriate operations.** The agent can call any tool permitted by its scopes. Tools that would modify live content return an `approvalUrl` instead of executing immediately — surface that URL to a human reviewer.
4. **Human reviews and approves.** The reviewer clicks the approval URL, sees a WYSIWYG preview of the change, and approves or rejects it. Approved changes go live; rejected ones are discarded. The portal approval queue at `app/portal/approvals/` shows all pending items.

---

## FAQs

**Q: Which AI clients work with this MCP endpoint?**
A: Any client that implements the Model Context Protocol Streamable HTTP transport. Claude.ai (via OAuth 2.1 connection), Claude Desktop, and custom agents built on the Anthropic SDK are all compatible. The endpoint is `POST /api/mcp`.

**Q: How do I restrict an agent to read-only access?**
A: Issue a token with only `:read` scopes — for example, `brain:read crm:read projects:read`. Tools that write or mutate data are guarded by `:write` or action-specific scopes (`email:send`, `approvals:manage`) and will be inaccessible to the read-only token.

**Q: What prevents an agent from making changes without human review?**
A: The approval-link pattern is built into the tool layer. Live-content mutations return an `approvalUrl` in the tool response. Until a human clicks that URL and confirms, the change is pending and has not taken effect. This is enforced at the `lib/mcp/approvals.ts` layer, not as a policy the agent can opt out of.

**Q: How many tools can I use under a `*` wildcard scope?**
A: 450 tools under the current registry. The count is locked by `tests/unit/mcp-tool-registry-baseline.test.ts`, which runs on every push — any addition, removal, or rename fails the gate until the baseline is updated.

**Q: Is there a REST API alternative to MCP?**
A: Yes. A REST v1 API at `/api/v1/` accepts `sd_live_` Bearer keys, enforces 60 req/min, and has an OpenAPI 3.1 spec at `public/openapi.yaml`. The v1 surface is read-only (posts, pages, media, products, branding, navigation). MCP is the full read-write surface.

---

## Tool Coverage at a Glance

| Domain | Tools | Key operations |
|---|---|---|
| Company Brain & AI | 156 | notes, decisions, documents, goals, initiatives, playbooks, org chart, RAG search |
| Kanban & Projects | 39 | cards, columns, checklists, labels, sprints, time logs |
| CRM | 34 | contacts, companies, deals, pipelines, activities, proposals, contracts |
| Store & Commerce | 28 | products, inventory, orders, discounts, customers, reviews |
| Email Campaigns | 20 | campaigns, lists, segments, subscribers, templates |
| Custom Post Types | 13 | type registry, custom fields, Liquid render templates |
| Pitch Decks | 13 | decks, slides, HTML upload, publish |
| CMS Posts | 10 | create, update, fork, HTML upload, revisions |
| Bookings | 9 | booking pages, records, gift certificates |
| Branding | 9 | brand profiles, messaging, contrast check, audit |
| Surveys | 7 | create, update, responses |
| Block Templates | 7 | create, fork, publish |
| Navigation | 6 | tree management, publish |
| Tickets | 6 | create, reply, update |
| Automations | 5 | create, toggle, update, delete |

---

## CTA

**Primary:** Connect your AI agent today — [Get an API key]
**Secondary:** Read the full tool reference — [View docs](/docs/agents/tool-reference)

---

## Internal Links

- [docs/agents/ai-overview.md](../../docs/agents/ai-overview.md) — platform overview for agents and developers
- [docs/agents/tool-reference.md](../../docs/agents/tool-reference.md) — full 450-tool reference with scopes, resources, and prompts
- [docs/agents/glossary.md](../../docs/agents/glossary.md) — MCP, approval link, scope guard, and other term definitions
- [Bookings & Scheduling](/features/bookings-scheduling) — 9 booking tools (`booking_pages_*`, `bookings_*`)
- [Email Campaigns](/features/email-campaigns) — 20 email tools (`email_*`)
- [Surveys & Forms](/features/surveys-forms) — 7 survey tools (`surveys_*`)
- [Pitch Decks](/features/pitch-decks) — 13 deck tools (`decks_*`)
- [Automations & Workflows](/features/automations-workflows) — 5 automation rule tools (`automations_*`)

---

## Media Requirements

- **Diagram:** Architecture overview — AI client → `POST /api/mcp` → tool namespaces (brain, crm, kanban, email, store…) → approval link → human reviewer. Clean, no marketing copy. Reference: [docs/agents/ai-overview.md](../../docs/agents/ai-overview.md).
- **Screenshot:** OAuth consent screen at `/oauth/authorize/` — showing scope selection before granting a token.
- **Screenshot:** Portal API key settings page — key list with scope labels visible.
- **Screenshot:** Approval queue in the portal — a pending content change with WYSIWYG preview and Approve/Reject buttons.
- **Screenshot:** Claude Desktop (or similar MCP client) calling a tool — showing the tool name, input parameters, and the `approvalUrl` in the response.
- **Code snippet (inline in page):** Minimal `curl` call to `POST /api/mcp` — 5 lines showing Bearer auth, tool name, and a sample argument object.
- **Table graphic:** Domain → tool count table (use the "Tool Coverage at a Glance" table above as source).

---

## Status Notes (internal — omit from published page)

- No public OAuth developer self-service console exists yet (`/api/portal/oauth-clients` API exists; no UI). Do not market "create your OAuth app in a self-serve console."
- No SDK or npm package exists. Do not imply one.
- OpenAPI spec covers REST v1 only, not the MCP or portal-internal surface.
- No MCP tools yet for the Visual Workflow Builder (only for automation rules).
- Voice assistant is dormant — do not mention.
- Webhook delivery for outbound project webhooks has no retry, signing-secret, or delivery log yet — do not feature.
