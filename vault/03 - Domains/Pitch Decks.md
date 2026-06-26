---
type: domain-map
domain: pitch-decks
status: active
date: 2026-06-25
sources:
  - lib/db/schema/tools.ts
  - lib/db/schema/cms.ts
  - lib/mcp/tools/pitch-decks.ts
  - lib/decks/publish-slide.ts
  - lib/pitch-deck-migration.ts
  - lib/pitch-deck-versions.ts
  - lib/branding/css-vars.ts
  - lib/branding/mcp-tools.ts
  - lib/branding/mcp-schemas.ts
  - lib/branding/block-defaults.ts
  - app/portal/tools/pitch-decks/layout.tsx
  - app/portal/tools/pitch-decks/new/page.tsx
  - app/portal/tools/pitch-decks/[id]/page.tsx
  - app/slides/[slug]/page.tsx
  - app/pitch-deck/[slug]/page.tsx
  - app/sites/[domain]/slides/[slug]/page.tsx
  - app/api/portal/tools/pitch-decks/route.ts
  - app/api/portal/tools/pitch-decks/[id]/route.ts
  - app/api/portal/tools/pitch-decks/[id]/generate/route.ts
  - app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/route.ts
  - app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route.ts
  - app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/publish/route.ts
  - app/api/portal/tools/pitch-decks/[id]/publish-all/route.ts
  - app/api/portal/tools/pitch-decks/[id]/versions/route.ts
  - app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route.ts
  - app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route.ts
  - app/api/portal/tools/pitch-decks/upload-html/route.ts
  - tests/unit/mcp-tools-pitch-decks.test.ts
  - tests/unit/app-pitch-deck-presentation.test.tsx
  - tests/unit/app-pitch-decks-id-page.test.tsx
  - tests/unit/lib-pitch-deck-migration.test.ts
  - tests/unit/api-pitch-decks-slides-generate-route.test.ts
  - tests/unit/api-pitch-decks-batch-edit-and-booking-slots-routes.test.ts
  - tests/unit/api-pitch-decks-upload-and-deals-comments-routes.test.ts
  - tests/integration/pitch-decks/BatchEditBar.test.tsx
  - tests/integration/pitch-decks/HistoryPanel.test.tsx
  - tests/integration/pitch-decks/RegenerateModal.test.tsx
---

# Domain: Pitch Decks

## Purpose

AI-authored, block-editor-based presentation tool. Tenants create, manage, and publicly share slide decks (investor decks, proposals, sales decks). Slides use the V2 block-editor format (same block types as the CMS visual editor). A draft/live model separates authoring from publication: all MCP writes land in `slide.draft.*`; the public renderer reads only live fields until `decks_publish_slide` or `decks_publish_all` is called. Decks are per-tenant (scoped by `clientId`), not per-site. Theme inherits from branding profiles.

Competitors: Gamma, Tome, Pitch, Beautiful.ai. This is the strategic AI-agent showcase capability — the directive is to keep and invest.

Service entitlement: `pitch-decks` (checked via `requireService(clientId, 'pitch-decks')` on all MCP write tools). Portal nav: "Pitches & Proposals" under Tools (`lib/portal-nav.ts` line 178, `requiredDomain: 'pitch-decks'`).

---

## Key entry points

| Path | Role |
|---|---|
| `lib/db/schema/tools.ts` | `pitchDecks`, `pitchDeckVersions`, `pitchDeckViews` tables + `PitchDeckSlideV2`, `PitchDeckTheme` type interfaces |
| `lib/db/schema/cms.ts` | `brandingProfiles` table (line 292) — theme inheritance source |
| `lib/mcp/tools/pitch-decks.ts` | MCP tool registrar: 12 tools for deck CRUD, slide authoring, HTML upload, fork, publish |
| `lib/decks/publish-slide.ts` | Shared pure-function publish helpers: `publishOneSlide`, `applyPublishToSlides`, `applyPublishAllToSlides` — canonical source, consumed by both MCP tools and REST routes |
| `lib/pitch-deck-migration.ts` | V1→V2 slide migration helpers (`migratePitchDeck`, etc.) |
| `lib/pitch-deck-versions.ts` | `saveVersionSnapshot` — persists `pitch_deck_versions` rows before AI edits |
| `app/portal/tools/pitch-decks/[id]/page.tsx` | Main deck editor page (board + slide list + panels) |
| `app/portal/tools/pitch-decks/new/page.tsx` | New deck creation wizard |
| `app/slides/[slug]/page.tsx` | Public deck viewer (global slug — no domain prefix) |
| `app/pitch-deck/[slug]/page.tsx` | Public presentation viewer (alternate URL scheme) |
| `app/sites/[domain]/slides/[slug]/page.tsx` | Tenant-site-scoped public deck viewer |

---

## Data model

All tables in `lib/db/schema/tools.ts`:

- `pitch_decks` — one row per deck; `slides` is a JSON column typed as `PitchDeckSlide[] | PitchDeckSlideV2[]`; `formatVersion` discriminates legacy (1) vs. block-editor (2). `brandingProfileId` → `branding_profiles` (nullable; auto-resolves to `is_default` on create). `parentDeckId` is a self-referential FK set by `decks_fork`.
- `pitch_deck_versions` — version history snapshots; `trigger` labels origin: `manual`, `ai_generate`, `ai_slide_edit`, `ai_regenerate`.
- `pitch_deck_views` — view analytics rows.
- `PitchDeckSlideV2.draft` overlay — the key authoring primitive: `pendingCreate`, `pendingDelete`, `blocks`, `customCss`, `pageSettings`, `notes`. Public renderer ignores this field entirely.
- `PitchDeckTheme` — inline JSON: `primaryColor`, `accentColor`, `backgroundColor`, `textColor`, `headingFont`, `bodyFont`, `logo`, survey-button colors, `customCss`, `showSlideNumber`.

---

## API surface

| Endpoint | Method | Purpose |
|---|---|---|
| `app/api/portal/tools/pitch-decks/route.ts` | GET / POST | List decks; create deck |
| `app/api/portal/tools/pitch-decks/[id]/route.ts` | GET / PATCH / DELETE | Single deck CRUD |
| `app/api/portal/tools/pitch-decks/[id]/generate/route.ts` | POST | AI slide generation |
| `app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/route.ts` | PATCH | Update a single slide |
| `app/api/portal/tools/pitch-decks/[id]/slides/batch-edit/route.ts` | POST | Batch slide edits |
| `app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/publish/route.ts` | POST | Publish one slide draft |
| `app/api/portal/tools/pitch-decks/[id]/publish-all/route.ts` | POST | Publish all slide drafts |
| `app/api/portal/tools/pitch-decks/[id]/versions/route.ts` | GET | List version history |
| `app/api/portal/tools/pitch-decks/[id]/versions/[versionId]/restore/route.ts` | POST | Restore a version |
| `app/api/portal/tools/pitch-decks/[id]/slides/[slideIndex]/generate/route.ts` | POST | AI regenerate a single slide |
| `app/api/portal/tools/pitch-decks/upload-html/route.ts` | POST | Upload HTML file or ZIP (≤1 MB HTML / ≤50 MB ZIP) as single-slide deck |

All routes return `{ success, data | error }` envelope per platform convention.

---

## MCP tools

Registered in `lib/mcp/tools/pitch-decks.ts` — 12 tools total, all gated on `decks:read` or `decks:write` scope, all requiring an active `pitch-decks` service entitlement for write operations:

| Tool | Scope | Purpose |
|---|---|---|
| `decks_list` | `decks:read` | List decks, optional status filter |
| `decks_get` | `decks:read` | Fetch deck with full slide array |
| `decks_create` | `decks:write` | Create deck; auto-resolves `is_default` branding profile |
| `decks_update` | `decks:write` | Update metadata / theme |
| `decks_fork` | `decks:write` | Clone deck into draft fork via `parentDeckId` |
| `decks_replace_slides` | `decks:write` | Replace slide array (writes to `draft.*`) |
| `decks_add_slide` | `decks:write` | Append a slide (writes to `draft.*`, `pendingCreate`) |
| `decks_delete` | `decks:write` | Hard-delete deck |
| `decks_upload_html` | `decks:write` | Upload base64 HTML (≤1 MB) as single slide |
| `decks_upload_html_zip` | `decks:write` | Upload base64 zip (≤50 MB) as single slide |
| `decks_publish_slide` | `decks:write` | Promote one `draft.*` to live |
| `decks_publish_all` | `decks:write` | Promote all `draft.*` to live in one pass |

Write tools pass through `stageOrApply` (approval-workflow primitive) and call `publishSlidesUpdate` via `lib/realtime/internal-publisher.ts` for live editor sync. Publish helpers are shared with REST routes via `lib/decks/publish-slide.ts`.

---

## UI surfaces

**Portal (authenticated tenant):**
- `app/portal/tools/pitch-decks/layout.tsx` — deck tool shell layout
- `app/portal/tools/pitch-decks/new/page.tsx` — creation wizard
- `app/portal/tools/pitch-decks/[id]/page.tsx` — full editor (board view + slide list + panels)
- Editor components under `app/portal/tools/pitch-decks/[id]/_components/`: `SlideList`, `ThemePanel`, `SeoPanel`, `HistoryPanel`, `RegenerateModal`, `BatchEditBar`, `DecisionSlideEditor`, `SurveySlideEditor`, `SlideContentEditor`, `SlideSettingsPanel`, `DeckCollaborationProvider`, `DeckPresenceBar`, `DeckSlideCursors`
- `app/portal/tools/pitch-decks/[id]/presenter/` — fullscreen presenter mode
- `app/portal/tools/pitch-decks/[id]/slide-preview/` — single-slide thumbnail preview

**Public (unauthenticated viewers):**
- `app/slides/[slug]/page.tsx` — global public viewer
- `app/pitch-deck/[slug]/page.tsx` — alternate public presentation viewer
- `app/sites/[domain]/slides/[slug]/page.tsx` — tenant-domain-scoped viewer

