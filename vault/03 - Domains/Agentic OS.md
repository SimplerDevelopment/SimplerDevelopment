---
type: domain-map
domain: agentic-os
status: active
date: 2026-06-09
sources:
  - lib/agentic-os/types.ts
  - lib/agentic-os/registry.ts
  - lib/agentic-os/executor.ts
  - lib/agentic-os/rules.ts
  - lib/agentic-os/local-only.ts
  - lib/db/schema/agenticOs.ts
  - app/admin/agentic-os/page.tsx
  - app/api/admin/agentic-os/route.ts
  - app/api/admin/agentic-os/run/route.ts
  - app/api/admin/agentic-os/runs/route.ts
  - app/api/admin/agentic-os/runs/[id]/route.ts
  - app/api/admin/agentic-os/runs/[id]/cancel/route.ts
  - app/api/admin/agentic-os/runs/[id]/stream/route.ts
  - .planning/agentic-os.md
  - tests/unit/lib-agentic-os-executor.test.ts
  - tests/unit/app-admin-agentic-os-page.test.tsx
  - tests/unit/api-admin-agentic-os-run-route.test.ts
  - tests/e2e/admin-agentic-os.spec.ts
---

# Domain: Agentic OS

## Purpose

An admin-only developer dashboard that catalogs every Claude Code skill, cron job, and subagent pattern used in the repository, and lets admins fire on-demand skills as headless `claude -p` subprocesses from the browser. Inspired by Chase AI's Domains-Tasks-Skills-Automations taxonomy.

The system has two distinct responsibilities:
1. **Catalog** — a typed, searchable registry of all 34+ skills/automations grouped by domain, with estimated runtimes, applied rules, and prompt templates with variable interpolation.
2. **Executor** — an in-process subprocess runner that spawns `claude -p --output-format stream-json --verbose <prompt>`, streams stdout as Server-Sent Events to the browser, and persists run history to the DB.

This is strictly a local-development feature. The `isLocalDev()` guard (`lib/agentic-os/local-only.ts`) returns `NODE_ENV === 'development'` only — every UI page and every API route short-circuits to 404 on any build output (staging, preview, production). It is never reachable by tenants.

## Key entry points

| Path | Role |
|---|---|
| `lib/agentic-os/types.ts` | Core type definitions: `AgenticOsDomain`, `AgenticOsSkill` union, `AgenticOsSource` discriminated union, `renderPromptTemplate` helper |
| `lib/agentic-os/registry.ts` | `SKILLS` array (34 entries), `SKILLS_BY_ID` map, `skillsByDomain()` grouper |
| `lib/agentic-os/rules.ts` | `RULES` array (12 invariant entries cross-referenced by skills via `appliesRules`) |
| `lib/agentic-os/executor.ts` | In-process `Map<runId, ChildEntry>`, `spawn`/`appendOutput`/`makeStreamJsonParser`, `resolveClaudeBin`, `executorEnabled` |
| `lib/agentic-os/local-only.ts` | `isLocalDev()` gate — single source of truth for the env check |
| `lib/db/schema/agenticOs.ts` | `agentic_os_runs` table + `agenticOsRunStatusEnum` |
| `app/admin/agentic-os/page.tsx` | Main catalog UI page (admin route tree) |
| `app/api/admin/agentic-os/route.ts` | `GET` — returns catalog (SKILLS, RULES, DOMAIN_LABELS, recent runs, counts, `executorAvailable`) |
| `app/api/admin/agentic-os/run/route.ts` | `POST` — renders prompt, inserts pending row, spawns child, returns `{ runId }` |
| `app/api/admin/agentic-os/runs/[id]/stream/route.ts` | `GET` — SSE stream that taps into in-process `ChildEntry.taps` |
| `app/api/admin/agentic-os/runs/[id]/cancel/route.ts` | `POST` — SIGTERM on the child, flips status to `cancelled` |
| `.planning/agentic-os.md` | Source-of-truth taxonomy doc (archive); registry.ts is its typed projection |

## Data model

One table: `agentic_os_runs` (`lib/db/schema/agenticOs.ts`).

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `skill_id` | varchar(128) | References `SKILLS_BY_ID` key — NOT a FK; registry is code-resident |
| `prompt` | text | Rendered prompt piped to `claude -p`, truncated at 32 KB |
| `variables` | jsonb | Raw form inputs before template rendering |
| `status` | enum | `pending` / `running` / `succeeded` / `failed` / `cancelled` / `unavailable` |
| `output` | text | Captured formatted stdout, server-side truncated at 256 KB |
| `exit_code` | integer | From child process |
| `error_message` | text | stderr tail or thrown error message |
| `duration_ms` | integer | Wall time from spawn to exit |
| `host` | varchar(64) | `os.hostname()` for multi-box debugging |
| `created_by` | integer | FK to `users.id` (nullable, set null on delete) |
| `created_at` / `started_at` / `completed_at` | timestamps | |

Indexes: `created_at`, `skill_id`, `status`.

Skills are NOT in the DB — they live in `lib/agentic-os/registry.ts`. The DB only logs run history.

## API surface

