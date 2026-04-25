# CMS Blocks Audit — Session Handoff

**Companion to:** `.planning/audits/cms-blocks-audit.md` (the master tracking doc with the per-block matrix)
**Created:** 2026-04-25 — read this first when picking up work in a new session.

---

## Goal

Audit and bring every CMS block in `simplerdevelopment2026` to "fully optimized." A block is fully optimized when:

1. **Every content field in its TypeScript type is editable** through the visual editor (either inline in the canvas or in the right-side settings panel). No "hidden" fields that can only be set via JSON or AI.
2. **Every visual sub-element can be styled** via `block.elementStyles[key]` — e.g. a metric card's value, label, institution line, and CTA link should each be independently styleable for color, font, size, etc., not just the block as a whole.
3. **The block works in the Visual Editor** — appears in the block-picker with a Material Icon and description, drops into the canvas, renders a useful preview (production-quality if data exists, helpful empty-state if not), is selectable, can be styled via the side panel, and reflects edits live.
4. **The block renders correctly in production** (the public-facing live site) using the full `block.style` + `block.responsive` + `block.elementStyles` system.
5. **It has E2E test coverage** — at minimum a create→fetch→update→fetch lifecycle test in `tests/e2e/visual-editor-blocks.spec.ts` that proves the block survives the round trip through the API and renders on a live tenant site.
6. **It has unit-test coverage where logic warrants** (style wrapper handling, element-style application, block-specific rendering rules).

---

## Architecture — the 7 wiring layers per block

For a block to be fully optimized, all of these must be in lockstep:

| Layer | Where | What it does |
|---|---|---|
| **Type** | `types/blocks.ts` | TypeScript interface + entry in the `Block` union — the contract. |
| **Production renderer** | `components/blocks/render/<Name>BlockRender.tsx` + case in `BlockRenderer.tsx` | What live visitors see. Must consume `block.style`, `block.responsive`, and `block.elementStyles[key]` for every styleable sub-element. |
| **Visual editor preview** | `components/blocks/visual/<Name>BlockPreview.tsx` + case in `VisualBlockPreview.tsx` | What the editor canvas renders — selectable, with empty-state messaging when no data yet. |
| **Settings panel** | case in `BlockSettings.tsx` switch + a `<Name>BlockSettings()` function | Side-panel form exposing every content field. Array editors for nested items (cards, members, links). Color pickers for color fields. |
| **Sub-element style registry** | `ELEMENT_DEFINITIONS` map in `BlockSettings.tsx` | Lists which `elementStyles` keys the block supports — this drives the per-element style picker in the Style→Elements tab. |
| **Block picker entry** | `BUILT_IN_BLOCK_TYPES` in `components/portal/VisualEditorShell.tsx` (the actual user-facing menu) AND `app/api/blocks/route.ts` (external/AI consumers) | Lets users add the block via the "+" menu. |
| **Picker icon** | Lucide icon in `BLOCK_ICONS` (`lib/utils/blockIcons.tsx`, typesafe `Record<BlockType, LucideIcon>`) + Material Icon name in `BUILT_IN_BLOCK_TYPES` | Visual identifier in the picker. |

Plus: tests in `tests/e2e/visual-editor-blocks.spec.ts` and `tests/unit/`.

The `tests/unit/blocksRegistryCompleteness.test.ts` drift test now enforces 6 of these layers automatically — it'll fail CI if a new block is added without renderer / preview / picker / API entries. That's the safety net for future drift.

---

## Block taxonomy (informs which layers each block needs)

- **basic / media / layout / component / ecommerce / forms** — fully user-pickable; need ALL 7 layers
- **email-only** (email-header, email-footer): only show in the email editor, not the website picker. They have their own registry in `lib/email/email-block-types.ts`
- **pitch-deck-only** (deck-next-slide, deck-jump-to, survey-input): only used inside slide editors, not the site editor
- **site-specific** (palizzi-*): hard-coded for one tenant — won't be added to general pickers

The drift test's `NOT_USER_PICKABLE` set captures these exclusions.

---

## What's been done so far (3 phases, all uncommitted)

### Phase 1 — reachability + drift detection ✅

- Wrote master audit doc `.planning/audits/cms-blocks-audit.md` with a 56-block matrix
- Added `tests/unit/blocksRegistryCompleteness.test.ts` (6 drift checks — passes)
- **Fixed real production bug**: 4 renderer cases were missing (flip-card-grid, metric-cards, logo-strip, survey-input were rendering as "Unknown block type" in production)
- Filled 14 missing `/api/blocks` entries + new "forms" category
- Filled 8 missing `BUILT_IN_BLOCK_TYPES` picker entries

### Phase 2a — visual editor preview parity ✅

- Created 9 new `*BlockPreview.tsx` components (FlipCardGrid, MetricCards, LogoStrip, Timeline, TeamShowcase, TeamFlipGrid, BentoGrid, SiteFooter, BookingMenu)
- Wired all 9 into `VisualBlockPreview.tsx` switch
- Pattern used: thin wrapper around the production renderer + dashed-border empty-state placeholder when block has no data. Inline editing deferred to side panel.

### Phase 2b — settings arms (PARTIAL — currently broken) ⚠️

- Added 4 settings arms: SocialLinks, LogoStrip, MetricCards, BookingMenu
- Added 6 `ELEMENT_DEFINITIONS` entries (38 new sub-element style keys)
- **Then started 9 more arms but only added the imports + case arms — the function definitions are missing.** TypeScript currently broken on `BlockSettings.tsx`.

