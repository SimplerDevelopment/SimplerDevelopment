---
type: adr
domain: ci
status: accepted
date: 2026-06-09
sources:
  - tests/CI-GATES.md — "There is a GitHub origin remote, but no GitHub Actions / no remote CI"
  - commit 310eead6 (fix(build): revive standalone git-hook gates + HEAD-tree typecheck)
  - commit c284e650 (chore(ci): drop lint from pre-push gate (OOMs locally))
  - commit 3c1b659e (chore(ci): raise tsc heap to 4 GB, drop lint from pre-push gate)
---

# ADR: Local CI via git hooks instead of GitHub Actions

## Status

Accepted — backfilled 2026-06-09 from `tests/CI-GATES.md` and CI-related commits.

## Context

The repository pushes to a GitHub remote but the team operates as a single developer
with an autonomous-agent loop. Setting up GitHub Actions would add latency (remote
runner queue time), require secrets management on the server side, and provide no
additional isolation guarantee over a local gate. The codebase is a ~357k-line Next.js
monorepo; the full typecheck alone requires 6 GB heap and takes meaningful time.

An earlier incarnation of the hooks filtered on a `simplerdevelopment2026/` subdir that
no longer existed after the repo was extracted from a monorepo, silently making both
hooks no-ops (commit `310eead6` diagnosed and fixed this). The incident confirmed that
hook correctness must be actively validated, not assumed.

## Decision

All CI runs locally, enforced through `.githooks/` (installed via
`git config core.hooksPath .githooks`):

- **pre-commit** — fast gate: ESLint on staged files only, file-size budget check,
  doc-drift check. Runs in seconds.
- **pre-push** — full `scripts/ci-local.sh` gate: architecture boundaries
  (`bunx depcruise`), file-size budget, doc drift, typecheck (committed HEAD in a
  throwaway worktree, 6 GB heap), unit tests. Fires on every push to `origin`.

If GitHub Actions are ever adopted, `scripts/ci-local.sh` is already a self-contained
script that can serve as the workflow body with minimal wrapping.

## Consequences

- The only CI in front of a push runs on the developer's machine; a push from a machine
  without the hooks installed (e.g. a fresh clone that skips the setup step) bypasses
  all gates.
- Full-repo ESLint OOMs the pre-push gate on this codebase size (commit `c284e650`);
  lint is therefore a pre-commit-only staged-files gate, not a full-repo gate.
- The typecheck gate runs on the **committed HEAD** in a throwaway worktree (not the
  working tree) so that untracked or unstaged files cannot falsely block a clean commit.
- The tenancy regression gate is auto-added to the pre-push run when `lib/db/`,
  `app/api/`, or `lib/active-client.ts` appear in the push diff.
- Promotion to production requires a separate trailing gate (`scripts/promote-to-prod.sh`)
  because the slow suites (critical e2e + tenancy with a real DB) are deliberately kept
  off the push hot path.

## Alternatives considered

GitHub Actions were explicitly noted as a future option in `tests/CI-GATES.md`:
"To add server-side CI, port `scripts/ci-local.sh` into a `.github/workflows/` job
and list its steps as required status checks."

## Related

- [[Auth & Security]]
- [[Deployment Topology]]
