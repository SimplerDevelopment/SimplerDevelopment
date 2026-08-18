---
type: adr
domain: agentic-os
status: accepted
date: 2026-08-02
sources:
  - docs/agency-personas.md
  - .claude/agents/
  - CLAUDE.md (root) — model delegation policy
---

# ADR: Role-based Claude Code agent personas (not tech-based)

## Status
Accepted — 2026-08-02. Tracked on portal project 207 (APWD-001).

## Context
Claude Code work here was ad-hoc: one session doing everything, or delegating by technology. Delegating by *technology* (a "React agent", a "Node agent") makes every worker optimize the same objective — make the code work — so nothing independently optimizes for security, cost, product value, or maintainability. We wanted a durable "firm" of agents that make better decisions by each owning a different objective.

## Decision
Model the agent system as a digital-agency **org chart**, organized by professional role, not technology.
1. ~21 roles are real invokable agent files in `.claude/agents/*.md`; the rest of the ~45-role chart are documented "adopt-a-lens" personas the conducting session role-plays in-context (`docs/agency-personas.md`).
2. **Model tiering by cognitive load:** Opus for deciders/reviewers/architects, Sonnet for implementers, Haiku for mechanical work (matches the global "Opus decides, Sonnet does" policy).
3. **Read-only tool scoping enforces role boundaries structurally:** the 6 reviewer/architect agents declare a `tools:` list without Edit/Write/NotebookEdit, so "the Lead Architect never writes features" is a fact, not a guideline.
4. **The main Opus session conducts** — picks a pipeline path (full for features; light for bugs/refactors/content) and dispatches via the Agent tool. No new orchestration machinery; respects the 3-worktree cap + escalation contract.
5. Six personas wrap existing skills (simplerdev-code-review, security-review, simplerdev-test-gate-picker, simplify, huashu-design, simplerdev-release-manager) rather than reinventing them.

## Consequences
- New agents are cheap to add (one markdown file); promote an adopt-a-lens persona to a real file when it needs discrete work.
- Named agents load at session start — a file created mid-session isn't invokable as `subagent_type` until the next session (emulate via general-purpose + the persona meanwhile).
- The canonical, living spec is `docs/agency-personas.md`, not this ADR.

## Alternatives considered
- Tech-based agents (React/Node/etc.) — rejected: all optimize the same objective.
- All 45 roles as real files — rejected: heavy registry, many advisory/overlapping files that rarely fire; documented-as-lens + promote-on-demand is lazier and complete.
- A dedicated orchestrator agent / Workflow-tool scripts — rejected for routine use: the conducting main session needs no new machinery.

## Related
- [[Agentic OS]]
- docs/agency-personas.md (canonical spec)
