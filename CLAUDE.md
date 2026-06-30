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

## Prompt intake (complex requests — do this BEFORE planning/coding)

When a prompt carries a **decent amount of instruction** OR asks for a **big / cross-cutting change** (multi-step, architectural, touches multiple domains or many files, or has ambiguous scope), do the following two things first — before any plan or edit:

1. **Revise the prompt against the *current* understanding of the project — and nothing else.** Restate the request back, grounded only in how this codebase *actually* works right now (real routes, schema, existing helpers/patterns, the invariants below, nested `CLAUDE.md` notes) — not training priors or assumptions about how a generic app "usually" works. Surface where the ask meets, conflicts with, or is already partly solved by what's in the repo. If you don't yet know the relevant code, read/Explore it first, then revise.
2. **Run the `/grill-me` skill automatically.** Invoke it (Skill tool, `skill: "grill-me"`) to interview me through the decision tree until we reach shared understanding, resolving each branch before you write code. Do not skip it for this class of prompt just because the path "seems obvious."

Only after the revised prompt is confirmed and grilling has resolved the open branches do you proceed to plan/implement.

**Skip this** for trivial or already-fully-specified work: small single-file edits, quick questions, mechanical fixes, or a task whose scope and approach are already unambiguous. When unsure whether a prompt qualifies, treat it as qualifying.

## Where knowledge lives (route notes here — three tools, three axes)

These three systems are **complementary, not redundant** — each owns a different axis. Route knowledge by *kind*, don't duplicate across them:

| Tool | Axis | Captured how | Use it to answer |
|---|---|---|---|
| **claude-mem** | Time / episodic | Auto, on commit/session-end (hooks) | "What did we *do / decide / discover* in past sessions?" |
| **graphify** (`graphify-out/`) | Structure / semantic | On-demand rebuild of code+docs *as they are now* | "How does *X work* end-to-end in the codebase?" |
| **Obsidian vault** (`vault/`) | Curation / durable | Manual + the `vault` skill / `vault-librarian` agent, authored on purpose | "What's the *canonical domain map / ADR / spec / playbook* worth keeping?" |

Routing rule:
- **Auto-history → claude-mem.** Don't curate it; query it (the `S###`/numeric IDs in the SessionStart hook, or the `mem-search` skill). It's a log, not a source of truth.
- **"How does the code work?" → graphify.** Prefer `graphify-out/` over grep for broad cross-cutting questions when it exists and is recent; keep its commit-hook rebuild healthy. It reflects the *present* code, not history.
- **"This deserves to be written down for the future" → Obsidian vault.** Domain maps / ADRs / specs / playbooks only. **Do not hand-write per-session logs in the vault** — claude-mem already owns ephemeral session history; the vault is for distilled, durable artifacts that outlive any one session.

**Vault first for feature work.** Before planning/implementing in a domain, read its map in `vault/03 - Domains/` (key files, schema, routes, MCP tools, tests, gotchas — cheaper than re-deriving from code). "Which gates do I run?" → `vault/06 - Validation/Gate Picking.md`. After shipping: **completion ritual** — update the touched Domain Map and ADR any non-obvious decision, following the existing vault frontmatter and map/table conventions. New planning artifacts go in `vault/05 - Feature Specs/`, never in `.planning/` (frozen archive). Architecture + Domain notes are drift-checked by `scripts/check-doc-drift.ts` — keep cited paths real.

**Project status lives on the Kanban board — always.** Plan projects and track status on the Obsidian Kanban board at `vault/05 - Feature Specs/Project Board.md` (lanes: Backlog → Planned → In Progress → Validating → Shipped). Starting a project/feature → add or move its card (linked to its spec note) into the right lane; finishing one → move it to Shipped. Keep card position and the spec's `status` frontmatter in sync. The board file is plain markdown (obsidian-kanban format: `## Lane` headings + `- [ ]` cards) — agents edit it directly.

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

## Deployment (host topology)

- **Hosting: Vercel (or any Next.js host).** Production branch = **`main`**; every other pushed branch deploys as a **Preview** automatically. Configure the deploy target in your own Vercel/host project.
- **Databases: Postgres** (Railway, Neon, Supabase, or self-hosted). Each environment hosts its own Postgres; wire the connection string into the host as a per-environment env var (`DATABASE_URL`). `lib/db/schema/` requires the `vector` (pgvector) extension on every DB.
- **`dev` branch = throwaway fast-iteration line.** Git hooks (`.githooks/pre-commit`, `pre-push`) self-skip on `dev`/`dev/*`, and `next.config.ts` relaxes the build (`ignoreBuildErrors`/`ignoreDuringBuilds` when `VERCEL_GIT_COMMIT_REF === 'dev'`) so a push deploys immediately regardless of type/lint errors. `dev` should point at its own isolated Postgres, schema applied via `drizzle-kit push`. `main`/`staging` keep strict hooks + strict builds.
- ⚠️ **Know which DB your `DATABASE_URL` points at before running any `psql`/migration.** A local `.env` pointing at a remote staging/production DB is *not* local — never hand-apply migrations against prod/staging outside the deploy process. Only an isolated dev DB is safe to push schema to ad-hoc.

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
| Plan a feature / consult or update project knowledge | `vault` skill (read `vault/03 - Domains/` map first), `vault-librarian` agent for upkeep |
| New CRUD resource | `simplerdev-feature-scaffold` (schema + route + e2e), then `simplerdev-ui-scaffold` for pages |
| New block type | `simplerdev-block-type`. For visual exploration first, `huashu-design` (see below) |
| New MCP tool | `simplerdev-mcp-tool` (handler + schema + scope guard registered in lockstep) |
| New client site from a URL | `site-migration` |
| Block-editor audit | `block-orchestrator` to drive, `block-implementer` for one-off fixes |
| Slim down an MCP tool response | `simplerdev-mcp-token-budget` |
| Autonomous dev loop (hands-off) | `dev-block` skill |
| E2E test authoring | `/e2e-writer`. Running existing E2E: `/e2e-runner`. Visual QA: `/qa` |
| Visual diff (port verification) | `/visual-compare` |

