#!/usr/bin/env bash
# Single entry point for the full test pipeline.
# Usage examples:
#   scripts/test.sh                                  # everything, coverage on
#   scripts/test.sh --layer=unit --no-coverage
#   scripts/test.sh --layer=e2e --tag=@critical
#   scripts/test.sh --mode=prod                      # CI mode
#   scripts/test.sh --layer=e2e --shard=2/4 --reset-db
set -euo pipefail

LAYER="all"          # unit | integration | e2e | all
MODE="dev"           # dev | prod  (prod = next build + start; CI authority)
TAG=""               # playwright grep (--grep)
SHARD=""
RESET_DB=0
NO_COVERAGE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --layer=*)      LAYER="${1#*=}";;
    --mode=*)       MODE="${1#*=}";;
    --tag=*)        TAG="${1#*=}";;
    --shard=*)      SHARD="${1#*=}";;
    --reset-db)     RESET_DB=1;;
    --no-coverage)  NO_COVERAGE=1;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1;;
  esac
  shift
done

echo ">> layer=$LAYER mode=$MODE tag=${TAG:-<none>} shard=${SHARD:-<none>} reset_db=$RESET_DB coverage=$((1-NO_COVERAGE))"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

rm -rf coverage/
mkdir -p coverage/.v8-server coverage/.v8-client coverage/.v8-merged coverage/vitest

# ── DB prep ─────────────────────────────────────────────────────────────
if [[ "$RESET_DB" == "1" ]]; then
  echo ">> resetting E2E database"
  npx tsx scripts/reset-e2e-db.ts
fi

if [[ "$LAYER" == "all" || "$LAYER" == "e2e" ]]; then
  # seed is idempotent; only needed for E2E which hits the shared db
  npx tsx scripts/seed-admin-e2e.ts
fi

FAIL=0

run_step() {
  local name="$1"; shift
  echo ""
  echo "==> $name"
  if ! "$@"; then
    echo "FAIL: $name"
    FAIL=1
  fi
}

# ── Layer 1: Unit ───────────────────────────────────────────────────────
if [[ "$LAYER" == "all" || "$LAYER" == "unit" ]]; then
  if [[ "$NO_COVERAGE" == "1" ]]; then
    run_step "unit" npx vitest run --project=unit
  else
    run_step "unit" npx vitest run --project=unit \
      --coverage --coverage.reportsDirectory=coverage/vitest/unit
  fi
fi

# ── Layer 2: Integration (UI + API) ─────────────────────────────────────
if [[ "$LAYER" == "all" || "$LAYER" == "integration" ]]; then
  if [[ "$NO_COVERAGE" == "1" ]]; then
    run_step "integration" npx vitest run --project=integration-ui --project=integration-api
  else
    run_step "integration" npx vitest run --project=integration-ui --project=integration-api \
      --coverage --coverage.reportsDirectory=coverage/vitest/integration
  fi
fi

# ── Layer 3: E2E (Playwright) ───────────────────────────────────────────
if [[ "$LAYER" == "all" || "$LAYER" == "e2e" ]]; then
  export NODE_V8_COVERAGE="$ROOT/coverage/.v8-server"
  if [[ "$NO_COVERAGE" == "1" ]]; then
    export COLLECT_CLIENT_COVERAGE=0
  else
    export COLLECT_CLIENT_COVERAGE=1
  fi

  if [[ "$MODE" == "prod" ]]; then
    echo ">> building prod bundle for E2E"
    npm run build
    SERVER_CMD=(npm run start)
  else
    SERVER_CMD=(npm run dev)
  fi

  echo ">> starting server: ${SERVER_CMD[*]}"
  if [[ "$NO_COVERAGE" == "1" ]]; then
    "${SERVER_CMD[@]}" >coverage/server.log 2>&1 &
  else
    npx c8 --no-clean --reporter=none -- "${SERVER_CMD[@]}" >coverage/server.log 2>&1 &
  fi
  SERVER_PID=$!
  trap 'kill -SIGTERM $SERVER_PID 2>/dev/null || true; wait $SERVER_PID 2>/dev/null || true' EXIT

  echo ">> waiting for health endpoint"
  if ! npx wait-on http://localhost:3000/api/health -t 120000; then
    echo "server never became healthy; tail:"
    tail -60 coverage/server.log
    exit 1
  fi

  PW_ARGS=()
  [[ -n "$TAG"   ]] && PW_ARGS+=(--grep "$TAG")
  [[ -n "$SHARD" ]] && PW_ARGS+=(--shard="$SHARD")
  run_step "e2e" npx playwright test "${PW_ARGS[@]}" --reporter=list,html

  # Clean shutdown so V8 coverage flushes to disk
  echo ">> stopping server"
  kill -SIGTERM $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
  trap - EXIT
fi

# ── Merge + report ──────────────────────────────────────────────────────
if [[ "$NO_COVERAGE" != "1" ]]; then
  echo ""
  echo "==> building coverage reports"

  if [[ -d coverage/.v8-client && -n "$(ls -A coverage/.v8-client 2>/dev/null)" ]]; then
    npx tsx scripts/convert-client-coverage.ts || echo "(client coverage conversion skipped)"
  fi

  if [[ -d coverage/.v8-server && -n "$(ls -A coverage/.v8-server 2>/dev/null)" ]]; then
    npx c8 report --temp-directory coverage/.v8-server \
      --reporter=html --reporter=lcov --reporter=text-summary \
      --report-dir coverage/server || true
  fi

  if [[ -d coverage/.v8-merged && -n "$(ls -A coverage/.v8-merged 2>/dev/null)" ]]; then
    npx c8 report --temp-directory coverage/.v8-merged \
      --reporter=html --reporter=lcov --reporter=text-summary \
      --report-dir coverage/combined || true
  fi

  echo ""
  echo "Coverage reports:"
  [[ -d coverage/vitest  ]] && echo "  - Vitest (unit + integration): coverage/vitest/**/index.html"
  [[ -d coverage/server  ]] && echo "  - E2E server:                  coverage/server/index.html"
  [[ -d coverage/combined ]] && echo "  - Combined (server+client):   coverage/combined/index.html"
fi

# ── CI threshold gate ───────────────────────────────────────────────────
if [[ "${CI:-}" == "1" && "$NO_COVERAGE" != "1" ]]; then
  if [[ -d coverage/.v8-merged && -n "$(ls -A coverage/.v8-merged 2>/dev/null)" ]]; then
    npx c8 check-coverage --lines 75 --functions 70 --branches 60 \
      --temp-directory coverage/.v8-merged || FAIL=1
  fi
fi

exit "$FAIL"
