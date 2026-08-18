---
type: spec
domain: blocks
status: planned
date: 2026-07-09
sku: VEQA-032
sources:
  - components/blocks/render/BlockStyleWrapper.tsx
  - components/blocks/render/HeadingBlockRender.tsx
  - components/blocks/render/QuoteBlockRender.tsx
  - components/blocks/render/TestimonialBlockRender.tsx
  - components/blocks/render/EditableBlockRenderer.tsx
  - components/blocks/visual/StyleSettings.tsx
---

# VEQA-032 — Ancestor typography resolution (parent → child cascade)

> **Survey decision (2026-07-08):** "Build a proper ancestor-style-resolution
> pass (correct, bigger)" — chosen over stripping the `text-foreground`
> fallback and relying on raw CSS inheritance. **This spec is the plan; the
> card's Dx requires it before any edit.**

## Problem

Setting typography (font family/size/weight and especially **color**) on a
parent section or column does not cascade to child text/heading blocks. Leaf
renderers self-defend with theme classes gated only on their **own** style:

```tsx
// HeadingBlockRender.tsx:58 — the canonical instance of the bug
const className = `... ${block.style?.color ? '' : 'text-foreground'}`;
```

`text-foreground` (an explicit `color:`) always beats inherited CSS color, so
a parent's color dies at every leaf unless the leaf sets its own. The same
guard-on-own-style pattern exists for size/weight (`hasCustomFontSize ? '' :
'text-xl'`) in 12+ leaf renderers across BOTH trees (production
`components/blocks/render/*` and the editor canvas mirror
`EditableBlockRenderer.tsx`).

Secondary data-model ambiguity: a stored size of `'base'` is indistinguishable
in intent from "never touched". Resolution must define: **absence of key =
inherit; any explicit value (including 'base') = owned by the leaf.** No data
rewrite.

## Chosen architecture: render-time cascade via React context

(CSS-native inheritance was the rejected alternative — it can't work while any
leaf emits fallback utility classes, and removing ALL fallbacks risks unstyled
text on themed/dark backgrounds. The context pass keeps the fallback as the
final tier instead of the first.)

1. **`TypographyCascadeContext`** (new, `components/blocks/render/typography-cascade.tsx`):
   `{ color?, fontFamily?, fontSize?, fontWeight?, lineHeight?, letterSpacing? }`.
   Container renderers that expose typography controls (section, columns/column
   — enumerate from StyleSettings' typography section consumers) **provide** a
   merged context (`{...inherited, ...own}`) whenever they have any typography
   values set. Nesting composes naturally (column inside section).
2. **`useResolvedTypography(block)`** hook: per property, resolve
   `own explicit value → nearest ancestor context value → undefined`.
   Leaf renderers replace their guards:
   `block.style?.color ? '' : 'text-foreground'` becomes
   `resolved.color ? '' : 'text-foreground'`, with `resolved.*` applied as
   inline style when it came from an ancestor. The theme fallback class stays
   as the FINAL tier — no visual change for content with no parent typography.
3. **Both trees in lockstep:** every touched leaf has a mirror in
   `EditableBlockRenderer.tsx` (see VEQA-034's margin lesson — the canvas
   renderer is a separate copy). The editor iframe renders the same production
   components for most leaves; where it doesn't, apply the same hook.
4. **elementStyles interplay:** `getElementCSS(block.elementStyles, …)` values
   are leaf-owned → they win over ancestor context (slot into "own explicit
   value" tier).

## Work breakdown

1. Context + hook + unit tests (resolution order: own > elementStyles > nearest ancestor > none). Small file, no UI.
2. Providers: section + columns renderers (prod + editor canvas mirror). Test: nested section→column→text resolves the innermost ancestor value.
3. Leaf sweep (mechanical, one commit per few files): text, heading, quote, testimonial, cta/hero-cta text nodes, card-grid/metric/flip-card text slots — every `text-foreground`/`hasCustomFontSize`-guard site in `components/blocks/render/` that represents block CONTENT (leave chrome/UI like PopupBlockRender's close button, tab strips, SurveyResults stats alone — those are component chrome, not user content).
4. Editor: no new controls needed (parents already have typography controls); verify the canvas reflects cascade live.
5. Screenshot QA: section color → child heading/text; column font-size → child; dark-bg section with light parent color; leaf override beats parent.

## Risks

- **Intentional appearance change:** pages where a parent HAS typography set
  will start cascading (that's the fix). Sweep with a visual-diff pass on
  seeded demo pages before merge.
- Chrome vs content: over-applying the cascade to UI chrome (tabs, popup
  close, stats labels) would look broken — the sweep list must distinguish.
- Perf: context value must be memoized per container render to avoid
  re-render storms in the editor canvas.

## Effort

Project-sized (1–2 days): steps 1–2 small; step 3 is a wide mechanical sweep
best done by workers file-by-file with the hook already proven.

## Verification

Unit tests per step; `tsc`; screenshot matrix in step 5 in the live editor +
published page; no tenancy impact (render-only).
