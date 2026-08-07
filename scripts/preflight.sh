#!/usr/bin/env bash
# Preconditions for a long test run. Fails FAST and loudly instead of letting a
# 40-minute gate produce a result nobody can trust.
#
# Usage:
#   scripts/preflight.sh            # check, exit non-zero if unsafe
#   scripts/preflight.sh --warn     # report only, always exit 0
#   MAX_LOAD=45 scripts/preflight.sh
#
# Every check here exists because it actually cost a gate run on 2026-08-06:
#
#   1. LOAD — the box sat at 250-925 for most of a day (video call, DAW,
#      browser, ffmpeg, plus agents). Playwright's 60s login fixture times out
#      on its own up there, so EVERY run came back red and a timeout was
#      indistinguishable from a real failure. Better to refuse than to spend 38
#      minutes manufacturing noise.
#
#   2. SIBLING WORKTREES — this repo carries six. A checkout in one of them
#      overwrote 1,288 files in THIS tree, 36 minutes into a gate, from a
#      divergent June branch. The run was void before it finished and nothing
#      in the reflog recorded it. If another worktree is dirty, someone is
#      working in it and your tree is not yours alone.
#
#   3. TREE vs HEAD — same incident, detected directly: if the working tree
#      does not match HEAD, you are about to test something other than what
#      you committed.
#
#   4. STALE SERVER — test.sh starts its own server, but Playwright's config
#      has reuseExistingServer:true. A leftover dev server on :3000 gets reused
#      with a DIFFERENT AUTH_SECRET, and every single spec fails at login. Cost
#      an entire run before it was understood.
#
#   5. DB TARGET — the e2e layer seeds and writes. .env holds a REMOTE url and
#      child processes inject it themselves, so an unset shell variable is not
#      protection. Refuse anything that is not local.
set -uo pipefail

WARN_ONLY=0
[[ "${1:-}" == "--warn" ]] && WARN_ONLY=1

MAX_LOAD="${MAX_LOAD:-30}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0
say()  { printf '  %-22s %s\n' "$1" "$2"; }
bad()  { printf '  %-22s \033[31m%s\033[0m\n' "$1" "$2"; FAIL=1; }

echo "── preflight ──────────────────────────────────────────"

# 1. Load average (1-minute).
LOAD1=$(uptime | sed -E 's/.*load averages?: *([0-9.]+).*/\1/' | cut -d. -f1)
if [[ -z "$LOAD1" || ! "$LOAD1" =~ ^[0-9]+$ ]]; then
  say "load" "could not read — skipping"
elif (( LOAD1 > MAX_LOAD )); then
  bad "load" "$LOAD1 (max $MAX_LOAD) — e2e will time out on its own up here"
else
  say "load" "$LOAD1 (max $MAX_LOAD)"
fi

# 2. Sibling worktrees with uncommitted work.
DIRTY_SIBS=0
while read -r wt _; do
  [[ -z "$wt" || "$wt" == "$ROOT" ]] && continue
  [[ -d "$wt" ]] || continue
  if [[ -n "$(git -C "$wt" status --porcelain 2>/dev/null | head -1)" ]]; then
    DIRTY_SIBS=$((DIRTY_SIBS + 1))
    printf '                         dirty: %s\n' "$wt"
  fi
done < <(git worktree list 2>/dev/null | awk '{print $1}')
if (( DIRTY_SIBS > 0 )); then
  bad "sibling worktrees" "$DIRTY_SIBS dirty — another session may rewrite this tree mid-run"
else
  say "sibling worktrees" "clean"
fi

# 3. This tree vs HEAD.
TRACKED_DIRTY=$(git status --porcelain 2>/dev/null | grep -vc '^??' || true)
if (( TRACKED_DIRTY > 50 )); then
  bad "tree vs HEAD" "$TRACKED_DIRTY modified — you would be testing something you did not commit"
elif (( TRACKED_DIRTY > 0 )); then
  say "tree vs HEAD" "$TRACKED_DIRTY modified (ok — under review threshold)"
else
  say "tree vs HEAD" "clean"
fi

# 4. Stale server holding the port.
if lsof -ti :3000 >/dev/null 2>&1; then
  bad ":3000" "in use — Playwright reuses it with a different AUTH_SECRET; every login fails"
else
  say ":3000" "free"
fi

# 5. Database target.
DB="${DATABASE_URL:-}"
if [[ -z "$DB" && -f .env.local ]]; then
  DB=$(grep -aE '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"'')
fi
if [[ -z "$DB" && -f .env ]]; then
  DB=$(grep -aE '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'')
fi
if [[ -z "$DB" ]]; then
  say "database" "unset — test.sh will resolve it"
else
  HOST="${DB#*://}"; HOST="${HOST#*@}"; HOST="${HOST%%/*}"; HOST="${HOST%%:*}"
  case "$HOST" in
    localhost|127.0.0.1|::1|host.docker.internal) say "database" "$HOST" ;;
    *) bad "database" "$HOST is REMOTE — e2e seeds and writes" ;;
  esac
fi

echo "───────────────────────────────────────────────────────"
if (( FAIL == 1 )); then
  if (( WARN_ONLY == 1 )); then
    echo "  preflight FAILED (warn-only — continuing)"; exit 0
  fi
  echo "  preflight FAILED — fix the red lines, or re-run with --warn to override."
  exit 1
fi
echo "  preflight OK"
