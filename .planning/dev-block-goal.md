---
# Goal definition for the pure self-improving dev-block loop (scripts/dev-block-loop.sh).
# Edit this file before kicking off a loop session.

# One-line description of the desired outcome. Becomes the PR title prefix.
goal: "Add unit tests for lib/ssrf-guard.ts validateWebhookUrl (issue #3)"

# Optional shell command. Exit 0 = goal met → loop terminates and attempts auto-merge.
# Leave as "false" (or remove) to rely solely on the dev-block skill's own finished:true.
# Examples:
#   success_test: "bun test:critical -- tests/e2e/onboarding.spec.ts"
#   success_test: "! grep -rn 'TODO(claude)' lib/ src/"
#   success_test: "tsc --noEmit && bun run lint"
success_test: "test -f tests/unit/lib/ssrf-guard.test.ts && bun test tests/unit/lib/ssrf-guard.test.ts"

# Hard caps — loop exits cleanly when either is hit.
max_iterations: 8
max_cost_usd: 50

# Compact learnings.md every N iterations (0 = disable).
compact_every: 10

# Model alias for the dev-block iterations themselves.
# - opus:   default, deep planning + heavy edits
# - sonnet: cheaper, fine for narrower well-shaped tasks
# - haiku:  triage / read-only loops only
model: "opus"
---

# Goal: SSRF guard tests at canonical path

## Why
GH issue #3. A comprehensive Vitest suite for `validateWebhookUrl` already exists at `tests/unit/ssrf-guard.test.ts` (~65 cases). It needs to live at `tests/unit/lib/ssrf-guard.test.ts` to mirror the source path under `lib/`, matching the convention used by other test files (e.g. `tests/unit/lib/...`).

## In scope
- [ ] Verify the existing test file at `tests/unit/ssrf-guard.test.ts` is comprehensive — list the categories it covers (scheme, port, userinfo, blocked hostnames, IPv4 ranges, IPv6 ranges, hostname normalisation).
- [ ] Move it to `tests/unit/lib/ssrf-guard.test.ts` (`git mv`).
- [ ] Confirm `bun test tests/unit/lib/ssrf-guard.test.ts` passes (all original cases).
- [ ] If you spot meaningful coverage gaps while reading, add them — but only after the relocation lands as its own atomic commit.
- [ ] All four gates green at end: typecheck, lint, critical, tenancy.

## Out of scope
- Don't refactor `lib/ssrf-guard.ts`.
- Don't touch unrelated tests, `.planning/STATE.md`, or other infrastructure files.

## Notes for the loop
- This is the second attempt; the first run's PR was closed. Branch is fresh from current main.
- The relocation should be a pure rename — `git diff` should show 0 net additions/deletions for the rename commit.
