# Runbook: purge orphaned large blobs from git history

**Reclaim:** ~250M off every clone. **Risk:** rewrites every branch SHA + force-pushes `main`.
**Not urgent** — the junk is already gone from every working tree; this only shrinks history.

## Why it's gated

The object store is shared by **17 live worktrees** (`git worktree list`), several mid-flight
(`feat/setup-wizard`, `feat/market-ready-makeover`, `feat/self-improving-system`, the CCA /
mcp-review / domain-walk worktrees…), plus `main` which deploys to prod. A history rewrite
re-hashes all of them. Do it only in a quiet window, ideally once those branches are merged
or abandoned, and announce it first.

## What gets purged

All already deleted from every tree — history-only bloat:

| Path | ~Size |
|---|---|
| `.vitest-reports/blob-*` | 175M |
| `backup_file.dump` | 17M |
| `docs/architecture-of-unification.mp4` | 29M |
| `public/sites/<client>/<video>.mp4` | 16M |
| `.agents/skills/huashu-design/assets/bgm-*.mp3` | 27M |
| `.playwright-mcp/*.log`, `<client>-screenshots-*.png`, `fallow-baselines/*`, `us-4yr-colleges-*.csv` | ~17M |

## Steps

1. **Announce.** Tell everyone to push/park work; freeze merges to `main`.
2. **Run the prep** (safe, isolated — clones a mirror to `$TMPDIR`, rewrites, reports size, pushes nothing):
   ```
   bash scripts/purge-history.sh
   ```
3. **Verify** the printed before→after size and largest-remaining-blobs list.
4. **Force-push** using the exact commands the script prints (`push --force --mirror`).
5. **Re-clone everywhere.** Old clones/worktrees now point at dead SHAs. Recreate all 17
   worktrees from the fresh clone. Confirm the next Vercel deploy of `main` is green.

## Rollback

The pre-rewrite state lives on GitHub until you force-push (step 4). Before step 4, nothing is
irreversible — just `rm -rf "$TMPDIR/sd-history-purge"`. After the force-push, recover from any
un-updated clone's reflog or a GitHub support restore, so keep one untouched clone until verified.
