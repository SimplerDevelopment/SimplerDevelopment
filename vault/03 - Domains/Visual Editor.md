---
type: domain-map
domain: visual-editor
status: active
date: 2026-06-25
sources:
  - components/portal/visual-editor/
  - components/portal/visual-editor/CLAUDE.md
  - components/portal/visual-editor/BlockContentEditor.tsx
  - components/portal/visual-editor/HtmlRenderEditor.tsx
  - components/portal/visual-editor/ImagePickerModal.tsx
  - components/portal/visual-editor/_components/block-panels/ContentPanel.tsx
  - components/portal/visual-editor/_components/block-panels/MediaPanel.tsx
  - components/portal/visual-editor/_components/block-panels/HeroPanel.tsx
  - components/portal/visual-editor/_components/block-panels/LayoutPanel.tsx
  - components/portal/visual-editor/_components/block-panels/MarketingPanel.tsx
  - components/portal/visual-editor/_components/block-panels/CommercePanel.tsx
  - components/portal/visual-editor/_components/block-panels/SpecialPanel.tsx
  - components/portal/visual-editor/_components/html-render/HtmlRenderTabbedForm.tsx
  - components/portal/visual-editor/_components/pickers/BookingPagePicker.tsx
  - components/portal/visual-editor/panel-fields.tsx
  - components/portal/visual-editor/_lib/block-elements.ts
  - components/portal/visual-editor/_lib/block-icon-map.ts
  - components/blocks/visual/
  - components/blocks/visual/CLAUDE.md
  - lib/visual-editor/protocol.ts
  - lib/visual-editor/registry.ts
  - lib/visual-editor/useVisualEditorParent.ts
  - lib/visual-editor/useEditorMode.ts
  - types/visual-editor.ts
  - types/blocks/
  - app/portal/websites/[siteId]/posts/[postId]/edit/page.tsx
  - app/api/portal/cms/websites/[siteId]/posts/[postId]/route.ts
  - app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route.ts
  - lib/db/schema/collab.ts
  - lib/mcp/tools/cms.ts
---

# Domain: Visual Editor

## Purpose

Block-based WYSIWYG page builder embedded in the portal. An authenticated tenant navigates to a post edit route; the portal renders an editor shell around a sandboxed `<iframe>` that loads the live public-site renderer. The two sides communicate exclusively through a typed postMessage protocol. The portal shell owns block state and persistence; the iframe owns layout, selection hit-testing, drag-and-drop, and inline editing.

## Key entry points

