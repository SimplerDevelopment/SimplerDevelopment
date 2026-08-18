---
type: spec
domain: visual-editor
status: planned
date: 2026-06-25
sources:
  - components/portal/visual-editor/BlockContentEditor.tsx
  - components/portal/visual-editor/HtmlRenderEditor.tsx
  - components/portal/visual-editor/CLAUDE.md
  - components/portal/VisualEditorShell.tsx
  - lib/visual-editor/protocol.ts
  - types/visual-editor.ts
  - vault/03 - Domains/Visual Editor.md
  - tests/unit/components-block-content-editor.test.tsx
  - tests/unit/block-content-editor-coverage.test.tsx
  - tests/unit/components-html-render-editor.test.tsx
  - tests/unit/hooks-use-visual-editor-parent.test.ts
  - tests/e2e/visual-editor-blocks.spec.ts
  - tests/e2e/visual-editor-shell-baseline.spec.ts
  - tests/CLAUDE.md
---

# Feature: Visual Editor God-File Decomposition

## Overview

Break two god files — `BlockContentEditor.tsx` (2018 lines) and `HtmlRenderEditor.tsx` (1694 lines) — into maintainable, independently readable modules without changing any editor behavior. The decomposition is a pure mechanical refactor: behavior-identical, no new features, no protocol changes. The goal is to reduce the per-agent read cost (currently ~25k tokens per full-file read) and unblock safe future extension by a small team.

Read first: [[Visual Editor]].

---

## Problem / Why Now

The visual editor has grown into two load-bearing god files that together total **3712 lines**. The CLAUDE.md for this directory already warns agents not to open them into the main thread and instructs them to use targeted `limit:`/`offset:` reads instead — a symptom, not a solution.

**Maintenance cost:**

- Agents reading the full `BlockContentEditor.tsx` consume ~25k tokens per read, making even small fixes expensive.
- Both files bundle unrelated concerns: pure utilities, async data pickers, sortable list components, complex block-specific editors, and an exported modal — all in a single module.
- Adding a new block type requires reading ~900 lines of if-tree context to find the right insertion point.
- `ImagePickerModal` (line 1331, HRE) is exported and dynamically imported by `VisualEditorShell.tsx` — a side effect of the modal living in the wrong file entirely.

**Protocol risk:** The postMessage contract (`types/visual-editor.ts`, `lib/visual-editor/protocol.ts`) is load-bearing and dual-sided. Any accidental co-location of protocol-touching code with unrelated block-editor concerns increases review surface. The refactor must not touch protocol types or origin-allowlist logic.

---

## Current Structure

### BlockContentEditor.tsx — 2018 lines

| Line range | Concern |
|---|---|
| 1–35 | Imports (dnd-kit, MediaPicker, Block types, panel-fields, HtmlRenderEditor) |
| 36–977 | `BlockContentEditor` exported function — if-tree dispatch across **50 block types** |
| 978–1142 | `SurveyResultsEditor` — isolated sub-component (165 lines) |
| 1143–1267 | `HtmlEmbedEditor` — CodeMirror-like embed editor (125 lines) |
| 1268–1437 | `ListEditor` + `SortableListItem` — generic sortable list with dnd-kit (170 lines); used by 15+ block types (stats, card-grid, gallery, logo-strip, services-grid, timeline, marquee, etc.) |
| 1438–1520 | `ColumnsEditor` — column width slider editor (83 lines) |
| 1522–1607 | `BookingPagePicker` — async fetch + combobox (86 lines) |
| 1608–1696 | `SurveyPicker` — async fetch + combobox (89 lines) |
| 1697–1806 | `ProductSlugPicker` — async fetch + combobox (110 lines) |
| 1807–1900 | `MarqueeEditor` — marquee/ticker editor (94 lines) |
| 1901–2018 | `HeroSlideshowEditor` — slideshow settings + per-slide editor (118 lines) |

The `BlockContentEditor` function itself spans ~940 lines. Each block type case is an inline JSX fragment with no shared state between cases — pure dispatch. The if-tree grows by ~20–80 lines per new block type.

