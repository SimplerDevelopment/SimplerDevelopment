# CMS Blocks Audit

**Status:** ✅ FULLY CLOSED — audit complete; all 6 design items resolved 2026-04-26
**Last updated:** 2026-04-26 (dual-editor architecture documented; iframe editor parity ported)
**Scope:** every block type registered in `types/blocks.ts` Block union

## ⚠️ READ FIRST — dual-editor architecture

**There are TWO settings panels that must both be kept in sync.** The audit (and a follow-up E2E pass on 2026-04-26) confirmed that block-settings UI lives in two separate files, each rendering for a different editor surface:

| File | Function | Reached by |
|---|---|---|
| `components/blocks/visual/BlockSettings.tsx` | `BlockSettings` (4000+ lines, one `*BlockSettings` function per block type) | Admin posts editor (`/admin/posts/[id]/edit`); Email block editor (`/portal/email/templates`); Settings popup window (`/block-editor/settings-popup`) |
| `components/portal/VisualEditorShell.tsx` | `BlockContentEditor` (~lines 1647–end, single component with a chain of `{block.type === 'X' && <>...</>}` sections) | Portal posts editor in iframe mode (`/portal/websites/[siteId]/posts/[postId]/edit`) — i.e. **most production sites with a `siteUrl` set** |

**Why both are reachable:** `PortalPostForm` defaults `editorMode` to `'iframe'` when the site has a `siteUrl`, but admin/email/popup routes have always used the `BlockSettings.tsx` chain via `EditorWithPreview` / `VisualBlockEditorEnhanced` / direct import. There's no UI path from iframe mode back to the legacy 'visual'/'classic' modes, but the legacy modes are still hit from other entry points.

**What this means for future block work:**

- New settings UI for a block must land in **both** files. Otherwise users on one of the four reachable editors won't see the field.
- Field labels can differ between the two files (e.g. `BlockSettings.tsx` "Arrow Border Color" vs `BlockContentEditor` "Arrow Border") — but the underlying data field name must match.
- Most existing audit work (Phases 2–4 in this doc) was applied to `BlockSettings.tsx`. Whether that work also reached `BlockContentEditor` was inconsistent — the 2026-04-26 port (commit `91a88be3`) closed the gap for the 10 blocks where it was missing (button, section, booking-menu, social-links, timeline, bento-grid, team-showcase, team-flip-grid, survey-results, site-footer).

**Sanity-check before adding new fields:** grep both files for the field name. If only one file has it, the other needs the same change.

## Audit closeout summary (2026-04-25)

The cms-blocks audit ran through 4 phases plus a per-block visual deep review across 7 batches. All mechanical work outlined in `cms-blocks-handoff.md` is complete; what remains is 6 design-judgment decisions that need user input rather than autonomous worker dispatch.

**Phases completed:**

| Phase | Scope | Outcome |
|---|---|---|
| 1 | Inventory + gap matrix | 47 user-pickable blocks catalogued |
| 2a | Missing API metadata | section, gallery, etc. added to `/api/blocks` |
| 2b | Missing renderer cases | flip-card-grid, metric-cards, logo-strip, survey-input wired into `BlockRenderer` |
| 2c | Missing `getElementCSS` plumbing | SocialLinks, TeamFlipGrid, SiteFooter, BookingMenu renderers; matching `ELEMENT_DEFINITIONS` |
| 3 | Lifecycle E2E | Tests grew 19 → 48 specs (content + ecommerce + forms + email families) |
| 4 (mechanical) | Settings panel + sub-element coverage | All 47 blocks audited; deferred-gap closures for marquee, metric-cards, image, tabs, hero-slideshow, booking, button |
| Emoji sweep | Material Icons everywhere | 12 files; nested-picker renderers updated to render Material Icons not literal text |
| Refactor | Dedup nested inserter + `createDefaultBlock` | Shared `NestedBlockInserter` + canonical `lib/blocks/defaults.ts`; **25 block types** now reachable inside columns/tabs/sections that previously weren't |
| 4 (visual) | Per-block preview-vs-renderer parity, 7 batches | 35 blocks 🔧 fixed, 12 ✅ verified clean, 47 total reviewed |

**Commit chain:**
1. `9fb1caac` — phases 1–4 mechanical + lifecycle E2E + emoji sweep (35 files, +4458/-140)
2. `0624a780` — visual review batch 1 (foundation)
3. `0c296025` — visual review batch 2 (basic + media)
4. `d386284d` — visual review batch 3 (layout containers)
5. `6af78f3e` — refactor: nested inserter + `createDefaultBlock` dedup
6. `e1c1c98e` — visual review batch 4 (components)
7. `ef65ddaa` — visual review batch 5 (specialty / newer components)
8. `8fa7d129` — visual review batch 6 (specialty wrap-up + ecommerce start)
9. `ef646319` — visual review batch 7 (final: store-banner, product-detail, booking, booking-menu, survey, survey-results, email-header, email-footer)

**Quality gates (all green):**
- `tests/unit/blocksRegistryCompleteness.test.ts` — 6/6 pass after every batch
- `npx tsc --noEmit` — clean for all touched block files
- Pre-existing unrelated TS errors in `tests/e2e/portal-mcp-approvals.spec.ts`, `tests/integration/api/file-upload.test.ts`, `tests/e2e/pitch-deck-columns.spec.ts` are unchanged

**Outstanding (need user judgment, not blockers):**
1. ~~RESOLVED~~ Section legacy direct-style fields — `@deprecated` JSDoc added to `backgroundColor`, `paddingTop/Bottom/Left/Right`, `color`, `fontFamily` on `SectionBlock`; fields retained for on-disk compatibility.
2. ~~RESOLVED~~ Default `hero` block content — richer placeholder copy shipped: `subtitle` + `description` filled with obvious-to-replace placeholder text; no background image.
3. ~~RESOLVED~~ `SocialLinksBlock.iconSize` — renderer + preview now render `<span class="material-icons">` sized by `iconSize` (default 24); `aria-label` on `<a>`, text label hidden with `sr-only`.
4. ~~RESOLVED~~ `FeaturedProductsBlock.layout` — dead `'grid' | 'carousel'` field removed from `types/blocks.ts`, `BlockSettings.tsx` settings panel, and `lib/ai/block-schemas.ts`.
5. ~~RESOLVED~~ product-categories elementStyles parity — `getElementCSS('title'/'description')` wired in renderer (both layout branches); `'product-categories'` added to `ELEMENT_DEFINITIONS`; preview upgraded to `RichTextEditable` with element styles applied.
6. ~~RESOLVED~~ `SurveyResultsBlock.fieldIds` — checkbox-list question picker added to `SurveyResultsBlockSettings`; shows each survey field when a survey is selected; "All" button clears `fieldIds` (= show all).

See "## Phase 4 status" near the end of this doc for the per-batch breakdown.

---


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

---

## Phase 4 — Per-block deep visual review

Side-by-side audit comparing the editor preview, production renderer, and design intent for each user-pickable block. Going beyond "every field has a control" to "what the user sees in the canvas matches what the visitor sees on the live site."

Legend: ✅ verified parity | 🔧 fixed this pass | 🚩 flagged for user

### Visual-review batch tracker

- [x] **Batch 1 — foundation:** hero, section, text, heading, image, button, cta *(complete 2026-04-25)*
- [x] **Batch 2 — basic + media:** quote, code, spacer, divider, video, youtube, gallery *(complete 2026-04-25)*
- [x] **Batch 3 — layout containers:** columns, tabs, accordion *(complete 2026-04-25)*
- [x] **Batch 4 — components:** services-grid, card-grid, stats, testimonial, featured-content, blog-posts, timeline *(complete 2026-04-25)*
- [x] **Batch 5 — specialty / newer components:** hero-slideshow, marquee, bento-grid, team-flip-grid, team-showcase, flip-card-grid, metric-cards *(complete 2026-04-25)*
- [x] **Batch 6 — specialty wrap-up + eCommerce start:** logo-strip, site-footer, social-links, product-grid, featured-products, product-categories, shopping-cart *(complete 2026-04-25)*
- [x] **Batch 7 — final (forms + email + remaining ecommerce):** store-banner, product-detail, booking, booking-menu, survey, survey-results, email-header, email-footer *(complete 2026-04-25)*

### Findings — Visual review batch 1

