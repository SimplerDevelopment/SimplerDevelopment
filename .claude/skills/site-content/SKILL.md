---
name: site-content
description: The SimplerDevelopment site-content agent — uses the product, then DRAFTS marketing content (solutions pages, blog posts) grounded in real feature behavior, with screenshots/videos/descriptions, for human review. NEVER auto-publishes. Use when the user says 'groom the site content', 'audit the solutions pages', 'draft a blog post', 'review/refresh the marketing copy', 'write a post about <feature>', or when a scheduled routine asks to generate marketing drafts. Composes sd-marketing-screenshots, draft-blog-post, sd-create-page, huashu-design, and the E2E/UX guide. Phase 1 = solutions pages (code → PRs); Phase 2 = blog (CMS drafts); Phase 3 = walkthrough video + narration.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# site-content

Drafts and grooms SimplerDevelopment's public marketing content **grounded in what the product actually does**, and hands it to a human as a **draft or PR — never auto-published**. It is the orchestrator described in the build discussion: it composes existing skills rather than reimplementing them.

## Non-negotiable guardrails

1. **Draft only — never publish.** Marketing *pages* are produced as a **git branch + PR/diff** for review (never a push to `main`). Blog/CMS content is produced as **`published: false`** drafts. Routines produce drafts; a human approves + publishes.
2. **Grounded, no overclaiming.** Every feature claim must be verified against real behavior. Read the routes/components/lib **and** consult `docs/E2E-SOLUTIONS-GUIDE.md` (the code-grounded per-solution assessment). Lead with **strong** features; do not market features the guide flags as partial/stubbed (e.g. publishing's multi-channel, automations' dead events, the chatbot's dormant Brain responder) as if complete.
3. **Compose, don't reimplement.** Use the skills below. Don't hand-roll screenshots, blog drafting, or CMS authoring.
4. **Two surfaces, two pipelines** (this is load-bearing):
   - **Marketing pages** = code in `app/(pages)/**` (home, solutions, about, pricing). Data from `lib/data/**`. Changing them = **git edit → PR → deploy**. Prod tracks `main`; the deploy pipeline + pre-push CI are fragile (see the marketing-screenshots skill's gotchas).
   - **Blog** = the `posts` table, SimplerDevelopment's *global* rows (`websiteId IS NULL`, `postType='blog'`), block-based via `BlockRenderer`, served by `app/(pages)/blog/**` through `lib/actions/blog.ts`. A **draft = a global blog post with `published=false`**; approval = flipping `published=true`. Tenant posts have a non-null `websiteId` — never touch those. (Global blog posts likely need an admin path, not the tenant-scoped `sd-create-page` — confirm before authoring.)

## Composes

| Need | Use |
|---|---|
| Real product screenshots (data-filled, no dev badge) | `sd-marketing-screenshots` skill |
| Feature truth (strong vs weak, gaps) | `docs/E2E-SOLUTIONS-GUIDE.md` + read the routes/lib + (optionally) drive the product in an isolated worktree |
| Blog draft from source material | `draft-blog-post` skill (KB mining) + product-grounded facts |
| CMS page/block authoring | `sd-create-page` / `sd-edit-page` (tenant) — for the **global** marketing blog, find the admin path |
| Hi-fi visual exploration for a hero | `huashu-design` (inspiration only — never paste into the CMS) |
| Heavy capture / browser work | dispatch an `e2e-visual-tester` / `general-purpose` Agent (isolated worktree) |

## Phase 1 — Solutions pages (code → PR) [START HERE]

Audit and improve `/solutions` + `/solutions/[slug]` copy/structure, output a reviewable PR.

1. **Read the ground truth:** `lib/data/solutions.ts` (the 19-solution registry; note `HIDDEN_SLUGS`), `lib/data/solution-screenshots.ts`, `app/(pages)/solutions/**`, and **`docs/E2E-SOLUTIONS-GUIDE.md`** for each solution's real strength/weakness.
2. **Audit each visible solution** for: accuracy (claims match behavior), clarity/concision, intent delivery, freshness, gaps (missing feature, weak copy, screenshot coverage), and overclaiming (don't sell a Compl.-2 feature like it's complete).
3. **Propose** changes: copy edits to `lib/data/solutions.ts` descriptions/features/process, structure tweaks in the page, and any new screenshots needed (delegate to `sd-marketing-screenshots`).
4. **Produce a PR, not a push:** `git switch -c content/solutions-groom-<topic>`, make edits, commit, and either open a PR (`gh pr create` targeting `main`) or hand the user the branch + diff. **Do not push to `main`.** Run `tsc --noEmit` on touched files first.
5. **Report** a per-solution summary of proposed changes + rationale (cite the guide).

## Phase 2 — Blog (CMS drafts)

Generate blog posts as **global** `posts` rows (`websiteId=NULL`, `postType='blog'`, `published=false`), block-based, with `sd-marketing-screenshots` visuals. Compose `draft-blog-post` for source/angles, ground claims in the product + guide, and leave them unpublished for review. Confirm/locate the admin path for global blog posts first (tenant `sd-create-page` is site-scoped).

## Phase 3 — Walkthrough video + narration (confirm tooling first)

Scripted product walkthrough videos: record a flow with Playwright video (or the `/qa` video mode), generate narration via a TTS provider, mux with ffmpeg. **No TTS/ffmpeg pipeline exists yet** — before building: (a) confirm the TTS provider + budget (OpenAI TTS is the path of least resistance given BYO-OpenAI support); (b) confirm whether "audio" means a marketing **voiceover** (default) or accessibility **audio-description**. Output goes to drafts/review, not live.

## Routine usage (scheduled)

- **Groom/audit routine** (safe, frequent): runs Phase-1 audit + Phase-2 blog-draft generation → produces PRs/drafts + a report. **Never** schedule auto-publish.
- A routine prompt should say: "Run the `site-content` skill in audit mode: produce a PR of proposed `/solutions` copy fixes and N blog-post drafts; do not publish."

## Gotchas

- Prod marketing pushes go through a red pre-push CI + need care (see `sd-marketing-screenshots`). Phase-1 output is a **PR**, so the human's merge handles deploy — the agent never force-pushes prod.
- `HIDDEN_SLUGS` in `lib/data/solutions.ts` hides solutions from marketing (e.g. invoicing) — respect it; don't re-surface a hidden solution without being asked.
- The E2E guide is the source of truth for "is this feature real" — re-read it (it can go stale as features ship).
