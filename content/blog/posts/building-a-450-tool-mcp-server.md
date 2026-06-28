---
title: "Building a 450-Tool MCP Server for a Multi-Tenant SaaS"
slug: "building-a-450-tool-mcp-server"
description: "How we designed a scope-gated, registry-locked MCP server with 450 tools, an approval-link pattern, and a baseline test that catches every drift."
date: 2026-06-27
tags:
  - mcp
  - architecture
  - multi-tenant
  - api
  - developer-platform
author: "SimplerDevelopment Team"
draft: true
---

When we started wiring AI agents into SimplerDevelopment, we faced a decision that any platform team eventually hits: do you build a thin REST wrapper for your AI clients, or do you build a proper tool surface that understands your domain?

We chose the latter. Twelve months and 450 tools later, here is what we learned.

---

## Why we built an MCP server instead of another REST wrapper

The honest answer is that REST wrappers leak complexity upward. An AI agent consuming a set of `GET /contacts` and `POST /contacts` endpoints has to rediscover your domain model on every request — pagination conventions, field names, error shapes, which fields are writable, which require approval. Agents are good at following instructions but poor at inferring implicit contracts.

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) inverts this. Each tool carries a Zod-validated input schema, a human-readable description, and a typed response. The client (Claude Desktop, Claude Code, or any MCP-capable host) can discover the full surface at connection time, call tools by name, and trust that the schema is authoritative. Streamed responses let the server push incremental results without the client polling.

We also needed **resources** — read-only context documents an agent can attach to its window without making a tool call — and **prompts** — parameterized guided workflows surfaced as slash commands in capable clients. Neither concept maps cleanly to REST.

For transport we chose MCP Streamable HTTP (`POST /api/mcp`) over SSE. The difference matters for serverless and edge hosts: a single HTTP POST fits neatly into stateless execution environments without maintaining a persistent server-sent-events connection. Our endpoint lives at `app/api/mcp/`.

---

## The registry: one server, 450 tools, zero hand-rolling

`lib/mcp/server.ts` bootstraps one MCP server instance. Each product domain registers its tools through a dedicated registrar:

```typescript
// lib/mcp/server.ts (simplified)
import { registerBrainTools }   from './tools/brain'
import { registerKanbanTools }  from './tools/kanban'
import { registerCrmTools }     from './tools/crm'
import { registerStoreTools }   from './tools/store'
import { registerEmailTools }   from './tools/email'
// ... ~20 more registrars

export function buildMcpServer() {
  const server = new McpServer({ name: 'SimplerDevelopment', version: '1.0.0' })
  registerBrainTools(server)
  registerKanbanTools(server)
  registerCrmTools(server)
  // ...
  return server
}
```

No single registrar file owns all 450 tools. Each lives in `lib/mcp/tools/<domain>.ts`, which keeps individual files in a manageable range — though we have learned the hard way that "manageable" requires active enforcement (more on that below).

The tool catalogue breaks down as follows:

| Namespace | Count | What it covers |
|---|---|---|
| `brain_*` | 156 | Company Brain: notes, tasks, meetings, documents, decisions, glossary, goals, initiatives, org units, people, playbooks, topics, RAG search |
| `kanban_*` | 39 | Boards, cards, checklists, sprints, time logs |
| `crm_*` | 34 | Contacts, companies, deals, pipelines, custom fields |
| `store_*` | 28 | Products, inventory, orders, discounts, reviews |
| `email_*` | 20 | Campaigns, lists, segments, subscribers, templates |
| `post_types_*` | 13 | Custom content types with field schemas and render code |
| `decks_*` | 13 | Slide deck CRUD, HTML upload |
| `posts_*` | 10 | CMS posts and pages |
| Remaining namespaces | ~137 | `projects_*`, `booking_pages_*`, `branding_*`, `surveys_*`, `nav_*`, `tickets_*`, `website_*`, `automations_*`, `media_*`, and ~15 smaller families |

