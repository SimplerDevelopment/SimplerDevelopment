# Gate MCP writes behind approval + add draft overlays for website + deck content

Branch: `fix/cystrategies-mcp-approval-and-deck` → target `staging`

## What this does

Closes the class of bug behind Cody's email from May 12 — where Claude (in his session)
claimed to push CSS site-wide to cystrategies.co despite his "don't touch live" rule.
Two complementary safety layers, designed to interlock:

1. **Approval gating.** Every MCP write that touches website or deck content goes
   through `stageOrApply` (`lib/mcp/pending-changes.ts`). When the calling
   portal API key has `require_cms_approval = true`, the write becomes a
   `mcp_pending_changes` row + a notification + an email to the site owner —
   nothing changes on the live site until an admin approves it. The schema
   default for `require_cms_approval` is now `true` for any newly-issued key.

2. **Draft overlays.** Entities the public site renders directly now have
   parallel `draft_*` storage. The editor reads `draft.X ?? live.X`; the
   public renderer reads `live.X` only; a `*_publish_*` action copies draft → live.
   The editor never lies about what's on the site, and a person can preview a draft
   without anything going live.

The two stack: MCP edits → land in draft → require explicit Publish call → that
Publish call is itself gated through approvals if the key is flagged.

## Entities covered

| Entity | Draft surface | Publish action |
|---|---|---|
| Pitch deck slides (per slide) | `pitch_decks.slides[].draft` (JSONB sub-object) | `decks_publish_slide`, `decks_publish_all` |
| Site custom CSS / JS | `client_websites.draft_custom_css / draft_custom_js` (+ `draft_updated_at/by`) | `sites_publish_custom_code` |
| Site navigation items | `site_navigation.draft` (JSONB) — supports `pendingCreate` / `pendingDelete` | `nav_publish`, `nav_publish_all` |
| Block templates | `block_templates.draft` (JSONB) — same convention | `block_templates_publish` |
| Posts | already had a `published` boolean — unchanged | (existing) |
| Other content (taxonomies, etc.) | Approval-gated only; no draft surface | n/a |

## What ships in three layers

### 1. MCP layer (`lib/mcp/`)

- `pending-changes.ts`: extended `EntityType` (`site`, `site_nav`, `block_template`, `taxonomy`, `post_taxonomy`, `pitch_deck_slide_draft`) and `Operation` (`publish`, `publish_all`, `upload_html`).
- `tools/cms.ts`: wrapped previously-direct writes — `sites_update`, **`sites_update_custom_code`** (the offender), `nav_create`, `nav_delete`, `posts_upload_html`, `block_templates_create/update/delete`, `taxonomies_create_category/tag`, `posts_set_taxonomies`. New tools: `sites_publish_custom_code`, `nav_update` (was missing), `nav_publish`, `nav_publish_all`, `block_templates_publish`.
- `tools/pitch-decks.ts`: wrapped `decks_upload_html` (and retained `contentBase64` in the staged payload so approval-replay works); redirected `decks_replace_slides` / `decks_add_slide` to write into `slide.draft.*`; new `decks_publish_slide` and `decks_publish_all` tools.
- `approvals.ts`: `applyPendingChange` cases for every new entity:operation pair. Existing `pitch_deck_slides:replace_slides` and `:add_slide` updated to match the new draft-merging semantics. `approvals_list` entity enum extended.

### 2. Schema + migration

- `lib/db/schema/sites.ts`, `cms.ts`, `tools.ts`, `auth.ts`: added the draft fields described above + `SiteNavigationDraft` / `BlockTemplateDraft` / `PitchDeckSlideV2.draft` types. Flipped `portal_api_keys.requireCmsApproval` default to `true`.
- `drizzle/0110_draft_overlays.sql`: hand-written (drizzle meta has a known collision per project memory). Adds:
  - `client_websites`: `draft_custom_css`, `draft_custom_js`, `draft_updated_at`, `draft_updated_by` — plus defensive `custom_css` / `custom_js` `IF NOT EXISTS` (prod has drifted from 0001 — these cols are missing).
  - `site_navigation.draft` (jsonb), `block_templates.draft` (jsonb).
  - `portal_api_keys.require_cms_approval DEFAULT true`.

### 3. Portal admin UI

Each surface uses the same model: editor reads draft, writes draft, explicit Publish copies draft → live.

- **Deck editor** (`app/portal/tools/pitch-decks/[id]`): `getSlideView` + friends in `_lib/helpers.ts`; editor mutates `slide.draft.*` through the existing PATCH `/api/portal/tools/pitch-decks/[id]` (the slides JSONB column accepts the augmented blob — Yjs collab path survives `draft` naturally via `Y.Map.toJSON()`); new REST `…/slides/[slideId]/publish` + `…/publish-all`; per-slide Publish + Discard/Cancel-deletion above the canvas; sidebar + board badges; `EditorHeader` gets a Publish-all button with draft count.
- **Site Custom Code** (`components/portal/CustomCodeForm.tsx` + `app/api/portal/cms/websites/[siteId]/code/*`): rewritten to a Draft/Live × CSS/JS tab matrix, Save-draft / Discard / Publish buttons, dirty pill, "Drafted by X · 4 hours ago" line. Live tab is read-only.
- **Site Navigation** (`app/portal/websites/[siteId]/navigation`): PUT rewritten to per-row draft merge; per-row Draft + Pending-delete badges; per-row publish + cancel-deletion icons; top-of-list Publish-all banner.
- **Block Templates** (`app/admin/templates`): card-level draft state with Publish + Cancel-deletion buttons; border tints amber/red on draft state. `tests/unit/route-block-templates.test.ts` updated for new tombstone semantics.

