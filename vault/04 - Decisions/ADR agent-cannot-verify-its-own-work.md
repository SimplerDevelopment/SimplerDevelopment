---
type: adr
domain: projects-kanban
status: accepted
date: 2026-08-03
sources:
  - "If Agile Were Invented After AI and Agentic Coding (ChatGPT report, 2026) — principle 6"
  - lib/agent-flows/types.ts — findSelfReviewWarnings
  - .claude/skills/sd-run-flow/SKILL.md — "Check that nothing verifies its own work"
  - app/api/portal/projects/[id]/flows/[flowId]/route.ts — PUT returns warnings[]
---

# ADR: An agent may not verify its own work — advisory at authoring, blocking-ish at dispatch

## Status

Accepted 2026-08-03. Shipped in `ef56faa4`.

## Context

An agent grading its own output is not verification. The reasoning that produced a
mistake also produces a convincing proof of that mistake, and the run reports green
either way. This is the one defect class the delivery pipeline cannot catch by
itself — writing more tests does not help when the same agent writes them.

The source report states it as a principle: *"Independent verification is required
when the same agent or model produced both a change and its proof."* It also notes
that the code-producing agent should not be the sole oracle of correctness, and that
independence can come from a different agent, a different model, deterministic
analysis, a domain specialist, or production evidence.

The 2026-08-03 session that produced this ADR is its own evidence. Every real defect
found was caught by something *independent* of what produced it — a real database
rather than a mock (bigint-as-string), CI's schema export-parity baseline, the
file-size budget gate, and a human looking at a browser (a Tailwind 3 modifier on a
Tailwind 4 project that passed 15/15 CI while generating no CSS). None would have been
caught by additional tests authored alongside the code.

The Workflow Designer graph makes the failure mode drawable: nothing stopped an author
from wiring `backend-engineer` (build) → `backend-engineer` (labelled "review").

## Decision

Enforce in **two layers**, neither of which is sufficient alone.

**1. Runner check — `/sd-run-flow`, at plan time.** Before dispatching anything,
compare each verifying node's `agentType` against every node feeding it. On a match,
ask the user: offer an independent reviewer, and offer "run it as drawn" as an explicit
choice. Never silently proceed; never silently substitute a persona. Record the outcome
on the run as a `note` event whichever way it goes.

**2. Authoring warning — `findSelfReviewWarnings`, returned from `PUT`.** Rendered as
an amber advisory on the canvas. Never rejects, and is computed *after* the write.

## Why the split

The two layers see different things, and that difference is the whole design.

The **runner can read the node's `prompt`**, not just its `agentType`. A route handler
sees only the stored graph fields, so it cannot separate a genuine review step from two
sequential build steps. Forced to decide on `agentType` alone, an API-layer rule would
have to either reject legitimate flows or miss the real ones.

The **API layer catches it at authoring time**, when the author is present and can fix
it, rather than at 2am when a run is already moving.

## Why the API warning does not block

The detector is a keyword heuristic over author-written labels and roles. Same-persona
sequences are frequently correct: `backend-engineer` "scaffold" then `backend-engineer`
"wire it up" is a normal pipeline shape.

Failing a save on a heuristic would reject valid graphs and — worse — train authors to
word around the check. Amber, not red. A warning people learn to ignore is not a
warning, which is why 6 of the feature's 10 unit tests assert what must **not** flag.

## Why shared model is deliberately not flagged

The report says "the same agent **or model**". A shared model is not flagged here
because nearly every node in this repo runs the same tier, so the rule would fire on
every flow and teach everyone to click through. A different **persona** is treated as
satisfying independence — consistent with the report's own list, where "a different
model or agent" are alternatives rather than a conjunction.

## Consequences

- Self-review is visible at authoring time and interrupts at dispatch time.
- A flow saved via MCP and run outside `/sd-run-flow` gets only the authoring warning.
  Accepted: the runner is the execution path in practice.
- The heuristic will miss review nodes whose labels use vocabulary outside
  `VERIFY_WORDS`. Accepted — a miss costs a warning nobody sees; a false positive costs
  the credibility of every warning.
- `AgentFlowTab.tsx` hit its 800-line budget; the banner was extracted to
  `components/portal/agent-flow-warnings.tsx` rather than re-baselining the budget.
