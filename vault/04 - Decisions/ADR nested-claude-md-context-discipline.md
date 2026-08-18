---
type: adr
domain: agent-harness
status: accepted
date: 2026-06-09
sources:
  - CLAUDE.md (root) — "Agent operating rules" section
  - docs/SUMMARY-agent-context-optimization.md — branch feat/agent-context-optimization
  - docs/agent-context-audit.md — Section 3 "Nested CLAUDE.md coverage"
  - .planning/handoffs/2026-06-04-agent-harness-hardening.md — commit f982a3240
---

# ADR: Nested CLAUDE.md files + agent context discipline as a load-bearing convention

## Status

Accepted — backfilled 2026-06-09 from `docs/SUMMARY-agent-context-optimization.md`
and root `CLAUDE.md` agent operating rules.

## Context

Before May 2026, a new agent session in any subdirectory of the ~357k-line monorepo
had only the root `CLAUDE.md` for orientation. To understand the conventions for a
specific area (e.g. the visual editor, or the MCP tools layer) the agent had to
speculatively read large files — sometimes the 2,000-line `BlockContentEditor.tsx` or
the 3,311-line `schema.ts` — before it could do any useful work. This consumed large
portions of the context window on orientation rather than implementation.

## Decision

Two complementary rules were codified in `feat/agent-context-optimization`
(2026-05-20) and are now enforced by convention:

**1. Nested CLAUDE.md files per area.**
Each high-traffic subtree carries its own `CLAUDE.md` (<80 lines, token-budgeted)
covering that area's invariants, god-file warnings, and which skill or subagent to use.
Established locations: `app/portal/`, `lib/blocks/`, `lib/mcp/`, `lib/db/`,
`components/portal/visual-editor/`, `tests/`, `app/admin/`.

**2. Context discipline rules in root CLAUDE.md.**
- Start with `@.claude/index.md` for "I need to work on X" → correct nested CLAUDE.md
  routing, not with grep.
- Before reading any file >500 lines, spawn a subagent. The main thread should not
  hold 2,000-line god files.
- For broad cross-cutting questions, prefer the knowledge graph in `graphify-out/`
  over open-ended grep when it exists and is recent.
- Do not read documentation speculatively.

## Consequences

- An agent starting in `app/portal/websites/[siteId]/posts/[id]/edit/` now loads the
  nested `components/portal/visual-editor/CLAUDE.md` automatically (50 lines) and
  receives the god-file warning before it can open `BlockContentEditor.tsx`.
- The root `CLAUDE.md` stays at ~150 lines; domain detail lives in the nearest nested
  file.
- New areas added to the codebase should ship a nested `CLAUDE.md` as part of the
  feature PR, not as a follow-up.
- The `docs/agent-context-audit.md` lists follow-up nested files not yet written
  (`app/sites/`, `lib/crm/`, `workers/`, `scripts/`).

## Alternatives considered

The summary document (`docs/SUMMARY-agent-context-optimization.md`) references five
best-practice articles on context engineering for AI agents in large codebases as
the research basis. Speculative reading and flat single-file CLAUDE.md were the
status quo being replaced.

## Related

- [[Agent Harness]]