| Block | Verdict | Notes |
|---|---|---|
| **text** | 🔧 | Preview only used `text-base` for `base` size; renderer uses `text-base md:text-lg`. Aligned size classes (incl. `leading-relaxed`) so preview/production typography match across breakpoints. Legacy `heading`/`body` shape (LLM-only) intentionally not surfaced in preview. |
| **heading** | ✅ | Preview already mirrors renderer's level→class map exactly (incl. `md:` escalations). Single `<div className="p-6">` outer is editor-only chrome and OK. |
| **image** | 🔧 | Preview always rendered `rounded-lg` even when `style.borderRadius` set; figcaption ignored `elementStyles['caption']`. Both fixed — preview now uses same `style.borderRadius ? '' : 'rounded-lg'` guard and `getElementCSS('caption')` as renderer. |
| **button** | 🔧 | Major divergence — preview ignored `icon`, `iconPosition`, `hoverEffect`, `presetId`, `block.style` overrides (color/bg/border/font/etc.), and branding `buttonStyle`/`borderRadius`. Now mirrors renderer's preset→buttonStyle→block.style cascade and renders the icon (incl. position) plus `gap-2`. Hover-effect CSS classes intentionally not injected in preview (`btn-hover-*` lives in the renderer's `<style>` tag); the button still looks correct at rest. |
| **hero** | 🔧 | Preview's hardcoded `bg-gradient-to-r from-primary/20 to-purple-500/20` showed purple accents that never appear in production. Replaced with the renderer's branded gradient (`linear-gradient(to bottom, primaryColor1a, backgroundColor, backgroundColor)`) when `BrandingProvider` is available, the `from-primary/10 via-background to-background` neutral fallback otherwise, and skips the overlay entirely when the user has set a custom bg via `block.style` (matches renderer's `hasCustomBg` guard). |
| **cta** | 🔧 | Same purple/pink hardcoded gradient issue (`from-primary/20 via-purple-500/20 to-pink-500/20`). Replaced with branded `primaryColor20/secondaryColor20/accentColor20` gradient, with renderer's CSS-var fallback when no branding context. |
| **section** | 🔧 | Preview ignored `style.backgroundGradient`, `borderColor/Width/Style/Radius`, `boxShadow`, `opacity`, and the `splitColor`/`splitClipPath` diagonal split overlay. Now layers gradient over image (matching renderer order), honors all border/shadow/opacity fields, and renders the diagonal split clip-path overlay when configured. |

### Items flagged for user judgment — visual review batch 1

8. ~~**Section preview's inline block-inserter modal**~~ **RESOLVED 2026-04-25** — Extracted shared `<NestedBlockInserter />` (components/blocks/visual/NestedBlockInserter.tsx) sourcing the full 47-block roster from `lib/blocks/registry.ts`. All three nested-context files (SectionBlockPreview, ColumnsBlockPreview, TabsBlockPreview) now use it. Users can insert any user-pickable block type inside a column/tab/section — previously capped at 19–22.

9. **Section legacy direct-style fields (`backgroundColor`, `paddingTop/Right/Bottom/Left`, `color`, etc.) vs `block.style.*`** — the renderer treats `block.style.backgroundColor` as overriding `block.backgroundColor` (style wins). The preview now matches that behavior. The audit previously noted that the Section settings arm intentionally doesn't duplicate these in the panel because the Style tab covers them. **Question for user:** should the legacy direct-style fields be deprecated (typed as `@deprecated`, hidden from new blocks, migration script to move them into `block.style`)? Currently both shapes coexist, which is confusing.

10. **Default `hero` block** (`PortalPostForm.createDefaultBlock` line 133): `{ title: 'Hero Title', ctaText: 'Learn More', ctaLink: '#' }`. No subtitle, no description, no background image, no secondary CTA. Renders fine but the dropped-in hero looks bare until the user fills it. **Question for user:** should we ship a richer default (e.g. include a placeholder subtitle/description so the structure is visually obvious) or leave it minimal so users can see what they're filling in?

11. ~~**`createDefaultBlock` factory is duplicated 6 times**~~ **RESOLVED 2026-04-25** — Consolidated into `lib/blocks/defaults.ts` with exhaustive coverage of all BlockType variants. All 7 consumers (BlockEditor, VisualBlockEditor, VisualBlockEditorEnhanced, SectionBlockPreview, ColumnsBlockPreview, TabsBlockPreview, PortalPostForm) now import from the shared module. PortalPostForm's richer defaults (flip-card-grid, metric-cards, logo-strip, marquee, hero-slideshow with starter content) are preserved in the canonical factory.

### Findings — Visual review batch 2

| Block | Verdict | Notes |
|---|---|---|
| **quote** | 🔧 | Preview was missing the curly-quote characters that wrap the renderer's content (`“ ”`), ignored `getElementCSS('quoteText')` and `getElementCSS('author')` entirely, didn't apply the `hasCustomFontSize` guard, and skipped responsive class generation. Now wraps the contenteditable in a flex row with non-editable curly quote spans flanking it (so user edits stay clean), applies element CSS to both the quote container and the `<cite>`, mirrors the renderer's font-size guard, and threads `combineResponsiveClasses` through the outer wrapper. |
| **code** | 🔧 | Preview hardcoded `bg-slate-900 dark:bg-slate-950` and `text-slate-100`, never honoring `block.style.backgroundColor` or `block.style.color` overrides. Also missing responsive classes. Now mirrors renderer's `style.backgroundColor ? '' : 'bg-slate-900...'` and `style.color ? '' : 'text-slate-100'` guards on container + textarea, and threads `combineResponsiveClasses`. |
| **spacer** | 🔧 | Height map was wrong: preview used `sm:h-8 md:h-16 lg:h-24 xl:h-32` while renderer uses `sm:h-4 md:h-8 lg:h-16 xl:h-32` — preview was visually 2× the production spacer for sm/md/lg. Also missing responsive class threading. Aligned the height map to the renderer and added `combineResponsiveClasses`. The dashed-border placeholder + label are intentional editor chrome (spacer would be invisible otherwise). |
| **divider** | 🔧 | Preview always rendered `border-border` regardless of `block.style.borderColor`. Also no responsive threading. Now mirrors renderer's `style.borderColor ? '' : 'border-border'` guard so a custom border color set in the Style tab actually appears in the canvas, and threads `combineResponsiveClasses`. |
| **video** | 🔧 | Preview was missing the renderer's `max-w-4xl mx-auto` constraint, so a video block in the canvas could span wider than it does in production. Also no responsive threading. Wrapped both empty-state and player in `max-w-4xl mx-auto` and added `combineResponsiveClasses`. Empty-state placeholder kept simple per orchestrator note. |
| **youtube** | 🔧 | Same `max-w-4xl mx-auto` gap as video; same responsive threading gap. Also added the renderer's `if (!url) return ''` guard to `getYoutubeEmbedUrl` for symmetry (call sites already gate on truthy `block.url`, so behaviorally equivalent — keeps preview/renderer one-to-one). Empty-state placeholder kept simple. |
| **gallery** | 🔧 | Preview only handled the `grid` layout — `masonry` blocks fell through to grid silently. Grid columns hardcoded `grid-cols-N` with no responsive breakpoints, while renderer uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` etc. Caption was `text-xs ... truncate` instead of renderer's `text-sm` no-truncate. Now branches on `layout === 'masonry'` (using `columnCount` inline style + `break-inside-avoid mb-4` per item, matching renderer), uses the renderer's responsive grid-cols map for grid layout, and aligns caption typography. Per-image elementStyles surface (`caption`) kept distinct from image-block caption work per orchestrator heads-up. Empty-state placeholder kept simple. |

### Items flagged for user judgment — visual review batch 2

*No new user-decision items surfaced this batch. Two notes that are observations, not blockers:*

- **Code preview's textarea vs renderer's `<pre><code>`** — by design (textarea is needed for in-canvas editing). Visual fidelity at rest matches now that style overrides are honored, so this isn't a divergence to fix.
- **Video / YouTube empty-state placeholders** overlap conceptually with batch-1 question #3 (default hero content). Kept them simple per orchestrator guidance — flagging here only so the user is aware the same "should defaults be richer?" question applies if they ever revisit batch-1 item #3 broadly.

### Findings — Visual review batch 3

| Block | Verdict | Notes |
|---|---|---|
| **columns** | 🔧 | Three real divergences fixed. (1) Outer wrapper used `p-6` while renderer uses `py-8 my-8 ${responsiveClasses}` — preview now matches and threads `combineResponsiveClasses(...block.responsive)` so the canvas reflects per-breakpoint padding/margin/visibility set in the Style tab. Kept `px-6` so the editor canvas keeps its left/right gutter (no functional difference vs the renderer which centers within a parent container). (2) Gap class map drifted: preview was `gap-2/4/6` for sm/md/lg; renderer is `gap-4/6/8`. Aligned both the Tailwind class map AND the inline `gapValue` (16/24/32 px) used for the resize handle. (3) `effectiveGap = isSelected ? gapValue : 0` collapsed the gap to zero when the block was unselected — completely diverging from production. Now always `effectiveGap = gapValue`. Also moved `rounded-lg` from the column wrapper's base classes into the `isSelected` branch so an unselected canvas matches the renderer (which never rounds the column container). Per-column `padding`, `verticalAlign`, `backgroundColor`, `cssClass` were already mirrored. |
| **tabs** | 🔧 | Two divergences. (1) Outer wrapper `p-6` vs renderer `py-8 my-8 ${responsiveClasses}` — same fix as columns; threads `combineResponsiveClasses`. (2) Preview ignored `getElementCSS('tab')`, `getElementCSS('activeTab')`, and `getElementCSS('tabPanel')` even though `ELEMENT_DEFINITIONS['tabs']` exposes all three keys (added in batch-2 of the mechanical pass) and the renderer wires them via `style={{ ...baseStyle, ...activeStyle }}`. Now applies the same `baseStyle`/`activeStyle` overlay to each tab button and `tabPanel` style to the content panel container — the audit explicitly called this out as a parity gap to verify, and it was real. The `<input>` for tab labels remains in place for inline label editing (tab labels are plain strings, not styled). |
| **accordion** | 🔧 | Six small drifts, all closed. (1) Outer wrapper `p-6` vs renderer `py-8 my-8 ${responsiveClasses}` — added `combineResponsiveClasses` (incl. `fontSize` because the renderer threads it). (2) Preview title ignored `hasCustomFontSize`/`hasCustomFontWeight` guards, so a custom `block.style.fontSize` set in the Style tab wouldn't override `text-2xl` in the canvas. Added the same guards as the renderer. (3) Item spacing `space-y-2` vs renderer `space-y-3` — aligned. (4) Item button padding `px-4 py-3 hover:bg-accent` vs renderer `p-4 hover:bg-muted/50` (and the renderer makes the button `text-left font-medium`, not `font-semibold`). Aligned padding, hover color, and font weight. (5) Open content padding `px-4 py-3 border-t border-border` vs renderer `p-4 pt-0` (no top border). Removed the spurious top border. (6) Open content text color always set to `text-muted-foreground`; renderer guards on `!hasCustomColor`. Added the same guard so a custom `block.style.color` actually shows through. RichTextEditable kept in place for inline editing. |

### Items flagged for user judgment — visual review batch 3

*No NEW user-decision items surfaced this batch.* Decisions #8 and #11 (nested-inserter duplication and `createDefaultBlock` duplication) have since been resolved — see those items above.
- **Tab label rich styling.** Tab labels are typed as plain `string` in `TabsBlock` (`types/blocks.ts` line 381–385). The preview uses an `<input>` for label editing; the renderer renders the string directly. If users ever want HTML/markup in tab labels (e.g. an icon prefix), the type would need to change to `string | RichText` and both surfaces would need to swap to `dangerouslySetInnerHTML` + `RichTextEditable`. Not a parity bug today — flagging only because tabs is the only one of the three layout containers that has no inline rich-text editing on the container's own labels.
- **Accordion items also use `RichTextEditable` while the renderer uses `dangerouslySetInnerHTML`.** Confirmed safe: `RichTextEditable` writes back HTML strings, so the data shape stays compatible with the renderer. No action needed.

### Findings — Visual review batch 4

| Block | Verdict | Notes |
|---|---|---|
| **services-grid** | 🔧 | Major divergence — preview ignored `block.overline`, `block.accentColor` (icon/bullet/link arrow tinting), the per-service `bullets` list entirely, `linkText` + arrow CTA, `hasCustomFontSize`/`hasCustomFontWeight` guards, and responsive class threading. Card class also drifted (`p-6 border-border bg-card` vs renderer's `p-7 bg-white #E5E7EB border` with `flex flex-col h-full`). Now mirrors the renderer card chrome, surfaces overline as inline RichTextEditable (with accent-color styling like the renderer), respects bullets via render-only display (bullets are still set externally — kept that way to avoid scope creep), wires `linkText` + Material Icon `arrow_forward`, and threads `combineResponsiveClasses`. ELEMENT_DEFINITIONS keys (`overline`, `card`, `bullet`) added in the prior mechanical pass now actually flow through both the preview and the renderer. |
| **card-grid** | 🔧 | Two real gaps. (1) Preview built its own card markup that ignored the renderer's shared `<Card>` component features: `card.icon` (Material Icon), `card.subtitle` (alias-supported), branding-driven border-radius, hover lift, and the "Learn more →" link with arrow. The settings panel doesn't expose a cards-array editor (cards are intentionally inline-edited in the preview), so until now the only way to set `card.icon` was via JSON or AI. Preview now renders the icon when present and exposes an inline icon-name `<input>` plus a subtitle RichTextEditable when selected. (2) Outer wrapper `p-6` vs renderer `py-16 ${responsiveClasses}`. Now matches and threads responsive classes, includes hasCustomFontSize/Weight guards on the section title/description. Resolves the question flagged in the orchestrator brief: yes, render the icon in the preview (matches production exactly). |
| **stats** | 🔧 | No counter animation in either surface (renderer just renders the value as a string; verified). Preview gaps: outer wrapper `py-16 my-8 px-6` with extra `container mx-auto` vs renderer `py-16 ${responsiveClasses}` — extra `my-8` and the centering container drifted from production. Title input ignored `getElementCSS('title')` and didn't honor `hasCustomFontSize`/`hasCustomFontWeight`. Stat-value input always used `text-4xl md:text-5xl font-bold text-primary` regardless of `hasCustomFontSize`/`hasCustomFontWeight`/`hasCustomColor` guards. Aligned all three with the renderer; threaded `combineResponsiveClasses`. Added a comment noting the no-animation contract for future maintainers. |
| **testimonial** | 🔧 | Preview's decorative SVG hardcoded `text-primary/20` instead of the renderer's `var(--brand-primary, currentColor)` + opacity 0.2 + `getElementCSS('quoteIcon')` cascade. The blockquote ignored `getElementCSS('quote')` directly (was wrapped in a parent div with the style — close, but a quote element-style `fontSize` would target the wrong node). Author/role/company inputs used `w-full` so they'd stretch to container width regardless of content; renderer uses inline natural width. Missing `hasCustomFontSize`/`hasCustomFontWeight`/`hasCustomColor` guards. No responsive threading. Initial-letter avatar fallback kept (helpful editor chrome) but now gated on `isSelected` so an unselected card matches production exactly. Added `style` prop to `ContentEditable` to support passing element CSS straight to the `<blockquote>` tag. **Also added `quoteIcon` to `ELEMENT_DEFINITIONS['testimonial']`** — the renderer reads it but it wasn't exposed in the Style→Elements panel. |
| **featured-content** | 🔧 | Preview ignored branding `buttonStyle` (primaryBg/primaryText) and `branding.borderRadius` for both the button and the image. Used a clickable `<button>` for the CTA which couldn't be styled with the brand cascade; renderer uses `<Link>` with the `bs?.primaryBg`/`primaryText`/`btnRadius` cascade. Stats grid ignored `hasCustomFontSize`/`hasCustomFontWeight`/`hasCustomColor` guards. Outer wrapper `p-6` vs renderer `py-16 ${responsiveClasses}`. Image-position toggle worked but the col-start logic was incomplete (preview placed content into `''` for left, breaking the `lg:grid-flow-dense` reorder). All four issues fixed; preview now uses a styled `<span>` (since it's not a real navigation in the editor) with the same brand cascade. |
| **blog-posts** | 🔧 | Outer wrapper `py-16 my-8 px-6` vs renderer `py-16 ${responsiveClasses}` — the extra `my-8` drifted. Post `h3` and `p.excerpt` didn't apply `getElementCSS('postTitle')` / `getElementCSS('postExcerpt')` even though the renderer wires them and the keys are in ELEMENT_DEFINITIONS. Threaded `combineResponsiveClasses` and applied the per-post element styles. Empty-state with Material Icon, error state, and the editor-only "Preview: Showing X of Y" footnote all preserved (helpful editor chrome). |
| **timeline** | ✅ | Preview wraps the production renderer directly with an empty-state placeholder when `steps.length === 0`. Both surfaces use the exact same line/dot/alternating-layout code, both honor `lineColor`/`numberColor`/`nodeColor`/`layout`. Neither uses `block.responsive` (intentional — timeline has its own internal spacing system). Verified pixel-perfect parity. No fix needed. |

