#!/usr/bin/env bash
# Publish a vault-free snapshot of a commit to the PUBLIC repo.
#
# The public repo (SimplerDevelopment/SimplerDevelopment) is where Vercel and
# the Railway `agents` / `realtime` services deploy from. It must NOT contain
# vault/ — internal ADRs, domain maps, feature specs and security-posture
# notes that are deliberately not published.
#
# The exclusion is applied to the TREE, not as a follow-up delete commit, so
# vault/ never enters the public repo's history and cannot be recovered from
# an earlier commit there.
#
# As of 2026-08-03 the vault is its own private repo and is gitignored here, so
# a tracked vault/ should be impossible. This stays as defence in depth — it
# costs nothing and catches a `git add -f` or a stale branch predating the
# split.
#
# Usage:
#   scripts/publish-public.sh [<commit-ish>]      # defaults to origin main / HEAD
#
# Called automatically by .githooks/pre-push when main is pushed. Run it by
# hand to publish without pushing main anywhere else.
set -euo pipefail

SRC="${1:-HEAD}"
PUBLIC_URL="https://github.com/SimplerDevelopment/SimplerDevelopment.git"
# Paths stripped before publishing. Add here, not in the hook.
EXCLUDE=(vault)

cd "$(git rev-parse --show-toplevel)"

src_sha=$(git rev-parse "${SRC}^{commit}")
echo "publish-public: source ${src_sha:0:12}"

# Build the stripped tree in a throwaway index — the working tree is never
# touched, so this is safe to run mid-session with uncommitted changes.
idx="$(mktemp -t sdpub)"
trap 'rm -f "$idx"' EXIT
GIT_INDEX_FILE="$idx" git read-tree "$src_sha"
for p in "${EXCLUDE[@]}"; do
  # -f is required: without it `git rm --cached` aborts the WHOLE removal when
  # any path differs from HEAD, silently leaving the tree unstripped.
  GIT_INDEX_FILE="$idx" git rm -r -q -f --cached --ignore-unmatch "$p"
done
tree=$(GIT_INDEX_FILE="$idx" git write-tree)

# Verify rather than trust the removal above — this is the check that stands
# between an internal note and a public repo.
#
# Two non-obvious requirements, both of which silently broke an earlier version
# of this check:
#   -z            : `git ls-tree --name-only` QUOTES paths containing spaces
#                   ("vault/05 - Feature Specs/x.md"), so a plain ^vault/ match
#                   misses them. -z emits raw NUL-separated paths instead.
#   grep -c, not -q : under `set -o pipefail`, `grep -q` exits on first match,
#                   the upstream git gets SIGPIPE, and the PIPELINE reports
#                   failure — inverting the test so a match reads as "clean".
for p in "${EXCLUDE[@]}"; do
  left=$(git ls-tree -r --name-only -z "$tree" | tr '\0' '\n' | grep -c "^${p}/" || true)
  if [ "${left:-0}" -gt 0 ]; then
    echo "publish-public: REFUSING — ${left} '${p}/' path(s) still present after strip." >&2
    exit 1
  fi
done
echo "publish-public: tree ${tree:0:12} — excluded: ${EXCLUDE[*]}"

# Parent on the current public HEAD so the push is a fast-forward and the
# existing public history is preserved rather than overwritten.
git fetch -q "$PUBLIC_URL" main:refs/tmp/publish-parent --force 2>/dev/null || true
parent="$(git rev-parse --quiet --verify refs/tmp/publish-parent || true)"

if [ -n "$parent" ] && [ "$(git rev-parse "${parent}^{tree}")" = "$tree" ]; then
  echo "publish-public: public repo already matches this tree — nothing to do."
  exit 0
fi

msg="release: sync platform source from ${src_sha:0:12} (vault excluded)"
if [ -n "$parent" ]; then
  new=$(git commit-tree "$tree" -p "$parent" -m "$msg")
else
  new=$(git commit-tree "$tree" -m "$msg")
fi

echo "publish-public: pushing ${new:0:12} -> public main"
git push --no-verify "$PUBLIC_URL" "$new:refs/heads/main"
echo "publish-public: done."
