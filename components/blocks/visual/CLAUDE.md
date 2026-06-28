# components/blocks/visual — Agent Notes

Visual block-settings UI and preview components for the block editor — the style/settings panels and drag-preview thumbnails rendered in the portal's visual editor sidebar.

> Token budget: keep this file <80 lines.

## What lives here

- **`BlockSettings.tsx`** — top-level settings dispatcher. Renders General / Style / Elements tabs; routes block slugs to one of six category panels via `SLUG_TO_CATEGORY`.
- **`block-settings/panels/`** — per-category settings UIs: `LayoutPanel`, `ContentPanel`, `FormPanel`, `MediaPanel`, `DynamicPanel`, `SectionsPanel` (the largest). Each receives `(block, onChange, currentViewport)`.
- **`block-settings/element-definitions.ts`** — maps block types to their element-level style targets.
- **`*BlockPreview.tsx`** — one file per block type; lightweight previews used in the block picker and `VisualBlockPreview.tsx` (the master dispatcher). Some previews consume `useBlockEditor()` from `BlockEditorContext` for responsive breakpoint awareness.
- **Shared editors:** `StyleSettings.tsx`, `DesignTokensEditor.tsx`, `GradientBuilder.tsx`, `TokenColorPicker.tsx`, `GoogleFontPicker.tsx`, `RichTextEditable.tsx`, `ContentEditable.tsx`, `ResponsiveSettings.tsx`.

## Load-bearing invariants

- **Panel interface contract:** every category panel accepts `(block: Block, onChange: (updates: Partial<Block>, options?: { batch?: boolean }) => void, currentViewport: Breakpoint)`. The `batch` option coalesces undo history — preserve it when forwarding onChange calls.
- **Consumed by the visual editor:** `components/portal/visual-editor/RightPanel.tsx` and `ElementStyleEditor.tsx` import from here. Changes to prop shapes here break the visual editor sidebar — run `tsc --noEmit` after any interface change.
- **Block types come from `@/types/blocks`**, not from `lib/blocks/registry.ts` directly. `SectionsPanel.tsx` imports typed block interfaces; when adding a new block type, add its TS interface to `types/blocks.ts` and register it in `SLUG_TO_CATEGORY` in `BlockSettings.tsx`.
- **Preview components are editor-only.** Production rendering lives in `app/sites/` — never add fetch or side-effects to a `*BlockPreview.tsx`.

## God-file warning

Do NOT `Read` this into the main thread — spawn an `Explore` subagent first:

- `components/blocks/visual/block-settings/panels/SectionsPanel.tsx` (1499) — covers hero, CTA, services-grid, stats, testimonial, social-links, logo-strip, metric-cards, flip-card-grid, timeline, team, bento-grid, and site-footer inline. A targeted `Read` with `limit:` + `offset:` is acceptable for surgical edits.

## Pointers

- Block type registry + JSON schema: `lib/blocks/CLAUDE.md`, `@docs/guides/BLOCK_EDITOR_GUIDE.md`
- Visual editor shell (consumes these panels): `components/portal/visual-editor/CLAUDE.md`
- Adding a new block end-to-end: `simplerdev-block-type` skill
- Types: `types/blocks.ts`, `types/responsive.ts`
