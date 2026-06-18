---
type: spec
domain: sites-hosting
status: shipped
date: 2026-06-12
sources:
  - scripts/migrations/goscribble/setup-client.ts
  - scripts/migrations/goscribble/_brand.ts
  - scripts/migrations/goscribble/run-all.ts
  - scripts/migrations/goscribble/import-home.ts
  - scripts/migrations/goscribble/import-about.ts
  - scripts/migrations/goscribble/import-for-agencies.ts
  - scripts/migrations/goscribble/import-for-clinicians.ts
  - scripts/migrations/goscribble/import-integrations.ts
  - scripts/migrations/goscribble/import-resources.ts
  - scripts/migrations/goscribble/import-privacy-policy.ts
  - scripts/migrations/goscribble/import-terms-of-service.ts
  - scripts/migrations/goscribble/import-article-ambient-ai.ts
  - scripts/migrations/goscribble/import-article-bedside.ts
  - scripts/migrations/goscribble/import-article-charting.ts
  - scripts/migrations/goscribble/import-article-pdgm.ts
  - scripts/migrations/goscribble/import-nav.ts
  - scripts/migrations/goscribble/COLOR-MAP.md
  - scripts/migrations/goscribble/WORKER-BRIEF.md
  - scripts/migrations/goscribble/reports/visual/
---

# Feature: Scribble (goscribble.ai) Site Migration

## Overview

Migrated the goscribble.ai marketing site (Scribble Labs Corp — "Point-of-Care AI for home health") into the SimplerDevelopment platform as a new per-tenant client website. Audience: public-facing site (`app/sites/`), managed via the client portal (`app/portal/`). **LIVE** at https://scribble.simplerdevelopment.com — all 12 pages return 200, verified 2026-06-12.

See ADRs: [[ADR site-migration-qa-via-local-dryrun]], [[ADR migration-glass-btn-style]], [[ADR migration-roi-calculator-static-snapshot]], [[ADR migration-store-settings-preflight]], [[ADR migration-target-staging-vs-metro]].

Domain context: [[Sites, Hosting & Publishing]].

## Production records (metro DB — live)

> Note: the earlier-cited IDs (userId 5, clientId 4, websiteId 3, brandingProfileId 2, post IDs 25–36) were the **staging (switchyard)** copy, inserted during the first migration run against the wrong DB. Those records still exist on switchyard and are harmless (switchyard has no Vercel domain pointed at it). They can be cleaned up at any time. See [[ADR migration-target-staging-vs-metro]].

| Record | ID |
|---|---|
| userId | 337 |
| clientId | 149 |
| websiteId | 409 |
| brandingProfileId | 40 |
| subdomain | `scribble` |
| vercelDomain | scribble.simplerdevelopment.com (added + verified on platform Vercel project) |
| Login | scribble@simplerdevelopment.com / scribble2026 (temp — rotate before handing to client) |

## Pages (12 posts, live)

| Slug | post id |
|---|---|
| home | 1675 |
| for-agencies | 1676 |
| for-clinicians | 1677 |
| integrations | 1678 |
| about | 1679 |
| resources | 1680 |
| privacy-policy | 1681 |
| terms-of-service | 1682 |
| article-ambient-ai | 1683 |
| article-bedside | 1684 |
| article-charting | 1685 |
| article-pdgm | 1686 |

Top nav: 7 items installed on websiteId 409 via `scripts/migrations/goscribble/import-nav.ts`.

## Branding

| Token | Value |
|---|---|
| Primary (navy) | `#0C1F3F` |
| Accent / CTA (teal) | `#00B896` |
| Section bg (off-white) | `#F7F9FC` |
| Typeface | Plus Jakarta Sans |

Full color derivation documented in `scripts/migrations/goscribble/COLOR-MAP.md` (verified via live computed styles). Shared block helpers live in `scripts/migrations/goscribble/_brand.ts` (229 lines).

## Migration artifacts

All under `scripts/migrations/goscribble/`:

- `setup-client.ts` (206 lines) — idempotent user/client/website/branding/store-settings provisioner
- `_brand.ts` (229 lines) — shared color tokens, font helpers, `GLASS_BTN_STYLE`
- `import-*.ts` — one file per page (12 pages)
- `import-nav.ts` — top navigation (7 items)
- `run-all.ts` (37 lines) — idempotent orchestrator; runs setup then all imports in order
- `WORKER-BRIEF.md` — agent brief used during migration work
- `COLOR-MAP.md` — source-to-platform color mapping
- `reports/visual/` — source-site vs migrated-site screenshots (visual QA evidence)

## Non-obvious decisions (see ADRs)

1. **Visual QA via local dryrun** — QA rendered against `.env.local` DB with `DATABASE_URL` shell override; prod site stays `publicAccess=false` throughout. See [[ADR site-migration-qa-via-local-dryrun]].
2. **Glass button style for dark sections** — `secondaryText` is navy and renders invisible on navy bg. `GLASS_BTN_STYLE` in `_brand.ts` encodes the fix. See [[ADR migration-glass-btn-style]].
3. **ROI calculator rendered as static snapshot** — interactive client-specific widget captured as a stats block; flagged for human decision (universal block scaffold vs hand-code vs keep static). See [[ADR migration-roi-calculator-static-snapshot]].
4. **`storeSettings` row inserted at setup time** — prevents designer-route 404 on missing `store_settings`. See [[ADR migration-store-settings-preflight]].

## Go-live record (2026-06-12)

- All 12 pages at https://scribble.simplerdevelopment.com verified returning HTTP 200.
- Vercel: domain `scribble.simplerdevelopment.com` added and verified on platform Vercel project.
- Migration re-run against metro (production DB) after initial run mistakenly targeted switchyard (staging). See [[ADR migration-target-staging-vs-metro]].

## Open follow-ups (post-launch)

- [ ] Rotate temp password — `scribble@simplerdevelopment.com` / `scribble2026` — before handing portal access to client
- [ ] Human decision: ROI calculator — scaffold universal block, hand-code client-specific, or keep static stats snapshot (see [[ADR migration-roi-calculator-static-snapshot]])
- [ ] Resources page: redundant per-article "Read" buttons due to cardGrid link limitation — assess whether a block enhancement is warranted
- [ ] Clean up staging (switchyard) records (userId 5, clientId 4, websiteId 3) — harmless but noisy
- [ ] Verify custom domain (goscribble.ai) DNS once client is ready to cut over — add to `website_domains`

## Validation record

- Visual QA: completed against local dryrun DB (screenshots in `reports/visual/`)
- HTTP 200 check: all 12 pages verified live on https://scribble.simplerdevelopment.com (2026-06-12)
- Tenancy: clientId 149 / siteId 409 — run `bun test:tenancy` before any future data-access changes to this tenant
