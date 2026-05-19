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
- **#5** — `test(crm): unit tests for pure parse/normalize helpers`
  - file: `tests/unit/crm-parse.test.ts` (57 tests)
  - covers: parseDisplayName (display-name parse, quote strip, multi-word
    last names, 1-token returns null lastName, whitespace collapse,
    100-char caps for first/last, fallback to email local-part with
    undefined/empty raw, case-insensitive equality, dot/underscore/hyphen
    split, 3+ token joining, "Unknown" fallback for both-empty,
    leading-@ smoke), normalizeDomain (empty/whitespace, lowercase,
    trim, http/https strip, path drop, www strip, combo), domainFromEmail
    (valid, normalize, no-@, double-@, trailing-@), capitalize (basic,
    no-op, no trailing lower, empty), isPersonalDomain (all 17 known
    domains + case-insensitivity + 4 non-personal + empty).
  - file was 0% covered in baseline. Now ~100%.
  - **Iteration #5 ALSO kicked off the first global coverage measurement**
    (vitest --project=unit --coverage). Results pending — will land in
    the tally table once the background run completes.

- **#4** — `test(chat,ai): rate-limit + AI-usage audit unit tests`
  - files: `tests/unit/chat-rate-limit.test.ts` (13 tests),
    `tests/unit/ai-audit.test.ts` (8 tests)
  - covers: `checkVisitorRateLimit` (1st hit / under-cap / 11th rejected /
    key isolation / window expiry / partial expiry / retryAfter math:
    correct + clamp-to-1 + ceil-up / `now` default / GC reset + GC
    preserves in-window entries), `recordAiUsage` (happy-path insert
    shape / tokens-as-string / both sources / period default = current
    UTC month / period override / error swallow / warn with context /
    no insert on failure).
  - both files were 0% covered in the baseline report.
- **#3** — `test(workflows): branch-coverage tests for runtime executor`
  - file: `tests/unit/workflows-runtime-branches.test.ts` (24 tests)
  - covers: workflow-not-found throw, triggeredBy default + override,
    wait clamping (zero / negative / maxWaitMs cap / positive),
    webhook non-2xx + throw + payload default + JSON serialize,
    walk's failed-step short-circuit + cycle guard,
    condition branching (true/false override + default-true + no-key +
    unlabeled-edge follow), send_email/add_to_list skip-with-todo,
    create_task no-clientId + no-project short-circuits,
    no-trigger-node failed run row + error echo, input cloning.
  - file's pre-iteration coverage: 61.3% lines / **28.6% branches** —
    after iter #3 should be substantially higher on branches (most
    uncovered branch paths exercised).
  - Skipped booking/assign + booking/capacity: their *pure* functions
    are already well-covered by existing tests; the *DB-coupled*
    functions would need full Drizzle chain mocks for marginal gain.

## Next-target candidates

Ranked by `(unit-friendliness × LOC × current-gap)`. Source: per-file
breakdown in `.planning/coverage-baseline-2026-05-08.md` + the report's
own follow-up list.

1. ~~`lib/esign/dropbox-sign.ts`~~ — covered by iteration #2.
2. ~~`lib/booking/assign.ts`~~ — pure function already covered; DB function deferred.
3. ~~`lib/booking/capacity.ts`~~ — pure function already covered; DB function deferred.
4. ~~`lib/workflows/runtime.ts`~~ — branches covered by iteration #3.
5. **`lib/email/render-blocks-to-email.ts`** — was 45.2% — should now be
   close to 100% after iteration #1. Skip unless re-measurement shows
   remaining gaps.

Named candidate list exhausted. **From iteration #4 onward**, pivot to
the **0%-coverage / large-LOC** pool. Strategy:

1. Run `npm run test:coverage` (or `vitest run --coverage`) once to
   emit `coverage/vitest/coverage-summary-unit.json` if it's not
   already present.
2. Parse that JSON for files in `lib/` with `lines.pct === 0` and
   `lines.total >= 50` (skip type-only files).
3. Prefer pure-functional helpers — anything that imports from
   `drizzle-orm`, `next-auth`, or `@/lib/db/schema` at module top is
   harder to unit-test (full Drizzle chain mock OR mock these modules).
4. Skip `app/api/**/route.ts` files — those need integration tests.
5. Also skip `app/**/*.tsx` (UI components) — they need
   `@vitest-environment jsdom` + react testing library, slower.