Alongside the tools, we register four **resources** — read-only documents MCP clients can attach to context without a tool call:

- `blocks://schema` — the full catalog of 47 built-in block types with their input schemas
- `brand://default` — the active tenant's brand profile (colors, typography, logo, messaging)
- `catalog://services` — the published service catalog for the active client
- `portal://capabilities` — a capability manifest scoped to the current key and its granted scopes

And three **prompts** — guided slash-command workflows that return a message template rather than executing directly:

- `draft-page` (requires `sites:write`) — guided flow for drafting and publishing a new site page
- `triage-tickets` (requires `tickets:read`) — walks open support tickets and suggests assignees or responses
- `weekly-digest` (requires `projects:read`) — progress digest across active projects, sprints, and Brain initiatives

Three tools are callable without any scope: `whoami`, `list_workflows`, and `get_workflow`. Everything else requires at least one named scope.

### The lockstep rule — four changes, one commit

Every new tool requires exactly four things, in one commit, with no exceptions:

1. **Handler function** — the actual business logic, calling the Drizzle query layer and returning a structured response
2. **Zod input schema** — validated before the handler runs; wrong types 400 before they reach the DB
3. **`hasScope` guard** — called at the top of every handler, before any query
4. **Telemetry registration** — per-call latency and token cost recorded in `lib/mcp/telemetry.ts`

We built the `simplerdev-mcp-tool` skill to enforce this. You run it, pass a tool name and scope, and it scaffolds all four artifacts together. The reason it exists is that each of these four has been independently forgotten in practice — missing schema catches a typo at validation; missing scope guard is a security and tenancy issue; missing telemetry silently voids your token cost tracking.

A canonical handler skeleton looks like this:

```typescript
// lib/mcp/tools/brain.ts (illustrative)
server.tool(
  'brain_create_note',
  'Create a note in the Company Brain.',
  z.object({
    title:   z.string().min(1),
    content: z.string().optional(),
    tags:    z.array(z.string()).optional(),
  }),
  async (input, ctx) => {
    hasScope(ctx.scopes, 'brain:write')   // ← scope guard, always first

    const note = await createBrainNote({
      clientId: ctx.clientId,
      ...input,
    })

    await telemetry.record({ tool: 'brain_create_note', ctx })

    return { id: note.id, slug: note.slug, status: note.status }
  }
)
```

Notice the return value: `{ id, slug, status }` — not the full note row. That slim projection pattern is deliberate and covered in the telemetry section below.

---

## Scope guards and the tenancy invariant

SimplerDevelopment is multi-tenant. Every record in the database carries a `clientId`. An agent authenticated with client A's credentials must never be able to read or write client B's data. The scope guard is the last line of defense at the tool boundary.

Two credential types are accepted as `Authorization: Bearer <credential>`:

| Prefix | Type | Storage |
|---|---|---|
| `sd_mcp_` | Portal API key | SHA-256 hashed in `portal_api_keys` |
| `sd_oauth_` | OAuth 2.0 bearer token | Issued by `lib/oauth/server.ts`, RFC 8707 audience binding |

The OAuth 2.0 flow is a standard authorization-code flow. Resource indicators per RFC 8707 bind tokens to an audience, which prevents token substitution across tenants. Scope definitions are canonical in `lib/oauth/scopes.ts`. Today there are approximately 50 named scopes following a `<domain>:<access>` pattern:

```
brain:read    brain:write   brain:approve
kanban:read   kanban:write
crm:read      crm:write
store:read    store:write
email:read    email:write   email:send
posts:read    posts:write
sites:read    sites:write
...
approvals:manage
*             (all 450 tools)
```

The `*` wildcard exists for trusted internal integrations. Most production integrations should request only the scopes they actually need.

`hasScope` is implemented as a simple synchronous check. If the calling credential does not hold the required scope, it throws before a single DB query runs:

