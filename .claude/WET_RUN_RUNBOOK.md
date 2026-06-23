# Wet-Run Runbook — first hands-off dev-block session

Use this once. Updates after the run go into `.claude/learnings.md` (Confirmed Patterns / Mistakes Avoided).

## Setup (one-time)

On the SSH host that n8n connects to:

```bash
# 1. Repo clone
test -d ~/simplerdevelopment/simplerdevelopment2026 && \
  echo "OK: repo present" || echo "MISSING — clone it"

# 2. gh authed
gh auth status   # expect: ✓ Logged in to github.com as ...

# 3. bun installed and the right version
bun --version    # expect: 1.x

# 4. Claude wrapper passes through env (read your run-claude.sh)
cat ~/run-claude.sh
# Expect to see HANDS_OFF and MAX_THINKING_TOKENS forwarded to the claude invocation,
# OR the script exec's the claude CLI which inherits env from its caller automatically.
```

In n8n UI:

1. Workflow → Import from file → `dev-block-simplerdev2026.json`. Save without activating.
2. Verify the SSH credential `SSH Password account` (id `pOGHyXUyApTSvWp5`) resolves to the right host. The import keeps the same credential ID — should bind automatically if it exists.
3. Verify the Gmail credential resolves.
4. Activate the workflow.

In GitHub:

1. Create a `claude` label on the repo if absent.
2. Tag 1–2 small issues with `claude` for the first run. Examples that work well: "add E2E test for X endpoint", "fix typo in Y component", "add tenant filter to Z query".

## First run

In n8n, manually execute the workflow (don't wait for cron). Watch:

| Stage | What good looks like | What's a problem |
|---|---|---|
| Pre-Check | stdout shows `git status`, recent commits, `claude`-labelled issues, STATE.md head | Empty or all-error → SSH or repo path wrong |
| Create Dev Plan | A plain-text plan with FOCUS TASK / SCOPE / DONE CRITERIA / IMPLEMENTATION STEPS / FILES / RISKS | "NO TASKS" → no `claude`-labelled issues, fix #2 above |
| Ask for approval (email) | Email arrives at `admin@simplerdevelopment.com` with the plan | No email → Gmail credential or webhook ID issue |
| Reply `approved` | Workflow advances | Reply anything else → loops back to rewrite (max 3) |
| Create Dev Worktree | `BRANCH=claude/dev-YYYYMMDD-HHMM` and `SETUP_COMPLETE` in stdout | `bun install` failures → check bun version on host |
| Dev Iteration (First) | Returns parseable JSON with `finished` field | Plain prose / markdown → run-claude.sh isn't invoking the /dev-block skill, or env not forwarded |
| Run Gates | `GATES_PASSED=0` if all four green | `GATES_PASSED=1` → see which `*_RC` is non-zero, debug from there |
| Create PR & Cleanup | A PR URL on `https://github.com/.../pull/N`; `AUTO_MERGE_QUEUED` if all gates were green | `AUTO_MERGE_SKIPPED_GATES_RED` → expected when gates fail; `NO_COMMITS` → Claude didn't actually do anything; `PR_EXISTS` → leftover branch, prune `.worktrees` and re-run |
| Send Summary email | `[dev-block sd2026] merging|gates red|PR open :: ...` | No email → check Gmail node, but the PR is still made regardless |

After:

```bash
bun run scripts/cost-summary.ts --since 24h
```

Compare against the in-doc baseline (interactive Opus session was ~$10–20 / 20min @ 95% cache hit). Autonomous runs should be cheaper because of model tiering in subagents.

## What to log to learnings.md

Format (append between `<!-- QA-LOG-... -->` is automatic via the Stop hook; the human-readable entries go in the **Confirmed Patterns / Mistakes Avoided / Open Questions** sections above the QA log):

- Anything that surprised you. The PR description was wrong. The plan picked a bad task. The gates passed but the code is junk. Tenancy gate caught a real leak. Iteration count too high. Email subject parser doesn't escape correctly. Etc.
- Anything that worked unexpectedly well. "On a 1-issue first run, the plan took 3 minutes to generate, dev took 12 minutes, gates 5 minutes, total $4.20."

## Kill switch

If something looks wrong mid-run:

```bash
# 1. Stop the n8n workflow (UI: Executions → Stop)
# 2. Kill any orphaned claude session on the SSH host
ssh <host> "pkill -f 'claude.*--dangerously'"
# 3. Clean the worktree
ssh <host> "cd ~/simplerdevelopment/simplerdevelopment2026 && \
  git worktree remove .worktrees/dev --force; \
  git worktree prune"
# 4. Delete the runaway branch if it shouldn't exist
ssh <host> "cd ~/simplerdevelopment/simplerdevelopment2026 && \
  git branch -D claude/dev-YYYYMMDD-HHMM"
```

## Common first-run failure modes

| Symptom | Probable cause | Fix |
|---|---|---|
| Email arrives but reply doesn't advance | Gmail webhook ID collision (the JSON imports with new IDs `bc1`, `bc2`, `aedfa`) | Edit the three Gmail nodes in n8n, regenerate webhook IDs |
| `tsc --noEmit` fails on unchanged files | Stale `.next/` or `node_modules/.cache/` in the worktree | Worktree creates fresh; if it persists, add `rm -rf .next` to the Create Dev Worktree node |
| `bun test:tenancy` fails on first run | Test DB not set up on host | Run `bun test:integration:local` once on host to spin up the DB |
| Auto-merge fires but PR doesn't merge | GitHub branch protection requires GH Actions CI green; that's separate from our local gates | Wait for GitHub CI; this is the belt-and-suspenders working as intended |
| Workflow hangs at Dev Iteration | Claude session deadlocked (claude-code#51927 in v2.1.114–117) | Kill switch above; report version `claude --version` for tracking |
| Cost-log entry shows `cost_unknown_models` | Model name not in `RATES` table in `cost-log.sh` | Add the new model to the `RATES` dict; old entries lose the cost number but tokens are still recorded |

## Definition of "first run successful"

All of these:

- A `claude/dev-*` branch was pushed to origin
- A PR was opened with at least one commit beyond main
- `cost-log.jsonl` got a new entry with non-zero output_tokens
- Email summary arrived at admin@simplerdevelopment.com
- No HANDS_OFF firewall block ever fired (else the agent tried something it shouldn't)
- Either auto-merge fired AND the PR merged within 30 minutes, OR auto-merge skipped (gates red) AND the PR is open for review with a clear failure summary in the email
