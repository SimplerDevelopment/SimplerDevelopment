---
type: playbook
domain: validation
status: active
date: 2026-06-09
sources:
  - vitest.config.ts
  - tests/CI-GATES.md
  - tests/CLAUDE.md
  - tests/TESTING_PLAN.md
  - scripts/test.sh
---

# Coverage Map

**Question to answer in 30 seconds:** what are the floors, is this domain gate-blocking, where does coverage actually stand.

---

## Floor table

| Scope | Lines | Functions | Branches | Statements | Gate-blocking? |
|---|---|---|---|---|---|
| Project-wide (all files) | 60% | 60% | 50% | 60% | No (not yet enforced) |
| `lib/billing/**/*.ts` | 70% | 70% | 60% | 70% | No (aspirational) |
| `lib/ai/**/*.ts` | 70% | 70% | 60% | 70% | No (aspirational) |
| `lib/agency/**/*.ts` | 70% | 70% | 60% | 70% | No (aspirational) |
| `lib/esign/**/*.ts` | 70% | 70% | 60% | 70% | No (aspirational) |
| `lib/chat/**/*.ts` | 70% | 70% | 60% | 70% | No (aspirational) |
| `lib/crypto/**/*.ts` | 90% | 90% | 80% | 90% | No (aspirational) |

**CI gate (when `CI=1`):** `scripts/test.sh` enforces lines 75%, functions 70%, branches 60% against the merged V8 report (`coverage/.v8-merged`). This gate only fires in CI — it is not part of `scripts/ci-local.sh`.

---

## Where coverage actually stands (as of 2026-06-09)

No full combined coverage report has been generated. Known state from `tests/CLAUDE.md`:

- **Unit-only coverage: approximately 4%.** The unit suite covers `tests/unit/` (13 spec files — blocks, brand, survey).
- **Integration coverage emission:** partially broken. `vitest 4.0.18` has a known bug that prevents coverage emission when any test in the suite fails. `reportOnFailure: true` is set in `vitest.config.ts` as a workaround, but the bug affects merged output reliability.
- **Diff coverage script** (`scripts/diff-coverage.sh`): planned but not yet a blocking gate due to the same vitest 4.0.18 bug.

To get the current best estimate:

```bash
# Unit layer with coverage (no threshold enforcement)
npx vitest run --project=unit --coverage --coverage.reportsDirectory=coverage/vitest/unit
open coverage/vitest/unit/index.html
```

Do **not** run full coverage before a PR — it requires a prod build and takes 15+ minutes. Use the unit-only report for iterative checks.

---

## What is included in coverage

Defined in `vitest.config.ts` under `coverage.include` / `coverage.exclude`:

Included:
- `app/**/*.{ts,tsx}`
- `lib/**/*.{ts,tsx}`
- `components/**/*.{ts,tsx}`

Excluded:
- `**/*.d.ts`, `**/*.test.*`, `**/*.spec.*`
- `components/booking-app/**` (has its own test harness)
- `scripts/**`, `drizzle/**`
- Route-only layout files: `app/**/layout.tsx`, `app/**/loading.tsx`, `app/**/not-found.tsx`, `app/**/error.tsx`

---

## Coverage reports: where they land

| Report | Path | Produced by |
|---|---|---|
| Unit + integration (Vitest) | `coverage/vitest/**/index.html` | `scripts/test.sh --layer=unit` or `--layer=integration` |
| E2E server-side | `coverage/server/index.html` | `scripts/test.sh --layer=e2e` (with coverage) |
| Combined (all layers merged) | `coverage/combined/index.html` | `scripts/test.sh` (full run, no `--no-coverage`) |
| Full log | `coverage/test-output.log` | every `scripts/test.sh` run |

All `coverage/` outputs are gitignored.

---

## Why the floors are not yet enforced

1. Unit-only coverage is ~4% — enforcing 60% today would block every push.
2. The vitest 4.0.18 emission bug makes combined coverage unreliable when tests fail.
3. The integration API layer (`tests/integration/api/`) is partially built; server-side coverage depends on it.

Floors will be promoted to blocking gates in phases (see `tests/TESTING_PLAN.md` §11):
- Phase 1: instrumentation + baseline number committed.
- Phase 2-3: P0/P1 specs raise coverage to a credible floor.
- Phase 4: raise `check-coverage` thresholds to 85/75 once combined ≥ 80% lines consistently.

---

## `lib/crypto` — 90% floor rationale

`lib/crypto` holds API-key and secret-encryption primitives. Every branch matters (encryption failure modes, key-derivation edge cases). Even at aspirational status, any PR touching `lib/crypto/**` should carry tests that keep branch coverage near 90%. Reviewers should flag coverage regressions here even before automated enforcement.
