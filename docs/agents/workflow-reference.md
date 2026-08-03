# Workflow Reference

> **Audience:** AI coding agents and human developers working in this repository.
> **Scope:** Day-to-day development workflows — run/build/test commands, database operations, scaffolding skills, commit and branch conventions, and local setup.
> **Siblings:** [architecture-for-agents.md](./architecture-for-agents.md) · [repository-map.md](./repository-map.md) · [api-index.md](./api-index.md) · [tool-reference.md](./tool-reference.md) · [glossary.md](./glossary.md) · [/llms.txt](/llms.txt)

---

## Package manager

**Always use `bun`. Never use `npm` or `yarn`.** The lock file is `bun.lock`. Package changes go through `bun add` / `bun remove` only — never hand-edit `bun.lock`.

---

## Local setup quickstart

```bash
# 1. Clone and install
git clone <repo-url>
cd simplerdevelopment2026
bun install

# 2. Start a local Postgres with the pgvector extension
#    (Docker Compose, Railway local, Neon dev branch, etc.)
#    The DB must have the `vector` extension enabled:
#    CREATE EXTENSION IF NOT EXISTS vector;

# 3. Configure environment
cp .env.example .env
# Set DATABASE_URL=postgresql://<user>@localhost:5432/simplerdev_dev
# Fill in required secrets (see README.md for the full list)

# 4. Apply migrations and seed
bun run db:migrate
bun run db:seed:dev        # loads representative dev fixtures

# 5. Start the dev server
bun dev                    # http://localhost:3000
```

> **pgvector is required on every database.** `lib/db/schema/` uses the `vector` extension for Company Brain embeddings. The migrate step will fail without it.

---

## Run / build commands

| Command | What it does | When to run |
|---|---|---|
| `bun dev` | Next.js dev server (port 3000) | Local development |
| `bun run build` | Production Next.js build | Verifying build integrity before a PR |
| `bun run build:all` | Turbo build across all workspaces | Full monorepo build (CI) |
| `bun run lint` | ESLint across the project | After any substantial edit batch |
| `bun run lint:all` | Turbo lint across all workspaces | CI |
| `bun run typecheck` | `tsc --noEmit` (6 GB heap) | After any non-trivial TypeScript change |
| `bun run typecheck:fast` | `@typescript/native-preview --noEmit` | Quick iteration check (faster, less thorough) |
| `bun run typecheck:all` | Turbo typecheck across all workspaces | CI |

> `bun run typecheck` is the authoritative type gate. Run it after every non-trivial edit batch. `typecheck:fast` is for speed during development — it may miss some errors that the full check catches.

---

## Test layers

Three layers share a single runner script (`scripts/test.sh`). Pick the layer whose scope matches your change.

| Layer | Location | Runner | Best for |
|---|---|---|---|
| **Unit** | `tests/unit/` | Vitest (jsdom + Node) | Pure functions, single components, schema validators |
| **Integration** | `tests/integration/` | Vitest + real Postgres | API routes, multi-table flows, tenancy regressions |
| **E2E** | `tests/e2e/` | Playwright (Chromium) | Golden-path user journeys, visual flows |

**Layer-picking rule:** if a test needs a request, a session, or a DB row — it is **not** a unit test. Push it to integration. Do not mock the DB in integration tests; they must hit a real database.

---

## Gate commands

These are the commands you will run most often. Memorize the aliases.

```bash
# Unit — pure logic, no DB needed
bun test
# equivalent: scripts/test.sh --layer=unit --no-coverage

# Integration — needs a Postgres DB
bun test:integration
# equivalent: scripts/test.sh --layer=integration --no-coverage

# Integration with a local DB (spins one up automatically)
bun test:integration:local

# E2E — full Playwright run
bun test:e2e
# equivalent: scripts/test.sh --layer=e2e --no-coverage

# E2E with local DB (runs prepare-e2e-local.sh first)
bun test:e2e:local

# *** QA GATE — run before declaring any work done ***
bun test:critical
# equivalent: scripts/test.sh --layer=e2e --tag=@critical --no-coverage

# *** TENANCY GATE — run after any data-access change ***
bun test:tenancy
# equivalent: scripts/test.sh --layer=integration --tag=tenancy --no-coverage
```