```typescript
// lib/mcp/tools/helpers.ts (illustrative)
export function hasScope(scopes: string[], required: string): void {
  if (scopes.includes('*') || scopes.includes(required)) return
  throw new McpError(ErrorCode.Forbidden, `Scope required: ${required}`)
}
```

The MCP SDK surfaces this as a structured 403 with our standard `{ success: false, error: "..." }` envelope. No partial data leaks out.

### What happens when a scope check fails

The 403 response is clean and machine-readable. More importantly, a missing scope guard does not survive to production — the baseline test (see the next section) asserts that every registered tool has a `hasScope(...)` call. A guard accidentally omitted during development fails the pre-push gate before the branch is merged.

---

## The approval-link pattern — safe write access for agents

The most consequential architectural decision we made was this: most live-content write tools do not execute immediately.

Instead, when an agent calls `brain_update_document` or `posts_update` to modify published content, the tool mints an approval URL via `lib/mcp/approvals.ts` and returns it in the response:

```json
{
  "approvalUrl": "https://example.com/approve/tk_a1b2c3d4...",
  "message": "Your changes are staged for review. Open the URL to approve or reject."
}
```

The operation is pending. Nothing has changed in the database. The agent surfaces the URL to the human operator, who opens it in their browser, sees a WYSIWYG preview of exactly what will change, and clicks to confirm or reject.

This matters for any platform where AI agents can write to content that is already live in front of end users. The alternative — letting agents mutate published content immediately — creates a category of accident that is difficult to recover from and hard to audit.

The rule for which operations require approval is:

- **Approval required:** live-content mutations (publish, delete, send, replace published body)
- **Mutates immediately:** metadata updates, draft operations, any tool under `kanban_*` or `crm_*`

### Approval lifecycle

An approval record is created in the database with a page-scoped token. The management API at `/api/approve/` handles create, fetch, approve, and reject. The reviewer UI lives at `app/approve/[token]/` and shows the pending change in a WYSIWYG preview.

For programmatic workflows — say, a multi-step agent that needs to queue approvals and poll their status — the `approvals_*` tool family (4 tools: `approvals_get`, `approvals_list`, `approvals_approve`, `approvals_reject`) is distinct from the approval-link pattern. These tools let agents manage the approval queue directly, subject to the `approvals:manage` scope.

---

## The baseline test — a registry lock that catches drift

The tool count at 450 means a missing or renamed tool can be invisible to the developer who touched it. If you rename `brain_create_note` to `brain_note_create` during a refactor, every integration that calls the old name silently breaks.

We catch this at the unit test layer, before any merge:

**`tests/unit/mcp-tool-registry-baseline.test.ts`**

The test builds the full MCP server against a mocked database (no live Postgres required) and then runs three assertions:

1. The set of registered tool names exactly matches `EXPECTED_TOOLS` — a hardcoded array of all 450 names
2. The set of registered resource URIs exactly matches `EXPECTED_RESOURCES`
3. The set of registered prompt names exactly matches `EXPECTED_PROMPTS`

It also walks every registered tool and asserts the handler body contains a `hasScope(...)` call. A guard accidentally omitted fails the test.

```typescript
// tests/unit/mcp-tool-registry-baseline.test.ts (illustrative structure)
const EXPECTED_TOOLS = [
  'brain_create_note',
  'brain_get_note',
  'brain_update_note',
  'brain_delete_note',
  // ... 446 more
]

const EXPECTED_RESOURCES = [
  'blocks://schema',
  'brand://default',
  'catalog://services',
  'portal://capabilities',
]

const EXPECTED_PROMPTS = ['draft-page', 'triage-tickets', 'weekly-digest']

describe('MCP registry baseline', () => {
  it('registers exactly the expected tools', () => {
    const server = buildMcpServer()
    const names = server.listTools().map(t => t.name).sort()
    expect(names).toEqual([...EXPECTED_TOOLS].sort())
  })

  it('every tool has a scope guard', () => {
    // ... introspects handler source for hasScope calls
  })
})
```

