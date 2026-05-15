---
name: sd-create-page
description: Draft a CMS page (blog post, landing page, marketing page) in the SimplerDevelopment portal via the postcaptain MCP. Produces a structured `blocks` array applying the default brand profile, reuses existing block_templates where possible, and returns a shareable approval URL so the author can hand it to a stakeholder for review before publish. Sourcing material is OPTIONAL and user-driven — the skill asks where to pull from if unclear (postcaptain-kb, an external URL, a pasted brief, or just the user's prompt). Use when the user says 'draft a page about X', 'create a CMS page for Y', 'make a landing page for Z', 'new blog post on W', 'write a marketing page'. Default mode publishes a DRAFT (`published: false`); a sd-init `.sd/config.json` is required.
user-invocable: true
allowed-tools: Read, Write, Bash, WebFetch, Glob, Grep
---

# sd-create-page

Draft a CMS page (blog post, landing page, marketing entry) in the portal. The page is created as a draft, an approval link is minted, and the URL is handed back so the author can share it with a reviewer.

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed — every step depends on the client/brand/site already being resolved.
2. **Read brand messaging** from `.sd/config.json:brand.messaging`. If `brand` is null, warn the user that output will use SD house defaults and proceed only if confirmed.
3. **Read `SD_DESIGN_PRINCIPLES.md`** (sibling skill doc). This is non-negotiable — it encodes the anti-AI-slop discipline, WCAG-AA contrast floors, 8pt grid, branded-logo policy, and the 5-dimension self-review the skill MUST run before returning the approval URL.
4. **Read `.sd/learnings.md`** if it exists — apply its `## Active rules` to authoring decisions. If a rule prohibits something the skill was about to do, surface explicitly ("learnings.md says X — adjusting Y accordingly").

## Sourcing — ASK if unclear

The user's prompt may already make the source obvious. Skip the question when it is. Otherwise ask which source the page should draw from:

- **`prompt-only`** — write from the user's prompt + brand voice. No external research.
- **`postcaptain-kb`** — mine the postcaptain-kb Obsidian vault (uses the same conventions as the `draft-blog-post` skill: `discoveries/`, `sources/`, vault search).
- **`url`** — fetch one or more URLs the user provides (WebFetch). Use for "turn this article into a landing page" or "competitor X published this — write our take".
- **`brief`** — read a local file path (markdown, txt) the user points to. Use for "use the brief at `./briefs/foo.md`".
- **`mixed`** — any combination of the above.

**Do not silently default to postcaptain-kb.** That source is sd-internal — for client work, it'll inject the wrong voice.

If the source is `postcaptain-kb` but `.sd/config.json:client.id` is NOT the SD agency client, flag this loudly: "you've selected an internal-knowledge source for a client project — confirm this is intentional."

## Authoring

1. **Reuse before invent.** Check `.sd/config.json:inventory.blockTemplates`. For each common section the page needs (hero, feature grid, CTA, testimonial, footer), prefer composing from an existing template (`scope: 'block' | 'section'`) rather than authoring raw blocks. If a section type has no template available, author the blocks directly.

2. **Block shape.** Follow the visual-editor schema. READ the `blocks://schema` MCP resource before authoring — it documents block `type`, `style`, `elementStyles`, and per-page settings. Common rules from the SD MCP-tool guidance:
   - Use `heading` blocks with explicit `level` for titles, never a big styled `text` block.
   - Pair every section heading with a small uppercase eyebrow `text` block above it.
   - Populate hero blocks fully: `title` + `subtitle` + `description` + `ctaText` + `ctaLink`. Title-only heroes look broken.
   - Apply `style` (color, fontSize, fontWeight, letterSpacing) for hierarchy — do not lean on defaults.

3. **Brand voice.** Map the brand messaging onto the copy:
   - `toneOfVoice` and `brandPersonality` set the writing register.
   - `valueProposition` should appear (paraphrased) in the hero.
   - `keyDifferentiators` should anchor the feature/services section.
   - `targetAudience` informs who the copy speaks to.
   - `boilerplate` can seed the about/footer section if relevant.

4. **SEO.** Always set `seoTitle`, `seoDescription`. Default `noIndex: false` for production pages; `true` for drafts the user only wants to share.

5. **Brand logo by default.** If `.sd/config.json:brand.logos.logoUrl` is set, place an `image` block at the very top of the page above the hero. Use the wide logo (`logoUrl`) — never the icon (`logoIconUrl`) at this scale. `alt` text from `logos.logoAlt` or fall back to `<companyName> logo`. Cap displayed height at 40–64px. If only `logoText` exists, render as a small uppercase text block in the brand accent color, letterSpacing 0.2em.

6. **Accessibility — run the contrast checks.** Before returning, validate every text/bg pair on the page against the WCAG-AA floors documented in `SD_DESIGN_PRINCIPLES.md` (4.5:1 body, 3:1 large/UI). Use the MCP tool `branding_check_contrast` for any pair you're unsure about. If a CTA fails (a very common case: white text on a low-saturation accent color), swap the foreground to `textColor` from the brand profile. Surface every fix you made in the response so the user can audit it.

7. **Link related artifacts when they help the page do its job.** A landing page is rarely a leaf — it often pairs with a survey (qualifying intake) or a booking page (call-to-book). When the user's intent matches, embed natively:

   - **Embed an existing survey** — append a `survey` block: `{ id, type: 'survey', slug: '<survey-slug>', showLogo: true }`. The slug comes from `surveys_list`. If the user wants a NEW survey, hand off to the `sd-create-survey` skill and embed after it returns the slug.
   - **Embed a booking widget** — append a `booking` block: `{ id, type: 'booking', slug: '<booking-page-slug>', showLogo: true, height: 720 }`. Slug comes from `booking_pages_list`. For an all-services menu, use `{ type: 'booking-menu', columns: 3 }`.
   - **Link to an existing pitch deck or another page** — use a `button` block whose `url` points at `/portal/preview/decks/<id>` or `/<post-slug>`.

   Don't embed an artifact just because it exists — embed only when the user's stated goal benefits. (A "pricing page" probably doesn't need a survey embedded; a "find-out-if-we're-a-fit" page does.)

8. **Run the 5-dimension self-review** from `SD_DESIGN_PRINCIPLES.md` before returning. Score 1–10 on Philosophy / Hierarchy / Craft / Functionality / Originality. Surface scores + quick-wins in the response.

## MCP call

Call `mcp__simplerdevelopment-postcaptain__posts_create` with:

```json
{
  "websiteId": <defaultSiteId from config>,
  "title": "<page title>",
  "slug": "<url-slug>",
  "postType": "<blog|page|landing|...>",
  "blocks": [...],
  "excerpt": "<150-200 char summary>",
  "seoTitle": "...",
  "seoDescription": "...",
  "published": false
}
```

`postType` defaults to `blog`. For landing/marketing pages, pass `page` (or whatever post type the tenant has defined — check `post_types_list` if unsure).

## Output

The MCP response includes an `approval` envelope:

```json
{
  "id": 123,
  "title": "...",
  "slug": "...",
  ...,
  "approval": {
    "url": "https://simplerdevelopment.com/approve/<token>",
    "previewUrl": "<same>",
    "token": "<64-hex>",
    "status": "pending",
    "expiresAt": null
  }
}
```

Return to the user:
- The post id
- The portal edit URL: `/portal/websites/<siteId>/posts/<id>/edit`
- The **approval URL** (this is the value to share for review)
- A one-line summary of what's on the page

## Iteration

If the user wants edits, call `mcp__simplerdevelopment-postcaptain__posts_update` with the same post id. **Each update mints a fresh approval URL** (the reviewer should see the content as-of-mint-time, not as-of-an-older-approval). The old URL stays valid in its existing state (`pending`, `approved`, or `rejected`); the new one supersedes it for review purposes. Return the new URL each time.

For a major rework or a parallel variant — call `posts_fork` to spin a clean variant under a new id with its own approval URL.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **Brand profile is empty** → output will be flat; warn and proceed.
- **`websiteId` missing** → fall back to `sites_list` and ask if more than one.
- **Block schema violation in the response** → `posts_create` will reject; show the error and surface what specifically was wrong (most often: missing `id` on a block, missing `level` on a heading, or an unknown block `type`).
- **`posts_create` returns `pending: true`** → API key requires CMS approval. The `approval.url` in the response is the link reviewers use. Tell the user the page won't be visible in the portal until approved.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-create-page" ~/.claude/skills/sd-create-page
```
