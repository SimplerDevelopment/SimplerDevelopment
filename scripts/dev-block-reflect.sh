#!/usr/bin/env bash
# dev-block-reflect — invoked by dev-block-loop after a failed iteration.
# Spawns Haiku via `claude -p` to write ONE principle-shaped lesson and append it
# to .claude/learnings.md under "Mistakes Avoided" (or skip if it's a duplicate).
#
# Usage: bash scripts/dev-block-reflect.sh '<dev-block-json>'

set -uo pipefail

JSON_INPUT="${1:-}"
[ -z "$JSON_INPUT" ] && { echo "[reflect] missing JSON arg" >&2; exit 1; }

# Operate from cwd (the loop sets cwd to the project subdir of the worktree before invoking).
LEARNINGS=".claude/learnings.md"
[ ! -f "$LEARNINGS" ] && { echo "[reflect] no learnings.md in $(pwd) — skipping"; exit 0; }

# Pull the salient bits from the iteration JSON
SUMMARY=$(echo "$JSON_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('iteration_summary') or '')")
GATES=$(echo "$JSON_INPUT" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('gates') or {}))")
BLOCKERS=$(echo "$JSON_INPUT" | python3 -c "import sys,json; print('; '.join(json.load(sys.stdin).get('blockers') or []))")

# Last few lines of git diff for context (stat only — we don't want full diff in the prompt)
DIFF_STAT=$(git diff HEAD~1 HEAD --stat 2>/dev/null | tail -10 || echo "<no diff>")

# Last 50 lines of existing Mistakes Avoided so model can spot duplicates
EXISTING_MISTAKES=$(awk '/^## Mistakes Avoided/,/^## /' "$LEARNINGS" | head -200)

PROMPT=$(cat <<EOF
You review a failed iteration of an autonomous coding loop and decide whether it teaches something new worth remembering.

ITERATION SUMMARY: $SUMMARY
GATES: $GATES
BLOCKERS: $BLOCKERS
DIFF STAT:
$DIFF_STAT

EXISTING ENTRIES IN .claude/learnings.md "Mistakes Avoided" SECTION:
$EXISTING_MISTAKES

Decide:
1. If this failure is materially the same as an existing entry → output the literal string DUPLICATE and nothing else.
2. If this failure is too generic to learn from (e.g. "I forgot to commit") → output the literal string SKIP and nothing else.
3. Otherwise output ONE principle-shaped lesson, and nothing else, in this exact markdown format (no preamble, no fences):

- **<short title — what to avoid>**
  - **Symptom:** <how it manifested, specific>
  - **Cause:** <actual root cause, not symptom>
  - **Avoid:** <what to do instead — principle, not rule>

Be specific. Reference file paths, error messages, command names where they help future-you.
EOF
)

LESSON=$(claude -p --model haiku --dangerously-skip-permissions "$PROMPT" 2>/dev/null)

# Trim whitespace
LESSON_TRIMMED=$(echo "$LESSON" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

case "$LESSON_TRIMMED" in
  DUPLICATE|SKIP|"")
    echo "[reflect] $LESSON_TRIMMED — not appending"
    exit 0
    ;;
esac

# Append under "## Mistakes Avoided" (insert before the next "## " heading)
python3 - "$LEARNINGS" "$LESSON" <<'PY'
import sys, re
path = sys.argv[1]; lesson = sys.argv[2].rstrip() + "\n"
with open(path) as f: text = f.read()
m = re.search(r"(## Mistakes Avoided\n)(.*?)(\n## )", text, re.DOTALL)
if not m:
  # Fallback: append at end
  with open(path, "a") as f: f.write("\n" + lesson)
  sys.exit(0)
section = m.group(2).rstrip()
new_section = section + "\n\n" + lesson.rstrip() + "\n"
text = text[:m.start(2)] + new_section + text[m.end(2):]
with open(path, "w") as f: f.write(text)
PY

echo "[reflect] appended new learning"