This test runs in the unit layer (`bun test`) and as a pre-push CI gate. The workflow when adding a new tool is: run the `simplerdev-mcp-tool` skill (which scaffolds all four lockstep artifacts), then update `EXPECTED_TOOLS` in the baseline test and commit both changes together.

### Why a hardcoded constant list, not a count

The naive version of this test would assert that `server.listTools().length === 450`. A count-only check is insufficient. Two bugs that cancel out — an accidental removal plus an accidental addition — produce the same count and pass silently. Worse, a rename that breaks existing integrations produces no count change at all. Exact name matching catches all three: unintentional removals, unintentional additions, and renames that break callers.

---

## Telemetry and token budgets

Every tool invocation records per-call latency and token cost in `lib/mcp/telemetry.ts`. This is not optional — it is how we track actual AI usage per tenant and bill against credits.

More visibly, the response projection pattern keeps MCP responses small. Write tools return `{ id, slug, status }` by default, not the full row. If a caller needs the full document body, they pass an `include` opt-in flag:

```typescript
// Slim (default): returns { id, slug, status }
brain_update_document({ id: 'doc_123', title: 'New title' })

// Full body on request:
brain_update_document({ id: 'doc_123', title: 'New title', include: ['body'] })
```

Heavy fields — post body HTML, block JSON, large embeddings — are behind the `include` flag. The reasoning is straightforward: a 5,000-word document body in every write response balloons an agent's context window with content it usually does not need. The `simplerdev-mcp-token-budget` skill audits tool responses that cross a token threshold and flags the heavy fields for gating.

A practical note for contributors: several tool files have grown large enough to avoid reading in full. `lib/brain/mcp-sdk-adapter.ts` is 5,630 lines. `lib/mcp/tools/cms.ts` is 2,216 lines. Use a targeted subagent search rather than reading these wholesale — the patterns are consistent across tools once you have read a few.

---

## What we would do differently at tool 100

**Split domain registrar files earlier.** The CMS tool file crossed 2,000 lines before we split it. At that size, a routine edit requires reading the entire file to understand context. Domain registrars should be split when they exceed roughly 600 lines — one sub-group of tools per file where the domain is large.

**Enforce projection defaults via a shared wrapper.** Today the slim `{ id, slug, status }` projection is a per-tool convention rather than a framework constraint. Several early tools return full rows; we audit and patch them with `simplerdev-mcp-token-budget`. A write-tool wrapper that enforces slim output by default and requires explicit opt-in for full rows would have eliminated this class of drift.

**Document MCP-specific rate limits before the first external partner.** We have per-IP rate limiting on REST v1 (60 requests per minute via `lib/api-key-middleware.ts`) but no published MCP-specific rate limit policy. This has not been an issue for internal agents but will need to be formalized before a public developer program.

**Known gap: no self-serve OAuth developer console.** The management API exists at `/api/portal/oauth-clients`, but there is no public-facing console where an external developer can register an OAuth application and request scopes. Adding one is the next step before opening the MCP surface to third-party integrations.

---

## Connect your agent

The MCP server is live for all SimplerDevelopment tenants. To connect your AI agent:

1. Generate a portal API key under **Settings → API Keys** in the portal. Keys start with `sd_mcp_` and can be scoped to only the domains your integration needs.
2. Point your MCP client at `POST https://app.simplerdevelopment.com/api/mcp` with `Authorization: Bearer <your-key>`.
3. The `portal://capabilities` resource (unscoped, always available) returns the exact tool set your key can call — useful for debugging scope issues.

For the complete tool catalogue with input schemas, see the [tool reference](/docs/agents/tool-reference). For a broader view of how the system is structured, the [architecture guide](/docs/agents/architecture-for-agents) covers the three route trees, tenancy model, and the AI layer.

---

*For a deeper look at any specific domain — Brain, CRM, or store — each has a nested `CLAUDE.md` in the repository that covers domain-specific invariants and known footguns.*
