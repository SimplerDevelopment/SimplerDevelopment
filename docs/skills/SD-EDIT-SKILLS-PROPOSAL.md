# Proposal — `sd-edit-*` skill family

A sketch of an edit-focused companion to the `sd-create-*` authoring skills. **This document describes work that does not exist yet.** It is a starting point for an actual build, not a contract.

The motivation: today, the authoring layer is create-only. For pages / decks / emails / surveys, an agent can draft new artifacts but cannot revise existing ones except by:
- hand-rolling raw MCP calls to `*_update` tools, or
- telling the user to open the visual editor.

This is the missing rung.

---

## Phase 0 audit — what the MCP server already supports (2026-05-15)

**Conclusion: the MCP surface is essentially complete. No new MCP tools needed for the proposed family.**

| Domain | Update | Fork (revision-as-clone) | Revisions API | Slide / page-level publish | Schedule |
|---|---|---|---|---|---|
| Pages (`cms.ts`) | `posts_update` | `posts_fork` | `posts_list_revisions` | — | — |
| Decks (`pitch-decks.ts`) | `decks_update` | `decks_fork` | (via fork) | `decks_publish_slide`, `decks_publish_all` | — |
| Email (`email.ts`) | `email_campaigns_update`, `email_lists_update`, `email_subscribers_update` | `email_campaigns_fork` | (via fork) | — | `email_campaigns_schedule` |
| Surveys (`surveys.ts`) | `surveys_update` | `surveys_fork` | (via fork) | — | — |
| Nav | `nav_update` | — | — | `nav_publish`, `nav_publish_all` | — |
| Sites | `sites_update`, `sites_update_custom_code` | — | — | `sites_publish_custom_code` | — |
| Block templates | `block_templates_update` | `block_templates_fork` | — | `block_templates_publish` | — |

### The fork pattern *is* the proposal's "revision-on-edit-of-published" mechanism

`posts_update` ergonomics from `lib/mcp/tools/cms.ts:280`:
- Partial: takes `id`, plus optional `title`, `blocks`, `content`, `excerpt`, `published`, `customCss`, `customJs`
- `blocks` is a full array (no in-place block patches at the server)
- Slim-by-default echo: full content body only echoed when `includeContent: true`

`posts_fork` ergonomics (`cms.ts:358`):
- Duplicates a published post into a new draft tied via `parent_post_id`
- Returns `{ newPostId, approvalUrl }`
- Approval merges the fork back over the parent (last-write-wins against current live state)
- This **is** the "edit published → mint draft + approval URL" flow my Phase 1 proposed. Use it as-is.

### What this means for the proposed skill family

| Originally proposed concept | Reality on the MCP surface | Build implication |
|---|---|---|
| `replace` mode | `posts_update` with new `blocks` array | Trivial; one call |
| `patch` mode (block-level targeting) | `posts_get` → mutate → `posts_update` with full updated blocks | Client-side; no new server primitive |
| `prose` mode | Same as patch — fetch-modify-update | Client-side helper iterates text fields |
| Revision-on-edit of published | `posts_fork` (returns approval URL) | Use as-is — already does exactly this |
| Conflict detection (visual editor changed it) | Available via `updated_at` in `posts_get` projection | Compare stamps before write |
| Survey live-response protection | `surveys_fork` exists | Use as-is |

**Bottom line: Phase 1 is unblocked. No `simplerdev-mcp-tool` work needed first.**

The patch/prose modes are not MCP primitives but rather *skill-side compositions* of `*_get` → mutate → `*_update`. The skill prompt and helper code carry that complexity; the server stays simple.

### Minor follow-ups (not blockers)

- **No `posts_revisions_create` tool.** Updates implicitly create revision rows (per the existing `posts_list_revisions` semantics — "autosaves, manual saves, publishes"). If we want explicit named revisions, that's a future MCP tool, but not needed for Phase 1.
- **No `media_upload` exposed to MCP yet** (only `media:read` / `media:write` scopes are referenced; specific tool names need verification). Image-swap edits in `patch` mode may need to call back to the portal's upload endpoint directly. Defer until first concrete need.
- **`includeContent` default false** is the existing token-budget discipline (per `simplerdev-mcp-token-budget` policy). Edit skills will need to opt-in to `includeContent: true` only on the GET phase, not on the UPDATE echo.

