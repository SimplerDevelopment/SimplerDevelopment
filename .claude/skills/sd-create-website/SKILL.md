---
name: sd-create-website
description: Compose a multi-page SimplerDevelopment website end-to-end — plans the sitemap, authors every page via sub-skills, wires top-nav, embeds a booking widget on the contact page, embeds a qualifier survey on the funnel page, applies brand profile across the site, and returns one bundled response with every approval URL. Use when the user says 'build a complete website for X', 'launch a new client site', 'compose a 5-page marketing site', 'set up the full site structure with nav', 'I want a real site, not just a landing page'. Default mode publishes everything as DRAFTS with brand-aware logos / fonts / colors applied; requires a sd-init `.sd/config.json` and an active sites subscription.
user-invocable: true
allowed-tools: Read, Write, Bash, WebFetch, Glob, Grep, Skill
---

# sd-create-website

The "compose a whole site" wrapper. Instead of authoring one page at a time, this skill drives `sd-create-page` for each entry in a planned sitemap, then connects them via `nav_*` MCP tools and the `survey` / `booking` blocks.

Use when the user wants a complete site, not a one-off page. For a single page, use `sd-create-page` directly.

## Pre-flight

1. **Read `.sd/config.json`** — confirm `client`, `defaultSiteId`, `brand`. If missing, run `sd-init` first.
2. **Read `.sd/learnings.md`** — apply `## Active rules`.
3. **Read `SD_DESIGN_PRINCIPLES.md`** — the cut test + 8pt grid + WCAG floors + logo policy apply to every page authored under this skill.
4. **Read `SD_SKILLS_RUNBOOK.md`** sections on `sd-create-page`, `sd-create-booking-page`, `sd-create-survey` — this skill calls into them.
5. **Bind the brand profile to the site.** Currently the `sites_update.brandingProfileId` field accepts an integer; verify the site has the right `brandingProfileId` set. If it's null, set it to `.sd/config.json:brand.profileId` so all rendered pages inherit the brand.

## Sitemap planning — state the spine first

Before authoring anything, the skill should state the **sitemap out loud** and get user confirmation. Most sites fit one of these spines (the user can mix-and-match):

### Spine A: Marketing site (5–7 pages)
- `/` — homepage (hero + value prop + 3 features + social proof + CTA)
- `/about` — about page (mission / team / story)
- `/solutions` (or `/services` or `/products`) — what we offer
- `/pricing` (optional — depends on category)
- `/blog` — list of blog posts (CPT index, not authored as a page)
- `/contact` — contact page (embedded `booking` block + form)
- `/legal/{privacy,terms}` — boilerplate legal pages

### Spine B: Service provider (3–4 pages)
- `/` — services overview + CTA
- `/about` — credibility
- `/contact` — embedded booking
- (optional) `/portfolio` or `/case-studies`

### Spine C: Funnel / qualifier site (3 pages)
- `/` — pitch + value prop
- `/qualify` — embedded `survey` block with the qualification questions
- `/contact` — embedded `booking` block (only after the survey routes high-scoring leads here)

### Spine D: Knowledge base / docs (3 pages + post type)
- `/` — landing
- `/docs` — docs CPT index
- `/contact` — booking
- Use `post_types_create` for the `docs` post type if it doesn't exist

**Don't author a 12-page site by default.** Sites at the small end (3–5 pages) ship faster, get reviewed faster, and are easier to keep on-brand. If the user asks for "everything," push back — they probably want a 5-page MVP, not a 12-page expedition.

## Authoring loop

For each page in the agreed sitemap:

1. **Compose the page brief** — derive `title`, `slug`, `postType`, and a 2-line content brief from the sitemap entry.
2. **Invoke `sd-create-page`** — pass the brief. It will:
   - Read the brand profile + learnings.
   - Compose blocks (hero + content + CTAs) using `posts_create`.
   - Return `{ id, slug, approval: { url } }`.
3. **Stash the result** — keep a list of `{title, slug, postId, approvalUrl}` to return at the end.
4. **For the contact page**: also call `booking_pages_list` to find an existing booking page (or run `sd-create-booking-page` Flow B to create one), then include a `booking` block in the contact page's body.
5. **For a qualifier page**: also run `sd-create-survey` for the qualification form, then include a `survey` block on the qualifier page pointing at its slug.

## Navigation

After all pages are authored:

