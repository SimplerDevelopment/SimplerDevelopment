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
3. **READ the `blocks://schema` MCP resource** before authoring slides. Slide blocks use the visual-editor schema with extra slide-specific affordances (per-slide `customCss`, `pageSettings`, `notes`).

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

```bash
ln -s "$(pwd)/.claude/skills/sd-create-deck" ~/.claude/skills/sd-create-deck
```
