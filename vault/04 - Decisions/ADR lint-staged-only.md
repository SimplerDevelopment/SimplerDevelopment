---
type: adr
domain: ci
status: accepted
date: 2026-06-09
sources:
  - commit c284e650 (chore(ci): drop lint from pre-push gate (OOMs locally))
  - commit 3c1b659e (chore(ci): raise tsc heap to 4 GB, drop lint from pre-push gate)
  - tests/CI-GATES.md — "Lint" gate description + informational dead-code section
  - scripts/check-file-budget.ts header comment (context for staged-vs-full gating)
---

# ADR: Whole-repo lint demoted to informational; staged-files lint is the blocking gate

## Status

Accepted — backfilled 2026-06-09 from commits `c284e650`, `3c1b659e`, and
`tests/CI-GATES.md`.

## Context

Running ESLint across the full 357k-line codebase in the pre-push hook consistently
caused the Node.js process to exhaust memory (OOM) on developer hardware. The repo also
carries a lint backlog — pre-existing violations that accumulated before lint was
enforced — meaning a full-repo pass would block every push until the entire backlog is
cleared.

Blocking all pushes on a full-repo OOM was untenable; silently skipping the gate would
leave new errors undetected.

## Decision

Lint is split into two tiers:

1. **Per-commit staged-files lint (blocking):** `.githooks/pre-commit` runs ESLint on
   only the files staged for the current commit. New lint errors in touched files are
   blocked before they land. This runs in seconds and does not OOM.
2. **Full-repo lint (informational only):** `bun run lint` can be run manually.
   `scripts/ci-local.sh` labels it `info` (not `step`), meaning a failure prints a
   warning but does not exit non-zero. The goal is to burn down the backlog commit-by-
   commit over time; once the repo passes cleanly the gate can be promoted to blocking.

## Consequences

- New lint errors in files you touch are caught immediately at commit time.
- Pre-existing lint violations in untouched files do not block pushes.
- The total lint backlog is only visible by running `bun run lint` manually; it is not
  surfaced on every push.
- A developer who edits a file with pre-existing violations in the same commit will be
  required to fix those violations before committing.

## Alternatives considered

Commit `c284e650` records the direct cause: "ESLint is enforced per-commit via
pre-commit hook on touched files. Full-repo lint can be run manually; it OOMs the
pre-push hook." No alternative splitting strategy was evaluated in writing.

## Related

- [[Auth & Security]]
