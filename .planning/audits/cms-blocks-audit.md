# CMS Blocks Audit

**Status:** living document — updated as gaps close
**Last updated:** 2026-04-25 (Batch A + B deferred-gaps sweep)
**Scope:** every block type registered in `types/blocks.ts` Block union

## Wiring layers — what every "fully optimized" block needs

| Layer | File | Purpose |
|---|---|---|
| **Type** | `types/blocks.ts` | TypeScript interface defining content fields |
| **Renderer** | `components/blocks/render/<Name>BlockRender.tsx` + case in `BlockRenderer.tsx` | Production live-view rendering |
| **Style wrapper** | `components/blocks/render/BlockStyleWrapper.tsx` | Applies `block.style` + responsive |
| **Editor preview** | `components/blocks/visual/<Name>BlockPreview.tsx` + case in `VisualBlockPreview.tsx` | In-canvas editing inside the visual editor iframe |
| **Settings panel** | case in `components/blocks/visual/BlockSettings.tsx` | Side-panel content + style controls |
| **Picker icon** | case in `components/blocks/BlockTypeIcon.tsx` | SVG shown in the add-block menu |
| **Picker entry** | entry in `app/api/blocks/route.ts` | Surfaces the block in the add-block menu |
| **Email registry** *(if email-eligible)* | `lib/email/email-block-types.ts` | Marks the block as supported in the email editor |
| **MCP schema** | `lib/mcp/blocks-schema.ts` + `lib/ai/block-schemas.ts` | AI authors via the MCP server |
| **Brand defaults** *(optional)* | `lib/branding/block-defaults.ts` | Smart defaults from tenant brand |
| **E2E** | `tests/e2e/visual-editor-blocks.spec.ts` | create→verify→update→verify lifecycle |
| **Unit** | `tests/unit/*` | Style wrapper sentinel, drift detection, block-specific |

## Block taxonomy

- **basic** — primitives, every site needs them
- **media** — images, video, gallery
- **layout** — structural containers (columns, tabs, accordion, section)
- **component** — composed marketing/UI blocks
- **ecommerce** — store-related
- **forms** — interactive flows (booking, survey)
- **email-only** — only in email editor (EMAIL_BLOCK_TYPES)
- **pitch-deck-only** — only inside slide editor
- **site-specific** — Palizzi (one-off custom client)

## Master inventory + gap matrix

Legend: ✓ wired / ✗ missing / — N/A for this block category

