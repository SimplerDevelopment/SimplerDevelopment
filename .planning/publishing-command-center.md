# Publishing Command Center

**Status:** Planning · 2026-05-21
**Branch:** `staging` · **Target merge:** `staging` → `main` per release process
**Scope:** SD platform feature, per-tenant. Not a client project.
**Supersedes:** the goal of BRAIN-16 (project 141 on the Post Captain portal). That card is unchanged in the portal — its goal is folded into **PUB-17** below.

## One-line summary

A new top-nav portal feature that gives every tenant a single kanban + calendar across all outbound content — website, email, LinkedIn (and later other social), pitch decks, surveys, booking pages — with cross-channel campaigns and tags. Replaces the per-channel scatter (separate kanban boards for blog, LinkedIn, etc.).

## Why

Today, outbound content for a client lives in ~5 different surfaces with no unified view. Editorial planning has to happen mentally. There's no answer to "what is going out next week, on which channel, for which campaign?" without opening five boards. Per-channel calendars exist but don't span channels or sites. Scheduling exists for emails only. LinkedIn posting doesn't exist at all. The fragmentation gets worse as we add channels.

Publishing collapses that into one workflow. The kanban is the planning view, the calendar is the timeline view, both render the same items. Each card represents one piece of content on one channel, owned by one campaign, carrying any tags, and at one of six standard stages. Stage transitions trigger the actual publish action on each channel.

## Locked architectural decisions

These were resolved across the planning conversation. Listed here so the next person picking this up doesn't relitigate them.

1. **Replace, don't aggregate.** Per-channel kanban boards (Blog #114, LinkedIn #116 on the Post Captain portal) stay where they are for reference. New work moves to Publishing. No data migration in v1 — skip the import.
2. **Reuse the existing kanban subsystem.** Publishing is a special "system" kanban project per client. Same `kanban_*` tables (cards, columns, labels, card_artifacts), routed at `/portal/publishing` instead of `/portal/projects/[id]`. Hidden from the regular Projects listing via a system flag.
3. **Polymorphic artifacts.** Each publishing card has a single linked artifact via `kanban_card_artifacts`, modeled the same way CRM-deal artifacts work. The artifact identifies the actual content entity. `artifactType ∈ { cms_post, email_campaign, linkedin_draft, pitch_deck, survey, booking_page }`.
4. **One artifact per card.** A blog post + its LinkedIn companion + its email blast = three cards in the same campaign, not one card with three artifacts. Keeps stage semantics clean per channel.
5. **All six channels at v1:** CMS posts, email campaigns, LinkedIn drafts, pitch decks, surveys, booking pages. LinkedIn ships its OAuth + posting worker as part of this work.
6. **Fixed default stages.** `Idea → Draft → In Review → Scheduled → Published → Archived`. No per-client customization in v1; phase-2 unlock.
7. **Campaigns are one-to-many.** Each card belongs to at most one campaign. Many-to-many is a future possibility, not v1.
8. **Tags generalized.** The existing `tags` table joins only to `posts`. Widen the model so the same tag can attach to any artifact type.
9. **Own calendar view.** `/portal/publishing/calendar` spans all sites within a client. The existing `/portal/websites/[siteId]/calendar` stays as a per-site lens with a different audience.
10. **Permissions:** client owners + admins can move cards across stages and manage other team members' selective stage/action permissions. Non-admin team members start with view-only and can be granted specific abilities (e.g., "can move into In Review but not Scheduled," "can create cards but not delete").
11. **Notifications: in-app + email** on `In Review` / `Scheduled` / `Published` / `Failed` transitions. **Not** `approvals_*` — those are MCP-side for AI-generated content review. Publishing is planning workflow.
12. **Brain integration is a side panel on `Draft`-stage cards,** not a per-channel kanban feature. `brain_search` results surface to the right of the card editor; one-click pins a citation. This is PUB-17 and supersedes BRAIN-16's goal.
13. **Top-nav placement:** above CRM.
14. **Card editor surface:** click into a publishing card → metadata panel + a contextual "Open in editor" deep-link to the artifact's native editor (visual editor for CMS, email composer, LinkedIn composer, etc.). No inline editor switching per artifact type.
15. **Stage transitions trigger per-channel publish.** Each channel adapter listens for the transition into `Scheduled` / `Published` and performs its publish action. Worker auto-flips card to `Published` (or `Failed` with error) on completion.
16. **Per-client timezone.** Admin sets a client default; stored UTC; UI renders in client local. No per-user override in v1.
17. **Archive auto-hide after 30 days.** Cards in `Archived` are hidden from the default board view 30 days after the transition; still queryable via "Show archived" filter. No data deletion.