| Path | Role |
|---|---|
| `app/portal/websites/[siteId]/posts/[postId]/edit/page.tsx` | Server component — resolves session + tenant, fetches post + categories/tags, builds iframe URL, renders `PortalPostForm` |
| `components/portal/visual-editor/BlockContentEditor.tsx` (98) | Top-level client editor shell — now a 98-line `PANEL_MAP` dispatcher that routes `block.type` to one of 7 category panels in `_components/block-panels/`. Owns selection state, undo stack, and save. |
| `components/portal/visual-editor/HtmlRenderEditor.tsx` (488) | Author-friendly editor for `html-render` blocks — 1694 lines decomposed into 488 shell + 11 modules extracted to `_components/html-render/`. |
| `components/portal/visual-editor/_components/block-panels/` | 7 category panels dispatched by `BlockContentEditor`: `ContentPanel`, `MediaPanel`, `HeroPanel`, `LayoutPanel`, `MarketingPanel`, `CommercePanel`, `SpecialPanel` |
| `components/portal/visual-editor/_components/html-render/` | 11 modules extracted from `HtmlRenderEditor`: `HtmlRenderTabbedForm`, `HtmlRenderAddFieldMenu`, `HtmlRenderArrayEditor`, `HtmlRenderFieldInput`, `HtmlRenderFullJson`, `HtmlRenderPostPicker`, `HtmlRenderSchemaActions`, `HtmlRenderSubFieldsEditor`, `HtmlRenderUrlAutocomplete`, `SortableSchemaField` + `HtmlRenderAddFieldMenu` |
| `components/portal/visual-editor/_components/pickers/` | Shared picker components: `BookingPagePicker`, `ProductSlugPicker`, `SurveyPicker` |
| `components/portal/visual-editor/_components/` | Shared in-panel editors: `ColumnsEditor`, `HeroSlideshowEditor`, `HtmlEmbedEditor`, `ListEditor`, `MarqueeEditor`, `SurveyResultsEditor` |
| `components/portal/visual-editor/ImagePickerModal.tsx` (62) | Image picker modal — extracted from `HtmlRenderEditor` |
| `components/portal/visual-editor/IframePreview.tsx` (158) | Renders the sandboxed `<iframe>`; forwards postMessage events to/from the parent hook |
| `components/portal/visual-editor/LeftPanel.tsx` (282) | Block picker panel |
| `components/portal/visual-editor/LayersPanel.tsx` (223) | Block tree / selection hierarchy |
| `components/portal/visual-editor/RightPanel.tsx` (371) | Settings sidebar; imports from `components/blocks/visual/` |
| `components/portal/visual-editor/ElementStyleEditor.tsx` (95) | Typography/spacing/background style sidebar |
| `components/portal/visual-editor/panel-fields.tsx` (144) | Shared field-primitive components used inside editor panels |
| `lib/visual-editor/useVisualEditorParent.ts` (381) | Hook that wires postMessage listeners and emitters for the parent side |
| `lib/visual-editor/protocol.ts` (71) | `sendToIframe`, `sendToParent`, `isVisualEditorMessage`, `isValidOrigin` — origin-allowlist enforced here |
| `lib/visual-editor/registry.ts` (158) | Maps block type slugs to React render components used inside the iframe |
| `lib/visual-editor/useEditorMode.ts` (341) | Manages breakpoint / viewport / edit-mode state |
| `lib/visual-editor/post-content-slot.tsx` (29) | `PostContentSlot` placeholder used inside post-type templates |
| `types/visual-editor.ts` (148) | All postMessage payload types + `PARENT_MESSAGES` / `IFRAME_MESSAGES` constants |
| `components/blocks/visual/BlockSettings.tsx` | Settings dispatcher; routes block slug to per-category panel |
| `components/blocks/visual/VisualBlockPreview.tsx` | Master preview dispatcher used in block picker |

## Data model

Block content is stored as JSON in `posts.content` (`{ blocks: Block[], version: "1.0" }`). The `Block` type is defined in `types/blocks/` (directory), resolving via `types/blocks/index.ts`; sub-modules include `base.ts`, `commerce.ts`, `content.ts`, `layout.ts`, `media.ts`, `form.ts`, `editor.ts`, `dynamic.ts`, and `components.ts`. The visual editor reads and writes this field through the portal posts API.

**Collaboration:** `lib/db/schema/collab.ts` — `documentComments` table (60 lines). Threaded comments anchored to a `blockId`, slide index, or coordinate. Scoped by `clientId`. Real-time presence (live cursors) is handled in `components/portal/visual-editor/CollaborationProvider.tsx` (159), `PresenceLayer.tsx` (183), `PresenceCursor.tsx`, and `PresenceAvatars.tsx`. Y.Doc snapshots are written back to `posts.content` directly by the realtime server, not via a separate table.

## API surface

The editor shell saves block changes by calling the portal posts API (`app/api/portal/cms/websites/[siteId]/posts/[postId]/route.ts` — 234 lines). The iframe preview loads the public site renderer at the internal `/sites/` route to avoid `X-Frame-Options` SAMEORIGIN blocks.

Revision history is stored via `app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route.ts`; the portal posts API also has a picker endpoint at `app/api/portal/cms/websites/[siteId]/posts/picker/route.ts`.

**postMessage channels** (see `types/visual-editor.ts`):

