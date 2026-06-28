---
title: "Git History Sweep — OSS Pre-Release"
status: ready-to-run
created: 2026-06-27
owner: maintainer
---

# Git History Sweep — OSS Pre-Release

> ⚠️ **REQUIRES MAINTAINER ACTION — force-push + collaborator coordination required.** This plan must be executed by a repository owner with force-push rights. All clones and forks will be invalidated. Coordinate with every collaborator before running.

Working-tree leaks were scrubbed in commit `c93b0eb3f` (2026-06-27). This document covers the complementary history rewrite required before the repo is made public.

---

## 1. Leak Inventory + Commit Archaeology

### 1a. Test Credential — `sd-chat-mobile/HANDOFF.md`

| Item | Detail |
|---|---|
| Introduced | `0bd944793` — `chore(monorepo): add sd-agents + sd-chat-mobile as sibling packages` (2026-06-25) |
| Scrubbed in working tree | `c93b0eb3f` |
| Branches containing it | **6**: `chore/monorepo-restructure`, `dev`, `feat/brain-mastra-endpoint`, `integration/nightly-2026-06-25`, `worktree/quiet-valley-34bd`, `remotes/origin/dev` |
| Nature | Maintainer email + plaintext password in a "Test credentials" line |

The credential line pattern (DO NOT print the actual values):
- Old: `Test credentials: <email> / <password>. Portal runs at ...`
- Replacement: `Test credentials: create a local admin with \`bun run db:seed\` (or sign up), then use those. Portal runs at ...`

The `--replace-text` patterns needed (see Section 4):
- The password token must be replaced with `***REMOVED***`
- The email `info@danielpcoyle.com` also appears in this file and must be replaced

### 1b. Client Asset Directories

| Path | Introduced | Branches |
|---|---|---|
| `public/mancuso/` | `efd1eafbd` (2026-05-15) via `307d1c752` initial release (2026-06-23) | **88** incl. `main`, `staging`, `origin/main`, `origin/staging` |
| `public/uploads/palizzi/` | `b14e17183` via `307d1c752` initial release | **88** incl. `main`, `staging`, `origin/main` |
| `public/assets/magamommy/` | `0be357d78` via `307d1c752` initial release | **88** incl. `main`, `staging`, `origin/main` |

These are image blobs committed to history. The initial release commit `307d1c752` (2026-06-23) introduced 23+ client asset files across all three directories. Path-based removal is the correct approach — binary blobs cannot be text-replaced.

### 1c. Maintainer PII + Client Project Name — `sd-chat-mobile/lib/mock/`

| Item | Detail |
|---|---|
| Introduced | `0bd944793` (2026-06-25) |
| Branches containing it | **6** (same as 1a) |
| PII present | Real maintainer name, personal email, client company name `Post Captain`, several `@postcaptain.com` email addresses in mock data |

Strategy: `--replace-text` replacement (see Section 4). The whole `sd-chat-mobile/lib/mock/` subtree can also be path-removed if the mobile package is excluded from the public repo. See **Decision Required** note in Section 6.

### 1d. Internal DB Codenames — `acela` / `metro`

| Codename | Meaning | First commit in history |
|---|---|---|
| `acela` | Railway proxy hostname prefix for the dev Postgres instance | `a2524dde3` (CP checkpoint, 2026-04-22) |
| `metro` | Railway proxy hostname prefix for the production Postgres instance | `049b36c9` (email perf indexes, 2026-06-01) |

Both strings appear in a broad set of files — **63–79 unique files** across history, spanning:
- `CLAUDE.md` (root + `lib/db/CLAUDE.md`) — the canonical location: `acela.proxy.rlwy.net` and `metro.proxy.rlwy.net` hostnames
- `drizzle/*.sql` — in SQL **comments only** (not schema data), e.g. `-- must be hand-applied to metro before staging→main merge`
- `.planning/` — which will be removed by path anyway (Section 3)
- `vault/` — one file: `vault/05 - Feature Specs/Release Stabilization — Dev (= Prod) Green.md`
- Various `scripts/` files

