# SD2026 — CI gates

**GitHub Actions CI is live.** `.github/workflows/ci.yml` runs on every push or
pull request targeting `main`. The no-DB fast gate was split (2026-07-08) from one
serial `quality` job into three parallel jobs, so the required merge gate is
bounded by the slowest single piece (unit + coverage) instead of their sum:

- **`lint`** — job name **"Lint & checks"** (lint, god-file budget, doc-drift), no DB.
- **`typecheck`** — job name **"Typecheck"**, no DB.
- **`unit-shard`** (matrix ×4) + **`unit`** — the unit suite is sharded 4 ways
  (`vitest --shard=i/4 --coverage --reporter=blob`); the **"Unit tests"** gate
  job merges the shard blobs (`vitest --merge-reports --coverage`) and enforces
  the coverage floors on the *combined* report. A failed shard skips the gate →
  required check stays unfulfilled (fail-safe). No DB.
- **`tenancy`** — job name **"Tenancy regression"** (Drizzle migrations +
  `bun run test:tenancy`) — spins up a `pgvector/pgvector:pg16` Postgres service.

All jobs share a `~/.bun/install/cache` cache keyed on `bun.lock`. Branch
protection on `main` requires the four job names **"Lint & checks"**,
**"Typecheck"**, **"Unit tests"**, **"Tenancy regression"** — keep the required
status-check contexts in sync with these `name:`s whenever a job is renamed.

Local git hooks (`.githooks/`, pre-commit = fast staged-file checks,
pre-push = full `scripts/ci-local.sh` gate) run the same gates on your machine.
Install once:

```bash
git config core.hooksPath .githooks
```

Run the local gate by hand at any time:

```bash
scripts/ci-local.sh          # fast gate: boundaries, budgets, docs, typecheck (~3–4 min)
scripts/ci-local.sh --quick  # cheap checks only (seconds, no tsc)
scripts/ci-local.sh --unit   # + unit tests (CI runs them anyway, with coverage floors)
scripts/ci-local.sh --tenancy # + multi-tenant leak regression (needs local DB)
scripts/ci-local.sh --full   # + unit + tenancy + critical e2e (needs DB + Playwright)
```

Unit tests were deliberately moved OFF the local pre-push hot path (2026-07-08):
GitHub Actions is free on this public repo, so the `unit` job is the enforced
unit gate (with coverage floors — stricter than the old local run). The local
default gate is the fast, high-signal subset; a red CI run on main is fixed
forward.

