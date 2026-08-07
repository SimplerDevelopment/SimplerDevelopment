# tests — Agent Notes

Three layers, one runner script. The single most useful file in this dir is `TESTING_PLAN.md`.

> Token budget: keep this file <80 lines.

## Layers

| Layer | Path | Runner | When to use |
|---|---|---|---|
| Unit | `tests/unit/` | Vitest (jsdom + node) | pure functions, single components, schema validators |
| Integration | `tests/integration/` | Vitest + real DB | API routes, multi-table flows, tenancy regressions |
| E2E | `tests/e2e/` | Playwright (chromium) | golden-path user journeys, visual flows |

## Gate commands

```
scripts/test.sh --layer=unit --no-coverage         # alias: bun test
scripts/test.sh --layer=integration --no-coverage  # local: bun test:integration:local
scripts/test.sh --layer=e2e --no-coverage
scripts/test.sh --layer=e2e --tag=@critical --no-coverage   # alias: bun test:critical
scripts/test.sh --layer=integration --tag=tenancy --no-coverage   # alias: bun test:tenancy
```

**`bun test:critical` is the QA gate before declaring work done.**
**`bun test:tenancy` runs after every data-access change.**

**Always use the aliases for the integration layer.** These suites truncate and
reseed whatever DB they connect to. The aliases pin `simplerdev_test`; calling
`scripts/test.sh --layer=integration` directly inherits the ambient
`DATABASE_URL`, which in this repo is a **remote Railway URL in `.env`**.
`test.sh` now refuses any integration run whose DB name lacks `test`
(override: `ALLOW_NON_TEST_DB=1`), but prefer the alias.

## Writing new tests

- New tests: use `/e2e-writer` (for E2E) — produces `.spec.ts` with proper fixtures, cleanup, idempotent patterns.
- Running existing E2E suite: `/e2e-runner`.
- Visual / interactive QA: `/qa`.
- Don't mock the DB in integration tests — we got burned. Integration must hit a real DB. (See memory `feedback`.)
- In route tests, after the act phase assert the guard mock actually ran: `assertMockUsed(authorizePortalMock, 'authorizePortal')` (`tests/helpers/assertMockUsed.ts`). A test that mocks `@/lib/auth` keeps passing green after the route moves to `@/lib/portal-auth` — the stale mock just gets 0 calls and guards nothing.

## Layer-picking rule

If a test needs a request, a session, or a DB row, it's NOT a unit test. Push it to integration. Unit specs that mock half the world produce false confidence.

## Coverage floors (see `CI-GATES.md`) — ENFORCED (line coverage, ratcheted)

- Project-wide: 60% lines (measured 63.7%)
- `lib/agency`, `lib/esign`, `lib/chat`: 70% lines
- `lib/ai`: 60% lines (measured 61.1% — below the 70% target, tracked in backlog)
- `lib/billing`: 25% lines (measured 27.9% — small domain, below the 70% target, tracked in backlog)
- `lib/crypto`: 90% lines

Only `lines` is enforced via `vitest.config.ts` thresholds; statements/functions/branches have no threshold set. Integration coverage emission is broken when tests fail under vitest 4.0.18. (See memory `project_sd2026_coverage_state`.)

## Pointers

- `@tests/TESTING_PLAN.md` — full responsibility model + targets
- `@tests/CI-GATES.md` — gate definitions, pre-push auto-gates, trailing promote gate (`scripts/promote-to-prod.sh`), diff coverage (`scripts/diff-coverage.sh`, vitest 4.0.18 blocker), and @flaky quarantine convention
- `@tests/SKILLS_E2E_GUIDE.md` — testing the SD-* skills end-to-end
