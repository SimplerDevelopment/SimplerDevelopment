---
type: spec
domain: company-brain-ai
status: in-progress
date: 2026-06-17
sources:
  - lib/ai/evals/types.ts
  - lib/ai/evals/runner.ts
  - lib/ai/evals/scorers.ts
  - lib/ai/evals/report.ts
  - lib/ai/evals/env.ts
  - lib/ai/evals/suites/index.ts
  - lib/ai/meeting-processor.ts
  - lib/brain/classify-notes.ts
  - lib/branding/generators.ts
  - lib/ai/pitch-deck-generate.ts
  - tests/unit/ai-evals-framework.test.ts
  - lib/db/schema/evals.ts
  - lib/ai/prompt-registry.ts
  - lib/ai/prompt-registry-manifest.ts
  - lib/ai/evals/cases.ts
  - lib/ai/evals/job.ts
  - scripts/migrations/eval-dashboard.ts
  - tests/unit/prompt-registry.test.ts
  - app/admin/CLAUDE.md
---

# Feature: Prompt Eval Dashboard

## Overview

An internal admin-only dashboard (super-admin guard, `app/admin/**`) that lets platform operators edit LLM prompts, run evaluation suites against any prompt version, view pass-rate trends and token-cost spend over time, and promote or roll back versions with a soft regression gate. All decisions below are RESOLVED — this spec captures rationale, not open questions.

Audience: global admin panel only. No portal-tenant surface. No MCP exposure.

## Domain context

Read first: [[Company Brain & AI]], [[Agency, Onboarding & Branding]], [[Pitch Decks & Product Designer]].

The execution engine already exists: the eval harness at `lib/ai/evals/` (framework files: `types.ts` (129), `runner.ts` (144), `scorers.ts` (166), `report.ts` (98), `env.ts` (19)) with 10 wired suites under `lib/ai/evals/suites/`:

- `automation-parser.eval.ts`
- `brain-classifier.eval.ts`
- `brain-grounder.eval.ts`
- `branding-messaging.eval.ts`
- `branding-theme.eval.ts`
- `deck-generator.eval.ts`
- `meeting-extractor.eval.ts`
- `note-classifier.eval.ts`
- `page-extractor.eval.ts`
- `survey-summary.eval.ts`

Offline self-test: `tests/unit/ai-evals-framework.test.ts` (136).

Four extracted lib cores already callable with an optional prompt-body override (to be wired in Phase 1):

- `extractMeetingTranscript` — `lib/ai/meeting-processor.ts` (384)
- `classifyNoteRow` — `lib/brain/classify-notes.ts` (559)
- `generateBrandMessaging` / `generateBrandTheme` — `lib/branding/generators.ts` (152)
- `generateDeckSlides` / `generateDeckSlidesRaw` — `lib/ai/pitch-deck-generate.ts` (145)

The runtime LLM-prompt inventory is approximately 30 prompts across Company Brain, branding, pitch decks, surveys, and automations. The 10 eval-wired prompts seed the registry first; the remaining ~20 migrate incrementally as suites are written.

Architecture invariant: `app/admin/**` is the global internal panel (see `app/admin/CLAUDE.md`). Eval and registry tables are admin-plane only — never exposed to portal tenants.

## User stories

- As a super-admin, I want to see every prompt's current pass-rate and trend in one place so I can spot regressions at a glance.
- As a super-admin, I want to edit a prompt body and save it as a draft without affecting production so I can iterate safely.
- As a super-admin, I want to run an eval suite against any draft or active version and see per-case pass/fail detail so I understand where a prompt fails.
- As a super-admin, I want to promote a draft to active with a side-by-side delta and a regression warning (not a hard block) so I can make an informed decision.
- As a super-admin, I want one-click rollback to any previous version so I can recover quickly from a bad promote.
- As a super-admin, I want a cost/token spend view per prompt, version, and run over time so I can manage eval cost.

## Requirements

### Must have (all in v1)

