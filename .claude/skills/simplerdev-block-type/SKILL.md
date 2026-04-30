---
name: simplerdev-block-type
description: Scaffold or modify a block type in the SimplerDevelopment2026 block editor. Creates the TypeScript interface, render component, registry entry, production renderer case, and /api/blocks metadata in lockstep. Use when the user says 'new block', 'add block type', 'scaffold block', 'create <X> block', 'add a block for <X>', or needs a new reusable block for the visual editor. All blocks are multi-tenant and universal — never client-specific.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# simplerdev-block-type

Scaffolds a new block type end-to-end. Every block touches **five** integration points — this skill keeps them in sync.

## Core invariant: blocks are universal, never client-specific

**This is a hard rule. Don't violate it.**

Blocks ship to every client's website through the same registry. A block named `palizzi-hero` or `acme-pricing` is anti-pattern — it bloats the editor, confuses other clients, and makes deletes dangerous. The pattern already exists in the codebase (`PalizziNavBlockRender`, `PalizziFooterBlockRender`, etc. — 8 files) and should NOT be extended.

When a user asks for a block that smells client-specific, apply the decision tree:

1. **Can the visual/structural pattern be generalized?** If the user wants "CY Strategies hero", ask: what's generic about it? A split-layout hero with overline + title + subtitle + CTA + image is already `hero`. If the user wants a new structural pattern (e.g. "stats on left, testimonials on right"), that's worth a new generic block (`split-content-with-stats`), not a client-prefixed one.

2. **Is the specialness really just content?** Logos, copy, colors, fonts belong in the block's JSON and in `brandingProfiles` — not in a new component.

3. **If it truly can't be generalized** (a client-commissioned interactive experience with bespoke logic/SVG animation/proprietary data shape): **do NOT create the block.** Stop and flag it:
   > "This looks client-specific and would violate the universal-block rule. I'm going to drop a placeholder `<text>` block with a TODO note and bring this to your attention. Options: (a) extract a generalizable pattern from it, (b) accept it as a one-off React component imported directly into a custom page route — not via the block registry, or (c) you confirm you want to accept client-prefixed blocks going forward."

Placeholder pattern when flagging:
```json
{
  "id": "placeholder-<shortname>",
  "type": "text",
  "order": <N>,
  "content": "⚠ TODO: Client-specific component needed here — '<description>'. Flagged for review by human; do not ship without resolving.",
  "style": {
    "backgroundColor": "#FFF4E5",
    "color": "#7A4A00",
    "padding": "24px",
    "borderRadius": "8px",
    "borderWidth": "1px",
    "borderColor": "#F5C38B",
    "borderStyle": "solid"
  }
}
```

The 8 existing `palizzi-*` blocks are technical debt. Do not create more client-prefixed blocks. If the user insists, escalate.

## The 5 integration points

For a new block type `<kebab-name>` (e.g. `pricing-cards`):

| # | File | What to add |
|---|---|---|
| 1 | `types/blocks.ts` | `interface <PascalName>Block extends BaseBlock` + append to `Block` union at line ~843 |
| 2 | `components/blocks/render/<PascalName>BlockRender.tsx` | The React component (`'use client'`, `block` prop) |
| 3 | `lib/visual-editor/registry.ts` | Import + entry in `BUILT_IN` map |
| 4 | `components/blocks/render/BlockRenderer.tsx` | Import + `case '<kebab-name>':` in the switch |
| 5 | `app/api/blocks/route.ts` | Metadata entry: `{ type, name, description, icon, category, inputs: [...] }` |

Missing ANY of these breaks something:
- Missing #1 → TypeScript errors everywhere
- Missing #2 → runtime crash when the block renders
- Missing #3 → editor renders nothing for this type
- Missing #4 → published site renders nothing for this type
- Missing #5 → block picker in the sidebar doesn't show this type

## Canonical reference: `stats` block

Before scaffolding, read these four files together — this is the cleanest minimal example:

- `types/blocks.ts` lines 313-322 (interface)
- `components/blocks/render/StatsBlockRender.tsx` (component, 59 lines)
- `lib/visual-editor/registry.ts` line 86 (entry)
- `app/api/blocks/route.ts` lines 217-228 (metadata)

Mirror its structure for simple blocks. For complex blocks with nested children (like `columns`, `tabs`, `section`), read `SectionBlockRender.tsx` and `ColumnsBlockRender.tsx` instead.

## Procedure

