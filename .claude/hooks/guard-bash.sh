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

# 2. Schema push to anything that smells like prod.
# Match the actual Railway proxy hosts (matches scripts/verify-db-target.ts
# and scripts/reset-e2e-db.ts), not arbitrary substrings — the old name-based
# pattern false-positived on local DBs whose names contained "prod"
# (e.g. simplerdev_realprod_dryrun on 127.0.0.1).
# Anchor the host match to a postgres URL so prose mentioning tramway/metro
# (commit messages, comments, docs) doesn't trip the guard.
if echo "$cmd" | grep -qE '(\bdb:push\b|\bdrizzle-kit push\b)' \
   && echo "$cmd" | grep -qiE '(postgres(ql)?://[^[:space:]]*(tramway\.proxy\.rlwy\.net|metro\.proxy\.rlwy\.net)|@[^[:space:]]*\.simplerdevelopment\.com|RAILWAY_ENVIRONMENT_NAME=production)'; then
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

# 7. Destructive git operations that overwrite uncommitted work
if echo "$cmd" | grep -qE '\bgit +reset +.*--hard\b'; then
  block "git reset --hard discards uncommitted work — investigate before destroying state"
fi
if echo "$cmd" | grep -qE '\bgit +clean +.*-[a-z]*[fdx]'; then
  block "git clean -fdx removes untracked files — investigate before destroying state"
fi
if echo "$cmd" | grep -qE '\bgit +checkout +(\.|--|--all)\b'; then
  block "git checkout . / -- discards uncommitted work — investigate before destroying state"
fi

# 8. Privilege escalation has no place in a dev session
if echo "$cmd" | grep -qE '(^|[^a-zA-Z_])sudo\b'; then
  block "sudo is not authorized in this workflow"
fi

# 9. Plaintext-HTTP fetches — almost always a misconfig or supply-chain risk.
# Exception: localhost / 127.0.0.1 / [::1] are legitimately HTTP for local dev.
if echo "$cmd" | grep -qE '\b(curl|wget) +[^|]*\bhttp://' \
   && ! echo "$cmd" | grep -qE '\b(curl|wget) +[^|]*\bhttp://(localhost|127\.0\.0\.1|\[::1\])(:|/|$)'; then
  block "plaintext HTTP fetch to non-localhost — use https:// or fix the upstream URL"
fi

# 10. Publish to a package registry
if echo "$cmd" | grep -qE '\b(npm|bun|yarn|pnpm) +publish\b'; then
  block "package publish is not part of this workflow"
fi

# 11. Code-eval in Bash — a known sandbox-escape vector for denylists like this one
if echo "$cmd" | grep -qE '\bnode +-e\b'; then
  block "node -e bypasses Bash matchers; write a script and run it instead"
fi
if echo "$cmd" | grep -qE '\bbash +-c +.*(rm +-rf|curl|wget|sudo|node +-e)\b'; then
  block "bash -c wrapping a destructive/network command — run it directly so this hook can match it"
fi

# 12. Writing into user-level secrets / config dirs.
#     Treat ~/.aws, ~/.gnupg, ~/.config/gh, ~/.netrc, ~/.kube as secret in their entirety.
if echo "$cmd" | grep -qE '> *(\$HOME|~|/Users/[^/]+)/\.(aws|gnupg|config/gh|netrc|kube)\b'; then
  block "writing into user secrets/config dir — never appropriate from agentic Bash"
fi
# Within ~/.ssh, only block the sensitive files. known_hosts (and *.pub) are
# public information and legitimately need to be written by setup scripts.
# Anchor the filename end with a delimiter so id_rsa is blocked but id_rsa.pub is allowed.
if echo "$cmd" | grep -qE '> *(\$HOME|~|/Users/[^/]+)/\.ssh/(authorized_keys|config|environment|id_[a-z0-9_]+)([[:space:]]|$|>|&|;|<|\|)'; then
  block "writing into ~/.ssh/ secret files (authorized_keys, id_*, config, environment)"
fi

# 13. HANDS_OFF mode: tighter rules
if [ "${HANDS_OFF:-0}" = "1" ]; then
  # 13a. Push must target a claude/* branch
  if echo "$cmd" | grep -qE '\bgit +push\b' && ! echo "$cmd" | grep -qE '\b(claude/|HEAD:claude/|refs/heads/claude/)'; then
    block "HANDS_OFF=1: push restricted to claude/* branches only"
  fi
  # 13b. No interactive rebase / commit (would hang)
  if echo "$cmd" | grep -qE '\bgit +(rebase|commit|add) +.*-i\b'; then
    block "HANDS_OFF=1: interactive git mode would hang the loop"
  fi
fi

exit 0
