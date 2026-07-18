#!/usr/bin/env bash
# dev-block-compact — periodically dedupe / prune / promote .claude/learnings.md
# entries via Haiku. Backs up to .claude/learnings.md.bak, validates the result has
# the QA-LOG markers, and only swaps in if the rewrite is structurally sound.
#
# Usage: bash scripts/dev-block-compact.sh

set -uo pipefail

# Operate from cwd (the loop sets cwd to the project subdir of the worktree before invoking).
LEARNINGS=".claude/learnings.md"
BACKUP="$LEARNINGS.bak"
NEW="$LEARNINGS.new"

[ ! -f "$LEARNINGS" ] && { echo "[compact] no learnings.md — skipping"; exit 0; }

cp "$LEARNINGS" "$BACKUP"

PROMPT=$(cat <<'EOF'
You are compacting the autonomous coding loop file at .claude/learnings.md. Preserve the structure exactly: the same H1, the same intro prose, the same H2 sections (Confirmed Patterns, Mistakes Avoided, Open Questions, Per-iteration QA log), and the QA-LOG-START / QA-LOG-END markers verbatim.

Rules for compaction:
1. **Deduplicate**: if two entries describe the same root cause, merge into the clearest one and delete the rest.
2. **Promote**: if a "Mistake Avoided" has appeared 3+ times in spirit, restate it as a "Confirmed Pattern" (one bullet) and remove the original mistake bullets.
3. **Demote stale**: drop entries that reference a fixed bug or now-codified rule (e.g. an entry warning about behavior that CLAUDE.md or a hook now enforces).
4. **Keep specifics**: file paths, command names, error message fragments are what make the file useful. Do not generalize them away.
5. **NEVER touch content between `<!-- QA-LOG-START -->` and `<!-- QA-LOG-END -->`** — those lines are auto-managed by stop-qa-gate.sh.
6. **Keep frontmatter intact** if present.

Output ONLY the rewritten file contents. No preamble, no markdown fences, no commentary. The first character of your response must be the first character of the file.

CURRENT FILE:
EOF
)

PROMPT="${PROMPT}

$(cat "$LEARNINGS")"

claude -p --model haiku --dangerously-skip-permissions "$PROMPT" > "$NEW" 2>/dev/null

# Sanity: must contain QA-LOG markers and the four section headers
if ! grep -q "QA-LOG-START" "$NEW" || ! grep -q "QA-LOG-END" "$NEW"; then
  echo "[compact] rewritten file missing QA-LOG markers — keeping original"
  rm -f "$NEW"
  exit 1
fi
for h in "## Confirmed Patterns" "## Mistakes Avoided" "## Open Questions" "## Per-iteration QA log"; do
  if ! grep -qF "$h" "$NEW"; then
    echo "[compact] rewritten file missing section: $h — keeping original"
    rm -f "$NEW"
    exit 1
  fi
done

# Sanity: must not be drastically smaller (suggests model truncated)
OLD_LINES=$(wc -l < "$LEARNINGS")
NEW_LINES=$(wc -l < "$NEW")
if [ "$NEW_LINES" -lt $((OLD_LINES / 3)) ]; then
  echo "[compact] rewritten file shrunk >66% ($OLD_LINES → $NEW_LINES lines) — suspicious, keeping original"
  rm -f "$NEW"
  exit 1
fi

mv "$NEW" "$LEARNINGS"
echo "[compact] rewrote $LEARNINGS ($OLD_LINES → $NEW_LINES lines, backup at $BACKUP)"
