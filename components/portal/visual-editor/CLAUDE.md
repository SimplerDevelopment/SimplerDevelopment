# components/portal/visual-editor — Agent Notes

The block-based page builder rendered at `app/portal/websites/[siteId]/posts/[id]/edit`. iframe preview + selection/resize overlays + postMessage protocol.

> Token budget: keep this file <80 lines.

## What lives here

- `BlockContentEditor.tsx` — top-level editor shell (117 lines; it is now a thin PANEL_MAP dispatcher, not the old 2018-line monolith)
- `IframePreview.tsx` — sandboxed iframe holding the live block tree
- `LayersPanel.tsx` / `LeftPanel.tsx` / `RightPanel.tsx` — selection tree, picker, settings sidebar
- `ElementStyleEditor.tsx` — style sidebar (typography/spacing/background etc.)
- `HtmlRenderEditor.tsx` — author-friendly editor for `html-render` blocks (488 lines)
- `BlockContextMenu.tsx` / `panel-fields.tsx` — context menu + reusable settings inputs
- `CollaborationProvider.tsx` / `PresenceLayer.tsx` / `PresenceCursor.tsx` / `PresenceAvatars.tsx` — multi-user presence
- `_hooks/` / `_lib/` — extracted hooks + helpers (start here for new logic — don't grow the shell)

## Cardinal rules

- **postMessage protocol is load-bearing.** Editor ↔ iframe communication has typed message shapes; never bypass with direct DOM access. New event types must be added to BOTH ends in the same commit.
- **Selection/resize overlays read from the iframe's layout.** They will desync if you mutate the iframe DOM outside the editor's update path.
- **New behavior goes in `_hooks/` or `_lib/`, NOT into the shell.** That extraction is what took `BlockContentEditor.tsx` from 2018 lines to 117; putting logic back in the shell undoes it.
- **Don't render blocks here.** Production rendering lives in `app/sites/`. This dir produces the editing chrome.

## God-file warning — RETIRED 2026-08-05

This section used to tell you to spawn a subagent before opening the editor
shell or the html-render editor, quoting them at roughly 2000 and 1700 lines.
Both were stale by a wide margin — they are 117 and 488 respectively — because
the `_hooks/` / `_lib/` extraction landed and nobody updated this file. Read
them directly.

It survived because `scripts/check-doc-drift.ts` only line-checks paths under a
recognised source root; a bare filename like `BlockContentEditor.tsx` was
skipped entirely. Fixed in the same commit — bare filenames now resolve against
the doc's own directory.

## Workflow

| Task | Use |
|---|---|
| Visual editor research / audit / debug | `simplerdev-visual-editor` skill |
| Adding selection/drag/style/layers feature | same skill — it has the protocol map |
| New block type (editor side) | `simplerdev-block-type` skill (handles render + editor in lockstep) |

## Pointers

- Block registry: `lib/blocks/CLAUDE.md`
- Block JSON schema: `@docs/guides/BLOCK_EDITOR_GUIDE.md`
- Editor route: `app/portal/websites/[siteId]/posts/[id]/edit/`