### HtmlRenderEditor.tsx — 1694 lines

| Line range | Concern |
|---|---|
| 0–55 | Imports + type aliases (`HtmlRenderValues`, `AnyHtmlRenderValue`) |
| 56–489 | `HtmlRenderEditor` exported function — composes the four sections (values form, loop source, field schema, HTML template + full JSON) |
| 490–620 | `HtmlRenderFullJson` — JSON export/import via textarea (131 lines) |
| 621–816 | `HtmlRenderFieldInput` — field-type router; renders the correct input widget per field type (text/textarea/richtext/image/boolean/color/select/radio/date/link/post/array/group) (196 lines) |
| 817–903 | `HtmlRenderPostPicker` — typeahead for `post` field type (87 lines) |
| 904–1019 | `HtmlRenderUrlAutocomplete` — URL autocomplete with fetch-backed suggestions (116 lines) |
| 1020–1182 | `HtmlRenderArrayEditor` + `SortableArrayItem` — repeater for `array`-type fields (163 lines) |
| 1183–1330 | `HtmlRenderSchemaActions` — copy/paste/export/import schema toolbar (148 lines) |
| 1331–1382 | `ImagePickerModal` — **EXPORTED** modal for iframe click-to-swap image flow (52 lines); dynamically imported by `VisualEditorShell.tsx` via `./visual-editor/HtmlRenderEditor` |
| 1389–1465 | `SortableSchemaField` — drag-handle render-prop wrapper for schema rows (77 lines) |
| 1466–1545 | `HtmlRenderSubFieldsEditor` — sub-fields editor for `array`/`group` field types (80 lines) |
| 1546–1608 | `HtmlRenderAddFieldMenu` — quick-add field type presets dropdown (63 lines) |
| 1609–1694 | `HtmlRenderTabbedForm` — splits the values form into ACF-style tabs (86 lines) |

