---
name: linkedin-weekly-drafts
description: Auto-draft one week's worth of LinkedIn content for Dan Coyle using the batch-once/repurpose-many strategy. Pulls source material from git history and vault, then generates a full weekly batch (1 video script, 1 carousel outline, 2-3 text posts, 1-2 company posts) written to vault/05 - Feature Specs/linkedin-queue/YYYY-Www.md as a draft file with review checkboxes — never publishes. Use when the user says 'draft my LinkedIn posts', 'batch LinkedIn content', 'linkedin weekly drafts', 'generate my linkedin queue', 'write my linkedin posts this week', or '/linkedin-weekly-drafts'.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# linkedin-weekly-drafts

Auto-draft one week of LinkedIn content following the strategy in `vault/05 - Feature Specs/LinkedIn Content Strategy.md`. All output lands in a dated queue file as **drafts for Dan to review and schedule manually**. This skill never posts, auto-schedules, or calls any external API.

## Pre-flight

1. **Read the strategy.** Open `vault/05 - Feature Specs/LinkedIn Content Strategy.md`. The content pillars, format mix, templates, and posting rules there are the source of truth — they override any generic LinkedIn convention.
2. **Note the NEVER-publish rule.** Output status is always `draft — review & schedule`. There is no auto-publish mode.

## Step 1 — Gather this week's source material

Run:

```bash
git log --oneline --since="7 days ago"
```

Scan the commit messages for shipped features, fixes, or notable decisions. Look for patterns: what area of the product was touched? What did Dan actually *do* this week?

If the commits are sparse or cryptic, also check:
- `vault/05 - Feature Specs/` for any spec files whose `status` frontmatter recently flipped to `shipped` or `in-progress`.
- `vault/03 - Domains/` for domain map files that were recently modified (use `git log --oneline --since="7 days ago" -- "vault/03 - Domains/"` to check).

**Do not fabricate work.** If the git log is empty or contains only chores, say so and ask Dan to briefly describe what he worked on this week before continuing.

## Step 2 — Pick 1-2 themes

From the source material, identify the most *interesting* or *teachable* artifact — a shipped feature, a tricky bug, a workflow discovery, a real decision made. Aim for concreteness: "added streaming to the brain RAG pipeline" beats "did some AI work."

Pick 1 primary theme and optionally 1 secondary. Name them explicitly before drafting ("Primary theme: X. Secondary theme: Y.") so Dan can redirect before the batch is written.

## Step 3 — Draft the weekly batch

Generate all pieces below in a single pass. Follow the templates from the strategy **verbatim** — the structure is proven and must not be improvised.

---

### Piece 1 — Face-to-camera video script (Template A)

**Pillar:** pick whichever Dan personal pillar fits the primary theme (Agentic engineering in practice / Build-in-public / Understanding AI / Contrarian take).
**Property:** Dan personal page.
**Length:** 150–220 words (60–90s at natural talking pace).

Structure — do not skip or reorder any section:
```
HOOK (1 line, ~3 sec — counterintuitive claim or specific result, no intro):
  "[Counterintuitive claim / specific result]."

CONTEXT (1–2 lines): the problem or why it matters.

PAYOFF (2–3 lines): what Dan actually did — the real SimplerDevelopment example.

TAKEAWAY (1–2 lines): the generalizable lesson (teach-first).

SOFT CTA (1 question): "How are you handling [X]?"
```

Note at the bottom: `Burn-in captions. Shoot vertical. One idea only.`

---

### Piece 2 — Carousel outline (Template C)

**Pillar:** same theme as the video or the secondary theme.
**Property:** Dan personal page (repurpose one slide as a company-page reshare if relevant).
**Slide count:** 6–8.

Structure:
```
Slide 1: Hook / title — one bold promise.
Slides 2–(N-1): one idea per slide, minimal text, note where a visual or code snippet goes.
Slide N (final): recap + soft CTA ("Follow Dan for more on agentic engineering").
```

Label each slide clearly: `Slide 1 / Slide 2 / ...`. Add a one-line `[Visual note: ...]` on any slide that benefits from a screenshot or diagram. Designed in Canva/Figma → export as PDF → upload as native LinkedIn document.