Parent → iframe (`PARENT_MESSAGES`): `EDITOR_INIT`, `BLOCKS_UPDATE` (with optional `coalesce` flag for drag/slider undo coalescing), `SELECT_BLOCK`, `HOVER_BLOCK`, `EXIT_EDIT_MODE`, `PAGE_SETTINGS_UPDATE`, `UNDO`, `REDO`, `EXTERNAL_DRAG_START/MOVE/END/CANCEL`, `CUSTOM_CODE_UPDATE`.

Iframe → parent (`IFRAME_MESSAGES`): `IFRAME_READY`, `BLOCK_CLICKED`, `BLOCK_HOVERED`, `COMPONENT_REGISTRY`, `BLOCKS_REORDERED`, `ADD_BLOCK_AFTER`, `BLOCK_RESIZED`, `BLOCK_STYLE_UPDATED`, `UNDO_REDO_STATE`, `COLUMN_RESIZED`, `GAP_CHANGED`, `EXTERNAL_DROP_COMPLETED`, `BLOCK_CONTENT_UPDATED`, `BLOCK_CONTEXT_MENU`, `COPY_BLOCKS`, `PASTE_BLOCKS`, `REQUEST_IMAGE_PICKER`.

All messages carry `{ source: 'sd-editor-parent' | 'sd-editor-iframe', type, payload, timestamp }`. `lib/visual-editor/protocol.ts` enforces an origin allowlist (`simplerdevelopment.com`, `*.simplerdevelopment.com`, `*.up.railway.app`, localhost in dev).

## MCP tools

No dedicated visual-editor MCP tools exist. Block content is read/written through the CMS tools in `lib/mcp/tools/cms.ts`: `posts_list` (scope `sites:read`), `posts_get`, `posts_create`, `posts_update` (scope `sites:write`). The `blocks://schema` MCP resource and `BLOCKS_SCHEMA_TLDR` constant from `lib/mcp/blocks-schema.ts` provide the block JSON schema reference to AI clients.

## UI surfaces

- **Portal editor route:** `app/portal/websites/[siteId]/posts/[postId]/edit/` — the full page builder.
- **Block picker (LeftPanel):** block type thumbnails via `components/blocks/visual/*BlockPreview.tsx`.
- **Layers panel (LayersPanel):** drag-and-drop tree; logic in `components/portal/visual-editor/_hooks/useLayersDragDrop.ts` (169).
- **Settings sidebar (RightPanel + BlockSettings):** per-block settings panels in `components/blocks/visual/block-settings/panels/`.
- **Style sidebar (ElementStyleEditor):** element-level typography/spacing/background; uses `components/blocks/visual/StyleSettings.tsx` and `DesignTokensEditor.tsx`.
- **Context menu (BlockContextMenu):** right-click actions (101 lines).
- **Collaboration chrome:** presence avatars and cursors overlaid on the editor.

Extracted hooks under `components/portal/visual-editor/_hooks/`: `useBlockClipboard.ts` (119), `useBulkActions.ts` (98), `useLayersDragDrop.ts` (169), `usePanZoom.ts` (106). All new behaviour must go here, not into the shell.

Utilities under `components/portal/visual-editor/_lib/`: `block-elements.ts` (block DOM helpers), `block-icon-map.ts` (slug-to-icon mapping). New behaviour targeting these concerns belongs here, not in the shell.

## Tests & gates

| File | Layer | Notes |
|---|---|---|
| `tests/unit/hooks-use-visual-editor-parent.test.ts` (1069) | unit | Covers `useVisualEditorParent` message handling |
| `tests/unit/hooks-use-pan-zoom.test.ts` | unit | Pan/zoom hook |
| `tests/unit/components-selectable-block.test.tsx` | unit | Selection overlay |
| `tests/e2e/visual-editor-shell-baseline.spec.ts` (135) | e2e | Shell load + iframe handshake |
| `tests/e2e/visual-editor-blocks.spec.ts` (1871) | e2e | Block CRUD, drag-and-drop, style updates |
| `tests/unit/components-visual-editor-shell.test.tsx` | unit | Shell rendering |
| `tests/unit/components-visual-editor-columns-overlay.test.tsx` | unit | Columns overlay |
| `tests/unit/block-content-editor-coverage.test.tsx` | unit | BlockContentEditor coverage |
| `tests/unit/components-block-content-editor.test.tsx` | unit | BlockContentEditor component |
| `tests/unit/visual-editor-use-parent.test.tsx` | unit | useVisualEditorParent hook |
| `tests/unit/lib-use-editor-mode.test.tsx` | unit | useEditorMode hook |

