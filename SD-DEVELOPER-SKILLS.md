# SimplerDevelopment Developer Skills

Skills an agent uses to modify the simplerdevelopment2026 codebase itself: scaffold features, scaffold UI, add block types, add MCP tools, migrate external sites, port external features, debug the visual editor, and run autonomous dev loops.

The companion doc for content authoring (CMS pages, decks, emails, surveys, booking pages, HTML embeds) is `SD-AUTHORING-SKILLS.md`.

---

## Topology

```
                    ┌─────────────────────────────────────────┐
                    │       IN-REPO DEVELOPER SKILLS          │
                    │                                         │
                    │   simplerdev-feature-scaffold ◄────┐    │
                    │   simplerdev-ui-scaffold ──────────┘    │
                    │                                         │
                    │   simplerdev-block-type                 │
                    │                                         │
                    │   simplerdev-mcp-tool ◄──────────┐      │
                    │   simplerdev-mcp-token-budget ───┘      │
                    │                                         │
                    │   simplerdev-visual-editor              │
                    │                                         │
                    │   site-migration                        │
                    │   feature-integrator                    │
                    │                                         │
                    │   dev-block  (autonomous n8n loop)      │
                    └─────────────────────────────────────────┘
```

All of these write code into `simplerdevelopment2026/`. They preserve the architectural invariants documented in `CLAUDE.md`: NextAuth + site-resolver + `{ success, data | error }` envelope, multi-tenant by `clientId`/`siteId`, blocks-are-universal, three audiences in three route trees.

---

## `simplerdev-feature-scaffold` — new CRUD resource

**Purpose.** Scaffolds a portal-scoped or admin-global CRUD feature in lockstep:
- Drizzle schema additions in `lib/db/schema/`
- REST API routes following the **canonical envelope** (`{ success, data | error }`, NextAuth, site-resolver middleware for tenant routes)
- E2E helpers
- A Playwright spec matching repo conventions

**Trigger phrases.** `scaffold <resource>`, `new CRUD for X`, `add a feature for X`.

**Why use over hand-rolling.** The route pattern (NextAuth + site-resolver + envelope) is load-bearing — `CLAUDE.md` flags it as an architectural invariant. Skill enforces it.

**Pairs with.** `simplerdev-ui-scaffold` for the UI layer.

---

## `simplerdev-ui-scaffold` — admin / portal pages for a CRUD resource

**Purpose.** Creates `page.tsx` files with inline create/edit forms, data tables, and loading states for an **existing** CRUD resource. Follows the repo's conventions (server components + form actions + revalidation).

**Trigger phrases.** `scaffold UI for X`, `add admin page for X`, `add portal page for X`, `wire up UI for X`.

**Typical sequence.** `simplerdev-feature-scaffold` → `simplerdev-ui-scaffold`.

---

## `simplerdev-block-type` — new block type

**Purpose.** Adds a new block to the visual editor, keeping all five touchpoints in sync:
1. TypeScript interface in `lib/blocks/types/`
2. Render component in `components/blocks/render/`
3. Registry entry in `lib/blocks/registry.ts` (schema + defaults)
4. Production renderer case in `app/sites/...` (or the active rendering tree)
5. `/api/blocks` metadata entry

**Trigger phrases.** `new block`, `add block type`, `scaffold block`, `create <X> block`, `add a block for <X>`.

**Constraint.** All blocks are multi-tenant and universal — never client-specific.

**Visual exploration first.** Pair with `huashu-design` (in `.agents/skills/huashu-design/`) to produce 2–3 hi-fi HTML mockups in different design philosophies before committing. Huashu output is inspiration only — translation to typed block JSON is always manual; never copy-paste huashu HTML into a block.

---

## `simplerdev-mcp-tool` — new MCP tool

**Purpose.** Adds a new MCP tool to the in-repo SimplerDevelopment portal MCP server. Registers the handler, input schema (Zod), and scope guard in `lib/mcp/server.ts`. Optionally creates an adapter file at `lib/<feature>/mcp-*.ts` for larger feature sets.

