# SimplerDevelopment 2026 — Agent Notes

Multi-tenant SaaS platform: admin + client portal + per-tenant client websites + CRM + Company Brain (AI/RAG) + automations + Google Workspace + Stripe billing. `README.md` is the human developer-onboarding doc; this file is the agent operating guide.

**Stack:** Next 16.1.1 App Router, React 19, TypeScript 5, Tailwind 4, Drizzle ORM + Postgres, NextAuth v5 (beta), Bun. Lock file is `bun.lock` — always use `bun`, never `npm`.

## Agent operating rules (read first)

This is a ~357k-line monorepo (app 157k / lib 81k / components 119k LOC). Context discipline is load-bearing:

- **Start with the index, not with grep.** `@.claude/index.md` maps "I need to work on X" → the right nested `CLAUDE.md` / skill / guide. Nested `CLAUDE.md` files live in `app/portal/`, `lib/blocks/`, `lib/mcp/`, `lib/db/`, `components/portal/visual-editor/`, `tests/` — read the nearest one before opening files in that dir.
- **Before reading a file >500 lines, spawn a subagent.** Use `Explore` for "where is X / how does Y work"; use `block-implementer`-style atomic workers for changes. The main thread should not hold 2000-line god files. See god-file lists inside each nested `CLAUDE.md`.
- **For broad cross-cutting questions ("how does the auth flow work end-to-end"), prefer `graphify-out/` over grep** when it exists and is recent. Otherwise spawn an `Explore` subagent.
- **Don't read documentation speculatively.** Pointers at the bottom of this file are read-on-demand; only follow when the task touches that area.
- **Fan-out cap + continuous integration (guardrail, 2026-07-08):** at most **3 concurrent agent worktrees** per initiative. Each unit **merges back to the integration branch as soon as it completes** — never batch-merge a pile of branches at the end (a 10-branch batch merge once blocked on conflicts in every single branch). A unit that conflicts is resolved *before* the next unit dispatches. Single-writer applies to any shared artifact file (`vault/`, `CLAUDE.md`, `.planning/audits/*.json`) — one worktree owns it, others leave notes. `bun run doctor` (auto-run at session start) warns when the cap is exceeded.
- **Escalation contract (worker → boss):** If a task turns out to need a design/architecture decision, hits an unknown root cause, requires touching files outside your assigned scope, would break a test you can't cleanly fix, or is otherwise beyond a straightforward mechanical change — **stop**. Return a message starting with `ESCALATE:` covering: (1) what you completed, (2) exactly where you got stuck, (3) why it exceeds a worker task, (4) what the boss needs (file/line, error, decision required), (5) recommended next step. Revert any half-done risky edits before returning.

## Prompt intake (complex requests — do this BEFORE planning/coding)

When a prompt carries a **decent amount of instruction** OR asks for a **big / cross-cutting change** (multi-step, architectural, touches multiple domains or many files, or has ambiguous scope), do the following two things first — before any plan or edit:

1. **Revise the prompt against the *current* understanding of the project — and nothing else.** Restate the request back, grounded only in how this codebase *actually* works right now (real routes, schema, existing helpers/patterns, the invariants below, nested `CLAUDE.md` notes) — not training priors or assumptions about how a generic app "usually" works. Surface where the ask meets, conflicts with, or is already partly solved by what's in the repo. If you don't yet know the relevant code, read/Explore it first, then revise.
2. **Run the `/grill-me` skill automatically.** Invoke it (Skill tool, `skill: "grill-me"`) to interview me through the decision tree until we reach shared understanding, resolving each branch before you write code. Do not skip it for this class of prompt just because the path "seems obvious."

Only after the revised prompt is confirmed and grilling has resolved the open branches do you proceed to plan/implement.

**Skip this** for trivial or already-fully-specified work: small single-file edits, quick questions, mechanical fixes, or a task whose scope and approach are already unambiguous. When unsure whether a prompt qualifies, treat it as qualifying.

