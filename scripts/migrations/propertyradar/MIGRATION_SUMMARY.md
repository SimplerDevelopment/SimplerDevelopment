# PropertyRadar → SimplerDevelopment — Migration Summary

**Date:** 2026-06-02 · **Source:** https://www.propertyradar.com (HubSpot) · **DB:** `simplerdev_realprod_dryrun` (local, non-prod)

## What was built
Fresh-design migration keeping PropertyRadar brand DNA (navy `#0A1F44` + green `#38CB89` + Poppins + logo), with a modern premium layout (dark hero/CTA "moments", overline+title rhythm, soft-shadow cards, generous spacing).

### IDs
- Client **155** (user 346, `propertyradar@simplerdevelopment.com`) · owner also = `info@danielpcoyle.com` (user 181)
- Website **433** · subdomain `propertyradar-propertyradar` · `propertyradar-propertyradar.simplerdevelopment.com`
- Branding profile **45** + siteBranding **12** + messaging **21**
- Custom postTypes: play **56**, list **57**, coverage **58**

### Pages (622 total)
| Type | Count | Notes |
|---|---|---|
| page (marketing) | 37 | home + 33 bespoke marketing + 3 collection index pages (plays/lists/coverage) |
| blog | 280 | 1 source URL failed extraction (280/281) |
| play | 146 | `/plays/...` |
| list | 108 | `/lists/...` |
| coverage | 51 | `/coverage/...` (states) |

Marketing pages: home, about, pricing, partner, support, features + 7 sub, built-for + 5 audiences, 5 compare pages, 2 podcasts, lead-gen-playbook, good-neighbor pledge, 3 FAQ, 3 legal.

### Architecture decisions
- **Global footer**: the sites layout renders a universal nav-derived `SiteFooter`; per-page `site-footer` blocks were removed to avoid duplication.
- **Nav**: 8 top-level items in `siteNavigation` (Who We Serve, Features, Lead Gen Plays, Coverage, Pricing, Blog, Login, Try it Free CTA).
- **Slugs**: full joined path (`features/api`); blog posts use bare slugs under `/blog/`.
- **Index pages**: `/plays` `/lists` `/coverage` are static branded card grids (surface ALL items; the html-render loop caps at 24). `/blog` uses the platform's built-in listing.
- **DB fix**: created missing unique index `brain_embedding_jobs_entity_unique_idx` (matches drizzle/0064) — the dryrun DB lacked it, which blocked all post inserts via the embedding trigger.

## How to view
Dev server: `bun dev`. Base: `http://localhost:3000/sites/propertyradar-propertyradar.simplerdevelopment.com/<slug>`
Toggle visibility: `npx tsx scripts/migrations/propertyradar/qa-toggle.ts on|off [slug]`
(Currently published + publicAccess=ON for review.)

## QA
- Visual: home, about, pricing, feature-detail, plays index, blog post — all verified, consistent premium design. Screenshots in `reports/`.
- Lighthouse (home, desktop, DEV build): Accessibility 96, SEO 92, Best-Practices 77, Agentic 100. Best-Practices < 80 is driven by external CDN third-party-cookies + dev inspector-issues + dev robots.txt — clears in production with self-hosted assets. One minor `color-contrast` flag.

## Known gaps / follow-ups
- **Images** reference propertyradar.com CDN directly (per migration norm). A later pass should download + re-upload via the media API.
- **Blog body** is raw HubSpot HTML in an html-render block (readable, functional; not premium typography). Consider a prose-styling pass.
- **Podcast pages**: placeholder YouTube/platform URLs — swap in real episode/show URLs.
- **Support hours** on /support are an assumed default — verify.
- **/privacy-requests** source was thin/garbled (metrics table) — reconstructed as prose; legal review recommended.
- **/integrations** partner logos listed as text (could use a `logo-strip`).
- **Login/Register** (app auth) intentionally not migrated; CTAs point to `/register`, `/login`.
- 1 blog post failed extraction.

## Scripts (all under scripts/migrations/propertyradar/)
`_shared.ts` (block builders + tokens + upsert), `DESIGN_SYSTEM.md` (canonical spec), `setup-client.ts`, `import-posttypes.ts`, `import-nav.ts`, `import-home.ts`, `import-about.ts`, `import-<page>.ts` (per marketing page), `import-bulk.ts` (collections), `import-index.ts` (collection indexes), `extract-*.ts` + `lib-extract.ts` (extraction), `qa-toggle.ts`. Data in `data/`, reports in `reports/`.