**Trigger phrases.** `add MCP tool for X`, `expose X via MCP`, `new MCP tool`, `wire X into the MCP server`.

**Output.** A new tool that AI clients (Claude Code, Claude Desktop, etc.) can invoke against the portal.

**Pairs with.** `simplerdev-mcp-token-budget` (run after, especially if the tool's response shape includes large text/JSON columns).

---

## `simplerdev-mcp-token-budget` — payload economy audit

**Purpose.** Audits and refactors MCP tools in `lib/mcp/server.ts` (and `lib/<feature>/mcp-*.ts` adapters) to keep response payloads small. Applies:
- **Slim-by-default projections** — list/read returns drop large columns by default
- **Opt-in `include` flags** — callers explicitly request body/HTML/blocks blobs
- **Compact write-echoes** — create/update return only the id + the changed-fields delta

**Trigger phrases.** `reduce MCP tokens`, `audit MCP payloads`, `mcp response too big`, `trim mcp echo`, `why is the MCP so expensive`.

**Auto-pair.** Run after adding any MCP tool that touches a large text/JSON column. Proactively after `simplerdev-mcp-tool` for high-volume endpoints.

---

## `simplerdev-visual-editor` — audit / debug the CMS visual editor

**Purpose.** Research, audit, debug, and improve the block-based page builder for client websites. Covers:
- The iframe preview
- Selection / resize overlays
- Drag-and-drop
- The style sidebar
- The block registry
- The `postMessage` protocol between iframe and shell
- The rendering pipeline

**Trigger phrases.** `improve the editor`, `fix editor bug`, `audit the visual editor`, `editor feels slow/broken`, `add feature to block editor`, `selection/drag/style/layers panel`.

**Scope.** `app/portal/websites/[siteId]/posts/[id]/edit` and its supporting `components/` / `lib/` files.

---

## `site-migration` — import an external website

**Purpose.** Migrates an existing external site into the SimplerDevelopment platform. Handles the whole loop: discovery (crawl), content extraction, block-by-block translation, asset mirroring, brand inference, and draft-post creation in the portal.

**Trigger phrases.** `migrate site`, `import website`, `bring over their site`, `rebuild this site`, `clone this website`, `onboard a new client site`, `move site to our platform`, `new client site from [url]`, `pull content from [domain]`.

**Convention.** Auto-derives client email from domain as `{sitename}@simplerdevelopment.com` (per `CLAUDE.md`).

**Pairs with.** `huashu-design` for visual exploration on the landing page before block-by-block translation.

---

## `feature-integrator` — port features from an external codebase

**Purpose.** Analyzes external application source code, compares it against simplerdevelopment2026, identifies feature gaps, and integrates missing capabilities into the platform.

**Trigger phrases.** `find gaps between`, `integrate features from`, `port this to SimplerDevelopment`, `compare and implement`, `what features are missing`, `bring over from`, `adopt features from`, `merge capabilities from`.

**Typical input.** A path to external source (e.g. a booking-app, chat system, or component directory) alongside a request to implement or integrate it.

---

## `dev-block` — autonomous n8n-driven dev iteration

**Purpose.** One iteration of the autonomous development workflow driven by an n8n loop. Picks a task from `.planning/STATE.md` or open GitHub issues, implements it, runs the gates, commits, and returns structured JSON the n8n loop can route on.

**Trigger.** Invoked by the simplerdevelopment2026 dev-block n8n workflow, or by the user saying `dev block` / `start dev session` / `autonomous development` inside the repo.

**Do NOT use for.** Manual coding sessions, one-off tasks, debugging.

**Definition.** Lives at `.claude/skills/dev-block/SKILL.md`.

---

## Cross-cutting developer conventions

### Architectural invariants are load-bearing
Every scaffold preserves these (per `CLAUDE.md`):
- **Three audiences, three route trees.** `app/admin/**` (global), `app/portal/**` (per-tenant client UI), `app/sites/**` & `app/s/**` (per-tenant public).
- **API route pattern.** NextAuth + site-resolver + `{ success, data | error }` envelope. Tenant routes resolve the active site via `lib/active-client.ts` + site-resolver middleware.
- **Blocks are universal.** JSON in `posts.content`, schemas in `lib/blocks/registry.ts`, render cases in `app/sites/...`. Never client-specific.
- **Tenancy is per-`clientId` / `siteId`.** Run `bun test:tenancy` after any data-access change.

### Material Icons over emojis
Per `CLAUDE.md` and repo memory (`feedback_no_emojis.md`). Every developer skill that authors UI uses Material Icons.

### Drizzle migrations are generated, not hand-edited
- Edit `lib/db/schema.ts` then `bun run db:generate`
- Never edit `drizzle/*.sql` directly
- Note: per memory (`project_sd2026_drizzle_tracker_drift.md`), the tracker is out of sync in prod; some schema changes are hand-applied SQL. Confirm with the user before adding new migrations.

### Shared staging-prod database
Per memory (`project_sd2026_shared_railway_db.md`), sd2026 Vercel Preview (staging) and Production share one Railway Postgres — **staging schema changes hit production data**. Treat any column addition as a production-affecting action.

### Branching and commit conventions
- `feat/<topic>`, `fix/<topic>`, `chore/<scope>`, or `<NNN>-<topic>` for milestone work
- Conventional commits: `feat(scope): ...`, `fix(scope): ...`, etc. Common scopes: `brain`, `crm`, `google-workspace`, `survey`, `blocks`, `editor`, `workers`, `build`.
- PR target is `staging` (per memory `feedback_no_push_to_main.md`); never push to main
- One-feature-per-PR; one-block-per-commit during audits

### Bun, not npm
- Lockfile is `bun.lock` — always use `bun` (`bun add`, `bun remove`, `bun install`, `bun dev`)
- `bun test` aliases unit tests; `bun test:critical` runs the golden-path E2E gate; `bun test:tenancy` runs the multi-tenant leak regression

### Don't-touch zones
- `drizzle/*.sql` (generated only)
- `bun.lock` (package changes via `bun add`/`bun remove`)
- `worktree-agent-*` branches (created by isolated agents in other sessions)
- Repo-root debug artifacts (`*.png`, `_tmp-*.cjs`, `editor-snapshot.md`, etc. — stale, don't read or commit)

---

## When to chain developer skills

| Goal | Sequence |
|---|---|
| New CRUD resource end to end | `simplerdev-feature-scaffold` → `simplerdev-ui-scaffold` → (optional) `simplerdev-mcp-tool` → `simplerdev-mcp-token-budget` |
| New block type, design-led | `huashu-design` (hi-fi HTML mockups) → translate manually → `simplerdev-block-type` (scaffold the typed shape) |
| New MCP tool with a heavy payload | `simplerdev-mcp-tool` → `simplerdev-mcp-token-budget` |
| Visual-editor regression | `simplerdev-visual-editor` (audit) → direct fix or `simplerdev-block-type` change |
| Port a competitor's feature | `feature-integrator` (gap report) → `simplerdev-feature-scaffold` + `simplerdev-ui-scaffold` |
| Onboard a new client site from a URL | `site-migration` → switches over to the authoring stack for refinements |
| Autonomous, single-iteration progress | `dev-block` (invoked by the n8n loop) |

---

## What developer skills are NOT

- **Not a substitute for code review.** Scaffolds produce conventional shapes; the work still gets reviewed before merge.
- **Not approval-bypassing for content.** They modify code, not portal content; nothing they do publishes to clients.
- **Not safe to run without `.env`.** Most touch the DB or MCP server; missing env vars produce confusing failures.
- **Not block-specific design tools.** `huashu-design` is the design exploration skill; developer skills translate confirmed shapes into typed code.
