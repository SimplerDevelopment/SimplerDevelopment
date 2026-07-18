# SimplerDevelopment Authoring Skills

Skills an agent uses to produce platform content *as if it were a user*: CMS pages, decks, emails, surveys, booking pages, HTML embeds, full websites. They drive the portal **via the in-repo MCP server** and respect the active client, brand profile, and approval workflow.

The companion doc for in-repo code work is `SD-DEVELOPER-SKILLS.md`.

---

## Topology

```
                    ┌────────────────────────────────────┐
                    │           AUTHORING STACK           │
                    │   (drives portal via MCP server)    │
   sd-init  ──────► │                                    │
   bootstrap        │   sd-create-page                   │
   .sd/config.json  │   sd-create-deck   ◄─── sd-learn   │
   + brand snapshot │   sd-create-email      feedback    │
                    │   sd-create-survey     capture     │
                    │   sd-create-booking-page           │
                    │   sd-create-website (orchestrates) │
                    │   sd-build-html-embed              │
                    │                                    │
                    │   html-render-block (edits JSON)   │
                    └────────────────────────────────────┘
```

Every `sd-create-*` skill reads `.sd/config.json` and applies the active brand profile. All produce drafts; nothing publishes without a human-mediated approval URL.

---

## `sd-init` — bootstrap the workspace

**Purpose.** One-shot setup before any `sd-create-*` skill can run. Verifies portal-MCP auth, picks the active client, snapshots the brand profile (logo, fonts, colors, voice rules), lists existing `block_templates` and `email_templates` (so sibling skills can compose rather than reinvent), and writes `.sd/config.json` to the repo. Idempotent — re-run any time to refresh.

**Trigger phrases.** `sd init`, `set up SD`, `bootstrap SimplerDev`, `connect to SimplerDevelopment`, `configure my SD workspace`.

**Produces.** `.sd/config.json` with `defaultBrandProfileId`, `defaultSiteId`, brand snapshot, template inventory.

**Required by.** Every `sd-create-*` skill (they error out if `.sd/config.json` is missing).

---

## `sd-create-page` — draft a CMS page

**Purpose.** Authors a structured `blocks` JSON array for a CMS page (blog post, landing page, marketing page), applies the brand profile, reuses existing `block_templates` when possible, mints a draft post, returns a shareable approval URL.

**Trigger phrases.** `draft a page about X`, `create a CMS page for Y`, `make a landing page for Z`, `new blog post on W`, `write a marketing page`.

**Sourcing.** Optional. Skill prompts for material if unclear: a knowledge base path, external URL, pasted brief, or just the user's prompt.

**Output.** Draft (`published: false`) post + approval URL. Author hands URL to stakeholder; approval flips publish flag.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

## `sd-create-deck` — draft a pitch deck

**Purpose.** Multi-slide V2 deck, brand profile applied (theme inherited from brand by default), reuses existing block_templates as slide layouts, mints draft + approval URL.

**Trigger phrases.** `draft a deck about X`, `create a pitch deck for Y`, `make a presentation on Z`, `build a sales deck for W`, `investor deck`.

**Sourcing.** Optional. Same options as `sd-create-page`.

**Output.** `status: draft` deck + approval URL.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

## `sd-create-email` — draft an email campaign

**Purpose.** Drafts a campaign tied to an email list, applies the brand profile, optionally composes from existing `email_templates`, mints a draft + approval URL. Approval records a "ready" stamp; it does **not** auto-send — `email_campaigns_send` is a separate explicit action.

**Trigger phrases.** `draft an email about X`, `create a campaign for Y`, `write a newsletter on Z`, `announcement email for W`, `nurture email`.

**Sourcing.** Optional. Same options as `sd-create-page`.

**Output.** `status: draft` campaign + approval URL.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

## `sd-create-survey` — draft a survey / form / intake

**Purpose.** Authors a survey, form, intake questionnaire, NPS poll, or quiz with full feature coverage: `showIf` rules, page-jump branching, conditional options, per-field scoring (`option_map` / numeric / NPS), auto-route-to-CRM, recommendation engines, brand-aware styling.

**Trigger phrases.** `create a survey about X`, `build an intake form for Y`, `set up a feedback poll`, `NPS survey`, `qualification questionnaire`, `lead-capture form`, `quiz-style assessment`, `multi-step form with branching`.

**Output.** `status: draft` survey + approval URL. Approving flips to `active`, opening the public `/s/<slug>` route to responses.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

## `sd-create-booking-page` — manage booking pages

**Purpose.** Two flows.
- **(A) Embed an existing booking page** into a CMS page, deck, or email via the `booking` block (or `booking-menu` for all-services).
- **(B) Author a new booking page** via `booking_pages_create` + `booking_pages_update`, which mints an approval URL whose approval flips `active=true` so `/book/<slug>` starts accepting reservations.

Also lists and inspects booking pages, returning the public `/book/<slug>` URL for embeds.

**Trigger phrases.** `add a booking widget to this page`, `embed the discovery call booking`, `create a new booking page`, `set up consulting hours`, `add a calendar to the email`.

**Output.** A booking page id + public URL, or an embed block JSON snippet.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

## `sd-create-website` — compose a multi-page site end-to-end

