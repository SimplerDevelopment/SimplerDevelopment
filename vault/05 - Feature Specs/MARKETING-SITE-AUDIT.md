---
type: marketing-site-audit
date: 2026-06-28
scope: public marketing site — sellability / conversion / trust audit + fixes
method: live crawl of localhost:3000 + code inspection
---

# Marketing Site Audit — Sellability Pass

Honest assessment: the public site is **in good shape on fundamentals** — most of the
audit dimensions were already addressed this session. This records the crawl
inventory, what was fixed this turn, and a prioritized punch list for the rest.

## Inventory (live crawl — all HTTP 200)
| Page | h1 | meta desc | JSON-LD | CTAs |
|---|---|---|---|---|
| / | 1 | ✓ | 4 | many |
| /pricing | 1 | ✓ | 4 | ✓ |
| /solutions (+ 21 /solutions/[slug]) | 1 | ✓ | 2–4 | many |
| /about, /contact, /apps-and-products | 1 | ✓ | 2 | ✓ |
| /blog (+ /blog/[slug], /blog/category/[slug]) | 1 | ✓ | 2 | ✓ |
| /privacy, /terms | 1 | ✓ | 2 | ✓ |
Favicon ✓ · copyright 2026 ✓ · no lorem/beta/placeholder copy · footer links all 200.

## Already strong (don't redo)
- **SEO/AI-SEO:** every page has title + meta + JSON-LD (Org/SoftwareApplication/WebSite/FAQPage/BreadcrumbList); robots, sitemap, served `/llms.txt`, OpenAPI.
- **Structure:** one h1/page, consistent header/footer, working nav + footer links.
- **CTAs:** present on every page (Get Started / Book a Consultation / Start Free).
- **Content:** real, specific copy across home/solutions/pricing; no filler.
- **Blog:** 12 published posts, pagination (9/page), representative per-post covers, detail pages render.
- **Screenshots:** real captures (home/pricing/solutions + 6 authed product + 71 solution-gallery).

## Fixed this turn
1. ✅ Homepage "See it" placeholder `[ product screenshot / demo GIF ]` → real dashboard screenshot.
2. ✅ Empty blog (homepage + /blog showed "coming soon") → 12 published posts seeded + reproducible.
3. ✅ Blog pagination added; mismatched covers → representative topic+title SVG covers.
4. ✅ Removed orphan duplicate `/home-old` + dead `HomeClientComingSoon` (duplicate-content / dead-end).

## Punch list (prioritized)

### Critical (before public launch) — maintainer-gated
- **Hero GIF:** the homepage now uses a still screenshot; record a real demo GIF against a live instance (the `vhs` tape is staged — don't ship it). Replaces the still in `HomeClient.tsx`.
- **Publish blog drafts:** 12 posts are `draft:true` in markdown / seeded for local; review + publish for production.
- **Git-history scrub + go public** (see `HISTORY-SWEEP-PLAN.md`) — gates the OSS/launch story.

### High-impact
- ✅ **`/faq`** — DONE: 16 grounded Q&As across 5 categories + FAQPage schema, footer + sitemap.
- ✅ **`/compare`** — DONE: category-positioning comparison table (7 dimensions) + "when point tools win" + FAQ/Breadcrumb schema, footer + sitemap.
- ✅ **`/changelog`** — DONE: product-facing release-notes timeline (v1.0 + recent highlights) + Breadcrumb schema, footer + sitemap.
- **Docs portal** — `docs/` content exists; a polished public `/docs` with search would match Stripe/Supabase bar. (Remaining.)

### Medium
- **Tablet/dark screenshot variants** + consistent browser-chrome across all marketing images.
- **Analytics:** verify CTA/sign-up/GitHub click tracking is wired (not audited here).
- **Mobile pass:** spot-check spacing/tap targets on key pages (structure is responsive; not device-tested this pass).

### Nice-to-have
- Blog: author pages, reading time, table-of-contents, related-posts.
- Per-page OG images (the blog covers pattern can extend to OG).
- Lighthouse a11y/perf pass (contrast, focus states, CLS, LCP) — not run this session.

## Net
No launch-blocking trust holes remain on the public site itself. The biggest
remaining sellability levers are the **hero GIF** and **publishing the blog** —
both content/maintainer actions — plus optional comparison/changelog/FAQ pages.