1. **Validate universality first.** Ask the decision-tree questions above if the request smells client-specific. Don't write code until confirmed generic.
2. **Collect inputs** from the user (or infer):
   - **Type name** (kebab-case): e.g. `pricing-cards`
   - **Display name** and **description**: e.g. "Pricing Cards" / "Tiered pricing plans with feature lists"
   - **Category**: one of `basic`, `media`, `layout`, `component`, `ecommerce`, `form`, `email`
   - **Material icon** (not emoji — user rule): e.g. `payments` (use real Material Symbols names)
   - **Field schema**: list of fields with name, TS type, optional, required, etc.
   - **Supports responsive variants?** (padding/margin/visibility/fontSize at each breakpoint — all blocks should, but some are exempt like `spacer`)
3. **Read canonical refs** (stats block files above) so the generated code matches style.
4. **Generate files in order 1→5** above. Use `Edit` for existing files, `Write` only for the new `*BlockRender.tsx`.
5. **Wire element styles** if the block has distinct parts (title, subtitle, cards, icons). Use `elementStyles.<part>` via `getElementCSS(block.elementStyles, '<part>')` — see StatsBlockRender.tsx lines 42/48/51.
6. **Support branding sentinels** in the metadata AND the renderer. Colors in `block.style` or `elementStyles` may be `brand.primary` / `brand.accent` etc., resolved by `resolveBrandSentinel` in `BlockStyleWrapper.tsx`. For colors inside your own component, call `resolveBrandSentinel(value)` before applying.
7. **Report the checklist** of files touched, with line references.

## Naming conventions (enforce these)

- **Type key** (in registry, API, JSON): kebab-case. `pricing-cards`, `team-showcase`, not `pricingCards` or `PricingCards`.
- **Interface**: `<PascalName>Block` with a `type: '<kebab-name>'` literal. `PricingCardsBlock`, `TeamShowcaseBlock`.
- **Component**: `<PascalName>BlockRender`. File: `components/blocks/render/<PascalName>BlockRender.tsx`. Export a named function.
- **No client name prefixes.** Reject `PalizziX`, `CyStrategiesX`, `AcmeX`. If the user insists, escalate.
- **Fields**: camelCase in the interface. `ctaText`, not `cta_text` or `CtaText`.

## Required BaseBlock fields

Every block extends `BaseBlock` which provides: `id`, `type`, `order`, optional `style`, optional `responsive`, optional `elementStyles`, optional `label`. Do NOT redeclare these.

## Testing a new block

After scaffolding:

1. `bun run dev` (or check the running dev server).
2. Open any post in the editor. Open the block picker (Add Block button).
3. Verify your block appears in the correct category with the Material icon.
4. Click to insert. Verify:
   - Default values are sensible
   - The block renders without errors
   - Selection outline matches the actual rendered width (see `simplerdev-visual-editor` skill if not)
   - Style sidebar shows your block's fields
   - Saving + reload preserves content
5. Published-site check: add `?_edit=false` (or just visit the public URL). Your block must render identically — the `SiteBlockRenderer` falls through to `BlockRenderer` in non-edit mode.
6. Mobile preview: switch viewport to mobile. Block should stack/reflow sensibly.

## What this skill is NOT

- Not a component library generator. Blocks are the product; sub-components live alongside the renderer if needed.
- Not a branding editor. Colors should come from `brandingProfiles` via sentinels, not hardcoded defaults.
- Not a data-integration tool. If the block needs to fetch data (e.g. `BlogPostsBlockRender` reads posts), that's a separate concern — follow the existing fetching pattern in similar blocks.
- **Not a client-specific block builder.** If asked for one, invoke the escalation pattern above.

## Related skills

- `simplerdev-visual-editor` — for editor-level issues (selection, drag, resize, postMessage protocol)
- `simplerdev-feature-scaffold` — for backing CRUD features that expose data blocks can consume
- `site-migration` — when migrating pages from a source site, always map source sections to existing universal blocks first; only create new blocks if the structural pattern is reusable across clients

## Failure modes to watch for

- **Forgetting point #4** (BlockRenderer.tsx switch) — editor works, live site shows nothing. Common regression.
- **Forgetting point #5** (/api/blocks) — block can be saved programmatically but not inserted via UI.
- **Hardcoded colors** — block works on dev but looks wrong on clients with custom branding. Always resolve sentinels.
- **Non-Material icons in metadata** — emojis will slip in unless corrected. User rule: Material Icons only.
- **TypeScript `type` mismatch** — interface says `type: 'pricing-cards'` but registry key is `pricingCards` → block silently doesn't render in the editor.
- **Missing `elementStyles` support** — if the block has visually distinct parts (title, cards, icons), users expect to style them independently. Without `elementStyles`, the block feels "locked".