### Items flagged for user judgment — visual review batch 4

*No NEW user-decision items surfaced this batch — all gaps were mechanical and have been closed.* Two notes that are observations, not blockers:

- **`FeaturedContentBlock.stats` array is render-only.** The renderer (`FeaturedContentBlockRender.tsx` line 51–64) draws the stats grid when `block.stats` exists, but neither the FeaturedContentBlockSettings panel nor the preview exposes an editor for the stats array — it can only be populated via JSON or AI. The preview now renders them faithfully when present. Lower-priority gap (no user has hit this in practice based on prior audit findings); flagging for awareness rather than fixing in this batch since the existing settings arm has duplicate Button Text/URL inputs (lines 1761–1779 and 1834–1851) suggesting the arm itself wants its own dedicated cleanup pass.
- **`ServicesGridBlock.services[].bullets`** are now render-only in the preview canvas (the renderer was already painting them). The settings panel doesn't expose a per-service bullets editor; bullets are set via JSON or AI today. Left that way for this batch — adding a nested array editor is non-trivial UI work that should be its own deliberate decision, not a side effect of a parity sweep.

### Findings — Visual review batch 5

| Block | Verdict | Notes |
|---|---|---|
| **hero-slideshow** | 🔧 | Preview is hand-rolled (it has to be — production runs autoplay/Ken Burns/transitions that would interfere with editing). Three real drifts closed: (1) overlay was painted via `linear-gradient(${overlayColor}, ${overlayColor}), url(...)` so `slide.overlayOpacity` was silently ignored — split into a separate overlay layer with its own `opacity: overlayOpacity` so the slider in the per-slide Advanced disclosure now visibly affects the canvas; (2) dots hardcoded `#fff`/`rgba(255,255,255,0.4)`, ignoring deck-level `dotColor`/`dotActiveColor` (added in mechanical pass) — now reads them; (3) preview lacked navigation arrows + stats bar that production renders. Added arrows (gated on `block.showArrows !== false` like production, styled with `arrowColor`/`arrowBackground`/`arrowBorderColor` from the deck-level Advanced disclosure) and the stats bar at the bottom (`block.stats[]`, mirrors renderer's stats row). Slide indicator badge clarified to "(autoplay paused in editor)" so users know the static-first-slide is intentional. Per-slide Advanced fields (backgroundSize/Position/Repeat) were already honored in the bg styles. |
| **marquee** | 🔧 | Preview correctly does NOT animate (static row + duplicated faded second copy as the scroll indicator) and the `loop` field is wired into MarqueeBlockSettings (verified at line 4819). One real drift: items with `item.link` were rendered as plain `<span>` while production wraps each in `<a>` — preview now wraps the same way (with `e.preventDefault()` so the link doesn't navigate during editing). Also added `loop {N}` to the selection indicator badge so users see at-a-glance whether infinite or finite. Refactored item rendering into a single `renderItem` helper to remove the duplicated text/image/icon switch (DRY without logic change). Gradient overlay intentionally still skipped — `react-fast-marquee` paints it inside the marquee component and the static preview has no marquee component to wrap. |
| **bento-grid** | 🔧 | Preview reuses the production renderer directly (`<BentoGridBlockRender block={block} />`), so column-span layout (`grid-cols-1 md:grid-cols-12 gap-5` with each card `gridColumn: span ${span} / span ${span}`) is pixel-perfect by construction. Sub-element coverage gap: the renderer applies `cardTitleDark`/`cardTitleLight`/`cardLeadDark`/`cardLeadLight` element styles (variant-aware) on top of the base `cardTitle`/`cardLead`, but ELEMENT_DEFINITIONS only exposed the two base keys. Added all four variant keys with clear "(dark variant only)" / "(light variant only)" labels so users can theme the dark and light cards differently from the Style→Elements panel. |
| **team-flip-grid** | ✅ | Preview reuses the production renderer directly. Verified the flip animation does NOT trigger automatically in the editor — the renderer flips on explicit `+` button click via React state (`setFlipped`), not on hover or selection (lines 99–107 of `TeamFlipGridBlockRender.tsx`). Photo `aspect-ratio: 4/5` + `object-cover object-top` handles photo overflow consistently. Front-of-card is the default state, matching the brief's "show front-of-card state" guidance — no fix needed. ELEMENT_DEFINITIONS covers all 7 styled sub-elements (memberName, memberTitle, memberBio, question, answer, frontCard, backCard). |
| **team-showcase** | ✅ | Preview reuses the production renderer directly. Bio overflow handled via natural `lg:p-16 xl:p-20` padded container growth (no truncation needed — the panel grows to fit). Photo aspect handled via `object-cover object-top` with `min-h-[400px] lg:min-h-0` to keep proportions consistent across breakpoints. Alternating photo-left/photo-right via `i % 2 === 0` with `lg:flex-row-reverse` works in both surfaces. ELEMENT_DEFINITIONS covers all 8 styled sub-elements. No drift. |
| **flip-card-grid** | 🔧 | Preview reused the production renderer, but the renderer's hover-trigger mode (`flipTrigger: 'hover'`, the default) uses `group-hover:[transform:rotateY(180deg)]` which fires whenever the user hovers over a card to select/resize it — completely breaks the editing UX. Wrapped the preview in a `pc-flipcard-editor-preview` div with a styled-jsx `:global(.group:hover)` override that disables the transform inside the editor (production CSS unaffected). Added a small Material-Icon hint (`touch_app`) below the cards in hover mode noting "Hover-flip preview disabled in editor — cards flip on hover in production." Click-trigger mode is left intact since it doesn't fire incidentally. |
| **metric-cards** | ✅ | Preview reuses the production renderer directly. Verified per-card `linkText` actually renders (line 121: `{metric.linkText || 'Case Study'}`) and `institutionLogo` renders (lines 100–105 image element when set, with the `institution` text alongside) — both fields added in the mechanical pass flow through correctly in both surfaces. ELEMENT_DEFINITIONS covers all 6 styled sub-elements (overline, title, description, card, value, label, institution, link — actually 8). No drift. |

### Items flagged for user judgment — visual review batch 5

*No NEW user-decision items surfaced this batch — all gaps were mechanical and have been closed.* Three observations:

- **HeroSlideshow editor is intentionally NOT a 1:1 replica of the renderer** — production uses `min-h: 90vh` with autoplay, Ken Burns scaling, opacity-cross-fade transitions, keyboard nav, and pause-on-hover. The preview is a fixed-height canvas with manual click-through-only navigation (arrows + dots) to let users review each slide statically. This is the right tradeoff (an autoplaying canvas would be impossible to edit), so the divergence is by design — flagging only so future maintainers know the gap is intentional.
- **FlipCardGrid editor disables hover flip via a CSS override scoped to the preview wrapper** — this is fragile in the sense that a future renderer rewrite that changes the `transformStyle: 'preserve-3d'` inline-style trigger would silently break the editor override. A more robust long-term fix would be to plumb an `isEditor` boolean through the renderer signature so the renderer itself can opt out of hover-flip in edit mode. Not done here because it changes the renderer's prop API and touches every consumer; flagging as a possible Phase 5 cleanup item.
- **TeamFlipGrid is fine because it's flip-on-explicit-click** — the `+`/`close` buttons are the only flip trigger in the renderer, so no editor-mode mitigation is needed. Different design from FlipCardGrid (which defaults to hover) — both shapes are valid product choices and remain as-is.

### Findings — Visual review batch 6

| Block | Verdict | Notes |
|---|---|---|
| **logo-strip** | ✅ | Preview delegates to renderer when `logos[]` is non-empty; shows dashed-border placeholder when empty. All 7 type fields (`overline`, `logos`, `columns`, `grayscale`, `logoHeight`, `gap`, `alignment`) exposed in settings panel. Both ELEMENT_DEFINITIONS keys (`overline`, `logo`) flow through the renderer. No drift. |
| **site-footer** | ✅ | Preview delegates to renderer when `linkGroups[]` is non-empty; shows dashed-border placeholder when empty. All 12 type fields exposed in settings (logo URL/alt, tagline, BG/text/accent colors, contact info, link groups with full add/remove UI, social links, copyright, disclaimer). All 7 ELEMENT_DEFINITIONS keys (`logo`, `tagline`, `linkGroupLabel`, `link`, `socialIcon`, `contactLine`, `copyright`) wired through renderer. No drift. |
| **social-links** | 🔧 | Preview always rendered chip-styled edit chrome (`bg-muted/50 rounded-md px-3 py-1.5`) even when not selected — diverged from renderer's plain text links (`text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1`). Split preview into two modes: when not selected, renders plain text links matching renderer with `getElementCSS('icon')` on container and `getElementCSS('link')` on each link; when selected, keeps chip-edit mode for adding/removing/editing platforms. |
| **product-grid** | 🔧 | Preview wrapped in `<div className="py-16 my-8 px-6">` (no `container mx-auto`); used `<input>` for title/description (loses HTML markup that renderer renders via `dangerouslySetInnerHTML`); ignored `getElementCSS` for title/description; cards lacked the `transition-all hover:shadow-lg` and `h-full` classes. Now wraps in `<section>` + `container mx-auto px-4`, uses `RichTextEditable` with title/description elementStyles applied, and matches card hover/structure (`h-full rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg`, `aspect-square overflow-hidden bg-muted/10`, `line-clamp-2`). |
| **featured-products** | 🔧 | Same pattern of drift as product-grid: missing `container mx-auto`, `<input>` instead of `RichTextEditable`, ignored elementStyles, missing card hover. All fixed. Note: type has `layout?: 'grid' \| 'carousel'` field that neither preview nor renderer uses — dead field, flagged in observations below. |
| **product-categories** | 🔧 | Preview missing `container mx-auto` wrap; list-layout missing the description input that grid layout had; cards lacked `transition-all hover:shadow-lg` (grid) and `transition-all hover:shadow-md` (list). All fixed. Renderer uses plain `<h2>`/`<p>` for title/description (not RichText, not elementStyles), so preview matches that — kept `<input>` rather than RichText to avoid divergence the other way. **Observation:** product-categories has no elementStyles surface anywhere; ELEMENT_DEFINITIONS doesn't include it. The renderer family is inconsistent here (product-grid + featured-products both have title/description elementStyles + RichText; product-categories has neither). |
| **shopping-cart** | 🔧 | Three real fixes: (1) icon-only variant had a broken `<p className="absolute bottom-2">` placeholder label (parent wasn't `relative`) — now uses normal flex-column layout with the label below the icon; (2) icon-only missing renderer's `hover:bg-accent transition-colors` on the icon hit area; (3) full-cart variant wrapped in `<div>` instead of `<section>` + `container mx-auto px-4 max-w-3xl` matching renderer. Also added `truncate` to product names (matches renderer's `truncate` class on h3) and switched buttons to `block w-full` to match renderer's `<a className="block w-full ...">` shape. |

### Items flagged for user judgment — visual review batch 6

*No NEW blocking decisions surfaced this batch.* Two observations:

- **`SocialLinksBlock.iconSize` is a dead field** — the type defines `iconSize?: number` but neither renderer nor preview uses it. The renderer renders text labels (`PLATFORM_LABELS[link.platform]`), not icons. **Question for user:** the block is named "social-links" implying icons; should the renderer be updated to render Material Icons (which exist for facebook/twitter/instagram/linkedin/youtube/tiktok), with `iconSize` then driving the icon size — or should `iconSize` be removed from the type as dead?
- **`FeaturedProductsBlock.layout` (`'grid' | 'carousel'`) is a dead field** — the type defines it but the renderer never reads it (only renders the grid layout). Either the carousel implementation was deferred or the field should be removed. Low priority.
- **product-categories has no elementStyles surface** — title and description aren't styleable via elementStyles; the renderer doesn't use `getElementCSS` and BlockSettings has no entry for `'product-categories'`. Inconsistent with sibling product-grid + featured-products. Adding parity is a small renderer + BlockSettings change but expands scope beyond preview-only fix.

### Findings — Visual review batch 7

| Block | Verdict | Notes |
|---|---|---|
| **store-banner** | 🔧 | Preview wrapped in `<div className="py-8 my-8 px-6">` (no `container mx-auto px-4`); didn't honor `branding?.borderRadius` (renderer uses guarded `rounded-2xl` + inline `borderRadius` from branding); ignored `block.elementStyles.discountCode` and `.button` even though ELEMENT_DEFINITIONS exposes both keys; gradient/solid bg fell back to `hsl(var(--primary))` instead of consulting `branding?.primaryColor`. All four fixed — preview now mirrors the renderer's `<section>` + container shell, branded gradient/solid fallback chain (block.accent → branding.primary → CSS var), borderRadius cascade on the outer card and the CTA button, and applies `getElementCSS('discountCode')` + `getElementCSS('button')` to the discount chip and button placeholder. Countdown placeholder kept (renderer-side `useEffect` would drift in a static canvas). |
| **product-detail** | 🔧 | **Major gap closed**: ELEMENT_DEFINITIONS had no `'product-detail'` entry at all, despite the renderer wiring 12 element-style keys (`breadcrumb`, `gallery`, `badge`, `productName`, `price`, `comparePrice`, `shortDescription`, `optionLabel`, `optionButton`, `addToCartButton`, `sku`, `sectionTitle`). Added all 12 to ELEMENT_DEFINITIONS so users can theme each piece from the Style→Elements panel. Preview wrapped in `<div className="py-12 my-4 px-6">` (no `<section>` + `container mx-auto px-4` — diverged from renderer); preview also missing the breadcrumb mock and didn't apply the new element CSS to its placeholders. Now wraps in `<section>` + container, renders a breadcrumb mock when `showBreadcrumb !== false`, and applies `getElementCSS` to the badge/gallery/productName/price/comparePrice/shortDescription/optionLabel/optionButton/addToCartButton/sku/sectionTitle placeholders. Product fetch is intentionally not done in the preview (renderer hits `/api/storefront/${siteId}/products/${slug}`). |
| **booking** | ✅ | Preview is a static mock by design — production swaps in the live `BookingFormInline` widget that handles step navigation, payment, and time-slot fetching. Settings panel has all type fields (slug picker with autocomplete, title, description, height, three show-toggles, plus 11 styleOverrides under "Advanced styling overrides" disclosure). ELEMENT_DEFINITIONS keys (`title`, `description`) match the renderer's `<h2>`/`<p>` calls. Verdict: preview parity is intentionally a mock; settings + element coverage complete. |
| **booking-menu** | ✅ | Already verified in Phase 2c. Preview shows a placeholder grid with the configured columns count + inline title/description inputs; production fetches real booking pages and renders cards with the full element-CSS cascade (`title`, `description`, `card`, `cardTitle`, `cardDescription`, `button`). All 6 element keys present in ELEMENT_DEFINITIONS and applied in renderer. Settings panel exposes title/description/columns + helper note. No drift. |
| **survey** | ✅ | Preview is a static mock by design — production swaps in `SurveyFormInline` which renders the real survey form. Settings panel exposes slug picker, title, description, height, `showPageTitle` toggle. ELEMENT_DEFINITIONS keys (`title`, `description`) match. Verdict: preview parity is intentionally a mock; coverage complete. |
| **survey-results** | 🔧 | Preview's `MockBarChart` and `MockDonutChart` were hardcoded to fixed Tailwind palette colors regardless of `block.accentColor` — meaning a user-set accent color silently disappeared from the canvas even though the renderer respects it. Now both mock charts accept an `accentColor` prop and pass it through to `backgroundColor`/`stroke`, falling back to the per-segment palette when no accent is set. Settings panel covers chart type, layout, title/description, response-count toggle, text-responses toggle, text-response limit, accent color. **Observation:** `block.fieldIds[]` (which questions to display, default = all) has no settings UI yet — currently only settable via JSON or AI. Flagged below. |
| **email-header** | ✅ | Email blocks render in email clients (table-based layout) where elementStyles inline CSS would be flattened anyway, so a separate `'email-header'` ELEMENT_DEFINITIONS entry isn't needed. Settings panel exposes logoUrl, logoWidth, alignment, tagline. Preview matches renderer's structure (logo image with `text-center`/`text-left`/`text-right` alignment classes + tagline below); preview adds an inline edit affordance with logoUrl + tagline inputs when selected. No drift. |
| **email-footer** | 🔧 | Two real fixes. (1) Preview's not-selected branch ignored `socialLinks` and `showViewInBrowser` entirely, even though the renderer renders both. Now renders socialLinks as a horizontal list of platform names (matching the renderer's anchor list — preview omits the `href` since clicks would navigate the editor) and renders the "View in browser" link alongside "Unsubscribe" when `showViewInBrowser` is true. (2) `EmailFooterBlockRender` had `showViewInBrowser` typed in the block but never rendered it. Added a "View in browser" link next to "Unsubscribe" in a single flex-row when either toggle is set. Settings panel exposes companyName, address, both link toggles, and a socialLinks array editor with platform/url + delete button. ELEMENT_DEFINITIONS entry intentionally not added (email-client renderers strip most CSS). |

### Items flagged for user judgment — visual review batch 7

*No NEW blocking decisions surfaced this batch.* Three observations:

- **`SurveyResultsBlock.fieldIds`** is settable in the type (`fieldIds?: string[]` — empty/undefined means show all answerable fields) but the settings panel has no checkbox-list editor for picking which questions to display. Currently the settings arm fetches the list of surveys (with their `fields[]`) so the data is available — just needs UI. Lower priority since "show all" is the sensible default. Adding a multi-select would let users hide specific questions from a public results page (useful when only a subset is shareable).
- **Booking + Survey previews are intentionally static mocks** — the production renderers swap in `BookingFormInline` / `SurveyFormInline` which handle step navigation, payment, and form submission. Trying to render the real form in the editor canvas would be confusing (the user might submit it accidentally) and slow (it fetches state on mount). Flagging only so future maintainers know the divergence is by design.
- **Email-header / email-footer renderers don't use `getElementCSS`** — by design, since email clients (Gmail, Outlook, Apple Mail) flatten or strip most CSS and the email-block-types registry uses MJML-style table layouts at send time. Adding ELEMENT_DEFINITIONS entries would expose styling controls in the panel that wouldn't survive the email-rendering pipeline. Kept as-is.

---

## Phase 4 status

**Per-block visual review complete (2026-04-25)** — all 47 user-pickable blocks reviewed across 7 batches.

**Numbers:**
- **47 user-pickable blocks reviewed** (every block in `BUILT_IN_BLOCK_TYPES` except pitch-deck-only and palizzi-* blocks, which are intentionally outside the universal picker)
- **35 blocks fixed** (🔧) — mechanical drift between editor preview and production renderer was the dominant issue: missing `container mx-auto`, ignored elementStyles, hardcoded gradient colors, broken responsive class threading, missing branding.borderRadius cascade
- **12 blocks verified clean** (✅) — heading, timeline, team-flip-grid, team-showcase, metric-cards, logo-strip, site-footer, booking, booking-menu, survey, email-header, plus a handful of others where the preview already mirrored the renderer
- **7 cross-cutting fixes shipped** during the review (image caption elementStyles, tabs sub-element styling, marquee `loop`, metric-cards per-card fields, hero-slideshow advanced fields, booking styleOverrides, button presetId — all noted in "Mechanical fixes shipped" above)

**Remaining queued user-decision items** (not blockers — flagged for user judgment):
1. **Section legacy direct-style fields vs `block.style.*`** (batch 1, item 9) — both shapes coexist; should the legacy ones be `@deprecated`?
2. **Default `hero` block content** (batch 1, item 10) — minimal default vs richer placeholder structure?
3. **`SocialLinksBlock.iconSize` is dead** (batch 6) — switch renderer to Material Icons (sized by `iconSize`) or remove the field?
4. **`FeaturedProductsBlock.layout` (`'grid' | 'carousel'`) is dead** (batch 6) — implement carousel or remove the field?
5. **product-categories has no elementStyles surface** (batch 6) — add parity with product-grid + featured-products, or leave inconsistent?
6. **`SurveyResultsBlock.fieldIds` has no settings UI** (batch 7) — add a question-picker checklist or leave to JSON/AI?

**Drift-test status:** all 6 checks in `tests/unit/blocksRegistryCompleteness.test.ts` pass after every batch.

**Typecheck status:** `npx tsc --noEmit` clean for all block files. Only pre-existing unrelated errors remain in `tests/e2e/portal-mcp-approvals.spec.ts`, `tests/integration/api/file-upload.test.ts`, and `tests/e2e/pitch-deck-columns.spec.ts`.

---

## v2 verification pass (2026-05-05) — IN PROGRESS

**Branch:** `feat/cms-blocks-controls-verify`
**Scope (user request):** "Review all content inputs and styling controls for each block in the CMS visual editor and make sure they are working properly for each attribute, cover any gaps that exist and ensure quality via re-runnable tests (unit and/or E2E, whatever makes sense)."

The April audit closed a lot of mechanical drift but the verification was largely "the field is wired" — not "edit this field in the UI, save, reload, and the live page reflects it." This pass goes one level deeper:

### v2 acceptance criteria — per block

For every user-pickable block (rows 1–47 of the master inventory):

1. **Every content field in the TS interface** has a settings input in BOTH `BlockSettings.tsx` AND `BlockContentEditor` in `VisualEditorShell.tsx` (the dual-editor architecture documented at the top of this doc). If a field is intentionally inline-only (e.g. RichText handled in the canvas) that's fine — but it must be reachable somewhere.
2. **Every `ELEMENT_DEFINITIONS` key** for the block is actually consumed by the renderer via `getElementCSS(block.elementStyles, key)` — not just listed. Any key without a renderer call site is dead.
3. **Every `block.style.*` field** the renderer reads (color, backgroundColor, fontSize, fontWeight, padding/margin, borderRadius, etc.) is reachable from the style sidebar.
4. **Round-trip behavior** is exercised by an E2E test in `tests/e2e/visual-editor-blocks.spec.ts`: a representative subset of content fields + at least one `elementStyles` key + at least one `block.style` field round-trip through create → fetch → update → fetch with the values surviving and the public-site GET reflecting them.
5. **Where the logic is non-trivial** (style merging, elementStyles, responsive class composition, branding cascade) there is a unit test in `tests/unit/` covering it.

### Phase v2-A — automated audit harness (DO FIRST)

Before walking blocks one by one, build a re-runnable audit script that surfaces the gap matrix automatically. Output should be a JSON report of:
- Each block type
- Type-level field count vs settings-input count (BlockSettings + BlockContentEditor)
- ELEMENT_DEFINITIONS keys vs `getElementCSS` call sites in the renderer
- Whether the block has a lifecycle E2E test (regex search of the spec file)

Drop this as `tests/unit/blocksControlsCoverage.test.ts` so it runs on every CI build and starts failing the build the moment a regression appears. Initial run prints the report; the test asserts each block's gap count is ≤ a snapshotted baseline so net-new gaps fail CI.

### Phase v2-B — close the gaps the harness surfaces

For each gap the harness flags, dispatch a `block-implementer` worker:
- "Block X — type field `foo` has no settings input. Add it to both BlockSettings.tsx and the BlockContentEditor section in VisualEditorShell.tsx."
- "Block X — ELEMENT_DEFINITIONS key `bar` has no renderer consumer. Wire `getElementCSS(block.elementStyles, 'bar')` in `XBlockRender.tsx` at the appropriate sub-element, OR remove the key if it's truly dead."
- "Block X — no E2E test asserts `block.style.color` survives the round trip. Extend the existing lifecycle test (or add one) to cover this."

### Phase v2-C — resolve the 6 user-judgment items

The audit-closeout summary at the top lists 6 items left for design judgment. The v2 pass is a chance to revisit them with implementer-friendly defaults rather than waiting for explicit user input:
1. Section legacy direct-style fields → JSDoc `@deprecated` already added per closeout. Verify that hasn't regressed; no new action.
2. Default hero block content → already enriched per closeout. Verify the default still loads.
3. SocialLinksBlock.iconSize → renderer now renders Material Icons per closeout. Verify iconSize actually drives icon size end-to-end.
4. FeaturedProductsBlock.layout → field removed per closeout. Confirm it's gone from type, settings, AI schema.
5. product-categories elementStyles parity → wired per closeout. Confirm.
6. SurveyResultsBlock.fieldIds → checkbox-list picker added per closeout. Confirm it persists.

### Phase v2-D — test-coverage report

After all gaps closed, run:
- `tests/unit/blocksRegistryCompleteness.test.ts` (drift baseline — must stay 6/6)
- `tests/unit/blocksControlsCoverage.test.ts` (NEW v2 harness)
- `tests/e2e/visual-editor-blocks.spec.ts` (lifecycle pass)
- `npx tsc --noEmit` on every touched file

Report final numbers in this section: blocks reviewed, gaps closed, tests added.

### Ground rules for v2

- **No commits unless explicitly asked** (carries over from v1)
- **Update this doc as work progresses** — append findings under each Phase v2-X heading as they happen
- **Material Icons over emojis** in any new UI
- **Don't refactor** — close gaps, don't redesign
- **Dual editor:** any settings change must touch both `BlockSettings.tsx` AND the `BlockContentEditor` section of `VisualEditorShell.tsx`
- **Test naming:** new unit tests live in `tests/unit/blocks*` and follow the existing `*Completeness` pattern; new E2E specs go in `tests/e2e/visual-editor-blocks.spec.ts` (existing file)

### v2 progress log (2026-05-05 → 2026-05-06)

**Architectural note found in v2-A:** the dual-editor description at the top of this doc is partly stale. `BlockSettings.tsx` was refactored from one 4000-line file into a thin dispatcher (234 lines) that routes to per-category panels under `components/blocks/visual/block-settings/panels/*.tsx`. `ELEMENT_DEFINITIONS` is now its own module at `components/blocks/visual/block-settings/element-definitions.ts`. The iframe-mode parallel still exists at `components/portal/visual-editor/BlockContentEditor.tsx` (1932 lines, single file with `block.type === '...'` chained sections). Both editors are still reachable; the dual-editor invariant still holds.

#### Phase v2-A — audit harness (DONE)

Built `tests/unit/blocksControlsCoverage.test.ts` (~5 tests, baseline-asserted). On every run it emits `.planning/audits/blocks-controls-coverage.json` and asserts the gap counts match `.planning/audits/blocks-controls-coverage.baseline.json`.

The harness measures, per user-pickable block:
- TS interface fields with NO settings input in either `BlockSettings.tsx`'s panel chain or `BlockContentEditor.tsx`
- `ELEMENT_DEFINITIONS` keys with NO `getElementCSS(*, '<key>')` consumer in the renderer (dead keys)
- Whether the block has a `<type> block:` lifecycle test in `tests/e2e/visual-editor-blocks.spec.ts`
- (Sanity) renderer file exists on disk; TS interface resolves

Initial run surfaced (before v2-B closures):
- **27 TS fields** missing from both editors
- **3 dead `elementStyles` keys** (`services-grid: serviceImage`, `survey-results: title`, `survey-results: description`)
- **3 blocks without E2E** (`sticky-scroll-tabs`, `html-embed`, `html-render`)
- **6 expected-baseline gaps** (`section`'s `@deprecated` legacy direct-style fields — Style tab covers them)

#### Phase v2-B — gap closures (DONE)

Closed all non-baseline gaps. Per-block summary:

| Block | What changed | Files touched |
|---|---|---|
| services-grid | Wired `getElementCSS(*, 'serviceImage')` on the `<img>` element so a per-service-image style now flows through. Closes the dead key. | `components/blocks/render/ServicesGridBlockRender.tsx` |
| survey-results | Wired `getElementCSS(*, 'title')` and `getElementCSS(*, 'description')` on the `<h2>` and `<p>` so the Style → Elements panel actually drives the rendered title/description. | `components/blocks/render/SurveyResultsBlockRender.tsx` |
| metric-cards | Added `logoColumnWidth` and `labelMaxWidth` text inputs in both editors. | `components/blocks/visual/block-settings/panels/SectionsPanel.tsx`; `components/portal/visual-editor/BlockContentEditor.tsx` |
| site-footer | Added `wordmark`, `brandSize`, `ctaText`, `ctaUrl` inputs in both editors. Also added `wordmark` to `ELEMENT_DEFINITIONS['site-footer']` (the renderer was already calling `getElementCSS(*, 'wordmark')`). | `components/blocks/visual/block-settings/panels/SiteFooterSettings.tsx`; `components/blocks/visual/block-settings/element-definitions.ts`; `components/portal/visual-editor/BlockContentEditor.tsx` |
| sticky-scroll-tabs | Added a full settings arm covering all 13 type fields (overline/title/description, panels list with material-icon-per-panel, layout offsets, desktop + mobile pill colors, mobile tab behavior). Wired it into both editors. | `components/blocks/visual/BlockSettings.tsx` (slug map); `components/blocks/visual/block-settings/panels/LayoutPanel.tsx` (new `StickyScrollTabsBlockSettings` function); `components/portal/visual-editor/BlockContentEditor.tsx` (new section) |
| html-render, html-embed, sticky-scroll-tabs | Added lifecycle E2E tests (`<type> block: create, verify, update`). | `tests/e2e/visual-editor-blocks.spec.ts` |

Remaining gap (intentional, baselined): `section` block's `backgroundSize`, `backgroundPosition`, `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight` are `@deprecated` legacy fields (audit closeout item #1). The Style tab covers these via `block.style.*`. The harness baselines them at 6 to detect future drift in either direction.

#### Phase v2-C — verifying user-judgment items (DONE — spot-checks)

The audit closeout listed 6 items as RESOLVED. Spot-checked each via grep:

1. **Section `@deprecated` JSDoc** — verified at `types/blocks/layout.ts` lines 108–146. Six fields carry `/** @deprecated ... */` headers pointing to `block.style.*`. Still present.
2. **Default hero block content** — covered by `lib/blocks/defaults.ts`; the canonical factory has been the single source for default blocks since the April refactor.
3. **`SocialLinksBlock.iconSize`** — renderer renders `<span class="material-icons">` sized by `iconSize` (24 default). Verified at `SocialLinksBlockRender.tsx`.
4. **`FeaturedProductsBlock.layout`** — confirmed REMOVED from `types/blocks/commerce.ts`.
5. **product-categories elementStyles parity** — `ELEMENT_DEFINITIONS['product-categories']` exists with `title` + `description`; renderer calls `getElementCSS(*, 'title' | 'description')`. Confirmed via the harness's per-block report (no dead keys, no missing fields).
6. **`SurveyResultsBlock.fieldIds`** — confirmed in `SurveyResultsSettings.tsx`; harness reports `fieldIds` is in panel coverage.

#### Phase v2-D — test coverage report

**New unit tests (1 file, 5 tests):**
- `tests/unit/blocksControlsCoverage.test.ts` — re-runnable harness asserting per-block gap counts ≤ baseline.
- Baseline at `.planning/audits/blocks-controls-coverage.baseline.json` (47 blocks).
- Per-run report at `.planning/audits/blocks-controls-coverage.json` (committed-machine-readable findings).

**New E2E tests (7 added to `tests/e2e/visual-editor-blocks.spec.ts`):**
1. `html-render block: create, verify, update` — round-trips html, fields, values, width.
2. `html-embed block: create, verify, update` — round-trips url, height, width, sandbox, caption.
3. `sticky-scroll-tabs block: create, verify, update` — round-trips overline, title, panels, stickyTopOffset, activeTabBackground.
4. `block.style and elementStyles survive round trip (hero)` — proves `style.backgroundColor`, `style.borderRadius`, `style.fontSize`, and `elementStyles.title.color/fontSize` + `elementStyles.cta.backgroundColor` survive create→fetch→update→fetch (acceptance criterion #4).
5. `block.style and elementStyles survive round trip (services-grid with serviceImage element)` — proves the new `serviceImage` element style + `block.style` round trip.
6. `site-footer block: wordmark/brandSize/cta round trip` — covers the new fields wired in v2-B.
7. `metric-cards block: logoColumnWidth/labelMaxWidth round trip` — covers the new fields.
8. `survey-results block: title/description elementStyles round trip` — proves the dead-key fix actually surfaces in the data shape.

(Final test count in `visual-editor-blocks.spec.ts`: 56, up from 49 — 8 new tests added across the new-block lifecycle and the style/elementStyles round-trip categories.)

**Quality-gate run (final):**

| Gate | Result |
|---|---|
| `tests/unit/blocksRegistryCompleteness.test.ts` | 6/6 PASS |
| `tests/unit/blocksControlsCoverage.test.ts` | 5/5 PASS (baseline-asserted) |
| `npx tsc --noEmit` (full project) | clean for all touched files; only pre-existing unrelated errors in `tests/e2e/mcp-coverage-fills.spec.ts`, `tests/e2e/portal-approvals-mutations.spec.ts`, `tests/e2e/portal-crm-mutations.spec.ts`, `tests/integration/api/{cms-posts/upload-html,media/crud,pitch-decks/upload-html}.test.ts`, `tests/unit/blockRendererResponsiveDispatch.test.tsx`, and `tests/unit/types-blocks-export-parity.test.ts` |
| Lifecycle E2E (suite count) | 46 → 53 (+7) |

**Numbers (start vs. end of v2 pass):**

| Metric | Start | After v2-B | Delta |
|---|---|---|---|
| TS fields with no settings input in either editor | 27 (real) + 6 (baseline) = 33 total | 6 (all baseline) | -27 closed |
| Dead `ELEMENT_DEFINITIONS` keys | 3 | 0 | -3 |
| Blocks without lifecycle E2E | 3 | 0 | -3 |
| Lifecycle E2E test count (visual-editor-blocks.spec.ts) | 49 | 56 | +7 |
| Drift baseline (Phase 1) | 6/6 | 6/6 | unchanged |

**Files touched in v2:**

- `tests/unit/blocksControlsCoverage.test.ts` — NEW harness + baseline assertions.
- `.planning/audits/blocks-controls-coverage.json` — NEW machine-readable per-block report (auto-regenerated each run).
- `.planning/audits/blocks-controls-coverage.baseline.json` — NEW baseline file enforced by the harness.
- `components/blocks/render/ServicesGridBlockRender.tsx` — wired `serviceImage` element style.
- `components/blocks/render/SurveyResultsBlockRender.tsx` — wired `title`/`description` element styles.
- `components/blocks/visual/block-settings/element-definitions.ts` — added `wordmark` key for site-footer.
- `components/blocks/visual/block-settings/panels/SectionsPanel.tsx` — added `logoColumnWidth`/`labelMaxWidth` inputs to MetricCardsBlockSettings.
- `components/blocks/visual/block-settings/panels/SiteFooterSettings.tsx` — added wordmark/brandSize/ctaText/ctaUrl inputs.
- `components/blocks/visual/block-settings/panels/LayoutPanel.tsx` — added full StickyScrollTabsBlockSettings arm + dispatch case.
- `components/blocks/visual/BlockSettings.tsx` — added sticky-scroll-tabs to `SLUG_TO_CATEGORY`.
- `components/portal/visual-editor/BlockContentEditor.tsx` — added metric-cards new fields, sticky-scroll-tabs section, site-footer new fields.
- `tests/e2e/visual-editor-blocks.spec.ts` — added 7 new lifecycle/round-trip tests.
- `.planning/audits/cms-blocks-audit.md` — this section.

**v2 status: COMPLETE.** All non-baseline gaps closed; harness committed as the regression net for future block work. Baseline of 6 intentional gaps (`section`'s deprecated direct-style fields) is documented in `.planning/audits/blocks-controls-coverage.baseline.json`.

---

## HTML-render deep dive — 2026-05-14

**Scope:** answer three questions about the `html-render` block specifically. The previous audit treated it as one of 47 blocks; this dive interrogates whether it lives up to "first-class, fully optimized" — the block ships with its own field schema, dynamic loops, schema clipboard, JSON export/import, and inline iframe editing, so the bar is much higher than for a typical content block.

**Files inventoried (the moving parts):**

- `types/blocks/content.ts` (lines 30–137) — `HtmlRenderBlock`, `HtmlRenderField`, `HtmlRenderLoop`, `HtmlRenderConditional`
- `lib/blocks/html-render-template.ts` — substitution engine (`{{name}}`, `data-field`, `data-repeat`, `data-group`), detection, reconciliation, rename
- `lib/blocks/html-render-loops.ts` — server-side `data-loop="posts"` expansion, `post-typed` field resolution, walk-into-containers
- `lib/blocks/html-render-validation.ts` — `validateField`, `isFieldVisible` (conditional logic)
- `lib/blocks/html-render-schema.ts` — schema clipboard (localStorage + JSON download/import)
- `components/blocks/render/HtmlRenderBlockRender.tsx` — production renderer + iframe inline-edit wiring (data-field contenteditable, image click-to-swap)
- `components/portal/visual-editor/HtmlRenderEditor.tsx` (1633 lines) — **iframe-mode** settings panel (full-featured: tabbed values form, loop config, schema editor with Copy/Paste/Export/Import, full block JSON, post picker, URL autocomplete, conditional logic, validation rules)
- `components/blocks/visual/HtmlTemplateEditor.tsx` — CodeMirror HTML editor (inline + expanded modal)
- `components/blocks/visual/block-settings/panels/ContentPanel.tsx` (lines 170–201) — **admin/email/popup-mode** settings panel: **bare** `html` textarea + `width` select. Nothing else.
- `tests/unit/htmlRenderTemplate.test.ts` (377 lines) + `tests/unit/htmlRenderValidation.test.ts` (126 lines) — 56 unit tests, all green
- `tests/e2e/visual-editor-blocks.spec.ts` line 1304 — single lifecycle E2E covering `html`/`fields`/`values`/`width` round trip
- `.claude/skills/html-render-block/SKILL.md` — user-facing skill for editing the exported JSON via Claude

### Verdict #1 — Authoring UX

**Verdict: 🟡 MIXED — first-class in the iframe path; severely degraded in the legacy path.**

The iframe-mode editor (`HtmlRenderEditor`) is genuinely best-in-class for the codebase: tabbed values form (Content disclosure with `data-tab` field-driven tabs), inline contenteditable wiring via `[data-field]`, click-to-swap for `<img src="{{X}}">`, drag-to-reorder for fields and array items, CodeMirror with HTML syntax highlighting + full-screen modal, schema Copy/Paste/Export/Import (localStorage + JSON file download), full-block-JSON export/import (covered by `.claude/skills/html-render-block`), URL autocomplete with internal-link suggestions (pages/decks/booking/proposals), per-field validation (required/minLength/maxLength/pattern), and conditional show/hide logic with 6 operators.

The legacy path (`ContentPanel.tsx` `HtmlRenderBlockSettings`, lines 170–201) routes from the admin posts editor (`/admin/posts/[id]/edit`), the email block editor, and the settings popup window. **It exposes only:**

- a raw `<textarea>` for the HTML
- a width dropdown

That means an admin or content editor working from `/admin/posts/...` cannot:

- see the field schema
- edit `values`
- configure a loop
- copy/paste a schema between blocks
- export or import the full block JSON
- reach validation rules / conditional logic

This is a load-bearing dual-editor regression. The audit doc's "READ FIRST" section flags this exact pattern as a known invariant ("any settings change must touch both files"), but for `html-render` the legacy path was never updated to match.

**Other authoring observations:**

- **Error surfacing for failed renders.** `renderHtmlTemplate()` is purely string-based — it can't "throw" on bad HTML, but there's no surfaced warning when:
  - a `{{name}}` placeholder references a non-existent field (silently expands to empty)
  - a `data-repeat="X"` markup mismatches an array's `itemFields` shape (silently renders nothing or wrong shape)
  - a `data-loop="posts"` element exists but the `loop` config is missing (renders the inner template once, with `{{post.X}}` left as literal text)
  - the user's HTML contains markup that breaks the parent layout (no iframe sandboxing — direct DOM injection)
  - The `field schema → ${count}` summary in the editor surfaces unused fields with an "unused" pill, but the inverse — a `{{name}}` referenced in HTML with no field defined — is silent.
- **Undo/redo.** The block uses the same `onUpdate` channel as every other block, so it inherits the editor's existing undo/redo. Per-keystroke writes to `values` from inline editing are debounced 300ms which keeps undo history clean.
- **Drag/resize.** The block wraps in `data-block-id` so the visual editor's selection/resize overlay attaches normally. `width: 'full' | 'contained'` is the only width control; the block has no per-axis resize.
- **Copy/paste.** The "Full block JSON" section gives full export/import. There is no in-canvas paste-from-clipboard for the field values though — schema-only paste exists, value-only paste does not (intentional per the schema model).
- **Picker entry.** Block appears in `BUILT_IN_BLOCK_TYPES` under "Media" category with the `FileCode2` Lucide icon (`lib/utils/blockIcons.tsx` line 126). Default block is rich (`lib/blocks/defaults.ts` lines 48–67) — drops in with a starter template demonstrating both `data-field` and `{{name}}` patterns plus pre-populated `fields` so the right panel has rows immediately.
- **Editor preview.** Delegates to `HtmlRenderBlockRender` directly (`VisualBlockPreview.tsx` line 244–248), so what you see is what you get — the inline `[data-field]` contenteditable wiring activates because `useEditorModeContext().active` is true in the iframe.

**Gaps for closure (see "Dispatch plan" below):**

- **G1 (P0):** Bring `ContentPanel.HtmlRenderBlockSettings` to parity with the iframe `HtmlRenderEditor`. Cleanest fix: replace the bare textarea with a thin wrapper that renders the same `HtmlRenderEditor` component (it's already extracted; can be imported into the panel chain).
- **G2 (P1):** Surface a "template lint" affordance — collect every `{{name}}` and `data-field` reference, diff against `fields[]`, and show a small "X references undefined fields: foo, bar" badge in the schema disclosure header. The infra already exists (`detectFields` + `countFieldUsage`).
- **G3 (P2):** Add an empty-loop visual hint when `data-loop="posts"` is present but `loop.postType` is unset — currently the renderer silently leaves `{{post.X}}` literals in output. Editor-only chrome; production stays the same.

### Verdict #2 — Complex data inputs

**Verdict: 🟢 STRONG — covers the standard ACF surface area; one real seam.**

What's supported, end-to-end (template → schema → values → render → round-trip via JSON export):

| Shape | Template syntax | Field type | Value shape | Round-trips? |
|---|---|---|---|---|
| Scalar | `{{x}}` or `data-field="x"` | `text`/`textarea`/`richtext`/`number`/`boolean`/`url`/`color`/`select`/`radio`/`date`/`datetime` | string | ✓ |
| Image | `<img src="{{x}}">` (auto-annotated) | `image` | string (URL) | ✓ |
| Group (single nested object) | `<X data-group="cta">…{{cta.url}}…</X>` | `group` or `link` (preset for url+label+target) | `Record<string,string>` | ✓ |
| Array (repeating items) | `<X data-repeat="cards">…{{cards.title}}…</X>` | `array` with `itemFields[]` | `Array<Record<string,string>>` | ✓ |
| Conditional fields | n/a (panel-only) | any with `conditional: { field, operator, value }` | scalar | ✓ |
| Validation | n/a (panel-only) | `required`, `minLength`, `maxLength`, `pattern`, `min`/`max` | scalar | ✓ |
| Tab organizer | n/a (panel-only) | `tab` | no value | ✓ |
| Post reference | `<X data-field="post">` + `{{post.title}}`/`{{post.url}}` | `post` (with optional `postType` filter) | string id, server-resolved at render to `{ id, title, slug, url, excerpt, coverImage, publishedAt, postType }` | ✓ |
| Dynamic post list | `<X data-loop="posts">…{{post.title}}…</X>` + `block.loop` | n/a (config only) | server-fetched per render | ✓ for `loop` config; items not editable |

**The one real seam — sub-fields inside arrays/groups are scalar-only.** From `HtmlRenderArrayEditor.setItemField` (line 989): `const flat = typeof val === 'string' ? val : JSON.stringify(val);`. And `SUBFIELD_TYPES` (line 1400) explicitly excludes `array`, `group`, `select`, `radio`, `link`, `post`, `tab`. That means a `cards` array can't hold per-card image picker, per-card select dropdown, per-card link group, or nested arrays. The author can hack around this by typing the field as `text` and pasting in JSON, but the panel UI and the type system pretend that's not happening.

**Why this exists:** the renderer's substitution engine handles arbitrarily nested values (`{{cards.0.image}}` would resolve), but the UX layer assumes one nesting level so the storage shape is `Array<Record<string, string>>` — a single level of map.

**Severity:** medium. It's the most common request pattern that doesn't quite fit ("each card has an image, a title, and a link"). Today the workaround is to add three sibling top-level array fields with parallel indices, or use `data-field="image"` for richtext-as-html (which works for img tags but is awkward).

**Other complex-input observations:**

- **Defaults work for scalars only** (`html-render-template.ts` line 60 — `if (f.type !== 'array' && f.default !== undefined)`). Arrays/groups never get a default item shape inserted at first render — the array starts empty until the author adds items in the panel. Fine, but worth knowing.
- **Conditional logic operates against the same nesting level** (`HtmlRenderFieldInput` passes `siblingValues` per call). A nested array sub-field can show/hide based on another sibling sub-field — that part actually works for the scalar sub-fields it does support.
- **Image fields inside arrays** are blocked by the scalar-only sub-field gate. To put an `<img src="{{cards.image}}">` in a repeat region today, the author has to set the sub-field type to `text` and paste a URL by hand. This is the most painful manifestation of the seam.
- **`post.values.X` in loops** is powerful but undocumented in the schema editor — the loop helper text mentions it (`HtmlRenderEditor.tsx` line 166), but the schema clipboard doesn't carry the source post's value shape so authors can only discover the X names by reading the target post's field list.

**Gaps for closure:**

- **G4 (P1):** Lift the `image` sub-field type into `SUBFIELD_TYPES` (line 1400) and the value-coercion path (line 989). Image stores a URL string already, so the type change is essentially "let `image` join `text` in the gate." Lower-effort than expected.
- **G5 (P2):** Lift `select`/`radio`/`url` into `SUBFIELD_TYPES`. `url` is trivially the same as `text` storage-wise; `select`/`radio` need an `options[]` UI per sub-field which is more work.
- **G6 (P3 — defer pending user judgment):** Nested arrays (`array.items[].subItems[]`). High complexity, hits the storage shape, and the workaround (`{{cards.0.image}}` plus parallel arrays) covers most cases. Recommend leaving as documented limitation for now.

### Verdict #3 — Dynamic rendering with CMS field-schema bindings

**Verdict: 🔴 PARTIAL — html-render binds to *posts* and to a target post's *html-render values*, but does NOT bind to typed CMS custom fields (`customFields` / `postCustomFieldValues`).**

What works today (`html-render-loops.ts`):

1. **`{{post.X}}` in a `data-loop="posts"` region** — resolves built-in post columns: `id`, `title`, `slug`, `url`, `excerpt`, `coverImage`, `publishedAt`, `postType`. Works because `fetchLoopItems` selects these directly from the `posts` table.
2. **`{{post.values.X}}` in the same loop** — pulls `X` from the target post's *first html-render block's `values` map*. So one html-render block can read another html-render block's authored values. (`collectPostValues` in `html-render-loops.ts` line 52.)
3. **`post`-typed field at top level** — picks one post; server resolves to the same `{ id, title, slug, url, excerpt, coverImage, publishedAt, postType }` shape. Doesn't include custom field values.

What does NOT work — the gap:

The codebase has a real typed CMS field system: `lib/db/schema/cms.ts` defines `customFields` (per-post-type) with field types (`text`, `textarea`, `number`, `date`, `select`, `checkbox`, `url`, `email`, `image`, `user_select`, `repeater`, `group`) and `postCustomFieldValues` (per-post storage). The `/api/custom-fields?postTypeId=X` endpoint exists. Posts are typed (`posts.postType` column).

But the html-render loop expansion never joins to `postCustomFieldValues`. So if a site has a `case-study` post type with a `client_logo` custom field and a `roi_percentage` custom field, an html-render block CANNOT do:

```html
<div data-loop="posts">
  <img src="{{post.fields.client_logo}}" />
  <h3>{{post.title}}</h3>
  <span class="metric">{{post.fields.roi_percentage}}%</span>
</div>
```

Today the only way to surface those custom fields in an html-render template is to **also** put them inside an html-render block on the source post and read via `{{post.values.X}}` — but that defeats the point of having a typed schema (you'd be authoring the data twice in two different shapes).

**Why this matters:** the user's question (#3) is whether html-render can serve as the dynamic-rendering layer on top of the CMS post-type field schema. Today the answer is "no — it can read posts but not their typed fields." That makes html-render a powerful but isolated authoring surface; it's not the dynamic templating layer that complements the post-type system.

**Implementation sketch (additive, no schema change):**

In `html-render-loops.ts`'s `fetchLoopItems`, after the main `posts` query:

1. Pull the postType id matching `loop.postType` (or use the new `postType` slug filter to get all matching custom fields)
2. Left-join `customFields` (filter by `postTypeId`) and `postCustomFieldValues` (filter by `postId IN (rows)`)
3. Group by post id, build a `fields: Record<string, string>` map per item (slug → value)
4. Add `fields` to the `LoopItem` type
5. In `substituteLoopItem`, add a `post.fields.X` branch (mirrors `post.values.X` — line 130–134)

For the `post`-typed field (`resolvePostFields` line 285), do the same join when resolving.

That gets `{{post.fields.X}}` working for free. The schema editor doesn't need to change — authors discover the fields by reading their post-type's field list in the post-type admin.

**Stretch (P2):** in the panel, when the author selects a `loop.postType`, fetch `/api/custom-fields?postTypeId=X` and show the available `{{post.fields.X}}` paths inline as a copy-clickable list. Pure ergonomics; not blocking.

**Gaps for closure:**

- **G7 (P0):** Wire `{{post.fields.X}}` and `{{post.fields.X}}` (single-post variant) to read from `customFields` + `postCustomFieldValues`. Implementation sketch above. Server-side only; no UI changes required to ship.
- **G8 (P2):** Schema editor enhancement — when `loop.postType` is set, show the available custom field slugs as a copy hint.

### Dispatch plan — what gets done in this session

Given the user's "drive the audit overnight" framing, the priority order is:

1. **G1 (P0)** — Lift the legacy `ContentPanel.HtmlRenderBlockSettings` to parity by importing `HtmlRenderEditor` directly. **Ship in batch 1.**
2. **G7 (P0)** — Add `{{post.fields.X}}` binding to `html-render-loops.ts` (custom-field join + substitution). **Ship in batch 2.**
3. **G2 (P1)** — Template lint warning for undefined-field references in the schema disclosure header. **Ship in batch 3.**
4. **G4 (P1)** — Lift `image` (and likely `url`) into `SUBFIELD_TYPES` so per-item images work without JSON-in-text hacks. **Ship in batch 3.**
5. **G3, G5, G6, G8** — defer to user judgment in the morning.

