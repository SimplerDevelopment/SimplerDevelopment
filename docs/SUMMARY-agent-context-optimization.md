# Agent Context Optimization — Summary

**Branch:** `feat/agent-context-optimization`
**Worktree:** `<worktree>/sd2026-agent-context`
**Authored:** 2026-05-20 (overnight autonomous run)

## What this branch does

Reorganizes agent-facing context (CLAUDE.md, skills, docs) to match 2026 best-practice literature on AI-agent productivity in large codebases (~357k LOC monorepo). All changes are documentation / `.gitignore` / file moves — **zero application code touched, zero runtime risk**.

## Outcome (concrete)

Before this branch, an agent starting a session in `app/portal/websites/[siteId]/posts/[id]/edit/` had to:

1. Read root `CLAUDE.md` (150 lines)
2. Spelunk `lib/`, `components/`, `app/api/` looking for conventions
3. Maybe read `BLOCK_EDITOR_GUIDE.md` (~14k chars) speculatively
4. Probably load 2000-line `BlockContentEditor.tsx` to see "how things work"

After this branch:

1. Root `CLAUDE.md` (~150 lines) loads automatically
2. The nearest nested `CLAUDE.md` (~50 lines each) loads automatically — gives the area's invariants + which skill to use + which god files to NOT read
3. `.claude/index.md` provides "I want to do X → load Y" routing
4. Agent operating rules in root CLAUDE.md make subagent-spawning the default for >500-line files

## Files changed

### Added (8)

- `.claude/index.md` — agent navigation (by-area / by-task / by-question routing)
- `app/portal/CLAUDE.md` — tenant routing, site-resolver, god-file list
- `lib/blocks/CLAUDE.md` — "blocks are universal" invariant, lockstep checklist
- `lib/mcp/CLAUDE.md` — tool registrar pattern, scope guards, baseline test
- `lib/db/CLAUDE.md` — Drizzle migration workflow, tenancy invariants, footguns
- `components/portal/visual-editor/CLAUDE.md` — postMessage protocol, god-file list
- `tests/CLAUDE.md` — layer responsibilities, gate commands
- `docs/agent-context-audit.md` — read-only audit of skills duplication, god files, vendored modules

### Modified (2)

- `CLAUDE.md` — added "Agent operating rules" section (index pointer, >500-line subagent rule, graphify-first guidance); added nested-CLAUDE.md list to Pointers
- `.gitignore` — explicit `/edit-*.png` / `/editor-*.png` patterns (redundant with `*.png` but matches CLAUDE.md "Don't-touch zones" symmetrically)

### Moved (4)

- `SD-AUTHORING-SKILLS.md` → `docs/skills/SD-AUTHORING-SKILLS.md`
- `SD-DEVELOPER-SKILLS.md` → `docs/skills/SD-DEVELOPER-SKILLS.md`
- `SD-EDIT-SKILLS-PROPOSAL.md` → `docs/skills/SD-EDIT-SKILLS-PROPOSAL.md`
- `SD-SKILLS-OVERVIEW.md` → `docs/skills/SD-SKILLS-OVERVIEW.md`

(Cross-references between SD-AUTHORING and SD-DEVELOPER are by bare filename and stay valid since they now sit in the same dir.)

## Explicitly NOT done (deferred to follow-up PRs)

Captured in `docs/agent-context-audit.md`:

1. **God-file splits** — `BlockContentEditor.tsx` (2018), `lib/mcp/tools/cms.ts` (2184), and 8 others over 1400 lines. Each split needs human review and its own PR.
2. **Skills dedupe** — 10 sd-* skills are identical in both `~/.claude/skills/` and `.claude/skills/`. Recommend a symlink strategy in a follow-up PR. No drift yet — safe to defer.
3. **Workspace-ifying vendored apps** — `components/booking-app`, `extension/`, `workers/email-inbound`, `packages/sdk` each carry own `node_modules`, polluting search results. Out of scope for context-only PR.
4. **More nested CLAUDE.md files** — `app/admin/`, `app/sites/`, `lib/brain/`, `lib/crm/`, `workers/`, `scripts/`. Lower-priority than the six in this PR.

## How to validate

```bash
# In the worktree:
cd <worktree>/sd2026-agent-context/simplerdevelopment2026
npx tsc --noEmit   # should pass (no code changes)
bun run lint       # should pass (no code changes)
```

A new Claude Code session opened in this worktree should:
- Surface the root CLAUDE.md "Agent operating rules" section near the top of its system context
- Auto-load `app/portal/CLAUDE.md` when working in any portal route
- Auto-load the nested file when working in `lib/blocks/`, `lib/mcp/`, `lib/db/`, `components/portal/visual-editor/`, `tests/`

## Sources (best-practice references)

- [Anthropic Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Create custom subagents — Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Writing a good CLAUDE.md — HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [Context engineering for large codebases — Packmind](https://packmind.com/context-engineering-ai-coding/context-engineering-large-codebases/)
