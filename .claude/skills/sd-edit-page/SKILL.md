---
name: sd-edit-page
description: Revise an existing CMS page (blog post, landing page, marketing page) in the SimplerDevelopment portal via the postcaptain MCP. Three modes — `replace` (swap the whole block tree), `patch` (target a specific block or field via JSON Pointer), `prose` (rewrite text fields, keep structure). Resolves the target by `postId`, `slug`, `url`, or natural-language hint. For published pages, defaults to `posts_fork` so the live version stays live until approval; for drafts, edits in place. Each edit mints a fresh approval URL. Use when the user says 'edit the about page', 'update the hero on /pricing', 'fix the typo on the landing page', 'rewrite section 3 of the proposal', 'tone down the homepage', 'swap the headline on /services'. Requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, WebFetch, Glob, Grep
---

# sd-edit-page

Revise an existing CMS page in the portal. Resolve the target, pick the right edit mode, apply the change via MCP, mint a fresh approval URL, and report exactly what changed.

This is the edit-counterpart of `sd-create-page`. Almost every rule in `sd-create-page` (brand voice, contrast, accessibility, 5-dimension review) applies on edit too — you are not exempt from those just because you're editing rather than creating.

## Pre-flight

1. **Read `.sd/config.json`** from the **current repo root** (resolve via `git rev-parse --show-toplevel`, then look for `.sd/config.json` under it). DO NOT read configs from sibling worktrees — sd2026 commonly has many of them and reading a stale one will silently scope the edit to the wrong tenant. If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed — every step depends on the client/brand/site already being resolved.
2. **Verify the tenant matches the user's intent.** If the user named a specific client in their request (e.g., "edit on sd-testings"), confirm `.sd/config.json:client.slug` equals that name. If it doesn't, STOP and tell the user to run `sd-init` for the right tenant — do NOT auto-switch and do NOT pick a different post under a different client.
3. **Read brand messaging** from `.sd/config.json:brand.messaging`. The edit must keep brand voice consistent.
4. **Read `.claude/skills/SD_DESIGN_PRINCIPLES.md`** (located at the repo root's `simplerdevelopment2026/.claude/skills/SD_DESIGN_PRINCIPLES.md`). The same anti-AI-slop, WCAG-AA, 8pt grid, branded-logo, and 5-dimension self-review rules apply on edit.
5. **Read `.sd/learnings.md`** if it exists — apply its `## Active rules` to the edit. If a prior round of feedback recorded "user wants shorter headlines on landing pages," respect that on this edit even if the user didn't repeat it.

## Resolve the target — DO NOT guess

The user will name the page somehow. Resolve to a concrete `postId` before any other step.

In priority order:
1. **`postId` (number)** — use directly.
2. **`slug` (string)** — call `posts_list` filtered by slug + the `defaultSiteId` from `.sd/config.json`. Expect 0 or 1 match.
3. **`url` (string, e.g. `/about` or `https://example.com/about`)** — strip to the slug, then look up as above.
4. **Natural-language hint (e.g. "the about page", "the proposal landing")** — call `posts_list` with `q: <hint>` and the site filter. If 0 matches, ask the user to clarify or provide an explicit slug. If >1 match, list them with title + slug + last-updated and ask the user to pick.

**Site scope caveat.** `posts_list` is scoped to `defaultSiteId` from `.sd/config.json`. A client can own multiple sites; if the page the user wants lives on a sibling site, the lookup will return 0 matches. When that happens, do NOT silently broaden the search — tell the user: "I'm scoped to site `<siteName>`. If the page lives on a different site, give me the site slug or rerun `sd-init` to switch."

**Always echo back the resolved target before editing:**
> "Editing post #123 — *About Us* (slug `/about`), published, last updated 2026-05-12, on site `<siteName>` for client `<clientSlug>`. Proceeding with `prose` mode."

This gives the user a chance to abort if you matched the wrong page.

## Pick the edit mode

If the user's instruction already implies a mode, use it. Otherwise ask. The three modes:

- **`replace`** — rare. Use only when the user explicitly wants the page rewritten from scratch ("rebuild this page", "start over"). Compose new blocks via `sd-create-page` logic (brand voice, contrast checks, design review) and pass the new `blocks[]` to `posts_update`.
- **`patch`** — most common for structural edits. Target a specific block or field via JSON Pointer (see below). Examples: "swap the hero image", "change the CTA label to 'Get a quote'", "remove the third testimonial".
- **`prose`** — most common for tone / copy edits. Walk every text-bearing field, apply the LLM revision per-field, preserve structure. Examples: "make this more casual", "tone down the marketing speak", "shorten everything by 20%".

Default when ambiguous: ask. Don't silently pick — picking wrong destroys structure or wastes effort.

## JSON Pointer addressing (RFC 6901)

Patch mode uses JSON Pointers into the fetched post shape:

```
/title                          # post.title
/excerpt                        # post.excerpt
/seoTitle                       # post.seoTitle
/blocks/0                       # the first block (whole)
/blocks/3/fields/headline       # one field on the fourth block
/blocks/3/style/color           # one style property on the fourth block
/blocks/2/ctaText               # the CTA label on a hero
```

Index by `0`-based position in the `blocks[]` array. Field names match the typed block schema in `lib/blocks/registry.ts`. If you don't know the right pointer, fetch the post first (`posts_get` with `includeContent: true`), inspect the shape, then construct the pointer.

Operations supported:
- `replace` — set the value at the pointer to a new value
- `add` — insert into an array (`/blocks/-` appends; `/blocks/2` inserts before index 2)
- `remove` — delete the value at the pointer

Apply the operation client-side to the fetched blocks tree, then send the FULL updated `blocks[]` to `posts_update`. There is no server-side block patch primitive; the round-trip is `posts_get → mutate → posts_update`.

## Prose mode — what counts as "prose"

Text-revisable fields (rewrite these in prose mode):
- Top-level: `title`, `excerpt`, `seoTitle`, `seoDescription`
- Per-block: `text`, `headline`, `subheadline`, `subtitle`, `description`, `label`, `richtext`, `body`, `caption`, `alt`, `ctaText`, `ctaLabel`, `eyebrow`

NOT revised in prose mode (preserve verbatim):
- Identifiers: `id`, `slug`, `postId`, `type`, `order`, `width`
- URLs / hrefs: `url`, `href`, `ctaLink`, `linkUrl`, `videoUrl`, `embedCode`, `image`, `logoUrl`
- Style: `style`, `elementStyles`, `color`, `fontSize`, `fontWeight`, `letterSpacing`, `padding`, `margin`
- Layout / schema: `columns`, `alignment`, `theme`, `variant`

If a block has an `alt` field on an image, prose mode SHOULD revise it (alt text is content, not URL). If unsure, leave it alone.

## Pick the live-edit strategy

| Source state | Default strategy | Approval URL? |
|---|---|---|
| `published: false` (draft) | In-place via `posts_update` | Yes — same as create flow |
| `published: true` | `posts_fork` then edit the fork | Yes — approval merges fork back |
| User explicitly says "edit live" / "in place" / "no fork" | `posts_update` on the live row | Yes — but warn loudly first |

**The published-page default is to fork.** A live page should not silently mutate. The fork:
- Duplicates the post into a new draft with `parent_post_id` set
- Returns a new id + an approval URL
- Approval merges the fork back over the parent's live state (last-write-wins against the parent's live row)

