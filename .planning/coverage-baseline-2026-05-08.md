# Baseline Coverage Report — 2026-05-08

**Status:** **PARTIAL** — unit suite ran to completion; integration suite did not finish due to the recurring local-Postgres migration-deadlock issue documented across multiple agent reports today (multiple parallel agents racing on shared catalogs / FK ALTER statements).

**The integration tests are the layer where most of the new feature coverage lives.** Until CI runs them on a clean DB, the per-file picture below understates real coverage substantially. Where you see `0.00%` on a file that the past 24h's integration-test agents specifically targeted (e.g. `lib/snapshots/export.ts`, `lib/agency/custom-domain.ts`, `lib/ab/access.ts`), assume real coverage is ≫ 0% once CI completes.

## Headline (unit-only)

| Metric | Value |
|---|---|
| Lines | **5.23%** (3,237 / 61,943) |
| Statements | **4.89%** (3,531 / 72,177) |
| Functions | **2.93%** (481 / 16,408) |
| Branches | **4.34%** (2,680 / 61,728) |

Tests run: **1,039 unit tests**, all passing (per the test-infrastructure-fix PR's verification).

For context, the prior memory-recorded baseline (May 5) was 4.08% lines unit-only. The new tests added in the past 24h moved this needle by ~1.15 percentage points on unit alone. Real per-feature coverage (with integration) will be much higher.

## Per-feature breakdown (unit only)

Files belonging to the 12 newly-shipped feature modules:

| Feature | File | Lines | Stmts | Fns | Branches | Comment |
|---|---|---:|---:|---:|---:|---|
| ab | `lib/ab/assign.ts` | 96.4% | 88.9% | 100% | 75.0% | unit-tested directly |
| ab | `lib/ab/stats.ts` | 95.7% | 95.7% | 100% | 75.0% | unit-tested directly |
| ab | `lib/ab/access.ts` | 0% | 0% | 0% | 0% | integration-only |
| ab | `lib/ab/render.ts` | 0% | 0% | 0% | 0% | integration-only |
| ab | `lib/ab/resolve.ts` | 0% | 0% | 0% | 0% | integration-only |
| ab | `lib/ab/visitor.ts` | 0% | 0% | 0% | 0% | integration-only |
| agency | `lib/agency/dns-verify.ts` | **100%** | 93.8% | 100% | 88.5% | unit + integration |
| agency | `lib/agency/custom-domain.ts` | 0% | 0% | 0% | 0% | integration-only |
| ai | `lib/ai/plan-gate.ts` | **100%** | 96.7% | 100% | 66.7% | unit + integration |
| ai | `lib/ai/resolve-client-key.ts` | 91.7% | 91.7% | 71.4% | 75.0% | unit + integration |
| ai | `lib/ai/audit.ts` | 0% | 0% | 0% | 0% | integration-only |
| billing | `lib/billing/usage-rollup.ts` | 94.9% | 95.1% | 100% | 90.5% | unit + integration |
| billing | `lib/billing/metered-items.ts` | 0% | 0% | 0% | 0% | integration-only |
| booking | `lib/booking/assign.ts` | 31.1% | 28.7% | 12.5% | 34.5% | bug fix in PR #44 + integration tests |
| booking | `lib/booking/capacity.ts` | 42.9% | 44.4% | 50.0% | 42.1% | integration tests will lift |
| chat | `lib/chat/realtime.ts` | 86.7% | 86.7% | 92.3% | 60.0% | unit + integration |
| chat | `lib/chat/token.ts` | 95.8% | 90.3% | 100% | 83.3% | unit-tested directly |
| chat | `lib/chat/rate-limit.ts` | 0% | 0% | 0% | 0% | integration-only |
| crypto | `lib/crypto/api-key.ts` | **100%** | **100%** | **100%** | **100%** | gold standard |
| crypto | `lib/crypto/secrets.ts` | **100%** | **100%** | **100%** | **100%** | gold standard |
| email | `lib/email/build-campaign-html.ts` | **100%** | **100%** | **100%** | **100%** | unit-tested |
| email | `lib/email/render-cache-core.ts` | **100%** | 91.7% | 100% | 85.7% | unit-tested |
| email | `lib/email/render-blocks-to-email.ts` | 45.8% | 45.2% | 56.5% | 33.3% | needs integration |
| email | `lib/email/render-cache.ts` | 0% | 0% | 0% | 0% | integration-only |
| email | `lib/email/campaign-send.ts` | 0% | 0% | 0% | 0% | integration-only |
| esign | `lib/esign/status-machine.ts` | **100%** | **100%** | **100%** | **100%** | gold standard |
| esign | `lib/esign/dropbox-sign.ts` | 16.7% | 18.7% | 16.7% | 20.4% | webhook integration tests will lift |
| esign | `lib/esign/contract-pdf.ts` | 0% | 0% | 0% | 0% | stub — minor priority |
| normalize-domain | `lib/normalize-domain.ts` | **100%** | **100%** | **100%** | **100%** | new helper from PR #38 |
| snapshots | `lib/snapshots/types.ts` | **100%** | **100%** | **100%** | **100%** | type-only |
| snapshots | `lib/snapshots/util.ts` | **100%** | **100%** | **100%** | 90.6% | unit-tested |
| snapshots | `lib/snapshots/export.ts` | 0% | 0% | 0% | 0% | integration-only |
| snapshots | `lib/snapshots/import.ts` | 0% | 0% | 0% | 0% | integration-only |
| workflows | `lib/workflows/templates.ts` | **100%** | **100%** | **100%** | **100%** | unit-tested |
| workflows | `lib/workflows/runtime.ts` | 61.3% | 57.7% | 81.8% | 28.6% | unit + integration |
| workflows | `lib/workflows/trigger.ts` | 0% | 0% | 0% | 0% | integration-only |
| workflows | `lib/workflows/types.ts` | 0% | 0% | 0% | 0% | type-only — no execution paths |

## Wall of fame (≥90% lines, unit-only)

- `lib/crypto/api-key.ts` 100%
- `lib/crypto/secrets.ts` 100%
- `lib/email/build-campaign-html.ts` 100%
- `lib/email/render-cache-core.ts` 100%
- `lib/esign/status-machine.ts` 100%
- `lib/normalize-domain.ts` 100%
- `lib/snapshots/types.ts` 100%
- `lib/snapshots/util.ts` 100%
- `lib/workflows/templates.ts` 100%
- `lib/agency/dns-verify.ts` 100%
- `lib/ai/plan-gate.ts` 100%
- `lib/ab/assign.ts` 96.4%
- `lib/ab/stats.ts` 95.7%
- `lib/chat/token.ts` 95.8%
- `lib/billing/usage-rollup.ts` 94.9%
- `lib/ai/resolve-client-key.ts` 91.7%

## Files in `lib/` below 60% (count: 249)

Most are either integration-only (their integration tests already exist on staging from the past 24h's work and just haven't run against a clean DB yet) or are pre-existing app code that has no test coverage at all (the ~4% baseline before this initiative).

**Highest-risk new-feature files needing follow-up tests** (still below 60% even with integration coverage anticipated):

1. `lib/booking/assign.ts` — 31.1% — has PR #44 bug fix, integration tests in PR #43 should lift this; verify on next CI run
2. `lib/booking/capacity.ts` — 42.9% — integration tests in PR #43 should lift this
3. `lib/email/render-blocks-to-email.ts` — 45.8% — only some block types are covered; add per-block-type coverage in a follow-up PR
4. `lib/esign/dropbox-sign.ts` — 16.7% — the webhook flows are tested but the actual wrapper functions need direct unit coverage of error paths
5. `lib/esign/contract-pdf.ts` — 0% — stub renderer; document scope/priority before adding tests

## Recommendations

1. **Re-run coverage on CI** with the migration-deadlock-free environment. Until then, treat the per-file numbers above as a worst-case (unit-only) view.
2. **Coverage gate (60% floor) is achievable** for `lib/billing/`, `lib/ai/`, `lib/agency/`, `lib/esign/status-machine.ts`, `lib/chat/`, `lib/crypto/`, `lib/email/build-campaign-html.ts`, `lib/email/render-cache-core.ts`, `lib/normalize-domain.ts`, `lib/workflows/templates.ts` — TODAY, on unit alone.
3. **Files that need follow-up unit tests beyond integration:**
   - `lib/email/render-blocks-to-email.ts` — per-block-type rendering (image, button, columns, spacer, divider) explicitly
   - `lib/esign/dropbox-sign.ts` — wrapper error paths (missing API key, network failure, malformed signature URL)
   - `lib/booking/assign.ts` — round-robin tie-breaking edge cases
4. **Files that should stay where they are:** the 100% modules. Don't write more tests there; spend the cycles on the gaps above.
5. **Wire the coverage publisher** so the README badge is dynamic; currently the CI-gates PR ships a static "60%" badge.

## Caveats / known fragilities

- **Local migration deadlock** — multiple parallel agent runs race on shared Postgres catalogs (`pg_extension`, `pg_namespace`) during `applyTestSchema`. Documented in 4+ Wave B/C/D agent reports. CI's per-worker schema setup avoids this.
- **Pre-existing 84 tsc errors** in `tests/e2e/*` — block typecheck CI but not test execution.
- **Vitest 4.1.5 vs 4.0.18 split** — the deps are aligned in package.json (PR #27) but `bun.lock` regeneration on staging is still needed; until then, vitest may start with a "running mixed versions" warning.

## Files

- `.planning/coverage-baseline-2026-05-08.md` — this report
- `coverage/vitest/coverage-summary-unit.json` — raw per-file unit coverage
- `coverage/vitest/unit/lcov.info` — LCOV format for tooling
- `scripts/parse-coverage.mjs` — istanbul-summary parser the agent wrote (also useful for the CI gates PR)
