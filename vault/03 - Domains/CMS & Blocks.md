---
type: domain-map
domain: cms-blocks
status: active
date: 2026-06-17
sources:
  - lib/blocks/
  - lib/blocks/CLAUDE.md
  - lib/db/schema/cms.ts
  - lib/mcp/tools/cms.ts
  - app/sites/[domain]/[[...slug]]/page.tsx
  - app/api/portal/cms/
  - app/api/posts/
  - app/api/blocks/
  - components/blocks/render/
  - tests/integration/api/cms-posts.test.ts
  - tests/unit/mcp-tools-cms.test.ts
  - app/api/portal/cms/websites/[siteId]/email-templates/
  - app/api/portal/cms/websites/[siteId]/tracking/route.ts
  - app/api/portal/cms/websites/[siteId]/content-types/[typeId]/code/route.ts
  - tests/integration/api/cms-posts/upload-html.test.ts
  - app/api/block-templates/[id]/publish/route.ts
  - app/api/block-templates/[id]/cancel-delete/route.ts
  - types/blocks/components.ts
  - components/blocks/visual/RoiCalculatorBlockPreview.tsx
---

# Domain: CMS, Posts & Blocks

## Purpose

Manages all content (posts, pages, custom post types) and the block-based page editor. Blocks are the unit of composition: a post's `content` column is a JSON blob `{ blocks: Block[], version: '1.0' }`. The domain covers the full vertical: schema, API, MCP tools, block registry, server-side render pipeline, and the visual editor portal UI.

## Key entry points

| Path | Role |
|---|---|
| `lib/db/schema/cms.ts` | Drizzle schema — posts, revisions, categories, tags, taxonomies, custom fields, block templates, media, branding profiles |
| `lib/blocks/registry.ts` | `BUILT_IN_BLOCK_TYPES` — canonical 48-entry block roster, categories, Material Icon names |
| `lib/blocks/defaults.ts` | Default field values when a block is inserted |
| `lib/blocks/template-wrap.ts` | Wraps post blocks with a post-type template at render time |
| `lib/blocks/html-render-loops.ts` | Loop/pagination expansion for `html-render` blocks |
| `lib/blocks/prefetch-embeds.ts` | Link/embed metadata prefetch |
| `lib/site-data-cache.ts` | Cached data-fetching helpers used by the sites render layer |
| `types/blocks/index.ts` | TypeScript interfaces for all block types (barrel; domain modules: `base`, `layout`, `content`, `media`, `components`, `commerce`, etc.) |
| `app/sites/[domain]/[[...slug]]/page.tsx` | Public-facing CMS render entry point; resolves post, applies A/B, calls `SiteBlockRenderer` |
| `components/blocks/render/SiteBlockRenderer.tsx` | Top-level block renderer dispatching to per-type `*BlockRender.tsx` components |
| `lib/mcp/tools/cms.ts` | 42 MCP tools covering posts, media, taxonomies, block templates, navigation, site settings |
| `lib/post-types/mcp-sdk-adapter.ts` | MCP SDK adapter for post-types |

## Data model

All tables defined in `lib/db/schema/cms.ts`. Import from `@/lib/db/schema` (the barrel), never from the module directly.

