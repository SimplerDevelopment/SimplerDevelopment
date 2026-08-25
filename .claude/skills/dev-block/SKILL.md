---
name: dev-block
description: "Autonomous development block session driven by n8n workflow for the simplerdevelopment2026 monorepo. Executes one iteration of work — picks a task from open GitHub issues (label: claude), implements it, runs gates, commits, returns structured JSON the n8n loop can route on. Use when invoked by the simplerdevelopment2026 dev-block n8n workflow or when the user says 'dev block', 'start dev session', 'autonomous development' inside this repo. Do NOT use for: manual coding sessions, one-off tasks, or debugging."
---

# Dev Block — simplerdevelopment2026

You are executing one time-boxed iteration of an n8n-orchestrated autonomous development loop. Each invocation is one "turn." You MUST return structured JSON so n8n can decide whether to loop again, fail, or finish. Read everything below before doing any work.

## Hard rules (read first, every time)

1. **JSON only output.** Your entire response must be a single valid JSON object. No markdown, no explanation, no prose. The n8n `Parse Response` node parses it with a regex that matches the first `{...}` containing `"finished"`.
2. **One meaningful task per iteration.** Do one thing well, commit, hand off. Don't fan out.
3. **Always commit.** Next iteration is a fresh, cold-cached Claude session — uncommitted work is lost work.
4. **Handoff prompts must be self-contained.** No "as I was saying" — the receiver has zero memory of this iteration.
5. **Honour all CLAUDE.md conventions.** Conventional commits, Bun (never npm), generated migrations only, etc. CLAUDE.md is already loaded in your context.
6. **Multi-tenancy is non-negotiable.** Run `bun test:tenancy` after any data-access change. A leak between clientId/siteId silently breaks production.
7. **Working in a worktree.** The n8n workflow has placed you in `.worktrees/dev` on a `claude/<topic>` branch. Stay there. Never `git checkout main`.

## Phase 1: Assess current state

### 1a. Load context

In this order:

1. **`.claude/learnings.md`** — running retro of mistakes/patterns from prior dev-block runs. Not tracked in this repo: it is written by the loop itself, so on a fresh clone it will not exist. If absent, skip it and create it when you first have a learning worth recording. If present, read the Confirmed Patterns and Mistakes Avoided sections and let them shape your decisions.
2. **The plan** — passed in as the prompt for the first iteration, OR as a `handoff_prompt` field in subsequent iterations.
3. **Repo state:** `git status`, `git log --oneline -10`, `git branch --show-current`. Confirm you are on `claude/*` and there's no uncommitted leftover from a prior crashed iteration.

### 1a.i. Recovery — handle a dirty worktree before doing new work

If `git status` shows uncommitted changes, you are picking up after a prior iteration that crashed mid-work. Decide carefully:

- **Changes look intentional and consistent with the handoff prompt** → commit them with a `wip(<scope>): recover from crashed iteration` message, then proceed with the next unit of work
- **Changes look partial / inconsistent / you can't explain them** → `git stash` them with a descriptive message (`stash@{0}: hands-off-recovery YYYY-MM-DD`) and start fresh from the next planned unit. Mention the stash in your `notes` so a human can recover it
- **Changes are clearly broken** (file syntax errors, half-written functions) → `git stash`; do NOT attempt to "fix" them blindly — you don't have the prior iteration's intent

Never `git reset --hard` (the firewall blocks it anyway). Never delete the worktree.

### 1b. Pick the task

Priority order (first match wins):

1. **Continuation:** if a prior iteration's handoff prompt names a specific task, do that.
2. **Open GitHub issues with the `claude` label** — `gh issue list --label claude --state open --limit 5` — pick the smallest one that fits in one iteration. **This is the primary task source.**
3. **Failing critical E2E** — `bun test:critical` and pick the first failing spec to fix.

(`.planning/STATE.md` is NOT a task source — the surveys-foundation milestone it tracked is retired. Drive work from GitHub issues.)

If nothing matches, return `finished: true` immediately — there's nothing to do.

**Never invent work.** If you can't find a clear unit, hand off with `blockers: ["No clear task found — needs human triage"]` and `finished: true`.

## Phase 2: Execute

### 2a. Implementation

Write production code. Use the existing scaffolding skills when applicable — they keep the schema/route/test stack in lockstep:

- `simplerdev-feature-scaffold` — new CRUD resources
- `simplerdev-block-type` — new block types for the visual editor
- `simplerdev-mcp-tool` — new MCP tools
- `simplerdev-ui-scaffold` — admin/portal UI for existing resources
- `e2e-writer` — Playwright spec authoring

