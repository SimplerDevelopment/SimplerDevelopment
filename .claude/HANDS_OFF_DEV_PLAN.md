# Hands-Off Development Plan

**Goal:** Claude Code runs unattended (overnight, while-you-sleep), works on real tickets, tests its own output, learns from failures, and stays cheap. No babysitting.

**Started:** 2026-04-29.
**Status:** Plan only — nothing implemented yet from this doc. Existing infra: `dev-block` skill in `~/simplerdevelopment/.claude/skills/dev-block/`, two n8n workflows (`dev-block-development.json`, `dev-block-qa-testing.json`), `.claude/hooks/{guard-bash,touched-marker,stop-qa-gate}.sh`, GSD `/autonomous` workflow.

---

## North-star principles

1. **The loop owns state in files, not context.** `learnings.md`, `progress.txt`, git history. Each iteration starts cold and reads the world. Cheap, resumable, debuggable.
2. **Tier the model per task.** Haiku 4.5 for read/triage/cron-tick decisions. Sonnet 4.6 for implementation. Opus 4.7 only for plan + final review. Subagents declare `model:`.
3. **Cache hits are the budget.** Watch `cache_read / (cache_read + input)`; target >60%. Anything that mutates the system prefix every iteration (timestamps, "current branch") is a bug.
4. **Fail loudly and locally.** A bad iteration must abort before pushing, not after. Stop hook runs the gate; on failure → append failure note to `learnings.md`, force re-loop.
5. **Sandbox by default.** Devcontainer with restricted egress. Worktree isolation per ticket. Branch prefix `claude/` enforced. Main is never the target.
6. **Smaller atomic tasks.** Iteration drift compounds with task size. PRD items must fit in one iteration's output budget.

---

## Starter stack (in order — each unlocks the next)

### 1. Telemetry first — measure before changing anything ✅ instrumented (2026-04-29)

Before optimising, know the baseline. One iteration of dev-block currently costs $X over Y minutes with Z% cache-hit. We don't know any of those numbers.

- [x] `.claude/hooks/cost-log.sh` — SessionEnd hook, parses session JSONL, appends one summary line per session to `.claude/.runtime/cost-log.jsonl` (gitignored). Includes per-model breakdown, cache-hit ratio, estimated cost in USD using April-2026 published rates.
- [x] Wired into `.claude/settings.json` SessionEnd
- [x] `scripts/cost-summary.ts` — CLI to read the JSONL and print per-session + per-model + aggregate. `bun run scripts/cost-summary.ts [--since 7d] [--by-model] [--json]`
- [x] Smoke-tested on real sessions — works (sample run after this plan started: 2 sessions, 95.4% cache hit, $30.63 total)
- [ ] Run `dev-block` manually 2–3 times against a small ticket; capture the numbers in the Baseline table below (different cache profile than interactive sessions)

### 2. Fix cache-killers in the system prefix ✅ no action needed (2026-04-29)

Anthropic dropped prompt-cache TTL to 5 min in early 2026. Anything that varies per iteration in the cached prefix invalidates everything below it.

- [x] Audited CLAUDE.md, DATABASE.md, BLOCK_EDITOR_GUIDE.md, USER_MANAGEMENT.md, HOME_PAGE_FEATURES.md, tests/TESTING_PLAN.md, user-level CLAUDE.md, MEMORY.md — **no volatile content** in any prefix file
- [x] First baseline shows 95.88% cache-hit ratio — cache is healthy, no fix needed
- [x] The only volatile injections (`# currentDate`, `gitStatus`) are harness-managed by Claude Code itself, not editable from project config; they sit at the suffix of the system prompt so they only invalidate the tail, not the prefix

### 3. Tier subagent models ✅ retuned (2026-04-29)

