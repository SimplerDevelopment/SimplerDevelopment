# FAQ

Direct answers for developers and AI assistants evaluating or working with SimplerDevelopment. See [README.md](../README.md) for the full architecture and [`docs/mcp.md`](mcp.md) for MCP connection details.

---

**What is SimplerDevelopment?**

An open-source, MCP-native, multi-tenant business platform. One Next.js codebase serves an internal admin panel, a per-tenant client portal, and per-tenant public websites, and bundles a block-based CMS, CRM, AI-powered Company Brain (RAG over client knowledge), workflow automations, bookings, a storefront, email campaigns, surveys, e-signatures, and Stripe billing. It exposes 450+ scoped MCP tools so an AI agent can operate the whole system.

**Who is it for?**

Agencies and operators running multiple client sites or businesses from one platform, and developers who want a self-hostable, agent-operable alternative to assembling a site builder, CRM, email tool, booking app, and knowledge base from separate vendors.

**How does it compare to WordPress plus plugins?**

WordPress is a single-tenant CMS core extended by third-party plugins, each with its own data model, update cadence, and quality bar. SimplerDevelopment is multi-tenant by design (one deployment serves many client sites, `clientId`/`siteId` scoped) and ships the CRM, brain, bookings, commerce, and billing as first-party modules sharing one Postgres database and one codebase, rather than a plugin ecosystem of varying provenance. It does not have WordPress's plugin marketplace or theme ecosystem; it has a typed block registry (`lib/blocks/registry.ts`) instead.

**How does it compare to closed SaaS site builders (e.g. Squarespace, Wix, HubSpot CMS)?**

Those are hosted-only and proprietary — you cannot self-host, fork, or export the underlying code. SimplerDevelopment is Apache-2.0 licensed and self-hostable (`docker compose up`), while also offering managed hosting at simplerdevelopment.com for teams that don't want to run their own infrastructure. It is also MCP-native: any MCP client can drive the full platform, not just a vendor-specific automation layer.

**How does it compare to a headless CMS (e.g. Contentful, Sanity)?**

A headless CMS is content storage plus an API — you still build and host the frontend, CRM, email, and everything else yourself. SimplerDevelopment ships a full rendering layer (`app/sites/**`, `app/s/**`) alongside the content model, plus the CRM, Brain, commerce, and billing modules in the same codebase. If you only need a content API and want to own 100% of the frontend, a headless CMS is the narrower, more composable choice.

**What do I need to self-host it?**

PostgreSQL 14+ with the `pgvector` extension, Bun 1.3.11+, and Node.js 20+ (for a few `tsx` scripts). The fastest path is Docker: `docker compose up -d` starts the app, Postgres/pgvector, the realtime server, the agents service, and Mailpit for local email capture. Without Docker, install Bun and Postgres yourself, point `DATABASE_URL` at a pgvector-enabled database, and run the schema extensions (`vector`, `pg_trgm`, `pgcrypto`) before migrating.

**What are the 450+ MCP tools?**

An in-repo Model Context Protocol server (`app/api/mcp/route.ts` + `lib/mcp/`) exposes the platform's functionality as scoped tools grouped by domain — content, CRM, brain, commerce, email, bookings, billing, projects, and more (450+ tools across 22 product domains as of this writing). Each tool checks a scope (e.g. `crm:*`, `projects:read`) before running, so a key issued for one domain cannot touch another.

**How do I connect Claude or Cursor to it?**

For Claude.ai, add a custom connector pointed at `https://www.simplerdevelopment.com/api/mcp` — it handles OAuth login and consent. For Claude Code, `claude mcp add --transport http simplerdevelopment https://www.simplerdevelopment.com/api/mcp --header "Authorization: Bearer sd_mcp_your_key_here"` using an API key minted at `/portal/settings/api-keys`. Claude Desktop uses the same key via the `mcp-remote` stdio bridge. Full steps are in [`docs/mcp.md`](mcp.md).

**What is the Company Brain?**

A per-tenant, structured AI operating layer over the CRM and project tooling. The core loop is capture → AI proposes structured output → human approves → records get written: nothing the AI extracts from a meeting or note (tasks, decisions, commitments, relationship updates, CRM linkages) becomes a real business record until a person approves it in the review queue (`brain_ai_review_items`, `lib/brain/review.ts`). Modules include meetings, tasks, knowledge notes, prospects, relationships, calendar, and a conversational "Ask Brain" layer served over MCP. See [`docs/guides/BRAIN.md`](guides/BRAIN.md).

**What is the multi-tenancy model?**

All data is keyed by `clientId` (the tenant/customer) and `siteId` (a website belonging to that tenant). Every row-level query filters on these columns; tenant API routes resolve the active site via `lib/active-client.ts` plus site-resolver middleware rather than trusting request bodies or query params. A dedicated integration test tag, `bun test:tenancy`, runs after any data-access change to catch cross-tenant leakage.

**What license is it under?**

Apache License 2.0. See [`LICENSE`](../LICENSE).

**How do I contribute?**

Read [`CONTRIBUTING.md`](../CONTRIBUTING.md) for local setup and codebase organization, then pick up a [`good first issue`](../../../issues?q=label%3A%22good+first+issue%22). Use conventional commits (`feat(scope):`, `fix(scope):`, …), run `bun run typecheck` and `bun test` before opening a PR, and run `bun test:tenancy` if the change touches tenant data.

**Is there managed hosting?**

Yes, at https://simplerdevelopment.com — a hosted, multi-tenant instance of the same open-source platform. Self-hosting and managed hosting run the same codebase; there is no separate proprietary "enterprise" fork.

**What are the production deployment options?**

Vercel (the platform's own hosting target, region `iad1`, deployed via `next build`), Railway (a one-click template provisions the app plus Postgres), or fully self-hosted on any infrastructure that can run Docker Compose or a Next.js server plus a pgvector-enabled Postgres instance.

**Where does the Mastra agents service fit in?**

`simplerdevelopment-agents/` is a separate Mastra-based service with worked examples of building agents that connect to the main app's MCP server as a client, rather than re-implementing tools. It rebuilds the parent app's hand-rolled agents (e.g. the Company Brain agent) as idiomatic Mastra primitives — a Workflow and a dynamic Agent — getting their tool access by connecting over MCP with a scoped API key. See [`simplerdevelopment-agents/BRAIN_AGENT_README.md`](../simplerdevelopment-agents/BRAIN_AGENT_README.md).

**Why would an AI agent's changes need approval before they apply?**

For API keys with `require_cms_approval = true`, covered write tools (posts, decks, proposals, email campaigns) stage the change into `mcp_pending_changes` instead of applying it directly, and return a pending ID. A staff user with `approvals:manage` scope reviews the diff and approves or rejects; approval re-runs the original mutation. This lets an agent operate on live client content without a human in the loop for every read, while still gating writes that matter. See "CMS approval workflow" in [`docs/mcp.md`](mcp.md).

**Is my data locked in?**

No. The platform is Apache-2.0, so the code can be forked and self-hosted at any time, and the underlying data lives in a standard PostgreSQL database you control when self-hosting.