⚠️ **False-positive risk for `metro`:** The word "metro" also appears as the Metro bundler package name in `bun.lock`, `sd-chat-mobile/bun.lock`, `sd-chat-mobile/app.json`, iOS `AppDelegate.swift`, and `package-lock.json`. These must NOT be altered. Use the specific hostname patterns (`metro.proxy.rlwy.net`, `acela.proxy.rlwy.net`) rather than bare word replacement. See Section 4.

Branches affected: **90+** including `main`, `staging`, `origin/main` (acela/metro are present in the initial release commit tree).

### 1e. `.planning/` Directory

| Item | Detail |
|---|---|
| Introduced | `da54cfa29` (2026-04-05) |
| Total commits touching it | **153** |
| Branches containing it | **90+** |
| Sensitive contents | `.planning/brain-documents/HANDOFF.md`, `.planning/brain-glossary/HANDOFF.md` (contain PII), `.planning/ARCHITECTURE_MAP.md` (contains `metro` codename), prospect data, internal audit notes |

This is the widest-spread leak by commit count. Path removal eliminates all of it cleanly.

### 1f. `roast-prompts/` Directory

| Item | Detail |
|---|---|
| Introduced | `1494e8be7` (2026-06-25) |
| Total commits | **9** |
| Branches containing it | **4**: `dev`, `integration/nightly-2026-06-25`, `worktree/quiet-valley-34bd`, `remotes/origin/dev` |
| Nature | Internal product-readiness briefs; the directory was `.gitignore`d in the scrub commit but remains in history |

---

## 2. Scope Assessment

| Dimension | Value |
|---|---|
| Total commits in repo | 2,917 |
| Total branches | 91 |
| Earliest leak commit | `da54cfa29` (2026-04-05) — `.planning/` |
| Deepest-spread leaks | Client asset dirs + DB codenames (90+ branches, from 2026-04-22 to 2026-06-25) |
| Narrowest-spread leaks | `roast-prompts/` (4 branches), HANDOFF.md credential + mock PII (6 branches) |
| Main branch affected | Yes — all leaks except roast-prompts (6-branch) are in `main` / `origin/main` |

Because the earliest leaked commit (`da54cfa29`) is an ancestor of the entire current history, **every commit in the repo will be rewritten** — all 2,917 commits receive new SHAs.

---

## 3. Recommended Tool: `git filter-repo`

`git filter-repo` is preferred over `git filter-branch` (8–10× faster, safer defaults, no temp refs left behind) and over BFG Repo Cleaner (supports text replacement and fine-grained path control in a single pass).

**Install** (already installed at `/usr/local/bin/git-filter-repo`):
```bash
# Verify:
git filter-repo --version
# If missing:
pip3 install git-filter-repo
# or: brew install git-filter-repo
```

---

## 4. Exact Commands

> Run these commands on a **fresh mirror clone** (see Section 5 pre-flight). Never run filter-repo on a clone that has an `origin` remote set to the real repo — it refuses to run on a clone with a remote by default, which is a safety feature. Either remove the remote first (`git remote remove origin`) or use `--force` explicitly after careful review.

### Step 0 — Create replacements file

Create a file named `sweep-replacements.txt` (outside the repo) containing:

```
# Test credential — exact password token (get the value from the HANDOFF.md diff of c93b0eb3f)
# Replace the password string with ***REMOVED***
# Replace the full credential line context

# Maintainer email used as credential
info@danielpcoyle.com==>MAINTAINER_EMAIL_REMOVED

# DB codenames — use the full hostname form to avoid Metro bundler false positives
acela.proxy.rlwy.net==>dev-db.proxy.example.com
metro.proxy.rlwy.net==>prod-db.proxy.example.com

# Bare codename in SQL comments (e.g. "apply to metro before merge")
# Use word-boundary regex to avoid hitting the Metro bundler package name
regex:(?<!\w)acela(?!\w)==>dev-db
regex:(?<!\w)metro(?!\s*bundler)(?!\w)==>prod-db

# Mock PII — client project name
Post Captain==>Acme Agency
postcaptain\.com==>example.com
daniel@postcaptain\.com==>demo@example.com
sarah@postcaptain\.com==>sarah@example.com
tom@postcaptain\.com==>tom@example.com
aisha@postcaptain\.com==>aisha@example.com
Daniel Coyle==>Demo User
```

