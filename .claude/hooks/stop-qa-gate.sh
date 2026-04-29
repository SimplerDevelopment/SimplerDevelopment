#!/usr/bin/env bash
# Stop hook — advisory QA gate. Runs lint + typecheck if this session touched code.
# Non-blocking by default: outputs a one-line summary into the transcript.
# Set SIMPLERDEV_QA_GATE_BLOCK=1 in env (e.g., for nightly autonomous runs) to make it block on red.
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

elapsed=$(( $(date +%s) - start ))
rm -f "$marker"

summary="QA gate (${elapsed}s):"
[ $tsc_rc -eq 0 ]  && summary="$summary  typecheck OK" || summary="$summary  typecheck FAIL"
[ $lint_rc -eq 0 ] && summary="$summary  lint OK"      || summary="$summary  lint FAIL"

echo "$summary"

if [ $tsc_rc -ne 0 ] || [ $lint_rc -ne 0 ]; then
  echo "----- typecheck output (last 40 lines) -----"
  echo "$tsc_out" | tail -40
  echo "----- lint output (last 40 lines) -----"
  echo "$lint_out" | tail -40

  if [ "${SIMPLERDEV_QA_GATE_BLOCK:-0}" = "1" ]; then
    echo "QA gate BLOCKING stop because SIMPLERDEV_QA_GATE_BLOCK=1" >&2
    exit 2
  fi
fi

exit 0