| # | Block type | Cat | Type | Render | Wrapper | Preview | Settings | Icon | API | Email | E2E | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | text | basic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 2 | heading | basic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 3 | image | basic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 4 | button | basic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 5 | quote | basic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 6 | code | basic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | |
| 7 | spacer | basic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 8 | divider | basic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 9 | video | media | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | E2E added Phase 3 |
| 10 | youtube | media | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | |
| 11 | gallery | media | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG) |
| 12 | columns | layout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 13 | tabs | layout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | E2E added Phase 3 |
| 14 | accordion | layout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | E2E added Phase 3 |
| 15 | section | layout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| 16 | hero | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | |
| 17 | hero-slideshow | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | E2E added Phase 3 |
| 18 | marquee | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | E2E added Phase 3 |
| 19 | cta | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | |
| 20 | services-grid | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | E2E added Phase 3 |
| 21 | card-grid | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | |
| 22 | flip-card-grid | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 23 | metric-cards | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 24 | logo-strip | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 25 | stats | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | |
| 26 | testimonial | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | |
| 27 | blog-posts | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | E2E added Phase 3 |
| 28 | featured-content | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | E2E added Phase 3 |
| 29 | timeline | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 30 | team-showcase | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 31 | team-flip-grid | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 32 | bento-grid | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 33 | site-footer | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 34 | social-links | component | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Fully wired Phase 1-3 |
| 35 | product-grid | ecommerce | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 36 | featured-products | ecommerce | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 37 | product-categories | ecommerce | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 38 | shopping-cart | ecommerce | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 39 | store-banner | ecommerce | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 40 | product-detail | ecommerce | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 41 | booking | forms | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 42 | booking-menu | forms | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | Fully wired Phase 1-3 |
| 43 | survey | forms | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 44 | survey-results | forms | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | — | ✓ | **icon missing** (legacy SVG); E2E added |
| 45 | survey-input | pitch-deck | ✓ | ✓⁺ | ✓ | ✓ | ✗ | — | — | — | ✗ | renderer case **was missing** — Phase 1 fix |
| 46 | email-header | email-only | ✓ | ✓ | ✓ | ✓ | ✗ | — | — | ✓ | ✓ | **settings**, **icon** (email picker); E2E added |
| 47 | email-footer | email-only | ✓ | ✓ | ✓ | ✓ | ✗ | — | — | ✓ | ✓ | **settings**, **icon**; E2E added |
| 48 | deck-next-slide | pitch-deck | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | pitch-deck context only |
| 49 | deck-jump-to | pitch-deck | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | pitch-deck context only |
| 50 | palizzi-nav | site-specific | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | hard-coded for one tenant |
| 51 | palizzi-hero | site-specific | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | hard-coded for one tenant |
| 52 | palizzi-welcome | site-specific | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | hard-coded for one tenant |
| 53 | palizzi-history | site-specific | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | hard-coded for one tenant |
| 54 | palizzi-menu | site-specific | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | hard-coded for one tenant |
| 55 | palizzi-rules | site-specific | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | hard-coded for one tenant |
| 56 | palizzi-membership | site-specific | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | hard-coded for one tenant |
| 57 | palizzi-footer | site-specific | ✓ | ✓ | ✓ | ✗ | ✗ | — | — | — | ✗ | hard-coded for one tenant |

## Phase tracker

### Phase 1 — reachability + drift detection *(complete 2026-04-25)*

- [x] Wrote `tests/unit/blocksRegistryCompleteness.test.ts` — 5 drift checks (renderer cases, picker entries, /api/blocks entries, no orphans, email registry hygiene). Fails the build on registry drift
- [x] Added 14 missing `/api/blocks` entries: section, gallery, hero-slideshow, marquee, timeline, team-showcase, team-flip-grid, bento-grid, site-footer, social-links, booking, booking-menu, survey, survey-results
- [x] Added new `forms` category to `/api/blocks` `categories[]`
- [x] Added 8 missing entries to `BUILT_IN_BLOCK_TYPES` (the actual user-facing picker in `VisualEditorShell.tsx`): blog-posts, timeline, team-showcase, bento-grid, site-footer, social-links, booking-menu, survey-results
- [x] **Fixed real production bug**: `BlockRenderer.tsx` was missing case arms for `flip-card-grid`, `metric-cards`, `logo-strip`, `survey-input` — these blocks would have rendered as the "Unknown block type" fallback in production despite their renderer components existing on disk. Added imports + case arms.

**Punted to later phases:**
- `BlockTypeIcon.tsx` (legacy SVG-based icon switch) — only consumed by `VisualBlockEditorEnhanced.tsx` (legacy editor). The current editor uses Material Icon names from `BUILT_IN_BLOCK_TYPES` and the comprehensive `BLOCK_ICONS` Record (typesafe via `Record<BlockType, LucideIcon>`). Leaving the legacy SVG file alone since it's not user-visible in the active path.
- `BLOCK_TYPES` array in `lib/utils/blockIcons.tsx` is incomplete (~33 of 56) — but I haven't found a frontend consumer that's broken by this. Will verify in Phase 2.

### Phase 2 — Visual Editor parity

**Phase 2a — preview parity *(complete 2026-04-25)*:**
- [x] `FlipCardGridBlockPreview.tsx`
- [x] `MetricCardsBlockPreview.tsx`
- [x] `LogoStripBlockPreview.tsx`
- [x] `TimelineBlockPreview.tsx`
- [x] `TeamShowcaseBlockPreview.tsx`
- [x] `TeamFlipGridBlockPreview.tsx`
- [x] `BentoGridBlockPreview.tsx`
- [x] `SiteFooterBlockPreview.tsx`
- [x] `BookingMenuBlockPreview.tsx`
- [x] All 9 wired into the `VisualBlockPreview` switch
- [x] Extended drift test: now asserts every user-pickable block has a preview case