## Dynamic workflows — when to reach for the `Workflow` tool (multi-agent orchestration)

> **Terminology:** the table above lists **skills** (single-agent helpers). This section is about **dynamic workflows** — the `Workflow` tool that scripts *many* subagents (fan-out, pipelines, tournaments, loops) deterministically in one run. Different mechanism, different cost profile.

**Opt-in is mandatory — never autonomous.** The `Workflow` tool is gated: only fire it when the user explicitly opts in — types `ultracode`, says "use a workflow" / "fan out agents" / "orchestrate this with subagents", invokes a skill that instructs it, or asks for a named/saved workflow. For everything else — *even a task that would clearly benefit* — describe the workflow and its rough token cost and **ask first**. A workflow can spawn dozens of agents; that scale must be the user's choice, not your inference.

**Workflow vs. the cheaper tools you already have** (don't burn a swarm on small work — the video's own rule: *don't spin up an agent team to change a button color*):
- One well-scoped unit, spec already clear → `/delegate` to a Sonnet worker (or the `Agent` tool). Not a workflow.
- "Where is X / how does Y work" → `graphify-out/` or a single `Explore` subagent. Not a workflow.
- Trivial mechanical edit (rename, recolor, single-file fix) → just do it inline.
- **Many items needing the same treatment, or a decision that needs independent verification → *that's* when a workflow earns its token cost.**

**The six patterns → where they fit in this repo** (compose freely; stack them for big jobs — e.g. fan-out → adversarial-verify → loop-until-dry):

| Pattern | Reach for it when… | Concrete here |
|---|---|---|
| **Classify & Act** | inbound needs routing before any handler acts | Triage open portal `tickets` / CRM leads / `brain_list_review_items` → bug / billing / feature / spam handlers; route a feature request to the right `vault/03 - Domains/` map |
| **Fan Out & Synthesize** | a task splits cleanly across the monorepo's per-domain / per-file structure, then merges | Block-controls-coverage audit (one agent per block type → merged report — cf. `.planning/audits/`); per-site migration audit (one agent per site); a cross-domain sweep when `graphify-out/` is stale |
| **Adversarial Verification** | a risky change must survive skeptics, not self-praise | **Tenant-leak review** of a data-access change (≥3 agents each hunting a `clientId`/`siteId` scoping gap — pairs with `bun test:tenancy`); auth / billing / migration review; verifying Brain/RAG output. (This is what user-triggered `/code-review ultra` does.) |
| **Generate & Filter** | taste-required — over-generate, then judge down with a *separate* judge agent + rubric | Block-type design directions (pairs with `huashu-design`: 40 mockups → judge to 3); brand messaging / `email_campaigns` subject lines; CRM outreach openers |
| **Tournament** | rank / decide pairwise when one context can't hold all options fairly | Prioritize Kanban backlog cards; pick between architecture approaches (pairs with the `Plan` agent); rank N audit findings or candidate block designs head-to-head |
| **Loop Until Done** | unknown-size hunt, no fixed pass count | Chase a flaky unit/e2e test in its own worktree until it repros, then trace it; "audit every block until a clean pass finds no new coverage gaps" (the `dev-block` skill is a hand-rolled version of this) |

**Keep the project's guardrails inside a workflow too:** workflow agents inherit the session model by default — keep Opus on the boss / judge / synthesis steps and let Sonnet workers fan out (matches the global delegation policy). A workflow that *ships* code still owes the **completion ritual** (update the touched Domain Map, ADR non-obvious calls, move the Kanban card to Shipped) and the relevant gate (`bun test:tenancy` after any data-access change, `bun test:critical` before declaring done). For large/layered jobs, hand it a token **budget** ("+500k") — workflows are expensive; reserve them for genuinely big or multi-layered work. _Pattern catalog: Anthropic's dynamic-workflows guide — `code.claude.com/docs/en/workflows`._

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
- **Site migrations:** auto-derive client email from domain as `{sitename}@simplerdevelopment.com`.

## Pointers (read on demand — `@`-mention to import)

These are reference docs. Don't read them speculatively; only when the task touches the area.

- `.claude/index.md` — **agent navigation: by-area / by-task / by-question → the right nested CLAUDE.md / skill / guide**
- `docs/guides/DATABASE.md` — Drizzle setup + posts/categories/tags REST API
- `docs/guides/BLOCK_EDITOR_GUIDE.md` — block JSON schema, examples, troubleshooting (read when working in `lib/blocks/`)
- `docs/guides/USER_MANAGEMENT.md` — auth and roles
- `tests/TESTING_PLAN.md` — what each test layer is responsible for
- `tests/CI-GATES.md` — coverage floors (60% project-wide / 70% on lib/billing,ai,agency,esign,chat / 90% on lib/crypto), tenancy + critical-e2e gates, local override flags, required-status-check setup
- `docs/skills/` — SD-* skills reference (overview, authoring, developer, edit-skills proposal)
- claude-mem / session history — query recent autonomous-run mistakes and patterns at session start when running unattended

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
