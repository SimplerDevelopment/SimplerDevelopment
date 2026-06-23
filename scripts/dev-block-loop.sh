#!/usr/bin/env bash
# dev-block-loop — pure self-improving loop driver, sibling to (replacement for) the n8n dev-block workflow.
#
# Each iteration: cd into a worktree → claude -p invokes the dev-block skill → parse JSON →
# journal it → reflect on failures → compact periodically → stop on finished:true / success_test / cap.
#
# Auto-merges the PR when goal met AND all 4 gates green. Otherwise leaves PR for human review.
#
# Usage:
#   bash scripts/dev-block-loop.sh
#
# Kill switch: `touch .claude/.runtime/dev-block/STOP` — exits cleanly at next iteration boundary.

set -uo pipefail

# This script supports the layout where the "project" (with package.json/CLAUDE.md/.planning/)
# is a subdirectory of a larger git repo. PROJECT_DIR = invocation cwd; GIT_ROOT = `git toplevel`.
PROJECT_DIR="$(pwd)"
[ ! -f "$PROJECT_DIR/package.json" ] && {
  echo "[loop] $PROJECT_DIR has no package.json — invoke from the project root" >&2; exit 1; }

GIT_ROOT="$(git rev-parse --show-toplevel)"
if [ "$PROJECT_DIR" = "$GIT_ROOT" ]; then
  PROJECT_REL=""
else
  PROJECT_REL="${PROJECT_DIR#$GIT_ROOT/}"
fi

GOAL_FILE="$PROJECT_DIR/.planning/dev-block-goal.md"
RUNTIME_DIR="$PROJECT_DIR/.claude/.runtime/dev-block"
ITERATIONS_LOG="$RUNTIME_DIR/iterations.jsonl"
LOOP_LOG="$RUNTIME_DIR/loop.log"
STOP_FILE="$RUNTIME_DIR/STOP"

# Worktree placed at git-repo level, NOT inside the project subdir, to avoid
# any nesting weirdness. Inside the worktree, the project lives at $PROJECT_REL.
WORKTREE_DIR="$GIT_ROOT/.worktrees/dev-loop"
PROJECT_IN_WORKTREE="$WORKTREE_DIR${PROJECT_REL:+/$PROJECT_REL}"

mkdir -p "$RUNTIME_DIR"
rm -f "$STOP_FILE"

if [ ! -f "$GOAL_FILE" ]; then
  echo "[loop] missing $GOAL_FILE — copy from goal template and edit before running" >&2
  exit 1
fi

# Parse YAML frontmatter from goal file
read_fm() {
  python3 - "$GOAL_FILE" "$1" <<'PY'
import sys, re
with open(sys.argv[1]) as f: text = f.read()
m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
if not m: sys.exit(1)
for line in m.group(1).splitlines():
  if ":" in line and not line.lstrip().startswith("#"):
    k, v = line.split(":", 1)
    if k.strip() == sys.argv[2]:
      print(v.strip().strip('"').strip("'")); sys.exit(0)
sys.exit(1)
PY
}

GOAL=$(read_fm goal || echo "")
SUCCESS_TEST=$(read_fm success_test || echo "")
MAX_ITERATIONS=$(read_fm max_iterations || echo "8")
MAX_COST_USD=$(read_fm max_cost_usd || echo "50")
COMPACT_EVERY=$(read_fm compact_every || echo "10")
MODEL=$(read_fm model || echo "opus")

[ -z "$GOAL" ] && { echo "[loop] $GOAL_FILE has no 'goal:' frontmatter field" >&2; exit 1; }

# Inline the dev-block SKILL.md so claude -p sees the JSON-only contract every iteration,
# without depending on skill auto-discovery (which doesn't walk up to the outer repo's .claude/).
DEV_BLOCK_SKILL_PATH="$GIT_ROOT/.claude/skills/dev-block/SKILL.md"
[ ! -f "$DEV_BLOCK_SKILL_PATH" ] && {
  echo "[loop] missing dev-block skill at $DEV_BLOCK_SKILL_PATH" >&2; exit 1; }
DEV_BLOCK_SKILL=$(cat "$DEV_BLOCK_SKILL_PATH")

# Worktree setup — create once per loop session, branched from main of the OUTER git repo.
# The project lives at $PROJECT_REL inside the worktree.
git worktree prune
NEEDS_INSTALL=0
if [ -d "$WORKTREE_DIR" ]; then
  echo "[loop] reusing existing worktree at $WORKTREE_DIR (resuming branch)"
  cd "$PROJECT_IN_WORKTREE"
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  [ ! -d node_modules ] && NEEDS_INSTALL=1
else
  BRANCH="claude/dev-loop-$(date +%Y%m%d-%H%M)"
  git worktree add -b "$BRANCH" "$WORKTREE_DIR" main
  cd "$PROJECT_IN_WORKTREE"
  NEEDS_INSTALL=1