| Table | Tenancy key | Planning-relevant columns |
|---|---|---|
| `posts` | `websiteId` (no `clientId` — join via `clientWebsites`) | `postType`, `content` (JSON block tree), `published`, `publishedAt`, `parentPostId` (fork pointer), `customCss`, `customJs`, SEO fields |
| `post_revisions` | via `postId` | `trigger` (`autosave`/`manual`/`publish`), `contentHash` (dedup), `content` |
| `categories` | `websiteId` (nullable = global) | `slug`, `color` |
| `tags` | `websiteId` (nullable = global) | `slug` |
| `post_categories` / `post_tags` | via postId | pivot tables |
| `post_types` | `websiteId` (nullable = global) | `template` (JSON block wrapper), `customCss`, `customJs` |
| `taxonomies` | `websiteId` | `hierarchical`, `builtIn` |
| `taxonomy_terms` | via `taxonomyId` | `parentId` (hierarchical), `sortOrder` |
| `custom_fields` | via `postTypeId` | `fieldType`, `parentId` (repeater sub-fields), `options` |
| `post_custom_field_values` | via `postId` | `value` (text, parse as JSON if needed) |
| `block_templates` | `clientId` (NULL = platform-global, visible to all tenants) | `scope` (`block`/`section`/`global`), `blocks` (JSON), `draft` (MCP writes land here; must publish to go live), `parentTemplateId` (fork) |
| `block_template_usages` | via `postId` | `blockPath`, `syncedVersion` |
| `media` | `clientId`, `websiteId` | `version`, `brandingProfileId` |
| `media_versions` | via `mediaId` | snapshot history for replace/restore |
| `branding_profiles` | `clientId` | colors, fonts, logos, button presets, dark mode overrides |
| `branding_messaging` | `clientId` | brand voice, tone axes, voice samples |

**Tenancy note:** `posts` carries only `websiteId`, not `clientId`. To scope a post query to a tenant, join through `clientWebsites` (`clientWebsites.clientId = :clientId`). Missing this join is the most common cross-tenant data leak in this domain — see `lib/mcp/tools/cms.ts` comments and the Jun 9 fix.

## API surface

Portal REST (tenant-scoped, all under `app/api/portal/cms/websites/[siteId]/`):

| Route | Methods | Purpose |
|---|---|---|
| `posts/` | GET, POST | List/create posts |
| `posts/[postId]/` | GET, PATCH, DELETE | Single post CRUD |
| `posts/[postId]/revisions/` | GET | Revision history |
| `posts/upload-html/` | POST | Upload HTML to create a post |
| `posts/picker/` | GET | Slim list for link pickers |
| `categories/`, `categories/[id]/` | GET/POST/PATCH/DELETE | Category CRUD |
| `tags/`, `tags/[id]/` | GET/POST/PATCH/DELETE | Tag CRUD |
| `block-templates/` | GET, POST | Block template list/create |
| `blocks/restyle/` | POST | AI-powered block restyle |
| `code/`, `code/publish/`, `code/discard/` | GET/POST | Custom CSS/JS per site |
| `content-types/`, `content-types/[typeId]/` | GET/POST/PATCH/DELETE | Post type CRUD |
| `content-types/[typeId]/fields/`, `fields/[fieldId]/` | GET/POST/PATCH/DELETE | Custom fields |
| `content-types/[typeId]/template/` | GET/PUT | Post-type block template |
| `media/`, `media/[id]/`, `media/upload/` | GET/POST/DELETE | Media library |
| `taxonomies/[taxonomyId]/terms/` | GET/POST/PATCH/DELETE | Custom taxonomy terms |
| `email-templates/` | GET/POST | Per-site email template library list/create |
| `email-templates/[templateId]/` | GET/PATCH/DELETE | Single email template CRUD |
| `email-templates/seed-defaults/` | POST | Seed default email templates for a site |
| `tracking/` | GET/PUT | Per-site tracking-script configuration (provider keys, analytics IDs) |
| `content-types/[typeId]/code/` | GET/PUT | Per-post-type custom CSS/JS |

Public-facing block metadata: `app/api/blocks/route.ts`
Posts public API: `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts`, `app/api/posts/[id]/schedule/`, `app/api/posts/[id]/custom-fields/`, `app/api/posts/calendar/`
Block templates: `app/api/block-templates/route.ts`, `app/api/block-templates/[id]/route.ts`, `app/api/block-templates/[id]/publish/route.ts`, `app/api/block-templates/[id]/cancel-delete/route.ts`

## MCP tools

All 42 tools registered in `lib/mcp/tools/cms.ts` via `registerCmsTools()`. Scope guards use `sites:read`, `sites:write`, `media:read`, `media:write`.

