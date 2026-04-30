---
name: simplerdev-visual-editor
description: Research, audit, debug, and improve the SimplerDevelopment2026 CMS visual editor — the block-based page builder for client websites. Covers the iframe preview, selection/resize overlays, drag-and-drop, style sidebar, block registry, postMessage protocol, and rendering pipeline. Use when the user says 'improve the editor', 'fix editor bug', 'audit the visual editor', 'editor feels slow/broken', 'add feature to block editor', 'selection/drag/style/layers panel', or any work scoped to app/portal/websites/[siteId]/posts/[id]/edit and the supporting components/lib files.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, mcp__chrome-devtools__new_page, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__select_page, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__click, mcp__chrome-devtools__list_console_messages
---

# simplerdev-visual-editor

Focused skill for improving the SimplerDevelopment CMS visual editor. Use one of four modes: **Research**, **Audit**, **Debug**, or **Implement**. Always read the anchor files first — the editor has non-obvious invariants.

## Surface map (know this before touching anything)

The editor is split across **parent window** (editor chrome) and **iframe** (live site + block overlays). Communication is one-way messaging via `postMessage`, not shared state.

| Role | File | Purpose |
|------|------|---------|
| Shell (parent) | `components/portal/VisualEditorShell.tsx` (2745 lines) | Canvas zoom/pan, iframe host, toolbar, style sidebar, layers panel |
| Post form (parent) | `components/portal/PortalPostForm.tsx` (2076 lines) | Outer form, autosave, iframe src, preview mode toggle, save triggers |
| Parent hook | `lib/visual-editor/useVisualEditorParent.ts` | Sends messages to iframe, receives events, manages ready state |
| Protocol | `lib/visual-editor/protocol.ts` | `sendToParent` / `sendToIframe`, origin validation |
| Message types | `types/visual-editor.ts` | `PARENT_MESSAGES` / `IFRAME_MESSAGES` string unions |
| Iframe hook | `lib/visual-editor/useEditorMode.ts` | Iframe-side editor state, receives parent messages, tracks selection/hover/history |
| Iframe renderer | `components/blocks/render/EditableBlockRenderer.tsx` (848 lines) | dnd-kit wrap, nested container handling, selection wiring |
| Selection overlay | `components/visual-editor/SelectableBlock.tsx` (750 lines) | Blue outline, resize handles, spacing handles, context menu, drag handle |
| Column overlay | `components/visual-editor/ColumnsEditorOverlay.tsx` | Column separator drag, gap control |
| Editor context | `components/visual-editor/EditorModeProvider.tsx` | React context that tells blocks they're in edit mode |
| Style application | `components/blocks/render/BlockStyleWrapper.tsx` | Applies `block.style` as inline CSS on a wrapper `<div>` |
| Block registry | `lib/visual-editor/registry.ts` + `/api/blocks` | Map of block type → React component, input schemas |
| Block type defs | `types/blocks.ts` (1015 lines) | Every block shape lives here |

## Hard invariants — break these and things silently fail

1. **Two worlds, one source of truth.** The parent holds canonical `blocks[]` state; the iframe mirrors it. Iframe never calls the API directly. The iframe sends intent (`BLOCK_CLICKED`, `BLOCK_STYLE_UPDATED`), parent mutates, parent sends `BLOCKS_UPDATE` back.
2. **iframe reloads are destructive.** Full src change → scroll position, selection, in-progress text edits all lost. Only change src on manual save or preview-mode toggle. Autosave must NEVER bump `iframeSaveVersion` (see `PortalPostForm.tsx` — previously caused scroll-to-top during editing).
3. **Origin validation is strict.** `protocol.ts` allows localhost:*, 127.0.0.1:*, *.simplerdevelopment.com, *.up.railway.app. New staging/prod domains need to be added there or messages drop silently.
4. **`block.style` wraps the block, not its inner elements.** `BlockStyleWrapper` renders a `<div style={...}>` around the block. Setting `padding` on `block.style` pads the wrapper, not the button inside. For inner elements, use `elementStyles.<part>` if the block component supports it, or set via branding (`siteBranding.buttonStyle`).
5. **Selection outline wraps the SelectableBlock div.** To make the outline match a block's actual width, sizing styles (`width`, `height`, `maxWidth`, etc.) must be forwarded to `SelectableBlock` via the `sizeStyle` prop — NOT left only on `BlockStyleWrapper`. If a block looks selected-wider-than-rendered, check that `EditableBlockRenderer.tsx` passes `sizeStyle={liveBlock.style ? { ... } : undefined}`.
6. **`customCSS` on styles is a raw CSS string, parsed and applied inline.** Use it for things not in the structured style schema (text-shadow, backdrop-filter, background-blend-mode, filters). Parsed via semicolon split in `BlockStyleWrapper.tsx`.
7. **ContentEditable owns text-block content while selected.** Don't re-render text content from props when a block is being actively edited — it nukes caret position. See `SelectableBlock.tsx` `EditableContent` for the pattern.
8. **Section blocks skip the default content wrapper.** Non-section blocks get auto-wrapped in `max-w-7xl mx-auto px-4`. Sections render their own full-width bg + inner container. Mixing the two wrongly leads to either edge-touching content on mobile or double-constrained content.