fi

if [ "$NEEDS_INSTALL" = "1" ]; then
  echo "[loop] installing deps in worktree (bun install --frozen-lockfile)"
  bun install --frozen-lockfile >/dev/null 2>&1 || { echo "[loop] bun install failed — aborting"; exit 1; }
fi

LOOP_START_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "[loop] start=$LOOP_START_ISO branch=$BRANCH model=$MODEL caps=${MAX_ITERATIONS}iter/\$${MAX_COST_USD}"
echo "[loop] goal: $GOAL"

# Sum cost_usd from cost-log.jsonl entries with ended_at >= LOOP_START_ISO
cumulative_cost() {
  python3 - "$PROJECT_DIR/.claude/.runtime/cost-log.jsonl" "$LOOP_START_ISO" <<'PY' 2>/dev/null || echo "0"
import sys, json
total = 0.0
try:
  with open(sys.argv[1]) as f:
    for line in f:
      try: d = json.loads(line)
      except json.JSONDecodeError: continue
      if d.get("ended_at", "") >= sys.argv[2]:
        total += float(d.get("cost_usd", 0) or 0)
except FileNotFoundError: pass
print(f"{total:.4f}")
PY
}

# Extract first JSON object containing "finished" from text on stdin.
# Use python3 -c (script via argv) so stdin stays available for the piped input.
extract_dev_block_json() {
  python3 -c '
import sys, json
text = sys.stdin.read()
candidates = []
depth = 0; start = -1
for i, ch in enumerate(text):
  if ch == "{":
    if depth == 0: start = i
    depth += 1
  elif ch == "}":
    depth -= 1
    if depth == 0 and start >= 0:
      blob = text[start:i+1]
      if "\"finished\"" in blob:
        try:
          json.loads(blob); candidates.append(blob)
        except json.JSONDecodeError: pass
      start = -1
if not candidates: sys.exit(1)
print(candidates[-1])
'
}

HANDOFF_PROMPT=""
ITERATION_N=0
GOAL_MET=0

while true; do
  ITERATION_N=$((ITERATION_N + 1))

  if [ -f "$STOP_FILE" ]; then
    echo "[loop] STOP file present — exiting cleanly"
    rm -f "$STOP_FILE"
    break
  fi

  # External success_test (optional). Empty / "false" = never auto-terminate from outside.
  if [ -n "$SUCCESS_TEST" ] && [ "$SUCCESS_TEST" != "false" ]; then
    if bash -c "$SUCCESS_TEST" >/dev/null 2>&1; then
      echo "[loop] success_test passed — goal met externally"
      GOAL_MET=1
      break
    fi
  fi

  if [ "$ITERATION_N" -gt "$MAX_ITERATIONS" ]; then
    echo "[loop] iteration cap hit ($MAX_ITERATIONS)"
    break
  fi

  CURRENT_COST=$(cumulative_cost)
  if awk -v c="$CURRENT_COST" -v cap="$MAX_COST_USD" 'BEGIN{exit !(c+0 >= cap+0)}'; then
    echo "[loop] cost cap hit (\$$CURRENT_COST >= \$$MAX_COST_USD)"
    break
  fi

  echo "[loop] === iteration $ITERATION_N (cost so far: \$$CURRENT_COST) ==="

  # Build prompt with the dev-block SKILL.md inlined. The skill lives at the OUTER repo's
  # .claude/skills/, so it isn't auto-discovered when claude -p runs from the inner project
  # subdir of the worktree. Inlining guarantees claude sees the JSON-only contract every time.
  if [ -z "$HANDOFF_PROMPT" ]; then
    PROMPT="$DEV_BLOCK_SKILL

---