Today every subagent inherits Opus. The Explore agent reading hundreds of files at Opus rates is the single biggest waste. *(Update after first telemetry: with cache-hit at 96%, the bulk of an Opus session's cost is cache reads at $1.50/MTok across millions of tokens — moving read-heavy work off Opus is still the highest-leverage win.)*

- [x] Retuned `~/simplerdevelopment/.claude/agents/*.md` — distribution now:
  - **haiku (4):** api-contract-validator, linting-agent, obsidian-note-taker, railway-deployer — pure read/mechanical
  - **sonnet (9):** block-implementer, design-system-manager, e2e-visual-tester, mcp-server-builder, nextjs-api-builder, performance-tester, postgres-prisma-optimizer, react-native-developer, stripe-payments — implementation
  - **opus (3):** block-orchestrator, project-orchestrator, security-auditor — planning, coordination, deep reasoning
- [x] System-level GSD agents (gsd-planner, gsd-doc-verifier, etc.) live in plugin-managed dirs, not user-editable .md files — out of scope for this step
- [ ] Set `MAX_THINKING_TOKENS=8000` as default in the dev-block n8n workflow's env (not project-wide — interactive sessions may want more); bump to 16K only inside planner subagents

### 4. Loop architecture — hybrid, not pure Ralph (revised 2026-04-29)

Pure Ralph (Stop-hook re-injection, official plugin) was the original recommendation but it doesn't fit this codebase: n8n already does the scheduling/observability/email-summary work well, the official plugin has documented hangs (v2.1.114–117) on `Edit .claude/skills/**`, and Ralph's single-track "grind one PRD" shape doesn't match a multi-feature monorepo. The hybrid below keeps what works and steals only what helps.

- [ ] **Keep n8n as outer loop driver** — scheduler, watchdog, parallel branch fan-out, morning email summary. Don't replace it.
- [ ] **Adopt Stop-hook re-injection ONLY for the inner loop** — within a single nightly batch on one ticket, when iteration N finishes and the gate fails, the Stop hook re-prompts Claude inside the same session instead of dropping back to n8n. Process stays warm across the 2–4 retries within one ticket. n8n still owns "start a new session" boundaries.
- [ ] **Run a Claude Code Routines pilot in parallel** (don't commit) — pick one well-shaped ticket class (e.g. "fix failing E2E spec", "add E2E for new endpoint"), wire it as a Routine triggered by a GitHub label or schedule, measure cost + reliability over 1–2 weeks against the n8n path. If Routines wins: migrate the well-shaped slices first; n8n keeps the long-tail / multi-step work.
- [ ] **Parallelism comes from worktree-per-ticket (step 9), not from the loop driver.** This is the real lever for "knock out N tickets per night" and is loop-agnostic.

Open question above: is the work shape "grind one PRD" (favours pure Ralph) or "N independent tickets in parallel" (favours Routines + worktrees)? Pick before committing to either.

### 4.5. Port the n8n dev-block workflow from cookoojobs to simplerdevelopment2026 ✅ ported, NEEDS WET RUN (2026-04-29)

Discovered 2026-04-29: the existing `~/simplerdevelopment/n8n/workflows/dev-block-development.json` workflow and the dev-block skill are **hardcoded for the cookoojobs repo** — `cd ~/cookoojobs`, `npx jest`, `npm ci`, branch prefix `dev-block/`. There is no equivalent for simplerdevelopment2026 yet. Until this is ported, several steps below have nothing to plug into.

The cookoojobs workflow already implements a lot of what's in this plan — porting it is mostly substitution, not invention:

| Already in cookoojobs workflow | Notes |
|---|---|
| Worktree-per-iteration (`.worktrees/dev`) | Solves most of step 9 |
| Plan generation + email approval gate | Good pattern — preserve |
| Iteration handoff prompt re-injection | Already does the warm-context thing within one nightly batch |
| `Loop Safety` node — hard cap at 8 iterations | Partial step 7 — adds protection vs. infinite loops |
| Test gate (`npx jest`) → conditional fix loop | Pattern is right; tool needs swap |
| PR creation + cleanup at end | Solves "wake up to evidence" |
| Email summary node | Solves notification — just needs an answer to the open question |

**Files produced:**

- [x] `~/simplerdevelopment/n8n/workflows/dev-block-simplerdev2026-codenode.json` — **canonical workflow** for local n8n (uses Code nodes + child_process, bypasses keychain entirely via CLAUDE_CODE_OAUTH_TOKEN env var). Use this one.
- [x] `~/simplerdevelopment/n8n/workflows/dev-block-simplerdev2026.json` — original SSH-node version, kept for reference / future remote n8n deploy. Don't import for local use; the macOS keychain wall blocks claude auth from SSH sessions.
- [x] `~/simplerdevelopment/n8n/workflows/dev-block-simplerdev2026-local.json` — Execute Command variant; turned out Execute Command was removed from n8n 2.x for security. Don't import.
- [x] `~/simplerdevelopment/.claude/skills/dev-block/SKILL.md` — adapted skill: reads learnings.md first, cites `.planning/STATE.md` + `gh issue list --label claude` as task sources, uses bun test commands, mandates tenancy gate after data-access changes
- [x] `~/run-claude.sh` updated with `CLAUDE_CODE_OAUTH_TOKEN` (long-lived Pro/Max token from `claude setup-token` — bypasses keychain)
- [x] `~/.zprofile` — `NODE_FUNCTION_ALLOW_BUILTIN=child_process,fs,path,os` permanently set so n8n Code nodes can spawn shells

**What changed vs. cookoojobs version:**

- Paths: `~/cookoojobs` → `~/simplerdevelopment/simplerdevelopment2026`
- Branch prefix: `dev-block/dev-` → `claude/dev-` (matches HANDS_OFF firewall in step 6)
- Install: `npm ci --prefer-offline` → `bun install --frozen-lockfile`; dropped Prisma generate (not used)
- Gates: single `npx jest` → four-stage gate (`tsc --noEmit`, `bun run lint`, `bun test:critical`, `bun test:tenancy`); only all-green allows auto-merge
- Per-call env: every `~/run-claude.sh` invocation runs with `HANDS_OFF=1 MAX_THINKING_TOKENS=8000` (plan generation uses 12000)
- Auto-merge: `gh pr merge --auto --squash` fires when all four gates pass; otherwise PR opens for human review and the email subject flags it
- Email subject: now machine-parsable — `[dev-block sd2026] merging|gates red|PR open :: <truncated summary>`
- Pre-Check: now also lists open `claude`-labelled GitHub issues and the head of `.planning/STATE.md` so the planning step has real signal
- **Architecture: Code nodes + spawnSync, not SSH** (canonical local version) — n8n's Code node spawns shell commands directly, claude uses `CLAUDE_CODE_OAUTH_TOKEN` from run-claude.sh, no SSH layer, no keychain dependency. Uses Pro/Max plan via the OAuth token.

**Wet-run prerequisites (mostly done as of 2026-04-29):**

- [x] Repo present at `~/simplerdevelopment/simplerdevelopment2026` (it's the working repo)
- [x] `gh` CLI authed (`gh auth status` → `Logged in to github.com account DanielPCoyle`)
- [x] bun + claude CLI installed (1.3.11, 2.1.123 respectively)
- [x] `claude` label created on the GitHub repo
- [x] Two `claude`-labelled issues open (#3 SSRF guard tests, #4 mentionable-users tenancy)
- [x] `claude setup-token` run successfully → token in `~/run-claude.sh` as `CLAUDE_CODE_OAUTH_TOKEN`
- [x] `NODE_FUNCTION_ALLOW_BUILTIN=child_process,fs,path,os` set in `~/.zprofile` so n8n Code nodes can spawn shells; n8n must be restarted from a shell that sources zprofile
- [ ] Import `dev-block-simplerdev2026-codenode.json` into n8n (the canonical local version)
- [ ] Bind Gmail credential on the 3 Gmail nodes (no SSH credentials needed — Code nodes don't use them)
- [ ] (Optional) GitHub branch protection on `main` requiring CI green → `gh pr merge --auto` will then wait for CI in addition to our local gates. Belt-and-suspenders.

**First wet run:** pick the smallest, lowest-blast-radius task you have (e.g. one E2E spec to add, one typo fix). Watch the email summary, the cost-log JSONL (`bun run scripts/cost-summary.ts`), and the PR. Report back what was wrong/right — feeds into step 5's `learnings.md`.

→ **Use `.claude/WET_RUN_RUNBOOK.md`** for the step-by-step checklist, the per-stage "good vs bad" signals, the kill switch, the common-failures table, and the definition of "successful first run".

**Decision: skip porting `dev-block-qa-testing.json`** — the cookoojobs setup splits "write feature" and "write tests" into two tracks because tests lagged features there. simplerdevelopment2026's dev-block skill already mandates writing tests alongside features (and CLAUDE.md requires `bun test:tenancy` after data-access changes), and the new four-stage gate (`tsc → lint → critical → tenancy`) refuses to auto-merge anything without test coverage. A separate QA track here would just race the dev track for the same code. Revisit if a real gap shows up.

### 5. Add `learnings.md` + reflection-on-failure 🟡 mostly done (2026-04-29)

Sibling to `CLAUDE.md`. Read at session start. Stop hook appends to it on test-fail.

- [x] Created `.claude/learnings.md` with sections: Confirmed Patterns, Mistakes Avoided, Open Questions, Per-iteration QA log
- [x] Listed `.claude/learnings.md` and `.claude/HANDS_OFF_DEV_PLAN.md` in CLAUDE.md pointer index (read on demand)
- [x] Wired `stop-qa-gate.sh` to append a one-line entry between QA-LOG-START/END markers when `HANDS_OFF=1`. Pass: `<ts> <branch>@<sha> OK (Ns)`. Fail: `<ts> <branch>@<sha> FAIL [typecheck,lint] :: <first error line, truncated>`. Bounded to last 50 entries. Smoke-tested.
- [ ] (Later, after dev-block runs prove the value) Reflection-on-failure: spawn Haiku via `claude -p` to write a 1-paragraph hypothesis when QA fails. Defer until we see real failure data.
- [ ] **Blocked:** the dev-block skill referenced in the original plan does not exist for this repo yet — see new step 4.5 below. Once it exists, its Phase 1 must read `.claude/learnings.md` before deciding what to work on.

### 6. Tighten the safety rails (PreToolUse Bash firewall) ✅ extended (2026-04-29)

Existing `guard-bash.sh` exists but I haven't audited it. Denylists are leaky (Ona demonstrated escapes via `/proc/self/root/usr/bin/npx` and `node -e "require('child_process')…"`). Treat as defence-in-depth; the real isolation is the devcontainer (step 8).

- [x] Pre-existing rules verified: force-push to protected branches, `db:push` to prod-looking URLs, hand-editing `drizzle/*.sql`, `rm -rf` of load-bearing dirs, `npm install` (bun-only repo), `--no-verify` skipping hooks
- [x] Added: `git reset --hard`, `git clean -f[dx]`, `git checkout .`/`--`, `sudo`, plaintext `http://` curl/wget, `npm/bun/yarn/pnpm publish`, `node -e`, `bash -c <destructive>`, writing to `~/.ssh`/`.aws`/`.gnupg`/`.config/gh`/`.netrc`/`.kube`
- [x] HANDS_OFF=1 conditional adds: push must target `claude/*` branch, no interactive `-i` git modes (would hang the loop)
- [x] Smoke-tested: 11 block + 6 allow cases all pass
- [x] `bun run db:migrate` already runs `db:verify-target` per CLAUDE.md to refuse prod URLs — confirmed, no extra rule needed

### 7. Workspace spend ceiling 🚫 deferred by user (2026-04-29)

A financial-services team famously burned $47K in 3 days on runaway subagents. User opted not to cap for now — collect 1–2 weeks of cost-log data first, then decide.

- [x] Telemetry on (`.claude/hooks/cost-log.sh` writes per-session JSON line)
- [x] Iteration cap — already implemented in the cookoojobs n8n workflow's `Loop Safety` node at MAX=8. Carry over to the simplerdevelopment2026 port.
- [ ] Email summary already shows total cost per nightly run (carries over via step 4.5) — gives daily visibility without enforcement
- [ ] Defer: workspace spend limit in Anthropic Console
- [ ] Defer: Bash-side circuit breaker on rolling-hour spend
- [ ] **Trigger to revisit:** weekly cost > $X (decide threshold once baseline accrues), or any single nightly run > $50

### 8. Devcontainer for unattended runs

Anthropic's own engineers recommend container isolation for any unsupervised execution. Trail of Bits ships a hardened reference (`trailofbits/claude-code-devcontainer`).

- [ ] Add `.devcontainer/devcontainer.json` based on Trail of Bits template
- [ ] Egress allowlist: `api.anthropic.com`, `github.com`, `*.npmjs.org`/`*.bun.sh` if needed for installs, the Postgres host, nothing else
- [ ] Bind-mount only this repo + `~/.claude/skills` (read-only)
- [ ] n8n triggers `docker compose up -d claude-dev` then `docker exec` into it for each session

### 9. Worktree isolation per ticket ✅ already in cookoojobs workflow (carry over via step 4.5)

Use a fresh git worktree per nightly run. Botched run = abandon worktree, no main contamination.

- [x] Pattern already implemented in `~/simplerdevelopment/n8n/workflows/dev-block-development.json` `Create Dev Worktree` node — creates `.worktrees/dev` on a `dev-block/dev-YYYYMMDD-HHMM` branch, prunes stale worktrees, runs install
- [ ] Carries over via step 4.5 with substitutions: branch prefix `claude/`, install command `bun install`, base directory `~/simplerdevelopment/simplerdevelopment2026/.worktrees/dev`
- [ ] On iteration finish: run all four gates (`tsc --noEmit`, `bun run lint`, `bun test:critical`, `bun test:tenancy`).
  - **All green** → `gh pr create` then `gh pr merge --auto --squash` (auto-merge is permitted per the answered open question)
  - **Any red** → leave worktree + open PR for human inspection, email flags the failure (don't auto-delete — user wakes up to evidence)
- [ ] Optional later: parallel worktrees per ticket (`./worktrees/<ticket-id>/`) for fan-out across multiple tickets per night. Defer until single-ticket version is proven.

### 10. Self-improvement loop (the "learn" part)

Once 1–9 are running, layer this on. Without baseline metrics it's premature.

- [ ] Weekly cron job: read last 7 days of `cost-log.jsonl` + git log of `claude/` branches + `learnings.md` deltas
- [ ] Spawn an Opus subagent: "Identify the 3 highest-value improvements to CLAUDE.md, hook scripts, or prompts based on this evidence. Produce a PR."
- [ ] Human reviews + merges. Loop closes.

---

## Token-efficiency cheat sheet

Pinning these in one place because they're easy to forget:

- **Cache TTL is 5 min.** Don't sleep 5–10 min between iterations — drop to ≤270s (cache stays warm) or commit to ≥1200s (one cache miss buys a long wait). Never the middle.
- **Move volatile values out of cached prefix.** Date, branch, git-status → inject as `system-reminder`, not in CLAUDE.md.
- **`/clear` between Ralph iterations**, not mid-iteration. State is in files — clear context to keep the model sharp and let cache win on the prefix.
- **Subagent stack overhead is 2–7×.** Use them for context isolation (long file reads, parallel research) — not by reflex. Single-agent + 1M context often beats 5 chained subagents.
- **`MAX_THINKING_TOKENS=8000` default**, raise to 16K only inside the planning subagent.
- **Haiku for triage, Sonnet for code, Opus for plan.** Codify in agent frontmatter, not prompts.

## Failure-mode register

Things that have actually broken people, to design against:

| Failure | Source | Mitigation |
|---|---|---|
| Runaway subagents → $47K bill | community | Spend ceiling + iteration cap |
| Cache TTL regression → 10–20× cost | March 2026 Anthropic incident | Track cache-hit ratio weekly; alert if drops |
| `--dangerously-skip-permissions` + denylist escape | Ona writeup | Devcontainer isolation, not denylist alone |
| Headless mode hang on `Edit .claude/skills/**` | claude-code#51927 | Watchdog timeout in n8n |
| Drift over long sessions → broken commits to main | Ralph practitioners | Worktree isolation + `claude/` branch enforcement |
| Self-modifying CLAUDE.md → cache invalidation cascade | meta-rules patterns | Self-improvement edits go through PR review, not auto-commit |

## Open questions — answered 2026-04-29

1. ~~**Cost ceiling**~~ → **No cap for now.** Telemetry is on (cost-log SessionEnd hook). Iteration cap (MAX=8) carries over from the cookoojobs workflow. Revisit once we have 1–2 weeks of `cost-log.jsonl` data and know what "normal" looks like. **Risk acknowledged:** runaway subagents have burned $47K/3 days for others — the iteration cap, HANDS_OFF Bash firewall, and email summary on every run are the only checks until a hard cap is added back.
2. **What does "while I sleep" mean** — still open. Will be answered implicitly by which loop shape proves out (step 4 hybrid pilot vs. Routines pilot).
3. ~~**Trust threshold for auto-merge**~~ → **Auto-merge to main is permitted** if and only if ALL of these are green: `tsc --noEmit`, `bun run lint`, `bun test:critical`, `bun test:tenancy`. If ANY gate fails: PR stays open for human review, summary email flags it. Defined as the merge bar in step 9. (Strong recommendation: add `bun test:integration` once it's reliable enough.)
4. ~~**Notification channel**~~ → **Email summary** (matches existing cookoojobs workflow). One email per nightly run with: tickets attempted, PRs opened, PRs auto-merged, gate failures, total cost, total iterations.
5. **Devcontainer (step 8)** — still open. Default plan: defer until step 4.5 ports the workflow and we have 1–2 weeks of evidence. Revisit if anything weird shows up in real runs.

## Baseline

First data point captured against an interactive session log (the conversation that bootstrapped this plan), 2026-04-29:

| Metric | Value | Notes |
|---|---|---|
| Wall-clock | 22 min 20 s | 78 assistant turns |
| Total cost | $19.55 | 100% Opus 4.7 |
| Cache-hit ratio | 95.88% | far above 60% target — cache is healthy |
| Cost split | ~$11.25 cache reads, ~$6.05 cache creation, ~$2.25 output, ~$0 raw input | cache reads dominate — so reducing cached prefix size or moving readers off Opus is the lever |
| Tokens | 7.5M cache-read, 322K cache-create, 30K output, 148 raw input | |

Dev-block (autonomous) baseline:

| Metric | Value | Date measured |
|---|---|---|
| Avg cost per iteration | TBD — run 2–3 dev-block sessions | |
| Avg wall-clock per iteration | TBD | |
| Cache-hit ratio | TBD (autonomous loops have different cache profile vs. interactive) | |
| Iterations to "finished" (median) | TBD | |
| % iterations that pass `bun test:critical` first try | TBD | |

## References

Synthesized from research on 2026-04-29:

- [Anthropic — Sub-agents](https://code.claude.com/docs/en/sub-agents)
- [Anthropic — Hooks](https://code.claude.com/docs/en/hooks)
- [Anthropic — Manage costs](https://code.claude.com/docs/en/costs)
- [Anthropic — Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic — Ralph plugin](https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md)
- [Trail of Bits — Claude Code devcontainer](https://github.com/trailofbits/claude-code-devcontainer)
- [Geoffrey Huntley — everything is a Ralph loop](https://ghuntley.com/loop/)
- [HumanLayer — Brief history of Ralph](https://www.humanlayer.dev/blog/brief-history-of-ralph)
- [Ona — Claude Code escapes its denylist/sandbox](https://ona.com/stories/how-claude-code-escapes-its-own-denylist-and-sandbox)
- [Mindstudio — Learnings loop](https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills)
- [aviadr1/claude-meta — meta-rules installer](https://github.com/aviadr1/claude-meta)
- [aimagicx — Cut API bill 60% with caching](https://www.aimagicx.com/blog/prompt-caching-claude-api-cost-optimization-2026)
- [systemprompt — Reduce Claude Code costs 60%](https://systemprompt.io/guides/claude-code-cost-optimisation)
