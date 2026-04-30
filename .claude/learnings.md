# Learnings — Hands-Off Dev

Sibling to `CLAUDE.md`. Loaded each session via `@.claude/learnings.md` in CLAUDE.md.

**Purpose:** persistent memory across cold-started Claude sessions in the dev-block / Ralph loop. CLAUDE.md is the rulebook; this file is the running retro.

**Update rules:**
- Append-only during a session.
- Write what would have saved this session 30 minutes if it had been here at the start.
- Be specific — file paths, error messages, commands, not vague reminders.
- Include enough context that the lesson is interpretable a month from now.
- Date entries with `YYYY-MM-DD` only when the date matters (e.g., "as of Bun 1.2.x").
- Prune entries that are wrong, stale, or now codified in CLAUDE.md / hooks.

---

## Confirmed Patterns

Things that worked, validated by use. Promote here only after the pattern survives 2+ uses.

- *(none yet)*

## Mistakes Avoided

Specific footguns, with the symptom and the fix. Format:
> **Symptom:** what went wrong / how it manifested
> **Cause:** the actual root cause
> **Avoid:** what to do instead

- **n8n has two different task-runner timeouts; both default to 60s and must be raised for slow Code-node tasks**
  - **Symptom:** Code node returned `Task request timed out after 60 seconds` even after we set `N8N_RUNNERS_TASK_TIMEOUT=3600`. Error message: "Your Code node task was not matched to a runner within the timeout period."
  - **Cause:** `N8N_RUNNERS_TASK_TIMEOUT` is the *execution* time limit after a runner picks up the task. `N8N_RUNNERS_TASK_REQUEST_TIMEOUT` is how long the daemon waits for a runner to *accept* the task — separate setting, also 60s default. When the prior task hadn't finished yet (claude takes 2+ min), the next request expired before the runner was free.
  - **Avoid:** for any Code node that spawns a long-running shell command, set both env vars. Verify in `~/.zshrc` and confirm with `zsh -i -c 'echo $N8N_RUNNERS_TASK_TIMEOUT $N8N_RUNNERS_TASK_REQUEST_TIMEOUT'`. n8n must be restarted to pick up env changes.

- **Shell script with missing shebang fails under `spawnSync` but works interactively**
  - **Symptom:** `~/run-claude.sh` worked when invoked from a shell prompt but `spawnSync(scriptPath, ['-p', prompt])` returned `{status: null, error: "Unknown system error -8"}` (errno -8 = `ENOEXEC`) in 6 ms.
  - **Cause:** the script's `#!/bin/bash` shebang got deleted during an edit. Interactive shells fall back to interpreting shebang-less scripts themselves; the kernel `exec()` (which `spawnSync` uses without `shell: true`) does not — it sees no interpreter and returns `ENOEXEC`.
  - **Avoid:** every shell wrapper script needs a shebang. Quick check: `file ~/script.sh` should report "Bourne-Again shell script text executable", not "ASCII text". Or run `xxd script.sh | head -1` and verify it starts with `2321` (`#!`).

## Open Questions

Things we don't know yet that affect autonomous decisions. Resolve and move to Confirmed Patterns or delete.

- *(none yet)*

## Per-iteration QA log

Auto-appended by `.claude/hooks/stop-qa-gate.sh` when `HANDS_OFF=1`. Bounded to last 50 entries — older ones get trimmed by the hook to keep this file from ballooning.

<!-- QA-LOG-START -->
<!-- QA-LOG-END -->