## Where knowledge lives (the code, first)

**The code and its inline comments are the source of truth.** A fact about how the system behaves belongs in the file that implements it — close enough that changing one forces you to look at the other. Prose that lives elsewhere drifts silently, and the drift is invisible until someone acts on a stale claim. See `vault/04 - Decisions/ADR code-is-the-source-of-truth.md`.

Exactly **three** kinds of standalone document exist. All live in the vault:

| Kind | Where | Answers | Why it can't be a comment |
|---|---|---|---|
| **ADRs** | `vault/04 - Decisions/` | "Why this way, and what was rejected?" | Code shows what was chosen, never the alternatives or the reasoning |
| **Daily logs** | claude-mem (auto) + `vault/01 - Daily Logs/` (distilled) | "What did we do / discover / decide?" | Episodic, spans many files, belongs to no one of them |
| **Glossary** | `vault/Glossary.md` | "What does this term mean here?" | Shared vocabulary has no natural home file |

Two **query** tools sit alongside. Neither is a place you *write*:

- **claude-mem** — episodic history, captured automatically on commit/session-end. Query it (`mem-search`, or the `S###` IDs in the SessionStart hook).
- **graphify** (`graphify-out/`) — structural index of the code as it is now. Prefer `graphify query "..."` over grep for broad cross-cutting questions.

**Routing rule — if it describes how the code behaves, it goes in the code.** If it explains a *decision*, it's an ADR. If it's *vocabulary*, it's the glossary. If it's *what happened*, claude-mem already has it. Nothing else gets written down: no domain maps, no architecture notes, no feature specs, no validation guides. Those were removed on 2026-08-05 after their durable content was migrated into the code they described.

