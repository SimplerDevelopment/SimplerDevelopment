---
type: index
date: 2026-08-05
---

# Daily Logs

One of only three kinds of standalone document that exist in this project —
ADRs, daily logs, and the glossary. See
`vault/04 - Decisions/ADR code-is-the-source-of-truth.md`.

## Two layers, on purpose

- **claude-mem (automatic).** Captures episodic session history on commit and
  session end. It is the raw record — complete, unfiltered, queryable via
  `mem-search` or the `S###` IDs in the SessionStart hook. Don't curate it.
- **This folder (hand-written).** A short distillation of what actually
  mattered, for a human reader. claude-mem answers "what happened"; a daily log
  answers "what was worth remembering".

The distinction matters because the raw log is too long to read and too
undifferentiated to skim.

## What belongs in an entry

Write one when a session produced insight that outlives it but isn't a decision
(that's an ADR) and isn't vocabulary (that's the glossary):

- A wrong assumption that cost real time, and what corrected it.
- A failure mode discovered the hard way — especially one that looked like
  something else.
- Work deliberately left undone, and the condition for picking it up.

**Not** a changelog. Git already has that. If an entry could be reconstructed by
reading `git log`, it isn't worth writing. A day that produced nothing durable
needs no entry.

## Convention

- One file per day: `YYYY-MM-DD.md`, with `type: log` in frontmatter.
- Link the ADRs and commits it refers to.

```dataview
TABLE date, status
FROM "01 - Daily Logs"
WHERE type = "log"
SORT date DESC
```