## Data model — what changes

### New tables

- **`publishing_campaigns`**
  - `id` (pk), `clientId` (fk), `name`, `slug`, `description`, `color`, `startDate`, `endDate`, `status` (`active | completed | archived`), timestamps.
  - One per client per campaign. Slug unique per client.

- **`publishing_permissions`**
  - `(clientId, userId, permissionKey)` composite key with a value of `granted | denied`.
  - Permission keys: `move_to_idea | move_to_draft | move_to_in_review | move_to_scheduled | move_to_published | move_to_archived | create_card | delete_card | manage_campaigns | manage_tags | manage_permissions`.
  - Absence of row = inherit default (owners/admins all, others nothing).

- **`linkedin_drafts`** (Phase 2, kept here for completeness)
  - `id` (pk), `clientId`, `authorUserId`, `body` (text), `mediaUrls` (jsonb), `urlPreview` (jsonb), `integrationId` (which connected LinkedIn identity to post as), `status`, `scheduledFor`, `externalUrn`, `errorReason`, timestamps + soft-delete.

### Modified tables

- **`projects`** — add `systemKind` (nullable text, indexed). Values like `'publishing'` mark a project as system-managed; hidden from regular project listings; routed by feature.
- **`clients`** — add `publishingProjectId` (nullable fk to `projects`) so each tenant's Publishing project is discoverable; bootstrapped on first visit to `/portal/publishing`.
- **`clients`** — add `defaultTimezone` (text, default `'UTC'`) for scheduling.
- **`kanban_cards`** — add `campaignId` (nullable fk to `publishing_campaigns`). Index on `(projectId, campaignId)` for filter performance.
- **`kanban_card_artifacts`** — widen `artifactType` to include the six channel types listed above. Confirm the column is already enum-like, not free-form; if free-form, no schema change, just code-side discrimination.
- **`tags`** + new **`taggings`** join table. Today `post_tags` is the join. New shape: polymorphic `taggings(tagId, taggableType, taggableId, clientId)`. Migrate existing `post_tags` rows into `taggings` with `taggableType='cms_post'`. Keep `post_tags` for one release as a compatibility view, then drop.
- **`integrations.provider`** — widen to include `'linkedin'` (today just `'google'`).

### `posts` table (CMS)

Today: `published` (bool) + `publishedAt` (timestamp).
v1 adds: `scheduledFor` (timestamp, nullable) + `publishStatus` (enum: `draft | scheduled | published | failed`). The bool `published` becomes derived (or stays as a denormalized convenience column synced with the enum).

### Migrations

One Drizzle migration per phase to keep blast radius small:
- `pub-0001` — campaigns, permissions, `projects.systemKind`, `clients.publishingProjectId`, `clients.defaultTimezone`, `kanban_cards.campaignId`. (PUB-2)
- `pub-0002` — taggings polymorphic + backfill from `post_tags`. (PUB-7)
- `pub-0003` — `posts.scheduledFor` + `publishStatus`. (PUB-8)
- `pub-0004` — `linkedin_drafts` + `integrations.provider` widening. (PUB-12/PUB-13)

**DB target:** all migrations run against the local dev DB during development. Migration to switchyard/metro is gated on the release process — staging → main merges hand-apply new SQL against metro per the existing convention. Confirm switchyard vs. local dryrun DB before PUB-2 starts.

## Stages

```
Idea → Draft → In Review → Scheduled → Published → Archived
```

| Stage | What it means | Channel-specific state on entry |
|---|---|---|
| **Idea** | Captured but not started. Title only is fine. | None — artifact may not exist yet. |
| **Draft** | Being written. Brain-search side panel surfaces relevant notes. | Artifact created in its native draft state (`posts.published=false`, `email_campaigns.status='draft'`, etc.). |
| **In Review** | Needs another set of eyes before scheduling. | No state change; notification fires. |
| **Scheduled** | Has a date/time, will publish automatically. | Artifact's scheduling field set (`posts.scheduledFor`, `email_campaigns.scheduledAt`, `linkedin_drafts.scheduledFor`). |
| **Published** | Live / sent / posted. | Worker performed the publish action; result stored. Card auto-moves here on success. |
| **Archived** | No longer relevant. | Artifact unchanged; card hidden from default board after 30 days. |

## Channel adapters

Each adapter is a small module that translates kanban card stage transitions into channel-native actions and listens for channel-native events to update the card.

