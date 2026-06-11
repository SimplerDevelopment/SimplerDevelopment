#!/usr/bin/env bash
# PreToolUse:Edit|Write|MultiEdit — block autonomous sessions from overwriting agent config files.
# Applies only when HANDS_OFF=1. Interactive sessions are unrestricted.
# Exit 2 + stderr = block. Exit 0 = allow.
set +e
set -u

[ "${HANDS_OFF:-0}" != "1" ] && exit 0

input="$(cat)"
path="$(printf '%s' "$input" | python3 -c '
import json, sys
d = json.load(sys.stdin)
ti = d.get("tool_input", {})
print(ti.get("file_path","") or ti.get("path",""))
' 2>/dev/null || echo "")"

[ -z "$path" ] && exit 0

block() {
  echo "BLOCKED by .claude/hooks/guard-config-writes.sh: $1" >&2
  echo "File: $path" >&2
  exit 2
}

# Normalize to basename-style matching — strip any leading path prefix so
# both absolute (/Users/.../CLAUDE.md) and repo-relative (CLAUDE.md) match.
case "$path" in
  */.claude/hooks/*.sh)             block "hook scripts are read-only in HANDS_OFF mode" ;;
  */.claude/settings.json)          block "settings.json is read-only in HANDS_OFF mode" ;;
  */.claude/settings.local.json)    block "settings.local.json is read-only in HANDS_OFF mode" ;;
  */.claude/index.md)               block "index.md is read-only in HANDS_OFF mode" ;;
  */CLAUDE.md)                      block "CLAUDE.md is read-only in HANDS_OFF mode" ;;
esac

# learnings.md is intentionally NOT blocked — stop-qa-gate.sh writes to it.

exit 0
