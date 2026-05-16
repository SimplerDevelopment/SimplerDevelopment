# SimplerDevelopment Skills — Overview

A reference for every SimplerDevelopment-specific skill available to Claude Code. Skills fall into two broad camps:

1. **Authoring skills (`sd-*`)** — used by an *agent* (Claude in the user's terminal) to produce platform content *as if it were a user*: CMS pages, decks, emails, surveys, booking pages, HTML embeds, full websites. They drive the portal **via the in-repo MCP server** and respect the active client, brand profile, and approval workflow.
2. **Developer skills (`simplerdev-*` and friends)** — used by an *agent* to modify the simplerdevelopment2026 codebase itself: scaffold features, scaffold UI, add block types, add MCP tools, migrate external sites, port features, debug the visual editor.

Two skills bridge both: `sd-init` (bootstrap), `sd-learn` (feedback capture for the authoring stack).

---

## Topology at a glance

```
                       ┌─────────────────────────────────────────┐
                       │  AUTHORING (via in-repo MCP server)     │
                       │                                         │
   sd-init  ────────►  │  sd-create-page                         │
   (bootstrap          │  sd-create-deck         ◄─── sd-learn   │
    .sd/config.json,   │  sd-create-email             (feedback  │
    brand snapshot)    │  sd-create-survey             capture)  │
                       │  sd-create-booking-page                 │
                       │  sd-create-website  (orchestrates ↑)    │
                       │  sd-build-html-embed                    │
                       │                                         │
                       │  html-render-block  (edits block JSON)  │
                       └─────────────────────────────────────────┘

                       ┌─────────────────────────────────────────┐
                       │  IN-REPO DEVELOPER SKILLS               │
                       │                                         │
                       │  simplerdev-feature-scaffold            │
                       │  simplerdev-ui-scaffold                 │
                       │  simplerdev-block-type                  │
                       │  simplerdev-mcp-tool                    │
                       │  simplerdev-mcp-token-budget            │
                       │  simplerdev-visual-editor               │
                       │  site-migration                         │
                       │  feature-integrator                     │
                       │  dev-block  (autonomous n8n-driven loop)│
                       └─────────────────────────────────────────┘
```

---

## Authoring layer

### `sd-init` — bootstrap the workspace

**Purpose.** One-shot setup before any `sd-create-*` skill can run. Verifies portal-MCP auth, picks the active client, snapshots the brand profile (logo, fonts, colors, voice rules), lists existing `block_templates` and `email_templates` (so sibling skills can compose rather than reinvent), and writes `.sd/config.json` to the repo. Idempotent — re-run any time to refresh.

**Trigger phrases.** `sd init`, `set up SD`, `bootstrap SimplerDev`, `connect to SimplerDevelopment`, `configure my SD workspace`.

**Produces.** `.sd/config.json` with `defaultBrandProfileId`, `defaultSiteId`, brand snapshot, template inventory.

**Required by.** Every `sd-create-*` skill (they error out if `.sd/config.json` is missing).

---

### `sd-create-page` — draft a CMS page

**Purpose.** Authors a structured `blocks` JSON array for a CMS page (blog post, landing page, marketing page), applies the brand profile, reuses existing `block_templates` when possible, mints a draft post, returns a shareable approval URL.

**Trigger phrases.** `draft a page about X`, `create a CMS page for Y`, `make a landing page for Z`, `new blog post on W`, `write a marketing page`.

**Sourcing.** Optional. Skill prompts for material if unclear: `postcaptain-kb`, external URL, pasted brief, or just the user's prompt.

**Output.** Draft (`published: false`) post + approval URL. Author hands URL to stakeholder; approval flips publish flag.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

### `sd-create-deck` — draft a pitch deck

**Purpose.** Multi-slide V2 deck, brand profile applied (theme inherited from brand by default), reuses existing block_templates as slide layouts, mints draft + approval URL.

**Trigger phrases.** `draft a deck about X`, `create a pitch deck for Y`, `make a presentation on Z`, `build a sales deck for W`, `investor deck`.

**Sourcing.** Optional. Same options as `sd-create-page`.

**Output.** `status: draft` deck + approval URL.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

### `sd-create-email` — draft an email campaign

**Purpose.** Drafts a campaign tied to an email list, applies the brand profile, optionally composes from existing `email_templates`, mints a draft + approval URL. Approval records a "ready" stamp; it does **not** auto-send — `email_campaigns_send` is a separate explicit action.

**Trigger phrases.** `draft an email about X`, `create a campaign for Y`, `write a newsletter on Z`, `announcement email for W`, `nurture email`.

**Sourcing.** Optional. Same options as `sd-create-page`.

**Output.** `status: draft` campaign + approval URL.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

### `sd-create-survey` — draft a survey / form / intake

**Purpose.** Authors a survey, form, intake questionnaire, NPS poll, or quiz with full feature coverage: `showIf` rules, page-jump branching, conditional options, per-field scoring (`option_map` / numeric / NPS), auto-route-to-CRM, recommendation engines, brand-aware styling.

**Trigger phrases.** `create a survey about X`, `build an intake form for Y`, `set up a feedback poll`, `NPS survey`, `qualification questionnaire`, `lead-capture form`, `quiz-style assessment`, `multi-step form with branching`.

**Output.** `status: draft` survey + approval URL. Approving flips to `active`, opening the public `/s/<slug>` route to responses.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

### `sd-create-booking-page` — manage booking pages

**Purpose.** Two flows.
- **(A) Embed an existing booking page** into a CMS page, deck, or email via the `booking` block (or `booking-menu` for all-services).
- **(B) Author a new booking page** via `booking_pages_create` + `booking_pages_update`, which mints an approval URL whose approval flips `active=true` so `/book/<slug>` starts accepting reservations.

Also lists and inspects booking pages, returning the public `/book/<slug>` URL for embeds.

**Trigger phrases.** `add a booking widget to this page`, `embed the discovery call booking`, `create a new booking page`, `set up consulting hours`, `add a calendar to the email`.

**Output.** A booking page id + public URL, or an embed block JSON snippet.

**Prerequisite.** `.sd/config.json` from `sd-init`.

---

### `sd-create-website` — compose a multi-page site end-to-end

**Purpose.** Highest-leverage authoring skill. Plans a sitemap, authors every page via the sub-skills above, wires top-nav, embeds a booking widget on the contact page, embeds a qualifier survey on the funnel page, applies brand profile across the site, and returns **one bundled response with every approval URL**.

**Trigger phrases.** `build a complete website for X`, `launch a new client site`, `compose a 5-page marketing site`, `set up the full site structure with nav`, `I want a real site, not just a landing page`.

**Output.** A set of draft posts (pages) + a draft nav + draft booking + draft survey + every approval URL, brand-aware logos/fonts/colors applied.

**Prerequisites.** `.sd/config.json` from `sd-init`. Active **sites subscription** on the tenant.

---

### `sd-build-html-embed` — ship hand-authored HTML

**Purpose.** Authors a self-contained HTML experience (single `index.html` OR a multi-file bundle with css/js/images/fonts) entirely in Claude Code, then uploads it to the portal as a draft page or single-slide deck. The output is a sandboxed iframe-rendered `html-embed` block — useful for interactive prototypes, motion-design experiments, custom calculators, immersive landing pages, anything outside the visual block editor's capacity.

**Trigger phrases.** `build an HTML embed`, `make an interactive widget`, `custom landing page with a working demo`, `huashu-style hi-fi mockup`, `upload this prototype`, `zip and ship`, `embed this single-file HTML into the portal`.

**Upload paths.**
- `posts_upload_html` — single HTML file, ≤1 MB
- `posts_upload_html_zip` — multi-file bundle, up to 50 MB (deck-variant available)

**Output.** Portal post + approval URL.

---

### `sd-learn` — capture feedback into long-term memory

**Purpose.** Records user feedback on an `sd-create-*` / `sd-build-*` output into `.sd/learnings.md` so future runs of sibling skills consult it before authoring. Structured by artifact (page, deck, email, survey, booking, HTML bundle); records what was accepted verbatim, what was edited, what was rejected, and the underlying rule the next run should change.

**Trigger phrases.** `remember this for next time`, `log this feedback`, `capture this`, `they wanted X not Y on the last page`, `don't make that mistake again`.

**Auto-invoked.** Sibling skills call `sd-learn` automatically at the END of a run if the user has given concrete feedback during the conversation.

**Idempotent and append-only.** Re-running on the same artifact replaces just that artifact's entry.

---

### `html-render-block` — edit html-render block JSON

**Purpose.** Edits the JSON object copied out of the portal's "Full block JSON (export / import)" panel. Operates on the canonical shape `{ type: "html-render", html, fields, values }`. Use for rename-field, add-array-item, translate, fix-content, change-headline, or any structural manipulation.

**Trigger phrases.** `edit my block JSON`, `update this pitch deck block`, `translate this block`, `rename a field`, `add an item to my block`, `fix my block content`, `change the headline in this block JSON`.

Also auto-triggers when the user pastes a JSON object containing `"type": "html-render"` plus `html`, `fields`, `values` keys.

**Output.** Modified block JSON, ready to paste back into the portal.

---

## Developer layer

### `simplerdev-feature-scaffold` — new CRUD resource

**Purpose.** Scaffolds a portal-scoped or admin-global CRUD feature in lockstep:
- Drizzle schema additions in `lib/db/schema/`
- REST API routes following the **canonical envelope** (`{ success, data | error }`, NextAuth, site-resolver middleware for tenant routes)
- E2E helpers
- A Playwright spec matching repo conventions

**Trigger phrases.** `scaffold <resource>`, `new CRUD for X`, `add a feature for X`.

**Why use over hand-rolling.** The route pattern (NextAuth + site-resolver + envelope) is load-bearing — CLAUDE.md flags it as architectural invariant. Skill enforces it.

**Pairs with.** `simplerdev-ui-scaffold` for the UI layer.

---

### `simplerdev-ui-scaffold` — admin / portal pages for a CRUD resource

**Purpose.** Creates `page.tsx` files with inline create/edit forms, data tables, and loading states for an **existing** CRUD resource. Follows the repo's conventions (server components + form actions + revalidation).

**Trigger phrases.** `scaffold UI for X`, `add admin page for X`, `add portal page for X`, `wire up UI for X`.

**Typical sequence.** `simplerdev-feature-scaffold` → `simplerdev-ui-scaffold`.

---

### `simplerdev-block-type` — new block type

**Purpose.** Adds a new block to the visual editor, keeping all five touchpoints in sync:
1. TypeScript interface in `lib/blocks/types/`
2. Render component in `components/blocks/render/`
3. Registry entry in `lib/blocks/registry.ts` (schema + defaults)
4. Production renderer case in `app/sites/...` (or the active rendering tree)
5. `/api/blocks` metadata entry

**Trigger phrases.** `new block`, `add block type`, `scaffold block`, `create <X> block`, `add a block for <X>`.

**Constraint.** All blocks are multi-tenant and universal — never client-specific.

**Visual exploration first.** Pair with `huashu-design` (in `.agents/skills/huashu-design/`) to produce 2–3 hi-fi HTML mockups in different design philosophies before committing.

---

### `simplerdev-mcp-tool` — new MCP tool

**Purpose.** Adds a new MCP tool to the in-repo SimplerDevelopment portal MCP server. Registers the handler, input schema (Zod), and scope guard in `lib/mcp/server.ts`. Optionally creates an adapter file at `lib/<feature>/mcp-*.ts` for larger feature sets.

**Trigger phrases.** `add MCP tool for X`, `expose X via MCP`, `new MCP tool`, `wire X into the MCP server`.

**Output.** A new tool that AI clients (Claude Code, Claude Desktop, etc.) can invoke against the portal.

**Pairs with.** `simplerdev-mcp-token-budget` (run after, especially if the tool's response shape includes large text/JSON columns).

---

### `simplerdev-mcp-token-budget` — payload economy audit

**Purpose.** Audits and refactors MCP tools in `lib/mcp/server.ts` (and `lib/<feature>/mcp-*.ts` adapters) to keep response payloads small. Applies:
- **Slim-by-default projections** — list/read returns drop large columns by default
- **Opt-in `include` flags** — callers explicitly request body/HTML/blocks blobs
- **Compact write-echoes** — create/update return only the id + the changed-fields delta

**Trigger phrases.** `reduce MCP tokens`, `audit MCP payloads`, `mcp response too big`, `trim mcp echo`, `why is the MCP so expensive`.

**Auto-pair.** Run after adding any MCP tool that touches a large text/JSON column. Proactively after `simplerdev-mcp-tool` for high-volume endpoints.

---

### `simplerdev-visual-editor` — audit / debug the CMS visual editor

**Purpose.** Research, audit, debug, and improve the block-based page builder for client websites. Covers:
- The iframe preview
- Selection / resize overlays
- Drag-and-drop
- The style sidebar
- The block registry
- The `postMessage` protocol between iframe and shell
- The rendering pipeline

**Trigger phrases.** `improve the editor`, `fix editor bug`, `audit the visual editor`, `editor feels slow/broken`, `add feature to block editor`, `selection/drag/style/layers panel`.

**Scope.** `app/portal/websites/[siteId]/posts/[id]/edit` and its supporting `components/` / `lib/` files.

---

### `site-migration` — import an external website

**Purpose.** Migrates an existing external site into the SimplerDevelopment platform. Handles the whole loop: discovery (crawl), content extraction, block-by-block translation, asset mirroring, brand inference, and draft-post creation in the portal.

**Trigger phrases.** `migrate site`, `import website`, `bring over their site`, `rebuild this site`, `clone this website`, `onboard a new client site`, `move site to our platform`, `new client site from [url]`, `pull content from [domain]`.

**Convention.** Auto-derives client email from domain as `{sitename}@simplerdevelopment.com` (per CLAUDE.md).

**Pairs with.** `huashu-design` for visual exploration on the landing page before block-by-block translation.

---

### `feature-integrator` — port features from an external codebase

**Purpose.** Analyzes external application source code, compares it against simplerdevelopment2026, identifies feature gaps, and integrates missing capabilities into the platform.

**Trigger phrases.** `find gaps between`, `integrate features from`, `port this to SimplerDevelopment`, `compare and implement`, `what features are missing`, `bring over from`, `adopt features from`, `merge capabilities from`.

**Typical input.** A path to external source (e.g. a booking-app, chat system, or component directory) alongside a request to implement or integrate it.

---

### `dev-block` — autonomous n8n-driven dev iteration

**Purpose.** One iteration of the autonomous development workflow driven by an n8n loop. Picks a task from `.planning/STATE.md` or open GitHub issues, implements it, runs the gates, commits, and returns structured JSON the n8n loop can route on.

**Trigger.** Invoked by the simplerdevelopment2026 dev-block n8n workflow, or by the user saying `dev block` / `start dev session` / `autonomous development` inside the repo.

**Do NOT use for.** Manual coding sessions, one-off tasks, debugging.

**Definition.** Lives at `.claude/skills/dev-block/SKILL.md`.

---

## Cross-cutting conventions

These apply across most SD skills.

### `.sd/config.json` is the tenant pointer
The bootstrap state for the authoring stack. Without it, `sd-create-*` skills error out. Re-run `sd-init` whenever the active client, brand profile, or default site changes.

### `.sd/learnings.md` is the long-term feedback log
Populated by `sd-learn`. Sibling skills consult it before authoring. Structured by artifact id, append-only, idempotent on re-run.

### Brand profile is load-bearing
Every authoring skill must apply the active brand profile (logos, fonts, colors, voice rules) — there's a memory note enforcing this (`feedback_mcp_brand_profile.md`). MCP-generated content that ignores the brand is treated as a bug.

### Material Icons over emojis in any UI
Per CLAUDE.md and repo memory. Every developer skill that authors UI must use Material Icons.

### Approval URLs decouple draft from publish
- Pages: approval → `published: true`
- Decks: approval → "ready" stamp
- Surveys: approval → `status: active` (opens `/s/<slug>` to responses)
- Booking pages: approval → `active: true` (opens `/book/<slug>` to reservations)
- Email campaigns: approval → "ready" stamp ONLY (send is a separate `email_campaigns_send` call)

### Tenancy is per-`clientId` / `siteId`
Every API route enforces it via NextAuth + the site-resolver middleware + the `{ success, data | error }` envelope. The scaffolds preserve this pattern.

### Default to drafts
`sd-create-*` skills publish drafts by default. The author hands the approval URL to a stakeholder for review. No silent auto-publish.

### One-feature-per-PR; one-block-per-commit during audits
Per CLAUDE.md commit-granularity conventions.

---

## When to chain skills

| Goal | Sequence |
|---|---|
| New client site from a URL | `site-migration` → `sd-init` (refresh brand) → `sd-create-website` |
| New CRUD resource end to end | `simplerdev-feature-scaffold` → `simplerdev-ui-scaffold` → (optional) `simplerdev-mcp-tool` → `simplerdev-mcp-token-budget` |
| New block type, design-led | `huashu-design` (hi-fi HTML mockups) → translate manually → `simplerdev-block-type` (scaffold the typed shape) |
| New MCP tool with a heavy payload | `simplerdev-mcp-tool` → `simplerdev-mcp-token-budget` |
| Visual-editor regression | `simplerdev-visual-editor` (audit) → either a direct fix or a `simplerdev-block-type` change |
| Author a complex prototype | `sd-build-html-embed` (single-file or zip) → upload as draft → review → `sd-learn` |
| Port a competitor's feature | `feature-integrator` (gap report) → `simplerdev-feature-scaffold` + `simplerdev-ui-scaffold` |

---

## What these skills are NOT

- **Not runtime libraries.** All of them are authoring-time aids for an agent. They do not ship to clients and are not invokable by portal end users.
- **Not a substitute for code review.** Scaffolds produce conventional shapes; the work still gets reviewed before merge.
- **Not a substitute for the visual editor.** Authoring skills draft content; humans approve and refine.
- **Not approval-bypassing.** Skills always produce drafts; nothing publishes without the human-mediated approval URL flow.