| Channel | Artifact | "Scheduled" action | "Published" trigger | Notes |
|---|---|---|---|---|
| CMS post | `cms_post` | Set `posts.scheduledFor` + `publishStatus='scheduled'` | Cron worker (new, PUB-8) finds due posts and flips `published=true` | Adds `scheduledFor` column. Worker is new. |
| Email campaign | `email_campaign` | Set `email_campaigns.scheduledAt` + `status='scheduled'` | Existing email worker (already sends scheduled campaigns) | Just connect kanban card to existing infrastructure. |
| LinkedIn draft | `linkedin_draft` | Set `linkedin_drafts.scheduledFor` + `status='scheduled'` | New cron worker (PUB-14) calls LinkedIn Posts API | Full OAuth + client + worker build. Phase 2. |
| Pitch deck | `pitch_deck` | Set publish-at; or treat publish as immediate | `decks_publish_all` invoked by adapter | Decks don't have native scheduled-publish today; simplest v1 = "publish immediately when card hits Scheduled." |
| Survey | `survey` | n/a | Adapter flips survey status `draft → active` | Surveys don't have a future-scheduled state; same as decks. |
| Booking page | `booking_page` | n/a | Adapter flips booking page `active=true` | Same as surveys. |

## UI shape

### Top nav
- New entry: **Publishing** · above **CRM**, below **Brain** (or wherever Brain sits relative to CRM today — confirm during PUB-3).

### Routes
- `/portal/publishing` — redirects to `/portal/publishing/board`
- `/portal/publishing/board` — kanban view (default)
- `/portal/publishing/calendar` — calendar view of the same data
- `/portal/publishing/campaigns` — campaign list
- `/portal/publishing/campaigns/[id]` — single campaign (filtered board/calendar)
- `/portal/publishing/tags` — tag taxonomy admin
- `/portal/publishing/permissions` — permissions matrix (owners/admins only)
- `/portal/integrations/linkedin` — LinkedIn OAuth integration page (Phase 2)

### Board view (PUB-4)
- Six columns, fixed.
- Card chrome: channel icon, title, scheduled-for, campaign chip, tag chips, assignee avatar, stage-specific contextual action.
- Filters: channel (multi), campaign (single), tag (multi), stage (multi), assignee (multi), date range.
- Default filter: hide archived cards older than 30 days. "Show archived" toggle reveals.

### Calendar view (PUB-5)
- Adapts `components/content-calendar/ContentCalendar.tsx`. Adds the `surface: 'cms' | 'email' | 'linkedin' | 'deck' | 'survey' | 'booking'` discriminator on the type.
- Per-surface color coding.
- Drag-and-drop to a date cell sets `scheduledFor` on the card and on the underlying artifact.
- Month / week views (already supported by the component).

### Card editor (PUB-11)
- Click a card → slide-out drawer with: title, description, channel badge, stage, campaign picker, tag picker, schedule date+time, assignee picker, comments (reuse `kanban_card_comments`), brain-search panel (if in Draft stage), **"Open in editor"** button that deep-links to the artifact's native editor.

## Permissions model

Default (no rows in `publishing_permissions`):
- **Owners + Admins:** all permission keys granted.
- **Everyone else (members):** view-only on the board and calendar; no stage transitions, no create, no delete, no manage.

Owners/admins can grant any specific key to any specific user. Granular by stage (one user can be granted only "move into In Review" without "move into Scheduled," for instance).

UI: a permissions matrix table at `/portal/publishing/permissions`. Rows are users (with role badge); columns are permission keys grouped by category (stage transitions, card actions, admin actions). Checkbox cells flip permissions on/off. Owner/admin rows are read-only and always checked.

## Card sequence

22 cards across 4 phases. Build order is top to bottom within each phase. Phases may parallelize after their foundation card lands.

### Phase 0 — Foundation

| # | Title | Size | Depends on |
|---|---|---|---|
| **PUB-1** | Epic · Publishing Command Center — multi-channel publishing | — | — |
| **PUB-2** | Data model · campaigns, permissions, project system-kind, per-client tz, card.campaignId | M | — |
| **PUB-3** | Top-nav entry + `/portal/publishing` shell + per-client board bootstrap with 6 default columns | S | PUB-2 |

### Phase 1 — MVP (CMS + email usable)

| # | Title | Size | Depends on |
|---|---|---|---|
| **PUB-4** | Board view — kanban with channel icons, filters, archive-hidden default | M | PUB-3 |
| **PUB-5** | Calendar view — adapt ContentCalendar.tsx, drag-to-schedule | M | PUB-3 |
| **PUB-6** | Campaign management — list, CRUD, color, filter board/calendar | S | PUB-4 |
| **PUB-7** | Polymorphic tags — generalize tags model, tag picker, tag admin | S | PUB-2 |
| **PUB-8** | CMS adapter — add `posts.scheduledFor`, publish worker, card-stage ↔ post-state sync | M | PUB-4 |
| **PUB-9** | Email adapter — wire `email_campaigns` to publishing cards | S | PUB-4 |
| **PUB-10** | Permissions matrix — table + checkbox UI + enforcement on stage transitions | M | PUB-3 |
| **PUB-11** | Open-in-editor deep links from card drawer | S | PUB-4 |

