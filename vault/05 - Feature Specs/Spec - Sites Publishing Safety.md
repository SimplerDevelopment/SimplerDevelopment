---
type: spec
domain: sites
status: proposed
date: 2026-06-22
sources:
  - lib/db/schema/sites.ts
  - lib/db/schema/snapshots.ts
  - lib/snapshots/export.ts
  - lib/snapshots/import.ts
  - app/api/portal/websites/[siteId]/deployments/route.ts
  - app/api/portal/websites/[siteId]/environments/[envId]/sync/route.ts
  - app/api/portal/snapshots/route.ts
  - lib/website-provisioner.ts
---

# Feature: Sites Publishing Safety

## Overview

Harden client-site publishing with three safety capabilities, **wiring over
primitives that already exist** rather than building new infrastructure:

1. **Backup-on-publish** — every publish/deploy first captures an automatic
   restore point.
2. **Publish-to-prod promotion** — promote a validated staging environment's
   content + config to production as one action.
3. **Auto-rollback on failed publish** — if the deploy fails, automatically
   restore the pre-publish restore point.

Closes the remaining "Sites publishing safety" gap ([[Sites Hosting Publishing
E2E Audit]]). The true staging environment itself is already shipped — this is
the safety layer on top.

## Domain context

Read first: [[Sites Hosting Publishing E2E Audit]]. What already exists (verified 2026-06-22 on `dev`):

- **Environments:** `website_environments` (production + staging per site, with
  `vercelTarget` = production|preview and a `previewUrl`). `website_env_vars`
  per environment, with a `syncedToVercel` flag + a sync route
  (`environments/[envId]/sync`).
- **Restore-point primitives (TWO, complementary):**
  - `website_backups` — point-in-time **environment state** (env vars + branding
    + navigation + store settings) per environment.
  - `site_snapshots` — full portable **content** payload (the whole site), built
    by `lib/snapshots/export.ts:exportSite(siteId)` and restored by
    `lib/snapshots/import.ts:importSnapshot(...)`. Snapshot CRUD routes exist
    under `app/api/portal/snapshots`.
- **Deploy:** `clientWebsites.deployBranch` / `deploymentStatus`
  (pending|provisioning|active|failed) / `lastDeployedAt`; deployment routes
  (`websites/[siteId]/deployments` + per-deployment logs). Vercel is the host.
- **Tenancy:** everything keyed by `clientId` / `websiteId`.

## Problem

A publish today is one-way: there's no automatic restore point taken before a
deploy, no first-class "promote staging → production" action (staging is a
separate environment but content isn't promoted atomically), and a failed deploy
leaves the site in a broken state with no automatic recovery. A bad publish
can't be cleanly undone.

## Goal

- Every publish writes an automatic, labelled restore point (env state +
  content) **before** mutating production.
- A tenant can promote their staging environment's content + config to
  production in one gated action.
- A deploy that ends in `failed` automatically restores the most recent
  pre-publish restore point and surfaces what happened.

## Design

### Part 1 — Backup-on-publish (restore points)

A pre-publish hook, invoked at the start of any production publish/deploy:

- `website_backups` row: snapshot the target environment's state (reuse the
  existing env-state shape).
- `site_snapshots` row via `exportSite(siteId)`: full content payload, named
  `pre-publish <deploymentId> <ts>`, tagged so it's findable for rollback.
- Link both to the deployment (add `pre_publish_snapshot_id` /
  `pre_publish_backup_id` to the deployment record, or a small
  `deployment_restore_points` join).

No new backup engine — `exportSite` + the `website_backups` shape already exist.

### Part 2 — Publish-to-prod promotion

`POST /api/portal/websites/[siteId]/promote` (staging → production), tenant-scoped:

- Validate the caller owns the site + a staging environment exists.
- Take a Part-1 restore point of production first.
- `exportSite` the **staging** state → `importSnapshot` into the **production**
  environment (content: posts/nav/branding/store), then sync env vars
  (production-scoped) via the existing env-sync path.
- Trigger the production Vercel deploy (existing deployments route) and record a
  deployment row with `environment = production` + the restore-point ids.

### Part 3 — Auto-rollback on failed publish

- **Detection:** a deploy-status signal — either a Vercel deployment webhook or
  the existing deployment poll — flips `deploymentStatus` to `failed`.
- **Action:** on `failed`, restore the deployment's linked pre-publish restore
  point: `importSnapshot(pre_publish_snapshot)` into production + restore the
  `website_backups` env state, set `deploymentStatus = rolled_back`, and notify
  the tenant. Idempotent (rollback runs once per deployment).
- Depends on Part 1 (the restore point must exist) + a reliable failed-deploy
  signal.

## Phasing

- **Phase 1 — Backup-on-publish.** Highest standalone value (every publish
  becomes recoverable); reuses exportSite + website_backups; no Vercel coupling
  beyond hooking the publish entrypoint.
- **Phase 2 — Publish-to-prod promotion.** The promote endpoint + staging→prod
  snapshot copy + env sync + prod deploy.
- **Phase 3 — Auto-rollback.** Needs Part 1 + a deploy-failure signal (Vercel
  webhook or poll). Lowest priority; the manual restore (import a snapshot)
  already exists as the fallback.

## Key decisions (ADR-style)

- **Reuse `site_snapshots` (content) + `website_backups` (env state)** as the
  restore-point store rather than a new table — both already model exactly this,
  with export/import wired. A deployment just references the pair it created.
- **Promotion = snapshot copy (export staging → import prod) + env sync**, NOT a
  git-branch merge. Content lives in the DB (posts/nav/branding/store), so a
  snapshot copy is the natural unit; the Vercel deploy then renders the promoted
  prod state. **Open for confirmation** (vs. a branch-based promotion).
- **Rollback restores the latest pre-publish restore point**, it does not
  re-deploy a previous Vercel build — content + config is DB-owned, so restoring
  the snapshot + re-rendering is authoritative.

## Open questions (resolve before/while building)

1. **Publish entrypoint:** what exactly triggers a "production publish" today —
   the deployments route, a publish button, or per-post publish? Part 1 hooks
   that entrypoint; need to pin it down.
2. **Deploy-failure signal:** Vercel deployment webhook vs. polling the
   deployments API. Affects Phase 3 latency + reliability.
3. **Promotion scope:** content-only, or content + env vars + domains? (env-var
   promotion is sensitive — staging secrets must not leak to prod.)
4. **Retention:** how many pre-publish restore points to keep per site (prune
   policy), given `site_snapshots.payload` can be large.

## Verification plan

- Phase 1: integration test — invoking the publish hook writes a `site_snapshots`
  + `website_backups` row linked to the deployment; tenancy-scoped.
- Phase 2: e2e — staging content differs from prod → promote → prod content
  matches staging + a restore point was taken; cross-tenant 404.
- Phase 3: integration — simulate `deploymentStatus = failed` → the linked
  restore point is re-imported + status → rolled_back (idempotent).
- The Vercel deploy call itself needs the real API; stub/guard it in tests (same
  posture as the Stripe/DropboxSign-gated paths).