Critical-e2e gate: `bun test:critical` (`scripts/test.sh --layer=e2e --tag=@critical`). Run before declaring any editor change done.

## Cross-domain dependencies

- [[CMS & Blocks]] — block types, `types/blocks/` (directory index + sub-modules), `lib/blocks/registry.ts`; production rendering lives in `app/sites/[domain]/[[...slug]]/` not here.
- [[Portal]] — tenant routing, session, `lib/active-client.ts`, site-resolver middleware.
- [[MCP]] — `posts_create`/`posts_update` write block content; `blocks://schema` resource consumed by AI clients.
- [[Collaboration]] — `lib/db/schema/collab.ts`; presence via `CollaborationProvider.tsx`.

## Invariants & gotchas

Sourced from `components/portal/visual-editor/CLAUDE.md`:

1. **postMessage protocol is load-bearing.** Editor and iframe communicate only through typed messages. Never bypass with direct DOM access. New event types must be added to BOTH ends (`types/visual-editor.ts` + the iframe handler) in the same commit.
2. **Selection/resize overlays read from iframe layout.** They will desync if you mutate the iframe DOM outside the editor's update path.
3. **New behaviour goes in `_hooks/`, `_lib/`, or the appropriate `_components/block-panels/` panel**, not into `BlockContentEditor.tsx`. The shell is intentionally thin (98 lines, PANEL_MAP only) — keep it that way. New block-type editors belong in a new category panel or an extension of an existing one.
4. **Don't render blocks here.** Production block rendering lives in `app/sites/`. The visual editor produces editing chrome only.
5. **`coalesce` flag on `BLOCKS_UPDATE`** — only the first coalesce-true update in a drag/slider session pushes an undo history entry. Session ends after 300 ms of quiet or a coalesce-false update. Preserve this when forwarding `onChange` calls through settings panels.
6. **Panel interface contract** (`components/blocks/visual/CLAUDE.md`): every category settings panel accepts `(block: Block, onChange: (updates, options?) => void, currentViewport: Breakpoint)`. Changing this signature breaks the sidebar.
7. **Block type registration is lockstep**: TS interface in `types/blocks/` (add to the appropriate sub-module and re-export via `index.ts`), slug in `SLUG_TO_CATEGORY` in `BlockSettings.tsx`, render component in `lib/visual-editor/registry.ts`, production renderer in `app/sites/`. Use `simplerdev-block-type` skill.

## Planning notes

The `simplerdev-visual-editor` skill (`.claude/skills/simplerdev-visual-editor/` or equivalent) is the correct entry point for any visual editor research, audit, debug, or feature work. It contains the full protocol map and the decomposed module layout. `BlockContentEditor.tsx` is now a lean 98-line dispatcher; `HtmlRenderEditor.tsx` is 488 lines — both are safe to read directly. For deep dives into a specific category panel or html-render sub-module, read the relevant file in `_components/block-panels/` or `_components/html-render/` directly.

When adding a new block type with an editor-side settings panel, the `simplerdev-block-type` skill handles render component, registry entry, block settings panel, and production renderer in lockstep.

## Related

- `components/portal/visual-editor/CLAUDE.md`
- `components/blocks/visual/CLAUDE.md`
- `lib/mcp/CLAUDE.md`
- `lib/blocks/CLAUDE.md`
- `docs/guides/BLOCK_EDITOR_GUIDE.md`
- `vault/03 - Domains/00 - Domains Index.md`