Editing in place on a published page is supported but the skill should warn the user once before doing it:
> "You're about to edit a live page directly — no fork. Existing visitors may see the change immediately. Continue?"

## Conflict check

Before the update, refetch the target's `updated_at` via `posts_get` (use a slim projection — `includeContent: false`). If `updated_at` is newer than what you saw at resolve-time AND wasn't caused by your own edits in this same skill run, prompt:

> "This page was edited at 2026-05-15 14:32 (between our resolve and update) — proceed and overwrite, fork instead, or abort?"

Conflict checking matters most for live edits; less so for drafts edited only by an agent.

## MCP calls

### Resolve
- `mcp__simplerdevelopment-postcaptain__posts_list` — for slug / hint resolution. Filter by `siteId`. Use `q` for fuzzy hint search.

### Fetch
- `mcp__simplerdevelopment-postcaptain__posts_get` with:
  ```json
  { "id": <postId>, "includeContent": true }
  ```
  Use `includeContent: true` ONLY at fetch time; you need the body to edit it. The token-budget rule still applies to the echo on update — keep `includeContent: false` on the update response.

### Fork (for published pages, default)
- `mcp__simplerdevelopment-postcaptain__posts_fork` with:
  ```json
  { "id": <postId>, "titleSuffix": " (revision)" }
  ```
  Returns the new draft id + an approval URL. Use the new id for the subsequent update.

  **Then immediately re-fetch the fork's content before patching.** Call `posts_get(newId, includeContent: true)`. The fork may have transformed fields the parent fetch didn't expose — regenerated block `id`s, the title-suffix appended, a fresh slug. Apply your patch against THAT shape, not against the blocks you fetched from the parent earlier. Failing to re-fetch causes silent block-id collisions and lost edits.

