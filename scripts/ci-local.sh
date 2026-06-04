#!/usr/bin/env bash
# Local CI for simplerdevelopment2026 — the free, sole-dev replacement for GitHub Actions.
# Mirrors the gates described in tests/CI-GATES.md, but runs on your machine (via git hooks
# in .githooks/, or by hand). There is no GitHub remote, so this IS the CI.
#
# Usage:
#   scripts/ci-local.sh            default gate: boundaries, budgets, docs, lint, typecheck, unit
#   scripts/ci-local.sh --quick    cheap checks only (no tsc / no tests) — seconds
#   scripts/ci-local.sh --tenancy  + multi-tenant leak regression (needs local DB)
#   scripts/ci-local.sh --full     + tenancy + critical e2e (slow; needs DB + Playwright)
#
set -uo pipefail
cd "$(dirname "$0")/.."   # -> simplerdevelopment2026 root

RUN_TENANCY=0; RUN_E2E=0; QUICK=0
for a in "$@"; do
  case "$a" in
    --tenancy) RUN_TENANCY=1 ;;
    --full)    RUN_TENANCY=1; RUN_E2E=1 ;;
    --quick)   QUICK=1 ;;
    *) echo "unknown flag: $a"; exit 2 ;;
  esac
done

fail=0
RESULTS=()
step() { # hard gate: failure fails local CI
  local name="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  local start=$SECONDS
  if "$@"; then RESULTS+=("✅ $name ($((SECONDS-start))s)")
  else RESULTS+=("❌ $name ($((SECONDS-start))s)"); fail=1; fi
}
info() { # informational: never fails the build
  local name="$1"; shift
  printf '\n\033[1m▶ %s (informational)\033[0m\n' "$name"
  "$@" || true
  RESULTS+=("ℹ️  $name")
}

# Cheap, fast gates first (good signal-to-time ratio):
step "boundaries (dependency-cruiser)" bunx depcruise app lib components --config .dependency-cruiser.cjs
step "file-size budget"                bun scripts/check-file-budget.ts
step "doc drift"                       bun scripts/check-doc-drift.ts

# Whole-repo lint is a backlog (the repo doesn't pass eslint cleanly yet), so it's
# informational here. NEW lint errors are blocked per-commit by .githooks/pre-commit,
# which lints only the files you touch. Burn the backlog down, then promote to `step`.
info "lint backlog (eslint)"           bun run lint

if [ "$QUICK" = 0 ]; then
  step "typecheck (tsc)" bunx tsc --noEmit
  step "unit tests"      bun run test:unit
  info "dead code (knip)" bunx knip --no-exit-code
fi

[ "$RUN_TENANCY" = 1 ] && step "tenancy regression" bun run test:tenancy
[ "$RUN_E2E"     = 1 ] && step "critical e2e"       bun run test:critical

printf '\n\033[1m── local CI summary ──\033[0m\n'
for r in "${RESULTS[@]}"; do echo "  $r"; done
if [ "$fail" -ne 0 ]; then
  printf '\n\033[31mLocal CI failed.\033[0m Fix the ❌ steps, or bypass once with: git push --no-verify\n'
  exit 1
fi
printf '\n\033[32mLocal CI passed.\033[0m\n'
