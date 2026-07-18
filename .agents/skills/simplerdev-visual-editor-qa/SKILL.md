---
name: simplerdev-visual-editor-qa
description: Triage the Visual Editor QA Board's "Validating" cards against the approval rubric using a local metro/prod DB copy + Playwright recordings, routing PASS→Approved lane and FAIL/NEEDS-YOU→annotate-in-place, and self-honing via an observational-memory learnings ledger. Use whenever the user says "run visual editor QA", "triage the QA board", "verify the Validating cards", "QA the visual editor board", "check the QA board", "work through the Visual Editor QA Board", mentions "VEQA", or asks to verify/approve/ship editor fixes sitting in Validating — even if they don't name the rubric or the board file explicitly. Also use when building or updating that rubric.
---

# SimplerDev Visual Editor QA

Verify already-landed visual-editor fixes against a strict, user-defined approval bar — and get smarter every pass. The board is the source of truth (`vault/05 - Feature Specs/Visual Editor QA Board.md`, obsidian-kanban markdown); the living rubric + accumulated learnings live in **`.sd/qa-rubric-learnings.md`** (read it first, write to it after every verdict).

Why this exists: cards land tsc/eslint-clean but "QA pending" — unproven on the real render surface, across viewports/themes, with evidence. This skill closes that gap deterministically instead of eyeballing 30+ cards.

## Start every run here

1. **Read `.sd/qa-rubric-learnings.md`.** It holds the rubric (the 6 gates), the on-paper pre-screen of the cards, the working-environment facts (DB target, seeded post id, editor login), and the **Learnings Log**. If the file is missing, build the rubric first — see `references/rubric-and-gates.md` (§ Bootstrapping the rubric); the durable option is a SimplerDevelopment survey (`surveys_create`) asking the approval-bar questions.
2. **Consult the Learnings Log** before scoring anything — past accept/reject entries encode the user's real taste/intent thresholds. Honor them; they override your priors.
3. **Stand up the local environment** if not already up — `references/environment-runbook.md`. Never QA against staging/prod; the app reads `.env.local` → a disposable local metro copy.

## The rubric (full detail in `references/rubric-and-gates.md`)

A card reaches **Approved** only if all six gates hold at **≥95% confidence**:

- **G1 Intent** — does what the user actually wanted, not just the terse card text. Intent unclear → don't guess → **NEEDS-YOU**.
- **G2 Both surfaces** — correct in the editor canvas **and** on the published/preview page.
- **G3 All viewports** — desktop + tablet + mobile (where layout is affected).
- **G4 Both themes** — light and dark.
- **G5 Evidence** — a Playwright **screen recording** of the interaction attached.
- **G6 No adjacent regressions** — target block **+ visually-adjacent blocks** unaffected.

**Taste/subjective cards** (padding "goofy", "good defaults", "consistency") are **auto NEEDS-YOU** — never auto-pass; they need the user's gut. Feed the Learnings Log so the bar hardens.

Confidence under ~95% on any gate → **NEEDS-YOU**, never a soft pass. (These defaults come from the user's survey; the live values are in the ledger and win if they differ.)

## Per-card loop

For each card in **Validating**:

1. Open the block in the editor (`/portal/websites/<siteId>/posts/<postId>/edit`), reproduce the fix's interaction, **record it** with Playwright.
2. Walk G1–G6 (see the gate checklist in `references/rubric-and-gates.md`). Use the ticket-type (mechanical / editor-visual / prod-render / taste) to know which gates are material.
3. Score at 95%. Write the verdict + evidence path.
4. **Route the card** on the board: **PASS** → move to **Approved** lane (the human taps the final Ship — never auto-Ship). **FAIL/NEEDS-YOU** → leave in **Validating**, annotate the exact failing gate or blocker.

## Observational memory (the honing mechanism)

This skill is meant to improve from use, not stay static:

- **Before** a pass: read the Learnings Log; apply every rule it contains.
- **After** the user accepts or rejects a verdict: append a dated line to the log —
  `YYYY-MM-DD · CARD · verdict you gave → user's action → rule inferred`
  (e.g. *"rejected VEQA-066 padding at 24px → user's CTA top-padding bar is 32px"*). Concrete thresholds, not vibes.
- claude-mem captures the session episodically too; the ledger is the curated, durable layer.

Over time the taste/intent calls need the user's gut less often. If a rule recurs enough to be a hard threshold, promote it into `references/rubric-and-gates.md` so it ships with the skill.

## Output

One **PASS / FAIL / NEEDS-YOU** table (cards grouped or all-at-once per the ledger's cadence setting), each row: card SKU · verdict · gate(s) that decided it · evidence link. Then apply the board moves and append any learnings.

## Cleanup

When a QA session ends, follow the ledger's Cleanup notes (delete the scratch post + seeder, revert the local test password). The local copy is disposable.
