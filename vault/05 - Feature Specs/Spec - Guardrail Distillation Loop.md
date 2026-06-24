---
type: spec
domain: agent-harness
status: shipped
date: 2026-06-24
sources:
  - .claude/workflows/distill-guardrails.js
  - scripts/distill-guardrails.sh
  - .claude/distill/guardrail-proposals-2026-06-24.md
  - .claude/rules/auth-surface.md
  - .claude/rules/tenancy.md
  - tests/unit/cron-registry-parity.test.ts
  - tests/helpers/assertMockUsed.ts
---

# Feature: Nightly Guardrail-Distillation Loop

## Overview

Developer-tooling for the agent harness. A nightly multi-agent workflow distills recurring mistake signals from three sources (learnings log, git reverts/fixups, claude-mem) into structured guardrail proposals, each typed by the cheapest durable enforcement rung (doc < lint < test < reviewer-persona). Nothing is auto-applied; the output is a human-review markdown report. The first run produced `.claude/distill/guardrail-proposals-2026-06-24.md` with 22 signals collapsed into 8 candidates, one of which (paid-module entitlement bypass) was confirmed as a live billing gap and closed in the same session.

Audience: internal (agent/developer workflow only). No portal end-user surface.

## Domain context

Read first: [[Agentic OS]]. This tooling lives in the agent harness layer (`.claude/` conventions, `scripts/` runners). Invariants: no auto-apply without human review; proposals reference real file paths; the workflow script is a Claude Workflow-tool script, not a cron handler.

## User stories

- As an agent harness maintainer, I want recurring mistake signals gathered from heterogeneous sources into one place so that patterns surface before they compound.
- As a developer, I want each proposal annotated with the cheapest viable enforcement mechanism (doc / lint / test / reviewer-persona) so I can pick the minimum intervention.
- As a developer, I want the loop to run nightly without manual invocation so the feedback cycle is continuous.

## Requirements

### Must have

- Three gather agents pulling from: (a) `.claude/learnings.md` QA-log + Mistakes-Avoided section, (b) git log filtering reverts and fixup commits, (c) claude-mem for session-level mistake patterns.
- A barrier step: no distillation until all three gather agents complete.
- An Opus distill agent that clusters signals across sources and proposes the cheapest durable rung per recurring mistake.
- A writer agent that emits a dated human-review report under `.claude/distill/`.
- Headless nightly runner (`scripts/distill-guardrails.sh`) compatible with launchd / cron (OS-level trigger; `CronCreate` is session-bound and cannot survive session end).
- Propose-only: no guardrail is applied by the loop itself.

### Nice to have

- Accept/reject UI for proposals (deferred — human edits the report and applies manually).
- Slack / notification dispatch on completion (deferred).

## Technical design

### Database changes

None. Output is `.claude/distill/guardrail-proposals-YYYY-MM-DD.md` (append, one file per run date).

### API changes

None.

### Portal / Admin UI

None.

### Public site / blocks

Not applicable.

### MCP exposure

None. This is a developer-tooling artifact.

## Scaffolds to use

None of the standard scaffolds apply (not a CRUD resource, not a block type, not an MCP tool). The workflow is `.claude/workflows/distill-guardrails.js` (140 lines), modeled on the Claude Workflow-tool script pattern in `CLAUDE.md` (dynamic workflows section).

## Validation plan

No automated gate — this is tooling infrastructure. Manual verification: run `scripts/distill-guardrails.sh` (47 lines) locally and confirm a dated report appears under `.claude/distill/`. The first production run (2026-06-24) produced `.claude/distill/guardrail-proposals-2026-06-24.md` (287 lines) with 22 signals → 8 candidates and confirmed one live billing bypass (see [[ADR paid-module-entitlement-vs-scope-gating]]).

## Harness guardrails also shipped this session

These are structural guardrails applied alongside the distillation loop, surfaced by or validated against it:

- `max-lines` ESLint warn @800 (tests exempt) — nudges god-file decomposition toward the `CLAUDE.md` 500-line spawn-subagent guideline.
- `scripts/test.sh` now prints the matching `vault/06 - Validation` runbook on a failed gate (tenancy → Tenancy Regression, critical → QA Flows, e2e → E2E Patterns, else Gate Picking).
- `tests/unit/cron-registry-parity.test.ts` (47 lines) — asserts `app/api/cron/` directories match `vercel.json` cron entries; prevents a cron route from being added without a matching schedule or vice versa.
- `tests/helpers/assertMockUsed.ts` (23 lines) + note in `tests/CLAUDE.md` — helper asserting a mock was actually called, preventing false-green tests that stub but never invoke.
- `.claude/rules/auth-surface.md` — new reviewer-persona rule (rate-limit credential endpoints, OAuth `state` CSRF, AES-256-GCM token storage; GitHub OAuth flagged as needing `state` CSRF).
- `.claude/rules/tenancy.md` updated — added atomic tenant-scoped ID generation and entitlement-gate requirement as explicit bullets.
- `lib/ai/CLAUDE.md` updated — eval suites must shadow classifier signatures.
- `lib/db/CLAUDE.md` updated — no hand-ALTER in production; use timestamptz not timestamp.
- `tests/unit/automation-action-scope-completeness.test.ts` (36 lines) — source-scans `lib/automation/engine.ts` (581 lines) for inline `action.tool === '...'` bridges and asserts each is in `AUTOMATION_ACTION_SCOPES`; prevents a new ungated bridge.

## Open questions

- Should the distillation loop write proposals to claude-mem in addition to the markdown file so they survive across sessions? (Low priority — the markdown file is already committed.)
- Should the lint rule for `resolveClientSite`-in-store-routes be implemented as a custom ESLint rule (the `auto-flag via lint rule` alternative in [[ADR paid-module-entitlement-vs-scope-gating]])? Deferred pending next distillation run.
