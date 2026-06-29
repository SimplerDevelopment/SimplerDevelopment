# Outline: Building a 450-Tool MCP Server

---

## Meta

**SEO title:** Building a 450-Tool MCP Server for a Multi-Tenant SaaS
**Meta description:** How we designed a scope-gated, registry-locked MCP server with 450 tools, an approval-link pattern, and a baseline test that catches every drift.
**URL slug:** `building-a-450-tool-mcp-server`
**Target audience:** Backend engineers integrating MCP into production SaaS; developer-platform builders; AI tooling teams.
**Primary keywords:** MCP server architecture, Model Context Protocol, multi-tenant MCP
**Secondary keywords:** scope guards, registry baseline test, approval-link pattern, Zod schema, MCP tools

---

## Outline

### H2: Why we built an MCP server instead of another REST wrapper

- The problem: AI agents need structured, scoped access to every product surface — not a thin CRUD layer.
- MCP's value: tool discovery, typed inputs (Zod), streaming HTTP transport, resources, and prompts in a single protocol.
- Transport choice: MCP Streamable HTTP (`POST /api/mcp`) — not SSE. Why this matters for server-less and edge hosts.

### H2: The registry: one server, 450 tools, zero hand-rolling

- `lib/mcp/server.ts` bootstraps; each domain registers via `registerBrainTools()`, `registerKanbanTools()`, etc. in `lib/mcp/tools/<domain>.ts`.
- Tool families by namespace and size:
  - `brain_*` — 156 tools (notes, documents, decisions, goals, playbooks, RAG search)
  - `kanban_*` — 39 tools (boards, cards, checklists, sprints)
  - `crm_*` — 34 tools (contacts, companies, deals, pipelines)
  - `store_*` — 28 tools (products, orders, discounts, customers)
  - `email_*` — 20 tools (campaigns, lists, segments, subscribers)
  - Remaining families: `posts_*`, `decks_*`, `projects_*`, `branding_*`, `surveys_*`, `nav_*`, and ~20 smaller namespaces
- Resources (4): `blocks://schema`, `brand://default`, `catalog://services`, `portal://capabilities`
- Prompts (3): `draft-page`, `triage-tickets`, `weekly-digest` — slash-command-style guided workflows
- Unscoped tools that every key can call: `whoami`, `list_workflows`, `get_workflow`

#### H3: The lockstep rule — four changes, one commit

- Every new tool requires **four** things in lockstep (via the `simplerdev-mcp-tool` skill): handler, Zod input schema, `hasScope` guard, telemetry registration.
- Why the skill enforces this: each of the four has been independently forgotten in practice.
- Key code concept: `hasScope(ctx.scopes, 'brain:write')` call pattern inside a tool handler.

### H2: Scope guards and the tenancy invariant

- Two credential types: `sd_mcp_` portal API keys (SHA-256 hashed in `portal_api_keys`) and `sd_oauth_` OAuth 2.0 bearer tokens (RFC 8707).
- ~50 named scopes — `<domain>:read` / `<domain>:write` plus special scopes: `email:send`, `brain:approve`, `approvals:manage`. Wildcard `*` grants all 450 tools.
- `hasScope` is called at the top of every handler — **missing guard = tenancy bug**. Tools that mutate cross-tenant data without a scope check are a data-leak vector.
- Canonical scope definitions live in `lib/oauth/scopes.ts`.

#### H3: What happens when a scope check fails

- 403 response with structured error envelope `{ success: false, error: "..." }`.
- The baseline test (see below) catches a missing guard before it ships — not just at runtime.

### H2: The approval-link pattern — safe write access for agents

- Most live-content write tools do **not** mutate immediately. Instead `lib/mcp/approvals.ts` mints an approval URL.
- Tool response includes `{ approvalUrl: "https://..." }` — the operation is pending.
- The human opens the URL in `app/approve/[token]/`, sees a WYSIWYG preview, and clicks to confirm.
- Metadata and draft operations mutate immediately — no approval needed.
- Why this matters: prevents agents from making unreviewed destructive edits to published content.

#### H3: Approval lifecycle

- Approval record created in DB with a page-scoped token.
- Management API at `/api/approve/`; public reviewer UI at `app/approve/`.
- Separate `approvals_*` MCP tools (list, get, approve, reject) for programmatic approval workflows.

### H2: The baseline test — a registry lock that catches drift

- `tests/unit/mcp-tool-registry-baseline.test.ts` builds the MCP server against a mocked DB (no live database needed).
- Asserts the **exact** set of registered tool names against hardcoded `EXPECTED_TOOLS` constants.
- Also asserts `EXPECTED_RESOURCES` and `EXPECTED_PROMPTS`.
- Critically: asserts that every tool has a `hasScope(...)` call — a missing guard fails the test.
- Runs in the unit layer (`bun test`) and as a pre-push CI gate.
- After adding, removing, or renaming a tool: reconcile the constants, then commit both changes together.

#### H3: Why a hardcoded constant list, not a count

- A count-only check allows renames and removals to cancel out undetected.
- Exact name match catches renames (which break existing integrations), unintentional deletions, and duplicate registrations.

### H2: Telemetry and token budgets

- `lib/mcp/telemetry.ts` — per-call latency and token cost recorded for every tool invocation. Not optional.
- `lib/mcp/projections.ts` — slim response projections by default. Write tools echo `{ id, slug, status }`, not the full row.
- Heavy fields (body, HTML, block JSON) behind an `include` opt-in flag.
- God files to avoid reading in full: `lib/brain/mcp-sdk-adapter.ts` (5,630 lines), `lib/mcp/tools/cms.ts` (2,216 lines), `lib/mcp/tools/crm.ts` (1,670 lines), `lib/mcp/tools/kanban.ts` (1,484 lines), `lib/mcp/approvals.ts` (1,193 lines).

### H2: What we'd do differently at tool 100

- Extract domain registrar files earlier — CMS tool file crossed 2,000 lines before being split.
- Enforce projection defaults via a shared wrapper, not per-tool conventions.
- Add MCP-specific rate limiting documentation before the first external integration partner.
- Known gap: no self-serve OAuth developer console yet (management API exists at `/api/portal/oauth-clients`).

---

## Key code / concepts to show

- `hasScope(ctx.scopes, 'brain:write')` — canonical guard call signature
- Tool registration skeleton: handler function + Zod `inputSchema` + scope guard + telemetry call
- Slim projection pattern: `{ id, slug, status }` on writes with `include` opt-in
- `approvalUrl` response shape from a write tool
- Baseline test `EXPECTED_TOOLS` constant snippet (structure only, not full 450-item list)

---

## Internal links

- `/docs/agents/tool-reference` — full tool catalogue
- `/docs/agents/api-index` — which API surface to use
- `/docs/agents/architecture-for-agents` — system overview
- Feature page: API + MCP integration (`vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md` — for internal linking to public feature pages once published)

---

## CTA

**Primary:** "Connect your AI agent to SimplerDevelopment — get an API key in the portal under Settings → API Keys."
**Secondary:** Link to `/docs/agents/tool-reference` for the full tool catalogue.

---

## Screenshot / GIF requirements

1. Screenshot: MCP tool call in Claude Desktop / Claude Code — `brain_search` returning structured results.
2. Screenshot: Approval-link flow — AI returns `approvalUrl`, human clicks to approve on the review page.
3. Diagram: Registry → scope guard → handler → approval-link or immediate mutation decision tree.
4. No fabricated benchmark screenshots.
