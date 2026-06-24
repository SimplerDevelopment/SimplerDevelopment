# SD2026 — CI gates

**GitHub Actions CI is live.** `.github/workflows/ci.yml` runs on every push or
pull request targeting `main`. Two jobs run in parallel:

- **`quality`** (lint, typecheck, god-file budget, doc-drift, unit tests) — no DB required.
- **`tenancy`** (Drizzle migrations + `bun run test:tenancy`) — spins up a
  `pgvector/pgvector:pg16` Postgres service container.

Local git hooks (`.githooks/`, pre-commit = fast staged-file checks,
pre-push = full `scripts/ci-local.sh` gate) run the same gates on your machine.
Install once:

```bash
git config core.hooksPath .githooks
```

Run the local gate by hand at any time:

```bash
scripts/ci-local.sh          # full gate: boundaries, budgets, docs, lint, typecheck, unit
scripts/ci-local.sh --quick  # cheap checks only (seconds, no tsc/tests)
scripts/ci-local.sh --tenancy # + multi-tenant leak regression (needs local DB)
scripts/ci-local.sh --full   # + tenancy + critical e2e (needs DB + Playwright)
```

## The gates — remote vs local

| Gate                          | Runs in CI (remote)? | Command                                          |
|-------------------------------|----------------------|--------------------------------------------------|
| Lint                          | ✅ `quality` job      | `bun run lint`                                   |
| Typecheck                     | ✅ `quality` job      | `bun run typecheck`                              |
| File-size budget / god files  | ✅ `quality` job      | `bun scripts/check-file-budget.ts`               |
| Doc drift (cited paths exist) | ✅ `quality` job      | `bun scripts/check-doc-drift.ts`                 |
| Unit tests                    | ✅ `quality` job      | `bun run test:unit`                              |
| Tenancy regression `@tenancy` | ✅ `tenancy` job      | `bun run test:tenancy`                           |
| Architecture boundaries       | ❌ local pre-push only | `bunx depcruise` via `.dependency-cruiser.cjs`  |
| Critical e2e `@critical`      | ❌ local / promote gate | `bun run test:critical` (see below)             |
| Dead code (informational)     | ❌ local only         | `bunx knip`                                      |

**`@critical` Playwright e2e is intentionally NOT in CI** — it needs a
fully-booted app plus runtime secrets (OAuth tokens, Stripe keys, etc.) that are
not yet provisioned in the CI environment. It is gated via
`scripts/promote-to-prod.sh` (see below) before every staging → production
promotion.

## Coverage floors (aspirational — currently UNENFORCED)

The floors below document the **intended** thresholds. They are **not currently
enforced**: `vitest.config.ts` has all coverage thresholds set to `0`, so a
`vitest --coverage` run will never fail on coverage alone. Enforcement will be
raised once per-layer coverage is healthy enough to sustain the floors (unit-only
coverage is ~4% today — see `tests/CLAUDE.md`).

Defined in [`vitest.config.ts`](../vitest.config.ts) under `test.coverage.thresholds`.

### Project-wide floor (every file)

| Metric     | Intended floor | Currently enforced? |
|------------|:--------------:|:-------------------:|
| Lines      |  60%           | ❌ (threshold = 0)  |
| Statements |  60%           | ❌ (threshold = 0)  |
| Functions  |  60%           | ❌ (threshold = 0)  |
| Branches   |  50%           | ❌ (threshold = 0)  |

### Per-feature higher floors (aspirational)

The feature modules below carry user-facing money + secrets, so they have
higher intended floors:

| Glob                    | Lines / Stmts / Funcs | Branches | Currently enforced? |
|-------------------------|----------------------:|:--------:|:-------------------:|
| `lib/billing/**/*.ts`   |                  70%  |    60%   | ❌                  |
| `lib/ai/**/*.ts`        |                  70%  |    60%   | ❌                  |
| `lib/agency/**/*.ts`    |                  70%  |    60%   | ❌                  |
| `lib/esign/**/*.ts`     |                  70%  |    60%   | ❌                  |
| `lib/chat/**/*.ts`      |                  70%  |    60%   | ❌                  |
| `lib/crypto/**/*.ts`    |                  90%  |    80%   | ❌                  |

`lib/crypto` holds API-key + secret-encryption primitives — every branch
matters, hence the 90/80 intended floor.

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
subset). Not yet in CI — runs locally and via `scripts/promote-to-prod.sh`.

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
