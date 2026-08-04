#!/usr/bin/env bash
# Local CI for simplerdevelopment2026 — the fast pre-push gate. The heavy suites
# (unit + coverage floors, tenancy, critical e2e) are enforced by GitHub Actions
# (.github/workflows/ci.yml — free on this public repo); this script keeps only
# the checks whose signal-per-second earns a spot in front of every push.
# Mirrors tests/CI-GATES.md.
#
# Usage:
#   scripts/ci-local.sh            default gate: boundaries, budgets, docs, typecheck (committed HEAD)
#   scripts/ci-local.sh --quick    cheap checks only (no tsc) — seconds
#   scripts/ci-local.sh --unit     + unit tests (CI runs them anyway, with coverage)
#   scripts/ci-local.sh --tenancy  + multi-tenant leak regression (needs local DB)
#   scripts/ci-local.sh --full     + unit + tenancy + critical e2e (slow; needs DB + Playwright)
#
set -uo pipefail
cd "$(dirname "$0")/.."   # -> simplerdevelopment2026 root

RUN_TENANCY=0; RUN_E2E=0; RUN_UNIT=0; QUICK=0
for a in "$@"; do
  case "$a" in
    --unit)    RUN_UNIT=1 ;;
    --tenancy) RUN_TENANCY=1 ;;
    --full)    RUN_UNIT=1; RUN_TENANCY=1; RUN_E2E=1 ;;
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
typecheck_committed() {
  # Typecheck the COMMITTED tree (HEAD), not the working tree, so another session's
  # untracked WIP can't fail an otherwise-clean push. There is deliberately NO
  # working-tree fallback: if HEAD can't be isolated, the gate fails loudly rather
  # than silently typechecking whatever happens to be in the working directory.
  local tmpdir rc=0
  git worktree prune >/dev/null 2>&1   # clear stale registrations from prior killed runs
  tmpdir=$(mktemp -d)
  if ! git worktree add -q --detach "$tmpdir" HEAD; then
    printf '\033[31mERROR: could not create a HEAD worktree to typecheck the committed tree;\033[0m\n'
    printf '\033[31m       refusing to fall back to the working tree (would typecheck untracked WIP).\033[0m\n'
    rm -rf "$tmpdir"
    return 1
  fi
  # Resolve a node_modules that actually has tsc. Agent worktrees under
  # .claude/worktrees/ are created WITHOUT an install, so "$PWD/node_modules" is
  # frequently missing (or an empty dir holding only .cache/.vite from a prior
  # vitest run). Symlinking that produced a 37s failure with a misleading
  # "Cannot find module .../node_modules/.bin/tsc" that reads like a type error.
  # Fall back to the main checkout's install, which a worktree shares anyway.
  local nm="$PWD/node_modules" main_root
  if [ ! -x "$nm/.bin/tsc" ]; then
    main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)")
    if [ -n "$main_root" ] && [ -x "$main_root/node_modules/.bin/tsc" ]; then
      nm="$main_root/node_modules"
    else
      printf '\033[31mERROR: no node_modules containing .bin/tsc found.\033[0m\n'
      printf '\033[31m       Looked in: %s\033[0m\n' "$PWD/node_modules"
      [ -n "$main_root" ] && printf '\033[31m              and: %s\033[0m\n' "$main_root/node_modules"
      printf '\033[31m       Run `bun install` (in this worktree or the main checkout).\033[0m\n'
      git worktree remove -f "$tmpdir" >/dev/null 2>&1 || rm -rf "$tmpdir"
      return 1
    fi
  fi
  ln -s "$nm" "$tmpdir/node_modules"
  # next-env.d.ts / .next/types are gitignored, so absent from the HEAD checkout;
  # copy the ambient Next types in (if present) so this matches a normal tsc run.
  [ -f next-env.d.ts ] && cp next-env.d.ts "$tmpdir/next-env.d.ts"
  (cd "$tmpdir" && node --max-old-space-size=6144 node_modules/.bin/tsc --noEmit) || rc=$?
  git worktree remove -f "$tmpdir" >/dev/null 2>&1 || rm -rf "$tmpdir"
  return $rc
}

run_tenancy() {
  # test:tenancy self-provisions the local PG17 test DB (run-tenancy.sh) and
  # never uses ambient DATABASE_URL. Fail open only when PG17 isn't installed
  # and no explicit test DB was provided.
  if [ -z "${DATABASE_URL_TEST:-}" ] && [ ! -x /usr/local/opt/postgresql@17/bin/pg_ctl ]; then
    printf '\n\033[33m⚠ TENANCY GATE SKIPPED — postgresql@17 not installed and DATABASE_URL_TEST unset.\033[0m\n'
    printf '\033[33m  Required after data-access changes: brew install postgresql@17, then bun test:tenancy\033[0m\n\n'
    return 0
  fi
  bun run test:tenancy
}

if [ "$QUICK" = 0 ]; then
  step "typecheck (committed HEAD)" typecheck_committed
  # Unit tests moved to GitHub Actions (ci.yml quality job, WITH coverage
  # floors) — run locally on demand with --unit / --full.
  [ "$RUN_UNIT" = 1 ] && step "unit tests" bun run test:unit
  info "dead code (knip)" bunx knip --no-exit-code
fi

[ "$RUN_TENANCY" = 1 ] && step "tenancy regression" run_tenancy
[ "$RUN_E2E"     = 1 ] && step "critical e2e"       bun run test:critical

printf '\n\033[1m── local CI summary ──\033[0m\n'
for r in "${RESULTS[@]}"; do echo "  $r"; done
if [ "$fail" -ne 0 ]; then
  printf '\n\033[31mLocal CI failed.\033[0m Fix the ❌ steps, or bypass once with: git push --no-verify\n'
  exit 1
fi
printf '\n\033[32mLocal CI passed.\033[0m\n'