All routes are admin-only (`role === 'admin' || 'employee'`) and return 404 outside `NODE_ENV === 'development'`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/admin/agentic-os` | Full catalog payload: skills, domains, rules, last 25 runs, status counts, `executorAvailable` flag |
| `POST` | `/api/admin/agentic-os/run` | Validate skill + variables, insert `pending` row, spawn `claude -p`, return `{ runId }`. Returns 503 if executor disabled. |
| `GET` | `/api/admin/agentic-os/runs` | Paginated run history |
| `GET` | `/api/admin/agentic-os/runs/[id]` | Single run row |
| `GET` | `/api/admin/agentic-os/runs/[id]/stream` | SSE stream of live output (taps `ChildEntry.taps`); drains buffered output first on attach |
| `POST` | `/api/admin/agentic-os/runs/[id]/cancel` | SIGTERM child, flip status to `cancelled` |

The executor requires `AGENTIC_OS_EXECUTOR_ENABLED=1` in the local env AND `claude` present on PATH. Without either flag, runs still persist to the DB with `status='unavailable'` so the audit log shows the attempt.

## MCP tools

None. The Agentic OS is a developer UI backed by a subprocess executor, not an MCP surface. Skills in the `mcp-server` domain describe how to author MCP tools but are not themselves MCP tools.

## UI surfaces

Single admin page tree at `app/admin/agentic-os/`:
- `layout.tsx` — wraps with the admin shell
- `loading.tsx` — skeleton state
- `page.tsx` — catalog viewer with domain grouping, skill cards (name, description, estimated runtime, applied rules), variable form, run button, SSE log tail, run history table

The catalog page is admin-global (not tenant-scoped). It reads from `SKILLS` at build time and fetches run history at render time.

## Tests & gates

| File | Type | What it covers |
|---|---|---|
| `tests/unit/lib-agentic-os-executor.test.ts` | Unit | `appendOutput` truncation, `formatStreamJsonLine`, `makeStreamJsonParser`, `executorEnabled` |
| `tests/unit/app-admin-agentic-os-page.test.tsx` | Unit | Catalog page render with mock fetch |
| `tests/unit/app-admin-agentic-os-page-coverage.test.tsx` | Unit | Coverage supplement for page branches |
| `tests/unit/api-admin-agentic-os-run-route.test.ts` | Unit | Run route validation, executor-disabled path, 401/404 guards |
| `tests/e2e/admin-agentic-os.spec.ts` | E2E | Catalog UI smoke, 404 outside dev guard |

No integration tests — the executor's in-process state and subprocess I/O are unit-tested via mocks.

## Cross-domain dependencies

- **DB / auth** — `lib/db/schema/agenticOs.ts`, NextAuth session, `users` FK.
- **All skill domains** — registry entries reference skills from `developer-workflow`, `cms-blocks`, `visual-editor`, `site-migration`, `testing`, `mcp-server`, `content-research`, `qa-visual`, `kb-vault`, `automations-cron`. Adding a skill in any of those domains means updating `registry.ts` (and `.planning/agentic-os.md` first).
- **Cron routes** — `automations-cron` entries in the registry are informational mirrors of `app/api/cron/**` routes. They show up in the catalog but are not executable via the Agentic OS executor.
- **Rules** — `rules.ts` paraphrases CLAUDE.md invariants and specific SKILL.md guards. Any new repo-wide invariant worth surfacing to the catalog should be added there.

## Invariants & gotchas

- **Local-dev only, hard gate.** Every page and API route calls `isLocalDev()` and returns 404 for non-development `NODE_ENV`. Do not remove this gate to "test on staging" — it is a deliberate safety rail.
- **In-process child map dies on server restart.** `executor.ts` stores live `ChildProcess` handles in a `globalThis` Map. A dev-server hot-reload survives this (globalThis persists), but a full restart loses any in-flight run. The DB row will be stuck on `status='running'` and the stream route will emit `done` with whatever was last flushed.
- **Multi-host deployments are not supported.** The executor design assumes a single-host dev server. The TODO comment in `executor.ts` calls out BullMQ/Inngest/DB-backed claim table as the path forward if this ever needs to scale.
- **Registry is code, not data.** `skillId` in `agentic_os_runs` is a plain varchar referencing `SKILLS_BY_ID`. If a skill is renamed in the registry, historical run rows retain the old `skillId`. No migration is needed but the catalog will show those rows as orphaned.
- **Scheduled skills are catalog-only.** Skills with `trigger: 'scheduled'` (all cron entries) cannot be run via the `/run` route — the handler rejects with 400. They are displayed in the catalog as an audit timeline only.
- **Output is capped at 256 KB** server-side (in `executor.ts`) before DB insert. Streams continue flowing to the UI beyond that cap but the stored `output` column will show a `[truncated]` marker.

## Planning notes

`.planning/agentic-os.md` is the archived source-of-truth taxonomy doc. It contains:
- Domain definitions and rationale for the 10-domain split
- A gap list of 8 candidate skills not yet in the registry (`simplerdev-drizzle-migration`, `simplerdev-tenancy-regression`, `simplerdev-admin-page-scaffold`, `stripe-price-rotation`, `simplerdev-cron-add`, `mcp-scope-audit`, `brain-rag-eval`, `vendored-skill-refresh`)
- Notes on the memory layer (CLAUDE.md / `.planning/` / `.claude/learnings.md` / postcaptain-kb vault)

A future `external-webhooks` (`cloud` trigger) domain is already typed in `AgenticOsTrigger` but has no registered skills yet.

## Related

- `lib/mcp/` — MCP server that the `mcp-server` domain skills work against
- `app/api/cron/` — the actual cron route handlers catalogued under `automations-cron`
- `.claude/skills/` — repo-skill SKILL.md files referenced by `source.kind === 'repo-skill'` entries
- `vault/03 - Domains/CMS & Blocks.md` — covers the `cms-blocks` skills domain
- `vault/03 - Domains/Visual Editor.md` — covers the `visual-editor` skills domain