Server-side publish helpers extracted to `lib/decks/publish-slide.ts`, `lib/sites/publish-custom-code.ts`, `lib/sites/publish-nav.ts`, `lib/sites/publish-block-template.ts`. The MCP `applyPendingChange` cases currently inline the same logic — a follow-up can switch them to imports, but for this PR the duplication is intentional (zero blast radius from the helper layer until callers explicitly opt in).

## Side fix included

`/app/api/sites/[siteId]/navigation/route.ts` was using `select()` and spreading rows into JSON — would have publicly leaked the new `draft` JSONB column. Patched to explicit field projection. (Found by an explicit render-path audit before this lands.)

## Content fix Cody asked for in the same email

`CY Strategies - TF2 Qualifier v4.html`:
- Bumped `.id-form input { font-size: 14px → 16px }` (also `select`, `textarea`) to suppress iOS Safari focus-zoom.
- Re-sequenced the screen flow: identity capture now fires AFTER the questions / scope picker in every route, BEFORE the results / offering-detail / hybrid screens. Introduces a `pendingTerminal` state queue + `requestTerminal` / `runPendingTerminal` helpers; back-button + start-over preserved.
- Uploaded to prod as a fresh single-slide html-embed deck (the IDs Cody's earlier Claude session referenced didn't actually exist):
  - `pitch_decks.id = 248`, `slug = tf2-qualifier-v4-mp44zx9y`, `status = published`, full-bleed chrome
  - Public preview: `/pitch-deck/tf2-qualifier-v4-mp44zx9y` (also `/sites/cystrategies.co/slides/tf2-qualifier-v4-mp44zx9y`)
  - Full prod DB backup saved at `backups/sd2026-prod-20260513-092312.dump` before any write

## How to roll out

1. **Hand-apply** `drizzle/0110_draft_overlays.sql` to prod (and staging). The repo's drizzle migration tracker has the documented snapshot collision, so `bun run db:migrate` won't help — apply with `psql`. Idempotent; all `ADD COLUMN IF NOT EXISTS`.
2. Deploy the app.
3. The new `require_cms_approval` default is **only on new rows** — existing keys keep their flags. If you want to flip an existing key:
   ```sql
   UPDATE portal_api_keys SET require_cms_approval = true WHERE id = <id>;
   ```
   Right now CyStrategies has no `portal_api_keys` row at all (and no `api_keys` row), so nothing to flip for client 98. If Cody ever onboards a key, the new default will gate it automatically.
4. **Preview Cody's deck**: `/pitch-deck/tf2-qualifier-v4-mp44zx9y` — test on iOS Safari (zoom suppression) + on desktop (route flow + back-button behavior).

## Tests

- `npx tsc --noEmit`: zero new errors in `app/`/`lib/`/`components/`. Pre-existing baseline of 73 errors lives entirely in `tests/**` (unrelated to this PR).
- `scripts/test.sh --layer=integration --tag=tenancy --no-coverage`: see CI.
- `scripts/test.sh --layer=e2e --tag=@critical --no-coverage`: see CI.

## Known follow-ups (not in this PR)

- Decision + survey deck slides don't get a `pendingCreate` badge in the editor — their content lives in non-draftable schema fields (`decisionOptions`, `surveyId`, `surveyFieldBlocks`). Acceptable for v1.
- `lib/mcp/approvals.ts` apply cases still inline the same logic the four new `publish-*.ts` helpers expose. Easy to dedupe in a follow-up.
- The `block_templates` admin doesn't have a Publish-all action. Templates are global and rarer; defer.
- `app/api/sites/[siteId]/navigation/route.ts` projection patch is local to that one route — if any other public reader spreads `siteNavigation` rows in the future, it'd reintroduce the leak. Consider a type-level fence (a `PublicNavItem` interface) in a follow-up.

## Risk notes

- The schema migration is `ADD COLUMN IF NOT EXISTS` only. Safe to re-apply. No data is moved or rewritten.
- Existing API keys keep their `require_cms_approval` value. Existing automation continues to work unchanged.
- The deck editor's draft writes go through the existing PATCH endpoint; the `slides` JSONB column already accepted the augmented blob (the schema type changed but the column did not). No editor downtime expected.
- Yjs collaborative editing was not modified. `draft` survives `Y.Map.toJSON()` so two users editing the same deck see each other's drafts; concurrent publishes are last-write-wins via the existing single-row update.
- Backup at `backups/sd2026-prod-20260513-092312.dump` (3.8MB, 159 tables, custom pg_dump format) — restore via `pg_restore -Fc -d <db>` against an empty schema if rollback is ever needed.
