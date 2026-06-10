# SimplerDevelopment 2026 — Agent Notes

Multi-tenant SaaS platform: admin + client portal + per-tenant client websites + CRM + Company Brain (AI/RAG) + automations + Google Workspace + Stripe billing. `README.md` is the human developer-onboarding doc; this file is the agent operating guide.

**Stack:** Next 16.1.1 App Router, React 19, TypeScript 5, Tailwind 4, Drizzle ORM + Postgres, NextAuth v5 (beta), Bun. Lock file is `bun.lock` — always use `bun`, never `npm`.

## Agent operating rules (read first)

This is a ~357k-line monorepo (app 157k / lib 81k / components 119k LOC). Context discipline is load-bearing:

- **Start with the index, not with grep.** `@.claude/index.md` maps "I need to work on X" → the right nested `CLAUDE.md` / skill / guide. Nested `CLAUDE.md` files live in `app/portal/`, `lib/blocks/`, `lib/mcp/`, `lib/db/`, `components/portal/visual-editor/`, `tests/` — read the nearest one before opening files in that dir.
- **Before reading a file >500 lines, spawn a subagent.** Use `Explore` for "where is X / how does Y work"; use `block-implementer`-style atomic workers for changes. The main thread should not hold 2000-line god files. See god-file lists inside each nested `CLAUDE.md`.
- **For broad cross-cutting questions ("how does the auth flow work end-to-end"), prefer `graphify-out/` over grep** when it exists and is recent. Otherwise spawn an `Explore` subagent.
- **Don't read documentation speculatively.** Pointers at the bottom of this file are read-on-demand; only follow when the task touches that area.
- **Escalation contract (worker → boss):** If a task turns out to need a design/architecture decision, hits an unknown root cause, requires touching files outside your assigned scope, would break a test you can't cleanly fix, or is otherwise beyond a straightforward mechanical change — **stop**. Return a message starting with `ESCALATE:` covering: (1) what you completed, (2) exactly where you got stuck, (3) why it exceeds a worker task, (4) what the boss needs (file/line, error, decision required), (5) recommended next step. Revert any half-done risky edits before returning.

## Where knowledge lives (route notes here — three tools, three axes)

These three systems are **complementary, not redundant** — each owns a different axis. Route knowledge by *kind*, don't duplicate across them:

| Tool | Axis | Captured how | Use it to answer |
|---|---|---|---|
| **claude-mem** | Time / episodic | Auto, on commit/session-end (hooks) | "What did we *do / decide / discover* in past sessions?" |
| **graphify** (`graphify-out/`) | Structure / semantic | On-demand rebuild of code+docs *as they are now* | "How does *X work* end-to-end in the codebase?" |
| **Obsidian vault** (`vault/`) | Curation / durable | Manual + the `note` skill, authored on purpose | "What's the *canonical ADR / spec / research* worth keeping?" |

Routing rule:
- **Auto-history → claude-mem.** Don't curate it; query it (the `S###`/numeric IDs in the SessionStart hook, or the `mem-search` skill). It's a log, not a source of truth.
- **"How does the code work?" → graphify.** Prefer `graphify-out/` over grep for broad cross-cutting questions when it exists and is recent; keep its commit-hook rebuild healthy. It reflects the *present* code, not history.
- **"This deserves to be written down for the future" → Obsidian vault.** ADRs / specs / research only. **Do not hand-write per-session logs in the vault** — claude-mem already owns ephemeral session history; the vault is for distilled, durable artifacts that outlive any one session.

## Run / build / test (non-guessable commands only)

- `bun dev` — dev server
- `bun run lint` — ESLint
- `tsc --noEmit` — typecheck (alias: `bun run typecheck`; run after any non-trivial Edit batch)
- `scripts/test.sh --layer=unit --no-coverage` — Vitest unit (alias: `bun test`)
- `scripts/test.sh --layer=integration --no-coverage` — needs DB; locally use `bun test:integration:local` (spins one up)
- `scripts/test.sh --layer=e2e --no-coverage` — Playwright
- `scripts/test.sh --layer=e2e --tag=@critical --no-coverage` — golden-path subset; **use this as the QA gate before declaring work done** (alias: `bun test:critical`)
- `scripts/test.sh --layer=integration --tag=tenancy --no-coverage` — multi-tenant leak regression; run after any data-access change (alias: `bun test:tenancy`)
- `bun run db:generate` — generate Drizzle migration; **never hand-edit `drizzle/*.sql`**
- `bun run db:migrate` — apply migrations (auto-runs `db:verify-target` to refuse prod URLs)

## Architecture invariants (load-bearing — break at your peril)

- **Three audiences, three route trees:**
  - `app/admin/**` — global, our internal panel
  - `app/portal/**` — per-tenant client UI
  - `app/sites/**` and `app/s/**` — per-tenant public-facing
- **API route pattern:** NextAuth + site-resolver + `{ success, data | error }` envelope. Tenant routes resolve the active site via `lib/active-client.ts` + site-resolver middleware. The `simplerdev-feature-scaffold` skill produces this lockstep — use it, do not hand-roll.
- **Blocks are universal, never client-specific.** A block is JSON in `posts.content`, schemas in `lib/blocks/registry.ts`, render cases in `app/sites/...`. Use `simplerdev-block-type` to scaffold (TS interface, render component, registry entry, production renderer case, and `/api/blocks` metadata move together).
- **Visual editor:** lives at `app/portal/websites/[siteId]/posts/[id]/edit`. iframe preview + selection/resize overlays + postMessage protocol. See `simplerdev-visual-editor` skill before touching it.
- **Tenancy:** data is keyed by `clientId` / `siteId`. Run `bun test:tenancy` after any data-access change.

