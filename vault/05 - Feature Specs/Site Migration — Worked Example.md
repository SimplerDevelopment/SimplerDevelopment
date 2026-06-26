---
type: spec
domain: sites-hosting
status: shipped
date: 2026-06-12
sources:
  - scripts/migrations/<client>/setup-client.ts
  - scripts/migrations/<client>/_brand.ts
  - scripts/migrations/<client>/run-all.ts
  - scripts/migrations/<client>/import-home.ts
  - scripts/migrations/<client>/import-*.ts
  - scripts/migrations/<client>/import-nav.ts
  - scripts/migrations/<client>/COLOR-MAP.md
  - scripts/migrations/<client>/WORKER-BRIEF.md
  - scripts/migrations/<client>/reports/visual/
---

# Feature: Site Migration — Worked Example

## Overview

This note documents the process of migrating an external client marketing site into the SimplerDevelopment platform as a new per-tenant client website, using a completed migration as a concrete example. Audience: public-facing site (`app/sites/`), managed via the client portal (`app/portal/`).

See ADRs: [[ADR site-migration-qa-via-local-dryrun]], [[ADR migration-glass-btn-style]], [[ADR migration-roi-calculator-static-snapshot]], [[ADR migration-store-settings-preflight]], [[ADR migration-target-staging-vs-metro]].

Domain context: [[Sites, Hosting & Publishing]].

## Production records

> **Note on DB targeting:** it is easy to accidentally run migration scripts against the wrong DB. Verify `DATABASE_URL` before each run. In this example, the first run mistakenly targeted the staging DB instead of production — records were inserted on staging and are harmless, but the migration had to be re-run against production. Records from the staging run still exist there and can be cleaned up at any time. See [[ADR migration-target-staging-vs-metro]].

The provisioning step (`setup-client.ts`) creates and returns:

| Record | Placeholder |
|---|---|
| userId | `userId=<id>` |
| clientId | `clientId=<id>` |
| websiteId | `websiteId=<id>` |
| brandingProfileId | `brandingProfileId=<id>` |
| subdomain | `<client-slug>` |
| vercelDomain | `<client-slug>.simplerdevelopment.com` (added + verified on platform Vercel project) |
| Login | `<portal login redacted>` (temp — rotate before handing to client) |

## Pages

In this example, the source site had 12 pages migrated (home, service pages, legal pages, blog articles). Each page gets its own `import-*.ts` script. The page count and slug set will vary per client.

Top nav items are installed via `import-nav.ts`, scoped to the provisioned `websiteId`.

## Branding

Extract the client's brand tokens before writing any import scripts. Typical tokens:

| Token | Field |
|---|---|
| Primary color | `primary` in `brandingProfile` |
| Accent / CTA color | `accent` |
| Section background | `sectionBg` |
| Typeface | `fontFamily` |

Document your color derivation in `COLOR-MAP.md` (verify via live computed styles on the source site — not just the brand guide, which may differ). Shared color helpers belong in `_brand.ts`.

**Gotcha — button contrast on dark sections:** if `secondaryText` is the same dark tone as the section background, it renders invisible. Encode a `GLASS_BTN_STYLE` override in `_brand.ts` for dark-section CTAs. See [[ADR migration-glass-btn-style]].

## Migration artifacts structure

Organize all migration scripts under `scripts/migrations/<client-slug>/`:

- `setup-client.ts` — idempotent user/client/website/branding/store-settings provisioner
- `_brand.ts` — shared color tokens, font helpers, button-style overrides
- `import-<page>.ts` — one file per page
- `import-nav.ts` — top navigation
- `run-all.ts` — idempotent orchestrator; runs setup then all imports in order
- `WORKER-BRIEF.md` — agent brief for migration work
- `COLOR-MAP.md` — source-to-platform color mapping
- `reports/visual/` — source-site vs migrated-site screenshots (visual QA evidence)

## Non-obvious decisions (see ADRs)

1. **Visual QA via local dryrun** — QA rendered against `.env.local` DB with `DATABASE_URL` shell override; the client subdomain stays `publicAccess=false` throughout migration. See [[ADR site-migration-qa-via-local-dryrun]].
2. **Button contrast on dark sections** — `secondaryText` color may be invisible on matching dark section backgrounds. `GLASS_BTN_STYLE` in `_brand.ts` encodes the fix. See [[ADR migration-glass-btn-style]].
3. **Interactive widgets → static snapshots** — client-specific interactive widgets (calculators, configurators) are captured as static stats or content blocks; flag for human decision (universal block scaffold vs hand-code vs keep static). See [[ADR migration-roi-calculator-static-snapshot]].
4. **`storeSettings` row inserted at setup time** — prevents designer-route 404 on missing `store_settings`. See [[ADR migration-store-settings-preflight]].

## Go-live checklist

- All pages verified returning HTTP 200 on `<client-slug>.simplerdevelopment.com`
- Vercel domain added and verified on the platform Vercel project
- Migration re-run against the production DB if it was accidentally targeted at staging first
- Visual QA screenshots captured in `reports/visual/`

## Open follow-ups (post-launch, per-migration)

- [ ] Rotate temp password before handing portal access to client
- [ ] Human decision: any interactive widgets flagged during import (universal block, hand-code, or keep static)
- [ ] Listing pages: assess whether cardGrid link limitations warrant a block enhancement
- [ ] Clean up any accidental staging DB records (harmless but noisy)
- [ ] Verify custom domain DNS once client is ready to cut over — add to `website_domains`

## Validation checklist

- Visual QA: completed against local dryrun DB (screenshots in `reports/visual/`)
- HTTP 200 check: all pages verified live on the client subdomain
- Tenancy: run `bun test:tenancy` before any future data-access changes to this tenant
