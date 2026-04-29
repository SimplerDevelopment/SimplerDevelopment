# SimplerDevelopment 2026 — Agent Notes

Multi-tenant SaaS platform: admin + client portal + per-tenant client websites + CRM + Company Brain (AI/RAG) + automations + Google Workspace + Stripe billing. Note: the root `README.md` is stale — it describes an earlier marketing-site phase. Trust this file and the code.

**Stack:** Next 16.1.1 App Router, React 19, TypeScript 5, Tailwind 4, Drizzle ORM + Postgres, NextAuth v5 (beta), Bun. Lock file is `bun.lock` — always use `bun`, never `npm`.

## Run / build / test (non-guessable commands only)

- `bun dev` — dev server
- `bun run lint` — ESLint
- `tsc --noEmit` — typecheck (no script alias; run after any non-trivial Edit batch)
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
| Phase planning / execution | GSD skills (`/gsd-plan-phase`, `/gsd-execute-phase`). `.planning/` is the GSD source of truth |
| E2E test authoring | `/e2e-writer`. Running existing E2E: `/e2e-runner`. Visual QA: `/qa` |
| Visual diff (port verification) | `/visual-compare` |

## Don't-touch zones

- `drizzle/*.sql` — generated only; edit `lib/db/schema.ts`, then `bun run db:generate`
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/MILESTONES.md` — owned by GSD skills, do not hand-edit outside them
- `bun.lock` — package changes go through `bun add` / `bun remove`
- `worktree-agent-*` branches — created by isolated agents in other sessions; never delete from here
- Repo-root debug artifacts (`*.png`, `_tmp-*.cjs`, `editor-snapshot.md`, `audit-verify-*.png`, `edit-*.png`, `editor-*.png`) — stale; do not Read them, do not commit new ones (use `docs/screenshots/` if needed)

## Conventions

- **Conventional commits:** `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `ui(scope): ...`, `refactor(scope): ...`. Common scopes: `brain`, `crm`, `google-workspace`, `survey`, `blocks`, `editor`, `workers`, `build`.
- **Branches:** `feat/<topic>`, `fix/<topic>`, or `<NNN>-<topic>` for milestone work. PR target is `main` unless explicitly told otherwise.
- **Granularity:** one-block-per-commit during audits; one-feature-per-PR otherwise.
- **Material Icons over emojis** in any rendered UI.
- **Crosscap migrations:** auto-derive client email from domain as `{sitename}@simplerdevelopment.com`.

## Pointers (loaded on demand via `@`)

- @DATABASE.md — Drizzle setup + posts/categories/tags REST API
- @BLOCK_EDITOR_GUIDE.md — block JSON schema, examples, troubleshooting (load when working in `lib/blocks/`)
- @USER_MANAGEMENT.md — auth and roles
- @HOME_PAGE_FEATURES.md — public marketing surface
- @tests/TESTING_PLAN.md — what each test layer is responsible for

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
