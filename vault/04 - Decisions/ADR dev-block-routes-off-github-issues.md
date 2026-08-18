---
type: adr
domain: agent-harness
status: accepted
date: 2026-06-09
sources:
  - .planning/handoffs/2026-06-04-agent-harness-hardening.md — "dev-block repointed off STATE.md"
  - .planning/dev-block-goal.md — current goal format
  - .planning/STATE.md — described as "RETIRED tombstone" in handoff
---

# ADR: dev-block loop reads task source from GitHub issues (label:claude), not STATE.md

## Status

Accepted — backfilled 2026-06-09 from
`.planning/handoffs/2026-06-04-agent-harness-hardening.md`.

## Context

The autonomous `dev-block` loop iterates on code changes without human supervision.
It previously read its task queue from `.planning/STATE.md` — a markdown file
maintained manually and committed to the repo. This created two problems:

1. `STATE.md` became a source of doc drift. At the time of the June 2026 harness
   hardening it simultaneously claimed 100% and 0% completion for the same surveys
   milestone (contradictory state). The `dev-block` loop was reading a document that
   no longer accurately reflected intent.
2. The file had to be hand-edited and committed to update the task queue, which added
   friction and meant the loop's task source was not integrated with the rest of the
   project's issue-tracking workflow.

## Decision

The `dev-block` skill reads its primary task source from **GitHub issues with the
`label:claude` label** (via the GitHub MCP or API). The current iteration goal is
separately recorded in `.planning/dev-block-goal.md` as a structured YAML+markdown
file that can be edited locally without affecting the GitHub issue tracker.

`.planning/STATE.md` was retired as a task queue and converted to a tombstone
documenting that it is no longer the active task source.

The loop also enforces a strict per-iteration QA gate via `scripts/dev-block-loop.sh`
(`SIMPLERDEV_QA_GATE_TESTS=1` + `SIMPLERDEV_QA_GATE_BLOCK=1`).

## Consequences

- Tasks visible in the GitHub issue tracker with `label:claude` are candidates for
  autonomous execution.
- The handoff between human-created issues and the autonomous loop is explicit and
  auditable (issue comments, PR links).
- `dev-block-goal.md` still exists for single-session overrides and to specify a
  `success_test` shell command that acts as a termination condition.
- `STATE.md` should not be resurrected as a task queue; it is kept as a tombstone for
  historical context.

## Alternatives considered

STATE.md was the prior approach. The handoff document records the change rationale:
"dev-block repointed off STATE.md to GitHub issues (`label:claude`) as primary task
source." No other alternatives were evaluated in writing.

## Related

- [[Agent Harness]]
