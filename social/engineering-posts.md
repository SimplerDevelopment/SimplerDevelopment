# Engineering Story Post Ideas

> 6 grounded engineering story concepts, each tied to real architecture in the codebase.
> These are outlines — each becomes a full blog post, newsletter issue, or Hacker News comment thread.
> Source documents are listed per post so the author can verify facts before writing.

---

## 1. How we locked a 450-tool MCP server with a test

**Hook:**
Most MCP servers I've seen have 10–20 tools. Ours has 450 — one for every meaningful action across a multi-tenant SaaS platform. The tool count is enforced by a test. Here's why that matters and how it works.

**Key points:**

1. **The problem with optional tests:** Tool registration happens in domain-specific registrar functions (`registerCmsTools()`, `registerBrainTools()`, etc. in `lib/mcp/`). Without enforcement, a refactor that silently removes a tool breaks MCP clients in production with no CI signal.

2. **The baseline test:** `tests/unit/mcp-tool-registry-baseline.test.ts` calls the full tool registry under a wildcard scope and asserts the count equals exactly 450. The test runs on every pre-push hook. Adding a tool requires updating the baseline; removing one fails the build.

3. **The scope-guard pattern:** Every tool in every registrar calls `hasScope(ctx.scopes, 'domain:read')` before executing. A tool registered without a scope guard is a tenancy bug — the baseline test would pass but the tenancy gate (`bun test:tenancy`) would catch the leak. Both gates run.

4. **The approval-link pattern:** Live-content write tools — publish a page, send a campaign, delete a record — do not mutate immediately. The tool mints a tokenized URL at `/approve/[token]/` via `lib/mcp/approvals.ts`. Only when a human clicks that link does the write take effect. Draft and metadata operations mutate immediately.

5. **Tool families by size:** `brain_*` (156), `kanban_*` (39), `crm_*` (34), `store_*` (28), `email_*` (20), `post_types_*` (13), `decks_*` (13), and more. The largest namespace (Company Brain) has more tools than many entire MCP servers.

**Links to:**
- `lib/mcp/` (tool registrar pattern)
- `tests/unit/mcp-tool-registry-baseline.test.ts`
- `lib/mcp/approvals.ts`
- `docs/agents/ai-overview.md` (MCP surface overview)
- Feature page: `marketing/feature-pages/ai-agent-platform.md`

---

## 2. Multi-tenant isolation at the database layer (and how we verify it)

**Hook:**
In a multi-tenant SaaS, a missing WHERE clause leaks one client's data to another. We prevent this with a combination of row-level filtering conventions, an architectural boundary test, and a dedicated tenancy regression gate that runs on every data-access change.

**Key points:**

1. **The invariant:** Every tenant-scoped data row in the Drizzle schema carries a `clientId` foreign key (and in many cases a `siteId` as well). Any query that touches tenant data must filter on these columns. This is a code convention enforced by review — not a DB-level Row Security Policy, so the convention must be respected in every query author.

2. **The tenancy gate:** `tests/integration/` contains a `@tenancy`-tagged suite (`bun test:tenancy`). These integration tests provision two isolated tenants, create records under each, and verify that queries for Tenant A cannot return Tenant B's records. This gate runs automatically in CI after every PR that touches a `lib/db/` schema module or a data-access function.

3. **Site-resolver middleware:** Tenant identity is never derived from the request body or query params. The middleware in `lib/active-client.ts` plus site-resolver middleware resolves `clientId` from the session + host header. A route that bypasses this middleware to derive tenant identity from a user-supplied value is a tenancy bug.

4. **Drizzle schema modules:** Schema is split into per-domain modules under `lib/db/schema/` (not one god-file). Drizzle migration SQL in `drizzle/*.sql` is generated (`bun run db:generate`) — hand-editing it is prohibited.

5. **The architectural boundary test:** `.dependency-cruiser.cjs` enforces that route trees (`app/admin/`, `app/portal/`, `app/sites/`) do not cross-import each other — each audience's route tree is isolated.

**Links to:**
- `lib/db/CLAUDE.md` (tenancy invariants and footguns)
- `tests/CI-GATES.md` (gate definitions and coverage floors)
- `lib/active-client.ts`
- `tests/integration/` (tenancy suite)

---

## 3. Building a RAG knowledge base with 156 MCP tools

**Hook:**
Company Brain is a per-tenant AI knowledge base with notes, decisions, versioned documents, playbooks, goals, and org chart. It exposes 156 MCP tools under the `brain_*` namespace. Building a RAG system at this scale inside a multi-tenant SaaS surfaces problems that a single-tenant RAG demo never hits.