**Not covered by this policy** (kept — these aren't internal notes):
- **Public-facing documentation published on the site** — `docs/api/`, the MCP tool reference, `public/openapi.yaml`. A product surface.
- **Open-source community files** — `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`. This repo is public.
- **Agent tooling** — this file, the nested `CLAUDE.md`s, `AGENTS.md`, `.claude/`. Operating instructions for agents, not documentation about the code.

> **The vault is a separate private repo, cloned into `./vault`.** It was split
> out on 2026-08-03 so that every branch of THIS repo is publishable to the
> public mirror (`SimplerDevelopment/SimplerDevelopment`) — while it lived here,
> no branch could be pushed there and PRs on the public repo were impossible.
> `vault/` is gitignored here; commits to it happen inside `./vault` against its
> own remote. Every `vault/...` path below still resolves as long as it is
> cloned:
>
> ```bash
> git clone https://github.com/SimplerDevelopment/SimplerDevelopment-vault.git vault
> ```
>
> Its pre-split history stays in this repo's history — `git log -- vault/` on an
> older branch still works.

**Code first for feature work.** Before planning/implementing in a domain, read the code — start from `@.claude/index.md` for the map, `graphify query` for cross-cutting questions, and the nearest nested `CLAUDE.md` for that subtree's invariants. Gotchas that used to live in a domain map now live as comments in the file they apply to.

**Completion ritual (after shipping):**
1. Make sure the *code comments* carry what you learned — that is where domain knowledge lives now. A non-obvious `why` you had to reconstruct is a comment you owe the next reader.
2. ADR any non-obvious decision (`vault/04 - Decisions/`).
3. Add any new domain term to `vault/Glossary.md`.
4. Move the portal Kanban card to Shipped.

> **`vault/` is single-writer.** Now that it is its own repo, agent worktrees of
> THIS repo no longer carry a copy — which removes the merge hazard that once
> lost 112 vault files and half-applied a domain-map split. The rule still holds
> inside the vault repo itself: one writer at a time, and an ADR / glossary /
> daily-log edit is its own commit there, never mixed into a code change here.
> If you hit a merge conflict inside the vault repo, reconcile by hand against
> the newest content — do not let the merge pick a side.

**Project status lives in the SimplerDevelopment portal — always.** Track status in the portal's project/Kanban system via the `kanban_*` MCP tools (`kanban_list_board`, `kanban_create_card`, `kanban_move_card`, `kanban_update_card`) — **NOT** the vault markdown boards, which are now **frozen snapshots** (`vault/05 - Feature Specs/*Board.md` carry a MIGRATED banner; do not edit their lanes). Discover projects with `projects_list`, create with `projects_create`, read a board with `kanban_list_board({projectId})`. Lanes: Backlog → Planned → In Progress → Validating → Approved → Shipped. Starting a project/feature → create/move its card into the right lane; finishing → move it to Shipped. Reference board: **Visual Editor QA = project 150**. The card *is* the plan and the status — there is no companion spec note to keep in sync (see the knowledge policy above); put the context in the card description and link any relevant ADR.

## Run / build / test (non-guessable commands only)

- `bun dev` — dev server
  - ⚠️ **Turbopack dev chunks have stable filenames.** The browser can keep serving a *cached* chunk while the dev server returns new bytes for the same URL — surviving `rm -rf .next` and a server restart. The symptoms mimic a logic bug perfectly and have burned hours. Hard-reload (⌘⇧R) and confirm with `curl <chunk-url> | grep -c <symbol>` before you start debugging your own code.
- `bun run lint` — ESLint
- `tsc --noEmit` — typecheck (alias: `bun run typecheck`; run after any non-trivial Edit batch)
- `scripts/test.sh --layer=unit --no-coverage` — Vitest unit (alias: `bun test`)
- `scripts/test.sh --layer=integration --no-coverage` — needs DB; locally use `bun test:integration:local` (spins one up)
- `scripts/test.sh --layer=e2e --no-coverage` — Playwright
- `scripts/test.sh --layer=e2e --tag=@critical --no-coverage` — golden-path subset; **use this as the QA gate before declaring work done** (alias: `bun test:critical`)
- `scripts/test.sh --layer=integration --tag=tenancy --no-coverage` — multi-tenant leak regression; run after any data-access change (alias: `bun test:tenancy`)
- `bun run db:generate` — generate Drizzle migration; **never hand-edit `drizzle/*.sql`**
- `bun run db:migrate` — apply migrations (auto-runs `db:verify-target` to refuse prod URLs)

## Repository topology (read before pushing)

**This repo — `SimplerDevelopment/SimplerDevelopment` — is PUBLIC and is the
source of truth.** Vercel and the Railway `agents` / `realtime` services deploy
from its `main`. Open PRs here; GitHub Actions is free on public repos, so this
is also where CI actually runs.

Two sibling repos, both **private**, neither a development target:

| Repo | Role |
|---|---|
| `SimplerDevelopment-internal` | Frozen archive. Holds the full 3,246-commit history and the pre-split vault history. Its `main` still carries `vault/` in 8 of 11 commits — never mirror it here. |
| `SimplerDevelopment-vault` | The engineering vault — ADRs, daily logs, glossary. Clone it into `./vault`; it is gitignored here. |

`vault/` must never enter this repo — `.githooks/pre-push` rejects any push
carrying it, and `scripts/publish-public.sh` exists for deliberate one-off syncs
out of the archive. The automatic main-mirror was retired on 2026-08-03.

```bash
git clone https://github.com/SimplerDevelopment/SimplerDevelopment-vault.git vault
```

## Deployment (host topology)

- **Hosting: Vercel (or any Next.js host).** Production branch = **`main`**; every other pushed branch deploys as a **Preview** automatically. Configure the deploy target in your own Vercel/host project.
- **Databases: Postgres** (Railway, Neon, Supabase, or self-hosted). Each environment hosts its own Postgres; wire the connection string into the host as a per-environment env var (`DATABASE_URL`). `lib/db/schema/` requires the `vector` (pgvector) extension on every DB.
- **`dev` branch = throwaway fast-iteration line.** Git hooks (`.githooks/pre-commit`, `pre-push`) self-skip on `dev`/`dev/*`, and `next.config.ts` relaxes the build (`ignoreBuildErrors`/`ignoreDuringBuilds` when `VERCEL_GIT_COMMIT_REF === 'dev'`) so a push deploys immediately regardless of type/lint errors. `dev` should point at its own isolated Postgres, schema applied via `drizzle-kit push`. `main`/`staging` keep strict hooks + strict builds.
- ⚠️ **Know which DB your `DATABASE_URL` points at before running any `psql`/migration.** A local `.env` pointing at a remote staging/production DB is *not* local — never hand-apply migrations against prod/staging outside the deploy process. Only an isolated dev DB is safe to push schema to ad-hoc.

### This deployment (concrete — Railway "metro")

- **Prod live DB = the `PRODUCTION DB` service on Railway**, project **`Simpler Development`** (`148ba8a0-…`), environment **`production`**. Internal host `postgres-ishf.railway.internal`; external/public proxy **`metro.proxy.rlwy.net:25565`** (this is the **"metro"** DB the operator means by that name). The `agents` + `realtime` Railway services and the Vercel app all read this DB. (There is a *second*, unused `Postgres` service on `tramway.proxy.rlwy.net` — **not** prod; don't touch it.)
- **Fetch the prod URL without asking (secrets live in Railway, never in git):**
  ```bash
  railway link --project "Simpler Development" --environment production --service "PRODUCTION DB"
  METRO=$(railway variables --service "PRODUCTION DB" --kv | grep -E '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
  ```
- **Vercel deploys do NOT run migrations.** A merge to `main` ships code but not schema — if the code reads a column the manual migration hasn't added to metro, **every** request on that path 500s (`resolveOAuthToken` does a bare `db.select()` that enumerates all schema columns, so a missing `oauth_access_tokens` column takes down *all* MCP OAuth → Cloudflare 502). This exact outage happened 2026-07-11 (unapplied `9006`).
- **Release rule:** before/at merging any branch with a new `drizzle/*_manual.sql` to `main`, hand-apply the pending manual migrations to metro (all are idempotent — `ADD COLUMN IF NOT EXISTS` etc.):
  ```bash
  for f in drizzle/900*_manual.sql; do psql "$METRO" -v ON_ERROR_STOP=1 -f "$f"; done   # or: DATABASE_URL="$METRO" bun scripts/apply-local-manual-migrations.ts
  ```
  Then verify the new column exists and re-call `whoami`. As of 2026-07-11 all manual migrations through `9010` are applied to metro and the drift is clean.
- **Auto-sync is now wired (2026-07-11).** The `PROD_DATABASE_URL` repo secret is set, so the `Prod schema sync (additive)` workflow now actually runs on every merge to `main` and auto-applies **additive** changes (CREATE TABLE / ADD COLUMN) to metro — before this the secret was unset and the job silently skipped (green but a no-op). A `Schema drift preflight` check now also fails a PR on **non-additive** drift (type/nullability changes the additive sync can't apply). So: new columns/tables auto-apply; **type/constraint changes (e.g. `9010`'s `timestamp→timestamptz`, `integer→bigint`) still need a hand-written guarded `*_manual.sql` applied to metro** (make them re-runnable — guard `ALTER … TYPE` behind an `information_schema` type check so a re-run can't reinterpret, cf. `9010`).

## Hotfix lane (shipping a small fix without the full PR wait)

**First, the thing that surprises people: `main` is NOT branch-protected.** No
status check is *required* to merge — `gh api .../branches/main/protection`
returns 404. Every gate below is convention plus two local git hooks. So the
question is never "can I skip validation" (you always can); it is "which checks
actually protect production, and which am I only waiting on out of habit."

**What the gates cost, measured:**

| Gate | Where | Time | Skippable? |
|---|---|---|---|
| gitleaks + eslint + file-budget + doc-drift | `.githooks/pre-commit` | ~10s | **Never.** Cheap, and catches secrets. |
| vault guard | `.githooks/pre-push` | <1s | **Never** — see below. |
| local CI (boundaries, budget, doc-drift, **typecheck**) | `.githooks/pre-push` | **~10 min**, nearly all typecheck | Yes — it duplicates GitHub's `Typecheck` job |
| 15 GitHub Actions checks | CI on push | ~13 min | Partly — see "merge on the relevant checks" |

### What qualifies as a hotfix

Narrow, or this becomes the default path and the gates stop meaning anything:

- ✅ Copy, links, colours, spacing — presentation on an already-shipped surface.
  A dead `href`, a wrong string, a contrast bug, a stale brand name.
- ❌ **Never**: schema/migrations, auth, billing, tenancy, MCP scopes, data
  access, anything under `lib/db`, `lib/mcp`, or an `app/**/api/**` route.
  Those get the full board, no exceptions, however small the diff looks.

### The fast path

```bash
# 1. Commit normally — the pre-commit hook is 10s and includes secret scanning.
git commit -m "fix(scope): ..."

# 2. Verify by hand the ONE thing --no-verify would skip that matters, then push.
#    The vault guard exists because this repo is PUBLIC and vault/ is internal.
git diff --name-only origin/main..HEAD | grep '^vault/' && echo "STOP" || git push --no-verify

# 3. Merge on the RELEVANT checks, not all 15 (see below).
gh pr checks <n>
gh pr merge <n> --merge
```

### Merge on the relevant checks

For a presentation-only change, the checks that can actually catch your bug are
**Typecheck, Lint & checks, Vercel (the build), gitleaks and GitGuardian** —
roughly 3 minutes, not 13. Unit shards, tenancy and e2e do not exercise
marketing copy; waiting on them is habit, not safety.

Two rules that make this safe rather than reckless:

1. **Never merge on a RED check, even an "unrelated" one.** "Probably flaky" is
   a hypothesis, not a result. Re-run it or reproduce it locally
   (`bunx vitest run --project=unit --shard=3/4` reproduces one CI shard
   exactly). If it is genuinely flaky, say so *with the evidence* and move on.
2. **If you merged before the board settled, you still own it.** Watch the
   remaining checks. If one goes red after the merge, revert immediately —
   don't debug forward on `main`.

### Rollback is the real safety net

Vercel deploys production from `main`, so the merge *is* the deploy and the
revert *is* the rollback:

```bash
git revert --no-edit <sha> && git push        # production rebuilds from main
```

Because `main` is unprotected, this takes about a minute. That is precisely why
the fast path is defensible for presentation changes and indefensible for a
migration — you cannot `git revert` a column that has already been dropped.

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
| Plan a feature / consult project knowledge | Read the code (`@.claude/index.md` → nested `CLAUDE.md` → `graphify query`). Record decisions as ADRs in `vault/04 - Decisions/` |
| New CRUD resource | `simplerdev-feature-scaffold` (schema + route + e2e), then `simplerdev-ui-scaffold` for pages |
| New block type | `simplerdev-block-type`. For visual exploration first, `huashu-design` (see below) |
| New MCP tool | `simplerdev-mcp-tool` (handler + schema + scope guard registered in lockstep) |
| New client site from a URL | `site-migration` |
| Block-editor audit | `block-orchestrator` to drive, `block-implementer` for one-off fixes |
| Slim down an MCP tool response | `simplerdev-mcp-token-budget` |
| Autonomous dev loop (hands-off) | `dev-block` skill |
| E2E test authoring | `/e2e-writer`. Running existing E2E: `/e2e-runner`. Visual QA: `/qa` |
| Visual diff (port verification) | `/visual-compare` |
| Delegate role-based work to a department agent | the persona roster in `.claude/agents/` (21 invokable role agents) — see `docs/agency-personas.md` for the org chart, 3-tier model assignment, and the review pipeline |

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
| **Classify & Act** | inbound needs routing before any handler acts | Triage open portal `tickets` / CRM leads / `brain_list_review_items` → bug / billing / feature / spam handlers; route a feature request to the right subsystem |
| **Fan Out & Synthesize** | a task splits cleanly across the monorepo's per-domain / per-file structure, then merges | Block-controls-coverage audit (one agent per block type → merged report — cf. `.planning/audits/`); per-site migration audit (one agent per site); a cross-domain sweep when `graphify-out/` is stale |
| **Adversarial Verification** | a risky change must survive skeptics, not self-praise | **Tenant-leak review** of a data-access change (≥3 agents each hunting a `clientId`/`siteId` scoping gap — pairs with `bun test:tenancy`); auth / billing / migration review; verifying Brain/RAG output. (This is what user-triggered `/code-review ultra` does.) |
| **Generate & Filter** | taste-required — over-generate, then judge down with a *separate* judge agent + rubric | Block-type design directions (pairs with `huashu-design`: 40 mockups → judge to 3); brand messaging / `email_campaigns` subject lines; CRM outreach openers |
| **Tournament** | rank / decide pairwise when one context can't hold all options fairly | Prioritize Kanban backlog cards; pick between architecture approaches (pairs with the `Plan` agent); rank N audit findings or candidate block designs head-to-head |
| **Loop Until Done** | unknown-size hunt, no fixed pass count | Chase a flaky unit/e2e test in its own worktree until it repros, then trace it; "audit every block until a clean pass finds no new coverage gaps" (the `dev-block` skill is a hand-rolled version of this) |

**Keep the project's guardrails inside a workflow too:** workflow agents inherit the session model by default — keep Opus on the boss / judge / synthesis steps and let Sonnet workers fan out (matches the global delegation policy). A workflow that *ships* code still owes the **completion ritual** (comments carry what was learned, ADR non-obvious calls, new terms to the glossary, move the portal Kanban card to Shipped via `kanban_move_card`) and the relevant gate (`bun test:tenancy` after any data-access change, `bun test:critical` before declaring done). For large/layered jobs, hand it a token **budget** ("+500k") — workflows are expensive; reserve them for genuinely big or multi-layered work. _Pattern catalog: Anthropic's dynamic-workflows guide — `code.claude.com/docs/en/workflows`._

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
- **Ticket SKUs (always):** every card/ticket on a project or QA board carries a stable, unique **SKU prefix** at the start of its title, e.g. `` `VEQA-001` `` (Visual Editor QA Board). Scheme: a short board abbreviation + zero-padded sequential number (`VEQA-###`). Assign once and **never renumber or reuse** — the SKU travels with the card across lanes. Reference tickets by SKU in commits, PRs, and notes. When adding new cards, continue the sequence from the board's current max.
- **Ticket checklists, not description to-do lists (always):** any actionable/verifiable list on a card — QA steps, acceptance criteria, pass/fail checks, sub-tasks — goes in the card's **checklist** (`kanban_checklist_add`, one call per item), NOT as markdown `- [ ]` boxes in the description. Checklist items are tickable, tracked, and roll up to a progress count; description checkboxes are dead text. Keep the **description** for prose context only — area, why-it-matters, setup/preconditions, code refs. Pattern per card: `kanban_create_card` (prose description) → one `kanban_checklist_add` per step. (No `checklist` arg on `kanban_create_card` unless seeding `fromTemplateId`.)
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
- `docs/agency-personas.md` — the role-based agent system: 21 invokable personas in `.claude/agents/`, model tiering (Opus decide/review · Sonnet build · Haiku mechanical), the multi-agent review pipeline, and the adopt-a-lens exec/advisory roles. Conductor = the main Opus session
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