**Tenancy gate is drift-proof (2026-07-08):** `bun test:tenancy` runs
`scripts/run-tenancy.sh`, which uses `DATABASE_URL_TEST` verbatim when set (CI)
and otherwise self-provisions the local PG17 test DB (extensions + drizzle-kit
push included, so a stale schema can't fail the suite). Ambient `DATABASE_URL`
is never consulted — tenancy runs can no longer silently hit a remote DB.
Environment drift in general is surfaced by `bun run doctor` (auto-run at
session start via `.claude/settings.json`).

## The gates — remote vs local

| Gate                          | Runs in CI (remote)? | Command                                          |
|-------------------------------|----------------------|--------------------------------------------------|
| Lint                          | ✅ `lint` job         | `bun run lint`                                   |
| Typecheck                     | ✅ `typecheck` job    | `bun run typecheck`                              |
| File-size budget / god files  | ✅ `lint` job         | `bun scripts/check-file-budget.ts`               |
| Doc drift (cited paths exist) | ✅ `lint` job         | `bun scripts/check-doc-drift.ts`                 |
| Unit tests                    | ✅ `unit` job         | `bun run test:unit`                              |
| Tenancy regression `@tenancy` | ✅ `tenancy` job      | `bun run test:tenancy`                           |
| Schema drift preflight        | ✅ PR→`main` only     | `bash scripts/check-schema-drift.sh` (needs prod URL) |
| Architecture boundaries       | ❌ local pre-push only | `bunx depcruise` via `.dependency-cruiser.cjs`  |
| Critical e2e `@critical`      | ✅ `e2e-critical` job  | `bun run test:critical` (see below)             |
| Dead code (informational)     | ❌ local only         | `bunx knip`                                      |

**`@critical` Playwright e2e runs in CI** (`e2e-critical` job, added 2026-07-08):
pgvector service DB, `drizzle-kit push`, the `seed-admin-e2e.ts` fixture, a
production build + start, then the @critical specs against localhost. All
secrets are ephemeral; optional integrations (Stripe/Google/S3) stay dormant,
matching a fresh self-host instance. `scripts/promote-to-prod.sh` (below)
remains the staging-environment gate before production promotion.

## Schema drift preflight — `.github/workflows/schema-drift-preflight.yml`

`prod-schema-sync.yml` auto-applies **additive** changes (CREATE TABLE / ADD
COLUMN) to prod post-merge, concurrently with the Vercel deploy. It is blind to
**non-additive** drift — a shared column whose type changed, or that the code now
requires `NOT NULL` — so the deployed code can expect a shape the live DB never
got (the schema-mismatch outage class, claude-mem S487).

This preflight runs on every **PR to `main`**: it builds the code's Drizzle schema
into a throwaway Postgres, then `check-schema-drift.sh` diffs that TARGET against
prod (`LIVE`, read-only) and **fails if any shared column's type or NOT-NULL-ness
diverges**. Additive-only pending changes are reported but not blocked — the
existing sync handles those. Blocking findings mean: hand-write a backed-up
migration on prod *before* merging, or revert the schema change.

- Requires repo secret `PROD_DATABASE_URL` (shared with `prod-schema-sync.yml`);
  fork PRs without the secret skip the job.
- Offline self-test of the classifier: `bash scripts/check-schema-drift.sh --selftest`.
- **Not blocking until wired:** add "Schema drift preflight" as a required status
  check under Settings → Branches → `main` protection to make a red result block merge.

## Coverage floors — ENFORCED (line-coverage ratchet)

`vitest.config.ts` sets real (non-zero) `test.coverage.thresholds`, so a
`vitest --coverage` run **fails the build on a line-coverage regression**. This
is a ratchet: every floor is set at or below the CURRENT measured number, so CI
fails only when coverage drops below what's already there, never on the
pre-existing baseline.

Only **lines** are enforced. Statements/functions/branches have no threshold
configured (an unset metric never fails the build) — `vitest.config.ts` notes
these stay unenforced because the documented floors are line-based.

Defined in [`vitest.config.ts`](../vitest.config.ts) under `test.coverage.thresholds`.

### Project-wide floor (every file)

| Metric                             | Enforced floor |
|-------------------------------------|:--------------:|
| Lines                                |  60% (measured 63.7%) |
| Statements / Functions / Branches    |  not enforced  |

### Per-domain floors (higher-stakes modules)

These modules carry user-facing money, secrets, or real-time state, so they
carry higher line floors than the project-wide 60%:

| Glob               | Lines floor | Measured | Notes |
|---------------------|:-----------:|:--------:|-------|
| `lib/crypto/**`      |   90%       |  100%    | API-key + secret-encryption primitives — every branch matters |
| `lib/agency/**`      |   70%       |  100%    | |
| `lib/esign/**`       |   70%       |  92.9%   | |
| `lib/chat/**`        |   70%       |  93.1%   | |
| `lib/ai/**`          |   60%       |  61.1%   | Below the 70% target; backlog item to raise once more tests land |
| `lib/billing/**`     |   25%       |  27.9%   | Small domain (333 lines); 25% floor avoids CI noise; backlog item to raise to 70% |

## Pre-push auto-gates

The pre-push hook inspects changed file paths and automatically adds the tenancy
gate when any of the following are touched:

- `lib/db/` (schema, migrations, query helpers)
- `app/api/` (API route handlers)
- `lib/active-client.ts` (tenant resolver)

When those paths appear in the push diff the hook runs `bun test:tenancy` in
addition to the standard gate — no manual flag required.

**No test DB configured?** The gate looks for `DATABASE_URL_TEST`, then falls
back to `DATABASE_URL`. If neither is set it **soft-skips**: it prints a loud
`⚠ TENANCY GATE SKIPPED — no test DB configured (DATABASE_URL_TEST / DATABASE_URL unset).`
warning and exits 0. This is intentional — a developer without a local DB should
not be blocked from pushing — and the line is always visible on stdout, never
silent. Note this is a *configured-vs-unset* check, not a live-reachability probe:
if a stale `DATABASE_URL` is exported, the suite runs and a connection failure
will surface as a normal gate failure.

## Tenancy regression — `bun test:tenancy`

Runs the integration suite filtered to specs/describes tagged `@tenancy`.
**Required after every data-access change.** A failure here means a query is
leaking rows across `clientId` / `siteId` boundaries, which would surface as
one tenant seeing another tenant's data. There is no acceptable "flaky"
explanation for a tenancy failure — investigate, do not retry.

Runs automatically in the `tenancy` CI job (pgvector Postgres service spun up
by the workflow). Locally:

```bash
bun test:tenancy           # uses your DATABASE_URL_TEST
bun test:integration:local # spins up a local DB first, then runs full integration
```

## Trailing gate / promotion — `scripts/promote-to-prod.sh`

The critical e2e + tenancy suites are intentionally **not** in CI (they need a
running app + browser and runtime secrets). Instead, after every staging deploy
`scripts/promote-to-prod.sh` is the mandatory final gate:

1. Runs `bun test:critical` against the **staging** deployment.
2. Runs `bun test:tenancy` against the staging DB.
3. Only if both pass is staging declared *eligible* for promotion. **Promotion
   itself is currently a manual step** — no production remote is wired yet, so
   the script does not tag or push; on green it prints the suggested future
   `git push origin staging:production` and exits 0. Wire the real action here
   once a production target exists.

This keeps the slow suite off the CI hot path while still gating production
on a full green run.

## Critical e2e — `bun test:critical`

Playwright suite filtered to `@critical`-tagged specs (the golden-path
subset). Runs in CI (`e2e-critical` job) and via `scripts/promote-to-prod.sh`.

```bash
bun test:critical
```

## Local overrides (for debugging only — never commit)

When iterating, you sometimes need to run vitest without the threshold gate
(e.g. you're refactoring and coverage briefly drops). Pick one:

1. Use the no-coverage script:
   ```bash
   bun run test          # alias: scripts/test.sh --layer=unit --no-coverage
   bun run test:integration
   ```
2. Or override thresholds inline:
   ```bash
   bunx vitest run --coverage \
     --coverage.thresholds.lines=0 \
     --coverage.thresholds.statements=0 \
     --coverage.thresholds.functions=0 \
     --coverage.thresholds.branches=0
   ```
3. Or temporarily edit `vitest.config.ts` — but **do not commit** the
   relaxation.

## Diff coverage (planned)

`scripts/diff-coverage.sh` will compute coverage only over lines changed in the
current branch diff (i.e. "did you test what you shipped?"). It is **not yet a
blocking gate** because vitest 4.0.18 has a known bug that prevents coverage
emission when any test in the suite fails — until that is resolved the script
produces unreliable output. Tracked in the project issue log.

## Flake quarantine

A flaky test on the `@critical` golden-path costs more deploy speed than ten
missing tests. Convention:

1. **Tag immediately** — add `@flaky` to the test the moment it flakes; this
   prevents it from breaking the next push while you investigate.
2. **Remove from `@critical`** — untag `@critical` (or move to a separate spec
   file outside the golden-path set) so `bun test:critical` stays reliable.
3. **File an issue** — create a tracked issue with a repro and the flake
   frequency; do not let it go dark in a TODO comment.
4. **Fix on a separate track** — the fix ships in its own PR; the test is
   re-promoted to `@critical` only once it has been green for ≥ 20 consecutive
   runs locally.

There is no acceptable "retry until green" workaround on the critical path.

## Enforcement summary

| Scope | Mechanism |
|---|---|
| Every push/PR to `main` | GitHub Actions `quality` + `tenancy` jobs (remote) |
| Every push to `origin` (any branch) | `.githooks/pre-push` → `scripts/ci-local.sh` (local) |
| Staged files on commit | `.githooks/pre-commit` → eslint + file-budget + doc-drift (local) |
| Staging → production promotion | `scripts/promote-to-prod.sh` (manual trigger) |

**`dev` and `dev/*` branches skip git hooks** (`pre-commit`/`pre-push`
self-skip on those refs) and `next.config.ts` relaxes the build
(`ignoreBuildErrors`/`ignoreDuringBuilds` when
`VERCEL_GIT_COMMIT_REF === 'dev'`). CI still runs on PRs to `main`.