### Update
- `mcp__simplerdevelopment-postcaptain__posts_update` with:
  ```json
  {
    "id": <targetId>,
    "title": "<new title or omit>",
    "blocks": [<full updated blocks array>],
    "excerpt": "<updated or omit>",
    "includeContent": false
  }
  ```
  Pass ONLY the fields that changed (plus `id`). The MCP echo is slim by default. Each update mints a fresh approval URL.

### Revision history (optional check)
- `mcp__simplerdevelopment-postcaptain__posts_list_revisions` — useful when the user asks "what changed last on this page" or "roll back to last week's version".

## Authoring discipline on the edit

Even though this is an edit, not a create, the authoring rules from `sd-create-page` apply to whatever NEW content you write:

- **Brand voice on new prose.** Match the brand messaging.
- **Contrast on any color you change.** Run `branding_check_contrast` for any text/bg pair you adjust.
- **Block schema compliance.** If you add or modify a block, the result must satisfy the schema in `lib/blocks/registry.ts`.
- **5-dimension self-review** if the edit is non-trivial (replace mode, multi-block patch, prose-mode whole-page). For a single-field tweak, the self-review is overkill — skip.

## Output

Return to the user:
- The post id (or new fork id if you forked)
- The portal edit URL: `/portal/websites/<siteId>/posts/<id>/edit`
- The **approval URL** for the latest mint
- A precise diff summary: what mode, which fields/blocks changed, what new text replaced what old text (truncate to 80 chars per field for readability)
- If you forked: explicitly note that the live page is unchanged until the approval is approved
- Any contrast / design-review observations you made on the way

Example:
> Edited post #123 (*About Us*, slug `/about`) via **fork → patch**.
> Fork id: #189 (parent #123). Live page unchanged until approval.
>
> Changes:
> - `/blocks/0/title`: "About SimplerDevelopment" → "Why SimplerDevelopment"
> - `/blocks/0/ctaText`: "Learn more" → "See our work"
>
> Approval URL: https://simplerdevelopment.com/approve/abc123…
> Edit again: `/portal/websites/1/posts/189/edit`

## Iteration

If the user wants more edits on the same target:
- If you're already editing a fork, keep editing the FORK (don't fork the fork). Each `posts_update` mints a fresh approval URL.
- If the user wants a parallel variant ("can I see this with a different headline too?"), call `posts_fork` on the original — that gives a second parallel draft.
- If the user wants to revert: `posts_list_revisions` to find the prior state, then `posts_update` with the older blocks.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **Target not found** (no post matches the slug / url / hint) → ask the user for the correct slug or `postId`.
- **>1 match on hint** → list candidates with title + slug + last-updated, ask user to pick.
- **Permission denied on `posts_update`** → the resolved post belongs to a different client. Re-check `.sd/config.json` is pointing at the right tenant.
- **Block schema violation in the update** → MCP rejects with a detailed error. Surface what was wrong (most often: missing `id` on a new block, missing `level` on a heading, unknown block `type`). Re-apply the patch correctly.
- **Conflict detected** (target `updated_at` moved between resolve and update) → see Conflict check above.
- **Fork created but update failed** → the fork is left as an empty draft. Tell the user the fork id so they can delete or salvage it manually. Do NOT silently abandon.

## When NOT to use this skill

- **New page from scratch** → `sd-create-page`.
- **Major rework where the original should be preserved as a parallel variant** → `sd-create-page` for the new variant (`titleSuffix: ' v2'` convention). Cleaner history than an edit.
- **Editing a pitch-deck slide** → `sd-edit-deck` (when it exists). Pages and decks have different shapes; don't reach into deck slides from this skill.
- **Editing email-campaign content** → `sd-edit-email` (when it exists).
- **Editing html-render block JSON only** → `html-render-block` — it's purpose-built for `{ type: "html-render" }` block JSON manipulation.
- **Hands-on visual tweaks** → the visual editor at `/portal/websites/<siteId>/posts/<id>/edit` is faster than any agent for hand-fitting design.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-edit-page" ~/.claude/skills/sd-edit-page
```
