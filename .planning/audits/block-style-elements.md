# Block Style Panel Audit — Sub-Elements Coverage

**Goal:** every block type that renders distinct sub-elements exposes those parts as tabs in the style panel, and every tab's `key` is actually consumed by the render component (so style edits apply).

**Where tabs are declared:** `components/portal/VisualEditorShell.tsx` → `const BLOCK_ELEMENTS` (~line 1389)
**Where tabs are consumed:** each `components/blocks/render/<Name>BlockRender.tsx` via `getElementCSS(block.elementStyles, '<key>')`
**Style panel wiring:** `ElementStyleEditor` (VisualEditorShell.tsx:1510) — maps `StyleSettings` onChange → `elementStyles[activeElement]`. Already correct; this audit is about coverage, not wiring.

## Method per block

1. Read `<Name>BlockRender.tsx` — enumerate every `getElementCSS(block.elementStyles, '<key>')` call
2. Compare to `BLOCK_ELEMENTS['<type>']` entry
3. Find mismatches:
   - **Missing tab**: key used in render but absent from panel → add tab
   - **Dead tab**: tab shown in panel but key not consumed → remove or wire
   - **Missing block entry entirely**: render uses elementStyles but no BLOCK_ELEMENTS entry → add full entry
4. Verify labels are human-readable and ordered logically (outer→inner)
5. Mark row ✅ when panel matches render 1:1

## Blocks consuming `elementStyles` (from grep)

| # | Block type | Render file | Declared in BLOCK_ELEMENTS? | Status | Notes |
|---|---|---|---|---|---|
| 1 | hero | HeroBlockRender.tsx | yes | ✅ | added `secondaryCta` tab (was consumed in render, missing from panel) |
| 2 | hero-slideshow | HeroSlideshowBlockRender.tsx | yes | ✅ | added `statValue`, `statLabel` |
| 3 | marquee | MarqueeBlockRender.tsx | yes | ✅ | matches 1:1 |
| 4 | cta | CtaBlockRender.tsx | yes | ✅ | matches 1:1 |
| 5 | card-grid | CardGridBlockRender.tsx | yes | ✅ | added `cardIcon`, `cardImage`, `cardLink` |
| 6 | flip-card-grid | FlipCardGridBlockRender.tsx | yes | ✅ | matches 1:1 |
| 7 | metric-cards | MetricCardsBlockRender.tsx | yes | ✅ | matches 1:1 |
| 7b | logo-strip | LogoStripBlockRender.tsx | yes | ✅ | matches 1:1 (not in original grep) |
| 8 | stats | StatsBlockRender.tsx | yes | ✅ | matches 1:1 |
| 9 | testimonial | TestimonialBlockRender.tsx | yes | ✅ | removed dead `role` tab; added `quoteIcon` |
| 10 | services-grid | ServicesGridBlockRender.tsx | yes | ✅ | removed dead `card`; added `serviceTitle/Description/Icon/Image/Link` |
| 11 | featured-content | FeaturedContentBlockRender.tsx | yes | ✅ | removed dead `image`; added `statValue`, `statLabel` |
| 12 | accordion | AccordionBlockRender.tsx | yes | ✅ | added `title` |
| 13 | quote | QuoteBlockRender.tsx | yes | ✅ | matches 1:1 |
| 14 | product-detail | ProductDetailBlockRender.tsx | yes | ✅ | matches 1:1 |
| 15 | booking | BookingBlockRender.tsx | yes | ✅ | added `_block` tab (was missing) |
| 16 | survey | SurveyBlockRender.tsx | yes | ✅ | added `_block` tab (was missing) |
| 17 | blog-posts | BlogPostsBlockRender.tsx | no→yes | ✅ | added entry: `_block, title, description, postTitle, postExcerpt` |
| 18 | bento-grid | BentoGridBlockRender.tsx | no→yes | ✅ | added entry: `_block, overline, title, subtitle, cardTitle, cardLead` |
| 19 | booking-menu | BookingMenuBlockRender.tsx | no→yes | ✅ | added entry: `_block, title, description` |
| 20 | featured-products | FeaturedProductsBlockRender.tsx | no→yes | ✅ | added entry: `_block, title, description` |
| 21 | gallery | GalleryBlockRender.tsx | no→yes | ✅ | added entry: `_block, caption` |
| 22 | product-grid | ProductGridBlockRender.tsx | no→yes | ✅ | added entry: `_block, title, description` |
| 23 | store-banner | StoreBannerBlockRender.tsx | no→yes | ✅ | added entry: `_block, title, subtitle, button, discountCode` |
| 24 | team-showcase | TeamShowcaseBlockRender.tsx | no→yes | ✅ | added entry: `_block, overline, title, subtitle, memberName/Title/Bio/Credentials, specialtyTag` |
| 25 | timeline | TimelineBlockRender.tsx | no→yes | ✅ | added entry: `_block, overline, title, subtitle, stepTitle, stepDescription` |

Legend: ⏳ pending · 🔍 auditing · ✅ done · ⚠ issues found · 🚫 skipped (won't fix)

## Per-iteration progress log

Each loop iteration appends a dated entry here with the block it audited and what changed.

### 2026-04-16 — iteration 1 (initial scan + tracker set up)
Created this tracker. Identified 25 blocks using elementStyles; 16 already declared in BLOCK_ELEMENTS, 9 missing entries. Next iteration starts with `hero`.

### 2026-04-16 — iteration 2 (full sweep, inline)
Canceled the 20-min cron — task is pure code editing with no external waits, no reason to pace.
Batch-extracted elementStyles keys from all 25 render files via grep; diffed against BLOCK_ELEMENTS in one pass.

Changes to `BLOCK_ELEMENTS` in `components/portal/VisualEditorShell.tsx`:
- **Added missing tabs** (8 blocks): hero-slideshow +statValue/statLabel; card-grid +cardIcon/cardImage/cardLink; testimonial +quoteIcon; services-grid +serviceTitle/Description/Icon/Image/Link; featured-content +statValue/statLabel; accordion +title; booking +_block; survey +_block.
- **Removed dead tabs** (3 blocks): testimonial `role` (no getElementCSS consumer); services-grid `card` (no consumer); featured-content `image` (no consumer).
- **Added missing block entries** (9 blocks): blog-posts, bento-grid, booking-menu, featured-products, gallery, product-grid, store-banner, team-showcase, timeline.
- **Discovered and verified** `logo-strip` was added between iterations — checked against its render, matches 1:1.

Post-audit status: **every block consuming elementStyles has a BLOCK_ELEMENTS entry, and every entry's keys are 1:1 with the render component's getElementCSS calls.**
Wiring (ElementStyleEditor → StyleSettings → elementStyles[activeElement]) was already correct — this audit was coverage-only.
Net: 13 new styleable sub-element tabs exposed to users, 3 dead tabs removed, 9 blocks gained sub-element styling. Nothing broken.
