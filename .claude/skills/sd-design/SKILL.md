---
name: sd-design
description: "Design workflow for SimplerDevelopment — cultivate taste from real references, explore several directions side by side instead of one-shotting, narrow down, then land the winner as typed block JSON. Use when the user says 'design a landing page', 'this looks like AI slop', 'make it look premium', 'explore design directions', 'new block type but make it look good', 'I don't like how this looks', '/sd-design', or is starting visual work on a site, page, deck or block and hasn't picked a direction yet."
argument-hint: "<what you're designing> [siteId or clientId]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion, WebFetch, Skill
user-invocable: true
---

# sd-design — taste-first design workflow

Adapted from Chase AI's *"Turn Claude Into A Design GENIUS In 3 Simple Steps"*
(youtu.be/7FU98O0JLHs) and fitted to this repo.

**The thesis:** the problem with AI design output is not technical, it is
*generic*. Better models only move what counts as generic. The fix is to inject
real taste and to **iterate visually by comparison**, not to write a longer
prompt and pray.

**The single biggest behavioural change:** stop one-shotting. Generate several
directions, look at them together, pick, narrow, repeat. Comparison beats
description — you cannot reliably say what you want, but you can reliably point
at it.

## What this skill is NOT

It is not a new design engine. Everything needed is already installed; nobody
had written down the **order**. This skill is the conductor:

| Step | Use |
|---|---|
| Visual exploration, N directions | `huashu-design` (`.agents/skills/huashu-design/`) — 20-philosophy library, parallel demos |
| De-slopping a built UI | `impeccable` (installed) — 23 commands over typography, colour, spacing, responsiveness, interaction, motion, UX writing |
| Component-level reference | `block_templates_list` — the existing SD blocks ARE the component library |
| Real brand constraints | `branding_get_profile` — do not invent a palette the client already has |
| Design critique / flows | the `product-designer` persona agent |
| Verifying a port matches | `/visual-compare` |
| Turning the winner into a block | `simplerdev-block-type` |

**Do not go down the tool rabbit hole.** Narrow, prescriptive design skills give
one kind of output — impressive once, same-y forever. The flexible ones above are
flexible precisely because the quality comes from *your* references and
guardrails, not from the tool.

---

## Step 1 — Taste in (never start from a blank prompt)

Gather concrete references before generating anything.

- **Ask for references.** Screenshots, URLs, "the feel of X". Real URLs are
  fine and often better than screenshots — they can be fetched and read.
- **Pull the real brand.** `branding_get_profile` for the client. Colours,
  fonts, and messaging that already exist beat anything invented. If the design
  contradicts the brand profile, say so before building.
- **Mine what already shipped.** `block_templates_list` and existing site pages.
  A direction that reuses proven block templates is cheaper to build and more
  consistent than a novel one.
- **Curate durable references into the vault**, not into chat. A reference worth
  reusing goes in `vault/` alongside the domain map (see the vault skill). Chat
  history is not a design library.

The point is not to copy. **You are matching a feeling, not a layout.**

## Step 2 — Write the four-part brief

This is the most portable artifact from the source video. Every design prompt
carries exactly four things — no 10,000-word `design.md`, which just produces
the same output every time:

1. **Aesthetic** — the family. "Editorial print-tech", "vast quiet cinematic",
   "dither mono", "classical remix". Name it; don't describe it in adjectives.
2. **Reference** — image(s) and/or URL(s) from Step 1. State that you are
   matching *feel*, not content or layout.
3. **Intent** — what is this and why. What is it for, who is the audience, what
   single action should they take. This dictates everything downstream.
4. **Guardrails** — always / never. Carry a standing never-list:
   *no purple-blue gradients, no Inter everywhere, no 3D SaaS blobs, no generic
   hero-with-centred-headline.* Add per-project ones.

Confirm the brief with the user before generating. A wrong brief wastes a whole
exploration round.

## Step 3 — Cast a wide net (5 → 3 → 1)

**Round 1 — five directions.** Five genuinely different aesthetic families, from
the same brief. Use `huashu-design` to produce them as hi-fi single-file HTML.
Present them **together**, not one at a time — the whole point is comparison.
Ask which direction, using `AskUserQuestion`.

**Round 2 — three variants of the winner.** Vary *body* treatment, not the
aesthetic: layout, rhythm, density, navigation. The hero usually survives
round 1; the body is where round 2 earns its keep.