---

### Pieces 3-5 — Text posts (Template B)

Draft 2–3 text posts. Map each to a distinct Dan personal pillar so the week covers different angles.

Structure per post:
```
HOOK line (specific, scroll-stopping — one sentence).

2–5 short lines: story or insight, one thought per line, generous whitespace.

TAKEAWAY: the lesson.

QUESTION (CTA).
```

**Links:** if a link is needed (GitHub repo, demo, doc), mark it `[First comment: <url>]` — never put it in the body.

Label each post with its pillar: `Pillar: Agentic engineering in practice` / `Build-in-public` / `Understanding AI / mental models` / `Contrarian take`.

---

### Pieces 6-7 — Company page posts (SimplerDevelopment)

Draft 1–2 posts for the SimplerDevelopment company page. These are shorter and promotional; Dan will reshare/quote them from his personal profile to give them reach.

Map to a company pillar: `Open-source alternative` / `Feature spotlight` / `3-tier offer` / `Proof`.

Same Template B structure. Keep tone factual and product-centric (not first-person Dan voice). Note which personal post, if any, should reshare this one.

---

## Format rules (apply to every piece)

- **No links in the post body** — ever. Links in `[First comment: <url>]` only.
- **Hashtags:** 3–5 per post, placed at the very end of the body, treated as SEO keywords. Example: `#agenticengineering #buildinpublic #opensource`
- **Material Icons** over emojis if formatting symbols are needed in the queue file itself.
- Length guidance: video script 150–220 words; carousel slides ~20 words/slide; text posts 100–200 words.

## Step 4 — Write the queue file

Determine the ISO week: `YYYY-Www` format (e.g. `2026-W26`). Write to:

```
vault/05 - Feature Specs/linkedin-queue/YYYY-Www.md
```

Create the `linkedin-queue/` directory if it does not exist.

**File structure:**

```markdown
---
week: YYYY-Www
status: draft — review & schedule
themes: [theme1, theme2]
generated: YYYY-MM-DD
---

# LinkedIn Queue — Week YYYY-Www

> status: draft — review & schedule
> Themes this week: [theme1], [theme2]
> Review each item, edit freely, then schedule via LinkedIn's native scheduler.
> Links go in the first comment — never the post body.

---

## Piece 1 — Video Script (Dan personal · Pillar: [name])

- [ ] Review & approve

[script here]

---

## Piece 2 — Carousel Outline (Dan personal · Pillar: [name])

- [ ] Review & approve
- [ ] Design in Canva/Figma → export PDF

[outline here]

---

## Piece 3 — Text Post (Dan personal · Pillar: [name])

- [ ] Review & approve

[post here]

---
[...continue for all pieces...]
```

Each piece must have:
- A `## Piece N — [type] ([property] · Pillar: [name])` heading
- A `- [ ]` review checkbox (and a `- [ ] Design` checkbox for the carousel)
- The draft content
- A `[First comment: <url>]` line if a link is relevant (otherwise omit)
- A `Hashtags:` line at the end of each post body

## Step 5 — Return a summary to Dan

After writing the file, output:
- The file path written
- A compact table listing each piece: `| # | Type | Property | Pillar |`
- The two themes used
- One sentence noting any source material ambiguity or assumption made
- A reminder: "Review `vault/05 - Feature Specs/linkedin-queue/YYYY-Www.md`, edit, then schedule via LinkedIn's native scheduler. Links go in the first comment."

## Edge cases

- **Empty git log / no real work found:** Stop at Step 1. Ask Dan to describe what he worked on this week. Do NOT invent themes from thin air.
- **More than 2 obvious themes:** Pick the most teachable one as primary; note the others as "could become next week's batch."
- **Pillar overlap:** Two text posts can share a pillar if truly unavoidable, but prefer variety across the week.
- **Existing queue file for this week:** Append new drafts below a `---` separator with a note `(re-run YYYY-MM-DD HH:MM)` — do not overwrite the file.
- **Secondary theme too thin to support a full post:** Skip the secondary piece; note why; fill the slot with a contrarian/opinion take on the primary theme instead.
