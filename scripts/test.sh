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

# ── E2E database target guard ───────────────────────────────────────────
# MUST run before the DB prep below. `reset-e2e-db.ts` drops and recreates, and
# `seed-admin-e2e.ts` writes — and both resolve DATABASE_URL themselves via
# dotenv injection from .env, which in this repo is a REMOTE Railway URL.
#
# Checking only the ambient $DATABASE_URL would be theatre: the shell usually
# has it unset, so the check passes and the child then injects the remote value
# anyway. That is exactly how a @critical run on 2026-08-05 came to issue eight
# INSERTs against a Railway database from cov-u11.spec.ts.
#
# So: resolve the value the children will actually see (shell > .env.local >
# .env), refuse a remote host, then EXPORT it — every child (tsx, playwright,
# and the 28 e2e specs that shell out to raw `psql "$DATABASE_URL"`) inherits
# one vetted target instead of resolving its own.
#
# A local *dev* DB is legitimate here: e2e specs write targeted fixture rows
# rather than truncating, which is why the integration layer's stricter
# "name must contain test" rule is deliberately not reused.
read_env_var() {  # $1=file  $2=key
  [[ -f "$1" ]] || return 0
  local line
  line="$(grep -aE "^$2=" "$1" | head -1)"
  [[ -z "$line" ]] && return 0
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

if [[ "$LAYER" == "all" || "$LAYER" == "e2e" ]]; then
  E2E_DB_URL="${DATABASE_URL:-}"
  [[ -z "$E2E_DB_URL" ]] && E2E_DB_URL="$(read_env_var "$ROOT/.env.local" DATABASE_URL)"
  [[ -z "$E2E_DB_URL" ]] && E2E_DB_URL="$(read_env_var "$ROOT/.env" DATABASE_URL)"

  if [[ -n "$E2E_DB_URL" && "${ALLOW_REMOTE_DB:-0}" != "1" ]]; then
    E2E_DB_HOST="${E2E_DB_URL#*://}"   # strip scheme
    E2E_DB_HOST="${E2E_DB_HOST#*@}"    # strip credentials
    E2E_DB_HOST="${E2E_DB_HOST%%/*}"   # strip /dbname
    E2E_DB_HOST="${E2E_DB_HOST%%:*}"   # strip :port
    E2E_DB_NAME="${E2E_DB_URL##*/}"
    E2E_DB_NAME="${E2E_DB_NAME%%\?*}"
    case "$E2E_DB_HOST" in
      localhost|127.0.0.1|::1|host.docker.internal|"") ;;
      *)
        if [[ "$E2E_DB_NAME" != *test* ]]; then
          echo "✖ e2e: refusing to run against remote database host '${E2E_DB_HOST}'." >&2
          echo "  The e2e layer resets/seeds the database and its specs write fixture" >&2
          echo "  rows via psql. Pointing that at a remote host writes to someone" >&2
          echo "  else's environment." >&2
          echo "  Use a local DB (.env.local pins localhost), or override only if you" >&2
          echo "  are certain: ALLOW_REMOTE_DB=1 $0 ..." >&2
          exit 1
        fi
        ;;
    esac
  fi

  # Pin it so no child re-resolves .env and lands somewhere else.
  [[ -n "$E2E_DB_URL" ]] && export DATABASE_URL="$E2E_DB_URL"
