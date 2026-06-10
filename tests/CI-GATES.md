# SD2026 — CI gates (local)

**There is a GitHub `origin` remote, but no GitHub Actions / no remote CI.**
The repo pushes to `github.com/DanielPCoyle/simplerdevelopment2026`, but nothing
runs CI on the server side — so `scripts/ci-local.sh`, wired into git hooks under
`.githooks/` (pre-commit = fast checks on staged files, pre-push = full gate), is
the **only** CI in front of a push. It runs **on your machine** on every push to
`origin` (including the force-push that deploys `staging`). Run it by hand any time:

```bash
scripts/ci-local.sh          # full gate: boundaries, budgets, docs, lint, typecheck, unit
scripts/ci-local.sh --quick  # cheap checks only (seconds, no tsc/tests)
scripts/ci-local.sh --tenancy # + multi-tenant leak regression (needs local DB)
scripts/ci-local.sh --full   # + tenancy + critical e2e (needs DB + Playwright)
```

## The gates

| Gate                          | Command                                          |
|-------------------------------|--------------------------------------------------|
| Architecture boundaries       | `bunx depcruise` via `.dependency-cruiser.cjs`   |
| File-size budget / god files  | `bun scripts/check-file-budget.ts`               |
| Doc drift                     | `bun scripts/check-doc-drift.ts`                 |
| Lint                          | `bun run lint`                                   |
| Typecheck                     | `tsc --noEmit` on the committed HEAD in a tmp worktree (via `node_modules/.bin/tsc`, raised heap) |
| Unit tests                    | `bun run test:unit` (runs as part of ci-local)   |
| Tenancy regression `@tenancy` | `bun run test:tenancy` (`--tenancy` / `--full`)  |
| Critical e2e `@critical`      | `bun run test:critical` (`--full`)               |
| Dead code (informational)     | `bunx knip`                                       |

The vitest coverage thresholds below still apply when you run coverage, but
are **not** currently a blocking gate (unit-only coverage is low — see
`tests/CLAUDE.md`). They document the intended floors for when coverage is
healthy enough to enforce.

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

Local:

```bash
bun test:tenancy           # uses your DATABASE_URL_TEST
bun test:integration:local # spins up a local DB first, then runs full integration
```

## Trailing gate / promotion — `scripts/promote-to-prod.sh`

The critical e2e + tenancy suites are intentionally **not** on the push hot
path (they need a running DB + browser and can take minutes). Instead, after
every staging deploy `scripts/promote-to-prod.sh` is the mandatory final gate:

1. Runs `bun test:critical` against the **staging** deployment.
2. Runs `bun test:tenancy` against the staging DB.
3. Only if both pass is staging declared *eligible* for promotion. **Promotion
   itself is currently a manual step** — no production remote is wired yet, so
   the script does not tag or push; on green it prints the suggested future
   `git push origin staging:production` and exits 0. Wire the real action here
   once a production target exists.

This keeps the slow suite off the pre-push hook while still gating production
on a full green run.

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

## Enforcement — local git hooks

There's a GitHub `origin` remote but no server-side CI or branch protection, so
enforcement is the pre-push hook in `.githooks/`, installed via:

```bash
git config core.hooksPath .githooks
```

- **pre-commit** — fast checks on staged files (eslint + file-budget + doc-drift).
- **pre-push** — full `scripts/ci-local.sh` gate; fires on every push to `origin`.

Bypass for a one-off: `git commit --no-verify` / `git push --no-verify`.

To add server-side CI, port `scripts/ci-local.sh` into a `.github/workflows/`
job and list its steps as required status checks — the gate logic is already
centralized in that one script, so the workflow is a thin wrapper.