**Round 3 — the hero asset.** Nail the big image or motif before fiddling with
type. Generate ~4 options, pick, then generate colour/treatment variants of the
pick. Getting the hero right makes everything else easier to judge.

> This repo has **no image-generation MCP installed** (the source video uses
> Higgs Field). Either ask the user to supply assets, use existing media via
> `media_list` / `media_upload_from_url`, or design around CSS/SVG treatments.
> Do not silently ship a placeholder as if it were final.

At every round: show the options, let the user point. Never advance on your own
taste alone.

## Step 4 — De-slop

Run `impeccable` over the chosen direction before anyone falls in love with it.
It targets the seven areas where slop actually lives (typography, colour, spatial
design, responsiveness, interaction, motion, UX writing).

Then sanity-check against the standing never-list from Step 2. If the output
still reads as generic, the brief was too thin — go back to Step 1 and get
better references rather than adding adjectives.

## Step 5 — Land it in the platform (this is where the video stops and we don't)

The source workflow ends at a nice HTML page. **This repo cannot ship that.**

> **Hard rule (CLAUDE.md):** huashu/exploration output is inspiration, not
> paste-able into the CMS. Translation to typed block JSON
> (`lib/blocks/registry.ts`) is **always manual — never lift exploration HTML
> into a block via copy-paste.**

So:

- **New block type** → `simplerdev-block-type`, which moves the TS interface,
  render component, registry entry, production renderer case and `/api/blocks`
  metadata in lockstep. Blocks are **universal, never client-specific** — if the
  design only makes sense for one client, it is content, not a block.
- **A page** → compose from existing blocks (`sd-create-page`), reaching for a
  new block only when no existing one fits.
- **A one-off interactive piece** → `sd-build-html-embed` is the legitimate
  escape hatch for freeform HTML, sandboxed in an iframe.

Verify the port with `/visual-compare` — exploration mockup vs. rendered block.

## Step 6 — Tweak visually, not by prompt

The video's "tweaks bar" exists here already: the **visual editor** at
`app/portal/websites/[siteId]/posts/[id]/edit`. Use it. Adjusting type scale,
spacing and colour through live controls beats asking for ten regenerated
variants — you need to *see* the difference to have an opinion about it.

If a knob you need isn't exposed, that is a real finding — file it rather than
working around it with prompts.

## Rules

- **Show options, don't describe them.** Any time you are about to write a
  paragraph explaining how something will look, generate it instead.
- **Never advance a round on your own taste.** The user's eye is the judge; you
  are producing candidates.
- **The brief is the artifact.** When something lands well, save the four-part
  brief that produced it — that is the reusable thing, not the HTML.
- **Respect the brand profile.** A beautiful design in the wrong brand is a
  rejected design.
- **Say when it's slop.** If output looks generic, name it plainly and go get
  better references. Do not ship it with an apology attached.
- **Don't hoard tools.** If a new design skill only ever produces one look, it
  will make everything look the same. Prefer flexible tools plus real references.

## Fidelity workflow — proven on the integratouch polish (2026-08-19/20)

When the goal is matching a reference design (a live site, a mockup) rather
than exploring, the loop that actually converged 21 pages:

- **Screenshots are the diff, not the DOM.** Full-page captures of reference
  and candidate at 1440×900, compared section by section multimodally. Markup
  inspection repeatedly missed what screenshots caught: icon size/color/
  alignment, testimonial card treatments, gradient direction, heading weight.
- **Both widths, every pass.** 1440 AND 390 — mobile is where paddings,
  overflow, and font-swap shifts hide. `scrollWidth === 390` is the
  containment gate per page.
- **Scroll the reference before capturing.** Scroll-triggered animations leave
  blank regions in naive full-page captures that read as "missing sections" —
  two real sections were nearly deleted chasing that artifact.
- **Measure paddings, never eyeball them.** `getComputedStyle` per top-level
  section, reference vs candidate, fix anything >8px off. Live sites collapse
  desktop paddings to roughly half or a quarter on mobile.
- **Sweep treatment CLASSES across all pages at the end.** Per-page passes
  leave systematic misses (every icon-card row wrong the same way); one
  cross-page sweep per treatment class closes them.
- **Two consecutive clean sweeps = converged.** One clean pass is not done —
  the fix for page A routinely regresses a shared helper used by page B.