### When to run each gate

| Gate | Run when |
|---|---|
| `bun test` (unit) | Any pure-logic change; fast, no DB required |
| `bun test:integration` | Changed an API route, DB query, or multi-table flow |
| `bun test:tenancy` | **Required** after any change to data-access code — catches `clientId`/`siteId` scoping gaps |
| `bun test:critical` | **Required** before declaring work done — golden-path E2E smoke suite |
| `bun test:e2e` | Full E2E suite (slower); run when critical alone is insufficient |

### Coverage floors (from `tests/CI-GATES.md`)

| Scope | Floor |
|---|---|
| Project-wide | 60% lines |
| `lib/billing`, `lib/ai`, `lib/agency`, `lib/esign`, `lib/chat` | 70% |
| `lib/crypto` | 90% |

> Note: as of the last documented state, no automated CI coverage gate is actively enforced; unit-only coverage is below floor. Integration coverage emission is blocked by a Vitest 4.0.18 issue. See `tests/CI-GATES.md` for current status.

---

## Database workflow

### Migration (schema changes)

```bash
# 1. Edit schema files in lib/db/schema/ (per-domain modules — never touch drizzle/*.sql directly)
# 2. Generate the migration SQL
bun run db:generate

# 3. Apply migrations
bun run db:migrate
# db:migrate auto-runs db:verify-target first — it will refuse to run against a production URL
```

> **Hard rule: never hand-edit `drizzle/*.sql`.** Those files are generated artifacts. Edit `lib/db/schema/` and regenerate.

### Dev-only schema push (no migration file)

```bash
bun run db:push
# Also runs db:verify-target — only safe against an isolated dev DB
```

Use `db:push` only on a throwaway dev database (e.g., a local instance or an isolated Neon branch). Never run it against staging or production.

### Seeds

| Command | What it seeds |
|---|---|
| `bun run db:seed` | Minimal admin user (production bootstrap) |
| `bun run db:seed:dev` | Representative dev fixtures (recommended for local setup) |
| `bun run db:seed:admin-e2e` | Admin user fixture for E2E tests |
| `bun run db:seed:brain-taxonomy` | Company Brain taxonomy topics |

### DB Studio (Drizzle GUI)

```bash
bun run db:studio   # opens Drizzle Studio at https://local.drizzle.studio
```

### Brain taxonomy backfill

```bash
bun run backfill:brain-taxonomy:preview   # dry run — shows what would change
bun run backfill:brain-taxonomy:apply     # apply
```

---

## Scaffolding skills — task → tool

Prefer these skills over hand-rolling. Each one produces the correct set of files in lockstep; hand-rolling tends to miss one piece.

| Task | Skill / tool | Produces |
|---|---|---|
| Plan a feature / consult domain knowledge | `vault` skill; read `vault/03 - Domains/<domain>.md` first | Domain map, ADR, spec |
| New CRUD resource (schema + API route + E2E) | `simplerdev-feature-scaffold` | Schema migration, API route (with auth envelope), Playwright E2E |
| New UI pages for an existing resource | `simplerdev-ui-scaffold` | Portal page + form components |
| New block type | `simplerdev-block-type` | TS interface, render component, registry entry, production renderer case, `/api/blocks` metadata |
| Visual design exploration for a new block | `huashu-design` (before `simplerdev-block-type`) | Hi-fi single-file HTML mockups (inspiration only — not pasteable into CMS) |
| New MCP tool | `simplerdev-mcp-tool` | Handler, Zod schema, scope guard — all registered in lockstep |
| Migrate a client site from a URL | `site-migration` | Block-translated site scaffold |
| Block-editor audit (many blocks) | `block-orchestrator` (drive) + `block-implementer` (fix) | Per-block audit + targeted fixes |
| Slim an MCP tool response | `simplerdev-mcp-token-budget` | Trimmed response shape |
| Autonomous dev loop (unattended) | `dev-block` skill | Iterative block fixes with self-pacing |
| Write new E2E tests | `/e2e-writer` | `.spec.ts` with fixtures, cleanup, idempotent patterns |
| Run existing E2E suite | `/e2e-runner` | Test execution + report |
| Visual / interactive QA | `/qa` | Visual verification report |
| Visual diff (port verification) | `/visual-compare` | Before/after screenshot diff |

