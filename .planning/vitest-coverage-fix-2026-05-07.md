# Vitest 4.x Integration-Coverage Emission — Diagnosis & Fix

**Date:** 2026-05-07
**Branch:** `fix/vitest-4-integration-coverage-bug`
**Status:** Fixed (Path A — local one-line config change + dependency alignment)

## Symptom (from project memory)

> In `vitest@4.0.18`, integration-test coverage emission is broken when any
> test in the suite fails. When a single integration test errors, the v8
> coverage data isn't written; only when all tests pass does coverage get
> emitted. Unit-only coverage works fine.

This is a real blocker for measuring coverage in sd2026 because the
integration suite is in active development and rarely 100% green.

## Reproduction

Setup:

- `vitest@4.1.5` (installed) + `@vitest/coverage-v8@4.0.18` (installed); the
  package.json declared `^4.0.18` for vitest, which `bun install` resolved up
  to 4.1.5; coverage-v8 was pinned exact at `4.0.18`. **First side-finding:**
  vitest itself prints a warning at startup:
  > Loaded vitest@4.1.5 and @vitest/coverage-v8@4.0.18. Running mixed versions
  > is not supported and may lead into bugs. Update your dependencies and make
  > sure the versions match.
- An aligned 4.1.5 install in a scratch project at
  `/private/tmp/vitest-coverage-repro` reproduces the bug too — so version
  alignment alone does not fix it.

Two fixture tests added under `tests/unit/_repro_coverage/`:

- `passing.test.ts` — exercises one branch of `lib/utils/blockIcons.ts`.
- `failing.test.ts` — exercises a different branch and then asserts
  `expect(1).toBe(2)` (deliberate failure).

Runs (with `--coverage --coverage.include='lib/utils/blockIcons.ts'`):

| Suite                  | Result        | `coverage/` dir | Coverage report |
|------------------------|---------------|------------------|-----------------|
| `passing.test.ts` only | 1 pass        | created          | 60% / 75% lines |
| both files             | 1 pass / 1 fail | **NOT CREATED**| **none emitted** |

## Diagnosis

The bug is **not** a version-mismatch artefact and is **not** a regression in
4.0.x → 4.1.x. It's an intentional default in vitest's coverage flow.

In `node_modules/vitest/dist/chunks/cli-api.Cjt90eJu.js` (lines 13900–13909
in vitest@4.1.5):

```js
async reportCoverage(coverage, allTestsRun) {
  if (this.state.getCountOfFailedTests() > 0) {
    await this.coverageProvider?.onTestFailure?.();
    if (!this._coverageOptions.reportOnFailure) return;   // <-- early return
  }
  if (this.coverageProvider) {
    await this.coverageProvider.reportCoverage(coverage, { allTestsRun });
    ...
  }
}
```

The `coverage.reportOnFailure` option defaults to `false`. When any test
fails, vitest skips writing the coverage report unless this flag is `true`.
This is documented at https://vitest.dev/config/#coverage-reportonfailure
(behaviour was introduced in vitest 2.x and persists through 4.x).

So: the user's report — "coverage is broken when any test fails" — is
behaviourally accurate, but the upstream view is "this is the configured
default; flip the flag." Two issues compound it:

1. The default is opt-in (off), but the failure mode is silent — no warning,
   no log line, the coverage directory simply isn't created. Easy to
   misdiagnose as an emission bug.
2. The vitest@4.1.5 + @vitest/coverage-v8@4.0.18 version split prints an
   unrelated "may lead into bugs" warning at startup, which made the missing
   coverage look like the foretold mixed-version problem.

## Path chosen: A (local fix)

One-line config change in `vitest.config.ts` plus dependency alignment.

### Changes

1. `vitest.config.ts` — added `reportOnFailure: true` to the coverage block,
   with a comment explaining why we flip it (sd2026 integration suite is
   rarely 100% green; without this we can't measure coverage at all).

2. `package.json` — bumped `@vitest/coverage-v8` from `4.0.18` (exact) to
   `^4.1.5` and `vitest` from `^4.0.18` to `^4.1.5`, so the two ship aligned
   and the runtime warning goes away. **Note:** `bun.lock` is not regenerated
   in this commit (CLAUDE.md flags bun.lock as a don't-touch zone). The
   lockfile will be refreshed on the next `bun install` and will pick up
   matched 4.1.5 versions automatically.

## Verification

After the fix, against the actual sd2026 vitest config:

```
$ npx vitest run --project=unit \
    tests/unit/_repro_coverage/passing.test.ts \
    tests/unit/_repro_coverage/failing.test.ts \
    --coverage --coverage.reportsDirectory=coverage/repro-fail \
    --coverage.include='lib/utils/blockIcons.ts' \
    --coverage.reporter=json-summary --coverage.reporter=text-summary

Test Files  1 failed | 1 passed (2)
Tests  1 failed | 1 passed (2)

% Coverage report from v8
Statements   : 60%    ( 3/5 )
Branches     : 50%    ( 1/2 )
Functions    : 33.33% ( 1/3 )
Lines        : 75%    ( 3/4 )
```

`coverage/repro-fail/coverage-summary.json` is now written, with the failing
test's branch coverage included (note the higher Statements% vs. passing-only
run: the failing test exercised a different code path before throwing).

Same verification was repeated against the `integration-ui` project (same
vitest config, jsdom env) — coverage emits on failure there too. The
`integration-api` project shares the same coverage block in `vitest.config.ts`
so the fix applies identically; that project requires a live test DB to run,
which is out of scope for this verification but the configuration path is
proven by the integration-ui run.

The repro fixtures under `tests/unit/_repro_coverage/` and
`tests/integration/_repro_coverage/` were removed before commit.

## Upstream issue

Not filed. The behaviour is documented and intentional. If we want to push
upstream for a saner default (or a warning when coverage is silently
suppressed), we can do so independently — the option name is
`coverage.reportOnFailure` and the relevant vitest source is
`packages/vitest/src/node/core.ts` (search for `reportCoverage`).

## Side-effects / follow-up

- The runtime warning about mixed versions will go away once `bun install`
  resolves coverage-v8 to 4.1.5. Until then, the warning is harmless.
- We may want to add a CI guard that asserts `coverage.reportOnFailure` is
  `true` so a future config edit doesn't silently re-break coverage on
  failure.
- The `c8 check-coverage` gate at the bottom of `scripts/test.sh` reads from
  `coverage/.v8-merged`, which is populated by the E2E layer's
  `NODE_V8_COVERAGE` env var, not by the vitest coverage flow. The fix here
  is scoped to the vitest unit/integration coverage emission only.
