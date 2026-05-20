---
name: sd-create-deck
description: Draft a pitch deck (presentation, slideshow, sales deck, investor deck) in the SimplerDevelopment portal via the postcaptain MCP. Produces a multi-slide V2 deck applying the default brand profile (theme inherited from the brand profile by default), reuses existing block_templates as slide layouts, and returns a shareable approval URL for stakeholder review before publish. Sourcing material is OPTIONAL and user-driven — the skill asks where to pull from if unclear (postcaptain-kb, an external URL, a pasted brief, or just the user's prompt). Use when the user says 'draft a deck about X', 'create a pitch deck for Y', 'make a presentation on Z', 'build a sales deck for W', 'investor deck'. Default mode publishes a DRAFT (`status: draft`); requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, WebFetch, Glob, Grep
---

# sd-create-deck

Draft a pitch deck in the portal. The deck is created in draft status with slide-level drafts, an approval link is minted, and the URL is handed back so the author can share it with a reviewer.

## Pre-flight

1. **Read `.sd/config.json`** — confirm `client`, `defaultSiteId`, `brand`. If missing/stale, ask the user to run `sd-init` first.
2. **Read brand messaging.** This skill leans on `brand.messaging.tagline`, `valueProposition`, `keyDifferentiators`, `targetAudience`, `boilerplate` heavily — the cover and section breaks are almost entirely brand-driven.
3. **Read `SD_DESIGN_PRINCIPLES.md`** — apply the design + a11y + 8pt-grid rules. Deck-specific tweaks live in section 10 of that doc (24px+ body, 60–120px titles, one concept per slide, dark/light alternation for visual rhythm, speaker notes on every slide).
4. **Read `.sd/learnings.md`** if present — apply `## Active rules`.
5. **READ the `blocks://schema` MCP resource** before authoring slides. Slide blocks use the visual-editor schema with extra slide-specific affordances (per-slide `customCss`, `pageSettings`, `notes`).

## Sourcing — ASK if unclear

Same options as `sd-create-page`:

- **`prompt-only`** — write from prompt + brand voice (most common for "make me a sales deck about X").
- **`postcaptain-kb`** — mine the postcaptain-kb vault. Useful for SD-internal decks (services pitch, capabilities overview).
- **`url`** — fetch one or more URLs (case study, white paper, blog post) and structure the deck around it.
- **`brief`** — read a local markdown/txt brief.
- **`mixed`** — combine.

**Do not silently use postcaptain-kb for client decks.** Flag aggressively if `client.id` is not the SD agency client and the user picked an SD-internal source.

## Slide planning

Decide on the deck's spine before authoring any blocks. A typical deck has 6–14 slides. Common spine patterns:

- **Sales pitch (8–10 slides):** cover → problem → solution → how it works → social proof → pricing → outcome → CTA → next steps.
- **Investor (10–14 slides):** cover → mission → problem → market → product → traction → business model → team → ask → contact.
- **Capabilities (6–8 slides):** cover → services → process → case studies → team → CTA.

Pick the spine, list the slides, then author one slide at a time.

## Authoring each slide

1. **Reuse before invent.** Check `.sd/config.json:inventory.blockTemplates` for templates with `scope: 'block'` and `category` matching `deck` / `slide` / `hero` / `cta`. If a slide layout has a template, compose from it.

2. **Slide block discipline** (from the SD MCP tool docs):
   - Use `heading` blocks with explicit `level` for titles, never a big styled `text` block.
   - Pair every heading with a small uppercase eyebrow `text` block above it for the branded feel.
   - Populate hero blocks fully: `title` + `subtitle` + `description` + `ctaText` + `ctaLink`. Title-only heroes look broken at slide scale.
   - Apply `style` (color, fontSize, fontWeight, letterSpacing) for visual hierarchy.

3. **Per-slide affordances:**
   - `label` — short slide name shown in the editor (e.g. "Cover", "Problem", "CTA"). Always set this.
   - `notes` — speaker notes; useful for the presenter view. Add when slide concept is non-obvious.
   - `pageSettings.backgroundColor` / `pageSettings.color` — slide-wide overrides; useful for "dark section break between content sections".
   - `customCss` — only for genuinely custom slides; do not lean on this as a substitute for proper block styling.

4. **Brand theme inheritance.** Do NOT pass a `theme` argument to `decks_create` unless the user explicitly says "use different colors than my brand". The MCP tool auto-inherits from the client's default branding profile.

5. **Logos by default.** From `.sd/config.json:brand.logos`:
   - **Cover slide:** the wide `logoUrl` centered above the eyebrow, height 56–96px. If only `logoText` exists, render as styled small-uppercase wordmark.
   - **Content slides:** the icon `logoIconUrl` (or `logoSquareUrl`) bottom-right at 32px. Skip entirely on dark section-break slides where the icon would clash. Don't repeat the wide logo on every slide — it's noise.
   - **Closing slide:** wide `logoUrl` again, smaller (40–48px), bottom-center with the contact info.

6. **Contrast check on every slide.** Per-slide `pageSettings.backgroundColor` + `pageSettings.color` must pass WCAG-AA. Call `branding_check_contrast` on the pair. Dark-bg slides need the body text near-white (#F8FAFC, not pure white — pure white on near-black causes shimmer). Light-bg slides need body text near-black (#0F172A).

7. **Embed related artifacts only when they fit the deck's job.** Decks are usually self-contained narratives — but a sales deck CAN end with a `booking` block on the close slide (so the prospect can book a call without leaving the deck), or a `survey` block on a section break (qualification mid-pitch). Use sparingly; most decks don't need embedded widgets.

## MCP calls

Two-step:

1. **Create the deck** with `mcp__simplerdevelopment-postcaptain__decks_create`:

   ```json
   {
     "title": "<deck title>",
     "description": "<one-line summary>",
     "sourceUrl": "<optional: url the deck was built from>"
   }
   ```

   The response includes the new deck's `id` and an `approval` envelope. **The deck is still empty after this call** — slides come next.

2. **Replace slides in one shot** with `mcp__simplerdevelopment-postcaptain__decks_replace_slides`. Preferred over `decks_add_slide` (one round-trip, all slides) unless you're incrementally appending to an existing deck:

   ```json
   {
     "id": <deck id from step 1>,
     "slides": [
       {
         "id": "cover",
         "label": "Cover",
         "blocks": [...],
         "notes": "...",
         "pageSettings": { "backgroundColor": "..." }
       },
       ...
     ]
   }
   ```

   Each slide id should be a short stable string (`cover`, `problem`, `solution-1`, `cta`). Slides land in slide drafts — the public renderer still shows the old slides until `decks_publish_all` runs.

3. **Optional: publish all slides** with `decks_publish_all` if you want the draft slides to be immediately viewable. For a review-first workflow, **skip this** — the approval URL renders draft slides directly, and `decks_publish_all` gets called automatically when the approver approves.

## MCP response handling — read errors first

SimplerDevelopment's MCP wraps every response — successes AND errors — in a JSON-RPC success envelope shaped like:

```
{"result":{"content":[{"type":"text","text":"{...JSON...}"}]}}
```

Before reporting success to the user, parse `result.content[0].text` as JSON. If the parsed object contains an `error` key (e.g. `{"error":"Site not found"}` or `{"error":"Unauthorized"}`), the call FAILED — even though the JSON-RPC envelope said `result`. STOP immediately. Surface the error verbatim to the user. Do NOT invent a successful response with a made-up post id, approval URL, slug, or site name. Hallucinated success is worse than a visible failure — the user will publish content that doesn't exist or copy approval URLs to stakeholders that 404.

Only treat the call as successful when the parsed text contains the expected entity shape (e.g. `{"id":..., "approval":{...}}` for `posts_create`).

## Output

Return to the user:
- Deck id + portal URL: `/portal/tools/pitch-decks/<id>`
- Slide count
- **Approval URL** from `decks_create.approval.url` — this is what the user shares for review
- A one-line summary of the deck spine

## Iteration

- Tweak slides → call `decks_replace_slides` with the same deck id. This mutates the slide drafts in place. **It does NOT mint a new approval URL.** If a pending approval URL already exists on the deck, that URL keeps pointing at the same deck — the reviewer will see the updated draft slides next time they load it.
- Metadata edit (title, description) → call `decks_update`. **Each `decks_update` mints a fresh approval URL.** Old URL stays in its current state; new one supersedes for review purposes. Return the new URL.
- Major rework / a/b variant → call `decks_fork` to clone the deck. The fork is a separate row with its own approval URL; approving the fork does NOT touch the parent.
- Approving the deck → flips `status='published'` AND auto-runs `decks_publish_all` (promotes every slide draft to live). You do not need to call `decks_publish_all` separately when reviewing through an approval URL.

## Failure modes

- **No `.sd/config.json`** → run `sd-init` first.
- **Subscription not active** → `decks_create` will return "This feature requires an active pitch-decks subscription". Surface to user; can't proceed.
- **Block schema violation** → slide insert will fail. Read the error, fix the offending block (most often a missing `id` or unknown `type`).
- **Pending approval gate** → if the API key has `require_cms_approval`, both `decks_create` and `decks_replace_slides` return `pending: true`. The approval URL still works; reviewers approve the staged change first to materialize the deck, then approve the slides.

## Install

This skill ships as part of the SimplerDevelopment client skills bundle. Install all 10 sibling skills in one step from the portal:

**https://simplerdevelopment.com/install**

macOS, Windows, and Linux installers download the bundle to `~/.claude/skills/`. Both Claude Desktop and Claude Code auto-discover skills from that path on next restart.

See `CLIENT_QUICKSTART.md` (installed alongside this file) for the full setup walkthrough, including the MCP-server config Claude Desktop needs and the one-time `sd-init` bootstrap.