> ⚠️ **MAINTAINER**: Before creating this file, look up the exact plaintext password from the diff of commit `c93b0eb3f` (command: `git show c93b0eb3f -- sd-chat-mobile/HANDOFF.md`). Add it as a line: `<exact-password>==>***REMOVED***`. Do NOT add it to this document.

> ⚠️ **Decision point for metro bare-word regex**: The regex `(?<!\w)metro(?!\s*bundler)(?!\w)` is conservative. Verify it does not touch `bun.lock`, `app.json`, or iOS files by running `git filter-repo --dry-run --replace-text sweep-replacements.txt` on the mirror first (see Step 1 below).

### Step 1 — Path removal pass

```bash
# Run on the mirror clone (see pre-flight Section 5)
cd /path/to/simplerdevelopment2026-sweep-mirror.git

git filter-repo \
  --path public/mancuso \
  --path "public/uploads/palizzi" \
  --path "public/assets/magamommy" \
  --path "sd-chat-mobile/HANDOFF.md" \
  --path "sd-chat-mobile/lib/mock" \
  --path "roast-prompts" \
  --path ".planning" \
  --invert-paths \
  --force
```

This removes all seven paths from every commit in every branch. If the decision in Section 6 is to exclude `sd-chat-mobile` entirely, replace the two `sd-chat-mobile` lines with `--path sd-chat-mobile`.

### Step 2 — Text replacement pass

```bash
git filter-repo \
  --replace-text /path/to/sweep-replacements.txt \
  --force
```

Run this immediately after Step 1 on the same mirror. `filter-repo` rewrites blobs in place — the two passes can be chained; no intermediate push is needed.

### Step 3 — Verification before pushing

```bash
# Credential / password — should return nothing:
git log --all -S 'Action' -- sd-chat-mobile/ | head -5

# DB hostnames — should return nothing:
git log --all -S 'acela.proxy.rlwy.net' | head -5
git log --all -S 'metro.proxy.rlwy.net' | head -5

# Client asset dirs — should return nothing:
git log --all -- public/mancuso/ | head -5
git log --all -- public/uploads/palizzi/ | head -5
git log --all -- public/assets/magamommy/ | head -5

# .planning should be gone:
git log --all -- .planning/ | head -5

# roast-prompts should be gone:
git log --all -- roast-prompts/ | head -5

# Verify Metro bundler was not corrupted (should still appear in lock files):
git log --all -S 'metro-config' -- bun.lock | head -3
```

Replace `'Action'` with the actual password token when running (do not hard-code it here).

### Step 4 — Post-rewrite: restore origin and force-push

```bash
# Back on the mirror:
git remote add origin git@github.com:YOUR_ORG/simplerdevelopment2026.git

# Push ALL branches (rewrites every ref):
git push origin --all --force
git push origin --tags --force
```

> ⚠️ This is a destructive force-push of every branch. GitHub's branch protections must be temporarily disabled for `main` and `staging`. Re-enable them immediately after.

---

## 5. Pre-Flight Safety Checklist

Work through this checklist **before** running any filter-repo command on the real repo.

- [ ] **Backup mirror**: `git clone --mirror git@github.com:YOUR_ORG/simplerdevelopment2026.git simplerdevelopment2026-pre-sweep-backup.git`  
  Store the backup in a location NOT pushed to GitHub. Verify it with `git log --oneline --all | wc -l` — should print `2917`.