## Modes

### Research mode

When asked to improve the editor or benchmark against best-in-class:

- Target editors to study: **Framer**, **Webflow**, **Plasmic**, **Builder.io**, **Sanity Studio presentation**, **Notion**, **Figma** (selection + multi-select patterns).
- Focus on 6 pillars: (1) selection/multi-select, (2) drag/drop fluidity, (3) style sidebar organization, (4) keyboard shortcuts, (5) inline text editing, (6) responsive preview switching.
- Use WebFetch or `last30days` skill to pull recent posts about each editor's strengths/weaknesses.
- Output: a gap analysis comparing our editor to the benchmark set, ordered by impact-per-effort.

Do NOT propose adding features we can't scaffold in the current architecture (e.g., "real-time multiplayer" is out of scope — no CRDT layer exists).

### Audit mode

When asked to audit the editor for issues, systematically check:

1. **Open the editor** in Chrome DevTools: navigate to `https://staging.simplerdevelopment.com/portal/websites/<siteId>/posts/<postId>/edit` (or localhost).
2. **Console audit.** `mcp__chrome-devtools__list_console_messages` — look for warnings (ContentEditable conflicts, React key warnings, postMessage origin errors).
3. **Interact + record.** Click a block, resize it, edit text, drag-reorder, undo, toggle preview mode, switch viewport. Screenshot at each step.
4. **Scroll position survival.** Scroll the iframe down, edit a style. Does scroll reset? If yes, something is bumping `iframeSaveVersion` during autosave — bug.
5. **Selection accuracy.** Pick a block with `width: 500px` set. Does the blue outline match the rendered width? If no, `sizeStyle` prop not flowing through — check `EditableBlockRenderer.tsx`.
6. **Text edit fidelity.** Double-click a text block, type, press undo in the parent toolbar. Did the text restore correctly or did the caret jump?
7. **Nested drag.** Drag a block OUT of a columns block into a sibling section. Does the drop zone show correctly? Does dnd-kit preserve order?
8. **Mobile viewport.** Switch to mobile preview. Do sections collapse? Do columns stack via `stackOnMobile`? Do fonts scale?
9. **Performance.** Open a page with 50+ blocks. Is drag laggy? `take_memory_snapshot` + `performance_start_trace` during drag to diagnose.

Output: ranked bug list with file:line references and concrete fixes.

### Debug mode

When a specific editor bug is reported:

1. **Ask for the reproduction steps verbatim** — don't guess.
2. **Classify by layer:**
   - Parent state bug → inspect `PortalPostForm.tsx` + `useVisualEditorParent.ts`
   - Iframe state bug → inspect `useEditorMode.ts`
   - Protocol bug (message not arriving) → inspect `protocol.ts` + check origin allowlist + browser console for postMessage errors
   - Rendering bug → inspect the specific block component in `components/blocks/` or `BlockStyleWrapper.tsx`
   - Selection/resize bug → inspect `SelectableBlock.tsx`
   - Drag/drop bug → inspect `EditableBlockRenderer.tsx` dnd-kit setup
3. **Reproduce in Chrome DevTools** if at all possible before editing code. Screenshots + console messages > guessing.
4. **Check recent commits** — many editor bugs are regressions. `git log --oneline -- components/visual-editor/ lib/visual-editor/ components/portal/VisualEditorShell.tsx components/portal/PortalPostForm.tsx`
5. **Fix at the correct layer.** If a block renders wrong, fix the block, not the style wrapper. If selection is wrong, fix `SelectableBlock`, not the block.
6. **Verify the fix visually in the browser** before claiming done.

Common bug patterns and where they live:

| Symptom | Usual cause | Look here |
|---------|------------|-----------|
| iframe scrolls to top during editing | autosave bumps `iframeSaveVersion`, changes src | `PortalPostForm.tsx` — save trigger check |
| Selection outline wider than block | sizing styles not forwarded to `SelectableBlock` | `EditableBlockRenderer.tsx` `sizeStyle` prop |
| Style sidebar changes don't apply | wrong style layer (block.style vs elementStyles vs branding) | `BlockStyleWrapper.tsx` + block component |
| Text edits revert on blur | `EditableContent` not committing via BLOCK_CONTENT_UPDATED | `SelectableBlock.tsx` EditableContent |
| Undo loses selection | selection not restored from history snapshot | `useEditorMode.ts` history reducer |
| Drag drops in wrong place | dnd-kit collision detection | `EditableBlockRenderer.tsx` `collisionDetection` |
| Columns resize snaps back | `COLUMN_RESIZED` not reaching parent | `ColumnsEditorOverlay.tsx` + origin allowlist |
| Material icons missing in editor | editor iframe missing icon font `<link>` | site layout / branding provider |
| Block looks different in editor vs published | BrandingProvider not applied in editor iframe | check iframe URL includes `_edit=true` path that still injects branding |