ITERATION CONTEXT
- Iteration $ITERATION_N of max $MAX_ITERATIONS in an autonomous loop session.
- You are inside the worktree at \`$PROJECT_IN_WORKTREE\` on branch \`$BRANCH\`.

GOAL (from $GOAL_FILE):
$(cat "$GOAL_FILE")

INSTRUCTION: Pick ONE atomic task that moves toward the goal. Implement, commit, return JSON per the schema. Output JSON only — no prose, no markdown fences. Your first character must be \`{\` and your last character must be \`}\`."
  else
    PROMPT="$DEV_BLOCK_SKILL

---

CONTINUATION (from previous iteration's handoff_prompt):
$HANDOFF_PROMPT

REMINDER: Output JSON only matching the dev-block schema. No prose, no markdown fences."
  fi

  # Use --output-format json so we get a reliable wrapper with cost info AND the assistant text,
  # regardless of whether claude wraps its response in code fences or adds preamble.
  # The `--` separator is REQUIRED — the prompt begins with the SKILL.md frontmatter (`---\n...`)
  # which argparse otherwise treats as an unknown long-form flag.
  # Strict per-iteration QA gate: the Stop hook (stop-qa-gate.sh) runs tsc + lint + unit tests
  # and BLOCKS the iteration's stop on red, so a regression can't be committed mid-loop.
  # (Claude force-ends after 8 consecutive blocks — see CLAUDE_CODE_STOP_HOOK_BLOCK_CAP.)
  ITER_OUT=$(HANDS_OFF=1 SIMPLERDEV_QA_GATE_TESTS=1 SIMPLERDEV_QA_GATE_BLOCK=1 claude -p --output-format json --model "$MODEL" --dangerously-skip-permissions -- "$PROMPT" 2>&1)
  ITER_RC=$?

  if [ $ITER_RC -ne 0 ]; then
    echo "[loop] claude -p exited rc=$ITER_RC — aborting loop"
    {
      echo "=== iteration $ITERATION_N FAILED at $(date -u +%FT%TZ) rc=$ITER_RC ==="
      echo "$ITER_OUT"
    } >> "$LOOP_LOG"
    break
  fi

  # Two-stage extraction: depth-scan ITER_OUT for the claude --output-format json wrapper
  # (robust against trailing SessionEnd hook errors and other stdout/stderr noise),
  # then scan the wrapper's `result` field for the dev-block JSON object.
  WRAPPER=$(echo "$ITER_OUT" | python3 -c '
import sys, json
text = sys.stdin.read()
depth = 0; start = -1
for i, ch in enumerate(text):
  if ch == "{":
    if depth == 0: start = i
    depth += 1
  elif ch == "}":
    depth -= 1
    if depth == 0 and start >= 0:
      blob = text[start:i+1]
      if "\"type\"" in blob and "\"result\"" in blob:
        try:
          d = json.loads(blob)
          if "result" in d:
            print(json.dumps({
              "result": d.get("result", ""),
              "total_cost_usd": float(d.get("total_cost_usd", 0) or 0),
              "is_error": d.get("is_error", False),
            }))
            sys.exit(0)
        except json.JSONDecodeError: pass
      start = -1
sys.exit(1)
') || WRAPPER=""

  if [ -z "$WRAPPER" ]; then
    echo "[loop] could not parse claude wrapper JSON — aborting"
    { echo "=== iteration $ITERATION_N NO-WRAPPER at $(date -u +%FT%TZ) ==="; echo "$ITER_OUT"; } >> "$LOOP_LOG"
    break
  fi

  ASSISTANT_TEXT=$(echo "$WRAPPER" | python3 -c "import sys, json; print(json.load(sys.stdin).get('result',''))")
  ITER_COST=$(echo "$WRAPPER" | python3 -c "import sys, json; print(json.load(sys.stdin).get('total_cost_usd', 0))")

  if [ -z "$ASSISTANT_TEXT" ]; then
    echo "[loop] empty assistant text — aborting"
    { echo "=== iteration $ITERATION_N EMPTY-RESULT at $(date -u +%FT%TZ) ==="; echo "$ITER_OUT"; } >> "$LOOP_LOG"
    break
  fi

  JSON=$(echo "$ASSISTANT_TEXT" | extract_dev_block_json)
  if [ -z "$JSON" ]; then
    echo "[loop] could not extract dev-block JSON from assistant text — aborting"
    {
      echo "=== iteration $ITERATION_N UNPARSEABLE at $(date -u +%FT%TZ) ==="
      echo "--- ASSISTANT TEXT ---"
      echo "$ASSISTANT_TEXT"
      echo "--- /ASSISTANT TEXT ---"
    } >> "$LOOP_LOG"
    break
  fi

  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "$JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rec = {
  'ts': '$TS', 'iteration': $ITERATION_N,
  'iter_cost_usd': float('$ITER_COST'),
  'cost_so_far_usd': float('$CURRENT_COST'),
  'finished': d.get('finished'), 'gates': d.get('gates', {}),
  'iteration_summary': d.get('iteration_summary'),
  'tasks_completed': d.get('tasks_completed', []),
  'tasks_remaining': d.get('tasks_remaining', []),
  'commits': d.get('commits', []), 'blockers': d.get('blockers', []),
}
print(json.dumps(rec))
" >> "$ITERATIONS_LOG"

  # Reflect on failures: if any gate failed OR there are blockers, write a learning
  NEEDS_REFLECT=$(echo "$JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
gates = d.get('gates') or {}
fails = [k for k,v in gates.items() if v == 'fail']
blockers = d.get('blockers') or []
print('1' if fails or blockers else '0')
")
  if [ "$NEEDS_REFLECT" = "1" ]; then
    echo "[loop] reflecting on failure"
    bash "$PROJECT_DIR/scripts/dev-block-reflect.sh" "$JSON" || echo "[loop] reflect failed (non-fatal)"
  fi

  if [ "$COMPACT_EVERY" -gt 0 ] && [ $((ITERATION_N % COMPACT_EVERY)) -eq 0 ]; then
    echo "[loop] compacting learnings.md (every $COMPACT_EVERY iterations)"
    bash "$PROJECT_DIR/scripts/dev-block-compact.sh" || echo "[loop] compact failed (non-fatal)"
  fi

  # If reflect/compact dirtied learnings.md, commit it so the next iteration starts clean
  # and the change rides along into the auto-merge PR.
  if ! git diff --quiet .claude/learnings.md 2>/dev/null; then
    git add .claude/learnings.md
    git commit -m "chore(learnings): iteration $ITERATION_N retro" -- .claude/learnings.md >/dev/null 2>&1 \
      && echo "[loop] committed learnings.md update" \
      || echo "[loop] learnings.md commit failed (non-fatal)"
  fi

  FINISHED=$(echo "$JSON" | python3 -c "import sys,json; print(str(json.load(sys.stdin).get('finished')).lower())")
  if [ "$FINISHED" = "true" ]; then
    echo "[loop] dev-block reports finished:true"
    GOAL_MET=1
    break
  fi

  HANDOFF_PROMPT=$(echo "$JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('handoff_prompt') or '')")
  [ -z "$HANDOFF_PROMPT" ] && { echo "[loop] no handoff_prompt — stopping"; break; }
done

# Final gate check + auto-merge decision (always run, even on cap-out, to surface PR state)
echo "[loop] final gates check"
TYPECHECK_RC=0; LINT_RC=0; CRITICAL_RC=0; TENANCY_RC=0
bunx tsc --noEmit  >/dev/null 2>&1 || TYPECHECK_RC=$?
bun run lint  >/dev/null 2>&1 || LINT_RC=$?
bun test:critical >/dev/null 2>&1 || CRITICAL_RC=$?
bun test:tenancy  >/dev/null 2>&1 || TENANCY_RC=$?
echo "[loop] gates: typecheck=$TYPECHECK_RC lint=$LINT_RC critical=$CRITICAL_RC tenancy=$TENANCY_RC"

ALL_GREEN=0
[ $TYPECHECK_RC -eq 0 ] && [ $LINT_RC -eq 0 ] && [ $CRITICAL_RC -eq 0 ] && [ $TENANCY_RC -eq 0 ] && ALL_GREEN=1

# Only push/PR if there are commits beyond main
COMMITS_AHEAD=$(git rev-list --count "main..$BRANCH" 2>/dev/null || echo "0")
if [ "$COMMITS_AHEAD" -eq 0 ]; then
  echo "[loop] no commits beyond main — nothing to PR"
  exit 0
fi

PR_BODY=$(cat <<EOF
Automated dev-block loop completion.

**Goal:** $GOAL
**Branch:** $BRANCH
**Iterations:** $ITERATION_N
**Final gates:** typecheck=$TYPECHECK_RC lint=$LINT_RC critical=$CRITICAL_RC tenancy=$TENANCY_RC
**Cost:** \$$(cumulative_cost)

Iteration journal: \`$ITERATIONS_LOG\`
Goal definition: \`$GOAL_FILE\`
EOF
)

git push -u origin "$BRANCH"
PR_URL=$(gh pr create --title "feat(loop): $GOAL" --body "$PR_BODY" 2>&1 | tail -1)
echo "[loop] PR: $PR_URL"

if [ "$GOAL_MET" -eq 1 ] && [ "$ALL_GREEN" -eq 1 ]; then
  echo "[loop] goal met + all gates green — enabling auto-merge"
  gh pr merge --auto --squash "$PR_URL" || echo "[loop] auto-merge enable failed (PR open for manual review)"
else
  echo "[loop] not auto-merging (goal_met=$GOAL_MET all_green=$ALL_GREEN) — PR open for review"
fi