**Purpose.** Highest-leverage authoring skill. Plans a sitemap, authors every page via the sub-skills above, wires top-nav, embeds a booking widget on the contact page, embeds a qualifier survey on the funnel page, applies brand profile across the site, and returns **one bundled response with every approval URL**.

**Trigger phrases.** `build a complete website for X`, `launch a new client site`, `compose a 5-page marketing site`, `set up the full site structure with nav`, `I want a real site, not just a landing page`.

**Output.** A set of draft posts (pages) + a draft nav + draft booking + draft survey + every approval URL, brand-aware logos/fonts/colors applied.

**Prerequisites.** `.sd/config.json` from `sd-init`. Active **sites subscription** on the tenant.

---

## `sd-build-html-embed` — ship hand-authored HTML

**Purpose.** Authors a self-contained HTML experience (single `index.html` OR a multi-file bundle with css/js/images/fonts) entirely in Claude Code, then uploads it to the portal as a draft page or single-slide deck. The output is a sandboxed iframe-rendered `html-embed` block — useful for interactive prototypes, motion-design experiments, custom calculators, immersive landing pages, anything outside the visual block editor's capacity.

**Trigger phrases.** `build an HTML embed`, `make an interactive widget`, `custom landing page with a working demo`, `huashu-style hi-fi mockup`, `upload this prototype`, `zip and ship`, `embed this single-file HTML into the portal`.

**Upload paths.**
- `posts_upload_html` — single HTML file, ≤1 MB
- `posts_upload_html_zip` — multi-file bundle, up to 50 MB (deck-variant available)

**Output.** Portal post + approval URL.

---

## `sd-learn` — capture feedback into long-term memory

**Purpose.** Records user feedback on an `sd-create-*` / `sd-build-*` output into `.sd/learnings.md` so future runs of sibling skills consult it before authoring. Structured by artifact (page, deck, email, survey, booking, HTML bundle); records what was accepted verbatim, what was edited, what was rejected, and the underlying rule the next run should change.

**Trigger phrases.** `remember this for next time`, `log this feedback`, `capture this`, `they wanted X not Y on the last page`, `don't make that mistake again`.

**Auto-invoked.** Sibling skills call `sd-learn` automatically at the END of a run if the user has given concrete feedback during the conversation.

**Idempotent and append-only.** Re-running on the same artifact replaces just that artifact's entry.

---

## `html-render-block` — edit html-render block JSON

**Purpose.** Edits the JSON object copied out of the portal's "Full block JSON (export / import)" panel. Operates on the canonical shape `{ type: "html-render", html, fields, values }`. Use for rename-field, add-array-item, translate, fix-content, change-headline, or any structural manipulation.

**Trigger phrases.** `edit my block JSON`, `update this pitch deck block`, `translate this block`, `rename a field`, `add an item to my block`, `fix my block content`, `change the headline in this block JSON`.

Also auto-triggers when the user pastes a JSON object containing `"type": "html-render"` plus `html`, `fields`, `values` keys.

**Output.** Modified block JSON, ready to paste back into the portal.

---

## Cross-cutting authoring conventions

### `.sd/config.json` is the tenant pointer
Bootstrap state for the authoring stack. Without it, `sd-create-*` skills error out. Re-run `sd-init` whenever the active client, brand profile, or default site changes.

### `.sd/learnings.md` is the long-term feedback log
Populated by `sd-learn`. Sibling skills consult it before authoring. Structured by artifact id, append-only, idempotent on re-run.

### Brand profile is load-bearing
Every authoring skill must apply the active brand profile (logos, fonts, colors, voice rules) — there's a memory note enforcing this (`feedback_mcp_brand_profile.md`). MCP-generated content that ignores the brand is treated as a bug.

### Approval URLs decouple draft from publish
- **Pages:** approval → `published: true`
- **Decks:** approval → "ready" stamp
- **Surveys:** approval → `status: active` (opens `/s/<slug>` to responses)
- **Booking pages:** approval → `active: true` (opens `/book/<slug>` to reservations)
- **Email campaigns:** approval → "ready" stamp ONLY (send is a separate `email_campaigns_send` call)

### Default to drafts
`sd-create-*` skills publish drafts by default. The author hands the approval URL to a stakeholder for review. No silent auto-publish.

---

## When to chain authoring skills

| Goal | Sequence |
|---|---|
| New client site from a URL | `site-migration` → `sd-init` (refresh brand) → `sd-create-website` |
| Multi-page marketing site | `sd-init` → `sd-create-website` |
| Page with a working interactive demo | `sd-build-html-embed` (single-file or zip) → review → `sd-learn` |
| Newsletter campaign series | `sd-init` → `sd-create-email` (one per send) → review → `sd-learn` |
| Lead-capture funnel | `sd-init` → `sd-create-survey` → `sd-create-page` (landing) → `sd-create-booking-page` (embed) |
| Fast block JSON cleanup | `html-render-block` |
| Capture a content correction for next time | `sd-learn` |

---

## What authoring skills are NOT

- **Not runtime libraries.** They are authoring-time aids; they do not ship to clients and are not invokable by portal end users.
- **Not approval-bypassing.** Skills always produce drafts; nothing publishes without the human-mediated approval URL flow.
- **Not brand-agnostic.** Output that ignores the active brand profile is a bug, not a feature.
- **Not a substitute for the visual editor.** Skills draft content; humans approve and refine in the visual editor.
