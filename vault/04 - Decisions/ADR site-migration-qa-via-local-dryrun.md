---
type: adr
domain: sites-hosting
status: accepted
date: 2026-06-12
sources:
  - scripts/migrations/<client>/run-all.ts
  - scripts/migrations/<client>/WORKER-BRIEF.md
---

# ADR: Visual QA for site migrations runs against a local dryrun DB, not production

## Status

Accepted — established during a client site migration, 2026-06-12.

## Context

During a site migration, the new client site lands on the PRODUCTION Railway DB with all content as drafts (`published: false`, `publicAccess: false`). The visual QA step requires rendering pages in a browser against the migrated content. The naive approach — temporarily flipping `publicAccess=true` on prod — risks exposing incomplete or incorrectly-branded content to the public and breaks the invariant that the client approves go-live.

The auto-mode classifier in the platform correctly refuses to set `publicAccess=true` mid-migration. Bypassing it would violate the site-publishing access-control model.

## Decision

**QA renders against a local throwaway DB, not the production database.**

Procedure:
1. Run the migration's idempotent orchestrator (`run-all.ts`) against a local DB seeded with the same schema, using a shell `DATABASE_URL` override (`.env.local` target).
2. Start `bun dev` pointed at the local DB.
3. Capture screenshots or live-render the pages for visual comparison (source vs migrated).
4. Prod records remain `publicAccess=false` and `published=false` throughout.
5. Go-live is a separate, human-approved step: flip `published=true` and `publicAccess=true` on the prod records only after client sign-off.

Migration-side evidence is stored in `scripts/migrations/<client>/reports/visual/`.

## Consequences

- No risk of premature public exposure during migration QA.
- The local dryrun is disposable; prod is the source of truth for record IDs (userId, clientId, websiteId, brandingProfileId).
- Any future migration scaffold should include a `--dry-run` flag or env-targeted runner that makes this procedure easy to follow without documentation lookup.
- The `run-all.ts` orchestrator must be idempotent so it can be run against both local and prod without manual surgery.

## Alternatives considered

- **Flip `publicAccess=true` on prod temporarily** — rejected: exposes unfinished content, violates access-control model, and bypasses the platform's own publisher guard.
- **Use a preview code (`previewCode`)** — viable for lightweight checks, but does not give a full public-render view; chosen approach is cleaner for screenshot-level QA.

## Related

- [[Sites, Hosting & Publishing]]