- Prompt registry: versioned DB storage with a single ACTIVE version per prompt shared by all tenants; DRAFT versions are never visible to production; super-admin access only.
- `resolvePrompt(promptId)` helper: 60-second in-process cache → DB active version → in-code seeded constant fallback. Code constants remain as seed and safety net. Promotes propagate within cache TTL.
- Prompt-body override param on all extracted lib cores so evals can target any version; production callers pass nothing and receive the active version.
- Background run execution: "Run" enqueues an `eval_run` row; a queue-polling worker (Railway/cron) calls `runSuite` / `runAll`; dashboard polls progress + results. Synchronous execution is not acceptable for suites that make real model calls (deck suite: ~30-60 s/case).
- DB-backed test cases: input + expected JSON, optional mockOutput, enabled flag, order. Seeded from current `.eval.ts` fixtures. Cases are UI-editable.
- Scorers stay in code — never UI-editable (scorers are logic, not data).
- Four dashboard views: Overview/leaderboard; per-prompt timeline charts; version compare + per-case drill-down; cost/token spend dashboard.
- Promote flow: super-admin explicit action; shows new-vs-active eval deltas; warns on regressions but allows with confirm (soft gate, not hard block); full version history; one-click rollback.
- Run cadence: manual trigger; auto-run on every promote; opt-in per-prompt schedule (nullable cron). Scheduled-everything is not the default (cost control).
- Platform Anthropic key pays for eval runs (internal tool). Confirm-before-expensive for deck and meeting suites. No hard budget cap in v1.
- Audit log on every prompt edit.
- All eval/registry tables admin-plane only — zero portal-tenant exposure.

### Nice to have (deferred)

- Per-tenant prompt overrides (nullable `clientId` column reserved in schema; no UI or logic in v1).
- Hard budget cap enforcement.
- Automated suite authoring for the remaining ~20 uninstrumented prompts.

## Technical design

### Database changes

New tables in `lib/db/schema/` (add a new module, e.g. `prompt-registry.ts`; run `bun run db:generate` to generate migration — never hand-edit `drizzle/*.sql`):

**`prompt_registry`**
- `id`, `key` (unique slug), `title`, `description`
- `activeVersionId` (FK → `prompt_versions.id`, nullable until first promote)
- `scheduleCron` (nullable; opt-in scheduled eval runs)
- `createdAt`, `updatedAt`

**`prompt_versions`**
- `id`, `promptId` (FK → `prompt_registry.id`)
- `version` (integer, auto-incrementing per prompt)
- `body` (text — the prompt template)
- `notes` (text, nullable — changelog for this version)
- `createdBy` (userId)
- `status` (`draft` | `active` | `archived`)
- `createdAt`

**`eval_datasets`**
- `id`, `suiteId` (matches `.eval.ts` suite key), `promptId` (FK → `prompt_registry.id`)
- `title`, `createdAt`, `updatedAt`

**`eval_cases`**
- `id`, `datasetId` (FK → `eval_datasets.id`)
- `caseKey` (matches current `.eval.ts` case key)
- `input` (jsonb), `expected` (jsonb), `mockOutput` (jsonb, nullable)
- `enabled` (boolean), `order` (integer)
- `createdAt`, `updatedAt`

**`eval_runs`**
- `id`, `promptVersionId` (FK → `prompt_versions.id`), `suiteId`
- `trigger` (`manual` | `promote` | `schedule`)
- `status` (`pending` | `running` | `completed` | `failed`)
- `passCount`, `totalCount`, `passRate`, `aggregate`, `avgLatencyMs`, `totalTokens`, `costUsd`
- `error` (text, nullable)
- `startedAt`, `completedAt`, `createdAt`

**`eval_case_results`**
- `id`, `runId` (FK → `eval_runs.id`), `caseKey`
- `passed` (boolean), `aggregate` (float)
- `latencyMs`, `inputTokens`, `outputTokens`
- `output` (jsonb), `scores` (jsonb)
- `error` (text, nullable)

Tenancy note: none of these tables carry `clientId` / `siteId` — they are admin-plane only. A nullable `clientId` column on `prompt_registry` is reserved for future per-tenant overrides but is not implemented in v1.

### API changes

All routes under `app/admin/` with super-admin guard (follow the envelope pattern from `app/admin/CLAUDE.md`: `{ success, data | error }`).

