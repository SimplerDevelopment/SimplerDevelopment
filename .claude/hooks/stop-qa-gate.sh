#!/usr/bin/env bash
# Stop hook — QA gate. Runs typecheck + lint (and optionally fast unit tests) if this session touched code.
# Blocking by default: set SIMPLERDEV_QA_GATE_SOFT=1 to downgrade to advisory-only output.
# Set SIMPLERDEV_QA_GATE_TESTS=1 to also run bun test:unit (~30s, no browser/DB).
# When HANDS_OFF=1, also appends one entry to .claude/learnings.md QA log section.
set +e
set -u

marker=".claude/.runtime/edited"
[ -f "$marker" ] || { echo "QA gate: skipped (no source edits this session)"; exit 0; }

start=$(date +%s)

# Typecheck
tsc_out=$(npx --yes tsc --noEmit 2>&1)
tsc_rc=$?

# Lint
lint_out=$(bun run lint 2>&1)
lint_rc=$?

# Optional: fast unit tests (~30s, no browser/DB) — SIMPLERDEV_QA_GATE_TESTS=1
test_rc=0
test_out=""
ran_tests=0
if [ "${SIMPLERDEV_QA_GATE_TESTS:-0}" = "1" ]; then
  ran_tests=1
  test_out=$(bun run test:unit 2>&1)
  test_rc=$?
fi

elapsed=$(( $(date +%s) - start ))
rm -f "$marker"

summary="QA gate (${elapsed}s):"
[ $tsc_rc -eq 0 ]  && summary="$summary  typecheck OK" || summary="$summary  typecheck FAIL"
[ $lint_rc -eq 0 ] && summary="$summary  lint OK"      || summary="$summary  lint FAIL"
[ $ran_tests -eq 1 ] && { [ $test_rc -eq 0 ] && summary="$summary  unit OK" || summary="$summary  unit FAIL"; }

echo "$summary"

any_red() { [ $tsc_rc -ne 0 ] || [ $lint_rc -ne 0 ] || { [ $ran_tests -eq 1 ] && [ $test_rc -ne 0 ]; }; }

if any_red; then
  echo "----- typecheck output (last 40 lines) -----"
  echo "$tsc_out" | tail -40
  echo "----- lint output (last 40 lines) -----"
  echo "$lint_out" | tail -40
  if [ $ran_tests -eq 1 ] && [ $test_rc -ne 0 ]; then
    echo "----- unit-test output (last 40 lines) -----"
    echo "$test_out" | tail -40
  fi
fi

# QA-log append — only in HANDS_OFF mode, only if learnings.md exists.
# Bounded to last 50 entries to keep the file from ballooning.
learnings=".claude/learnings.md"
if [ "${HANDS_OFF:-0}" = "1" ] && [ -f "$learnings" ]; then
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  sha=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-branch")

  if ! any_red; then
    entry="- ${ts} ${branch}@${sha} OK (${elapsed}s)"
  else
    fails=()
    [ $tsc_rc -ne 0 ] && fails+=("typecheck")
    [ $lint_rc -ne 0 ] && fails+=("lint")
    [ $ran_tests -eq 1 ] && [ $test_rc -ne 0 ] && fails+=("unit")
    fail_list=$(IFS=,; echo "${fails[*]}")
    first_err=$( { [ $tsc_rc -ne 0 ] && echo "$tsc_out"; [ $lint_rc -ne 0 ] && echo "$lint_out"; \
                   [ $ran_tests -eq 1 ] && [ $test_rc -ne 0 ] && echo "$test_out"; } \
                 | grep -E '^(error|.*: error|.*Error:|.*FAIL )' | head -1 | tr -d '\n' | cut -c1-200)
    entry="- ${ts} ${branch}@${sha} FAIL [${fail_list}] :: ${first_err:-<no error line>}"
  fi

  python3 - "$learnings" "$entry" <<'PYEOF'
import sys, re
path, entry = sys.argv[1], sys.argv[2]
with open(path) as f: text = f.read()
m = re.search(r"<!-- QA-LOG-START -->(.*?)<!-- QA-LOG-END -->", text, re.DOTALL)
if not m:
    sys.exit(0)
existing = [l for l in m.group(1).strip().splitlines() if l.startswith("- ")]
existing.append(entry)
existing = existing[-50:]
new_block = "<!-- QA-LOG-START -->\n" + "\n".join(existing) + "\n<!-- QA-LOG-END -->"
text = text[:m.start()] + new_block + text[m.end():]
with open(path, "w") as f: f.write(text)
PYEOF
fi

if any_red; then
  if [ "${SIMPLERDEV_QA_GATE_SOFT:-0}" != "1" ]; then
    echo "QA gate BLOCKING: fix failures before stopping. Set SIMPLERDEV_QA_GATE_SOFT=1 to override." >&2
    exit 2
  fi
fi

exit 0