| Group | Tools |
|---|---|
| Posts | `posts_list`, `posts_get`, `posts_create`, `posts_update`, `posts_delete`, `posts_fork`, `posts_upload_html`, `posts_upload_html_zip`, `posts_list_revisions` |
| Sites | `sites_list`, `sites_update`, `sites_get_custom_code`, `sites_update_custom_code`, `sites_publish_custom_code` |
| Taxonomies | `taxonomies_list`, `taxonomies_create_category`, `taxonomies_create_tag`, `posts_set_taxonomies` |
| Block templates | `block_templates_list`, `block_templates_get`, `block_templates_create`, `block_templates_update`, `block_templates_delete`, `block_templates_publish`, `block_templates_fork` |
| Navigation | `nav_list`, `nav_create`, `nav_update`, `nav_delete`, `nav_publish`, `nav_publish_all` |
| Media | `media_list`, `media_upload_from_url`, `media_upload_presign`, `media_register`, `media_delete` |
| Domains/env | `website_domains_list`, `website_domains_add`, `website_domains_remove`, `website_env_vars_list`, `website_env_vars_set`, `website_env_vars_delete` |

MCP write tools that target `block_templates` land in the `draft` column by default; call `block_templates_publish` to promote draft to live. **Use the `simplerdev-mcp-tool` skill for any new tool** — it wires handler, Zod schema, scope guard, and telemetry in lockstep.

## UI surfaces

| Path | Purpose |
|---|---|
| `app/portal/websites/[siteId]/posts/` | Post list for a site |
| `app/portal/websites/[siteId]/posts/new/` | New post wizard |
| `app/portal/websites/[siteId]/posts/[postId]/` | Post detail / settings |
| `app/portal/websites/[siteId]/posts/[postId]/edit/` | Visual block editor (iframe preview + postMessage protocol) |
| `app/portal/media/` | Global media library |
| `app/portal/websites/[siteId]/media/` | Per-site media library |
| `app/sites/[domain]/[[...slug]]/page.tsx` | Public page render (SSR, `force-dynamic`) |
| `components/blocks/render/` | 65+ per-type `*BlockRender.tsx` render components |
| `components/blocks/TemplateLibrary.tsx` | Block template picker in editor |

## Tests & gates

| File | Layer | Coverage |
|---|---|---|
| `tests/integration/api/cms-posts.test.ts` | integration | Post CRUD, tenancy scoping |
| `tests/integration/api/cms-posts/revisions.test.ts` | integration | Revision creation and dedup |
| `tests/integration/api/cms-posts/scheduled.test.ts` | integration | Scheduled publish |
| `tests/integration/api/cms-posts/permalinks.test.ts` | integration | Slug/permalink resolution |
| `tests/integration/api/cms-posts/upload-html.test.ts` | integration | HTML import endpoint coverage |
| `tests/unit/mcp-tools-cms.test.ts` | unit | MCP tool handler coverage |
| `tests/unit/mcp-tool-registry-baseline.test.ts` | unit | Exact registered tool-name set; fails on any add/remove/rename without updating `EXPECTED_TOOLS` |
| `tests/unit/blocks-html-render-loops.test.ts` | unit | Loop expansion logic |
| `tests/unit/api-categories-tags-block-templates-routes.test.ts` | unit | API route handlers |
| `tests/e2e/portal-cms-gap-close.spec.ts` | e2e | Portal CMS flows |
| `tests/e2e/portal-cms-taxonomies.spec.ts` | e2e | Taxonomy term management |
| `tests/e2e/custom-fields.spec.ts` | e2e | Custom field CRUD |

Run `bun test:tenancy` after any data-access change in this domain; CMS post queries are especially prone to missing the `websiteId → clientId` join.

## Cross-domain dependencies

- **Sites & Hosting:** `clientWebsites` and `clientWebsites.clientId` are the tenancy bridge for posts. See `lib/db/schema/sites.ts`.
- **Visual Editor:** The editor at `app/portal/websites/[siteId]/posts/[postId]/edit/` drives block creation/editing. See `components/portal/visual-editor/CLAUDE.md`.
- **Email & Campaigns:** `emailOnly: true` blocks in `lib/blocks/registry.ts` appear only in the email campaign picker; the email renderer uses the same block types.
- **Store:** `ProductPage`, `ShopPage`, `ProductGridBlockRender` and related blocks wire the storefront into the block render pipeline.
- **Company Brain / AI:** `blocks/restyle` endpoint and `branding_messaging` table feed AI-generated content; see `lib/ai/CLAUDE.md`.
- **A/B Testing:** `app/sites/[domain]/[[...slug]]/page.tsx` calls `applyAbToPostContent` before rendering.

