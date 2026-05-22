# lib/blocks — Agent Notes

The block registry + supporting schemas for the visual editor. Blocks are the JSON cells that fill `posts.content`.

> Token budget: keep this file <80 lines. Body lives in `@BLOCK_EDITOR_GUIDE.md`.

## What lives here

- `registry.ts` — `BUILT_IN_BLOCK_TYPES` (currently 47 entries). The canonical list of user-pickable block types. Each entry has `{ type, label, icon, category, description, emailOnly? }`.
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

## Material Icons (not emojis) — but in the `icon:` field, use the icon NAME ('title', 'image', etc.), not the rendered glyph.

## Email-only blocks

`emailOnly: true` filters out of page/site pickers; email-campaign UI shows them. Don't add page-only logic the same way — if a block can run on a page it can run anywhere except email; the toggle is one-directional.

## Workflow

| Task | Use |
|---|---|
| New block type | `simplerdev-block-type` skill |
| Visual exploration first | `huashu-design` skill — produces HTML mockups, NOT block JSON. Translation to typed blocks is manual. |
| Block-editor audit | `block-orchestrator` + `block-implementer` subagents (one block per commit) |

## Pointers

- `@BLOCK_EDITOR_GUIDE.md` — block JSON schema, examples, troubleshooting
- `@types/blocks.ts` — block type definitions (TypeScript)
- `app/api/blocks/` — `/api/blocks` metadata endpoint
- `components/blocks/` — render components
- `components/portal/visual-editor/CLAUDE.md` — editor side
