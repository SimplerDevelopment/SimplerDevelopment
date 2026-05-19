# Coverage-climb loop plan — test/coverage-climb-30pct

Self-paced /loop iterating on this branch off
`chore/coverage-baseline-2026-05-08` until `bun test --coverage` reports
**≥30% statements + ≥25% branches** with no `.skip` in new files.

## How to resume mid-loop

Run from `/Users/dancoyle/simplerdevelopment/.claude/worktrees/coverage-climb`:

```bash
git branch --show-current   # MUST be test/coverage-climb-30pct
git log --oneline test/coverage-climb-30pct ^chore/coverage-baseline-2026-05-08
```

The second command lists every iteration committed so far.

## Iteration log

- **#1** — `test(email): per-block-type unit tests for renderBlocksToEmailHtml`
  - file: `tests/unit/email-render-blocks-types.test.ts` (819 lines, 100 tests)
  - covers: text/heading/image/button/spacer/divider/columns/quote/section/
    social-links/email-header/email-footer renderer branches
  - baseline-file's stmt% before: 45.2% — should be near-100% now (not re-measured this iteration; defer to a "measure every N iterations" cadence)
- **#2** — `test(esign): fetch-path unit tests for DropboxSign client`
  - file: `tests/unit/dropbox-sign-fetch.test.ts` (36 tests)
  - covers: createSignatureRequest (happy path + testMode default + override +
    form-field assembly + 3 error paths + missing-API-key gate),
    getEmbeddedSignUrl (happy path + 5-min default + URL encoding + 3 errors),
    cancelSignatureRequest (happy path + empty-id + 404/410 swallow +
    500 throw + missing-API-key + URL encoding),
    getSignedFileUrl (happy path + empty-id + non-2xx + missing field +
    query-string + missing-API-key + URL encoding)
  - baseline-file's stmt% before: 18.7% — should now be 80-90% (verifyWebhookSignature path already covered by sister file)

## Next-target candidates

Ranked by `(unit-friendliness × LOC × current-gap)`. Source: per-file
breakdown in `.planning/coverage-baseline-2026-05-08.md` + the report's
own follow-up list.

1. ~~`lib/esign/dropbox-sign.ts`~~ — covered by iteration #2.
2. **`lib/booking/assign.ts`** — 31.1% — round-robin tie-breaking edge
   cases. Pure-functional (no DB). Already has PR #44 + integration
   tests but per-the-report still needs unit edge-case coverage.
3. **`lib/booking/capacity.ts`** — 42.9% — slot-counting math.
   Pure-functional.
4. **`lib/workflows/runtime.ts`** — 61.3% lines / **28.6% branches** —
   branch-coverage gap. Step-resolver / condition-evaluator. Likely
   pure-functional.
5. **`lib/email/render-blocks-to-email.ts`** — was 45.2% — should now be
   close to 100% after iteration #1. Skip unless re-measurement shows
   remaining gaps.

After this list, pivot to the **0%-coverage / large-LOC** pool: open
`coverage/vitest/coverage-summary-unit.json` and pick the largest
pure-functional file at 0%. Skip files in `app/api/**/route.ts` and
anything that needs Drizzle/NextAuth at module load — those are
integration-territory.

## Coverage measurement cadence

Re-baseline every **5 iterations** (not every one — full-suite coverage
takes minutes). Drop a tally into this file when re-measured:

| Iter | Stmt% | Br% | Tests added | Files touched |
|---:|---:|---:|---:|---|
| 0 (baseline) | 4.89 | 4.34 | — | — |
| 1 | (not measured) | (not measured) | 100 | render-blocks-to-email |
| 2 | (not measured) | (not measured) | 36 | dropbox-sign |

## Stop condition

Stmt% ≥ 30 AND Br% ≥ 25. When met, commit a final-tally row to this file
and stop the loop. Do **NOT** mark any new test file as `.skip` — if a
test can't pass, fix the test or fix the code, never skip.

## Constraints (do not violate)

- Never push to main (per CLAUDE.md memory).
- Re-verify `git branch --show-current` before every commit — other
  worktree sessions can switch branches underneath this one.
- Only commit test files + this planning file. Don't commit `bun.lock`
  changes or anything else.
- sd2026 lives at `simplerdevelopment2026/` subdir within the worktree.
