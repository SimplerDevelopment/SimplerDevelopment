# SD2026 — CI gates (local)

**There is no GitHub Actions / no remote CI.** This project lives in a local
multi-project repo whose only git remote is a local folder, so CI runs **on
your machine** via `scripts/ci-local.sh`, wired into git hooks under
`.githooks/` (pre-commit = fast checks on staged files, pre-push = full gate).
Run it by hand any time:

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
| Typecheck                     | `bunx tsc --noEmit`                              |
| Unit tests                    | `bun run test:unit`                              |
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

## Enforcement — local git hooks

There is no branch protection to configure (no GitHub remote). Enforcement is
the pre-push hook in `.githooks/`, installed via:

```bash
git config core.hooksPath simplerdevelopment2026/.githooks
```

- **pre-commit** — fast checks on staged files (eslint + file-budget + doc-drift).
- **pre-push** — full `scripts/ci-local.sh` gate, but only when the push touches
  `simplerdevelopment2026/` files.

Bypass for a one-off: `git commit --no-verify` / `git push --no-verify`.

If this ever moves to a real GitHub remote, port `scripts/ci-local.sh` into a
`.github/workflows/` job and list its steps as required status checks — the
gate logic is already centralized in that one script.