Key routes:
- `GET /api/admin/prompts` — list registry with latest run summary per prompt
- `GET /api/admin/prompts/[id]` — single prompt, all versions, run history
- `POST /api/admin/prompts/[id]/versions` — create draft version
- `POST /api/admin/prompts/[id]/promote` — promote draft to active (triggers eval run, returns delta)
- `POST /api/admin/prompts/[id]/rollback` — rollback to a previous version
- `GET /api/admin/eval-runs/[runId]` — run status + case results (for polling)
- `POST /api/admin/eval-runs` — enqueue a run (manual trigger)
- `GET /api/admin/eval-cases/[suiteId]` — list cases for a suite
- `PUT /api/admin/eval-cases/[id]` — edit a case

`resolvePrompt(promptId)` lives in `lib/ai/` and is called by all extracted lib cores. It is not an API route — it is server-side lib code.

### Admin UI

New subtree under `app/admin/prompts/` (or `app/admin/eval/`). Four views:

1. **Overview / leaderboard** — table of all prompts: active version, latest pass-rate, trend arrow (up/flat/down vs. prior run), last-run timestamp. Sortable.
2. **Per-prompt timeline** — line charts (pass-rate, aggregate score, avg latency, token cost) over runs; version-bump markers on the x-axis.
3. **Version compare + per-case drill-down** — side-by-side scorer deltas for vN vs. vN+1; expandable per-run case table with pass/fail, scorer breakdown, model output.
4. **Cost / token spend** — spend per prompt, per version, per run over time; aggregated totals.

Promote flow: diff view (old body vs. new body) + eval delta summary + regression warning banner (if any scorer dropped) + confirm button.

Material Icons for all iconography (no emojis).

### Public site / blocks

Not applicable. This feature has no public-site or block surface.

### MCP exposure

None. This is an internal admin tool. No MCP tool needed.

## Scaffolds to use

- **`simplerdev-feature-scaffold`** for new admin routes and DB schema boilerplate.
- **`simplerdev-ui-scaffold`** for admin page scaffolding once routes are established.
- Do NOT use `simplerdev-block-type` (no block surface) or `simplerdev-mcp-tool` (no MCP surface).

## Phased build plan

### Phase 1 — Foundation

- New DB schema module in `lib/db/schema/` with all five tables above; `bun run db:generate` + `bun run db:migrate`.
- `resolvePrompt(promptId)` helper in `lib/ai/`: 60-second in-process cache → DB active version → in-code constant fallback.
- Seed script: reads the 10 in-code prompt constants from the eval suites; writes one `prompt_registry` row + one `prompt_versions` row (v1, status: active) for each.
- Add optional `promptBody?: string` override param to `extractMeetingTranscript`, `classifyNoteRow`, `generateBrandMessaging`, `generateBrandTheme`, `generateDeckSlides`, `generateDeckSlidesRaw`. Production callers pass nothing; eval callers pass the version under test.
- Wire each lib core to call `resolvePrompt` when no override is passed.

### Phase 2 — Run and store

- Queue-polling worker (Railway/cron job) that reads `eval_runs` rows with `status: pending`, calls `runSuite` / `runAll` from `lib/ai/evals/runner.ts`, writes results to `eval_runs` + `eval_case_results`.
- Migrate test cases from `.eval.ts` files to `eval_datasets` / `eval_cases` DB tables; seed script.
- Manual trigger: `POST /api/admin/eval-runs` enqueues a row.
- CLI trigger: extend `lib/ai/evals/runner.ts` to support targeting a specific prompt version by ID.
- Auto-trigger on promote: promote API enqueues a run for the new active version.

### Phase 3 — Dashboard (read-only)

- Four admin views (see Admin UI section above).
- Polling mechanism for run progress (simple interval + status check against `GET /api/admin/eval-runs/[runId]`).
- Charts: use whatever chart library is already in the admin panel; if none, add a lightweight option (e.g. Recharts) via `bun add`.

### Phase 4 — Edit, version, promote