**Phase 2a pattern**: each preview reuses the production renderer for pixel-perfect parity, but renders a dashed-border empty-state placeholder when the block has no data. Inline editing is deferred to the side-panel BlockSettings (or, for booking-menu, an inline title/description inputs because the body is dynamic placeholder data).

**Phase 2b — BlockSettings arms** *(provides type-specific edit fields in the side panel)*:
- [x] **social-links** — platform/url array editor + iconSize + alignment
- [x] **logo-strip** — logos array (imageUrl/alt/link) + columns + grayscale + logoHeight + gap + alignment + overline
- [x] **metric-cards** — metrics array (value/label/institution/link) + columns + accentColor + overline/title/description
- [x] **booking-menu** — title + description + columns + helper note explaining live data
- [x] Wired all 4 into the BlockSettings switch
- [x] Extended `ELEMENT_DEFINITIONS` with sub-element style keys for: flip-card-grid (10 keys), metric-cards (8 keys), logo-strip (2 keys), timeline (5 keys), team-showcase (8 keys), bento-grid (5 keys) — sub-elements are now styleable via the Style→Elements panel for these blocks

**Phase 2b remaining** *(complete 2026-04-25)*:
- [x] flip-card-grid settings arm (cards array + accent + flipTrigger + flipAxis + cardHeight + columns)
- [x] timeline settings arm (steps array + lineColor + numberColor + nodeColor + layout)
- [x] team-showcase settings arm (members array + bioPanelColor + accentColor + photoFilter)
- [x] team-flip-grid settings arm (members array + columns + colors)
- [x] bento-grid settings arm (cards array + colors + columns)
- [x] site-footer settings arm (linkGroups + contactInfo + socialLinks + colors)
- [x] hero-slideshow settings arm (already exists at line 2691)
- [x] marquee settings arm (items + direction + speed + pauseOnHover + gradient + gap)
- [x] tabs settings arm (exists at line 4505)
- [x] survey-input settings arm (fieldType + fieldLabel + options + slider config)

### Phase 2c — renderer elementStyles wiring *(complete 2026-04-25)*

These renderers now call `getElementCSS(block.elementStyles, key)` for their styleable sub-elements, with matching `ELEMENT_DEFINITIONS` entries:
- [x] team-flip-grid renderer (memberName, memberTitle, memberBio, question, answer, frontCard, backCard)
- [x] site-footer renderer (logo, tagline, linkGroupLabel, link, socialIcon, contactLine, copyright)
- [x] social-links renderer (icon, link)
- [x] booking-menu renderer (title, description, card, cardTitle, cardDescription, button) — already wired in renderer; ELEMENT_DEFINITIONS entry added

### Phase 3 — E2E coverage

Add lifecycle tests in `tests/e2e/visual-editor-blocks.spec.ts` for the blocks currently uncovered.

**Batch 1 — high-priority blocks** *(complete 2026-04-25)*:
- [x] video
- [x] marquee
- [x] accordion
- [x] tabs
- [x] services-grid
- [x] blog-posts
- [x] featured-content
- [x] hero-slideshow
- [x] timeline
- [x] team-showcase
- [x] team-flip-grid
- [x] social-links
- [x] bento-grid
- [x] site-footer
- [x] metric-cards
- [x] logo-strip
- [x] flip-card-grid

**Batch 2 — remaining blocks** *(complete 2026-04-25)*:
- [x] ecommerce (product-grid, featured-products, product-categories, shopping-cart, store-banner, product-detail)
- [x] forms (booking, booking-menu, survey, survey-results)
- [x] email (email-header, email-footer)

**Phase 3 status:** 48 lifecycle tests in `tests/e2e/visual-editor-blocks.spec.ts` (up from 19). All user-pickable site/email blocks now covered. Pitch-deck (deck-next-slide, deck-jump-to, survey-input) and palizzi-* blocks intentionally excluded — they aren't surfaced in the universal block picker.

