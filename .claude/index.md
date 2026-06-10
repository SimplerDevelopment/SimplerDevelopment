# Agent Navigation Index

Pointers from "I need to work on X" → the right CLAUDE.md / guide / skill. Loaded into every session via `@.claude/index.md` from the root `CLAUDE.md`. Keep it scannable: one line per area, no narrative.

## By area

- **Portal pages / tenant UI** → `app/portal/CLAUDE.md` + `@docs/guides/USER_MANAGEMENT.md`
- **Admin panel** → `app/admin/**` (no nested file yet; treat as portal-style for now)
- **Per-tenant public sites** → `app/sites/**`, `app/s/**`
- **Block registry / schemas** → `lib/blocks/CLAUDE.md` + `@docs/guides/BLOCK_EDITOR_GUIDE.md`
- **Visual editor (block-based page builder)** → `components/portal/visual-editor/CLAUDE.md` + `simplerdev-visual-editor` skill
- **Drizzle schema / migrations** → `lib/db/CLAUDE.md` + `@docs/guides/DATABASE.md`
- **MCP server / tools** → `lib/mcp/CLAUDE.md` + `simplerdev-mcp-tool` skill
- **Tests / coverage / gates** → `tests/CLAUDE.md` + `@tests/TESTING_PLAN.md` + `@tests/CI-GATES.md`
- **Auth / roles / scopes** → `@docs/guides/USER_MANAGEMENT.md`
- **Site resolver / tenancy middleware** → `lib/active-client.ts`, `middleware.ts`

## By task

- **New CRUD resource** → `simplerdev-feature-scaffold` skill
- **New portal page (no API)** → `simplerdev-ui-scaffold` skill
- **New block type** → `simplerdev-block-type` skill (visual exploration first: `huashu-design`)
- **New MCP tool** → `simplerdev-mcp-tool` skill
- **Slim down an MCP tool response** → `simplerdev-mcp-token-budget` skill
- **New client site from a URL** → `site-migration` skill
- **Block editor audit** → `block-orchestrator` (drive) + `block-implementer` (atomic units)
- **Write E2E tests** → `/e2e-writer`
- **Run E2E tests** → `/e2e-runner`
- **Visual QA / interactive review** → `/qa`
- **Visual diff (port verification)** → `/visual-compare`

## By question

- **"Where is X defined?"** → `Explore` subagent (or `graphify` if `graphify-out/` is fresh)
- **"How does this feature work end-to-end?"** → spawn a subagent with the question; do NOT read 10 files into the main thread
- **"What's the convention for Y?"** → check the nearest `CLAUDE.md` first, then this index, then ask the user

## Session state / memory

- `@.claude/learnings.md` — running retro of mistakes/patterns from autonomous runs (read at session start when unattended)
- `@.claude/HANDS_OFF_DEV_PLAN.md` — plan + state for the "code while I sleep" workflow
- `~/.claude/projects/-Users-dancoyle-simplerdevelopment/memory/MEMORY.md` — cross-conversation memory (auto-loaded)

## Don't-touch zones (recap)

- `drizzle/*.sql` — generated only
- `bun.lock` — package changes via `bun add` / `bun remove`
- `worktree-agent-*` branches — created by isolated agent sessions
- Repo-root debug artifacts (PNGs, `_tmp-*.cjs`, `editor-snapshot.md`, `audit-verify-*`, `edit-*`, `editor-*`) — stale; gitignored; do not Read
