---
type: architecture
domain: agent-harness
status: active
date: 2026-06-09
sources:
  - CLAUDE.md
  - .claude/index.md
  - CLAUDE.md
  - scripts/check-doc-drift.ts
  - scripts/check-file-budget.ts
  - .dependency-cruiser.cjs
  - knip.json
  - .githooks/pre-commit
  - .githooks/pre-push
  - scripts/ci-local.sh
  - scripts/dev-block-loop.sh
  - graphify-out/GRAPH_REPORT.md
---

# Agent Harness

This note describes how AI agents are expected to operate in this repository — the navigation system, context discipline rules, fitness functions, gate structure, orchestration hierarchy, and autonomous loop. It is the vault-side companion to `CLAUDE.md`; rules live there, architectural intent lives here.

## Navigation system

The primary entry point for any agent session is `CLAUDE.md` (root) which defers to `.claude/index.md` for fine-grained routing. The index maps "I need to work on X" to the correct nested `CLAUDE.md`, skill, or guide file. Nested `CLAUDE.md` files sit at the roots of each major sub-tree:

| File | Area covered |
|---|---|
| `app/portal/CLAUDE.md` | Tenant UI routing, site-resolver, API envelope, god-file warnings |
| `app/admin/CLAUDE.md` | Global admin panel patterns, super-admin guards |
| `lib/blocks/CLAUDE.md` | Block registry, universality invariant |
| `lib/mcp/CLAUDE.md` | Tool registrar pattern, scope guards, token-budget rules |
| `lib/db/CLAUDE.md` | Drizzle migration workflow, tenancy invariants |
| `lib/ai/CLAUDE.md` | Company Brain / embeddings / RAG, 70%-coverage floor |
| `components/portal/visual-editor/CLAUDE.md` | postMessage protocol, god-file warnings |
| `tests/CLAUDE.md` | Layer responsibilities, gate commands, layer-picking rule |

The rule is: read the nearest `CLAUDE.md` before opening any file in that subtree. Never speculate across the index.

## Context discipline

The repo is ~357 k LOC. Agents are explicitly forbidden from reading files >500 lines into the main thread without spawning a subagent. Each nested `CLAUDE.md` lists the god files in its domain (e.g., `lib/mcp/tools/cms.ts` at 2 216 lines, `lib/brain/mcp-sdk-adapter.ts` at 5 630 lines). For broad cross-cutting questions the preferred path is `graphify-out/` (a pre-built knowledge graph; see below) rather than grep.

## Fitness functions (automated invariant checks)

Four tools enforce architecture invariants as machine-checked rules, not conventions:

**`scripts/check-doc-drift.ts`** — scans nav docs (`CLAUDE.md`, `.claude/index.md`, `tests/CI-GATES.md`) and all skills for inline-code path references. It asserts existence, detects known-relocated paths (e.g., the old monolithic schema module, now split per-domain under `lib/db/schema/`), and validates god-file line-count annotations against reality. Dead pointers in agent-facing docs cause every future agent to follow them; this gate prevents silent rot.

**`scripts/check-file-budget.ts`** — implements a god-file ratchet. Files above 500 lines are pinned in `.file-budget.baseline.json`; pinned files may only shrink. New files must come in under 800 lines. The baseline is regenerated intentionally after a refactor with `bun scripts/check-file-budget.ts regen`.

**`.dependency-cruiser.cjs`** — encodes the three-audience route-tree invariant (`app/admin`, `app/portal`, `app/sites`/`app/s` must not import each other), the blocks-are-universal rule (blocks may not depend on `app/`), and `lib/-must-not-import-app`. Violations are `error` severity, blocking merge. Circular dependencies are `warn` (existing debt being ratcheted down). Run via `bunx depcruise app lib components --config .dependency-cruiser.cjs`.

**`knip.json`** — dead-code detection across the monorepo. Configured with Next.js entry points, script and worker roots, and test globs. Currently runs as an informational step in `scripts/ci-local.sh` (not a hard gate), surfaced as `bunx knip --no-exit-code`. See [[Gate Picking]] for gate promotion criteria.

## Git hooks and CI gates