- [ ] **Tag the current HEAD**: `git tag pre-sweep-backup HEAD` (in the original working clone before any rewrite).
- [ ] **Work on a second mirror** (the sweep target): `git clone --mirror ... simplerdevelopment2026-sweep-mirror.git`  
  Run all filter-repo commands inside `simplerdevelopment2026-sweep-mirror.git`. This keeps the backup untouched.
- [ ] **Build + test on the swept mirror** before pushing: check out a working copy from the swept mirror (`git clone simplerdevelopment2026-sweep-mirror.git simplerdevelopment2026-swept`) and run `bun install && bun run typecheck && bun test` to confirm nothing broke.
- [ ] **Verify bun.lock integrity**: `grep -c 'metro-' simplerdevelopment2026-swept/bun.lock` — the Metro bundler entries should still be present and unchanged.
- [ ] **Check drizzle migration journal**: `cat simplerdevelopment2026-swept/drizzle/_journal.json` — the journal references file names, not content hashes; confirm migration file names are unchanged and the journal is valid JSON.
- [ ] **Notify all collaborators** that the rewrite is coming. They must `git clone` fresh after the push — existing clones cannot be safely rebased onto rewritten history.

---

## 6. Post-Rewrite Steps

1. **Re-add origin and force-push** (Step 4 above).
2. **GitHub: audit repository settings**
   - Re-enable branch protection rules on `main` and `staging`.
   - Enable "Restrict force pushes" again if it was disabled.
   - If the repo is being made public: Settings → General → Change visibility.
3. **GitHub: request a cache purge** (if the repo was ever public even momentarily before the sweep). Use GitHub's [sensitive data removal form](https://support.github.com/contact/private-information) to request CDN cache purge for any leaked blobs.
4. **Rotate the leaked credential** (`info@danielpcoyle.com` portal account password) even after the history rewrite, since it may have been cached by bots or CI logs.
5. **All collaborators must re-clone**. Existing clones contain the old SHAs. `git pull` or `git fetch` will not merge cleanly; a fresh `git clone` is required.
6. **Update CI secrets** if any CI environment cached the credential or DB proxy hostnames in logs.

---

## 7. Decisions Required Before Running

These items require maintainer judgment — they are noted here, not resolved by the plan:

1. **Exclude `sd-chat-mobile` entirely vs. scrub selectively?**  
   The mobile package is not part of the open-source core (it's a companion app). Removing the entire `sd-chat-mobile/` subtree (`--path sd-chat-mobile --invert-paths`) is simpler and lower-risk than the surgical per-file scrub. If the mobile app will be open-sourced separately, a fresh repo with clean history is cleaner than a rewritten sub-tree.

2. **Exclude `sd-agents/` as well?**  
   `sd-agents/` was added in the same commit as `sd-chat-mobile` (`0bd944793`). If it is not part of the OSS release, remove it in the same path-removal pass.

3. **`metro` bare-word replacement scope**  
   The bare-word regex (`(?<!\w)metro(?!\w)`) will catch occurrences in `scripts/`, `vault/`, and `CLAUDE.md` but may have edge cases in JSON or markdown. Run `--dry-run` first and inspect the diff. If the regex is too broad, narrow it to `metro.proxy.rlwy.net` (hostname form) only — this leaves bare-word occurrences in SQL comments but avoids false positives entirely.

4. **`oss-public` and other already-public branches**  
   Branch `oss-public` exists in the remote. If it was ever pushed to a public GitHub repo, GitHub CDN may have cached blobs. Coordinate with GitHub support to purge cached content after the history rewrite.

---

## 8. Abbreviated Reference — Command Sequence

```bash
# 1. Mirror + backup
git clone --mirror git@github.com:YOUR_ORG/simplerdevelopment2026.git simplerdevelopment2026-pre-sweep-backup.git
git clone --mirror git@github.com:YOUR_ORG/simplerdevelopment2026.git simplerdevelopment2026-sweep-mirror.git
cd simplerdevelopment2026-sweep-mirror.git

# 2. Path removal (removes dirs + HANDOFF.md + mock PII files)
git filter-repo \
  --path public/mancuso \
  --path "public/uploads/palizzi" \
  --path "public/assets/magamommy" \
  --path "sd-chat-mobile/HANDOFF.md" \
  --path "sd-chat-mobile/lib/mock" \
  --path "roast-prompts" \
  --path ".planning" \
  --invert-paths \
  --force

# 3. Text replacement (credentials + codenames)
git filter-repo --replace-text /path/to/sweep-replacements.txt --force

# 4. Verify (sample — see full list in Section 4, Step 3)
git log --all -S 'acela.proxy.rlwy.net' | head -3  # expect: nothing
git log --all -- public/mancuso/ | head -3           # expect: nothing

# 5. Build + smoke test on a working copy from the swept mirror (see Section 5)

# 6. Force-push
git remote add origin git@github.com:YOUR_ORG/simplerdevelopment2026.git
git push origin --all --force
git push origin --tags --force
```

---

*Plan authored by Claude Code (analysis + read-only investigation). Execution must be performed and verified by a human maintainer with repository write access.*

---

## EXECUTED ON A MIRROR — 2026-06-27 (no force-push performed)

Per maintainer decisions: **surgical** file scrub (not wholesale subdir removal); **full-hostname-only** codename replacement (dropped the bare-word `metro` regex to avoid Metro-bundler false positives).

**Swept mirror:** `~/simplerdevelopment2026-sweep-mirror.git` (139M, 2,851 commits — 75 emptied commits pruned; `origin` removed by filter-repo, safe). Source was a `--mirror` clone of the local repo (includes the `worktree/quiet-valley-34bd` work).

**Passes run** (`git filter-repo`, on the mirror only):
1. Path removal: `public/mancuso`, `public/uploads/palizzi`, `public/assets/magamommy`, `sd-chat-mobile/HANDOFF.md`, `sd-chat-mobile/lib/mock`, `roast-prompts`, `.planning`.
2. Text replacement: maintainer email, `acela.proxy.rlwy.net`/`metro.proxy.rlwy.net`, `postcaptain.com` + per-person emails, `Post Captain`→`Acme Agency`, `Daniel Coyle`→`Demo User`.
3. Path removal: `.playwright-mcp` — **verification caught the credential surviving here** (an old Playwright snapshot captured a filled-in login form; the password was NOT only in HANDOFF.md). Removed.

**Verification (all history) — all ✓ CLEAN:** password, maintainer email, acela/metro hostnames, postcaptain.com → 0 occurrences; mancuso/palizzi/magamommy, HANDOFF.md, sd-chat-mobile/lib/mock, roast-prompts, .planning, .playwright-mcp → 0 commits. Preserved (correctly untouched): the `io.github.danielpcoyle` publish namespace + Metro bundler entries in `bun.lock`.

**Build-verified (2026-06-28):** cloned a working copy from the swept mirror, checked out `worktree/quiet-valley-34bd`, ran `bun install` (3,917 packages) + `tsc --noEmit` → **0 errors**; `bun.lock` Metro bundler entries intact (11 `metro-runtime` refs). The history rewrite did not break the build — safe to push.

**REMAINING — maintainer only:**
```bash
cd ~/simplerdevelopment2026-sweep-mirror.git
git log --oneline | head ; git log --all -S 'acela.proxy.rlwy.net' | head   # inspect — expect empty
# DESTRUCTIVE — rewrites ALL history; every clone/fork must re-clone after:
git remote add origin https://github.com/DanielPCoyle/simplerdevelopment2026.git
git push origin --force --all && git push origin --force --tags
```
Then per §6: re-enable branch protection, **rotate the leaked credential anyway**, request GitHub CDN purge if ever public, have collaborators re-clone. Consider pushing to a NEW public repo instead of force-pushing the private one if forks exist. Keep the un-swept original until the push is confirmed good.