- Prompt body editor (textarea or code editor) in the admin UI; saves as a new DRAFT version.
- Dataset / case editor: add, edit, enable/disable cases; reorder.
- Promote flow with regression warning and confirm.
- One-click rollback.
- Opt-in per-prompt schedule cron (edit `scheduleCron` field); cron job reads opted-in prompts and enqueues runs.
- Audit log writes on every prompt edit (use existing audit infrastructure in `lib/db/schema/audit.ts` if it exists, otherwise add a simple `prompt_audit_log` table).

## Validation plan

Per [[06 - Validation/Gate Picking|Gate Picking]]:

- **Unit:** `resolvePrompt` cache logic (cache hit, cache miss → DB, DB failure → code fallback); promote delta calculation; regression-warning detection. Run: `scripts/test.sh --layer=unit --no-coverage`.
- **Integration:** end-to-end run enqueue → worker picks up → results written; promote flow writes new active version; rollback restores prior active version. Run: `bun test:integration:local`.
- **Tenancy:** `eval_runs`, `eval_case_results`, `prompt_registry`, `prompt_versions`, `eval_datasets`, `eval_cases` must never be queryable from portal-tenant routes. Run: `bun test:tenancy` after any data-access change touching these tables.
- **E2E:** not required for Phase 1-2 (no UI yet); add a `@critical` tagged Playwright test for the promote flow in Phase 4. Run: `bun test:critical` before declaring Phase 4 done.
- **Manual QA:** confirm-before-expensive gate for deck and meeting suite runs; cost view accuracy vs. `eval_runs.costUsd`.

## Build progress (as of 2026-06-17, branch worktree/mcp-review — NOT pushed)

### Phase 1 — Prompt registry foundation — SHIPPED (commit 6fd84f9e)

**Schema:** `lib/db/schema/evals.ts` — 6 tables: `prompt_registry`, `prompt_versions`, `eval_datasets`, `eval_cases`, `eval_runs`, `eval_case_results`. Global/admin-plane only; no `clientId`.

**Migration:** `scripts/migrations/eval-dashboard.ts` (idempotent create + seed). Note: `bun run db:generate` is pre-existing-broken (meta-snapshot collision on 0004), so this is a hand-apply migration script rather than a Drizzle-generated file. Applied to local test DB; needs hand-apply to staging/prod per `lib/db/CLAUDE.md` before go-live.

**Prompt resolver:** `lib/ai/prompt-registry.ts` — `resolvePrompt(key, fallback)` (60s cache, DB active-version lookup enforcing `status='active'`, fallback on disabled/miss/error), `getPromptVersionBody`, `clearPromptCache`. Gated by env var `PROMPT_REGISTRY_ENABLED` (default OFF — production uses code constants until explicit go-live flip).

**Registry manifest:** `lib/ai/prompt-registry-manifest.ts` — the 4 registry-managed static prompts: `meeting-extractor`, `branding-messaging`, `branding-theme`, `deck-generator`.

**Cores wired** with a `systemPromptOverride` hook: `lib/ai/meeting-processor.ts`, `lib/branding/generators.ts`, `lib/ai/pitch-deck-generate.ts`.

**Verified:** unit 17/17 (incl. `tests/unit/prompt-registry.test.ts`), tsc clean, E2E (flag on → seeded DB body served; flag off → fallback to code constant).

### Phase 2 — Eval-run executor + DB-backed cases — SHIPPED (commit 82f35866)

**Cases loader:** `lib/ai/evals/cases.ts` — `loadCasesFromDb` + `seedCasesFromSuites` (idempotent; seeds 10 datasets / 26 cases from existing `.eval.ts` fixtures into `eval_datasets` / `eval_cases`).

**Job executor:** `lib/ai/evals/job.ts` — `enqueueEvalRun` + `runEvalJob` (resolves version body, loads DB cases, scores, persists `eval_case_results` + `eval_runs` rollup including `costUsd`; status transitions: `pending` → `running` → `done` / `failed`). `env.promptOverride` + `runSuite(casesOverride)` plumbing added; 4 registry suites forward the override.

**Verified E2E** against local DB: `runEvalJob('automation-parser', mock)` → done, 4 cases, 3 passed, results persisted. Unit 17/17, tsc clean.

### How it was built

