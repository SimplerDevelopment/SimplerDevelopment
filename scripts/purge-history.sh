#!/usr/bin/env bash
# Purge orphaned large blobs from git history (~250M reclaim).
#
# SAFE BY DESIGN: operates on a fresh --mirror clone in a scratch dir, never on
# your working object store or any of the live worktrees. It STOPS before the
# force-push — you run that final step yourself, consciously, in a quiet window.
#
# Prereq: git-filter-repo installed (brew install git-filter-repo).
# Run:    bash scripts/purge-history.sh
# Then:   follow the printed force-push + re-clone steps (see runbook).
#
# ⚠ Do NOT run while worktrees hold unmerged work you care about — the force-push
#   rewrites every branch SHA. See docs/runbooks/history-purge.md first.
set -euo pipefail

REMOTE="https://github.com/SimplerDevelopment/SimplerDevelopment.git"
WORK="${TMPDIR:-/tmp}/sd-history-purge"
MIRROR="$WORK/sd.git"

# Junk paths — all already deleted from every working tree; only history keeps them.
PATHS=(
  ".vitest-reports"                                   # ~175M test-result blobs
  ".playwright-mcp"                                   # MCP session logs
  "backup_file.dump"                                  # 17M db dump
  "docs/architecture-of-unification.mp4"              # 29M orphaned video
  "public/sites/crosscap/Crossover_Hero_Short.mp4"    # 16M orphaned video
  ".agents/skills/huashu-design/assets/bgm-ad.mp3"
  ".agents/skills/huashu-design/assets/bgm-tech.mp3"
  ".agents/skills/huashu-design/assets/bgm-tutorial.mp3"
  ".agents/skills/huashu-design/assets/bgm-tutorial-alt.mp3"
  ".agents/skills/huashu-design/assets/bgm-educational.mp3"
  ".agents/skills/huashu-design/assets/bgm-educational-alt.mp3"
)
# Glob-matched junk (root debug artifacts, per CLAUDE.md don't-touch list).
GLOBS=( "peters-outdoor-*.png" "fallow-baselines/*" "us-4yr-colleges-*.csv" )

command -v git-filter-repo >/dev/null || { echo "install git-filter-repo first"; exit 1; }

rm -rf "$WORK"; mkdir -p "$WORK"
echo "▸ mirror-cloning $REMOTE (fresh, isolated) …"
git clone --mirror "$REMOTE" "$MIRROR"
BEFORE=$(du -sh "$MIRROR" | cut -f1)

args=()
for p in "${PATHS[@]}"; do args+=(--path "$p"); done
for g in "${GLOBS[@]}"; do args+=(--path-glob "$g"); done

echo "▸ rewriting history (invert-paths) …"
git -C "$MIRROR" filter-repo --force --invert-paths "${args[@]}"
git -C "$MIRROR" reflog expire --expire=now --all
git -C "$MIRROR" gc --prune=now --aggressive
AFTER=$(du -sh "$MIRROR" | cut -f1)

cat <<EOF

───────────────────────────────────────────────
  mirror size: $BEFORE → $AFTER   (verified, nothing pushed)
───────────────────────────────────────────────
NEXT — you run these, in a quiet window, after telling collaborators:

  1. sanity-check the rewrite:
       git -C "$MIRROR" log --oneline -5
       git -C "$MIRROR" cat-file --batch-check --batch-all-objects \\
         | sort -k3 -n | tail -5     # largest remaining blobs

  2. force-push ALL rewritten refs (filter-repo drops 'origin'; re-add):
       git -C "$MIRROR" remote add origin "$REMOTE"
       git -C "$MIRROR" push --force --mirror origin

  3. every collaborator + all 17 worktrees must re-clone. Recreate worktrees
     from the fresh clone; old checkouts point at dead SHAs.

Mirror left at: $MIRROR  (delete when done: rm -rf "$WORK")
EOF
