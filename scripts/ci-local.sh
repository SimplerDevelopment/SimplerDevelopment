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
# ── Typechecking the committed tree ─────────────────────────────────────────
# Typecheck the COMMITTED tree (HEAD), not the working tree, so another session's
# untracked WIP can't fail an otherwise-clean push. There is deliberately NO
# working-tree fallback: if HEAD can't be isolated, the gate fails loudly rather
# than silently typechecking whatever happens to be in the working directory.
#
# PERFORMANCE (measured 2026-08-20, 357k-line repo):
#   fresh mktemp worktree, cold  ~314s   <- what this did on EVERY push
#   persistent worktree, warm     ~80s
# `incremental: true` is set in tsconfig.json and a 10MB tsconfig.tsbuildinfo is
# maintained by interactive `bun run typecheck` runs -- but it is gitignored, so
# a `git worktree add HEAD` checkout never has it, and this gate threw the cache
# away every single time. Copying the cache INTO a mktemp dir does not help
# either: tsbuildinfo keys on absolute paths, so a new random root invalidates
# every entry. Only a STABLE path lets TypeScript reuse it, hence the persistent
# worktree below. (The same class of bug was already known here -- see the
# next-env.d.ts copy, which exists because it is likewise gitignored.)

# Resolve a node_modules that actually has tsc. Agent worktrees under
# .claude/worktrees/ are created WITHOUT an install, so "$PWD/node_modules" is
# frequently missing (or an empty dir holding only .cache/.vite from a prior
# vitest run). Symlinking that produced a 37s failure with a misleading
# "Cannot find module .../node_modules/.bin/tsc" that reads like a type error.
# Fall back to the main checkout's install, which a worktree shares anyway.
resolve_node_modules() {
  local nm="$PWD/node_modules" main_root
  if [ ! -x "$nm/.bin/tsc" ]; then
    main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)")
    if [ -n "$main_root" ] && [ -x "$main_root/node_modules/.bin/tsc" ]; then
      nm="$main_root/node_modules"
    else
      printf '\033[31mERROR: no node_modules containing .bin/tsc found.\033[0m\n' >&2
      printf '\033[31m       Looked in: %s\033[0m\n' "$PWD/node_modules" >&2
      [ -n "$main_root" ] && printf '\033[31m              and: %s\033[0m\n' "$main_root/node_modules" >&2
      printf '\033[31m       Run `bun install` (in this worktree or the main checkout).\033[0m\n' >&2
      return 1
    fi
  fi
  printf '%s' "$nm"
}

# next-env.d.ts / .next/types are gitignored, so absent from a HEAD checkout;
# copy the ambient Next types in (if present) so this matches a normal tsc run.
prepare_tc_dir() {
  local dir="$1" nm="$2"
  [ -e "$dir/node_modules" ] || ln -s "$nm" "$dir/node_modules"
  [ -f next-env.d.ts ] && cp next-env.d.ts "$dir/next-env.d.ts"
  return 0
}

run_tsc_in() {
  ( cd "$1" && node --max-old-space-size=6144 node_modules/.bin/tsc --noEmit )
}

# Slow path: a throwaway worktree. Correct but always cold (~5 min). Used when
# another push already holds the persistent worktree, or reusing it failed.
typecheck_ephemeral() {
  local nm="$1" tmpdir rc=0
  git worktree prune >/dev/null 2>&1
  tmpdir=$(mktemp -d)
  if ! git worktree add -q --detach "$tmpdir" HEAD; then
    printf '\033[31mERROR: could not create a HEAD worktree to typecheck the committed tree;\033[0m\n' >&2
    printf '\033[31m       refusing to fall back to the working tree (would typecheck untracked WIP).\033[0m\n' >&2
    rm -rf "$tmpdir"
    return 1
  fi
  prepare_tc_dir "$tmpdir" "$nm"
  run_tsc_in "$tmpdir" || rc=$?
  git worktree remove -f "$tmpdir" >/dev/null 2>&1 || rm -rf "$tmpdir"
  return $rc
}

typecheck_committed() {
  local nm head_sha common_dir wt lock rc=0
  nm=$(resolve_node_modules) || return 1
  head_sha=$(git rev-parse HEAD) || return 1
  common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [ -z "$common_dir" ]; then
    typecheck_ephemeral "$nm"; return $?
  fi
  wt="$common_dir/ci-typecheck-wt"
  lock="$common_dir/ci-typecheck-wt.lock"

  # Escape hatch: CI_LOCAL_FRESH=1 discards the worktree and its cache. Reach for
  # it if you ever suspect the incremental cache is lying to you.
  if [ "${CI_LOCAL_FRESH:-0}" = "1" ]; then
    git worktree remove -f "$wt" >/dev/null 2>&1
    rm -rf "$wt" "$lock"
    echo "  (CI_LOCAL_FRESH=1 — persistent typecheck worktree discarded)"
  fi

  # Lock via mkdir (atomic). Concurrent pushes are routine here: multiple agent
  # sessions share this checkout, and two tsc runs writing one tsbuildinfo would
  # corrupt it. A loser does NOT wait -- it takes the ephemeral path, so the
  # worst case is exactly the old behaviour rather than a stalled push.
  if ! mkdir "$lock" 2>/dev/null; then
    if [ -f "$lock/pid" ] && ! kill -0 "$(cat "$lock/pid" 2>/dev/null)" 2>/dev/null; then
      # Owner died (killed push, crashed shell). Steal it rather than degrading
      # to the slow path forever.
      rm -rf "$lock"
      mkdir "$lock" 2>/dev/null || { typecheck_ephemeral "$nm"; return $?; }
    else
      echo "  (persistent typecheck worktree busy — using a throwaway one)"
      typecheck_ephemeral "$nm"; return $?
    fi
  fi
  echo $$ > "$lock/pid"
  # shellcheck disable=SC2064
  trap "rm -rf '$lock'" RETURN

  # Reuse if healthy, else rebuild. `checkout --detach --force` syncs tracked
  # files (including deletions); `clean -fd` removes untracked leftovers from the
  # previous commit, which would otherwise be typechecked as if they were real.
  # The three -e exclusions are the gitignored files we deliberately keep: the
  # incremental cache (the whole point) plus the two we injected.
  if [ ! -d "$wt" ] \
     || ! git -C "$wt" rev-parse --git-dir >/dev/null 2>&1 \
     || ! git -C "$wt" checkout --detach --force -q "$head_sha" 2>/dev/null \
     || ! git -C "$wt" clean -fdq -e tsconfig.tsbuildinfo -e node_modules -e next-env.d.ts 2>/dev/null; then
    git worktree remove -f "$wt" >/dev/null 2>&1
    rm -rf "$wt"
    git worktree prune >/dev/null 2>&1
    if ! git worktree add -q --detach "$wt" "$head_sha"; then
      printf '\033[31mERROR: could not create the persistent HEAD worktree;\033[0m\n' >&2
      printf '\033[31m       refusing to fall back to the working tree.\033[0m\n' >&2
      rm -rf "$lock"; trap - RETURN
      return 1
    fi
  fi

  prepare_tc_dir "$wt" "$nm"
  run_tsc_in "$wt" || rc=$?
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
