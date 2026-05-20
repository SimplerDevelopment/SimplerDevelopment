# SD2026 — CI gates (required PR checks)

Source of truth for the four gates a PR to `staging` must clear, plus how
to override them locally for debugging. Floors are intentionally pragmatic —
60% project-wide / 50% branches — so the gate is *meaningful* without
forcing churn in slow-moving areas. Higher-risk modules are bumped per-glob.

## The four gates

| Gate                          | Job                | Where                                                       |
|-------------------------------|--------------------|-------------------------------------------------------------|
| Vitest coverage thresholds    | `unit-coverage`    | `.github/workflows/sd2026-coverage.yml`                     |
| Coverage diff PR comment      | `coverage-diff-comment` | same workflow (informational; never blocks)            |
| Tenancy regression `@tenancy` | `tenancy`          | same workflow (also `sd2026-tenancy.yml` workflow_dispatch) |
| Critical e2e `@critical`      | `critical-e2e`     | same workflow                                               |

The vitest thresholds are the gate — `bunx vitest run --coverage` exits
non-zero if any threshold fails, which fails the workflow job. The job
status is what GitHub branch protection consumes.

## Coverage floors

Defined in [`vitest.config.ts`](../vitest.config.ts) under `test.coverage.thresholds`.

### Project-wide floor (every file)

| Metric     | Floor |
|------------|------:|
| Lines      |  60%  |
| Statements |  60%  |
| Functions  |  60%  |
| Branches   |  50%  |

### Per-feature higher floors

The 12 newly-shipped feature modules carry user-facing money + secrets, so
they're bumped:

| Glob                    | Lines / Stmts / Funcs | Branches |
|-------------------------|----------------------:|---------:|
| `lib/billing/**/*.ts`   |                  70%  |    60%   |
| `lib/ai/**/*.ts`        |                  70%  |    60%   |
| `lib/agency/**/*.ts`    |                  70%  |    60%   |
| `lib/esign/**/*.ts`     |                  70%  |    60%   |
| `lib/chat/**/*.ts`      |                  70%  |    60%   |
| `lib/crypto/**/*.ts`    |                  90%  |    80%   |

`lib/crypto` holds API-key + secret-encryption primitives — every branch
matters, hence the 90/80 floor.

## Tenancy regression — `bun test:tenancy`

Runs the integration suite filtered to specs/describes tagged `@tenancy`.
**Required after every data-access change.** A failure here means a query is
leaking rows across `clientId` / `siteId` boundaries, which would surface as
one tenant seeing another tenant's data. There is no acceptable "flaky"
explanation for a tenancy failure — investigate, do not retry.

Local:

```bash
bun test:tenancy           # uses your DATABASE_URL_TEST
bun test:integration:local # spins up a local DB first, then runs full integration
```

## Critical e2e — `bun test:critical`

Playwright suite filtered to `@critical`-tagged specs (the golden-path
subset). Same idea as the tenancy gate: this is the smoke test that the
core flows still work end-to-end.

Local:

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
   relaxation. The branch protection rule on `staging` will reject the PR
   anyway once it's set up.

## Required-for-merge — manual GitHub Settings step

The workflow jobs above don't enforce anything until they're listed as
**required status checks** on the `staging` branch. That requires repo
admin and is not something a workflow can configure for itself. To enable:

1. GitHub → repo Settings → Branches → "Branch protection rules".
2. Add rule for `staging` (or edit the existing one).
3. Under "Require status checks to pass before merging", add:
   - `sd2026 — coverage gate / Unit + integration coverage`
   - `sd2026 — coverage gate / Tenancy regression (@tenancy)`
   - `sd2026 — coverage gate / Critical e2e (@critical)`
4. Save.

The diff-comment job (`coverage-diff-comment`) is intentionally **not**
required — it's informational, and if the base-coverage job degrades it
should not block merge.

## Coverage publishing — out of scope

The README badge is currently static (`60%` / orange). To make it dynamic
we'd need either:

- Codecov / Coveralls — accepts `lcov.info` directly; replace the badge URL.
- A custom shields.io endpoint backed by `coverage-summary.json` uploaded
  somewhere public per-merge.

Neither is wired up. The `lcov.info` is uploaded as a workflow artifact on
every PR run; that's the input the publisher would consume.
