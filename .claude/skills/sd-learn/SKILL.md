---
name: sd-learn
description: Capture user feedback on a SimplerDevelopment skill's output (page, deck, email, survey, booking, HTML bundle) into a structured `.sd/learnings.md` so future runs of the sibling `sd-create-*` and `sd-build-*` skills consult it before authoring. Records what the user accepted verbatim, what they edited, what they rejected, and the underlying rule the next run should change. Idempotent and append-only — running it again on the same artifact replaces just that artifact's entry. Use when the user says 'remember this for next time', 'log this feedback', 'capture this', 'they wanted X not Y on the last page', 'don't make that mistake again', or after the user has explicitly accepted/rejected an approval URL the skill produced. Invoked automatically by sibling skills at the END of a run if the user has given concrete feedback during the conversation.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Bash
---

# sd-learn

A lightweight knowledge-accumulation layer on top of the `sd-create-*` / `sd-build-*` skills. Captures user feedback in a structured local file (`.sd/learnings.md`) so future skill runs read it before authoring and avoid repeating the same mistakes.

This is the **only** mechanism for skill self-improvement — no remote storage, no analytics pipeline, no ML. Just a per-project markdown file that future skill runs consult.

## When to invoke

**Automatic** — every `sd-create-*` skill should call this at the end of its run IF the user has given explicit feedback during the conversation. Trigger phrases the parent skill should watch for:

- "not quite — make it more X"
- "drop the Y section"
- "they don't want blue, they want green"
- "the testimonial is fake, leave a placeholder next time"
- "use the wide logo here, not the icon"
- approve or reject decisions on the approval URL (less common signal but useful)

**Manual** — user explicitly says "remember this" / "log this lesson" / "save this preference."

## Inputs

The invoking skill or the user provides:

1. **Artifact reference** — what was produced? Examples: `post 698`, `deck 350`, `campaign 36`, `survey 12`, `bundle "stop-duct-taping"`.
2. **Feedback text** — what the user said, verbatim if short. Paraphrase only when the original is rambling.
3. **(optional) Skill name** — which skill produced the artifact. If absent, infer from artifact type.

## File location

`.sd/learnings.md` — one file per project, sibling to `.sd/config.json`. Gitignored. If the file doesn't exist, this skill creates it with the canonical header (see template below).

## Format

Markdown with two top-level sections:

```markdown
# SD Skills — Project Learnings

Per-project feedback log. Skills under `sd-create-*` / `sd-build-*` consult
this file before authoring and after reading `.sd/config.json`.

Generated and maintained by `sd-learn`. Hand-edits are fine — just keep the
section structure intact.

## Active rules

(Distilled rules to apply on every future run, derived from the artifact
log below. Skills read this section first.)

- (no rules yet)

## Artifact log

(Append-only chronological log. Most recent at the top. Each entry has the
artifact ref, the date, the feedback, and the rule it derives.)
```

### Entry shape

```markdown
### 2026-05-15 — post 698 (sd-create-page)

**Feedback (user, verbatim):**
> "The testimonial reads as fake. Leave a labeled placeholder instead
> until we have real customer quotes."

**Derived rule:**
- Never invent testimonials. Use a `[TESTIMONIAL TBD — ideally from <named customer>]` placeholder block.
- Surface the gap explicitly in the response, not buried.

**Severity:** load-bearing — applies to every sd-create-* skill going forward.
```

## What this skill does

1. **Read `.sd/learnings.md`** if it exists. If not, create it with the canonical header.
2. **Find or append the entry** for the named artifact. If an entry exists, replace its `Feedback (user, verbatim)` and `Derived rule` sections — don't duplicate.
3. **Update the `## Active rules` section.** Walk the artifact log, pick rules tagged `load-bearing` or `applies to`, and produce a deduplicated bullet list at the top. Keep it short — if the list has more than 20 rules, the file has lost its value as a quick-read.
4. **Print back to the user** the rule that was added and the current `## Active rules` count, so they know it was captured.

## What this skill does NOT do

- It does NOT store secrets or credentials.
- It does NOT phone home — the file stays local.
- It does NOT delete entries. The user can hand-edit if a rule becomes stale.
- It does NOT touch `.sd/config.json` — that's `sd-init`'s job.

## How sibling skills consult it

Every `sd-create-*` skill's pre-flight should:

1. Read `.sd/config.json`.
2. Read `.sd/learnings.md` (if it exists) — specifically the `## Active rules` section.
3. Apply those rules to the authoring decisions before producing the first block.

When the parent skill is about to do something a rule prohibits, it should flag it ("I see learnings.md says 'never invent testimonials' — skipping the testimonial block; will leave a TBD placeholder.") rather than silently breaking the rule or silently following it.

## Rule severity tags

- **load-bearing** — applies to every future run, full stop. Examples: "no invented testimonials," "use Inter not Roboto," "max 3 colors."
- **applies to: <skill name>** — only relevant to one skill. Examples: "decks always end with a contact slide," "emails always use the wide logo in the header."
- **client-specific** — only this client, but every project for this client. Examples: "client refuses cyan accents," "client's tone is more formal than the brand profile suggests."
- **one-off** — note for context but don't fold into active rules.

## Example: after a user rejects a fork

```
User: "Reject the deck variant — the cover slide should use the wide logo, not the icon."

→ sd-learn run with:
  artifact: deck 351
  feedback: "Cover slide should use wide logo, not the icon."

→ writes to .sd/learnings.md:
  ### 2026-05-15 — deck 351 (sd-create-deck)
  **Feedback:** "Cover slide should use wide logo, not the icon."
  **Derived rule:** Deck cover slides always use logoUrl (wide), not logoIconUrl.
  **Severity:** applies to: sd-create-deck

→ rule appears in Active rules:
  - sd-create-deck: cover slide always uses logoUrl (wide), not logoIconUrl.

→ next sd-create-deck run reads this and uses logoUrl on cover automatically.
```

## Failure modes

- **`.sd/` doesn't exist** → run `sd-init` first to bootstrap the project.
- **No feedback to capture** → don't pollute the log. Skip the run.
- **Entry already exists, identical content** → no-op, return early.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-learn" ~/.claude/skills/sd-learn
```