1. Call `nav_list` to see what's currently wired.
2. For each page in the sitemap that should appear in the top nav, call `nav_create` with:
   ```json
   {
     "websiteId": <defaultSiteId>,
     "label": "<Page name>",
     "url": "/<slug>",
     "order": <sequence>,
     "openInNewTab": false
   }
   ```
3. Call `nav_publish_all` to promote all the drafted nav items to live.

**Page order matters.** Hero / about / solutions / pricing / contact / blog (last). Legal goes in the footer nav, not the top.

## Embedding artifacts

Two cross-skill patterns:

- **Booking on contact:** The contact page's blocks array ends with a `booking` block:
  ```json
  { "id": "embed-book", "type": "booking", "order": <last>, "slug": "<booking-page-slug>", "showLogo": true, "height": 720 }
  ```
- **Survey on qualifier (funnel pattern):** The qualifier page's blocks array embeds the survey:
  ```json
  { "id": "embed-survey", "type": "survey", "order": <last>, "slug": "<survey-slug>", "showLogo": true, "showPageTitle": false }
  ```
  After approval the survey flips `active`; its `recommendation.bookUrl` should already point at the `/book/<slug>` page so the funnel closes the loop.

## MCP response handling — read errors first

SimplerDevelopment's MCP wraps every response — successes AND errors — in a JSON-RPC success envelope shaped like:

```
{"result":{"content":[{"type":"text","text":"{...JSON...}"}]}}
```

Before reporting success to the user, parse `result.content[0].text` as JSON. If the parsed object contains an `error` key (e.g. `{"error":"Site not found"}` or `{"error":"Unauthorized"}`), the call FAILED — even though the JSON-RPC envelope said `result`. STOP immediately. Surface the error verbatim to the user. Do NOT invent a successful response with a made-up post id, approval URL, slug, or site name. Hallucinated success is worse than a visible failure — the user will publish content that doesn't exist or copy approval URLs to stakeholders that 404.

Only treat the call as successful when the parsed text contains the expected entity shape (e.g. `{"id":..., "approval":{...}}` for `posts_create`).

## Output

After every step:
- A bullet list of every page authored: `{ id, title, slug, approvalUrl }`
- A bullet list of any booking pages / surveys created or linked
- The aggregate "what's left to approve" list — every URL the user needs to share with reviewers
- A one-screen sitemap summary (a tree-ish text rendering of the routes)
- 5-dim self-review per `SD_DESIGN_PRINCIPLES.md`, applied to the SITE as a whole — does the brand voice carry across all pages? Are visual rhythms consistent? Did any page sneak in off-brand colors?

## Iteration

- **Edit one page** → call `sd-create-page` (delegated to `posts_update`) with the page id. Each update mints a fresh approval URL for THAT page only; the rest of the site's pages stay as-is.
- **Re-order nav** → `nav_update` per item to change `order`, then `nav_publish_all`.
- **Add a new page mid-flight** → invoke `sd-create-page` for the new page, then `nav_create` for the nav entry, then `nav_publish_all`. Done.
- **Major rework** → the site doesn't fork as a unit (there's no `parent_site_id`); fork individual pages with `posts_fork` and rewire the nav.

## Self-improvement

After every run, invoke `sd-learn` with the user's feedback as the artifact ref `site-<defaultSiteId>` so the next site composition for this client inherits the active rules. Examples that accumulate here:

- "Always lead with the value-prop hero, never with a quote."
- "This client never wants /pricing — use /work-with-us instead."
- "Footer must include the address from the brand profile, not just the company name."

## Failure modes

- **No `.sd/config.json`** → run `sd-init` first.
- **`defaultSiteId` is null** → the client has no website provisioned. The user needs to create one via `/portal/websites/new` first; this skill won't auto-create.
- **Subscription not active** → `posts_create` rejects with "active sites subscription required." Surface and stop.
- **Sitemap has > 12 pages** → push back. "That's a big site for a first draft — would you rather start with 5 core pages and iterate?"
- **`branding_profile_id` is null on the site** → flag and offer to bind it before authoring. Pages will inherit brand colors anyway (via the client default profile), but having an explicit binding avoids drift later.

## Install

This skill ships as part of the SimplerDevelopment client skills bundle. Install all 10 sibling skills in one step from the portal:

**https://simplerdevelopment.com/install**

macOS, Windows, and Linux installers download the bundle to `~/.claude/skills/`. Both Claude Desktop and Claude Code auto-discover skills from that path on next restart.

See `CLIENT_QUICKSTART.md` (installed alongside this file) for the full setup walkthrough, including the MCP-server config Claude Desktop needs and the one-time `sd-init` bootstrap.