Opus boss + Sonnet sub-agents (seed script, unit tests) + advisory review passes. Review passes caught and fixed: FK drift in the seed, partial-failure handling in the seed script, and a stale-active-pointer gap in `resolvePrompt`.

### Deferred / follow-ups (do NOT lose)

- **Dynamic/templated prompts** (`note-classifier` `buildSystemPrompt`, automation parser built from `PORTAL_TOOLS`) are NOT yet registry-managed — need a templating model before they can be. Only the 4 static prompts are wired.
- **`resolvePrompt` thundering-herd:** no in-flight promise coalescing. Harmless while flag is off; address before go-live.
- **Phase 2b:** worker/cron to drain queued `eval_runs`; stale-run detection (runs stuck in `running` after a crash); unique guard against duplicate concurrent runs; real per-model cost rates (currently a blended estimate).
- **`runEvalJob` vitest integration test** was deferred — the integration harness has schema/search-path subtleties; engine is proven via a direct E2E script instead.

### Phase 3 — Dashboard — SLICE SHIPPED (vertical slice, 2026-06-24, branch worktree/mcp-review)

A thin vertical slice of the read-only dashboard, proving the whole UI pipe end-to-end (leaderboard → per-prompt timeline → manual run → watch it complete) before the remaining views fan out.

**Admin API** (`app/api/admin/`, staff-guarded via shared `prompts/_auth.ts` = the existing `requireStaff` admin/employee gate; `{success,data}` envelope):
- `GET /prompts` — leaderboard: each registry prompt + latest-run summary + pass-rate trend (latest vs prior `done` run) + active version NUMBER.
- `GET /prompts/[id]` — prompt + version history + full run timeline (asc).
- `POST /eval-runs` — enqueue a manual run for the active version, then drive `runEvalJob` inline (fire-and-forget; mock|real per-run, default mock). _ponytail:_ production drains via the cron worker; dev kicks the engine from the request so the client can poll. Mock is NOT persisted on the row — passed straight to the executor.
- `GET /eval-runs/[runId]` — status + rollup + per-case results (polled).

**Admin UI** (`app/admin/prompts/`, Material Icons, inline-SVG sparkline, no chart dep):
- `page.tsx` — leaderboard table (title/key, active version, pass-rate badge, trend icon, last-run status + age).
- `[id]/page.tsx` — detail: Run-Eval control (mock/real selector, default mock) that enqueues → polls 1.5s → reloads on done/failed; timeline sparkline + recent-runs table; version list.

**Seed companion:** `scripts/migrations/seed-eval-cases.ts` (wraps `seedCasesFromSuites`; the Phase-1 migration seeds only the registry).

**Verified (2026-06-24):** whole-repo `tsc` clean; provisioned an isolated local Postgres (`simplerdev_evaldash`, pgvector), full `drizzle-kit push`, seeded 4 prompts / 10 datasets / 26 cases + admin user. Browser-confirmed end-to-end on `:3001`: login → leaderboard (branding-messaging shows real run, 100%) → detail → clicked Run eval (mock) → run #2 enqueued, executed, polled to `done 2/2 100%`, timeline reloaded.