`.githooks/pre-commit` runs fast per-commit checks on staged files: ESLint on changed `.ts`/`.tsx` files (errors only — existing warning backlog is exempt), file-size budget, and doc-drift. It is designed to complete in seconds. One-off bypass: `git commit --no-verify`.

`.githooks/pre-push` runs the full local CI sequence via `scripts/ci-local.sh`: dependency-cruiser boundaries, file-size budget, doc-drift, typecheck of the committed HEAD (in an isolated git worktree to prevent untracked WIP from influencing the result), and unit tests. It conditionally adds the tenancy gate when pushed changes touch `lib/db/`, `app/api/`, or `lib/active-client.ts`. One-off bypass: `git push --no-verify`.

`scripts/ci-local.sh` is the sole-developer replacement for GitHub Actions. It exposes four modes:

- Default: boundaries + budgets + docs + typecheck + unit tests
- `--quick`: cheap checks only (seconds)
- `--tenancy`: adds multi-tenant leak regression (requires a DB)
- `--full`: adds critical E2E on top of tenancy

There are no GitHub Actions workflows in this repo. Local gates are the only CI in front of a push.

## Orchestration hierarchy

Agents operate in three tiers:

**Boss (Opus)** — plans, decomposes, reviews, decides. Handles ambiguous root causes, architecture trade-offs, security/auth/billing/tenancy-sensitive code, and any task where the spec is unclear. Does not do mechanical edits inline; delegates to Sonnet workers.

**Planner** — used via the `plan-then-delegate` skill: Opus plans and decomposes a larger task, then fans atomic units to Sonnet workers in parallel.

**Worker (Sonnet)** — executes a single well-scoped unit: mechanical edits, boilerplate, test writing for defined behavior, applying a diagnosed fix. Workers must not hold god files in their main thread; they are expected to spawn `Explore` subagents for broad searches.

**Escalation contract** — a worker that hits a design decision, unknown root cause, out-of-scope file, or un-fixable test failure must stop and return `ESCALATE:` with: (1) what was completed, (2) where it got stuck, (3) why it exceeds worker scope, (4) the exact file/line/error/decision needed, (5) a recommended next step. The boss picks it up from there with the worker's findings as a head start.

## Session memory

claude-mem is the running retro for autonomous (dev-block) sessions. It captures specific footguns, error messages, commands, and confirmed patterns that would have saved a session 30 minutes if present at the start. Query it at session start when running unattended. Rules graduate to `CLAUDE.md` once they are stable enough to be mandated.

## Knowledge graph

`graphify-out/` holds a pre-built Obsidian-compatible knowledge graph of the codebase (52 857 nodes, 90 005 edges as of 2026-06-09, built from commit `90f839cb`). `graphify-out/GRAPH_REPORT.md` is the index. The graph is preferred over grep for broad cross-cutting structural questions. It is updated with `graphify update .` after significant code changes (no API cost for incremental updates).

## Prompt intake (complex requests)

For prompts carrying substantial instruction or a big/cross-cutting change (multi-step,
architectural, touches multiple domains or many files, or has ambiguous scope), two
pre-work steps are mandatory before any plan or edit:

1. **Restate the request grounded in the current codebase only.** Surface where the ask
   meets, conflicts with, or is already partly solved by real routes, schema, helpers,
   and invariants in the repo — not training priors. Read/Explore first if needed.
2. **Auto-invoke `/grill-me`.** Run the skill to interview through the decision tree
   and resolve open branches before writing code.

Trivial or fully-specified single-file edits are exempt. When unsure whether a prompt
qualifies, treat it as qualifying. Full rule text lives in `CLAUDE.md` (project root)
under "Prompt intake."

## Autonomous loop

`scripts/dev-block-loop.sh` is the hands-off development driver. Each iteration: checks out into a worktree, invokes the `dev-block` skill via `claude -p`, parses the JSON result, journals it, reflects on failures, and compacts periodically. It stops on `finished: true`, a passing success test, or an iteration cap. A kill switch at `.claude/.runtime/dev-block/STOP` exits cleanly at the next iteration boundary. The loop auto-merges the PR when the goal is met and all four gates pass; otherwise it leaves the PR for human review. The plan doc that described this workflow has been retired; the loop script and the `dev-block` skill are the source of truth.