---

## Design principles

1. **Mirror the create skill, don't fork it.** Edit skills accept the same sourcing inputs, apply the same brand profile, use the same approval flow. The only added concept is *targeting an existing artifact*.
2. **Three edit modes.** A skill should support coarse-to-fine targeting:
   - `replace` — whole-artifact swap (rare; only for "rewrite this page from scratch")
   - `patch` — structural change to a specific block / slide / field / segment
   - `prose` — text-only edit, leave structure alone
3. **Revision-aware, not destructive.** Where the platform already supports revisions (`posts_calendar` scheduled-publish + revision-revert exists on staging), edit skills produce a new revision and let the existing approval/publish flow decide what becomes live.
4. **Conflict-aware.** If a human edited the artifact in the visual editor between agent runs, the skill detects it and surfaces the conflict before overwriting.
5. **Approval on every edit of published content.** Editing a draft → keeps it a draft. Editing a published artifact → mints a new draft revision + approval URL; nothing goes live without human approval.
6. **Brand profile applied on edit.** Per `.sd/config.json`. Same rule as create skills.
7. **Auto-call `sd-learn`.** When the user gives concrete feedback during the run, capture it.

---

## Per-skill sketches

### `sd-edit-page`

**Purpose.** Revise an existing CMS page. Patch a single block, rewrite prose across blocks, or replace the page wholesale.

**Targeting.** Accepts any of:
- `postId` (preferred, unambiguous)
- `slug` (resolved within `defaultSiteId` from `.sd/config.json`)
- `url` (e.g. `/about` — resolved via the post lookup)
- A natural-language hint (e.g., "the about page", "the proposal landing") — falls back to a fuzzy slug/title search; if ambiguous, asks the user

**Edit modes.**
- `replace` — full new `blocks` array (uses `sd-create-page` internals as a sub-call)
- `patch` — JSON-pointer-style targeting: `blocks[3]`, `blocks[3].fields.headline`, `blocks[hero].cta.label`
- `prose` — finds all text fields in the block tree and revises in place, structure untouched

**Lifecycle.**
- If target is a draft → updates in place
- If target is published → creates a new draft revision + approval URL
- Returns: revision id + approval URL (or, in draft mode, the updated post id)

**MCP underpinnings.** `posts_update`, `posts_get`, `posts_revisions_create` (probably already exist; verify in `lib/mcp/server.ts`).

**Trigger phrases.**
- `edit the about page`
- `update the hero on /pricing`
- `fix the typo on landing-2`
- `rewrite section 3 of the proposal page`
- `swap the testimonials on the homepage`

---

### `sd-edit-deck`

**Purpose.** Revise an existing pitch deck. Edit a single slide, reorder slides, swap a layout, or rewrite the deck's prose.

**Targeting.** Accepts `deckId`, `slug`, or a natural-language hint. Also supports slide-level targeting: `deck:42 slide:4`.

**Edit modes.**
- `replace-slide` — swap a single slide's blocks
- `insert-slide` / `remove-slide` / `reorder-slides`
- `patch` — JSON-pointer into a slide's block tree
- `prose` — text-only edit across the whole deck or a slide range
- `theme` — only the deck theme / brand mapping (no content change)

**Lifecycle.** Same as `sd-edit-page` — drafts update in place, published decks mint a new revision + approval URL.

**MCP underpinnings.** `pitch_decks_update`, `pitch_decks_get`, slide-CRUD tools.

**Trigger phrases.**
- `tone down section 3 of the proposal deck`
- `swap the team slide`
- `add a pricing slide after slide 5`
- `make the deck darker`
- `reorder slides 4 and 5`

---

### `sd-edit-email`

**Purpose.** Revise an existing email campaign before it's sent.

**Targeting.** Accepts `campaignId` or `slug`. NL hint search supported.

**Edit modes.**
- `subject` — change just the subject line (most common)
- `prose` — text-only edits across the campaign body
- `patch` — JSON-pointer into the campaign's block tree
- `replace` — full body swap (uses `sd-create-email` internals)
- `list` — change the recipient list (treated as a higher-risk edit; surfaced clearly)

