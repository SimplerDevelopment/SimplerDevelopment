#!/usr/bin/env bash
# PreToolUse:Bash — block clear footguns. Project-scoped, runs alongside any user-level hooks.
# Exit 2 + stderr message = block the tool call.
# Exit 0 = allow.
set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("command",""))' 2>/dev/null || echo "")"

[ -z "$cmd" ] && exit 0

block() {
  echo "BLOCKED by .claude/hooks/guard-bash.sh: $1" >&2
  echo "Command was: $cmd" >&2
  exit 2
}

# 1. Force-push to main/master/staging
if echo "$cmd" | grep -qE 'git push.*(--force|-f\b).*\b(main|master|staging)\b'; then
  block "force-push to a protected branch"
fi
if echo "$cmd" | grep -qE 'git push.*(main|master|staging).*(--force|-f\b)'; then
  block "force-push to a protected branch"
fi

# 2. Schema push to anything that smells like prod
if echo "$cmd" | grep -qE 'db:push|drizzle-kit push' && echo "$cmd" | grep -qiE '(prod|production|@.*\.simplerdevelopment\.com)'; then
  block "drizzle db:push against production-looking URL — use db:generate + db:migrate"
fi

# 3. Hand-editing migrations is forbidden — but hand-editing happens via Edit/Write, not Bash.
#    Guard against `cat > drizzle/...sql` or `echo ... > drizzle/...sql`.
if echo "$cmd" | grep -qE '> *drizzle/[^ ]*\.sql'; then
  block "hand-editing drizzle/*.sql — use lib/db/schema.ts + bun run db:generate"
fi

# 4. Reckless removal of load-bearing dirs
if echo "$cmd" | grep -qE 'rm -rf? .*(\.planning|\.git|drizzle/meta|node_modules/\.bin)\b'; then
  case "$cmd" in
    *node_modules*) ;;  # rm -rf node_modules is fine
    *) block "rm -rf of a load-bearing directory" ;;
  esac
fi

# 5. npm — repo is bun-only; npm install would corrupt the lockfile
if echo "$cmd" | grep -qE '^\s*(sudo +)?npm +(install|i|add|ci)\b'; then
  block "this repo uses bun (bun.lock); use 'bun add' / 'bun install' instead of npm"
fi

# 6. Skipping git hooks
if echo "$cmd" | grep -qE 'git +(commit|merge|rebase|push) .*--no-verify'; then
  block "--no-verify skips required hooks; fix the underlying failure"
fi

exit 0
