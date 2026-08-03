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
TAG=""               # playwright --grep (e2e) and vitest --testNamePattern (integration)
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

# Full per-step logs go to coverage/test-output.log so failure output is never
# truncated, regardless of how the caller redirects/pipes our stdout.
TEST_OUTPUT_LOG="$ROOT/coverage/test-output.log"
: > "$TEST_OUTPUT_LOG"

run_step() {
  local name="$1"; shift
  echo ""
  echo "==> $name"
  echo "" >> "$TEST_OUTPUT_LOG"
  echo "==> $name" >> "$TEST_OUTPUT_LOG"
  # Tee preserves the live stream to the terminal AND captures the full,
  # untruncated run output to coverage/test-output.log for post-hoc review.
  # PIPESTATUS is bash-specific; we set -o pipefail above so any non-zero
  # exit from the test command still propagates.
  if ! "$@" 2>&1 | tee -a "$TEST_OUTPUT_LOG"; then
    echo "FAIL: $name (full log: $TEST_OUTPUT_LOG)"
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
  # vitest doesn't have first-class tag filtering; we route --tag to
  # --testNamePattern so e.g. `--tag=tenancy` only runs describe/it blocks
  # whose full name contains `@tenancy` (the convention in tests/integration).
  INT_VITEST_ARGS=(--project=integration-ui --project=integration-api)
  if [[ -n "$TAG" ]]; then
    # Strip any leading '@' so both `--tag=tenancy` and `--tag=@tenancy`
    # work, then re-prefix to match the in-test convention (`@tenancy`).
    INT_TAG="${TAG#@}"
    INT_VITEST_ARGS+=(--testNamePattern "@${INT_TAG}")
  fi
  if [[ "$NO_COVERAGE" == "1" ]]; then
    run_step "integration" npx vitest run "${INT_VITEST_ARGS[@]}"
  else
    run_step "integration" npx vitest run "${INT_VITEST_ARGS[@]}" \
      --coverage --coverage.reportsDirectory=coverage/vitest/integration
  fi
fi

# ── Layer 3: E2E (Playwright) ───────────────────────────────────────────
if [[ "$LAYER" == "all" || "$LAYER" == "e2e" ]]; then
  # The credential brute-force guard buckets sign-in attempts per client IP.
  # Every Playwright request comes from localhost (one bucket) and dozens of
  # specs each sign in, so the 10/15min limit trips and turns the suite red.
  # `next dev`/`next start` force NODE_ENV away from 'test', so opt the server
  # into the explicit bypass here (lib/auth.ts). Never set in prod deploys.
  export DISABLE_AUTH_RATE_LIMIT=1
  # Realtime collab token route 503s without a signing secret. Provide a throwaway
  # one for e2e so the @critical realtime spec can mint/verify tokens. Not a prod secret.
  export REALTIME_JWT_SECRET="${REALTIME_JWT_SECRET:-e2e-realtime-secret}"
  # The agentic-os specs assume catalog mode (no in-browser executor), matching
  # CI hosts without the `claude` CLI. Force it off so a developer's local
  # AGENTIC_OS_EXECUTOR_ENABLED=1 doesn't flip the run-drawer UI under test.
  export AGENTIC_OS_EXECUTOR_ENABLED=0
  # In --mode=prod the server runs as a real production build, where Auth.js v5
  # refuses requests from an untrusted Host (localhost) unless told to trust it.
  # Dev mode auto-trusts localhost; prod does not. Without this every sign-in
  # 500s with UntrustedHost and the whole suite goes red.
  export AUTH_TRUST_HOST=true
  # NextAuth refuses every sign-in with MissingSecret (→ 500, whole suite red) if
  # no secret is set. A fresh checkout has no .env.local, so default a throwaway
  # here. Crypto keys are defaulted too (correct lengths) so the BYOK / Google
  # integrations / OAuth-state routes don't 500. All `:-` so a dev's real values
  # win. Never prod secrets.
  export AUTH_SECRET="${AUTH_SECRET:-e2e-throwaway-auth-secret-not-for-prod}"
  export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$AUTH_SECRET}"
  export ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
  export WORKSPACE_TENANT_SECRETS_KEY="${WORKSPACE_TENANT_SECRETS_KEY:-$(openssl rand -hex 32)}"
  export OAUTH_STATE_SECRET="${OAUTH_STATE_SECRET:-$(openssl rand -hex 32)}"
  export PORTAL_KMS_KEY="${PORTAL_KMS_KEY:-$(openssl rand -base64 32)}"
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
    echo "server never became healthy; last 200 lines (full log: coverage/server.log):"
    tail -200 coverage/server.log
    exit 1
  fi

  PW_ARGS=()
  [[ -n "$TAG"   ]] && PW_ARGS+=(--grep "$TAG")
  [[ -n "$SHARD" ]] && PW_ARGS+=(--shard="$SHARD")
  # Use the `${arr[@]+"${arr[@]}"}` idiom so an EMPTY array doesn't trip
  # `set -u` ("unbound variable") on macOS's default bash 3.2.
  run_step "e2e" npx playwright test ${PW_ARGS[@]+"${PW_ARGS[@]}"} --reporter=list,html

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

if [[ -f "$TEST_OUTPUT_LOG" ]]; then
  echo ""
  echo "Full test output captured at: $TEST_OUTPUT_LOG"
fi

# ── Runbook pointer on failure ──────────────────────────────────────────
# Harness-engineering (AI DevCon 2026): a failing gate should point at its
# remediation runbook so an agent self-heals instead of blindly re-running.
# Keyed to the tag/layer that failed; all targets live in vault/06 - Validation.
if [[ "$FAIL" != "0" ]]; then
  echo ""
  echo "────────────────────────────────────────────────────────────────────"
  echo "✗ Gate failed — read the runbook before re-running:"
  case "${TAG#@}" in
    tenancy)  echo "  → vault/06 - Validation/Tenancy Regression.md  (tenant-leak triage)";;
    critical) echo "  → vault/06 - Validation/QA Flows.md            (golden-path repair)";;
    *)
      case "$LAYER" in
        e2e) echo "  → vault/06 - Validation/E2E Patterns.md         (flaky/selector triage)";;
        *)   echo "  → vault/06 - Validation/Gate Picking.md         (which gate, why, how to read it)";;
      esac
      ;;
  esac
  echo "  Full output: $TEST_OUTPUT_LOG"
  echo "────────────────────────────────────────────────────────────────────"
fi

exit "$FAIL"
