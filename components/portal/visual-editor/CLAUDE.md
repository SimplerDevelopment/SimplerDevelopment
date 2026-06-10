# components/portal/visual-editor — Agent Notes

The block-based page builder rendered at `app/portal/websites/[siteId]/posts/[id]/edit`. iframe preview + selection/resize overlays + postMessage protocol.

> Token budget: keep this file <80 lines.

## What lives here

- `BlockContentEditor.tsx` — top-level editor shell (2018 lines — **see god-file rule below**)
- `IframePreview.tsx` — sandboxed iframe holding the live block tree
- `LayersPanel.tsx` / `LeftPanel.tsx` / `RightPanel.tsx` — selection tree, picker, settings sidebar
- `ElementStyleEditor.tsx` — style sidebar (typography/spacing/background etc.)
- `HtmlRenderEditor.tsx` — author-friendly editor for `html-render` blocks (1694 lines)
- `BlockContextMenu.tsx` / `panel-fields.tsx` — context menu + reusable settings inputs
- `CollaborationProvider.tsx` / `PresenceLayer.tsx` / `PresenceCursor.tsx` / `PresenceAvatars.tsx` — multi-user presence
- `_hooks/` / `_lib/` — extracted hooks + helpers (start here for new logic — don't grow the shell)

## Cardinal rules

- **postMessage protocol is load-bearing.** Editor ↔ iframe communication has typed message shapes; never bypass with direct DOM access. New event types must be added to BOTH ends in the same commit.
- **Selection/resize overlays read from the iframe's layout.** They will desync if you mutate the iframe DOM outside the editor's update path.
- **New behavior goes in `_hooks/` or `_lib/`, NOT into the shell.** `BlockContentEditor.tsx` is already 2018 lines — every addition increases the cost of every future agent read.
- **Don't render blocks here.** Production rendering lives in `app/sites/`. This dir produces the editing chrome.

## God-file warning

Spawn an `Explore` subagent before opening these in the main thread:

- `BlockContentEditor.tsx` (2018)
- `HtmlRenderEditor.tsx` (1694)

A targeted Read with `limit:` + `offset:` is acceptable for surgical edits — full reads burn ~25k tokens each.

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
