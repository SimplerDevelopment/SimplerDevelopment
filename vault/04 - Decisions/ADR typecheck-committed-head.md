---
type: adr
domain: ci
status: accepted
date: 2026-06-09
sources:
  - tests/CI-GATES.md — "tsc --noEmit on the committed HEAD in a tmp worktree"
  - commit 310eead6 (fix(build): revive standalone git-hook gates + HEAD-tree typecheck)
---

# ADR: Typecheck the committed HEAD, not the working tree

## Status

Accepted — backfilled 2026-06-09 from `tests/CI-GATES.md` and commit `310eead6`.

## Context

The pre-push gate runs `tsc --noEmit` to catch type errors before code reaches the
remote. When this check runs against the working tree, untracked or unstaged files —
test scripts, local prototypes, mid-refactor scratch files — can cause the check to
fail even though the committed code is clean. This creates friction: developers with
WIP files on disk cannot push clean, committed work without resolving unrelated errors.

The converse is also a risk: uncommitted type-correct stubs can mask errors in the
committed state, producing a false green.

## Decision

The typecheck gate in `scripts/ci-local.sh` clones the committed HEAD into a throwaway
`git worktree` and runs `tsc --noEmit` there:

1. `git worktree add <tmpdir> HEAD` — exact committed snapshot.
2. `node --max-old-space-size=6144 node_modules/.bin/tsc --noEmit` — 6 GB heap required
   for the 357k-line codebase; lower values OOM.
3. Worktree is removed after the check regardless of result.

If the worktree cannot be created the gate **hard-fails** rather than falling back to
the working tree, ensuring the check is never silently skipped.

## Consequences

- WIP files on disk do not affect the gate. A developer can leave mid-edit files
  unstaged and still push committed work cleanly.
- The gate checks exactly what would be deployed — no more, no less.
- The 6 GB heap requirement means the gate cannot run on machines with less RAM;
  the gate will OOM and fail rather than produce an incorrect result.
- Worktree creation adds a few seconds of overhead on every push.

## Alternatives considered

Rationale for rejecting a working-tree check is implicit in commit `310eead6`:
"untracked WIP can't fail a clean push." No alternative was formally evaluated.

## Related

- [[Deployment Topology]]