Other promising regions to scout (named here so next iteration doesn't
have to re-discover):
- `lib/agency/*.ts` — multi-tenant helpers, likely some at 0%
- `lib/ai/*.ts` — some unit-tested (plan-gate, resolve-client-key),
  others (audit) still 0%
- `lib/billing/*.ts` — usage-rollup tested, metered-items at 0%
- `lib/chat/*.ts` — token + realtime tested, rate-limit at 0%
- `lib/snapshots/*.ts` — types + util tested, export + import at 0%
  (probably DB-coupled though)
- `lib/automations/*.ts`, `lib/crm/*.ts`, `lib/pm/*.ts` — broad
  feature dirs with likely lots of pure helpers

## Coverage measurement cadence

Re-baseline every **5 iterations** (not every one — full-suite coverage
takes minutes). Drop a tally into this file when re-measured:

| Iter | Stmt% | Br% | Tests added | Files touched |
|---:|---:|---:|---:|---|
| 0 (baseline) | 4.89 | 4.34 | — | — |
| 1 | (not measured) | (not measured) | 100 | render-blocks-to-email |
| 2 | (not measured) | (not measured) | 36 | dropbox-sign |
| 3 | (not measured) | (not measured) | 24 | workflows/runtime |
| 4 | (not measured) | (not measured) | 21 | chat/rate-limit + ai/audit |
| 5 | **5.15** | **4.62** | 57 | crm/parse + first real measurement |

**Cumulative after 5 iterations:** +0.26pp statements / +0.28pp
branches / +193 unit tests (1039 → 1232). Hard data.

## Honest assessment — REVISED with real numbers (iteration #5)

**Measured, not estimated:** after 5 iterations, 193 new passing
unit tests, statement coverage moved **+0.26pp** (4.89% → 5.15%).

That is ~1 statement of coverage per new test on average. Far worse
than the estimate in the iter-4 note (which guessed 200–400 statements
per iteration). The error: I was counting *lines in the source file*,
not the *uncovered* lines a new test newly hits. Most files I picked
had existing tests already covering the bulk of the file; the marginal
gain per new test is small.

**Updated horizon:** to close the remaining ~17,900 statement gap at
the observed rate (≈1 stmt per new test), this loop needs ≈17,900 more
unit tests. At ~45 tests per iteration, that is ~400 more iterations.
At ~3 min compute each, ~20 hours of compute. **Not realistic.**

Real-talk on why:

Practical issue: most of the un-covered statement mass lives in regions
that don't unit-test cleanly — `app/api/**/route.ts` (NextAuth +
Drizzle + zod at the door), `app/**/*.tsx` (React + DOM), and large
chunks of `lib/` that import Drizzle at module top. The baseline
report itself flagged this: *"the integration tests are the layer
where most of the new feature coverage lives."*

**Realistic options the human may want to consider:**
1. **Lower the unit-only target** to ~10–12% — achievable in ~20–30
   more iterations of the current approach.
2. **Switch the bar to "unit + integration combined ≥ 30%"** — re-run
   coverage with the integration suite once the Postgres-deadlock issue
   from the baseline report is resolved on CI. Likely passes already.
3. **Keep the 30% bar, accept the long horizon** — ~80 iterations,
   many of which will need jsdom + RTL setup for components.
4. **Pivot to large `lib/` files only** — find the few 200+ LOC pure-
   functional helpers still at 0% and batch them in 2–3 per iteration.

This loop continues by default (option 3). If the human wants to
change tack, they can interrupt and re-prompt.

## Stop condition

Stmt% ≥ 30 AND Br% ≥ 25. When met, commit a final-tally row to this file
and stop the loop. Do **NOT** mark any new test file as `.skip` — if a
test can't pass, fix the test or fix the code, never skip.

**Iteration 5 will run an actual `vitest run --coverage` measurement**
to replace the "(not measured)" rows in the tally table — we've gone 4
iterations on dead reckoning; it's time for ground truth.

## Constraints (do not violate)

- Never push to main (per CLAUDE.md memory).
- Re-verify `git branch --show-current` before every commit — other
  worktree sessions can switch branches underneath this one.
- Only commit test files + this planning file. Don't commit `bun.lock`
  changes or anything else.
- sd2026 lives at `simplerdevelopment2026/` subdir within the worktree.