**Key points:**

1. **Data model breadth:** Brain stores 13 distinct content types: notes, decisions, documents (with version history and required-read acknowledgments), tasks, meetings, people, goals, initiatives, playbooks (with per-step run history), a glossary, a topic tree, an org chart, and relationship graphs. Each is a separate schema module. The MCP surface covers CRUD + semantic search on all of them.

2. **Embedding pipeline (async, can lag):** When a note is created, its text is queued for embedding via OpenAI (`text-embedding-3-small`). Embeddings land in Postgres via the `pgvector` extension. The pipeline is async — there is an acknowledged lag between note creation and semantic search availability. This is documented as known behavior, not a bug.

3. **The agent loop:** A Brain agent classifies intent (question vs. task vs. knowledge-add), builds a retrieval plan, executes pgvector similarity search, plans a response, and runs a groundedness check before returning an answer. The loop lives in `lib/ai/` and `lib/brain/`.

4. **Inbound email integration:** A Cloudflare Email Worker routes inbound email to the Brain review queue. A human triages from the Brain portal before the content is ingested. This is the "approval-link" concept applied to knowledge ingestion — not all content that arrives should be trusted without human review.

5. **Multi-tenant isolation in RAG:** Every embedding query filters by `clientId`. A semantic search for Tenant A cannot surface documents owned by Tenant B, even if their vector representations are close. This is enforced at the SQL level in every retrieval query, not in application logic on top of the results.

6. **156 tools, not a god object:** The Brain MCP adapter in `lib/brain/mcp-sdk-adapter.ts` is explicitly flagged as a god file (5630 lines) in the codebase notes. The lesson: when one namespace has 156 tools and 13 content types, the adapter file will grow large. The mitigation is aggressive per-tool token budgets and domain registration functions, not refactoring the adapter into 156 files.

**Links to:**
- `lib/brain/mcp-sdk-adapter.ts` (flagged as god file — do not read inline)
- `lib/ai/CLAUDE.md` (RAG patterns, 70% coverage floor)
- `docs/guides/BRAIN.md`
- Feature page: `marketing/feature-pages/company-brain.md`

---

## 4. The visual block editor: iframe preview + postMessage + Yjs CRDT

**Hook:**
The block editor in SimplerDevelopment is not a custom renderer. It loads your actual production site renderer in a sandboxed iframe and applies selection/resize overlays on top of it. Two editors can work on the same page simultaneously. Here's how the architecture works and what tradeoffs we made.

**Key points:**

1. **Why an iframe:** The simplest way to guarantee what you're editing matches what your visitors see is to embed the actual renderer. The visual editor at `app/portal/websites/[siteId]/posts/[postId]/edit/` loads the public-site renderer (`app/sites/`) in a sandboxed iframe alongside the editing chrome. There is no separate "preview mode" — the edit mode is the preview.

2. **The postMessage protocol:** The host shell (portal, owns block state) and the iframe (renderer, displays content) communicate via a typed postMessage protocol. The host sends block updates; the iframe renders them. Selection state, resize handles, and inline edits flow back through the same channel. This protocol is the load-bearing interface — see `components/portal/visual-editor/CLAUDE.md` for the full message type definitions.

3. **Yjs CRDT for real-time collaboration:** Multiple editors on the same page are synchronized via Yjs, running on a standalone `y-websocket` server (the `packages/realtime-server/` workspace package, deployed as a separate Railway service). Presence indicators show each editor's cursor position. Undo/redo stacks are per-session.

4. **Block state is typed JSON:** Content is stored as `{ blocks: Block[], version: '1.0' }` in `posts.content`. Block schemas are registered in `lib/blocks/registry.ts`. The editor never manipulates the DB schema — it only reads and writes this JSON column. 47 block types are built in; new types are scaffolded by the `simplerdev-block-type` skill (5 lockstep files move together).

5. **Contextual AI restyle:** An AI restyle feature is available within the editor for copy and layout suggestions grounded in the currently focused block. It uses the `blocks://schema` MCP resource (exposed by the MCP server) to understand the available fields for the active block type.

**Links to:**
- `components/portal/visual-editor/CLAUDE.md`
- `packages/realtime-server/`
- `lib/blocks/registry.ts`
- `docs/guides/BLOCK_EDITOR_GUIDE.md`
- Feature page: `marketing/feature-pages/websites-cms-visual-editor.md`