**Lifecycle.**
- If `status: draft` → updates in place
- If `status: ready` (post-approval) → reverts to `draft`, mints a new approval URL
- **Send is still a separate explicit action.** Editing never triggers a send.

**MCP underpinnings.** `email_campaigns_update`, `email_campaigns_get`.

**Trigger phrases.**
- `revise the welcome email`
- `update the subject line on campaign 47`
- `make the announcement email less formal`
- `swap the CTA on the nurture email`

---

### `sd-edit-survey`

**Purpose.** Revise an existing survey, form, or intake questionnaire — structurally or in prose. The trickiest of the family because surveys carry branching logic, scoring, and (potentially) live responses.

**Targeting.** `surveyId` or `slug`. NL hint search supported.

**Edit modes.**
- `add-question` / `remove-question` / `reorder-questions`
- `patch` — JSON-pointer into question shape (label, options, scoring, `showIf`, page-jump)
- `prose` — labels and help-text only
- `branching` — modify `showIf` rules / page jumps
- `scoring` — modify per-field scoring (`option_map`, numeric, NPS)
- `replace` — full survey body swap (uses `sd-create-survey` internals)

**Lifecycle.**
- If `status: draft` → updates in place
- If `status: active` (already collecting responses) → forks into a `draft` copy + approval URL. Approval can either (a) supersede the active survey at the same `/s/<slug>` or (b) create a new slug; the skill should ask. This protects existing in-flight responses from schema-drift.

**MCP underpinnings.** `surveys_update`, `surveys_get`, `surveys_fork` (already exists per staging history — `feat(mcp+email): surveys_fork + brand-aware booking confirmation...`).

**Trigger phrases.**
- `add a question to the qualifier survey`
- `change the NPS scoring on the satisfaction survey`
- `swap question 3's options`
- `add a branch: if budget < 5k jump to disqualifier page`

---

## Cross-cutting concerns

### Targeting resolution

Every edit skill needs a shared targeting helper. Suggested flow:
1. If id provided → use it
2. Else if slug/url provided → resolve via tenant-scoped lookup
3. Else NL hint → fuzzy search title + slug; if >1 match, ask user; if 0 matches, fall back to asking
4. Always echo back the resolved id + title before editing, so the user can abort if wrong

Build this as `lib/mcp/edit-targeting.ts` so all four skills share it.

### Conflict detection

Two cases to detect:
1. **Human edited in the visual editor since the last agent touch.** Compare `posts.updated_at` (or equivalent) to a value the skill stamps when it last saw the artifact. If newer, prompt: "the page was edited at $TIME — proceed and overwrite, branch a new revision, or abort?"
2. **Another agent edited concurrently.** Same mechanism; the staleness check covers both.

Surface conflicts as a structured prompt, never silently overwrite.

### Edit-mode discipline

The skill prompt should reject vague edits. Examples:
- `edit the page` — ask: which mode? which blocks?
- `fix the typo on /pricing` — `prose` mode, run the text-only revision
- `rewrite the page` — confirm `replace` mode (rare, often unintended)
- `swap the hero image` — `patch` mode targeting `blocks[hero].image`

Edit modes are explicit so accidents are rare.

### Revision strategy

Edits of published content always create a new revision. Edits of drafts modify in place by default but allow `--revision` opt-in if the user wants version history.

Implementation note: the existing `revision-revert` work on staging (`portal-cms-gap-close.spec.ts:32 — schedule a future publish, then clear it`) implies revisions already work for pages. Verify the same exists for decks / emails / surveys before assuming.

### Approval flow on edit

| Source status | After edit (default) | Approval URL minted? |
|---|---|---|
| `draft` | `draft` (updated in place) | No |
| Published / `active` / `ready` | `draft` revision | Yes — approval restores publish state |

This keeps the "humans approve published changes" invariant intact.

### `sd-learn` integration

After every edit run, if the user has given concrete feedback ("no, more casual", "shorter subject line"), auto-invoke `sd-learn` to capture the rule for the next run. Same pattern as the create skills.

---

## Implementation phasing

A reasonable build order. **Phase 0 is complete (see audit above) — start at Phase 1.**