## Workflows that already exist — prefer them over hand-rolling

| Task | Use |
|---|---|
| New CRUD resource | `simplerdev-feature-scaffold` (schema + route + e2e), then `simplerdev-ui-scaffold` for pages |
| New block type | `simplerdev-block-type`. For visual exploration first, `huashu-design` (see below) |
| New MCP tool | `simplerdev-mcp-tool` (handler + schema + scope guard registered in lockstep) |
| New client site from a URL | `site-migration` |
| Block-editor audit | `block-orchestrator` to drive, `block-implementer` for one-off fixes |
| Slim down an MCP tool response | `simplerdev-mcp-token-budget` |
| Autonomous dev loop (hands-off) | `dev-block` skill |
| E2E test authoring | `/e2e-writer`. Running existing E2E: `/e2e-runner`. Visual QA: `/qa` |
| Visual diff (port verification) | `/visual-compare` |

## Don't-touch zones

- `drizzle/*.sql` — generated only; edit `lib/db/schema/` (per-domain modules), then `bun run db:generate`
- `bun.lock` — package changes go through `bun add` / `bun remove`
- `worktree-agent-*` branches — created by isolated agents in other sessions; never delete from here
- Repo-root debug artifacts (`*.png`, `_tmp-*.cjs`, `editor-snapshot.md`, `audit-verify-*.png`, `edit-*.png`, `editor-*.png`) — stale; do not Read them, do not commit new ones (use `docs/screenshots/` if needed)

## Conventions

- **Conventional commits:** `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `ui(scope): ...`, `refactor(scope): ...`. Common scopes: `brain`, `crm`, `google-workspace`, `survey`, `blocks`, `editor`, `workers`, `build`.
- **Branches:** `feat/<topic>`, `fix/<topic>`, or `<NNN>-<topic>` for milestone work. PR target is `main` unless explicitly told otherwise.
- **Granularity:** one-block-per-commit during audits; one-feature-per-PR otherwise.
- **Material Icons over emojis** in any rendered UI.
- **Crosscap migrations:** auto-derive client email from domain as `{sitename}@simplerdevelopment.com`.

## Pointers (read on demand — `@`-mention to import)

These are reference docs. Don't read them speculatively; only when the task touches the area.

- `.claude/index.md` — **agent navigation: by-area / by-task / by-question → the right nested CLAUDE.md / skill / guide**
- `docs/guides/DATABASE.md` — Drizzle setup + posts/categories/tags REST API
- `docs/guides/BLOCK_EDITOR_GUIDE.md` — block JSON schema, examples, troubleshooting (read when working in `lib/blocks/`)
- `docs/guides/USER_MANAGEMENT.md` — auth and roles
- `tests/TESTING_PLAN.md` — what each test layer is responsible for
- `tests/CI-GATES.md` — coverage floors (60% project-wide / 70% on lib/billing,ai,agency,esign,chat / 90% on lib/crypto), tenancy + critical-e2e gates, local override flags, required-status-check setup
- `docs/skills/` — SD-* skills reference (overview, authoring, developer, edit-skills proposal)
- `.claude/learnings.md` — running retro of mistakes/patterns from autonomous (dev-block) runs; read at session start when running unattended

### Nested CLAUDE.md files

Each holds invariants + pointers for one area. Loaded automatically by Claude Code when working in that subtree.

- `app/portal/CLAUDE.md` — tenant routing, site-resolver, API envelope, god-file warnings
- `app/admin/CLAUDE.md` — global admin panel patterns, internal-only routes, super-admin guards
- `lib/blocks/CLAUDE.md` — block registry + the "blocks are universal" invariant
- `lib/mcp/CLAUDE.md` — tool registrar pattern, scope guards, token-budget rules, registry baseline test
- `lib/db/CLAUDE.md` — Drizzle migration workflow, tenancy invariants, footguns
- `lib/ai/CLAUDE.md` — Company Brain / embeddings / RAG patterns; 70%-coverage-floor domain
- `components/portal/visual-editor/CLAUDE.md` — postMessage protocol, god-file warnings
- `tests/CLAUDE.md` — layer responsibilities, gate commands, layer-picking rule

## Vendored skills

### `huashu-design` (`.agents/skills/huashu-design/`)

Third-party design skill (alchaincyf/huashu-design) for producing hi-fi single-file HTML — interactive prototypes, slide decks, motion design, infographics, design-direction explorations. **Agent-facing** (used by Claude Code / Cursor / etc. during authoring); **not** a runtime library and **not** invokable by portal end users.

When to invoke (developer workflow only):

- Scaffolding a brand-new block type — generate 2–3 hi-fi HTML mockups with different design philosophies before committing. Pairs with `simplerdev-block-type` (huashu produces the visual; the block skill produces the boilerplate).
- Onboarding a new client site — produce a hi-fi landing mockup from brand assets before block-by-block translation. Pairs with `site-migration`.
- "Design feels generic / AI slop" feedback — run huashu's 5-dimension expert review (`c6-expert-review*.html`) for a punch list.
- Vague brief — invoke its design-direction advisor for 3 differentiated options drawn from its 20-philosophy library.

**Hard rule:** huashu output is inspiration, not paste-able into the CMS. It produces freeform HTML/CSS/JS files. Translation to typed block JSON (`lib/blocks/registry.ts`) is always manual — never lift huashu HTML into a block via copy-paste.

Local install (per-machine, not committed):

```bash
ln -s "$(pwd)/.agents/skills/huashu-design" ~/.claude/skills/huashu-design
```
