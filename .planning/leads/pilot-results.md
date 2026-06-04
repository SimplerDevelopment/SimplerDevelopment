# Pilot Results — 5 Outbound-Demo Sites

Generated 2026-05-13. Direct-DB seed approach (skill bypass).

## Status: 5/5 sites live with password gate

| # | Slug | Website ID | Post ID | URL | Password |
|---|---|---|---|---|---|
| 1 | prospect-gramercy-design | 246 | (latest) | http://localhost:3000/sites/prospect-gramercy-design.simplerdevelopment.com/home | see `.demo-credentials` |
| 2 | prospect-beyond-modern | 247 | (latest) | http://localhost:3000/sites/prospect-beyond-modern.simplerdevelopment.com/home | see `.demo-credentials` |
| 3 | prospect-storm-interiors | 248 | (latest) | http://localhost:3000/sites/prospect-storm-interiors.simplerdevelopment.com/home | see `.demo-credentials` |
| 4 | prospect-lark-interiors | 249 | (latest) | http://localhost:3000/sites/prospect-lark-interiors.simplerdevelopment.com/home | see `.demo-credentials` |
| 5 | prospect-cortney-bishop | 250 | (latest) | http://localhost:3000/sites/prospect-cortney-bishop.simplerdevelopment.com/home | see `.demo-credentials` |

All 5 return HTTP 200 with the `Preview Access` password overlay present in rendered HTML.

## What was delivered (vs. what the /site-migration skill would produce)

| Aspect | This pilot | /site-migration skill |
|---|---|---|
| Site creation | Yes — direct `client_websites` insert | Yes — via portal API |
| Blocks | **5 blocks per site** (hero, services-grid or card-grid, quote, cta, site-footer) | 8–15 blocks per site, full content extraction |
| Content | Hand-crafted from prior WebFetch homepage extracts | AI-extracted from full crawl |
| Brand colors / fonts | **Generic (no per-site branding)** | Per-site branding profile generated from source |
| Images | **None** (Material Icons only) | External URL references to source assets |
| Sub-pages | Home only | Full sitemap, multi-page |
| Block correctness | Verified live via dev server | Verified via skill's screenshot step |
| Password gate | Yes (JS overlay via `custom_js`) | Skill doesn't have this; needed manual addition |

**Bottom line:** these are *scaffold* demos, not polished demos. Sufficient to prove the platform can host prospect sites and password-gate them. NOT polished enough to send to a prospect as-is.

## Schema drift fixed along the way

Local dryrun DB was behind staging. Applied these migrations manually to `simplerdev_realprod_dryrun`:

```sql
ALTER TABLE client_websites ADD COLUMN IF NOT EXISTS draft_custom_css text;
ALTER TABLE client_websites ADD COLUMN IF NOT EXISTS draft_custom_js text;
ALTER TABLE client_websites ADD COLUMN IF NOT EXISTS draft_updated_at timestamp;
ALTER TABLE client_websites ADD COLUMN IF NOT EXISTS draft_updated_by integer;
ALTER TABLE site_navigation ADD COLUMN IF NOT EXISTS draft json;
ALTER TABLE block_templates ADD COLUMN IF NOT EXISTS draft json;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS custom_domain varchar(255);
SELECT setval('posts_id_seq', (SELECT MAX(id) FROM posts));
SELECT setval('client_websites_id_seq', (SELECT MAX(id) FROM client_websites));
```

(Matches `drizzle/0110_draft_overlays.sql` + a few earlier deltas. Confirms project memory note: local + staging migration trackers are drifted, schema is hand-applied.)

## Architecture lessons surfaced

1. **`public_access=false` blocks the entire renderer** — shows a built-in "this site is not yet available" page, doesn't invoke `SiteBlockRenderer` (so `custom_js` never runs). For a JS-gated demo, `public_access` must be `true`. The JS gate becomes the only protection (soft gate by design).
2. **`SiteBlockRenderer` wraps in `<Suspense>`** with a fallback (`BlockRenderer`) that doesn't include `customCss` / `customJs`. The injection only appears after client-side hydration. Static curl sees the streamed RSC content with the script tag; visual verification requires a real browser.
3. **Quote-block field shape** is `{content, author, citation}`, NOT `{quote, attribution}`. Worth adding a block-shape reference doc.

## What's still needed before sending to prospects

1. **Real branding per site** — current sites use generic dark footer + system fonts. Real demos should match each firm's actual brand (colors, fonts, logo).
2. **Real project imagery** — current sites use Material Icon placeholders. Real demos need at least 6–12 project photos per site, referenced via external URLs from the source.
3. **More blocks** — current 5-block layout is sparse. Real demos should mirror the source's full block structure (12+ project gallery for Beyond Modern, 8 services for Cortney Bishop, etc. — per migration plans in `migrations/<slug>/migration-plan.md`).
4. **Multi-page** — current sites have only a home page. Real demos should have at least About + Contact + Projects index.
5. **Visual verification** — Playwright MCP was locked during this session; couldn't capture a screenshot. Next session should hit each URL in a real browser to confirm fidelity.

The pre-staged migration plans in `migrations/<slug>/migration-plan.md` capture all of the above per site — those plans are what next-session-me should execute against once Claude Code is restarted and the `simplerdev-local` MCP is loaded.

## Rollback

To delete all 5 demos:

```sql
DELETE FROM posts WHERE website_id IN (SELECT id FROM client_websites WHERE subdomain LIKE 'prospect-%');
DELETE FROM client_websites WHERE subdomain LIKE 'prospect-%';
```

Or use the same delete-then-re-seed pattern at the top of `seed-prospects.ts`.

To revert the local DB to a fresh dryrun snapshot, re-import from the original prod dump (path: ask Dan, not committed here).