1. **~~Phase 0 — Audit MCP coverage.~~** ✓ Done 2026-05-15. MCP surface is sufficient — no `simplerdev-mcp-tool` prerequisite work needed.
2. **Phase 1 — `sd-edit-page` (highest-leverage).** Pages are the most-edited artifact and have the most-mature revision infrastructure on staging. Build it; use it; refine the pattern. See concrete Phase 1 spec below.
3. **Phase 2 — `sd-edit-email`.** Second-highest-leverage; the "edit before send" use case is common, and `email_campaigns_send` already gates the actual send.
4. **Phase 3 — `sd-edit-deck`.** Slide-level targeting is more complex than page-level; build after Phase 1 has settled the pattern. `decks_publish_slide` enables slide-granular publish, which is unique to this skill.
5. **Phase 4 — `sd-edit-survey`.** Hardest because of live-response protection. `surveys_fork` is the protective primitive (already on staging).
6. **Phase 5 — Edit-aware `sd-edit-website`?** Probably *not* worth building. Edit at the page level; full-site rewrites are rare enough to use `sd-create-website` again on a new slug.

---

## Phase 1 spec — `sd-edit-page` (build-ready)

### Skill location

`.claude/skills/sd-edit-page/SKILL.md` — mirrors the existing layout for `dev-block` (the only in-repo skill with a findable SKILL.md). Companion helper at `lib/mcp/sd-edit-helpers.ts` if shared logic emerges (targeting, conflict detection, prose-walker).

### Trigger phrases
- `edit the about page` / `update the [slug] page`
- `fix the typo on /pricing`
- `rewrite section 3 of the proposal page`
- `swap the testimonials on the homepage`
- `change the hero headline on the landing page to "..."`
- `tone down the about page`

### Input shape (skill prompt args)

```
{
  target: {                    // one of:
    postId?: number,
    slug?: string,
    url?: string,
    hint?: string,             // NL search; resolves to id or asks user
  },
  mode: 'replace' | 'patch' | 'prose',
  instructions: string,        // what to change, in plain language
  source?: {                   // optional sourcing material
    kb?: string,               // knowledge base path
    url?: string,
    text?: string,
  },
  liveStrategy?: 'fork' | 'in-place' | 'ask',   // default: 'ask' when published
}
```

### Execution flow

1. **Resolve target.** If `postId` not given, look up by slug → url → hint. If ambiguous, ask the user.
2. **Fetch current state.** `posts_get` with `includeContent: true`. Stash `updated_at` for conflict check.
3. **Conflict check.** (If the skill has cached a prior `updated_at` for this post.) If `current.updated_at > cached`, prompt: "Edited in the visual editor at $TIME — proceed / fork / abort?"
4. **Determine target row:**
   - Source is draft → edit `posts_update` in place
   - Source is published + `liveStrategy === 'fork'` (default for published) → `posts_fork` first, edit the fork
   - Source is published + `liveStrategy === 'in-place'` → caller explicitly opted in to live-edit; warn loudly
