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

## Writing new tests

- New tests: use `/e2e-writer` (for E2E) — produces `.spec.ts` with proper fixtures, cleanup, idempotent patterns.
- Running existing E2E suite: `/e2e-runner`.
- Visual / interactive QA: `/qa`.
- Don't mock the DB in integration tests — we got burned. Integration must hit a real DB. (See memory `feedback`.)

## Layer-picking rule

If a test needs a request, a session, or a DB row, it's NOT a unit test. Push it to integration. Unit specs that mock half the world produce false confidence.

## Coverage floors (see `CI-GATES.md`)

- Project-wide: 60% lines
- `lib/billing`, `lib/ai`, `lib/agency`, `lib/esign`, `lib/chat`: 70%
- `lib/crypto`: 90%

Note: there is currently no CI coverage gate enforced; unit-only coverage is ~4%. Integration coverage emission is broken when tests fail under vitest 4.0.18. (See memory `project_sd2026_coverage_state`.)

## Pointers

- `@tests/TESTING_PLAN.md` — full responsibility model + targets
- `@tests/CI-GATES.md` — gate definitions, pre-push auto-gates, trailing promote gate (`scripts/promote-to-prod.sh`), diff coverage (`scripts/diff-coverage.sh`, vitest 4.0.18 blocker), and @flaky quarantine convention
- `@tests/SKILLS_E2E_GUIDE.md` — testing the SD-* skills end-to-end