---

## Commit conventions

This repo uses **Conventional Commits**.

```
<type>(<scope>): <short description>
```

### Types

| Type | Use for |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Tooling, config, dependency updates |
| `docs` | Documentation only |
| `ui` | Visual / styling change |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or fixing tests |

### Common scopes

`brain` · `crm` · `google-workspace` · `survey` · `blocks` · `editor` · `workers` · `build`

Use the most specific scope that applies. A change touching only the CRM domain is `crm`; a change touching the block editor is `editor` or `blocks`.

### Examples

```
feat(crm): add deal stage history timeline
fix(blocks): resolve hero image aspect-ratio regression
chore(build): upgrade drizzle-kit to 0.31.8
ui(editor): tighten block toolbar spacing
test(tenancy): assert siteId isolation on brain notes query
```

### Commit granularity

- **During block audits:** one commit per block.
- **All other work:** one logical change per commit; one feature per PR.

---

## Branch conventions

| Pattern | Use for |
|---|---|
| `feat/<topic>` | New features |
| `fix/<topic>` | Bug fixes |
| `<NNN>-<topic>` | Milestone-tracked work (NNN = milestone number) |

**PR target is `main`** unless explicitly told otherwise.

The `dev` branch is a throwaway fast-iteration line — Git hooks self-skip on `dev`/`dev/*` and the build is relaxed. Never treat `dev` as a long-lived feature branch.

Branch names starting with `worktree-agent-*` are created by isolated agents in other sessions. Do not delete them from this session.

---

## Don't-touch zones

| Path / pattern | Rule |
|---|---|
| `drizzle/*.sql` | Generated only. Edit `lib/db/schema/`, then `bun run db:generate`. |
| `bun.lock` | Never hand-edit. Use `bun add` / `bun remove`. |
| `worktree-agent-*` branches | Created by other agent sessions. Do not delete. |
| Repo-root debug artifacts (`*.png`, `_tmp-*.cjs`, `editor-snapshot.md`, `audit-verify-*.png`, `edit-*.png`, `editor-*.png`) | Stale. Do not read or commit new ones. Use `docs/screenshots/` for intended screenshots. |

---

## Deployment topology

| Environment | Branch | Build strictness | Database |
|---|---|---|---|
| Production | `main` | Strict (hooks + build errors enforced) | Isolated Postgres (Railway/Neon/Supabase) |
| Preview | Any pushed branch | Strict | Per-environment Postgres |
| Dev (throwaway) | `dev` / `dev/*` | Relaxed (hooks skip, build errors ignored) | Isolated dev Postgres |

**Wire `DATABASE_URL` as a per-environment variable in your host (Vercel or equivalent).** Every database must have the `vector` (pgvector) extension enabled.

> Know which database your `DATABASE_URL` points at before running any migration or `psql` command. A local `.env` pointing at a remote staging or production DB is not local — never apply migrations against prod/staging outside the deploy pipeline.

---

## Smoke tests (SD skills)

```bash
bun run smoke:skills               # full skill smoke run
bun run smoke:skills:seed-key      # seed the API key used by smoke tests
bun run smoke:skills:cleanup       # clean up smoke test artifacts
```

---

## Further reading (read on demand — not speculatively)

- `tests/TESTING_PLAN.md` — full test responsibility model and layer targets
- `tests/CI-GATES.md` — coverage floors, pre-push auto-gates, diff coverage, @flaky quarantine convention
- `tests/SKILLS_E2E_GUIDE.md` — testing SD-* skills end-to-end
- `docs/guides/DATABASE.md` — Drizzle setup, posts/categories/tags REST API details
- `vault/06 - Validation/Gate Picking.md` — decision guide for which test gates to run for a given change type
- `lib/db/CLAUDE.md` — Drizzle migration workflow, tenancy invariants, footguns