### Phase 4 — Per-block deep audit

For each block in the inventory, walk:
- Every documented field in the type → verify Settings panel exposes it (or document why it's auto-derived)
- Every visual sub-element → verify it can be styled via `elementStyles[key]`
- Every interactive element → verify it works in edit mode + production
- Verify keyboard accessibility (Tab order, ARIA)

Block-by-block worksheets land below as work happens.

---

## Per-block deep-dive worksheets

*Filled in as Phase 4 progresses. For each block, workers verify:*
- *(1) every type field has a settings input or is sub-element-style-driven*
- *(2) every renderer sub-element has an `ELEMENT_DEFINITIONS` entry*
- *(3) block appears in picker with an icon*
- *(4) lifecycle E2E test exists*
- *(5) preview component renders without crashing*

### Phase 4 batch tracker

- [x] **Batch 1 — basic blocks:** text, heading, image, button, quote, code, spacer, divider *(complete 2026-04-25)*
- [x] **Batch 2 — media + layout:** video, youtube, gallery, columns, tabs, accordion, section *(complete 2026-04-25)*
- [x] **Batch 3 — marketing components:** hero, hero-slideshow, marquee, cta, services-grid, card-grid, stats, testimonial *(complete 2026-04-25)*
- [x] **Batch 4 — rich components:** flip-card-grid, metric-cards, logo-strip, blog-posts, featured-content, timeline *(complete 2026-04-25)*
- [x] **Batch 5 — team + bento + footer + social:** team-showcase, team-flip-grid, bento-grid, site-footer, social-links *(complete 2026-04-25)*
- [x] **Batch 6 — ecommerce:** product-grid, featured-products, product-categories, shopping-cart, store-banner, product-detail *(complete 2026-04-25)*
- [x] **Batch 7 — forms + email:** booking, booking-menu, survey, survey-results, email-header, email-footer *(complete 2026-04-25)*

**Verification at end of Phase 4 mechanical pass:** drift test 6/6 pass; typecheck clean for all block files (only pre-existing unrelated errors remain in `tests/e2e/portal-mcp-approvals.spec.ts`, `tests/integration/api/file-upload.test.ts`, and `tests/e2e/pitch-deck-columns.spec.ts`).

### Mechanical fixes shipped

- **marquee settings arm** *(2026-04-25)*: added `loop` numeric input ("Loop Count", 0 = infinite).
- **metric-cards settings arm** *(2026-04-25)*: added per-card `linkText` and `institutionLogo` URL/text inputs.
- **image elementStyles** *(2026-04-25)*: ELEMENT_DEFINITIONS['image'] adds `caption`; `ImageBlockRender` figcaption now applies `getElementCSS('caption')`.
- **tabs elementStyles** *(2026-04-25)*: ELEMENT_DEFINITIONS['tabs'] adds `tab`, `activeTab`, `tabPanel`; `TabsBlockRender` applies them.
- **hero-slideshow advanced fields** *(2026-04-25)*: per-slide `<details>` exposes `backgroundSize`, `backgroundPosition`, `backgroundRepeat`, `overlayOpacity`; deck-level `<details>` exposes nav colors (arrow/dot/progress).
- **booking styleOverrides** *(2026-04-25)*: all 11 nested styleOverrides fields under collapsible "Advanced styling overrides".
- **button presetId** *(2026-04-25)*: text input "Brand Preset (optional)" with helper text — chose text input over dropdown because the BlockSettings panel sits outside `BrandingProvider`.
- **button settings arm**: added `icon` (Material Icon name input), `iconPosition` (left/right select), `hoverEffect` (none/lift/glow/fill/slide/pulse select). The button renderer was already consuming all three but the side panel had no inputs — this closes that gap.
- **section settings arm**: added `splitColor` + `splitClipPath` controls under a "Diagonal Split (advanced)" sub-section. The renderer already supports the diagonal-split overlay but there was no UI to configure it.
- **services-grid settings arm**: added `overline` (rich-text input) and `accentColor` (TokenColorPicker) — both were rendered but unset-able from the panel. Also extended `ELEMENT_DEFINITIONS['services-grid']` with `overline`, `card`, `bullet` keys (renderer already calls `getElementCSS` for `bullet`).
- **blog-posts settings arm**: added `categorySlug` text input — the renderer's `getBlogPostsByCategory(block.categorySlug)` branch was unreachable from the UI.
- **product-grid / featured-products / product-categories settings arms**: added `title` and `description` rich-text inputs to all three (`product-grid` renderer reads them via `block.title`/`block.description` data-editable-fields and they were impossible to set without raw JSON). Also added `layout` (grid/carousel) select to `featured-products`.
- **booking settings arm**: added `showDescription` and `showSteps` checkboxes — both were renderer-honored but missing from the panel.
- **email-header settings arm** (new): logoUrl, logoWidth, alignment, tagline. Wired into the `BlockSettings` switch — previously fell through to the "No settings available" fallback even though the email editor uses this same panel.
- **email-footer settings arm** (new): companyName, address, showUnsubscribe, showViewInBrowser, socialLinks array editor. Same wiring fix as email-header.

### Findings — Batch 1 (basic blocks)

| Block | Type fields covered | ELEMENT_DEFINITIONS | Picker | E2E | Preview | Notes |
|---|---|---|---|---|---|---|
| text | content (inline), size, alignment | n/a (no sub-elements) | OK | OK | OK | Fully optimized |
| heading | content (inline), level, alignment | n/a | OK | OK | OK | Fully optimized |
| image | url, alt, caption, width, alignment | n/a (renderer doesn't use elementStyles for caption — figcaption is plain) | OK | OK | OK | Could optionally add `caption` element style if user wants per-caption styling — flagged below |
| button | text, url, variant, size, alignment, openInNewTab + (newly added) icon, iconPosition, hoverEffect | n/a | OK | OK | OK | `presetId` (brand button preset reference) **not exposed** — needs design judgment, see below |
| quote | content (inline), author, citation; renderer reads `quoteText` and `author` element styles | quoteText, author | OK | OK | OK | Fully optimized |
| code | code (inline raw), language | n/a | OK | OK | OK | Fully optimized |
| spacer | height | n/a | OK | OK | OK | Fully optimized |
| divider | lineStyle | n/a | OK | OK | OK | Fully optimized |

### Findings — Batches 2 to 7 (rolled up)

**Fully optimized blocks** (every type field is settings-editable or inline-editable; ELEMENT_DEFINITIONS aligns with renderer; picker/E2E/preview present):
text, heading, image, quote, code, spacer, divider, video, youtube, gallery, columns, accordion, section *(post-fix)*, hero, cta, services-grid *(post-fix)*, card-grid, stats, testimonial, blog-posts *(post-fix)*, featured-content, flip-card-grid, metric-cards, logo-strip, timeline, team-showcase, team-flip-grid, bento-grid, site-footer, social-links, shopping-cart, store-banner, product-detail, product-grid *(post-fix)*, featured-products *(post-fix)*, product-categories *(post-fix)*, booking-menu, survey, survey-results, email-header *(post-fix)*, email-footer *(post-fix)*, button *(post-fix)*.

**Blocks with deferred minor gaps** (real but lower-priority):
- [x] **tabs** — *resolved 2026-04-25* — `tab`, `activeTab`, `tabPanel` keys added to ELEMENT_DEFINITIONS; `TabsBlockRender` now applies `getElementCSS` for tab buttons (base + active overlay) and tab panel.
- [x] **marquee** — *resolved 2026-04-25* — `loop` numeric field exposed in MarqueeBlockSettings under "Loop Count" with helper text noting 0 = infinite.
- [x] **metric-cards** — *resolved 2026-04-25* — per-card `linkText` and `institutionLogo` inputs added to MetricCardsBlockSettings.
- [x] **hero-slideshow** — *resolved 2026-04-25* — per-slide `backgroundSize`, `backgroundPosition`, `backgroundRepeat`, `overlayOpacity` exposed under a per-slide "Advanced" `<details>` disclosure. Deck-level nav colors (`arrowColor`, `arrowBackground`, `arrowBorderColor`, `dotColor`, `dotActiveColor`, `progressBarColor`) exposed under deck-level "Advanced navigation colors" disclosure. (Type has no `navColor`/`navActiveColor` fields — the actual fields above are the canonical names.)
- [x] **booking** — *resolved 2026-04-25* — all 11 `styleOverrides` fields (primaryColor, backgroundColor, textColor, formBg, inputBg, headingFont, bodyFont, buttonBg, buttonText, buttonBorderRadius, borderRadius) surfaced under collapsible "Advanced styling overrides" section.
- **section** — legacy direct-style fields (`backgroundColor`, `color`, `paddingTop/Bottom/Left/Right`, `fontFamily`) intentionally not duplicated in the panel since the Style tab covers them. Kept that way per existing comment.
- [x] **image** — *resolved 2026-04-25* — `caption` added to ELEMENT_DEFINITIONS for image; `ImageBlockRender` now applies `getElementCSS(block.elementStyles, 'caption')` to the figcaption (matches gallery's caption parity).

### Items flagged for user design judgment

1. ~~**Emoji violations across settings arms (cross-cutting, not fixed)**~~ **RESOLVED 2026-04-25** — All emoji glyphs replaced with Material Icons across `BlockSettings.tsx` (alignment toggles, image/video/avatar empty-states), `ColumnsBlockPreview.tsx`, `SectionBlockPreview.tsx`, `TabsBlockPreview.tsx` (picker icon arrays + renderers), `VideoBlockPreview.tsx`, `YoutubeBlockPreview.tsx`, `ImageBlockPreview.tsx`, `FeaturedContentBlockPreview.tsx`, `BlogPostsBlockPreview.tsx`, `ServicesGridBlockPreview.tsx`, `CardGridBlockPreview.tsx`, and `TokenColorPicker.tsx`. Picker renderers updated from `<div className="text-2xl">{emoji}</div>` to `<span className="material-icons text-2xl">{iconName}</span>`.
2. ~~**`ButtonBlock.presetId`**~~ **RESOLVED 2026-04-25** — Added a "Brand Preset (optional)" text input to ButtonBlockSettings with helper text noting "Preset key from brand presets" and how preset styles compose with block styles. Per orchestrator guidance, kept to a text input rather than scaffolding a new presets-fetch module — the BlockSettings panel sits outside the `BrandingProvider`, so a dropdown would require a new `/api/portal/branding`-fronted lookup.
3. ~~**`ImageBlock.caption` element styling**~~ **RESOLVED 2026-04-25** — `ImageBlockRender` now wraps the figcaption with `getElementCSS(block.elementStyles, 'caption')`; ELEMENT_DEFINITIONS gained an `image` entry with `caption`.
4. ~~**Tabs sub-element styling**~~ **RESOLVED 2026-04-25** — Added `tab`, `activeTab`, `tabPanel` keys to ELEMENT_DEFINITIONS['tabs']; `TabsBlockRender` now applies `getElementCSS` to the tab button (base + active overlay) and the tab panel container.
5. ~~**`BookingBlock.styleOverrides`**~~ **RESOLVED 2026-04-25** — Surfaced all 11 `styleOverrides` fields under a collapsible "Advanced styling overrides" `<details>` block in BookingBlockSettings. Color fields use `TokenColorPicker`; font and radius fields are text inputs.
6. ~~**Hero-slideshow advanced fields**~~ **RESOLVED 2026-04-25** — Per-slide `<details>` block "Advanced (background sizing & overlay opacity)" exposes `backgroundSize` (cover/contain/auto/50–200%), `backgroundPosition`, `backgroundRepeat`, `overlayOpacity` (0–1 slider). Deck-level `<details>` block "Advanced navigation colors" exposes `arrowColor`, `arrowBackground`, `arrowBorderColor`, `dotColor`, `dotActiveColor`, `progressBarColor`.
7. ~~**Tabs ELEMENT_DEFINITIONS entry**~~ **RESOLVED 2026-04-25** — see item 4.