### Phase 2 — LinkedIn lands

| # | Title | Size | Depends on |
|---|---|---|---|
| **PUB-12** | LinkedIn OAuth + `/portal/integrations/linkedin` — w_member_social + refresh tokens + reconnect banner | M | PUB-2 |
| **PUB-13** | LinkedIn draft entity (`linkedin_drafts`) + composer UI + LinkedIn client (`lib/integrations/linkedin/`) | M | PUB-12 |
| **PUB-14** | LinkedIn publishing worker — Posts API, image upload dance, idempotency, failure handling | M | PUB-13 |
| **PUB-15** | LinkedIn channel into Publishing board — card type, stage transitions, calendar surface | S | PUB-14, PUB-4 |
| **PUB-16** | File LinkedIn MDP application for `w_organization_social` (parallel, LinkedIn's clock) | S | — |

### Phase 3 — Remaining adapters + brain + polish

| # | Title | Size | Depends on |
|---|---|---|---|
| **PUB-17** | Brain-sourced drafts side panel — `brain_search` on Draft cards (folds in BRAIN-16's goal) | M | PUB-11 |
| **PUB-18** | Pitch deck adapter — `decks_publish_all` on stage transition | S | PUB-4 |
| **PUB-19** | Survey adapter — survey `status` flip on stage transition | S | PUB-4 |
| **PUB-20** | Booking page adapter — `active=true` flip on stage transition | S | PUB-4 |
| **PUB-21** | Notifications — in-app + email on review/scheduled/published/failed transitions | M | PUB-4 |
| **PUB-22** | Archive auto-hide after 30 days + "Show archived" filter | XS | PUB-4 |

## Sizing

- **XS** ≈ half a day · **S** ≈ 1–2 days · **M** ≈ 3–5 days
- Phase 0: ~1 week
- Phase 1: ~3 weeks
- Phase 2: ~2 weeks (plus LinkedIn's MDP clock, independent)
- Phase 3: ~2–3 weeks
- **Total: 8–10 weeks for one developer focused.**

## Open questions / next steps

1. **DB target.** Local `.env.local` currently points at `simplerdev_realprod_dryrun` (127.0.0.1). User asked to "stay on staging DB." Need to confirm before PUB-2 starts: switchyard (per-memory the local CLI default) or the existing dryrun DB? Either way, **do not** apply `pub-0001` against metro until the staging→main release.
2. **Top-nav placement detail.** Confirmed "above CRM." Exact slot relative to Brain to be set in PUB-3.
3. **MDP application content.** Phase 2 requires text describing the product to LinkedIn. Draft when PUB-16 starts.
4. **Brain-search relevance bias.** PUB-17 — pure semantic match vs. canonical/importance-weighted? Importance scoring (BRAIN-13a) doesn't exist yet. Ship pure-semantic in v1; layer importance later when BRAIN-13a lands. (Confirm this is acceptable when PUB-17 starts.)

## Relates to

- **BRAIN-16** (project 141 on the Post Captain portal, card id 159) — its goal of "connect the brain to your blog and LinkedIn drafts" is folded into **PUB-17** here. The BRAIN-16 card itself is unchanged in the portal; we leave it for Post Captain visibility.
- **`components/content-calendar/ContentCalendar.tsx`** (803 lines) — already has month/week views, a `'scheduled'` status in its type, and per-status color coding. PUB-5 adapts it; doesn't rewrite it.
- **`email_campaigns`** schema — has the right scheduling pattern already (`status: 'draft | scheduled | sending | sent | cancelled'`, `scheduledAt`). PUB-8 mirrors this shape for CMS posts.
- **`lib/mcp/tools/integrations.ts:130`** — existing single-provider Google Workspace integration. PUB-12 extends the provider enum.

## Out of scope (not v1)

- Other social channels: Twitter/X, Bluesky, Mastodon, Instagram, Facebook. Each is its own integration; phase 4+.
- Per-client custom workflow stages.
- Many-to-many campaign membership.
- Per-user timezone override.
- Approval gating on stage transitions (separate concept from notifications).
- Multi-channel single-card (one card publishing to multiple channels simultaneously).
- Cadence / recurring scheduling ("post every Tuesday at 9am for 6 weeks").
- Analytics ingestion (LinkedIn impressions, email opens, blog pageviews) back onto the card for the BRAIN-13b feedback loop.