---

## What's left to do

### Step 1 — fix the broken state in `BlockSettings.tsx` (highest priority)

The switch references 9 functions that don't exist yet:
- `FlipCardGridBlockSettings`
- `TimelineBlockSettings`
- `TeamShowcaseBlockSettings`
- `TeamFlipGridBlockSettings`
- `BentoGridBlockSettings`
- `SiteFooterBlockSettings`
- `MarqueeBlockSettings`
- `TabsBlockSettings`
- `SurveyInputBlockSettings`

Confirm with `npx tsc --noEmit 2>&1 | grep BlockSettings`.

Append the 9 function definitions to the end of the file. Pattern: each function exposes every field from the corresponding block type. Use `RichTextEditable` for prose fields, array editors with add/remove for nested items, `TokenColorPicker` (pass `value || ''`, it doesn't accept undefined) for colors. Use the existing arms (`MetricCardsBlockSettings`, `LogoStripBlockSettings`, `SocialLinksBlockSettings`) as the canonical pattern.

After this step:
- Run `npx tsc --noEmit` — should be clean.
- Run `npx vitest run tests/unit/blocksRegistryCompleteness.test.ts` — all 6 drift checks should still pass.

### Step 2 — Phase 2c, renderer elementStyles wiring

4 renderers don't call `getElementCSS(block.elementStyles, key)` anywhere. Until they do, sub-element style customization captured by the settings UI is silently ignored at render time:

- `team-flip-grid` — keys to add: `memberName`, `memberTitle`, `memberBio`, `question`, `answer`, `frontCard`, `backCard`
- `site-footer` — keys to add: `logo`, `tagline`, `linkGroupLabel`, `link`, `socialIcon`, `contactLine`, `copyright`
- `social-links` — keys to add: `icon`, `link`
- `booking-menu` — keys to add: `title`, `description`, `card`, `cardTitle`, `cardDescription`, `button`

For each: add the `getElementCSS` calls in the renderer + matching `ELEMENT_DEFINITIONS` entries in `BlockSettings.tsx`.

### Step 3 — Phase 3, E2E coverage

Currently 17/56 blocks have lifecycle tests. 39 missing. Add tests in `tests/e2e/visual-editor-blocks.spec.ts` following the existing pattern:

```ts
test('<block> block: create, verify, update, verify', async ({ clientApi, unauthApi }) => {
  const slug = `ve-<block>-${Date.now()}`;
  const post = await createPost(clientApi, slug, [/* block */]);
  cleanups.push(async () => { await deletePost(clientApi, post.id); });
  // verify via getPublicPost(...)
  // update via updatePost(...)
  // re-verify
});
```

Highest priority blocks to cover (most user-visible): video, gallery, marquee, accordion, tabs, services-grid, blog-posts, featured-content, hero-slideshow, timeline, team-showcase.

### Step 4 — Phase 4, per-block deep audit

Walk each block one at a time. For each:
- Confirm every type field is editable in the settings arm
- Confirm every visual sub-element has an `ELEMENT_DEFINITIONS` entry AND the renderer honors it
- Confirm the production live view matches the design intent
- Confirm the editor preview matches production

The audit doc has worksheet stubs at the bottom of `cms-blocks-audit.md` for this — fill in as you go.

---

## Ground rules

- **Material Icons over emojis** in any UI text (per `~/.claude/projects/-Users-dancoyle-simplerdevelopment/memory/feedback_no_emojis.md`)
- **No commits unless asked** — user explicitly hasn't asked for commits yet
- **Update the audit doc as you go** — it's the source of truth for what's done vs remaining; check off Phase 2b items as each settings arm lands
- **Run the drift test after every batch of changes** — catches regressions immediately
- **Don't add features that weren't asked for** (per global CLAUDE.md) — fix gaps, don't refactor
- **For "renderer doesn't use elementStyles" gaps, prefer wiring `getElementCSS` rather than rewriting the component**
- **Don't run a dev server or browser tests** unless asked — typecheck + vitest is sufficient validation for this work

---

## Files modified this session (uncommitted)

**New:**
- `.planning/audits/cms-blocks-audit.md`
- `.planning/audits/cms-blocks-handoff.md` (this file)
- `tests/unit/blocksRegistryCompleteness.test.ts`
- `components/blocks/visual/FlipCardGridBlockPreview.tsx`
- `components/blocks/visual/MetricCardsBlockPreview.tsx`
- `components/blocks/visual/LogoStripBlockPreview.tsx`
- `components/blocks/visual/TimelineBlockPreview.tsx`
- `components/blocks/visual/TeamShowcaseBlockPreview.tsx`
- `components/blocks/visual/TeamFlipGridBlockPreview.tsx`
- `components/blocks/visual/BentoGridBlockPreview.tsx`
- `components/blocks/visual/SiteFooterBlockPreview.tsx`
- `components/blocks/visual/BookingMenuBlockPreview.tsx`

**Modified:**
- `components/blocks/render/BlockRenderer.tsx` (+4 imports, +8 case arms — fixed real production bug)
- `components/blocks/visual/VisualBlockPreview.tsx` (+9 imports, +9 cases)
- `components/blocks/visual/BlockSettings.tsx` (currently broken — see Step 1)
- `components/portal/VisualEditorShell.tsx` (+8 picker entries)
- `app/api/blocks/route.ts` (+14 entries, +"forms" category)