fi

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
  # Refuse to run the integration layer against a database that isn't clearly a
  # test database.
  #
  # The integration suites truncate and reseed whatever they connect to. Invoked
  # via `bun test:tenancy` (scripts/run-tenancy.sh) that is pinned to
  # simplerdev_test, but calling this script directly inherits the ambient
  # DATABASE_URL — which in this repo is a REMOTE Railway URL in .env. That is
  # not hypothetical: on 2026-08-04 a direct invocation ran against a remote
  # database and left a stray row change behind.
  #
  # Allowed: a URL whose database name contains "test", or an explicit
  # ALLOW_NON_TEST_DB=1 for the rare case where you really mean it.
  INT_DB_URL="${DATABASE_URL_TEST:-${DATABASE_URL:-}}"
  INT_DB_NAME="${INT_DB_URL##*/}"      # strip everything up to the last /
  INT_DB_NAME="${INT_DB_NAME%%\?*}"    # strip any ?query suffix
  if [[ "${ALLOW_NON_TEST_DB:-0}" != "1" ]]; then
    if [[ -z "$INT_DB_URL" ]]; then
      echo "✖ integration: no DATABASE_URL_TEST or DATABASE_URL set." >&2
      echo "  Use \`bun test:tenancy\` / \`bun test:integration:local\`, which pin a local test DB." >&2
      exit 1
    fi
    if [[ "$INT_DB_NAME" != *test* ]]; then
      echo "✖ integration: refusing to run against database '${INT_DB_NAME}'." >&2
      echo "  These suites truncate and reseed the database they connect to, and this" >&2
      echo "  name doesn't look like a test DB (expected the name to contain 'test')." >&2
      echo "  Use \`bun test:tenancy\` or \`bun test:integration:local\` — both pin simplerdev_test." >&2
      echo "  Override only if you are certain: ALLOW_NON_TEST_DB=1 $0 ..." >&2
      exit 1
    fi
  fi

  # vitest doesn't have first-class tag filtering; we route --tag to
  # --testNamePattern so e.g. `--tag=tenancy` only runs describe/it blocks
  # whose full name contains `@tenancy` (the convention in tests/integration).
  INT_VITEST_ARGS=(--project=integration-ui --project=integration-api)
  if [[ -n "$TAG" ]]; then
    # Strip any leading '@' so both `--tag=tenancy` and `--tag=@tenancy`
    # work, then re-prefix to match the in-test convention (`@tenancy`).
    INT_TAG="${TAG#@}"
    INT_VITEST_ARGS+=(--testNamePattern "@${INT_TAG}")

    # …but --testNamePattern only decides which tests RUN. vitest still loads
    # and transforms every matching file to discover the names inside it: a
    # measured tenancy run collected 220 files and 2192 tests to execute 458,
    # skipping 164 files entirely. Narrowing to files that actually contain the
    # tag keeps the name filter authoritative (a stray file can't sneak untagged
    # tests in) while skipping the rest.
    #
    # Worth calibrating: this is a SMALL win. In that run transform+import was
    # 37s of 1349s wall — under 3%. The cost is test execution (2522s of CPU
    # across 458 tests, ~5.5s each) divided by `maxWorkers` in vitest.config.ts,
    # which is where any real speedup has to come from.
    #
    # Falls back to the unfiltered run if grep finds nothing, so a tag that
    # exists only in describe-block metadata still behaves as before rather
    # than silently running zero tests.
    INT_TAG_FILES=()
    while IFS= read -r f; do
      [[ -n "$f" ]] && INT_TAG_FILES+=("$f")
    done < <(grep -rl -- "@${INT_TAG}" tests/integration --include='*.test.ts' 2>/dev/null | sort)
    if (( ${#INT_TAG_FILES[@]} > 0 )); then
      echo ">> tag '@${INT_TAG}' found in ${#INT_TAG_FILES[@]} file(s) — restricting the run to those"
      INT_VITEST_ARGS+=("${INT_TAG_FILES[@]}")
    else
      echo ">> tag '@${INT_TAG}' matched no files by grep — running the full integration set"
    fi
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
  # The storefront checkout golden-path spec creates a REAL Stripe test-mode
  # PaymentIntent, so it needs the secret key in the *test* process (the server
  # gets its own copy from .env). We deliberately do not source .env here — it
  # carries a remote DATABASE_URL (see the guard above) — so lift just this one
  # var, and only when it is a test key. A live key is never propagated into a
  # test run; without a match the spec skips itself.
  if [[ -z "${STRIPE_SECRET_KEY:-}" && -f "$ROOT/.env" ]]; then
    STRIPE_SECRET_KEY="$(grep -aE '^STRIPE_SECRET_KEY=sk_test_' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'[:space:]')"
    [[ -n "$STRIPE_SECRET_KEY" ]] && export STRIPE_SECRET_KEY
  fi
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
