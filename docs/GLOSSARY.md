# Glossary

Platform terminology, alphabetical. Each term links to where it lives in the code so an agent (or a human) can go straight to the source.

**Admin panel** — The internal, global route tree at `app/admin/**`. Used by SimplerDevelopment staff for cross-tenant operations and system health; not visible to tenant clients.

**Agents service** — `simplerdevelopment-agents/`, a separate Mastra-based service with example agents (a Company Brain workflow, a portal AI assistant) that connect to the main app's MCP server as a client rather than re-implementing tools.

**API envelope** — The response shape every API route returns: `{ success: true, data: ... }` on success or `{ success: false, error: "..." }` on failure. Defined by convention and produced in lockstep by the `simplerdev-feature-scaffold` skill.

**Approval flow** — The CMS approval workflow for API keys with `require_cms_approval = true`. Covered write tools (posts, decks, proposals, email campaigns) stage changes into `mcp_pending_changes` instead of applying them; a staff user with `approvals:manage` scope approves or rejects via the `approvals_*` MCP tools. See `docs/mcp.md`.

**Automation** — A cross-product rule in the `automation_rules` table, built via NLP or a template, that fires on platform events (booking, survey, deal, task) and acts through the portal tool surface. Documented in `docs/guides/BRAIN.md`.

**Block** — A typed unit of page content stored as JSON inside a `posts.content` array. Blocks are universal — never client-specific. Schemas live in `lib/blocks/registry.ts`; render cases live under `app/sites/`.

**Block registry** — `lib/blocks/registry.ts`, the single source of truth mapping each block type to its TypeScript interface, editor controls, and metadata. Adding a block type touches the registry, a render component, a production renderer case, and `/api/blocks` metadata together — use the `simplerdev-block-type` skill.

**Block template** — A saved, reusable block configuration (`block_templates`) that content-authoring MCP tools (pages, decks) can compose from instead of building a block from scratch each time.

**Brain review item** — A row in `brain_ai_review_items`, the queue that holds AI-proposed output (tasks, decisions, commitments, relationship updates) from Company Brain until a human approves it. The AI never writes directly to `brain_tasks`, `brain_notes`, `crm_*`, or `kanban_cards` — see `lib/brain/review.ts`.

**Client / tenant** — A customer of the platform, identified by `clientId`. All tenant-scoped data (sites, posts, CRM records, brain content) is keyed to a `clientId`, and row-level queries must filter on it.

**Company Brain** — The per-tenant, structured AI knowledge layer over the CRM and project tooling: capture → AI proposes structured output → human approves → records get written. Implemented in `lib/ai/` and `lib/brain/`, gated per tenant by `lib/brain/entitlement.ts`. See `docs/guides/BRAIN.md`.

**MCP server** — The in-repo Model Context Protocol server at `app/api/mcp/route.ts` plus `lib/mcp/`, exposing 450+ scoped platform tools over the MCP Streamable HTTP transport to Claude, Cursor, or any MCP client.

**MCP tool scope** — A permission string (e.g. `crm:*`, `projects:read`, `*`) attached to an API key or OAuth token. Every MCP tool checks the caller's scope before running, enforced per-domain in `lib/mcp/`.

**Playbook** — A reusable, ordered sequence of steps for a recurring process (e.g. onboarding, deal stage transitions), managed via the `brain_playbooks_*` and `brain_playbook_runs_*` MCP tools. A playbook run tracks progress through its steps for a specific entity.

**Portal** — The per-tenant client route tree at `app/portal/**`: websites, CRM, brain, automations, billing, and settings for a single tenant's team.

**Post** — A single content record (`posts` table) whose `content` column holds the block JSON array rendered by the public site. Pages, blog entries, and other content types are all posts, differentiated by post type.

**Post type** — A configurable content schema (fields, template) applied to a post, managed via the `post_types_*` MCP tools and rendered per its own template.

**Site** — A single tenant website, identified by `siteId`. A client can own multiple sites; each site's public pages render under `app/sites/**` or `app/s/**`.

**Site resolver** — Middleware plus `lib/active-client.ts` that determines the active site/tenant for a request from routing context (never from the request body or query params), enforcing the tenancy boundary at the API layer.

**Tenancy gate** — Shorthand for `bun test:tenancy` (`scripts/test.sh --layer=integration --tag=tenancy`), the integration-test tag that checks for cross-tenant data leakage. Required after any change that touches data access.

**Visual editor** — The iframe-based block editor at `app/portal/websites/[siteId]/posts/[id]/edit`, using selection/resize overlays and a postMessage protocol between the host shell and the preview frame. See `components/portal/visual-editor/CLAUDE.md`.