5. **Apply edit mode:**
   - `replace` → compose new `blocks[]` from `source` material (delegate to `sd-create-page` internals if available, else inline composition)
   - `patch` → JSON-pointer mutation: parse `instructions` into pointer+op; apply to fetched blocks tree; send full updated `blocks` to `posts_update`
   - `prose` → walk all text-bearing fields (`title`, `excerpt`, every block's `text`/`headline`/`label`/`richtext`/`alt`), apply the LLM revision per-field, preserve structure, send full updated `blocks` + `title`/`excerpt` to `posts_update`
6. **Echo back.** Return `{ postId, websiteSlug, approvalUrl, mode, livePosture }`. `approvalUrl` is present if a fork was created or if the edit is to a previously-published row.
7. **Capture feedback.** If the user critiques during the conversation, auto-invoke `sd-learn`.

### Patch-mode addressing syntax (decision)

Use **JSON Pointer** (RFC 6901):
```
/blocks/3                    # entire block at index 3
/blocks/3/fields/headline    # one field on that block
/title                       # top-level field
```

Reasons over `blocks[3].fields.headline` dot syntax:
- Standard (RFC 6901), already used by other Anthropic surfaces
- Trivial mapping to JS (`pointer.split('/').reduce(...)`)
- Disambiguates numeric indices vs field names cleanly
- Plays well with future patch ops (RFC 6902 / JSON Patch)

### Prose-mode boundary (decision)

Text-revisable fields:
- `posts.title`, `posts.excerpt`
- Per-block: `text`, `headline`, `subheadline`, `label`, `richtext`, `body`, `caption`, `alt` (image alt), `ctaLabel`
- **Not** revised in prose mode: `url`, `href`, `image`, `videoUrl`, `embedCode`, `id`, `slug`, structural fields, schema fields (`type`, `order`, `width`, etc.)

Walker lives in `lib/mcp/sd-edit-prose-walker.ts`; reusable across all four `sd-edit-*` skills.

### Approval flow on edit

| Source state | Default strategy | Approval URL? |
|---|---|---|
| `published: false` (draft) | In-place via `posts_update` | No |
| `published: true` | `posts_fork` then edit the fork | Yes — approval merges fork back |
| User overrides with `liveStrategy: 'in-place'` on a published post | Warn loudly, then `posts_update` directly | No — but stamp a revision visibly in the response |

### Conflict detection — minimal implementation

Skip conflict caching in v1. Just always re-fetch immediately before the update. If we want to detect *during the skill's own conversation*, that's a future enhancement when we see the failure mode appear.

### Tests to add alongside Phase 1

- Unit: prose-walker handles every block type in `lib/blocks/registry.ts` (parameterize over registry)
- Unit: JSON-pointer patch on a known block tree (round-trip)
- Integration (`tests/integration/mcp/`): edit a draft in-place, edit a published post via fork (assert fork created + approval URL minted)
- E2E (deferrable): full agent loop — fetch, modify, approve, verify live post updated

### What Phase 1 does NOT include

- Image / asset replacement (defer to follow-up; needs upload pipeline review)
- Multi-locale editing (open question; defer)
- Auto-schedule publish (use existing `posts_calendar` work)
- Streaming partial edits (full one-shot only)
- Edit history beyond what `posts_list_revisions` already provides

### Build estimate

- Skill prompt (`SKILL.md` + arg schema): half day
- Prose-walker (shared helper): half day
- Targeting helper (shared helper): half day
- JSON-pointer patch util (shared helper): 1–2 hours
- Wiring + 3 mode dispatcher: half day
- Tests: 1 day
- **Total: ~3 days for a working `sd-edit-page` + the shared helpers all four future skills will reuse.**

---

## Open questions to settle before building

1. **Patch-mode addressing.** JSON-pointer? `blocks[3].fields.headline` vs `/blocks/3/fields/headline` vs a CSS-selector-ish `blocks:nth(3) headline`. Pick one and stick with it across all four skills.
2. **Prose-mode boundary.** What counts as "prose"? Block titles? `richtext` fields only? Alt text on images? Decide and document.
3. **Auto-revision on draft edits.** Always create a revision on every edit, or only when an opt-in flag is passed? Tradeoff: history vs noise.
4. **Multi-locale edits.** Does the platform support locale-specific content? If so, edit skills need locale targeting on day one — otherwise it's a hard retrofit.
5. **Image / asset edits.** "Swap the hero image" implies file upload during edit. Should image-replace funnel through the existing portal upload pipeline, or is there a dedicated MCP tool? Confirm before building.
6. **Send-time guard on `sd-edit-email`.** Should editing a campaign with `scheduled_send_at` set automatically clear the schedule? Probably yes; flag for user.
7. **`sd-edit-booking-page`?** `sd-create-booking-page` already does updates (per its description). Either fold edits into the existing create skill (status quo, slightly weird name) or split the create skill into `sd-create-booking-page` + `sd-edit-booking-page`. Lean toward the split for consistency with the rest of the family.

---

## What this does NOT propose

- **No new visual editor.** Edits go through MCP tool calls; the visual editor remains the canonical UI for hands-on work.
- **No bypass of approval.** Edits of published content still flow through human approval.
- **No autonomous edit loops.** This is agent-assisted editing, not "auto-revise the whole site every week."
- **No analytics-driven edits.** A future "rewrite the page based on funnel performance" skill is a separate proposal; this family is content-only.
