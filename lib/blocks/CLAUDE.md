# lib/blocks — Agent Notes

The block registry + supporting schemas for the visual editor. Blocks are the JSON cells that fill `posts.content`.

> Token budget: keep this file <80 lines. Body lives in `@docs/guides/BLOCK_EDITOR_GUIDE.md`.

## What lives here

- `registry.ts` — `BUILT_IN_BLOCK_TYPES` (see the array for the current count — don't hardcode it here, it drifts). The canonical list of user-pickable block types. Each entry has `{ type, label, icon, category, description, emailOnly? }`.
- `defaults.ts` — default field values when a block is inserted.
- `html-render-*.ts` — the `html-render` block's template/loops/schema/validation (Mustache-style author-friendly templates that render server-side).
- `prefetch-embeds.ts` — link/embed metadata prefetch.
- `template-wrap.ts` — wraps user-authored HTML with sandboxing/normalization.

## The cardinal rule

**Blocks are UNIVERSAL — never client-specific.** A new block is added in lockstep across:

1. TS interface in `types/blocks.ts`
2. Registry entry here in `registry.ts`
3. Render component in `components/blocks/`
4. Production renderer case in `app/sites/...`
5. `/api/blocks` metadata

The `simplerdev-block-type` skill produces all five together. **Use it. Do not hand-roll** — every block we have ever hand-rolled has missed at least one of the five.

DATA-DRIVEN blocks (no authored content of their own — `navigation` is the pattern) fetch client-side via a server action instead of reading fields off the block JSON, so edits elsewhere (e.g. the nav manager) propagate without a republish. See `components/blocks/render/NavigationBlockRender.tsx`.

## Material Icons (not emojis) — but in the `icon:` field, use the icon NAME ('title', 'image', etc.), not the rendered glyph.

## Email-only blocks

`emailOnly: true` filters out of page/site pickers; email-campaign UI shows them. Don't add page-only logic the same way — if a block can run on a page it can run anywhere except email; the toggle is one-directional.

## Public-page bundle weight (PUX-241) — every tenant visitor pays for a static import

`BlockRenderer` and the container blocks (`Section`/`Columns`/`Tabs`) are client components on the public tenant tree, so a **static import of a block renderer ships (and evaluates) its whole dependency graph on every page that has even one block**. Measured on a one-paragraph page: framer-motion (via `ui/Card`, 134 KB raw) and the sanitize-html stack (postcss + htmlparser2 + entities, 171 KB raw) rode in on blocks that page did not contain; mobile cost is ~2.3 ms per KB evaluated.

- A block with a heavy dependency (animation lib, sanitizer, Stripe, editor context) goes in `components/blocks/render/lazy-blocks.tsx` (`next/dynamic`) and **every** dispatcher imports it from there — `BlockRenderer`, `SectionBlockRender`, `ColumnsBlockRender`, `TabsBlockRender`. Lazy in one dispatcher and static in another gains nothing.
- `dynamic()` only splits when it is declared in a **client** module. Declared in a server component (a layout or page), the target becomes a client reference of that route segment and its chunks load on every request whether rendered or not — see `components/AppChromeShell.tsx` and `components/sites/LazySiteViews.tsx` for the working shape.
- Never import `@sentry/*` statically from client code; go through `lib/sentry-lazy.ts`.
- Public renderers must not import `contexts/BlockEditorContext` (immer + history stack); use `BlockEditorContext.shared`.
- Known remaining cost: `html-render` / `html-embed` stay static (LCP), and `lib/security/sanitize-html` + `lib/blocks/html-render-template` run in the browser during hydration even though React discards the result. Removing it needs server-side sanitisation (an architecture call), not another `dynamic()`.

## Workflow

| Task | Use |
|---|---|
| New block type | `simplerdev-block-type` skill |
| Visual exploration first | `huashu-design` skill — produces HTML mockups, NOT block JSON. Translation to typed blocks is manual. |
| Block-editor audit | `block-orchestrator` + `block-implementer` subagents (one block per commit) |

## Pointers

- `@docs/guides/BLOCK_EDITOR_GUIDE.md` — block JSON schema, examples, troubleshooting
- `@types/blocks.ts` — block type definitions (TypeScript)
- `app/api/blocks/` — `/api/blocks` metadata endpoint
- `components/blocks/` — render components
- `components/portal/visual-editor/CLAUDE.md` — editor side