## Invariants & gotchas

- **Blocks are universal, never client-specific.** A new block type must be added in lockstep: TS interface in `types/blocks/`, registry entry in `lib/blocks/registry.ts`, render component in `components/blocks/render/`, production renderer case in `app/sites/...`, defaults case in `lib/blocks/defaults.ts`, icon entry in `blockIcons.tsx`, settings-popup label, `VisualBlockPreview` case, visual preview component in `components/blocks/visual/`, and `/api/blocks` metadata — plus both `TYPE_TO_INTERFACE` and `TYPE_TO_RENDERER` entries in the coverage-harness maps. Every hand-rolled block has missed at least one step — use `simplerdev-block-type`. (Source: `lib/blocks/CLAUDE.md`)
- **roi-calculator block lockstep (2026-06-17):** The block originally landed (commit f09344b8) missing most lockstep pieces, causing typecheck failure and 4 unit-test failures. It was completed in commits fcafe456 + 2d0568d9 across all locations: `lib/blocks/registry.ts`, `types/blocks/components.ts` (`RoiCalculatorBlock`), `components/blocks/render/` (`RoiCalculatorBlockRender`), `lib/blocks/defaults.ts`, `blockIcons.tsx`, settings-popup label, `VisualBlockPreview` case, and `components/blocks/visual/RoiCalculatorBlockPreview.tsx` (14 lines). **Known debt (baselined):** the block's 16 settings-panel input fields are not yet wired — only title/description are editable in the panel. Recorded in `.planning/audits/blocks-controls-coverage.baseline.json`. Not a regression.
- **`posts` has no `clientId`.** Tenancy is via `websiteId → clientWebsites.clientId`. Never query `posts` without scoping to `websiteId` values owned by the current client.
- **`block_templates.clientId = NULL` means platform-global** (visible to every tenant). Non-null = tenant-private. List endpoints must `OR` both.
- **MCP writes to block templates land in `draft`.** Live pickers read only non-draft fields. Call `block_templates_publish` to promote.
- **`postRevisions.contentHash`** deduplicates autosaves: a null hash (legacy rows) never deduplicates; a hash match skips the write.
- **Post-type templates:** `postTypes.template` is a block tree JSON. At render time, `lib/blocks/template-wrap.ts` substitutes the post's own blocks in place of any `{ type: 'post-content' }` placeholder.
- **`emailOnly: true`** is one-directional — if a block can run on a page it can run everywhere except email; there is no page-only flag.
- **Material Icons in `icon:` field** — use the icon name string (`'title'`, `'image'`), not the rendered glyph.

## Planning notes

Before building a feature here:

1. Read `lib/blocks/CLAUDE.md` and `docs/guides/BLOCK_EDITOR_GUIDE.md` for block JSON schema and examples.
2. Check `lib/db/schema/cms.ts` for the exact column shape before writing queries.
3. For a new block type, invoke `simplerdev-block-type` — it scaffolds all five required locations atomically. TS interfaces live in `types/blocks/` (domain modules: `base`, `layout`, `content`, `media`, `components`, `commerce`).
4. For a new MCP tool, invoke `simplerdev-mcp-tool` — scope guard + telemetry are mandatory.
5. After any data-access change, run `bun test:tenancy` and verify `posts` queries join through `clientWebsites`.
6. After adding/removing/renaming an MCP tool, update `EXPECTED_TOOLS` in `tests/unit/mcp-tool-registry-baseline.test.ts`.
7. Visual editor changes: read `components/portal/visual-editor/CLAUDE.md` before touching `app/portal/websites/[siteId]/posts/[postId]/edit/`.

## Related

[[Visual Editor]] | [[Sites, Hosting & Publishing]] | [[Email & Campaigns]] | [[Company Brain & AI]]