Don't hand-roll patterns these skills already produce.

### 2b. Test the change you made

In order, run only what's relevant:

```bash
tsc --noEmit                                                # always after non-trivial edits
bun run lint                                                # always
bun test:critical                                           # always before declaring done
bun test:tenancy                                            # MANDATORY after any data-access change
```

If any test fails: fix it in this iteration if possible. If not, capture the failure in `blockers` and write a precise handoff prompt for the next iteration.

### 2c. Screenshots (only when UI changed)

Save to `.claude/.runtime/dev-block/screenshots/<feature>_<timestamp>.png`. Directory is gitignored. Don't commit screenshots — they go in the email summary.

### 2d. Commit

Atomic conventional-commit per logical change. Example: `feat(brain): add attachment dedup by content hash`. Never `git push` from inside this skill — n8n owns push and PR creation.

## Phase 3: Decide finished vs. continue

You are `finished: true` ONLY when ALL of these are true:

- Every item from the original plan is implemented
- All four gates pass: `tsc --noEmit`, `bun run lint`, `bun test:critical`, `bun test:tenancy`
- All work is committed
- No outstanding blockers

If ANY item is unfinished or any gate is red, you are `finished: false`.

When `finished: false`, the `handoff_prompt` is the ONLY thing the next iteration sees. Write it like a brief to a colleague who just walked into the room. Include:

- The original plan summary (for cold-start context)
- What this iteration just completed (with commit hashes)
- What remains, ranked
- The exact next task to pick up
- Any state-of-the-world snapshots needed (open file paths, error messages, working hypotheses)

## Phase 4: Return JSON

### Schema when NOT finished

```json
{
  "finished": false,
  "iteration_summary": "<what just happened, 1–2 sentences>",
  "tasks_completed": ["<specific item 1>", "<specific item 2>"],
  "tests_written": ["tests/e2e/foo.spec.ts", "tests/integration/api/bar.test.ts"],
  "commits": ["abc1234 feat(scope): summary", "def5678 fix(scope): summary"],
  "gates": {
    "typecheck": "pass | fail | skipped",
    "lint":      "pass | fail | skipped",
    "critical":  "pass | fail | skipped",
    "tenancy":   "pass | fail | skipped"
  },
  "tasks_remaining": ["<specific item 1>", "<specific item 2>"],
  "blockers": [],
  "handoff_prompt": "Continue the dev block for simplerdevelopment2026. PREVIOUS CONTEXT: <self-contained brief>. CURRENT BRANCH: claude/<topic>. NEXT TASK: <the precise next unit of work>. RUN BEFORE COMMITTING: tsc --noEmit, bun run lint, and (if data layer touched) bun test:tenancy. Respond with structured JSON via the /dev-block skill."
}
```

### Schema when FINISHED

```json
{
  "finished": true,
  "iteration_summary": "<this iteration's summary>",
  "session_summary": "<everything done across all iterations of this nightly run>",
  "tasks_completed": ["..."],
  "tests_written": ["..."],
  "commits": ["..."],
  "screenshots": [".claude/.runtime/dev-block/screenshots/foo_2026-04-29_03-12.png"],
  "gates": {
    "typecheck": "pass",
    "lint":      "pass",
    "critical":  "pass",
    "tenancy":   "pass"
  },
  "blockers_resolved": ["..."],
  "notes": "<anything the human reviewing the morning email should know>"
}
```

The `gates` object is read by the n8n workflow's `Tests Pass?` and `Auto-merge?` branches — all four must be `"pass"` for auto-merge to fire. Any `"fail"` keeps the PR open for human review.

## What NOT to do (lessons learned)

- Don't `git checkout main` or `git reset --hard` — the HANDS_OFF Bash firewall blocks both, but they wouldn't help anyway: you're in a worktree.
- Don't run interactive git modes (`-i` flags) — they hang the loop.
- Don't push or open PRs yourself — n8n owns that.
- Don't edit `drizzle/*.sql`, `bun.lock`, or `.planning/{STATE,ROADMAP,MILESTONES}.md` — denied by settings.json.
- Don't widen scope mid-iteration. If you discover related work, capture it in `tasks_remaining` and let the next iteration (or a human) decide.
- Don't skip `bun test:tenancy` after data-access changes — silent multi-tenant leaks are this codebase's #1 prod risk.