**Rules-of-hooks note:** `HtmlRenderEditor` calls `useSensors(useSensor(...))` inline at line 255 (inside the DndContext for schema field reordering) and again at line 1084 (inside `HtmlRenderArrayEditor`'s DndContext). The first call is technically inside a conditional render block — it currently works because the condition is always truthy when the `<details>` section is shown, but the hook call is not at the top level of the component. This must be fixed during extraction (move `useSensors` to the component body before the return).

### Shared postMessage protocol (NOT modified by this spec)

`types/visual-editor.ts` (148 lines) defines all message payload types and the `PARENT_MESSAGES` / `IFRAME_MESSAGES` constants. `lib/visual-editor/protocol.ts` (71 lines) holds `sendToIframe`, `sendToParent`, `isVisualEditorMessage`, `isValidOrigin`, and the origin allowlist. Neither file is touched in this decomposition. The unit test `tests/unit/hooks-use-visual-editor-parent.test.ts` (1069 lines) covers the protocol contract.

---

## Target Structure

All extractions maintain identical exported surface and behavior. No new API, no protocol changes, no block behavior changes.

### New files

```
components/portal/visual-editor/
  ImagePickerModal.tsx                        (extracted from HRE line 1331; update dynamic import in VisualEditorShell.tsx)
  _components/
    ListEditor.tsx                            (extracted from BCE lines 1268–1437)
    ColumnsEditor.tsx                         (extracted from BCE lines 1438–1520)
    HtmlEmbedEditor.tsx                       (extracted from BCE lines 1143–1267)
    SurveyResultsEditor.tsx                   (extracted from BCE lines 978–1142)
    MarqueeEditor.tsx                         (extracted from BCE lines 1807–1900)
    HeroSlideshowEditor.tsx                   (extracted from BCE lines 1901–2018)
    pickers/
      BookingPagePicker.tsx                   (extracted from BCE lines 1522–1607)
      SurveyPicker.tsx                        (extracted from BCE lines 1608–1696)
      ProductSlugPicker.tsx                   (extracted from BCE lines 1697–1806)
    html-render/
      HtmlRenderTabbedForm.tsx                (extracted from HRE lines 1609–1694)
      HtmlRenderFieldInput.tsx                (extracted from HRE lines 621–816)
      HtmlRenderArrayEditor.tsx               (extracted from HRE lines 1020–1182, includes SortableArrayItem)
      HtmlRenderSchemaActions.tsx             (extracted from HRE lines 1183–1330)
      HtmlRenderFullJson.tsx                  (extracted from HRE lines 490–620)
      HtmlRenderPostPicker.tsx                (extracted from HRE lines 817–903)
      HtmlRenderUrlAutocomplete.tsx           (extracted from HRE lines 904–1019)
      SortableSchemaField.tsx                 (extracted from HRE lines 1389–1465)
      HtmlRenderSubFieldsEditor.tsx           (extracted from HRE lines 1466–1545)
      HtmlRenderAddFieldMenu.tsx              (extracted from HRE lines 1546–1608)
```

### Residual god-file sizes after all extractions

| File | Before | After (estimate) |
|---|---|---|
| `BlockContentEditor.tsx` | 2018 lines | ~750 lines (dispatch if-tree only + imports) |
| `HtmlRenderEditor.tsx` | 1694 lines | ~180 lines (main component + imports) |

The BCE dispatch table (~750 lines) is explicitly **Phase 5** work and is the most invasive step. Earlier phases leave the dispatch in-place and only extract the helpers used by it.

### One-liner responsibility for each new file

- `ImagePickerModal.tsx` — media picker modal opened when the iframe sends `REQUEST_IMAGE_PICKER`; standalone dialog, no block-type coupling.
- `_components/ListEditor.tsx` — generic sortable list with dnd-kit; renders items as accordion rows with typed field defs; used by any block type with a repeating sub-collection.
- `_components/ColumnsEditor.tsx` — width-slider layout editor for `columns` block column widths.
- `_components/HtmlEmbedEditor.tsx` — raw HTML/CSS/JS embed editor with fullscreen code view.
- `_components/SurveyResultsEditor.tsx` — settings panel for `survey-results` block; reads survey response aggregates.
- `_components/MarqueeEditor.tsx` — marquee/ticker item list editor.
- `_components/HeroSlideshowEditor.tsx` — slide manager + per-slide settings for `hero-slideshow` block.
- `_components/pickers/BookingPagePicker.tsx` — async combobox that fetches `/api/portal/tools/booking`.
- `_components/pickers/SurveyPicker.tsx` — async combobox that fetches `/api/portal/surveys`.
- `_components/pickers/ProductSlugPicker.tsx` — async combobox that fetches store products.
- `_components/html-render/HtmlRenderTabbedForm.tsx` — splits `html-render` values form into ACF-style tab groups.
- `_components/html-render/HtmlRenderFieldInput.tsx` — routes each field type to the correct input widget (text, richtext, image, boolean, color, select, array, group, etc.).
- `_components/html-render/HtmlRenderArrayEditor.tsx` — sortable repeater for `array`-type field values; includes `SortableArrayItem`.
- `_components/html-render/HtmlRenderSchemaActions.tsx` — toolbar for copy/paste/export/import of the full field schema JSON.
- `_components/html-render/HtmlRenderFullJson.tsx` — full block JSON export/import textarea with validation.
- `_components/html-render/HtmlRenderPostPicker.tsx` — typeahead picker for `post`-type field references.
- `_components/html-render/HtmlRenderUrlAutocomplete.tsx` — debounced URL autocomplete backed by a suggestions API fetch.
- `_components/html-render/SortableSchemaField.tsx` — render-prop drag wrapper that hands handle props to the schema row's drag icon.
- `_components/html-render/HtmlRenderSubFieldsEditor.tsx` — sub-fields schema editor for `array`/`group` field definitions.
- `_components/html-render/HtmlRenderAddFieldMenu.tsx` — dropdown menu of quick-add field presets (text, image, boolean, array, etc.).

---

## Regression Harness

### Existing coverage (verify green before touching code)

| Test file | Layer | Lines | What it pins |
|---|---|---|---|
| `tests/unit/components-block-content-editor.test.tsx` | unit | 2215 | BCE: all 50 block type panels, ListEditor, ColumnsEditor |
| `tests/unit/block-content-editor-coverage.test.tsx` | unit | 2946 | BCE: popup, image, text, cta, hero, testimonial, product, survey, booking, html-embed, marquee, accordion, timeline, etc. |
| `tests/unit/components-html-render-editor.test.tsx` | unit | 1224 | HRE: all internal sub-components (TabbedForm, FieldInput, ArrayEditor, SchemaActions, FullJson, PostPicker, UrlAutocomplete, SubFieldsEditor, AddFieldMenu, SortableSchemaField) |
| `tests/unit/hooks-use-visual-editor-parent.test.ts` | unit | 1069 | postMessage protocol contract (not touched by this spec) |
| `tests/e2e/visual-editor-shell-baseline.spec.ts` | e2e | 135 | Shell load + iframe handshake — tagged `@critical @visual-editor` |
| `tests/e2e/visual-editor-blocks.spec.ts` | e2e | 1871 | Block CRUD, drag-and-drop, style updates — 30+ block types |

### Contract to hold at every phase boundary

1. `bun typecheck` (i.e., `tsc --noEmit`) passes with zero new errors.
2. `scripts/test.sh --layer=unit --no-coverage` passes with the same test count as baseline.
3. At phases 2+: `bun test:critical` (`scripts/test.sh --layer=e2e --tag=@critical --no-coverage`) stays green.

### Mocks that must be updated when paths change

The unit test files use `vi.mock('@/components/portal/visual-editor/panel-fields', ...)` and similar path mocks. When a component moves to a new path (e.g., `HtmlRenderTabbedForm` moves to `_components/html-render/`), its internal mock path in the test file must be updated. The test files mock at the import path level — a stale mock path silently passes without exercising the real code. Update the mock `vi.mock(...)` call in the same commit as the extraction.

### New test stubs needed

None required before starting. The existing unit tests are comprehensive enough to serve as the regression net if mock paths are kept current. If a new file introduces a new exported symbol that escapes the existing mock surface, add a stub test before that extraction step.

---

## Phased Plan

Each phase is independently shippable (its own commit or PR). Phases 1–4 are pure file-to-file extractions; Phase 5 is the dispatch-table restructure and is gated on all prior phases.

### Phase 0 — Baseline confirmation (no code change)

1. Run `scripts/test.sh --layer=unit --no-coverage`. Record pass count.
2. Run `bun test:critical`. Record pass count.
3. Confirm line counts: `wc -l components/portal/visual-editor/BlockContentEditor.tsx` = 2018, `HtmlRenderEditor.tsx` = 1694.
4. Record baseline. Everything from Phase 1 onward must keep these tests green.

### Phase 1 — Extract HtmlRenderEditor sub-components

HRE is extracted first because its internals are all private to the file except `ImagePickerModal`, making import-surface changes minimal.

| Step | Action |
|---|---|
| 1a | Extract `ImagePickerModal` (lines 1331–1382) → `ImagePickerModal.tsx`. Update `VisualEditorShell.tsx` dynamic import path from `./visual-editor/HtmlRenderEditor` → `./visual-editor/ImagePickerModal`. |
| 1b | Extract `HtmlRenderTabbedForm` (lines 1609–1694) → `_components/html-render/HtmlRenderTabbedForm.tsx`. |
| 1c | Extract `SortableSchemaField` (lines 1389–1465) → `_components/html-render/SortableSchemaField.tsx`. |
| 1d | Extract `HtmlRenderAddFieldMenu` (lines 1546–1608) → `_components/html-render/HtmlRenderAddFieldMenu.tsx`. |
| 1e | Extract `HtmlRenderSubFieldsEditor` (lines 1466–1545) → `_components/html-render/HtmlRenderSubFieldsEditor.tsx`. |
| 1f | Extract `HtmlRenderFullJson` (lines 490–620) → `_components/html-render/HtmlRenderFullJson.tsx`. |
| 1g | Extract `HtmlRenderSchemaActions` (lines 1183–1330) → `_components/html-render/HtmlRenderSchemaActions.tsx`. |
| 1h | Extract `HtmlRenderArrayEditor` + `SortableArrayItem` (lines 1020–1182) → `_components/html-render/HtmlRenderArrayEditor.tsx`. |
| 1i | Extract `HtmlRenderPostPicker` (lines 817–903) → `_components/html-render/HtmlRenderPostPicker.tsx`. |
| 1j | Extract `HtmlRenderUrlAutocomplete` (lines 904–1019) → `_components/html-render/HtmlRenderUrlAutocomplete.tsx`. |
| 1k | Extract `HtmlRenderFieldInput` (lines 621–816) → `_components/html-render/HtmlRenderFieldInput.tsx`. |

**hooks fix required in step 1h or 1g:** Move `useSensors(useSensor(PointerSensor, ...))` from its current inline call at line 255 (inside the DndContext render) to the body of `HtmlRenderEditor` before the return. Update the mock path for `@dnd-kit/core` in `components-html-render-editor.test.tsx` if the hook moves into a different file than currently mocked.

**Verify:** `tsc --noEmit && scripts/test.sh --layer=unit --no-coverage`. Update `vi.mock` paths in `components-html-render-editor.test.tsx` for each moved component.

### Phase 2 — Extract BlockContentEditor shared utilities

Extract the reusable, non-block-specific internals. These are the components used across many block type cases.

| Step | Action |
|---|---|
| 2a | Extract `ListEditor` + `SortableListItem` (lines 1268–1437) → `_components/ListEditor.tsx`. Update import in `BlockContentEditor.tsx`. |
| 2b | Extract `ColumnsEditor` (lines 1438–1520) → `_components/ColumnsEditor.tsx`. |
| 2c | Extract `HtmlEmbedEditor` (lines 1143–1267) → `_components/HtmlEmbedEditor.tsx`. |
| 2d | Extract `SurveyResultsEditor` (lines 978–1142) → `_components/SurveyResultsEditor.tsx`. |

**Verify:** `tsc --noEmit && scripts/test.sh --layer=unit --no-coverage`. Update mock paths in `components-block-content-editor.test.tsx` and `block-content-editor-coverage.test.tsx` for each moved component.

### Phase 3 — Extract async pickers

The three async pickers share the same fetch-then-combobox pattern but are block-type-specific. Extract them as separate files (not merged, to preserve readability).

| Step | Action |
|---|---|
| 3a | Extract `BookingPagePicker` (lines 1522–1607) → `_components/pickers/BookingPagePicker.tsx`. |
| 3b | Extract `SurveyPicker` (lines 1608–1696) → `_components/pickers/SurveyPicker.tsx`. |
| 3c | Extract `ProductSlugPicker` (lines 1697–1806) → `_components/pickers/ProductSlugPicker.tsx`. |

**Verify:** `tsc --noEmit && scripts/test.sh --layer=unit --no-coverage`.

### Phase 4 — Extract complex block-specific editors

| Step | Action |
|---|---|
| 4a | Extract `MarqueeEditor` (lines 1807–1900) → `_components/MarqueeEditor.tsx`. |
| 4b | Extract `HeroSlideshowEditor` (lines 1901–2018) → `_components/HeroSlideshowEditor.tsx`. |

After this phase, `BlockContentEditor.tsx` contains only: imports + the `BlockContentEditor` dispatch function (~750 lines). `HtmlRenderEditor.tsx` contains only: imports + the `HtmlRenderEditor` main component (~180 lines).

**Verify:** `tsc --noEmit && scripts/test.sh --layer=unit --no-coverage && bun test:critical`.

### Phase 5 — Decompose the BCE dispatch table (optional, highest leverage, most invasive)

The remaining ~750-line dispatch if-tree in `BlockContentEditor.tsx` is still a single function with 50 block type cases. This phase groups cases into category-panel modules.

**Proposed groupings (7 files):**

| File | Block types |
|---|---|
| `_components/block-panels/ContentPanel.tsx` | heading, text, quote, code, spacer, divider |
| `_components/block-panels/MediaPanel.tsx` | image, video, youtube, gallery |
| `_components/block-panels/HeroPanel.tsx` | hero, hero-slideshow, cta, marquee |
| `_components/block-panels/LayoutPanel.tsx` | columns, section |
| `_components/block-panels/MarketingPanel.tsx` | stats, card-grid, flip-card-grid, metric-cards, logo-strip, services-grid, featured-content, bento-grid, team-showcase, team-flip-grid, testimonial |
| `_components/block-panels/CommercePanel.tsx` | product-grid, featured-products, product-categories, shopping-cart, store-banner, product-detail |
| `_components/block-panels/SpecialPanel.tsx` | booking, survey, popup, deck-next-slide, deck-jump-to, booking-menu, social-links, timeline, accordion, tabs, sticky-scroll-tabs, blog-posts, survey-results, html-embed, html-render, site-footer |

The `BlockContentEditor` function becomes a lookup table mapping `block.type` to the appropriate panel component. Each panel component receives `(block, onUpdate, siteId)` — same props as the current if-tree cases.

**Verify:** `tsc --noEmit && scripts/test.sh --layer=unit --no-coverage && bun test:critical`. Update mock paths in test files for each moved panel group.

---

## Risks & Non-Goals

### Risks

- **Stale `vi.mock` paths**: The unit test files mock at absolute import paths. Any file moved to a new path requires updating the mock call. A stale mock silently passes with no coverage of the moved code. **Mitigation:** Update `vi.mock(...)` in the same commit as each extraction; grep for the old path before closing the step.
- **Rules-of-hooks violation in HRE**: The `useSensors(useSensor(...))` call at line 255 of `HtmlRenderEditor.tsx` is inside a conditional render block (a `<details>` section). It is currently inside the component body but below a conditional, which violates rules-of-hooks. Moving the related code to a sub-component is the cleanest fix: move the DndContext for schema reordering into `HtmlRenderSchemaActions` and hoist `useSensors` to the top of that component. **Mitigation:** Do not split the `useSensors` call from its DndContext when extracting.
- **Dynamic import path for `ImagePickerModal`**: `VisualEditorShell.tsx` uses `dynamic(() => import('./visual-editor/HtmlRenderEditor').then(m => ({ default: m.ImagePickerModal })))`. If `ImagePickerModal` is moved, the dynamic import path must be updated in the same commit. A wrong path causes a runtime error on the first image swap. **Mitigation:** Grep for the dynamic import; update it atomically with the move.
- **`coalesce` flag on `BLOCKS_UPDATE`**: The `coalesce` prop threads through onChange calls in settings panels (e.g., slider inputs in `HeroSlideshowEditor`, `ColumnsEditor`). Extracting these components must not lose the coalesce forwarding. **Mitigation:** Props and prop types are copied verbatim during extraction; no logic changes.
- **TypeScript path aliases**: All new `_components/` files must use `@/components/portal/visual-editor/_components/...` imports consistently. The `tsconfig.json` `@/` alias covers `./` from the root; no new alias config needed.

### Non-Goals

- **No behavior changes.** This spec covers structural moves only. Zero UX or logic changes.
- **No postMessage protocol changes.** `types/visual-editor.ts` and `lib/visual-editor/protocol.ts` are untouched.
- **No new block types.** Block type authoring uses `simplerdev-block-type` skill after this spec is complete.
- **No test rewrites.** Existing tests must continue to pass. Mock paths are updated mechanically; test logic is not changed.
- **No `_hooks/` changes.** Existing hooks (`useBlockClipboard`, `useBulkActions`, `useLayersDragDrop`, `usePanZoom`) are already extracted and are not part of this spec.
- **No production renderer changes.** `app/sites/` rendering is untouched.

---

## Effort

**M** (~3–5 engineer-days: Phases 0–4 are mechanical with good test coverage; Phase 5 adds a day for the dispatch restructure and its mock-path cascade).

Phases 0–4 can be executed by a Sonnet-tier worker following this spec without judgment calls. Phase 5 should be reviewed before merge.