---

## Tests & gates

| File | Layer | Coverage |
|---|---|---|
| `tests/unit/mcp-tools-pitch-decks.test.ts` | unit | MCP tool behavior (DB mocked) |
| `tests/unit/app-pitch-deck-presentation.test.tsx` | unit | Public presentation renderer |
| `tests/unit/app-pitch-decks-id-page.test.tsx` | unit | Editor page coverage |
| `tests/unit/lib-pitch-deck-migration.test.ts` | unit | V1→V2 slide migration |
| `tests/unit/api-pitch-decks-slides-generate-route.test.ts` | unit | AI generate route |
| `tests/unit/api-pitch-decks-batch-edit-and-booking-slots-routes.test.ts` | unit | Batch edit route |
| `tests/unit/api-pitch-decks-upload-and-deals-comments-routes.test.ts` | unit | HTML upload route |
| `tests/integration/pitch-decks/BatchEditBar.test.tsx` | integration | BatchEditBar component |
| `tests/integration/pitch-decks/HistoryPanel.test.tsx` | integration | HistoryPanel component |
| `tests/integration/pitch-decks/RegenerateModal.test.tsx` | integration | RegenerateModal component |

---

## Cross-domain dependencies

- **[[CMS & Blocks]]** — slides use the same `Block[]` type from `@/types/blocks`; `assignBlockIds`, block-schema resource (`blocks://schema`) are shared. `lib/html-embed-clean.ts`, `lib/html-asset-import.ts`, `lib/html-zip-upload.ts` used by HTML upload.
- **[[Agency, Onboarding & Branding]]** — `brandingProfiles` from `lib/db/schema/cms.ts` drives theme auto-resolution on `decks_create`. `lib/branding/css-vars.ts`, `lib/branding/block-defaults.ts`, `lib/branding/mcp-schemas.ts` used by deck theme pipeline.
- **[[Surveys]]** — `PitchDeckSlideV2.surveySlide` / `surveyId` fields embed survey flows inside decks; decision slides can branch based on survey response.
- **[[Visual Editor]]** — slide editor in the portal shares the block-editor paradigm and `postMessage` preview protocol.
- **[[Auth & Security]]** — MCP tools rely on `PortalMcpContext`, `hasScope`, `requireService`; portal routes use NextAuth session + site-resolver.
- **[[Chat, Realtime & Voice]]** — `lib/realtime/internal-publisher.ts` (`publishSlidesUpdate`) used by MCP write tools for live multi-user sync.
- **[[E-Sign & Approvals]]** — `pitch_deck` is an approvable entity type; write tools go through `stageOrApply`.

---

## Invariants & gotchas

- **Draft/live separation is one-way.** Once a write lands in `slide.draft.*`, the public renderer is unaffected until a publish call. Never write directly to live `blocks`/`customCss` fields from the MCP layer — always go through `draft.*`.
- **`formatVersion: 2` is the only supported write path.** Legacy V1 slides (typed `PitchDeckSlide`) are read-only; the MCP tools always emit V2. Migration logic lives in `lib/pitch-deck-migration.ts`; covered by `tests/unit/lib-pitch-deck-migration.test.ts`.
- **Branding profile auto-resolution.** If `brandingProfileId` is omitted on create, the tool looks for `is_default = true` for the client. Passing an explicit profile ID that doesn't belong to the client is a hard error — never trust the caller's ID alone.
- **`showSlideNumber` auto-override.** Any slide whose entire content is a single `html-embed` block has the slide-counter overlay suppressed, regardless of `theme.showSlideNumber`.
- **`decks_fork` chains via `parentDeckId`.** The field is a forward self-reference on `pitch_decks`; there is no cascading delete — forked decks are independent rows.
- **Zero cross-imports with Print Designer.** No file in `lib/decks/`, `app/portal/tools/pitch-decks/`, or `app/api/portal/tools/pitch-decks/` imports anything from `lib/designer/` or `components/product-designer/`. The two domains are fully code-isolated (confirmed by grep 2026-06-25).

---

## Planning notes

The V2 slide format with `draft.*` overlay was introduced to support a real-time multi-user workflow similar to the visual editor. Decision slides (`decisionSlide`, `decisionCover`, `decisionOptions`) and path groups (`pathGroup`) are the branching mechanism for interactive sales/proposal decks. The `decisionCover` two-column layout was added to support a specific client use-case (CY Strategies).

Split from the combined "Pitch Decks & Product Designer" domain map on 2026-06-25. See [[Print Designer]] for the Fabric.js storefront canvas tool and [[Spec - Pitch Decks Print Designer Unbundle]] for the full unbundle rationale.

---

## Related

- [[Print Designer]]
- [[CMS & Blocks]]
- [[Agency, Onboarding & Branding]]
- [[Visual Editor]]
- [[Surveys]]
- [[Auth & Security]]
- [[Chat, Realtime & Voice]]
- [[E-Sign & Approvals]]