---

## 5. Event-driven automations with a durable Postgres queue

**Hook:**
SimplerDevelopment ships two automation engines: event-driven rules (trigger → conditions → actions) and a durable workflow queue. Both run inside the same Next.js deployment. No separate BullMQ instance, no Redis queue for the automation engine. Here's how Postgres as a job queue holds up at agency scale — and where it doesn't.

**Key points:**

1. **Two engines, two use cases:** Automation Rules are for single-step, event-triggered actions: "when a form is submitted, create a CRM contact and send an email." They're created in natural language, stored as JSON rule definitions, and evaluated on each matching event. The durable queue is for multi-step workflows: a ReactFlow node canvas where each node is a step with retry logic and a dead-letter path.

2. **Postgres as a queue:** The durable queue drainer polls a `workflow_run_steps` table using Postgres's `SELECT ... FOR UPDATE SKIP LOCKED` (the canonical "queue table" pattern). This avoids introducing a separate queue dependency. The trade-off: the drainer is single-threaded — one batch per minute — and does not scale horizontally without a more sophisticated leader-election scheme.

3. **Exponential-backoff retries:** Failed steps are retried with exponential backoff up to a configurable max. Steps that exhaust retries move to dead-letter status. A Retry button in the run-history UI re-enqueues the step. The run history drill-down shows per-step status, timestamps, and failure reasons.

4. **NLP rule creation:** The automation rules UI includes a natural-language bar where you describe a rule ("when a deal moves to Closed Won, send the contact a congratulations email") and the platform generates the rule definition. This uses the same Portal AI assistant surface (`lib/ai/portal-tools/`) that handles cross-domain actions in the AI chat interface.

5. **Known gap — scheduled campaign dispatcher:** Scheduled email campaigns (`status=scheduled`) have no automated dispatcher cron as of this release. Campaigns must be manually triggered. This is documented as a known gap.

**Links to:**
- `app/portal/automations/`
- `lib/publishing/` (durable queue drainer)
- Feature page: `marketing/feature-pages/automations-workflows.md`
- `vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md` (domain 14 — flags)

---

## 6. OAuth 2.1 as the MCP authentication layer

**Hook:**
Running an MCP server inside a multi-tenant SaaS means you need a real authorization layer — not just API keys. We built an OAuth 2.1 authorization server into the platform so AI clients can connect with user consent, get scoped tokens, and be revoked like any other OAuth client. Here's the implementation and what the RFC compliance actually requires.

**Key points:**

1. **Two credential types:** The MCP endpoint accepts two auth mechanisms: `sd_mcp_` portal API keys (stored SHA-256 hashed in `portal_api_keys`) and `sd_oauth_` Bearer tokens issued by the platform's own OAuth 2.1 server (`lib/oauth/server.ts`). API keys are simpler for direct integrations; OAuth tokens are required for user-consent flows (e.g. connecting Claude.ai to a client's portal with their explicit approval).

2. **RFC 7636 (PKCE):** The authorization code flow requires PKCE. This prevents authorization code interception attacks — important when the "client" is an AI agent running on a user's behalf. The `code_challenge` and `code_challenge_method=S256` parameters are validated on every token exchange.

3. **RFC 8707 (resource indicators):** Tokens are bound to the specific resource server (`audience` claim). A token issued for `https://example.com/api/mcp` cannot be used to call a different MCP endpoint. This is the audience binding in OAuth 2.1 terms.

4. **~50 named scopes:** Scopes follow a `<domain>:<access>` pattern: `brain:read`, `crm:write`, `email:send`, `approvals:manage`, etc. Every MCP tool has a `hasScope()` guard at the top. Tokens with narrow scopes cannot call tools outside their authorized domains. A `*` wildcard grants all tools — only issued to trusted admin integrations.

5. **Dynamic client registration:** The OAuth server supports dynamic client registration, so MCP clients (like Claude.ai) can register without a manual step from the admin. Client records are managed in `portal_oauth_clients` and visible in the admin panel.

6. **Gap:** There is no self-serve developer console. Developers who want to register an OAuth client today must do so through the portal admin panel or directly via the API. A public developer console is on the roadmap.

**Links to:**
- `lib/oauth/server.ts`
- `lib/oauth/scopes.ts`
- `app/oauth/authorize/`
- `docs/agents/ai-overview.md` (auth section)
- `vault/05 - Feature Specs/FEATURE-INVENTORY-api-mcp.md` (Section 3 — Auth)