**Side-fix:** `next.config.ts` `turbopack.root = import.meta.dirname` — without it Turbopack mis-roots when the repo is a git worktree under a home dir with a stray lockfile, 404-ing all page routes. No-op on Vercel. (Dev note: the tenant middleware's `APP_HOSTNAMES` only whitelists `localhost:3000/3001/3005/3100` — run the eval dev server on one of those ports or pages 404.)

### Phase 3 — remaining read-only views — SHIPPED (2026-06-24, branch worktree/mcp-review)

Built on the slice; browser-verified end-to-end on the isolated local DB.

- **Per-case drill-down** — run rows in the detail timeline expand (lazy-fetch `GET /api/admin/eval-runs/[runId]`, cached) into a per-case sub-table: pass/fail badge, aggregate, latency, tokens, and collapsible `<details>` for output/scores JSON.
- **Version Compare** — section on the detail page computing each version's latest-`done`-run pass-rate + aggregate and the Δ vs the prior version, from already-loaded data (no extra fetch); graceful with a single version.
- **Cost / spend view** — `GET /api/admin/eval-cost` (per-prompt runs/tokens/cost aggregation + grand totals) + `app/admin/prompts/cost/page.tsx` (three summary stat cards + per-prompt spend table). Linked from the leaderboard header (`attach_money` "Cost view") + a leaderboard summary line.

Verified: whole-repo `tsc` clean; ESLint clean on all changed files; browser-confirmed cost page totals, version-compare row, and run drill-down (b2b-saas / artisan-coffee case results with output/scores expanders).

**Phase 3 remaining (polish, deferred):** sortable leaderboard columns, real-run confirm-before-expensive UX (the mock/real selector exists; the cost-confirm dialog does not).

### Phase 4 — Edit, version, promote — SHIPPED (2026-06-24, branch worktree/mcp-review)

The write layer. Two decisions were resolved (no reusable audit table existed — `audit.ts` is OAuth; no super-admin role exists): **dedicated `prompt_audit_log` table** + **`requireAdmin` (role==='admin') on all write ops** (reads stay `requireStaff`).

- **Schema:** `prompt_audit_log` (actorUserId, action, promptId, versionId, detail json, createdAt) in `lib/db/schema/evals.ts`. `logPromptAudit()` helper in `lib/ai/evals/audit.ts` (never throws into the caller). `setActiveVersion()` + `latestDonePassRate()` in `lib/ai/evals/versions.ts` (atomic active-version swap via `db.transaction` + `clearPromptCache`).
- **Write APIs** (all `requireAdmin`, audit-logged): `POST /prompts/[id]/versions` (create draft), `POST /prompts/[id]/promote` (soft regression gate — warns on pass-rate drop, never blocks; archives outgoing active, activates target, moves pointer, enqueues a `trigger='promote'` re-run), `POST /prompts/[id]/rollback` (re-activate a prior version, no re-run), `PATCH /prompts/[id]` (schedule cron + title/desc, light cron validation), `eval-cases` GET/POST + `eval-cases/[id]` PUT (cases CRUD + enable/disable), `GET /prompts/[id]/audit` (LEFT JOIN users).
- **UI:** detail page write controls (collapsible body editor → save draft; per-version Promote/Rollback with inline two-step confirm + soft-regression warning; schedule cron input; read-only Audit Log) + a separate cases editor at `app/admin/prompts/[id]/cases/page.tsx` (table, expand-to-edit JSON with parse validation, toggle-enabled, add-case). Write controls gated client-side via `useSession` (`role==='admin'`); the API is the hard enforcement.

Verified: whole-repo `tsc` clean; ESLint clean (fixed a mount-fetch nit + an audit-detail render that crashed on the json object — typed `detail` as object + render key:value pairs). Browser E2E on the isolated local DB: edit→save draft (v2)→promote v2 (confirm, v1 archived, regression run #3 enqueued, audit entry)→rollback to v1 (confirm)→save schedule cron→cases editor lists/toggles. Audit log showed all three actions with actor email.

**Deferred (Phase 4 follow-ups):** the `@critical` Playwright promote-flow test (verified manually via browser this round); wiring the opt-in `scheduleCron` to an actual scheduler tick (the field saves + audits, but no cron reads opted-in prompts yet); dataset (not just case) management.

### To go live

Apply `scripts/migrations/eval-dashboard.ts` to staging and prod, run the seed, then flip `PROMPT_REGISTRY_ENABLED=1`.

## Top risks

1. **Hot-path DB read on every AI call.** Mitigated by 60-second in-process cache + code-constant fallback. Fallback means a DB outage cannot break production AI features. Monitor cache hit rate after Phase 1 lands.
2. **High blast radius of editing infra prompts.** Mitigated by super-admin guard, DRAFT-never-to-prod isolation, soft regression gate on promote, full rollback history, and audit log.
3. **Live-run token cost.** Mitigated by cost view, confirm-before-expensive for expensive suites, and opt-in (not opt-out) per-prompt scheduling. No hard cap in v1 — revisit after cost baseline is established.
4. **Multi-week scope.** The harness is real and the lib cores are extracted — the plumbing exists. Phases 1 and 2 are the highest-value / lowest-risk units; Phases 3 and 4 build on them incrementally and can be shipped independently.
