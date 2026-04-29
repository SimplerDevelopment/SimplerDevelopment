#!/usr/bin/env bash
# PostToolUse:Edit|Write|MultiEdit — record that this session edited code.
# Used by stop-qa-gate.sh to decide whether to run the QA gate.
# Cheap, non-blocking. Always exit 0.
set -euo pipefail

input="$(cat 2>/dev/null || true)"
file_path="$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null || echo "")"

# Only mark for files in the source tree we care about
case "$file_path" in
  */app/*|*/lib/*|*/components/*|*/hooks/*|*/tests/*)
    mkdir -p .claude/.runtime
    touch .claude/.runtime/edited
    ;;
esac

exit 0