### Implement mode

When adding a new editor feature:

1. **Determine the boundary.** Is this a parent-side concern (toolbar button, sidebar panel, modal) or iframe-side (new overlay, selection behavior, inline editor)? The split matters — wrong side = broken messaging.
2. **Add a message type if crossing the boundary.** Append to `PARENT_MESSAGES` or `IFRAME_MESSAGES` in `types/visual-editor.ts`. Use SCREAMING_SNAKE_CASE. Add a TypeScript payload interface.
3. **Wire the sender.** Parent→iframe: add a function to `useVisualEditorParent.ts` that calls `sendToIframe`. Iframe→parent: add a `sendToParent` call at the event source + a handler in `useVisualEditorParent.ts`.
4. **Wire the receiver.** The other side listens via a `useEffect` that adds a `message` listener, filters by `source === 'sd-editor-*'`, and dispatches by `type`.
5. **Do NOT add new iframe reload triggers.** Prefer postMessage. The iframe `src` should only change on save+publish/preview-toggle/viewport-switch.
6. **Test in both modes.** Edit mode (`_edit=true`) AND preview mode (`_preview=true`) must both work.
7. **Keyboard shortcut?** Add to the shortcut handler in `VisualEditorShell.tsx`. Convention: modifier keys are Cmd on Mac, Ctrl on Windows — use `event.metaKey || event.ctrlKey`.

Adding a new **block type** has its own sub-flow (out of scope for this skill — use `simplerdev-feature-scaffold`'s block variant if one exists, or: add interface to `types/blocks.ts` → add component under `components/blocks/<type>/` → register in `/api/blocks` → add render case in `components/blocks/render/` → add default values in the block picker).

## Design principles for the editor

1. **Selection feedback must be instant.** <50ms from click to outline. Any work that can wait for the next paint must.
2. **Scroll position is sacred.** Autosave, style edits, selection — none of these should ever move the canvas. A reload is the only acceptable scroll reset trigger.
3. **Keep the iframe dumb.** The iframe is a display surface + event emitter. Business logic belongs in the parent. Rehydrating the iframe on reload should be cheap.
4. **Progressive disclosure in the sidebar.** Start collapsed. Most blocks need 2–3 common controls visible, not 20. Advanced controls go behind an accordion.
5. **Zero-layout-shift.** When the user changes a padding value, the rest of the page doesn't jump. Use optimistic updates with the selection pinned to the block.
6. **Respect OS conventions.** Cmd/Ctrl+Z for undo, Cmd/Ctrl+D for duplicate, Delete for remove. Don't invent shortcuts.
7. **Material Icons, never emojis.** User rule — already documented in auto-memory (`feedback_no_emojis.md`).

## Anti-patterns (don't do these)

- Don't poll the iframe for state — use postMessage events.
- Don't serialize the entire block tree on every keystroke — batch via the 2s autosave debounce.
- Don't use `window.location.reload()` from inside the iframe — the parent owns reload.
- Don't bypass `BlockStyleWrapper` by setting styles directly on block components — loses edit-mode overrides and branding sentinels.
- Don't introduce a new state library (Zustand, Jotai, Redux). The editor uses React state + refs + postMessage; keep it coherent.
- Don't add a second source of truth for blocks (e.g., a local `blocksRef` that diverges from parent state).

## Verification checklist before claiming a fix/feature is done

- [ ] Tested in browser (not just `tsc` / test suite passing)
- [ ] Selection, hover, drag, undo, autosave all still work
- [ ] Both edit mode AND preview mode work
- [ ] No new console warnings/errors
- [ ] Scroll position preserved during normal editing
- [ ] No new `iframe.src` changes added without strong reason
- [ ] Mobile and tablet viewports still render correctly
- [ ] At least one real block type (not just test content) tested

## When to escalate / ask the user

- Bug reproduces only on a specific client site → ask for the post ID + site ID so you can inspect DB state.
- Symptoms suggest a migration is unapplied → ask before running migrations on staging/prod.
- Proposed change touches the postMessage protocol → ask, since external embedders/tests may rely on it.
- Fix requires changing block JSON shapes → ask, since old posts may break.

## Files you'll edit 90% of the time

- `components/visual-editor/SelectableBlock.tsx` — selection, resize, handles
- `components/blocks/render/EditableBlockRenderer.tsx` — renderer wiring
- `components/blocks/render/BlockStyleWrapper.tsx` — style application
- `components/portal/VisualEditorShell.tsx` — toolbar, sidebar, canvas chrome
- `components/portal/PortalPostForm.tsx` — autosave, iframe src, save triggers
- `lib/visual-editor/useEditorMode.ts` — iframe-side state
- `lib/visual-editor/useVisualEditorParent.ts` — parent-side state
- `types/visual-editor.ts` — message types
- `types/blocks.ts` — block type defs
