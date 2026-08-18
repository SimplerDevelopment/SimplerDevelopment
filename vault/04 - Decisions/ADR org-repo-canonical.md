---
type: adr
domain: repo-ops
status: accepted
date: 2026-07-02
sources:
  - README.md
  - docker-compose.yml
  - scripts/verify-db-target.ts
  - .file-budget.baseline.json
---

# ADR: The org repo is canonical; the personal repo is a mirror

## Status

Accepted

## Context

The codebase lived in two GitHub remotes: `DanielPCoyle/simplerdevelopment2026` (private, the original working repo, remote `origin`) and `SimplerDevelopment/SimplerDevelopment` (public, remote `org`). By 2026-07-02 the two `main` branches had diverged — the org side gained OSS-facing commits (Railway button, Mailpit transport) pushed directly, while the personal side gained the survey media-fields feature. Every README badge and deploy button still pointed at the personal repo, and outside contributors discovering the public org would have PR'd against a non-canonical mirror.

The divergence also hid breakage: the Mailpit commit landed on org/main without PR CI, leaving main red twice over (file-budget baseline, email-transport test mocks) with nobody noticing.

## Decision

`SimplerDevelopment/SimplerDevelopment` is the canonical repo. All work lands as feature branches + PRs against org `main`. The personal repo is a mirror, updated by pushing `org/main` to `origin main` after merges. All public-facing links (badges, Codespaces, Vercel/Railway buttons, launch assets, MCP `server.json`) point at the org repo.

The one-time reconciliation was a true merge (PR #8), not a squash or rebase, so both histories reunified and future syncs fast-forward.

## Consequences

- Contributors and AI search engines land on one repo with green CI and current docs.
- Direct pushes to org/main bypass PR CI and have already broken main silently — avoid them; the Mailpit incident is the cautionary tale.
- The personal repo can eventually be archived; nothing references it.
- Session tooling keeps two remotes (`origin`, `org`) until then — pushes go to `org`, mirror sync is one `git push origin org/main:main`.
- **Vercel production (simplerdevelopment.com + all client-site aliases, project `simplerdevelopment-workfriends-ai`) builds from the MIRROR, not the org repo.** A merge to org/main deploys nothing until the mirror sync runs — skipping it left production 5 days stale (2026-07-07, the About-page incident). The sync is part of shipping, not housekeeping. After the 2026-07-07 history scrub, sync needs `--force-with-lease=main:origin/main` once per rewrite.
