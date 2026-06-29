---
type: adr
domain: ci
status: accepted
date: 2026-06-09
sources:
  - scripts/check-file-budget.ts — header comment + implementation
  - tests/CI-GATES.md — "File-size budget / god files" gate entry
  - docs/agent-context-audit.md — Section 4 "God files"
  - docs/SUMMARY-agent-context-optimization.md — "Files changed" section
---

# ADR: File-size budget ratchet — god files may shrink, never grow; new files capped at 800 lines

## Status

Accepted — backfilled 2026-06-09 from `scripts/check-file-budget.ts` and
`tests/CI-GATES.md`.

## Context

The codebase accumulated several extremely large files ("god files") before any size
enforcement existed. As of the agent-context-optimization audit (`docs/agent-context-audit.md`,
2026-05-20) the largest files were:

| File | Lines |
|---|---|
| `lib/mcp/tools/cms.ts` | ~2,184 |
| `components/portal/visual-editor/BlockContentEditor.tsx` | ~2,018 |
| `lib/brain/mcp-sdk-adapter.ts` | ~5,630 |

Each god file is a context-window tax: reading it into an agent's context consumes
tokens that could address actual work. Splitting all of them at once was judged too
risky to batch. Preventing new god files is cheap; shrinking existing ones requires
careful PRs.

## Decision

`scripts/check-file-budget.ts` (run as a CI gate via `bun scripts/check-file-budget.ts`)
enforces two rules:

1. **Ratchet on existing large files:** any `.ts`/`.tsx` file currently over 500 lines
   is recorded in `.file-budget.baseline.json` with its current size. The gate fails if
   that file grows past its recorded baseline. God files may shrink (good) but never
   grow (blocked).
2. **Hard cap on new files:** files not in the baseline must stay under **800 lines**
   (`NEW_FILE_CAP`). A new file exceeding 800 lines fails the gate immediately.

To intentionally shrink a god file and update its recorded baseline:

```bash
bun scripts/check-file-budget.ts regen
```

## Consequences

- Existing god files are grandfathered at their current size but cannot accumulate
  additional lines.
- New features cannot introduce a new file larger than 800 lines without triggering the
  gate. Features that genuinely need more should be split at authoring time.
- Incrementally refactoring a god file to smaller modules automatically lowers its
  baseline on the next `regen` run.
- The gate runs on every pre-commit (fast, file-count bounded) so it catches violations
  before a push.

## Alternatives considered

The `check-file-budget.ts` header comment explicitly describes the design intent:
"lets the existing 5k-line monsters stay (grandfathered) while guaranteeing they only
get smaller, and stops new god files from ever appearing." No alternative was evaluated
in writing.

## Related

- [[Agent Harness]]
